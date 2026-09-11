import {Euler,Vector3,Quaternion} from 'three';
import type {EnvironmentDefinition} from '../environment/types';
import type {InteractionBody,InteractionBodyRelease,InteractionBodySnapshot} from '../../interaction-body';
import {ACTION_TUNING} from '../../config/actions';
import {validateInteractionSlots} from '../../interaction-contracts';
import type {InteractionSlot,InteractionClaimState} from '../../contracts';
import type {InteractionTarget} from './action-schema';
import {ActorResources,actorResources,type ActorResourceChannel} from '../../actor-resources';

export interface TargetRuntime {
 readonly entityId:string;readonly slotId:string;readonly generation:number;
 definition:InteractionTarget;position:Vector3;rotation:Quaternion;stable:boolean;enabled:boolean;
 state:'available'|'carried'|'placed'|'occupied'|'dropped'|'removed';
 physical?:InteractionBody|undefined;
 readonly localAnchor:Vector3;
 sync(pose?:InteractionBodySnapshot):void;
 setApproach(position:Vector3,yaw:number):void;
 hasContact(position:Vector3,toleranceMeters:number):boolean;
}
interface Claim {target:TargetRuntime;actorId:string|null;owner:object;requestId:string;kind:'reserved'|'held'|'occupied';expiresAt:number;invalidated?:((target:TargetRuntime,reason:string)=>void)|undefined}
interface Binding {create:()=>TargetRuntime[]}
const key=(entityId:string,slotId:string)=>JSON.stringify([entityId,slotId]);

/** Shared semantic slots and claims. Physical owners retain bodies and object projection. */
export class WorldInteractions {
 readonly targets=new Map<string,TargetRuntime>();
 private readonly entityTargets=new Map<string,Map<string,TargetRuntime>>();
 private readonly bindings=new Map<string,Binding>();
 private readonly mapEntities=new Set<string>();
 private readonly mapBindings=new Map<string,Binding>();
 private readonly claims=new Map<TargetRuntime,Claim>();
 private readonly entityClaims=new Map<string,Set<Claim>>();
 private readonly ownerClaims=new Map<object,Set<Claim>>();
 private generation=0;private time=0;private disposed=false;
 constructor(map:EnvironmentDefinition,physical:(id:string)=>InteractionBody|undefined,resolveAnchor:(id:string,point:readonly number[])=>{position:Vector3;rotation:Quaternion;stable:boolean}|null,contact:(ids:readonly string[],position:Vector3,toleranceMeters:number)=>boolean,readonly actorResources:ActorResources){
  for(const source of map.interactions??[]){
   this.mapEntities.add(source.id);
   this.install(source.id,{create:()=>{
    const definition=structuredClone(source),body=physical(source.id);
    const target:TargetRuntime={entityId:source.id,slotId:source.slotId,generation:++this.generation,definition,position:new Vector3(...source.position),rotation:new Quaternion(),state:'available',stable:true,enabled:true,physical:body,localAnchor:new Vector3(),hasContact:(position,tolerance)=>body?body.hasContact(position,tolerance):contact(source.colliderIds??[],position,tolerance),setApproach:(position,yaw)=>{target.definition.approach=position.toArray();target.definition.yaw=yaw;},sync:sample=>{
     if(body?.isValid){const pose=sample??body.read();target.enabled=pose.entityEnabled&&(pose.collisionEnabled||body.isHeld);target.position.copy(pose.position);target.rotation.copy(pose.rotation);}
     if(source.kind==='seat'&&source.colliderIds?.length){
      const anchor=resolveAnchor(source.colliderIds[0]!,source.position),approach=resolveAnchor(source.colliderIds[0]!,source.approach);
      target.stable=!!anchor?.stable&&!!approach;target.enabled=!!anchor&&!!approach;if(!anchor||!approach)return;
      target.position.copy(anchor.position);target.rotation.copy(anchor.rotation);target.definition.approach=approach.position.toArray();target.definition.yaw=source.yaw+new Euler().setFromQuaternion(anchor.rotation,'YXZ').y;
     }
     target.definition.position=target.position.toArray();
    }};return [target];
   }});this.mapBindings.set(source.id,this.bindings.get(source.id)!);
  }
 }
 private install(entityId:string,binding:Binding):void{
  if(this.disposed)throw new Error('INTERACTIONS_DISPOSED');
  if(this.bindings.has(entityId))throw new Error('INTERACTION_ENTITY_ALREADY_BOUND');
  const targets=binding.create();this.bindings.set(entityId,binding);this.publish(entityId,targets);
 }
 registerEntity(entityId:string,slots:readonly InteractionSlot[],physical:()=>InteractionBody):void{if(this.mapEntities.has(entityId))throw new Error('INTERACTION_ENTITY_OWNER_MISMATCH');this.install(entityId,this.entityBinding(entityId,slots,physical));}
 replaceEntity(entityId:string,slots:readonly InteractionSlot[],physical:()=>InteractionBody):void{
  if(this.mapEntities.has(entityId))throw new Error('INTERACTION_ENTITY_OWNER_MISMATCH');
  const binding=this.entityBinding(entityId,slots,physical),targets=slots.length?binding.create():[];
  this.unregisterEntity(entityId);if(!slots.length)return;for(const target of targets)target.sync();this.bindings.set(entityId,binding);this.publish(entityId,targets);
 }
 private entityBinding(entityId:string,slots:readonly InteractionSlot[],physical:()=>InteractionBody):Binding{
  validateInteractionSlots(slots);if(!entityId.trim())throw new Error('INTERACTION_ENTITY_ID_INVALID');
  const definitions=structuredClone(slots);
  return {create:()=>{
   const body=physical();if(!body.isValid)throw new Error('INTERACTION_ENTITY_STALE');
   return definitions.map(slot=>{
    const approachLocal=new Vector3(...slot.approachLocalMetersXYZ),facingLocal=new Quaternion().setFromEuler(new Euler(...slot.rotationLocalRadiansXYZ));
    const target:TargetRuntime={entityId,slotId:slot.slotId,generation:++this.generation,definition:{id:entityId,slotId:slot.slotId,label:slot.label,kind:slot.kind,position:[0,0,0],approach:[0,0,0],yaw:0},position:new Vector3(),rotation:new Quaternion(),state:'available',stable:true,enabled:true,physical:body,localAnchor:new Vector3(...slot.positionLocalMetersXYZ),hasContact:(position,tolerance)=>body.hasContact(position,tolerance),setApproach:(position,yaw)=>{const pose=body.read();approachLocal.copy(position).sub(pose.position).applyQuaternion(pose.rotation.clone().invert()).divide(pose.scale);facingLocal.copy(pose.rotation).invert().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw));target.sync();},sync:sample=>{
     if(!body.isValid){target.stable=false;return;}
     const pose=sample??body.read(),transform=(v:readonly number[])=>new Vector3().fromArray(v).multiply(pose.scale).applyQuaternion(pose.rotation).add(pose.position);
     target.position.copy(transform(slot.positionLocalMetersXYZ));target.rotation.copy(pose.rotation).multiply(facingLocal);
     target.definition.position=target.position.toArray();target.definition.approach=transform(approachLocal.toArray()).toArray();target.definition.yaw=new Euler().setFromQuaternion(target.rotation,'YXZ').y;
     target.definition.size=[...pose.sizeMetersXYZ];target.definition.massKg=pose.massKg;target.enabled=pose.entityEnabled&&(pose.collisionEnabled||body.isHeld);target.stable=pose.stable&&target.enabled;
    }};target.sync();return target;
   });
  }};
 }
 private publish(entityId:string,targets:TargetRuntime[]):void{
  this.entityTargets.set(entityId,new Map(targets.map(target=>[target.slotId,target])));for(const target of targets)this.targets.set(key(entityId,target.slotId),target);
 }
 target(entityId:string,slotId?:string):TargetRuntime|undefined{
  const targets=this.entityTargets.get(entityId);return slotId!==undefined?targets?.get(slotId):targets?.size===1?targets.values().next().value:undefined;
 }
 hasMapEntity(entityId:string):boolean{return this.mapEntities.has(entityId);}
 hasEntity(entityId:string):boolean{return this.bindings.has(entityId);}
 isCurrent(target:TargetRuntime):boolean{return !this.disposed&&this.targets.get(key(target.entityId,target.slotId))===target;}
 syncPhysicalState():void{
  const poses=new Map<InteractionBody,InteractionBodySnapshot>();
  for(const target of this.targets.values()){
   const body=target.physical;
   if(body&&!body.isValid){this.unregisterEntity(target.entityId);continue;}
   let pose=body?poses.get(body):undefined;if(body&&!pose){pose=body.read();poses.set(body,pose);}
   target.sync(pose);
  }
  for(const claim of [...this.claims.values()])if(!claim.target.enabled){
   if(claim.kind==='held'&&claim.target.physical?.isValid)this.releaseHeld(claim.target,claim.owner,{reason:'drop',position:claim.target.physical.read().position});
   this.removeClaim(claim);claim.invalidated?.(claim.target,'TARGET_DISABLED');
  }
 }

 advance(dt:number):void{
  this.time+=dt;
  for(const claim of [...this.claims.values()])if(claim.kind==='reserved'&&claim.expiresAt<=this.time){this.removeClaim(claim);claim.invalidated?.(claim.target,'RESERVATION_EXPIRED');}
 }
 unavailable(target:TargetRuntime):boolean{
  if(!this.isCurrent(target)||!target.enabled||this.claims.has(target))return true;
  const occupied=this.entityClaims.get(target.entityId);return target.definition.kind==='pickup'?!!occupied?.size:[...(occupied??[])].some(claim=>claim.target.definition.kind==='pickup');
 }
 reserve(target:TargetRuntime,owner:object,requestId:string,options:{invalidated?:Claim['invalidated'];actorId?:string|null;channels?:readonly ActorResourceChannel[]}={}):boolean{
  if(this.isCurrent(target))target.sync();
  if(this.unavailable(target)||!['available','placed'].includes(target.state)||this.ownerClaims.get(owner)?.size)return false;
  if(options.actorId&&options.channels&&!this.actorResources.acquire(owner,actorResources(options.actorId,options.channels),{kind:'action',id:requestId}))return false;
  const claim:Claim={target,actorId:options.actorId??null,owner,requestId,kind:'reserved',expiresAt:this.time+ACTION_TUNING.interactionReservationSeconds,invalidated:options.invalidated};
  this.claims.set(target,claim);const entity=this.entityClaims.get(target.entityId)??new Set<Claim>();entity.add(claim);this.entityClaims.set(target.entityId,entity);
  const actor=this.ownerClaims.get(owner)??new Set<Claim>();actor.add(claim);this.ownerClaims.set(owner,actor);return true;
 }
 commit(target:TargetRuntime,owner:object,requestId:string,kind:'held'|'occupied'):boolean{
  if(this.isCurrent(target))target.sync();
  const claim=this.claims.get(target);if(!target.enabled||kind==='occupied'&&!target.stable||!this.isCurrent(target)||!claim||claim.owner!==owner||claim.requestId!==requestId||claim.kind==='reserved'&&claim.expiresAt<=this.time)return false;
  if(kind==='held'&&!target.physical?.hold(owner))return false;claim.kind=kind;target.state=kind==='held'?'carried':'occupied';return true;
 }
 claimState(target:TargetRuntime):InteractionClaimState|null{const claim=this.claims.get(target);return claim?{actorId:claim.actorId,requestId:claim.requestId,state:claim.kind,generation:target.generation,expiresAtSimulationSeconds:claim.kind==='reserved'?claim.expiresAt:null}:null;}
 private removeClaim(claim:Claim):void{
  this.claims.delete(claim.target);const entity=this.entityClaims.get(claim.target.entityId);entity?.delete(claim);if(!entity?.size)this.entityClaims.delete(claim.target.entityId);
  const actor=this.ownerClaims.get(claim.owner);actor?.delete(claim);if(!actor?.size)this.ownerClaims.delete(claim.owner);
 }
 finish(owner:object,requestId:string):void{for(const claim of [...(this.ownerClaims.get(owner)??[])])if(claim.requestId===requestId&&claim.kind==='reserved')this.removeClaim(claim);}
 release(target:TargetRuntime,owner:object):void{const claim=this.claims.get(target);if(claim?.owner===owner){if(claim.kind==='occupied')target.state='available';this.removeClaim(claim);}}
 moveHeld(target:TargetRuntime,owner:object,position:Vector3):boolean{
  const claim=this.claims.get(target),body=target.physical;if(!this.isCurrent(target)||claim?.owner!==owner||claim.kind!=='held'||!body?.isValid)return false;
  const pose=body.read(),root=position.clone().sub(target.localAnchor.clone().multiply(pose.scale).applyQuaternion(pose.rotation));
  if(!body.moveHeld(owner,root))return false;target.sync();return true;
 }
 releaseHeld(target:TargetRuntime,owner:object,options:InteractionBodyRelease):boolean{
  const claim=this.claims.get(target);if(!this.isCurrent(target)||claim?.owner!==owner||claim.kind!=='held'||!target.physical?.release(owner,options))return false;
  this.removeClaim(claim);target.sync();target.state=options.reason==='place'?'placed':'dropped';return true;
 }
 releaseOwner(owner:object):void{
  if(this.disposed)return;
  for(const claim of [...(this.ownerClaims.get(owner)??[])]){
   const target=claim.target;
   if(claim.kind==='held'&&target.physical?.isValid)this.releaseHeld(target,owner,{reason:'drop',position:target.physical.read().position});
   else if(claim.kind==='occupied')target.state='available';
   this.removeClaim(claim);
  }
 }
 unregisterEntity(entityId:string):void{
  const notifications:Claim[]=[];
  for(const claim of [...(this.entityClaims.get(entityId)??[])]){
   if(claim.kind==='held'&&claim.target.physical?.isValid)this.releaseHeld(claim.target,claim.owner,{reason:'drop',position:claim.target.physical.read().position});
   this.removeClaim(claim);notifications.push(claim);
  }
  for(const target of this.entityTargets.get(entityId)?.values()??[]){target.state='removed';this.targets.delete(key(entityId,target.slotId));}this.entityTargets.delete(entityId);this.bindings.delete(entityId);
  for(const claim of notifications)claim.invalidated?.(claim.target,'TARGET_REMOVED');
 }
 reset(resetPhysical:()=>void):void{
  if(this.claims.size)throw new Error('INTERACTION_RESET_REQUIRES_RELEASE');resetPhysical();for(const [id,binding] of this.mapBindings)this.bindings.set(id,binding);
  const rebuilt=[...this.bindings].map(([id,binding])=>({id,targets:binding.create()}));for(const target of this.targets.values())target.state='removed';this.targets.clear();this.entityTargets.clear();
  for(const {id,targets} of rebuilt)this.publish(id,targets);
 }
 dispose():void{if(this.disposed)return;for(const id of [...this.bindings.keys()])this.unregisterEntity(id);this.disposed=true;}
}
