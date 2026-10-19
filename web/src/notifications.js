export function shouldNotify({hidden,focused,activeRoomId,roomId}){
  return hidden||!focused||activeRoomId!==roomId;
}
let workerPromise;
export async function workerRegistration(){
  if(globalThis.HasbreoNative)return null;
  if(!('serviceWorker'in navigator))return null;
  if(!workerPromise)workerPromise=navigator.serviceWorker.register('/notification-worker.js',{scope:'/'}).then(()=>navigator.serviceWorker.ready).catch(()=>null);
  return workerPromise;
}
export async function showNotification(title,{body='New message in Hasbreo Chat',roomId,tag='hasbreo-message',onClick}={}){
  if(!('Notification'in globalThis)||Notification.permission!=='granted')throw new Error('Allow notifications in your browser’s site settings first.');
  const options={body,icon:'/icon.svg',badge:'/icon.svg',tag,data:{roomId}};
  const registration=await workerRegistration();
  if(registration?.showNotification){await registration.showNotification(title,options);return;}
  try{const notification=new Notification(title,options);notification.onclick=()=>{onClick?.();notification.close();};}
  catch{throw new Error('This browser could not display a notification. Check site permissions and your device’s notification settings.');}
}
