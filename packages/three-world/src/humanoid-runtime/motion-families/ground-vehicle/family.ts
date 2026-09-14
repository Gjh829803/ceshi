import {horseUnoccupiedPhysics} from './horse-unoccupied';
import {hoverUnoccupiedPhysics} from './hover-unoccupied';
import { subtype,type MotionFamilyModule } from '../types';
import { stepBodyVehicle } from './dynamics';
import { stepFamilyIntent } from './intent';
import { stepCreature } from './land-creature';
import { createPhysicsState,impactMass,resetAuxiliaryState,resetRigidState,resolvePhysicsSpec } from './physics-state';
import { stepWheelVehicle } from './wheel-physics';
export const groundVehicleFamily:MotionFamilyModule={unoccupiedPhysics:s=>horseUnoccupiedPhysics(s)??hoverUnoccupiedPhysics(s),impactMass,resetAuxiliaryState,createPhysicsState,resolvePhysicsSpec,resetRigidState,id:'ground-vehicle',name:'车类',description:'地面运输；轮式、履带、滑行和陆地骑乘继续使用各自算法。',modes:['wheeled','bus','tank','motorcycle','unicycle','skateboard','sled','ski','hover','mount','carriage'],subtypes:[
  subtype('ground-vehicle','wheeled','轮式车辆','独立轮胎、悬挂与动力链。'),subtype('ground-vehicle','wheeled','全地形车','四轮接触与骑手转向。','atv'),subtype('ground-vehicle','unicycle','独轮车','平衡、踩踏和脚部支撑。','unicycle'),
  subtype('ground-vehicle','bus','客车','客车轮组与动力配置。'),subtype('ground-vehicle','tank','履带车辆','左右履带差速。'),subtype('ground-vehicle','motorcycle','摩托车','转向与侧倾。'),
  subtype('ground-vehicle','skateboard','滑板','平面滑行与摩擦。'),subtype('ground-vehicle','sled','雪橇','坡面重力、蹬地和制动。'),subtype('ground-vehicle','ski','滑雪','沿坡面滑行。'),
  subtype('ground-vehicle','hover','悬浮载具','近地高度与平移。'),subtype('ground-vehicle','mount','陆地坐骑','保留独立步态与骑乘算法，不使用轮式动力。'),subtype('ground-vehicle','carriage','马车','牵引和车体组合。'),
],step(v,i,dt,time,q){if(v.motion.family!=='ground-vehicle'||!["wheeled","bus","tank","motorcycle","unicycle","skateboard","sled","ski","hover","mount","carriage"].includes(v.spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');if(v.motion.wheelPhysics){stepWheelVehicle(v,i,dt,q);return;}if(v.motion.body){stepBodyVehicle(v,i,dt,time,q);return;}if(v.motion.creature){stepCreature(v,i,dt,q);return;}stepFamilyIntent(v,i,dt,time,q);}};
