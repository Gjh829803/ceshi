import {Euler,Quaternion,Vector3} from 'three';
import type {EnvironmentQueries} from './environment/queries';
import type {Input,VehicleState} from './simulation';
export const KAYAK_GEOMETRY={seat:[0,.23,-.35] as [number,number,number],length:4.4,width:.8};
/** SI units: mass kg, volume m³, stiffness 1/s², damping 1/s, period s. */
export const KAYAK_WATER={mass:105,maxDisplacement:.23,waterDensity:1000,draft:.16,depth:.35,heaveDamping:5.5,strokePeriod:1.12};
export const CANOE_GEOMETRY={seat:[0,.45,-.45] as [number,number,number],length:4.8,width:1.2};
export const CANOE_WATER={mass:165,maxDisplacement:.38,waterDensity:1000,draft:.13,depth:.48,heaveDamping:6,strokePeriod:1.55};
export interface KayakState {craft?:'canoe';side?:number;phase:number;effort:number;turn:number;reverse:number;brake:number;yawRate:number;immersion:number;bladeImmersion:number;surface:number|null;buoyancy:number}
export const createKayakState=():KayakState=>({phase:0,effort:0,turn:0,reverse:1,brake:0,yawRate:0,immersion:0,bladeImmersion:0,surface:null,buoyancy:0});
/** One stroke uses one blade. Recovery has no thrust; turning at rest is a sweep stroke. */
export function kayakStroke(k:KayakState){
 const cycle=k.phase%2,t=cycle%1,side=k.craft==='canoe'?(k.side??-1):cycle<1?1:-1;
 const active=t>.2&&t<.8?Math.sin(Math.PI*(t-.2)/.6):0;
 const strength=k.craft==='canoe'?1:Math.max(0,Math.min(1,1-side*k.turn));
 return {side,t,power:active*k.effort*strength,roll:-side*.84*Math.sin(Math.PI*t),sweep:-side*k.reverse*(.48-t*.8)};
}
export function kayakPaddlePose(k:KayakState){
 if(k.craft==='canoe'){
  const {side,t}=kayakStroke(k),recovery=k.brake?0:1-Math.sin(Math.PI*t);
  const direction=new Vector3(side*.65,-(.76-.22*recovery),k.reverse*(.20-t*.4)*k.effort).normalize();
  return {position:new Vector3(side*.04,.98+recovery*.06,-.45),rotation:new Quaternion().setFromUnitVectors(new Vector3(0,-1,0),direction)};
 }
 const stroke=kayakStroke(k),q=new Quaternion().setFromEuler(new Euler(0,k.effort*stroke.sweep,k.effort*stroke.roll,'YXZ'));
 if(k.brake)q.setFromEuler(new Euler(0,0,-.84));
 return {position:new Vector3(0,.53,-.20),rotation:q};
}
export function paddleBlade(k:KayakState,side=kayakStroke(k).side){return k.craft==='canoe'?new Vector3(0,-1.55,0):new Vector3(side*1.05,0,0);}
export function paddleGrip(k:KayakState,side:number){return k.craft==='canoe'?new Vector3(0,side===(k.side??-1)?-.56:0,0):new Vector3(side*.34,0,0);}
export function stepKayak(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries):void {
 const k=v.kayak!,water=v.raft?{...CANOE_WATER,mass:160,maxDisplacement:.55,depth:.50}:k.craft==='canoe'?CANOE_WATER:KAYAK_WATER,s=v.spec,w=q.waterAt(v.position),f=new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw)),right=new Vector3(f.z,0,-f.x);
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
 if(k.craft==='canoe'&&Math.abs(i.steer)>.1&&(k.phase%1<.2||k.effort<.05))k.side=-Math.sign(i.steer);
 if(k.effort>.005)k.phase+=dt/(v.raft&&i.boost?.85:water.strokePeriod);
 let speed=v.velocity.dot(f),lateral=v.velocity.dot(right);
 const stroke=kayakStroke(k),paddle=kayakPaddlePose(k);
 const blade=paddleBlade(k,k.brake?1:stroke.side).applyQuaternion(paddle.rotation).add(paddle.position).applyQuaternion(v.rotation).add(v.position);
 const bladeWater=q.waterAt(blade);
 k.bladeImmersion=bladeWater?Math.max(0,Math.min(1,(bladeWater.surface-blade.y)/.10)):0;
 const pulse=afloat?stroke.power*k.bladeImmersion:0;
 // Opposite input is back-paddling, so it first dissipates forward momentum.
 const direction=Math.abs(i.forward)>.01?Math.sign(i.forward):0;
 speed+=direction*s.accel*pulse*(v.raft&&i.boost?1.2:1)*dt;
 const resistance=k.immersion>0?s.coastDeceleration+Math.abs(speed)*s.dragQuadratic: v.grounded?5:0;
 speed*=Math.exp(-(resistance+(i.brake&&afloat?s.brakeDamping*k.bladeImmersion:0))*dt);
 speed=Math.max(-s.reverseSpeed,Math.min(s.speed,speed));
 lateral*=Math.exp(-(k.immersion>0?s.grip:v.grounded?7:0)*dt);
 const yawImpulse=afloat?(-v.steering*s.steer*pulse+stroke.side*direction*pulse*(v.raft?.035:k.craft==='canoe'?.20:.10)):0;
 k.yawRate=(k.yawRate+yawImpulse*dt)*Math.exp(-(afloat?(k.craft==='canoe'?.85:1.15):v.grounded?8:.1)*dt);
 v.yaw+=k.yawRate*dt;
 v.velocity.x=f.x*speed+right.x*lateral;v.velocity.z=f.z*speed+right.z*lateral;
 v.velocity.y+=(buoyancy-9.81-water.heaveDamping*k.immersion*v.velocity.y)*dt;
 const pitchTarget=afloat?direction*pulse*.025:0,rollTarget=afloat?-stroke.side*pulse*.035-k.yawRate*speed*.018:0;
 v.pitch+=(pitchTarget-v.pitch)*(1-Math.exp(-s.pitchResponse*dt));v.roll+=(rollTarget-v.roll)*(1-Math.exp(-s.rollResponse*dt));
 v.rotation.setFromEuler(new Euler(-v.pitch,v.yaw,v.roll,'YXZ'));v.position.addScaledVector(v.velocity,dt);
 v.speed=Math.hypot(v.velocity.x,v.velocity.z);v.submerged=!!w&&v.position.y<w.surface-.4;
}
