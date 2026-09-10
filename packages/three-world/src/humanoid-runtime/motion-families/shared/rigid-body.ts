import { Euler,Vector3 } from 'three';
import type { EnvironmentQueries } from '../../environment/queries';
import type { Input,VehicleState } from '../../simulation';
import type { BodyPhysicsState } from '../../vehicle-dynamics';

export type MotionIntent=(v:VehicleState,input:Input,dt:number,time:number,q:EnvironmentQueries)=>void;
export type VehicleRig=ReturnType<EnvironmentQueries['vehicleRig']>;
/** 只同步刚体边界；质量、碰撞形状、受力规则和动作状态由所属大类提供。 */
export function syncRigidBody(v:VehicleState,state:BodyPhysicsState,rig:VehicleRig){
 const body=rig.body,prior=body.translation();
 const relocated=new Vector3(prior.x,prior.y,prior.z).distanceToSquared(v.position)>.01;
 body.setTranslation(v.position,true);body.setRotation(v.rotation,true);
 body.setLinvel(v.velocity,true);body.setAngvel(state.angularVelocity,true);
 return relocated;
}
/** 物理世界推进后回读位姿，不选择运动模式、不推进动画。 */
export function readRigidBody(v:VehicleState,state:BodyPhysicsState,rig:VehicleRig){
 const body=rig.body,p=body.translation(),r=body.rotation(),velocity=body.linvel(),angular=body.angvel();
 v.position.set(p.x,p.y,p.z);v.rotation.set(r.x,r.y,r.z,r.w).normalize();v.velocity.set(velocity.x,velocity.y,velocity.z);
 state.angularVelocity.set(angular.x,angular.y,angular.z);
 const angles=new Euler().setFromQuaternion(v.rotation,'YXZ');v.pitch=-angles.x;v.yaw=angles.y;v.roll=angles.z;
 return {velocity,angular};
}
