import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion, Vector3 } from 'three';
import type { VehicleSpec } from '../config';
import type { MapDefinition } from './types';

export type QueryBody = {kind:'capsule';radius:number;height:number;offset:readonly [number,number,number]} | {kind:'box';halfExtents:readonly [number,number,number];offset:readonly [number,number,number]};
export const PLAYER_BODY:QueryBody={kind:'capsule',radius:.35,height:1.75,offset:[0,.875,0]};
let ready=false;
let initializing:Promise<void>|undefined;
export function initEnvironmentQueries():Promise<void>{return initializing??=RAPIER.init().then(()=>{ready=true;});}
export function vehicleBody(spec:VehicleSpec):QueryBody {
  return (spec as VehicleSpec & {envelope?:QueryBody}).envelope??{kind:'box',halfExtents:[spec.radius,.65,spec.radius],offset:[0,.65,0]};
}
const identity=new Quaternion();
function shape(body:QueryBody){return body.kind==='capsule'?new RAPIER.Capsule(body.height/2-body.radius,body.radius):new RAPIER.Cuboid(...body.halfExtents);}
function center(p:Vector3,body:QueryBody,rotation:Quaternion){return new Vector3(...body.offset).applyQuaternion(rotation).add(p);}
function extents(body:QueryBody,rotation:Quaternion){
  if(body.kind==='capsule')return new Vector3(body.radius,body.height/2,body.radius);
  const e=new Vector3();body.halfExtents.forEach((half,axis)=>{const v=new Vector3().setComponent(axis,half).applyQuaternion(rotation);e.add(new Vector3(Math.abs(v.x),Math.abs(v.y),Math.abs(v.z)));});return e;
}
export interface MoveResult {position:Vector3;grounded:boolean;normal:Vector3;blocked:boolean;normals:Vector3[]}
export interface HumanoidRig {world:RAPIER.World;body:RAPIER.RigidBody;capsule:RAPIER.Collider;controller:RAPIER.KinematicCharacterController}
export interface ActorQueryBody {id:string;position:Vector3;rotation:Quaternion;body:QueryBody}

/** The map owns one world. Borrowed character rigs and interaction bodies share its fixed tick. */
export class EnvironmentQueries {
  private world:RAPIER.World;
  private controller:RAPIER.KinematicCharacterController;
  private disposed=false;
  private staticColliders=new Map<string,RAPIER.Collider>();
  private rigs=new Set<HumanoidRig>();
  private actorColliders=new Map<string,{collider:RAPIER.Collider;bodyKey:string}>();
  private actorColliderHandles=new Set<number>();
  // Vehicle simulation already resolves actor contacts. Excluding its own proxy
  // also keeps floor/spawn/camera queries from hitting the controlled character.
  private queryExcluded=new Set<number>();
  // Do not call collider methods from KCC predicates: that reenters a borrowed
  // WASM collider set. Sensor rejection is a native query flag instead.
  private environmentFilter=(collider:RAPIER.Collider)=>!this.queryExcluded.has(collider.handle);
  constructor(readonly map:MapDefinition){
    if(!ready)throw new Error('await initEnvironmentQueries() before creating a map');
    this.world=new RAPIER.World({x:0,y:-18,z:0});
    for(const box of map.boxes){
      if(box.collision===false)continue;
      const rotation=new Quaternion().setFromEuler(new Euler(...(box.rotation??[0,0,0]),'XYZ'));
      // GJK loses centimetres of contact precision against a kilometre-wide
      // cuboid when the source character radius is only .28 m. Subdivide broad
      // horizontal slabs into exact adjoining volumes, preserving the map surface.
      const horizontal=box.size[1]<=10&&(!box.rotation||box.rotation.every(angle=>angle===0));
      const nx=horizontal?Math.ceil(box.size[0]/64):1,nz=horizontal?Math.ceil(box.size[2]/64):1;
      const width=box.size[0]/nx,depth=box.size[2]/nz;
      for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++){
        const x=box.position[0]-box.size[0]/2+(ix+.5)*width,z=box.position[2]-box.size[2]/2+(iz+.5)*depth;
        const collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(width/2,box.size[1]/2,depth/2).setTranslation(x,box.position[1],z).setRotation(rotation).setFriction(.85));
        if(ix===0&&iz===0)this.staticColliders.set(box.id,collider);
      }
    }
    // Rapier 0.20 updates the scene query acceleration structure during a world step.
    this.world.step();
    this.controller=this.world.createCharacterController(.015);
    this.controller.setMaxSlopeClimbAngle(Math.PI/3);
    this.controller.setMinSlopeSlideAngle(Math.PI/3);
    this.controller.setSlideEnabled(true);
  }
  private assertLive(){if(this.disposed)throw new Error('Environment queries disposed');}
  get colliderCount():number{this.assertLive();return this.world.colliders.len();}
  colliderId(handle:number):string{return [...this.staticColliders].find(([,c])=>c.handle===handle)?.[0]??[...this.actorColliders].find(([,v])=>v.collider.handle===handle)?.[0]??`collider-${handle}`;}
  raycast(origin:Vector3,direction:Vector3,distance:number){
    this.assertLive();const hit=this.world.castRayAndGetNormal(new RAPIER.Ray(origin,direction),distance,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,this.environmentFilter);
    if(!hit)return null;
    const id=[...this.staticColliders].find(([,c])=>c.handle===hit.collider.handle)?.[0]??`collider-${hit.collider.handle}`;
    return {id,distance:hit.timeOfImpact,normal:new Vector3(hit.normal.x,hit.normal.y,hit.normal.z)};
  }
  dispose(){if(!this.disposed){this.rigs.clear();this.staticColliders.clear();this.actorColliders.clear();this.actorColliderHandles.clear();this.queryExcluded.clear();this.world.free();this.disposed=true;}}
  colliderForId(id:string){this.assertLive();return this.staticColliders.get(id);}
  /** Movement envelopes block the character, but are not authored traversal surfaces.
   * Cached handles are safe to inspect from Rapier query predicates. */
  isActorCollider(collider:RAPIER.Collider){this.assertLive();return this.actorColliderHandles.has(collider.handle);}
  createHumanoidRig(position:Vector3,half=.56,radius=.28):HumanoidRig {
    this.assertLive();
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x,position.y+half+radius,position.z));
    const capsule=this.world.createCollider(RAPIER.ColliderDesc.capsule(half,radius).setMass(75).setFriction(0),body);
    const rig={world:this.world,body,capsule,controller:this.world.createCharacterController(.015)};
    this.rigs.add(rig);this.queryExcluded.add(capsule.handle);return rig;
  }
  releaseHumanoidRig(rig:HumanoidRig){
    if(this.disposed||!this.rigs.delete(rig))return;
    this.queryExcluded.delete(rig.capsule.handle);
    this.world.removeCharacterController(rig.controller);this.world.removeRigidBody(rig.body);
  }
  syncActorBodies(actors:readonly ActorQueryBody[]){
    this.assertLive();const live=new Set<string>();
    for(const actor of actors){
      if(live.has(actor.id))throw new Error(`Duplicate actor collider: ${actor.id}`);
      live.add(actor.id);const bodyKey=JSON.stringify(actor.body);
      let entry=this.actorColliders.get(actor.id);
      if(entry&&entry.bodyKey!==bodyKey){this.queryExcluded.delete(entry.collider.handle);this.actorColliderHandles.delete(entry.collider.handle);this.world.removeCollider(entry.collider,false);this.actorColliders.delete(actor.id);entry=undefined;}
      if(!entry){
        const b=actor.body,desc=b.kind==='capsule'?RAPIER.ColliderDesc.capsule(b.height/2-b.radius,b.radius):RAPIER.ColliderDesc.cuboid(...b.halfExtents);
        entry={collider:this.world.createCollider(desc),bodyKey};this.actorColliders.set(actor.id,entry);this.actorColliderHandles.add(entry.collider.handle);this.queryExcluded.add(entry.collider.handle);
      }
      entry.collider.setTranslation(center(actor.position,actor.body,actor.rotation));entry.collider.setRotation(actor.rotation);
    }
    for(const [id,entry] of this.actorColliders)if(!live.has(id)){this.queryExcluded.delete(entry.collider.handle);this.actorColliderHandles.delete(entry.collider.handle);this.world.removeCollider(entry.collider,false);this.actorColliders.delete(id);}
  }
  stepPhysics(dt:number){this.assertLive();this.world.timestep=dt;this.world.step();}
  waterAt(position:Vector3){return this.map.water.find(w=>position.x>=w.min[0]&&position.x<=w.max[0]&&position.z>=w.min[2]&&position.z<=w.max[2]);}
  waterContains(position:Vector3,radius=0){const w=this.waterAt(position);return !!w&&position.x-radius>=w.min[0]&&position.x+radius<=w.max[0]&&position.z-radius>=w.min[2]&&position.z+radius<=w.max[2];}
  support(position:Vector3,maxDrop=100,step=.45){
    this.assertLive();
    const origin=position.clone();origin.y+=step;
    const hit=this.world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:0,y:-1,z:0}),maxDrop+step,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,this.environmentFilter);
    return hit&&hit.normal.y>.25?{height:origin.y-hit.timeOfImpact,normal:new Vector3(hit.normal.x,hit.normal.y,hit.normal.z)}:null;
  }
  overlaps(position:Vector3,body:QueryBody=PLAYER_BODY,rotation=identity){this.assertLive();return !!this.world.intersectionWithShape(center(position,body,rotation),rotation,shape(body),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,this.environmentFilter);}
  safeSpawn(position:Vector3,body:QueryBody=PLAYER_BODY,rotation=identity):Vector3|null {
    const p=position.clone();
    const floor=this.support(p,5,.45);
    const offset=new Vector3(...body.offset).applyQuaternion(rotation);
    const extent=body.kind==='capsule'?body.height/2:body.halfExtents.reduce((sum,h,axis)=>{const v=new Vector3();v.setComponent(axis,h);return sum+Math.abs(v.applyQuaternion(rotation).y);},0);
    if(floor&&p.y+offset.y-extent<floor.height+.02)p.y=floor.height+extent-offset.y+.025;
    const c=center(p,body,rotation),e=extents(body,rotation);
    if(c.clone().sub(e).toArray().some((v,i)=>v<this.map.bounds.min[i]!)||c.clone().add(e).toArray().some((v,i)=>v>this.map.bounds.max[i]!)||this.overlaps(p,body,rotation))return null;
    return p;
  }
  move(position:Vector3,delta:Vector3,body:QueryBody=PLAYER_BODY,rotation=identity,step=0):MoveResult {
    this.assertLive();
    const c=center(position,body,rotation);
    const descriptor=body.kind==='capsule'?RAPIER.ColliderDesc.capsule(body.height/2-body.radius,body.radius):RAPIER.ColliderDesc.cuboid(...body.halfExtents);
    const proxy=this.world.createCollider(descriptor.setTranslation(c.x,c.y,c.z).setRotation(rotation));
    if(step>0){this.controller.enableAutostep(step,.12,false);this.controller.enableSnapToGround(.12);}else{this.controller.disableAutostep();this.controller.disableSnapToGround();}
    this.controller.computeColliderMovement(proxy,delta,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,other=>other.handle!==proxy.handle&&this.environmentFilter(other));
    const movement=this.controller.computedMovement();
    const p=position.clone().add(new Vector3(movement.x,movement.y,movement.z));
    const normals:Vector3[]=[];
    for(let n=0;n<this.controller.numComputedCollisions();n++){const hit=this.controller.computedCollision(n);if(hit)normals.push(new Vector3(hit.normal1.x,hit.normal1.y,hit.normal1.z));}
    const grounded=this.controller.computedGrounded();
    this.world.removeCollider(proxy,false);
    // Short stair treads can be narrower than a capsule's diameter. Try an explicit
    // up / across / down sweep, with full headroom checks, when autostep stalls.
    const horizontal=new Vector3(delta.x,0,delta.z),travel=new Vector3(p.x-position.x,0,p.z-position.z);
    if(step>0&&horizontal.lengthSq()>1e-8&&travel.dot(horizontal)<horizontal.lengthSq()*.85&&this.support(position,step+.08,.02)){
      const raised=this.move(position,new Vector3(0,step,0),body,rotation,0);
      if(raised.position.y-position.y>=step-.025){
        const across=this.move(raised.position,horizontal,body,rotation,0);
        const progress=new Vector3(across.position.x-position.x,0,across.position.z-position.z).dot(horizontal);
        if(progress>travel.dot(horizontal)+1e-6){
          const down=this.move(across.position,new Vector3(0,-step-.06,0),body,rotation,0);
          // At a ramp lip Rapier can return a valid climbable support normal
          // while computedGrounded is false. Accept only a clear, bounded step
          // landing on the same <=60 degree support used by this controller.
          const supported=down.grounded||down.normals.some(normal=>normal.y>=.5);
          if(supported&&down.position.y>=position.y-.08&&!this.overlaps(down.position,body,rotation))return {...down,grounded:true,blocked:true};
        }
      }
    }
    const offset=new Vector3(...body.offset).applyQuaternion(rotation),extent=extents(body,rotation),min=new Vector3(...this.map.bounds.min).add(extent).sub(offset),max=new Vector3(...this.map.bounds.max).sub(extent).sub(offset);
    for(let axis=0;axis<3;axis++){if(p.getComponent(axis)<min.getComponent(axis))normals.push(new Vector3().setComponent(axis,1));if(p.getComponent(axis)>max.getComponent(axis))normals.push(new Vector3().setComponent(axis,-1));}
    p.clamp(min,max);
    return {position:p,grounded,normal:normals[0]??new Vector3(0,1,0),normals,blocked:p.clone().sub(position).distanceToSquared(delta)>1e-6};
  }
  cameraCast(from:Vector3,to:Vector3,radius=.25):Vector3 {
    this.assertLive();const delta=to.clone().sub(from);
    const hit=this.world.castShape(from,identity,delta,new RAPIER.Ball(radius),.015,1,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,this.environmentFilter);
    return hit?from.clone().addScaledVector(delta,Math.max(0,hit.time_of_impact-.002)):to.clone();
  }
}
export const createQueries=(map:MapDefinition)=>new EnvironmentQueries(map);
