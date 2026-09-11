import { reserved,subtype,type MotionFamilyModule } from '../types';
import { stepNativeFlyingCreature } from './controller';
import { stepGroundedFlight } from './grounded-flight';
import { createPhysicsState,impactMass,resetAuxiliaryState,resetRigidState,resolvePhysicsSpec } from './physics-state';

export const flyingCreatureFamily:MotionFamilyModule={
  id:'flying-creature',name:'飞行生物类',
  description:'地面起降坐骑与动力飞行；各自复用所属模型的碰撞、动作和调参。',
  modes:['dragon'],
  subtypes:[subtype('flying-creature','dragon','飞龙','地面起降使用坐骑运动参数；flyingCreature 配置启用动力飞行、悬停、俯冲、体力、闪避和喷火。'),reserved('flying-creature','bird','飞鸟','鸟类动作与运动标定尚未接入。')],
  impactMass,resetAuxiliaryState,createPhysicsState,resolvePhysicsSpec,resetRigidState,
  step(v,i,dt,_time,q){
    if(v.motion.family!=='flying-creature'||v.spec.mode!=='dragon')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
    if(v.motion.flyingCreature)stepNativeFlyingCreature(v,i,dt,q);
    else stepGroundedFlight(v,i,dt,q);
  },
};
