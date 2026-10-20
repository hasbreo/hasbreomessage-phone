package com.hasbreo.message
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONArray
import org.json.JSONObject
class ChatService:Service(){
 private val running=AtomicBoolean(false);private val executor=Executors.newSingleThreadExecutor()
 private var mediaActive=false
 private var mediaVideo=false
 override fun onCreate(){instance=this;super.onCreate();Notices.channels(this);ServiceCompat.startForeground(this,Notices.CONNECTED,Notices.connection(this),if(Build.VERSION.SDK_INT>=34)ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING else 0);ChatEngine.obtain(this);running.set(true);executor.execute{poll()}}
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
  if(intent?.hasExtra("callActive")==true){mediaActive=intent.getBooleanExtra("callActive",false);mediaVideo=intent.getBooleanExtra("callVideo",false);val type=if(Build.VERSION.SDK_INT>=34)ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING or (if(mediaActive)ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0) or (if(mediaActive&&mediaVideo)ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0)else if(Build.VERSION.SDK_INT>=30&&mediaActive)ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or (if(mediaVideo)ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0)else 0
   ServiceCompat.startForeground(this,Notices.CONNECTED,Notices.connection(this,mediaActive),type)
   val audio=getSystemService(android.media.AudioManager::class.java);audio.mode=if(mediaActive)android.media.AudioManager.MODE_IN_COMMUNICATION else android.media.AudioManager.MODE_NORMAL
   if(!mediaActive&&!Preferences.get(this).optBoolean("connected"))stopSelf()
  };return START_STICKY
 }
 override fun onBind(intent:Intent?):IBinder?=null
 override fun onDestroy(){instance=null;getSystemService(android.media.AudioManager::class.java).mode=android.media.AudioManager.MODE_NORMAL;running.set(false);executor.shutdownNow();super.onDestroy()}
 private fun poll(){while(running.get())try{
  val v=Vault(this);val s=v.get("session")?.let{JSONObject(it)};if(s==null){Thread.sleep(3000);continue}
  val base=s.getString("baseUrl");if(!base.startsWith("https://")){Thread.sleep(3000);continue}
  val identity=s.getString("userId")+s.getString("deviceId");val cursorKey="sync:"+identity;val since=v.get(cursorKey)
  val filter=JSONObject().put("room",JSONObject().put("timeline",JSONObject().put("limit",10).put("types",JSONArray(listOf("m.room.encrypted","m.room.message"))))).put("presence",JSONObject().put("not_types",JSONArray(listOf("*"))))
  val address=base+"/_matrix/client/v3/sync?timeout=25000&set_presence="+(if(ChatEngine.instance?.visible==true)"online"else"unavailable")+"&filter="+URLEncoder.encode(filter.toString(),"UTF-8")+(since?.let{"&since="+URLEncoder.encode(it,"UTF-8")}?:"")
  val c=URL(address).openConnection() as HttpURLConnection;c.connectTimeout=15000;c.readTimeout=35000;c.instanceFollowRedirects=false;c.setRequestProperty("Authorization","Bearer "+s.getString("accessToken"))
  val data=try{if(c.responseCode==401){Notices.status(this,"Sign in to reconnect","Your Hasbreo session needs attention.");Thread.sleep(30000);continue};if(c.responseCode!=200){Thread.sleep(5000);continue};JSONObject(c.inputStream.bufferedReader().use{it.readText()})}finally{c.disconnect()}
  if(Vault(this).get("session")?.let{JSONObject(it).optString("userId")+JSONObject(it).optString("deviceId")}!=identity)continue
  val policy=v.get("policy")?.let{JSONObject(it)}
  if(since!=null&&policy!=null){val muted=policy.optJSONArray("muted")?:JSONArray();val ignored=policy.optJSONArray("ignored")?:JSONArray();val titles=policy.optJSONObject("titles")?:JSONObject();val rooms=data.optJSONObject("rooms")?.optJSONObject("join")?:JSONObject()
   for(roomId in rooms.keys()){
    if((0 until muted.length()).any{muted.optString(it)==roomId})continue
    val events=rooms.getJSONObject(roomId).optJSONObject("timeline")?.optJSONArray("events")?:continue
    for(i in 0 until events.length()){val e=events.getJSONObject(i);val sender=e.optString("sender");if(sender==s.getString("userId")||(0 until ignored.length()).any{ignored.optString(it)==sender})continue
     val content=e.optJSONObject("content")?:JSONObject();if(content.optJSONObject("m.relates_to")?.optString("rel_type")=="m.replace")continue
     val note=JSONObject().put("owner",s.getString("userId")).put("eventId",e.optString("event_id")).put("roomId",roomId).put("title",titles.optString(roomId,"Hasbreo Message")).put("body","New encrypted message")
     android.os.Handler(mainLooper).postDelayed({Notices.message(this,note)},2500)
    }
   }
  };v.put(cursorKey,data.getString("next_batch"))
 }catch(_:InterruptedException){return}catch(_:Exception){try{Thread.sleep(5000)}catch(_:InterruptedException){return}}}
 companion object{var instance:ChatService?=null
 fun media(context:Context,active:Boolean,video:Boolean){if(!active&&instance==null)return;val intent=Intent(context,ChatService::class.java).putExtra("callActive",active).putExtra("callVideo",video);ContextCompat.startForegroundService(context,intent)}
 fun start(context:Context){ContextCompat.startForegroundService(context,Intent(context,ChatService::class.java))}}
}
class BootReceiver:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){if(intent.action==Intent.ACTION_BOOT_COMPLETED&&Preferences.get(context).optBoolean("connected")&&Vault(context).get("session")!=null)try{ChatService.start(context)}catch(_:Exception){Notices.status(context,"Hasbreo is ready","Open the app to reconnect your chats and watch.")}}}
