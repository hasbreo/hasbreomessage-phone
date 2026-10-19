import {deriveRecoveryKeyFromPassphrase,CryptoEvent} from 'matrix-js-sdk/lib/crypto-api/index.js';

export const RECOVERY_EVENT='com.hasbreo.chat.recovery';
const SECRET_NAMES=['m.cross_signing.master','m.cross_signing.self_signing','m.cross_signing.user_signing','m.megolm_backup.v1'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Use Matrix's standard secret storage and key backup. Passwords are held only
// during a login/unlock/change operation; neither passwords nor recovery keys
// are written to localStorage or sent to the homeserver as plaintext secrets.
export class PasswordRecovery {
  constructor(onChange=()=>{}) {
    this.onChange=onChange;
    this.state='checking';this.error='';this.cache=new Map();this.password=null;
    this.lastBackupAt=0;this.remaining=null;this.stopped=false;this.busy=false;
    this.callbacks={
      getSecretStorageKey:async({keys})=>this.findKey(keys),
      cacheSecretStorageKey:(id,info,key)=>this.cache.set(id,new Uint8Array(key)),
    };
  }
  attach(client) {
    this.client=client;
    client.on(CryptoEvent.KeyBackupSessionsRemaining,count=>{
      this.remaining=count;if(count===0){this.lastBackupAt=Date.now();if(this.error.startsWith('Encrypted history sync needs'))this.error='';}this.onChange();
    });
    client.on(CryptoEvent.KeyBackupFailed,()=>{this.error='Encrypted history sync needs to reconnect. Your local messages are still here.';this.onChange();});
  }
  update(state,error=''){this.state=state;this.error=error;this.onChange();}
  async derive(id,info,password) {
    const p=info?.passphrase;
    if(!p||p.algorithm!=='m.pbkdf2'||!Number.isInteger(p.iterations)||p.iterations<100000||p.iterations>5000000||typeof p.salt!=='string'||p.salt.length>512||p.bits&&p.bits!==256)return null;
    const key=await deriveRecoveryKeyFromPassphrase(password,p.salt,p.iterations,p.bits||256);
    if(!await this.client.secretStorage.checkKey(key,info))return null;
    this.cache.set(id,key);return [id,key];
  }
  async findKey(keys) {
    // Prefer the current default if possible, but allow a staged replacement
    // during password changes so either accepted password can recover safely.
    const defaultId=await this.client.secretStorage.getDefaultKeyId();
    const entries=Object.entries(keys).sort(([a],[b])=>a===defaultId?-1:b===defaultId?1:0);
    for(const [id,info] of entries){const key=this.cache.get(id);if(key&&await this.client.secretStorage.checkKey(key,info))return [id,key];}
    if(this.password!==null)for(const [id,info] of entries){const result=await this.derive(id,info,this.password);if(result)return result;}
    return null;
  }
  async uploadAuth(makeRequest,password) {
    const auth={type:'m.login.password',identifier:{type:'m.id.user',user:this.client.getUserId()},password};
    try{return await makeRequest(auth);}catch(error){if(error.httpStatus!==401||!error.data?.session)throw error;return makeRequest({...auth,session:error.data.session});}
  }
  async resume() {
    try{
      const metadata=this.client.getAccountData(RECOVERY_EVENT)?.getContent();
      const api=this.client.getCrypto();
      if(metadata?.pendingKeyId){this.update('needs-password');return;}
      const key=await api.getSessionBackupPrivateKey();
      if(metadata?.version===1&&key){await api.checkKeyBackupAndEnable();if(await api.getActiveSessionBackupVersion()){this.update('ready');return;}}
      this.update('needs-password');
    }catch{this.update('needs-password','Confirm your password to reconnect automatic history recovery.');}
  }
  async initialize(password) {
    if(this.busy)throw new Error('History recovery is already being updated. Please wait.');
    this.busy=true;this.password=password;this.update('setting-up');
    try {
      const storage=this.client.secretStorage,api=this.client.getCrypto();
      const metadata=(await this.client.getAccountDataFromServer(RECOVERY_EVENT))||{};
      let defaultId=await storage.getDefaultKeyId(),chosen=null;
      if(defaultId){
        for(const id of [...new Set([defaultId,metadata.pendingKeyId,metadata.activeKeyId].filter(Boolean))]){
          const info=await storage.getKey(id);if(info){const found=await this.derive(id,info[1],password);if(found){chosen=id;break;}}
        }
        if(!chosen)throw new Error('Your account logged in, but its encrypted history uses a different recovery password. Keep your original browser signed in and reconnect recovery there. Nothing has been reset.');
        // A previous password change may have reached the server but lost its
        // final response. A successful login with the new password can finish it.
        if(metadata.pendingKeyId===chosen){await storage.setDefaultKeyId(chosen);defaultId=chosen;}
      } else {
        await api.bootstrapSecretStorage({createSecretStorageKey:()=>api.createRecoveryKeyFromPassphrase(password)});
        defaultId=await storage.getDefaultKeyId();chosen=defaultId;
      }
      await api.bootstrapCrossSigning({authUploadDeviceSigningKeys:request=>this.uploadAuth(request,password)});
      await api.bootstrapSecretStorage({});
      let info=await api.getKeyBackupInfo();
      if(!info){await api.resetKeyBackup();info=await api.getKeyBackupInfo();}
      await api.loadSessionBackupPrivateKeyFromSecretStorage();
      await api.checkKeyBackupAndEnable();
      if(!await api.getActiveSessionBackupVersion())throw new Error('Automatic encrypted backup could not be enabled. Your existing keys have not been replaced.');
      this.update('restoring');
      await api.restoreKeyBackup();
      if(metadata.pendingKeyId)await this.finishRotation(chosen);
      else await this.client.setAccountData(RECOVERY_EVENT,{version:1,activeKeyId:defaultId});
      this.retryDecryption();this.update('ready');
    }catch(error){this.update('needs-password',error.message);throw error;}
    finally{this.password=null;this.busy=false;}
  }
  retryDecryption(){for(const room of this.client.getRooms())for(const event of room.getLiveTimeline().getEvents())if(event.isDecryptionFailure?.())this.client.decryptEventIfNeeded(event).catch(()=>{});}
  async verifyPassword(password) {
    // Verify an existing signed-in session's password without changing its
    // device/token. The short-lived confirmation login is immediately revoked.
    const response=await this.client.loginRequest({type:'m.login.password',identifier:{type:'m.id.user',user:this.client.getUserId()},password,initial_device_display_name:'Hasbreo Chat · temporary password confirmation'});
    const r=await fetch(this.client.getHomeserverUrl()+'/_matrix/client/v3/logout',{method:'POST',headers:{Authorization:`Bearer ${response.access_token}`,'Content-Type':'application/json'},body:'{}'});
    if(!r.ok)throw new Error('Password confirmed, but the temporary confirmation session could not be closed. Please try again.');
  }
  async unlock(password){await this.verifyPassword(password);await this.initialize(password);}
  async finishRotation(newId) {
    const storage=this.client.secretStorage;
    const secrets=new Map();for(const name of SECRET_NAMES){const value=await storage.get(name);if(value!==undefined)secrets.set(name,value);}
    if(!secrets.has('m.megolm_backup.v1')||!secrets.has('m.cross_signing.master'))throw new Error('Cannot complete password recovery update yet. Keep this device signed in.');
    await storage.setDefaultKeyId(newId);
    for(const [name,value] of secrets)await storage.store(name,value,[newId]);
    await this.client.setAccountData(RECOVERY_EVENT,{version:1,activeKeyId:newId});
    for(const id of this.cache.keys())if(id!==newId)this.cache.delete(id);
  }
  async changePassword(oldPassword,newPassword) {
    if(newPassword.length<8)throw new Error('Use at least 8 characters. No symbols or capitals are required.');
    // Authenticating the old password also catches a password changed in
    // another client, rather than wrapping keys under an unverified password.
    await this.unlock(oldPassword);
    if(oldPassword===newPassword)return;
    this.busy=true;this.password=oldPassword;this.update('setting-up');
    let changed=false;
    try {
      const storage=this.client.secretStorage,api=this.client.getCrypto();
      const oldId=await storage.getDefaultKeyId();
      const secrets=new Map();for(const name of SECRET_NAMES){const value=await storage.get(name);if(value!==undefined)secrets.set(name,value);}
      if(secrets.size!==SECRET_NAMES.length)throw new Error('History recovery is still setting up. Please try again in a moment.');
      const generated=await api.createRecoveryKeyFromPassphrase(newPassword);
      const created=await storage.addKey('m.secret_storage.v1.aes-hmac-sha2',{key:generated.privateKey,...generated.keyInfo});
      this.cache.set(created.keyId,generated.privateKey);
      await this.client.setAccountData(RECOVERY_EVENT,{version:1,activeKeyId:oldId,pendingKeyId:created.keyId});
      // Keep old credentials working until every secret has also been wrapped
      // under the new key. A failed password request never loses old access.
      for(const [name,value] of secrets)await storage.store(name,value,[oldId,created.keyId]);
      await this.client.setPassword({type:'m.login.password',identifier:{type:'m.id.user',user:this.client.getUserId()},password:oldPassword},newPassword,false);
      changed=true;
      await this.finishRotation(created.keyId);
      this.update('ready');
    }catch(error){
      this.update('needs-password',changed?'Your password changed successfully, but history recovery still needs to finish. Confirm your new password here to complete it.':error.message);
      if(changed)throw new Error(this.error);
      throw error;
    }finally{this.password=null;this.busy=false;}
  }
  async ensureUploaded(timeout=20000) {
    const keys=await this.client.getCrypto().exportRoomKeys();
    if(!keys.length)return;
    if(this.state!=='ready')throw new Error('Confirm your account password in Settings to enable automatic history recovery before signing out.');
    const version=await this.client.getCrypto().getActiveSessionBackupVersion();
    if(!version)throw new Error('Encrypted history backup is reconnecting. Please wait before signing out.');
    const started=Date.now();
    while(!this.stopped&&Date.now()-started<timeout){
      const data=await this.client.http.authedRequest('GET','/room_keys/keys',{version});
      if(keys.every(key=>data.rooms?.[key.room_id]?.sessions?.[key.session_id])){this.lastBackupAt=Date.now();this.onChange();return;}
      await sleep(600);
    }
    throw new Error('Your encrypted history is still syncing. Keep this tab open and try signing out again in a moment.');
  }
  stop(){this.stopped=true;this.password=null;this.cache.clear();}
}
