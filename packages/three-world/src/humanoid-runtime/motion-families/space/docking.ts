import {Quaternion,Vector3} from 'three';
import type {Input,VehicleState} from '../../simulation';
import {vehicleBody,type EnvironmentQueries} from '../../environment/queries';

/** 静止泊位的慢速接近。仍经过本船的推力上限和 Rapier 碰撞。 */
export function dockTargets(v:VehicleState,input:Input,dt:number,q:EnvironmentQueries){
 if(v.motion.family!=='space')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
 const s=v.motion,d=s.docking;
 if(!d)return;
 const manual=[input.forward,input.steer,input.lift,input.pitch,input.roll,input.strafe].some(n=>Math.abs(n)>.01)||input.boost;
 if(manual||(d.status==='approaching'&&!s.body.riderMounted)){s.docking=null;return;}
 if(d.status==='docked')return;
 const port=v.spec.spaceFlight!.dockingPorts!.find(p=>p.id===d.portId)!;
 d.elapsed+=dt;if(d.elapsed>120){s.docking=null;return;}
 const position=new Vector3(...port.positionMetersXYZ),rotation=new Quaternion(...port.rotationXYZW);
 const error=position.clone().sub(v.position),inverse=v.rotation.clone().invert();
 const delta=inverse.clone().multiply(rotation).normalize();if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);
 const angle=2*Math.acos(Math.min(1,delta.w)),axis=new Vector3(delta.x,delta.y,delta.z).normalize();
 const near=error.length()<.15&&v.velocity.length()<.08&&angle<.04&&s.body.angularVelocity.length()<.05;
 d.settled=near?d.settled+dt:0;
 if(d.settled>=.5&&!q.overlaps(position,vehicleBody(v.spec),rotation)){
  // 不瞬移；在实际到达的容差内锁定，手动操纵或解除对接即恢复动态刚体。
  d.status='docked';return;
 }
 return {velocity:error.multiplyScalar(.65).clampLength(0,8).applyQuaternion(inverse),angular:axis.multiplyScalar(angle*2).clampLength(0,.5)};
}
