import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
const host=new EventTarget(),calls=[];
globalThis.window=host;
globalThis.document={documentElement:{classList:{add(){}}},addEventListener(){}};
globalThis.HasbreoNative={postMessage(raw){const request=JSON.parse(raw);calls.push(request);queueMicrotask(()=>HasbreoNative.onmessage({data:JSON.stringify({id:request.id,data:{ok:true}})}));}};
const {installNativeMessenger,nativeRequest,saveNativeBlob}=await import('../src/native.js');
test('native RPC resolves only its matching response',async()=>{assert.deepEqual(await nativeRequest('test'),{ok:true});});
test('watch routes are scoped to joined rooms and use idempotent transactions',async()=>{
 const client=new EventEmitter();let sends=[];client.getIgnoredUsers=()=>[];client.sendMessage=async(...args)=>{sends.push(args);};
 const room={roomId:'!room:example',getMyMembership:()=> 'join',getLiveTimeline:()=>({getEvents:()=>[]})};
 client.isRoomEncrypted=()=>true;client.getRoom=id=>id===room.roomId?room:null;
 const service={session:{userId:'@alice:example',baseUrl:'https://example',deviceId:'d'},client,rooms:()=>[room],muted:async()=>false,title:()=> 'My friend',status:'Connected'};
 const cleanup=await installNativeMessenger(service);
 const event=new Event('hasbreo:request');event.detail={requestId:'stable-reply-id',action:'send',roomId:room.roomId,text:'A little hello'};host.dispatchEvent(event);await new Promise(r=>setTimeout(r,10));
 assert.equal(sends.length,1);assert.equal(sends[0][2],'hasbreo-stable-reply-id');
 const rejected=new Event('hasbreo:request');rejected.detail={requestId:'bad-room',action:'send',roomId:'!other:example',text:'Must not send'};host.dispatchEvent(rejected);await new Promise(r=>setTimeout(r,10));
 assert.equal(sends.length,1);assert.ok(calls.some(c=>c.type==='watchResponse'&&c.data.requestId==='bad-room'&&c.data.error));cleanup();
});
test('legacy attachment export sends bounded native slices',async()=>{
 const old=HasbreoNative.postMessage;let bytes=0;
 HasbreoNative.postMessage=raw=>{const r=JSON.parse(raw);if(r.type==='saveDataChunk'){const chunk=Buffer.from(r.data.data,'base64');assert.ok(chunk.length<=32768);bytes+=chunk.length;}queueMicrotask(()=>HasbreoNative.onmessage({data:JSON.stringify({id:r.id,data:r.type==='saveDataStart'?{downloadId:'d'}:{ok:true}})}));};
 try{await saveNativeBlob(new Blob([new Uint8Array(100000)]),'saved.bin');assert.equal(bytes,100000);}finally{HasbreoNative.postMessage=old;}
});
test('native share files use range reads instead of whole-file buffering',async()=>{
 const {nativeSharedFile}=await import('../src/native.js');const original=globalThis.fetch;let fetched;
 globalThis.fetch=async url=>{fetched=url;return new Response(new Uint8Array(5));};
 try{const file=nativeSharedFile({size:20_000_000_000,name:'big.bin',mime:'application/octet-stream',url:'https://appassets.androidplatform.net/native/id'});assert.equal((await file.slice(8388608,8388613).arrayBuffer()).byteLength,5);assert.match(fetched,/start=8388608&end=8388613/);}finally{globalThis.fetch=original;}
});
