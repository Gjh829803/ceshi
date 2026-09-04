import type { WheeledArcadeControlFeelParametersV1 } from
  "@whitebox-world/runtime-contracts";

export interface WheeledArcadeControlStateV1 {
  readonly forwardSpeedMetersPerSecond: number;
  readonly steeringInput: number;
  readonly brakeElapsedSeconds: number;
  readonly drifting: boolean;
  readonly driftDirection: -1 | 0 | 1;
  readonly driftElapsedSeconds: number;
  readonly activeBoostLevelIndex: number;
  readonly boostRemainingSeconds: number;
}

export interface WheeledArcadeControlInputV1 {
  readonly throttle: number;
  readonly steering: number;
  readonly brakeRatio: number;
  readonly handbrakeRequested: boolean;
  readonly grounded: boolean;
  readonly maximumSpeedRatio: number;
  readonly accelerationRatio: number;
  readonly decelerationRatio: number;
}

export interface WheeledArcadeControlStepV1 {
  readonly state: WheeledArcadeControlStateV1;
  readonly yawRateRadiansPerSecond: number;
  readonly lateralGripPerSecond: number;
}

export const STOPPED_WHEELED_ARCADE_CONTROL_STATE_V1:
  WheeledArcadeControlStateV1 = Object.freeze({
    forwardSpeedMetersPerSecond: 0,
    steeringInput: 0,
    brakeElapsedSeconds: 0,
    drifting: false,
    driftDirection: 0,
    driftElapsedSeconds: 0,
    activeBoostLevelIndex: -1,
    boostRemainingSeconds: 0,
  });

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function moveTowards(current: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

export function sampleWheeledArcadeCurveV1(
  points: readonly (readonly [number, number])[],
  input: number,
): number {
  const first = points[0]!;
  if (input <= first[0]) return first[1];
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1]!;
    const right = points[index]!;
    if (input > right[0]) continue;
    const span = right[0] - left[0];
    const ratio = span <= 0 ? 1 : (input - left[0]) / span;
    return left[1] + (right[1] - left[1]) * ratio;
  }
  return points.at(-1)![1];
}

function driftDirection(value: number): -1 | 1 {
  return value < 0 ? -1 : 1;
}

export function stepWheeledArcadeControlV1(
  previous: WheeledArcadeControlStateV1,
  rawInput: WheeledArcadeControlInputV1,
  feel: WheeledArcadeControlFeelParametersV1,
  deltaSeconds: number,
): WheeledArcadeControlStepV1 {
  const dt = clamp(deltaSeconds, 0, 0.1);
  const throttle = clamp(rawInput.throttle, -1, 1);
  const rawSteering = clamp(rawInput.steering, -1, 1);
  const maximumSpeedRatio = Math.max(0, rawInput.maximumSpeedRatio);
  const accelerationRatio = Math.max(0, rawInput.accelerationRatio);
  const decelerationRatio = Math.max(0, rawInput.decelerationRatio);
  let boostRemainingSeconds = Math.max(0, previous.boostRemainingSeconds - dt);
  let activeBoostLevelIndex = boostRemainingSeconds > 0
    ? previous.activeBoostLevelIndex
    : -1;
  let forwardSpeedMetersPerSecond = previous.forwardSpeedMetersPerSecond;
  let brakeElapsedSeconds = previous.brakeElapsedSeconds;
  let drifting = previous.drifting;
  let lockedDriftDirection = previous.driftDirection;
  let driftElapsedSeconds = previous.driftElapsedSeconds;

  const returningToNeutral = Math.abs(rawSteering) < Math.abs(previous.steeringInput);
  const steeringRiseSeconds = Math.abs(previous.steeringInput) <
      feel.steeringRiseSplitRatio
    ? feel.steeringRiseLowSeconds
    : feel.steeringRiseHighSeconds;
  const steeringDuration = returningToNeutral
    ? feel.steeringReturnSeconds
    : steeringRiseSeconds;
  const steeringInput = moveTowards(
    previous.steeringInput,
    rawSteering,
    dt / Math.max(0.0001, steeringDuration),
  );

  if (!drifting && rawInput.handbrakeRequested &&
      Math.abs(steeringInput) > feel.drift.minimumSteeringRatio &&
      forwardSpeedMetersPerSecond >= feel.drift.minimumSpeedMetersPerSecond) {
    drifting = true;
    lockedDriftDirection = driftDirection(steeringInput);
    driftElapsedSeconds = 0;
  }
  if (drifting && (!rawInput.handbrakeRequested ||
      forwardSpeedMetersPerSecond < feel.drift.minimumSpeedMetersPerSecond)) {
    let releasedLevelIndex = -1;
    for (let index = 0; index < feel.drift.levels.length; index += 1) {
      if (driftElapsedSeconds >
          feel.drift.levels[index]!.strictlyGreaterThanSeconds) {
        releasedLevelIndex = index;
      }
    }
    drifting = false;
    lockedDriftDirection = 0;
    driftElapsedSeconds = 0;
    if (releasedLevelIndex >= 0) {
      const level = feel.drift.levels[releasedLevelIndex]!;
      activeBoostLevelIndex = releasedLevelIndex;
      boostRemainingSeconds = level.durationSeconds;
      forwardSpeedMetersPerSecond += level.releaseImpulseMetersPerSecond;
    }
  } else if (drifting) {
    driftElapsedSeconds += dt;
  }

  const activeBoost = activeBoostLevelIndex >= 0 && boostRemainingSeconds > 0
    ? feel.drift.levels[activeBoostLevelIndex]
    : undefined;
  const maximumForwardSpeed = (
    feel.maximumForwardSpeedMetersPerSecond +
    (activeBoost?.maximumSpeedBonusMetersPerSecond ?? 0)
  ) * maximumSpeedRatio;
  const maximumReverseSpeed = feel.maximumReverseSpeedMetersPerSecond *
    maximumSpeedRatio;
  const brakingRatio = Math.max(
    clamp(rawInput.brakeRatio, 0, 1),
    Math.max(0, -throttle),
  );
  if (throttle > 0 && brakingRatio <= 0) {
    brakeElapsedSeconds = 0;
    const speedRatio = Math.max(0, forwardSpeedMetersPerSecond) /
      Math.max(0.0001, feel.maximumForwardSpeedMetersPerSecond);
    const gearFactor = sampleWheeledArcadeCurveV1(
      feel.gearAccelerationCurve,
      speedRatio,
    );
    const recoveryMultiplier = forwardSpeedMetersPerSecond < 0
      ? feel.reverseToForwardRecoveryMultiplier
      : 1;
    forwardSpeedMetersPerSecond = moveTowards(
      forwardSpeedMetersPerSecond,
      maximumForwardSpeed,
      feel.accelerationMetersPerSecondSquared * gearFactor *
        recoveryMultiplier * throttle * accelerationRatio * dt,
    );
  } else if (brakingRatio > 0) {
    brakeElapsedSeconds += dt;
    if (forwardSpeedMetersPerSecond > 0) {
      forwardSpeedMetersPerSecond = moveTowards(
        forwardSpeedMetersPerSecond,
        0,
        (feel.brakeInitialDecelerationMetersPerSecondSquared +
          brakeElapsedSeconds * feel.brakeRampMetersPerSecondCubed) *
          brakingRatio * decelerationRatio * dt,
      );
    } else {
      forwardSpeedMetersPerSecond = moveTowards(
        forwardSpeedMetersPerSecond,
        -maximumReverseSpeed,
        feel.reverseAccelerationMetersPerSecondSquared * brakingRatio *
          accelerationRatio * dt,
      );
    }
  } else {
    brakeElapsedSeconds = 0;
    forwardSpeedMetersPerSecond = moveTowards(
      forwardSpeedMetersPerSecond,
      0,
      feel.coastDecelerationMetersPerSecondSquared * decelerationRatio * dt,
    );
  }

  let appliedSteering = steeringInput;
  if (drifting) {
    const intent = clamp(steeringInput * lockedDriftDirection, -1, 1);
    appliedSteering = (
      feel.drift.turnMinimumRatio +
      (feel.drift.turnMaximumRatio - feel.drift.turnMinimumRatio) *
        ((intent + 1) / 2)
    ) * lockedDriftDirection;
  }
  const turnRadiusMeters = sampleWheeledArcadeCurveV1(
    feel.speedTurnRadiusMetersCurve,
    Math.abs(forwardSpeedMetersPerSecond),
  );
  const airborneMultiplier = rawInput.grounded ? 1 : feel.airborneYawMultiplier;
  const yawRateRadiansPerSecond = -forwardSpeedMetersPerSecond /
    Math.max(0.1, turnRadiusMeters) * appliedSteering *
    feel.steeringMultiplier * airborneMultiplier;

  return {
    state: {
      forwardSpeedMetersPerSecond,
      steeringInput,
      brakeElapsedSeconds,
      drifting,
      driftDirection: lockedDriftDirection,
      driftElapsedSeconds,
      activeBoostLevelIndex,
      boostRemainingSeconds,
    },
    yawRateRadiansPerSecond,
    lateralGripPerSecond: drifting
      ? feel.driftLateralGripPerSecond
      : feel.lateralGripPerSecond,
  };
}
