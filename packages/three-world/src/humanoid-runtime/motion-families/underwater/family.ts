import {stepBodyVehicle} from '../../vehicle-dynamics';
import {subtype,type MotionFamilyModule} from '../types';
export const underwaterFamily:MotionFamilyModule={id:'underwater',name:'水里类',description:'水下推进、浮沉与水体边界，人物游泳仍由人物控制器拥有。',modes:['sub'],subtypes:[subtype('underwater','sub','潜航器','潜航与深度约束；观察潜艇保留独立推进算法。')],step(v,i,dt,time,q,fallback){if(v.bodyPhysics){stepBodyVehicle(v,i,dt,time,q);return;}fallback(v,i,dt,time,q);}};
