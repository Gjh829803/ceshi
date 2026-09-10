import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import type {Vec3} from './engine-contracts';

export interface InteractionBodySnapshot {
  readonly position:Vector3;
  readonly rotation:Quaternion;
  readonly scale:Vector3;
  readonly sizeMetersXYZ:Vec3;
  readonly massKg:number;
  readonly enabled:boolean;
  readonly movable:boolean;
  readonly stable:boolean;
}
export interface InteractionBodyRelease {
  readonly reason:'place'|'drop'|'water';
  readonly position:Vector3;
  readonly velocity?:Vector3;
}
/** Internal physical-owner capability; semantic actions never receive native handles. */
export interface InteractionBody {
  readonly isValid:boolean;
  readonly isHeld:boolean;
  read():InteractionBodySnapshot;
  hold(owner:object):boolean;
  moveHeld(owner:object,position:Vector3,rotation?:Quaternion):boolean;
  release(owner:object,options:InteractionBodyRelease):boolean;
}
export interface InteractionBodySource {
  readonly body:RAPIER.RigidBody;
  readonly colliders:readonly RAPIER.Collider[];
  readonly enabled:boolean;
  /** Owner-provided physical mass; suspension can temporarily zero Rapier effective mass. */
  readonly massKg:number;
  readonly scale:Vector3;
  readonly sizeMetersXYZ:Vec3;
  project():void;
  changed():void;
  released?(reason:InteractionBodyRelease['reason']):void;
}

/** Used only inside physical owners. Lookup preserves identity across collider rebuilds. */
export class InteractionBodyControl implements InteractionBody {
  private owner:object|undefined;
  private colliderEnabled:boolean[]=[];
  private retired=false;
  constructor(private readonly resolve:()=>InteractionBodySource|undefined){}
  private source(){return this.retired?undefined:this.resolve();}
  get isValid():boolean{return this.source()!==undefined;}
  get isHeld():boolean{return this.owner!==undefined&&this.isValid;}
  read():InteractionBodySnapshot{
    const source=this.source();if(!source)throw new Error('INTERACTION_ENTITY_STALE');
    const {body}=source,rotation=new Quaternion().copy(body.rotation());
    return {position:new Vector3().copy(body.translation()),rotation,scale:source.scale.clone(),sizeMetersXYZ:[...source.sizeMetersXYZ],massKg:source.massKg,enabled:body.isEnabled()&&source.colliders.some(collider=>collider.isEnabled()),movable:body.isDynamic()||this.owner!==undefined,
      stable:new Vector3(0,1,0).applyQuaternion(rotation).y>.98&&new Vector3().copy(body.linvel()).length()<.2&&new Vector3().copy(body.angvel()).length()<.3};
  }
  hold(owner:object):boolean{
    const source=this.source();if(!source||!source.enabled)return false;
    if(this.owner)return this.owner===owner;
    if(!source.body.isDynamic()||!source.body.isEnabled()||!source.colliders.some(collider=>collider.isEnabled()))return false;
    this.owner=owner;this.colliderEnabled=source.colliders.map(collider=>collider.isEnabled());
    // Temporary kinematic ownership keeps the same body and its authored physics settings.
    // Only collider participation changes; no parent-disabled flag delays release until a step.
    for(const collider of source.colliders)collider.setEnabled(false);
    source.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);
    source.body.setNextKinematicTranslation(source.body.translation());source.body.setNextKinematicRotation(source.body.rotation());
    source.changed();return true;
  }
  moveHeld(owner:object,position:Vector3,rotation?:Quaternion):boolean{
    const source=this.source();if(!source||this.owner!==owner)return false;
    if(!position.toArray().every(Number.isFinite)||rotation&&!rotation.toArray().every(Number.isFinite))throw new Error('INTERACTION_POSE_INVALID');
    source.body.setTranslation(position,true);source.body.setNextKinematicTranslation(position);if(rotation){source.body.setRotation(rotation,true);source.body.setNextKinematicRotation(rotation);}
    source.project();source.changed();return true;
  }
  release(owner:object,options:InteractionBodyRelease):boolean{
    const source=this.source();if(!source||this.owner!==owner)return false;
    if(!options.position.toArray().every(Number.isFinite)||options.velocity&&!options.velocity.toArray().every(Number.isFinite))throw new Error('INTERACTION_POSE_INVALID');
    source.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);source.body.setTranslation(options.position,true);source.body.setLinvel(options.velocity??new Vector3(),true);source.body.setAngvel(new Vector3(),false);source.body.resetForces(false);source.body.resetTorques(false);
    for(const [index,collider] of source.colliders.entries())collider.setEnabled(this.colliderEnabled[index]!);
    this.owner=undefined;this.colliderEnabled=[];source.body.setEnabled(source.enabled);source.released?.(options.reason);source.project();source.changed();return true;
  }
  /** Entity disposal invalidates capabilities without re-enabling a body being destroyed. */
  retire():void{this.retired=true;this.owner=undefined;this.colliderEnabled=[];}
}
