import {stepCreature} from '../../creatures/controller';
import {stepBodyVehicle} from '../../vehicle-dynamics';
import {subtype,reserved,type MotionFamilyModule} from '../types';
export const flyingCreatureFamily:MotionFamilyModule={id:'flying-creature',name:'飞行生物类',description:'飞龙使用生物运动与骑乘系统；飞鸟的动作和运动参数待接入。',modes:['dragon'],subtypes:[subtype('flying-creature','dragon','飞龙','沿用当前生物运动与骑乘状态。'),reserved('flying-creature','bird','飞鸟','鸟类动作与运动标定尚未接入。')],step(v,i,dt,time,q,fallback){if(v.bodyPhysics){stepBodyVehicle(v,i,dt,time,q);return;}if(v.creature){stepCreature(v,i,dt,q);return;}fallback(v,i,dt,time,q);}};
