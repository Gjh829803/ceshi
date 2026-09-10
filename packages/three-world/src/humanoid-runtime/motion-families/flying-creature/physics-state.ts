import { type VehicleSpec } from '../../config';
import type { CreatureState } from '../../creatures/types';
import { createBodyPhysics,validateBodyPhysics,type BodyPhysicsConfig,type BodyPhysicsState } from '../../vehicle-dynamics';
import { createFlyingCreatureStateV1,validateFlyingCreatureTuning,type FlyingCreatureStateV1 } from './state';
export interface FlyingCreatureFamilyState {readonly family:'flying-creature';body?:BodyPhysicsState|undefined;flyingCreature?:FlyingCreatureStateV1|undefined;creature?:CreatureState|undefined;}
function defaultBody(_spec:VehicleSpec):BodyPhysicsConfig|undefined{return undefined;}
export function resolvePhysicsSpec(spec:VehicleSpec):VehicleSpec{if(spec.bodyPhysics?.kind==='motion')throw Error('VEHICLE_BODY_PHYSICS_CONFIG_INVALID');if(!["dragon"].includes(spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
if(spec.wheelPhysics)throw Error('VEHICLE_WHEEL_MODE_INVALID');

if(spec.flyingCreature){if(spec.bodyPhysics||spec.wheelPhysics)throw Error('FLYING_CREATURE_PHYSICS_OWNER_INVALID');validateFlyingCreatureTuning(spec.flyingCreature);}
if(spec.bodyPhysics&&!["motion"].includes(spec.bodyPhysics.kind))throw Error('MOTION_PHYSICS_FAMILY_MISMATCH:flying-creature');
if(spec.bodyPhysics&&spec.wheelPhysics)throw Error('VEHICLE_PHYSICS_OWNER_CONFLICT');
const body=spec.bodyPhysics??(spec.wheelPhysics?undefined:defaultBody(spec));if(body){validateBodyPhysics(body);}return body?{...spec,bodyPhysics:body}:spec;
}
export function createPhysicsState(spec:VehicleSpec):FlyingCreatureFamilyState{const state:FlyingCreatureFamilyState={family:'flying-creature'};if(spec.bodyPhysics)state.body=createBodyPhysics(spec.bodyPhysics);return state;}

export function resetRigidState(v:import('../../simulation').VehicleState){if(v.motion.family!=='flying-creature')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');if(v.spec.bodyPhysics)v.motion.body=createBodyPhysics(v.spec.bodyPhysics);}

export function impactMass(spec:VehicleSpec):number{const value:Partial<Record<VehicleSpec['mode'],number>>={"dragon":1800};const mass=value[spec.mode];if(mass===undefined)throw Error('MOTION_PHYSICS_OWNER_MISMATCH');return spec.wheelPhysics?.mass??spec.bodyPhysics?.mass??mass;}

export function resetAuxiliaryState(v:import('../../simulation').VehicleState){if(v.motion.family!=='flying-creature')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');v.motion.flyingCreature=v.spec.flyingCreature?{...createFlyingCreatureStateV1(v.yaw),pitchRadians:v.pitch,bankRadians:v.roll,speedMetersPerSecond:v.velocity.length()}:undefined;if(v.motion.flyingCreature){v.launched=true;v.grounded=false;}v.motion.creature=createCreatureState(v.spec,v.position,v.rotation,v.yaw);}

export function createCreatureState(_spec:VehicleSpec,_position:import('three').Vector3,_rotation:import('three').Quaternion,_yaw:number):CreatureState{return {gait:'rest',phase:0,flying:false};}
