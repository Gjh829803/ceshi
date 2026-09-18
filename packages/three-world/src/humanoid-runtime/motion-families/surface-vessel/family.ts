import {boatUnoccupiedPhysics} from './boat-unoccupied';
import { reserved,subtype,type MotionFamilyModule } from '../types';
import { stepBodyVehicle } from './dynamics';
import { stepFamilyIntent } from './intent';
import { createPhysicsState,impactMass,resetAuxiliaryState,resetRigidState,resolvePhysicsSpec } from './physics-state';
export const surfaceVesselFamily:MotionFamilyModule={unoccupiedPhysics:boatUnoccupiedPhysics,impactMass,resetAuxiliaryState,createPhysicsState,resolvePhysicsSpec,resetRigidState,id:'surface-vessel',name:'水面船类',description:'水面推进、浮力和划桨；每种船继续消费原有水体查询。',modes:['boat','paddled_boat'],subtypes:[
  subtype('surface-vessel','boat','动力船','水面动力与阻力。'),subtype('surface-vessel','boat','摩托艇','喷泵推力与转向。','jetski'),subtype('surface-vessel','paddled_boat','橡皮艇','划桨与浮力。','raft'),subtype('surface-vessel','paddled_boat','划桨船','kayak 双头桨、canoe 单桨；共享划桨相位与水阻。'),reserved('surface-vessel','sailing','帆船','风帆推进尚未实现。'),
],step(v,i,dt,time,q){if(v.motion.family!=='surface-vessel'||!["boat","paddled_boat"].includes(v.spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
  if(i.slow)i={...i,forward:0,boost:false,brake:true};
  if(v.motion.body){stepBodyVehicle(v,i,dt,time,q);return;}stepFamilyIntent(v,i,dt,time,q);}};
