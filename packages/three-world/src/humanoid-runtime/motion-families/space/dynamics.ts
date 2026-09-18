import {dockTargets} from './docking';
import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import {vehicleBody,type EnvironmentQueries} from '../../environment/queries';
import type {Input,VehicleState} from '../../simulation';
import {readRigidBody,syncRigidBody} from '../shared/rigid-body';
import {spaceForces,spaceInertia} from './motion-forces';
/** 太空类独占受力；复用主世界 Rapier 和固定步，禁止第二个模拟循环。 */
export function stepBodyVehicle(v:VehicleState,input:Input,dt:number,_time:number,q:EnvironmentQueries){
 if(v.motion.family!=='space'||v.spec.mode!=='spacecraft')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
 if(dt<=0)return;
 const s=v.motion,c=v.spec.spaceFlight!,state=s.body,e=v.spec.envelope;
 const rig=q.vehicleRig(v.spec.id,state,v.position,v.rotation,state.mass,e.halfExtents[0],e.halfExtents[2],2*e.halfExtents[1],e.offset[1],[{body:vehicleBody(v.spec)}],.1,.1);
 const body=rig.body;syncRigidBody(v,state,rig);body.setGravityScale(0,true);body.setLinearDamping(0);body.setAngularDamping(0);
 if(c.hull==='disc'&&rig.colliders[0]!.shape.type!==RAPIER.ShapeType.Cylinder)rig.colliders[0]!.setShape(new RAPIER.Cylinder(e.halfExtents[1],e.halfExtents[0]));
 let h=dt;
 rig.beforeStep=step=>{
  h=step;const targets=dockTargets(v,input,h,q);
  const locked=s.docking?.status==='docked';
  body.setBodyType(locked?RAPIER.RigidBodyType.Fixed:RAPIER.RigidBodyType.Dynamic,true);
  if(locked){body.setLinvel(new Vector3(),true);body.setAngvel(new Vector3(),true);body.resetForces(true);body.resetTorques(true);s.appliedForceNewtonsXYZ.set(0,0,0);v.throttle=0;state.effort=0;return;}
  // 太空中的极低速漂移也必须保留，不能由地面刚体休眠阈值清零。
  body.wakeUp();
  const mass=c.massKilograms;
  // 未乘坐时只保留惯性/引力，不把主项目的驻车输入当太空刹车。
  const commanded=state.riderMounted||[input.forward,input.steer,input.lift,input.pitch,input.roll,input.strafe].some(n=>n!==0)||input.slow;
  const actuation=commanded?spaceForces(v,input,c,mass,targets):{force:new Vector3(),torque:new Vector3()};
  state.mass=mass;
  body.setAdditionalMassProperties(state.mass,new Vector3(...e.offset),spaceInertia(v,c,state.mass),new Quaternion(),true);
  body.recomputeMassPropertiesFromColliders();
  const force=actuation.force.applyQuaternion(v.rotation),torque=actuation.torque.applyQuaternion(v.rotation);
  s.appliedForceNewtonsXYZ.copy(force);
  if(c.gravity){const toward=new Vector3(...c.gravity.centerMetersXYZ).sub(v.position),radius=Math.max(toward.length(),c.gravity.radiusMeters);force.add(toward.multiplyScalar(state.mass*c.gravity.muMetersCubedPerSecondSquared/(radius*radius*radius)));}
  body.resetForces(true);body.resetTorques(true);body.addForce(force,true);body.addTorque(torque,true);
  state.effort=Math.max(Math.abs(input.forward),Math.abs(input.lift),Math.abs(input.strafe));v.throttle=state.effort;v.steering=input.steer;
 };
 rig.afterStep=()=>{readRigidBody(v,state,rig);v.speed=v.velocity.length();state.contactCount=q.vehicleContactNormals(rig).length;v.grounded=false;state.elapsed+=h;};
}
