package com.hasbreo.message

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.fragment.app.FragmentActivity
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

class MainActivity:FragmentActivity(){
 private lateinit var container:FrameLayout
 private lateinit var engine:ChatEngine
 private var mediaRequest:android.webkit.PermissionRequest?=null
 private val mediaPermissions=registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){results->val request=mediaRequest;mediaRequest=null;if(request!=null){if(results.values.all{it}&&::engine.isInitialized&&engine.visible&&unlocked)request.grant(request.resources)else request.deny()}}
 private var chooser:ValueCallback<Array<Uri>>?=null
 private var captureReply:((JSONObject?,String?)->Unit)?=null
 private var cameraFile:File?=null
 private var recorder:MediaRecorder?=null
 private var recordingFile:File?=null
 private var recordingDialog:AlertDialog?=null
 private var unlocked=false
 private var leftAt=0L
 private var lockOverlay:TextView?=null
 private val main=Handler(Looper.getMainLooper())
 private val files=registerForActivityResult(ActivityResultContracts.StartActivityForResult()){result->chooser?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode,result.data));chooser=null}
 private val notifications=registerForActivityResult(ActivityResultContracts.RequestPermission()){}
 private val microphone=registerForActivityResult(ActivityResultContracts.RequestPermission()){granted->if(granted)beginVoice()else finishCapture(null,"Microphone permission was not granted.")}
 private val captureCameraPermission=registerForActivityResult(ActivityResultContracts.RequestPermission()){granted->if(granted)launchCamera()else finishCapture(null,"Camera permission was not granted.")}
 private val camera=registerForActivityResult(ActivityResultContracts.StartActivityForResult()){result->val file=cameraFile;cameraFile=null;if(result.resultCode==RESULT_OK&&file!=null){val uri=FileProvider.getUriForFile(this,"$packageName.files",file);finishCapture(engine.share(uri,"image/jpeg"),null)}else{file?.delete();finishCapture(null,null)}}
 val chrome=object:WebChromeClient(){
  override fun onShowFileChooser(view:WebView,filePathCallback:ValueCallback<Array<Uri>>,params:FileChooserParams):Boolean{
   chooser?.onReceiveValue(null);chooser=filePathCallback
   try{files.launch(params.createIntent().apply{addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)})}catch(_:Exception){chooser?.onReceiveValue(null);chooser=null;Notices.status(this@MainActivity,"Choose a file","Install a file picker or photo app and try again.")};return true
  }
  override fun onPermissionRequest(request:android.webkit.PermissionRequest){runOnUiThread{
   val allowed=setOf(android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE,android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE)
   if(request.origin.toString().trimEnd('/')!="https://appassets.androidplatform.net"||request.resources.any{it !in allowed}||!engine.visible||!unlocked){request.deny();return@runOnUiThread}
   mediaRequest?.deny();mediaRequest=request
   val needed=request.resources.map{if(it==android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE)Manifest.permission.CAMERA else Manifest.permission.RECORD_AUDIO}.filter{ContextCompat.checkSelfPermission(this@MainActivity,it)!=PackageManager.PERMISSION_GRANTED}.distinct()
   if(needed.isEmpty()){mediaRequest=null;request.grant(request.resources)}else mediaPermissions.launch(needed.toTypedArray())
  }}
  override fun onPermissionRequestCanceled(request:android.webkit.PermissionRequest){if(mediaRequest===request)mediaRequest=null}
 }
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);WindowCompat.setDecorFitsSystemWindows(window,false)
  container=FrameLayout(this).apply{setBackgroundColor(Color.rgb(40,46,51))};setContentView(container)
  ViewCompat.setOnApplyWindowInsetsListener(container){v,insets->val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars());val ime=insets.getInsets(WindowInsetsCompat.Type.ime());v.setPadding(bars.left,bars.top,bars.right,maxOf(bars.bottom,ime.bottom));insets}
  try{engine=ChatEngine.obtain(this);engine.attach(this,container)}catch(_:Exception){container.addView(TextView(this).apply{text="Update Android System WebView, then reopen Hasbreo Message.";setTextColor(Color.WHITE);setPadding(32,64,32,32)});return}
  onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){override fun handleOnBackPressed(){engine.web.evaluateJavascript("(()=>{const close=document.querySelector('[aria-label=\"Close\"]');if(close){close.click();return true;}const back=document.querySelector('.messenger.show-chat [aria-label=\"Back to conversations\"]');if(back){back.click();return true;}return false;})()",{handled->if(handled!="true")moveTaskToBack(true)})}})
  acceptIntent(intent);if(Preferences.get(this).optBoolean("connected")&&Vault(this).get("session")!=null)try{ChatService.start(this)}catch(_:Exception){}
  // Expire only app-owned capture files, never shared user documents.
  File(cacheDir,"shared").listFiles()?.filter{System.currentTimeMillis()-it.lastModified()>86400000}?.forEach{it.delete()}
 }
 override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);if(::engine.isInitialized)acceptIntent(intent)}
 override fun onResume(){super.onResume();if(!::engine.isInitialized)return;engine.attach(this,container);if(!unlocked||System.currentTimeMillis()-leftAt>30000)authenticate();else engine.visible=true;PendingReplies.flush(this);if(Preferences.get(this).optBoolean("connected")&&Vault(this).get("session")!=null)try{ChatService.start(this)}catch(_:Exception){}}
 override fun onPause(){super.onPause();if(::engine.isInitialized){engine.visible=false;engine.event("hasbreo:visibility",JSONObject().put("visible",false))};leftAt=System.currentTimeMillis()}
 override fun onStop(){super.onStop();if(recorder!=null)stopVoice(false);if(::engine.isInitialized)engine.detach(this)}
 override fun onDestroy(){mediaRequest?.deny();mediaRequest=null;chooser?.onReceiveValue(null);chooser=null;if(::engine.isInitialized)engine.detach(this);super.onDestroy()}
 fun recreateEngine(){ChatEngine.reset();recreate()}
 fun requestNotifications(){if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)notifications.launch(Manifest.permission.POST_NOTIFICATIONS)}
 private fun authenticate(){
  if(!Preferences.get(this).optBoolean("appLock")){unlocked=true;lockOverlay?.let{container.removeView(it)};return}
  window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
  val overlay=TextView(this).apply{text="Hasbreo Message\nUnlock to see your people";gravity=android.view.Gravity.CENTER;textSize=21f;setTextColor(Color.rgb(244,246,248));setBackgroundColor(Color.rgb(40,46,51));setOnClickListener{authenticate()}}
  lockOverlay?.let{container.removeView(it)};lockOverlay=overlay;container.addView(overlay,ViewGroup.LayoutParams(-1,-1))
  val auth=BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
  if(BiometricManager.from(this).canAuthenticate(auth)!=BiometricManager.BIOMETRIC_SUCCESS){Preferences.set(this,"appLock",false);container.removeView(overlay);unlocked=true;Notices.status(this,"Set a phone screen lock","Set a PIN or fingerprint before enabling the app lock.");return}
  BiometricPrompt(this,ContextCompat.getMainExecutor(this),object:BiometricPrompt.AuthenticationCallback(){override fun onAuthenticationSucceeded(result:BiometricPrompt.AuthenticationResult){unlocked=true;container.removeView(overlay);lockOverlay=null}}).authenticate(BiometricPrompt.PromptInfo.Builder().setTitle("Unlock Hasbreo Message").setSubtitle("Your people, kept private").setAllowedAuthenticators(auth).build())
 }
 private fun acceptIntent(intent:Intent){
  if(intent.getStringExtra("callAction")=="answer"){
   val callId=intent.getStringExtra("callId");val account=intent.getStringExtra("account");intent.removeExtra("callAction")
   val deadline=System.currentTimeMillis()+30000
   val delivery=object:Runnable{override fun run(){if(System.currentTimeMillis()>deadline)return;if(!unlocked||!engine.ready){main.postDelayed(this,200);return};engine.event("hasbreo:callaction",JSONObject().put("action","answer").put("callId",callId).put("account",account))}};main.postDelayed(delivery,500)
  }
  intent.getStringExtra("roomId")?.let{room->main.postDelayed({engine.open(room)},1000)}
  if(intent.action !in setOf(Intent.ACTION_SEND,Intent.ACTION_SEND_MULTIPLE))return
  val text=listOfNotNull(intent.getStringExtra(Intent.EXTRA_SUBJECT),intent.getStringExtra(Intent.EXTRA_TEXT)).distinct().joinToString("\n")
  val uris=mutableListOf<Uri>();if(intent.action==Intent.ACTION_SEND){@Suppress("DEPRECATION") val uri=intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM);if(uri!=null)uris.add(uri)}else{@Suppress("DEPRECATION") val list=intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM);if(list!=null)uris.addAll(list)}
  val items=JSONArray();for(uri in uris.take(20)){try{val mime=contentResolver.getType(uri)?:intent.type?:"application/octet-stream";items.put(engine.share(uri,mime))}catch(_:Exception){}}
  engine.pendingShare=JSONObject().put("text",text).put("files",items);engine.event("hasbreo:share",JSONObject());Notices.status(this,"Choose a conversation","Your shared content is ready. Open a chat to add it.")
 }
 fun capture(type:String,done:(JSONObject?,String?)->Unit){
  if(captureReply!=null){done(null,"Finish the current capture first.");return};captureReply=done
  if(type=="camera"){
   val folder=File(cacheDir,"shared").apply{mkdirs()};val file=File(folder,"photo-${UUID.randomUUID()}.jpg");cameraFile=file
   val uri=FileProvider.getUriForFile(this,"$packageName.files",file)
   if(ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)launchCamera()else captureCameraPermission.launch(Manifest.permission.CAMERA)
  }else if(ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)beginVoice()else microphone.launch(Manifest.permission.RECORD_AUDIO)
 }
 private fun launchCamera(){val file=cameraFile?:return;val uri=FileProvider.getUriForFile(this,"$packageName.files",file);try{camera.launch(Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,uri).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION))}catch(_:Exception){finishCapture(null,"No camera app was found.")}}
 @Suppress("DEPRECATION") private fun beginVoice(){
  try{
   val folder=File(cacheDir,"shared").apply{mkdirs()};val file=File(folder,"voice-${System.currentTimeMillis()}.m4a");recordingFile=file
   recorder=(if(Build.VERSION.SDK_INT>=31)MediaRecorder(this)else MediaRecorder()).apply{setAudioSource(MediaRecorder.AudioSource.MIC);setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);setAudioEncoder(MediaRecorder.AudioEncoder.AAC);setAudioEncodingBitRate(96000);setAudioSamplingRate(44100);setOutputFile(file.absolutePath);setMaxDuration(180000);setOnInfoListener{_,what,_->if(what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED)stopVoice(true)};prepare();start()}
   val started=System.currentTimeMillis();val label=TextView(this).apply{text="Recording… 0:00\nUp to 3 minutes";textSize=19f;setTextColor(Color.rgb(244,246,248));setPadding(40,35,40,35)}
   recordingDialog=AlertDialog.Builder(this).setTitle("A little voice note").setView(label).setNegativeButton("Discard"){_,_->stopVoice(false)}.setPositiveButton("Send voice note"){_,_->stopVoice(true)}.setOnCancelListener{stopVoice(false)}.show()
   fun tick(){if(recorder==null)return;val sec=(System.currentTimeMillis()-started)/1000;label.text="Recording… ${sec/60}:${(sec%60).toString().padStart(2,'0')}\nUp to 3 minutes";main.postDelayed({tick()},500)};tick()
  }catch(_:Exception){stopVoice(false);finishCapture(null,"Could not start recording. Check microphone permission.")}
 }
 private fun stopVoice(send:Boolean){
  val current=recorder?:return;recorder=null;var valid=true;try{current.stop()}catch(_:Exception){valid=false};current.release();recordingDialog?.dismiss();recordingDialog=null
  val file=recordingFile;recordingFile=null
  if(send&&valid&&file!=null&&file.length()>0){val uri=FileProvider.getUriForFile(this,"$packageName.files",file);finishCapture(engine.share(uri,"audio/mp4"),null)}else{file?.delete();finishCapture(null,null)}
 }
 private fun finishCapture(data:JSONObject?,error:String?){val callback=captureReply;captureReply=null;callback?.invoke(data,error)}
}
