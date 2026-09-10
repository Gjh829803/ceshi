import {stepBodyVehicle} from '../../vehicle-dynamics';
import {subtype,reserved,type MotionFamilyModule} from '../types';
export const surfaceVesselFamily:MotionFamilyModule={id:'surface-vessel',name:'水面船类',description:'水面推进、浮力和划桨；每种船继续消费原有水体查询。',modes:['boat','paddled_boat'],subtypes:[
  subtype('surface-vessel','boat','动力船','水面动力与阻力。'),subtype('surface-vessel','boat','摩托艇','喷泵推力与转向。','jetski'),subtype('surface-vessel','paddled_boat','橡皮艇','划桨与浮力。','raft'),subtype('surface-vessel','paddled_boat','划桨船','kayak 双头桨、canoe 单桨；共享划桨相位与水阻。'),reserved('surface-vessel','sailing','帆船','风帆推进尚未实现。'),
],step(v,i,dt,time,q,fallback){if(v.bodyPhysics){stepBodyVehicle(v,i,dt,time,q);return;}fallback(v,i,dt,time,q);}};
