package com.hasbreo.message
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import android.util.Base64
import org.json.JSONObject
import java.io.OutputStream
import java.util.UUID
/** Used for legacy Matrix media and optional key-export files, in 32 KB slices. */
object BlobDownloads{
 private data class Transfer(val uri:Uri,val output:OutputStream,val size:Long,var written:Long=0,val started:Long=System.currentTimeMillis())
 private val active=mutableMapOf<String,Transfer>()
 @Synchronized fun handle(context:Context,type:String,data:JSONObject):JSONObject{
  for(id in active.filterValues{System.currentTimeMillis()-it.started>600000}.keys.toList())abort(context,id)
  if(type=="saveDataStart"){
   require(active.size<4){"Finish the current downloads first."};val size=data.getLong("size");require(size in 0..134217728){"Use the file download button for larger attachments."}
   val name=data.optString("name","attachment").replace(Regex("[\\\\/\\p{Cntrl}]"),"_").take(180).ifBlank{"attachment"}
   val values=ContentValues().apply{put(MediaStore.Downloads.DISPLAY_NAME,name);put(MediaStore.Downloads.MIME_TYPE,data.optString("mime","application/octet-stream").take(100));put(MediaStore.Downloads.RELATIVE_PATH,"Download/Hasbreo Message");put(MediaStore.Downloads.IS_PENDING,1)}
   val uri=context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values)?:error("No download location")
   val output=context.contentResolver.openOutputStream(uri,"w")?:error("Cannot write download")
   val id=UUID.randomUUID().toString();active[id]=Transfer(uri,output,size);return JSONObject().put("downloadId",id)
  }
  val id=data.getString("downloadId");val transfer=active[id]?:error("Download expired")
  if(type=="saveDataChunk"){val encoded=data.getString("data");require(encoded.length<=44000);val bytes=Base64.decode(encoded,Base64.DEFAULT);require(bytes.size<=32768&&transfer.written+bytes.size<=transfer.size);transfer.output.write(bytes);transfer.written+=bytes.size}
  else if(type=="saveDataFinish"){require(transfer.written==transfer.size){"The file did not finish downloading."};transfer.output.close();context.contentResolver.update(transfer.uri,ContentValues().apply{put(MediaStore.Downloads.IS_PENDING,0)},null,null);active.remove(id);Notices.status(context,"File saved","Find it in Downloads/Hasbreo Message.")}
  else if(type=="saveDataAbort")abort(context,id)
  return JSONObject().put("ok",true)
 }
 private fun abort(context:Context,id:String){active.remove(id)?.let{try{it.output.close()}catch(_:Exception){};context.contentResolver.delete(it.uri,null,null)}}
}
