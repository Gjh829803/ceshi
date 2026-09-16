import type {DebugSourceIdentity,DebugBundleFiles} from '@worldkit/three/debug';
export type {DebugSourceIdentity,DebugBundleFiles} from '@worldkit/three/debug';
export function createDebugFileClient(transport:typeof fetch=fetch){
 let session:Promise<string>|undefined;
 const request=async<T>(route:string,value:unknown):Promise<T>=>{
  if(!session)session=transport('/__playground-diagnostics/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(async response=>{
   if(!response.ok)throw Error('DEBUG_FILE_SERVICE_UNAVAILABLE');return (await response.json() as {session:string}).session;
  });
  const response=await transport(`/__playground-diagnostics/${route}`,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session':await session},body:JSON.stringify(value)});
  if(!response.ok){const detail=await response.json().catch(()=>({}));throw Error(detail.error??'DEBUG_FILE_REQUEST_FAILED');}
  return response.json() as Promise<T>;
 };
 return {identity:()=>request<DebugSourceIdentity>('identity',{}),load:(id:string)=>request<unknown>('load',{id}),save:(bundle:{metadata:unknown;screenshotDataUrl?:string;recording?:unknown})=>request<DebugBundleFiles>('save',bundle)};
}
