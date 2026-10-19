package com.hasbreo.message
import org.junit.Assert.*
import org.junit.Test
class ReplyPolicyTest {
 @Test fun sameAccountReplyIsAllowed(){assertTrue(ReplyPolicy.maySend("hello","@a:server","@a:server"))}
 @Test fun savedReplyCannotMoveAccounts(){assertFalse(ReplyPolicy.maySend("hello","@a:server","@b:server"))}
 @Test fun unsignedAccountCannotSend(){assertFalse(ReplyPolicy.maySend("hello",null,"@a:server"));assertFalse(ReplyPolicy.maySend("hello","@a:server",null))}
 @Test fun blankAndOversizedRepliesAreRejected(){assertFalse(ReplyPolicy.maySend("  ","a","a"));assertFalse(ReplyPolicy.maySend("x".repeat(16001),"a","a"))}
 @Test fun reconnectMayFetchAccountButCannotReplyYet(){assertTrue(ReplyPolicy.mayAct("snapshot",null,null));assertFalse(ReplyPolicy.mayAct("send",null,null))}
 @Test fun unknownActionsAndInvalidIdsAreRejected(){assertFalse(ReplyPolicy.mayAct("admin-delete","a","a"));assertFalse(ReplyPolicy.validId("../not-an-id"));assertFalse(ReplyPolicy.validId("x".repeat(101)));assertTrue(ReplyPolicy.validId("watch:reply-12"))}
}
