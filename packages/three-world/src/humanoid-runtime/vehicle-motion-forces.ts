import {Euler,Vector3} from 'three';
import type {Input,VehicleState} from './simulation';
import type {EnvironmentQueries} from './environment/queries';

export type MotionIntent=(v:VehicleState,input:Input,dt:number,time:number,q:EnvironmentQueries)=>void;
const clamp=(n:number,limit:number)=>Math.max(-limit,Math.min(limit,n));

/** Existing flight, hover and creature controls supply intent to the shared
 * dynamic chassis. Only Rapier integrates the real position and momentum. */
export function motionForces(v:VehicleState,input:Input,h:number,time:number,q:EnvironmentQueries,mass:number,intent:MotionIntent){
  const s=v.spec,mode=s.mode;
  const draft:VehicleState={...v,position:v.position.clone(),rotation:v.rotation.clone(),velocity:v.velocity.clone(),
    ...(v.creature?{creature:{...v.creature,leadPosition:v.creature.leadPosition?.clone()}}:{})};
  const driven=v.bodyPhysics!.riderMounted||[input.forward,input.steer,input.lift,input.roll,input.pitch,input.strafe].some(n=>Math.abs(n)>.01)||input.boost||input.jump;
  if(!driven&&mode==='plane')draft.throttle=0;
  q.withoutContactImpulses(()=>intent(draft,input,h,time,q));
  const force=new Vector3(),torque=new Vector3(),water=q.waterAt(v.position);
  const limit=Math.max(2,s.accel,s.brakeDeceleration,s.grip*v.velocity.length(),['plane','glider'].includes(mode)?50:0);
  if(driven){
    force.x=mass*clamp((draft.velocity.x-v.velocity.x)/h,limit);
    force.z=mass*clamp((draft.velocity.z-v.velocity.z)/h,limit);
  }else{
    // Unoccupied actors coast and exchange momentum; never pin them to a pose.
    const drag=mode==='slide'?.12:['boat','sub'].includes(mode)?.35:mode==='space'?.04:v.grounded?.6:.04;
    force.x=-mass*v.velocity.x*drag;force.z=-mass*v.velocity.z*drag;
  }
  if(mode==='hover'){
    const floor=q.support(v.position,120,.45)?.height??q.map.bounds.min[1];
    const target=Math.max(floor,water?.surface??-Infinity)+1.3;
    force.y=mass*(9.81+clamp((target-v.position.y)*28-v.velocity.y*8,35));
  }else if(mode==='boat'&&water){
    force.y=mass*(9.81+clamp((water.surface+.1-v.position.y)*18-v.velocity.y*6,30));
  }else if(mode==='sub'&&water){
    force.y=mass*(9.81+(driven?clamp((draft.velocity.y-v.velocity.y)/h,s.verticalAcceleration):-v.velocity.y*s.verticalDamping));
  }else if(mode==='space'){
    force.y=mass*(9.81+(driven?clamp((draft.velocity.y-v.velocity.y)/h,limit):-v.velocity.y*.04));
  }else if((mode==='plane'||mode==='glider')&&(driven||v.launched)&&(!v.grounded||draft.velocity.y>0&&v.speed>14)){
    force.y=mass*(9.81+clamp((draft.velocity.y-v.velocity.y)/h,25));
  }else if(mode==='dragon'&&draft.creature?.flying){
    force.y=mass*(9.81+clamp((draft.velocity.y-v.velocity.y)/h,25));
  }else if(v.creature&&driven&&draft.grounded&&draft.position.y>v.position.y+.001){
    // The existing hoof-step/headroom query verifies the climb. Supply lift to
    // the same body instead of teleporting it onto the tread.
    force.y=mass*(9.81+clamp((draft.position.y-v.position.y)*160-v.velocity.y*16,35));
  }else if(input.jump&&draft.velocity.y>v.velocity.y){
    force.y=mass*(draft.velocity.y-v.velocity.y)/h;
  }
  if(mode==='glider'&&!v.launched&&draft.launched){
    // Release is an explicit launch impulse. It still passes through CCD and
    // contacts in the common solver, including an obstructed launch pad.
    force.copy(draft.velocity).sub(v.velocity).multiplyScalar(mass/h);
    force.y=mass*(9.81+(Math.max(3,draft.velocity.y)-v.velocity.y)/h);
  }
  // Upright assistance is torque-limited, so impacts still rotate the chassis.
  if(driven||v.grounded||mode==='hover'||mode==='boat'||mode==='sub'){
    const target=draft.rotation.clone();
    if(!driven){const angles=new Euler().setFromQuaternion(v.rotation,'YXZ');target.setFromEuler(new Euler(0,angles.y,0,'YXZ'));}
    const error=target.multiply(v.rotation.clone().invert());if(error.w<0)error.set(-error.x,-error.y,-error.z,-error.w);
    const localError=new Vector3(error.x,error.y,error.z).multiplyScalar(2).applyQuaternion(v.rotation.clone().invert());
    const omega=v.bodyPhysics!.angularVelocity.clone().applyQuaternion(v.rotation.clone().invert());
    const e=s.envelope.halfExtents,j=new Vector3(mass*(4*e[2]**2+1)/12,mass*(4*e[0]**2+4*e[2]**2)/12,mass*(4*e[0]**2+1)/12);
    // The intent yaw is one slice ahead. Feed its angular velocity to the PD
    // controller instead of accumulating a second authoritative orientation.
    const targetYaw=driven?Math.atan2(Math.sin(draft.yaw-v.yaw),Math.cos(draft.yaw-v.yaw))/h:0;
    const rate=driven?1/h:4;
    torque.set(j.x*clamp((localError.x*rate-omega.x)*24,60),j.y*clamp((targetYaw-omega.y)*24,60),j.z*clamp((localError.z*rate-omega.z)*24,60)).applyQuaternion(v.rotation);
  }
  v.steering=draft.steering;v.throttle=driven?(mode==='plane'?draft.throttle:Math.max(...[input.forward,input.steer,input.lift,input.roll,input.pitch,input.strafe].map(Math.abs))):0;v.launched=draft.launched;v.submerged=draft.submerged;
  if(draft.creature)v.creature=draft.creature;
  return {force,torque,draftPosition:draft.position,draftRotation:draft.rotation,draftYaw:draft.yaw};
}
