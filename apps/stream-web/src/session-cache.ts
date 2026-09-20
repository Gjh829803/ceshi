import {parseVideoSettings,type VideoSettings} from '@worldkit/stream-protocol';
/** Tab-local credentials: never put bearer tokens in navigation URLs or UI logs. */
export type SavedSession =
  | {kind:'active';sessionId:string;accessToken:string}
  | {kind:'pending';worldId:string;requestId:string;video?:VideoSettings};
const key='worldkit.stream-web.session.v1';
export function readSavedSession():SavedSession|null {
  try{
    const value:unknown=JSON.parse(sessionStorage.getItem(key)??'null');
    if(!value||typeof value!=='object')return null;
    const v=value as Record<string,unknown>;
    const text=(p:string,max:number)=>typeof v[p]==='string'&&(v[p] as string).length>0&&(v[p] as string).length<=max;
    if(v.kind==='active'&&text('sessionId',128)&&text('accessToken',256))return {kind:'active',sessionId:v.sessionId as string,accessToken:v.accessToken as string};
    if(v.kind==='pending'&&text('worldId',256)&&text('requestId',128))return {kind:'pending',worldId:v.worldId as string,requestId:v.requestId as string,...(v.video===undefined?{}:{video:parseVideoSettings(v.video)})};
  }catch{/* A browser storage restriction should not block a new preview. */}
  return null;
}
export function saveSession(value:SavedSession|null):void {
  try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch{/* Playback remains available without refresh recovery. */}
}
