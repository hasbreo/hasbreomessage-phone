import {FILE_KEY,fileRequest,uploadFile} from './files.js';
import {displayName} from './core.js';
export const BOARD_TYPE='com.hasbreo.soundboard';
export const SOUND_LIMIT=15*1024*1024;
export function installCommunity(Messenger){
 Object.assign(Messenger.prototype,{
  personName(id,fallback){return this.client?.getAccountData('com.hasbreo.nicknames')?.getContent()?.[id]||displayName(fallback,id)},
  async setNickname(id,name){if(!id?.endsWith(':'+this.domain))throw Error('Choose someone on this server.');const data={...this.client.getAccountData('com.hasbreo.nicknames')?.getContent()};name=String(name).trim().slice(0,64);if(name)data[id]=name;else delete data[id];await this.client.setAccountData('com.hasbreo.nicknames',data);this.emit()},
  async people(){let users=[],offset=0;do{const page=await fileRequest(this.session,'/people?offset='+offset);users.push(...page.users);if(page.next===null||page.next===undefined)break;if(!Number.isSafeInteger(page.next)||page.next<=offset)throw Error('Invalid people page.');offset=page.next;}while(offset<100000);return users.filter(p=>p.user_id!==this.session.userId&&!this.client.getIgnoredUsers().includes(p.user_id))},
  async storedFiles(sort='date',direction='desc'){let files=[],offset=0;do{const page=await fileRequest(this.session,`/list?sort=${encodeURIComponent(sort)}&direction=${encodeURIComponent(direction)}&offset=${offset}`);files.push(...page.files);if(page.next===null||page.next===undefined)break;if(!Number.isSafeInteger(page.next)||page.next<=offset)throw Error('Invalid storage page.');offset=page.next;}while(offset<1000000);return {files}},
  fileAvailable(id){return this.fileStates?.get(id)?.available},
  async checkFiles(ids,force=false){
   this.fileStates??=new Map();const wanted=[...new Set(ids)].filter(id=>/^[a-f0-9]{32}$/.test(id)&& (force||!this.fileStates.has(id)||Date.now()-this.fileStates.get(id).checked>15000));
   if(!wanted.length)return;
   for(let at=0;at<wanted.length;at+=100){const data=await fileRequest(this.session,'/status',{method:'POST',body:{ids:wanted.slice(at,at+100)}});for(const [id,available] of Object.entries(data.available||{})){this.fileStates.set(id,{available:!!available,checked:Date.now()});if(!available){for(const [key,url] of this.urls)if(String(key).includes(id)){URL.revokeObjectURL(url);this.urls.delete(key)}}}}
   while(this.fileStates.size>2000)this.fileStates.delete(this.fileStates.keys().next().value);this.emit();
  },
  async deleteFile(id){
   await fileRequest(this.session,'/'+id,{method:'DELETE'});this.fileStates??=new Map();this.fileStates.set(id,{available:false,checked:Date.now()});this.emit();
   const rooms=this.client.getRooms().filter(r=>r.getMyMembership()==='join'&&r.getLiveTimeline().getEvents().some(e=>e.getSender()===this.session.userId&&e.getContent()[FILE_KEY]?.id===id));
   await Promise.allSettled(rooms.map(r=>this.client.sendEvent(r.roomId,'com.hasbreo.file.deleted',{id})));return {};
  },
  async autoJoinChats(){
   if(this.joiningChats||this.stopped)return;this.joiningChats=true;
   try{for(const room of this.client.getRooms().filter(r=>r.getMyMembership()==='invite')){const inviter=room.getMember(this.session.userId)?.events?.member?.getSender();if(inviter?.endsWith(':'+this.domain)&&!this.client.getIgnoredUsers().includes(inviter))await this.join(room).catch(()=>{});}}finally{this.joiningChats=false;}
  },
  async boardRoom(){
   if(this.boardPromise)return this.boardPromise;
   this.boardPromise=(async()=>{const saved=this.client.getAccountData(BOARD_TYPE)?.getContent()?.roomId;const existing=this.client.getRooms().find(r=>r.getMyMembership()==='join'&&r.getType?.()===BOARD_TYPE&&(r.roomId===saved||!saved));if(existing)return existing.roomId;
    const {room_id}=await this.client.createRoom({visibility:'private',preset:'private_chat',creation_content:{type:BOARD_TYPE},name:'Your soundboard',initial_state:[{type:'m.room.encryption',state_key:'',content:{algorithm:'m.megolm.v1.aes-sha2'}},{type:'m.room.history_visibility',state_key:'',content:{history_visibility:'joined'}}]});await this.client.setAccountData(BOARD_TYPE,{roomId:room_id});for(let n=0;n<100;n++){if(this.client.getRoom(room_id)?.getMyMembership()==='join')return room_id;await new Promise(r=>setTimeout(r,100))}throw Error('Your soundboard is still syncing. Try again in a moment.');})();
   try{return await this.boardPromise}finally{this.boardPromise=null}
  },
  async sounds(){const id=await this.boardRoom();const room=this.client.getRoom(id);if(!room)return [];const events=room.getLiveTimeline().getEvents();await Promise.all(events.filter(e=>e.getType()==='m.room.encrypted').map(e=>this.client.decryptEventIfNeeded(e).catch(()=>{})));return events.filter(e=>!e.isRedacted()&&e.getSender()===this.session.userId&&e.getContent().msgtype===BOARD_TYPE&&e.getContent()[FILE_KEY]).map(e=>({id:e.getId(),roomId:id,name:e.getContent().body,content:e.getContent(),event:e})).reverse()},
  async addSound(file,name,options={}){if(file.size<1||file.size>SOUND_LIMIT||!file.type.startsWith('audio/'))throw Error('Choose an audio file up to 15 MB.');const roomId=await this.boardRoom(),manifest=await uploadFile(this.session,file,options);await this.client.sendMessage(roomId,{msgtype:BOARD_TYPE,body:String(name||file.name).trim().slice(0,80),info:{size:file.size,mimetype:file.type},[FILE_KEY]:manifest});this.emit()},
  async removeSound(sound){await this.client.redactEvent(sound.roomId,sound.id);this.emit()},
  async sendSound(roomId,sound,transaction){
   if(!this.client.isRoomEncrypted(roomId))throw Error('Choose an encrypted chat.');const room=this.client.getRoom(roomId);if(!room||room.getMyMembership()!=='join')throw Error('Choose a connected chat.');
   this.soundTransactions??=new Map();const key=this.session.userId+'|'+roomId+'|'+transaction;if(transaction&&this.soundTransactions.has(key))return this.soundTransactions.get(key);
   const send=async()=>{if(transaction){const existing=room.getLiveTimeline().getEvents().find(e=>e.getTxnId?.()===transaction);if(existing){if(existing.status==='not_sent')return this.client.resendEvent(existing,room);if(!existing.status||existing.status==='sent')return {event_id:existing.getId()};throw Error('This sound is still sending.');}}
    await this.checkFiles([sound.content[FILE_KEY].id],true);if(this.fileAvailable(sound.content[FILE_KEY].id)===false)throw Error('This sound has been deleted from storage.');return this.client.sendEvent(roomId,'m.room.message',{...sound.content,msgtype:'m.audio','com.hasbreo.sound':true},transaction)};
   const task=send();if(transaction)this.soundTransactions.set(key,task);try{const result=await task;while(this.soundTransactions.size>200)this.soundTransactions.delete(this.soundTransactions.keys().next().value);return result}catch(e){this.soundTransactions.delete(key);throw e}
  },
  quickReplies(){return this.client?.getAccountData('com.hasbreo.quick_replies')?.getContent()?.replies||['On my way','Give me a minute','Sounds good!','👍','❤️']},
  async setQuickReplies(replies){await this.client.setAccountData('com.hasbreo.quick_replies',{replies:replies.map(s=>s.trim().slice(0,160)).filter(Boolean).slice(0,12)});this.emit()}
 });
}
