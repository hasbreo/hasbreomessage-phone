// A non-exportable key and encrypted account-scoped drafts remain in this browser.
let database;
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
async function db(){if(database)return database;if(!globalThis.indexedDB)throw Error('Local draft storage is unavailable.');const open=indexedDB.open('hasbreo-private-v1',1);open.onupgradeneeded=()=>open.result.createObjectStore('vault');database=await request(open);return database}
async function get(id){return request((await db()).transaction('vault').objectStore('vault').get(id))}
async function put(id,value){const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction('vault','readwrite');tx.objectStore('vault').put(value,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function key(owner){const id='key:'+owner;let k=await get(id);if(!k){k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await put(id,k)}return k}
export async function loadDrafts(owner){const saved=await get('drafts:'+owner);if(!saved)return {};const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:saved.iv,additionalData:new TextEncoder().encode(owner)},await key(owner),saved.data);return JSON.parse(new TextDecoder().decode(plain))}
export async function saveDrafts(owner,drafts){const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner)},await key(owner),new TextEncoder().encode(JSON.stringify(drafts)));await put('drafts:'+owner,{iv,data})}
