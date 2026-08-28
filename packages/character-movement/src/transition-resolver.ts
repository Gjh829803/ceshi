import type {
  LocomotionTransitionEventV1,
  SupportModeV2,
  VerticalPhaseV2,
} from "@whitebox-world/gameplay-contracts";

export interface VerticalTransitionInputV1 {
  readonly tick: number;
  readonly fromVerticalPhase: VerticalPhaseV2;
  readonly phaseEnteredTick: number;
  readonly transitionSequence: number;
  readonly resolvedSupportMode: SupportModeV2;
  readonly resolvedVerticalSpeedMetersPerSecond: number;
  readonly hasCeilingContact: boolean;
  readonly takeoffRequested: boolean;
  readonly landingDurationTicks: number;
  readonly landingTicksRemaining: number;
  readonly apexEnterSpeedMetersPerSecond: number;
  readonly apexExitSpeedMetersPerSecond: number;
  readonly apexCrossedInAirborneEpisode: boolean;
}

export interface VerticalTransitionResolutionV1 {
  readonly verticalPhase: VerticalPhaseV2;
  readonly phaseEnteredTick: number;
  readonly transitionSequence: number;
  readonly landingTicksRemaining: number;
  readonly apexCrossedInAirborneEpisode: boolean;
  readonly correctedVerticalSpeedMetersPerSecond: number;
  readonly events: readonly LocomotionTransitionEventV1[];
}

function fail(): never {
  throw new RangeError("3C_LOCOMOTION_TRANSITION_INVALID: vertical transition input is invalid.");
}

export function resolveVerticalTransitionV1(
  input: VerticalTransitionInputV1,
): VerticalTransitionResolutionV1 {
  if (!Number.isSafeInteger(input.tick) || input.tick < 0 ||
    !Number.isSafeInteger(input.phaseEnteredTick) || input.phaseEnteredTick < 0 ||
    !Number.isSafeInteger(input.transitionSequence) || input.transitionSequence < 0 ||
    !Number.isSafeInteger(input.landingDurationTicks) || input.landingDurationTicks < 1 ||
    !Number.isSafeInteger(input.landingTicksRemaining) || input.landingTicksRemaining < 0 ||
    !Number.isFinite(input.resolvedVerticalSpeedMetersPerSecond) ||
    !Number.isFinite(input.apexEnterSpeedMetersPerSecond) || input.apexEnterSpeedMetersPerSecond < 0 ||
    !Number.isFinite(input.apexExitSpeedMetersPerSecond) ||
    input.apexExitSpeedMetersPerSecond <= input.apexEnterSpeedMetersPerSecond) fail();

  const events: LocomotionTransitionEventV1[] = [];
  let current = input.fromVerticalPhase;
  let phaseEnteredTick = input.phaseEnteredTick;
  let sequence = input.transitionSequence;
  let landingTicksRemaining = input.landingTicksRemaining;
  let apexCrossed = input.apexCrossedInAirborneEpisode;
  let correctedVerticalSpeed = input.hasCeilingContact && input.resolvedVerticalSpeedMetersPerSecond > 0
    ? 0
    : input.resolvedVerticalSpeedMetersPerSecond;
  if (correctedVerticalSpeed === 0) correctedVerticalSpeed = 0;

  const phase = (next: VerticalPhaseV2): void => {
    if (next === current) return;
    sequence += 1;
    events.push(Object.freeze({
      schemaVersion: 1,
      type: "phase-changed",
      fromVerticalPhase: current,
      toVerticalPhase: next,
      committedTick: input.tick,
      transitionSequence: sequence,
    }));
    current = next;
    phaseEnteredTick = input.tick;
  };
  const emitApex = (): void => {
    if (apexCrossed) return;
    sequence += 1;
    events.push(Object.freeze({
      schemaVersion: 1,
      type: "apex-crossed",
      committedTick: input.tick,
      transitionSequence: sequence,
    }));
    apexCrossed = true;
  };
  const advanceToFalling = (): void => {
    if (current === "takeoff") phase("rising");
    if (current === "rising") {
      phase("apex");
      emitApex();
    }
    if (current === "apex") phase("falling");
  };

  const isGrounded = input.resolvedSupportMode !== "unsupported";
  if (isGrounded) {
    if (current === "landing") {
      if (landingTicksRemaining > 0) landingTicksRemaining -= 1;
      else phase("none");
    } else if (current !== "none") {
      advanceToFalling();
      if (current !== "falling") fail();
      phase("landing");
      sequence += 1;
      events.push(Object.freeze({
        schemaVersion: 1,
        type: "landed",
        committedTick: input.tick,
        transitionSequence: sequence,
      }));
      landingTicksRemaining = input.landingDurationTicks - 1;
      apexCrossed = false;
    }
  } else {
    if (current === "landing") {
      phase("none");
      landingTicksRemaining = 0;
    }
    if (input.takeoffRequested) {
      if (current === "none" || current === "falling") {
        phase("takeoff");
        apexCrossed = false;
      }
      if (input.hasCeilingContact && current === "takeoff") advanceToFalling();
    } else if (current === "none") {
      phase("falling");
      apexCrossed = false;
    } else if (current === "takeoff") {
      phase("rising");
      if (correctedVerticalSpeed <= input.apexEnterSpeedMetersPerSecond || input.hasCeilingContact) {
        phase("apex");
        emitApex();
        if (correctedVerticalSpeed <= -input.apexExitSpeedMetersPerSecond || input.hasCeilingContact) {
          phase("falling");
        }
      }
    } else if (current === "rising" &&
      (correctedVerticalSpeed <= input.apexEnterSpeedMetersPerSecond || input.hasCeilingContact)) {
      phase("apex");
      emitApex();
      if (correctedVerticalSpeed <= -input.apexExitSpeedMetersPerSecond || input.hasCeilingContact) {
        phase("falling");
      }
    } else if (current === "apex" &&
      (correctedVerticalSpeed <= -input.apexExitSpeedMetersPerSecond || input.hasCeilingContact)) {
      phase("falling");
    }
  }

  return Object.freeze({
    verticalPhase: current,
    phaseEnteredTick,
    transitionSequence: sequence,
    landingTicksRemaining,
    apexCrossedInAirborneEpisode: apexCrossed,
    correctedVerticalSpeedMetersPerSecond: correctedVerticalSpeed,
    events: Object.freeze(events),
  });
}
