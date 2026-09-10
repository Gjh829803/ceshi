import { Vector3,type Quaternion } from 'three';
import { type VehicleSpec } from '../../config';
import type { CreatureState } from '../../creatures/types';
import { createBodyPhysics,validateBodyPhysics,type BodyPhysicsConfig,type BodyPhysicsState } from '../../vehicle-dynamics';
import { createAtvState,type AtvState } from './atv';
import type { SledState } from './sled';
import { createTankState,type TankState } from './tank';
import { createUnicycleState,type UnicycleState } from './unicycle';
import { createWheelPhysics,validateWheelPhysics,type WheelPhysicsState } from './wheel-physics';
export interface GroundVehicleState {readonly family:'ground-vehicle';body?:BodyPhysicsState|undefined;wheelPhysics?:WheelPhysicsState|undefined;creature?:CreatureState|undefined;sled?:SledState|undefined;tank?:TankState|undefined;atv?:AtvState|undefined;unicycle?:UnicycleState|undefined;}
function defaultBody(_spec:VehicleSpec):BodyPhysicsConfig|undefined{return undefined;}
export function resolvePhysicsSpec(spec:VehicleSpec):VehicleSpec{if(spec.bodyPhysics?.kind==='motion')throw Error('VEHICLE_BODY_PHYSICS_CONFIG_INVALID');if(!["wheeled","bus","tank","motorcycle","unicycle","skateboard","sled","ski","hover","mount","carriage"].includes(spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');

if(spec.bodyPhysics&&spec.wheelPhysics)throw Error('VEHICLE_PHYSICS_OWNER_CONFLICT');
if(spec.flyingCreature)throw Error('FLYING_CREATURE_PHYSICS_OWNER_INVALID');
if(spec.wheelPhysics){if(!['wheeled','motorcycle','bus'].includes(spec.mode))throw Error('VEHICLE_WHEEL_MODE_INVALID');validateWheelPhysics(spec.wheelPhysics);}if(spec.bodyPhysics?.water)throw Error('MOTION_PHYSICS_FAMILY_MISMATCH:ground-vehicle');
if(spec.bodyPhysics&&!["motion","unicycle","sled","tracks"].includes(spec.bodyPhysics.kind))throw Error('MOTION_PHYSICS_FAMILY_MISMATCH:ground-vehicle');
if(spec.bodyPhysics&&((spec.bodyPhysics.kind==='tracks'&&spec.mode!=='tank')||(spec.bodyPhysics.kind==='sled'&&!['sled','ski'].includes(spec.mode))||(spec.bodyPhysics.kind==='unicycle'&&spec.mode!=='unicycle')))throw Error('MOTION_PHYSICS_SUBTYPE_MISMATCH:ground-vehicle');

const body=spec.bodyPhysics??(spec.wheelPhysics?undefined:defaultBody(spec));if(body){validateBodyPhysics(body);if(body.kind==='tracks'&&!body.powertrain)throw Error('VEHICLE_BODY_PHYSICS_CONFIG_INVALID');}return body?{...spec,bodyPhysics:body}:spec;
}
export function createPhysicsState(spec:VehicleSpec):GroundVehicleState{const state:GroundVehicleState={family:'ground-vehicle'};if(spec.bodyPhysics)state.body=createBodyPhysics(spec.bodyPhysics);if(spec.wheelPhysics)state.wheelPhysics=createWheelPhysics(spec.wheelPhysics);if(spec.mode==='sled'||spec.mode==='ski')state.sled={phase:0,push:0,brake:0,steer:0};if(spec.mode==='tank')state.tank=createTankState();if(spec.archetype==='atv')state.atv=createAtvState();if(spec.archetype==='unicycle')state.unicycle=createUnicycleState();return state;}

export function resetRigidState(v:import('../../simulation').VehicleState){if(v.motion.family!=='ground-vehicle')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');if(v.spec.wheelPhysics)v.motion.wheelPhysics=createWheelPhysics(v.spec.wheelPhysics);if(v.spec.bodyPhysics)v.motion.body=createBodyPhysics(v.spec.bodyPhysics);}

export function impactMass(spec:VehicleSpec):number{const value:Partial<Record<VehicleSpec['mode'],number>>={"bus":11000,"tank":30000,"sled":100,"ski":85,"wheeled":1600,"motorcycle":260,"unicycle":90,"skateboard":90,"hover":450,"mount":550,"carriage":1000};const mass=value[spec.mode];if(mass===undefined)throw Error('MOTION_PHYSICS_OWNER_MISMATCH');return spec.wheelPhysics?.mass??spec.bodyPhysics?.mass??mass;}

export function resetAuxiliaryState(v:import('../../simulation').VehicleState){if(v.motion.family!=='ground-vehicle')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');v.motion.creature=v.spec.mode==='mount'||v.spec.mode==='carriage'?createCreatureState(v.spec,v.position,v.rotation,v.yaw):undefined;}

export function createCreatureState(spec:VehicleSpec,position:Vector3,_rotation:Quaternion,yaw:number):CreatureState{return {gait:'graze',phase:0,flying:false,...(spec.mode==='carriage'?{leadPosition:position.clone().addScaledVector(new Vector3(Math.sin(yaw),0,Math.cos(yaw)),4.8),leadYaw:yaw,leadVerticalSpeed:0}:{})};}
