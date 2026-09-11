import {subtype,type MotionFamilyModule} from '../types';
import {stepBodyVehicle} from './dynamics';
import {createPhysicsState,impactMass,resetAuxiliaryState,resetRigidState,resolvePhysicsSpec} from './physics-state';
export const spaceFamily:MotionFamilyModule={impactMass,resetAuxiliaryState,createPhysicsState,resolvePhysicsSpec,resetRigidState,id:'space',name:'太空类',description:'Rapier 六自由度推进、辅助/惯性驾驶；共享输入、乘坐与相机。',modes:['spacecraft'],subtypes:[subtype('space','spacecraft','太空载具','局部推力/力矩、惯性与可选中心引力。')],step:stepBodyVehicle};
