import { describe, expect, it } from "vitest";
import type { WheeledArcadeControlFeelParametersV1 } from
  "@whitebox-world/runtime-contracts";

import {
  STOPPED_WHEELED_ARCADE_CONTROL_STATE_V1,
  sampleWheeledArcadeCurveV1,
  stepWheeledArcadeControlV1,
  type WheeledArcadeControlInputV1,
  type WheeledArcadeControlStateV1,
} from "./wheeled-arcade-control";

const FEEL: WheeledArcadeControlFeelParametersV1 = {
  maximumForwardSpeedMetersPerSecond: 25,
  maximumReverseSpeedMetersPerSecond: 12.1875,
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
  gearAccelerationCurve: [
    [0, 1], [0.1, 1], [0.25, 0.83], [0.45, 0.71], [0.7, 0.58], [1, 0.5],
    [4, 0.42],
  ],
  speedTurnRadiusMetersCurve: [[0, 2.3], [10, 8.625], [25, 17.25], [45, 34.5]],
  drift: {
    minimumSpeedMetersPerSecond: 10,
    minimumSteeringRatio: 0.001,
    directionLocksOnEntry: true,
    turnMinimumRatio: 0.2,
    turnMaximumRatio: 0.8,
    boostTriggersOnRelease: true,
    levels: [
      {
        strictlyGreaterThanSeconds: 1,
        maximumSpeedBonusMetersPerSecond: 4.5,
        durationSeconds: 3,
        releaseImpulseMetersPerSecond: 2.25,
      },
      {
        strictlyGreaterThanSeconds: 3,
        maximumSpeedBonusMetersPerSecond: 6.5,
        durationSeconds: 4,
        releaseImpulseMetersPerSecond: 3.25,
      },
    ],
  },
};

const IDLE: WheeledArcadeControlInputV1 = {
  throttle: 0,
  steering: 0,
  brakeRatio: 0,
  handbrakeRequested: false,
  grounded: true,
  maximumSpeedRatio: 1,
  accelerationRatio: 1,
  decelerationRatio: 1,
};

function stepFor(
  initial: WheeledArcadeControlStateV1,
  seconds: number,
  input: WheeledArcadeControlInputV1,
): WheeledArcadeControlStateV1 {
  let state = initial;
  for (let tick = 0; tick < Math.round(seconds * 60); tick += 1) {
    state = stepWheeledArcadeControlV1(state, input, FEEL, 1 / 60).state;
  }
  return state;
}

describe("STK configured wheeled-arcade control", () => {
  it("uses the delivered speed-to-turn-radius curve", () => {
    expect(sampleWheeledArcadeCurveV1(FEEL.speedTurnRadiusMetersCurve, 0))
      .toBeCloseTo(2.3, 12);
    expect(sampleWheeledArcadeCurveV1(FEEL.speedTurnRadiusMetersCurve, 10))
      .toBeCloseTo(8.625, 12);
    expect(sampleWheeledArcadeCurveV1(FEEL.speedTurnRadiusMetersCurve, 25))
      .toBeCloseTo(17.25, 12);
  });

  it("coasts linearly at five metres per second squared", () => {
    const state = stepFor({
      ...STOPPED_WHEELED_ARCADE_CONTROL_STATE_V1,
      forwardSpeedMetersPerSecond: 20,
    }, 0.75, IDLE);
    expect(state.forwardSpeedMetersPerSecond).toBeCloseTo(16.25, 10);
  });

  it("builds digital steering in two stages and returns in 0.1 seconds", () => {
    const started = stepWheeledArcadeControlV1({
      ...STOPPED_WHEELED_ARCADE_CONTROL_STATE_V1,
      forwardSpeedMetersPerSecond: 12,
    }, { ...IDLE, steering: 1 }, FEEL, 0.1).state;
    expect(started.steeringInput).toBeGreaterThan(0.5);
    expect(started.steeringInput).toBeLessThan(0.65);
    const returned = stepWheeledArcadeControlV1(
      started,
      IDLE,
      FEEL,
      0.1,
    ).state;
    expect(returned.steeringInput).toBe(0);
  });

  it("requires ten metres per second to drift and boosts on release", () => {
    const tooSlow = stepWheeledArcadeControlV1({
      ...STOPPED_WHEELED_ARCADE_CONTROL_STATE_V1,
      forwardSpeedMetersPerSecond: 9,
    }, { ...IDLE, steering: 1, handbrakeRequested: true }, FEEL, 1 / 60).state;
    expect(tooSlow.drifting).toBe(false);

    const charged = stepFor({
      ...STOPPED_WHEELED_ARCADE_CONTROL_STATE_V1,
      forwardSpeedMetersPerSecond: 14,
    }, 1.1, {
      ...IDLE,
      throttle: 1,
      steering: 1,
      handbrakeRequested: true,
    });
    const released = stepWheeledArcadeControlV1(
      charged,
      { ...IDLE, throttle: 1, steering: 1 },
      FEEL,
      1 / 60,
    ).state;
    expect(released.drifting).toBe(false);
    expect(released.activeBoostLevelIndex).toBe(0);
    expect(released.boostRemainingSeconds).toBe(3);
    expect(released.forwardSpeedMetersPerSecond)
      .toBeGreaterThan(charged.forwardSpeedMetersPerSecond);
  });

  it("keeps mutable drift and boost state isolated per instance", () => {
    const charged = stepFor({
      ...STOPPED_WHEELED_ARCADE_CONTROL_STATE_V1,
      forwardSpeedMetersPerSecond: 20,
    }, 3.1, {
      ...IDLE,
      throttle: 1,
      steering: 0.3,
      handbrakeRequested: true,
    });
    const released = stepWheeledArcadeControlV1(
      charged,
      { ...IDLE, throttle: 1, steering: 0.3 },
      FEEL,
      1 / 60,
    ).state;
    expect(released.activeBoostLevelIndex).toBe(1);
    expect(released.boostRemainingSeconds).toBe(4);
    expect(STOPPED_WHEELED_ARCADE_CONTROL_STATE_V1.activeBoostLevelIndex).toBe(-1);
  });
});
