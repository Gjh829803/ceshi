export type ActorResourceChannel='locomotion'|'animation'|'pose'|'left-hand'|'right-hand';
export const FULL_BODY_RESOURCES:readonly ActorResourceChannel[]=Object.freeze(['locomotion','animation','pose','left-hand','right-hand']);
export interface ActorResourceRequest {readonly actorId:string;readonly channel:ActorResourceChannel}
export interface ActorResourceOwner {readonly kind:'navigation'|'action'|'animation'|'relationship';readonly id:string}
export interface ActorResourceClaim extends ActorResourceRequest {readonly owner:ActorResourceOwner}
interface Claim extends ActorResourceClaim {readonly token:object}
const key=(request:ActorResourceRequest)=>JSON.stringify([request.actorId,request.channel]);
export const actorResources=(actorId:string,channels:readonly ActorResourceChannel[]):ActorResourceRequest[]=>channels.map(channel=>({actorId,channel}));

/** Synchronous actor capability arbitration. It does not move actors or advance time. */
export class ActorResources {
 private readonly claims=new Map<string,Claim>();
 private readonly byOwner=new Map<object,Set<string>>();
 fork():ActorResources{const copy=new ActorResources();for(const [id,claim] of this.claims)copy.claims.set(id,claim);for(const [owner,keys] of this.byOwner)copy.byOwner.set(owner,new Set(keys));return copy;}
 conflict(owner:object|undefined,requests:readonly ActorResourceRequest[]):ActorResourceClaim|undefined{
  for(const request of [...requests].sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0)){
   const claim=this.claims.get(key(request));if(claim&&claim.token!==owner)return {actorId:claim.actorId,channel:claim.channel,owner:{...claim.owner}};
  }
  return;
 }
 acquire(owner:object,requests:readonly ActorResourceRequest[],identity:ActorResourceOwner):boolean{
  if(this.conflict(owner,requests))return false;
  const keys=this.byOwner.get(owner)??new Set<string>();
  for(const request of requests){const id=key(request);keys.add(id);this.claims.set(id,{...request,token:owner,owner:{...identity}});}
  if(keys.size)this.byOwner.set(owner,keys);return true;
 }
 transfer(previous:object,next:object,requests:readonly ActorResourceRequest[],identity:ActorResourceOwner):boolean{
  if(requests.some(request=>{const claim=this.claims.get(key(request));return claim&&claim.token!==previous&&claim.token!==next;}))return false;
  this.release(previous);return this.acquire(next,requests,identity);
 }
 retain(owner:object,requests:readonly ActorResourceRequest[],identity:ActorResourceOwner):void{
  const keep=new Set(requests.map(key)),keys=this.byOwner.get(owner);if(!keys)return;
  for(const id of [...keys]){const claim=this.claims.get(id)!;if(!keep.has(id)){this.claims.delete(id);keys.delete(id);}else this.claims.set(id,{...claim,owner:{...identity}});}
  if(!keys.size)this.byOwner.delete(owner);
 }
 release(owner:object):void{for(const id of this.byOwner.get(owner)??[])this.claims.delete(id);this.byOwner.delete(owner);}
 inspect(actorId:string):ActorResourceClaim[]{return [...this.claims.values()].filter(claim=>claim.actorId===actorId).map(({actorId,channel,owner})=>({actorId,channel,owner:{...owner}}));}
 clear():void{this.claims.clear();this.byOwner.clear();}
}
