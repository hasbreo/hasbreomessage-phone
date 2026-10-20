package com.hasbreo.message
import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import androidx.core.app.Person
import android.media.AudioAttributes
import android.net.Uri
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
object Notices{
 const val CONNECTED=101
 fun soundChannel(context:Context,call:Boolean):String=(if(call)"calls-v2-"else"messages-v2-")+Preferences.get(context).optString(if(call)"callTone"else"messageTone",if(call)"aurora"else"mint")
 fun channels(context:Context){val m=context.getSystemService(NotificationManager::class.java)
  for(call in listOf(false,true)){val id=soundChannel(context,call);val tone=id.substringAfterLast('-');val resource=context.resources.getIdentifier("tone_"+tone,"raw",context.packageName);m.createNotificationChannel(NotificationChannel(id,if(call)"Incoming calls · $tone"else"Messages · $tone",NotificationManager.IMPORTANCE_HIGH).apply{enableVibration(tone!="none");setSound(if(tone=="none"||resource==0)null else Uri.parse("android.resource://"+context.packageName+"/"+resource),AudioAttributes.Builder().setUsage(if(call)AudioAttributes.USAGE_NOTIFICATION_RINGTONE else AudioAttributes.USAGE_NOTIFICATION).build())})}
  m.createNotificationChannel(NotificationChannel("connection","Connected mode",NotificationManager.IMPORTANCE_LOW).apply{description="Background chats and watch connection. You may hide this channel in Android notification settings.";setShowBadge(false)})
  m.createNotificationChannel(NotificationChannel("active-calls","Calls in progress",NotificationManager.IMPORTANCE_LOW))
  m.createNotificationChannel(NotificationChannel("downloads","File downloads",NotificationManager.IMPORTANCE_LOW))
 }
 fun open(context:Context,room:String?=null):PendingIntent=PendingIntent.getActivity(context,room?.hashCode()?:0,Intent(context,MainActivity::class.java).putExtra("roomId",room).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 fun connection(context:Context,inCall:Boolean=false)=NotificationCompat.Builder(context,if(inCall)"active-calls"else"connection").setSmallIcon(R.drawable.ic_notification).setContentTitle(if(inCall)"Hasbreo call in progress"else"Hasbreo Message is connected").setContentText(if(inCall)"Tap to return to your call"else"Background chats and watch replies").setContentIntent(open(context)).setOngoing(true).setLocalOnly(true).setSilent(true).setCategory(NotificationCompat.CATEGORY_SERVICE).addAction(0,if(inCall)"End call"else"Disconnect",PendingIntent.getBroadcast(context,101,Intent(context,MessageActionReceiver::class.java).setAction(if(inCall)"endCall"else"disconnect"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)).build()
 @Synchronized fun message(context:Context,data:JSONObject,force:Boolean=false){
  val owner=data.optString("owner");if(owner.isNotBlank()&&Vault(context).get("session")?.let{JSONObject(it).optString("userId")}!=owner)return
  val id=data.optString("eventId");if(id.isBlank())return
  val v=Vault(context);val seen=JSONArray(v.get("seen")?:"[]");if(!force&&(0 until seen.length()).any{seen.optString(it)==id})return
  val next=JSONArray();for(i in maxOf(0,seen.length()-399) until seen.length())next.put(seen.getString(i));next.put(id);v.put("seen",next.toString())
  val room=data.optString("roomId");val engine=ChatEngine.instance;if(!force&&engine?.visible==true&&engine.activeRoom==room)return
  if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return
  val previews=Preferences.get(context).optBoolean("previews");val text=if(previews)data.optString("body","New encrypted message")else"New encrypted message"
  val roomKey=owner+":"+room;val quiet=!NotificationRatePolicy.allow(context,roomKey)
  val n=NotificationCompat.Builder(context,soundChannel(context,false)).setSmallIcon(R.drawable.ic_notification).setContentTitle(data.optString("title","Hasbreo Message")).setContentText(text).setStyle(NotificationCompat.BigTextStyle().bigText(text)).setContentIntent(open(context,room)).setAutoCancel(true).setCategory(NotificationCompat.CATEGORY_MESSAGE).setVisibility(if(previews)NotificationCompat.VISIBILITY_PRIVATE else NotificationCompat.VISIBILITY_SECRET).setGroup("hasbreo.messages").setOnlyAlertOnce(quiet).setSilent(quiet)
  if(room.isNotBlank()){
   val account=Vault(context).get("session")?.let{JSONObject(it).optString("userId")}
   val reply=Intent(context,MessageActionReceiver::class.java).setAction("reply").putExtra("roomId",room).putExtra("account",account)
   n.addAction(NotificationCompat.Action.Builder(0,"Reply",PendingIntent.getBroadcast(context,room.hashCode(),reply,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)).addRemoteInput(RemoteInput.Builder("text").setLabel("Your reply").build()).setAllowGeneratedReplies(true).build())
   n.addAction(0,"Mark read",PendingIntent.getBroadcast(context,room.hashCode()+1,Intent(context,MessageActionReceiver::class.java).setAction("read").putExtra("roomId",room).putExtra("account",account),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
  }
  NotificationManagerCompat.from(context).notify(("chat:"+roomKey).hashCode(),n.build())
 }
 fun call(context:Context,data:JSONObject){val manager=NotificationManagerCompat.from(context);if(!data.optBoolean("active")){manager.cancel(202);return};if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return
  channels(context);val room=data.optString("roomId");val callId=data.optString("callId");val account=Vault(context).get("session")?.let{JSONObject(it).optString("userId")};val previews=Preferences.get(context).optBoolean("previews",true)
  val answer=PendingIntent.getActivity(context,202,Intent(context,MainActivity::class.java).putExtra("roomId",room).putExtra("callId",callId).putExtra("callAction","answer").putExtra("account",account).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val decline=PendingIntent.getBroadcast(context,203,Intent(context,MessageActionReceiver::class.java).setAction("declineCall").putExtra("callId",callId).putExtra("account",account),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val person=Person.Builder().setName(if(previews)data.optString("title","Hasbreo Message")else"Hasbreo Message").setImportant(true).build()
  val notice=NotificationCompat.Builder(context,soundChannel(context,true)).setSmallIcon(R.drawable.ic_notification).setContentTitle(person.name).setContentText(if(data.optBoolean("video"))"Incoming video call"else"Incoming voice call").setContentIntent(open(context,room)).setCategory(NotificationCompat.CATEGORY_CALL).setPriority(NotificationCompat.PRIORITY_HIGH).setStyle(NotificationCompat.CallStyle.forIncomingCall(person,decline,answer).setIsVideo(data.optBoolean("video"))).setOngoing(true).setTimeoutAfter(60000).setOnlyAlertOnce(true).build()
  if(Preferences.get(context).optString("callTone","aurora")!="none")notice.flags=notice.flags or android.app.Notification.FLAG_INSISTENT
  manager.notify(202,notice)
 }
 fun clearMessages(context:Context){val manager=context.getSystemService(NotificationManager::class.java);for(n in manager.activeNotifications)if(n.notification.channelId.startsWith("messages"))manager.cancel(n.id)}
 fun status(context:Context,title:String,text:String){if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;NotificationManagerCompat.from(context).notify(199,NotificationCompat.Builder(context,"connection").setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(text).setContentIntent(open(context)).setAutoCancel(true).build())}
}
class MessageActionReceiver:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){
 if(intent.action=="declineCall"){val account=Vault(context).get("session")?.let{JSONObject(it).optString("userId")};if(account!=null&&account==intent.getStringExtra("account"))ChatEngine.instance?.event("hasbreo:callaction",JSONObject().put("action","decline").put("callId",intent.getStringExtra("callId")).put("account",account));return}
 if(intent.action=="endCall"){ChatEngine.instance?.event("hasbreo:endcall",JSONObject());return}
 if(intent.action=="disconnect"){Preferences.set(context,"connected",false);context.stopService(Intent(context,ChatService::class.java));return}
 val expected=intent.getStringExtra("account");val current=Vault(context).get("session")?.let{JSONObject(it).optString("userId")};if(expected.isNullOrBlank()||expected!=current){Notices.status(context,"Account changed","Open the correct account to reply.");return}
 val room=intent.getStringExtra("roomId")?:return;val engine=ChatEngine.instance
 if(intent.action=="reply"){
  val text=RemoteInput.getResultsFromIntent(intent)?.getCharSequence("text")?.toString()?.trim()?:return;if(text.isBlank())return
  val request=JSONObject().put("action","send").put("roomId",room).put("text",text)
  try{PendingReplies.add(context,request);PendingReplies.flush(context);if(engine?.ready!=true)Notices.status(context,"Reply waiting on your phone","Open Hasbreo to send your encrypted reply.")}catch(e:Exception){Notices.status(context,"Reply not queued",e.message?:"Open the app to reply.")}

 }else if(intent.action=="read")engine?.localRequest(JSONObject().put("action","read").put("roomId",room)){}
}}
