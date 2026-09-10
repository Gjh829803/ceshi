import { type VehicleSpec } from '../../config';
import { createBodyPhysics,validateBodyPhysics,type BodyPhysicsConfig,type BodyPhysicsState } from '../../vehicle-dynamics';
import { createAircraftState,type AircraftState } from './aerodynamics';
export interface AircraftFamilyState {readonly family:'aircraft';body?:BodyPhysicsState|undefined;aircraft?:AircraftState|undefined;}
function defaultBody(_spec:VehicleSpec):BodyPhysicsConfig|undefined{return undefined;}
export function resolvePhysicsSpec(spec:VehicleSpec):VehicleSpec{if(spec.bodyPhysics?.kind==='motion')throw Error('VEHICLE_BODY_PHYSICS_CONFIG_INVALID');if(!["plane","glider"].includes(spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
if(spec.wheelPhysics)throw Error('VEHICLE_WHEEL_MODE_INVALID');
if(spec.flyingCreature)throw Error('FLYING_CREATURE_PHYSICS_OWNER_INVALID');
if(spec.mode==='plane'&&spec.bodyPhysics)throw Error('AIRCRAFT_PHYSICS_OWNER_INVALID');
if(spec.bodyPhysics&&!["motion"].includes(spec.bodyPhysics.kind))throw Error('MOTION_PHYSICS_FAMILY_MISMATCH:aircraft');
if(spec.bodyPhysics&&spec.wheelPhysics)throw Error('VEHICLE_PHYSICS_OWNER_CONFLICT');
const body=spec.bodyPhysics??(spec.wheelPhysics?undefined:defaultBody(spec));if(body){validateBodyPhysics(body);}return body?{...spec,bodyPhysics:body}:spec;
}
export function createPhysicsState(spec:VehicleSpec):AircraftFamilyState{const state:AircraftFamilyState={family:'aircraft'};if(spec.bodyPhysics)state.body=createBodyPhysics(spec.bodyPhysics);if(spec.mode==='plane')state.aircraft=createAircraftState();return state;}

export function resetRigidState(v:import('../../simulation').VehicleState){if(v.motion.family!=='aircraft')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');if(v.motion.aircraft)v.motion.aircraft=createAircraftState();if(v.spec.bodyPhysics)v.motion.body=createBodyPhysics(v.spec.bodyPhysics);}

export function impactMass(spec:VehicleSpec):number{const value:Partial<Record<VehicleSpec['mode'],number>>={"glider":180,"plane":1200};const mass=value[spec.mode];if(mass===undefined)throw Error('MOTION_PHYSICS_OWNER_MISMATCH');return spec.wheelPhysics?.mass??spec.bodyPhysics?.mass??mass;}

export function resetAuxiliaryState(v:import('../../simulation').VehicleState){if(v.motion.family!=='aircraft')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');}
