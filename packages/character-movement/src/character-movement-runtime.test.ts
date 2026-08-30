import { describe, expect, it } from "vitest";

import type {
  BodyResolutionV1,
  BodySampleV1,
  CharacterMovementCommandV1,
  CharacterMovementRuntimeStateV1,
  MovementCommitV1,
  MovementTickTokenV1,
} from "./character-movement-contracts.js";
import {
  createCharacterMovementRuntimeV1,
  hashCharacterMovementStateV1,
  parseCharacterMovementRuntimeOptionsV1,
  type CharacterMovementRuntimeOptionsV1,
} from "./character-movement-runtime.js";

const FIXED_DELTA = 1 / 60;

function runtimeState(overrides: Partial<CharacterMovementRuntimeStateV1> = {}): CharacterMovementRuntimeStateV1 {
  return {
    schemaVersion: 1,
    coyoteTicksRemaining: 0,
    jumpBufferTicksRemaining: 0,
    variableJumpHoldTicksRemaining: 0,
    landingTicksRemaining: 0,
    apexCrossedInAirborneEpisode: false,
    ...overrides,
  };
}

function initialCommit(overrides: Partial<MovementCommitV1> = {}): MovementCommitV1 {
  const tick = overrides.tick ?? 0;
  const velocity = overrides.linearVelocityMetersPerSecondXYZ ?? [0, 0, 0];
  return {
    schemaVersion: 1,
    tick,
    positionMetersXYZ: [0, 1, 0],
    facingYawRadians: 0,
    linearVelocityMetersPerSecondXYZ: velocity,
    locomotion: {
      schemaVersion: 2,
      status: "active",
      mobilityMode: "grounded",
      gait: "idle",
      verticalPhase: "none",
      supportMode: "supported",
      movementMedium: "ground",
      facingYawRadians: 0,
      linearVelocity: { x: velocity[0], y: velocity[1], z: velocity[2] },
      horizontalSpeedMetersPerSecond: Math.hypot(velocity[0], velocity[2]),
      committedTick: tick,
      phaseEnteredTick: tick,
      transitionSequence: 0,
    },
    transitionEvents: [],
    ...overrides,
  };
}

function unsupportedFallingCommit(overrides: Partial<MovementCommitV1> = {}): MovementCommitV1 {
  const grounded = initialCommit();
  if (grounded.locomotion.status !== "active") throw new Error("test fixture must be active");
  return initialCommit({
    linearVelocityMetersPerSecondXYZ: [0, -1, 0],
    locomotion: {
      ...grounded.locomotion,
      mobilityMode: "airborne",
      gait: "none",
      verticalPhase: "falling",
      supportMode: "unsupported",
      movementMedium: "air",
      linearVelocity: { x: 0, y: -1, z: 0 },
    },
    ...overrides,
  });
}

function options(
  commit = initialCommit(),
  state: CharacterMovementRuntimeStateV1 = runtimeState(),
): CharacterMovementRuntimeOptionsV1 {
  return {
    schemaVersion: 1,
    fixedDeltaSeconds: FIXED_DELTA,
    jumpVariantPolicy: { mode: "hold-height" },
    initialState: { ...commit, runtimeState: state },
    walkSpeedMetersPerSecond: 2.4,
    runSpeedMetersPerSecond: 4,
    accelerationMetersPerSecondSquared: 16,
    decelerationMetersPerSecondSquared: 22,
    airControlRatio: 0.3,
    gravityMetersPerSecondSquared: 9.81,
    jumpSpeedMetersPerSecond: 5.5,
    coyoteTimeSeconds: 0.1,
    jumpBufferSeconds: 0.12,
    variableJumpHoldSeconds: 0.18,
    jumpHoldGravityRatio: 0.45,
    jumpReleaseGravityRatio: 2,
    landingDurationTicks: 2,
    apexEnterSpeedMetersPerSecond: 0.05,
    apexExitSpeedMetersPerSecond: 0.15,
  };
}

function command(tick: number, overrides: Partial<CharacterMovementCommandV1> = {}): CharacterMovementCommandV1 {
  return {
    schemaVersion: 1,
    tick,
    fixedDeltaSeconds: FIXED_DELTA,
    movementInputXZ: [0, 0],
    runRequested: false,
    jumpPressed: false,
    jumpHeld: false,
    viewYawRadians: 0,
    layeredMoves: [],
    ...overrides,
  };
}

function sample(
  token: MovementTickTokenV1,
  tick: number,
  overrides: Partial<BodySampleV1> = {},
): BodySampleV1 {
  return {
    schemaVersion: 1,
    token,
    tick,
    positionMetersXYZ: [0, 1, 0],
    linearVelocityMetersPerSecondXYZ: [0, 0, 0],
    support: {
      mode: "supported",
      pointMetersXYZ: [0, 0, 0],
      normalXYZ: [0, 1, 0],
      isDynamic: false,
    },
    ...overrides,
  };
}

function resolution(
  token: MovementTickTokenV1,
  tick: number,
  overrides: Partial<BodyResolutionV1> = {},
): BodyResolutionV1 {
  return {
    schemaVersion: 1,
    token,
    tick,
    positionMetersXYZ: [0, 1, 0],
    appliedTranslationMetersXYZ: [0, 0, 0],
    linearVelocityMetersPerSecondXYZ: [0, 0, 0],
    support: {
      mode: "supported",
      pointMetersXYZ: [0, 0, 0],
      normalXYZ: [0, 1, 0],
      isDynamic: false,
    },
    hasCeilingContact: false,
    isTranslationLimited: false,
    ...overrides,
  };
}

function transact(
  runtime: ReturnType<typeof createCharacterMovementRuntimeV1>,
  value: CharacterMovementCommandV1,
  sampleOverrides: Partial<BodySampleV1> = {},
  resolutionOverrides: Partial<BodyResolutionV1> = {},
) {
  const token = runtime.beginTick(value);
  const bodySample = sample(token, value.tick, {
    positionMetersXYZ: runtime.snapshot().positionMetersXYZ,
    ...sampleOverrides,
  });
  const proposal = runtime.proposeMovement(token, bodySample);
  const appliedTranslationMetersXYZ = resolutionOverrides.appliedTranslationMetersXYZ ??
    (resolutionOverrides.isTranslationLimited === true
      ? [0, 0, 0] as const
      : proposal.translationDeltaMetersXYZ);
  const positionMetersXYZ = resolutionOverrides.positionMetersXYZ ?? ([
    bodySample.positionMetersXYZ[0] + appliedTranslationMetersXYZ[0],
    bodySample.positionMetersXYZ[1] + appliedTranslationMetersXYZ[1],
    bodySample.positionMetersXYZ[2] + appliedTranslationMetersXYZ[2],
  ] as const);
  const translationDifference = Math.max(
    ...appliedTranslationMetersXYZ.map((entry, axis) =>
      Math.abs(entry - proposal.translationDeltaMetersXYZ[axis]!)
    ),
  );
  const commit = runtime.reconcile(token, resolution(token, value.tick, {
    appliedTranslationMetersXYZ,
    positionMetersXYZ,
    isTranslationLimited: resolutionOverrides.isTranslationLimited ?? translationDifference > 1e-9,
    ...resolutionOverrides,
  }));
  return { token, proposal, commit };
}

describe("CharacterMovementRuntime options", () => {
  it("strictly parses and freezes one fixed Tick rate, initial state and Golden feel", () => {
    const parsed = parseCharacterMovementRuntimeOptionsV1(options());
    expect(parsed).toEqual(options());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.initialState.runtimeState)).toBe(true);
  });

  it("rejects Command Tick-rate changes after construction", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    expect(() => runtime.beginTick(command(1, { fixedDeltaSeconds: 1 / 30 })))
      .toThrow("3C_INPUT_INVALID");
  });

  it("admits a split Episode only under the canonical split policy", () => {
    const jumpEpisode = {
      schemaVersion: 1,
      variant: "small",
      phase: "buffered",
      startedTick: 0,
      committedTick: 0,
    } as const;
    const initialState = {
      ...unsupportedFallingCommit({ jumpEpisode }),
      runtimeState: runtimeState({ jumpBufferTicksRemaining: 1 }),
    };
    expect(() => parseCharacterMovementRuntimeOptionsV1({
      ...options(),
      initialState,
    })).toThrow("3C_INPUT_INVALID");
    expect(parseCharacterMovementRuntimeOptionsV1({
      ...options(),
      jumpVariantPolicy: {
        mode: "run-selects-variant",
        smallAnticipationSeconds: 0.08,
        largeAnticipationSeconds: 0.16,
      },
      initialState,
    }).initialState.jumpEpisode).toEqual(jumpEpisode);
  });

  it.each([
    ["walk above run", { walkSpeedMetersPerSecond: 5 }],
    ["negative acceleration", { accelerationMetersPerSecondSquared: -1 }],
    ["air ratio above one", { airControlRatio: 1.1 }],
    ["zero gravity", { gravityMetersPerSecondSquared: 0 }],
    ["hold ratio above one", { jumpHoldGravityRatio: 1.1 }],
    ["release ratio below one", { jumpReleaseGravityRatio: 0.9 }],
    ["zero landing Ticks", { landingDurationTicks: 0 }],
    ["inverted apex hysteresis", { apexEnterSpeedMetersPerSecond: 0.2 }],
  ])("rejects %s", (_label, changed) => {
    expect(() => parseCharacterMovementRuntimeOptionsV1({ ...options(), ...changed }))
      .toThrow("3C_INPUT_INVALID");
  });
});

describe("CharacterMovementRuntime transaction and locomotion", () => {
  it.each([
    ["idle", [0, 0] as const, false, [0, 0, 0] as const, "idle"],
    ["walk", [0, 1] as const, false, [0, 0, -2] as const, "walk"],
    ["run", [0, 1] as const, true, [0, 0, -4] as const, "run"],
  ])("commits resolved %s gait", (_label, movementInputXZ, runRequested, velocity, gait) => {
    const runtime = createCharacterMovementRuntimeV1(options());
    const { commit } = transact(
      runtime,
      command(1, { movementInputXZ, runRequested }),
      {},
      { linearVelocityMetersPerSecondXYZ: velocity },
    );
    expect(commit.locomotion).toMatchObject({ gait, supportMode: "supported", verticalPhase: "none" });
  });

  it("aligns proposed and committed facing with off-axis movement", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    const { proposal, commit } = transact(runtime, command(1, { movementInputXZ: [0.6, 0.8] }));

    for (const facingYawRadians of [
      proposal.proposedFacingYawRadians,
      commit.facingYawRadians,
    ]) {
      expect(-Math.sin(facingYawRadians)).toBeCloseTo(0.6);
      expect(-Math.cos(facingYawRadians)).toBeCloseTo(-0.8);
    }
  });

  it("stages jump without mutation, then commits takeoff from BodyResolution", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    const before = runtime.snapshot();
    const token = runtime.beginTick(command(1, { jumpPressed: true, jumpHeld: true }));
    const proposal = runtime.proposeMovement(token, sample(token, 1));
    expect(runtime.snapshot()).toEqual(before);
    expect(proposal.proposedLinearVelocityMetersPerSecondXYZ[1]).toBe(5.5);
    const commit = runtime.reconcile(token, resolution(token, 1, {
      positionMetersXYZ: [0, 1 + proposal.translationDeltaMetersXYZ[1], 0],
      appliedTranslationMetersXYZ: proposal.translationDeltaMetersXYZ,
      linearVelocityMetersPerSecondXYZ: [0, 5.5, 0],
      support: { mode: "unsupported" },
    }));
    expect(commit.locomotion).toMatchObject({
      mobilityMode: "airborne",
      verticalPhase: "takeoff",
      supportMode: "unsupported",
    });
    expect(commit.transitionEvents[0]).toMatchObject({
      type: "phase-changed",
      fromVerticalPhase: "none",
      toVerticalPhase: "takeoff",
    });
  });

  it("uses hold versus release gravity and supports coyote success and expiry", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    const departure = transact(runtime, command(1), {}, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, -0.2, 0],
    });
    expect(departure.commit.locomotion).toMatchObject({ verticalPhase: "falling" });
    const coyote = transact(runtime, command(2, { jumpPressed: true, jumpHeld: true }), {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, -0.2, 0],
    }, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, 5.5, 0],
    });
    expect(coyote.proposal.proposedLinearVelocityMetersPerSecondXYZ[1]).toBe(5.5);

    const risingCommit = coyote.commit;
    const heldRuntime = createCharacterMovementRuntimeV1(options(risingCommit, runtime.snapshot().runtimeState));
    const releasedRuntime = createCharacterMovementRuntimeV1(options(risingCommit, runtime.snapshot().runtimeState));
    const held = heldRuntime.beginTick(command(3, { jumpHeld: true }));
    const heldProposal = heldRuntime.proposeMovement(held, sample(held, 3, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, 5, 0],
    }));
    const released = releasedRuntime.beginTick(command(3, { jumpHeld: false }));
    const releasedProposal = releasedRuntime.proposeMovement(released, sample(released, 3, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, 5, 0],
    }));
    expect(heldProposal.proposedLinearVelocityMetersPerSecondXYZ[1])
      .toBeGreaterThan(releasedProposal.proposedLinearVelocityMetersPerSecondXYZ[1]);

    const expired = createCharacterMovementRuntimeV1(options());
    for (let tick = 1; tick <= 7; tick += 1) {
      transact(expired, command(tick), { support: { mode: "unsupported" } }, {
        support: { mode: "unsupported" },
        linearVelocityMetersPerSecondXYZ: [0, -1, 0],
      });
    }
    const expiredToken = expired.beginTick(command(8, { jumpPressed: true }));
    const expiredProposal = expired.proposeMovement(expiredToken, sample(expiredToken, 8, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
    }));
    expect(expiredProposal.proposedLinearVelocityMetersPerSecondXYZ[1]).toBeLessThan(0);
  });

  it("buffers jump while airborne and consumes it on stable support", () => {
    const airborne = initialCommit({
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
      locomotion: {
        schemaVersion: 2,
        status: "active",
        mobilityMode: "airborne",
        gait: "none",
        verticalPhase: "falling",
        supportMode: "unsupported",
        movementMedium: "air",
        facingYawRadians: 0,
        linearVelocity: { x: 0, y: -1, z: 0 },
        horizontalSpeedMetersPerSecond: 0,
        committedTick: 0,
        phaseEnteredTick: 0,
        transitionSequence: 1,
      },
    });
    const runtime = createCharacterMovementRuntimeV1(options(airborne));
    transact(runtime, command(1, { jumpPressed: true }), { support: { mode: "unsupported" } }, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
    });
    const token = runtime.beginTick(command(2));
    const proposal = runtime.proposeMovement(token, sample(token, 2));
    expect(proposal.proposedLinearVelocityMetersPerSecondXYZ[1]).toBe(5.5);
  });

  it("scopes coyote to stable-supported falling episodes and consumes it on takeoff", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    transact(runtime, command(1), {}, {});
    const takeoff = transact(runtime, command(2, { jumpPressed: true, jumpHeld: true }), {}, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, 5.5, 0],
      isTranslationLimited: true,
    });
    expect(takeoff.commit.locomotion).toMatchObject({ verticalPhase: "takeoff" });
    expect(runtime.snapshot().runtimeState.coyoteTicksRemaining).toBe(0);
    const repeatToken = runtime.beginTick(command(3, { jumpPressed: true, jumpHeld: true }));
    const repeat = runtime.proposeMovement(repeatToken, sample(repeatToken, 3, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, 5, 0],
    }));
    expect(repeat.proposedLinearVelocityMetersPerSecondXYZ[1]).toBeLessThan(5.5);

    const falling = initialCommit({
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
      locomotion: {
        schemaVersion: 2,
        status: "active",
        mobilityMode: "airborne",
        gait: "none",
        verticalPhase: "falling",
        supportMode: "unsupported",
        movementMedium: "air",
        facingYawRadians: 0,
        linearVelocity: { x: 0, y: -1, z: 0 },
        horizontalSpeedMetersPerSecond: 0,
        committedTick: 0,
        phaseEnteredTick: 0,
        transitionSequence: 1,
      },
    });
    const sliding = createCharacterMovementRuntimeV1(options(
      falling,
      runtimeState({ coyoteTicksRemaining: 3 }),
    ));
    const slidingToken = sliding.beginTick(command(1, { jumpPressed: true }));
    const slidingProposal = sliding.proposeMovement(slidingToken, sample(slidingToken, 1, {
      support: {
        mode: "sliding",
        pointMetersXYZ: [0, 0, 0],
        normalXYZ: [0, 1, 0],
        isDynamic: false,
      },
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
    }));
    expect(slidingProposal.proposedLinearVelocityMetersPerSecondXYZ[1]).not.toBe(5.5);
  });

  it("allows the exact first unsupported ledge Tick after reset and preserves snapshot continuation", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    const restored = createCharacterMovementRuntimeV1(options());
    restored.reset(runtime.snapshot());
    for (const candidate of [runtime, restored]) {
      const token = candidate.beginTick(command(1, { jumpPressed: true, jumpHeld: true }));
      const proposal = candidate.proposeMovement(token, sample(token, 1, {
        support: { mode: "unsupported" },
      }));
      expect(proposal.proposedLinearVelocityMetersPerSecondXYZ[1]).toBe(5.5);
    }
  });

  it("disables first-unsupported ledge qualification when the coyote window is zero", () => {
    const zeroWindowOptions = {
      ...options(),
      coyoteTimeSeconds: 0,
    };
    const runtime = createCharacterMovementRuntimeV1(zeroWindowOptions);
    const restored = createCharacterMovementRuntimeV1(zeroWindowOptions);
    restored.reset(runtime.snapshot());
    for (const candidate of [runtime, restored]) {
      const token = candidate.beginTick(command(1, { jumpPressed: true, jumpHeld: true }));
      const proposal = candidate.proposeMovement(token, sample(token, 1, {
        support: { mode: "unsupported" },
      }));
      expect(proposal.proposedLinearVelocityMetersPerSecondXYZ[1]).toBeLessThan(0);
    }
  });

  it.each([
    ["sub-one-Tick", FIXED_DELTA / 2],
    ["one-Tick", FIXED_DELTA],
  ])("counts a %s coyote window as exactly the first unsupported Tick", (_label, coyoteTimeSeconds) => {
    const runtime = createCharacterMovementRuntimeV1({ ...options(), coyoteTimeSeconds });
    const firstToken = runtime.beginTick(command(1, { jumpPressed: true }));
    const first = runtime.proposeMovement(firstToken, sample(firstToken, 1, {
      support: { mode: "unsupported" },
    }));
    expect(first.proposedLinearVelocityMetersPerSecondXYZ[1]).toBe(5.5);
    runtime.reconcile(firstToken, resolution(firstToken, 1, {
      positionMetersXYZ: [0, 1 + first.translationDeltaMetersXYZ[1], 0],
      appliedTranslationMetersXYZ: first.translationDeltaMetersXYZ,
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
      support: { mode: "unsupported" },
    }));
    expect(runtime.snapshot().runtimeState.coyoteTicksRemaining).toBe(0);

    const secondToken = runtime.beginTick(command(2, { jumpPressed: true }));
    const second = runtime.proposeMovement(secondToken, sample(secondToken, 2, {
      positionMetersXYZ: runtime.snapshot().positionMetersXYZ,
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
      support: { mode: "unsupported" },
    }));
    expect(second.proposedLinearVelocityMetersPerSecondXYZ[1]).toBeLessThan(0);
  });

  it("counts the first unsupported ledge Tick inside the frozen coyote window", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    transact(runtime, command(1), { support: { mode: "unsupported" } }, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
    });
    expect(runtime.snapshot().runtimeState.coyoteTicksRemaining).toBe(5);
    for (let tick = 2; tick <= 6; tick += 1) {
      transact(runtime, command(tick), { support: { mode: "unsupported" } }, {
        support: { mode: "unsupported" },
        linearVelocityMetersPerSecondXYZ: [0, -1, 0],
      });
    }
    const expiredToken = runtime.beginTick(command(7, { jumpPressed: true }));
    const expired = runtime.proposeMovement(expiredToken, sample(expiredToken, 7, {
      positionMetersXYZ: runtime.snapshot().positionMetersXYZ,
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
    }));
    expect(expired.proposedLinearVelocityMetersPerSecondXYZ[1]).toBeLessThan(0);
  });

  it("commits takeoff only when resolved unsupported velocity proves ascent", () => {
    const grounded = createCharacterMovementRuntimeV1(options());
    const token = grounded.beginTick(command(1, { jumpPressed: true, jumpHeld: true }));
    const proposal = grounded.proposeMovement(token, sample(token, 1));
    expect(proposal.proposedLinearVelocityMetersPerSecondXYZ[1]).toBe(5.5);
    const rejected = grounded.reconcile(token, resolution(token, 1, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
      isTranslationLimited: true,
    }));
    expect(rejected.locomotion).toMatchObject({ verticalPhase: "falling" });
    expect(grounded.snapshot().runtimeState).toMatchObject({
      coyoteTicksRemaining: expect.any(Number),
      jumpBufferTicksRemaining: expect.any(Number),
      variableJumpHoldTicksRemaining: 0,
    });
    expect(grounded.snapshot().runtimeState.coyoteTicksRemaining).toBeGreaterThan(0);
    expect(grounded.snapshot().runtimeState.jumpBufferTicksRemaining).toBeGreaterThan(0);
    const retryToken = grounded.beginTick(command(2));
    expect(grounded.proposeMovement(retryToken, sample(retryToken, 2))
      .proposedLinearVelocityMetersPerSecondXYZ[1]).toBe(5.5);

    const falling = {
      ...rejected,
      transitionEvents: [],
    };
    const coyote = createCharacterMovementRuntimeV1(options(
      falling,
      runtimeState({ coyoteTicksRemaining: 3 }),
    ));
    const coyoteToken = coyote.beginTick(command(2, { jumpPressed: true }));
    coyote.proposeMovement(coyoteToken, sample(coyoteToken, 2, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
    }));
    const coyoteRejected = coyote.reconcile(coyoteToken, resolution(coyoteToken, 2, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
      isTranslationLimited: true,
    }));
    expect(coyoteRejected.locomotion).toMatchObject({ verticalPhase: "falling" });
    expect(coyote.snapshot().runtimeState.coyoteTicksRemaining).toBeGreaterThan(0);
    expect(coyote.snapshot().runtimeState.jumpBufferTicksRemaining).toBeGreaterThan(0);
  });

  it("clears takeoff latches when an immediate ceiling resolves through apex to falling", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    const result = transact(runtime, command(1, { jumpPressed: true, jumpHeld: true }), {}, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, 3, 0],
      hasCeilingContact: true,
      isTranslationLimited: true,
    });
    expect(result.commit.linearVelocityMetersPerSecondXYZ[1]).toBe(0);
    expect(result.commit.locomotion).toMatchObject({ verticalPhase: "falling" });
    expect(runtime.snapshot().runtimeState).toMatchObject({
      coyoteTicksRemaining: 0,
      jumpBufferTicksRemaining: 0,
      variableJumpHoldTicksRemaining: 0,
      apexCrossedInAirborneEpisode: true,
    });
  });

  it("commits reconciled collision-limited root motion, ceiling correction and legal events", () => {
    const rising = initialCommit({
      linearVelocityMetersPerSecondXYZ: [0, 2, 0],
      locomotion: {
        schemaVersion: 2,
        status: "active",
        mobilityMode: "airborne",
        gait: "none",
        verticalPhase: "rising",
        supportMode: "unsupported",
        movementMedium: "air",
        facingYawRadians: 0,
        linearVelocity: { x: 0, y: 2, z: 0 },
        horizontalSpeedMetersPerSecond: 0,
        committedTick: 0,
        phaseEnteredTick: 0,
        transitionSequence: 2,
      },
    });
    const runtime = createCharacterMovementRuntimeV1(options(rising, runtimeState({
      variableJumpHoldTicksRemaining: 5,
    })));
    const rootMove = {
      schemaVersion: 1 as const,
      kind: "root-motion" as const,
      id: "vault",
      priority: 10,
      startedTick: 1,
      rootMotionSourceRef: "worldkit://root-motion/vault@1" as const,
      rootMotionSourceHash: `sha256:${"a".repeat(64)}` as const,
      translationDeltaMetersXYZ: [0, 0, -1] as const,
      facingYawDeltaRadians: 0.25,
    };
    const token = runtime.beginTick(command(1, { layeredMoves: [rootMove] }));
    const proposal = runtime.proposeMovement(token, sample(token, 1, {
      support: { mode: "unsupported" },
      linearVelocityMetersPerSecondXYZ: [0, 2, 0],
    }));
    expect(proposal.translationDeltaMetersXYZ[2]).toBeLessThan(-0.9);
    const commit = runtime.reconcile(token, resolution(token, 1, {
      positionMetersXYZ: [0, 1, -0.2],
      appliedTranslationMetersXYZ: [0, 0, -0.2],
      linearVelocityMetersPerSecondXYZ: [0, 3, 0],
      support: { mode: "unsupported" },
      hasCeilingContact: true,
      isTranslationLimited: true,
    }));
    expect(commit.positionMetersXYZ).toEqual([0, 1, -0.2]);
    expect(commit.linearVelocityMetersPerSecondXYZ[1]).toBe(0);
    expect(commit.locomotion).toMatchObject({ verticalPhase: "falling" });
    expect(commit.transitionEvents.map((event) => event.type))
      .toEqual(["phase-changed", "apex-crossed", "phase-changed"]);
  });
});

describe("CharacterMovementRuntime lifecycle and replay", () => {
  it("keeps the byte snapshot identical on invalid resolution and permits retry", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    const token = runtime.beginTick(command(1));
    runtime.proposeMovement(token, sample(token, 1));
    const before = JSON.stringify(runtime.snapshot());
    expect(() => runtime.reconcile(token, { ...resolution(token, 1), tick: 2 }))
      .toThrow("3C_TICK_TOKEN_STALE");
    expect(JSON.stringify(runtime.snapshot())).toBe(before);
    expect(runtime.reconcile(token, resolution(token, 1)).tick).toBe(1);
  });

  it("rejects incoherent BodyResolution fields atomically and accepts corrected same-token retry", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    const token = runtime.beginTick(command(1));
    const proposal = runtime.proposeMovement(token, sample(token, 1));
    const before = JSON.stringify(runtime.snapshot());
    expect(() => runtime.reconcile(token, resolution(token, 1, {
      positionMetersXYZ: [9, 1, 0],
      appliedTranslationMetersXYZ: [0, 0, 0],
    }))).toThrow("3C_INPUT_INVALID");
    expect(JSON.stringify(runtime.snapshot())).toBe(before);
    expect(runtime.reconcile(token, resolution(token, 1, {
      positionMetersXYZ: [
        proposal.translationDeltaMetersXYZ[0],
        1 + proposal.translationDeltaMetersXYZ[1],
        proposal.translationDeltaMetersXYZ[2],
      ],
      appliedTranslationMetersXYZ: proposal.translationDeltaMetersXYZ,
    })).tick).toBe(1);
  });

  it("requires translation-limited to describe a material proposal/application difference", () => {
    const unlimited = createCharacterMovementRuntimeV1(options());
    const unlimitedToken = unlimited.beginTick(command(1, { movementInputXZ: [0, 1] }));
    unlimited.proposeMovement(unlimitedToken, sample(unlimitedToken, 1));
    expect(() => unlimited.reconcile(unlimitedToken, resolution(unlimitedToken, 1, {
      linearVelocityMetersPerSecondXYZ: [0, 0, -1],
      isTranslationLimited: false,
    }))).toThrow("3C_INPUT_INVALID");

    const limited = createCharacterMovementRuntimeV1(options());
    const limitedToken = limited.beginTick(command(1));
    limited.proposeMovement(limitedToken, sample(limitedToken, 1));
    expect(() => limited.reconcile(limitedToken, resolution(limitedToken, 1, {
      isTranslationLimited: true,
    }))).toThrow("3C_INPUT_INVALID");
  });

  it("rejects zero and non-unit support normals before proposal or commit", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    const token = runtime.beginTick(command(1));
    expect(() => runtime.proposeMovement(token, sample(token, 1, {
      support: {
        mode: "supported",
        pointMetersXYZ: [0, 0, 0],
        normalXYZ: [0, 0, 0],
        isDynamic: false,
      },
    }))).toThrow("3C_INPUT_INVALID");
    expect(() => runtime.proposeMovement(token, sample(token, 1, {
      support: {
        mode: "supported",
        pointMetersXYZ: [0, 0, 0],
        normalXYZ: [0, 2, 0],
        isDynamic: false,
      },
    }))).toThrow("3C_INPUT_INVALID");
    expect(runtime.proposeMovement(token, sample(token, 1))).toBeDefined();
    const before = JSON.stringify(runtime.snapshot());
    expect(() => runtime.reconcile(token, resolution(token, 1, {
      support: {
        mode: "supported",
        pointMetersXYZ: [0, 0, 0],
        normalXYZ: [0, 0, 0],
        isDynamic: false,
      },
    }))).toThrow("3C_INPUT_INVALID");
    expect(JSON.stringify(runtime.snapshot())).toBe(before);
    expect(runtime.reconcile(token, resolution(token, 1)).tick).toBe(1);
  });

  it("rejects LayeredMove overflow before activating a Tick and permits a valid retry", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    const overflow = (id: string) => ({
      schemaVersion: 1 as const,
      kind: "impulse" as const,
      id,
      priority: 1,
      startedTick: 1,
      velocityDeltaMetersPerSecondXYZ: [Number.MAX_VALUE, 0, 0] as const,
    });
    expect(() => runtime.beginTick(command(1, {
      layeredMoves: [overflow("overflow-a"), overflow("overflow-b")],
    }))).toThrow("3C_INPUT_INVALID");
    expect(runtime.beginTick(command(1))).toBeDefined();
  });

  it("rejects non-finite proposal arithmetic and permits a corrected same-token sample", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    const token = runtime.beginTick(command(1));
    expect(() => runtime.proposeMovement(token, sample(token, 1, {
      linearVelocityMetersPerSecondXYZ: [Number.MAX_VALUE, 0, Number.MAX_VALUE],
    }))).toThrow("3C_INPUT_INVALID");
    expect(runtime.proposeMovement(token, sample(token, 1))).toBeDefined();
  });

  it("uses stable diagnostics for duplicate, stale, cross-runtime, reset and disposed cases", () => {
    const runtime = createCharacterMovementRuntimeV1(options());
    const other = createCharacterMovementRuntimeV1(options());
    const token = runtime.beginTick(command(1));
    runtime.proposeMovement(token, sample(token, 1));
    expect(() => runtime.proposeMovement(token, sample(token, 1)))
      .toThrow("3C_SUPPORT_SAMPLE_DUPLICATE");
    expect(() => other.proposeMovement(token, sample(token, 1))).toThrow("3C_TICK_TOKEN_STALE");
    runtime.reconcile(token, resolution(token, 1));
    expect(() => runtime.reconcile(token, resolution(token, 1)))
      .toThrow("3C_BODY_RESOLUTION_DUPLICATE");
    runtime.reset();
    expect(() => runtime.reconcile(token, resolution(token, 1))).toThrow("3C_TICK_TOKEN_STALE");
    runtime.dispose();
    expect(() => runtime.snapshot()).toThrow("3C_RUNTIME_DISPOSED");
    expect(() => runtime.beginTick(command(1))).toThrow("3C_RUNTIME_DISPOSED");
  });

  it("restores mid-coyote, mid-buffer, mid-hold, landing and apex-latch continuations exactly", () => {
    const active = initialCommit().locomotion;
    if (active.status !== "active") throw new Error("test fixture must be active");
    const airborne = (
      verticalPhase: "rising" | "apex" | "falling",
      verticalSpeed: number,
      transitionSequence: number,
    ): MovementCommitV1 => initialCommit({
      linearVelocityMetersPerSecondXYZ: [0, verticalSpeed, 0],
      locomotion: {
        ...active,
        mobilityMode: "airborne",
        gait: "none",
        verticalPhase,
        supportMode: "unsupported",
        movementMedium: "air",
        linearVelocity: { x: 0, y: verticalSpeed, z: 0 },
        transitionSequence,
      },
    });
    const landing = initialCommit({
      locomotion: { ...active, verticalPhase: "landing" },
    });
    const compareContinuation = (
      commit: MovementCommitV1,
      state: CharacterMovementRuntimeStateV1,
      nextCommand: CharacterMovementCommandV1,
      sampleOverrides: Partial<BodySampleV1>,
      resolutionOverrides: Partial<BodyResolutionV1>,
    ) => {
      const runtime = createCharacterMovementRuntimeV1(options(commit, state));
      const restored = createCharacterMovementRuntimeV1(options());
      restored.reset(runtime.snapshot());
      expect(restored.snapshot()).toEqual(runtime.snapshot());
      const a = transact(runtime, nextCommand, sampleOverrides, resolutionOverrides);
      const b = transact(restored, nextCommand, sampleOverrides, resolutionOverrides);
      expect(b.proposal).toEqual(a.proposal);
      expect(b.commit).toEqual(a.commit);
      expect(restored.snapshot()).toEqual(runtime.snapshot());
    };

    compareContinuation(
      airborne("falling", -1, 1),
      runtimeState({ coyoteTicksRemaining: 3 }),
      command(1, { jumpPressed: true, jumpHeld: true }),
      { support: { mode: "unsupported" }, linearVelocityMetersPerSecondXYZ: [0, -1, 0] },
      { support: { mode: "unsupported" }, linearVelocityMetersPerSecondXYZ: [0, 5.5, 0] },
    );
    compareContinuation(
      airborne("falling", -1, 1),
      runtimeState({ jumpBufferTicksRemaining: 4 }),
      command(1),
      {},
      { support: { mode: "unsupported" }, linearVelocityMetersPerSecondXYZ: [0, 5.5, 0] },
    );
    compareContinuation(
      airborne("rising", 5, 2),
      runtimeState({ variableJumpHoldTicksRemaining: 5 }),
      command(1, { jumpHeld: true }),
      { support: { mode: "unsupported" }, linearVelocityMetersPerSecondXYZ: [0, 5, 0] },
      { support: { mode: "unsupported" }, linearVelocityMetersPerSecondXYZ: [0, 4.9, 0] },
    );
    compareContinuation(
      landing,
      runtimeState({ landingTicksRemaining: 1 }),
      command(1),
      {},
      {},
    );
    compareContinuation(
      airborne("apex", -0.1, 4),
      runtimeState({ apexCrossedInAirborneEpisode: true }),
      command(1),
      { support: { mode: "unsupported" }, linearVelocityMetersPerSecondXYZ: [0, -0.1, 0] },
      { support: { mode: "unsupported" }, linearVelocityMetersPerSecondXYZ: [0, -0.2, 0] },
    );
  });

  it("produces identical hashes regardless of 30/60/120-like render snapshot sampling", () => {
    const run = (renderSamplesPerTick: number) => {
      const runtime = createCharacterMovementRuntimeV1(options());
      for (let tick = 1; tick <= 8; tick += 1) {
        transact(runtime, command(tick, { movementInputXZ: [0, 1], runRequested: tick >= 4 }), {}, {
          positionMetersXYZ: [0, 1, -tick / 30],
          appliedTranslationMetersXYZ: [0, 0, -1 / 30],
          linearVelocityMetersPerSecondXYZ: [0, 0, tick >= 4 ? -4 : -2],
        });
        for (let sampleIndex = 0; sampleIndex < renderSamplesPerTick; sampleIndex += 1) runtime.snapshot();
      }
      return runtime.snapshot().stateHash;
    };
    expect(run(1)).toBe(run(2));
    expect(run(2)).toBe(run(4));
  });

  it("includes every serialized runtime counter in the canonical state hash", () => {
    const commit = initialCommit();
    const a = hashCharacterMovementStateV1({ ...commit, runtimeState: runtimeState() });
    const b = hashCharacterMovementStateV1({
      ...commit,
      runtimeState: runtimeState({ jumpBufferTicksRemaining: 1 }),
    });
    expect(a).not.toBe(b);
  });

  it("includes the committed jump Episode in the canonical state hash", () => {
    const commit = initialCommit();
    const withoutEpisode = hashCharacterMovementStateV1({
      ...commit,
      runtimeState: runtimeState(),
    });
    const withEpisode = hashCharacterMovementStateV1({
      ...commit,
      jumpEpisode: {
        schemaVersion: 1,
        variant: "large",
        phase: "anticipating",
        startedTick: 0,
        anticipationStartedTick: 0,
        committedTick: 0,
        anticipationTicksRemaining: 1,
      },
      runtimeState: runtimeState(),
    });
    expect(withEpisode).not.toBe(withoutEpisode);
  });

  it("rejects correctly hashed but unreachable phase/counter/latch combinations", () => {
    const active = initialCommit().locomotion;
    if (active.status !== "active") throw new Error("test fixture must be active");
    const airborne = (verticalPhase: "takeoff" | "rising" | "falling", verticalSpeed: number) => ({
      ...initialCommit({
        linearVelocityMetersPerSecondXYZ: [0, verticalSpeed, 0],
        locomotion: {
          ...active,
          mobilityMode: "airborne" as const,
          gait: "none" as const,
          verticalPhase,
          supportMode: "unsupported" as const,
          movementMedium: "air" as const,
          linearVelocity: { x: 0, y: verticalSpeed, z: 0 },
          transitionSequence: 1,
        },
      }),
      runtimeState: runtimeState(),
    });
    for (const state of [
      {
        ...initialCommit({
          jumpEpisode: {
            schemaVersion: 1,
            variant: "small",
            phase: "buffered",
            startedTick: 0,
            committedTick: 0,
          },
        }),
        runtimeState: runtimeState({ jumpBufferTicksRemaining: 1 }),
      },
      { ...airborne("rising", 1), runtimeState: runtimeState({ apexCrossedInAirborneEpisode: true }) },
      { ...airborne("falling", -1), runtimeState: runtimeState({ variableJumpHoldTicksRemaining: 1 }) },
      { ...initialCommit(), runtimeState: runtimeState({ landingTicksRemaining: 1 }) },
      { ...airborne("rising", 1), runtimeState: runtimeState({ coyoteTicksRemaining: 1 }) },
      {
        ...airborne("falling", -0.01),
        locomotion: { ...airborne("falling", -0.01).locomotion, verticalPhase: "apex" as const },
      },
      airborne("takeoff", 0),
      airborne("takeoff", -1),
      airborne("rising", 0),
      airborne("rising", -1),
    ]) {
      expect(() => hashCharacterMovementStateV1(state)).toThrow("3C_INPUT_INVALID");
    }
    expect(hashCharacterMovementStateV1(airborne("takeoff", 0.051))).toMatch(/^sha256:/);
    expect(hashCharacterMovementStateV1(airborne("rising", 0.051))).toMatch(/^sha256:/);
    expect(hashCharacterMovementStateV1(airborne("falling", -1))).toMatch(/^sha256:/);
    expect(hashCharacterMovementStateV1({
      ...airborne("falling", -1),
      runtimeState: runtimeState({ apexCrossedInAirborneEpisode: true }),
    })).toMatch(/^sha256:/);
  });

  it("rejects positive takeoff and rising snapshots below the locked apex-enter threshold", () => {
    const active = initialCommit().locomotion;
    if (active.status !== "active") throw new Error("test fixture must be active");
    const airborne = (verticalPhase: "takeoff" | "rising", verticalSpeed: number) => ({
      ...initialCommit({
        linearVelocityMetersPerSecondXYZ: [0, verticalSpeed, 0],
        locomotion: {
          ...active,
          mobilityMode: "airborne" as const,
          gait: "none" as const,
          verticalPhase,
          supportMode: "unsupported" as const,
          movementMedium: "air" as const,
          linearVelocity: { x: 0, y: verticalSpeed, z: 0 },
          transitionSequence: 1,
        },
      }),
      runtimeState: runtimeState(),
    });

    for (const phase of ["takeoff", "rising"] as const) {
      for (const verticalSpeed of [0.01, 0.05]) {
        const state = airborne(phase, verticalSpeed);
        expect(hashCharacterMovementStateV1(state)).toMatch(/^sha256:/);
        expect(() => parseCharacterMovementRuntimeOptionsV1(options(state)))
          .toThrow("3C_INPUT_INVALID");

        const runtime = createCharacterMovementRuntimeV1(options());
        expect(() => runtime.reset({
          ...state,
          stateHash: hashCharacterMovementStateV1(state),
        })).toThrow("3C_INPUT_INVALID");
      }
    }

    for (const phase of ["takeoff", "rising"] as const) {
      expect(() => createCharacterMovementRuntimeV1(options(airborne(phase, 0.051))))
        .not.toThrow();
    }
  });
});
