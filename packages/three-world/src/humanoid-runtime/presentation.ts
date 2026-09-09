import type {SimulatedWheel} from './wheel-physics';
import { Quaternion, Vector3 } from 'three';
import { Simulation, angleDelta } from './simulation';
import type { CreatureState } from './creatures/types';
import type { HumanoidRenderState } from './humanoid/animation';
import { readHumanoid,copyHumanoid,blendHumanoid,readInteractionTargets,copyTargets,blendTargets } from './humanoid/render-state';
import type { InteractionVisualTarget } from './humanoid/interaction-visuals';
export const FIXED_STEP=1/60;
export interface MotionPose {wheels?:SimulatedWheel[]|undefined;position:Vector3;rotation:Quaternion;velocity:Vector3;yaw:number;speed:number;steering:number;creature?:CreatureState|undefined;humanoid?:HumanoidRenderState|undefined;cameraHeight?:number|undefined}
export interface HumanoidDisplaySample {
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
const copy=(out:MotionPose,from:MotionPose)=>{out.position.copy(from.position);out.rotation.copy(from.rotation);out.velocity.copy(from.velocity);out.yaw=from.yaw;out.speed=from.speed;out.steering=from.steering;out.wheels=from.wheels?.map(w=>({...w}));out.creature=copyCreature(from.creature);out.humanoid=copyHumanoid(from.humanoid);out.cameraHeight=from.cameraHeight;};
function read(sim:Simulation,player:MotionPose,vehicles:MotionPose[]){
  player.position.copy(sim.player.position);player.velocity.copy(sim.player.velocity);player.yaw=sim.player.yaw;player.rotation.set(0,Math.sin(player.yaw/2),0,Math.cos(player.yaw/2));player.speed=sim.player.velocity.length();
  player.humanoid=readHumanoid(sim.humanoid);player.cameraHeight=sim.humanoid?(sim.humanoid.swimming?1.4:sim.humanoid.capsuleHeight*.655):1.25;
  if(player.humanoid)player.humanoid.mounted=sim.vehicle?(sim.vehicle.spec.characterPose==='stand'?'stand':sim.vehicle.spec.characterPose==='ride'?'ride':'drive'):null;
  sim.vehicles.forEach((v,n)=>{const p=vehicles[n]!;p.position.copy(v.position);p.rotation.copy(v.rotation);p.velocity.copy(v.velocity);p.yaw=v.yaw;p.speed=v.speed;p.steering=v.steering;p.wheels=v.wheelPhysics?.wheels.map(w=>({...w}));p.creature=copyCreature(v.creature);});
}
function blend(out:MotionPose,a:MotionPose,b:MotionPose,alpha:number){out.position.lerpVectors(a.position,b.position,alpha);out.rotation.slerpQuaternions(a.rotation,b.rotation,alpha);out.velocity.lerpVectors(a.velocity,b.velocity,alpha);out.yaw=a.yaw+angleDelta(a.yaw,b.yaw)*alpha;out.speed=a.speed+(b.speed-a.speed)*alpha;out.steering=a.steering+(b.steering-a.steering)*alpha;
  out.humanoid=blendHumanoid(a.humanoid,b.humanoid,alpha);out.cameraHeight=(a.cameraHeight??1.25)+((b.cameraHeight??1.25)-(a.cameraHeight??1.25))*alpha;
  out.wheels=b.wheels?.map((w,i)=>{const prior=a.wheels?.[i]??w;return {...w,length:prior.length+(w.length-prior.length)*alpha,steer:prior.steer+(w.steer-prior.steer)*alpha,angle:prior.angle+(w.angle-prior.angle)*alpha};});
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
  sample(alpha:number,epoch:number,previousTick:number,currentTick:number):HumanoidDisplaySample {
    alpha=Math.max(0,Math.min(1,alpha));
    const player=pose(),vehicles=this.currentVehicles.map(pose);
    blend(player,this.previousPlayer,this.currentPlayer,alpha);
    vehicles.forEach((value,index)=>blend(value,this.previousVehicles[index]!,this.currentVehicles[index]!,alpha));
    return {epoch,previousTick,currentTick,alpha,timeSeconds:this.previousTime+(this.currentTime-this.previousTime)*alpha,mountedInstanceId:this.mountedInstanceId,player,vehicles};
  }

}
