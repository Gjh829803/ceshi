import {createBodyPhysics,stepBodyVehicle,validateBodyPhysics,type BodyPhysicsState} from './vehicle-dynamics';
import {createAircraftState,stepAircraft,type AircraftState} from './aircraft';
import {createWheelPhysics,stepWheelVehicle,validateWheelPhysics,type WheelPhysicsState} from './wheel-physics';
import { VEHICLE_ATTITUDE } from '../config/vehicle';

import {
  createUnicycleState,
  copyUnicycleState,
  stepUnicycle,
  finishUnicycleStep,
  type UnicycleState,
} from './unicycle';

import {
  createSubmersibleState,
  copySubmersibleState,
  stepSubmersible,
  finishSubmersibleStep,
  type SubmersibleState,
} from './submersible';

import {
  stepRaft,
  finishRaftContact,
  createRaftState,
  type RaftState,
} from './raft';

import {
  stepJetSki,
  finishJetSkiStep,
  createJetSkiState,
  copyJetSkiState,
  type JetSkiState,
} from './jetski';

import {
  stepKayak,
  createKayakState,
  type KayakState,
} from './kayak';

import {
  stepAtv,
  finishAtvStep,
  createAtvState,
  copyAtvState,
  type AtvState,
} from './atv';
import {evaluateMount,evaluateDismount,type MountContext,type MountDecision,type MountFailureCode} from './mounted-interaction';
import { Euler, Quaternion, Vector3 } from 'three';
import { HumanoidController,HUMANOID_BODY } from './humanoid/controller';
import type { MotionSource } from './humanoid/motion';
import { resetCreatureState, stepCreature, canPlaceCreature, creatureBodies } from './creatures/controller';
import type { CreatureState } from './creatures/types';
import { coastSpeed, roadYawRate } from './handling';
import {
  CONTROL_RANGES,
  DEFAULT_CHARACTER_CONTROL_BASE,
  defaultMovementSettings,
  parseMovementSettings,
  type MovementSettings,
} from '../config/control';

import {
  stepSled,
  type SledState,
} from './sled';

import {
  stepTank,
  finishTankStep,
  createTankState,
  type TankState,
} from './tank';

import { stepBus } from './bus';
import { EnvironmentQueries, vehicleBody } from './environment/queries';
import { groundVehiclePose } from './environment/vehicle-pose';
import type { MapSpawn } from './environment/types';
import { vehicleImpactMass,type VehicleSpec } from './config';
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const damp=(a:number,b:number,k:number,dt:number)=>a+(b-a)*(1-Math.exp(-k*dt));
export const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export interface HumanoidActionInput {toggleCrouch?:boolean;roll?:boolean;slide?:boolean;interact?:boolean;putDown?:boolean;prone?:boolean;climb?:boolean;releaseClimb?:boolean;toggleSwimStyle?:boolean;cancel?:boolean}
export interface Input { forward:number; steer:number; lift:number; roll:number; pitch:number; strafe:number; boost:boolean; brake:boolean; jump:boolean; slow:boolean;actions?:HumanoidActionInput }
export const emptyInput=():Input=>({forward:0,steer:0,lift:0,roll:0,pitch:0,strafe:0,boost:false,brake:false,jump:false,slow:false});
export interface VehicleState {aircraft?:AircraftState|undefined;bodyPhysics?:BodyPhysicsState|undefined;wheelPhysics?:WheelPhysicsState|undefined; spec:VehicleSpec & MovementSettings; position:Vector3; velocity:Vector3; rotation:Quaternion; yaw:number; pitch:number; roll:number; steering:number; throttle:number; grounded:boolean; launched:boolean; speed:number; submerged:boolean; creature?:CreatureState|undefined; sled?:SledState; tank?:TankState;kayak?:KayakState;atv?:AtvState;raft?:RaftState;jetski?:JetSkiState;submersible?:SubmersibleState;unicycle?:UnicycleState }
export function resolveVehicleSpec(spec:VehicleSpec):VehicleSpec & MovementSettings {
  if(spec.wheelPhysics){if(spec.mode!=='wheeled'&&spec.mode!=='bike'&&spec.mode!=='bus')throw new Error('VEHICLE_WHEEL_MODE_INVALID');validateWheelPhysics(spec.wheelPhysics);}
  if(spec.bodyPhysics){if(spec.wheelPhysics)throw new Error('VEHICLE_PHYSICS_OWNER_CONFLICT');validateBodyPhysics(spec.bodyPhysics);}
  const authored=Object.fromEntries(Object.keys(CONTROL_RANGES).filter(key=>Object.hasOwn(spec,key)).map(key=>[key,spec[key as keyof MovementSettings]]));
  const control=parseMovementSettings(authored,defaultMovementSettings(spec.mode,spec));
  return {...structuredClone(spec),...control};
}
export function createVehicle(spec:VehicleSpec):VehicleState {
  const state:VehicleState={...(spec.mode==='kayak'?{kayak:{...createKayakState(),...(spec.visualVariant==='canoe'?{craft:'canoe' as const,side:-1}:{})}}:{}),spec:resolveVehicleSpec(spec),position:new Vector3(...spec.spawn),velocity:new Vector3(),rotation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),spec.yaw),yaw:spec.yaw,pitch:0,roll:0,steering:0,throttle:0,grounded:true,launched:false,speed:0,submerged:false};
  if((spec.mode==='sled'||spec.mode==='ski'))state.sled={phase:0,push:0,brake:0,steer:0};
  if(spec.visualVariant==='bubble-sub'){state.submersible=createSubmersibleState();state.grounded=false;}
  if(spec.archetype==='raft')state.raft=createRaftState();
  if(spec.archetype==='jetski'){state.jetski=createJetSkiState();state.grounded=false;}
  if(spec.archetype==='unicycle')state.unicycle=createUnicycleState();
  if(spec.archetype==='atv')state.atv=createAtvState();
  if(spec.mode==='tank')state.tank=createTankState();
  state.bodyPhysics=spec.bodyPhysics?createBodyPhysics(state.spec.bodyPhysics!):undefined;
  if(spec.mode==='plane')state.aircraft=createAircraftState();
  state.wheelPhysics=spec.wheelPhysics?createWheelPhysics(state.spec.wheelPhysics):undefined;resetCreatureState(state);return state;
}
function actorFootprints(v:VehicleState){return creatureBodies(v).map((part,index)=>{
  const center=new Vector3(...part.body.offset).applyQuaternion(part.rotation).add(part.position);
  let halfHeight=part.body.kind==='capsule'?part.body.height/2:0;
  if(part.body.kind==='box')for(let axis=0;axis<3;axis++)halfHeight+=Math.abs(new Vector3().setComponent(axis,part.body.halfExtents[axis]!).applyQuaternion(part.rotation).y);
  return {position:part.position,radius:index===0?v.spec.radius:1.9,minY:center.y-halfHeight,maxY:center.y+halfHeight};
});}
function actorsTouch(a:VehicleState,b:VehicleState){return actorFootprints(a).some(p=>actorFootprints(b).some(o=>o.maxY>p.minY+.01&&p.maxY>o.minY+.01&&Math.hypot(o.position.x-p.position.x,o.position.z-p.position.z)<o.radius+p.radius));}
function actorBlocksPlayer(v:VehicleState,p:Vector3,margin:number){return actorFootprints(v).some(part=>p.y+1.75>part.minY&&p.y<part.maxY&&Math.hypot(part.position.x-p.x,part.position.z-p.z)<part.radius+margin);}
const forward=new Vector3(),right=new Vector3(),up=new Vector3(),scratch=new Vector3();
const euler=new Euler(0,0,0,'YXZ');
export function stepVehicle(v:VehicleState,i:Input,dt:number,time:number,environment:EnvironmentQueries) {
  if(v.aircraft){stepAircraft(v,i,dt,environment);return;}
  if(v.spec.wheelPhysics&&v.wheelPhysics){stepWheelVehicle(v,i,dt,environment);return;}
  if(v.bodyPhysics){stepBodyVehicle(v,i,dt,time,environment);return;}
  if(v.creature){stepCreature(v,i,dt,environment);return;}
  stepEnvironmentVehicle(v,i,dt,time,environment);
}
function stepVehicleControls(v:VehicleState,i:Input,dt:number,time:number,q:EnvironmentQueries) {
  const sample=(x:number,z:number,afloat=false)=>{const p=new Vector3(x,v.position.y,z),floor=q.support(p,120,.45)?.height??q.map.bounds.min[1];const w=q.waterAt(p);return afloat&&w?Math.max(floor,w.surface):floor;};
  const groundHeight=(x:number,z:number)=>sample(x,z);
  const surfaceHeight=(x:number,z:number)=>sample(x,z);
  const supportHeight=(x:number,z:number,_radius:number,afloat=false)=>sample(x,z,afloat);
  const wetHeight=(x:number,z:number)=>{const water=q.waterAt(new Vector3(x,v.position.y,z));return !!water&&v.position.y<water.surface-.1;};
  const footprintWet=(x:number,z:number,radius:number)=>q.waterContains(new Vector3(x,0,z),radius);
  const waterSurface=q.waterAt(v.position)?.surface??v.position.y;
  const s=v.spec,mode=s.mode,old=v.position.clone();
  const road=mode==='wheeled'||mode==='bike';
  v.steering=damp(v.steering,i.steer,Math.abs(i.steer)>0?s.steeringResponse:s.steeringReturn,dt);
  if(v.submersible){stepSubmersible(v,i,dt,q);return;}
  if(s.archetype==='raft'){stepRaft(v,i,dt,q);return;}
  if(s.archetype==='jetski'){stepJetSki(v,i,dt,q);return;}
  if(v.unicycle){stepUnicycle(v,i,dt,q);return;}
  if(s.archetype==='atv'){stepAtv(v,i,dt,q);return;}
  if(mode==='tank'){stepTank(v,i,dt,q);return;}
  if(mode==='kayak'){stepKayak(v,i,dt,q);return;}
  if(mode==='bus'){stepBus(v,i,dt,q);return;}
  if(mode==='sled'||mode==='ski'){stepSled(v,i,dt,q);return;}
  const isAircraft=mode==='glider';
  if(mode==='space') {
    const angular=new Quaternion().setFromEuler(new Euler(i.pitch*s.steer*dt,-v.steering*s.steer*dt,i.roll*s.steer*dt,'YXZ'));
    v.rotation.multiply(angular).normalize();
    forward.set(0,0,1).applyQuaternion(v.rotation);right.set(-1,0,0).applyQuaternion(v.rotation);up.set(0,1,0).applyQuaternion(v.rotation);
    // Stabilize only uncommanded local axes: turning redirects momentum while
    // an actively driven axis can still reach its configured maximum speed.
    const attenuation=1-Math.exp(-s.grip*dt);
    if(Math.abs(i.forward)<.01)v.velocity.addScaledVector(forward,-v.velocity.dot(forward)*attenuation);
    if(Math.abs(i.strafe)<.01)v.velocity.addScaledVector(right,-v.velocity.dot(right)*attenuation);
    if(Math.abs(i.lift)<.01)v.velocity.addScaledVector(up,-v.velocity.dot(up)*attenuation);
    v.velocity.addScaledVector(forward,i.forward*s.accel*dt).addScaledVector(right,i.strafe*s.accel*dt).addScaledVector(up,i.lift*s.accel*dt);
    if(i.boost) v.velocity.multiplyScalar(Math.exp(-s.brakeDamping*dt));
    v.velocity.clampLength(0,s.speed);v.position.addScaledVector(v.velocity,dt);
    v.yaw=Math.atan2(forward.x,forward.z);v.grounded=false;
  } else if(isAircraft) {
    if(mode==='glider'&&!v.launched) {
      if(i.boost) {v.launched=true;v.speed=s.launchSpeed;v.grounded=false;v.position.y=Math.max(v.position.y,groundHeight(v.position.x,v.position.z)+1.25);}
      else {v.speed=0;v.velocity.set(0,0,0);return;}
    }
    const pitchInput=-i.forward;
    const desiredPitch=pitchInput*.62;
    v.pitch=damp(v.pitch,desiredPitch,s.pitchResponse,dt);
    v.roll=damp(v.roll,clamp(v.steering*.6+i.roll*.8,-.9,.9),s.rollResponse,dt);
    const flying=mode==='glider'||v.speed>14||!v.grounded;
    v.yaw-=v.steering*s.steer*dt*(flying?1:.35)+Math.sin(v.roll)*.20*dt;
    const thrust=0;
    const drag=s.drag+v.speed*v.speed*s.dragQuadratic;
    v.speed=clamp(v.speed+(thrust-drag-9.8*Math.sin(v.pitch))*dt,Math.min(s.minimumSpeed,s.speed),s.speed);
    forward.set(Math.sin(v.yaw)*Math.cos(v.pitch),Math.sin(v.pitch),Math.cos(v.yaw)*Math.cos(v.pitch));
    v.velocity.copy(forward).multiplyScalar(v.speed);
    if(flying) {
      const stall=clamp((14-v.speed)/8,0,1);
      v.velocity.y-= mode==='glider'?1.2+stall*8:Math.max(0,1-v.speed/19)*8;
    } else {v.velocity.y=0;v.pitch=0;v.roll*=.5;}
    v.position.addScaledVector(v.velocity,dt);
    v.rotation.setFromEuler(euler.set(-v.pitch,v.yaw,v.roll,'YXZ'));
  } else if(mode==='sub') {
    v.yaw-=v.steering*s.steer*dt;v.roll+=i.roll*dt;
    v.pitch=damp(v.pitch,i.lift*.25,s.pitchResponse,dt);
    forward.set(Math.sin(v.yaw)*Math.cos(v.pitch),Math.sin(v.pitch),Math.cos(v.yaw)*Math.cos(v.pitch));
    v.velocity.addScaledVector(forward,i.forward*s.accel*dt);v.velocity.y+=i.lift*s.verticalAcceleration*dt;
    right.set(Math.cos(v.yaw),0,-Math.sin(v.yaw));
    v.velocity.addScaledVector(right,-v.velocity.dot(right)*(1-Math.exp(-s.grip*dt)));
    v.velocity.x*=Math.exp(-(Math.abs(i.forward)<.01?s.linearDamping:s.drag)*dt);
    v.velocity.z*=Math.exp(-(Math.abs(i.forward)<.01?s.linearDamping:s.drag)*dt);
    v.velocity.y*=Math.exp(-(Math.abs(i.lift)<.01?s.verticalDamping:.35)*dt);
    if(i.boost)v.velocity.multiplyScalar(Math.exp(-s.brakeDamping*dt));
    v.velocity.clampLength(0,s.speed);
    v.position.addScaledVector(v.velocity,dt);
    if(!footprintWet(v.position.x,v.position.z,s.radius)){v.position.x=old.x;v.position.z=old.z;v.velocity.x=0;v.velocity.z=0;}
    const bottom=supportHeight(v.position.x,v.position.z,s.radius)+2;
    v.position.y=clamp(v.position.y,bottom,waterSurface-1.0);
    if((v.position.y<=bottom&&v.velocity.y<0)||(v.position.y>=waterSurface-1&&v.velocity.y>0))v.velocity.y=0;
    v.rotation.setFromEuler(euler.set(-v.pitch,v.yaw,v.roll,'YXZ'));v.grounded=false;
  } else {
    forward.set(Math.sin(v.yaw),0,Math.cos(v.yaw));right.set(Math.cos(v.yaw),0,-Math.sin(v.yaw));
    let speed=v.velocity.dot(forward),side=v.velocity.dot(right);
    const max=i.boost?s.maxSpeed:s.speed,water=wetHeight(v.position.x,v.position.z);
    const driveDisabled=water&&mode!=='boat'&&mode!=='hover';
    const braking=i.forward<0&&speed>1;
    // Slip itself carries the recovery: no second integrator or hidden timer.
    const driftSpeed=clamp((speed-2.5)/3.5,0,1);
    const driftEnabled=road&&s.brakeDrift===true;
    const initiatingDrift=driftEnabled&&(braking||i.brake)&&Math.abs(v.steering)>.12;
    const existingSlip=clamp((Math.abs(side)/Math.max(Math.abs(speed),1)-.2)/.35,0,1);
    const drift=driftEnabled?driftSpeed*(initiatingDrift?1:existingSlip*.85):0;
    const lateralDrift=driftEnabled?driftSpeed*(initiatingDrift?1:existingSlip*.9):0;
    const acceleration=braking?-s.brakeDeceleration*(1-drift*.3):i.forward*s.accel;
    speed+=driveDisabled?0:acceleration*dt;
    if(Math.abs(i.forward)<.01) speed=coastSpeed(speed,s.coastDeceleration,dt);
    if(i.brake) speed*=Math.exp(-s.brakeDamping*(1-drift*.3)*dt);
    speed=clamp(speed,-s.reverseSpeed,max);
    if(driveDisabled) speed*=Math.exp(-2.5*dt);
    const yawRate=road?roadYawRate(speed,s.steer):s.steer*(mode==='boat'?Math.min(Math.abs(speed)/4,1)*Math.sign(speed):1);
    v.yaw-=v.steering*yawRate*dt*(driftEnabled?1+drift*.35:i.brake&&mode==='wheeled'?1.25:1);
    if(mode==='hover') side-=i.roll*s.accel*dt;
    const newF=scratch.set(Math.sin(v.yaw),0,Math.cos(v.yaw));
    if(mode==='wheeled'||mode==='slide'||(mode==='bike'&&drift>0)) {
      // Integrate drive along the old forward axis, then remove lateral slip
      // relative to the new heading. Repeatedly scaling the WHOLE velocity by
      // its forward projection caused low-grip turns to bleed speed every tick.
      v.velocity.x=forward.x*speed+right.x*side;
      v.velocity.z=forward.z*speed+right.z*side;
      const sideAfterTurn=v.velocity.x*Math.cos(v.yaw)-v.velocity.z*Math.sin(v.yaw);
      const removed=sideAfterTurn*(1-Math.exp(-s.grip*(driftEnabled?1-lateralDrift*(i.brake?.98:.96):i.brake&&mode==='wheeled'?.18:1)*dt));
      v.velocity.x-=Math.cos(v.yaw)*removed;v.velocity.z+=Math.sin(v.yaw)*removed;
    } else {
      side*=Math.exp(-s.grip*dt);
      v.velocity.x=newF.x*speed+Math.cos(v.yaw)*side;v.velocity.z=newF.z*speed-Math.sin(v.yaw)*side;
    }
    if(mode==='slide') {const sx=(groundHeight(old.x+.3,old.z)-groundHeight(old.x-.3,old.z))/.6,sz=(groundHeight(old.x,old.z+.3)-groundHeight(old.x,old.z-.3))/.6;if(Math.abs(sx)<2)v.velocity.x-=sx*9.8*dt;if(Math.abs(sz)<2)v.velocity.z-=sz*9.8*dt;}
    v.position.addScaledVector(v.velocity,dt);
    if(mode==='boat') {
      if(!footprintWet(v.position.x,v.position.z,s.radius)) {v.position.copy(old);v.velocity.x=0;v.velocity.z=0;}
      v.position.y=waterSurface+.1+Math.sin(time*1.8+v.position.z*.07)*.12;
      v.pitch=Math.sin(time*1.3)*.025+Math.abs(speed)*.003;v.roll=damp(v.roll,v.steering*speed*VEHICLE_ATTITUDE.boat.rollRadiansPerSteeringSpeed,VEHICLE_ATTITUDE.boat.rollResponsePerSecond,dt);
    } else if(mode==='hover') {
      const floor=supportHeight(v.position.x,v.position.z,s.radius,true),oldFloor=supportHeight(old.x,old.z,s.radius,true),target=floor+1.3;
      // Follow the rate of terrain ascent, then enforce hull clearance independently of the spring.
      const surfaceRate=clamp((floor-oldFloor)/dt,-18,18);
      v.velocity.y+=((target-v.position.y)*28+(surfaceRate-v.velocity.y)*8)*dt;
      if(v.position.y<floor+.55){v.position.y=floor+.55;v.velocity.y=Math.max(v.velocity.y,surfaceRate,0);}
      const ahead=surfaceHeight(v.position.x+newF.x,v.position.z+newF.z),behind=surfaceHeight(v.position.x-newF.x,v.position.z-newF.z);
      const slope=Math.abs(ahead-behind)<1.5?Math.atan2(ahead-behind,2):0;
      v.pitch=damp(v.pitch,slope-i.forward*.04,6,dt);v.roll=damp(v.roll,v.steering*VEHICLE_ATTITUDE.hover.rollRadiansPerSteering,VEHICLE_ATTITUDE.hover.rollResponsePerSecond,dt);v.grounded=false;
    } else {
      const actualFloor=surfaceHeight(v.position.x,v.position.z);
      v.velocity.y-=18*dt;
      if(v.position.y<=actualFloor+.12) {v.position.y=actualFloor;v.velocity.y=0;v.grounded=true;} else v.grounded=false;
      const ahead=surfaceHeight(v.position.x+newF.x*1.2,v.position.z+newF.z*1.2),behind=surfaceHeight(v.position.x-newF.x*1.2,v.position.z-newF.z*1.2);
      const targetPitch=v.grounded&&Math.abs(ahead-behind)<3?Math.atan2(ahead-behind,2.4):0;
      const attitude=mode==='bike'?VEHICLE_ATTITUDE.bike:VEHICLE_ATTITUDE.ground;
      v.pitch=damp(v.pitch,targetPitch,12,dt);
      v.roll=damp(v.roll,clamp(v.steering*speed*attitude.rollRadiansPerSteeringSpeed,-attitude.maximumRollRadians,attitude.maximumRollRadians),attitude.rollResponsePerSecond,dt);
    }
    v.rotation.setFromEuler(euler.set(-v.pitch,v.yaw,v.roll,'YXZ'));v.submerged=driveDisabled;
  }
  if(!isAircraft)v.speed=v.velocity.length();
}
export interface PlayerState { position:Vector3; velocity:Vector3; yaw:number; grounded:boolean; swimming:boolean; coyote:number; jumpBuffer:number; animation:string; landTimer:number }
function stopIntoNormals(velocity:Vector3,normals:Vector3[]){for(const n of normals){const d=velocity.dot(n);if(d<0)velocity.addScaledVector(n,-d);}}
function stepEnvironmentVehicle(v:VehicleState,i:Input,dt:number,time:number,q:EnvironmentQueries){
  const old=v.position.clone(),oldRotation=v.rotation.clone(),oldYaw=v.yaw,oldPitch=v.pitch,oldRoll=v.roll;
  const previousTank=v.tank?{...v,position:old.clone(),rotation:oldRotation.clone(),velocity:v.velocity.clone(),tank:{...v.tank}}:null;
  stepVehicleControls(v,i,dt,time,q);
  const incoming=v.velocity.clone();
  const body=vehicleBody(v.spec),mode=v.spec.mode;
  const ground=!!v.raft||['wheeled','bus','tank','bike','slide','sled','ski'].includes(mode);
  // Low-speed taxiing rests on wheels too; airborne attitude keeps its original
  // oriented hull and lift path, including the transition into takeoff.
  const taxi=mode==='plane'&&v.grounded&&v.speed<=14&&v.velocity.y<=0;
  const supported=ground||taxi;
  const delta=v.position.clone().sub(old),motionOrigin=old.clone();
  // Runners and ATV tyres must follow the slope. Inflating a pitched hull into a level box
  // suspends the sled above snow by half its length times the grade.
  const snowHull=!!v.raft||mode==='sled'||mode==='ski'||v.spec.archetype==='atv';
  const levelHull=supported&&!snowHull;
  let pose=levelHull?groundVehiclePose(body,v.rotation,v.yaw):{body,rotation:v.rotation};
  const previousPose=levelHull?groundVehiclePose(body,oldRotation,oldYaw):{body,rotation:oldRotation};
  // Ground lean changes hull clearance, not steering authority. Lift only to the
  // local support and sweep that lift with the old hull to retain roof clearance.
  const clear=supported&&(!snowHull||q.overlaps(old,pose.body,pose.rotation))?q.safeSpawn(old,pose.body,pose.rotation):null;
  if(q.overlaps(old,pose.body,pose.rotation)||(clear&&clear.y>old.y+1e-6)){
    const raised=clear&&q.move(old,clear.clone().sub(old),previousPose.body,previousPose.rotation);
    if(clear&&raised&&raised.position.distanceToSquared(clear)<1e-6)motionOrigin.copy(clear);
    else{
      v.rotation.copy(oldRotation);v.yaw=oldYaw;v.pitch=oldPitch;v.roll=oldRoll;
      pose=previousPose;
    }
  }
  if(supported&&delta.y>=0&&(!v.raft||v.grounded))delta.y-=.02;
  // Sweep driving separately from resting gravity. A diagonal grazing cast can
  // otherwise report spurious lateral normals from a large flat floor.
  const push={massKg:vehicleImpactMass(v.spec),dt};
  const horizontal=supported?q.move(motionOrigin,new Vector3(delta.x,0,delta.z),pose.body,pose.rotation,v.raft?0:(mode==='sled'||mode==='ski')?.08:ground?.45:0,push):null;
  const vertical=q.move(horizontal?.position??motionOrigin,horizontal?new Vector3(0,delta.y,0):delta,pose.body,pose.rotation,0,push);
  const hit=horizontal?{...vertical,grounded:horizontal.grounded||vertical.grounded,blocked:horizontal.blocked||vertical.blocked,normals:[...horizontal.normals,...vertical.normals]}:vertical;
  if(snowHull&&hit.normals.some(normal=>normal.y>=.5))hit.grounded=true;
  if(v.raft)hit.grounded=hit.normals.some(normal=>normal.y>=.5)&&delta.y<=0;
  // Large floor colliders can leave a sub-centimetre overlap after Rapier's
  // resting cast. Recover only through a checked upward sweep, never through a
  // wall or ceiling; retain the last clear pose if recovery cannot fit.
  if(supported&&(q.overlaps(hit.position,pose.body,pose.rotation)||q.overlaps(hit.position,body,v.rotation))){
    const clearEnd=q.safeSpawn(hit.position,pose.body,pose.rotation);
    const recovery=clearEnd&&q.move(hit.position,clearEnd.clone().sub(hit.position),pose.body,pose.rotation);
    if(clearEnd&&recovery&&recovery.position.distanceToSquared(clearEnd)<1e-6&&!q.overlaps(clearEnd,body,v.rotation))hit.position.copy(clearEnd);
    else{hit.position.copy(motionOrigin);v.velocity.set(0,0,0);hit.blocked=true;}
  }
  v.position.copy(hit.position);
  // The controller climbs slopes up to 60 degrees; projecting drive onto their
  // normals every tick would erase speed while holding the vehicle on the ramp.
  stopIntoNormals(v.velocity,horizontal?horizontal.normals.filter(n=>n.y<.5):hit.normals);
  if(horizontal){if(hit.grounded)v.velocity.y=0;if(vertical.normals.some(n=>n.y<-.25))v.velocity.y=Math.min(0,v.velocity.y);}
  if(ground||mode==='kayak'||v.jetski||v.submersible)v.grounded=hit.grounded;
  if(mode==='plane'||mode==='glider'){
    // The asset origin may be metres above its wheels. Use the swept hull contact,
    // including a short resting probe, and keep airborne lift free to leave ground.
    v.grounded=hit.grounded||(v.velocity.y<=0&&q.move(v.position,new Vector3(0,-.035,0),body,v.rotation).grounded);
    if(v.grounded&&mode==='glider'){
      v.speed*=Math.exp(-2*dt);v.velocity.multiplyScalar(Math.exp(-2*dt));
      if(v.speed<8){v.launched=false;v.speed=0;v.velocity.set(0,0,0);}
    }
  }
  if(v.raft)finishRaftContact(v,incoming,hit.normals);
  if(previousTank)finishTankStep(v,previousTank,q);
  if(v.submersible)finishSubmersibleStep(v,dt,time);
  if(v.jetski)finishJetSkiStep(v,old,dt,time);
  if(v.atv)finishAtvStep(v,old,oldYaw,q);
  if(v.unicycle)finishUnicycleStep(v,old,i,dt,q);
  if(hit.blocked)v.speed=Math.min(v.speed,v.velocity.length());
  if(!v.submersible&&!v.jetski&&(mode==='boat'||mode==='sub')&&!q.waterContains(v.position,v.spec.radius)){v.position.copy(old);v.velocity.set(0,0,0);v.speed=0;}
}
export class Simulation {
  environment:EnvironmentQueries;
  humanoid!:HumanoidController;
  private humanoidClips:ReadonlySet<string>=new Set();
  private humanoidMotions:readonly MotionSource[]=[];
  characterControl=defaultMovementSettings('character',DEFAULT_CHARACTER_CONTROL_BASE);
  private prepared=new Map<string,MapSpawn>();
  failureCode:MountFailureCode|undefined;
  vehicles:VehicleState[]=[];active=-1;time=0;transition=0;transitionKind:''|'enter'|'exit'='';message='';teleportRevision=0;
  player:PlayerState={position:new Vector3(),velocity:new Vector3(),yaw:0,grounded:true,swimming:false,coyote:.1,jumpBuffer:0,animation:'Idle_Loop',landTimer:0};
  constructor(environment:EnvironmentQueries,specs:readonly VehicleSpec[]=[]){this.environment=environment;this.vehicles=specs.map(createVehicle);this.setEnvironment(environment);}
  dispose(){this.humanoid.dispose();for(const v of this.vehicles)this.environment.releaseVehicleRig(v.spec.id);}
  setHumanoidAssets(clips:ReadonlySet<string>,motions:readonly MotionSource[]){this.humanoidClips=clips;this.humanoidMotions=motions;this.humanoid?.setAvailableClips(clips,motions);}
  prepareEnvironment(q:EnvironmentQueries,specs:readonly VehicleSpec[]=this.vehicles.map(v=>v.spec)):Simulation{
    const staged=new Simulation(q,specs.map(spec=>structuredClone(spec)));
    staged.characterControl={...this.characterControl};staged.setHumanoidAssets(this.humanoidClips,this.humanoidMotions);return staged;
  }
  adoptEnvironment(staged:Simulation):void{this.dispose();Object.assign(this,staged);}
  private syncActorBodies(){this.environment.retainVehicleRigs(new Set(this.vehicles.filter(v=>(v.wheelPhysics||v.bodyPhysics||v.aircraft)&&this.available(v)).map(v=>v.spec.id)));this.environment.syncActorBodies(this.vehicles.filter(v=>this.available(v)).flatMap(v=>creatureBodies(v).map((part,n)=>({id:`${v.spec.id}:${n}`,actorId:v.spec.id,physical:!!(v.wheelPhysics||v.bodyPhysics||v.aircraft),...part}))));}
  private syncHumanoidPlayer(){
    const h=this.humanoid,p=this.player;
    p.position.copy(h.position);p.velocity.copy(h.velocity);p.velocity.y=h.vertical;p.yaw=Math.atan2(h.facing.x,h.facing.z);
    p.grounded=h.grounded;p.swimming=h.swimming;p.coyote=h.coyote;p.jumpBuffer=h.jumpBuffer;
    p.animation=h.state;p.landTimer=h.animationEvent?.kind==='land'?Math.max(0,.45-h.animationEvent.elapsed):0;
  }
  private canRelocate(){if(this.active<0&&!this.humanoid.canBoard){this.message=this.humanoid.boardingReason;return false;}return true;}
  /** Explicit reset for authored test starts; ordinary vehicle visits retain world targets. */
  prepareCharacter(position:Vector3,yaw:number){
    const safe=this.environment.safeSpawn(position,HUMANOID_BODY);if(!safe){this.message='人物测试点没有站立净空';return false;}
    this.active=-1;this.transition=0;this.transitionKind='';this.humanoid.resetAt(safe,yaw);this.syncHumanoidPlayer();this.teleportRevision++;return true;
  }
  available(v:VehicleState){return this.environment.map.regions.some(r=>r.modes.includes(v.spec.mode));}
  setEnvironment(q:EnvironmentQueries){
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
    if(this.vehicles.some(o=>o!==v&&this.available(o)&&actorsTouch(candidate,o))){this.message='准备点被其他载具占用';return false;}
    const boarding=this.boardingPoint(candidate);
    if(!boarding){this.message='准备点旁没有安全交互位置';return false;}
    q.releaseVehicleRig(v.spec.id);Object.assign(v,candidate);this.prepared.set(v.spec.id,spawn);
    this.active=-1;this.transition=0;this.transitionKind='';this.teleportRevision++;
    this.player.position.copy(boarding);this.player.velocity.set(0,0,0);Object.assign(this.player,{yaw:v.yaw,grounded:false,swimming:!!q.waterAt(boarding),coyote:0,jumpBuffer:0,landTimer:0,animation:'Idle_Loop'});
    this.humanoid.setMounted(false,boarding,v.yaw);this.syncActorBodies();
    this.message=`${v.spec.name}已就位 · 按 F 驾驶`;return true;
  }
  get vehicle(){return this.vehicles[this.active];}
  nearest():number {let best=-1,d=Infinity;this.vehicles.forEach((v,n)=>{const ds=v.position.distanceTo(this.player.position),body=vehicleBody(v.spec),range=body.kind==='box'?Math.max(5.3,body.halfExtents[0]+2):Math.max(5.3,v.creature?v.spec.radius+1.6:0);if(this.available(v)&&ds<range&&ds<d&&v.velocity.length()<3){d=ds;best=n;}});return best;}
  private boardingPoint(v:VehicleState):Vector3|null {
    const q=this.environment;const body=vehicleBody(v.spec);
    const rx=body.kind==='box'?body.halfExtents[0]+(v.submersible?1.35:.9):v.spec.radius+1.2,rz=body.kind==='box'?body.halfExtents[2]+(v.submersible?1.35:.9):v.spec.radius+1.2;
    const offsets=[[rx,0],[-rx,0],[0,-rz],[0,rz]];
    // Prefer a dry pontoon when boarding a kayak; retain swimming exits offshore.
    for(const dryOnly of (v.spec.mode==='kayak'||v.submersible?[true,false]:[false]))for(const [x=0,z=0] of offsets){
      const p=new Vector3(x,0,z).applyAxisAngle(new Vector3(0,1,0),v.yaw).add(v.position);
      const floor=q.support(p,4,.45),water=q.waterAt(p);
      if(dryOnly){if(!floor||(water&&floor.height<water.surface)||Math.abs(floor.height-v.position.y)>1)continue;p.y=floor.height+.025;}
      else if(water&&v.position.y<water.surface+2)p.y=water.surface-1.25;
      else if(floor&&Math.abs(floor.height-v.position.y)<4)p.y=floor.height+.025;
      else continue;
      const selectedDistance=v.position.distanceTo(p);
      if(v.creature?.leadPosition&&v.creature.leadPosition.distanceTo(p)<2.3)continue;
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
      if(v.submersible&&(this.environment.waterAt(v.position)?.surface??-Infinity)-v.position.y>.4){this.message='请先上浮至水面，再打开舱门离开潜艇';return false;}
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
    if(targetId){const decision=this.boardingDecision(targetId);
      if(!decision.ok){this.failureCode=decision.code;this.message=decision.message;return false;}
    }
    const entering=this.vehicles[n]!;
    if(entering.submersible&&(this.environment.waterAt(entering.position)?.surface??-Infinity)-entering.position.y>.4){this.message='潜艇尚在水下，请先准备到水面再登艇';return false;}
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
    if(this.active<0){this.humanoid.reset();this.syncHumanoidPlayer();this.transition=0;this.transitionKind='';this.teleportRevision++;this.message='人物与交互物已复位';}
    else this.visit(this.active);
  }
    recoverVehicle():boolean {
      const v=this.vehicle,q=this.environment;
      if(!v||!['wheeled','bike','slide'].includes(v.spec.mode)){this.message='请先进入地面车辆，再使用原地扶正';return false;}
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
      if(v.aircraft)v.aircraft=createAircraftState();
      if(v.spec.wheelPhysics)v.wheelPhysics=createWheelPhysics(v.spec.wheelPhysics);
      if(v.spec.bodyPhysics)v.bodyPhysics=createBodyPhysics(v.spec.bodyPhysics);
      this.player.position.copy(v.position);this.player.velocity.set(0,0,0);this.player.yaw=yaw;
      this.transition=0;this.transitionKind='';this.teleportRevision++;this.syncActorBodies();this.message=relocated?'车辆已移至附近安全地面并扶正 · 可以继续驾驶':'车辆已原地扶正 · 可以继续驾驶';return true;
    }
    step(i:Input,dt:number,cameraYaw=0) {
    this.humanoid.skills.syncSeats((id,point)=>this.environment.propAnchor(id,point));
    this.syncActorBodies();
    this.stepActors(i,dt,cameraYaw);
    this.syncActorBodies();this.environment.stepPhysics(dt);this.syncActorBodies();if(this.vehicle&&(this.vehicle.wheelPhysics||this.vehicle.bodyPhysics||this.vehicle.aircraft)){this.player.position.copy(this.vehicle.position);this.player.yaw=this.vehicle.yaw;}this.humanoid.skills.syncDropped();this.humanoid.skills.syncSeats((id,point)=>this.environment.propAnchor(id,point));
  }
  private stepActors(i:Input,dt:number,cameraYaw=0) {
    this.time+=dt;this.transition=Math.max(0,this.transition-dt);
    const vehicleBefore=this.vehicle?.position.clone();
    const before=this.vehicle?{unicycle:copyUnicycleState(this.vehicle.unicycle),submersible:copySubmersibleState(this.vehicle.submersible),jetski:copyJetSkiState(this.vehicle.jetski),atv:copyAtvState(this.vehicle.atv),rotation:this.vehicle.rotation.clone(),yaw:this.vehicle.yaw,pitch:this.vehicle.pitch,roll:this.vehicle.roll,creature:this.vehicle.creature?{...this.vehicle.creature,leadPosition:this.vehicle.creature.leadPosition?.clone()}:undefined}:undefined;
    for (const v of this.vehicles) {
      // 只有驾驶中的载具接收输入；四轮车停车后仍计算重力、悬架和驻车制动。
      if (v === this.vehicle && this.transition === 0)
        stepVehicle(v, i, dt, this.time, this.environment);
      else if ((v.wheelPhysics||v.bodyPhysics||v.aircraft)&&this.available(v))
        stepVehicle(v,{...emptyInput(),brake:true},dt,this.time,this.environment);
      else if (
        (v !== this.vehicle || v.spec.mode === 'kayak' || !!v.jetski || !!v.submersible) &&
        (!!v.submersible || !!v.jetski || v.spec.mode === "kayak" || v.spec.mode === "mount" || v.spec.mode === "sled" || v.spec.mode === "ski") &&
        this.available(v) &&
        (!!v.submersible || !!v.jetski || v.velocity.lengthSq() > 1e-8 ||
          !v.grounded ||
          (this.environment &&
            !this.environment.standingSupport(
              v.position,
              0.08,
              Math.PI / 2 - 0.01,
            )))
      ) {
        const previous = {
          ...(v.submersible?{submersible:copySubmersibleState(v.submersible)}:{}),
          ...(v.jetski?{jetski:copyJetSkiState(v.jetski)}:{}),
          position: v.position.clone(),
          rotation: v.rotation.clone(),
          yaw: v.yaw,
          pitch: v.pitch,
          roll: v.roll,
          creature: v.creature
            ? { ...v.creature, leadPosition: v.creature.leadPosition?.clone() }
            : undefined,
        };
        stepVehicle(v, emptyInput(), dt, this.time, this.environment);
        if (
          this.vehicles.some(
            (o) => o !== v && this.available(o) && actorsTouch(v, o),
          )
        ) {
          Object.assign(v, previous);
          if(v.jetski)finishJetSkiStep(v,previous.position,dt,this.time);
          v.velocity.set(0, 0, 0);
          v.speed = 0;
        }
      }
    }
    if(this.vehicle&&!this.vehicle.wheelPhysics&&!this.vehicle.bodyPhysics&&!this.vehicle.aircraft&&vehicleBefore){if(this.vehicles.some(o=>o!==this.vehicle&&this.available(o)&&actorsTouch(this.vehicle!,o))){this.vehicle.position.copy(vehicleBefore);this.vehicle.rotation.copy(before!.rotation);this.vehicle.yaw=before!.yaw;this.vehicle.pitch=before!.pitch;this.vehicle.roll=before!.roll;this.vehicle.creature=before!.creature;if(this.vehicle.atv&&before!.atv){this.vehicle.atv.wheelAngles=[...before!.atv.wheelAngles];this.vehicle.atv.suspension=[...before!.atv.suspension];}if(this.vehicle.submersible&&before!.submersible)this.vehicle.submersible=before!.submersible;if(this.vehicle.jetski&&before!.jetski){this.vehicle.jetski=before!.jetski;finishJetSkiStep(this.vehicle,vehicleBefore,dt,this.time);}this.vehicle.velocity.set(0,0,0);this.vehicle.speed=0;if(this.vehicle.unicycle&&before!.unicycle){this.vehicle.unicycle=before!.unicycle;finishUnicycleStep(this.vehicle,vehicleBefore,i,dt,this.environment);}}}
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
    const h=this.humanoid;
    // On walls, source controls follow the registered wall tangent regardless of orbit.
    const surface=h.surface.surface;
    const direction=surface?new Vector3(i.steer,0,-i.forward).applyAxisAngle(new Vector3(0,1,0),Math.atan2(surface.normal[0],surface.normal[2])):new Vector3(-i.steer,0,i.forward).applyAxisAngle(new Vector3(0,1,0),cameraYaw);
    if(direction.lengthSq()>1)direction.normalize();
    if(i.actions?.toggleSwimStyle&&h.swimming)h.swimStyle=h.swimStyle==='freestyle'?'breaststroke':'freestyle';
    if(i.actions?.cancel&&h.skills.active)h.skills.cancel(h.skills.active.requestId);
    const previousSerial=h.motionSerial;h.step(direction,i.boost,i.slow,i.jump,i.actions);this.syncHumanoidPlayer();
    if(h.motionSerial!==previousSerial&&!h.traversal&&!h.completedMotion)this.teleportRevision++;
  }
}
