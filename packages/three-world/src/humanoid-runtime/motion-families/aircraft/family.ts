import {stepAircraft} from '../../aircraft';
import {stepBodyVehicle} from '../../vehicle-dynamics';
import {subtype,reserved,type MotionFamilyModule} from '../types';
export const aircraftFamily:MotionFamilyModule={id:'aircraft',name:'飞机类',description:'固定翼使用推力、升阻力和起落架；滑翔机采用无动力滑翔。',modes:['plane','glider'],subtypes:[
  subtype('aircraft','plane','固定翼飞机','推力、升阻力、失速、三轮起落架和辅助转弯。'),subtype('aircraft','glider','滑翔机','高台释放和无动力滑翔。'),reserved('aircraft','rotorcraft','旋翼飞机','未纳入本次实现。'),reserved('aircraft','vtol','垂直起降飞机','未纳入本次实现。'),
],step(v,i,dt,time,q,fallback){if(v.aircraft){stepAircraft(v,i,dt,q);return;}if(v.bodyPhysics){stepBodyVehicle(v,i,dt,time,q);return;}fallback(v,i,dt,time,q);}};
