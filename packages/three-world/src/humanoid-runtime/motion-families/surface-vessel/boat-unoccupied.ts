import {Vector3} from 'three';
import type {VehicleSpec} from '../../config';
import type {UnoccupiedPhysics} from '../shared/unoccupied-body';
const boat:UnoccupiedPhysics={mass:900,friction:.15,forces(v,rig,q){
 const body=rig.body,water=q.waterAt(v.position);body.setLinearDamping(.5);body.setAngularDamping(2.5);
 if(!water)return;
 const immersion=Math.max(0,Math.min(2,1+(water.surface+.1-v.position.y)*2));
 // 水线弹簧与水阻保持浮力，不锁定水平位置或吞掉后续撞击。
 body.addForce(new Vector3(0,boat.mass*(9.81*immersion-v.velocity.y*4*Math.min(1,immersion)),0),false);
 body.addTorque(new Vector3(0,1,0).applyQuaternion(v.rotation).cross(new Vector3(0,1,0)).multiplyScalar(boat.mass*8*Math.min(1,immersion)),false);
}};
export const boatUnoccupiedPhysics=(s:VehicleSpec)=>s.mode==='boat'&&s.archetype==='boat'&&!s.bodyPhysics?boat:undefined;
