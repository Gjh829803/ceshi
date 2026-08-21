import { describe, expect, it } from "vitest";

import {
  applyCameraRigParameterOverridesV1,
  CAMERA_RIG_PARAMETER_NAMES_V1,
  CAMERA_TUNING_PARAMETER_NAMES_V1,
  isCameraRigParameterNameV1,
  isCameraTuningParameterNameV1,
  type CameraRigParametersV1,
} from "./camera-parameter-contract";

const PARAMETERS = Object.fromEntries(
  CAMERA_RIG_PARAMETER_NAMES_V1.map((name) => [name, 1]),
) as CameraRigParametersV1;

describe("camera parameter contract", () => {
  it("recognizes the complete public parameter vocabulary and rejects invented names", () => {
    expect(CAMERA_RIG_PARAMETER_NAMES_V1).toEqual([
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
    ]);
    expect(isCameraRigParameterNameV1("yawDampingPerSecond")).toBe(true);
    expect(isCameraRigParameterNameV1("inventedCameraKnob")).toBe(false);
    expect(CAMERA_TUNING_PARAMETER_NAMES_V1).toEqual([
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
    ]);
    expect(isCameraTuningParameterNameV1("minimumDistanceMeters")).toBe(false);
    expect(isCameraTuningParameterNameV1("distanceMeters")).toBe(true);
  });

  it("does not apply third-person-only modifier fields to socket first-person", () => {
    const ignoredOverrides = {
      distanceMeters: 2,
      minimumDistanceMeters: 2,
      maximumDistanceMeters: 2,
      shoulderOffsetMeters: 2,
      collisionRadiusMeters: 2,
      collisionRetractionMetersPerSecond: 2,
      collisionRecoveryMetersPerSecond: 2,
      lookAheadSeconds: 2,
      accelerationLookAheadSecondsSquared: 2,
      horizontalDeadZoneRatio: 2,
      verticalDeadZoneRatio: 2,
    } as const;
    const result = applyCameraRigParameterOverridesV1(
      "worldkit://camera-rig/socket-first-person@1",
      PARAMETERS,
      {
        ...ignoredOverrides,
        baseFovDegrees: 55,
        targetHeightMeters: 1.6,
      },
    );

    for (const parameterName of Object.keys(ignoredOverrides)) {
      expect(result[parameterName as keyof CameraRigParametersV1]).toBe(1);
    }
    expect(result).toMatchObject({
      baseFovDegrees: 55,
      targetHeightMeters: 1.6,
    });
  });

  it("applies distance modifiers to follow rigs and expands aggregate damping aliases", () => {
    const result = applyCameraRigParameterOverridesV1(
      "worldkit://camera-rig/orbit-follow@1",
      PARAMETERS,
      {
        distanceMeters: 7,
        positionDampingPerSecond: 8,
        rotationDampingPerSecond: 9,
      },
    );

    expect(result).toMatchObject({
      distanceMeters: 7,
      positionDampingPerSecond: 8,
      horizontalPositionDampingPerSecond: 8,
      verticalPositionDampingPerSecond: 8,
      rotationDampingPerSecond: 9,
      yawDampingPerSecond: 9,
      pitchDampingPerSecond: 9,
      velocityHeadingDampingPerSecond: 9,
    });

    expect(applyCameraRigParameterOverridesV1(
      "worldkit://camera-rig/velocity-chase@1",
      PARAMETERS,
      {
        rotationDampingPerSecond: 9,
        yawDampingPerSecond: 7,
        velocityHeadingDampingPerSecond: 11,
      },
    )).toMatchObject({
      rotationDampingPerSecond: 9,
      yawDampingPerSecond: 7,
      pitchDampingPerSecond: 9,
      velocityHeadingDampingPerSecond: 11,
    });
  });
});
