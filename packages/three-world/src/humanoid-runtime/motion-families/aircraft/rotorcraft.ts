import {Vector3} from 'three';
import {AIRCRAFT as C,ROTOR_FLIGHT as R} from '../../../config/aircraft';
import type {Input,VehicleState} from '../../simulation';

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export interface RotorForceTelemetry {desiredLiftNewtons:number;totalRotorThrustNewtons:number;transitionFactor:number;}
/** 返回旋翼合力和力矩；实际位移、姿态仍只由 Rapier 积分。
 * 总距使用垂直速度增稳，周期变距使用姿态增稳。不是完整叶素/涡流仿真。
 */
export function rotorForces(v:VehicleState,input:Input,h:number,wingLift:number):{force:Vector3;torque:Vector3}&RotorForceTelemetry{
 const a=v.motion.aircraft!,force=new Vector3(),torque=new Vector3(),weight=C.mass*9.81;
 const propulsionThrottle=input.releaseControl?0:v.throttle;
 const up=new Vector3(0,1,0).applyQuaternion(v.rotation);
 const localRate=a.angularVelocity.clone().applyQuaternion(v.rotation.clone().invert());
 const wing=a.subtype==='tiltrotor'?a.tilt:0;
 const forwardSpeed=v.velocity.dot(new Vector3(0,0,1).applyQuaternion(v.rotation));
 // Ctrl/S must be able to leave wing-borne cruise: airspeed alone otherwise
 // keeps both rotors facing forward and removes all horizontal brake authority.
 const targetTilt=a.subtype==='tiltrotor'&&!input.slow&&input.forward>=0?clamp((forwardSpeed-R.transitionStart)/(R.transitionEnd-R.transitionStart),0,1):0;
 a.tilt+=clamp(targetTilt-a.tilt,-R.tiltRate*h,R.tiltRate*h);
 // 减速时自动恢复朝上的旋翼；过渡不瞬切姿态或补写速度。
 a.rotorSpeedFraction+=(Number(propulsionThrottle>.001)-a.rotorSpeedFraction)*(1-Math.exp(-R.governorRate*h));
 const targetVertical=(propulsionThrottle-.5)*R.climbSpeed;
 const desiredLift=clamp((weight+C.mass*(targetVertical-v.velocity.y)*R.verticalResponse)/Math.max(.6,up.y)-Math.max(0,wingLift),0,weight*R.maxLift);
 const total=propulsionThrottle>.001?desiredLift*a.rotorSpeedFraction*a.rotorSpeedFraction:0;
 a.collective=total/(weight*R.maxLift);
 // W/S requests longitudinal speed; attitude input remains an independent axis.
 const speedTarget=input.slow?0:input.forward*(input.boost?v.spec.maxSpeed:v.spec.speed);
 const translationPitch=input.slow||Math.abs(input.forward)>.001?clamp((speedTarget-forwardSpeed)*R.drag/9.81,-R.pitchLimit,R.pitchLimit):0;
 const pitchTarget=clamp(translationPitch+input.pitch*R.pitchLimit,-R.pitchLimit,R.pitchLimit)*(1-wing);
 const rollTarget=(input.roll*R.bankLimit+v.steering*clamp(forwardSpeed/35,0,1)*.3)*(1-wing);
 const desired=new Vector3(
 C.inertia[0]*clamp((pitchTarget+v.pitch)*R.attitudeGain-localRate.x*R.rateDamping,-3,3),
 C.inertia[1]*clamp((-v.steering*R.yawRate-localRate.y)*R.rateDamping,-2,2),
 C.inertia[2]*clamp((rollTarget-v.roll)*R.attitudeGain-localRate.z*R.rateDamping,-3,3));
 desired.multiplyScalar(clamp(total/weight,0,1));
 const apply=(arm:readonly number[],direction:Vector3,thrust:number,reaction=0)=>{
  const f=direction.clone().multiplyScalar(thrust);force.add(f);
  torque.add(new Vector3(arm[0],arm[1],arm[2]).cross(f)).addScaledVector(direction,reaction);
 };
 a.rotorThrusts=[];
 if(a.subtype==='multirotor'){
  // X 构型分配：位置产生滚转/俯仰，交替转向产生偏航反力矩。
  R.quadArms.forEach((arm,n)=>{
   const sign=R.quadDirections[n]!;
   const request=clamp(total/4-desired.x*arm[2]/(4*1.8**2)+desired.z*arm[0]/(4*2.2**2)+desired.y*sign/(4*R.reactionArm),0,weight*R.maxLift/4);
   const old=a.motorThrusts[n]??0;
   const thrust=old+(request-old)*(1-Math.exp(-R.motorRate*h));a.motorThrusts[n]=thrust;
   apply(arm,new Vector3(0,1,0),thrust,sign*thrust*R.reactionArm);a.rotorThrusts.push(thrust);
  });
 }else if(a.subtype==='helicopter'){
  // 主旋翼反扭矩由尾桨抵消；周期变距由桨毂力矩体现，低总距时限制控制权。
  const mainReaction=total*R.reactionArm;
  const tail=clamp((desired.y-mainReaction)/R.tailArm[2],-weight*.25,weight*.25)*a.rotorSpeedFraction;
  apply(R.mainArm,new Vector3(0,1,0),total,mainReaction);
  apply(R.tailArm,new Vector3(1,0,0),tail);
  // 稳态侧推补偿随尾桨负载变化；不把独立速度锁到机头。
  force.x-=tail;
  torque.x=desired.x*a.collective;torque.z=desired.z*a.collective;
  a.rotorThrusts.push(total,tail);
 }else{
  const angle=a.tilt*Math.PI/2,direction=new Vector3(0,Math.cos(angle),Math.sin(angle));
  // 机翼逐步接管升力。朝前的推力来自同一对旋翼，不能叠加一台隐藏发动机。
  const thrust=clamp(total/Math.max(.25,Math.cos(angle))+propulsionThrottle*v.spec.accel*C.mass*Math.sin(angle),0,weight*R.maxLift);
  R.tiltArms.forEach(arm=>{apply(arm,direction,thrust/2);a.rotorThrusts.push(thrust/2);});
  // 简化差动桨距/周期变距产生姿态力矩；巡航舵面由固定翼分支接管。
  torque.copy(desired).multiplyScalar(a.rotorSpeedFraction*(1-wing));
 }
 a.rotorPhases=a.rotorThrusts.map((thrust,n)=>(a.rotorPhases[n]??0)+h*R.rotorSpeed*(a.subtype==='multirotor'?Math.sqrt(Math.max(0,thrust)/(weight/4)):a.rotorSpeedFraction)*(a.subtype==='multirotor'?R.quadDirections[n]!:n===1?-1:1));
 // 旋翼机的平移阻力；纵向阻力保持有限，允许倾转机加速进入过渡。
 force.applyQuaternion(v.rotation);torque.applyQuaternion(v.rotation);
 force.addScaledVector(v.velocity,-C.mass*R.drag*(1-wing));
 a.loadFactor=force.dot(up)/weight;
 return {force,torque,desiredLiftNewtons:desiredLift,totalRotorThrustNewtons:total,transitionFactor:wing};
}
