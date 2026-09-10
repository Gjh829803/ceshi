import { type VehicleSpec } from '../../config';
import { createBodyPhysics,validateBodyPhysics,type BodyPhysicsConfig,type BodyPhysicsState } from '../../vehicle-dynamics';
import { createSubmersibleState,type SubmersibleState } from './submersible';
export interface UnderwaterState {readonly family:'underwater';body?:BodyPhysicsState|undefined;submersible?:SubmersibleState|undefined;}
function defaultBody(_spec:VehicleSpec):BodyPhysicsConfig|undefined{return undefined;}
export function resolvePhysicsSpec(spec:VehicleSpec):VehicleSpec{if(spec.bodyPhysics?.kind==='motion')throw Error('VEHICLE_BODY_PHYSICS_CONFIG_INVALID');if(!["submarine"].includes(spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
if(spec.wheelPhysics)throw Error('VEHICLE_WHEEL_MODE_INVALID');
if(spec.flyingCreature)throw Error('FLYING_CREATURE_PHYSICS_OWNER_INVALID');
if(spec.bodyPhysics?.kind==='submersible'&&spec.visualVariant!=='bubble-sub')throw Error('MOTION_PHYSICS_SUBTYPE_MISMATCH:underwater');
if(spec.bodyPhysics&&!["motion","submersible"].includes(spec.bodyPhysics.kind))throw Error('MOTION_PHYSICS_FAMILY_MISMATCH:underwater');
if(spec.bodyPhysics&&spec.wheelPhysics)throw Error('VEHICLE_PHYSICS_OWNER_CONFLICT');
const body=spec.bodyPhysics??(spec.wheelPhysics?undefined:defaultBody(spec));if(body){validateBodyPhysics(body);if(body.kind==='submersible'&&(!body.water||!body.powertrain))throw Error('VEHICLE_BODY_PHYSICS_CONFIG_INVALID');}return body?{...spec,bodyPhysics:body}:spec;
}
export function createPhysicsState(spec:VehicleSpec):UnderwaterState{const state:UnderwaterState={family:'underwater'};if(spec.bodyPhysics)state.body=createBodyPhysics(spec.bodyPhysics);if(spec.visualVariant==='bubble-sub')state.submersible=createSubmersibleState();return state;}

export function resetRigidState(v:import('../../simulation').VehicleState){if(v.motion.family!=='underwater')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');if(v.spec.bodyPhysics)v.motion.body=createBodyPhysics(v.spec.bodyPhysics);}

export function impactMass(spec:VehicleSpec):number{const value:Partial<Record<VehicleSpec['mode'],number>>={"submarine":3000};const mass=value[spec.mode];if(mass===undefined)throw Error('MOTION_PHYSICS_OWNER_MISMATCH');return spec.wheelPhysics?.mass??spec.bodyPhysics?.mass??mass;}

export function resetAuxiliaryState(v:import('../../simulation').VehicleState){if(v.motion.family!=='underwater')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');}
