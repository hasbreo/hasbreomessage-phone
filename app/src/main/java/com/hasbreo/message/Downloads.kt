package com.hasbreo.message
import android.content.ContentValues
import android.content.Context
import android.provider.MediaStore
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Saves one authenticated chunk at a time; no 25 GB byte array or public key file. */
object Downloads{
 fun save(context:Context,session:JSONObject,m:JSONObject,filename:String,mime:String){
  val id=m.getString("id");val size=m.getLong("size");val chunk=m.getInt("chunkSize");val count=m.getInt("chunks")
  require(id.matches(Regex("[a-f0-9]{32}"))&&m.getInt("v")==1&&size in 1..25_000_000_000L&&chunk==8388608&&count.toLong()==(size+chunk-1)/chunk)
  val raw=Base64.decode(m.getString("key"),Base64.DEFAULT);val prefix=Base64.decode(m.getString("noncePrefix"),Base64.DEFAULT);require(raw.size==32&&prefix.size==8)
  val base=session.getString("baseUrl");require(base.startsWith("https://"))
  val name=filename.replace(Regex("[\\\\/\\p{Cntrl}]"),"_").take(180).ifBlank{"attachment"}
  val values=ContentValues().apply{put(MediaStore.Downloads.DISPLAY_NAME,name);put(MediaStore.Downloads.MIME_TYPE,mime.take(100));put(MediaStore.Downloads.RELATIVE_PATH,"Download/Hasbreo Message");put(MediaStore.Downloads.IS_PENDING,1)}
  val uri=context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values)?:error("No download location")
  val noticeId=id.hashCode();val notices=NotificationManagerCompat.from(context)
  fun progress(done:Long){try{notices.notify(noticeId,NotificationCompat.Builder(context,"downloads").setSmallIcon(R.drawable.ic_notification).setContentTitle("Saving $name").setContentText("${done*100/size}% · Hasbreo Message").setProgress(100,(done*100/size).toInt(),false).setOnlyAlertOnce(true).setOngoing(true).build())}catch(_:SecurityException){}}
  try{
   context.contentResolver.openOutputStream(uri,"w")!!.use{out->
    var done=0L;for(index in 0 until count){
     val expected=minOf(chunk.toLong(),size-index.toLong()*chunk).toInt()+16
     val c=URL("$base/hasbreo/files/$id/chunks/$index").openConnection() as HttpURLConnection
     c.connectTimeout=20000;c.readTimeout=120000;c.instanceFollowRedirects=false;c.setRequestProperty("Authorization","Bearer "+session.getString("accessToken"))
     val ciphertext=try{require(c.responseCode==200);c.inputStream.use{input->val bytes=ByteArray(expected);var n=0;while(n<expected){val got=input.read(bytes,n,expected-n);require(got>0);n+=got};require(input.read()==-1);bytes}}finally{c.disconnect()}
     val plaintext=ChunkCipher.decrypt(raw,prefix,id,index,size,ciphertext);out.write(plaintext);done+=plaintext.size;progress(done)
    };require(done==size)
   }
   context.contentResolver.update(uri,ContentValues().apply{put(MediaStore.Downloads.IS_PENDING,0)},null,null)
   notices.cancel(noticeId);Notices.status(context,"File saved", "$name is in Downloads/Hasbreo Message.")
  }catch(error:Exception){context.contentResolver.delete(uri,null,null);notices.cancel(noticeId);Notices.status(context,"Download interrupted","No incomplete file was kept. Try again in the chat.");throw error}
  finally{raw.fill(0)}
 }
}
