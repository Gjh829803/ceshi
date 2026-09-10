import { reserved,subtype,type MotionFamilyModule } from '../types';
import { stepAircraft } from './aerodynamics';
import { stepBodyVehicle } from './dynamics';
import { stepFamilyIntent } from './intent';
import { createPhysicsState,impactMass,resetAuxiliaryState,resetRigidState,resolvePhysicsSpec } from './physics-state';
export const aircraftFamily:MotionFamilyModule={impactMass,resetAuxiliaryState,createPhysicsState,resolvePhysicsSpec,resetRigidState,id:'aircraft',name:'飞机类',description:'固定翼使用推力、升阻力和起落架；滑翔机采用无动力滑翔。',modes:['plane','glider'],subtypes:[
  subtype('aircraft','plane','固定翼飞机','推力、升阻力、失速、三轮起落架和辅助转弯。'),subtype('aircraft','glider','滑翔机','高台释放和无动力滑翔。'),reserved('aircraft','rotorcraft','旋翼飞机','未纳入本次实现。'),reserved('aircraft','vtol','垂直起降飞机','未纳入本次实现。'),
],step(v,i,dt,time,q){if(v.motion.family!=='aircraft'||!["plane","glider"].includes(v.spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');if(v.motion.aircraft){stepAircraft(v,i,dt,q);return;}if(v.motion.body){stepBodyVehicle(v,i,dt,time,q);return;}stepFamilyIntent(v,i,dt,time,q);}};
