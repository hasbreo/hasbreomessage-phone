package com.hasbreo.message
import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import android.webkit.WebResourceResponse
import java.io.FilterInputStream
import java.io.InputStream

/** A share-sheet file is read in bounded slices, even when it is many GB. */
object SharedFiles{
 fun range(context:Context,uri:Uri,mime:String,request:Uri):WebResourceResponse{
  return try{
   val start=request.getQueryParameter("start")?.toLongOrNull()?:0
   val end=request.getQueryParameter("end")?.toLongOrNull()?:throw IllegalArgumentException()
   require(start>=0&&end>start&&end-start<=8388608)
   val descriptor=context.contentResolver.openFileDescriptor(uri,"r")?:error("File unavailable")
   try{Os.lseek(descriptor.fileDescriptor,start,OsConstants.SEEK_SET)}catch(e:Exception){descriptor.close();throw e}
   val stream=ParcelFileDescriptor.AutoCloseInputStream(descriptor)
   val limited=object:FilterInputStream(stream){var left=end-start
    override fun read():Int{if(left<=0)return -1;val value=super.read();if(value>=0)left--;return value}
    override fun read(bytes:ByteArray,offset:Int,length:Int):Int{if(left<=0)return -1;val n=`in`.read(bytes,offset,minOf(length.toLong(),left).toInt());if(n>0)left-=n;return n}
   }
   WebResourceResponse(mime,null,206,"Partial Content",mapOf("Content-Length" to (end-start).toString(),"Cache-Control" to "no-store","X-Content-Type-Options" to "nosniff"),limited)
  }catch(_:Exception){WebResourceResponse("text/plain","UTF-8",400,"Choose file with Attach",emptyMap(),java.io.ByteArrayInputStream(byteArrayOf()))}
 }
}
