import test from 'node:test';
import assert from 'node:assert/strict';
import {userHandle,displayName,presenceLabel} from '../src/core.js';
import {shouldNotify} from '../src/notifications.js';
import {chunkParameters,validateManifest} from '../src/files.js';

test('short handles preserve the chosen username',()=>{
  assert.equal(userHandle('@thomas:message.hasbreo.com'),'@thomas');
  assert.equal(userHandle('@test-thomas:message.hasbreo.com'),'@test-thomas');
  assert.equal(displayName('@thomas:message.hasbreo.com','@thomas:message.hasbreo.com'),'@thomas');
  assert.equal(displayName('Thomas','@thomas:message.hasbreo.com'),'Thomas');
});
test('visible, unfocused chat windows still notify immediately',()=>{
  assert.equal(shouldNotify({hidden:false,focused:false,activeRoomId:'a',roomId:'a'}),true);
  assert.equal(shouldNotify({hidden:false,focused:true,activeRoomId:'a',roomId:'a'}),false);
  assert.equal(shouldNotify({hidden:false,focused:true,activeRoomId:'a',roomId:'b'}),true);
  assert.equal(shouldNotify({hidden:true,focused:false,activeRoomId:'a',roomId:'a'}),true);
});
test('presence distinguishes unknown, online, away and last seen',()=>{
  assert.equal(presenceLabel({known:false}),'Last seen unavailable');
  assert.equal(presenceLabel({known:true,state:'online'}),'Online now');
  assert.match(presenceLabel({known:true,state:'offline',lastActiveTs:1000},121000),/2m/);
  assert.match(presenceLabel({known:true,state:'unavailable',lastActiveTs:1000},121000),/Away/);
});
test('chunk encryption authenticates file identity, position and total length',async()=>{
  const raw=crypto.getRandomValues(new Uint8Array(32)),key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  const m={v:1,id:'a'.repeat(32),size:8388610,chunkSize:8388608,chunks:2,key:Buffer.from(raw).toString('base64'),noncePrefix:Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString('base64')};
  validateManifest(m);const plain=new TextEncoder().encode('private attachment bytes');
  const data=await crypto.subtle.encrypt(chunkParameters(m,0),key,plain);
  assert.deepEqual(new Uint8Array(await crypto.subtle.decrypt(chunkParameters(m,0),key,data)),plain);
  await assert.rejects(()=>crypto.subtle.decrypt(chunkParameters(m,1),key,data));
  await assert.rejects(()=>crypto.subtle.decrypt(chunkParameters({...m,id:'b'.repeat(32)},0),key,data));
  await assert.rejects(()=>crypto.subtle.decrypt(chunkParameters({...m,size:m.size-1},0),key,data));
  const bad=new Uint8Array(data);bad[0]^=1;await assert.rejects(()=>crypto.subtle.decrypt(chunkParameters(m,0),key,bad));
  assert.throws(()=>validateManifest({...m,chunks:3}));
});
test('dark text and secondary text have at least 4.5 contrast',()=>{
  const luminance=hex=>{const values=hex.match(/\w\w/g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
  for(const [text,bg] of [['f4f6f8','343b42'],['c0c8cf','343b42'],['f4f6f8','485f54'],['c0c8cf','414950'],['c2d8cb','343b42']])assert.ok((Math.max(luminance(text),luminance(bg))+.05)/(Math.min(luminance(text),luminance(bg))+.05)>=4.5,`${text} on ${bg}`);
});
