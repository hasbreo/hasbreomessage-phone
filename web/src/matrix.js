import * as sdk from 'matrix-js-sdk';
import { decryptAttachment } from 'matrix-encrypt-attachment';
import { serverUrl, userId, messageText, encryptBackup, decryptBackup,displayName } from './core.js';
import {isNative,nativeRequest,saveNativeBlob} from './native.js';
import { PasswordRecovery } from './recovery.js';
import {FILE_KEY,uploadFile,fileBlob,downloadFile,fileRequest} from './files.js';

export const SESSION_KEY='hasbreo.chat.session.v1';
export const readSession=()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY));}catch{return null;}};
const encryptedState=[{type:'m.room.encryption',state_key:'',content:{algorithm:'m.megolm.v1.aes-sha2'}},{type:'m.room.history_visibility',state_key:'',content:{history_visibility:'invited'}},{type:'m.room.guest_access',state_key:'',content:{guest_access:'forbidden'}}];
const quietLogger={trace(){},debug(){},info(){},warn(){},error(...args){console.error('Matrix:',...args);},getChild(){return this;}};
export class Messenger {
  constructor(onChange, onMessage=()=>{}, options={}) {this.onChange=onChange;this.onMessage=onMessage;this.options=options;this.urls=new Map();this.mediaPending=new Map();this.readMarks=new Map();this.status='Connecting';this.ready=false;this.generation=0;}
  async authenticate({server,username,password,register=false,token='',displayName=''}) {
    const baseUrl=serverUrl(server), anonymous=sdk.createClient({baseUrl,logger:this.options.logger||quietLogger});
    const domain=new URL(baseUrl).host;
    let result;
    if (register) {
      const local=userId(username,domain).split(':')[0].slice(1);
      if (password.length<8) throw new Error('Use at least 8 characters. No symbols or capitals are required.');
      const body={username:local,password,initial_device_display_name:'Hasbreo Message · Android',inhibit_login:false};
      let auth;
      for(let i=0;i<5;i++) {
        try {result=await anonymous.registerRequest({...body,...(auth?{auth}:{})});break;}
        catch(e) {
          if(e.httpStatus!==401 || !e.data?.flows) throw e;
          const supported=e.data.flows.find(f=>f.stages.every(s=>['m.login.registration_token','m.login.dummy'].includes(s)));
          if(!supported) throw new Error('This server uses a signup method that is not supported here. Ask the server owner for an account.');
          const stage=supported.stages.find(s=>!(e.data.completed||[]).includes(s));
          if(!stage) throw e;
          if(stage==='m.login.registration_token' && !token.trim()) throw new Error('Enter an invite code from your server owner.');
          auth={type:stage,session:e.data.session,...(stage==='m.login.registration_token'?{token:token.trim()}:{})};
        }
      }
      if(!result) throw new Error('Could not finish account registration.');
    } else result=await anonymous.login('m.login.password',{identifier:{type:'m.id.user',user:username.trim()},password,initial_device_display_name:'Hasbreo Message · Android'});
    const session={baseUrl,userId:result.user_id,accessToken:result.access_token,deviceId:result.device_id};
    localStorage.setItem(SESSION_KEY,JSON.stringify(session));
    await this.start(session,{password});
    if(register && displayName.trim()) await this.client.setDisplayName(displayName.trim());
    return session;
  }
  async start(session,{password}={}) {
    this.session=session;this.stopped=false;this.liveMessages=new Set();this.presenceCache=new Map();const hasPassword=password!==undefined;
    if (navigator.locks) await new Promise((resolve,reject)=>{
      navigator.locks.request(`hasbreo-crypto-${session.deviceId}`,{ifAvailable:true},async lock=>{
        if(!lock){reject(new Error('Hasbreo Chat is already open in another tab. Use that tab or close it first.'));return;}
        const held=new Promise(r=>this.releaseLock=r);resolve();await held;
      }).catch(reject);
    });
    try {
      this.recovery=new PasswordRecovery(()=>this.emit());
      this.client=sdk.createClient({baseUrl:session.baseUrl,userId:session.userId,accessToken:session.accessToken,deviceId:session.deviceId,logger:this.options.logger||quietLogger,cryptoCallbacks:this.recovery.callbacks});
      this.recovery.attach(this.client);
      await this.client.initRustCrypto({cryptoDatabasePrefix:`hasbreo-${session.deviceId}`,...this.options.cryptoOptions});
      this.client.on(sdk.ClientEvent.Sync,(state,previous,data)=>{
        this.status=state==='ERROR'?'Reconnecting':state==='PREPARED'||state==='SYNCING'?'Connected':'Connecting';
        if(state==='PREPARED'){this.ready=true;if(!hasPassword)this.recovery.resume();this.checkAdmin().catch(()=>{});}
        if(data?.error?.errcode==='M_UNKNOWN_TOKEN')this.status='Session expired';
        this.emit();
      });
      const timeline=(e,room,toStart,removed,data)=>{
        this.emit();
        if(this.ready&&!toStart&&data?.liveEvent&&e.getSender()!==session.userId&&['m.room.message','m.room.encrypted'].includes(e.getType())){this.liveMessages.add(e.getId());if(this.liveMessages.size>300)this.liveMessages.delete(this.liveMessages.values().next().value);if(e.getType()==='m.room.message'&&e.getContent()['m.relates_to']?.rel_type!=='m.replace')this.onMessage(e,room);}
      };
      this.client.on(sdk.RoomEvent.Timeline,timeline);
      this.client.on(sdk.MatrixEventEvent.Decrypted,(e)=>{this.emit();if(this.ready&&this.liveMessages.has(e.getId())&&e.getSender()!==session.userId&&e.getContent().msgtype&&e.getContent()['m.relates_to']?.rel_type!=='m.replace')this.onMessage(e,this.client.getRoom(e.getRoomId()));});
      for(const evt of [sdk.RoomEvent.Name,sdk.RoomEvent.MyMembership,sdk.RoomEvent.Receipt,sdk.RoomEvent.LocalEchoUpdated,sdk.RoomMemberEvent.Typing,sdk.RoomMemberEvent.Membership,sdk.ClientEvent.AccountData,sdk.UserEvent.DisplayName,sdk.UserEvent.Presence,sdk.UserEvent.LastPresenceTs,sdk.UserEvent.CurrentlyActive])this.client.on(evt,()=>this.emit());
      await this.client.startClient({initialSyncLimit:60,lazyLoadMembers:true});
      if(hasPassword&&this.options.automaticRecovery!==false){await this.waitReady();try{await this.recovery.initialize(password);}catch{/* Login succeeded. Surface recovery separately, without discarding this device's keys. */}}
    } catch(e) {this.stop();throw e;}finally{password=undefined;}
  }
  async waitReady(){const start=Date.now();while(!this.ready&&!this.stopped&&Date.now()-start<30000)await new Promise(r=>setTimeout(r,100));if(!this.ready)throw new Error('The server is taking longer to sync. Your login is saved; use Retry to reconnect.');}
  emit(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.onChange(),60);}
  get domain(){return this.session.userId.slice(this.session.userId.indexOf(':')+1);}
  get me(){return this.client?.getUser(this.session?.userId);}
  rooms(){return (this.client?.getRooms()||[]).filter(r=>['join','invite'].includes(r.getMyMembership())).sort((a,b)=>(b.getLastActiveTimestamp()||0)-(a.getLastActiveTimestamp()||0));}
  latest(room){const ignored=this.client.getIgnoredUsers();return [...room.getLiveTimeline().getEvents()].reverse().find(e=>!ignored.includes(e.getSender())&&['m.room.message','m.room.encrypted'].includes(e.getType())&&e.getContent()['m.relates_to']?.rel_type!=='m.replace');}
  members(room){return room.getMembers().filter(m=>['join','invite'].includes(m.membership));}
  isDirect(room){return Object.values(this.client.getAccountData('m.direct')?.getContent()||{}).some(ids=>ids.includes(room.roomId));}
  title(room){if(!room)return '';if(this.isDirect(room)){const other=this.members(room).find(m=>m.userId!==this.session.userId);return displayName(other?.name,other?.userId)||room.name;}return displayName(room.name,room.name);}
  presenceInfo(id){const user=this.client.getUser(id),cached=this.presenceCache.get(id);if(cached&&(!user?.lastPresenceTs||cached.checkedAt>user.lastPresenceTs))return cached;return {known:!!user?.events?.presence,state:user?.presence||'offline',lastActiveTs:user?.getLastActiveTs?.()};}
  async refreshPresence(id){try{const data=await this.client.getPresence(id);this.presenceCache.set(id,{known:true,state:data.presence,lastActiveTs:Number.isFinite(data.last_active_ago)?Date.now()-data.last_active_ago:null,checkedAt:Date.now()});this.emit();}catch{/* Unknown/private presence stays unknown. */}}
  async publishPresence(state){if(!this.ready||this.stopped)return;this.presenceState=state;await this.client.setSyncPresence(state);clearTimeout(this.presenceTimer);try{await this.client.setPresence({presence:state});}catch(e){if(e.httpStatus!==429)throw e;this.presenceTimer=setTimeout(()=>{if(this.presenceState===state)this.publishPresence(state).catch(()=>{});},Math.max(1000,e.data?.retry_after_ms||10000));}}
  async adminRequest(path,{method='GET',body}={}){const response=await fetch(this.session.baseUrl+path,{method,headers:{Authorization:`Bearer ${this.session.accessToken}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(data.error||'Server administration is unavailable. Install the latest server update first.');error.httpStatus=response.status;throw error;}return data;}
  async checkAdmin(){try{const data=await this.adminRequest('/hasbreo/files/admin/status');this.isAdmin=!!data.admin;}catch{this.isAdmin=false;}this.emit();return this.isAdmin;}
  async adminOverview(){return this.adminRequest('/hasbreo/files/admin/overview');}
  async createInvite(uses,days){return this.adminRequest('/hasbreo/files/admin/invite',{method:'POST',body:{uses,days}});}
  async setQuota(userId,bytes){return this.adminRequest('/hasbreo/files/admin/quota',{method:'POST',body:{userId,bytes}});}
  async storageUsage(){return fileRequest(this.session,'/usage');}
  async storedFiles(){return fileRequest(this.session,'/list');}
  async deleteFile(id){return fileRequest(this.session,'/'+id,{method:'DELETE'});}
  async searchPeople(query){
    if(!query.trim())return [];
    const result=await this.client.searchUserDirectory({term:query.trim(),limit:20});
    let users=result.results.filter(u=>u.user_id.endsWith(`:${this.domain}`)&&u.user_id!==this.session.userId);
    if(!users.length){try{const id=userId(query,this.domain);if(id!==this.session.userId){const p=await this.client.getProfileInfo(id);users=[{user_id:id,...p}];}}catch{}}
    return users;
  }
  async createChat(ids,name='') {
    const members=[...new Set(ids.map(id=>userId(id,this.domain)))].filter(id=>id!==this.session.userId);
    if(!members.length)throw new Error('Choose at least one other person.');
    const direct=members.length===1&&!name;
    if(direct){const found=this.rooms().find(r=>this.isDirect(r)&&this.members(r).some(m=>m.userId===members[0])&&r.getMyMembership()==='join');if(found)return found.roomId;}
    const {room_id}=await this.client.createRoom({visibility:'private',preset:'private_chat',is_direct:direct,invite:members,...(name?{name:name.trim()}:{}),initial_state:encryptedState});
    if(direct){const current=this.client.getAccountData('m.direct')?.getContent()||{};await this.client.setAccountData('m.direct',{...current,[members[0]]:[...(current[members[0]]||[]),room_id]});}
    this.emit();return room_id;
  }
  async join(room){await this.client.joinRoom(room.roomId);const inviter=room.getDMInviter?.();if(inviter){const current=this.client.getAccountData('m.direct')?.getContent()||{};await this.client.setAccountData('m.direct',{...current,[inviter]:[...new Set([...(current[inviter]||[]),room.roomId])]});}this.emit();}
  async send(roomId,body,reply,edit){
    const content={msgtype:'m.text',body:body.trim()};
    if(!content.body||content.body.length>16000)throw new Error('Write a message of 1–16,000 characters.');
    if(reply)content['m.relates_to']={'m.in_reply_to':{event_id:reply.getId()}};
    if(edit){content['m.new_content']={...content};content.body=`* ${content.body}`;content['m.relates_to']={rel_type:'m.replace',event_id:edit.getId()};}
    await this.client.sendMessage(roomId,content);if(isNative())nativeRequest('haptic').catch(()=>{});
  }
  async attachment(roomId,file,options={}){
    if(!this.client.isRoomEncrypted(roomId))throw new Error('Create an encrypted conversation to share files.');
    const manifest=await uploadFile(this.session,file,typeof options==='object'?options:{});
    const image=['image/jpeg','image/png','image/gif','image/webp'].includes(file.type);
    const content={msgtype:image?'m.image':file.type.startsWith('audio/')?'m.audio':file.type.startsWith('video/')?'m.video':'m.file',body:file.name,info:{mimetype:file.type||'application/octet-stream',size:file.size},[FILE_KEY]:manifest};
    try{await this.client.sendMessage(roomId,content);}catch(e){/* Retain the completed file: a failed response can still mean the event was accepted. */throw e;}
    return manifest;
  }
  isFavourite(id){return (this.client.getAccountData('com.hasbreo.message.favourites')?.getContent().rooms||[]).includes(id);}
  async toggleFavourite(id){const rooms=this.client.getAccountData('com.hasbreo.message.favourites')?.getContent().rooms||[];await this.client.setAccountData('com.hasbreo.message.favourites',{rooms:rooms.includes(id)?rooms.filter(r=>r!==id):[...rooms,id]});this.emit();}
  async download(content){if(isNative()&&content[FILE_KEY]){await nativeRequest('download',{manifest:content[FILE_KEY],name:content.body,mime:content.info?.mimetype,session:this.session});return;}if(content[FILE_KEY])return downloadFile(this.session,content);const url=await this.media(content);if(isNative()){await saveNativeBlob(await(await fetch(url)).blob(),content.body||'attachment');return;}const a=document.createElement('a');a.href=url;a.download=content.body||'attachment';a.click();}
  async media(content){
    const manifest=content[FILE_KEY],mxc=manifest?.id||content.file?.url||content.url;if(!mxc)return null;
    if(this.urls.has(mxc))return this.urls.get(mxc);
    if(this.mediaPending.has(mxc))return this.mediaPending.get(mxc);
    const generation=this.generation;
    const task=(async()=>{
      if(manifest){const blob=await fileBlob(this.session,manifest,content.info?.mimetype||'application/octet-stream');if(generation!==this.generation)throw new Error('Session closed.');const url=URL.createObjectURL(blob);this.urls.set(mxc,url);return url;}
      const url=this.client.mxcUrlToHttp(mxc,undefined,undefined,undefined,false,false,true);
      if(!url)throw new Error('Invalid attachment address.');
      const response=await fetch(url,{headers:{Authorization:`Bearer ${this.session.accessToken}`},credentials:'omit',redirect:'error'});
      if(!response.ok)throw new Error('Could not download this attachment.');
      const data=content.file?await decryptAttachment(await response.arrayBuffer(),content.file):await response.arrayBuffer();
      if(generation!==this.generation)throw new Error('Session closed.');
      const type=content.info?.mimetype||'application/octet-stream';
      const objectUrl=URL.createObjectURL(new Blob([data],{type}));this.urls.set(mxc,objectUrl);return objectUrl;
    })();
    this.mediaPending.set(mxc,task);try{return await task;}finally{this.mediaPending.delete(mxc);}
  }
  async reaction(roomId,event,key){await this.client.sendEvent(roomId,'m.reaction',{'m.relates_to':{rel_type:'m.annotation',event_id:event.getId(),key}});}
  async remove(roomId,event){await this.client.redactEvent(roomId,event.getId());}
  async typing(roomId,typing){await this.client.sendTyping(roomId,typing,10000);}
  async read(room){const e=this.latest(room);if(e&&e.getSender()!==this.session.userId&&this.readMarks.get(room.roomId)!==e.getId()){this.readMarks.set(room.roomId,e.getId());try{await this.client.sendReadReceipt(e);}catch(error){this.readMarks.delete(room.roomId);throw error;}}}
  async older(room){return this.client.scrollback(room,40);}
  async ignore(id){await this.client.setIgnoredUsers([...new Set([...this.client.getIgnoredUsers(),id])]);this.emit();}
  async unignore(id){await this.client.setIgnoredUsers(this.client.getIgnoredUsers().filter(u=>u!==id));this.emit();}
  async muted(room){return this.client.getRoomPushRule('global',room.roomId)?.actions?.includes('dont_notify')||false;}
  async mute(room,enabled){await this.client.setRoomMutePushRule('global',room.roomId,enabled);this.emit();}
  async exportKeys(password){return encryptBackup(await this.client.getCrypto().exportRoomKeys(),password,this.session.userId);}
  async importKeys(text,password){await this.client.getCrypto().importRoomKeys(await decryptBackup(text,password,this.session.userId));for(const r of this.rooms())for(const e of r.getLiveTimeline().getEvents())if(e.isDecryptionFailure?.())this.client.decryptEventIfNeeded(e).catch(()=>{});this.emit();}
  stop(){clearTimeout(this.timer);clearTimeout(this.presenceTimer);this.stopped=true;this.generation++;this.recovery?.stop();this.client?.stopClient();this.client?.removeAllListeners();this.releaseLock?.();this.releaseLock=null;for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();}
  async logout(){await this.recovery?.ensureUploaded();await this.client?.logout();this.stop();localStorage.removeItem(SESSION_KEY);}
}
export { sdk, messageText };
