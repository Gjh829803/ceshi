import {Euler,Vector3,type Object3D} from 'three';
import type {Input,VehicleState} from './simulation';
import type {EnvironmentQueries} from './environment/queries';
import {coastSpeed} from './handling';

/** Metres and radians. +Z nose, +X rider's left. */
export const ATV_GEOMETRY={seat:[0,1,-.15] as [number,number,number],wheelRadius:.39,halfTrack:.70,wheelbase:1.6,
 wheelPositions:[[.7,.39,.8],[-.7,.39,.8],[.7,.39,-.8],[-.7,.39,-.8]] as [number,number,number][],
 handlebar:[0,1.285,.12] as [number,number,number],grips:[[.29,0,0],[-.29,0,0]] as [number,number,number][],
 feet:[[.420507,.309005,.012058],[-.420509,.309004,.012058]] as [number,number,number][]};
export interface AtvState{steeringAngle:number;wheelAngles:number[];suspension:number[]}
export const createAtvState=():AtvState=>({steeringAngle:0,wheelAngles:[0,0,0,0],suspension:[0,0,0,0]});
export const copyAtvState=(s?:AtvState):AtvState|undefined=>s?{steeringAngle:s.steeringAngle,wheelAngles:[...s.wheelAngles],suspension:[...s.suspension]}:undefined;
export const atvSteeringAngle=(steering:number,speed:number,maximum:number)=>-steering*Math.min(.48,maximum)/(1+Math.abs(speed)/12);
export function atvWheelAngle(angle:number,index:number):number{
 if(index>1||Math.abs(angle)<1e-6)return 0;
 const x=ATV_GEOMETRY.wheelPositions[index]![0];
 return Math.atan(ATV_GEOMETRY.wheelbase/(ATV_GEOMETRY.wheelbase/Math.tan(angle)-x));
}
/** Four-wheel road family with short wheelbase, speed-sensitive steering and handbrake. */
export function stepAtv(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries):void{
 const s=v.spec,f=new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw)),right=new Vector3(f.z,0,-f.x);
 const water=q.waterAt(v.position),support=q.support(v.position,2,.45),drive=v.grounded&&!(water&&v.position.y<water.surface);
 let speed=v.velocity.dot(f),side=v.velocity.dot(right);const previous=speed;
 v.atv!.steeringAngle=atvSteeringAngle(v.steering,speed,s.steer);
 if(drive){
  const opposite=i.forward*speed<0&&Math.abs(speed)>.08;
  if(i.brake||opposite){speed=coastSpeed(speed,s.brakeDeceleration,dt);v.throttle=0;}
  else if(Math.abs(i.forward)>.01){v.throttle+=(i.forward-v.throttle)*(1-Math.exp(-s.throttleResponse*dt));speed+=v.throttle*s.accel*(i.boost&&i.forward>0?1.2:1)*dt;}
  else{v.throttle=0;speed=coastSpeed(speed,s.coastDeceleration,dt);}
  if(support&&!i.brake){const n=support.normal;speed+=9.81*n.y*(n.x*f.x+n.z*f.z)*dt;}
  speed=Math.max(-s.reverseSpeed,Math.min(i.boost?s.maxSpeed:s.speed,speed));
  const rate=speed/ATV_GEOMETRY.wheelbase*Math.tan(v.atv!.steeringAngle);v.yaw+=rate*dt;
  v.velocity.x=f.x*speed+right.x*side;v.velocity.z=f.z*speed+right.z*side;
  f.set(Math.sin(v.yaw),0,Math.cos(v.yaw));right.set(f.z,0,-f.x);
  side=v.velocity.dot(right);v.velocity.addScaledVector(right,-side*(1-Math.exp(-s.grip*(i.brake?.24:1)*dt)));
  if(support){const n=support.normal,grade=Math.atan2(-(n.x*f.x+n.z*f.z),n.y),bank=-Math.asin(Math.max(-1,Math.min(1,n.x*f.z-n.z*f.x)));
   const dive=Math.max(-.045,Math.min(.045,(speed-previous)/dt*.006));
   v.pitch+=(grade-dive-v.pitch)*(1-Math.exp(-s.pitchResponse*dt));
   v.roll+=(bank+Math.max(-.10,Math.min(.10,-rate*speed*.008))-v.roll)*(1-Math.exp(-s.rollResponse*dt));}
 }
 if(water&&v.position.y<water.surface){v.velocity.x*=Math.exp(-3*dt);v.velocity.z*=Math.exp(-3*dt);}
 v.velocity.y-=9.81*dt;v.position.addScaledVector(v.velocity,dt);v.rotation.setFromEuler(new Euler(-v.pitch,v.yaw,v.roll,'YXZ'));
 v.speed=Math.hypot(v.velocity.x,v.velocity.z);v.submerged=!!water&&v.position.y<water.surface;
}
/** Advance only after the common hull sweep accepts motion. Repeated renders are pure. */
export function finishAtvStep(v:VehicleState,old:Vector3,oldYaw:number,q:EnvironmentQueries):void{
 const a=v.atv!,yaw=Math.atan2(Math.sin(v.yaw-oldYaw),Math.cos(v.yaw-oldYaw)),delta=v.position.clone().sub(old);
 const distance=delta.dot(new Vector3(Math.sin(oldYaw+yaw/2),0,Math.cos(oldYaw+yaw/2)));
 ATV_GEOMETRY.wheelPositions.forEach((p,index)=>{
  const angle=atvWheelAngle(a.steeringAngle,index);
  if(v.grounded)a.wheelAngles[index]!+=((distance-yaw*p[0])*Math.cos(angle)+yaw*p[2]*Math.sin(angle))/ATV_GEOMETRY.wheelRadius;
  const point=new Vector3(...p).applyQuaternion(v.rotation).add(v.position),support=q.support(point,1,.1);
  a.suspension[index]=v.grounded&&support?Math.max(-.12,Math.min(.12,support.height+ATV_GEOMETRY.wheelRadius-point.y)):0;
 });
}
export function sampleAtvVisual(root:Object3D,state:AtvState):void{
 const bar=root.getObjectByName('atv.handlebar');if(bar)bar.rotation.y=state.steeringAngle;
 ATV_GEOMETRY.wheelPositions.forEach((p,index)=>{const pivot=root.getObjectByName(`atv.wheel.${index}`),spin=root.getObjectByName(`atv.spin.${index}`);
  if(pivot){pivot.rotation.y=atvWheelAngle(state.steeringAngle,index);pivot.position.y=p[1]+state.suspension[index]!;}
  if(spin)spin.rotation.x=state.wheelAngles[index]!;
 });
}
