import type {DebugArtifactStore,DebugSourceIdentity} from './storage.js';

type Bundle={metadata:unknown;screenshotDataUrl?:string;recording?:unknown};
/** Browser-local storage, with explicit export. No requests or upload endpoints. */
export function createBrowserDebugStore(identity:DebugSourceIdentity){
 const source=structuredClone(identity);let database:Promise<IDBDatabase>|undefined;
 const db=()=>database??=new Promise<IDBDatabase>((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(Error('DEBUG_STORAGE_UNAVAILABLE'));return;}
  const request=indexedDB.open('worldkit-debug-incidents',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('incidents');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
 const read=async(id:string)=>{
  if(!/^[a-z0-9-]{1,80}$/i.test(id))throw Error('DEBUG_BUNDLE_ID_INVALID');
  const database=await db();return new Promise<Bundle>((resolve,reject)=>{
   const request=database.transaction('incidents','readonly').objectStore('incidents').get(id);
   request.onsuccess=()=>request.result?resolve(request.result as Bundle):reject(Error('DEBUG_BUNDLE_NOT_FOUND'));
   request.onerror=()=>reject(request.error);
  });
 };
 const store:DebugArtifactStore={
  identity:async()=>structuredClone(source),
  async save(bundle){
   const copy=structuredClone(bundle),text=JSON.stringify(copy),bytes=new TextEncoder().encode(text);
   if(bytes.byteLength>32*1024*1024)throw Error('DEBUG_BUNDLE_TOO_LARGE');
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   const id=crypto.randomUUID(),database=await db();
   await new Promise<void>((resolve,reject)=>{const transaction=database.transaction('incidents','readwrite');transaction.objectStore('incidents').add(copy,id);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error??Error('DEBUG_STORAGE_ABORTED'));});
   return {id,files:{'incident.json':{path:`indexeddb:worldkit-debug-incidents/${id}`,sha256:hash,bytes:bytes.byteLength}}};
  },
  async load(id){return (await read(id)).recording;},
 };
 return {...store,readIncident:read,
  async download(id:string){const blob=new Blob([JSON.stringify(await read(id),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`worldkit-incident-${id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},
  async dispose(){if(database)(await database).close();},
 };
}
