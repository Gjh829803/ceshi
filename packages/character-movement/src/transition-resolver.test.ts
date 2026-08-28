import { describe, expect, it } from "vitest";

import { resolveVerticalTransitionV1 } from "./transition-resolver.js";

const base = {
  tick: 10,
  fromVerticalPhase: "rising" as const,
  phaseEnteredTick: 8,
  transitionSequence: 2,
  resolvedSupportMode: "unsupported" as const,
  resolvedVerticalSpeedMetersPerSecond: 0.03,
  hasCeilingContact: false,
  takeoffRequested: false,
  landingDurationTicks: 2,
  landingTicksRemaining: 0,
  apexEnterSpeedMetersPerSecond: 0.05,
  apexExitSpeedMetersPerSecond: 0.15,
  apexCrossedInAirborneEpisode: false,
};

describe("vertical transition resolver", () => {
  it("uses apex hysteresis and emits apex-crossed exactly once for noisy zero crossings", () => {
    const apex = resolveVerticalTransitionV1(base);
    expect(apex.verticalPhase).toBe("apex");
    expect(apex.events.map((event) => event.type)).toEqual(["phase-changed", "apex-crossed"]);
    const noisy = resolveVerticalTransitionV1({
      ...base,
      tick: 11,
      fromVerticalPhase: apex.verticalPhase,
      phaseEnteredTick: apex.phaseEnteredTick,
      transitionSequence: apex.transitionSequence,
      resolvedVerticalSpeedMetersPerSecond: -0.1,
      apexCrossedInAirborneEpisode: apex.apexCrossedInAirborneEpisode,
    });
    expect(noisy.verticalPhase).toBe("apex");
    expect(noisy.events).toEqual([]);
    const falling = resolveVerticalTransitionV1({
      ...base,
      tick: 12,
      fromVerticalPhase: noisy.verticalPhase,
      phaseEnteredTick: noisy.phaseEnteredTick,
      transitionSequence: noisy.transitionSequence,
      resolvedVerticalSpeedMetersPerSecond: -0.16,
      apexCrossedInAirborneEpisode: noisy.apexCrossedInAirborneEpisode,
    });
    expect(falling.verticalPhase).toBe("falling");
    expect(falling.events).toHaveLength(1);
  });

  it("forces ceiling upward velocity out and emits the legal rising-apex-falling chain", () => {
    const result = resolveVerticalTransitionV1({
      ...base,
      resolvedVerticalSpeedMetersPerSecond: 3,
      hasCeilingContact: true,
    });
    expect(result.correctedVerticalSpeedMetersPerSecond).toBe(0);
    expect(result.verticalPhase).toBe("falling");
    expect(result.events.map((event) =>
      event.type === "phase-changed" ? `${event.fromVerticalPhase}->${event.toVerticalPhase}` : event.type
    )).toEqual(["rising->apex", "apex-crossed", "apex->falling"]);
  });

  it("chains a same-Tick takeoff ceiling contact through rising, apex and falling", () => {
    const result = resolveVerticalTransitionV1({
      ...base,
      fromVerticalPhase: "none",
      phaseEnteredTick: 9,
      resolvedVerticalSpeedMetersPerSecond: 3,
      hasCeilingContact: true,
      takeoffRequested: true,
    });
    expect(result.correctedVerticalSpeedMetersPerSecond).toBe(0);
    expect(result.verticalPhase).toBe("falling");
    expect(result.events.map((event) =>
      event.type === "phase-changed" ? `${event.fromVerticalPhase}->${event.toVerticalPhase}` : event.type
    )).toEqual([
      "none->takeoff",
      "takeoff->rising",
      "rising->apex",
      "apex-crossed",
      "apex->falling",
    ]);
  });

  it("supports none-to-falling ledge departure and holds landing for configured fixed Ticks", () => {
    const ledge = resolveVerticalTransitionV1({
      ...base,
      fromVerticalPhase: "none",
      phaseEnteredTick: 9,
      resolvedVerticalSpeedMetersPerSecond: -1,
    });
    expect(ledge.events[0]).toMatchObject({
      type: "phase-changed",
      fromVerticalPhase: "none",
      toVerticalPhase: "falling",
    });
    const landed = resolveVerticalTransitionV1({
      ...base,
      tick: 11,
      fromVerticalPhase: "falling",
      phaseEnteredTick: 10,
      transitionSequence: ledge.transitionSequence,
      resolvedSupportMode: "supported",
      resolvedVerticalSpeedMetersPerSecond: 0,
      apexCrossedInAirborneEpisode: true,
    });
    expect(landed.verticalPhase).toBe("landing");
    expect(landed.landingTicksRemaining).toBe(1);
    expect(landed.events.map((event) => event.type)).toEqual(["phase-changed", "landed"]);
    const held = resolveVerticalTransitionV1({
      ...base,
      tick: 12,
      fromVerticalPhase: "landing",
      phaseEnteredTick: 11,
      transitionSequence: landed.transitionSequence,
      resolvedSupportMode: "supported",
      resolvedVerticalSpeedMetersPerSecond: 0,
      landingTicksRemaining: landed.landingTicksRemaining,
      apexCrossedInAirborneEpisode: false,
    });
    expect(held.verticalPhase).toBe("landing");
    expect(held.landingTicksRemaining).toBe(0);
    const exited = resolveVerticalTransitionV1({
      ...base,
      tick: 13,
      fromVerticalPhase: "landing",
      phaseEnteredTick: 11,
      transitionSequence: held.transitionSequence,
      resolvedSupportMode: "supported",
      resolvedVerticalSpeedMetersPerSecond: 0,
      landingTicksRemaining: held.landingTicksRemaining,
      apexCrossedInAirborneEpisode: false,
    });
    expect(exited.verticalPhase).toBe("none");
  });
});
