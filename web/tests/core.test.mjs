import test from 'node:test';
import assert from 'node:assert/strict';
import {serverUrl,userId,visibleMessages,encryptBackup,decryptBackup} from '../src/core.js';
import {demoEvent} from '../src/demo.js';

test('server address validation permits HTTPS and loopback development only',()=>{
  assert.equal(serverUrl(' message.hasbreo.com '),'https://message.hasbreo.com');
  assert.equal(serverUrl('http://localhost:18008'),'http://localhost:18008');
  for(const input of ['http://other.example','javascript:alert(1)','https://user:pass@example.com','https://example.com/path','https://example.com?token=x'])assert.throws(()=>serverUrl(input));
});
test('usernames are normalised and limited to the local server',()=>{
  assert.equal(userId('Thomas','message.hasbreo.com'),'@thomas:message.hasbreo.com');
  assert.equal(userId('@will:message.hasbreo.com','message.hasbreo.com'),'@will:message.hasbreo.com');
  assert.throws(()=>userId('@will:elsewhere.com','message.hasbreo.com'));
  assert.throws(()=>userId('<script>','message.hasbreo.com'));
});
test('message edits cannot impersonate the original sender',()=>{
  const original=demoEvent('original','@alice:test');
  const edit=demoEvent('* edited','@alice:test',Date.now(),{'m.relates_to':{rel_type:'m.replace',event_id:original.getId()},'m.new_content':{body:'edited',msgtype:'m.text'}});
  const forged=demoEvent('* forged','@bob:test',Date.now(),{'m.relates_to':{rel_type:'m.replace',event_id:original.getId()},'m.new_content':{body:'forged',msgtype:'m.text'}});
  const result=visibleMessages([original,edit,forged]);assert.equal(result.length,1);assert.equal(result[0].content.body,'edited');
});
test('key backups are encrypted, authenticated and tied to their account',async()=>{
  const keys=[{session_key:'private-message-key',room_id:'!room:test'}],password='a long backup passphrase';
  const value=await encryptBackup(keys,password,'@alice:test');
  assert.ok(!value.includes('private-message-key'));assert.deepEqual(await decryptBackup(value,password,'@alice:test'),keys);
  await assert.rejects(()=>decryptBackup(value,'wrong passphrase','@alice:test'));
  await assert.rejects(()=>decryptBackup(value,password,'@bob:test'));
  const tampered=JSON.parse(value);tampered.data=tampered.data.replace(/^./,tampered.data[0]==='A'?'B':'A');
  await assert.rejects(()=>decryptBackup(JSON.stringify(tampered),password,'@alice:test'));
  await assert.rejects(()=>encryptBackup(keys,'short','@alice:test'));
});
test('key exports handle larger histories without overflowing the call stack',async()=>{
  const keys=[{session_key:'x'.repeat(500000)}];const p='a long backup passphrase';
  const value=await encryptBackup(keys,p,'@alice:test');assert.deepEqual(await decryptBackup(value,p,'@alice:test'),keys);
});
