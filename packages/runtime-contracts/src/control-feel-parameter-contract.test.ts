import { describe, expect, it } from "vitest";

import {
  resolveControlFeelParametersV1,
  type ControlFeelParametersV1,
} from "./index";

const BASE_FEEL: ControlFeelParametersV1 = {
  jumpVariantPolicy: { mode: "hold-height" },
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

  it("does not allow numeric tuning to replace the locked jump variant policy", () => {
    expect(resolveControlFeelParametersV1(BASE_FEEL, {
      jumpVariantPolicy: {
        mode: "run-selects-variant",
        smallAnticipationSeconds: 0.08,
        largeAnticipationSeconds: 0.16,
      },
    } as never)).toBeUndefined();
    expect(resolveControlFeelParametersV1(BASE_FEEL, {})).toMatchObject({
      jumpVariantPolicy: { mode: "hold-height" },
    });
    expect(resolveControlFeelParametersV1({
      ...BASE_FEEL,
      jumpVariantPolicy: {
        mode: "run-selects-variant",
        smallAnticipationSeconds: -0,
        largeAnticipationSeconds: 0.16,
      },
    }, {})).toBeUndefined();
    expect(Object.isFrozen(
      resolveControlFeelParametersV1(BASE_FEEL, {})?.jumpVariantPolicy,
    )).toBe(true);
  });
});
