import {copyFlyingCreatureState} from './motion-families/flying-creature/state';
import { Quaternion,Vector3 } from 'three';
import { AIRCRAFT } from '../config/aircraft';
import type { CreatureState } from './creatures/types';
import type { HumanoidActor } from './humanoid/actor';
import type { HumanoidRenderState } from './humanoid/animation';
import { blendHumanoid,copyHumanoid,readHumanoid } from './humanoid/render-state';
import { copyAtvState,type AtvState } from './motion-families/ground-vehicle/atv';
import type { TankState } from './motion-families/ground-vehicle/tank';
import { blendUnicycleState,copyUnicycleState,type UnicycleState } from './motion-families/ground-vehicle/unicycle';
import type { SimulatedWheel } from './motion-families/ground-vehicle/wheel-physics';
import { copyJetSkiState,type JetSkiState } from './motion-families/surface-vessel/jetski';
import type { KayakState } from './motion-families/surface-vessel/paddling';
import type { RaftState } from './motion-families/surface-vessel/raft';
import { copySubmersibleState,type SubmersibleState } from './motion-families/underwater/submersible';
import { Simulation,angleDelta } from './simulation';
export const FIXED_STEP=1/60;
export interface MotionPose {flyingCreature?:import("./motion-families/flying-creature/state").FlyingCreatureStateV1|undefined;wheels?:SimulatedWheel[]|undefined;position:Vector3;rotation:Quaternion;velocity:Vector3;yaw:number;speed:number;steering:number;creature?:CreatureState|undefined;humanoid?:HumanoidRenderState|undefined;cameraHeight?:number|undefined;kayak?:KayakState|undefined;tank?:TankState|undefined;atv?:AtvState|undefined;raft?:RaftState|undefined;jetski?:JetSkiState|undefined;submersible?:SubmersibleState|undefined;unicycle?:UnicycleState|undefined}
export interface HumanoidDisplaySample {
  readonly epoch:number;
  readonly previousTick:number;
  readonly currentTick:number;
  readonly alpha:number;
  readonly timeSeconds:number;
  readonly actors:Readonly<Record<string,ActorPose>>;
  readonly vehicles:readonly MotionPose[];
}
export interface ActorPose extends MotionPose {readonly mountedInstanceId:string|null}
function copyCreature(from?:CreatureState):CreatureState|undefined{return from?{...from,leadPosition:from.leadPosition?.clone()}:undefined;}
const pose=():MotionPose=>({position:new Vector3(),rotation:new Quaternion(),velocity:new Vector3(),yaw:0,speed:0,steering:0});
const copy=(out:MotionPose,from:MotionPose)=>{out.flyingCreature=from.flyingCreature?copyFlyingCreatureState(from.flyingCreature):undefined;out.position.copy(from.position);out.rotation.copy(from.rotation);out.velocity.copy(from.velocity);out.yaw=from.yaw;out.speed=from.speed;out.steering=from.steering;out.wheels=from.wheels?.map(w=>({...w}));out.creature=copyCreature(from.creature);out.humanoid=copyHumanoid(from.humanoid);out.cameraHeight=from.cameraHeight;out.unicycle=copyUnicycleState(from.unicycle);out.submersible=copySubmersibleState(from.submersible);out.raft=from.raft?{...from.raft}:undefined;out.jetski=copyJetSkiState(from.jetski);out.atv=copyAtvState(from.atv);out.kayak=from.kayak?{...from.kayak}:undefined;out.tank=from.tank?{...from.tank}:undefined;};
function readActor(actor:HumanoidActor,player:MotionPose){
  player.position.copy(actor.player.position);player.velocity.copy(actor.player.velocity);player.yaw=actor.player.yaw;player.rotation.set(0,Math.sin(player.yaw/2),0,Math.cos(player.yaw/2));player.speed=actor.player.velocity.length();
  player.humanoid=readHumanoid(actor.controller);player.cameraHeight=actor.controller?(actor.controller.swimming?1.4:actor.controller.capsuleHeight*.655):1.25;
  if(player.humanoid){player.humanoid.mounted=actor.vehicle?(actor.vehicle.spec.characterPose??'drive'):null;
    const t=actor.dragonTransition;if(t)player.humanoid.dragonMount={progress:1-actor.transition/t.duration,entering:t.entering,side:t.side};
    if(actor.vehicle?.motion.kayak)player.humanoid.kayakPose={...actor.vehicle.motion.kayak};
    if(actor.vehicle?.motion.jetski)player.humanoid.atvSteeringAngle=actor.vehicle.motion.jetski.steeringAngle;
    if(actor.vehicle?.motion.unicycle)player.humanoid.unicyclePose=copyUnicycleState(actor.vehicle.motion.unicycle);
    if(actor.vehicle?.motion.atv)player.humanoid.atvSteeringAngle=actor.vehicle.motion.atv.steeringAngle;
    if(actor.vehicle?.motion.sled)player.humanoid.sledPose={...actor.vehicle.motion.sled};}
}
function readVehicles(sim:Simulation,vehicles:MotionPose[]){
  sim.vehicles.forEach((v,n)=>{const p=vehicles[n]!;p.flyingCreature=v.motion.flyingCreature?copyFlyingCreatureState(v.motion.flyingCreature):undefined;p.position.copy(v.position);p.rotation.copy(v.rotation);p.velocity.copy(v.velocity);p.yaw=v.yaw;p.speed=v.speed;p.steering=v.steering;p.wheels=v.motion.wheelPhysics?.wheels.map(w=>({...w}))??v.motion.aircraft?.wheels.map((w,n)=>({...w,hubHeight:AIRCRAFT.wheels[n]!.y,length:.25-w.compression,omega:0,slip:0,force:0}));p.creature=copyCreature(v.motion.creature);p.unicycle=copyUnicycleState(v.motion.unicycle);p.submersible=copySubmersibleState(v.motion.submersible);p.raft=v.motion.raft?{...v.motion.raft}:undefined;p.jetski=copyJetSkiState(v.motion.jetski);p.atv=copyAtvState(v.motion.atv);p.kayak=v.motion.kayak?{...v.motion.kayak}:undefined;p.tank=v.motion.tank?{...v.motion.tank}:undefined;});
}
function blend(out:MotionPose,a:MotionPose,b:MotionPose,alpha:number){out.flyingCreature=b.flyingCreature?copyFlyingCreatureState(b.flyingCreature):undefined;
  if(out.flyingCreature&&a.flyingCreature&&b.flyingCreature){
    for(const key of ['pitchRadians','bankRadians','speedMetersPerSecond','groundBlend','groundSeconds'] as const)out.flyingCreature[key]=a.flyingCreature[key]+(b.flyingCreature[key]-a.flyingCreature[key])*alpha;
    if(a.flyingCreature.evadeCount===b.flyingCreature.evadeCount)out.flyingCreature.evadeRemainingSeconds=a.flyingCreature.evadeRemainingSeconds+(b.flyingCreature.evadeRemainingSeconds-a.flyingCreature.evadeRemainingSeconds)*alpha;
  }
  out.position.lerpVectors(a.position,b.position,alpha);out.rotation.slerpQuaternions(a.rotation,b.rotation,alpha);out.velocity.lerpVectors(a.velocity,b.velocity,alpha);out.yaw=a.yaw+angleDelta(a.yaw,b.yaw)*alpha;out.speed=a.speed+(b.speed-a.speed)*alpha;out.steering=a.steering+(b.steering-a.steering)*alpha;
  out.humanoid=blendHumanoid(a.humanoid,b.humanoid,alpha);out.cameraHeight=(a.cameraHeight??1.25)+((b.cameraHeight??1.25)-(a.cameraHeight??1.25))*alpha;
  out.unicycle=blendUnicycleState(a.unicycle,b.unicycle,alpha);
  out.submersible=copySubmersibleState(b.submersible);if(out.submersible&&a.submersible&&b.submersible)out.submersible.rotorPhase=a.submersible.rotorPhase+(b.submersible.rotorPhase-a.submersible.rotorPhase)*alpha;
  out.raft=b.raft?{...b.raft}:undefined;if(out.raft&&a.raft)out.raft.compression=a.raft.compression+(b.raft!.compression-a.raft.compression)*alpha;
  out.jetski=copyJetSkiState(b.jetski);if(out.jetski&&a.jetski&&b.jetski)out.jetski.steeringAngle=a.jetski.steeringAngle+(b.jetski.steeringAngle-a.jetski.steeringAngle)*alpha;
  out.atv=copyAtvState(b.atv);
  if(out.atv&&a.atv&&b.atv){out.atv.steeringAngle=a.atv.steeringAngle+(b.atv.steeringAngle-a.atv.steeringAngle)*alpha;for(let i=0;i<4;i++){out.atv.wheelAngles[i]=a.atv.wheelAngles[i]!+(b.atv.wheelAngles[i]!-a.atv.wheelAngles[i]!)*alpha;out.atv.suspension[i]=a.atv.suspension[i]!+(b.atv.suspension[i]!-a.atv.suspension[i]!)*alpha;if(out.atv.wheelSteers&&a.atv.wheelSteers&&b.atv.wheelSteers)out.atv.wheelSteers[i]=a.atv.wheelSteers[i]!+(b.atv.wheelSteers[i]!-a.atv.wheelSteers[i]!)*alpha;}}
  out.kayak=b.kayak?{...b.kayak}:undefined;if(out.kayak&&a.kayak&&b.kayak)out.kayak.phase=a.kayak.phase+(b.kayak.phase-a.kayak.phase)*alpha;
  out.tank=b.tank?{...b.tank}:undefined;
  if(out.tank&&a.tank&&b.tank)for(const k of ['turretYaw','gunElevation','leftTravel','rightTravel'] as const)out.tank[k]=a.tank[k]+(b.tank[k]-a.tank[k])*alpha;
  out.wheels=b.wheels?.map((w,i)=>{const prior=a.wheels?.[i]??w;return {...w,length:prior.length+(w.length-prior.length)*alpha,steer:prior.steer+(w.steer-prior.steer)*alpha,angle:prior.angle+(w.angle-prior.angle)*alpha};});
  out.creature=copyCreature(b.creature);
  if(out.creature&&a.creature&&b.creature){out.creature.phase=a.creature.phase+(b.creature.phase-a.creature.phase)*alpha;
    if(a.creature.leadPosition&&b.creature.leadPosition)out.creature.leadPosition!.lerpVectors(a.creature.leadPosition,b.creature.leadPosition,alpha);
    if(a.creature.leadYaw!==undefined&&b.creature.leadYaw!==undefined)out.creature.leadYaw=a.creature.leadYaw+angleDelta(a.creature.leadYaw,b.creature.leadYaw)*alpha;
  }
}
/** One history and render timestamp for every actor and vehicle. */
export class PresentationState {
  private previousTime=0;
  private currentTime=0;
  private readonly actors=new Map<string,{previous:MotionPose;current:MotionPose;revision:number;vehicleIndex:number;mountedInstanceId:string|null}>();
  vehicles:MotionPose[];previousVehicles:MotionPose[];currentVehicles:MotionPose[];
  constructor(sim:Simulation){this.vehicles=sim.vehicles.map(pose);this.previousVehicles=sim.vehicles.map(pose);this.currentVehicles=sim.vehicles.map(pose);this.snap(sim);}
  hasDiscontinuity(sim:Simulation):boolean{return this.actors.size!==sim.actors.size||[...sim.actors].some(([id,actor])=>{const old=this.actors.get(id);return !old||old.revision!==actor.teleportRevision||old.vehicleIndex!==actor.vehicleIndex;});}
  snap(sim:Simulation):void{
    this.previousTime=this.currentTime=sim.time;this.actors.clear();
    for(const [id,actor] of sim.actors){const current=pose(),previous=pose();readActor(actor,current);copy(previous,current);this.actors.set(id,{previous,current,revision:actor.teleportRevision,vehicleIndex:actor.vehicleIndex,mountedInstanceId:actor.vehicle?.spec.id??null});}
    readVehicles(sim,this.currentVehicles);this.currentVehicles.forEach((p,n)=>copy(this.previousVehicles[n]!,p));
    this.interpolate(1);
  }
  beforeStep(sim:Simulation):void{if(this.hasDiscontinuity(sim))this.snap(sim);this.previousTime=this.currentTime;for(const state of this.actors.values())copy(state.previous,state.current);this.currentVehicles.forEach((p,n)=>copy(this.previousVehicles[n]!,p));}
  afterStep(sim:Simulation):void{if(this.hasDiscontinuity(sim)){this.snap(sim);return;}this.currentTime=sim.time;for(const [id,actor] of sim.actors)readActor(actor,this.actors.get(id)!.current);readVehicles(sim,this.currentVehicles);}
  interpolate(alpha:number):void{alpha=Math.max(0,Math.min(1,alpha));this.vehicles.forEach((p,n)=>blend(p,this.previousVehicles[n]!,this.currentVehicles[n]!,alpha));}
  sample(alpha:number,epoch:number,previousTick:number,currentTick:number):HumanoidDisplaySample{
    alpha=Math.max(0,Math.min(1,alpha));const actors:Record<string,ActorPose>={},vehicles=this.currentVehicles.map(pose);
    for(const [id,state] of this.actors){const sampled=pose();blend(sampled,state.previous,state.current,alpha);actors[id]={...sampled,mountedInstanceId:state.mountedInstanceId};}
    vehicles.forEach((value,index)=>blend(value,this.previousVehicles[index]!,this.currentVehicles[index]!,alpha));
    return {epoch,previousTick,currentTick,alpha,timeSeconds:this.previousTime+(this.currentTime-this.previousTime)*alpha,actors,vehicles};
  }
}
