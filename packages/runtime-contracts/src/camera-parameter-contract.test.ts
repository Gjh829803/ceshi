import { describe, expect, it } from "vitest";

import {
  CAMERA_TUNING_SAFETY_LIMITS_V1,
  resolveCameraTuningV1,
  validateCameraTuningV1,
  type CameraRigParametersV1,
} from "./camera-parameter-contract";

const ORBIT_ALGORITHM_REF = "worldkit://camera-rig/orbit-follow@1";

function orbitParameters(): CameraRigParametersV1 {
  return {
    distanceMeters: 5,
    minimumDistanceMeters: 0.5,
    maximumDistanceMeters: 20,
    targetHeightMeters: 1.25,
    shoulderOffsetMeters: 0,
    pitchRadians: 0.22,
    minimumPitchRadians: -1.2,
    maximumPitchRadians: 1.2,
    positionDampingPerSecond: 18,
    horizontalPositionDampingPerSecond: 18,
    verticalPositionDampingPerSecond: 20,
    maximumPositionLagMeters: 2.5,
    rotationDampingPerSecond: 20,
    yawDampingPerSecond: 16,
    pitchDampingPerSecond: 14,
    collisionRadiusMeters: 0.2,
    collisionRetractionMetersPerSecond: 30,
    collisionRecoveryMetersPerSecond: 6,
    baseFovDegrees: 58,
    speedFovDegreesPerMeterPerSecond: 0.4,
    maximumSpeedFovDegrees: 4,
    lookAheadSeconds: 0,
    accelerationLookAheadSecondsSquared: 0,
    transitionSeconds: 0.35,
    minimumHeadingSpeedMetersPerSecond: 0,
    velocityHeadingDampingPerSecond: 16,
    fovDampingPerSecond: 8,
    horizontalDeadZoneRatio: 0.08,
    verticalDeadZoneRatio: 0.05,
    recenterDelaySeconds: 1,
    recenterDurationSeconds: 1.2,
    recenterMinimumSpeedMetersPerSecond: 1.2,
    teleportSnapDistanceMeters: 12,
    lookSensitivityXRatio: 1,
    lookSensitivityYRatio: 0.8,
  };
}

describe("shared Camera tuning validation", () => {
  it("accepts a value inside safety and Camera Profile pitch limits", () => {
    expect(resolveCameraTuningV1(
      { algorithmRef: ORBIT_ALGORITHM_REF, parameters: orbitParameters() },
      { targetHeightMeters: 8, pitchRadians: 1.2 },
    )).toEqual({ targetHeightMeters: 8, pitchRadians: 1.2 });
  });

  it("rejects targetHeightMeters=999 instead of clamping to the safety maximum", () => {
    expect(CAMERA_TUNING_SAFETY_LIMITS_V1.targetHeightMeters.maximum).toBe(10);
    const result = validateCameraTuningV1(
      { algorithmRef: ORBIT_ALGORITHM_REF, parameters: orbitParameters() },
      { targetHeightMeters: 999 },
    );
    expect(result).toMatchObject({ ok: false, code: "CAMERA_TUNING_OUT_OF_RANGE" });
    expect(resolveCameraTuningV1(
      { algorithmRef: ORBIT_ALGORITHM_REF, parameters: orbitParameters() },
      { targetHeightMeters: 999 },
    )).toBeUndefined();
  });

  it("rejects pitchRadians=1.3 when the Camera Profile maximum is 1.2 even though safety allows 1.4", () => {
    expect(CAMERA_TUNING_SAFETY_LIMITS_V1.pitchRadians.maximum).toBe(1.4);
    const result = validateCameraTuningV1(
      { algorithmRef: ORBIT_ALGORITHM_REF, parameters: orbitParameters() },
      { pitchRadians: 1.3 },
    );
    expect(result).toMatchObject({ ok: false, code: "CAMERA_TUNING_OUT_OF_RANGE" });
  });

  it("does not treat authoring slider ranges as a hidden clamp", () => {
    expect(resolveCameraTuningV1(
      { algorithmRef: ORBIT_ALGORITHM_REF, parameters: orbitParameters() },
      { targetHeightMeters: 8 },
    )).toEqual({ targetHeightMeters: 8 });
  });
});
