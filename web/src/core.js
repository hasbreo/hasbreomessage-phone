export function serverUrl(input) {
  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Use an HTTPS server address.');
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('Enter the server address only, such as message.hasbreo.com.');
  return url.origin;
}
export const userHandle=id=>id?'@'+String(id).replace(/^@/,'').split(':')[0]:'';
export const displayName=(name,id)=>name&&!(name.startsWith('@')&&name.includes(':'))?name:userHandle(id||name);
export function presenceLabel(info,now=Date.now()){
  if(!info||!info.known)return 'Last seen unavailable';
  if(info.state==='online')return 'Online now';
  const elapsed=Number.isFinite(info.lastActiveTs)?Math.max(0,now-info.lastActiveTs):null;
  const ago=elapsed===null?'':elapsed<60000?'just now':elapsed<3600000?`${Math.floor(elapsed/60000)}m ago`:elapsed<86400000?`${Math.floor(elapsed/3600000)}h ago`:`${Math.floor(elapsed/86400000)}d ago`;
  if(info.state==='unavailable')return ago?`Away · active ${ago}`:'Away';
  return ago?`Last seen ${ago}`:'Offline';
}
export function userId(input, domain) {
  const value = input.trim();
  if (/^@[a-z0-9._=\-/]+:[a-z0-9.-]+(?::\d+)?$/i.test(value)) {
    if (value.slice(value.indexOf(':') + 1) !== domain) throw new Error('Choose someone on this server.');
    return value;
  }
  const local = value.replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._=-]{1,64}$/.test(local)) throw new Error('Use a username with letters, numbers, dots, dashes or underscores.');
  return `@${local}:${domain}`;
}
export function describeError(error) {
  const code = error?.errcode;
  if (code === 'M_FORBIDDEN') return 'That did not work. Check your password, invite code, or permission for this action.';
  if (code === 'M_USER_IN_USE') return 'That username is taken. Try another one.';
  if (code === 'M_UNKNOWN_TOKEN' || code === 'M_MISSING_TOKEN') return 'Your session has expired. Sign out and log in again.';
  if (code === 'M_LIMIT_EXCEEDED') return 'A few too many requests. Please wait a moment and try again.';
  if (code === 'M_USER_DEACTIVATED') return 'This account has been deactivated.';
  if (code === 'M_WEAK_PASSWORD') return 'Choose a stronger password.';
  if (code === 'M_NOT_FOUND') return 'That person or conversation could not be found.';
  if (error?.name === 'ConnectionError' || /fetch|network|ECONNREFUSED/i.test(error?.message || '')) return 'Cannot reach the messaging server. Check the address and connection. The server may not be installed yet.';
  return error?.message || 'Something went wrong. Please try again.';
}
export function messageText(event) {
  if (!event) return 'Say hello';
  if (event.isRedacted?.()) return 'Message removed';
  if (event.isDecryptionFailure?.()) return 'Encrypted message · syncing history';
  const c = event.getContent();
  if (c.msgtype === 'm.audio') return 'Voice message';
  if (c.msgtype === 'm.video') return 'Video';
  if (c.msgtype === 'm.image') return 'Photo';
  if (c.msgtype === 'm.file') return `File · ${c.body || 'Attachment'}`;
  if (event.getType() === 'm.room.encrypted') return 'Encrypted message';
  return (c.body || '').replace(/^>[^\n]*\n(?:>[^\n]*\n)*\n/, '');
}
export function visibleMessages(events) {
  const edits = new Map();
  for (const e of events) {
    const c = e.getContent();
    if (c['m.relates_to']?.rel_type === 'm.replace') {
      const target = events.find(t => t.getId() === c['m.relates_to'].event_id);
      if (target && target.getSender() === e.getSender() && !e.isRedacted?.()) edits.set(target.getId(), c['m.new_content']);
    }
  }
  return events.filter(e => ['m.room.message', 'm.room.encrypted'].includes(e.getType()) && e.getContent()['m.relates_to']?.rel_type !== 'm.replace').map(e => ({event:e,content:edits.get(e.getId()) || e.getContent(),edited:edits.has(e.getId())}));
}
const b64 = bytes => {const data=new Uint8Array(bytes);let text='';for(let i=0;i<data.length;i+=16384)text+=String.fromCharCode(...data.subarray(i,i+16384));return btoa(text);};
const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
async function backupKey(password, salt, usage) {
  const material = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,usage);
}
export async function encryptBackup(keys, password, account) {
  if (password.length < 12) throw new Error('Use a backup passphrase of at least 12 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await backupKey(password,salt,['encrypt']);
  const data = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify({account,keys})));
  return JSON.stringify({format:'hasbreo-room-keys-v1',salt:b64(salt),iv:b64(iv),data:b64(data)});
}
export async function decryptBackup(text, password, account) {
  let bundle; try { bundle=JSON.parse(text); } catch { throw new Error('This is not a Hasbreo Chat key backup.'); }
  if (bundle.format !== 'hasbreo-room-keys-v1') throw new Error('This is not a Hasbreo Chat key backup.');
  if (typeof bundle.data !== 'string' || bundle.data.length > 28000000 || typeof bundle.salt !== 'string' || typeof bundle.iv !== 'string') throw new Error('Invalid backup file.');
  let value;
  try {
    const salt=unb64(bundle.salt),iv=unb64(bundle.iv);
    if (salt.length!==16 || iv.length!==12) throw new Error();
    const key=await backupKey(password,salt,['decrypt']);
    value=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,unb64(bundle.data))));
  } catch { throw new Error('Cannot unlock this backup. Check the passphrase and file.'); }
  if (value.account!==account) throw new Error('This backup belongs to a different account.');
  if (!Array.isArray(value.keys)) throw new Error('Invalid backup contents.');
  return value.keys;
}
