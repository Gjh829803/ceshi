import {Euler,Vector3} from 'three';
import type {Input,VehicleState} from './simulation';
import type {EnvironmentQueries} from './environment/queries';
import {coastSpeed} from './handling';

/** kg, m³, kg/m³, metres and inverse seconds. Shared by keyboard and Episode. */
export const JETSKI_WATER={mass:330,displacement:.70,density:1000,depth:.6,bottom:.30,damping:6};
export interface JetSkiParticle{readonly id:number;readonly foam:boolean;readonly born:number;readonly life:number;readonly position:readonly [number,number,number];readonly velocity:readonly [number,number,number];readonly size:number;readonly yaw:number}
export interface JetSkiState{steeringAngle:number;immersion:number;surface:number|null;buoyancy:number;sprayStrength:number;serial:number;remainder:number;particles:readonly JetSkiParticle[]}
export const createJetSkiState=():JetSkiState=>({steeringAngle:0,immersion:0,surface:null,buoyancy:0,sprayStrength:0,serial:0,remainder:0,particles:[]});
export const copyJetSkiState=(s?:JetSkiState):JetSkiState|undefined=>s?{...s,particles:[...s.particles]}:undefined;
export function jetSkiDiagnostics(s:JetSkiState){return {steeringAngle:s.steeringAngle,immersion:s.immersion,surface:s.surface,buoyancy:s.buoyancy,sprayStrength:s.sprayStrength,sprayCount:s.particles.filter(p=>!p.foam).length,wakeCount:s.particles.filter(p=>p.foam).length};}
export function stepJetSki(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries){
 const k=v.jetski!,s=v.spec,w=q.waterAt(v.position),f=new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw)),right=new Vector3(f.z,0,-f.x);
 let wet=0;for(const x of [-.4,.4])for(const z of [-1,1])if(q.waterAt(v.position.clone().addScaledVector(right,x).addScaledVector(f,z)))wet++;
 k.surface=w?.surface??null;k.immersion=w?Math.max(0,Math.min(1,(w.surface-v.position.y+JETSKI_WATER.bottom)/JETSKI_WATER.depth))*wet/4:0;
 k.buoyancy=9.81*JETSKI_WATER.density*JETSKI_WATER.displacement*k.immersion/JETSKI_WATER.mass;
 const afloat=wet>=2&&k.immersion>.08&&!v.grounded;
 let speed=v.velocity.dot(f),side=v.velocity.dot(right);k.steeringAngle=-v.steering*.42;
 if(afloat){
  if(i.brake||i.forward*speed<0&&Math.abs(speed)>.15){speed=coastSpeed(speed,s.brakeDeceleration,dt);v.throttle=0;}
  else if(Math.abs(i.forward)>.01){v.throttle+=(i.forward-v.throttle)*(1-Math.exp(-s.throttleResponse*dt));speed+=v.throttle*s.accel*(i.boost&&i.forward>0?1.25:1)*dt;}
  else{v.throttle=0;speed=coastSpeed(speed,s.coastDeceleration+speed*speed*.0015,dt);}
  speed=Math.max(-s.reverseSpeed,Math.min(i.boost?s.maxSpeed:s.speed,speed));
  // Jet steering needs thrust or residual water flow. No throttle means reduced authority.
  const authority=Math.min(1,Math.abs(speed)/4)*(.18+.82*Math.abs(v.throttle));
  const yawRate=-v.steering*s.steer*authority*Math.sign(speed)/(1+Math.abs(speed)/24);
  v.yaw+=yawRate*dt;f.set(Math.sin(v.yaw),0,Math.cos(v.yaw));right.set(f.z,0,-f.x);
  v.pitch+=(Math.min(.11,Math.max(0,speed)*.004)-v.pitch)*(1-Math.exp(-s.pitchResponse*dt));
  v.roll+=(Math.max(-.20,Math.min(.20,yawRate*speed*.018))-v.roll)*(1-Math.exp(-s.rollResponse*dt));
 }else{v.throttle=0;v.pitch*=Math.exp(-s.pitchResponse*dt);v.roll*=Math.exp(-s.rollResponse*dt);if(v.grounded)speed=coastSpeed(speed,6,dt);}
 side*=Math.exp(-(k.immersion>0?s.grip:v.grounded?7:0)*dt);
 v.velocity.x=f.x*speed+right.x*side;v.velocity.z=f.z*speed+right.z*side;
 const planing=afloat?Math.min(1.8,Math.abs(speed)*.08):0;
 v.velocity.y+=(k.buoyancy+planing-9.81-JETSKI_WATER.damping*k.immersion*v.velocity.y)*dt;
 v.position.addScaledVector(v.velocity,dt);v.rotation.setFromEuler(new Euler(-v.pitch,v.yaw,v.roll,'YXZ'));
 v.speed=Math.hypot(v.velocity.x,v.velocity.z);v.submerged=!!w&&v.position.y<w.surface-.45;
}
/** Emit after accepted collision motion. Immutable world-space births keep wakes behind the craft. */
export function finishJetSkiStep(v:VehicleState,old:Vector3,dt:number,time:number){
 const k=v.jetski!,distance=Math.hypot(v.position.x-old.x,v.position.z-old.z),speed=distance/dt;
 const strength=k.surface!==null&&k.immersion>.08&&!v.grounded?Math.min(1.6,speed/20)*(1+Math.abs(v.steering)*.45):0;
 k.sprayStrength=strength;const particles=k.particles.filter(p=>time-p.born<p.life);
 if(strength>.025){k.remainder+=dt*(60+strength*520);const count=Math.floor(k.remainder);k.remainder-=count;
  for(let n=0;n<count;n++){
   const id=++k.serial,rand=(salt:number)=>{const x=Math.sin(id*127.1+salt*311.7)*43758.5453;return x-Math.floor(x);};
   const side=id%2?1:-1,foam=id%11===0,back=id%3===0;
   const local=new Vector3(side*(back?.27:.58),0,back?-1.45:.7-rand(1)*.8).applyAxisAngle(new Vector3(0,1,0),v.yaw);
   const p=v.position.clone().add(local);p.y=k.surface!+.035;
   const velocity=new Vector3(side*(foam?.6:1.2+strength*2.8)*( .65+rand(2)*.7),foam?0:1.5+strength*3.8*rand(3),foam?-speed*.08:speed*.68-(back?4:1)).applyAxisAngle(new Vector3(0,1,0),v.yaw);
   particles.push({id,foam,born:time,life:foam?2: .65+rand(4)*.6,position:[p.x,p.y,p.z],velocity:[velocity.x,velocity.y,velocity.z],size:foam?.16+strength*.10:.025+rand(5)*.045*strength,yaw:v.yaw});
  }
 }else k.remainder=0;
 k.particles=particles.slice(-1536);
}
