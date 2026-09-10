import { Euler,Vector3 } from 'three';
import { AIRCRAFT as C } from '../../../config/aircraft';
import type { EnvironmentQueries } from '../../environment/queries';
import type { Input,VehicleState } from '../../simulation';
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export interface AircraftState {
 angularVelocity:Vector3;airspeedMetersPerSecond:number;angleOfAttackRadians:number;loadFactor:number;
 stalled:boolean;landingSinkMetersPerSecond:number;hardLanding:boolean;
 wheels:{contact:boolean;compression:number;load:number;angle:number;steer:number}[];
}
export function createAircraftState():AircraftState{return {angularVelocity:new Vector3(),airspeedMetersPerSecond:0,angleOfAttackRadians:0,loadFactor:0,stalled:false,landingSinkMetersPerSecond:0,hardLanding:false,wheels:C.wheels.map(()=>({contact:false,compression:0,load:0,angle:0,steer:0}))};}
/** 飞机只提交力和力矩；由既有 Rapier 世界的固定子步积分六自由度运动。 */
export function stepAircraft(v:VehicleState,input:Input,dt:number,q:EnvironmentQueries){
 if(dt<=0)return;const a=v.motion.aircraft!;
 const rig=q.vehicleRig(v.spec.id,a,v.position,v.rotation,C.mass,4,3.35,2.3,C.center[1],undefined,.6,.08,{boxes:C.boxes,stops:C.wheels.map(w=>({radius:w.radius,center:new Vector3(w.x,w.y+C.travel,w.z)})),inertia:new Vector3(...C.inertia),center:new Vector3(...C.center)}),body=rig.body;
 body.setTranslation(v.position,true);body.setRotation(v.rotation,true);body.setLinvel(v.velocity,true);body.setAngvel(a.angularVelocity,true);body.setAngularDamping(.1);
 rig.beforeStep=h=>{
  const forward=new Vector3(0,0,1).applyQuaternion(v.rotation),up=new Vector3(0,1,0).applyQuaternion(v.rotation),right=new Vector3(1,0,0).applyQuaternion(v.rotation);
  const com=new Vector3(...C.center).applyQuaternion(v.rotation).add(v.position),force=new Vector3(),torque=new Vector3();
  const speed=v.velocity.length(),along=v.velocity.dot(forward),qS=.5*C.density*speed*speed*C.area;
  const alpha=Math.atan2(-v.velocity.dot(up),Math.max(.1,along))+.045;
  const cl=(.25+4.7*clamp(alpha,-.25,.25))*Math.exp(-Math.max(0,Math.abs(alpha)-.25)*5);
  const lift=qS*cl,drag=qS*(.023+.055*cl*cl)+C.mass*(v.spec.drag+speed*speed*v.spec.dragQuadratic+Math.max(0,speed-v.spec.speed)*1.5);
  const liftAxis=up.clone();if(speed>.1)liftAxis.addScaledVector(v.velocity,-up.dot(v.velocity)/(speed*speed)).normalize();
  v.throttle=clamp(v.throttle+(Number(input.boost)-Number(input.slow))*v.spec.throttleResponse*h,0,1);
  v.steering+=(input.steer-v.steering)*(1-Math.exp(-(v.grounded?(input.steer?v.spec.steeringResponse:v.spec.steeringReturn):C.turnResponse)*h));
  force.addScaledVector(forward,v.throttle*v.spec.accel*C.mass).addScaledVector(liftAxis,lift);
  if(speed>.01)force.addScaledVector(v.velocity,-Math.min(drag,C.mass*speed/h)/speed);
  // 侧滑阻尼保留独立速度；不会将速度向量直接覆盖为机头方向。
  force.addScaledVector(right,-v.velocity.dot(right)*qS*.035);
  const previousGround=v.grounded;let contacts=0;
  C.wheels.forEach((wheel,n)=>{
   const state=a.wheels[n]!,hub=new Vector3(wheel.x,wheel.y,wheel.z),origin=hub.clone().add(new Vector3(0,C.travel,0)).applyQuaternion(v.rotation).add(v.position);
   const hit=q.raycast(origin,up.clone().negate(),wheel.radius+2*C.travel);
   state.contact=!!hit&&hit.normal.dot(up)>.35;state.load=0;state.compression=0;state.steer=wheel.steering?-v.steering*.38:0;
   if(!state.contact)return;contacts++;
   const point=origin.clone().addScaledVector(up,-hit!.distance),arm=point.clone().sub(com),pointVelocity=a.angularVelocity.clone().cross(arm).add(v.velocity);
   state.compression=clamp(wheel.radius+C.travel-hit!.distance,-C.travel,C.travel);
   state.load=clamp(C.mass*9.81*wheel.share+C.spring*state.compression-C.damping*pointVelocity.dot(hit!.normal),0,C.mass*9.81*2);
   const support=hit!.normal.clone().multiplyScalar(state.load);force.add(support);torque.add(arm.clone().cross(support));
   const tangent=new Vector3(Math.sin(state.steer),0,Math.cos(state.steer)).applyQuaternion(v.rotation);tangent.addScaledVector(hit!.normal,-tangent.dot(hit!.normal)).normalize();
   const side=hit!.normal.clone().cross(tangent),long=pointVelocity.dot(tangent),lateral=pointVelocity.dot(side);
   const brake=input.brake||input.slow;const fx=-Math.sign(long)*Math.min(Math.abs(long)*C.mass*wheel.share/h,state.load*(brake?.65:.018));
   const fy=-lateral*C.mass*wheel.share*8,friction=tangent.multiplyScalar(fx).addScaledVector(side,fy);friction.clampLength(0,state.load*.8);
   force.add(friction);torque.add(arm.cross(friction));state.angle+=long/wheel.radius*h;
  });
  v.grounded=contacts>0;
  if(!previousGround&&v.grounded){a.landingSinkMetersPerSecond=Math.max(0,-v.velocity.y);a.hardLanding=a.landingSinkMetersPerSecond>4;}
  // 简化增稳飞控通过有界力矩请求目标姿态，低空速舵效减弱；不写姿态四元数。
  const authority=clamp(qS/(C.mass*9.81),0,1.5);
  // A/D 请求航迹转弯角速度，随空速计算所需侧倾；低速限制侧倾以保留升力余量。
  const bankLimit=C.maxBank*clamp(speed/30,.35,1);
  const rollTarget=v.grounded?0:clamp(Math.atan(v.steering*C.turnRate*speed/9.81)+input.roll*.25,-bankLimit,bankLimit);
  // 由实际侧倾补偿垂直升力损失；手动俯仰时淡出垂直速度反馈，避免与升降指令对抗。
  const verticalAcceleration=-v.velocity.y*C.verticalResponse*(1-Math.min(1,Math.abs(input.forward)*2));
  const requiredLift=C.mass*clamp(9.81+verticalAcceleration,3,20)/Math.max(.5,up.y);
  const trim=clamp((requiredLift/Math.max(qS,1)-.25)/4.7,-.03,.23)-.045;
  const flightPath=Math.atan2(v.velocity.y,Math.max(1,Math.hypot(v.velocity.x,v.velocity.z)));
  const pitchTarget=v.grounded?-input.forward*.27:clamp(flightPath+trim-input.forward*.27,-.5,.6);
  const rateX=a.angularVelocity.dot(right),rateY=a.angularVelocity.dot(up),rateZ=a.angularVelocity.dot(forward);
  const yawRate=v.grounded?0:-9.81*Math.tan(v.roll)/Math.max(speed,16);
  torque.addScaledVector(right,C.inertia[0]*clamp((v.pitch-pitchTarget)*9-(rateX-yawRate*right.y)*5,-3,3)*authority);
  torque.addScaledVector(forward,C.inertia[2]*clamp((rollTarget-v.roll)*14-(rateZ-yawRate*forward.y)*6,-4,4)*authority);
  if(!v.grounded)torque.addScaledVector(up,C.inertia[1]*(yawRate*up.y-rateY)*4*authority);
  body.resetForces(false);body.resetTorques(false);body.addForce(force,true);body.addTorque(torque,true);
  a.airspeedMetersPerSecond=speed;a.angleOfAttackRadians=alpha;a.loadFactor=lift/(C.mass*9.81);a.stalled=speed>8&&Math.abs(alpha)>.25;
 };
 rig.afterStep=()=>{const p=body.translation(),r=body.rotation(),vel=body.linvel(),omega=body.angvel();v.position.set(p.x,p.y,p.z);v.rotation.set(r.x,r.y,r.z,r.w);v.velocity.set(vel.x,vel.y,vel.z);a.angularVelocity.set(omega.x,omega.y,omega.z);const e=new Euler().setFromQuaternion(v.rotation,'YXZ');v.pitch=-e.x;v.yaw=e.y;v.roll=e.z;v.speed=v.velocity.length();};
}
