import { describe, expect, it } from "vitest";

import {
  isWheeledArcadeControlFeelParametersV1,
  resolveControlFeelParametersV1,
  type ControlFeelParametersV1,
} from "./index";

const BASE_FEEL: ControlFeelParametersV1 = {
  walkSpeedMetersPerSecond: 2.4,
  runSpeedMetersPerSecond: 4,
  jumpSpeedMetersPerSecond: 5.5,
  accelerationMetersPerSecondSquared: 16,
  decelerationMetersPerSecondSquared: 22,
  turnRateRadiansPerSecond: 9,
  moveResponseExponent: 1.4,
  airControlRatio: 0.3,
  coyoteTimeSeconds: 0.1,
  jumpBufferSeconds: 0.12,
  variableJumpHoldSeconds: 0.18,
  jumpHoldGravityRatio: 0.45,
  jumpReleaseGravityRatio: 2,
};

describe("resolveControlFeelParametersV1", () => {
  it("merges a finite in-range tuning map without mutating its locked base", () => {
    const resolved = resolveControlFeelParametersV1(BASE_FEEL, {
      accelerationMetersPerSecondSquared: 8,
      moveResponseExponent: 1.8,
    });

    expect(resolved).toEqual({
      ...BASE_FEEL,
      accelerationMetersPerSecondSquared: 8,
      moveResponseExponent: 1.8,
    });
    expect(BASE_FEEL.accelerationMetersPerSecondSquared).toBe(16);
  });

  it("rejects unknown, non-finite, out-of-range, and cross-field-invalid values", () => {
    expect(resolveControlFeelParametersV1(BASE_FEEL, {
      gravityScale: 1,
    } as never)).toBeUndefined();
    expect(resolveControlFeelParametersV1(BASE_FEEL, {
      airControlRatio: Number.NaN,
    })).toBeUndefined();
    expect(resolveControlFeelParametersV1(BASE_FEEL, {
      jumpReleaseGravityRatio: 0.9,
    })).toBeUndefined();
    expect(resolveControlFeelParametersV1(BASE_FEEL, {
      walkSpeedMetersPerSecond: 5,
    })).toBeUndefined();
  });
});

describe("isWheeledArcadeControlFeelParametersV1", () => {
  const parameters = {
    maximumForwardSpeedMetersPerSecond: 25,
    maximumReverseSpeedMetersPerSecond: 12,
    accelerationMetersPerSecondSquared: 8,
    coastDecelerationMetersPerSecondSquared: 5,
    brakeInitialDecelerationMetersPerSecondSquared: 12,
    brakeRampMetersPerSecondCubed: 18,
    reverseAccelerationMetersPerSecondSquared: 14.4,
    reverseToForwardRecoveryMultiplier: 2.5,
    steeringMultiplier: 1,
    steeringRiseLowSeconds: 0.17,
    steeringRiseHighSeconds: 0.28,
    steeringRiseSplitRatio: 0.5,
    steeringReturnSeconds: 0.1,
    lateralGripPerSecond: 10,
    driftLateralGripPerSecond: 2.1,
    airborneYawMultiplier: 0.35,
    gearAccelerationCurve: [[0, 1], [1, 0.5]],
    speedTurnRadiusMetersCurve: [[0, 2.3], [25, 17.25]],
    drift: {
      minimumSpeedMetersPerSecond: 10,
      minimumSteeringRatio: 0.001,
      directionLocksOnEntry: true,
      turnMinimumRatio: 0.2,
      turnMaximumRatio: 0.8,
      boostTriggersOnRelease: true,
      levels: [{
        strictlyGreaterThanSeconds: 1,
        maximumSpeedBonusMetersPerSecond: 4.5,
        durationSeconds: 3,
        releaseImpulseMetersPerSecond: 2.25,
      }],
    },
  };

  it("accepts the closed vehicle field set and rejects malformed curves or bags", () => {
    expect(isWheeledArcadeControlFeelParametersV1(parameters)).toBe(true);
    expect(isWheeledArcadeControlFeelParametersV1({
      ...parameters,
      gearAccelerationCurve: [[1, 1], [0, 0.5]],
    })).toBe(false);
    expect(isWheeledArcadeControlFeelParametersV1({
      ...parameters,
      hiddenRuntimeScript: "drive.js",
    })).toBe(false);
  });
});
