import type {DebugArtifactStore,DebugSourceIdentity} from './storage.js';
import {parseDebugIncident,MAX_DEBUG_INCIDENT_BYTES,type DebugIncidentSummary} from './incident.js';

type Bundle={metadata:unknown;screenshotDataUrl?:string;recording?:unknown};
/** Browser-local storage, with explicit export. No requests or upload endpoints. */
export function createBrowserDebugStore(identity:DebugSourceIdentity){
 const source=structuredClone(identity);let database:Promise<IDBDatabase>|undefined,disposed=false;
 const db=()=>{
  if(disposed)return Promise.reject(Error('DEBUG_STORAGE_DISPOSED'));
  if(database)return database;
  const opening=new Promise<IDBDatabase>((resolve,reject)=>{
   if(typeof indexedDB==='undefined'){reject(Error('DEBUG_STORAGE_UNAVAILABLE'));return;}
   let abandoned=false;const request=indexedDB.open('worldkit-debug-incidents',2);
   request.onblocked=()=>{abandoned=true;reject(Error('DEBUG_STORAGE_UPGRADE_BLOCKED: 请关闭仍打开旧版调试工具的标签页，再刷新现场列表。'));};
   request.onupgradeneeded=()=>{const store=request.result.objectStoreNames.contains('incidents')?request.transaction!.objectStore('incidents'):request.result.createObjectStore('incidents');
    if(!store.indexNames.contains('sceneCreatedAt'))store.createIndex('sceneCreatedAt',['metadata.mapId','metadata.createdAt']);};
   request.onsuccess=()=>{const result=request.result;if(abandoned||disposed){result.close();reject(Error('DEBUG_STORAGE_DISPOSED'));return;}
    result.onversionchange=()=>{result.close();if(database===opening)database=undefined;};resolve(result);};
   request.onerror=()=>reject(request.error);
  });
  database=opening;void opening.catch(()=>{if(database===opening)database=undefined;});return opening;
 };
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
   if(bytes.byteLength>MAX_DEBUG_INCIDENT_BYTES)throw Error('DEBUG_BUNDLE_TOO_LARGE');
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   const id=crypto.randomUUID(),database=await db();
   await new Promise<void>((resolve,reject)=>{const transaction=database.transaction('incidents','readwrite');transaction.objectStore('incidents').add(copy,id);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error??Error('DEBUG_STORAGE_ABORTED'));});
   return {id,files:{'incident.json':{path:`indexeddb:worldkit-debug-incidents/${id}`,sha256:hash,bytes:bytes.byteLength}}};
  },
  async load(id){return (await read(id)).recording;},
 };
 return {...store,readIncident:read,
  async importIncident(text:string){return store.save(parseDebugIncident(text));},
  async listIncidents(sceneId:string,limit=20):Promise<DebugIncidentSummary[]>{
   if(typeof sceneId!=='string'||!sceneId||!Number.isInteger(limit)||limit<1||limit>100)throw Error('DEBUG_INPUT_INVALID');
   const database=await db();return new Promise((resolve,reject)=>{
    const results:DebugIncidentSummary[]=[],request=database.transaction('incidents','readonly').objectStore('incidents').index('sceneCreatedAt').openCursor(IDBKeyRange.bound([sceneId,''],[sceneId,'\uffff']),'prev');
    request.onerror=()=>reject(request.error);request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(results);return;}
     const bundle=cursor.value as Bundle,meta=bundle.metadata as {label?:unknown;createdAt?:unknown;source?:{sourceHash?:unknown}};
     if(typeof meta.label==='string'&&typeof meta.createdAt==='string'&&typeof meta.source?.sourceHash==='string')results.push({id:String(cursor.primaryKey),label:meta.label,createdAt:meta.createdAt,sceneId,sourceHash:meta.source.sourceHash,hasRecording:bundle.recording!==undefined});
     if(results.length>=limit)resolve(results);else cursor.continue();
    };
   });
  },
  async download(id:string){const blob=new Blob([JSON.stringify(await read(id),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`worldkit-incident-${id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},
  async dispose(){disposed=true;if(database)(await database).close();},
 };
}
