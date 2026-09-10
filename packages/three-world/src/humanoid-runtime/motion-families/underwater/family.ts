import { subtype,type MotionFamilyModule } from '../types';
import { stepBodyVehicle } from './dynamics';
import { stepFamilyIntent } from './intent';
import { createPhysicsState,impactMass,resetAuxiliaryState,resetRigidState,resolvePhysicsSpec } from './physics-state';
export const underwaterFamily:MotionFamilyModule={impactMass,resetAuxiliaryState,createPhysicsState,resolvePhysicsSpec,resetRigidState,id:'underwater',name:'水里类',description:'水下推进、浮沉与水体边界，人物游泳仍由人物控制器拥有。',modes:['submarine'],subtypes:[subtype('underwater','submarine','潜航器','潜航与深度约束；观察潜艇保留独立推进算法。')],step(v,i,dt,time,q){if(v.motion.family!=='underwater'||!["submarine"].includes(v.spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');if(v.motion.body){stepBodyVehicle(v,i,dt,time,q);return;}stepFamilyIntent(v,i,dt,time,q);}};
