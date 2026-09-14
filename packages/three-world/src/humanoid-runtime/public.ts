export {wearableHint} from './motion-families/aircraft/wearable-flight';
export {spaceTelemetry} from './motion-families/space/commands';
export {SPACE_FLIGHT_PRESETS} from './motion-families/space/config';
export type {SpaceFlightConfig,SpaceDriveMode,SpaceDockPort} from './motion-families/space/config';
export {createFlyingCreatureSpec} from './motion-families/flying-creature/controller';
export {createFlyingCreatureStateV1,resolveFlyingCreatureFeelV1} from './motion-families/flying-creature/state';
export type {FlyingCreatureStateV1,FlyingCreatureFeelV1} from './motion-families/flying-creature/state';
export {SUBMERSIBLE_WATER} from './motion-families/underwater/submersible';
export {listMotionFamilies,motionFamilyForMode,motionSubtypeControlFields,resolveMotionFamilyMovement} from './motion-families/registry';
export type {MotionFamilyId,MotionSubtype,MotionMode} from './motion-families/types';
export * from './motion-families/surface-vessel/public';
export { Character as HumanoidCharacter } from './character';
export { type Simulation, emptyInput, createVehicle, type Input, type HumanoidActionInput, type VehicleState, type PlayerState } from './simulation';
export type { VehicleSpec } from './config';
export * from '../config/control';
export type * from './environment/types';
export { vehicleBody } from './environment/queries';
export * from './input';
export { HumanoidController } from './humanoid/controller';
export { SWIM_ROOT_DEPTH } from './humanoid/water-physics';
export type { SkillRequest } from './humanoid/action-schema';
export { SKILL_DEFINITIONS } from './humanoid/action-schema';
export { ACTION_TUNING } from './humanoid/action-schema';
export { CHARACTER_CAPABILITIES, ANIMATION_ONLY_CLIP_IDS, characterCapabilities, type CharacterCapability, type CharacterCapabilityState, type CharacterCapabilityAvailability } from './character-capabilities';
export type {InteractionVisualTarget} from './humanoid/interaction-visuals';
export { readInteractionTargets } from './humanoid/render-state';
export { updateVehicleWheels, resetVehicleWheels, type WheelPose, type WheelFrame } from './vehicle-animation';
export type { HumanoidRuntimeOptions, HumanoidProfile, HumanoidRuntime, VehicleInstance, HumanoidSnapshot, HumanoidConfiguration, HumanoidInputObservation, BoardingObservation } from './runtime';
export type { HumanoidCommand } from './runtime';
export { HorseVisual } from './horse';
export type { HorseAnimationFrame, SeatAnchor, ResourceResolver } from './horse';

export type {HumanoidDisplaySample} from './presentation';
export {createRoadPhysicsProfile} from './motion-families/ground-vehicle/wheel-physics';
export type {WheelLayout,WheelPhysicsConfig,SimulatedWheel} from './motion-families/ground-vehicle/wheel-physics';
export type {PowertrainConfig,PowertrainState} from './powertrain';
export {vehicleDriveTelemetry} from './vehicle-dynamics';
export type {BodyPhysicsConfig,BodyPhysicsState,VehicleDriveTelemetry} from './vehicle-dynamics';
export * from './input-guidance';

export {
  controlFields,
  controlKeys,
  controlSchemaForFamily,
  type ControlField,
} from '../config/control-fields';

export {
  TANK_GEOMETRY,
  TANK_CONTROLS,
  createTankState,
} from './motion-families/ground-vehicle/tank';

export { sampleTankVisual } from './tank-visual';

export {
  UNICYCLE_GEOMETRY,
  UNICYCLE_TIMING,
  createUnicycleState,
  unicyclePedal,
  sampleUnicycleVisual,
} from './motion-families/ground-vehicle/unicycle';

export type { UnicycleState } from './motion-families/ground-vehicle/unicycle';

export {
  ATV_GEOMETRY,
  createAtvState,
  sampleAtvVisual,
} from './motion-families/ground-vehicle/atv';

export {
  JETSKI_WATER,
  createJetSkiState,
} from './motion-families/surface-vessel/jetski';

export { sampleJetSkiVisual } from './jetski-visual';
export {createRoadVehicleSpec,type RoadVehicleKind,type RoadVehicleSpec} from './road-vehicle';
export {AIRCRAFT} from '../config/aircraft';

export {FlyingCreatureVisual,type FlyingCreatureVisualResources} from './motion-families/flying-creature/visual';
export type {FlyingCreatureTuning} from './motion-families/flying-creature/state';

export type {MotionFamilyState} from './motion-families/state';
export {dragonGroundHeading} from './motion-families/flying-creature/ground-pose';

export {createAircraftSpec,type AircraftSpec,type AircraftKind} from './aircraft-spec';
export type {VehicleInspection,VehicleInspectionResult,VehicleInspectionQuery,VehicleWheelInspection} from './vehicle-inspection';

// 显示层旋转模糊等特效不作为相机可碰撞实体。
export {markCameraVisualEffect} from './camera-visual-effects';
