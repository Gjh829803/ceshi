import {Vector3} from 'three';
import type {VehicleSpec} from '../../config';
import type {UnoccupiedPhysics} from '../shared/unoccupied-body';
const up=new Vector3();
/** 空载近地悬浮艇：支撑力只维持高度，水平位移和碰撞交给同一个 Rapier 刚体。 */
const hover:UnoccupiedPhysics={mass:900,friction:.15,forces(v,rig,q){
 const body=rig.body;
 body.setLinearDamping(.7);body.setAngularDamping(2.5);
 const floor=q.support(v.position,120,.45)?.height??q.map.bounds.min[1];
 const water=q.waterAt(v.position),surface=water?Math.max(floor,water.surface):floor;
 // 与驾驶中的 1.3 米悬浮高度、28/8 弹簧阻尼一致；不锁死位置以免抵消碰撞冲量。
 body.addForce({x:0,y:900*(9.81+Math.max(-9.81,Math.min(40,(surface+1.3-v.position.y)*28-v.velocity.y*8))),z:0},false);
 up.set(0,1,0).applyQuaternion(v.rotation);
 body.addTorque({x:-up.z*900*8,y:0,z:up.x*900*8},false);
}};
export const hoverUnoccupiedPhysics=(s:VehicleSpec)=>s.mode==='hover'&&s.archetype==='hover'&&!s.bodyPhysics?hover:undefined;
