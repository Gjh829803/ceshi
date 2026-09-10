import { Euler,Vector3,type Object3D } from 'three';
import type { EnvironmentQueries } from '../../environment/queries';
import { coastSpeed } from '../../handling';
import type { Input,VehicleState } from '../../simulation';

/** Metres, seconds and radians; +Z forward, +X rider left. */
export const UNICYCLE_GEOMETRY = {seat:[0,.94,0] as [number,number,number], wheelRadius:.36, crankRadius:.135, pedalX:.23, soleOffset:.055};
export const UNICYCLE_TIMING = {lowerSeconds:.38, liftSeconds:.52, stoppedSpeed:.12};
export interface UnicycleState {
  phase:'supported'|'lowering'|'lifting'|'riding'|'airborne';
  wheelAngle:number; footDown:number; balanceTime:number; balance:number;
  supportLocal:[number,number,number]|null;
  blockedSeconds:number;
}
export const createUnicycleState=():UnicycleState=>({phase:'supported',wheelAngle:0,footDown:1,balanceTime:0,balance:0,supportLocal:null,blockedSeconds:0});
export const copyUnicycleState=(s?:UnicycleState):UnicycleState|undefined=>s?{...s,supportLocal:s.supportLocal?[...s.supportLocal]:null}:undefined;
export function blendUnicycleState(a:UnicycleState|undefined,b:UnicycleState|undefined,t:number){
  const s=copyUnicycleState(b);if(s&&a&&b)for(const key of ['wheelAngle','footDown','balanceTime','balance'] as const)s[key]=a[key]+(b[key]-a[key])*t;return s;
}
export function unicyclePedal(angle:number,side:1|-1):Vector3 {
  const phase=angle+(side===1?0:Math.PI);
  return new Vector3(side*UNICYCLE_GEOMETRY.pedalX,UNICYCLE_GEOMETRY.wheelRadius-Math.sin(phase)*UNICYCLE_GEOMETRY.crankRadius,Math.cos(phase)*UNICYCLE_GEOMETRY.crankRadius);
}
export function refreshUnicycleSupport(v:VehicleState,q:EnvironmentQueries):boolean {
  const point=new Vector3(.30,0,-.06).applyQuaternion(v.rotation).add(v.position);
  const support=v.grounded&&!v.submerged?q.support(point,.3,.18):null;
  const reachable=!!support&&Math.abs(support.height-v.position.y)<.18;
  v.motion.unicycle!.supportLocal=reachable?new Vector3(point.x,support!.height+UNICYCLE_GEOMETRY.soleOffset,point.z).sub(v.position).applyQuaternion(v.rotation.clone().invert()).toArray():null;
  return reachable;
}
export function stepUnicycle(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries):void {
  const s=v.motion.unicycle!,spec=v.spec,f=new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw));
  let speed=v.velocity.dot(f);
  const water=q.waterAt(v.position);v.submerged=!!water&&v.position.y<water.surface;
  if(v.grounded&&!v.submerged){
    const opposite=i.forward*speed<0&&Math.abs(speed)>.08;
    const resting=s.footDown>0||s.blockedSeconds>.25;
    if(resting){speed=0;v.throttle=0;}
    else if(i.brake||opposite){speed=coastSpeed(speed,spec.brakeDeceleration,dt);v.throttle=0;}
    else if(Math.abs(i.forward)>.01){v.throttle=i.forward;speed+=i.forward*spec.accel*dt;}
    else {v.throttle=0;speed=coastSpeed(speed,spec.coastDeceleration,dt);}
    speed=Math.max(-spec.reverseSpeed,Math.min(i.boost?spec.maxSpeed:spec.speed,speed));
    if(Math.abs(speed)<UNICYCLE_TIMING.stoppedSpeed&&Math.abs(i.forward)<.01)speed=0;
    v.yaw-=v.steering*spec.steer*Math.min(Math.abs(speed)/1.5,1)*Math.sign(speed)*dt;
    f.set(Math.sin(v.yaw),0,Math.cos(v.yaw));v.velocity.x=f.x*speed;v.velocity.z=f.z*speed;
    const support=q.support(v.position,1,.15);
    const pitch=support?Math.atan2(-(support.normal.x*f.x+support.normal.z*f.z),support.normal.y):0;
    v.pitch+=(pitch-v.pitch)*(1-Math.exp(-spec.pitchResponse*dt));
    v.roll+=(Math.max(-.14,Math.min(.14,v.steering*speed*.025))-v.roll)*(1-Math.exp(-spec.rollResponse*dt));
  }
  if(v.submerged){v.velocity.x*=Math.exp(-3*dt);v.velocity.z*=Math.exp(-3*dt);}
  v.velocity.y-=9.81*dt;v.position.addScaledVector(v.velocity,dt);
  v.rotation.setFromEuler(new Euler(-v.pitch,v.yaw,v.roll,'YXZ'));v.speed=Math.hypot(v.velocity.x,v.velocity.z);
}
/** Called after collision resolution; animation never invents travel or ground. */
export function finishUnicycleStep(v:VehicleState,old:Vector3,i:Input,dt:number,q:EnvironmentQueries):void {
  const s=v.motion.unicycle!,delta=v.position.clone().sub(old),travel=delta.dot(new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw)));
  if(v.grounded)s.wheelAngle+=travel/UNICYCLE_GEOMETRY.wheelRadius;
  s.balanceTime+=dt;
  s.balance+=(Math.max(-1,Math.min(1,v.steering*v.speed*.2))-s.balance)*(1-Math.exp(-5*dt));
  const request=Math.abs(i.forward)>.01&&!i.brake;
  if(!request)s.blockedSeconds=0;
  else if(s.footDown===0&&v.grounded&&Math.abs(travel)/dt<.015)s.blockedSeconds+=dt;
  else if(Math.abs(travel)/dt>.03)s.blockedSeconds=0;
  // Probe beside the tyre, not under it: a wheel on a ledge cannot supply a foot support.
  const reachable=refreshUnicycleSupport(v,q);
  if(!v.grounded||v.submerged){s.footDown=Math.max(0,s.footDown-dt/UNICYCLE_TIMING.liftSeconds);s.phase='airborne';return;}
  const stopped=Math.hypot(delta.x,delta.z)/dt<UNICYCLE_TIMING.stoppedSpeed&&v.speed<UNICYCLE_TIMING.stoppedSpeed;
  const lower=reachable&&stopped&&(!request||s.blockedSeconds>.25);
  s.footDown=Math.max(0,Math.min(1,s.footDown+(lower?dt/UNICYCLE_TIMING.lowerSeconds:-dt/UNICYCLE_TIMING.liftSeconds)));
  s.phase=lower?(s.footDown===1?'supported':'lowering'):(s.footDown>0?'lifting':'riding');
}
export function sampleUnicycleVisual(root:Object3D,s:UnicycleState):void {
  const wheel=root.getObjectByName('unicycle.wheel');if(wheel)wheel.rotation.x=s.wheelAngle;
  for(const side of [1,-1] as const){
    const pedal=root.getObjectByName(`unicycle.pedal.${side}`);if(pedal)pedal.position.copy(unicyclePedal(s.wheelAngle,side));
    const crank=root.getObjectByName(`unicycle.crank.${side}`);if(crank)crank.rotation.x=s.wheelAngle+(side===1?0:Math.PI);
  }
}
