import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {chunkParameters} from '../src/files.js';

test('download worker streams authenticated ciphertext into an exact attachment',async()=>{
  const events={},timers=[],raw=crypto.getRandomValues(new Uint8Array(32));
  const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
  const plain=crypto.getRandomValues(new Uint8Array(100)),m={v:1,id:'a'.repeat(32),size:plain.length,chunkSize:8388608,chunks:1,key:Buffer.from(raw).toString('base64'),noncePrefix:Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString('base64')};
  const ciphertext=await crypto.subtle.encrypt(chunkParameters(m,0),key,plain);
  let count=0;const self={addEventListener:(name,fn)=>events[name]=fn,location:{origin:'https://chat.test'},skipWaiting(){},clients:{claim(){}}};
  const context={self,URL,crypto,Uint8Array,DataView,TextEncoder,ReadableStream,Response,AbortController,atob,setTimeout:fn=>{timers.push(fn);},fetch:async(url,options)=>{count++;assert.equal(url,`https://server.test/hasbreo/files/${m.id}/chunks/0`);assert.equal(options.headers.Authorization,'Bearer secret-token');return new Response(ciphertext);}};
  vm.runInNewContext(await readFile('public/notification-worker.js','utf8'),context);
  const id=crypto.randomUUID();let ready=false;
  events.message({source:{url:'https://chat.test/'},data:{type:'HASBREO_DOWNLOAD',id,manifest:m,session:{baseUrl:'https://server.test',accessToken:'secret-token'},name:'private file.bin'},ports:[{postMessage:()=>ready=true}]});assert.ok(ready);
  let response;events.fetch({request:new Request('https://chat.test/__hasbreo_download/'+id),respondWith:p=>response=p});
  const output=await response;assert.equal(output.headers.get('Content-Length'),'100');assert.match(output.headers.get('Content-Disposition'),/attachment;/);assert.equal(output.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(new Uint8Array(await output.arrayBuffer()),plain);assert.equal(count,1);
  events.fetch({request:new Request('https://chat.test/__hasbreo_download/'+id),respondWith:p=>response=p});assert.equal((await response).status,410);
});
