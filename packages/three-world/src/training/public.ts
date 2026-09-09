export { Character, Character as TrainingCharacter } from './character';
export { FollowCamera } from './camera';
export { Simulation, emptyInput, createVehicle, type Input, type HumanoidInput, type VehicleState, type PlayerState } from './simulation';
export type { VehicleSpec } from './config';
export * from '../config/control';
export type * from './environment/types';
export { vehicleBody } from './environment/queries';
export * from '../config/camera';
export * from './input';
export { HumanoidController } from './humanoid/controller';
export { SWIM_ROOT_DEPTH } from './humanoid/water-physics';
export type { SkillRequest } from './humanoid/action-schema';
export { SKILL_DEFINITIONS } from './humanoid/action-schema';
export { ACTION_TUNING } from './humanoid/action-schema';
export { CHARACTER_CAPABILITIES, ANIMATION_ONLY_CLIP_IDS, characterCapabilities, type CharacterCapability, type CharacterCapabilityState, type CharacterCapabilityAvailability } from './character-capabilities';
export { readInteractionTargets } from './humanoid/render-state';
export { updateVehicleWheels, resetVehicleWheels, type WheelPose, type WheelFrame } from './vehicle-animation';
export type { TrainingOptions, TrainingProfile, TrainingRuntime, TrainingVehicleInstance, TrainingSnapshot, TrainingConfiguration, TrainingInputObservation, TrainingBoardingObservation } from './runtime';
export type { TrainingCommand } from './runtime';
export { TrainingHorse } from './horse';
export type { TrainingHorseFrame, TrainingSeatAnchor, TrainingResourceResolver } from './horse';

export type {TrainingDisplaySample} from './presentation';
export {createRoadPhysicsProfile} from './wheel-physics';
export type {WheelLayout,WheelPhysicsConfig,SimulatedWheel} from './wheel-physics';
export type {PowertrainConfig,PowertrainState} from './powertrain';
export * from './input-guidance';

export {controlFields,controlKeys,controlSchemaForFamily,type ControlField} from '../config/control-fields';
