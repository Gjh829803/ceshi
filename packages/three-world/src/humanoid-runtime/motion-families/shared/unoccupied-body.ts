import {Euler,Vector3} from 'three';
import type {VehicleState} from '../../simulation';
import {vehicleBody,type EnvironmentQueries,type VehicleRigidRig} from '../../environment/queries';

/** 小类提供质量和受力；此处只管理空载刚体生命周期，不选择载具类型。 */
export interface UnoccupiedPhysics {
 mass:number;friction:number;
 forces:(v:VehicleState,rig:VehicleRigidRig,q:EnvironmentQueries,dt:number)=>void;
}
const parked=new WeakMap<VehicleState,{source:VehicleState['motion'];rig?:VehicleRigidRig}>();
export function hasUnoccupiedBody(v:VehicleState){return parked.get(v)?.source===v.motion;}
export function releaseUnoccupiedBody(v:VehicleState,q:EnvironmentQueries){if(parked.has(v)){q.releaseVehicleRig(v.spec.id);parked.delete(v);}}
export function stepUnoccupiedBody(v:VehicleState,profile:UnoccupiedPhysics,q:EnvironmentQueries){
 let token=parked.get(v);
 if(!token||token.source!==v.motion){token={source:v.motion};parked.set(v,token);}
 const e=v.spec.envelope;
 const rig=q.vehicleRig(v.spec.id,token,v.position,v.rotation,profile.mass,e.halfExtents[0],e.halfExtents[2],2*e.halfExtents[1],e.offset[1],[{body:vehicleBody(v.spec)}],profile.friction,.05),body=rig.body;
 // 创建/显式搬移时同步一次；不能逐帧覆盖原生碰撞产生的速度。
 const rotation=body.rotation(),dot=v.rotation.x*rotation.x+v.rotation.y*rotation.y+v.rotation.z*rotation.z+v.rotation.w*rotation.w;
 if(token.rig!==rig||new Vector3().copy(body.translation()).distanceToSquared(v.position)>1e-6||Math.abs(dot)<1-1e-6){
  body.setTranslation(v.position,true);body.setRotation(v.rotation,true);body.setLinvel(v.velocity,true);token.rig=rig;
 }
 rig.beforeStep=h=>{body.resetForces(false);body.resetTorques(false);profile.forces(v,rig,q,h);};
 rig.afterStep=()=>{
  const p=body.translation(),r=body.rotation(),velocity=body.linvel();
  v.position.set(p.x,p.y,p.z);v.rotation.set(r.x,r.y,r.z,r.w).normalize();v.velocity.set(velocity.x,velocity.y,velocity.z);
  const angles=new Euler().setFromQuaternion(v.rotation,'YXZ');v.pitch=-angles.x;v.yaw=angles.y;v.roll=angles.z;v.speed=v.velocity.length();v.throttle=0;v.steering=0;
  v.grounded=q.vehicleContactNormals(rig).some(n=>n.y>.45);
 };
}
