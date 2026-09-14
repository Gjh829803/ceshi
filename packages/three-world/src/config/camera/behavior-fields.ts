import {
  object,
  number,
  nonnegative,
  positive,
  boolean,
  choice,
  vector,
  branch,
  angleLimits,
  distanceRange,
  speedLimit,
  type CameraFieldSchema,
} from "./field-primitives";
export const lensFields = {
  verticalFovDegrees: number("degrees", {
    exclusiveMinimum: 0,
    exclusiveMaximum: 180,
  }),
  nearMeters: positive("meters"),
  farMeters: positive("meters"),
};
export const anchorField: CameraFieldSchema = {
  oneOf: [
    branch("origin"),
    branch("eye"),
    branch("seat"),
    branch("body", {
      heightRatio: number("ratio", { minimum: 0, maximum: 1 }),
    }),
    branch("subject-local", { positionMetersXYZ: vector }),
  ],
};
export const positionFields = {
  anchor: anchorField,
  anchorOffset: object({
    space: choice("world", "heading", "subject"),
    offsetMetersXYZ: vector,
  }),
  subjectTranslationHalfLifeSeconds: nonnegative("seconds"),
  anchorHalfLifeSeconds: nonnegative("seconds"),
  armHalfLifeSeconds: nonnegative("seconds"),
};
export const orientationFields = {
  initialPitchRadians: number("radians"),
  pitchLimitsRadians: angleLimits,
  yawLimitsRadians: angleLimits,
  referenceFrame: choice("world-up", "subject-up"),
  recenter: object({
    enabled: boolean,
    delaySeconds: nonnegative("seconds"),
    minimumSpeedMetersPerSecond: nonnegative("meters/second"),
    yawHalfLifeSeconds: nonnegative("seconds"),
    pitch: object(
      {
        targetRadians: number("radians"),
        halfLifeSeconds: nonnegative("seconds"),
      },
      ["targetRadians", "halfLifeSeconds"],
    ),
  }),
};
export const constraintFields = {
  collision: object({
    enabled: boolean,
    radiusMeters: positive("meters"),
    armClearanceMeters: nonnegative("meters"),
    pivotClearanceMeters: nonnegative("meters"),
  }),
  retraction: object({
    halfLifeSeconds: nonnegative("seconds"),
    speedLimit,
  }),
  recovery: object({
    halfLifeSeconds: nonnegative("seconds"),
    speedLimit,
    clearHoldSeconds: nonnegative("seconds"),
    releaseDeadbandMeters: nonnegative("meters"),
  }),
};
export const speedFovField = object({
  enabled: boolean,
  fullEffectSpeedMetersPerSecond: positive("meters/second"),
  maximumOffsetDegrees: nonnegative("degrees"),
  halfLifeSeconds: nonnegative("seconds"),
});
export const speedDistanceField = object({
  enabled: boolean,
  fullEffectSpeedMetersPerSecond: positive("meters/second"),
  maximumOffsetMeters: nonnegative("meters"),
  extendHalfLifeSeconds: nonnegative("seconds"),
  retractHalfLifeSeconds: nonnegative("seconds"),
});
export const zoomField = object({
  range: distanceRange,
  halfLifeSeconds: nonnegative("seconds"),
});
