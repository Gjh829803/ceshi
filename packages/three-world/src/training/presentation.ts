import {copyUnicycleState,blendUnicycleState,type UnicycleState} from './unicycle';
import {copySubmersibleState,type SubmersibleState} from './submersible';
import {copyJetSkiState,type JetSkiState} from './jetski';
import type {RaftState} from './raft';
import type {KayakState} from './kayak';
import {copyAtvState,type AtvState} from './atv';
import type {TankState} from './tank';
import { Quaternion, Vector3 } from 'three';
import { Simulation, angleDelta } from './simulation';
import type { CreatureState } from './creatures/types';
import type { HumanoidRenderState } from './humanoid/animation';
import { readHumanoid,copyHumanoid,blendHumanoid,readInteractionTargets,copyTargets,blendTargets } from './humanoid/render-state';
import type { InteractionVisualTarget } from './humanoid/interaction-visuals';
export const FIXED_STEP=1/60;
export interface MotionPose {position:Vector3;rotation:Quaternion;velocity:Vector3;yaw:number;speed:number;steering:number;creature?:CreatureState|undefined;humanoid?:HumanoidRenderState|undefined;cameraHeight?:number|undefined;kayak?:KayakState|undefined;tank?:TankState|undefined;atv?:AtvState|undefined;raft?:RaftState|undefined;jetski?:JetSkiState|undefined;submersible?:SubmersibleState|undefined;unicycle?:UnicycleState|undefined}
export interface TrainingDisplaySample {
  readonly epoch:number;
  readonly previousTick:number;
  readonly currentTick:number;
  readonly alpha:number;
  readonly timeSeconds:number;
  readonly mountedInstanceId:string|null;
  readonly player:MotionPose;
  readonly vehicles:readonly MotionPose[];
}
function copyCreature(from?:CreatureState):CreatureState|undefined{return from?{...from,leadPosition:from.leadPosition?.clone()}:undefined;}
const pose=():MotionPose=>({position:new Vector3(),rotation:new Quaternion(),velocity:new Vector3(),yaw:0,speed:0,steering:0});
const copy=(out:MotionPose,from:MotionPose)=>{out.position.copy(from.position);out.rotation.copy(from.rotation);out.velocity.copy(from.velocity);out.yaw=from.yaw;out.speed=from.speed;out.steering=from.steering;out.creature=copyCreature(from.creature);out.humanoid=copyHumanoid(from.humanoid);out.cameraHeight=from.cameraHeight;out.unicycle=copyUnicycleState(from.unicycle);out.submersible=copySubmersibleState(from.submersible);out.raft=from.raft?{...from.raft}:undefined;out.jetski=copyJetSkiState(from.jetski);out.atv=copyAtvState(from.atv);out.kayak=from.kayak?{...from.kayak}:undefined;out.tank=from.tank?{...from.tank}:undefined;};
function read(sim:Simulation,player:MotionPose,vehicles:MotionPose[]){
  player.position.copy(sim.player.position);player.velocity.copy(sim.player.velocity);player.yaw=sim.player.yaw;player.rotation.set(0,Math.sin(player.yaw/2),0,Math.cos(player.yaw/2));player.speed=sim.player.velocity.length();
  player.humanoid=readHumanoid(sim.humanoid);player.cameraHeight=sim.humanoid?(sim.humanoid.swimming?1.4:sim.humanoid.capsuleHeight*.655):1.25;
  if(player.humanoid){player.humanoid.mounted=sim.vehicle?(sim.vehicle.spec.characterPose??'drive'):null;
    if(sim.vehicle?.kayak)player.humanoid.kayakPose={...sim.vehicle.kayak};
    if(sim.vehicle?.jetski)player.humanoid.atvSteeringAngle=sim.vehicle.jetski.steeringAngle;
    if(sim.vehicle?.unicycle)player.humanoid.unicyclePose=copyUnicycleState(sim.vehicle.unicycle);
    if(sim.vehicle?.atv)player.humanoid.atvSteeringAngle=sim.vehicle.atv.steeringAngle;
    if(sim.vehicle?.sled)player.humanoid.sledPose={...sim.vehicle.sled};}
  sim.vehicles.forEach((v,n)=>{const p=vehicles[n]!;p.position.copy(v.position);p.rotation.copy(v.rotation);p.velocity.copy(v.velocity);p.yaw=v.yaw;p.speed=v.speed;p.steering=v.steering;p.creature=copyCreature(v.creature);p.unicycle=copyUnicycleState(v.unicycle);p.submersible=copySubmersibleState(v.submersible);p.raft=v.raft?{...v.raft}:undefined;p.jetski=copyJetSkiState(v.jetski);p.atv=copyAtvState(v.atv);p.kayak=v.kayak?{...v.kayak}:undefined;p.tank=v.tank?{...v.tank}:undefined;});
}
function blend(out:MotionPose,a:MotionPose,b:MotionPose,alpha:number){out.position.lerpVectors(a.position,b.position,alpha);out.rotation.slerpQuaternions(a.rotation,b.rotation,alpha);out.velocity.lerpVectors(a.velocity,b.velocity,alpha);out.yaw=a.yaw+angleDelta(a.yaw,b.yaw)*alpha;out.speed=a.speed+(b.speed-a.speed)*alpha;out.steering=a.steering+(b.steering-a.steering)*alpha;
  out.humanoid=blendHumanoid(a.humanoid,b.humanoid,alpha);out.cameraHeight=(a.cameraHeight??1.25)+((b.cameraHeight??1.25)-(a.cameraHeight??1.25))*alpha;
  out.unicycle=blendUnicycleState(a.unicycle,b.unicycle,alpha);
  out.submersible=copySubmersibleState(b.submersible);if(out.submersible&&a.submersible&&b.submersible)out.submersible.rotorPhase=a.submersible.rotorPhase+(b.submersible.rotorPhase-a.submersible.rotorPhase)*alpha;
  out.raft=b.raft?{...b.raft}:undefined;if(out.raft&&a.raft)out.raft.compression=a.raft.compression+(b.raft!.compression-a.raft.compression)*alpha;
  out.jetski=copyJetSkiState(b.jetski);if(out.jetski&&a.jetski&&b.jetski)out.jetski.steeringAngle=a.jetski.steeringAngle+(b.jetski.steeringAngle-a.jetski.steeringAngle)*alpha;
  out.atv=copyAtvState(b.atv);
  if(out.atv&&a.atv&&b.atv){out.atv.steeringAngle=a.atv.steeringAngle+(b.atv.steeringAngle-a.atv.steeringAngle)*alpha;for(let i=0;i<4;i++){out.atv.wheelAngles[i]=a.atv.wheelAngles[i]!+(b.atv.wheelAngles[i]!-a.atv.wheelAngles[i]!)*alpha;out.atv.suspension[i]=a.atv.suspension[i]!+(b.atv.suspension[i]!-a.atv.suspension[i]!)*alpha;}}
  out.kayak=b.kayak?{...b.kayak}:undefined;if(out.kayak&&a.kayak&&b.kayak)out.kayak.phase=a.kayak.phase+(b.kayak.phase-a.kayak.phase)*alpha;
  out.tank=b.tank?{...b.tank}:undefined;
  if(out.tank&&a.tank&&b.tank)for(const k of ['turretYaw','gunElevation','leftTravel','rightTravel'] as const)out.tank[k]=a.tank[k]+(b.tank[k]-a.tank[k])*alpha;
  out.creature=copyCreature(b.creature);
  if(out.creature&&a.creature&&b.creature){out.creature.phase=a.creature.phase+(b.creature.phase-a.creature.phase)*alpha;
    if(a.creature.leadPosition&&b.creature.leadPosition)out.creature.leadPosition!.lerpVectors(a.creature.leadPosition,b.creature.leadPosition,alpha);
    if(a.creature.leadYaw!==undefined&&b.creature.leadYaw!==undefined)out.creature.leadYaw=a.creature.leadYaw+angleDelta(a.creature.leadYaw,b.creature.leadYaw)*alpha;
  }
}
/** One render timestamp shared by meshes, mounted characters and camera. */
export class PresentationState {
  private previousTime=0;
  private currentTime=0;
  private mountedInstanceId:string|null=null;
  targets:InteractionVisualTarget[]=[];private previousTargets:InteractionVisualTarget[]=[];private currentTargets:InteractionVisualTarget[]=[];
  player=pose();vehicles:MotionPose[];previousPlayer=pose();currentPlayer=pose();previousVehicles:MotionPose[];currentVehicles:MotionPose[];revision=-1;active=-2;
  constructor(sim:Simulation){this.vehicles=sim.vehicles.map(pose);this.previousVehicles=sim.vehicles.map(pose);this.currentVehicles=sim.vehicles.map(pose);this.snap(sim);}
  snap(sim:Simulation){this.previousTime=this.currentTime=sim.time;this.mountedInstanceId=sim.vehicle?.spec.id??null;read(sim,this.currentPlayer,this.currentVehicles);this.currentTargets=readInteractionTargets(sim.humanoid);this.previousTargets=copyTargets(this.currentTargets);copy(this.previousPlayer,this.currentPlayer);this.currentVehicles.forEach((p,n)=>copy(this.previousVehicles[n]!,p));this.revision=sim.teleportRevision;this.active=sim.active;this.interpolate(1);}
  beforeStep(sim:Simulation){if(this.revision!==sim.teleportRevision||this.active!==sim.active)this.snap(sim);this.previousTime=this.currentTime;this.previousTargets=copyTargets(this.currentTargets);copy(this.previousPlayer,this.currentPlayer);this.currentVehicles.forEach((p,n)=>copy(this.previousVehicles[n]!,p));}
  afterStep(sim:Simulation){if(this.revision!==sim.teleportRevision||this.active!==sim.active){this.snap(sim);return;}this.currentTime=sim.time;read(sim,this.currentPlayer,this.currentVehicles);this.currentTargets=readInteractionTargets(sim.humanoid);}
  interpolate(alpha:number){alpha=Math.max(0,Math.min(1,alpha));blend(this.player,this.previousPlayer,this.currentPlayer,alpha);this.targets=blendTargets(this.previousTargets,this.currentTargets,alpha);this.vehicles.forEach((p,n)=>blend(p,this.previousVehicles[n]!,this.currentVehicles[n]!,alpha));}
  sample(alpha:number,epoch:number,previousTick:number,currentTick:number):TrainingDisplaySample {
    alpha=Math.max(0,Math.min(1,alpha));
    const player=pose(),vehicles=this.currentVehicles.map(pose);
    blend(player,this.previousPlayer,this.currentPlayer,alpha);
    vehicles.forEach((value,index)=>blend(value,this.previousVehicles[index]!,this.currentVehicles[index]!,alpha));
    return {epoch,previousTick,currentTick,alpha,timeSeconds:this.previousTime+(this.currentTime-this.previousTime)*alpha,mountedInstanceId:this.mountedInstanceId,player,vehicles};
  }

}
