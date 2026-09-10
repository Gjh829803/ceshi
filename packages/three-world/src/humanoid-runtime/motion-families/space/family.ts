import {stepBodyVehicle} from '../../vehicle-dynamics';
import {subtype,type MotionFamilyModule} from '../types';
export const spaceFamily:MotionFamilyModule={id:'space',name:'太空类',description:'六向移动和姿态控制；保留现有无输入轴稳定辅助。',modes:['space'],subtypes:[subtype('space','space','太空载具','三轴推进、局部姿态与惯性。')],step(v,i,dt,time,q,fallback){if(v.bodyPhysics){stepBodyVehicle(v,i,dt,time,q);return;}fallback(v,i,dt,time,q);}};
