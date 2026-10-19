package com.hasbreo.message
import java.nio.ByteBuffer
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
/** Format shared with Hasbreo Web: AES-256-GCM, 8-byte nonce + index, bound AAD. */
object ChunkCipher{
 fun decrypt(key:ByteArray,prefix:ByteArray,id:String,index:Int,size:Long,ciphertext:ByteArray):ByteArray{
  require(key.size==32&&prefix.size==8&&id.matches(Regex("[a-f0-9]{32}")))
  require(size in 1..25_000_000_000L&&index>=0&&index.toLong()*8388608<size)
  val expected=minOf(8388608L,size-index.toLong()*8388608).toInt()+16;require(ciphertext.size==expected)
  val iv=ByteBuffer.allocate(12).put(prefix).putInt(index).array();val cipher=Cipher.getInstance("AES/GCM/NoPadding")
  cipher.init(Cipher.DECRYPT_MODE,SecretKeySpec(key,"AES"),GCMParameterSpec(128,iv));cipher.updateAAD("$id:$index:$size".toByteArray(Charsets.UTF_8));return cipher.doFinal(ciphertext)
 }
}
