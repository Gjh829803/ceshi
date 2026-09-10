import { Euler,Vector3 } from 'three';
import type { EnvironmentQueries } from '../../environment/queries';
import type { Input,VehicleState } from '../../simulation';
/** kg, m³, kg/m³, metres and inverse seconds. Full ballast gives neutral buoyancy. */
export const SUBMERSIBLE_WATER={dryMass:720,displacement:2.4,density:1000,height:2.2,bottom:.78,ballastResponse:1.5,heaveDamping:2.6};
export interface SubParticle {id:number;born:number;life:number;bubble:boolean;position:readonly[number,number,number];velocity:readonly[number,number,number];size:number;surface:number}
export interface SubmersibleState {ballast:number;diving:boolean;immersion:number;surface:number|null;buoyancy:number;mass:number;depth:number;rotorPhase:number;power:number;serial:number;remainder:number;particles:readonly SubParticle[]}
export const createSubmersibleState=():SubmersibleState=>({ballast:0,diving:false,immersion:0,surface:null,buoyancy:0,mass:720,depth:0,rotorPhase:0,power:0,serial:0,remainder:0,particles:[]});
export const copySubmersibleState=(s?:SubmersibleState):SubmersibleState|undefined=>s?{...s,particles:[...s.particles]}:undefined;
export function submersibleDiagnostics(s:SubmersibleState){const {particles,...state}=s;return {...state,bubbleCount:particles.filter(p=>p.bubble).length,splashCount:particles.filter(p=>!p.bubble).length};}
export function stepSubmersible(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries){
 const k=v.motion.submersible!,s=v.spec,w=q.waterAt(v.position),p=SUBMERSIBLE_WATER;
 k.surface=w?.surface??null;k.depth=w?Math.max(0,w.surface-v.position.y):0;
 let wet=0;for(const x of [-.7,.7])for(const z of [-.7,.7])if(q.waterAt(new Vector3(x,0,z).applyQuaternion(v.rotation).add(v.position)))wet++;
 k.immersion=w?Math.max(0,Math.min(1,(w.surface-v.position.y+p.bottom)/p.height))*wet/4:0;
 if(i.lift<-.01&&wet>=2)k.diving=true;
 if(i.lift>.01&&k.depth<.5)k.diving=false;
 k.ballast+=((k.diving?1:0)-k.ballast)*(1-Math.exp(-p.ballastResponse*dt));
 k.mass=p.dryMass+(p.displacement*p.density-p.dryMass)*k.ballast;
 k.buoyancy=9.81*p.displacement*p.density*k.immersion/k.mass;
 const wetDrive=k.immersion>.08&&wet>=2;
 const f=new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw)),r=new Vector3(f.z,0,-f.x);
 let speed=v.velocity.dot(f),side=v.velocity.dot(r);
 v.throttle+=((wetDrive?i.forward:0)-v.throttle)*(1-Math.exp(-s.throttleResponse*dt));
 speed+=v.throttle*s.accel*dt;
 speed*=Math.exp(-(wetDrive?(Math.abs(i.forward)<.01?s.linearDamping:s.drag)+Math.abs(speed)*s.dragQuadratic:v.grounded?5:0)*dt);
 side*=Math.exp(-(wetDrive?s.grip:v.grounded?7:0)*dt);
 if(i.boost){speed*=Math.exp(-s.brakeDamping*dt);side*=Math.exp(-s.brakeDamping*dt);}
 speed=Math.max(-s.reverseSpeed,Math.min(s.speed,speed));
 v.yaw-=wetDrive?v.steering*s.steer*dt:0;
 // Vertical thrusters work from rest; releasing controls leaves buoyancy and drag.
 const lift=wetDrive&&(i.lift<0||k.depth>.15)?i.lift*s.verticalAcceleration:0;
 v.velocity.set(f.x*speed+r.x*side,v.velocity.y+(k.buoyancy-9.81+lift-s.verticalDamping*k.immersion*v.velocity.y)*dt,f.z*speed+r.z*side);
 if(i.boost)v.velocity.y*=Math.exp(-s.brakeDamping*dt);
 v.pitch+=((wetDrive?i.lift*.10:0)-v.pitch)*(1-Math.exp(-s.pitchResponse*dt));
 v.roll+=((wetDrive?i.roll*.25:0)-v.roll)*(1-Math.exp(-s.rollResponse*dt));
 v.rotation.setFromEuler(new Euler(-v.pitch,v.yaw,v.roll,'YXZ'));v.position.addScaledVector(v.velocity,dt);
 v.speed=v.velocity.length();v.submerged=!!w&&v.position.y<w.surface-.65;
 k.power=wetDrive?Math.min(1,Math.abs(v.throttle)+Math.abs(i.lift)*.7+Math.abs(v.steering)*.35):0;
 k.rotorPhase+=k.power*28*dt;
}
/** Births are in world space, emitted once per accepted fixed tick. */
export function finishSubmersibleStep(v:VehicleState,dt:number,time:number){
 const k=v.motion.submersible!,particles=k.particles.filter(p=>time-p.born<p.life);
 if(k.surface!==null&&k.power>.02){k.remainder+=dt*k.power*90;const count=Math.floor(k.remainder);k.remainder-=count;
  for(let n=0;n<count;n++){
   const id=++k.serial,rand=(salt:number)=>{const x=Math.sin(id*127.1+salt*311.7)*43758.5453;return x-Math.floor(x);};
   const point=new Vector3(id%2?1.23:-1.23,-.15,-.90).applyQuaternion(v.rotation).add(v.position),bubble=point.y<k.surface-.5;
   if(!bubble)point.y=k.surface+.025;
   const velocity=new Vector3((rand(1)-.5)*1.1,bubble?.5+rand(2)*.6:1+rand(2)*2,-1.2-k.power*1.5).applyAxisAngle(new Vector3(0,1,0),v.yaw);
   particles.push({id,born:time,life:bubble?2.2:.8,bubble,position:[point.x,point.y,point.z],velocity:[velocity.x,velocity.y,velocity.z],size:.025+rand(3)*.045,surface:k.surface});
  }
 }else k.remainder=0;
 k.particles=particles.slice(-384);
}
