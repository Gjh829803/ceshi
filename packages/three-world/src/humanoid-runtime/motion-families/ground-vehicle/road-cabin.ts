import RAPIER from '@dimforge/rapier3d-compat';
import type {CollisionEnvelope} from '../../config';
import type {VehicleRigidRig} from '../../environment/queries';
const calibrated=new WeakSet<VehicleRigidRig>();
/** 显式车身分段使用精确盒体，避免圆角裁掉模型的角；每次创建刚体只校准一次。 */
export function fitRoadBodyParts(rig:VehicleRigidRig,parts:readonly CollisionEnvelope[]):void {
 if(calibrated.has(rig))return;
 parts.forEach((part,index)=>{
  const collider=rig.colliders[index]!;
  collider.setShape(new RAPIER.Cuboid(...part.halfExtents));
  collider.setTranslationWrtParent({x:part.offset[0],y:part.offset[1],z:part.offset[2]});
 });
 calibrated.add(rig);
}
/** 只替换显式配置车型的驾驶舱；下部斜切底盘、轮组、质量和惯量保持原值。 */
export function fitRoadCabin(rig:VehicleRigidRig,cabin:CollisionEnvelope):void {
 if(calibrated.has(rig))return;
 const collider=rig.colliders[1]!;
 collider.setShape(new RAPIER.Cuboid(...cabin.halfExtents));
 collider.setTranslationWrtParent({x:cabin.offset[0],y:cabin.offset[1],z:cabin.offset[2]});
 calibrated.add(rig);
}
