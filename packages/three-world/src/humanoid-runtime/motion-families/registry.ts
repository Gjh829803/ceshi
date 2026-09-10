import { parseMovementSettings,type MovementSettings } from '../../config/control';
import { controlFields } from '../../config/control-fields';
import type { VehicleSpec } from '../config';
import { aircraftFamily } from './aircraft/family';
import { flyingCreatureFamily } from './flying-creature/family';
import { groundVehicleFamily } from './ground-vehicle/family';
import { humanFamily } from './human/family';
import { spaceFamily } from './space/family';
import { surfaceVesselFamily } from './surface-vessel/family';
import type { MotionFamilyId,MotionMode,VehicleStep } from './types';
import { underwaterFamily } from './underwater/family';
const modules=[humanFamily,groundVehicleFamily,surfaceVesselFamily,aircraftFamily,flyingCreatureFamily,underwaterFamily,spaceFamily];
const byMode=new Map<MotionMode,(typeof modules)[number]>();
for(const family of modules)for(const mode of family.modes){if(byMode.has(mode))throw Error(`MOTION_MODE_DUPLICATE:${mode}`);byMode.set(mode,family);}
/** 返回独立目录副本；查目录不创建主体、不改变输入或推进时钟。 */
export function listMotionFamilies(){return modules.map(({id,name,description,modes,subtypes})=>structuredClone({id,name,description,modes,subtypes}));}
export function motionFamilyForMode(mode:MotionMode):MotionFamilyId{const family=byMode.get(mode);if(!family)throw Error(`MOTION_MODE_UNKNOWN:${mode}`);return family.id;}
export function motionSubtypeControlFields(familyId:MotionFamilyId,subtypeId:string){const subtype=findSubtype(familyId,subtypeId);return subtype.status==='reserved'?[]:controlFields(subtype.controlFamily).map(field=>({...field}));}
function findSubtype(familyId:MotionFamilyId,subtypeId:string){const subtype=modules.find(f=>f.id===familyId)?.subtypes.find(s=>s.id===subtypeId);if(!subtype)throw Error(`MOTION_SUBTYPE_MISMATCH:${familyId}:${subtypeId}`);return subtype;}
export function resolveMotionFamilyMovement(familyId:MotionFamilyId,subtypeId:string,value:unknown,defaults:MovementSettings):MovementSettings{
  const subtype=findSubtype(familyId,subtypeId);
  if(subtype.status!=='implemented')throw Error(`MOTION_SUBTYPE_UNAVAILABLE:${subtypeId}`);
  return parseMovementSettings(value,defaults);
}
/** 公共接触查询与时间仍由 Simulation 拥有；每次只调用一个大类入口。 */
export function stepMotionFamily(...args:Parameters<VehicleStep>){const family=byMode.get(args[0].spec.mode);if(!family?.step)throw Error(`MOTION_VEHICLE_FAMILY_UNAVAILABLE:${args[0].spec.mode}`);if(args[0].motion.family!==family.id)throw Error('MOTION_PHYSICS_OWNER_MISMATCH');family.step(...args);}

export function resolveFamilyPhysics(spec:VehicleSpec){const family=byMode.get(spec.mode);if(!family?.resolvePhysicsSpec)throw Error('MOTION_PHYSICS_FAMILY_UNAVAILABLE');return family.resolvePhysicsSpec(spec);}
export function createFamilyPhysics(spec:VehicleSpec){const family=byMode.get(spec.mode);if(!family?.createPhysicsState)throw Error('MOTION_PHYSICS_FAMILY_UNAVAILABLE');return family.createPhysicsState(spec);}

export function resetFamilyRigidState(v:import('../simulation').VehicleState){const family=byMode.get(v.spec.mode);if(!family?.resetRigidState)throw Error('MOTION_PHYSICS_FAMILY_UNAVAILABLE');family.resetRigidState(v);}

export function familyImpactMass(spec:VehicleSpec){const family=byMode.get(spec.mode);if(!family?.impactMass)throw Error('MOTION_PHYSICS_FAMILY_UNAVAILABLE');return family.impactMass(spec);}
export function resetFamilyAuxiliaryState(v:import('../simulation').VehicleState){const family=byMode.get(v.spec.mode);if(!family?.resetAuxiliaryState)throw Error('MOTION_PHYSICS_FAMILY_UNAVAILABLE');family.resetAuxiliaryState(v);}
