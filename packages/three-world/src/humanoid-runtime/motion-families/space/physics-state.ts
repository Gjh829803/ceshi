import {Vector3} from 'three';
import type {VehicleSpec} from '../../config';
import {createBodyPhysics,type BodyPhysicsState} from '../../vehicle-dynamics';
import {spaceFlightConfig,type SpaceDriveMode} from './config';
export interface SpaceState {readonly family:'space';body:BodyPhysicsState;driveMode:SpaceDriveMode;appliedForceNewtonsXYZ:Vector3;docking:{portId:string;status:'approaching'|'docked';elapsed:number;settled:number}|null;}
export function resolvePhysicsSpec(spec:VehicleSpec):VehicleSpec{
 if(spec.mode!=='spacecraft')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
 if(spec.bodyPhysics||spec.wheelPhysics||spec.flyingCreature)throw Error('SPACE_PHYSICS_OWNER_CONFLICT');
 return {...spec,spaceFlight:spaceFlightConfig(spec)};
}
export function createPhysicsState(spec:VehicleSpec):SpaceState{
 const c=spaceFlightConfig(spec);return {family:'space',body:createBodyPhysics({kind:'motion',mass:c.massKilograms,centerOfMassHeight:spec.envelope.offset[1]}),driveMode:c.driveMode,appliedForceNewtonsXYZ:new Vector3(),docking:null};
}
export function resetRigidState(v:import('../../simulation').VehicleState){if(v.motion.family!=='space')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');v.motion=createPhysicsState(v.spec);}
export function impactMass(spec:VehicleSpec){const c=spaceFlightConfig(spec);return c.massKilograms;}
export function resetAuxiliaryState(v:import('../../simulation').VehicleState){if(v.motion.family!=='space')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');}
