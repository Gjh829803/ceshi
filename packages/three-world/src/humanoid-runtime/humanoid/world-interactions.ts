import {Euler,Vector3,Quaternion} from 'three';
import type {EnvironmentDefinition} from '../environment/types';
import type {InteractionBody,InteractionBodyRelease} from '../../interaction-body';
import type {InteractionTarget} from './action-schema';

export interface TargetRuntime {
  definition:InteractionTarget;position:Vector3;rotation:Quaternion;stable:boolean;
  state:'available'|'carried'|'placed'|'occupied'|'dropped';
  physical?:InteractionBody|undefined;
}
interface Claim {owner:object;requestId:string;kind:'reserved'|'held'|'occupied'}

/** World-owned interaction semantics. Physical owners retain their bodies and lifecycle. */
export class WorldInteractions {
  readonly targets=new Map<string,TargetRuntime>();
  private readonly claims=new Map<string,Claim>();
  private disposed=false;
  constructor(private readonly map:EnvironmentDefinition,private readonly physical:(id:string)=>InteractionBody|undefined,private readonly resolveAnchor:(id:string,point:readonly number[])=>{position:Vector3;rotation:Quaternion;stable:boolean}|null){
    for(const definition of map.interactions??[])this.targets.set(definition.id,{definition:structuredClone(definition),position:new Vector3(...definition.position),rotation:new Quaternion(),state:'available',stable:true,physical:physical(definition.id)});
  }
  /** Called by the world before actors and after physics, never by individual actors or rendering. */
  syncPhysicalState():void{
    for(const target of this.targets.values())if(target.physical&&target.state!=='carried'){const pose=target.physical.read();target.position.copy(pose.position);target.rotation.copy(pose.rotation);}
    for(const source of this.map.interactions??[]){
      if(source.kind!=='seat'||!source.colliderIds?.length)continue;
      const target=this.targets.get(source.id);if(!target)continue;
      const anchor=this.resolveAnchor(source.colliderIds[0]!,source.position),approach=this.resolveAnchor(source.colliderIds[0]!,source.approach);
      target.stable=!!anchor?.stable&&!!approach;
      if(!anchor||!approach)continue;
      target.position.copy(anchor.position);target.definition.position=anchor.position.toArray();target.definition.approach=approach.position.toArray();target.definition.yaw=source.yaw+new Euler().setFromQuaternion(anchor.rotation,'YXZ').y;
    }
  }
  unavailable(id:string){return this.disposed||this.claims.has(id);}
  reserve(id:string,owner:object,requestId:string):boolean{
    const target=this.targets.get(id);
    if(this.unavailable(id)||!target||!['available','placed'].includes(target.state))return false;
    this.claims.set(id,{owner,requestId,kind:'reserved'});return true;
  }
  commit(id:string,owner:object,requestId:string,kind:'held'|'occupied'):boolean{
    const claim=this.claims.get(id);if(!claim||claim.owner!==owner||claim.requestId!==requestId)return false;
    if(kind==='held'&&!this.targets.get(id)?.physical?.hold(owner))return false;
    claim.kind=kind;return true;
  }
  finish(owner:object,requestId:string){for(const [id,claim] of this.claims)if(claim.owner===owner&&claim.requestId===requestId&&claim.kind==='reserved')this.claims.delete(id);}
  release(id:string,owner:object){
    if(this.claims.get(id)?.owner!==owner)return;this.claims.delete(id);
  }
  moveHeld(id:string,owner:object,position:Vector3):boolean{
    const target=this.targets.get(id),claim=this.claims.get(id);if(!target||claim?.owner!==owner||claim.kind!=='held'||!target.physical?.moveHeld(owner,position))return false;
    target.position.copy(position);target.rotation.copy(target.physical.read().rotation);return true;
  }
  releaseHeld(id:string,owner:object,options:InteractionBodyRelease):boolean{
    const target=this.targets.get(id),claim=this.claims.get(id);if(!target||claim?.owner!==owner||claim.kind!=='held'||!target.physical?.release(owner,options))return false;
    this.claims.delete(id);target.position.copy(options.position);target.rotation.copy(target.physical.read().rotation);target.state=options.reason==='place'?'placed':'dropped';return true;
  }
  releaseOwner(owner:object):void{
    if(this.disposed)return;
    for(const [id,claim] of this.claims)if(claim.owner===owner){
      const target=this.targets.get(id);
      if(target&&claim.kind==='held')this.releaseHeld(id,owner,{reason:'drop',position:target.position});
      else if(target&&claim.kind==='occupied')target.state='available';
      this.claims.delete(id);
    }
  }
  reset(resetPhysical:()=>void):void{
    if(this.claims.size)throw new Error('INTERACTION_RESET_REQUIRES_RELEASE');
    resetPhysical();
    for(const target of this.targets.values()){
      const source=this.map.interactions?.find(value=>value.id===target.definition.id);if(source)target.definition=structuredClone(source);
      target.physical=this.physical(target.definition.id);target.position.fromArray(target.definition.position);target.rotation.identity();target.state='available';target.stable=true;
    }
  }
  dispose():void{if(this.disposed)return;this.disposed=true;this.claims.clear();this.targets.clear();}
}
