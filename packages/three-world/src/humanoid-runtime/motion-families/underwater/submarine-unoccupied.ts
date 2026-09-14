import {Vector3} from 'three';
import type {VehicleSpec} from '../../config';
import type {UnoccupiedPhysics} from '../shared/unoccupied-body';
const submarine:UnoccupiedPhysics={mass:3000,friction:.15,forces(v,rig,q){
 const body=rig.body,water=q.waterAt(v.position),e=v.spec.envelope;body.setLinearDamping(.45);body.setAngularDamping(2.5);
 if(!water)return;
 const immersion=Math.max(0,Math.min(1,(water.surface-v.position.y-e.offset[1]+e.halfExtents[1])/(2*e.halfExtents[1])));
 // 完全入水时近似中性浮力；出水时恢复重力，不悬停在空气中。
 body.addForce(new Vector3(0,submarine.mass*immersion*(9.81-v.velocity.y*3),0),false);
 body.addTorque(new Vector3(0,1,0).applyQuaternion(v.rotation).cross(new Vector3(0,1,0)).multiplyScalar(submarine.mass*5*immersion),false);
}};
export const submarineUnoccupiedPhysics=(s:VehicleSpec)=>s.mode==='submarine'&&s.archetype==='submarine'&&s.visualVariant!=='bubble-sub'&&!s.bodyPhysics?submarine:undefined;
