import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3} from 'three';
import {DYNAMIC_PROP_COLLISION_GROUPS} from '../../config/physics';
import type {EnvironmentDefinition} from '../environment/types';
import type {PhysicsColliderBindings} from '../../physics-collider-bindings';
import type {InteractionTarget} from './action-schema';

export interface TargetRuntime {
  definition:InteractionTarget;position:Vector3;
  state:'available'|'carried'|'placed'|'occupied'|'dropped';
  collider?:RAPIER.Collider|undefined;body?:RAPIER.RigidBody|undefined;
}
interface Claim {owner:object;requestId:string;kind:'reserved'|'held'|'occupied'}

/** World-owned physical content. Controller disposal releases its claims, not the targets. */
export class WorldInteractions {
  readonly targets=new Map<string,TargetRuntime>();
  readonly crates:{id:string;body:RAPIER.RigidBody;size:number;initial:Vector3}[]=[];
  private readonly claims=new Map<string,Claim>();
  private readonly colliders=new Map<string,RAPIER.Collider>();
  private disposed=false;
  constructor(private readonly world:RAPIER.World,private readonly map:EnvironmentDefinition,private readonly bindings:PhysicsColliderBindings){
    try{
      for(const definition of map.interactions??[]){
        const target:TargetRuntime={definition:structuredClone(definition),position:new Vector3(...definition.position),state:'available'};
        this.targets.set(definition.id,target);this.createPickup(target);
      }
      for(const spec of map.looseCrates??[]){
        const initial=new Vector3(...spec.position),body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...spec.position).setCcdEnabled(true));
        this.crates.push({id:spec.id,body,size:spec.size,initial});
        const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(spec.size/2,spec.size/2,spec.size/2).setMass(7).setFriction(.7).setRestitution(.1).setCollisionGroups(DYNAMIC_PROP_COLLISION_GROUPS),body);
        const id=spec.id;this.colliders.set(id,collider);this.bindings.added(id,collider);
      }
    }catch(error){this.dispose();throw error;}
  }
  private createPickup(target:TargetRuntime){
    const d=target.definition;if(d.kind!=='pickup')return;const size=d.size??[.13,.13,.13];
    target.body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...d.position).setGravityScale(9.81/18).setCcdEnabled(true).lockRotations().setSleeping(true));
    target.collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(size[0]/2,size[1]/2,size[2]/2).setMass(d.massKg??.3).setCollisionGroups(DYNAMIC_PROP_COLLISION_GROUPS),target.body);
    this.colliders.set(d.id,target.collider);this.bindings.added(d.id,target.collider);
  }
  colliderForId(id:string){return this.colliders.get(id);}
  private removeBody(target:TargetRuntime){this.colliders.delete(target.definition.id);if(target.collider)this.bindings.removed(target.collider);if(target.body)this.world.removeRigidBody(target.body);else if(target.collider)this.world.removeCollider(target.collider,true);target.body=undefined;target.collider=undefined;}
  unavailable(id:string){return this.disposed||this.claims.has(id);}
  reserve(id:string,owner:object,requestId:string):boolean{
    const target=this.targets.get(id);
    if(this.unavailable(id)||!target||!['available','placed'].includes(target.state))return false;
    this.claims.set(id,{owner,requestId,kind:'reserved'});return true;
  }
  commit(id:string,owner:object,requestId:string,kind:'held'|'occupied'):boolean{
    const claim=this.claims.get(id);if(!claim||claim.owner!==owner||claim.requestId!==requestId)return false;
    claim.kind=kind;return true;
  }
  finish(owner:object,requestId:string){for(const [id,claim] of this.claims)if(claim.owner===owner&&claim.requestId===requestId&&claim.kind==='reserved')this.claims.delete(id);}
  release(id:string,owner:object){
    if(this.claims.get(id)?.owner!==owner)return;this.claims.delete(id);
    const collider=this.targets.get(id)?.collider;if(collider)this.bindings.changed([collider]);
  }
  releaseOwner(owner:object){
    if(this.disposed)return;
    for(const [id,claim] of this.claims)if(claim.owner===owner){
      const target=this.targets.get(id);
      if(target&&claim.kind==='held'){
        target.body?.setTranslation(target.position,true);target.body?.setLinvel({x:0,y:0,z:0},false);target.body?.setEnabled(true);target.collider?.setEnabled(true);target.state='dropped';
      }else if(target&&claim.kind==='occupied')target.state='available';
      this.claims.delete(id);
    }
    this.world.updateSceneQueries();
  }
  reset(){
    this.claims.clear();
    for(const target of this.targets.values()){
      this.removeBody(target);const source=this.map.interactions?.find(value=>value.id===target.definition.id);
      if(source)target.definition=structuredClone(source);target.position.fromArray(target.definition.position);target.state='available';this.createPickup(target);
    }
    for(const {body,initial} of this.crates){body.setTranslation(initial,true);body.setRotation({x:0,y:0,z:0,w:1},true);body.setLinvel({x:0,y:0,z:0},false);body.setAngvel({x:0,y:0,z:0},false);}
    this.world.updateSceneQueries();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.claims.clear();
    for(const target of this.targets.values())this.removeBody(target);
    for(const {body} of this.crates)this.world.removeRigidBody(body);
    for(const collider of this.colliders.values())this.bindings.removed(collider);
    this.colliders.clear();this.targets.clear();this.crates.length=0;
  }
}
