package com.hasbreo.message

import android.app.AlertDialog
import android.content.Context
import android.os.Handler
import android.os.Looper
import com.google.android.gms.wearable.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

class WearBridge:WearableListenerService(){
 override fun onMessageReceived(event:MessageEvent){
  if(event.path!="/hasbreo/request"||event.data.size>20000)return
  val request=try{JSONObject(String(event.data,Charsets.UTF_8))}catch(_:Exception){return}
  val id=request.optString("requestId");if(!ReplyPolicy.validId(id))return
  val approved=JSONArray(Vault(this).get("approvedWatches")?:"[]")
  if(request.optString("action")=="disconnect"){val next=JSONArray();for(i in 0 until approved.length())if(approved.getString(i)!=event.sourceNodeId)next.put(approved.getString(i));Vault(this).put("approvedWatches",next.toString());respond(this,event.sourceNodeId,id,JSONObject().put("disconnected",true),null);return}
  if(!(0 until approved.length()).any{approved.optString(it)==event.sourceNodeId}){respond(this,event.sourceNodeId,id,null,"Connect this watch from Settings → Connect your watch on your phone.");return}
  val action=request.optString("action");if(action !in setOf("snapshot","sounds","sound","soundCall","messages","send","read","mute","reaction","open","disconnect")){respond(this,event.sourceNodeId,id,null,"Unsupported watch action.");return}
  val me=Vault(this).get("session")?.let{JSONObject(it).optString("userId")}
  val expected=request.optString("account")
  if(!ReplyPolicy.mayAct(action,expected,me)){respond(this,event.sourceNodeId,id,null,"Account changed. Refresh your watch before replying.");return}
  // A durable, idempotent result prevents watch retries from sending twice.
  val saved=Vault(this).get("watch-result:$id")
  if(saved!=null){send(this,event.sourceNodeId,"/hasbreo/response",JSONObject(saved));return}
  val engine=ChatEngine.instance
  if(engine==null){respond(this,event.sourceNodeId,id,null,"Open Hasbreo on your phone, or enable Connected mode.");return}
  if(pendingNodes.putIfAbsent(id,event.sourceNodeId)!=null)return
  Handler(Looper.getMainLooper()).post{engine.wearRequest(event.sourceNodeId,request)}
 }
 companion object{
  val pendingNodes=ConcurrentHashMap<String,String>()
  fun send(context:Context,node:String,path:String,data:JSONObject){val bytes=data.toString().toByteArray(Charsets.UTF_8);if(bytes.size<=95000)Wearable.getMessageClient(context).sendMessage(node,path,bytes)}
  fun respond(context:Context,node:String,id:String,result:JSONObject?,error:String?){
   val packet=JSONObject().put("requestId",id).put("result",result?:JSONObject.NULL).apply{if(error!=null)put("error",error)}
   if(error==null&&result!=null&&(result.optBoolean("sent")||result.optBoolean("reacted")||result.optBoolean("played"))){
    val vault=Vault(context);vault.put("watch-result:$id",packet.toString());val ids=JSONArray(vault.get("watch-results")?:"[]");ids.put(id);while(ids.length()>100){val old=ids.remove(0).toString();vault.put("watch-result:$old",null)};vault.put("watch-results",ids.toString())
   };send(context,node,"/hasbreo/response",packet)
  }
  fun choose(activity:MainActivity){
   Wearable.getNodeClient(activity).connectedNodes.addOnSuccessListener{nodes->
    val nearby=nodes.filter{it.isNearby};if(nearby.isEmpty()){AlertDialog.Builder(activity).setTitle("Your watch").setMessage("Install Hasbreo Message Watch on your paired watch and connect Bluetooth, then try again.").setPositiveButton("OK",null).show();return@addOnSuccessListener}
    AlertDialog.Builder(activity).setTitle("Connect your watch").setItems(nearby.map{it.displayName}.toTypedArray()){_,index->
     val node=nearby[index];AlertDialog.Builder(activity).setTitle("Connect ${node.displayName}?").setMessage("This watch will be able to read recent chats and send encrypted replies through this phone. Your password and message keys stay on the phone.").setNegativeButton("Cancel",null).setPositiveButton("Connect"){_,_->
      val v=Vault(activity);val list=JSONArray(v.get("approvedWatches")?:"[]");if(!(0 until list.length()).any{list.optString(it)==node.id})list.put(node.id);v.put("approvedWatches",list.toString());send(activity,node.id,"/hasbreo/connected",JSONObject().put("connected",true));Notices.status(activity,"Watch connected","Open Hasbreo Message on your watch to see your chats.")
     }.show()
    }.setNeutralButton("Disconnect all"){_,_->clear(activity);Vault(activity).put("approvedWatches",null)}.show()
   }.addOnFailureListener{Notices.status(activity,"Could not reach your watch","Check Bluetooth and Google Play services, then try again.")}
  }
  fun changed(context:Context,room:String){val approved=JSONArray(Vault(context).get("approvedWatches")?:"[]");for(i in 0 until approved.length())send(context,approved.getString(i),"/hasbreo/changed",JSONObject().put("roomId",room))}
  fun clear(context:Context){Wearable.getNodeClient(context).connectedNodes.addOnSuccessListener{nodes->for(node in nodes)send(context,node.id,"/hasbreo/clear",JSONObject().put("clear",true))}}
 }
}
