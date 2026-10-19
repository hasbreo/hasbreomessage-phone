package com.hasbreo.message
import android.app.Application
import android.content.Context
import org.json.JSONObject
class MessageApp:Application(){override fun onCreate(){super.onCreate();Notices.channels(this)}}
object Preferences{
 fun get(context:Context):JSONObject{val saved=Vault(context).get("preferences")?.let{JSONObject(it)}?:JSONObject();for((key,value)in mapOf("connected" to false,"previews" to true,"haptics" to true,"appLock" to false))if(!saved.has(key))saved.put(key,value);return saved}
 fun set(context:Context,key:String,value:Boolean):JSONObject{require(key in setOf("connected","previews","haptics","appLock"));return get(context).put(key,value).also{Vault(context).put("preferences",it.toString())}}
}
