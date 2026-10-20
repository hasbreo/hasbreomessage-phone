import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {SoundMixer,CallManager} from '../src/calls.js';
import {callHistory} from '../src/call-history.js';
import {visibleMessages} from '../src/core.js';
import {Messenger} from '../src/matrix.js';
const event=(type,ts,content,sender='alice')=>({getType:()=>type,getTs:()=>ts,getContent:()=>content,getId:()=>type+ts,getSender:()=>sender,isRedacted:()=>false});
test('camera reuses the same MediaStream object but changes microphone: mixer reconnects the new live track',async()=>{
 const oldStream=globalThis.MediaStream;globalThis.MediaStream=class{constructor(tracks){this.tracks=tracks}getAudioTracks(){return this.tracks}};
 try{
 const a={kind:'audio',readyState:'live'},b={kind:'audio',readyState:'live'},mixed={kind:'audio',enabled:true};let microphone=a;const inputs=[];let disconnected=0;
 const sender={track:a,async replaceTrack(t){this.track=t}};
 const m=new SoundMixer();m.ready=async()=>{};m.context={createMediaStreamSource(stream){inputs.push(stream.getAudioTracks()[0]);return {connect(){},disconnect(){disconnected++}}}};m.destination={stream:{getAudioTracks:()=>[mixed]}};
 const call={localUsermediaStream:{getAudioTracks:()=>[microphone]},peerConn:{getSenders:()=>[sender]},isMicrophoneMuted:()=>false};
 await m.bind(call);assert.equal(sender.track,mixed);a.readyState='ended';microphone=b;sender.track=b;await m.bind(call);assert.deepEqual(inputs,[a,b]);assert.equal(disconnected,1);assert.equal(sender.track,mixed);
 await m.bind(call);assert.equal(inputs.length,2);call.isMicrophoneMuted=()=>true;await m.bind(call);assert.equal(mixed.enabled,false);
 }finally{globalThis.MediaStream=oldStream}
});
test('historic call signalling becomes one readable call entry and a saved summary replaces it',()=>{
 const events=[event('m.call.invite',1000,{call_id:'c',offer:{sdp:'m=video'},lifetime:60000}),event('m.call.answer',5000,{call_id:'c'},'bob'),event('m.call.hangup',70000,{call_id:'c',reason:'user_hangup'})];
 let result=visibleMessages(events);assert.equal(result.length,1);assert.match(result[0].content.body,/Video call · 1:05/);
 const summary=event('m.room.message',71000,{msgtype:'m.notice',body:'Video call · 1:05','com.hasbreo.call':{id:'c'}});result=visibleMessages([...events,summary]);assert.equal(result.length,1);assert.equal(result[0].event,summary);
 assert.match(callHistory([event('m.call.invite',1000,{call_id:'x',lifetime:60000})],70000)[0].getContent().body,/Not answered/);
 assert.equal(callHistory([event('m.call.invite',1000,{call_id:'x',lifetime:60000})],2000).length,0);
});
test('completed and failed calls produce one encrypted message with connection duration, independent of ringing time',async()=>{
 const client=new EventEmitter(),sent=[];client.sendEvent=async(...args)=>sent.push(args);const service={client,emit(){},session:{userId:'alice'}};const manager=new CallManager(service);
 const call={callId:'call-id',roomId:'room',type:'video',hangupReason:'user_hangup'};manager.inbound=false;manager.started=10000;manager.endedAt=75000;await manager.recordCall(call);assert.equal(sent[0][2]['com.hasbreo.call'].duration,65);assert.equal(sent[0][1],'m.room.message');assert.equal(sent[0][3],'hasbreo-call-end-call-id');
 manager.started=0;manager.error='ICE failed';await manager.recordCall(call);assert.equal(sent[1][2]['com.hasbreo.call'].status,'failed');assert.equal(sent[1][2]['com.hasbreo.call'].duration,0);
 manager.inbound=true;await manager.recordCall(call);assert.equal(sent.length,2);await manager.destroy();
});
test('opening a signal-heavy timeline automatically loads earlier real messages',async()=>{
 const messenger=new Messenger(()=>{});let page=0;const events=[event('m.call.negotiate',1,{call_id:'x'})];const room={roomId:'r',oldState:{paginationToken:'a'},getLiveTimeline:()=>({getEvents:()=>events})};
 messenger.client={decryptEventIfNeeded:async()=>{},scrollback:async()=>{page++;for(let i=0;i<10;i++)events.push(event('m.room.message',page*100+i,{body:'history',msgtype:'m.text'}));room.oldState.paginationToken=String(page)}};
 await Promise.all([messenger.ensureRecentHistory(room),messenger.ensureRecentHistory(room)]);assert.equal(page,3);clearTimeout(messenger.timer);
});
