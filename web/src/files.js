import {workerRegistration} from './notifications.js';
export const FILE_KEY='com.hasbreo.file';
export const MEMORY_LIMIT=128*1024*1024;
const base64=bytes=>btoa(String.fromCharCode(...bytes));
export const unbase64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
export function validateManifest(m){
  if(!m||m.v!==1||!/[a-f0-9]{32}/.test(m.id)||m.id.length!==32||!Number.isSafeInteger(m.size)||m.size<1||m.size>25e9||m.chunkSize!==8*1024*1024||m.chunks!==Math.ceil(m.size/m.chunkSize)||unbase64(m.key).length!==32||unbase64(m.noncePrefix).length!==8)throw new Error('This attachment has invalid encryption details.');
  return m;
}
export function chunkParameters(m,index){
  const iv=new Uint8Array(12);iv.set(unbase64(m.noncePrefix));new DataView(iv.buffer).setUint32(8,index);
  return {name:'AES-GCM',iv,additionalData:new TextEncoder().encode(`${m.id}:${index}:${m.size}`)};
}
export async function fileRequest(session,path,{body,method='GET',signal,binary=false}={}){
  const response=await fetch(session.baseUrl+'/hasbreo/files'+path,{method,headers:{Authorization:`Bearer ${session.accessToken}`,...(body!==undefined&&!binary?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:binary?body:JSON.stringify(body)}:{}),signal,credentials:'omit',redirect:'error'});
  if(!response.ok){const data=await response.json().catch(()=>({}));const error=new Error(data.error||'File storage is unavailable. Update the server and try again.');error.httpStatus=response.status;throw error;}
  return binary&&method==='GET'?response.arrayBuffer():response.json();
}
export async function uploadFile(session,file,{signal,onProgress=()=>{}}={}){
  const reservation=await fileRequest(session,'/init',{method:'POST',body:{size:file.size},signal});
  const raw=crypto.getRandomValues(new Uint8Array(32));const m={v:1,...reservation,size:file.size,key:base64(raw),noncePrefix:base64(crypto.getRandomValues(new Uint8Array(8)))};
  const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
  try{
    for(let i=0;i<m.chunks;i++){
      signal?.throwIfAborted();const start=i*m.chunkSize,end=Math.min(file.size,start+m.chunkSize);
      const encrypted=await crypto.subtle.encrypt(chunkParameters(m,i),key,await file.slice(start,end).arrayBuffer());
      let lastError;for(let attempt=0;attempt<3;attempt++){try{await fileRequest(session,`/${m.id}/chunks/${i}`,{method:'PUT',body:encrypted,binary:true,signal});lastError=null;break;}catch(e){lastError=e;signal?.throwIfAborted();}}
      if(lastError)throw lastError;onProgress({loaded:end,total:file.size,name:file.name});
    }
    await fileRequest(session,`/${m.id}/complete`,{method:'POST',body:{},signal});return m;
  }catch(error){await fileRequest(session,`/${m.id}`,{method:'DELETE'}).catch(()=>{});throw error;}
}
export async function* decryptedChunks(session,manifest){
  const m=validateManifest(manifest),key=await crypto.subtle.importKey('raw',unbase64(m.key),'AES-GCM',false,['decrypt']);
  for(let i=0;i<m.chunks;i++){
    const data=await fileRequest(session,`/${m.id}/chunks/${i}`,{binary:true});
    const expected=Math.min(m.chunkSize,m.size-i*m.chunkSize)+16;
    if(data.byteLength!==expected)throw new Error('The attachment is incomplete.');
    yield new Uint8Array(await crypto.subtle.decrypt(chunkParameters(m,i),key,data));
  }
}
export async function fileBlob(session,manifest,type){
  if(manifest.size>MEMORY_LIMIT)throw new Error('Use Download to save this large file.');
  const parts=[];for await(const part of decryptedChunks(session,manifest))parts.push(part);return new Blob(parts,{type});
}
export async function downloadFile(session,content){
  const m=validateManifest(content[FILE_KEY]);
  // The file picker writes bounded chunks directly to disk without holding the
  // whole file in memory. Other browsers use a service-worker download stream.
  if('showSaveFilePicker'in window){
    const handle=await window.showSaveFilePicker({suggestedName:content.body||'attachment'}),destination=await handle.createWritable();
    try{for await(const chunk of decryptedChunks(session,m))await destination.write(chunk);await destination.close();}catch(e){await destination.abort().catch(()=>{});throw e;}return;
  }
  const registration=await workerRegistration();
  if(registration?.active){
    const id=crypto.randomUUID(),channel=new MessageChannel();
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Download setup timed out. Try again.')),5000);channel.port1.onmessage=()=>{clearTimeout(timer);channel.port1.close();resolve();};registration.active.postMessage({type:'HASBREO_DOWNLOAD',id,session:{baseUrl:session.baseUrl,accessToken:session.accessToken},manifest:m,name:content.body},[channel.port2]);});
    const a=document.createElement('a');a.href='/__hasbreo_download/'+id;a.download=content.body||'attachment';document.body.append(a);a.click();a.remove();return;
  }
  const blob=await fileBlob(session,m,'application/octet-stream'),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=content.body||'attachment';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
