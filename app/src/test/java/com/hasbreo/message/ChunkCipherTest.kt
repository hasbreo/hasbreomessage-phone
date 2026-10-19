package com.hasbreo.message
import org.junit.Assert.*
import org.junit.Test
import java.util.Base64
class ChunkCipherTest{
 private val key=ByteArray(32){it.toByte()};private val prefix=ByteArray(8){it.toByte()};private val id="a".repeat(32)
 private val encrypted=Base64.getDecoder().decode("aCQ6DQZ3J0OihZn7AvsQxc6kIiWMFBPPKrRMwYP+y0TLWlUxCS/Uw7e7pgW2yN7T")
 @Test fun decryptsWebCryptoFixture(){assertEquals("A little hello, securely shared.",String(ChunkCipher.decrypt(key,prefix,id,0,32L,encrypted),Charsets.UTF_8))}
 @Test fun rejectsTamperedCiphertext(){val bad=encrypted.copyOf();bad[0]=(bad[0].toInt() xor 1).toByte();assertThrows(Exception::class.java){ChunkCipher.decrypt(key,prefix,id,0,32L,bad)}}
 @Test fun rejectsDifferentFile(){assertThrows(Exception::class.java){ChunkCipher.decrypt(key,prefix,"b".repeat(32),0,32L,encrypted)}}
 @Test fun rejectsWrongPosition(){assertThrows(Exception::class.java){ChunkCipher.decrypt(key,prefix,id,1,32L,encrypted)}}
 @Test fun rejectsWrongTotalSize(){assertThrows(Exception::class.java){ChunkCipher.decrypt(key,prefix,id,0,32L+1,encrypted)}}
 @Test fun rejectsWrongKey(){assertThrows(Exception::class.java){ChunkCipher.decrypt(ByteArray(32){42},prefix,id,0,32L,encrypted)}}
 @Test fun rejectsTruncatedChunk(){assertThrows(Exception::class.java){ChunkCipher.decrypt(key,prefix,id,0,32L,encrypted.copyOfRange(0,encrypted.size-1))}}
 @Test fun rejectsOversizedManifest(){assertThrows(Exception::class.java){ChunkCipher.decrypt(key,prefix,id,0,25000000001L,encrypted)}}
}
