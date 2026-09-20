import {disposeInOrder} from '../../lifecycle-disposal';
import {ActorResources} from '../../actor-resources';
import {FixedBoxColliderFactory,contactColliderVolume} from '../../physics-box';
import {EnvironmentInteractionProps} from './interaction-props';
import {readNavigationGeometry} from '../../physics-navigation';
import {WorldInteractions} from '../humanoid/world-interactions';
import {validateEnvironmentIdentities} from '../map-validation';
import {PhysicsColliderBindings} from '../../physics-collider-bindings';
import type {BorrowedPhysicsWorld} from '../../physics-host';
import {DYNAMIC_PROP_COLLISION_GROUPS,DEFAULT_CHARACTER_OPTIONS} from '../../config/physics';
import RAPIER from '@dimforge/rapier3d-compat';
import { Box3,Euler,Quaternion,Vector3 } from 'three';
import type { Vec3 } from '../../contracts';
import { probeHumanoidCamera } from '../camera-queries';
import type { VehicleSpec } from '../config';
import type { EnvironmentBox,EnvironmentDefinition } from './types';
import {compileBoundaryBoxes} from '../../boundaries';

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
const maximumEnvironmentColliders=4096;
function boxSubdivision(box:EnvironmentBox,tileEdgeMeters:number):{nx:number;nz:number}{
  const horizontal=!box.rigidGroup&&!box.liftId&&box.size[1]<=10&&(!box.rotation||box.rotation.every(angle=>angle===0));
  return {nx:horizontal?Math.ceil(box.size[0]/tileEdgeMeters):1,nz:horizontal?Math.ceil(box.size[2]/tileEdgeMeters):1};
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
  readonly colliderBindings:PhysicsColliderBindings;
  readonly interactions:WorldInteractions;
  private readonly interactionProps:EnvironmentInteractionProps;
  get looseCrates(){return this.interactionProps.crates;}
  private readonly physicsSubsteps=new Set<(fraction:number)=>void>();
  private readonly externalCharacterColliders=new Set<number>();
  borrowPhysics():BorrowedPhysicsWorld{return {world:this.world,colliderAdded:(id,c,kind)=>{this.colliderBindings.added(id,c);if(kind==='character')this.externalCharacterColliders.add(c.handle);},colliderRemoved:(_id,c)=>{this.externalCharacterColliders.delete(c.handle);this.colliderBindings.removed(c);},colliderChanged:(_id,c)=>this.colliderBindings.changed(c),colliderOwner:h=>this.colliderId(h),characterSettings:handle=>{const rig=[...this.rigs].find(rig=>rig.capsule.handle===handle);return rig?{...DEFAULT_CHARACTER_OPTIONS,heightMeters:2*(rig.capsule.halfHeight()+rig.capsule.radius()),radiusMeters:rig.capsule.radius(),collisionOffsetMeters:rig.controller.offset(),maximumSlopeRadians:rig.controller.maxSlopeClimbAngle()}:undefined;}};}
  navigationGeometry(){this.assertLive();return readNavigationGeometry(this.world,collider=>!this.queryExcluded.has(collider.handle)&&!this.externalCharacterColliders.has(collider.handle));}
  beforePhysicsSubstep(callback:(fraction:number)=>void){this.physicsSubsteps.add(callback);return()=>{this.physicsSubsteps.delete(callback);};}

  private vehicleRigs=new Map<string,VehicleRigidRig>();
  private vehicleColliderIds=new Map<number,string>();
  private controller:RAPIER.KinematicCharacterController;
  private disposed=false;
  private completedPhysicsSteps=0;
  get physicsStepSequence(){return this.completedPhysicsSteps;}
  private staticColliders=new Map<string,RAPIER.Collider[]>();
  private staticColliderIds=new Map<number,string>();
  private boundaryColliderHandles=new Set<number>();
  private cameraTransparentBoundaryHandles=new Set<number>();
  private propBodies=new Map<string,{body:RAPIER.RigidBody;origin:Vector3}>();
  private propBoxes=new Map<string,string>();
  private liftBoxIds=new Set<string>();
  private lifts=new Map<string,{body:RAPIER.RigidBody;offsetYMeters:number;waitSeconds:number;targetOffsetYMeters:number}>();
  private rigs=new Set<HumanoidRig>();
  private actorColliders=new Map<string,{collider:RAPIER.Collider;bodyKey:string;actorId:string}>();
  private actorColliderHandles=new Set<number>();
  private readonly suspendedEntities=new Set<string>();
  setEntitySuspended(id:string,suspended:boolean):void{if(suspended)this.suspendedEntities.add(id);else this.suspendedEntities.delete(id);}
  // General floor/spawn queries omit actor proxies. Vehicle motion temporarily
  // includes other actors, using their native rig or authored compound collider.
  private queryExcluded=new Set<number>();
  private motionFilter:((collider:RAPIER.Collider)=>boolean)|undefined;
  private motionColliders:readonly RAPIER.Collider[]=[];
  private suppressContactImpulses=false;
  // Do not call collider methods from KCC predicates: that reenters a borrowed
  // WASM collider set. Sensor rejection is a native query flag instead.
  private environmentFilter=(collider:RAPIER.Collider)=>this.motionFilter?this.motionFilter(collider):!this.queryExcluded.has(collider.handle);
  constructor(readonly map:EnvironmentDefinition,resources=new ActorResources()){
    if(!ready)throw new Error('await initEnvironmentQueries() before creating a map');
    validateEnvironmentIdentities(map);
    const tileEdgeMeters=map.collisionTileEdgeMeters??64;
    if(!Number.isFinite(tileEdgeMeters)||tileEdgeMeters<16||tileEdgeMeters>128)throw new Error('HUMANOID_ENVIRONMENT_TILE_SIZE_INVALID');
    const boundaries=compileBoundaryBoxes(map.boundaries??[]),boundaryById=new Map(boundaries.map(b=>[b.id,b]));
    const physicalBoxes:readonly EnvironmentBox[]=[...map.boxes,...boundaries];
    if(map.boxes.some(box=>boundaryById.has(box.id)))throw new Error('HUMANOID_BOUNDARY_ID_CONFLICT');
    let plannedColliders=0;
    for(const box of physicalBoxes){
      if(box.collision===false)continue;
      const {nx,nz}=boxSubdivision(box,tileEdgeMeters);plannedColliders+=nx*nz;
      if(!Number.isSafeInteger(plannedColliders)||plannedColliders>maximumEnvironmentColliders)
        throw new Error(`HUMANOID_ENVIRONMENT_COLLIDER_BUDGET_EXCEEDED: ${box.id}; plannedColliderCount=${plannedColliders}, maximumColliderCount=${maximumEnvironmentColliders}`);
    }
    this.world=new RAPIER.World({x:0,y:-18,z:0});
    this.colliderBindings=new PhysicsColliderBindings(this.world);
    try{
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
        const collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(b.size[0]/2,b.size[1]/2,b.size[2]/2).setTranslation(p.x,p.y,p.z).setRotation(rotation).setDensity(mass/volume).setFriction(.55).setRestitution(.08).setCollisionGroups(DYNAMIC_PROP_COLLISION_GROUPS),body);
        this.staticColliders.set(b.id,[collider]);this.staticColliderIds.set(collider.handle,b.id);this.propBoxes.set(b.id,id);
      }
    }
    for(const lift of map.lifts??[]){
      const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(lift.position[0],lift.position[1],lift.position[2]));
      this.lifts.set(lift.id,{body,offsetYMeters:0,waitSeconds:0,targetOffsetYMeters:0});
      for(const box of map.boxes.filter(b=>b.liftId===lift.id&&b.collision!==false)){
        this.liftBoxIds.add(box.id);
        const rotation=new Quaternion().setFromEuler(new Euler(...(box.rotation??[0,0,0]),'XYZ'));
        const c=this.world.createCollider(RAPIER.ColliderDesc.cuboid(box.size[0]/2,box.size[1]/2,box.size[2]/2).setTranslation(box.position[0]-lift.position[0],box.position[1]-lift.position[1],box.position[2]-lift.position[2]).setRotation(rotation).setCollisionGroups(0x0001ffff),body);
        this.staticColliders.set(box.id,[c]);this.staticColliderIds.set(c.handle,box.id);
      }
    }
    const fixedBoxes=new FixedBoxColliderFactory(this.world);
    try{for(const box of physicalBoxes){
      if(box.collision===false||box.rigidGroup||box.liftId)continue;
      const rotation=new Quaternion().setFromEuler(new Euler(...(box.rotation??[0,0,0]),'XYZ'));
      // Broadphase tiles share precise native box partitions by dimensions.
      // Their outer volume and map identity remain unchanged.
      const {nx,nz}=boxSubdivision(box,tileEdgeMeters);
      const width=box.size[0]/nx,depth=box.size[2]/nz;
      for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++){
        const x=box.position[0]-box.size[0]/2+(ix+.5)*width,z=box.position[2]-box.size[2]/2+(iz+.5)*depth;
        const configure=(descriptor:RAPIER.ColliderDesc)=>descriptor.setTranslation(x,box.position[1],z).setRotation(rotation).setFriction(.85).setCollisionGroups(0x0001ffff);
        // Thin fences retain cuboid swept-CCD contacts; authored map surfaces use the precise native partitions.
        const collider=boundaryById.has(box.id)?this.world.createCollider(configure(RAPIER.ColliderDesc.cuboid(width/2,box.size[1]/2,depth/2))):fixedBoxes.create([width/2,box.size[1]/2,depth/2],configure);
        this.staticColliderIds.set(collider.handle,box.id);
        const boundary=boundaryById.get(box.id);if(boundary){this.boundaryColliderHandles.add(collider.handle);if(!boundary.blocksCamera)this.cameraTransparentBoundaryHandles.add(collider.handle);}
        const colliders=this.staticColliders.get(box.id)??[];colliders.push(collider);this.staticColliders.set(box.id,colliders);
      }
    }}finally{fixedBoxes.dispose();}
    let props:EnvironmentInteractionProps|undefined;
    try{props=new EnvironmentInteractionProps(this.world,map,this.colliderBindings);this.interactionProps=props;this.interactions=new WorldInteractions(map,id=>this.interactionProps.body(id),(id,point)=>this.interactionAnchor(id,point),(ids,position,tolerance)=>ids.some(id=>(this.staticColliders.get(id)??[]).some(collider=>{const point=collider.isEnabled()?collider.projectPoint(position,true):null;return !!point&&new Vector3().copy(point.point).distanceTo(position)<=tolerance;})),resources);}
    catch(error){props?.dispose();throw error;}
    // Publish the initial map without integrating props or consuming simulation time.
    this.world.updateSceneQueries();
    this.controller=this.world.createCharacterController(.015);
    this.controller.setMaxSlopeClimbAngle(Math.PI/3);
    this.controller.setMinSlopeSlideAngle(Math.PI/3);
    this.controller.setSlideEnabled(true);
    }catch(error){this.world.free();throw error;}
  }
  private assertLive(){if(this.disposed)throw new Error('Environment queries disposed');}
  hasUpwardContact(colliders:readonly RAPIER.Collider[]):boolean{
    this.assertLive();let supported=false;
    for(const collider of colliders)this.world.contactPairsWith(collider,other=>{
      if(other.isSensor())return;
      this.world.contactPair(collider,other,(manifold,flipped)=>{
        if(manifold.normal().y*(flipped?1:-1)<.35)return;
        for(let n=0;n<manifold.numContacts();n++)if(manifold.contactDist(n)<.04){supported=true;break;}
      });
    });
    return supported;
  }
  get colliderCount():number{this.assertLive();return this.world.colliders.len();}
  colliderId(handle:number):string{
    this.assertLive();
    const externalId=this.colliderBindings.owner(handle);if(externalId!==undefined)return externalId;
    const environmentId=this.staticColliderIds.get(handle);if(environmentId!==undefined)return environmentId;
    const vehicleId=this.vehicleColliderIds.get(handle);if(vehicleId!==undefined)return vehicleId;
    for(const entry of this.actorColliders.values())if(entry.collider.handle===handle)return entry.actorId;
    return `collider-${handle}`;
  }
  wheelSweep(origin:Vector3,rotation:Quaternion,direction:Vector3,radius:number,width:number,distance:number){
    this.assertLive();
    const wheel=new RAPIER.Cylinder(width/2,radius),rejected=new Set<number>();
    // A side wall may overlap the tire before its downward sweep reaches ground.
    // Reject it as suspension support, then keep looking; chassis collisions are
    // unchanged. Each retry excludes a distinct collider from this query only.
    const filter=(collider:RAPIER.Collider)=>!rejected.has(collider.handle)&&this.environmentFilter(collider);
    for(;;){
      const hit=this.world.castShape(origin,rotation,direction,wheel,0,distance,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,filter);
      if(!hit)return null;
      const normal=new Vector3(hit.normal1.x,hit.normal1.y,hit.normal1.z);
      if(normal.dot(direction)<-.3)return {distance:hit.time_of_impact,normal,point:new Vector3(hit.witness1.x,hit.witness1.y,hit.witness1.z),friction:hit.collider.friction()};
      rejected.add(hit.collider.handle);
    }
  }
  raycast(origin:Vector3,direction:Vector3,distance:number){
    this.assertLive();const hit=this.world.castRayAndGetNormal(new RAPIER.Ray(origin,direction),distance,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,this.environmentFilter);
    if(!hit)return null;
    const id=this.colliderId(hit.collider.handle);
    return {id,friction:hit.collider.friction(),distance:hit.timeOfImpact,normal:new Vector3(hit.normal.x,hit.normal.y,hit.normal.z)};
  }
  private disposing=false;
  dispose():void {
    if(this.disposed||this.disposing)return;this.disposing=true;
    try{
      this.rigs.clear();this.vehicleRigs.clear();this.vehicleColliderIds.clear();this.lifts.clear();this.liftBoxIds.clear();this.propBodies.clear();this.propBoxes.clear();this.staticColliders.clear();this.staticColliderIds.clear();this.boundaryColliderHandles.clear();this.cameraTransparentBoundaryHandles.clear();this.actorColliders.clear();this.actorColliderHandles.clear();this.queryExcluded.clear();this.externalCharacterColliders.clear();this.colliderBindings.clear();this.physicsSubsteps.clear();
      disposeInOrder([()=>this.interactions.dispose(),()=>this.interactionProps.dispose(),()=>this.world.free()]);
    }finally{this.disposed=true;this.disposing=false;}
  }
  colliderForId(id:string){this.assertLive();return this.staticColliders.get(id)?.[0]??this.interactionProps.colliderForId(id);}
  private interactionAnchor(boxId:string,point:readonly number[]){
    const collider=this.staticColliders.get(boxId)?.[0];if(!collider?.isEnabled()||collider.parent()?.isEnabled()===false)return null;
    const group=this.propBodies.get(this.propBoxes.get(boxId)??'');
    if(!group)return {position:new Vector3(point[0],point[1],point[2]),rotation:new Quaternion(),stable:true};
    const r=group.body.rotation(),rotation=new Quaternion(r.x,r.y,r.z,r.w),p=group.body.translation();
    return {position:new Vector3(point[0],point[1],point[2]).sub(group.origin).applyQuaternion(rotation).add(new Vector3(p.x,p.y,p.z)),rotation,stable:new Vector3(0,1,0).applyQuaternion(rotation).y>.98&&new Vector3().copy(group.body.linvel()).length()<.2&&new Vector3().copy(group.body.angvel()).length()<.3};
  }
  propBoxPose(id:string){if(!this.propBoxes.has(id)&&!this.liftBoxIds.has(id))return null;const c=this.staticColliders.get(id)![0]!;return {position:c.translation(),rotation:c.rotation()};}
  resetContents():void{this.interactions.reset(()=>{this.resetRigidGroups();this.interactionProps.reset();});}
  resetRigidGroups(){for(const spec of this.map.lifts??[]){const l=this.lifts.get(spec.id)!;l.offsetYMeters=l.targetOffsetYMeters=l.waitSeconds=0;l.body.setTranslation({x:spec.position[0],y:spec.position[1],z:spec.position[2]},true);}for(const {body,origin} of this.propBodies.values()){body.setTranslation(origin,true);body.setRotation({x:0,y:0,z:0,w:1},true);body.setLinvel({x:0,y:0,z:0},false);body.setAngvel({x:0,y:0,z:0},false);body.resetForces(false);body.resetTorques(false);body.sleep();}this.world.updateSceneQueries();}
  /** Movement envelopes block the character, but are not authored traversal surfaces.
   * Cached handles are safe to inspect from Rapier query predicates. */
  isActorCollider(collider:RAPIER.Collider){this.assertLive();return this.actorColliderHandles.has(collider.handle);}
  /** Physical barriers cannot become authored climbing or traversal supports. */
  isBoundaryCollider(collider:RAPIER.Collider){this.assertLive();return this.boundaryColliderHandles.has(collider.handle);}
  createHumanoidRig(position:Vector3,half=.56,radius=.28):HumanoidRig {
    this.assertLive();
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x,position.y+half+radius,position.z));
    const capsule=this.world.createCollider(RAPIER.ColliderDesc.capsule(half,radius).setMass(75).setFriction(0).setCollisionGroups(0x0008ffff),body);
    const rig={world:this.world,body,capsule,controller:this.world.createCharacterController(.015)};
    this.rigs.add(rig);this.queryExcluded.add(capsule.handle);this.actorColliderHandles.add(capsule.handle);return rig;
  }
  releaseHumanoidRig(rig:HumanoidRig){
    if(this.disposed||!this.rigs.delete(rig))return;
    this.queryExcluded.delete(rig.capsule.handle);this.actorColliderHandles.delete(rig.capsule.handle);this.colliderBindings.removed(rig.capsule);
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
    for(const [id,rig] of this.vehicleRigs)if(id!==actorId&&rig.body.isEnabled())colliders.push(...rig.colliders.filter(c=>c.isEnabled()));
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
  /** The caller refreshes once; candidate collection must not reenter borrowed WASM. */
  private nearbyColliders(bounds:Box3,padding:number,filter:BodyQueryFilter={}):RAPIER.Collider[]{
    this.assertLive();
    const center=bounds.getCenter(new Vector3()),half=bounds.getSize(new Vector3()).multiplyScalar(.5);
    // The BVH uses f32. Conservative rounding only admits extra candidates;
    // contacts and casts below retain their original shapes and tolerances.
    const magnitude=Math.max(1,...center.toArray().map(Math.abs),...half.toArray());
    half.addScalar(padding+magnitude*2**-20);
    const candidates:RAPIER.Collider[]=[];
    this.world.collidersWithAabbIntersectingAabb(center,half,collider=>{candidates.push(collider);return true;});
    return this.filterColliders(candidates,filter);
  }
  /** The support ray retains its existing live-collider traversal and tie order. */
  private directColliders(filter:BodyQueryFilter={}):RAPIER.Collider[]{
    this.assertLive();const candidates:RAPIER.Collider[]=[];
    this.world.colliders.forEach(collider=>candidates.push(collider));
    return this.filterColliders(candidates,filter);
  }
  private filterColliders(candidates:readonly RAPIER.Collider[],filter:BodyQueryFilter):RAPIER.Collider[]{
    const excluded=new Set(filter.excludedColliderHandles);
    for(const [id,rig] of this.vehicleRigs)if(filter.excludedActorIds?.has(id))for(const collider of rig.colliders)excluded.add(collider.handle);
    for(const entry of this.actorColliders.values())if(filter.excludedActorIds?.has(entry.actorId))excluded.add(entry.collider.handle);
    return candidates.filter(c=>c.isEnabled()&&(!this.suspendedEntities.size||(c.parent()?.isEnabled()??true))&&!c.isSensor()&&!excluded.has(c.handle));
  }
  private bodyQueryBounds(pose:BodyPose):Box3{
    validatePose(pose);
    const c=center(pose.position,pose.body,pose.rotation),e=extents(pose.body,pose.rotation);
    return new Box3(c.clone().sub(e),c.clone().add(e));
  }
  private outsideMap(bounds:Box3):boolean{
    return bounds.min.toArray().some((v,i)=>v<this.map.bounds.min[i]!)||bounds.max.toArray().some((v,i)=>v>this.map.bounds.max[i]!);
  }
  bodyOverlap(
    pose: BodyPose,
    filter?: BodyQueryFilter,
    contactToleranceMeters = 0,
  ): boolean {
    this.assertLive();
    const bounds=this.bodyQueryBounds(pose);
    if(!Number.isFinite(contactToleranceMeters)||contactToleranceMeters<0)throw new Error("HUMANOID_QUERY_INVALID");
    if(this.outsideMap(bounds))return true;
    this.world.updateSceneQueries();
    return this.overlapCandidates(pose,this.nearbyColliders(bounds,0,filter),Math.min(contactToleranceMeters,this.controller.offset()));
  }
  private overlapCandidates(pose:BodyPose,colliders:readonly RAPIER.Collider[],contactToleranceMeters:number):boolean{
    const c=center(pose.position,pose.body,pose.rotation);
    const body = shape(pose.body);
    return colliders.some((other) => {
      const hit = contactColliderVolume(other,body,c,pose.rotation,0);
      // Native capsule contact can report zero depth for coincident segments.
      // A slightly inset intersection distinguishes penetration from mere contact.
      if(hit?.distance===0&&pose.body.kind==='capsule'&&other.shapeType()===RAPIER.ShapeType.Capsule){
        const radius=pose.body.radius;
        return other.intersectsShape(new RAPIER.Capsule(pose.body.height/2-radius,radius-Math.min(1e-5,radius*.001)),c,pose.rotation);
      }
      // Only upward support contact receives KCC numerical tolerance. Walls never do.
      return (
        !!hit &&
        hit.distance < 0 &&
        !(
          hit.normal1.y >= Math.SQRT1_2 &&
          hit.distance >= -contactToleranceMeters
        )
      );
    });
  }
  bodyPathBlocked(
    poses: readonly BodyPose[],
    filter?: BodyQueryFilter,
  ): boolean {
    this.assertLive();
    const clearance =
      this.rigs.values().next().value?.controller.offset() ??
      this.controller.offset();
    if(!poses.length)return false;
    const bounds=new Box3();
    for(const pose of poses){const next=this.bodyQueryBounds(pose);if(this.outsideMap(next))return true;bounds.union(next);}
    this.world.updateSceneQueries();
    const colliders=this.nearbyColliders(bounds,clearance,filter);
    for(const pose of poses)if(this.overlapCandidates(pose,colliders,Math.min(clearance,this.controller.offset())))return true;
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
        const hit = other.castShape({x:0,y:0,z:0},body,start,from.rotation,delta,clearance,1,true);
        if (!hit) continue;
        const contact = contactColliderVolume(other,body,start,from.rotation,clearance);
        if (
          contact &&
          contact.normal1.y >= Math.SQRT1_2 &&
          contact.distance >= -clearance &&
          delta.dot(
            new Vector3(
              contact.normal1.x,
              contact.normal1.y,
              contact.normal1.z,
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
      if(this.boundaryColliderHandles.has(other.handle))continue;
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
  setVehicleEnabled(id:string,enabled:boolean):void{this.vehicleRigs.get(id)?.body.setEnabled(enabled);}
  retainVehicleRigs(ids:ReadonlySet<string>){for(const id of this.vehicleRigs.keys())if(!ids.has(id))this.releaseVehicleRig(id);}
  vehicleRig(id:string,token:object,position:Vector3,rotation:Quaternion,mass:number,halfWidth:number,halfLength:number,height:number,centerOfMassHeight:number,parts?:readonly {body:QueryBody;rotation?:Quaternion}[],friction=.6,restitution=.08,airframe?:{stops?:readonly {radius:number;center:Vector3}[];boxes:readonly {halfExtents:readonly [number,number,number];offset:readonly [number,number,number]}[];inertia:Vector3;center:Vector3}):VehicleRigidRig {
    this.assertLive();const previous=this.vehicleRigs.get(id);if(previous?.token===token)return previous;if(previous)this.releaseVehicleRig(id);
    const inertia=airframe?.inertia??{x:mass*(4*halfLength*halfLength+1)/12,y:mass*(4*halfWidth*halfWidth+4*halfLength*halfLength)/12,z:mass*(4*halfWidth*halfWidth+1)/12};
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x,position.y,position.z).setRotation(rotation).setGravityScale(9.81/18).setCcdEnabled(true).setAngularDamping(.7).setAdditionalMassProperties(mass,airframe?.center??{x:0,y:centerOfMassHeight,z:0},inertia,{x:0,y:0,z:0,w:1}));
    // 下车身两端收窄并斜切；驾驶舱另设碰撞体，避免整个包围盒形成巨大平底车头。
    const points:number[]=[];for(const side of [-1,1])for(const x of [-halfWidth,halfWidth]){points.push(x,.32,side*halfLength*.64,x,1.02,side*halfLength*.64,x*.88,.52,side*halfLength,x*.88,.72,side*halfLength);}
    const hull=RAPIER.ColliderDesc.convexHull(new Float32Array(points));if(!hull){this.world.removeRigidBody(body);throw new Error('HUMANOID_CHASSIS_HULL_INVALID');}
    const cabin=RAPIER.ColliderDesc.cuboid(halfWidth*.72,Math.max(.2,(height-1.02)/2),halfLength*.4).setTranslation(0,(height+1.02)/2,-.15);
    const shapes=airframe?[...airframe.boxes.map(b=>RAPIER.ColliderDesc.cuboid(...b.halfExtents).setTranslation(...b.offset)),...(airframe.stops??[]).map(s=>RAPIER.ColliderDesc.ball(s.radius).setTranslation(s.center.x,s.center.y,s.center.z))]:parts?parts.map(part=>{
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
    colliders.forEach(collider=>{this.queryExcluded.add(collider.handle);this.vehicleColliderIds.set(collider.handle,id);});
    const rig:VehicleRigidRig={token,body,colliders,beforeStep:()=>{},afterStep:()=>{}};this.vehicleRigs.set(id,rig);return rig;
  }
  /** Measured contacts from the shared solver, never an extra collision world. */
  vehicleContactNormals(rig:VehicleRigidRig):Vector3[]{
    const normals:Vector3[]=[];
    for(const collider of rig.colliders)this.world.contactPairsWith(collider,other=>{
      if(other.parent()?.handle===rig.body.handle)return;
      for(const n of this.world.solverContactNormals(collider,other))normals.push(new Vector3(-n.x,-n.y,-n.z));
    });
    return normals;
  }
  /** Advance each lift once; return support displacement separately for each actor. */
  stepLifts(dt:number,passengers:readonly {id:string;feet:Vector3;grounded:boolean}[]):ReadonlyMap<string,number>{
    const carried=new Map<string,number>();
    for(const spec of this.map.lifts??[]){const l=this.lifts.get(spec.id)!,platformY=spec.position[1]+l.offsetYMeters;
      const inside=passengers.filter(p=>Math.abs(p.feet.x-spec.position[0])<2.6&&Math.abs(p.feet.z-spec.position[2])<2.6&&Math.abs(p.feet.y-platformY)<.3);
      const centered=inside.some(p=>Math.abs(p.feet.x-spec.position[0])<1.8&&Math.abs(p.feet.z-spec.position[2])<1.8);
      if(l.offsetYMeters===l.targetOffsetYMeters){l.waitSeconds+=(l.offsetYMeters===0?centered:inside.length===0)?dt:-l.waitSeconds;if(l.waitSeconds>1.5){l.targetOffsetYMeters=l.offsetYMeters===0?spec.height:0;l.waitSeconds=0;}}
      const difference=l.targetOffsetYMeters-l.offsetYMeters,delta=Math.sign(difference)*Math.min(Math.abs(difference),spec.speed*dt);
      if(delta){l.offsetYMeters+=delta;l.body.setTranslation({x:spec.position[0],y:spec.position[1]+l.offsetYMeters,z:spec.position[2]},true);for(const p of inside)if(p.grounded)carried.set(p.id,(carried.get(p.id)??0)+delta);}
    }
    if(this.lifts.size)this.world.updateSceneQueries();return carried;
  }
  stepPhysics(dt:number){
    this.assertLive();if(dt<=0)return;
    const count=this.vehicleRigs.size?Math.max(1,Math.ceil(dt/(1/120))):1,previousTimestep=this.world.timestep;
    // Native KCC impulse calculations read this same integration parameter.
    // A vehicle substep must not change the following actor update's duration.
    this.world.timestep=dt/count;
    try{for(let n=0;n<count;n++){
      for(const before of this.physicsSubsteps)before((n+1)/count);
      for(const rig of this.vehicleRigs.values())if(rig.body.isEnabled())rig.beforeStep(dt/count);
      this.world.step();this.completedPhysicsSteps++;
      for(const rig of this.vehicleRigs.values())if(rig.body.isEnabled())rig.afterStep();
    }}finally{this.world.timestep=previousTimestep;}
    this.interactions.advance(dt);this.interactions.syncPhysicalState();
  }
  waterAt(position:Vector3){return this.map.water.find(w=>position.x>=w.min[0]&&position.x<=w.max[0]&&position.z>=w.min[2]&&position.z<=w.max[2]);}
  waterContains(position:Vector3,radius=0){const w=this.waterAt(position);return !!w&&position.x-radius>=w.min[0]&&position.x+radius<=w.max[0]&&position.z-radius>=w.min[2]&&position.z+radius<=w.max[2];}
  support(position:Vector3,maxDrop=100,step=.45){
    this.assertLive();
    const origin=position.clone();origin.y+=step;
    const hit=this.world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:0,y:-1,z:0}),maxDrop+step,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,collider=>!this.boundaryColliderHandles.has(collider.handle)&&this.environmentFilter(collider));
    return hit&&hit.normal.y>.25?{height:origin.y-hit.timeOfImpact,normal:new Vector3(hit.normal.x,hit.normal.y,hit.normal.z)}:null;
  }
  overlaps(position:Vector3,body:QueryBody=HUMANOID_BODY,rotation=identity){this.assertLive();return !!this.world.intersectionWithShape(center(position,body,rotation),rotation,shape(body),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,this.environmentFilter);}
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
    return {position:p,grounded,normal:normals[0]??new Vector3(0,1,0),normals,contacts,blocked:p.clone().sub(position).distanceToSquared(delta)>1e-6};
  }
  /** Detached bounds of the actual native proxies that cameraFilter can restore. */
  cameraFallbackBounds():ReadonlyMap<string,Box3> {
    this.assertLive();const bounds=new Map<string,Box3>();
    for(const {actorId,collider} of this.actorColliders.values()){
      const position=new Vector3().copy(collider.translation()),rotation=new Quaternion().copy(collider.rotation()),native=collider.shape;
      let extent:Vector3;
      if(native instanceof RAPIER.Cuboid)extent=extents({kind:'box',halfExtents:[native.halfExtents.x,native.halfExtents.y,native.halfExtents.z],offset:[0,0,0]},rotation);
      else if(native instanceof RAPIER.Capsule)extent=extents({kind:'capsule',radius:native.radius,height:2*(native.halfHeight+native.radius),offset:[0,0,0]},rotation);
      else extent=new Vector3(Infinity,Infinity,Infinity);
      const box=new Box3(position.clone().sub(extent),position.clone().add(extent)).expandByScalar(1e-5+Math.max(extent.x,extent.y,extent.z)*1e-6);
      const previous=bounds.get(actorId);if(previous)previous.union(box);else bounds.set(actorId,box);
    }
    return bounds;
  }
  cameraFilter(excludedActorIds:ReadonlySet<string>):(collider:RAPIER.Collider)=>boolean {
    const excluded=new Set(this.queryExcluded);
    for(const entry of this.actorColliders.values())if(!excludedActorIds.has(entry.actorId))excluded.delete(entry.collider.handle);
    return collider=>!excluded.has(collider.handle)&&!this.cameraTransparentBoundaryHandles.has(collider.handle);
  }
  /** 飞行体积扫掠；排除自己的代理，包含其他实体的实际刚体，返回可安全移动比例。 */
  sweepActorSphere(from:Vector3,to:Vector3,radius:number,actorId:string):{fraction:number;normal:Vector3}|null {
    this.assertLive();
    const delta=to.clone().sub(from),length=delta.length();if(length<1e-8)return null;
    const excluded=new Set<number>();
    for(const entry of this.actorColliders.values())if(entry.actorId===actorId)excluded.add(entry.collider.handle);
    for(const collider of this.vehicleRigs.get(actorId)?.colliders??[])excluded.add(collider.handle);
    // 骑乘关系已禁用自己的角色胶囊；其他步行角色仍参与碰撞。
    const hit=this.world.castShape(from,identity,delta,new RAPIER.Ball(radius),.025,1,false,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,c=>!excluded.has(c.handle));
    return hit?{fraction:Math.max(0,hit.time_of_impact-.035/length),normal:new Vector3(hit.normal1.x,hit.normal1.y,hit.normal1.z).normalize()}:null;
  }
  cameraProbe(from:Vec3,to:Vec3,radius:number,filter=this.environmentFilter) {
    this.assertLive();
    const hit=probeHumanoidCamera(this.world,from,to,radius,undefined,collider=>!this.cameraTransparentBoundaryHandles.has(collider.handle)&&filter(collider),.015);
    // Preserve the vehicle query's historical 0.002 of the swept segment margin.
    const length=Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]);
    return {...hit,...(hit.colliderEntityId?{colliderEntityId:this.colliderId(Number(hit.colliderEntityId))}:{}),distanceMeters:Math.max(0,hit.distanceMeters-(hit.colliderEntityId?length*.002:0))};
  }
}
export const createQueries=(map:EnvironmentDefinition)=>new EnvironmentQueries(map);
