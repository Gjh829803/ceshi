import { Euler,Quaternion,Vector3 } from 'three';
import type { EnvironmentQueries,QueryBody } from '../../environment/queries';
import type { Input,VehicleState } from '../../simulation';
export const KAYAK_GEOMETRY={seat:[0,.23,-.35] as [number,number,number],length:4.4,width:.8};
/** SI units: mass kg, volume m³, stiffness 1/s², damping 1/s, period s. */
export const KAYAK_WATER={mass:105,maxDisplacement:.23,waterDensity:1000,draft:.16,depth:.35,heaveDamping:5.5,strokePeriod:1.12};
export const CANOE_GEOMETRY={seat:[0,.45,-.45] as [number,number,number],length:4.8,width:1.2};
export const CANOE_WATER={mass:165,maxDisplacement:.38,waterDensity:1000,draft:.13,depth:.48,heaveDamping:6,strokePeriod:1.55};
/** Source101 seated torso/head and forward-held arms, relative to the pelvis (metres).
 * Attached to the occupied boat's rigid body; it never owns a second body. */
export function paddleRiderBody(seat:readonly [number,number,number]):QueryBody {
 return {kind:'capsule',radius:.5,height:1.15,offset:[seat[0],seat[1]+.45,seat[2]+.2]};
}
export interface KayakState {riderMounted?:boolean;blocked?:boolean;bladeLength?:number;sideBlend?:number|undefined;craft?:'canoe';side?:number;phase:number;effort:number;turn:number;reverse:number;brake:number;yawRate:number;immersion:number;bladeImmersion:number;surface:number|null;buoyancy:number}
export const createKayakState=():KayakState=>({phase:0,effort:0,turn:0,reverse:1,brake:0,yawRate:0,immersion:0,bladeImmersion:0,surface:null,buoyancy:0});
/** One stroke uses one blade. Recovery has no thrust; turning at rest is a sweep stroke. */
export function kayakStroke(k:KayakState){
 const cycle=k.phase%2,t=cycle%1,side=k.side??(k.craft==='canoe'?-1:cycle<1?1:-1);
 const active=t>.2&&t<.8?Math.sin(Math.PI*(t-.2)/.6):0;
 const strength=k.craft==='canoe'?1:Math.max(0,Math.min(1,1-side*k.turn));
 return {side,t,power:active*k.effort*strength,roll:-side*.84*Math.sin(Math.PI*t),sweep:-side*k.reverse*(.48-t*.8)};
}
export function kayakPaddlePose(k:KayakState){
 if(k.craft==='canoe'){
  const stroke=kayakStroke(k),side=k.sideBlend??stroke.side,t=stroke.t,recovery=k.brake?0:1-Math.sin(Math.PI*t);
  const direction=new Vector3(side*.65,-(.76-.22*recovery),k.reverse*(.20-t*.4)*k.effort).normalize();
  return {position:new Vector3(side*.04,.98+recovery*.06,-.45),rotation:new Quaternion().setFromUnitVectors(new Vector3(0,-1,0),direction)};
 }
 const stroke=kayakStroke(k),q=new Quaternion().setFromEuler(new Euler(0,k.effort*stroke.sweep,k.effort*stroke.roll,'YXZ'));
 if(k.brake)q.setFromEuler(new Euler(0,0,-.84));
 return {position:new Vector3(0,.53,-.20),rotation:q};
}
export function paddleBlade(k:KayakState,side=kayakStroke(k).side){return k.craft==='canoe'?new Vector3(0,-(k.bladeLength??1.55),0):new Vector3(side*1.05,0,0);}
export function paddleGrip(k:KayakState,side:number){return k.craft==='canoe'?new Vector3(0,-.28*(1+side*(k.sideBlend??k.side??-1)),0):new Vector3(side*.34,0,0);}
/** 单桨直划的收尾回正抵消大部分侧置力矩；明确转向时渐变到完整扫桨力矩。 */
export function paddleYawAcceleration(v:VehicleState,moment:number,inertia:number,pulse:number,direction:number):number {
 // 人物面向船头 +Z：左侧为 +X，右侧为 -X；A(-1) 对应正偏航，D(+1) 对应负偏航。
 // 两种小舟采用同侧划桨同侧转弯的操控辅助；倒划时转向键仍选择同一身体侧。
 const turnDirection=!v.motion.raft&&Math.abs(v.steering)>.1?v.motion.kayak!.reverse:1;
 const limit=v.spec.steer*pulse,sweep=Math.max(-limit,Math.min(limit,(v.motion.raft?1:-1)*moment/inertia*turnDirection));
 if(!direction)return sweep;
 const side=kayakStroke(v.motion.kayak!).side,straight=side*direction*pulse*(v.motion.raft?-.035:v.motion.kayak!.craft==='canoe'?.20:.10);
 const target=straight-v.steering*limit*2;
 // 回正桨段只抵消已有侧置力矩；错误桨侧不得凭空产生相反的转矩。
 return sweep===0?0:sweep*Math.max(0,Math.min(1,target/sweep));
}
/** 同一划桨小类的动态刚体与控制器路径共享行程及岸边收桨，采样不推进时间。 */
export function advancePaddleStroke(v:VehicleState,i:Input,h:number,q:EnvironmentQueries,period:number){
 const k=v.motion.kayak!;
 const before={...k},t=k.phase%1;
 if(k.craft==='canoe'){
  if(Math.abs(i.steer)>.1&&(t<.2||t>.8||k.effort<.05))k.side=v.motion.raft?Math.sign(i.steer)*k.reverse:-Math.sign(i.steer);
  k.sideBlend??=before.side??-1;
  k.sideBlend+=((k.side??-1)-k.sideBlend)*(1-Math.exp(-12*h));
 }else if(t<.2||t>.8||k.effort<.05){
  // 转向时只在指定身体侧重复划桨；松开后恢复双侧交替，换侧在回桨段完成。
  if(Math.abs(i.steer)>.1)k.side=-Math.sign(i.steer);else delete k.side;
 }
 const switching=k.craft==='canoe'&&Math.abs((k.side??-1)-k.sideBlend!)>.05;
 if(k.effort>.005&&!switching)k.phase+= (k.blocked?-1:1)*h/period;
 if(k.phase<Math.floor(before.phase)+.015&&k.blocked){k.phase=Math.floor(before.phase);k.blocked=false;}
 const bladeWorld=(state:typeof k)=>{const p=kayakPaddlePose(state);return paddleBlade(state,state.brake&&state.craft!=='canoe'?1:kayakStroke(state).side).applyQuaternion(p.rotation).add(p.position).applyQuaternion(v.rotation).add(v.position);};
 const from=bladeWorld(before),to=bladeWorld(k);
 const filter={excludedActorIds:new Set([v.spec.id])};
 // 桨叶在水中可自由运动，接触实体岸壁时停止这一推进行程并沿来路收桨。
 const body={kind:'capsule' as const,radius:.07,height:.14,offset:[0,0,0] as const},rotation=new Quaternion();
 if(!before.blocked&&q.bodyPathBlocked([{position:from,rotation,body},{position:to,rotation,body}],filter)){
  k.phase=before.phase;k.sideBlend=before.sideBlend;k.blocked=true;
 }
 return {blade:bladeWorld(k),switching};
}
export function stepKayak(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries):void {
 const k=v.motion.kayak!,water=v.motion.raft?{...CANOE_WATER,mass:160,maxDisplacement:.55,depth:.50}:k.craft==='canoe'?CANOE_WATER:KAYAK_WATER,s=v.spec,w=q.waterAt(v.position),f=new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw)),right=new Vector3(f.z,0,-f.x);
 // Four buoyancy samples prevent a long, narrow hull receiving full lift at a bank.
 let wet=0;for(const x of [-s.envelope.halfExtents[0]*.65,s.envelope.halfExtents[0]*.65])for(const z of [-1.35,1.35]){
  const p=v.position.clone().addScaledVector(right,x).addScaledVector(f,z);if(q.waterAt(p))wet++;
 }
 k.surface=w?.surface??null;
 const immersion=w?Math.max(0,Math.min(1,(w.surface-v.position.y+(k.craft==='canoe'?.32:.23))/water.depth)):0;
 k.immersion=immersion*wet/4;
 const buoyancy=9.81*water.waterDensity*water.maxDisplacement*k.immersion/water.mass;
 k.buoyancy=buoyancy;
 const afloat=wet>=2&&immersion>.04&&!v.grounded;
 const effort=afloat&&!i.brake?Math.max(Math.abs(i.forward),Math.abs(i.steer)):0;
 k.effort+=(effort-k.effort)*(1-Math.exp(-7*dt));k.turn=v.steering;k.brake=i.brake?1:0;
 if(Math.abs(i.forward)>.01)k.reverse=Math.sign(i.forward);
 const {blade,switching}=advancePaddleStroke(v,i,dt,q,v.motion.raft&&i.boost?.85:water.strokePeriod);
 let speed=v.velocity.dot(f),lateral=v.velocity.dot(right);
 const stroke=kayakStroke(k);
 const bladeWater=q.waterAt(blade);
 k.bladeImmersion=bladeWater?Math.max(0,Math.min(1,(bladeWater.surface-blade.y)/.10)):0;
 const pulse=afloat&&!k.blocked&&!switching?stroke.power*k.bladeImmersion:0;
 // Opposite input is back-paddling, so it first dissipates forward momentum.
 const direction=Math.abs(i.forward)>.01?Math.sign(i.forward):0;
 speed+=direction*s.accel*pulse*(v.motion.raft&&i.boost?1.2:1)*dt;
 const resistance=k.immersion>0?s.coastDeceleration+Math.abs(speed)*s.dragQuadratic: v.grounded?5:0;
 speed*=Math.exp(-(resistance+(i.brake&&afloat?s.brakeDamping*k.bladeImmersion:0))*dt);
 speed=Math.max(-s.reverseSpeed,Math.min(s.speed,speed));
 lateral*=Math.exp(-(k.immersion>0?s.grip:v.grounded?7:0)*dt);
 const yawInertia=water.mass*(4*s.envelope.halfExtents[0]**2+4*s.envelope.halfExtents[2]**2)/12;
 const moment=blade.clone().sub(v.position).cross(f.clone().multiplyScalar(water.mass*s.accel*pulse*(direction||k.reverse))).y;
 const yawImpulse=afloat?paddleYawAcceleration(v,moment,yawInertia,pulse,direction):0;
 k.yawRate=(k.yawRate+yawImpulse*dt)*Math.exp(-(afloat?(k.craft==='canoe'?.85:1.15):v.grounded?8:.1)*dt);
 v.yaw+=k.yawRate*dt;
 v.velocity.x=f.x*speed+right.x*lateral;v.velocity.z=f.z*speed+right.z*lateral;
 v.velocity.y+=(buoyancy-9.81-water.heaveDamping*k.immersion*v.velocity.y)*dt;
 const pitchTarget=afloat?direction*pulse*.025:0,rollTarget=afloat?-stroke.side*pulse*.035-k.yawRate*speed*.018:0;
 v.pitch+=(pitchTarget-v.pitch)*(1-Math.exp(-s.pitchResponse*dt));v.roll+=(rollTarget-v.roll)*(1-Math.exp(-s.rollResponse*dt));
 v.rotation.setFromEuler(new Euler(-v.pitch,v.yaw,v.roll,'YXZ'));v.position.addScaledVector(v.velocity,dt);
 v.speed=Math.hypot(v.velocity.x,v.velocity.z);v.submerged=!!w&&v.position.y<w.surface-.4;
}
