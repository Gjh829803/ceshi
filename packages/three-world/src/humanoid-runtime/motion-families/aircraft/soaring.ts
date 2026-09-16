import {gliderLandingGear} from './glider-landing-gear';
import {smooth,unit} from './wearable-flight';
import {Euler,Vector3} from 'three';
import {SOARING as C,AIRCRAFT} from '../../../config/aircraft';
import type {VehicleState,Input} from '../../simulation';
import type {EnvironmentQueries} from '../../environment/queries';
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export function airVelocity(q:EnvironmentQueries,p:Vector3){
 const air=q.map.airflow;if(!air)return new Vector3();
 const wind=new Vector3(...air.wind).addScaledVector(new Vector3(...(air.shearPerMeter??[0,0,0])),Math.max(0,p.y));
 for(const t of air.thermals??[]){const d=Math.hypot(p.x-t.center[0],p.z-t.center[2])/t.radius;if(d<1&&p.y>t.center[1])wind.y+=t.updraft*(1-d*d)**2;}
 return wind;
}
/** 同一 Rapier 世界中的无动力气动/热浮力。牵引是限时外力，禁止写入飞行速度。 */
export function stepSoaring(v:VehicleState,i:Input,_dt:number,q:EnvironmentQueries){
 const a=v.motion.aircraft!,kind=a.subtype as 'glider'|'paraglider'|'wingsuit'|'balloon',balloon=kind==='balloon',glider=kind==='glider';
 const mass=C[kind].mass,inertia=new Vector3(...(glider?AIRCRAFT.inertia:balloon?[500,500,500] as const:[65,90,65] as const));
 const boxes=glider?AIRCRAFT.boxes:[{halfExtents:balloon?[.8,.45,.8] as const:[.35,.65,.35] as const,offset:balloon?[0,.45,0] as const:[0,.65,0] as const}];
 const rig=q.vehicleRig(v.spec.id,a,v.position,v.rotation,mass,1,1,2,1,undefined,.6,glider?0:.08,{boxes,...(glider?{stops:AIRCRAFT.wheels.map(w=>({radius:w.radius,center:new Vector3(w.x,w.y+AIRCRAFT.travel,w.z)}))}:{}),inertia,center:glider?new Vector3(...AIRCRAFT.center):new Vector3(0,1,0)}),body=rig.body;
 if(!balloon)rig.colliders.forEach(c=>c.setFriction(.02));
 body.setTranslation(v.position,true);body.setRotation(v.rotation,true);body.setLinvel(v.velocity,true);body.setAngvel(a.angularVelocity,true);
 rig.beforeStep=h=>{
  a.sample={physicsStepSequence:q.physicsStepSequence+1,phase:'pre-integration',deltaSeconds:h};
  const up=new Vector3(0,1,0).applyQuaternion(v.rotation),forward=new Vector3(0,0,1).applyQuaternion(v.rotation),right=new Vector3(1,0,0).applyQuaternion(v.rotation);
  const relative=v.velocity.clone().sub(airVelocity(q,v.position)),speed=relative.length(),force=new Vector3(),torque=new Vector3();
  const oldGround=v.grounded,hit=glider?undefined:q.support(v.position,2,.1);
  v.grounded=glider?gliderLandingGear(v,i,h,q,force,torque):!!hit&&v.position.y-hit.height<.15;
  // 斜坡上原点可能仍离地数十厘米；可穿戴装备以真实向上接触确认承重。
  if(a.wearable&&!v.grounded)v.grounded=q.hasUpwardContact(rig.colliders);
  if(!v.grounded)v.launched=true;
  // Rotation locks stop torque/impulse response, not the angular velocity we
  // explicitly restore above. Discard airborne pitch/roll momentum on support.
  if(a.wearable&&v.grounded){a.angularVelocity.set(0,a.angularVelocity.y,0);body.setAngvel(a.angularVelocity,true);}
  if(!glider&&!balloon)body.setEnabledRotations(!v.grounded,true,!v.grounded,true);
  if(!oldGround&&v.grounded){a.landingSinkMetersPerSecond=Math.max(0,-v.velocity.y);a.hardLanding=a.landingSinkMetersPerSecond>4;v.launched=false;}
  const wear=a.wearable;
  if(wear){
   const floor=q.support(v.position,2000,.1);
   wear.heightMeters=floor?Math.max(0,v.position.y-floor.height):null;
   wear.sinkMetersPerSecond=Math.max(0,-v.velocity.y);
   if(!v.grounded){wear.hadFlight=true;wear.airborneSeconds+=h;wear.landingSeconds=0;}
   else if(wear.hadFlight)wear.landingSeconds+=h;
   if(kind==='wingsuit'&&!v.grounded&&(i.brake||a.canopy>0))a.canopy=Math.min(1,a.canopy+h/C.canopySeconds);
   if(wear.landingSeconds>1)a.canopy=Math.max(0,a.canopy-h);
   wear.phase=v.grounded?(wear.hadFlight?(wear.landingSeconds<2?'landing':'stowed'):(i.forward>0||i.boost)&&!i.slow&&!i.brake?'runup':'ready')
    :kind==='wingsuit'&&a.canopy>0&&a.canopy<1?'deploying':kind==='paraglider'||a.canopy===1?'canopy':wear.airborneSeconds<.65?'leap':'glide';
   wear.spread=(kind==='wingsuit'?1:0)*smooth(wear.airborneSeconds/.65)*(1-smooth((a.canopy-.15)/.65))*(1-smooth(wear.landingSeconds/.7));
   wear.seated=(kind==='paraglider'?smooth(wear.airborneSeconds/.6):smooth((a.canopy-.15)/.65))*(1-smooth(wear.landingSeconds/1));
   wear.lowSpeedAssist=!v.grounded&&kind==='wingsuit'&&a.canopy===0&&speed<13;
  }
  v.steering+=(i.steer-v.steering)*(1-Math.exp(-6*h));
  if(balloon){
   const b=C.balloon,burn=a.fuel>0?Math.max(0,i.lift):0;a.fuel=Math.max(0,a.fuel-burn*h/b.fuelSeconds);v.throttle=burn;
   a.temperatureKelvin=clamp(a.temperatureKelvin+h*(b.heating*burn-b.cooling*(a.temperatureKelvin-b.ambientKelvin)-Math.max(0,-i.lift)*b.ventCooling),b.ambientKelvin,b.maxKelvin);
   const rho=1.225*Math.exp(-Math.max(0,v.position.y)/8500),inside=rho*b.ambientKelvin/a.temperatureKelvin;
   force.y=(rho-inside)*b.volume*9.81;
   force.addScaledVector(relative,-.5*rho*b.dragArea*speed);a.loadFactor=force.y/(mass*9.81);
   // 吊篮悬挂的回正力矩；没有可凭空横向推进的方向舵。
   torque.addScaledVector(right,inertia.x*(v.pitch*3-a.angularVelocity.dot(right)*3));
   torque.addScaledVector(forward,inertia.z*(-v.roll*3-a.angularVelocity.dot(forward)*3));
  }else{

   const base=C[kind],canopy=kind==='wingsuit'?smooth((a.canopy-.15)/.85):0;
   const area=base.area+(C.paraglider.area-base.area)*canopy,cl0=base.cl0+(C.paraglider.cl0-base.cl0)*canopy;
   const alpha=Math.atan2(-relative.dot(up),Math.max(.1,relative.dot(forward)))+base.trim;
   const cl=(cl0+(base.liftSlope+(C.paraglider.liftSlope-base.liftSlope)*canopy)*clamp(alpha,-.3,.35))*(glider?Math.exp(-Math.max(0,Math.abs(alpha)-.35)*4):1);
   const airBrake=i.slow||i.lift<0;
   const dynamic=.5*1.225*speed*speed*area,lift=dynamic*cl*(glider&&airBrake?.6:1);
   const liftAxis=up.clone();if(speed>.01)liftAxis.addScaledVector(relative,-up.dot(relative)/(speed*speed)).normalize();
   force.addScaledVector(liftAxis,lift);
   const drag=dynamic*((!glider?Math.max(0,Math.abs(alpha)-.35)*.35:0)+base.drag+(C.paraglider.drag-base.drag)*canopy+(base.induced+(C.paraglider.induced-base.induced)*canopy)*cl*cl+(airBrake?.12:0));
   if(speed>.01)force.addScaledVector(relative,-Math.min(drag,mass*speed/h)/speed);
   // 地面牵引/助跑后释放。翼装必须从高台离开，不能在平地持续获得推力。
   if(glider&&v.launched&&a.towSeconds>0&&(!(i.boost||i.forward>0)||i.slow||i.brake||i.forward<0||v.position.y>=20||a.towSeconds>=C.towSeconds))a.towReleased=true;
   if(!a.towReleased&&(i.boost||i.forward>0)&&i.forward>=0&&!i.slow&&!i.brake&&!wear?.hadFlight&&a.towSeconds<C.towSeconds&&(!v.launched||glider&&v.position.y<20)){
    force.addScaledVector(forward,mass*C.towAcceleration);a.towSeconds+=h;
   }
   const path=Math.atan2(relative.y,Math.max(1,Math.hypot(relative.x,relative.z)));
   // 侧倾时按实际倾角配平，低空速减小坡度；不凭空补速度或高度。
   const liftSlope=base.liftSlope+(C.paraglider.liftSlope-base.liftSlope)*canopy;
   const trim=clamp((mass*9.81/(Math.max(dynamic,1)*(wear?Math.max(.8,Math.cos(v.roll)):1))-cl0)/liftSlope,-.1,.25)-base.trim;
   const speedTarget=(glider?C.targetSpeed.glider:kind==='paraglider'||canopy>.8?C.targetSpeed.canopy:C.targetSpeed.wingsuit)*(1+i.forward*C.speedDemandRatio);
   // During the finite tow, neutral trim allows W-only takeoff; W never adds thrust after release.
   const towing=glider&&!a.towReleased&&a.towSeconds>0&&a.towSeconds<C.towSeconds&&v.position.y<20;
   const speedTrim=!towing&&Math.abs(i.forward)>.001?clamp((speedTarget-speed)/speedTarget,-1,1)*C.speedTrimRadians:0;
   let pitchTarget=glider?(v.grounded?-i.pitch*.27:clamp(path+trim-i.pitch*.24-speedTrim,-.6,.5)):clamp((kind==='paraglider'||canopy>.8?-.12:path+trim)-i.pitch*.24-speedTrim,-.35,.25),rollTarget=v.grounded?0:v.steering*.55+i.roll*.2;
   if(wear){
    const underCanopy=kind==='paraglider'||canopy>.8;
    const canopyTrim=-.12+Math.min(.08,Math.max(0,1/Math.max(.8,Math.cos(v.roll))-1)*.3);
    pitchTarget=clamp((kind==='paraglider'?canopyTrim:(path+trim)*(1-canopy)+canopyTrim*canopy)-i.pitch*.24-speedTrim,-.35,.25);
    rollTarget=v.grounded?0:(v.steering*.48+i.roll*.15)*(.45+.55*unit(speed/(underCanopy?8:16)));
    if(wear.lowSpeedAssist)pitchTarget=Math.min(pitchTarget,-.12-.12*unit((13-speed)/8));
    if(!v.grounded&&underCanopy&&i.brake){
     // 刹车增加迎角与阻力，低速时退出抬头，避免无限悬停。
     pitchTarget+=.12*unit((speed-4)/4);
     force.addScaledVector(relative,-mass*.4);
    }
   }
   const authority=clamp(speed/(glider?20:7),0,1),yawRate=v.grounded?0:-9.81*Math.tan(v.roll)/Math.max(speed,6);
   torque.addScaledVector(right,inertia.x*clamp((v.pitch-pitchTarget)*8-a.angularVelocity.dot(right)*4,-3,3)*authority);
   torque.addScaledVector(forward,inertia.z*clamp((rollTarget-v.roll)*10-a.angularVelocity.dot(forward)*5,-3,3)*authority);
   torque.addScaledVector(up,inertia.y*(yawRate-a.angularVelocity.dot(up))*3*authority);
   v.throttle=0;a.angleOfAttackRadians=alpha;a.loadFactor=lift/(mass*9.81);a.stalled=speed>4&&Math.abs(alpha)>.35;
  }
  if(v.grounded&&i.forward<0)force.addScaledVector(v.velocity,-mass*5);
  if(v.grounded&&!glider){force.addScaledVector(v.velocity,-mass*(i.slow||i.brake?5:wear&&wear.hadFlight?5:wear&&(i.boost||i.forward>0)?.08:1));torque.addScaledVector(a.angularVelocity,-mass);}
  body.resetForces(false);body.resetTorques(false);body.addForce(force,true);body.addTorque(torque,true);a.airspeedMetersPerSecond=speed;
 };
 rig.afterStep=()=>{const p=body.translation(),r=body.rotation(),vel=body.linvel(),w=body.angvel();v.position.set(p.x,p.y,p.z);v.rotation.set(r.x,r.y,r.z,r.w).normalize();v.velocity.set(vel.x,vel.y,vel.z);a.angularVelocity.set(w.x,w.y,w.z);const e=new Euler().setFromQuaternion(v.rotation,'YXZ');v.pitch=-e.x;v.yaw=e.y;v.roll=e.z;v.speed=v.velocity.length();};
}
