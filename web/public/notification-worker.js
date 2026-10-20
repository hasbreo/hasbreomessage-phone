// Notification display/click handling only. No application cache or background
// message polling: new notifications still require a running client tab.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const roomId=event.notification.data?.roomId;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if(new URL(client.url).origin!==self.location.origin)continue;
      client.postMessage({type:'HASBREO_OPEN_CHAT',roomId});await client.focus();return;
    }
    await self.clients.openWindow(roomId?'/?chat='+encodeURIComponent(roomId):'/');
  })());
});

// Ephemeral, authenticated download streams. File keys and bearer tokens travel
// only via a message port; they never enter download URLs or persistent storage.
const downloads=new Map();
self.addEventListener('message',event=>{
  const data=event.data;
  if(data?.type!=='HASBREO_DOWNLOAD'||!event.source||new URL(event.source.url).origin!==self.location.origin)return;
  const {id,manifest:m,session,name}=data;
  if(!/^[a-f0-9-]{36}$/.test(id)||!m||!/^https?:\/\//.test(session?.baseUrl))return;
  const entry={m,session,name,expires:Date.now()+60000};downloads.set(id,entry);
  setTimeout(()=>downloads.delete(id),60000);event.ports[0]?.postMessage({ready:true});
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(url.origin!==self.location.origin||!url.pathname.startsWith('/__hasbreo_download/'))return;
  event.respondWith((async()=>{
    const id=url.pathname.split('/').pop(),task=downloads.get(id);downloads.delete(id);
    if(!task||task.expires<Date.now())return new Response('Download expired. Return to the chat and try again.',{status:410});
    const {m,session,name}=task,decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
    if(!/^[a-f0-9]{32}$/.test(m.id)||m.v!==1||m.chunkSize!==8388608||!Number.isSafeInteger(m.size)||m.size<1||m.size>25e9||m.chunks!==Math.ceil(m.size/m.chunkSize)||decode(m.key).length!==32||decode(m.noncePrefix).length!==8)return new Response('Invalid attachment.',{status:400});
    const key=await crypto.subtle.importKey('raw',decode(m.key),'AES-GCM',false,['decrypt']);let index=0,controller=new AbortController();
    const stream=new ReadableStream({async pull(destination){try{
      if(index===m.chunks){destination.close();return;}
      const response=await fetch(session.baseUrl+`/hasbreo/files/${m.id}/chunks/${index}`,{headers:{Authorization:'Bearer '+session.accessToken},signal:controller.signal,credentials:'omit',redirect:'error'});
      if(!response.ok)throw new Error('Attachment download failed.');const data=await response.arrayBuffer();
      if(data.byteLength!==Math.min(m.chunkSize,m.size-index*m.chunkSize)+16)throw new Error('Incomplete attachment.');
      const iv=new Uint8Array(12);iv.set(decode(m.noncePrefix));new DataView(iv.buffer).setUint32(8,index);
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(`${m.id}:${index}:${m.size}`)},key,data);index++;destination.enqueue(new Uint8Array(plain));
    }catch(e){destination.error(e);}},cancel(){controller.abort();}});
    const safeName=(name||'attachment').replace(/[\r\n\x00-\x1f]/g,'').slice(0,200);
    return new Response(stream,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(m.size),'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(safeName),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  })());
});

// A running tab owns in-app sounds and visual attention. System notifications
// are reserved for when no Message window exists in this browser profile.
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let payload;try{payload=event.data.json()}catch{return}
  if(typeof payload.roomId!=='string'||typeof payload.account!=='string')return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  if(windows.some(client=>new URL(client.url).origin===self.location.origin))return;
  await self.registration.showNotification('Hasbreo Message',{body:'New encrypted activity. Open Message to read or answer.',icon:'/icon.svg',badge:'/icon.svg',tag:'hasbreo-background:'+payload.account+':'+payload.roomId,renotify:false,data:{roomId:payload.roomId}});
 })());
});
