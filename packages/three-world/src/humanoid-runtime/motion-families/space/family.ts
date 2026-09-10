import { subtype,type MotionFamilyModule } from '../types';
import { stepBodyVehicle } from './dynamics';
import { stepFamilyIntent } from './intent';
import { createPhysicsState,impactMass,resetAuxiliaryState,resetRigidState,resolvePhysicsSpec } from './physics-state';
export const spaceFamily:MotionFamilyModule={impactMass,resetAuxiliaryState,createPhysicsState,resolvePhysicsSpec,resetRigidState,id:'space',name:'太空类',description:'六向移动和姿态控制；保留现有无输入轴稳定辅助。',modes:['spacecraft'],subtypes:[subtype('space','spacecraft','太空载具','三轴推进、局部姿态与惯性。')],step(v,i,dt,time,q){if(v.motion.family!=='space'||!["spacecraft"].includes(v.spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');if(v.motion.body){stepBodyVehicle(v,i,dt,time,q);return;}stepFamilyIntent(v,i,dt,time,q);}};
