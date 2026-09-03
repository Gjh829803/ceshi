import {
  createCharacterMovementRuntimeV1,
  hashRootMotionSourceV1,
  type BodyResolutionV1,
  type BodySampleV1,
  type BodySupportSampleV1,
  type CharacterMovementCommandV1,
  type CharacterMovementRuntimeV1,
  type CharacterMovementRuntimeOptionsV1,
  type MovementProposalV1,
  type MovementTickTokenV1,
} from "@whitebox-world/character-movement";
import type { GameplayActionStateV1 } from "@whitebox-world/gameplay-contracts";
import {
  createActionPresentationRegistryV1,
  hashActionPresentationBindingV1,
  type ActionPresentationBindingBodyV1,
  type ActionPresentationRegistryV1,
} from "@whitebox-world/subject-actions";
import { describe, expect, it, vi } from "vitest";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import type { BabylonRuntimeSubjectV1 } from "./runtime-subject.js";

type BabylonRuntimeSubjectFixtureV1 = BabylonRuntimeSubjectV1;

import {
  GOLDEN_HUMANOID_TICK_STAGES_V1,
  GoldenHumanoid3CVNextTransactionV1,
  type GoldenCharacterBodyTransactionPortV1,
  type GoldenHumanoidPreparedProjectionV1,
  type GoldenHumanoidProjectionPortV1,
  type GoldenHumanoidTickStageV1,
} from "./golden-humanoid-3c-vnext.js";
import {
  createCharacterMovementSubjectControllerV1,
  CharacterMovementSubjectControllerV1,
} from "./character-movement-component.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;

function movementOptions(): CharacterMovementRuntimeOptionsV1 {
  return {
    schemaVersion: 1,
    fixedDeltaSeconds: 1 / 60,
    jumpVariantPolicy: { mode: "hold-height" },
    initialState: {
      schemaVersion: 1,
      tick: 0,
      positionMetersXYZ: [0, 1, 0],
      facingYawRadians: 0,
      linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      locomotion: {
        schemaVersion: 2,
        status: "active",
        mobilityMode: "grounded",
        gait: "idle",
        verticalPhase: "none",
        supportMode: "supported",
        movementMedium: "ground",
        facingYawRadians: 0,
        linearVelocity: { x: 0, y: 0, z: 0 },
        horizontalSpeedMetersPerSecond: 0,
        committedTick: 0,
        phaseEnteredTick: 0,
        transitionSequence: 0,
      },
      transitionEvents: [],
      runtimeState: {
        schemaVersion: 1,
        coyoteTicksRemaining: 6,
        jumpBufferTicksRemaining: 0,
        variableJumpHoldTicksRemaining: 0,
        landingTicksRemaining: 0,
        apexCrossedInAirborneEpisode: false,
      },
    },
    walkSpeedMetersPerSecond: 3,
    runSpeedMetersPerSecond: 6,
    accelerationMetersPerSecondSquared: 60,
    decelerationMetersPerSecondSquared: 80,
    turnRateRadiansPerSecond: 9,
    airControlRatio: 0.5,
    gravityMetersPerSecondSquared: 9.81,
    jumpSpeedMetersPerSecond: 5.5,
    coyoteTimeSeconds: 0.1,
    jumpBufferSeconds: 0.1,
    variableJumpHoldSeconds: 0.15,
    jumpHoldGravityRatio: 0.35,
    jumpReleaseGravityRatio: 2,
    landingDurationTicks: 2,
    apexEnterSpeedMetersPerSecond: 0.05,
    apexExitSpeedMetersPerSecond: 0.15,
  };
}

function command(
  tick: number,
  overrides: Partial<CharacterMovementCommandV1> = {},
): CharacterMovementCommandV1 {
  const movementInputXZ = overrides.movementInputXZ ?? [0, 0];
  return {
    schemaVersion: 1,
    tick,
    fixedDeltaSeconds: 1 / 60,
    movementInputXZ,
    facingInputXZ: overrides.facingInputXZ ?? movementInputXZ,
    runRequested: false,
    jumpPressed: false,
    jumpHeld: false,
    viewYawRadians: 0,
    layeredMoves: [],
    ...overrides,
  };
}

class TransactionBodyPort implements GoldenCharacterBodyTransactionPortV1 {
  position: [number, number, number] = [0, 1, 0];
  velocity: [number, number, number] = [0, 0, 0];
  support: BodySampleV1["support"] = {
    mode: "supported",
    pointMetersXYZ: [0, 0, 0],
    normalXYZ: [0, 1, 0],
    isDynamic: false,
  };
  beginCalls = 0;
  resolveCalls = 0;
  commitCalls = 0;
  abortCalls = 0;
  throwAt: "begin" | "resolve" | undefined;
  limitTranslationRatio = 1;
  ceiling = false;
  resolutionSupport: BodySampleV1["support"] | undefined;
  #before:
    | Readonly<{ position: readonly [number, number, number]; velocity: readonly [number, number, number]; support: BodySampleV1["support"] }>
    | undefined;
  #token: MovementTickTokenV1 | undefined;

  beginTick(request: { token: MovementTickTokenV1; tick: number }): BodySampleV1 {
    this.beginCalls += 1;
    if (this.throwAt === "begin") throw new Error("BODY_BEGIN_FAILED");
    this.#before = {
      position: [...this.position],
      velocity: [...this.velocity],
      support: this.support,
    };
    this.#token = request.token;
    return Object.freeze({
      schemaVersion: 1,
      token: request.token,
      tick: request.tick,
      positionMetersXYZ: Object.freeze([...this.position]) as readonly [number, number, number],
      linearVelocityMetersPerSecondXYZ: Object.freeze([...this.velocity]) as readonly [number, number, number],
      support: this.support,
    });
  }

  resolve(request: { token: MovementTickTokenV1; proposal: MovementProposalV1 }): BodyResolutionV1 {
    this.resolveCalls += 1;
    if (this.throwAt === "resolve") throw new Error("BODY_RESOLVE_FAILED");
    const delta = request.proposal.translationDeltaMetersXYZ.map(
      (value) => value * this.limitTranslationRatio,
    ) as [number, number, number];
    this.position = this.position.map((value, axis) => value + delta[axis]!) as [number, number, number];
    this.velocity = [...request.proposal.proposedLinearVelocityMetersPerSecondXYZ];
    if (this.ceiling && this.velocity[1] > 0) this.velocity[1] = 0;
    const resolvedSupport = this.resolutionSupport ?? this.support;
    this.support = resolvedSupport;
    this.resolutionSupport = undefined;
    return Object.freeze({
      schemaVersion: 1,
      token: request.token,
      tick: request.proposal.tick,
      positionMetersXYZ: Object.freeze([...this.position]) as readonly [number, number, number],
      appliedTranslationMetersXYZ: Object.freeze(delta),
      linearVelocityMetersPerSecondXYZ: Object.freeze([...this.velocity]) as readonly [number, number, number],
      support: resolvedSupport,
      hasCeilingContact: this.ceiling,
      isTranslationLimited: this.limitTranslationRatio !== 1,
    });
  }

  commitTick(token: MovementTickTokenV1): void {
    expect(token).toBe(this.#token);
    this.commitCalls += 1;
    this.#before = undefined;
    this.#token = undefined;
  }

  abortTick(token: MovementTickTokenV1): void {
    expect(token).toBe(this.#token);
    this.abortCalls += 1;
    if (this.#before !== undefined) {
      this.position = [...this.#before.position];
      this.velocity = [...this.#before.velocity];
      this.support = this.#before.support;
    }
    this.#before = undefined;
    this.#token = undefined;
  }

  reset(): void {
    this.position = [0, 1, 0];
    this.velocity = [0, 0, 0];
    this.#before = undefined;
    this.#token = undefined;
    this.resolutionSupport = undefined;
  }

  resetToState(state: Readonly<{
    positionMetersXYZ: readonly [number, number, number];
    linearVelocityMetersPerSecondXYZ: readonly [number, number, number];
  }>): BodySupportSampleV1 {
    this.position = [...state.positionMetersXYZ];
    this.velocity = [...state.linearVelocityMetersPerSecondXYZ];
    this.#before = undefined;
    this.#token = undefined;
    this.resolutionSupport = undefined;
    return this.support;
  }

  dispose(): void {}
}

class ProjectionPort implements GoldenHumanoidProjectionPortV1 {
  prepareCalls = 0;
  commitCalls = 0;
  abortCalls = 0;
  failPrepare = false;
  failCommit = false;
  committed = false;
  lastInput: Parameters<GoldenHumanoidProjectionPortV1["prepare"]>[0] | undefined;

  prepare(
    input: Parameters<GoldenHumanoidProjectionPortV1["prepare"]>[0],
  ): GoldenHumanoidPreparedProjectionV1 {
    this.prepareCalls += 1;
    this.lastInput = input;
    if (this.failPrepare) throw new Error("PROJECTION_PREPARE_FAILED");
    return {
      commit: () => {
        this.commitCalls += 1;
        this.committed = true;
        if (this.failCommit) throw new Error("PROJECTION_COMMIT_FAILED");
      },
      abort: () => {
        this.abortCalls += 1;
        this.committed = false;
      },
    };
  }
}

function emptyRegistry(): ActionPresentationRegistryV1 {
  return createActionPresentationRegistryV1({
    schemaVersion: 1,
    bindings: [],
    rootMotionSources: [],
  });
}

function createHarness(input: Readonly<{
  registry?: ActionPresentationRegistryV1;
  projections?: readonly GoldenHumanoidProjectionPortV1[];
  stages?: GoldenHumanoidTickStageV1[];
  initialPositionMetersXYZ?: readonly [number, number, number];
  movementOptions?: CharacterMovementRuntimeOptionsV1;
}> = {}) {
  const options = input.movementOptions ?? movementOptions();
  const initialPositionMetersXYZ = input.initialPositionMetersXYZ ??
    options.initialState.positionMetersXYZ;
  const movement = createCharacterMovementRuntimeV1({
    ...options,
    initialState: {
      ...options.initialState,
      positionMetersXYZ: initialPositionMetersXYZ,
    },
  });
  const body = new TransactionBodyPort();
  body.position = [...initialPositionMetersXYZ];
  const transaction = new GoldenHumanoid3CVNextTransactionV1({
    subjectEntityId: "player",
    fixedDeltaSeconds: 1 / 60,
    movementRuntime: movement,
    bodyPort: body,
    actionPresentationRegistry: input.registry ?? emptyRegistry(),
    projectionPorts: input.projections ?? [],
    onStage: (stage) => input.stages?.push(stage),
  });
  return { body, movement, transaction };
}

const SUPPORTED: BodySampleV1["support"] = Object.freeze({
  mode: "supported",
  pointMetersXYZ: Object.freeze([0, 0, 0]) as readonly [number, number, number],
  normalXYZ: Object.freeze([0, 1, 0]) as readonly [number, number, number],
  isDynamic: false,
});

const UNSUPPORTED: BodySampleV1["support"] = Object.freeze({ mode: "unsupported" });

const SLIDING: BodySampleV1["support"] = Object.freeze({
  mode: "sliding",
  pointMetersXYZ: Object.freeze([0, 0, 0]) as readonly [number, number, number],
  normalXYZ: Object.freeze([0.6, 0.8, 0]) as readonly [number, number, number],
  isDynamic: false,
});

function verticalPhase(result: ReturnType<GoldenHumanoid3CVNextTransactionV1["runTick"]>): string {
  return result.commit.locomotion.status === "active"
    ? result.commit.locomotion.verticalPhase
    : result.commit.locomotion.status;
}

function semanticAction(
  semanticActionRef: string,
  semanticActionHash: `sha256:${string}`,
  tick = 1,
): GameplayActionStateV1 {
  return Object.freeze({
    id: "action-execution:player:1",
    kind: "action-state",
    semanticActionRef,
    semanticActionHash,
    actorEntityId: "player",
    mode: "active",
    startedSimulationTick: tick,
    lastTransitionSimulationTick: tick,
  });
}

function goldenSubject(overrides: Readonly<{
  locomotion?: BabylonRuntimeSubjectFixtureV1["locomotion"];
  controlProfile?: BabylonRuntimeSubjectFixtureV1["capabilityAssembly"]["controlProfile"];
}> = {}): BabylonRuntimeSubjectFixtureV1 {
  const controlProfile = overrides.controlProfile ?? {
    resourceRef: "worldkit://control/third-person@1",
    contentHash: HASH_A,
    commandKind: "planar-vector" as const,
    inputSpace: "camera-relative" as const,
    facingPolicy: "align-to-move" as const,
    lateralMovementPolicy: "allowed" as const,
    moveDeadzoneRatio: 0,
  };
  return {
    entityId: "player",
    collider: {
      centerOffsetFromSubjectOriginMetersXYZ: [0, 1, 0],
    },
    controlFeel: {
      resourceRef: "worldkit://control-feel/humanoid@1",
      contentHash: HASH_A,
      moveResponseExponent: 1,
    },
    physicsBodyProfileRef: "worldkit://physics-body/humanoid@1",
    locomotionProfileRef: "worldkit://locomotion-profile/humanoid@1",
    locomotion: overrides.locomotion ?? {
      allowWalk: true,
      allowRun: true,
      allowJump: true,
    },
    capabilityAssembly: {
      controlProfile,
      defaultMotionProfile: {
        resourceRef: "worldkit://motion/free-ground@1",
        contentHash: HASH_A,
        motionKernelRef: "worldkit://motion-kernel/free-ground@1",
        motionTags: ["humanoid"],
      },
    },
  } as unknown as BabylonRuntimeSubjectFixtureV1;
}

function visualRootSpy(): TransformNode {
  const position = {
    x: 0,
    y: 0,
    z: 0,
    set: vi.fn((x: number, y: number, z: number) => {
      position.x = x;
      position.y = y;
      position.z = z;
    }),
  };
  return {
    position,
    rotationQuaternion: undefined,
  } as unknown as TransformNode;
}

describe("Golden Humanoid 3C vNext transaction", () => {
  it("runs the frozen ten stages once, resolves one Body Tick, then commits projections", () => {
    const stages: GoldenHumanoidTickStageV1[] = [];
    const animation = new ProjectionPort();
    const camera = new ProjectionPort();
    const { body, transaction } = createHarness({ projections: [animation, camera], stages });

    const result = transaction.runTick({ command: command(1, { movementInputXZ: [0, 1] }) });

    expect(stages).toEqual(GOLDEN_HUMANOID_TICK_STAGES_V1);
    expect(body.beginCalls).toBe(1);
    expect(body.resolveCalls).toBe(1);
    expect(body.commitCalls).toBe(1);
    expect(animation.prepareCalls).toBe(1);
    expect(camera.prepareCalls).toBe(1);
    expect(animation.commitCalls).toBe(1);
    expect(camera.commitCalls).toBe(1);
    expect(result.commit.locomotion.committedTick).toBe(1);
    expect(result.presentation.committedTick).toBe(1);
    expect(animation.lastInput?.commit).toBe(result.commit);
    expect(camera.lastInput?.commit).toBe(result.commit);
    expect(camera.lastInput?.cameraContext).toMatchObject({
      semanticAuthorityStatus: "available",
      committedTick: 1,
      controlledEntityId: "player",
      locomotion: result.commit.locomotion,
    });
    expect(animation.lastInput?.presentation.committedTick).toBe(
      animation.lastInput?.commit.tick,
    );
  });

  it("projects distinct per-Tick committed Camera identities and relationships without retaining them", () => {
    const camera = new ProjectionPort();
    const { transaction } = createHarness({ projections: [camera] });

    transaction.runTick({
      command: command(1),
      cameraContextAuthority: {
        controlledEntityId: "controller-primary",
        targetEntityId: "player",
        relationshipContexts: [
          {
            id: "mounted:a",
            type: "mountedOn",
            riderEntityId: "player",
            mountEntityId: "board-a",
            mountSlotId: "stand",
          },
          {
            id: "mounted:Z",
            type: "mountedOn",
            riderEntityId: "rider-z",
            mountEntityId: "player",
            mountSlotId: "stand",
          },
        ],
      },
    });

    expect(camera.lastInput?.cameraContext).toMatchObject({
      controlledEntityId: "controller-primary",
      targetEntityId: "player",
    });
    expect(camera.lastInput?.cameraContext.environment.relationshipContexts.map(
      ({ id }) => id,
    )).toEqual(["mounted:Z", "mounted:a"]);

    transaction.runTick({ command: command(2) });
    expect(camera.lastInput?.cameraContext).toMatchObject({
      controlledEntityId: "player",
      targetEntityId: "player",
      environment: { relationshipContexts: [] },
    });
  });

  it("passes the committed split jump Episode to projections without a provider side channel", () => {
    const projection = new ProjectionPort();
    const base = movementOptions();
    const { movement, transaction } = createHarness({
      projections: [projection],
      movementOptions: {
        ...base,
        jumpVariantPolicy: {
          mode: "run-selects-variant",
          smallAnticipationSeconds: 1 / 60,
          largeAnticipationSeconds: 2 / 60,
        },
      },
    });

    const result = transaction.runTick({
      command: command(1, { jumpPressed: true, runRequested: true }),
    });

    expect(result.commit.jumpEpisode).toMatchObject({
      variant: "large",
      phase: "anticipating",
      committedTick: 1,
    });
    expect(projection.lastInput?.commit.jumpEpisode).toBe(result.commit.jumpEpisode);
    expect(result.presentation.presentationKey).toBe("locomotion.takeoff");
    expect(projection.lastInput?.presentation).toBe(result.presentation);
    expect(movement.snapshot().jumpEpisode).toEqual(result.commit.jumpEpisode);
  });

  it("derives small-jump presentation only from the committed Movement Episode", () => {
    const projection = new ProjectionPort();
    const base = movementOptions();
    const { transaction } = createHarness({
      projections: [projection],
      movementOptions: {
        ...base,
        jumpVariantPolicy: {
          mode: "run-selects-variant",
          smallAnticipationSeconds: 1 / 60,
          largeAnticipationSeconds: 2 / 60,
        },
      },
    });

    const result = transaction.runTick({
      command: command(1, { jumpPressed: true, runRequested: false }),
    });

    expect(result.commit.jumpEpisode).toMatchObject({
      variant: "small",
      phase: "anticipating",
      committedTick: 1,
    });
    expect(result.presentation.presentationKey).toBe(
      "locomotion.small-jump.takeoff",
    );
    expect(projection.lastInput?.presentation).toBe(result.presentation);
  });

  it.each(["begin", "resolve"] as const)(
    "rolls JS and exact native state back when Body %s fails and rejects replay",
    (failure) => {
      const projection = new ProjectionPort();
      const { body, movement, transaction } = createHarness({ projections: [projection] });
      const beforeMovement = movement.snapshot();
      const beforeBody = JSON.stringify({ position: body.position, velocity: body.velocity, support: body.support });
      body.throwAt = failure;

      expect(() => transaction.runTick({ command: command(1) })).toThrow(
        failure === "begin" ? "BODY_BEGIN_FAILED" : "BODY_RESOLVE_FAILED",
      );
      expect(movement.snapshot()).toEqual(beforeMovement);
      expect(JSON.stringify({ position: body.position, velocity: body.velocity, support: body.support }))
        .toBe(beforeBody);
      expect(projection.prepareCalls).toBe(0);
      expect(() => transaction.runTick({ command: command(1) })).toThrow("3C_TICK_TOKEN_STALE");
    },
  );

  it("rolls exact Movement and Body authority back when Camera prepare fails", () => {
    const animation = new ProjectionPort();
    const camera = new ProjectionPort();
    camera.failPrepare = true;
    const { body, movement, transaction } = createHarness({ projections: [animation, camera] });
    const beforeMovement = movement.snapshot();
    const beforeBody = JSON.stringify({ position: body.position, velocity: body.velocity, support: body.support });

    expect(() => transaction.runTick({ command: command(1, { movementInputXZ: [0, 1] }) }))
      .toThrow("PROJECTION_PREPARE_FAILED");

    expect(movement.snapshot()).toEqual(beforeMovement);
    expect(JSON.stringify({ position: body.position, velocity: body.velocity, support: body.support }))
      .toBe(beforeBody);
    expect(body.abortCalls).toBe(1);
    expect(body.commitCalls).toBe(0);
    expect(animation.abortCalls).toBe(1);
    expect(animation.commitCalls).toBe(0);
    transaction.reset(beforeMovement);
    camera.failPrepare = false;
    expect(transaction.runTick({ command: command(1) }).commit.tick).toBe(1);
  });

  it("rolls exact Movement and Body authority back when Animation prepare fails", () => {
    const animation = new ProjectionPort();
    animation.failPrepare = true;
    const { body, movement, transaction } = createHarness({ projections: [animation] });
    const beforeMovement = movement.snapshot();
    const beforeBody = JSON.stringify({
      position: body.position,
      velocity: body.velocity,
      support: body.support,
    });

    expect(() => transaction.runTick({ command: command(1) }))
      .toThrow("PROJECTION_PREPARE_FAILED");

    expect(movement.snapshot()).toEqual(beforeMovement);
    expect(JSON.stringify({
      position: body.position,
      velocity: body.velocity,
      support: body.support,
    })).toBe(beforeBody);
    expect(body.abortCalls).toBe(1);
    expect(body.commitCalls).toBe(0);
    expect(animation.committed).toBe(false);
    transaction.reset(beforeMovement);
    animation.failPrepare = false;
    expect(transaction.runTick({ command: command(1) }).commit.tick).toBe(1);
  });

  it("rolls projection, Movement and Body authority back when projection commit fails", () => {
    const animation = new ProjectionPort();
    const camera = new ProjectionPort();
    camera.failCommit = true;
    const { body, movement, transaction } = createHarness({
      projections: [animation, camera],
    });
    const before = movement.snapshot();
    const nativeBefore = JSON.stringify({
      position: body.position,
      velocity: body.velocity,
      support: body.support,
    });

    expect(() => transaction.runTick({
      command: command(1, { movementInputXZ: [0, 1] }),
    }))
      .toThrow("PROJECTION_COMMIT_FAILED");

    expect(movement.snapshot()).toEqual(before);
    expect(JSON.stringify({
      position: body.position,
      velocity: body.velocity,
      support: body.support,
    })).toBe(nativeBefore);
    expect(animation.committed).toBe(false);
    expect(camera.committed).toBe(false);
    expect(body.commitCalls).toBe(0);
    expect(body.abortCalls).toBe(1);
    transaction.reset(before);
    camera.failCommit = false;
    expect(transaction.runTick({ command: command(1) }).commit.tick).toBe(1);
  });

  it("restores Movement and native state when reconcile fails after Body resolve", () => {
    const realMovement = createCharacterMovementRuntimeV1(movementOptions());
    const movement: CharacterMovementRuntimeV1 = {
      beginTick: (input) => realMovement.beginTick(input),
      proposeMovement: (token, sample) => realMovement.proposeMovement(token, sample),
      reconcile: (token, resolution) => {
        realMovement.reconcile(token, resolution);
        throw new Error("MOVEMENT_RECONCILE_FAILED");
      },
      snapshot: () => realMovement.snapshot(),
      reconcileSupportAfterReset: (support, activeTickToken) =>
        realMovement.reconcileSupportAfterReset(support, activeTickToken),
      resetAtSupportedPlacement: (input) =>
        realMovement.resetAtSupportedPlacement(input),
      suspendForRelationship: (input) =>
        realMovement.suspendForRelationship(input),
      reset: (snapshot) => realMovement.reset(snapshot),
      dispose: () => realMovement.dispose(),
    };
    const body = new TransactionBodyPort();
    const transaction = new GoldenHumanoid3CVNextTransactionV1({
      subjectEntityId: "player",
      fixedDeltaSeconds: 1 / 60,
      movementRuntime: movement,
      bodyPort: body,
      actionPresentationRegistry: emptyRegistry(),
    });
    const before = movement.snapshot();
    const nativeBefore = JSON.stringify({ position: body.position, velocity: body.velocity });

    expect(() => transaction.runTick({ command: command(1) }))
      .toThrow("MOVEMENT_RECONCILE_FAILED");
    expect(movement.snapshot()).toEqual(before);
    expect(JSON.stringify({ position: body.position, velocity: body.velocity }))
      .toBe(nativeBefore);
    expect(body.resolveCalls).toBe(1);
    expect(body.abortCalls).toBe(1);
  });

  it("rejects untrusted Action/Root Motion before Body admission and invalidates the failed Tick", () => {
    const { body, movement, transaction } = createHarness();
    const before = movement.snapshot();

    expect(() => transaction.runTick({
      command: command(1),
      activeActionState: semanticAction(
        "worldkit://semantic-action/unlocked@1",
        HASH_A,
      ),
    })).toThrow("3C_LAYERED_MOVE_SOURCE_UNRESOLVED");

    expect(movement.snapshot()).toEqual(before);
    expect(body.beginCalls).toBe(0);
    expect(body.resolveCalls).toBe(0);
    expect(() => transaction.runTick({ command: command(1) }))
      .toThrow("3C_TICK_TOKEN_STALE");
  });

  it("derives walk, run and stop from committed commands rather than animation or velocity inference", () => {
    const { transaction } = createHarness();

    const walk = transaction.runTick({ command: command(1, { movementInputXZ: [0, 1] }) });
    const run = transaction.runTick({ command: command(2, { movementInputXZ: [0, 1], runRequested: true }) });
    let stop = transaction.runTick({ command: command(3) });
    for (let tick = 4; tick <= 8; tick += 1) {
      stop = transaction.runTick({ command: command(tick) });
    }

    expect([walk.commit.locomotion, run.commit.locomotion, stop.commit.locomotion].map((state) =>
      state.status === "active" ? state.gait : state.status
    )).toEqual(["walk", "run", "idle"]);
    expect(walk.presentation.presentationKey).toBe("locomotion.walk");
    expect(run.presentation.presentationKey).toBe("locomotion.run");
    expect(stop.presentation.presentationKey).toBe("locomotion.idle");
  });

  it("lets the first real Body support sample replace the factory placeholder without fabricated coyote", () => {
    const options = movementOptions();
    const movement = createCharacterMovementRuntimeV1({
      ...options,
      initialState: {
        ...options.initialState,
        runtimeState: {
          ...options.initialState.runtimeState,
          coyoteTicksRemaining: 0,
        },
      },
    });
    const body = new TransactionBodyPort();
    body.support = UNSUPPORTED;
    body.resolutionSupport = UNSUPPORTED;
    const transaction = new GoldenHumanoid3CVNextTransactionV1({
      subjectEntityId: "player",
      fixedDeltaSeconds: 1 / 60,
      movementRuntime: movement,
      bodyPort: body,
      actionPresentationRegistry: emptyRegistry(),
    });

    const first = transaction.runTick({ command: command(1) });

    expect(first.commit.locomotion).toMatchObject({
      mobilityMode: "airborne",
      supportMode: "unsupported",
      verticalPhase: "falling",
    });
    expect(movement.snapshot().runtimeState.coyoteTicksRemaining).toBe(0);
    expect(body.beginCalls).toBe(1);
    expect(body.resolveCalls).toBe(1);
  });

  it("traces takeoff, rising, apex, falling and landing through the Golden coordinator exactly once", () => {
    const { body, transaction } = createHarness();
    const phases: string[] = [];
    const events: string[] = [];
    const transitionedPhases: string[] = [];

    body.resolutionSupport = UNSUPPORTED;
    let result = transaction.runTick({
      command: command(1, { jumpPressed: true, jumpHeld: true }),
    });
    phases.push(verticalPhase(result));
    events.push(...result.commit.transitionEvents.map((event) => event.type));
    transitionedPhases.push(...result.commit.transitionEvents.flatMap((event) =>
      event.type === "phase-changed" ? [event.toVerticalPhase] : []
    ));

    for (let tick = 2; tick <= 90 && verticalPhase(result) !== "falling"; tick += 1) {
      body.resolutionSupport = UNSUPPORTED;
      result = transaction.runTick({
        command: command(tick, { jumpHeld: tick <= 9 }),
      });
      phases.push(verticalPhase(result));
      events.push(...result.commit.transitionEvents.map((event) => event.type));
      transitionedPhases.push(...result.commit.transitionEvents.flatMap((event) =>
        event.type === "phase-changed" ? [event.toVerticalPhase] : []
      ));
    }
    const landingTick = result.commit.tick + 1;
    body.resolutionSupport = SUPPORTED;
    result = transaction.runTick({ command: command(landingTick) });
    phases.push(verticalPhase(result));
    events.push(...result.commit.transitionEvents.map((event) => event.type));
    transitionedPhases.push(...result.commit.transitionEvents.flatMap((event) =>
      event.type === "phase-changed" ? [event.toVerticalPhase] : []
    ));
    result = transaction.runTick({ command: command(landingTick + 1) });
    phases.push(verticalPhase(result));
    events.push(...result.commit.transitionEvents.map((event) => event.type));
    result = transaction.runTick({ command: command(landingTick + 2) });
    phases.push(verticalPhase(result));
    events.push(...result.commit.transitionEvents.map((event) => event.type));

    const semanticPhaseTrace = transitionedPhases;
    const firstSeen = ["takeoff", "rising", "apex", "falling", "landing"].map(
      (phase) => semanticPhaseTrace.indexOf(phase),
    );
    expect(firstSeen.every((index) => index >= 0)).toBe(true);
    expect(firstSeen).toEqual([...firstSeen].sort((a, b) => a - b));
    expect(events.filter((event) => event === "apex-crossed")).toHaveLength(1);
    expect(events.filter((event) => event === "landed")).toHaveLength(1);
    expect(verticalPhase(result)).toBe("none");
  });

  it("covers coyote, buffered jump, ceiling, ledge and slope semantics through Body resolution", () => {
    const ledge = createHarness();
    ledge.body.resolutionSupport = UNSUPPORTED;
    const departed = ledge.transaction.runTick({ command: command(1) });
    expect(verticalPhase(departed)).toBe("falling");
    ledge.body.resolutionSupport = UNSUPPORTED;
    const coyote = ledge.transaction.runTick({
      command: command(2, { jumpPressed: true, jumpHeld: true }),
    });
    expect(verticalPhase(coyote)).toBe("takeoff");

    const buffered = createHarness();
    buffered.body.resolutionSupport = UNSUPPORTED;
    buffered.transaction.runTick({
      command: command(1, { jumpPressed: true, jumpHeld: true }),
    });
    let fallingTick = 2;
    let airborne = buffered.transaction.runTick({ command: command(fallingTick) });
    while (verticalPhase(airborne) !== "falling" && fallingTick < 90) {
      fallingTick += 1;
      buffered.body.resolutionSupport = UNSUPPORTED;
      airborne = buffered.transaction.runTick({ command: command(fallingTick) });
    }
    buffered.body.resolutionSupport = UNSUPPORTED;
    const bufferedIntent = buffered.transaction.runTick({
      command: command(++fallingTick, { jumpPressed: true }),
    });
    expect(verticalPhase(bufferedIntent)).toBe("falling");
    buffered.body.support = SUPPORTED;
    buffered.body.resolutionSupport = UNSUPPORTED;
    const bufferedTakeoff = buffered.transaction.runTick({ command: command(++fallingTick) });
    expect(verticalPhase(bufferedTakeoff)).toBe("takeoff");

    const ceiling = createHarness();
    ceiling.body.resolutionSupport = UNSUPPORTED;
    const takeoff = ceiling.transaction.runTick({
      command: command(1, { jumpPressed: true, jumpHeld: true }),
    });
    expect(verticalPhase(takeoff)).toBe("takeoff");
    ceiling.body.ceiling = true;
    ceiling.body.resolutionSupport = UNSUPPORTED;
    const ceilingHit = ceiling.transaction.runTick({
      command: command(2, { jumpHeld: true }),
    });
    expect(verticalPhase(ceilingHit)).toBe("falling");
    expect(ceilingHit.commit.transitionEvents.map((event) => event.type)).toEqual([
      "phase-changed",
      "phase-changed",
      "apex-crossed",
      "phase-changed",
    ]);

    const slope = createHarness();
    slope.body.support = SLIDING;
    slope.body.resolutionSupport = SLIDING;
    const sliding = slope.transaction.runTick({
      command: command(1, { movementInputXZ: [0, 1] }),
    });
    expect(sliding.commit.locomotion).toMatchObject({
      status: "active",
      mobilityMode: "grounded",
      supportMode: "sliding",
      verticalPhase: "none",
    });
  });

  it("makes a held jump higher than a released jump through the same coordinator path", () => {
    const simulate = (holdTicks: number): number => {
      const { body, transaction } = createHarness();
      let maximumY = 1;
      for (let tick = 1; tick <= 50; tick += 1) {
        body.resolutionSupport = UNSUPPORTED;
        const result = transaction.runTick({
          command: command(tick, {
            jumpPressed: tick === 1,
            jumpHeld: tick <= holdTicks,
          }),
        });
        maximumY = Math.max(maximumY, result.commit.positionMetersXYZ[1]);
      }
      return maximumY;
    };

    expect(simulate(9)).toBeGreaterThan(simulate(1));
  });

  it("uses the trusted committed Action and sends locked Root Motion through the single Body resolve", () => {
    const body: ActionPresentationBindingBodyV1 = {
      kind: "action-presentation-binding",
      schemaVersion: 1,
      resourceRef: "worldkit://action-presentation/vault@1",
      presentationKey: "action.vault",
      semanticActionRef: "worldkit://semantic-action/vault@1",
      semanticActionHash: HASH_A,
      isInterruptible: true,
      clip: {
        sourceClipName: "Vault",
        loopMode: "once",
        playbackSpeedRatio: 1,
        blendDurationTicks: 2,
      },
      rootMotion: {
        mode: "locked",
        rootMotionSourceRef: "worldkit://root-motion/vault@1",
        rootMotionSourceHash: `sha256:${"b".repeat(64)}`,
        priority: 10,
      },
    };
    const sourceBody = {
      schemaVersion: 1 as const,
      resourceRef: "worldkit://root-motion/vault@1" as const,
      fixedDeltaSeconds: 1 / 60,
      samples: [{ translationDeltaMetersXYZ: [0, 0, -1] as const, facingYawDeltaRadians: 0 }],
    };
    const source = { ...sourceBody, contentHash: hashRootMotionSourceV1(sourceBody) };
    const binding = { ...body, rootMotion: { ...body.rootMotion, rootMotionSourceHash: source.contentHash }, contentHash: hashActionPresentationBindingV1({ ...body, rootMotion: { ...body.rootMotion, rootMotionSourceHash: source.contentHash } }) };
    const registry = createActionPresentationRegistryV1({
      schemaVersion: 1,
      bindings: [binding],
      rootMotionSources: [source],
    });
    const { body: bodyPort, transaction } = createHarness({ registry });
    bodyPort.limitTranslationRatio = 0.25;

    const result = transaction.runTick({
      command: command(1),
      activeActionState: semanticAction(body.semanticActionRef, body.semanticActionHash),
    });

    expect(result.presentation.source).toBe("action");
    expect(result.presentation.layeredMoves).toHaveLength(1);
    expect(bodyPort.resolveCalls).toBe(1);
    expect(result.commit.positionMetersXYZ[2]).toBeCloseTo(-0.25);
    expect(result.presentation.committedTick).toBe(result.commit.tick);
  });

  it("isolates two sessions and rejects old or same-Tick replay", () => {
    const a = createHarness();
    const b = createHarness();

    a.transaction.runTick({ command: command(1, { movementInputXZ: [0, 1] }) });
    expect(b.movement.snapshot().tick).toBe(0);
    expect(() => a.transaction.runTick({ command: command(1) })).toThrow("3C_INPUT_INVALID");
  });

  it("keeps a committed snapshot immutable when observers attempt reentrant mutation", () => {
    let transaction: GoldenHumanoid3CVNextTransactionV1;
    const projection: GoldenHumanoidProjectionPortV1 = {
      prepare: (input) => {
        expect(() => transaction.runTick({ command: command(2) })).toThrow("3C_TICK_TOKEN_STALE");
        expect(Object.isFrozen(input.commit)).toBe(true);
        return { commit: vi.fn(), abort: vi.fn() };
      },
    };
    ({ transaction } = createHarness({ projections: [projection] }));
    transaction.runTick({ command: command(1) });
  });

  it("provides a live-ready Subject facade that advances only the Golden transaction", () => {
    const harness = createHarness();
    const visualRoot = visualRootSpy();
    const controller = new CharacterMovementSubjectControllerV1({
      subject: goldenSubject(),
      visualRoot,
      transaction: harness.transaction,
    });

    const walk = controller.step(["move-forward"]);
    const run = controller.step(["move-forward", "run"]);
    controller.synchronizeVisual();

    expect(walk.commit.locomotion).toMatchObject({ gait: "walk", committedTick: 1 });
    expect(run.commit.locomotion).toMatchObject({ gait: "run", committedTick: 2 });
    expect(controller.locomotionStateV2()).toEqual(run.commit.locomotion);
    expect(controller.latestTickResult()).toBe(run);
    expect(visualRoot.position.set).toHaveBeenCalledTimes(2);
    expect(harness.body.beginCalls).toBe(2);
    expect(harness.body.resolveCalls).toBe(2);
    expect(harness.body.commitCalls).toBe(2);
  });

  it("applies the initial committed pose before the first rendered frame", () => {
    const harness = createHarness({
      initialPositionMetersXYZ: [4, 3, 30],
    });
    const visualRoot = visualRootSpy();

    new CharacterMovementSubjectControllerV1({
      subject: goldenSubject(),
      visualRoot,
      transaction: harness.transaction,
    });

    expect(visualRoot.position.set).toHaveBeenCalledOnce();
    expect(visualRoot.position.set).toHaveBeenLastCalledWith(4, 2, 30);
    expect(visualRoot.position).toMatchObject({ x: 4, y: 2, z: 30 });
  });

  it("renders between two committed poses without mutating the authoritative snapshot", () => {
    const harness = createHarness();
    const visualRoot = visualRootSpy();
    const controller = new CharacterMovementSubjectControllerV1({
      subject: goldenSubject(),
      visualRoot,
      transaction: harness.transaction,
    });

    controller.step(["move-forward"]);
    controller.synchronizeVisual();
    const previous = controller.movementSnapshot();
    controller.step(["move-forward"]);
    controller.synchronizeVisual();
    const current = controller.movementSnapshot();
    const authoritativeBeforeRender = structuredClone(current);

    controller.renderVisual(0.5);
    const diagnostic = controller.renderPoseDiagnostic(0.5);

    expect(visualRoot.position.x).toBeCloseTo(
      (previous.positionMetersXYZ[0] + current.positionMetersXYZ[0]) / 2,
      12,
    );
    expect(visualRoot.position.y).toBeCloseTo(
      (previous.positionMetersXYZ[1] + current.positionMetersXYZ[1]) / 2 - 1,
      12,
    );
    expect(visualRoot.position.z).toBeCloseTo(
      (previous.positionMetersXYZ[2] + current.positionMetersXYZ[2]) / 2,
      12,
    );
    expect(controller.movementSnapshot()).toEqual(authoritativeBeforeRender);
    expect(diagnostic).toMatchObject({
      schemaVersion: 1,
      committedTick: current.tick,
      committedSubjectOriginYMeters: current.positionMetersXYZ[1] - 1,
      previousFixedSubjectOriginYMeters: previous.positionMetersXYZ[1] - 1,
      currentFixedSubjectOriginYMeters: current.positionMetersXYZ[1] - 1,
      renderInterpolatedSubjectOriginYMeters:
        (previous.positionMetersXYZ[1] + current.positionMetersXYZ[1]) / 2 - 1,
      visualRootYMeters:
        (previous.positionMetersXYZ[1] + current.positionMetersXYZ[1]) / 2 - 1,
    });
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(Object.isFrozen(diagnostic.correction)).toBe(true);

    controller.reset();
    controller.renderVisual(0);
    expect(visualRoot.position.x).toBe(0);
    expect(visualRoot.position.y).toBe(0);
    expect(visualRoot.position.z).toBe(0);
  });

  it("keeps committed hashes identical under actual 30/60/120-like render sampling", () => {
    const runLane = (renderHertz: 30 | 60 | 120): string => {
      const harness = createHarness();
      const controller = new CharacterMovementSubjectControllerV1({
        subject: goldenSubject(),
        visualRoot: visualRootSpy(),
        transaction: harness.transaction,
      });
      for (let tick = 1; tick <= 120; tick += 1) {
        controller.step([
          "move-forward",
          ...(tick > 20 ? ["run" as const] : []),
          ...(tick >= 30 && tick <= 35 ? ["jump" as const] : []),
        ]);
        controller.synchronizeVisual();
        if (renderHertz === 30) {
          if (tick % 2 === 0) controller.renderVisual(1);
        } else if (renderHertz === 60) {
          controller.renderVisual(1);
        } else {
          controller.renderVisual(0.5);
          controller.renderVisual(1);
        }
      }
      return controller.movementSnapshot().stateHash;
    };

    expect(new Set([runLane(30), runLane(60), runLane(120)]).size).toBe(1);
  });

  it("rejects a stale ViewControlFrame before command or Body admission", () => {
    const harness = createHarness();
    const controller = new CharacterMovementSubjectControllerV1({
      subject: goldenSubject(),
      visualRoot: visualRootSpy(),
      transaction: harness.transaction,
    });

    expect(() => controller.step([], {
      forwardXYZ: [0, 0, -1],
      rightXYZ: [1, 0, 0],
      committedTick: 99,
    })).toThrow("3C_VIEW_TICK_MISMATCH");
    expect(controller.movementSnapshot().tick).toBe(0);
    expect(harness.body.beginCalls).toBe(0);
  });

  it.each([
    ["walk", { allowWalk: false, allowRun: true, allowJump: true }, ["move-forward"]],
    ["run", { allowWalk: true, allowRun: false, allowJump: true }, ["move-forward", "run"]],
    ["jump", { allowWalk: true, allowRun: true, allowJump: false }, ["jump"]],
  ] as const)("rejects undeclared %s capability before Body admission", (_name, locomotion, actions) => {
    const harness = createHarness();
    const controller = new CharacterMovementSubjectControllerV1({
      subject: goldenSubject({ locomotion }),
      visualRoot: visualRootSpy(),
      transaction: harness.transaction,
    });

    expect(() => controller.step(actions)).toThrow("3C_CAPABILITY_NOT_DECLARED");
    expect(harness.body.beginCalls).toBe(0);
  });

  it.each([
    ["command", { commandKind: "throttle-steer" }],
    ["input", { inputSpace: "subject-local" }],
  ] as const)("fails closed on unsupported Golden %s profile semantics", (_name, patch) => {
    const base = goldenSubject().capabilityAssembly.controlProfile;
    expect(() => createCharacterMovementSubjectControllerV1({
      subject: goldenSubject({
        controlProfile: { ...base, ...patch } as typeof base,
      }),
      visualRoot: visualRootSpy(),
      scene: {} as Scene,
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
      actionPresentationRegistry: emptyRegistry(),
    })).toThrow("3C_CHARACTER_MOVEMENT_CONTROL_PROFILE_UNSUPPORTED");
  });

  it("keeps registered align-to-view strafing inside CharacterMovement authority", () => {
    const harness = createHarness();
    const base = goldenSubject().capabilityAssembly.controlProfile;
    const controller = new CharacterMovementSubjectControllerV1({
      subject: goldenSubject({
        controlProfile: {
          ...base,
          resourceRef: "worldkit://control-profile/planar.aim-relative@1",
          facingPolicy: "align-to-view",
        },
      }),
      visualRoot: visualRootSpy(),
      transaction: harness.transaction,
    });

    controller.step(["move-right"]);
    const snapshot = controller.movementSnapshot();
    expect(snapshot.linearVelocityMetersPerSecondXYZ[0]).toBeGreaterThan(0);
    expect(snapshot.facingYawRadians).toBe(0);
    expect(harness.body.beginCalls).toBe(1);
  });

  it("keeps Golden facade reset, dispose and two-session state isolated", () => {
    const aHarness = createHarness();
    const bHarness = createHarness();
    const a = new CharacterMovementSubjectControllerV1({
      subject: goldenSubject(),
      visualRoot: visualRootSpy(),
      transaction: aHarness.transaction,
    });
    const b = new CharacterMovementSubjectControllerV1({
      subject: goldenSubject(),
      visualRoot: visualRootSpy(),
      transaction: bHarness.transaction,
    });

    a.step(["move-forward"]);
    expect(b.movementSnapshot().tick).toBe(0);
    a.reset();
    expect(a.movementSnapshot().tick).toBe(0);
    a.dispose();
    a.dispose();
    expect(() => a.step([])).toThrow("3C_RUNTIME_DISPOSED");
  });
});
