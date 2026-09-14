import {Vector3} from 'three';
import {AIRCRAFT as C} from '../../../config/aircraft';
import type {VehicleState,Input} from '../../simulation';
import type {EnvironmentQueries} from '../../environment/queries';

/** 滑翔机自己的起落架：弹簧支撑、阻尼及轮端摩擦，力矩交回同一飞机刚体。 */
export function gliderLandingGear(v:VehicleState,input:Input,h:number,q:EnvironmentQueries,force:Vector3,torque:Vector3):boolean {
 const a=v.motion.aircraft!,up=new Vector3(0,1,0).applyQuaternion(v.rotation);
 const com=new Vector3(...C.center).applyQuaternion(v.rotation).add(v.position);let contacts=0;
 C.wheels.forEach((wheel,n)=>{
  const state=a.wheels[n]!,origin=new Vector3(wheel.x,wheel.y+C.travel,wheel.z).applyQuaternion(v.rotation).add(v.position);
  const hit=q.raycast(origin,up.clone().negate(),wheel.radius+2*C.travel);
  state.contact=!!hit&&hit.normal.dot(up)>.35;state.load=0;state.compression=0;state.steer=wheel.steering?-v.steering*.38:0;
  if(!state.contact)return;contacts++;
  const point=origin.clone().addScaledVector(up,-hit!.distance),arm=point.clone().sub(com),velocity=a.angularVelocity.clone().cross(arm).add(v.velocity);
  state.compression=Math.max(-C.travel,Math.min(C.travel,wheel.radius+C.travel-hit!.distance));
  state.load=Math.max(0,Math.min(C.mass*9.81*2,C.mass*9.81*wheel.share+C.spring*state.compression-C.damping*velocity.dot(hit!.normal)));
  const support=hit!.normal.clone().multiplyScalar(state.load);force.add(support);torque.add(arm.clone().cross(support));
  const tangent=new Vector3(Math.sin(state.steer),0,Math.cos(state.steer)).applyQuaternion(v.rotation);tangent.addScaledVector(hit!.normal,-tangent.dot(hit!.normal)).normalize();
  const side=hit!.normal.clone().cross(tangent),long=velocity.dot(tangent),lateral=velocity.dot(side);
  const fx=-Math.sign(long)*Math.min(Math.abs(long)*C.mass*wheel.share/h,state.load*(input.brake||input.slow?.65:.018));
  const friction=tangent.multiplyScalar(fx).addScaledVector(side,-lateral*C.mass*wheel.share*8).clampLength(0,state.load*.8);
  force.add(friction);torque.add(arm.cross(friction));state.angle+=long/wheel.radius*h;
 });
 return contacts>0;
}
