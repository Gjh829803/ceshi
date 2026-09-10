import {stepBodyVehicle} from '../vehicle-dynamics';
import {parseMovementSettings,type MovementSettings} from '../../config/control';
import {controlFields} from '../../config/control-fields';
import {humanFamily} from './human/family';
import {groundVehicleFamily} from './ground-vehicle/family';
import {surfaceVesselFamily} from './surface-vessel/family';
import {aircraftFamily} from './aircraft/family';
import {flyingCreatureFamily} from './flying-creature/family';
import {underwaterFamily} from './underwater/family';
import {spaceFamily} from './space/family';
import type {MotionFamilyId,MotionMode,VehicleStep} from './types';
const modules=[humanFamily,groundVehicleFamily,surfaceVesselFamily,aircraftFamily,flyingCreatureFamily,underwaterFamily,spaceFamily];
const byMode=new Map<MotionMode,(typeof modules)[number]>();
for(const family of modules)for(const mode of family.modes){if(byMode.has(mode))throw Error(`MOTION_MODE_DUPLICATE:${mode}`);byMode.set(mode,family);}
/** 返回独立目录副本；查目录不创建主体、不改变输入或推进时钟。 */
export function listMotionFamilies(){return modules.map(({step,...family})=>structuredClone(family));}
export function motionFamilyForMode(mode:MotionMode):MotionFamilyId{const family=byMode.get(mode);if(!family)throw Error(`MOTION_MODE_UNKNOWN:${mode}`);return family.id;}
export function motionSubtypeControlFields(familyId:MotionFamilyId,subtypeId:string){const subtype=findSubtype(familyId,subtypeId);return subtype.status==='reserved'?[]:controlFields(subtype.controlFamily).map(field=>({...field}));}
function findSubtype(familyId:MotionFamilyId,subtypeId:string){const subtype=modules.find(f=>f.id===familyId)?.subtypes.find(s=>s.id===subtypeId);if(!subtype)throw Error(`MOTION_SUBTYPE_MISMATCH:${familyId}:${subtypeId}`);return subtype;}
export function resolveMotionFamilyMovement(familyId:MotionFamilyId,subtypeId:string,value:unknown,defaults:MovementSettings):MovementSettings{
  const subtype=findSubtype(familyId,subtypeId);
  if(subtype.status!=='implemented')throw Error(`MOTION_SUBTYPE_UNAVAILABLE:${subtypeId}`);
  return parseMovementSettings(value,defaults);
}
/** 公共接触查询与时间仍由 Simulation 拥有；每次只调用一个大类入口。 */
export function stepMotionFamily(...args:[...Parameters<VehicleStep>,fallback:VehicleStep]){const family=byMode.get(args[0].spec.mode);if(!family?.step)throw Error(`MOTION_VEHICLE_FAMILY_UNAVAILABLE:${args[0].spec.mode}`);const [v,input,dt,time,q,fallback]=args;
  if(v.spec.bodyPhysics?.kind==='motion'&&v.bodyPhysics){
    // 公共刚体负责积分；大类在临时状态上计算运动意图，不能再次创建刚体。
    stepBodyVehicle(v,input,dt,time,q,(draft,command,h,t,environment)=>{
      const body=draft.bodyPhysics;draft.bodyPhysics=undefined;
      try{family.step!(draft,command,h,t,environment,fallback);}finally{draft.bodyPhysics=body;}
    });return;
  }
  family.step(...args);}
