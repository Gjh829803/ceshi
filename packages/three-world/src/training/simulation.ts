import { Euler, Quaternion, Vector3 } from 'three';
import { HumanoidController } from './humanoid/controller';
import type { MotionSource } from './humanoid/motion';
import { resetCreatureState, stepCreature, canPlaceCreature, creatureBodies } from './creatures/controller';
import type { CreatureState } from './creatures/types';
import { coastSpeed, roadYawRate } from './handling';
import {CONTROL_RANGES,defaultTrainingControl,parseTrainingControl,type TrainingControl} from './control-tuning';
import { EnvironmentQueries, PLAYER_BODY, vehicleBody } from './environment/queries';
import { groundVehiclePose } from './environment/vehicle-pose';
import type { MapSpawn } from './environment/types';
import { DEPTH, SPECS, START, WATER, WORLD_LIMIT, type VehicleSpec } from './config';
import { groundHeight, surfaceHeight, supportHeight, footprintWet, sweepTerrainXZ, recoverTerrainOverlap, validExit, wetHeight } from './terrain';
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const damp=(a:number,b:number,k:number,dt:number)=>a+(b-a)*(1-Math.exp(-k*dt));
export const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export interface HumanoidInput {toggleCrouch?:boolean;roll?:boolean;slide?:boolean;interact?:boolean;putDown?:boolean;prone?:boolean;climb?:boolean;toggleSwimStyle?:boolean;cancel?:boolean}
export interface Input { forward:number; steer:number; lift:number; roll:number; pitch:number; strafe:number; boost:boolean; brake:boolean; jump:boolean; slow:boolean;humanoid?:HumanoidInput }
export const emptyInput=():Input=>({forward:0,steer:0,lift:0,roll:0,pitch:0,strafe:0,boost:false,brake:false,jump:false,slow:false});
export interface VehicleState { spec:VehicleSpec & TrainingControl; position:Vector3; velocity:Vector3; rotation:Quaternion; yaw:number; pitch:number; roll:number; steering:number; throttle:number; grounded:boolean; launched:boolean; speed:number; submerged:boolean; creature?:CreatureState|undefined }
export function resolveVehicleSpec(spec:VehicleSpec):VehicleSpec & TrainingControl {
  const authored=Object.fromEntries(Object.keys(CONTROL_RANGES).filter(key=>Object.hasOwn(spec,key)).map(key=>[key,spec[key as keyof TrainingControl]]));
  const control=parseTrainingControl(authored,defaultTrainingControl(spec.mode,spec));
  return {...structuredClone(spec),...control};
}
export function createVehicle(spec:VehicleSpec):VehicleState {
  const state:VehicleState={spec:resolveVehicleSpec(spec),position:new Vector3(...spec.spawn),velocity:new Vector3(),rotation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),spec.yaw),yaw:spec.yaw,pitch:0,roll:0,steering:0,throttle:0,grounded:true,launched:false,speed:0,submerged:false};
  resetCreatureState(state);return state;
}
function actorFootprints(v:VehicleState){return creatureBodies(v).map((part,index)=>{
  const center=new Vector3(...part.body.offset).applyQuaternion(part.rotation).add(part.position);
  let halfHeight=part.body.kind==='capsule'?part.body.height/2:0;
  if(part.body.kind==='box')for(let axis=0;axis<3;axis++)halfHeight+=Math.abs(new Vector3().setComponent(axis,part.body.halfExtents[axis]!).applyQuaternion(part.rotation).y);
  return {position:part.position,radius:index===0?v.spec.radius:1.9,minY:center.y-halfHeight,maxY:center.y+halfHeight};
});}
function actorsTouch(a:VehicleState,b:VehicleState){return actorFootprints(a).some(p=>actorFootprints(b).some(o=>o.maxY>p.minY+.01&&p.maxY>o.minY+.01&&Math.hypot(o.position.x-p.position.x,o.position.z-p.position.z)<o.radius+p.radius));}
function actorBlocksPlayer(v:VehicleState,p:Vector3,margin:number){return actorFootprints(v).some(part=>p.y+1.75>part.minY&&p.y<part.maxY&&Math.hypot(part.position.x-p.x,part.position.z-p.z)<part.radius+margin);}
const legacyGround=groundHeight,legacySurface=surfaceHeight,legacySupport=supportHeight,legacyWet=wetHeight,legacyFootprint=footprintWet,legacyWater=WATER;
const forward=new Vector3(),right=new Vector3(),up=new Vector3(),scratch=new Vector3();
const euler=new Euler(0,0,0,'YXZ');
function terrainMove(v:VehicleState,old:Vector3,step=.45,afloat=false,bottom=0){
  const contact=sweepTerrainXZ(old,v.position,v.spec.radius,step,afloat,bottom);
  v.position.x=contact.x;v.position.z=contact.z;
  if(contact.hitX)v.velocity.x=0;if(contact.hitZ)v.velocity.z=0;
  return contact.hitX||contact.hitZ;
}
const legacyTerrainMove=terrainMove;
function separateVehicleContacts(v:VehicleState,others:VehicleState[],previous:Vector3){
  for(let pass=0;pass<3;pass++)for(const other of others){
    if(other===v||Math.abs(other.position.y-v.position.y)>2)continue;
    const dx=v.position.x-other.position.x,dz=v.position.z-other.position.z,min=v.spec.radius+other.spec.radius,d=Math.hypot(dx,dz);
    if(d>=min-1e-6)continue;
    const origin=v.position.clone(),afloat=v.spec.mode==='hover',limit=Math.max(supportHeight(origin.x,origin.z,v.spec.radius,afloat),origin.y+.45);
    const fallbackX=previous.x-other.position.x,fallbackZ=previous.z-other.position.z;
    const angle=d>1e-6?Math.atan2(dz,dx):Math.hypot(fallbackX,fallbackZ)>1e-6?Math.atan2(fallbackZ,fallbackX):v.yaw;
    let best:Vector3|undefined,score=Infinity;
    for(let n=0;n<16;n++){
      const a=angle+n*Math.PI/8,candidate=new Vector3(other.position.x+Math.cos(a)*(min+1e-5),origin.y,other.position.z+Math.sin(a)*(min+1e-5));
      if(supportHeight(candidate.x,candidate.z,v.spec.radius,afloat)>limit+.001)continue;
      const sweep=sweepTerrainXZ(origin,candidate,v.spec.radius,.3,afloat);
      if(Math.hypot(sweep.x-candidate.x,sweep.z-candidate.z)>.001)continue;
      if(others.some(o=>o!==v&&Math.abs(o.position.y-candidate.y)<=2&&Math.hypot(o.position.x-candidate.x,o.position.z-candidate.z)<o.spec.radius+v.spec.radius-1e-6))continue;
      const distance=candidate.distanceToSquared(origin);if(distance<score){score=distance;best=candidate;}
    }
    if(best){v.position.copy(best);const nx=(best.x-other.position.x)/(min+1e-5),nz=(best.z-other.position.z)/(min+1e-5),inward=v.velocity.x*nx+v.velocity.z*nz;if(inward<0){v.velocity.x-=inward*nx;v.velocity.z-=inward*nz;}}
    else{v.position.copy(previous);v.velocity.x=0;v.velocity.z=0;}
    v.speed=Math.min(v.speed,v.velocity.length());
  }
}
export function stepVehicle(v:VehicleState,i:Input,dt:number,time=0,environment?:EnvironmentQueries) {
  if(v.creature){stepCreature(v,i,dt,time,environment);return;}
  if(environment){stepEnvironmentVehicle(v,i,dt,time,environment);return;}
  stepVehicleControls(v,i,dt,time);
}
function stepVehicleControls(v:VehicleState,i:Input,dt:number,time=0,q?:EnvironmentQueries) {
  // Production samples only this map; legacy terrain remains for standalone compatibility.
  const sample=(x:number,z:number,afloat=false)=>{const p=new Vector3(x,v.position.y,z),floor=q!.support(p,120,.45)?.height??q!.map.bounds.min[1];const w=q!.waterAt(p);return afloat&&w?Math.max(floor,w.surface):floor;};
  const groundHeight=q?(x:number,z:number)=>sample(x,z):legacyGround;
  const surfaceHeight=q?(x:number,z:number)=>sample(x,z):legacySurface;
  const supportHeight=q?(x:number,z:number,_radius:number,afloat=false)=>sample(x,z,afloat):legacySupport;
  const wetHeight=q?(x:number,z:number)=>{const water=q.waterAt(new Vector3(x,v.position.y,z));return !!water&&v.position.y<water.surface-.1;}:legacyWet;
  const footprintWet=q?(x:number,z:number,radius:number)=>q.waterContains(new Vector3(x,0,z),radius):legacyFootprint;
  const terrainMove=q?(_v:VehicleState,_old:Vector3,_step=0,_afloat=false,_bottom=0)=>false:legacyTerrainMove;
  const WATER=q?(q.waterAt(v.position)?.surface??v.position.y):legacyWater;
  const s=v.spec,mode=s.mode,old=v.position.clone();
  const road=mode==='wheeled'||mode==='bike';
  v.steering=damp(v.steering,i.steer,Math.abs(i.steer)>0?s.steeringResponse:s.steeringReturn,dt);
  const isAircraft=mode==='plane'||mode==='glider';
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
    if(mode==='plane') v.throttle=clamp(v.throttle+(Number(i.boost)-Number(i.slow))*s.throttleResponse*dt,0,1);
    const pitchInput=-i.forward;
    const desiredPitch=pitchInput*.62;
    v.pitch=damp(v.pitch,desiredPitch,s.pitchResponse,dt);
    v.roll=damp(v.roll,clamp(v.steering*.6+i.roll*.8,-.9,.9),s.rollResponse,dt);
    const flying=mode==='glider'||v.speed>14||!v.grounded;
    v.yaw-=v.steering*s.steer*dt*(flying?1:.35)+Math.sin(v.roll)*.20*dt;
    const thrust=mode==='plane'?v.throttle*s.accel:0;
    const drag=s.drag+v.speed*v.speed*s.dragQuadratic;
    v.speed=clamp(v.speed+(thrust-drag-9.8*Math.sin(v.pitch))*dt,Math.min(s.minimumSpeed,s.speed),s.speed);
    forward.set(Math.sin(v.yaw)*Math.cos(v.pitch),Math.sin(v.pitch),Math.cos(v.yaw)*Math.cos(v.pitch));
    v.velocity.copy(forward).multiplyScalar(v.speed);
    if(flying) {
      const stall=clamp((14-v.speed)/8,0,1);
      v.velocity.y-= mode==='glider'?1.2+stall*8:Math.max(0,1-v.speed/19)*8;
    } else {v.velocity.y=0;v.pitch=0;v.roll*=.5;}
    v.position.addScaledVector(v.velocity,dt);
    if(terrainMove(v,old,.3,true))v.speed*=.2;
    const floor=supportHeight(v.position.x,v.position.z,s.radius,true);
    if(!q){v.grounded=v.position.y<=floor+.02;
    if(v.grounded) {v.position.y=floor;v.velocity.y=Math.max(0,v.velocity.y);v.pitch=Math.max(0,v.pitch);if(mode==='glider'){v.speed*=Math.exp(-2*dt);if(v.speed<8){v.launched=false;v.speed=0;v.velocity.set(0,0,0);}}}}
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
    terrainMove(v,old,0);
    if(!q){v.position.x=clamp(v.position.x,174+s.radius,475-s.radius);v.position.z=clamp(v.position.z,-241+s.radius,241-s.radius);}
    if(!footprintWet(v.position.x,v.position.z,s.radius)){v.position.x=old.x;v.position.z=old.z;v.velocity.x=0;v.velocity.z=0;}
    if(!q&&((v.position.x<=174+s.radius&&v.velocity.x<0)||(v.position.x>=475-s.radius&&v.velocity.x>0)))v.velocity.x=0;
    if(!q&&((v.position.z<=-241+s.radius&&v.velocity.z<0)||(v.position.z>=241-s.radius&&v.velocity.z>0)))v.velocity.z=0;
    const bottom=supportHeight(v.position.x,v.position.z,s.radius)+2;
    v.position.y=clamp(v.position.y,bottom,WATER-1.0);
    if((v.position.y<=bottom&&v.velocity.y<0)||(v.position.y>=WATER-1&&v.velocity.y>0))v.velocity.y=0;
    v.rotation.setFromEuler(euler.set(-v.pitch,v.yaw,v.roll,'YXZ'));v.grounded=false;
  } else {
    forward.set(Math.sin(v.yaw),0,Math.cos(v.yaw));right.set(Math.cos(v.yaw),0,-Math.sin(v.yaw));
    let speed=v.velocity.dot(forward),side=v.velocity.dot(right);
    const max=i.boost?s.maxSpeed:s.speed,water=wetHeight(v.position.x,v.position.z);
    const driveDisabled=water&&mode!=='boat'&&mode!=='hover';
    const braking=i.forward<0&&speed>1;
    const acceleration=braking?-s.brakeDeceleration:i.forward*s.accel;
    speed+=driveDisabled?0:acceleration*dt;
    if(Math.abs(i.forward)<.01) speed=coastSpeed(speed,s.coastDeceleration,dt);
    if(i.brake) speed*=Math.exp(-s.brakeDamping*dt);
    speed=clamp(speed,-s.reverseSpeed,max);
    if(driveDisabled) speed*=Math.exp(-2.5*dt);
    const yawRate=road?roadYawRate(speed,s.steer):s.steer*(mode==='boat'?Math.min(Math.abs(speed)/4,1)*Math.sign(speed):1);
    v.yaw-=v.steering*yawRate*dt*(i.brake&&mode==='wheeled'?1.25:1);
    if(mode==='hover') side-=i.roll*s.accel*dt;
    const newF=scratch.set(Math.sin(v.yaw),0,Math.cos(v.yaw));
    if(mode==='wheeled'||mode==='slide') {
      // Integrate drive along the old forward axis, then remove lateral slip
      // relative to the new heading. Repeatedly scaling the WHOLE velocity by
      // its forward projection caused low-grip turns to bleed speed every tick.
      v.velocity.x=forward.x*speed+right.x*side;
      v.velocity.z=forward.z*speed+right.z*side;
      const sideAfterTurn=v.velocity.x*Math.cos(v.yaw)-v.velocity.z*Math.sin(v.yaw);
      const removed=sideAfterTurn*(1-Math.exp(-s.grip*(i.brake&&mode==='wheeled'?.18:1)*dt));
      v.velocity.x-=Math.cos(v.yaw)*removed;v.velocity.z+=Math.sin(v.yaw)*removed;
    } else {
      side*=Math.exp(-s.grip*dt);
      v.velocity.x=newF.x*speed+Math.cos(v.yaw)*side;v.velocity.z=newF.z*speed-Math.sin(v.yaw)*side;
    }
    if(mode==='slide') {const sx=(groundHeight(old.x+.3,old.z)-groundHeight(old.x-.3,old.z))/.6,sz=(groundHeight(old.x,old.z+.3)-groundHeight(old.x,old.z-.3))/.6;if(Math.abs(sx)<2)v.velocity.x-=sx*9.8*dt;if(Math.abs(sz)<2)v.velocity.z-=sz*9.8*dt;}
    v.position.addScaledVector(v.velocity,dt);
    terrainMove(v,old,mode==='hover'?2.05:mode==='boat'?0:.45,mode==='hover',mode==='hover'?-.4:0);
    if(mode==='boat') {
      if(!footprintWet(v.position.x,v.position.z,s.radius)||(!q&&(v.position.x<174+s.radius||Math.abs(v.position.z)>241-s.radius))) {v.position.copy(old);v.velocity.x=0;v.velocity.z=0;}
      v.position.y=WATER+.1+Math.sin(time*1.8+v.position.z*.07)*.12;
      v.pitch=Math.sin(time*1.3)*.025+Math.abs(speed)*.003;v.roll=damp(v.roll,v.steering*speed*.008,3,dt);
    } else if(mode==='hover') {
      const floor=supportHeight(v.position.x,v.position.z,s.radius,true),oldFloor=supportHeight(old.x,old.z,s.radius,true),target=floor+1.3;
      // Follow the rate of terrain ascent, then enforce hull clearance independently of the spring.
      const surfaceRate=clamp((floor-oldFloor)/dt,-18,18);
      v.velocity.y+=((target-v.position.y)*28+(surfaceRate-v.velocity.y)*8)*dt;
      if(v.position.y<floor+.55){v.position.y=floor+.55;v.velocity.y=Math.max(v.velocity.y,surfaceRate,0);}
      const ahead=surfaceHeight(v.position.x+newF.x,v.position.z+newF.z),behind=surfaceHeight(v.position.x-newF.x,v.position.z-newF.z);
      const slope=Math.abs(ahead-behind)<1.5?Math.atan2(ahead-behind,2):0;
      v.pitch=damp(v.pitch,slope-i.forward*.04,6,dt);v.roll=damp(v.roll,v.steering*.12,4,dt);v.grounded=false;
    } else {
      const actualFloor=surfaceHeight(v.position.x,v.position.z);
      v.velocity.y-=18*dt;
      if(v.position.y<=actualFloor+.12) {v.position.y=actualFloor;v.velocity.y=0;v.grounded=true;} else v.grounded=false;
      const ahead=surfaceHeight(v.position.x+newF.x*1.2,v.position.z+newF.z*1.2),behind=surfaceHeight(v.position.x-newF.x*1.2,v.position.z-newF.z*1.2);
      const targetPitch=v.grounded&&Math.abs(ahead-behind)<3?Math.atan2(ahead-behind,2.4):0;
      v.pitch=damp(v.pitch,targetPitch,12,dt);v.roll=damp(v.roll,mode==='bike'?clamp(v.steering*speed*.02,-.5,.5):clamp(-v.steering*speed*.003,-.12,.12),7,dt);
    }
    v.rotation.setFromEuler(euler.set(-v.pitch,v.yaw,v.roll,'YXZ'));v.submerged=driveDisabled;
  }
  if(mode==='space'&&!q) {
    terrainMove(v,old,.3,false,-.8);
    const floor=supportHeight(v.position.x,v.position.z,s.radius)+.8;
    if(v.position.y<floor) {v.position.y=floor;v.velocity.y=Math.max(0,v.velocity.y);}
  }
  if(!q){v.position.x=clamp(v.position.x,-WORLD_LIMIT,WORLD_LIMIT);v.position.z=clamp(v.position.z,-WORLD_LIMIT,WORLD_LIMIT);v.position.y=clamp(v.position.y,DEPTH,230);
  if(Math.abs(v.position.x)>=WORLD_LIMIT)v.velocity.x=0;if(Math.abs(v.position.z)>=WORLD_LIMIT)v.velocity.z=0;if(v.position.y>=230)v.velocity.y=Math.min(0,v.velocity.y);
  }
  if(!isAircraft)v.speed=v.velocity.length();
}
export interface PlayerState { position:Vector3; velocity:Vector3; yaw:number; grounded:boolean; swimming:boolean; coyote:number; jumpBuffer:number; animation:string; landTimer:number }
function stopIntoNormals(velocity:Vector3,normals:Vector3[]){for(const n of normals){const d=velocity.dot(n);if(d<0)velocity.addScaledVector(n,-d);}}
function stepEnvironmentVehicle(v:VehicleState,i:Input,dt:number,time:number,q:EnvironmentQueries){
  const old=v.position.clone(),oldRotation=v.rotation.clone(),oldYaw=v.yaw,oldPitch=v.pitch,oldRoll=v.roll;
  stepVehicleControls(v,i,dt,time,q);
  const body=vehicleBody(v.spec),mode=v.spec.mode;
  const ground=['wheeled','bike','slide'].includes(mode);
  // Low-speed taxiing rests on wheels too; airborne attitude keeps its original
  // oriented hull and lift path, including the transition into takeoff.
  const taxi=mode==='plane'&&v.grounded&&v.speed<=14&&v.velocity.y<=0;
  const supported=ground||taxi;
  const delta=v.position.clone().sub(old),motionOrigin=old.clone();
  let pose=supported?groundVehiclePose(body,v.rotation,v.yaw):{body,rotation:v.rotation};
  const previousPose=supported?groundVehiclePose(body,oldRotation,oldYaw):{body,rotation:oldRotation};
  // Ground lean changes hull clearance, not steering authority. Lift only to the
  // local support and sweep that lift with the old hull to retain roof clearance.
  const clear=supported?q.safeSpawn(old,pose.body,pose.rotation):null;
  if(q.overlaps(old,pose.body,pose.rotation)||(clear&&clear.y>old.y+1e-6)){
    const raised=clear&&q.move(old,clear.clone().sub(old),previousPose.body,previousPose.rotation);
    if(clear&&raised&&raised.position.distanceToSquared(clear)<1e-6)motionOrigin.copy(clear);
    else{
      v.rotation.copy(oldRotation);v.yaw=oldYaw;v.pitch=oldPitch;v.roll=oldRoll;
      pose=previousPose;
    }
  }
  if(supported&&delta.y>=0)delta.y-=.02;
  // Sweep driving separately from resting gravity. A diagonal grazing cast can
  // otherwise report spurious lateral normals from a large flat floor.
  const horizontal=supported?q.move(motionOrigin,new Vector3(delta.x,0,delta.z),pose.body,pose.rotation,ground?.45:0):null;
  const vertical=q.move(horizontal?.position??motionOrigin,horizontal?new Vector3(0,delta.y,0):delta,pose.body,pose.rotation);
  const hit=horizontal?{...vertical,grounded:horizontal.grounded||vertical.grounded,blocked:horizontal.blocked||vertical.blocked,normals:[...horizontal.normals,...vertical.normals]}:vertical;
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
  if(ground)v.grounded=hit.grounded;
  if(mode==='plane'||mode==='glider'){
    // The asset origin may be metres above its wheels. Use the swept hull contact,
    // including a short resting probe, and keep airborne lift free to leave ground.
    v.grounded=hit.grounded||(v.velocity.y<=0&&q.move(v.position,new Vector3(0,-.035,0),body,v.rotation).grounded);
    if(v.grounded&&mode==='glider'){
      v.speed*=Math.exp(-2*dt);v.velocity.multiplyScalar(Math.exp(-2*dt));
      if(v.speed<8){v.launched=false;v.speed=0;v.velocity.set(0,0,0);}
    }
  }
  if(hit.blocked)v.speed=Math.min(v.speed,v.velocity.length());
  if((mode==='boat'||mode==='sub')&&!q.waterContains(v.position,v.spec.radius)){v.position.copy(old);v.velocity.set(0,0,0);v.speed=0;}
}
export class Simulation {
  environment?:EnvironmentQueries;
  humanoid?:HumanoidController|undefined;
  private humanoidClips:ReadonlySet<string>=new Set();
  private humanoidMotions:readonly MotionSource[]=[];
  characterControl=defaultTrainingControl('character',{speed:3.8,accel:12,grip:3,steer:14});
  private prepared=new Map<string,MapSpawn>();
  vehicles=SPECS.map(createVehicle);active=-1;time=0;transition=0;transitionKind:''|'enter'|'exit'='';message='';teleportRevision=0;
  player:PlayerState={position:new Vector3(...START),velocity:new Vector3(),yaw:0,grounded:true,swimming:false,coyote:.1,jumpBuffer:0,animation:'Idle_Loop',landTimer:0};
  constructor(environment?:EnvironmentQueries,specs:readonly VehicleSpec[]=[]){this.vehicles=specs.map(createVehicle);if(environment)this.setEnvironment(environment);}
  dispose(){this.humanoid?.dispose();this.humanoid=undefined;}
  setHumanoidAssets(clips:ReadonlySet<string>,motions:readonly MotionSource[]){this.humanoidClips=clips;this.humanoidMotions=motions;this.humanoid?.setAvailableClips(clips,motions);}
  prepareEnvironment(q:EnvironmentQueries,specs:readonly VehicleSpec[]=this.vehicles.map(v=>v.spec)):Simulation{
    const staged=new Simulation(q,specs.map(spec=>structuredClone(spec)));
    staged.characterControl={...this.characterControl};staged.setHumanoidAssets(this.humanoidClips,this.humanoidMotions);return staged;
  }
  adoptEnvironment(staged:Simulation):void{this.dispose();Object.assign(this,staged);}
  private syncActorBodies(){this.environment?.syncActorBodies(this.vehicles.filter(v=>this.available(v)).flatMap(v=>creatureBodies(v).map((part,n)=>({id:`${v.spec.id}:${n}`,...part}))));}
  private syncHumanoidPlayer(){
    const h=this.humanoid,p=this.player;if(!h)return;
    p.position.copy(h.position);p.velocity.copy(h.velocity);p.velocity.y=h.vertical;p.yaw=Math.atan2(h.facing.x,h.facing.z);
    p.grounded=h.grounded;p.swimming=h.swimming;p.coyote=h.coyote;p.jumpBuffer=h.jumpBuffer;
    p.animation=h.state;p.landTimer=h.animationEvent?.kind==='land'?Math.max(0,.45-h.animationEvent.elapsed):0;
  }
  private canRelocate(){if(this.active<0&&this.humanoid&&!this.humanoid.canBoard){this.message=this.humanoid.boardingReason;return false;}return true;}
  /** Explicit reset for authored test starts; ordinary vehicle visits retain world targets. */
  prepareCharacter(position:Vector3,yaw:number){
    if(!this.humanoid||!this.environment)return false;
    const safe=this.environment.safeSpawn(position);if(!safe){this.message='人物测试点没有站立净空';return false;}
    this.active=-1;this.transition=0;this.transitionKind='';this.humanoid.resetAt(safe,yaw);this.syncHumanoidPlayer();this.teleportRevision++;return true;
  }
  available(v:VehicleState){return !this.environment||this.environment.map.regions.some(r=>r.modes.includes(v.spec.mode));}
  setEnvironment(q:EnvironmentQueries){
    this.humanoid?.dispose();
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
    this.player.position.copy(q.safeSpawn(new Vector3(...q.map.playerSpawn))??new Vector3(...q.map.playerSpawn));this.player.velocity.set(0,0,0);
    Object.assign(this.player,{yaw:0,grounded:true,swimming:false,coyote:.1,jumpBuffer:0,landTimer:0,animation:'Idle_Loop'});
    this.humanoid=new HumanoidController(q);this.humanoid.resetAt(this.player.position,this.player.yaw);this.humanoid.setAvailableClips(this.humanoidClips,this.humanoidMotions);this.humanoid.swimStyle='freestyle';this.syncActorBodies();
  }
  prepare(n:number,spawn:MapSpawn):boolean {
    const v=this.vehicles[n],q=this.environment;if(!v||!q)return false;
    if(!this.canRelocate())return false;
    const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),spawn.yaw);
    let safe=q.safeSpawn(new Vector3(...spawn.position),vehicleBody(v.spec),rotation);
    if(!safe){this.message='该准备点没有足够净空';return false;}
    const candidate=createVehicle(v.spec);candidate.position.copy(safe);candidate.rotation.copy(rotation);candidate.yaw=spawn.yaw;resetCreatureState(candidate);
    if(!canPlaceCreature(candidate,q)){this.message='该准备点无法容纳完整载具及牵引马匹';return false;}
    if(this.vehicles.some(o=>o!==v&&this.available(o)&&actorsTouch(candidate,o))){this.message='准备点被其他载具占用';return false;}
    const boarding=this.boardingPoint(candidate);
    if(!boarding){this.message='准备点旁没有安全交互位置';return false;}
    Object.assign(v,candidate);this.prepared.set(v.spec.id,spawn);
    this.active=-1;this.transition=0;this.transitionKind='';this.teleportRevision++;
    this.player.position.copy(boarding);this.player.velocity.set(0,0,0);Object.assign(this.player,{yaw:v.yaw,grounded:false,swimming:!!q.waterAt(boarding),coyote:0,jumpBuffer:0,landTimer:0,animation:'Idle_Loop'});
    this.humanoid?.setMounted(false,boarding,v.yaw);this.syncActorBodies();
    this.message=`${v.spec.name}已就位 · 按 F 驾驶`;return true;
  }
  get vehicle(){return this.vehicles[this.active];}
  nearest():number {let best=-1,d=Infinity;this.vehicles.forEach((v,n)=>{const ds=v.position.distanceTo(this.player.position),body=vehicleBody(v.spec),range=this.environment&&body.kind==='box'?Math.max(5.3,body.halfExtents[0]+2):Math.max(5.3,v.creature?v.spec.radius+1.6:0);if(this.available(v)&&ds<range&&ds<d&&v.velocity.length()<3){d=ds;best=n;}});return best;}
  private boardingPoint(v:VehicleState):Vector3|null {
    const q=this.environment!;const body=vehicleBody(v.spec);
    const rx=body.kind==='box'?body.halfExtents[0]+.9:v.spec.radius+1.2,rz=body.kind==='box'?body.halfExtents[2]+.9:v.spec.radius+1.2;
    for(const [x=0,z=0] of [[rx,0],[-rx,0],[0,-rz],[0,rz]]){
      const p=new Vector3(x,0,z).applyAxisAngle(new Vector3(0,1,0),v.yaw).add(v.position);
      const floor=q.support(p,4,.45),water=q.waterAt(p);
      if(water&&v.position.y<water.surface+2)p.y=water.surface-1.25;
      else if(floor&&Math.abs(floor.height-v.position.y)<4)p.y=floor.height+.025;
      else continue;
      const selectedDistance=v.position.distanceTo(p);
      if(v.creature?.leadPosition&&v.creature.leadPosition.distanceTo(p)<2.3)continue;
      if(this.vehicles.some(o=>o.spec.id!==v.spec.id&&this.available(o)&&(actorBlocksPlayer(o,p,.5)||(o.velocity.length()<3&&o.position.distanceTo(p)<=selectedDistance))))continue;
      const safe=q.safeSpawn(p);if(safe)return safe;
    }return null;
  }
  interact():boolean {
    if(this.transition>0)return false;
    if(this.vehicle) {
      const v=this.vehicle;
      if(v.velocity.length()>5){this.message='速度过快，请先减速至 18 km/h 以下再离开载具';return false;}
      if(this.environment){const pt=this.boardingPoint(v);if(!pt){this.message='两侧没有安全落点，移动载具后再试';return false;}if(this.humanoid&&!this.humanoid.setMounted(false,pt,v.yaw))return false;this.active=-1;this.player.position.copy(pt);this.player.velocity.copy(v.velocity);this.player.yaw=v.yaw;this.player.grounded=false;this.player.animation='Sitting_Exit';this.transition=.38;this.transitionKind='exit';this.message='已离开载具';return true;}
      const r=v.spec.radius+1.2,origin=v.position;
      const offsets=[[r,0],[-r,0],[0,-r-1],[0,r+1]];
      for(const [x=0,z=0] of offsets) {
        const pt=new Vector3(x,0,z).applyQuaternion(v.rotation).add(origin);pt.y=Math.max(pt.y,groundHeight(pt.x,pt.z));
        const blockedVehicle=this.vehicles.some(other=>other!==v&&actorBlocksPlayer(other,pt,.6));
        if(validExit(pt.x,origin.y+.5,pt.z)&&!blockedVehicle) {
          this.active=-1;this.player.position.copy(pt);this.player.velocity.copy(v.velocity);this.player.yaw=v.yaw;
          this.player.grounded=false;this.player.animation='Sitting_Exit';this.transition=.38;this.transitionKind='exit';this.message='已离开载具';return true;
        }
      }
      this.message='两侧没有安全落点，移动载具后再试';return false;
    }
    if(this.humanoid&&!this.humanoid.canBoard){this.message=this.humanoid.boardingReason;return false;}
    const n=this.nearest();if(n<0){this.message='靠近载具，按 F 进入驾驶位';return false;}
    if(this.humanoid&&!this.humanoid.setMounted(true))return false;
    this.active=n;this.player.velocity.set(0,0,0);this.player.animation='Sitting_Enter';this.transition=.5;this.transitionKind='enter';this.message='控制权已交给载具';return true;
  }
  visit(n:number) {
    const v=this.vehicles[n];if(!v)return;
    if(this.environment){const spawn=this.prepared.get(v.spec.id)??this.environment.map.spawns.find(s=>s.vehicleId===v.spec.id)??this.environment.map.spawns.find(s=>this.environment!.map.regions.find(r=>r.id===s.regionId)?.modes.includes(v.spec.mode));if(spawn)this.prepare(n,spawn);return;}
    this.active=-1;this.transition=0;this.transitionKind='';this.teleportRevision++;
    // Visit a known safe staging point and restore this vehicle for repeatable trials.
    Object.assign(v,createVehicle(v.spec));
    const off=new Vector3(v.spec.radius+1.25,0,-.5).applyQuaternion(v.rotation);
    this.player.position.copy(v.position).add(off);
    if(v.spec.mode==='space')this.player.position.y=0;
    if(v.spec.mode==='boat'||v.spec.mode==='sub')this.player.position.y=WATER-1.25;
    this.player.velocity.set(0,0,0);this.player.yaw=v.yaw;
    this.player.grounded=false;this.player.animation='Idle_Loop';
    // The zero-G platform lowers to boarding height when summoned.
    if(v.spec.mode==='space'){v.position.y=0;this.player.position.y=0;}
    this.message=`${v.spec.name}已就位 · 按 F 驾驶`;
  }
  approach(id:string):boolean {
    if(!this.canRelocate())return false;
    const v=this.vehicles.find(vehicle=>vehicle.spec.id===id);
    if(!v){this.message='未找到该载具';return false;}
    if(!this.available(v)){this.message='当前地图不支持该载具';return false;}
    if(v.velocity.length()>=3){this.message='载具仍在移动，请减速或使用场景预设重新准备';return false;}
    if(this.environment){const pt=this.boardingPoint(v);if(!pt){this.message='载具附近没有安全交互位置，请重新准备';return false;}if(this.humanoid&&!this.humanoid.setMounted(false,pt,v.yaw))return false;this.active=-1;this.transition=0;this.transitionKind='';this.teleportRevision++;this.player.position.copy(pt);this.player.velocity.set(0,0,0);Object.assign(this.player,{yaw:v.yaw,grounded:false,swimming:!!this.environment.waterAt(pt),coyote:0,jumpBuffer:0,landTimer:0,animation:'Idle_Loop'});return true;}
    const water=wetHeight(v.position.x,v.position.z),surface=water?WATER:surfaceHeight(v.position.x,v.position.z);
    if(Math.abs(v.position.y-surface)>4){this.message='该载具当前无法安全靠近，请在场景面板重新准备';return false;}
    const radius=v.spec.radius+1.25;
    for(const [x=0,z=0] of [[radius,-.5],[-radius,-.5],[0,-radius],[0,radius]]){
      const pt=new Vector3(x,0,z).applyAxisAngle(new Vector3(0,1,0),v.yaw).add(v.position);
      const swimming=wetHeight(pt.x,pt.z);pt.y=swimming?WATER-1.25:surfaceHeight(pt.x,pt.z);
      const recovered=recoverTerrainOverlap(pt,.35,swimming?3.6:.42);
      if(Math.hypot(recovered.x-pt.x,recovered.z-pt.z)>1e-6)continue;
      const selectedDistance=pt.distanceTo(v.position);
      if(selectedDistance>Math.max(5.2,v.creature?v.spec.radius+1.5:0)||!validExit(pt.x,pt.y,pt.z)||this.vehicles.some(other=>other!==v&&(actorBlocksPlayer(other,pt,.65)||(other.velocity.length()<3&&other.position.distanceTo(pt)<=selectedDistance))))continue;
      this.active=-1;this.transition=0;this.transitionKind='';this.teleportRevision++;
      this.player.position.copy(pt);this.player.velocity.set(0,0,0);
      Object.assign(this.player,{yaw:v.yaw,grounded:!swimming,swimming,coyote:swimming?0:.1,jumpBuffer:0,landTimer:0,animation:swimming?'Swim_Idle_Loop':'Idle_Loop'});
      this.message=`已前往 ${v.spec.name}${swimming?' · 当前为游泳状态':''} · 按 F 驾驶`;return true;
    }
    this.message='载具附近没有安全交互位置，请在场景面板重新准备';return false;
  }
  reset() {
    if(this.humanoid&&this.active<0){this.humanoid.reset();this.syncHumanoidPlayer();this.transition=0;this.transitionKind='';this.teleportRevision++;this.message='人物与交互物已复位';return;}
    if(this.environment){if(this.active>=0){const n=this.active;this.visit(n);}else{this.player.position.copy(this.environment.safeSpawn(new Vector3(...this.environment.map.playerSpawn))??new Vector3(...this.environment.map.playerSpawn));this.player.velocity.set(0,0,0);Object.assign(this.player,{yaw:0,grounded:true,swimming:false,coyote:.1,jumpBuffer:0,landTimer:0,animation:'Idle_Loop'});this.transition=0;this.transitionKind='';this.teleportRevision++;}return;}
    this.teleportRevision++;
    if(this.active>=0){const n=this.active;Object.assign(this.vehicles[n]!,createVehicle(SPECS[n]!));this.message='当前载具已返回起点';}
    else {this.player.position.set(...START);this.player.velocity.set(0,0,0);this.player.yaw=0;this.message='已返回整备区';}
    this.transition=0;this.transitionKind='';
  }
  private stepEnvironmentPlayer(i:Input,dt:number,cameraYaw:number){
    const q=this.environment!,p=this.player,old=p.position.clone(),wasGrounded=p.grounded;
    const water=q.waterAt(p.position);p.swimming=!!water&&p.position.y<water.surface-.3;
    p.coyote=p.grounded?.12:Math.max(0,p.coyote-dt);p.jumpBuffer=i.jump?.13:Math.max(0,p.jumpBuffer-dt);
    const dir=new Vector3(Math.sin(cameraYaw),0,Math.cos(cameraYaw)).multiplyScalar(i.forward).addScaledVector(new Vector3(-Math.cos(cameraYaw),0,Math.sin(cameraYaw)),i.steer);if(dir.lengthSq()>1)dir.normalize();
    const speed=p.swimming?3.5:this.characterControl.speed*(i.boost?7.2/3.8:i.slow?1.8/3.8:1),response=p.grounded||p.swimming?this.characterControl.accel:this.characterControl.grip;
    p.velocity.x=damp(p.velocity.x,dir.x*speed,response,dt);p.velocity.z=damp(p.velocity.z,dir.z*speed,response,dt);
    if(dir.lengthSq()>.01)p.yaw+=angleDelta(p.yaw,Math.atan2(dir.x,dir.z))*(1-Math.exp(-this.characterControl.steer*dt));
    if(p.jumpBuffer>0&&p.coyote>0&&!p.swimming){p.velocity.y=7;p.grounded=false;p.coyote=0;p.jumpBuffer=0;p.landTimer=-.18;}
    if(p.swimming){p.velocity.y=(water!.surface-1.3-p.position.y)*5;if(i.jump)p.velocity.y=6;}else p.velocity.y-=18*dt;
    const hit=q.move(old,p.velocity.clone().multiplyScalar(dt),PLAYER_BODY,undefined,p.velocity.y<=0?.42:0);
    p.position.copy(hit.position);
    for(const normal of hit.normals){if(normal.y>.1)p.velocity.y=Math.max(0,p.velocity.y);else if(normal.y<-.1)p.velocity.y=Math.min(0,p.velocity.y);else stopIntoNormals(p.velocity,[normal]);}
    p.grounded=hit.grounded;
    if(p.grounded&&p.velocity.y>0)p.velocity.y=0;
    // Parked actors block walking, and recovery uses the same static map sweep.
    for(const v of this.vehicles){if(!this.available(v))continue;for(const part of actorFootprints(v)){if(p.position.y+1.75<=part.minY||p.position.y>=part.maxY)continue;const d=new Vector3(p.position.x-part.position.x,0,p.position.z-part.position.z),min=part.radius+.35;if(d.length()<min&&d.length()>.001){const correction=d.clone().normalize().multiplyScalar(min-d.length());p.position.copy(q.move(p.position,correction,PLAYER_BODY).position);}}}
    if(!wasGrounded&&p.grounded)p.landTimer=.16;p.landTimer=p.landTimer>0?Math.max(0,p.landTimer-dt):Math.min(0,p.landTimer+dt);
    const moving=Math.hypot(p.velocity.x,p.velocity.z)>.15;
    p.animation=p.swimming?(moving?'Swim_Fwd_Loop':'Swim_Idle_Loop'):!p.grounded?(p.landTimer<0?'Jump_Start':'Jump_Loop'):p.landTimer>0?'Jump_Land':!moving?'Idle_Loop':i.boost?'Sprint_Loop':i.slow?'Walk_Loop':'Jog_Fwd_Loop';
    if(p.position.y<=q.map.bounds.min[1]+.05)this.reset();
  }
  step(i:Input,dt:number,cameraYaw=0) {
    this.syncActorBodies();
    this.stepActors(i,dt,cameraYaw);
    this.syncActorBodies();this.environment?.stepPhysics(dt);this.humanoid?.skills.syncDropped();
  }
  private stepActors(i:Input,dt:number,cameraYaw=0) {
    this.time+=dt;this.transition=Math.max(0,this.transition-dt);
    const vehicleBefore=this.vehicle?.position.clone();
    const before=this.vehicle?{rotation:this.vehicle.rotation.clone(),yaw:this.vehicle.yaw,pitch:this.vehicle.pitch,roll:this.vehicle.roll,creature:this.vehicle.creature?{...this.vehicle.creature,leadPosition:this.vehicle.creature.leadPosition?.clone()}:undefined}:undefined;
    for(const v of this.vehicles) {
      // Parked craft keep their transforms; only the occupied craft owns input.
      if(v===this.vehicle&&this.transition===0)stepVehicle(v,i,dt,this.time,this.environment);
    }
    if(this.vehicle&&vehicleBefore){if(!this.environment&&!this.vehicle.creature)separateVehicleContacts(this.vehicle,this.vehicles,vehicleBefore);else if(this.vehicles.some(o=>o!==this.vehicle&&this.available(o)&&actorsTouch(this.vehicle!,o))){this.vehicle.position.copy(vehicleBefore);this.vehicle.rotation.copy(before!.rotation);this.vehicle.yaw=before!.yaw;this.vehicle.pitch=before!.pitch;this.vehicle.roll=before!.roll;this.vehicle.creature=before!.creature;this.vehicle.velocity.set(0,0,0);this.vehicle.speed=0;}}
    const p=this.player;
    if(this.vehicle) {p.position.copy(this.vehicle!.position);p.yaw=this.vehicle.yaw;p.animation=this.transition>0?'Sitting_Enter':this.vehicle.spec.characterPose==='stand'?'Idle_Loop':'Driving_Loop';return;}
    if(this.transition>0){p.animation='Sitting_Exit';return;}
    if(this.humanoid){
      const h=this.humanoid;
      // On walls, source controls follow the registered wall tangent regardless of orbit.
      const surface=h.surface.surface;
      const direction=surface?new Vector3(i.steer,0,-i.forward).applyAxisAngle(new Vector3(0,1,0),Math.atan2(surface.normal[0],surface.normal[2])):new Vector3(-i.steer,0,i.forward).applyAxisAngle(new Vector3(0,1,0),cameraYaw);
      if(direction.lengthSq()>1)direction.normalize();
      if(i.humanoid?.toggleSwimStyle)h.swimStyle=h.swimStyle==='freestyle'?'breaststroke':'freestyle';
      if(i.humanoid?.cancel&&h.skills.active)h.skills.cancel(h.skills.active.requestId);
      const previousSerial=h.motionSerial;h.step(direction,i.boost,i.slow,i.jump,i.humanoid);this.syncHumanoidPlayer();
      if(h.motionSerial!==previousSerial&&!h.traversal&&!h.completedMotion)this.teleportRevision++;
      return;
    }
    if(this.environment){this.stepEnvironmentPlayer(i,dt,cameraYaw);return;}
    const old=p.position.clone(),wasGrounded=p.grounded;
    p.swimming=wetHeight(p.position.x,p.position.z)&&p.position.y<WATER-.3;
    p.coyote=p.grounded?.12:Math.max(0,p.coyote-dt);p.jumpBuffer=i.jump?.13:Math.max(0,p.jumpBuffer-dt);
    const f=new Vector3(Math.sin(cameraYaw),0,Math.cos(cameraYaw)),r=new Vector3(-Math.cos(cameraYaw),0,Math.sin(cameraYaw));
    const dir=f.multiplyScalar(i.forward).addScaledVector(r,i.steer);if(dir.lengthSq()>1)dir.normalize();
    const speed=p.swimming?3.5:i.boost?7.2:i.slow?1.8:3.8;
    const response=p.grounded||p.swimming?12:3;
    p.velocity.x=damp(p.velocity.x,dir.x*speed,response,dt);p.velocity.z=damp(p.velocity.z,dir.z*speed,response,dt);
    if(dir.lengthSq()>.01)p.yaw+=angleDelta(p.yaw,Math.atan2(dir.x,dir.z))*(1-Math.exp(-14*dt));
    if(p.jumpBuffer>0&&p.coyote>0&&!p.swimming){p.velocity.y=7;p.grounded=false;p.coyote=0;p.jumpBuffer=0;p.landTimer=-.18;}
    if(p.swimming){p.velocity.y=(WATER-1.3-p.position.y)*5;if(i.jump)p.velocity.y=6;}
    else p.velocity.y-=18*dt;
    p.position.addScaledVector(p.velocity,dt);
    const walkContact=sweepTerrainXZ(old,p.position,.35,p.swimming?3.6:.42);
    p.position.x=walkContact.x;p.position.z=walkContact.z;if(walkContact.hitX)p.velocity.x=0;if(walkContact.hitZ)p.velocity.z=0;
    for(const v of this.vehicles)for(const part of actorFootprints(v)){if(p.position.y+1.75<=part.minY||p.position.y>=part.maxY)continue;const dx=p.position.x-part.position.x,dz=p.position.z-part.position.z,d=Math.hypot(dx,dz),min=part.radius+.35;if(d<min&&d>.001){p.position.x=part.position.x+dx/d*min;p.position.z=part.position.z+dz/d*min;}}
    const floor=surfaceHeight(p.position.x,p.position.z),oldFloor=surfaceHeight(old.x,old.z);
    const climbingShore=p.swimming&&!wetHeight(p.position.x,p.position.z)&&floor<=.1;
    if(floor>p.position.y+.42&&floor-oldFloor>.6&&!climbingShore){p.position.x=old.x;p.position.z=old.z;p.velocity.x=0;p.velocity.z=0;}
    const actual=surfaceHeight(p.position.x,p.position.z);
    if(p.position.y<=actual+.02){p.position.y=actual;p.velocity.y=0;p.grounded=true;}else p.grounded=false;
    // Shore safety: swimmers can step back onto a low dock or shore.
    if(p.swimming&&!wetHeight(p.position.x,p.position.z)&&actual<=.1){p.position.y=actual;p.grounded=true;p.swimming=false;}
    if(!wasGrounded&&p.grounded)p.landTimer=.16;
    p.landTimer=p.landTimer>0?Math.max(0,p.landTimer-dt):Math.min(0,p.landTimer+dt);
    const actualSpeed=Math.hypot(p.velocity.x,p.velocity.z);
    p.animation=p.swimming?(actualSpeed>.5?'Swim_Fwd_Loop':'Swim_Idle_Loop'):!p.grounded?(p.landTimer<0?'Jump_Start':'Jump_Loop'):p.landTimer>0?'Jump_Land':actualSpeed<.15?'Idle_Loop':i.boost?'Sprint_Loop':i.slow?'Walk_Loop':'Jog_Fwd_Loop';
    if(p.position.y<DEPTH-5)this.reset();
  }
}
