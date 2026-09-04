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
  /**
   * Optional, closed parameter surface for the implemented wheeled-arcade
   * kernel. Character movement ignores this object.
   */
  wheeledArcade?: WheeledArcadeControlFeelParametersV1;
}

export type WheeledArcadeCurvePointV1 = readonly [input: number, output: number];

export interface WheeledArcadeDriftBoostLevelV1 {
  readonly strictlyGreaterThanSeconds: number;
  readonly maximumSpeedBonusMetersPerSecond: number;
  readonly durationSeconds: number;
  readonly releaseImpulseMetersPerSecond: number;
}

export interface WheeledArcadeControlFeelParametersV1 {
  readonly maximumForwardSpeedMetersPerSecond: number;
  readonly maximumReverseSpeedMetersPerSecond: number;
  readonly accelerationMetersPerSecondSquared: number;
  readonly coastDecelerationMetersPerSecondSquared: number;
  readonly brakeInitialDecelerationMetersPerSecondSquared: number;
  readonly brakeRampMetersPerSecondCubed: number;
  readonly reverseAccelerationMetersPerSecondSquared: number;
  readonly reverseToForwardRecoveryMultiplier: number;
  readonly steeringMultiplier: number;
  readonly steeringRiseLowSeconds: number;
  readonly steeringRiseHighSeconds: number;
  readonly steeringRiseSplitRatio: number;
  readonly steeringReturnSeconds: number;
  readonly lateralGripPerSecond: number;
  readonly driftLateralGripPerSecond: number;
  readonly airborneYawMultiplier: number;
  readonly gearAccelerationCurve: readonly WheeledArcadeCurvePointV1[];
  readonly speedTurnRadiusMetersCurve: readonly WheeledArcadeCurvePointV1[];
  readonly drift: Readonly<{
    minimumSpeedMetersPerSecond: number;
    minimumSteeringRatio: number;
    directionLocksOnEntry: true;
    turnMinimumRatio: number;
    turnMaximumRatio: number;
    boostTriggersOnRelease: true;
    levels: readonly WheeledArcadeDriftBoostLevelV1[];
  }>;
}

function finiteInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validIncreasingCurve(
  value: unknown,
  outputMinimum: number,
  outputMaximum: number,
): boolean {
  if (!Array.isArray(value)) return false;
  const points = value as readonly WheeledArcadeCurvePointV1[];
  return points.length >= 2 && points.length <= 16 && points.every((point, index) =>
    Array.isArray(point) && point.length === 2 &&
    finiteInRange(point[0], 0, 1_000) &&
    finiteInRange(point[1], outputMinimum, outputMaximum) &&
    (index === 0 || point[0] > points[index - 1]![0])
  );
}

export function isWheeledArcadeControlFeelParametersV1(
  value: unknown,
): value is WheeledArcadeControlFeelParametersV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const expectedKeys = [
    "maximumForwardSpeedMetersPerSecond",
    "maximumReverseSpeedMetersPerSecond",
    "accelerationMetersPerSecondSquared",
    "coastDecelerationMetersPerSecondSquared",
    "brakeInitialDecelerationMetersPerSecondSquared",
    "brakeRampMetersPerSecondCubed",
    "reverseAccelerationMetersPerSecondSquared",
    "reverseToForwardRecoveryMultiplier",
    "steeringMultiplier",
    "steeringRiseLowSeconds",
    "steeringRiseHighSeconds",
    "steeringRiseSplitRatio",
    "steeringReturnSeconds",
    "lateralGripPerSecond",
    "driftLateralGripPerSecond",
    "airborneYawMultiplier",
    "gearAccelerationCurve",
    "speedTurnRadiusMetersCurve",
    "drift",
  ] as const;
  if (Object.keys(input).length !== expectedKeys.length ||
      expectedKeys.some((key) => !(key in input))) return false;
  const numberBounds = {
    maximumForwardSpeedMetersPerSecond: [0.1, 100],
    maximumReverseSpeedMetersPerSecond: [0, 50],
    accelerationMetersPerSecondSquared: [0.1, 100],
    coastDecelerationMetersPerSecondSquared: [0, 100],
    brakeInitialDecelerationMetersPerSecondSquared: [0, 150],
    brakeRampMetersPerSecondCubed: [0, 250],
    reverseAccelerationMetersPerSecondSquared: [0, 100],
    reverseToForwardRecoveryMultiplier: [1, 10],
    steeringMultiplier: [0, 5],
    steeringRiseLowSeconds: [0.01, 5],
    steeringRiseHighSeconds: [0.01, 5],
    steeringRiseSplitRatio: [0.01, 0.99],
    steeringReturnSeconds: [0.01, 5],
    lateralGripPerSecond: [0, 50],
    driftLateralGripPerSecond: [0, 50],
    airborneYawMultiplier: [0, 1],
  } as const;
  if (Object.entries(numberBounds).some(([key, [minimum, maximum]]) =>
    typeof input[key] !== "number" ||
    !finiteInRange(input[key] as number, minimum, maximum)
  )) return false;
  if (!validIncreasingCurve(
    input.gearAccelerationCurve,
    0,
    5,
  ) || !validIncreasingCurve(
    input.speedTurnRadiusMetersCurve,
    0.1,
    1_000,
  )) return false;
  const drift = input.drift;
  if (drift === null || typeof drift !== "object" || Array.isArray(drift)) return false;
  const driftInput = drift as Record<string, unknown>;
  const driftKeys = [
    "minimumSpeedMetersPerSecond",
    "minimumSteeringRatio",
    "directionLocksOnEntry",
    "turnMinimumRatio",
    "turnMaximumRatio",
    "boostTriggersOnRelease",
    "levels",
  ];
  if (Object.keys(driftInput).length !== driftKeys.length ||
      driftKeys.some((key) => !(key in driftInput)) ||
      driftInput.directionLocksOnEntry !== true ||
      driftInput.boostTriggersOnRelease !== true ||
      typeof driftInput.minimumSpeedMetersPerSecond !== "number" ||
      !finiteInRange(driftInput.minimumSpeedMetersPerSecond, 0, 100) ||
      typeof driftInput.minimumSteeringRatio !== "number" ||
      !finiteInRange(driftInput.minimumSteeringRatio, 0, 1) ||
      typeof driftInput.turnMinimumRatio !== "number" ||
      !finiteInRange(driftInput.turnMinimumRatio, 0, 1) ||
      typeof driftInput.turnMaximumRatio !== "number" ||
      !finiteInRange(driftInput.turnMaximumRatio, 0, 1) ||
      driftInput.turnMinimumRatio > driftInput.turnMaximumRatio ||
      !Array.isArray(driftInput.levels) ||
      driftInput.levels.length < 1 || driftInput.levels.length > 4) return false;
  return driftInput.levels.every((level, index, levels) => {
    if (level === null || typeof level !== "object" || Array.isArray(level)) return false;
    const row = level as Record<string, unknown>;
    const keys = [
      "strictlyGreaterThanSeconds",
      "maximumSpeedBonusMetersPerSecond",
      "durationSeconds",
      "releaseImpulseMetersPerSecond",
    ];
    if (Object.keys(row).length !== keys.length || keys.some((key) => !(key in row))) {
      return false;
    }
    const previous = index === 0
      ? undefined
      : levels[index - 1] as WheeledArcadeDriftBoostLevelV1;
    return typeof row.strictlyGreaterThanSeconds === "number" &&
      finiteInRange(row.strictlyGreaterThanSeconds, 0, 20) &&
      (previous === undefined ||
        row.strictlyGreaterThanSeconds > previous.strictlyGreaterThanSeconds) &&
      typeof row.maximumSpeedBonusMetersPerSecond === "number" &&
      finiteInRange(row.maximumSpeedBonusMetersPerSecond, 0, 50) &&
      typeof row.durationSeconds === "number" &&
      finiteInRange(row.durationSeconds, 0, 30) &&
      typeof row.releaseImpulseMetersPerSecond === "number" &&
      finiteInRange(row.releaseImpulseMetersPerSecond, 0, 50);
  });
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
] as const;

export type ControlFeelTuningParameterNameV1 =
  typeof CONTROL_FEEL_PARAMETER_NAMES_V1[number];
export type ControlFeelTuningV1 = Readonly<
  Partial<Record<ControlFeelTuningParameterNameV1, number>>
>;
export type ControlTuningParameterNameV1 = "moveDeadzoneRatio";
export type ControlTuningV1 = Readonly<
  Partial<Record<ControlTuningParameterNameV1, number>>
>;

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
