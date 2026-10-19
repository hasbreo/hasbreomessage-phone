package com.hasbreo.message

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.MutableContextWrapper
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.*
import androidx.webkit.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

/** Exactly one WebView owns the Matrix device/IndexedDB crypto store. */
@SuppressLint("SetJavaScriptEnabled")
class ChatEngine private constructor(private val app:Context){
 val context=MutableContextWrapper(app)
 val web=WebView(context)
 val main=Handler(Looper.getMainLooper())
 var activity:MainActivity?=null
 @Volatile var visible=false
 var activeRoom:String?=null
 @Volatile var ready=false
 private val pending=mutableMapOf<String,(String?)->Unit>()
 private val shared=java.util.concurrent.ConcurrentHashMap<String,Pair<Uri,String>>()
 private val executor=Executors.newFixedThreadPool(2)
 var pendingShare:JSONObject?=null
 private val loader=WebViewAssetLoader.Builder().setDomain("appassets.androidplatform.net")
  .addPathHandler("/native/"){path->shared[path]?.let{(uri,mime)->try{WebResourceResponse(mime,null,app.contentResolver.openInputStream(uri))}catch(_:Exception){null}}}
  .addPathHandler("/",WebViewAssetLoader.AssetsPathHandler(app)).build()
 init{
  web.setBackgroundColor(android.graphics.Color.rgb(40,46,51))
  web.settings.apply{javaScriptEnabled=true;domStorageEnabled=true;databaseEnabled=true;allowFileAccess=false;allowContentAccess=false;mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW;mediaPlaybackRequiresUserGesture=true;setSupportMultipleWindows(false);userAgentString=userAgentString+" HasbreoMessage/1.0.0"}
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false)
  WebView.setWebContentsDebuggingEnabled(false)
  web.webViewClient=object:WebViewClient(){
   override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse?{
    val u=request.url
    if(u.host=="appassets.androidplatform.net"&&u.path?.startsWith("/native/")==true){
     val entry=shared[u.lastPathSegment]?:return WebResourceResponse("text/plain","UTF-8",404,"Not found",emptyMap(),java.io.ByteArrayInputStream(byteArrayOf()))
     return SharedFiles.range(app,entry.first,entry.second,u)
    }
    val response=loader.shouldInterceptRequest(request.url)
    if(response!=null){if(request.url.path?.endsWith(".wasm")==true)response.mimeType="application/wasm"
     response.responseHeaders=mapOf("Cache-Control" to "no-store","X-Content-Type-Options" to "nosniff","Content-Security-Policy" to "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; connect-src 'self' https:; media-src 'self' blob: https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'")
    };return response
   }
   override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean{
    val u=request.url
    if(u.scheme=="https"&&u.host=="appassets.androidplatform.net")return u.path !in setOf("/","/index.html")
    if(request.isForMainFrame&&u.scheme in setOf("https","mailto"))try{app.startActivity(Intent(Intent.ACTION_VIEW,u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}catch(_:Exception){}
    return true
   }
   override fun onRenderProcessGone(view:WebView,detail:RenderProcessGoneDetail):Boolean{
    ready=false;Notices.status(app,"Reconnect Hasbreo","Open the app to restore your encrypted chat engine.");activity?.recreateEngine();return true
   }
  }
  require(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){"Update Android System WebView to use Hasbreo Message."}
  WebViewCompat.addWebMessageListener(web,"HasbreoNative",setOf(ORIGIN)){_,message,origin,isMainFrame,reply->
   if(!isMainFrame||origin.toString()!=ORIGIN)return@addWebMessageListener
   try{val raw=message.data?:return@addWebMessageListener;if(raw.length>250000)throw IllegalArgumentException("Request too large");val request=JSONObject(raw);handle(request.getString("id"),request.getString("type"),request.optJSONObject("data")?:JSONObject(),reply)}catch(_:Exception){/* Malformed frames never invoke privileged actions. */}
  }
  web.loadUrl("$ORIGIN/index.html")
 }
 fun share(uri:Uri,mime:String):JSONObject{
  val key=UUID.randomUUID().toString();shared[key]=uri to mime
  var name="shared-file";var size=-1L
  app.contentResolver.query(uri,arrayOf(android.provider.OpenableColumns.DISPLAY_NAME,android.provider.OpenableColumns.SIZE),null,null,null)?.use{if(it.moveToFirst()){name=it.getString(0)?:name;if(!it.isNull(1))size=it.getLong(1)}}
  if(size<0)try{app.contentResolver.openFileDescriptor(uri,"r")?.use{size=it.statSize}}catch(_:Exception){}
  return JSONObject().put("url","$ORIGIN/native/$key").put("name",name).put("mime",mime).put("size",size)
 }
 fun attach(owner:MainActivity,parent:ViewGroup){activity=owner;context.baseContext=owner;(web.parent as? ViewGroup)?.removeView(web);parent.addView(web,ViewGroup.LayoutParams(-1,-1));web.webChromeClient=owner.chrome;web.onResume();visible=true;event("hasbreo:visibility",JSONObject().put("visible",true))}
 fun detach(owner:MainActivity){if(activity!==owner)return;visible=false;activity=null;context.baseContext=app;web.webChromeClient=WebChromeClient();(web.parent as? ViewGroup)?.removeView(web)}
 fun event(name:String,data:JSONObject){main.post{web.evaluateJavascript("window.dispatchEvent(new CustomEvent(${JSONObject.quote(name)},{detail:${data}}));",null)}}
 fun open(room:String){event("hasbreo:open",JSONObject().put("roomId",room))}
 fun localRequest(request:JSONObject,done:(String?)->Unit){
  main.post{if(!ready){done("Open Hasbreo and wait for your conversations to connect.");return@post};val id=request.optString("requestId").ifBlank{"local:"+UUID.randomUUID()};pending[id]=done;event("hasbreo:request",request.put("requestId",id));main.postDelayed({pending.remove(id)?.invoke("The reply timed out. Check your conversation before trying again.")},60000)}
 }
 fun wearRequest(node:String,request:JSONObject){
  main.post{if(!ready){WearBridge.pendingNodes.remove(request.optString("requestId"));WearBridge.respond(app,node,request.optString("requestId"),null,"Open Hasbreo on your phone and wait for it to connect.");return@post}
   val id=request.getString("requestId");pending[id]={error->if(error!=null)WearBridge.respond(app,node,id,null,error)}
   WearBridge.pendingNodes[id]=node;event("hasbreo:request",request);main.postDelayed({if(pending.remove(id)!=null){WearBridge.pendingNodes.remove(id);WearBridge.respond(app,node,id,null,"The phone took too long. Your reply may not have been sent.")}},60000)
  }
 }
 private fun answer(reply:JavaScriptReplyProxy,id:String,data:Any?=JSONObject(),error:String?=null){main.post{try{reply.postMessage(JSONObject().put("id",id).put("data",data?:JSONObject.NULL).apply{if(error!=null)put("error",error)}.toString())}catch(_:Exception){}}}
 private fun handle(id:String,type:String,data:JSONObject,reply:JavaScriptReplyProxy){
  fun ok(value:Any?=JSONObject())=answer(reply,id,value)
  fun fail(message:String)=answer(reply,id,error=message)
  try{when(type){
   "session"->{
    val base=data.getString("baseUrl");require(Uri.parse(base).scheme=="https"&&Uri.parse(base).host!=null){"Choose an HTTPS messaging server."}
    val old=Vault(app).get("session")?.let{JSONObject(it).optString("userId")}
    if(old!=null&&old!=data.getString("userId")){Notices.clearMessages(app);Vault(app).put("approvedWatches",null);Vault(app).put("policy",null);WearBridge.clear(app)}
    Vault(app).put("session",data.toString());ready=false
    if(Vault(app).get("askedNotifications")!="yes"&&activity!=null)try{activity?.requestNotifications();Vault(app).put("askedNotifications","yes")}catch(_:Exception){}
    if(Preferences.get(app).optBoolean("connected"))try{ChatService.start(app)}catch(_:Exception){}
    ok()
   }
   "engineReady"->{ready=true;ok();event("hasbreo:visibility",JSONObject().put("visible",visible));PendingReplies.flush(app)}
   "screen"->{activeRoom=data.optString("roomId").takeIf{it.isNotBlank()&&it!="null"};ok()}
   "policy"->{Vault(app).put("policy",data.toString());ok()}
   "notification"->{WearBridge.changed(app,data.optString("roomId"));Notices.message(app,data);ok()}
   "testNotification"->{Notices.message(app,JSONObject().put("eventId",UUID.randomUUID()).put("title","You’re all set ✨").put("body","Hasbreo notifications are working."),true);ok()}
   "preferences"->ok(Preferences.get(app))
   "setPreference"->{val key=data.getString("key");val value=data.getBoolean("value");val prefs=Preferences.set(app,key,value)
    if(key=="connected"){if(value){if(activity==null)throw IllegalStateException("Open Hasbreo to enable Connected mode.");ChatService.start(app)}else app.stopService(Intent(app,ChatService::class.java))}
    ok(prefs)
   }
   "logout"->{Notices.clearMessages(app);Vault(app).put("session",null);Vault(app).put("policy",null);Vault(app).put("approvedWatches",null);Vault(app).put("pendingReply",null);Vault(app).put("pendingReplies",null);ready=false;app.stopService(Intent(app,ChatService::class.java));WearBridge.clear(app);ok()}
   "notificationPermission"->{activity?.requestNotifications();ok()}
   "haptic"->{if(Preferences.get(app).optBoolean("haptics"))app.getSystemService(Vibrator::class.java)?.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK));ok()}
   "batterySettings"->{activity?.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+app.packageName)));ok()}
   "checkUpdate"->{activity?.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://hasbreo.com/message#downloads")));ok()}
   "pairWatch"->{val owner=activity?:throw IllegalStateException("Open Hasbreo on your phone first.");WearBridge.choose(owner);ok()}
   "draftsLoad"->{val owner=Vault(app).get("session")?.let{JSONObject(it).optString("userId")};ok(owner?.let{Vault(app).get("drafts:$it")?.let{raw->JSONObject(raw)}}?:JSONObject())}
   "draftsSave"->{val owner=Vault(app).get("session")?.let{JSONObject(it).optString("userId")}?:throw IllegalStateException("Sign in first.");val drafts=data.getJSONObject("drafts");require(drafts.toString().length<200000);Vault(app).put("drafts:$owner",drafts.toString());ok()}
   "saveDataStart","saveDataChunk","saveDataFinish","saveDataAbort"->{ok(BlobDownloads.handle(app,type,data))}
   "pendingReplies"->{activity?.let{PendingReplies.show(it)};ok()}
   "takeShare"->{val value=pendingShare;pendingShare=null;ok(value)}
   "voice","camera"->{val owner=activity?:throw IllegalStateException("Open Hasbreo on your phone first.");owner.capture(type){value,error->answer(reply,id,value,error)}}
   "download"->{val session=Vault(app).get("session")?.let{JSONObject(it)}?:throw IllegalStateException("Sign in first.")
    // Never let a web frame pick a destination server or bearer token.
    val manifest=data.getJSONObject("manifest");executor.execute{try{Downloads.save(app,session,manifest,data.optString("name","attachment"),data.optString("mime","application/octet-stream"));answer(reply,id,JSONObject().put("saved",true))}catch(_:Exception){answer(reply,id,error="Download did not finish. Check your connection and storage, then retry.")}}
    ok(JSONObject().put("started",true))
   }
   "watchResponse"->{val requestId=data.getString("requestId");val node=WearBridge.pendingNodes.remove(requestId);val error=data.optString("error").takeIf{it.isNotBlank()}
    if(node!=null){WearBridge.respond(app,node,requestId,data.optJSONObject("result"),error);pending.remove(requestId)}else pending.remove(requestId)?.invoke(error);ok()
   }
   else->fail("This action is not supported.")
  }}catch(e:Exception){fail(e.message?:"Could not complete this action.")}
 }
 companion object{
  const val ORIGIN="https://appassets.androidplatform.net"
  @Volatile var instance:ChatEngine?=null;private set
  fun obtain(context:Context):ChatEngine{check(Looper.myLooper()==Looper.getMainLooper());return instance?:ChatEngine(context.applicationContext).also{instance=it}}
  fun reset(){instance?.let{(it.web.parent as? ViewGroup)?.removeView(it.web);it.web.destroy()};instance=null}
 }
}
