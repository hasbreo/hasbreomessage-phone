package com.hasbreo.message
import android.app.AlertDialog
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Notification replies survive process death and stay bound to their account. */
object PendingReplies{
 private val sending=ConcurrentHashMap.newKeySet<String>()
 @Synchronized private fun list(context:Context)=JSONArray(Vault(context).get("pendingReplies")?:"[]")
 @Synchronized fun add(context:Context,request:JSONObject){
  val account=Vault(context).get("session")?.let{JSONObject(it).getString("userId")}?:error("Sign in before replying.")
  val list=list(context);require(list.length()<20){"Open the phone outbox before adding more replies."}
  request.put("account",account).put("requestId","local:"+UUID.randomUUID());list.put(request);Vault(context).put("pendingReplies",list.toString())
 }
 @Synchronized private fun remove(context:Context,id:String){val old=list(context);val next=JSONArray();for(i in 0 until old.length())if(old.getJSONObject(i).optString("requestId")!=id)next.put(old.getJSONObject(i));Vault(context).put("pendingReplies",next.toString())}
 fun flush(context:Context){
  val engine=ChatEngine.instance?:return;if(!engine.ready)return
  val account=Vault(context).get("session")?.let{JSONObject(it).optString("userId")};val queued=list(context)
  for(i in 0 until queued.length()){
   val request=queued.getJSONObject(i);val id=request.getString("requestId")
   if(!ReplyPolicy.maySend(request.optString("text"),request.optString("account"),account)||!sending.add(id))continue
   engine.localRequest(request){error->sending.remove(id);if(error==null){remove(context,id);Notices.status(context,"Reply sent","Your waiting reply was sent securely.")}else Notices.status(context,"Reply waiting","Open the conversation or retry from Settings → Pending replies.")}
  }
 }
 fun show(activity:MainActivity){
  val queued=list(activity);if(queued.length()==0){AlertDialog.Builder(activity).setTitle("All caught up").setMessage("No replies are waiting to send.").setPositiveButton("OK",null).show();return}
  val labels=(0 until queued.length()).map{queued.getJSONObject(it).optString("text").take(100)}.toTypedArray()
  AlertDialog.Builder(activity).setTitle("Replies waiting to send").setItems(labels){_,index->val item=queued.getJSONObject(index);AlertDialog.Builder(activity).setMessage(item.optString("text")).setPositiveButton("Retry"){_,_->flush(activity)}.setNegativeButton("Discard"){_,_->remove(activity,item.getString("requestId"))}.show()}.setPositiveButton("Retry all"){_,_->flush(activity)}.setNegativeButton("Close",null).show()
 }
}
