import { reserved,subtype,type MotionFamilyModule } from '../types';
import { stepAircraft } from './aerodynamics';
import { stepBodyVehicle } from './dynamics';
import { stepFamilyIntent } from './intent';
import { createPhysicsState,impactMass,resetAuxiliaryState,resetRigidState,resolvePhysicsSpec } from './physics-state';
export const aircraftFamily:MotionFamilyModule={impactMass,resetAuxiliaryState,createPhysicsState,resolvePhysicsSpec,resetRigidState,id:'aircraft',name:'飞机类',description:'固定翼、机尾推进、旋翼、倾转、无动力滑翔、翼装、滑翔伞与热气球，各小类由飞机大类独立控制。',modes:['plane','glider'],subtypes:[
  subtype('aircraft','plane','固定翼飞机','推力、升阻力、失速、三轮起落架和辅助转弯。'),subtype('aircraft','glider','滑翔机','高台释放和无动力滑翔。'),...(['pusher','helicopter','multirotor','tiltrotor','paraglider','wingsuit','balloon'] as const).map(id=>({...subtype('aircraft','plane',id,'飞机小类独立气动、旋翼或热浮力规则。'),id:`aircraft.${id}`})),
  reserved('aircraft','rotorcraft','旋翼旧占位入口','保留旧目录契约；使用 helicopter 或 multirotor 小类。'),reserved('aircraft','vtol','垂直起降旧占位入口','保留旧目录契约；使用 tiltrotor 小类。'),
],step(v,i,dt,time,q){if(v.motion.family!=='aircraft'||!["plane","glider"].includes(v.spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');if(v.motion.aircraft){stepAircraft(v,i,dt,q);return;}if(v.motion.body){stepBodyVehicle(v,i,dt,time,q);return;}stepFamilyIntent(v,i,dt,time,q);}};
