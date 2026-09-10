import { type VehicleSpec } from '../../config';
import { createBodyPhysics,validateBodyPhysics,type BodyPhysicsConfig,type BodyPhysicsState } from '../../vehicle-dynamics';
import { createJetSkiState,type JetSkiState } from './jetski';
import { createKayakState,type KayakState } from './paddling';
import { createRaftState,type RaftState } from './raft';
export interface SurfaceVesselState {readonly family:'surface-vessel';body?:BodyPhysicsState|undefined;kayak?:KayakState|undefined;raft?:RaftState|undefined;jetski?:JetSkiState|undefined;}
function defaultBody(_spec:VehicleSpec):BodyPhysicsConfig|undefined{return undefined;}
export function resolvePhysicsSpec(spec:VehicleSpec):VehicleSpec{if(spec.bodyPhysics?.kind==='motion')throw Error('VEHICLE_BODY_PHYSICS_CONFIG_INVALID');if(!["boat","paddled_boat"].includes(spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
if(spec.wheelPhysics)throw Error('VEHICLE_WHEEL_MODE_INVALID');
if(spec.flyingCreature)throw Error('FLYING_CREATURE_PHYSICS_OWNER_INVALID');
if(spec.bodyPhysics?.kind==='paddle'&&spec.mode!=='paddled_boat'||spec.bodyPhysics?.kind==='jet'&&spec.archetype!=='jetski')throw Error('MOTION_PHYSICS_SUBTYPE_MISMATCH:surface-vessel');
if(spec.bodyPhysics&&!["motion","paddle","jet"].includes(spec.bodyPhysics.kind))throw Error('MOTION_PHYSICS_FAMILY_MISMATCH:surface-vessel');
if(spec.bodyPhysics&&spec.wheelPhysics)throw Error('VEHICLE_PHYSICS_OWNER_CONFLICT');
const body=spec.bodyPhysics??(spec.wheelPhysics?undefined:defaultBody(spec));if(body){validateBodyPhysics(body);if(['paddle','jet'].includes(body.kind)&&!body.water||body.kind==='jet'&&!body.powertrain)throw Error('VEHICLE_BODY_PHYSICS_CONFIG_INVALID');}return body?{...spec,bodyPhysics:body}:spec;
}
export function createPhysicsState(spec:VehicleSpec):SurfaceVesselState{const state:SurfaceVesselState={family:'surface-vessel'};if(spec.bodyPhysics)state.body=createBodyPhysics(spec.bodyPhysics);if(spec.mode==='paddled_boat')state.kayak={...createKayakState(),...((spec.archetype==='canoe'||spec.archetype==='raft')?{craft:'canoe' as const,side:-1}:{})};if(spec.archetype==='raft')state.raft=createRaftState();if(spec.archetype==='jetski')state.jetski=createJetSkiState();return state;}

export function resetRigidState(v:import('../../simulation').VehicleState){if(v.motion.family!=='surface-vessel')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');if(v.spec.bodyPhysics)v.motion.body=createBodyPhysics(v.spec.bodyPhysics);}

export function impactMass(spec:VehicleSpec):number{const value:Partial<Record<VehicleSpec['mode'],number>>={"paddled_boat":110,"boat":900};const mass=value[spec.mode];if(mass===undefined)throw Error('MOTION_PHYSICS_OWNER_MISMATCH');return spec.wheelPhysics?.mass??spec.bodyPhysics?.mass??mass;}

export function resetAuxiliaryState(v:import('../../simulation').VehicleState){if(v.motion.family!=='surface-vessel')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');}
