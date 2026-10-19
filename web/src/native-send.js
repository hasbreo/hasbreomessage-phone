// Matrix deduplicates a transaction on the server; this also avoids creating a
// second SDK local echo while a request is still in flight in the same process.
const transactions=new Map();
export async function sendNativeText(service,request){
  const room=service.client.getRoom(request.roomId),text=String(request.text||'').trim();
  if(!room||room.getMyMembership()!=='join'||!text||text.length>16000)throw new Error('Choose a joined conversation and write a valid reply.');
  if(!service.client.isRoomEncrypted(room.roomId))throw new Error('Open this unencrypted chat on your phone to reply.');
  const txn='hasbreo-'+request.requestId,key=service.session.userId+'|'+room.roomId+'|'+txn;
  if(transactions.has(key))return transactions.get(key);
  const task=(async()=>{
    const existing=room.getLiveTimeline().getEvents().find(e=>e.getTxnId?.()===txn);
    if(existing){
      if(existing.status==='not_sent')return service.client.resendEvent(existing,room);
      if(!existing.status||existing.status==='sent')return {event_id:existing.getId()};
      throw new Error('This reply is still sending. Check the chat before retrying.');
    }
    service.read?.(room).catch(()=>{});
    return service.client.sendMessage(room.roomId,{msgtype:'m.text',body:text},txn);
  })();
  transactions.set(key,task);
  try{const result=await task;if(transactions.size>200)transactions.delete(transactions.keys().next().value);return result;}
  catch(error){transactions.delete(key);throw error;}
}
