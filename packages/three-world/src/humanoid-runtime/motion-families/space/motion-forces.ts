import {Vector3} from 'three';
import type {Input,VehicleState} from '../../simulation';
import type {SpaceFlightConfig} from './config';
export function spaceInertia(v:VehicleState,c:SpaceFlightConfig,mass:number){
 const [x,y,z]=v.spec.envelope.halfExtents;
 return c.hull==='disc'?new Vector3(mass*(3*x*x+4*y*y)/12,mass*x*x/2,mass*(3*x*x+4*y*y)/12):new Vector3(mass*(y*y+z*z)/3,mass*(x*x+z*z)/3,mass*(x*x+y*y)/3);
}
const clamp=(n:number,limit:number)=>Math.max(-limit,Math.min(limit,n));
/** 主项目 +Z 前进、-X 局部右向；仅计算力和力矩，不积分位置。 */
export function spaceForces(v:VehicleState,i:Input,c:SpaceFlightConfig,mass:number,targets?:{velocity:Vector3;angular:Vector3}){
 if(v.motion.family!=='space')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
 const inverse=v.rotation.clone().invert(),velocity=v.velocity.clone().applyQuaternion(inverse),omega=v.motion.body.angularVelocity.clone().applyQuaternion(inverse);
 const translation=new Vector3(-i.strafe,i.lift,i.forward),rotation=new Vector3(i.pitch,-i.steer,i.roll);
 const force=new Vector3(),torque=new Vector3(),inertia=spaceInertia(v,c,mass),brake=i.boost;
 for(let axis=0;axis<3;axis++){
  const f=c.thrustNewtonsXYZ[axis]!,input=translation.getComponent(axis),speed=velocity.getComponent(axis);
  const assisted=!!targets||brake||v.motion.driveMode==='assisted';
  const requested=assisted?((targets?targets.velocity.getComponent(axis):brake?0:input*v.spec.speed)-speed)*mass*(targets?2:brake?v.spec.brakeDamping:v.spec.grip):input*f;
  force.setComponent(axis,Math.max(axis===2?-c.reverseThrustNewtons:-f,Math.min(f,requested)));
  const desired=targets?targets.angular.getComponent(axis):brake?0:rotation.getComponent(axis)*v.spec.steer;
  torque.setComponent(axis,clamp(assisted?(desired-omega.getComponent(axis))*inertia.getComponent(axis)*4:rotation.getComponent(axis)*c.torqueNewtonMetersXYZ[axis]!,c.torqueNewtonMetersXYZ[axis]!));
 }
 return {force,torque};
}
