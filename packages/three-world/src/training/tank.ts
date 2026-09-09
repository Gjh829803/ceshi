import {Euler,Quaternion,Vector3} from 'three';
import type {Input,VehicleState} from './simulation';
import type {EnvironmentQueries,QueryBody} from './environment/queries';
import {vehicleBody} from './environment/queries';
import {coastSpeed} from './handling';

export interface TankState {turretYaw:number;gunElevation:number;leftTravel:number;rightTravel:number;articulationBlocked:boolean}
export const TANK_GEOMETRY={trackHalfSpacing:2.32,trackRadius:.72,trackStraightLength:6.8,turretY:2.9,turretZ:-1.2,gunY:.35,gunZ:1.35,barrelLength:5};
export const TANK_CONTROLS={turretRadiansPerSecond:.65,gunRadiansPerSecond:.25,minimumGunRadians:-.06,maximumGunRadians:.42};
export const createTankState=():TankState=>({turretYaw:0,gunElevation:0,leftTravel:0,rightTravel:0,articulationBlocked:false});

/** Additional barrel envelope; protects the independently rotating overhang. */
export function tankBarrel(v:Pick<VehicleState,'position'|'rotation'|'tank'>):{position:Vector3;rotation:Quaternion;body:QueryBody}{
  const t=v.tank!,g=TANK_GEOMETRY,yaw=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),t.turretYaw);
  return {position:new Vector3(0,g.turretY,g.turretZ).add(new Vector3(0,g.gunY,g.gunZ).applyQuaternion(yaw)).applyQuaternion(v.rotation).add(v.position),
    rotation:v.rotation.clone().multiply(yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-t.gunElevation)),
    body:{kind:'box',halfExtents:[.2,.2,g.barrelLength/2],offset:[0,0,g.barrelLength/2]}};
}

/** Heavy tracked drive. No input applies engine braking; service brake holds a grade.
 * A/D counter-rotate the tracks at rest. Q/E and pitch are independent articulation.
 */
export function stepTank(v:VehicleState,i:Input,dt:number,q:EnvironmentQueries):void {
  const s=v.spec,t=v.tank!,g=TANK_CONTROLS;
  const f=new Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw));
  const water=q.waterAt(v.position),supported=q.support(v.position,2,.45);
  const drive=v.grounded&&!(water&&v.position.y<water.surface);
  let speed=v.velocity.dot(f);
  const opposite=i.forward*speed<0&&Math.abs(speed)>.08;
  if(drive){
    if(i.brake||opposite){speed=coastSpeed(speed,s.brakeDeceleration,dt);v.throttle=0;}
    else if(Math.abs(i.forward)>.01){
      v.throttle+=(i.forward-v.throttle)*(1-Math.exp(-s.throttleResponse*dt));
      speed+=v.throttle*s.accel*(i.boost&&i.forward>0?1.35:1)*dt;
    }else{v.throttle=0;speed=coastSpeed(speed,s.coastDeceleration,dt);}
    if(supported&&!i.brake&&Math.abs(i.forward)>.01){const n=supported.normal;speed+=9.81*n.y*(n.x*f.x+n.z*f.z)*dt;}
    speed=Math.max(-s.reverseSpeed,Math.min(i.boost?s.maxSpeed:s.speed,speed));
    v.yaw-=i.brake?0:v.steering*s.steer/(1+Math.abs(speed)/14)*dt;
    f.set(Math.sin(v.yaw),0,Math.cos(v.yaw));v.velocity.x=f.x*speed;v.velocity.z=f.z*speed;
    if(supported){const n=supported.normal;
      v.pitch+=(Math.atan2(-(n.x*f.x+n.z*f.z),n.y)-v.pitch)*(1-Math.exp(-s.pitchResponse*dt));
      v.roll+=(Math.atan2(n.x*f.z-n.z*f.x,n.y)-v.roll)*(1-Math.exp(-s.rollResponse*dt));}
  }
  t.turretYaw-=i.roll*g.turretRadiansPerSecond*dt;
  t.gunElevation=Math.max(g.minimumGunRadians,Math.min(g.maximumGunRadians,t.gunElevation-i.pitch*g.gunRadiansPerSecond*dt));
  if(water&&v.position.y<water.surface){v.velocity.x*=Math.exp(-4*dt);v.velocity.z*=Math.exp(-4*dt);}
  v.velocity.y-=9.81*dt;v.position.addScaledVector(v.velocity,dt);
  v.rotation.setFromEuler(new Euler(-v.pitch,v.yaw,v.roll,'YXZ'));v.speed=Math.hypot(v.velocity.x,v.velocity.z);v.submerged=!!water&&v.position.y<water.surface;
}

/** Sweeps both rotation and translation. A blocked barrel cancels that fixed step,
 * rather than letting a thin wall pass between old/new turret orientations.
 */
export function finishTankStep(v:VehicleState,previous:VehicleState,q:EnvironmentQueries):void {
  const t=v.tank!,a=previous.tank!,delta=v.position.clone().sub(previous.position);
  const yaw=Math.atan2(Math.sin(v.yaw-previous.yaw),Math.cos(v.yaw-previous.yaw));
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(yaw),Math.abs(t.turretYaw-a.turretYaw),Math.abs(t.gunElevation-a.gunElevation))/.015));
  let blocked=false;
  for(let n=1;n<=steps;n++){
    const alpha=n/steps,pose={position:previous.position.clone().lerp(v.position,alpha),rotation:previous.rotation.clone().slerp(v.rotation,alpha),tank:{...t,turretYaw:a.turretYaw+(t.turretYaw-a.turretYaw)*alpha,gunElevation:a.gunElevation+(t.gunElevation-a.gunElevation)*alpha}};
    const barrel=tankBarrel(pose),prior=tankBarrel({position:previous.position.clone().lerp(v.position,(n-1)/steps),rotation:pose.rotation,tank:pose.tank});
    const sweep=q.move(prior.position,barrel.position.clone().sub(prior.position),barrel.body,barrel.rotation);
    if(q.overlaps(pose.position,vehicleBody(v.spec),pose.rotation)||q.overlaps(barrel.position,barrel.body,barrel.rotation)||sweep.position.distanceTo(barrel.position)>.01){blocked=true;break;}
  }
  t.articulationBlocked=blocked;
  if(blocked){v.position.copy(previous.position);v.rotation.copy(previous.rotation);v.yaw=previous.yaw;v.pitch=previous.pitch;v.roll=previous.roll;v.velocity.set(0,0,0);v.speed=0;t.turretYaw=a.turretYaw;t.gunElevation=a.gunElevation;return;}
  const distance=delta.dot(new Vector3(Math.sin(previous.yaw+yaw/2),0,Math.cos(previous.yaw+yaw/2)));
  if(v.grounded){t.leftTravel+=distance-yaw*TANK_GEOMETRY.trackHalfSpacing;t.rightTravel+=distance+yaw*TANK_GEOMETRY.trackHalfSpacing;}
}
