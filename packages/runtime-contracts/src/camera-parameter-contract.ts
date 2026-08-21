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
