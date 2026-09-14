import type {VehicleSpec} from '../../config';
import type {UnoccupiedPhysics} from '../shared/unoccupied-body';
const horse:UnoccupiedPhysics={mass:550,friction:.55,forces(v,rig){
 rig.body.setLinearDamping(.6);rig.body.setAngularDamping(3);
 if(v.motion.creature){v.motion.creature.gait='graze';v.motion.creature.flying=false;v.motion.creature.mountFallSpeed=v.grounded?0:v.velocity.y;}
}};
export const horseUnoccupiedPhysics=(s:VehicleSpec)=>s.mode==='mount'&&s.archetype==='horse'&&!s.bodyPhysics?horse:undefined;
