import {
  hashRootMotionSourceV1,
  parseMovementCommitV1,
  type MovementCommitV1,
  type RootMotionSourceBodyV1,
} from "@whitebox-world/character-movement";
import { parseCameraContextSampleV2 } from "@whitebox-world/camera";
import type {
  ActiveLocomotionCapabilityStateV2,
  GameplayActionStateV1,
} from "@whitebox-world/gameplay-contracts";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import {
  createActionPresentationRegistryV1,
  hashActionPresentationBindingV1,
  resolveActionPresentationV1,
  type ActionPresentationBindingBodyV1,
} from "@whitebox-world/subject-actions";
import { describe, expect, it } from "vitest";

import type { GoldenHumanoidProjectionInputV1 } from "./golden-humanoid-3c-vnext.js";
import {
  GoldenHumanoidPresentationContextProjectionV1,
} from "./golden-humanoid-presentation-context.js";
import type {
  BabylonCommittedAnimationProjectionPortV1,
  BabylonCommittedAnimationProjectionRequestV1,
  BabylonPreparedProjectionTransactionV1,
  BabylonPreparedCameraDirectorProjectionPortV1,
  BabylonPreparedCameraDirectorProjectionRequestV1,
} from "./runtime-projection.js";

const ACTION_HASH = `sha256:${"1".repeat(64)}` as const;
const rootMotionBody = {
  schemaVersion: 1,
  resourceRef: "worldkit://root-motion/vault@1",
  fixedDeltaSeconds: 1 / 60,
  samples: [
    { translationDeltaMetersXYZ: [0, 0, 0.1], facingYawDeltaRadians: 0 },
    { translationDeltaMetersXYZ: [0, 0, 0.2], facingYawDeltaRadians: 0.05 },
    { translationDeltaMetersXYZ: [0, 0, 0.3], facingYawDeltaRadians: 0.1 },
  ],
} as const satisfies RootMotionSourceBodyV1;
const ROOT_HASH = hashRootMotionSourceV1(rootMotionBody);
const bindingBody = {
  kind: "action-presentation-binding",
  schemaVersion: 1,
  resourceRef: "worldkit://action-presentation/vault@1",
  presentationKey: "action.vault",
  semanticActionRef: "worldkit://semantic-action/vault@1",
  semanticActionHash: ACTION_HASH,
  isInterruptible: true,
  clip: {
    sourceClipName: "Vault",
    loopMode: "once",
    playbackSpeedRatio: 1,
    blendDurationTicks: 3,
  },
  rootMotion: {
    mode: "locked",
    rootMotionSourceRef: rootMotionBody.resourceRef,
    rootMotionSourceHash: ROOT_HASH,
    priority: 100,
  },
} as const satisfies ActionPresentationBindingBodyV1;
const binding = Object.freeze({
  ...bindingBody,
  contentHash: hashActionPresentationBindingV1(bindingBody),
});
const registry = createActionPresentationRegistryV1({
  schemaVersion: 1,
  bindings: [binding],
  rootMotionSources: [{ ...rootMotionBody, contentHash: ROOT_HASH }],
});

function locomotion(
  tick: number,
  overrides: Partial<ActiveLocomotionCapabilityStateV2> = {},
): ActiveLocomotionCapabilityStateV2 {
  return {
    schemaVersion: 2,
    status: "active",
    mobilityMode: "grounded",
    gait: "walk",
    verticalPhase: "none",
    supportMode: "supported",
    movementMedium: "ground",
    facingYawRadians: 0.25,
    linearVelocity: { x: 0, y: 0, z: 1 },
    horizontalSpeedMetersPerSecond: 1,
    committedTick: tick,
    phaseEnteredTick: 0,
    transitionSequence: 0,
    ...overrides,
  };
}

function action(tick: number, overrides: Partial<GameplayActionStateV1> = {}): GameplayActionStateV1 {
  return Object.freeze({
    id: "action-execution:vault-1",
    kind: "action-state",
    semanticActionRef: binding.semanticActionRef,
    semanticActionHash: binding.semanticActionHash,
    actorEntityId: "player",
    mode: "active",
    startedSimulationTick: tick - 1,
    lastTransitionSimulationTick: tick,
    ...overrides,
  }) as GameplayActionStateV1;
}

function projectionInput(
  tick: number,
  overrides: Partial<GoldenHumanoidProjectionInputV1> = {},
): GoldenHumanoidProjectionInputV1 {
  const committedActionState = action(tick);
  const locomotionState = locomotion(tick);
  // Deliberately shorter than the locked Root Motion sample: BodyPort owns
  // collision limiting, while presentation retains the locked input evidence.
  const commit = parseMovementCommitV1({
    schemaVersion: 1,
    tick,
    positionMetersXYZ: [0, 1, 0.05],
    facingYawRadians: locomotionState.facingYawRadians,
    linearVelocityMetersPerSecondXYZ: [0, 0, 1],
    locomotion: locomotionState,
    transitionEvents: [],
  });
  const presentation = resolveActionPresentationV1({
    schemaVersion: 1,
    committedTick: tick,
    fixedDeltaSeconds: 1 / 60,
    locomotion: commit.locomotion,
    activeActionState: committedActionState,
  }, registry);
  const cameraContext = parseCameraContextSampleV2({
    schemaVersion: 2,
    semanticAuthorityStatus: "available",
    committedTick: tick,
    controlledEntityId: "player",
    targetEntityId: "player",
    subjectPose: {
      positionMetersXYZ: commit.positionMetersXYZ,
      facingYawRadians: commit.facingYawRadians,
    },
    locomotion: commit.locomotion,
    actionSummary: {
      status: "available",
      activeActionRefs: [committedActionState.semanticActionRef],
      isInterruptible: true,
    },
    environment: {
      relationshipRole: "none",
      relationshipContexts: [],
      socketPositionsMetersXYZById: { head: [0, 1.7, 0] },
      cameraContextTags: ["indoors"],
    },
  });
  return Object.freeze({
    commit,
    presentation,
    cameraContext,
    committedActionState,
    ...overrides,
  });
}

class PreparedTarget<Request, Evidence> {
  current: Evidence | undefined;
  prepareCalls: Request[] = [];
  commitCalls = 0;
  abortCalls = 0;
  failPrepare = false;
  failCommit = false;

  prepare(request: Request, evidence: Evidence): BabylonPreparedProjectionTransactionV1 {
    this.prepareCalls.push(request);
    if (this.failPrepare) throw new Error("TARGET_PREPARE_FAILED");
    const before = this.current;
    let closed = false;
    return {
      commit: () => {
        if (closed) throw new Error("TARGET_TRANSACTION_CLOSED");
        this.commitCalls += 1;
        this.current = evidence;
        if (this.failCommit) throw new Error("TARGET_COMMIT_FAILED");
      },
      abort: () => {
        if (closed) return;
        closed = true;
        this.abortCalls += 1;
        this.current = before;
      },
    };
  }
}

class AnimationTarget implements BabylonCommittedAnimationProjectionPortV1 {
  readonly target = new PreparedTarget<
    BabylonCommittedAnimationProjectionRequestV1,
    string
  >();

  prepareCommittedAnimation(
    request: BabylonCommittedAnimationProjectionRequestV1,
  ): BabylonPreparedProjectionTransactionV1 {
    return this.target.prepare(
      request,
      stringifyCanonicalJson({
        tick: request.committedTick,
        presentation: request.presentation,
        action: request.committedActionState ?? null,
      }),
    );
  }
}

class CameraTarget implements BabylonPreparedCameraDirectorProjectionPortV1 {
  readonly target = new PreparedTarget<
    BabylonPreparedCameraDirectorProjectionRequestV1,
    string
  >();
  orbitYawRadians = 0;

  prepareCameraDirectorUpdate(
    request: BabylonPreparedCameraDirectorProjectionRequestV1,
  ): BabylonPreparedProjectionTransactionV1 {
    return this.target.prepare(
      request,
      stringifyCanonicalJson(request.cameraContext),
    );
  }

  orbit(deltaYawRadians: number): void {
    this.orbitYawRadians += deltaYawRadians;
  }
}

function harness() {
  const animation = new AnimationTarget();
  const camera = new CameraTarget();
  const port = new GoldenHumanoidPresentationContextProjectionV1({
    actionPresentationRegistry: registry,
    animationProjectionPort: animation,
    cameraDirectorProjectionPort: camera,
  });
  return { animation, camera, port };
}

describe("GoldenHumanoidPresentationContextProjectionV1", () => {
  it("projects locomotion-only presentation with an explicitly empty committed Action summary", () => {
    const { animation, camera, port } = harness();
    const actionInput = projectionInput(21);
    const presentation = resolveActionPresentationV1({
      schemaVersion: 1,
      committedTick: 21,
      fixedDeltaSeconds: 1 / 60,
      locomotion: actionInput.commit.locomotion,
    }, registry);
    const cameraContext = parseCameraContextSampleV2({
      ...actionInput.cameraContext,
      actionSummary: {
        status: "available",
        activeActionRefs: [],
        isInterruptible: true,
      },
    });
    const input = Object.freeze({
      commit: actionInput.commit,
      presentation,
      cameraContext,
    });

    port.prepare(input).commit();

    expect(animation.target.prepareCalls[0]).not.toHaveProperty("committedActionState");
    expect(camera.target.prepareCalls[0]!.cameraContext.actionSummary).toEqual({
      status: "available",
      activeActionRefs: [],
      isInterruptible: true,
    });
  });

  it("projects a trusted interruptible Action and collision-limited Root Motion without movement writes", () => {
    const { animation, camera, port } = harness();
    const input = projectionInput(21);
    const authorityBefore = stringifyCanonicalJson({
      commit: input.commit,
      action: input.committedActionState,
    });

    const prepared = port.prepare(input);

    expect(animation.target.prepareCalls).toHaveLength(1);
    expect(camera.target.prepareCalls).toHaveLength(1);
    const animationRequest = animation.target.prepareCalls[0]!;
    const cameraRequest = camera.target.prepareCalls[0]!;
    expect(animationRequest.committedTick).toBe(21);
    expect(cameraRequest.committedTick).toBe(21);
    expect(animationRequest.presentation.layeredMoves[0]).toMatchObject({
      kind: "root-motion",
      translationDeltaMetersXYZ: [0, 0, 0.2],
    });
    expect(input.commit.positionMetersXYZ).toEqual([0, 1, 0.05]);
    expect(cameraRequest.cameraContext).toMatchObject({
      semanticAuthorityStatus: "available",
      committedTick: 21,
      subjectPose: { positionMetersXYZ: [0, 1, 0.05] },
      actionSummary: {
        status: "available",
        activeActionRefs: [binding.semanticActionRef],
        isInterruptible: true,
      },
    });
    expect(Object.isFrozen(cameraRequest.cameraContext)).toBe(true);
    expect(JSON.stringify(animationRequest)).not.toContain("positionMetersXYZ");

    prepared.commit();
    expect(stringifyCanonicalJson({
      commit: input.commit,
      action: input.committedActionState,
    })).toBe(authorityBefore);
  });

  it("rejects mixed Tick, forged Action authority and non-available Camera semantics before staging", () => {
    const cases: readonly GoldenHumanoidProjectionInputV1[] = [
      (() => {
        const input = projectionInput(21);
        return Object.freeze({ ...input, cameraContext: projectionInput(22).cameraContext });
      })(),
      (() => {
        const input = projectionInput(21);
        return Object.freeze({ ...input, committedActionState: action(21, { actorEntityId: "intruder" }) });
      })(),
      (() => {
        const input = projectionInput(21);
        const forged = action(21, { semanticActionHash: `sha256:${"9".repeat(64)}` });
        return Object.freeze({ ...input, committedActionState: forged });
      })(),
      (() => {
        const input = projectionInput(21);
        const unavailable = parseCameraContextSampleV2({
          schemaVersion: 2,
          semanticAuthorityStatus: "unavailable",
          committedTick: 21,
          controlledEntityId: "player",
          targetEntityId: "player",
          subjectPose: input.cameraContext.subjectPose,
          locomotion: {
            schemaVersion: 2,
            status: "suspended",
            suspendedByRelationshipId: "migration.seam",
            committedTick: 21,
            transitionSequence: 0,
          },
          actionSummary: { status: "unavailable" },
          environment: {
            relationshipRole: "none",
            relationshipContexts: [],
            socketPositionsMetersXYZById: {},
            cameraContextTags: [],
          },
        });
        return Object.freeze({ ...input, cameraContext: unavailable });
      })(),
    ];

    for (const input of cases) {
      const { animation, camera, port } = harness();
      expect(() => port.prepare(input)).toThrow(/3C_(?:INPUT_INVALID|CAMERA_CONTEXT_UNCOMMITTED)/);
      expect(animation.target.prepareCalls).toHaveLength(0);
      expect(camera.target.prepareCalls).toHaveLength(0);
    }
  });

  it("requires the admitted Camera Context to equal committed movement, Action and environment bytes", () => {
    const { animation, camera, port } = harness();
    const input = projectionInput(21);
    const forgedContext = parseCameraContextSampleV2({
      ...input.cameraContext,
      actionSummary: {
        status: "available",
        activeActionRefs: [binding.semanticActionRef],
        isInterruptible: false,
      },
    });

    expect(() => port.prepare(Object.freeze({
      ...input,
      cameraContext: forgedContext,
    }))).toThrow("3C_CAMERA_CONTEXT_UNCOMMITTED");
    expect(animation.target.prepareCalls).toHaveLength(0);
    expect(camera.target.prepareCalls).toHaveLength(0);
  });

  it("rolls both projections back after a Camera commit failure and consumes the failed Tick", () => {
    const { animation, camera, port } = harness();
    const first = port.prepare(projectionInput(20));
    first.commit();
    const before = {
      animation: animation.target.current,
      camera: camera.target.current,
    };
    camera.target.failCommit = true;
    const failing = port.prepare(projectionInput(21));

    expect(() => failing.commit()).toThrow("TARGET_COMMIT_FAILED");
    expect(animation.target.current).toBe(before.animation);
    expect(camera.target.current).toBe(before.camera);
    expect(() => port.prepare(projectionInput(21))).toThrow("3C_TICK_TOKEN_STALE");

    camera.target.failCommit = false;
    port.reset();
    expect(() => port.prepare(projectionInput(21))).not.toThrow();
  });

  it("aborts an already committed pair exactly back to its pre-Tick evidence", () => {
    const { animation, camera, port } = harness();
    port.prepare(projectionInput(20)).commit();
    const before = stringifyCanonicalJson({
      animation: animation.target.current,
      camera: camera.target.current,
    });
    const prepared = port.prepare(projectionInput(21));
    prepared.commit();
    expect(stringifyCanonicalJson({
      animation: animation.target.current,
      camera: camera.target.current,
    })).not.toBe(before);

    prepared.abort();
    prepared.abort();
    expect(stringifyCanonicalJson({
      animation: animation.target.current,
      camera: camera.target.current,
    })).toBe(before);
  });

  it("keeps Camera orbit state isolated from committed facing and Locomotion bytes", () => {
    const { camera, port } = harness();
    const input = projectionInput(21);
    const subjectBefore = stringifyCanonicalJson({
      facingYawRadians: input.commit.facingYawRadians,
      locomotion: input.commit.locomotion,
    });
    const prepared = port.prepare(input);
    camera.orbit(0.75);
    prepared.commit();

    expect(camera.orbitYawRadians).toBe(0.75);
    expect(stringifyCanonicalJson({
      facingYawRadians: input.commit.facingYawRadians,
      locomotion: input.commit.locomotion,
    })).toBe(subjectBefore);
  });

  it("rejects older and repeated committed Ticks, resets epochs, disposes stably and isolates sessions", () => {
    const first = harness();
    const second = harness();
    first.port.prepare(projectionInput(21)).commit();
    second.port.prepare(projectionInput(21)).commit();
    expect(() => first.port.prepare(projectionInput(20))).toThrow("3C_TICK_TOKEN_STALE");
    expect(() => first.port.prepare(projectionInput(21))).toThrow("3C_TICK_TOKEN_STALE");

    first.port.reset();
    const resetPrepared = first.port.prepare(projectionInput(20));
    expect(second.animation.target.current).not.toBeUndefined();

    resetPrepared.abort();
    first.port.dispose();
    first.port.dispose();
    expect(() => first.port.prepare(projectionInput(22))).toThrow("3C_RUNTIME_DISPOSED");
    expect(() => first.port.reset()).toThrow("3C_RUNTIME_DISPOSED");
    expect(() => second.port.prepare(projectionInput(22))).not.toThrow();
  });

  it("rolls an earlier staged projection back if the second target cannot prepare", () => {
    const { animation, camera, port } = harness();
    camera.target.failPrepare = true;
    expect(() => port.prepare(projectionInput(21))).toThrow("TARGET_PREPARE_FAILED");
    expect(animation.target.abortCalls).toBe(1);
    expect(animation.target.current).toBeUndefined();
    expect(() => port.prepare(projectionInput(21))).toThrow("3C_TICK_TOKEN_STALE");
  });
});
