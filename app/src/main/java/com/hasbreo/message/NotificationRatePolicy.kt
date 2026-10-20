package com.hasbreo.message
import android.content.Context
import org.json.JSONObject
object NotificationRatePolicy {
 @Synchronized fun allow(context:Context,room:String,roomMs:Long=30000L):Boolean {
  val vault=Vault(context);val values=JSONObject(vault.get("notification-alert-times")?:"{}");val now=System.currentTimeMillis();val last=values.optLong(room,0);val global=values.optLong("__global",0)
  if((last>0&&now-last<roomMs)||(global>0&&now-global<5000))return false
  values.put(room,now);values.put("__global",now);val stale=values.keys().asSequence().filter{now-values.optLong(it)>86400000}.toList();stale.forEach{values.remove(it)};vault.put("notification-alert-times",values.toString());return true
 }
}
