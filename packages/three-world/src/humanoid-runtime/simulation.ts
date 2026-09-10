import {HumanoidActor,syncPlayer,stepHumanoidInput,type ActorInput} from './humanoid/actor';
import { resolveConfiguredFlyingCreatureFeel } from './motion-families/flying-creature/state';
import { copyAtvState } from './motion-families/ground-vehicle/atv';
import { copyUnicycleState,finishUnicycleStep } from './motion-families/ground-vehicle/unicycle';
import { createFamilyPhysics,motionFamilyForMode,resetFamilyRigidState,resolveFamilyPhysics,resolveMotionFamilyMovement,stepMotionFamily } from './motion-families/registry';
import type { MotionFamilyState } from './motion-families/state';
import { copyJetSkiState,finishJetSkiStep } from './motion-families/surface-vessel/jetski';
import { copySubmersibleState } from './motion-families/underwater/submersible';





import {
paddleRiderBody
} from './motion-families/surface-vessel/paddling';

import { Quaternion,Vector3 } from 'three';
import {
CONTROL_RANGES,
DEFAULT_CHARACTER_CONTROL_BASE,
defaultMovementSettings,
type MovementSettings,
} from '../config/control';
import { canPlaceCreature,creatureBodies,resetCreatureState } from './creatures/controller';
import { HUMANOID_BODY,HumanoidController } from './humanoid/controller';
import type { MotionSource } from './humanoid/motion';
import { evaluateDismount,evaluateMount,type MountContext,type MountDecision,type MountFailureCode } from './mounted-interaction';



import { type VehicleSpec } from './config';
import { EnvironmentQueries,vehicleBody } from './environment/queries';
import type { MapSpawn } from './environment/types';
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const damp=(a:number,b:number,k:number,dt:number)=>a+(b-a)*(1-Math.exp(-k*dt));
export const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export interface HumanoidActionInput {toggleCrouch?:boolean;roll?:boolean;slide?:boolean;interact?:boolean;putDown?:boolean;prone?:boolean;climb?:boolean;releaseClimb?:boolean;toggleSwimStyle?:boolean;cancel?:boolean}
export interface Input { primary?:boolean;secondary?:boolean; forward:number; steer:number; lift:number; roll:number; pitch:number; strafe:number; boost:boolean; brake:boolean; jump:boolean; slow:boolean;actions?:HumanoidActionInput }
export const emptyInput=():Input=>({forward:0,steer:0,lift:0,roll:0,pitch:0,strafe:0,boost:false,brake:false,jump:false,slow:false});
export interface VehicleState {motion:MotionFamilyState;spec:VehicleSpec & MovementSettings;position:Vector3;velocity:Vector3;rotation:Quaternion;yaw:number;pitch:number;roll:number;steering:number;throttle:number;grounded:boolean;launched:boolean;speed:number;submerged:boolean}

export function resolveVehicleSpec(spec:VehicleSpec):VehicleSpec & MovementSettings {
  spec=resolveFamilyPhysics(spec);
  const authored=Object.fromEntries(Object.keys(CONTROL_RANGES).filter(key=>Object.hasOwn(spec,key)).map(key=>[key,spec[key as keyof MovementSettings]]));
  const family=motionFamilyForMode(spec.mode);
  const control=resolveMotionFamilyMovement(family,`${family}.${spec.mode}`,authored,defaultMovementSettings(spec.mode,spec));
  const resolved={...structuredClone(spec),...control};
  if(resolved.flyingCreature)resolveConfiguredFlyingCreatureFeel(resolved);
  return resolved;
}
export function createVehicle(spec:VehicleSpec):VehicleState {
 const resolved=resolveVehicleSpec(spec);
 const state:VehicleState={motion:createFamilyPhysics(resolved),spec:resolved,position:new Vector3(...spec.spawn),velocity:new Vector3(),rotation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),spec.yaw),yaw:spec.yaw,pitch:0,roll:0,steering:0,throttle:0,grounded:true,launched:false,speed:0,submerged:false};
 if(state.motion.submersible||state.motion.jetski)state.grounded=false;resetCreatureState(state);return state;
}
function actorFootprints(v:VehicleState){return creatureBodies(v).map((part,index)=>{
  const center=new Vector3(...part.body.offset).applyQuaternion(part.rotation).add(part.position);
  let halfHeight=part.body.kind==='capsule'?part.body.height/2:0;
  if(part.body.kind==='box')for(let axis=0;axis<3;axis++)halfHeight+=Math.abs(new Vector3().setComponent(axis,part.body.halfExtents[axis]!).applyQuaternion(part.rotation).y);
  return {position:part.position,radius:index===0?v.spec.radius:1.9,minY:center.y-halfHeight,maxY:center.y+halfHeight};
});}
function actorsTouch(a:VehicleState,b:VehicleState){return actorFootprints(a).some(p=>actorFootprints(b).some(o=>o.maxY>p.minY+.01&&p.maxY>o.minY+.01&&Math.hypot(o.position.x-p.position.x,o.position.z-p.position.z)<o.radius+p.radius));}
function actorBlocksPlayer(v:VehicleState,p:Vector3,margin:number){return actorFootprints(v).some(part=>p.y+1.75>part.minY&&p.y<part.maxY&&Math.hypot(part.position.x-p.x,part.position.z-p.z)<part.radius+margin);}
export function stepVehicle(v:VehicleState,i:Input,dt:number,time:number,environment:EnvironmentQueries){stepMotionFamily(v,i,dt,time,environment);}
export interface PlayerState { position:Vector3; velocity:Vector3; yaw:number; grounded:boolean; swimming:boolean; coyote:number; jumpBuffer:number; animation:string; landTimer:number }
export class Simulation {
  environment:EnvironmentQueries;
  humanoid!:HumanoidController;
  readonly actors=new Map<string,HumanoidActor>();
  checkActorSpawn(position:Vector3):Vector3{
    const safe=this.environment.safeSpawn(position,HUMANOID_BODY);
    if(!safe||this.environment.bodyOverlap({position:safe,rotation:new Quaternion(),body:HUMANOID_BODY},undefined,.015))throw new Error('HUMANOID_ACTOR_SPAWN_BLOCKED');return safe;
  }
  addActor(id:string,position:Vector3,yaw=0,prevalidated=false):HumanoidActor{
    if(!id.trim()||this.actors.has(id))throw new Error('HUMANOID_ACTOR_ID_CONFLICT');
    const actor=new HumanoidActor(this.environment,prevalidated?position:this.checkActorSpawn(position),yaw);this.actors.set(id,actor);return actor;
  }
  removeActor(id:string):void{const actor=this.actors.get(id);if(actor){this.actors.delete(id);actor.dispose();}}
  private humanoidClips:ReadonlySet<string>=new Set();
  private humanoidMotions:readonly MotionSource[]=[];
  characterControl=defaultMovementSettings('character',DEFAULT_CHARACTER_CONTROL_BASE);
  private prepared=new Map<string,MapSpawn>();
  failureCode:MountFailureCode|undefined;
  vehicles:VehicleState[]=[];active=-1;time=0;transition=0;transitionKind:''|'enter'|'exit'='';message='';teleportRevision=0;
  player:PlayerState={position:new Vector3(),velocity:new Vector3(),yaw:0,grounded:true,swimming:false,coyote:.1,jumpBuffer:0,animation:'Idle_Loop',landTimer:0};
  constructor(environment:EnvironmentQueries,specs:readonly VehicleSpec[]=[]){this.environment=environment;this.vehicles=specs.map(createVehicle);this.setEnvironment(environment);}
  dispose(){for(const id of this.actors.keys())this.removeActor(id);this.humanoid.dispose();for(const v of this.vehicles)this.environment.releaseVehicleRig(v.spec.id);}
  setHumanoidAssets(clips:ReadonlySet<string>,motions:readonly MotionSource[]){this.humanoidClips=clips;this.humanoidMotions=motions;this.humanoid?.setAvailableClips(clips,motions);}
  prepareEnvironment(q:EnvironmentQueries,specs:readonly VehicleSpec[]=this.vehicles.map(v=>v.spec)):Simulation{
    const staged=new Simulation(q,specs.map(spec=>structuredClone(spec)));
    staged.characterControl={...this.characterControl};staged.setHumanoidAssets(this.humanoidClips,this.humanoidMotions);return staged;
  }
  adoptEnvironment(staged:Simulation):void{this.dispose();Object.assign(this,staged);}
  private syncActorBodies(){this.environment.retainVehicleRigs(new Set(this.vehicles.filter(v=>(v.motion.wheelPhysics||v.motion.body||v.motion.aircraft)&&this.available(v)).map(v=>v.spec.id)));this.environment.syncActorBodies(this.vehicles.filter(v=>this.available(v)).flatMap(v=>creatureBodies(v).map((part,n)=>({id:`${v.spec.id}:${n}`,actorId:v.spec.id,physical:!!(v.motion.wheelPhysics||v.motion.body||v.motion.aircraft),...part}))));}
  private syncHumanoidPlayer(){syncPlayer(this.humanoid,this.player);}
  private canRelocate(){if(this.active<0&&!this.humanoid.canBoard){this.message=this.humanoid.boardingReason;return false;}return true;}
  /** Explicit reset for authored test starts; ordinary vehicle visits retain world targets. */
  prepareCharacter(position:Vector3,yaw:number){
    const safe=this.environment.safeSpawn(position,HUMANOID_BODY);if(!safe){this.message='人物测试点没有站立净空';return false;}
    this.environment.interactions.reset();
    this.active=-1;this.transition=0;this.transitionKind='';this.humanoid.resetAt(safe,yaw);this.syncHumanoidPlayer();this.teleportRevision++;return true;
  }
  available(v:VehicleState){return this.environment.map.regions.some(r=>r.modes.includes(v.spec.mode));}
  setEnvironment(q:EnvironmentQueries){
    for(const id of this.actors.keys())this.removeActor(id);
    this.humanoid?.dispose();for(const v of this.vehicles)this.environment.releaseVehicleRig(v.spec.id);
    this.environment=q;this.prepared.clear();this.active=-1;this.transition=0;this.transitionKind='';this.time=0;this.teleportRevision++;
    let parked=0;
    for(const v of this.vehicles){Object.assign(v,createVehicle(v.spec));
      const spawn=q.map.spawns.find(s=>s.vehicleId===v.spec.id);
      if(spawn){v.position.set(...spawn.position);v.yaw=spawn.yaw;v.rotation.setFromAxisAngle(new Vector3(0,1,0),spawn.yaw);this.prepared.set(v.spec.id,spawn);}
      else if(this.available(v)){v.position.set(q.map.playerSpawn[0]-30+(parked%6)*12,q.map.playerSpawn[1],q.map.playerSpawn[2]-45-Math.floor(parked/6)*12);parked++;}
      const safe=q.safeSpawn(v.position,vehicleBody(v.spec),v.rotation);if(safe)v.position.copy(safe);
      resetCreatureState(v);
      if(safe&&this.available(v))this.prepared.set(v.spec.id,{id:`parked-${v.spec.id}`,name:v.spec.name,vehicleId:v.spec.id,regionId:spawn?.regionId??q.map.regions.find(r=>r.modes.includes(v.spec.mode))!.id,position:[safe.x,safe.y,safe.z],yaw:v.yaw});
    }
    this.player.position.copy(q.safeSpawn(new Vector3(...q.map.playerSpawn),HUMANOID_BODY)??new Vector3(...q.map.playerSpawn));this.player.velocity.set(0,0,0);
    Object.assign(this.player,{yaw:0,grounded:true,swimming:false,coyote:.1,jumpBuffer:0,landTimer:0,animation:'Idle_Loop'});
    this.humanoid=new HumanoidController(q);this.humanoid.resetAt(this.player.position,this.player.yaw);this.humanoid.setAvailableClips(this.humanoidClips,this.humanoidMotions);this.humanoid.swimStyle='freestyle';this.syncActorBodies();
  }
  prepare(n:number,spawn:MapSpawn):boolean {
    const v=this.vehicles[n],q=this.environment;if(!v)return false;
    if(!this.canRelocate())return false;
    const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),spawn.yaw);
    let safe=q.safeSpawn(new Vector3(...spawn.position),vehicleBody(v.spec),rotation);
    if(!safe){this.message='该准备点没有足够净空';return false;}
    const candidate=createVehicle(v.spec);candidate.position.copy(safe);candidate.rotation.copy(rotation);candidate.yaw=spawn.yaw;resetCreatureState(candidate);
    if(!canPlaceCreature(candidate,q)){this.message='该准备点无法容纳完整载具及牵引马匹';return false;}
    if(q.withVehicleCollisions(v.spec.id,()=>!canPlaceCreature(candidate,q))){this.message='准备点被其他载具占用';return false;}
    const boarding=this.boardingPoint(candidate);
    if(!boarding){this.message='准备点旁没有安全交互位置';return false;}
    q.releaseVehicleRig(v.spec.id);Object.assign(v,candidate);this.prepared.set(v.spec.id,spawn);
    this.active=-1;this.transition=0;this.transitionKind='';this.teleportRevision++;
    this.player.position.copy(boarding);this.player.velocity.set(0,0,0);Object.assign(this.player,{yaw:v.yaw,grounded:false,swimming:!!q.waterAt(boarding),coyote:0,jumpBuffer:0,landTimer:0,animation:'Idle_Loop'});
    this.humanoid.setMounted(false,boarding,v.yaw);this.syncActorBodies();
    this.message=`${v.spec.name}已就位 · 按 F 驾驶`;return true;
  }
  get vehicle(){return this.vehicles[this.active];}
  nearest():number {let best=-1,d=Infinity;this.vehicles.forEach((v,n)=>{const ds=v.position.distanceTo(this.player.position),body=vehicleBody(v.spec),range=body.kind==='box'?Math.max(5.3,body.halfExtents[0]+2):Math.max(5.3,v.motion.creature?v.spec.radius+1.6:0);if(this.available(v)&&ds<range&&ds<d&&v.velocity.length()<3){d=ds;best=n;}});return best;}
  private boardingPoint(v:VehicleState):Vector3|null {
    const q=this.environment;const body=vehicleBody(v.spec);
    const rx=body.kind==='box'?body.halfExtents[0]+(v.motion.submersible?1.35:.9):v.spec.radius+1.2,rz=body.kind==='box'?body.halfExtents[2]+(v.motion.submersible?1.35:.9):v.spec.radius+1.2;
    const offsets=[[rx,0],[-rx,0],[0,-rz],[0,rz]];
    // Prefer a dry pontoon when boarding a paddle craft; retain swimming exits offshore.
    for(const dryOnly of (v.spec.mode==='paddled_boat'||v.motion.submersible?[true,false]:[false]))for(const [x=0,z=0] of offsets){
      const p=new Vector3(x,0,z).applyAxisAngle(new Vector3(0,1,0),v.yaw).add(v.position);
      const floor=q.support(p,4,.45),water=q.waterAt(p);
      if(dryOnly){if(!floor||(water&&floor.height<water.surface)||Math.abs(floor.height-v.position.y)>1)continue;p.y=floor.height+.025;}
      else if(water&&v.position.y<water.surface+2)p.y=water.surface-1.25;
      else if(floor&&Math.abs(floor.height-v.position.y)<4)p.y=floor.height+.025;
      else continue;
      const selectedDistance=v.position.distanceTo(p);
      if(v.motion.creature?.leadPosition&&v.motion.creature.leadPosition.distanceTo(p)<2.3)continue;
      if(this.vehicles.some(o=>o.spec.id!==v.spec.id&&this.available(o)&&(actorBlocksPlayer(o,p,.5)||(o.velocity.length()<3&&o.position.distanceTo(p)<=selectedDistance))))continue;
      const safe=q.safeSpawn(p,HUMANOID_BODY);if(safe)return safe;
    }return null;
  }
  private mountContext(): MountContext {
    return {
      environment: this.environment,
      humanoid: this.humanoid,
      vehicles: this.vehicles,
      available: v => this.available(v),
      transitionSeconds: this.transition,
      mountedInstanceId: this.vehicle?.spec.id ?? null,
    };
  }
  private boardingDecision(id:string):MountDecision {
    const v=this.vehicles.find(v=>v.spec.id===id);
    if(v?.spec.mode==='mount'||!v||this.vehicle?.spec.mode==='mount')return evaluateMount(this.mountContext(),id);
    const fail=(code:MountFailureCode,message:string):MountDecision=>({ok:false,code,message});
    if(this.transition>0)return fail('HUMANOID_TRANSITION_ACTIVE','骑乘切换尚未完成');
    if(this.vehicle)return fail('HUMANOID_ALREADY_MOUNTED','人物已经骑乘');
    if(!this.humanoid.canBoard)return fail('HUMANOID_CHARACTER_BUSY',this.humanoid.boardingReason);
    if(!this.available(v))return fail('HUMANOID_TARGET_UNAVAILABLE','当前地图不支持该载具');
    if(v.velocity.length()>=3)return fail('VEHICLE_MOUNT_TOO_FAST','载具速度过快');
    const body=vehicleBody(v.spec),range=Math.max(5.3,body.kind==='box'?body.halfExtents[0]+2:0);
    if(v.position.distanceTo(this.player.position)>=range)return fail('VEHICLE_MOUNT_OUT_OF_REACH','靠近载具，按 F 进入驾驶位');
    if(v.spec.bodyPhysics?.kind==='paddle'&&this.environment.bodyOverlap({position:v.position,rotation:v.rotation,body:paddleRiderBody(v.spec.seat)},{excludedActorIds:new Set([v.spec.id]),excludedColliderHandles:new Set([this.humanoid.capsule.handle])}))return fail('VEHICLE_MOUNT_SPACE_BLOCKED','座位上方空间不足，无法搭乘');
    return {ok:true,instanceId:id,position:new Vector3(...v.spec.seat).applyQuaternion(v.rotation).add(v.position),yaw:v.yaw,velocity:new Vector3()};
  }
  /** On-demand read of existing boarding geometry and the execution admission decision. */
  inspectBoarding(id:string):{approachPositionWorldMetersXYZ:[number,number,number]|null;eligible:boolean;reason:string;message:string} {
    const v=this.vehicles.find(v=>v.spec.id===id),decision=this.boardingDecision(id);
    const approach=v&&this.available(v)&&v.velocity.length()<3?this.boardingPoint(v):null;
    return {approachPositionWorldMetersXYZ:approach?approach.toArray():null,eligible:decision.ok,
      reason:decision.ok?'ELIGIBLE':decision.code,message:decision.ok?'可以登乘':decision.message};
  }
  private commitInteraction(decision: MountDecision, entering: boolean): boolean {
    if (!decision.ok) {
      this.failureCode = decision.code;
      this.message = decision.message;
      return false;
    }
    const index = this.vehicles.findIndex(v => v.spec.id === decision.instanceId);
    if (entering) {
      if (!this.humanoid.setMounted(true)) return false;
      this.active = index;
      this.player.position.copy(decision.position);
      this.player.velocity.set(0, 0, 0);
      this.player.yaw = decision.yaw;
    } else {
      this.humanoid.commitDismount(decision.position, decision.yaw, decision.velocity);
      this.active = -1;
      this.syncHumanoidPlayer();
    }
    this.failureCode = undefined;
    this.transition = entering ? 0.5 : 0.38;
    this.transitionKind = entering ? 'enter' : 'exit';
    this.player.animation = entering ? 'Sitting_Enter' : 'Sitting_Exit';
    this.teleportRevision++;
    this.message = entering ? '控制权已交给坐骑' : '已离开坐骑';
    this.syncActorBodies();
    return true;
  }
  enter(id: string): boolean {
    this.failureCode = undefined;
    this.syncActorBodies();
    const target = this.vehicles.find(v => v.spec.id === id);
    if (target?.spec.mode === 'mount' || !target || this.vehicle?.spec.mode === 'mount')
      return this.commitInteraction(this.boardingDecision(id), true);
    if (this.vehicle) {
      this.failureCode = 'HUMANOID_ALREADY_MOUNTED';
      return false;
    }
    return this.interact(id);
  }
  exit(): boolean {
    this.failureCode = undefined;
    if (this.vehicle?.spec.mode === 'mount' || !this.vehicle) {
      this.syncActorBodies();
      return this.commitInteraction(evaluateDismount(this.mountContext()), false);
    }
    return this.interact();
  }
  interact(targetId?: string): boolean {
    this.failureCode = undefined;
    if (this.vehicle?.spec.mode === 'mount') return this.exit();
    if (targetId && this.vehicles.find(v => v.spec.id === targetId)?.spec.mode === 'mount')
      return this.enter(targetId);
    if (this.transition > 0) {
      this.failureCode = 'HUMANOID_TRANSITION_ACTIVE';
      return false;
    }
    if (!this.vehicle && !targetId) {
      this.syncActorBodies();
      const nearby = this.vehicles.filter(v => this.available(v)).sort((a, b) =>
        a.position.distanceToSquared(this.player.position) - b.position.distanceToSquared(this.player.position));
      for (const v of nearby) {
        if (v.spec.mode === 'mount') {
          const decision = evaluateMount(this.mountContext(), v.spec.id);
          if (decision.ok) return this.commitInteraction(decision, true);
        } else if (this.nearest() === this.vehicles.indexOf(v)) return this.interact(v.spec.id);
      }
      const first = nearby.find(v => v.spec.mode === 'mount');
      if (first) return this.commitInteraction(evaluateMount(this.mountContext(), first.spec.id), true);
    }
    if (this.vehicle) {
      const v = this.vehicle;
      if(v.motion.submersible&&(this.environment.waterAt(v.position)?.surface??-Infinity)-v.position.y>.4){this.message='请先上浮至水面，再打开舱门离开潜艇';return false;}
      if (v.velocity.length() > 5) {
        this.message = '速度过快，请先减速至 18 km/h 以下再离开载具';
        return false;
      }
      const pt = this.boardingPoint(v);
      if (!pt) {
        this.message = '两侧没有安全落点，移动载具后再试';
        return false;
      }
      if (!this.humanoid.setMounted(false, pt, v.yaw)) return false;
      this.active = -1;
      this.player.position.copy(pt); this.player.velocity.copy(v.velocity); this.player.yaw = v.yaw;
      this.player.grounded = false; this.player.animation = 'Sitting_Exit';
      this.transition = .38; this.transitionKind = 'exit'; this.message = '已离开载具';
      return true;
    }
    if (!this.humanoid.canBoard) { this.message = this.humanoid.boardingReason; return false; }
    const n = targetId ? this.vehicles.findIndex(v => v.spec.id === targetId) : this.nearest();
    if (n < 0) { this.message = '靠近载具，按 F 进入驾驶位'; return false; }
    {const decision=this.boardingDecision(this.vehicles[n]!.spec.id);
      if(!decision.ok){this.failureCode=decision.code;this.message=decision.message;return false;}
    }
    const entering=this.vehicles[n]!;
    if(entering.motion.submersible&&(this.environment.waterAt(entering.position)?.surface??-Infinity)-entering.position.y>.4){this.message='潜艇尚在水下，请先准备到水面再登艇';return false;}
    if (!this.humanoid.setMounted(true)) return false;
    this.active = n; this.player.velocity.set(0, 0, 0); this.player.animation = 'Sitting_Enter';
    this.transition = .5; this.transitionKind = 'enter'; this.message = '控制权已交给载具';
    return true;
  }
  visit(n:number) {
    const v=this.vehicles[n];if(!v)return;
    const spawn=this.prepared.get(v.spec.id)??this.environment.map.spawns.find(s=>s.vehicleId===v.spec.id)??this.environment.map.spawns.find(s=>this.environment.map.regions.find(r=>r.id===s.regionId)?.modes.includes(v.spec.mode));
    if(spawn)this.prepare(n,spawn);
  }
  approach(id:string):boolean {
    if(!this.canRelocate())return false;
    const v=this.vehicles.find(vehicle=>vehicle.spec.id===id);
    if(!v){this.message='未找到该载具';return false;}
    if(!this.available(v)){this.message='当前地图不支持该载具';return false;}
    if(v.velocity.length()>=3){this.message='载具仍在移动，请减速或使用场景预设重新准备';return false;}
    const pt=this.boardingPoint(v);if(!pt){this.message='载具附近没有安全交互位置，请重新准备';return false;}
    if(!this.humanoid.setMounted(false,pt,v.yaw))return false;
    this.active=-1;this.transition=0;this.transitionKind='';this.teleportRevision++;this.player.position.copy(pt);this.player.velocity.set(0,0,0);Object.assign(this.player,{yaw:v.yaw,grounded:false,swimming:!!this.environment.waterAt(pt),coyote:0,jumpBuffer:0,landTimer:0,animation:'Idle_Loop'});return true;
  }
  reset() {
    this.environment.resetProps();
    if(this.active<0){this.environment.interactions.reset();this.humanoid.reset();this.syncHumanoidPlayer();this.transition=0;this.transitionKind='';this.teleportRevision++;this.message='人物与交互物已复位';}
    else this.visit(this.active);
  }
    recoverVehicle():boolean {
      const v=this.vehicle,q=this.environment;
      if(!v||!['wheeled','motorcycle','unicycle','skateboard'].includes(v.spec.mode)){this.message='请先进入地面车辆，再使用原地扶正';return false;}
      const forward=new Vector3(0,0,1).applyQuaternion(v.rotation);
      const yaw=Math.hypot(forward.x,forward.z)>.05?Math.atan2(forward.x,forward.z):v.yaw;
      const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw),body=vehicleBody(v.spec);
      const support=q.support(v.position,4,.5);
      if(!support||support.normal.y<.65||(q.waterAt(v.position)?.surface??-Infinity)>support.height+.1){this.message='附近没有适合扶正的地面，请落地后重试或返回起点';return false;}
      const width=body.kind==='box'?body.halfExtents[0]:body.radius,length=body.kind==='box'?body.halfExtents[2]:body.radius;
      const offsets=[new Vector3()];
      // 从原点向外逐圈寻找；覆盖整个底盘及边沿余量，不能只检测车身中心。
      for(let radius=.5;radius<=6;radius+=.5)for(let n=0;n<24;n++)offsets.push(new Vector3(Math.cos(n*Math.PI/12)*radius,0,Math.sin(n*Math.PI/12)*radius));
      let safe:Vector3|undefined;
      for(const offset of offsets){
        const candidate=v.position.clone().add(offset),heights:number[]=[];let supported=true;
        for(const x of [-width-.3,0,width+.3])for(const z of [-length-.3,0,length+.3]){
          const point=new Vector3(x,0,z).applyQuaternion(rotation).add(candidate);point.y=support.height+.5;
          const hit=q.support(point,4,0);
          if(!hit||hit.normal.y<.97||(q.waterAt(point)?.surface??-Infinity)>hit.height+.1){supported=false;break;}
          heights.push(hit.height);
        }
        if(!supported||Math.max(...heights)-Math.min(...heights)>.18)continue;
        candidate.y=Math.max(...heights)+.12;
        // 不借扶正穿过墙体，也不穿过中途的低顶。
        const from=v.position.clone().add(new Vector3(0,.8,0)),to=candidate.clone().add(new Vector3(0,.8,0)),delta=to.sub(from),distance=delta.length();
        if(distance>.01&&q.raycast(from,delta.divideScalar(distance),distance))continue;
        const placed=q.safeSpawn(candidate,body,rotation);
        if(!placed||q.bodyOverlap({position:placed,rotation,body},{excludedActorIds:new Set([v.spec.id])}))continue;
        safe=placed;break;
      }
      if(!safe){this.message='附近 6 米内没有稳定且有净空的落点，请使用返回起点';return false;}
      const relocated=Math.hypot(safe.x-v.position.x,safe.z-v.position.z)>.01;
      // 找到稳定支撑并验证净空后才替换；保留驾驶关系、配置和当前测试点。
      q.releaseVehicleRig(v.spec.id);v.position.copy(safe);v.rotation.copy(rotation);v.yaw=yaw;v.pitch=v.roll=0;
      v.velocity.set(0,0,0);v.speed=v.steering=v.throttle=0;v.grounded=false;v.submerged=false;
      resetFamilyRigidState(v);
      this.player.position.copy(v.position);this.player.velocity.set(0,0,0);this.player.yaw=yaw;
      this.transition=0;this.transitionKind='';this.teleportRevision++;this.syncActorBodies();this.message=relocated?'车辆已移至附近安全地面并扶正 · 可以继续驾驶':'车辆已原地扶正 · 可以继续驾驶';return true;
    }
    step(i:Input,dt:number,cameraYaw=0,actorInputs:ReadonlyMap<string,ActorInput>=new Map()) {
    this.humanoid.skills.syncSeats((id,point)=>this.environment.propAnchor(id,point));
    this.syncActorBodies();
    this.stepActors(i,dt,cameraYaw);
    for(const [id,actor] of this.actors){
      actor.controller.skills.syncSeats((target,point)=>this.environment.propAnchor(target,point));
      const controls=actorInputs.get(id);actor.step(controls?.input??emptyInput(),controls?.yaw??0);
    }
    this.syncActorBodies();this.environment.stepPhysics(dt);this.syncActorBodies();if(this.vehicle&&(this.vehicle.motion.wheelPhysics||this.vehicle.motion.body||this.vehicle.motion.aircraft)){this.player.position.copy(this.vehicle.position);this.player.yaw=this.vehicle.yaw;}this.humanoid.skills.syncDropped();this.humanoid.skills.syncSeats((id,point)=>this.environment.propAnchor(id,point));
  }
  private stepActors(i:Input,dt:number,cameraYaw=0) {
    this.time+=dt;this.transition=Math.max(0,this.transition-dt);
    const vehicleBefore=this.vehicle?.position.clone();
    const before=this.vehicle?{unicycle:copyUnicycleState(this.vehicle.motion.unicycle),submersible:copySubmersibleState(this.vehicle.motion.submersible),jetski:copyJetSkiState(this.vehicle.motion.jetski),atv:copyAtvState(this.vehicle.motion.atv),rotation:this.vehicle.rotation.clone(),yaw:this.vehicle.yaw,pitch:this.vehicle.pitch,roll:this.vehicle.roll,creature:this.vehicle.motion.creature?{...this.vehicle.motion.creature,leadPosition:this.vehicle.motion.creature.leadPosition?.clone()}:undefined}:undefined;
    for (const v of this.vehicles) {
      // 只有驾驶中的载具接收输入；四轮车停车后仍计算重力、悬架和驻车制动。
      if (v === this.vehicle && this.transition === 0)
        stepVehicle(v, i, dt, this.time, this.environment);
      else if ((v.motion.wheelPhysics||v.motion.body||v.motion.aircraft||v.motion.flyingCreature)&&this.available(v))
        stepVehicle(v,{...emptyInput(),brake:!v.motion.flyingCreature,slow:!!v.motion.flyingCreature},dt,this.time,this.environment);
      else if (
        (v !== this.vehicle || v.spec.mode === 'paddled_boat' || !!v.motion.jetski || !!v.motion.submersible) &&
        (!!v.motion.submersible || !!v.motion.jetski || v.spec.mode === "paddled_boat" || v.spec.mode === "mount" || v.spec.mode === "sled" || v.spec.mode === "ski") &&
        this.available(v) &&
        (!!v.motion.submersible || !!v.motion.jetski || v.velocity.lengthSq() > 1e-8 ||
          !v.grounded ||
          (this.environment &&
            !this.environment.standingSupport(
              v.position,
              0.08,
              Math.PI / 2 - 0.01,
            )))
      ) {
        const previous = {
          ...(v.motion.submersible?{submersible:copySubmersibleState(v.motion.submersible)}:{}),
          ...(v.motion.jetski?{jetski:copyJetSkiState(v.motion.jetski)}:{}),
          position: v.position.clone(),
          rotation: v.rotation.clone(),
          yaw: v.yaw,
          pitch: v.pitch,
          roll: v.roll,
          creature: v.motion.creature
            ? { ...v.motion.creature, leadPosition: v.motion.creature.leadPosition?.clone() }
            : undefined,
        };
        stepVehicle(v, emptyInput(), dt, this.time, this.environment);
        if (
          this.vehicles.some(
            (o) => o !== v && this.available(o) && actorsTouch(v, o),
          )
        ) {
          const {creature,submersible,jetski,...pose}=previous;Object.assign(v,pose);if(v.motion.creature)v.motion.creature=creature;if(v.motion.submersible&&submersible)v.motion.submersible=submersible;if(v.motion.jetski&&jetski)v.motion.jetski=jetski;
          if(v.motion.jetski)finishJetSkiStep(v,previous.position,dt,this.time);
          v.velocity.set(0, 0, 0);
          v.speed = 0;
        }
      }
    }
    if(this.vehicle&&!this.vehicle.motion.flyingCreature&&!this.vehicle.motion.wheelPhysics&&!this.vehicle.motion.body&&!this.vehicle.motion.aircraft&&vehicleBefore){if(this.vehicles.some(o=>o!==this.vehicle&&this.available(o)&&actorsTouch(this.vehicle!,o))){this.vehicle.position.copy(vehicleBefore);this.vehicle.rotation.copy(before!.rotation);this.vehicle.yaw=before!.yaw;this.vehicle.pitch=before!.pitch;this.vehicle.roll=before!.roll;this.vehicle.motion.creature=before!.creature;if(this.vehicle.motion.atv&&before!.atv){this.vehicle.motion.atv.wheelAngles=[...before!.atv.wheelAngles];this.vehicle.motion.atv.suspension=[...before!.atv.suspension];}if(this.vehicle.motion.submersible&&before!.submersible)this.vehicle.motion.submersible=before!.submersible;if(this.vehicle.motion.jetski&&before!.jetski){this.vehicle.motion.jetski=before!.jetski;finishJetSkiStep(this.vehicle,vehicleBefore,dt,this.time);}this.vehicle.velocity.set(0,0,0);this.vehicle.speed=0;if(this.vehicle.motion.unicycle&&before!.unicycle){this.vehicle.motion.unicycle=before!.unicycle;finishUnicycleStep(this.vehicle,vehicleBefore,i,dt,this.environment);}}}
    const p=this.player;
    if (this.vehicle) {
      p.position.copy(this.vehicle.position);
      if (this.vehicle.spec.mode === 'mount')
        p.position.add(new Vector3(...this.vehicle.spec.seat).applyQuaternion(this.vehicle.rotation));
      p.yaw = this.vehicle.yaw;
      p.animation = this.transition > 0 ? 'Sitting_Enter' : this.vehicle.spec.characterPose === 'stand' ? 'Idle_Loop' : 'Driving_Loop';
      return;
    }
    // A dismount transition suppresses input while gravity and inherited velocity continue.
    if (this.transition > 0) i = emptyInput();
    if(stepHumanoidInput(this.humanoid,i,cameraYaw))this.teleportRevision++;
    this.syncHumanoidPlayer();
  }
}
