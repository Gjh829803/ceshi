import {stepCreature} from '../../creatures/controller';
import {stepBodyVehicle} from '../../vehicle-dynamics';
import {subtype,reserved,type MotionFamilyModule} from '../types';
export const flyingCreatureFamily:MotionFamilyModule={id:'flying-creature',name:'飞行生物类',description:'原生动力飞行、松键悬停、俯冲滑翔、体力、闪避与喷火状态；飞鸟需单独标定模型和碰撞体。',modes:['dragon'],subtypes:[subtype('flying-creature','dragon','飞龙','D01 原生 Three/Rapier 飞行；未启用动力飞行配置的旧坐骑保持兼容。'),reserved('flying-creature','bird','飞鸟','鸟类动作与运动标定尚未接入。')],step(v,i,dt,time,q,fallback){if(v.flyingCreature){stepNativeFlyingCreature(v,i,dt,q);return;}if(v.bodyPhysics){stepBodyVehicle(v,i,dt,time,q);return;}if(v.creature){stepCreature(v,i,dt,q);return;}fallback(v,i,dt,time,q);}};
import {stepNativeFlyingCreature} from './controller';
