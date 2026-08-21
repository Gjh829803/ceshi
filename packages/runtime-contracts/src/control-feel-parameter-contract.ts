import type {
  ControlFeelTuningParameterNameV1,
  ControlFeelTuningV1,
} from "./runtime-session";

export interface ControlFeelParametersV1 {
  walkSpeedMetersPerSecond: number;
  runSpeedMetersPerSecond: number;
  jumpSpeedMetersPerSecond: number;
  accelerationMetersPerSecondSquared: number;
  decelerationMetersPerSecondSquared: number;
  turnRateRadiansPerSecond: number;
  moveResponseExponent: number;
  airControlRatio: number;
  coyoteTimeSeconds: number;
  jumpBufferSeconds: number;
  variableJumpHoldSeconds: number;
  jumpHoldGravityRatio: number;
  jumpReleaseGravityRatio: number;
}

export const CONTROL_FEEL_PARAMETER_NAMES_V1 = [
  "walkSpeedMetersPerSecond",
  "runSpeedMetersPerSecond",
  "jumpSpeedMetersPerSecond",
  "accelerationMetersPerSecondSquared",
  "decelerationMetersPerSecondSquared",
  "turnRateRadiansPerSecond",
  "moveResponseExponent",
  "airControlRatio",
  "coyoteTimeSeconds",
  "jumpBufferSeconds",
  "variableJumpHoldSeconds",
  "jumpHoldGravityRatio",
  "jumpReleaseGravityRatio",
] as const satisfies readonly ControlFeelTuningParameterNameV1[];

export const CONTROL_FEEL_PARAMETER_BOUNDS_V1: Readonly<
  Record<ControlFeelTuningParameterNameV1, Readonly<{
    minimum: number;
    maximum: number;
  }>>
> = {
  walkSpeedMetersPerSecond: { minimum: 0, maximum: 8 },
  runSpeedMetersPerSecond: { minimum: 0, maximum: 12 },
  jumpSpeedMetersPerSecond: { minimum: 0, maximum: 12 },
  accelerationMetersPerSecondSquared: { minimum: 0, maximum: 60 },
  decelerationMetersPerSecondSquared: { minimum: 0, maximum: 80 },
  turnRateRadiansPerSecond: { minimum: 0, maximum: 20 },
  moveResponseExponent: { minimum: 1, maximum: 3 },
  airControlRatio: { minimum: 0, maximum: 1 },
  coyoteTimeSeconds: { minimum: 0, maximum: 0.4 },
  jumpBufferSeconds: { minimum: 0, maximum: 0.4 },
  variableJumpHoldSeconds: { minimum: 0, maximum: 0.5 },
  jumpHoldGravityRatio: { minimum: 0.1, maximum: 1 },
  jumpReleaseGravityRatio: { minimum: 1, maximum: 5 },
};

export function resolveControlFeelParametersV1(
  base: ControlFeelParametersV1,
  tuning: ControlFeelTuningV1,
): ControlFeelParametersV1 | undefined {
  const allowedNames = new Set<string>(CONTROL_FEEL_PARAMETER_NAMES_V1);
  if (Object.keys(tuning).some((name) => !allowedNames.has(name))) {
    return undefined;
  }

  const resolved: ControlFeelParametersV1 = { ...base, ...tuning };
  for (const name of CONTROL_FEEL_PARAMETER_NAMES_V1) {
    const value = resolved[name];
    const bounds = CONTROL_FEEL_PARAMETER_BOUNDS_V1[name];
    if (
      !Number.isFinite(value) ||
      value < bounds.minimum ||
      value > bounds.maximum
    ) {
      return undefined;
    }
  }
  if (resolved.walkSpeedMetersPerSecond > resolved.runSpeedMetersPerSecond) {
    return undefined;
  }
  return resolved;
}
