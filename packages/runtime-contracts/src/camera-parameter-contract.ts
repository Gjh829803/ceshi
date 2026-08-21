export const CAMERA_RIG_PARAMETER_NAMES_V1 = [
  "distanceMeters",
  "minimumDistanceMeters",
  "maximumDistanceMeters",
  "targetHeightMeters",
  "shoulderOffsetMeters",
  "pitchRadians",
  "minimumPitchRadians",
  "maximumPitchRadians",
  "positionDampingPerSecond",
  "horizontalPositionDampingPerSecond",
  "verticalPositionDampingPerSecond",
  "maximumPositionLagMeters",
  "rotationDampingPerSecond",
  "yawDampingPerSecond",
  "pitchDampingPerSecond",
  "collisionRadiusMeters",
  "collisionRetractionMetersPerSecond",
  "collisionRecoveryMetersPerSecond",
  "baseFovDegrees",
  "speedFovDegreesPerMeterPerSecond",
  "maximumSpeedFovDegrees",
  "lookAheadSeconds",
  "accelerationLookAheadSecondsSquared",
  "transitionSeconds",
  "minimumHeadingSpeedMetersPerSecond",
  "velocityHeadingDampingPerSecond",
  "fovDampingPerSecond",
  "horizontalDeadZoneRatio",
  "verticalDeadZoneRatio",
  "recenterDelaySeconds",
  "recenterDurationSeconds",
  "recenterMinimumSpeedMetersPerSecond",
  "teleportSnapDistanceMeters",
  "lookSensitivityXRatio",
  "lookSensitivityYRatio",
] as const;

export type CameraRigParameterNameV1 = typeof CAMERA_RIG_PARAMETER_NAMES_V1[number];
export type CameraRigParametersV1 = Record<CameraRigParameterNameV1, number>;

export const CAMERA_TUNING_PARAMETER_NAMES_V1 = [
  "distanceMeters",
  "targetHeightMeters",
  "shoulderOffsetMeters",
  "pitchRadians",
  "positionDampingPerSecond",
  "horizontalPositionDampingPerSecond",
  "verticalPositionDampingPerSecond",
  "maximumPositionLagMeters",
  "rotationDampingPerSecond",
  "yawDampingPerSecond",
  "pitchDampingPerSecond",
  "collisionRadiusMeters",
  "collisionRetractionMetersPerSecond",
  "collisionRecoveryMetersPerSecond",
  "baseFovDegrees",
  "speedFovDegreesPerMeterPerSecond",
  "maximumSpeedFovDegrees",
  "lookAheadSeconds",
  "accelerationLookAheadSecondsSquared",
  "transitionSeconds",
  "minimumHeadingSpeedMetersPerSecond",
  "velocityHeadingDampingPerSecond",
  "fovDampingPerSecond",
  "horizontalDeadZoneRatio",
  "verticalDeadZoneRatio",
  "recenterDelaySeconds",
  "recenterDurationSeconds",
  "recenterMinimumSpeedMetersPerSecond",
  "teleportSnapDistanceMeters",
  "lookSensitivityXRatio",
  "lookSensitivityYRatio",
] as const satisfies readonly CameraRigParameterNameV1[];

export type CameraTuningParameterNameV1 = typeof CAMERA_TUNING_PARAMETER_NAMES_V1[number];
export type CameraTuningV1 = Partial<Record<CameraTuningParameterNameV1, number>>;

export const CAMERA_TUNING_SAFETY_LIMITS_V1 = {
  distanceMeters: { minimum: 0, maximum: 30 },
  targetHeightMeters: { minimum: 0, maximum: 10 },
  shoulderOffsetMeters: { minimum: -3, maximum: 3 },
  pitchRadians: { minimum: -1.4, maximum: 1.4 },
  positionDampingPerSecond: { minimum: 0, maximum: 40 },
  horizontalPositionDampingPerSecond: { minimum: 0, maximum: 40 },
  verticalPositionDampingPerSecond: { minimum: 0, maximum: 40 },
  maximumPositionLagMeters: { minimum: 0, maximum: 30 },
  rotationDampingPerSecond: { minimum: 0, maximum: 40 },
  yawDampingPerSecond: { minimum: 0, maximum: 40 },
  pitchDampingPerSecond: { minimum: 0, maximum: 40 },
  collisionRadiusMeters: { minimum: 0, maximum: 2 },
  collisionRetractionMetersPerSecond: { minimum: 0, maximum: 60 },
  collisionRecoveryMetersPerSecond: { minimum: 0, maximum: 30 },
  baseFovDegrees: { minimum: 35, maximum: 100 },
  speedFovDegreesPerMeterPerSecond: { minimum: 0, maximum: 5 },
  maximumSpeedFovDegrees: { minimum: 0, maximum: 30 },
  lookAheadSeconds: { minimum: 0, maximum: 2 },
  accelerationLookAheadSecondsSquared: { minimum: 0, maximum: 1 },
  transitionSeconds: { minimum: 0, maximum: 3 },
  minimumHeadingSpeedMetersPerSecond: { minimum: 0, maximum: 20 },
  velocityHeadingDampingPerSecond: { minimum: 0, maximum: 40 },
  fovDampingPerSecond: { minimum: 0, maximum: 30 },
  horizontalDeadZoneRatio: { minimum: 0, maximum: 0.4 },
  verticalDeadZoneRatio: { minimum: 0, maximum: 0.4 },
  recenterDelaySeconds: { minimum: 0, maximum: 5 },
  recenterDurationSeconds: { minimum: 0, maximum: 5 },
  recenterMinimumSpeedMetersPerSecond: { minimum: 0, maximum: 10 },
  teleportSnapDistanceMeters: { minimum: 1, maximum: 100 },
  lookSensitivityXRatio: { minimum: 0.1, maximum: 3 },
  lookSensitivityYRatio: { minimum: 0.1, maximum: 3 },
} as const satisfies Record<
  CameraTuningParameterNameV1,
  { minimum: number; maximum: number }
>;

export function isCameraTuningWithinSafetyLimitsV1(
  tuning: Readonly<Record<string, unknown>>,
): tuning is CameraTuningV1 {
  return Object.entries(tuning).every(([parameterName, value]) => {
    if (!isCameraTuningParameterNameV1(parameterName)) return false;
    const limit = CAMERA_TUNING_SAFETY_LIMITS_V1[parameterName];
    return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= limit.minimum &&
      value <= limit.maximum;
  });
}

const CAMERA_RIG_PARAMETER_NAME_SET_V1 = new Set<string>(CAMERA_RIG_PARAMETER_NAMES_V1);
const CAMERA_TUNING_PARAMETER_NAME_SET_V1 = new Set<string>(CAMERA_TUNING_PARAMETER_NAMES_V1);
const SOCKET_FIRST_PERSON_IGNORED_MODIFIER_PARAMETERS_V1 = new Set<CameraRigParameterNameV1>([
  "distanceMeters",
  "minimumDistanceMeters",
  "maximumDistanceMeters",
  "shoulderOffsetMeters",
  "collisionRadiusMeters",
  "collisionRetractionMetersPerSecond",
  "collisionRecoveryMetersPerSecond",
  "lookAheadSeconds",
  "accelerationLookAheadSecondsSquared",
  "horizontalDeadZoneRatio",
  "verticalDeadZoneRatio",
]);

export function isCameraRigParameterNameV1(value: string): value is CameraRigParameterNameV1 {
  return CAMERA_RIG_PARAMETER_NAME_SET_V1.has(value);
}

export function isCameraTuningParameterNameV1(value: string): value is CameraTuningParameterNameV1 {
  return CAMERA_TUNING_PARAMETER_NAME_SET_V1.has(value);
}

export function isCameraRigParameterOverrideSupportedV1(
  algorithmRef: string,
  parameterName: CameraRigParameterNameV1,
): boolean {
  return !algorithmRef.endsWith("/socket-first-person@1") ||
    !SOCKET_FIRST_PERSON_IGNORED_MODIFIER_PARAMETERS_V1.has(parameterName);
}

export function applyCameraRigParameterOverridesV1(
  algorithmRef: string,
  parameters: CameraRigParametersV1,
  overrides: Readonly<Partial<CameraRigParametersV1>>,
): CameraRigParametersV1 {
  const applied: Record<string, number> = { ...parameters };
  for (const [parameterName, value] of Object.entries(overrides)) {
    if (
      value === undefined ||
      !isCameraRigParameterNameV1(parameterName) ||
      !isCameraRigParameterOverrideSupportedV1(algorithmRef, parameterName)
    ) continue;
    applied[parameterName] = value;
  }

  const positionDamping = overrides.positionDampingPerSecond;
  if (positionDamping !== undefined) {
    if (overrides.horizontalPositionDampingPerSecond === undefined) {
      applied.horizontalPositionDampingPerSecond = positionDamping;
    }
    if (overrides.verticalPositionDampingPerSecond === undefined) {
      applied.verticalPositionDampingPerSecond = positionDamping;
    }
  }
  const rotationDamping = overrides.rotationDampingPerSecond;
  if (rotationDamping !== undefined) {
    if (overrides.yawDampingPerSecond === undefined) {
      applied.yawDampingPerSecond = rotationDamping;
    }
    if (overrides.pitchDampingPerSecond === undefined) {
      applied.pitchDampingPerSecond = rotationDamping;
    }
    if (overrides.velocityHeadingDampingPerSecond === undefined) {
      applied.velocityHeadingDampingPerSecond = rotationDamping;
    }
  }
  return applied as CameraRigParametersV1;
}
