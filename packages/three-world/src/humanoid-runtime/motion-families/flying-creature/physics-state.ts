import type { VehicleSpec } from '../../config';
import type { CreatureState } from '../../creatures/types';
import type { VehicleState } from '../../simulation';
import { createFlyingCreatureStateV1,validateFlyingCreatureTuning,type FlyingCreatureStateV1 } from './state';

export interface FlyingCreatureFamilyState {
  readonly family:'flying-creature';
  flyingCreature?:FlyingCreatureStateV1|undefined;
  creature:CreatureState;
}
export function resolvePhysicsSpec(spec:VehicleSpec):VehicleSpec{
  if(spec.mode!=='dragon')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
  if(spec.bodyPhysics||spec.wheelPhysics)throw Error('FLYING_CREATURE_PHYSICS_OWNER_INVALID');
  if(spec.flyingCreature)validateFlyingCreatureTuning(spec.flyingCreature);
  return spec;
}
export function createPhysicsState():FlyingCreatureFamilyState{
  return {family:'flying-creature',creature:createCreatureState()};
}
export function resetRigidState(v:VehicleState):void{
  if(v.motion.family!=='flying-creature')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
}
export function impactMass(spec:VehicleSpec):number{
  if(spec.mode!=='dragon')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
  return 1800;
}
export function resetAuxiliaryState(v:VehicleState):void{
  if(v.motion.family!=='flying-creature')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
  v.motion.flyingCreature=v.spec.flyingCreature?{...createFlyingCreatureStateV1(v.yaw),pitchRadians:v.pitch,bankRadians:v.roll,speedMetersPerSecond:v.velocity.length()}:undefined;
  if(v.motion.flyingCreature){v.launched=true;v.grounded=false;}
  v.motion.creature=createCreatureState();
}
function createCreatureState():CreatureState{return {gait:'rest',phase:0,flying:false};}
