import { reserved,subtype,type MotionFamilyModule } from '../types';
import { stepNativeFlyingCreature } from './controller';
import { stepBodyVehicle } from './dynamics';
import { stepFamilyIntent } from './intent';
import { stepCreature } from './legacy-creature';
import { createPhysicsState,impactMass,resetAuxiliaryState,resetRigidState,resolvePhysicsSpec } from './physics-state';
export const flyingCreatureFamily:MotionFamilyModule={impactMass,resetAuxiliaryState,createPhysicsState,resolvePhysicsSpec,resetRigidState,id:'flying-creature',name:'飞行生物类',description:'原生动力飞行、松键悬停、俯冲滑翔、体力、闪避与喷火状态；飞鸟需单独标定模型和碰撞体。',modes:['dragon'],subtypes:[subtype('flying-creature','dragon','飞龙','D01 原生 Three/Rapier 飞行；未启用动力飞行配置的旧坐骑保持兼容。'),reserved('flying-creature','bird','飞鸟','鸟类动作与运动标定尚未接入。')],step(v,i,dt,time,q){if(v.motion.family!=='flying-creature'||!["dragon"].includes(v.spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');if(v.motion.flyingCreature){stepNativeFlyingCreature(v,i,dt,q);return;}if(v.motion.body){stepBodyVehicle(v,i,dt,time,q);return;}if(v.motion.creature){stepCreature(v,i,dt,q);return;}stepFamilyIntent(v,i,dt,time,q);}};
