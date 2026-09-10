
import { type VehicleSpec } from '../../config';
import { createBodyPhysics,validateBodyPhysics,type BodyPhysicsConfig,type BodyPhysicsState } from '../../vehicle-dynamics';
export interface SpaceState {readonly family:'space';body?:BodyPhysicsState|undefined;}
function defaultBody(_spec:VehicleSpec):BodyPhysicsConfig|undefined{return undefined;}
export function resolvePhysicsSpec(spec:VehicleSpec):VehicleSpec{if(spec.bodyPhysics?.kind==='motion')throw Error('VEHICLE_BODY_PHYSICS_CONFIG_INVALID');if(!["spacecraft"].includes(spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
if(spec.wheelPhysics)throw Error('VEHICLE_WHEEL_MODE_INVALID');
if(spec.flyingCreature)throw Error('FLYING_CREATURE_PHYSICS_OWNER_INVALID');

if(spec.bodyPhysics&&!["motion"].includes(spec.bodyPhysics.kind))throw Error('MOTION_PHYSICS_FAMILY_MISMATCH:space');
if(spec.bodyPhysics&&spec.wheelPhysics)throw Error('VEHICLE_PHYSICS_OWNER_CONFLICT');
const body=spec.bodyPhysics??(spec.wheelPhysics?undefined:defaultBody(spec));if(body){validateBodyPhysics(body);}return body?{...spec,bodyPhysics:body}:spec;
}
export function createPhysicsState(spec:VehicleSpec):SpaceState{const state:SpaceState={family:'space'};if(spec.bodyPhysics)state.body=createBodyPhysics(spec.bodyPhysics);return state;}

export function resetRigidState(v:import('../../simulation').VehicleState){if(v.motion.family!=='space')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');if(v.spec.bodyPhysics)v.motion.body=createBodyPhysics(v.spec.bodyPhysics);}

export function impactMass(spec:VehicleSpec):number{const value:Partial<Record<VehicleSpec['mode'],number>>={"spacecraft":2000};const mass=value[spec.mode];if(mass===undefined)throw Error('MOTION_PHYSICS_OWNER_MISMATCH');return spec.wheelPhysics?.mass??spec.bodyPhysics?.mass??mass;}

export function resetAuxiliaryState(v:import('../../simulation').VehicleState){if(v.motion.family!=='space')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');}
