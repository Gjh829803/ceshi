import type {CharacterOptions} from '../engine-contracts';

/** Ordinary controllable-subject defaults; contextual humanoids use their calibrated profile. */
export const DEFAULT_CHARACTER_OPTIONS: Required<CharacterOptions> = Object.freeze({
  heightMeters: 1.8, radiusMeters: .35, walkSpeedMetersPerSecond: 2.4, runSpeedMetersPerSecond: 4.8,
  jumpSpeedMetersPerSecond: 5, maximumStepHeightMeters: .3, minimumStepWidthMeters: .15,
  snapToGroundDistanceMeters: .35, maximumSlopeRadians: Math.PI / 4, collisionOffsetMeters: .015,
});
