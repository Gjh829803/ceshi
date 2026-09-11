import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3} from 'three';
import {DYNAMIC_PROP_COLLISION_GROUPS} from '../../config/physics';
import {InteractionBodyControl} from '../../interaction-body';
import type {PhysicsColliderBindings} from '../../physics-collider-bindings';
import type {EnvironmentDefinition,MapInteraction} from './types';

type PickupBody={body:RAPIER.RigidBody;collider:RAPIER.Collider;control:InteractionBodyControl};

/** Map-authored physical props. Interaction semantics borrow capabilities from this owner. */
export class EnvironmentInteractionProps {
  private readonly pickups=new Map<string,PickupBody>();
  readonly crates:{id:string;body:RAPIER.RigidBody;size:number;initial:Vector3}[]=[];
  private readonly crateColliders=new Map<string,RAPIER.Collider>();
  private disposed=false;
  constructor(private readonly world:RAPIER.World,private readonly map:EnvironmentDefinition,private readonly bindings:PhysicsColliderBindings){
    try{
      for(const definition of map.interactions??[])if(definition.kind==='pickup')this.createPickup(definition);
      for(const spec of map.looseCrates??[]){
        const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...spec.position).setCcdEnabled(true));
        this.crates.push({id:spec.id,body,size:spec.size,initial:new Vector3(...spec.position)});
        const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(spec.size/2,spec.size/2,spec.size/2).setMass(7).setFriction(.7).setRestitution(.1).setCollisionGroups(DYNAMIC_PROP_COLLISION_GROUPS),body);
        this.crateColliders.set(spec.id,collider);bindings.added(spec.id,collider);
      }
    }catch(error){this.dispose();throw error;}
  }
  private createPickup(definition:MapInteraction):void{
    const size=definition.size??[.13,.13,.13],body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...definition.position).setGravityScale(9.81/18).setCcdEnabled(true).lockRotations().setSleeping(true));
    let collider:RAPIER.Collider;
    try{collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(size[0]/2,size[1]/2,size[2]/2).setMass(definition.massKg??.3).setCollisionGroups(DYNAMIC_PROP_COLLISION_GROUPS),body);}catch(error){this.world.removeRigidBody(body);throw error;}
    const control=new InteractionBodyControl(()=>this.disposed||!this.pickups.has(definition.id)?undefined:{body,colliders:[collider],enabled:true,massKg:collider.mass(),scale:new Vector3(1,1,1),sizeMetersXYZ:[size[0],size[1],size[2]],centerOffsetMetersXYZ:[0,0,0],project:()=>{},changed:()=>this.bindings.changed([collider]),
      released:reason=>{if(reason==='water'){body.setGravityScale(1,true);collider.setMass(Math.max(.01,definition.massKg??1));collider.setFriction(.65);}}});
    this.pickups.set(definition.id,{body,collider,control});this.bindings.added(definition.id,collider);
  }
  body(id:string){return this.pickups.get(id)?.control;}
  colliderForId(id:string){return this.pickups.get(id)?.collider??this.crateColliders.get(id);}
  private clearPickups():void{
    for(const {body,collider,control} of this.pickups.values()){control.retire();this.bindings.removed(collider);this.world.removeRigidBody(body);}this.pickups.clear();
  }
  reset():void{
    this.clearPickups();for(const definition of this.map.interactions??[])if(definition.kind==='pickup')this.createPickup(definition);
    for(const {body,initial} of this.crates){body.setTranslation(initial,true);body.setRotation({x:0,y:0,z:0,w:1},true);body.setLinvel({x:0,y:0,z:0},false);body.setAngvel({x:0,y:0,z:0},false);}
    this.world.updateSceneQueries();
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;this.clearPickups();
    for(const collider of this.crateColliders.values())this.bindings.removed(collider);
    for(const {body} of this.crates)this.world.removeRigidBody(body);
    this.crates.length=0;this.crateColliders.clear();
  }
}
