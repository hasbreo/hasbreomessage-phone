export function callHistory(events,now=Date.now()){
 const summaries=new Set(events.map(e=>e.getContent()?.['com.hasbreo.call']?.id).filter(Boolean)),calls=new Map();
 for(const event of events){const type=event.getType(),c=event.getContent();if(!type.startsWith('m.call.')||!c.call_id)continue;const row=calls.get(c.call_id)||{id:c.call_id};row[type]=event;calls.set(c.call_id,row)}
 const output=[];
 for(const row of calls.values()){
  if(summaries.has(row.id))continue;const invite=row['m.call.invite'],answer=row['m.call.answer'],end=row['m.call.hangup']||row['m.call.reject'];if(!invite)continue;
  if(!end&&(answer||now<invite.getTs()+Math.min(invite.getContent().lifetime||60000,120000)))continue;
  const kind=/m=video/.test(invite.getContent().offer?.sdp||'')?'Video':'Voice';
  const duration=answer&&end?Math.max(0,Math.floor((end.getTs()-answer.getTs())/1000)):0;
  const status=answer&&end?'completed':row['m.call.reject']?'declined':end&&/fail|error|ice|media/.test(end.getContent().reason||'')?'failed':'unanswered';
  const body=kind+' call · '+(status==='completed'?Math.floor(duration/60)+':'+String(duration%60).padStart(2,'0'):status==='declined'?'Declined':status==='failed'?'Failed':'Not answered');
  const content={msgtype:'m.notice',body,'com.hasbreo.call':{id:row.id,status,kind:kind.toLowerCase(),duration}};
  output.push({getId:()=>'$hasbreo-call:'+row.id,getType:()=>'m.room.message',getContent:()=>content,getSender:()=>invite.getSender(),getTs:()=>end?.getTs()||invite.getTs(),isRedacted:()=>false,getRoomId:()=>invite.getRoomId?.()});
 }
 return output;
}
export const isChatMessage=e=>e.getType()==='m.room.message'&&e.getContent()?.['m.relates_to']?.rel_type!=='m.replace';
