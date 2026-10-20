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
 // The Rust/JS crypto engine owns the only Matrix /sync loop for this device.
 // A competing native sync acknowledges to-device keys without decrypting them.
 private fun poll(){while(running.get())try{
  ChatEngine.instance?.event("hasbreo:wake",JSONObject());Thread.sleep(20000)
 }catch(_:InterruptedException){return}}
 companion object{var instance:ChatService?=null
 fun media(context:Context,active:Boolean,video:Boolean){if(!active&&instance==null)return;val intent=Intent(context,ChatService::class.java).putExtra("callActive",active).putExtra("callVideo",video);ContextCompat.startForegroundService(context,intent)}
 fun start(context:Context){ContextCompat.startForegroundService(context,Intent(context,ChatService::class.java))}}
}
class BootReceiver:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){if(intent.action==Intent.ACTION_BOOT_COMPLETED&&Preferences.get(context).optBoolean("connected")&&Vault(context).get("session")!=null)try{ChatService.start(context)}catch(_:Exception){Notices.status(context,"Hasbreo is ready","Open the app to reconnect your chats and watch.")}}}
