import RAPIER from '@dimforge/rapier3d-compat';
import { CameraCollisionSolver } from '@whitebox-world/camera-collision';
import { probeHumanoidCamera } from '../camera-queries';
import type { Vec3 } from '../../contracts';
import { Euler, Quaternion, Vector3 } from 'three';
import type { VehicleSpec } from '../config';
import type { EnvironmentDefinition } from './types';

export type QueryBody = {kind:'capsule';radius:number;height:number;offset:readonly [number,number,number]} | {kind:'box';halfExtents:readonly [number,number,number];offset:readonly [number,number,number]};
export const HUMANOID_BODY:QueryBody={kind:'capsule',radius:.35,height:1.75,offset:[0,.875,0]};
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
  if(body.kind==='capsule'){const axis=new Vector3(0,body.height/2-body.radius,0).applyQuaternion(rotation);return new Vector3(Math.abs(axis.x)+body.radius,Math.abs(axis.y)+body.radius,Math.abs(axis.z)+body.radius);}
  const e=new Vector3();body.halfExtents.forEach((half,axis)=>{const v=new Vector3().setComponent(axis,half).applyQuaternion(rotation);e.add(new Vector3(Math.abs(v.x),Math.abs(v.y),Math.abs(v.z)));});return e;
}
export interface BodyPose {
  position: Vector3;
  rotation: Quaternion;
  body: QueryBody;
}
export interface BodyQueryFilter {
  readonly excludedColliderHandles?: ReadonlySet<number>;
  readonly excludedActorIds?: ReadonlySet<string>;
}
function validatePose(pose: BodyPose) {
  const b = pose.body,
    dimensions =
      b.kind === "capsule" ? [b.radius, b.height] : [...b.halfExtents];
  if (
    ![
      ...pose.position.toArray(),
      ...pose.rotation.toArray(),
      ...b.offset,
      ...dimensions,
    ].every(Number.isFinite) ||
    dimensions.some((n) => n <= 0) ||
    Math.abs(pose.rotation.lengthSq() - 1) > 1e-5 ||
    (b.kind === "capsule" && b.height < 2 * b.radius)
  )
    throw new Error("HUMANOID_QUERY_INVALID");
}
export interface MoveResult {position:Vector3;grounded:boolean;normal:Vector3;blocked:boolean;normals:Vector3[];contacts?:{point:Vector3;normal:Vector3}[]}
export interface VehicleRigidRig {token:object;body:RAPIER.RigidBody;colliders:RAPIER.Collider[];beforeStep:(dt:number)=>void;afterStep:()=>void}
export interface HumanoidRig {world:RAPIER.World;body:RAPIER.RigidBody;capsule:RAPIER.Collider;controller:RAPIER.KinematicCharacterController}
export interface ActorQueryBody {id:string;actorId?:string;physical?:boolean;position:Vector3;rotation:Quaternion;body:QueryBody}

/** The map owns one world. Borrowed character rigs and interaction bodies share its fixed tick. */
export class EnvironmentQueries {
  private world:RAPIER.World;
  private vehicleRigs=new Map<string,VehicleRigidRig>();
  private vehicleColliderIds=new Map<number,string>();
  private controller:RAPIER.KinematicCharacterController;
  private disposed=false;
  private staticColliders=new Map<string,RAPIER.Collider>();
  private staticColliderIds=new Map<number,string>();
  private propBodies=new Map<string,{body:RAPIER.RigidBody;origin:Vector3}>();
  private propBoxes=new Map<string,string>();
  private rigs=new Set<HumanoidRig>();
  private actorColliders=new Map<string,{collider:RAPIER.Collider;bodyKey:string;actorId:string}>();
  private actorColliderHandles=new Set<number>();
  // General floor/spawn queries omit actor proxies. Vehicle motion temporarily
  // includes other actors, using their native rig or authored compound collider.
  private queryExcluded=new Set<number>();
  private motionFilter:((collider:RAPIER.Collider)=>boolean)|undefined;
  private motionColliders:readonly RAPIER.Collider[]=[];
  private suppressContactImpulses=false;
  // Do not call collider methods from KCC predicates: that reenters a borrowed
  // WASM collider set. Sensor rejection is a native query flag instead.
  private environmentFilter=(collider:RAPIER.Collider)=>this.motionFilter?this.motionFilter(collider):!this.queryExcluded.has(collider.handle);
  constructor(readonly map:EnvironmentDefinition){
    if(!ready)throw new Error('await initEnvironmentQueries() before creating a map');
    this.world=new RAPIER.World({x:0,y:-18,z:0});
    const groups=new Map<string,typeof map.boxes[number][]>();
    for(const box of map.boxes)if(box.rigidGroup){const g=box.rigidGroup;if(box.collision===false||!g.id||!Number.isFinite(g.massKg)||g.massKg<=0)throw new Error('HUMANOID_PROP_INVALID');const list=groups.get(g.id)??[];list.push(box);groups.set(g.id,list);}
    for(const [id,boxes] of groups){
      const mass=boxes[0]!.rigidGroup!.massKg;if(boxes.some(b=>b.rigidGroup!.massKg!==mass))throw new Error('HUMANOID_PROP_MASS_CONFLICT');
      const volume=boxes.reduce((s,b)=>s+b.size[0]*b.size[1]*b.size[2],0),origin=new Vector3();
      for(const b of boxes)origin.addScaledVector(new Vector3(...b.position),b.size[0]*b.size[1]*b.size[2]/volume);
      const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x,origin.y,origin.z).setGravityScale(9.81/18).setCcdEnabled(true).setLinearDamping(.15).setAngularDamping(.3).setSleeping(true));
      this.propBodies.set(id,{body,origin});
      for(const b of boxes){const p=new Vector3(...b.position).sub(origin),rotation=new Quaternion().setFromEuler(new Euler(...(b.rotation??[0,0,0])));
        // 排除载具查询代理（第 3 组）；只与真正的动态车身求解，避免重复的静态包围盒卡住物品。
        const collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(b.size[0]/2,b.size[1]/2,b.size[2]/2).setTranslation(p.x,p.y,p.z).setRotation(rotation).setDensity(mass/volume).setFriction(.55).setRestitution(.08).setCollisionGroups(0x0001ffeb),body);
        this.staticColliders.set(b.id,collider);this.staticColliderIds.set(collider.handle,b.id);this.propBoxes.set(b.id,id);
      }
    }
    for(const box of map.boxes){
      if(box.collision===false||box.rigidGroup)continue;
      const rotation=new Quaternion().setFromEuler(new Euler(...(box.rotation??[0,0,0]),'XYZ'));
      // GJK loses centimetres of contact precision against a kilometre-wide
      // cuboid when the source character radius is only .28 m. Subdivide broad
      // horizontal slabs into exact adjoining volumes, preserving the map surface.
      const horizontal=box.size[1]<=10&&(!box.rotation||box.rotation.every(angle=>angle===0));
      const nx=horizontal?Math.ceil(box.size[0]/64):1,nz=horizontal?Math.ceil(box.size[2]/64):1;
      const width=box.size[0]/nx,depth=box.size[2]/nz;
      for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++){
        const x=box.position[0]-box.size[0]/2+(ix+.5)*width,z=box.position[2]-box.size[2]/2+(iz+.5)*depth;
        const collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(width/2,box.size[1]/2,depth/2).setTranslation(x,box.position[1],z).setRotation(rotation).setFriction(.85).setCollisionGroups(0x0001ffff));
        this.staticColliderIds.set(collider.handle,box.id);
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
  colliderId(handle:number):string{return this.staticColliderIds.get(handle)??this.vehicleColliderIds.get(handle)??[...this.actorColliders].find(([,v])=>v.collider.handle===handle)?.[0]??`collider-${handle}`;}
  wheelSweep(origin:Vector3,rotation:Quaternion,direction:Vector3,radius:number,width:number,distance:number){
    this.assertLive();
    const hit=this.world.castShape(origin,rotation,direction,new RAPIER.Cylinder(width/2,radius),0,distance,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,this.environmentFilter);
    if(!hit)return null;
    return {distance:hit.time_of_impact,normal:new Vector3(hit.normal1.x,hit.normal1.y,hit.normal1.z),point:new Vector3(hit.witness1.x,hit.witness1.y,hit.witness1.z),friction:hit.collider.friction()};
  }
  raycast(origin:Vector3,direction:Vector3,distance:number){
    this.assertLive();const hit=this.world.castRayAndGetNormal(new RAPIER.Ray(origin,direction),distance,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,this.environmentFilter);
    if(!hit)return null;
    const id=[...this.staticColliders].find(([,c])=>c.handle===hit.collider.handle)?.[0]??`collider-${hit.collider.handle}`;
    return {id,friction:hit.collider.friction(),distance:hit.timeOfImpact,normal:new Vector3(hit.normal.x,hit.normal.y,hit.normal.z)};
  }
  dispose(){if(!this.disposed){this.rigs.clear();this.vehicleRigs.clear();this.vehicleColliderIds.clear();this.propBodies.clear();this.propBoxes.clear();this.staticColliders.clear();this.staticColliderIds.clear();this.actorColliders.clear();this.actorColliderHandles.clear();this.queryExcluded.clear();this.world.free();this.disposed=true;}}
  colliderForId(id:string){this.assertLive();return this.staticColliders.get(id);}
  propAnchor(boxId:string,point:readonly number[]){const group=this.propBodies.get(this.propBoxes.get(boxId)??'');if(!group)return null;const r=group.body.rotation(),rotation=new Quaternion(r.x,r.y,r.z,r.w),p=group.body.translation();return {position:new Vector3(point[0],point[1],point[2]).sub(group.origin).applyQuaternion(rotation).add(new Vector3(p.x,p.y,p.z)),rotation,stable:new Vector3(0,1,0).applyQuaternion(rotation).y>.98&&new Vector3().copy(group.body.linvel()).length()<.2&&new Vector3().copy(group.body.angvel()).length()<.3};}
  propBoxPose(id:string){if(!this.propBoxes.has(id))return null;const c=this.staticColliders.get(id)!;return {position:c.translation(),rotation:c.rotation()};}
  resetProps(){for(const {body,origin} of this.propBodies.values()){body.setTranslation(origin,true);body.setRotation({x:0,y:0,z:0,w:1},true);body.setLinvel({x:0,y:0,z:0},false);body.setAngvel({x:0,y:0,z:0},false);body.resetForces(false);body.resetTorques(false);body.sleep();}this.world.propagateModifiedBodyPositionsToColliders();}
  /** Movement envelopes block the character, but are not authored traversal surfaces.
   * Cached handles are safe to inspect from Rapier query predicates. */
  isActorCollider(collider:RAPIER.Collider){this.assertLive();return this.actorColliderHandles.has(collider.handle);}
  createHumanoidRig(position:Vector3,half=.56,radius=.28):HumanoidRig {
    this.assertLive();
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x,position.y+half+radius,position.z));
    const capsule=this.world.createCollider(RAPIER.ColliderDesc.capsule(half,radius).setMass(75).setFriction(0).setCollisionGroups(0x0008ffff),body);
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
        entry={collider:this.world.createCollider(desc.setCollisionGroups(0x0004ffff)),bodyKey,actorId:actor.actorId??actor.id};this.actorColliders.set(actor.id,entry);this.actorColliderHandles.add(entry.collider.handle);this.queryExcluded.add(entry.collider.handle);
      }
      entry.collider.setCollisionGroups(actor.physical?0x0004ffff:0x0010ffff);entry.collider.setTranslation(center(actor.position,actor.body,actor.rotation));entry.collider.setRotation(actor.rotation);
    }
    for(const [id,entry] of this.actorColliders)if(!live.has(id)){this.queryExcluded.delete(entry.collider.handle);this.actorColliderHandles.delete(entry.collider.handle);this.world.removeCollider(entry.collider,false);this.actorColliders.delete(id);}
  }
  /** Vehicle controllers query the same world and actual hulls. Exclude every
   * part of self and the duplicate proxy of a native rig. Predicates read only
   * cached handles, without reentering the borrowed WASM collider set. */
  withVehicleCollisions<T>(actorId:string,move:()=>T):T {
    const excluded=new Set(this.queryExcluded),colliders:RAPIER.Collider[]=[];
    for(const entry of this.actorColliders.values())if(entry.actorId!==actorId&&!this.vehicleRigs.has(entry.actorId))colliders.push(entry.collider);
    for(const [id,rig] of this.vehicleRigs)if(id!==actorId)colliders.push(...rig.colliders.filter(c=>c.isEnabled()));
    for(const collider of colliders)excluded.delete(collider.handle);
    const previous=this.motionFilter,previousColliders=this.motionColliders;
    this.motionFilter=collider=>!excluded.has(collider.handle);this.motionColliders=colliders;
    try{return move();}finally{this.motionFilter=previous;this.motionColliders=previousColliders;}
  }
  /** Motion prediction may query contacts, but only the native chassis applies
   * the resulting forces during the shared physics step. */
  withoutContactImpulses<T>(read:()=>T):T {
    const previous=this.suppressContactImpulses;this.suppressContactImpulses=true;
    try{return read();}finally{this.suppressContactImpulses=previous;}
  }
  /** Direct per-collider queries read current poses without advancing Rapier's broadphase. */
  private directColliders(filter: BodyQueryFilter = {}): RAPIER.Collider[] {
    this.assertLive();
    const excluded = new Set(filter.excludedColliderHandles);
    for(const [id,rig] of this.vehicleRigs)if(filter.excludedActorIds?.has(id))for(const collider of rig.colliders)excluded.add(collider.handle);
    for (const entry of this.actorColliders.values()) {
      // Actor part IDs are retained; exclusion names the exact instance, never a prefix.
      if (filter.excludedActorIds?.has(entry.actorId))
        excluded.add(entry.collider.handle);
    }
    const colliders: RAPIER.Collider[] = [];
    this.world.colliders.forEach((c) => {
      if (c.isEnabled() && !c.isSensor() && !excluded.has(c.handle))
        colliders.push(c);
    });
    return colliders;
  }
  bodyOverlap(
    pose: BodyPose,
    filter?: BodyQueryFilter,
    contactToleranceMeters = 0,
  ): boolean {
    validatePose(pose);
    if (!Number.isFinite(contactToleranceMeters) || contactToleranceMeters < 0)
      throw new Error("HUMANOID_QUERY_INVALID");
    contactToleranceMeters = Math.min(contactToleranceMeters, this.controller.offset());
    const c = center(pose.position, pose.body, pose.rotation),
      e = extents(pose.body, pose.rotation);
    if (
      c
        .clone()
        .sub(e)
        .toArray()
        .some((v, i) => v < this.map.bounds.min[i]!) ||
      c
        .clone()
        .add(e)
        .toArray()
        .some((v, i) => v > this.map.bounds.max[i]!)
    )
      return true;
    const body = shape(pose.body);
    return this.directColliders(filter).some((other) => {
      const hit = body.contactShape(
        c,
        pose.rotation,
        other.shape,
        other.translation(),
        other.rotation(),
        0,
      );
      // Only upward support contact receives KCC numerical tolerance. Walls never do.
      return (
        !!hit &&
        hit.distance < 0 &&
        !(
          hit.normal2.y >= Math.SQRT1_2 &&
          hit.distance >= -contactToleranceMeters
        )
      );
    });
  }
  bodyPathBlocked(
    poses: readonly BodyPose[],
    filter?: BodyQueryFilter,
  ): boolean {
    const clearance =
      this.rigs.values().next().value?.controller.offset() ??
      this.controller.offset();
    for (const pose of poses)
      if (this.bodyOverlap(pose, filter, clearance)) return true;
    const colliders = this.directColliders(filter);
    for (let n = 1; n < poses.length; n++) {
      const from = poses[n - 1]!,
        to = poses[n]!;
      // Paths translate a fixed upright capsule. Rotation/shape changes need explicit segments.
      if (
        from.rotation.angleTo(to.rotation) > 1e-6 ||
        JSON.stringify(from.body) !== JSON.stringify(to.body)
      )
        throw new Error("HUMANOID_QUERY_INVALID");
      const start = center(from.position, from.body, from.rotation),
        delta = center(to.position, to.body, to.rotation).sub(start),
        body = shape(from.body);
      if (delta.lengthSq() < 1e-12) continue;
      for (const other of colliders) {
        const hit = body.castShape(
          start,
          from.rotation,
          delta,
          other.shape,
          other.translation(),
          other.rotation(),
          { x: 0, y: 0, z: 0 },
          clearance,
          1,
          true,
        );
        if (!hit) continue;
        const contact = body.contactShape(
          start,
          from.rotation,
          other.shape,
          other.translation(),
          other.rotation(),
          clearance,
        );
        if (
          contact &&
          contact.normal2.y >= Math.SQRT1_2 &&
          contact.distance >= -clearance &&
          delta.dot(
            new Vector3(
              contact.normal2.x,
              contact.normal2.y,
              contact.normal2.z,
            ),
          ) >= -1e-8
        )
          continue;
        return true;
      }
    }
    return false;
  }
  standingSupport(
    position: Vector3,
    maximumDropMeters: number,
    maximumSlopeRadians: number,
  ): { height: number; normal: Vector3 } | null {
    if (
      ![...position.toArray(), maximumDropMeters, maximumSlopeRadians].every(
        Number.isFinite,
      ) ||
      maximumDropMeters < 0 ||
      maximumSlopeRadians < 0 ||
      maximumSlopeRadians >= Math.PI / 2
    )
      throw new Error("HUMANOID_QUERY_INVALID");
    const ray = new RAPIER.Ray(position, { x: 0, y: -1, z: 0 });
    let nearest: RAPIER.RayIntersection | null = null;
    for (const other of this.directColliders({
      excludedColliderHandles: this.queryExcluded,
    })) {
      const hit = other.castRayAndGetNormal(ray, maximumDropMeters, true);
      if (hit && (!nearest || hit.timeOfImpact < nearest.timeOfImpact))
        nearest = hit;
    }
    return nearest && nearest.normal.y >= Math.cos(maximumSlopeRadians)
      ? {
          height: position.y - nearest.timeOfImpact,
          normal: new Vector3(
            nearest.normal.x,
            nearest.normal.y,
            nearest.normal.z,
          ),
        }
      : null;
  }
  releaseVehicleRig(id:string){const rig=this.vehicleRigs.get(id);if(!rig)return;for(const collider of rig.colliders){this.queryExcluded.delete(collider.handle);this.vehicleColliderIds.delete(collider.handle);}this.world.removeRigidBody(rig.body);this.vehicleRigs.delete(id);}
  retainVehicleRigs(ids:ReadonlySet<string>){for(const id of this.vehicleRigs.keys())if(!ids.has(id))this.releaseVehicleRig(id);}
  vehicleRig(id:string,token:object,position:Vector3,rotation:Quaternion,mass:number,halfWidth:number,halfLength:number,height:number,centerOfMassHeight:number,parts?:readonly {body:QueryBody;rotation?:Quaternion}[],friction=.6,restitution=.08):VehicleRigidRig {
    this.assertLive();const previous=this.vehicleRigs.get(id);if(previous?.token===token)return previous;if(previous)this.releaseVehicleRig(id);
    const inertia={x:mass*(4*halfLength*halfLength+1)/12,y:mass*(4*halfWidth*halfWidth+4*halfLength*halfLength)/12,z:mass*(4*halfWidth*halfWidth+1)/12};
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x,position.y,position.z).setRotation(rotation).setGravityScale(9.81/18).setCcdEnabled(true).setAngularDamping(.7).setAdditionalMassProperties(mass,{x:0,y:centerOfMassHeight,z:0},inertia,{x:0,y:0,z:0,w:1}));
    // 下车身两端收窄并斜切；驾驶舱另设碰撞体，避免整个包围盒形成巨大平底车头。
    const points:number[]=[];for(const side of [-1,1])for(const x of [-halfWidth,halfWidth]){points.push(x,.32,side*halfLength*.64,x,1.02,side*halfLength*.64,x*.88,.52,side*halfLength,x*.88,.72,side*halfLength);}
    const hull=RAPIER.ColliderDesc.convexHull(new Float32Array(points));if(!hull){this.world.removeRigidBody(body);throw new Error('HUMANOID_CHASSIS_HULL_INVALID');}
    const cabin=RAPIER.ColliderDesc.cuboid(halfWidth*.72,Math.max(.2,(height-1.02)/2),halfLength*.4).setTranslation(0,(height+1.02)/2,-.15);
    const shapes=parts?parts.map(part=>{
      const b=part.body,r=b.kind==='box'?Math.min(.2,...b.halfExtents.map(n=>n*.25)):0;
      // Rounded authored hull edges slide across adjoining terrain slabs instead
      // of catching their internal edges; the outer dimensions stay unchanged.
      const desc=b.kind==='box'?RAPIER.ColliderDesc.roundCuboid(b.halfExtents[0]-r,b.halfExtents[1]-r,b.halfExtents[2]-r,r):RAPIER.ColliderDesc.capsule(b.height/2-b.radius,b.radius);
      desc.setTranslation(...b.offset);if(part.rotation)desc.setRotation(part.rotation);return desc;
    }):[hull,cabin];
    const colliders=shapes.map(desc=>{
      if(parts)desc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setContactSkin(.015);
      return this.world.createCollider(desc.setDensity(0).setFriction(friction).setRestitution(restitution).setCollisionGroups(0x00020013),body);
    });
    colliders.forEach((collider,index)=>{this.queryExcluded.add(collider.handle);this.vehicleColliderIds.set(collider.handle,`${id}:${index}`);});
    const rig:VehicleRigidRig={token,body,colliders,beforeStep:()=>{},afterStep:()=>{}};this.vehicleRigs.set(id,rig);return rig;
  }
  /** Measured contacts from the shared solver, never an extra collision world. */
  vehicleContactNormals(rig:VehicleRigidRig):Vector3[]{
    const normals:Vector3[]=[];
    for(const collider of rig.colliders)this.world.contactPairsWith(collider,other=>{
      if(other.parent()?.handle===rig.body.handle)return;
      this.world.contactPair(collider,other,(manifold,flipped)=>{
        if(!manifold.numSolverContacts())return;
        const n=manifold.normal();normals.push(new Vector3(n.x,n.y,n.z).multiplyScalar(flipped?1:-1));
      });
    });
    return normals;
  }
  stepPhysics(dt:number){this.assertLive();if(dt<=0)return;const count=this.vehicleRigs.size?Math.max(1,Math.ceil(dt/(1/120))):1;this.world.timestep=dt/count;for(let n=0;n<count;n++){for(const rig of this.vehicleRigs.values())rig.beforeStep(dt/count);this.world.step();for(const rig of this.vehicleRigs.values())rig.afterStep();}}
  waterAt(position:Vector3){return this.map.water.find(w=>position.x>=w.min[0]&&position.x<=w.max[0]&&position.z>=w.min[2]&&position.z<=w.max[2]);}
  waterContains(position:Vector3,radius=0){const w=this.waterAt(position);return !!w&&position.x-radius>=w.min[0]&&position.x+radius<=w.max[0]&&position.z-radius>=w.min[2]&&position.z+radius<=w.max[2];}
  support(position:Vector3,maxDrop=100,step=.45){
    this.assertLive();
    const origin=position.clone();origin.y+=step;
    const hit=this.world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:0,y:-1,z:0}),maxDrop+step,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,this.environmentFilter);
    return hit&&hit.normal.y>.25?{height:origin.y-hit.timeOfImpact,normal:new Vector3(hit.normal.x,hit.normal.y,hit.normal.z)}:null;
  }
  overlaps(position:Vector3,body:QueryBody=HUMANOID_BODY,rotation=identity){
    this.assertLive();const c=center(position,body,rotation),s=shape(body);
    return !!this.world.intersectionWithShape(c,rotation,s,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,this.environmentFilter)
      ||this.motionColliders.some(other=>{const hit=s.contactShape(c,rotation,other.shape,other.translation(),other.rotation(),0);return !!hit&&hit.distance<0;});
  }
  safeSpawn(position:Vector3,body:QueryBody=HUMANOID_BODY,rotation=identity):Vector3|null {
    const p=position.clone();
    const floor=this.support(p,5,.45);
    const offset=new Vector3(...body.offset).applyQuaternion(rotation);
    const extent=body.kind==='capsule'?body.height/2:body.halfExtents.reduce((sum,h,axis)=>{const v=new Vector3();v.setComponent(axis,h);return sum+Math.abs(v.applyQuaternion(rotation).y);},0);
    if(floor&&p.y+offset.y-extent<floor.height+.02)p.y=floor.height+extent-offset.y+.025;
    const c=center(p,body,rotation),e=extents(body,rotation);
    if(c.clone().sub(e).toArray().some((v,i)=>v<this.map.bounds.min[i]!)||c.clone().add(e).toArray().some((v,i)=>v>this.map.bounds.max[i]!)||this.overlaps(p,body,rotation))return null;
    return p;
  }
  move(position:Vector3,delta:Vector3,body:QueryBody=HUMANOID_BODY,rotation=identity,step=0,push?:{massKg:number;dt:number}):MoveResult {
    this.assertLive();
    if(this.suppressContactImpulses)push=undefined;
    const c=center(position,body,rotation);
    const descriptor=body.kind==='capsule'?RAPIER.ColliderDesc.capsule(body.height/2-body.radius,body.radius):RAPIER.ColliderDesc.cuboid(...body.halfExtents);
    const proxy=this.world.createCollider(descriptor.setTranslation(c.x,c.y,c.z).setRotation(rotation));
    if(step>0){this.controller.enableAutostep(step,.12,false);this.controller.enableSnapToGround(.12);}else{this.controller.disableAutostep();this.controller.disableSnapToGround();}
    // 只有实际移动传入质量；探路、复位和台阶候选查询不得推动场景物体。
    const timestep=this.world.timestep;
    this.controller.setApplyImpulsesToDynamicBodies(!!push);
    this.controller.setCharacterMass(push?.massKg??null);
    if(push)this.world.timestep=push.dt;
    try{this.controller.computeColliderMovement(proxy,delta,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,other=>other.handle!==proxy.handle&&this.environmentFilter(other));}
    finally{this.world.timestep=timestep;this.controller.setApplyImpulsesToDynamicBodies(false);this.controller.setCharacterMass(null);}
    const movement=this.controller.computedMovement();
    const p=position.clone().add(new Vector3(movement.x,movement.y,movement.z));
    const normals:Vector3[]=[],contacts:{point:Vector3;normal:Vector3}[]=[];
    for(let n=0;n<this.controller.numComputedCollisions();n++){const hit=this.controller.computedCollision(n);if(hit){const normal=new Vector3(hit.normal1.x,hit.normal1.y,hit.normal1.z);normals.push(normal);contacts.push({normal,point:new Vector3(hit.witness1.x,hit.witness1.y,hit.witness1.z)});}}
    let grounded=this.controller.computedGrounded();
    this.world.removeCollider(proxy,false);
    // Rapier 0.20 refreshes its broadphase at the physics step. New or moved
    // actor proxies must also be swept at their current pose on the first tick;
    // use Rapier's own narrowphase, without stepping the world to refresh queries.
    const travelDelta=p.clone().sub(position),length=travelDelta.length();
    if(length>1e-9&&this.motionColliders.length){
      const s=shape(body);let fraction=1;
      for(const other of this.motionColliders){
        const hit=s.castShape(c,rotation,travelDelta,other.shape,other.translation(),other.rotation(),{x:0,y:0,z:0},0,1,false);
        if(!hit||hit.time_of_impact>=fraction)continue;
        const r=other.rotation();
        const normal=new Vector3(hit.normal2.x,hit.normal2.y,hit.normal2.z).applyQuaternion(new Quaternion(r.x,r.y,r.z,r.w));
        if(travelDelta.dot(normal)>=-1e-8)continue;
        fraction=Math.max(0,hit.time_of_impact-this.controller.offset()/length);
        normals.push(normal);if(normal.y>=.5&&delta.y<=0)grounded=true;
      }
      if(fraction<1)p.copy(position).addScaledVector(travelDelta,fraction);
    }
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
    return {position:p,grounded,normal:normals[0]??new Vector3(0,1,0),normals,contacts,blocked:p.clone().sub(position).distanceToSquared(delta)>1e-6};
  }
  cameraFilter(excludedActorIds:ReadonlySet<string>):(collider:RAPIER.Collider)=>boolean {
    const excluded=new Set(this.queryExcluded);
    for(const entry of this.actorColliders.values())if(!excludedActorIds.has(entry.actorId))excluded.delete(entry.collider.handle);
    return collider=>!excluded.has(collider.handle);
  }
  cameraProbe(from:Vec3,to:Vec3,radius:number,filter=this.environmentFilter) {
    this.assertLive();
    const hit=probeHumanoidCamera(this.world,from,to,radius,undefined,filter,.015);
    // Preserve the vehicle query's historical 0.002 of the swept segment margin.
    const length=Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]);
    return {...hit,distanceMeters:Math.max(0,hit.distanceMeters-(hit.colliderEntityId?length*.002:0))};
  }
  cameraCast(from:Vector3,to:Vector3,radius=.25):Vector3 {
    const solver=new CameraCollisionSolver((a,b,r)=>this.cameraProbe(a,b,r));
    return new Vector3(...solver.project({target:from.toArray(),eye:to.toArray(),current:to.toArray(),radius,armClearance:0}).position);
  }
}
export const createQueries=(map:EnvironmentDefinition)=>new EnvironmentQueries(map);
