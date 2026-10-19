package com.hasbreo.message
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
/** Authenticated app-private storage, excluded from device backups. */
class Vault(context: Context) {
 private val prefs=context.getSharedPreferences("hasbreo_private_v1",Context.MODE_PRIVATE)
 private fun key():SecretKey {
  val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
  (store.getKey("hasbreo-vault-v1",null) as? SecretKey)?.let{return it}
  return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{init(KeyGenParameterSpec.Builder("hasbreo-vault-v1",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())}.generateKey()
 }
 @Synchronized fun put(name:String,value:String?){
  if(value==null){prefs.edit().remove(name).apply();return}
  val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
  prefs.edit().putString(name,Base64.encodeToString(cipher.iv+cipher.doFinal(value.toByteArray(Charsets.UTF_8)),Base64.NO_WRAP)).apply()
 }
 @Synchronized fun get(name:String):String?=try{prefs.getString(name,null)?.let{val bytes=Base64.decode(it,Base64.NO_WRAP);val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)));cipher.updateAAD(name.toByteArray(Charsets.UTF_8));String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)),Charsets.UTF_8)}}catch(_:Exception){null}
}
