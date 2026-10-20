import {fileRequest} from './files.js';
import {workerRegistration} from './notifications.js';
import {isNative} from './native.js';
export async function enableBrowserPush(service){
 if(isNative())return false;if(!('PushManager'in globalThis)||!('Notification'in globalThis))throw Error('Background alerts are not supported in this browser.');
 if(Notification.permission!=='granted')throw Error('Allow browser notifications first.');
 const registration=await workerRegistration();if(!registration)throw Error('The browser notification worker could not start.');
 const data=await fileRequest(service.session,'/push/key');const key=Uint8Array.from(atob(data.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 await fileRequest(service.session,'/push/subscription',{method:'POST',body:{subscription:subscription.toJSON(),deviceId:service.session.deviceId}});return true;
}
export async function disableBrowserPush(service){if(isNative()||!('PushManager'in globalThis))return;await fileRequest(service.session,'/push/subscription',{method:'DELETE',body:{deviceId:service.session.deviceId}}).catch(()=>{});const registration=await workerRegistration();await(await registration?.pushManager.getSubscription())?.unsubscribe();}
