package com.hasbreo.message
/** A saved reply belongs to exactly one account. Never retarget it on account change. */
object ReplyPolicy {
 fun validId(id:String)=id.matches(Regex("[a-zA-Z0-9:_-]{1,100}"))
 fun mayAct(action:String,expected:String?,current:String?):Boolean {
  if(action !in setOf("snapshot","messages","send","read","mute","reaction","open","disconnect"))return false
  return action=="snapshot"||(!expected.isNullOrBlank()&&expected==current)
 }
 fun maySend(text:String,expected:String?,current:String?)=text.trim().isNotEmpty()&&text.length<=16000&&!expected.isNullOrBlank()&&expected==current
}
