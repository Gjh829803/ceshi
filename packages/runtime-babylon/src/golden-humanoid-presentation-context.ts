import {
  parseMovementCommitV1,
  type MovementCommitV1,
} from "@whitebox-world/character-movement";
import {
  parseCameraContextSampleV2,
  type CameraContextSampleV2,
} from "@whitebox-world/camera";
import type { GameplayActionStateV1 } from "@whitebox-world/gameplay-contracts";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import {
  verifyResolvedActionPresentationV1,
  type ActionPresentationRegistryV1,
  type ResolvedActionPresentationV1,
} from "@whitebox-world/subject-actions";

import type {
  GoldenHumanoidPreparedProjectionV1,
  GoldenHumanoidProjectionInputV1,
  GoldenHumanoidProjectionPortV1,
} from "./golden-humanoid-3c-vnext.js";
import type {
  BabylonCommittedAnimationProjectionPortV1,
  BabylonCommittedAnimationProjectionRequestV1,
  BabylonPreparedCameraDirectorProjectionPortV1,
  BabylonPreparedCameraDirectorProjectionRequestV1,
  BabylonPreparedProjectionTransactionV1,
} from "./runtime-projection.js";

export interface GoldenHumanoidPresentationContextProjectionOptionsV1 {
  readonly actionPresentationRegistry: ActionPresentationRegistryV1;
  readonly animationProjectionPort: BabylonCommittedAnimationProjectionPortV1;
  readonly cameraDirectorProjectionPort: BabylonPreparedCameraDirectorProjectionPortV1;
}

interface AdmittedGoldenPresentationContextV1 {
  readonly tick: number;
  readonly commit: MovementCommitV1;
  readonly presentation: ResolvedActionPresentationV1;
  readonly committedActionState?: GameplayActionStateV1;
  readonly cameraContext: CameraContextSampleV2;
}

function failure(code: string, detail: string): Error {
  return new Error(`${code}: ${detail}`);
}

function exactProjectionInput(input: object): boolean {
  const expected = new Set([
    "commit",
    "presentation",
    "cameraContext",
    "committedActionState",
  ]);
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(input);
  } catch {
    return false;
  }
  if (keys.some((key) => typeof key !== "string" || !expected.has(key))) return false;
  const required = ["commit", "presentation", "cameraContext"];
  if (!required.every((key) => keys.includes(key))) return false;
  for (const key of keys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return false;
  }
  return keys.length === required.length || keys.length === required.length + 1;
}

function isRecursivelyFrozenData(
  input: unknown,
  visited = new Set<object>(),
): boolean {
  if (typeof input !== "object" || input === null) return true;
  if (visited.has(input)) return false;
  visited.add(input);
  try {
    if (!Object.isFrozen(input)) return false;
    const prototype = Reflect.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) {
      return false;
    }
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (descriptor === undefined || !("value" in descriptor) ||
        (typeof key === "symbol" && !Array.isArray(input))) return false;
      if (!isRecursivelyFrozenData(descriptor.value, visited)) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    visited.delete(input);
  }
}

function snapshotCommittedAction(
  input: GameplayActionStateV1 | undefined,
): GameplayActionStateV1 | undefined {
  if (input === undefined) return undefined;
  return Object.freeze({
    id: input.id,
    kind: "action-state",
    semanticActionRef: input.semanticActionRef,
    semanticActionHash: input.semanticActionHash,
    actorEntityId: input.actorEntityId,
    mode: input.mode,
    startedSimulationTick: input.startedSimulationTick,
    lastTransitionSimulationTick: input.lastTransitionSimulationTick,
    ...(input.actionRequestRef === undefined
      ? {}
      : {
          actionRequestRef: input.actionRequestRef,
          actionRequestHash: input.actionRequestHash!,
        }),
  }) as GameplayActionStateV1;
}

function cameraContextFromCommittedFacts(
  commit: MovementCommitV1,
  admittedContext: CameraContextSampleV2,
  action: GameplayActionStateV1 | undefined,
  registry: ActionPresentationRegistryV1,
): CameraContextSampleV2 {
  if (admittedContext.semanticAuthorityStatus !== "available") {
    throw failure(
      "3C_CAMERA_CONTEXT_UNCOMMITTED",
      "Golden projection requires available committed semantic authority.",
    );
  }
  const binding = action === undefined
    ? undefined
    : registry.resolveAction(action.semanticActionRef, action.semanticActionHash);
  if (action !== undefined && binding === undefined) {
    throw failure(
      "3C_INPUT_INVALID",
      "committed Action does not resolve to its locked presentation binding.",
    );
  }
  return parseCameraContextSampleV2({
    schemaVersion: 2,
    semanticAuthorityStatus: "available",
    committedTick: commit.tick,
    controlledEntityId: admittedContext.controlledEntityId,
    targetEntityId: admittedContext.targetEntityId,
    subjectPose: {
      positionMetersXYZ: commit.positionMetersXYZ,
      facingYawRadians: commit.facingYawRadians,
    },
    locomotion: commit.locomotion,
    actionSummary: {
      status: "available",
      activeActionRefs: action === undefined ? [] : [action.semanticActionRef],
      isInterruptible: binding?.isInterruptible ?? true,
    },
    environment: admittedContext.environment,
  });
}

function admitProjectionInput(
  input: GoldenHumanoidProjectionInputV1,
  registry: ActionPresentationRegistryV1,
): AdmittedGoldenPresentationContextV1 {
  if (typeof input !== "object" || input === null || !exactProjectionInput(input) ||
    !isRecursivelyFrozenData(input)) {
    throw failure(
      "3C_INPUT_INVALID",
      "Golden projection input must be closed, immutable committed data.",
    );
  }
  let commit: MovementCommitV1;
  let presentation: ResolvedActionPresentationV1;
  let admittedContext: CameraContextSampleV2;
  try {
    commit = parseMovementCommitV1(input.commit);
    presentation = verifyResolvedActionPresentationV1(
      input.presentation,
      registry,
      input.committedActionState,
    );
    admittedContext = parseCameraContextSampleV2(input.cameraContext);
  } catch (error) {
    throw error;
  }
  if (presentation.committedTick !== commit.tick ||
    admittedContext.committedTick !== commit.tick) {
    throw failure(
      "3C_CAMERA_CONTEXT_UNCOMMITTED",
      "animation, Camera and movement must share one committed Tick.",
    );
  }
  const action = snapshotCommittedAction(input.committedActionState);
  if (action !== undefined && action.actorEntityId !== admittedContext.controlledEntityId) {
    throw failure(
      "3C_INPUT_INVALID",
      "committed Action actor does not match the controlled Subject.",
    );
  }
  const cameraContext = cameraContextFromCommittedFacts(
    commit,
    admittedContext,
    action,
    registry,
  );
  if (stringifyCanonicalJson(cameraContext) !== stringifyCanonicalJson(admittedContext)) {
    throw failure(
      "3C_CAMERA_CONTEXT_UNCOMMITTED",
      "Camera Context differs from committed movement, Action or environment facts.",
    );
  }
  return Object.freeze({
    tick: commit.tick,
    commit,
    presentation,
    ...(action === undefined ? {} : { committedActionState: action }),
    cameraContext,
  });
}

function abortPreparedPair(
  camera: BabylonPreparedProjectionTransactionV1 | undefined,
  animation: BabylonPreparedProjectionTransactionV1 | undefined,
): unknown {
  let firstError: unknown;
  for (const transaction of [camera, animation]) {
    if (transaction === undefined) continue;
    try {
      transaction.abort();
    } catch (error) {
      firstError ??= error;
    }
  }
  return firstError;
}

/**
 * Prepared Golden animation + Camera projection. It consumes only the frozen
 * committed boundary and never receives a Subject Transform or movement port.
 */
export class GoldenHumanoidPresentationContextProjectionV1
implements GoldenHumanoidProjectionPortV1 {
  #disposed = false;
  #inFlight = false;
  #latestConsumedTick: number | undefined;
  #generation = 0;

  constructor(
    readonly options: GoldenHumanoidPresentationContextProjectionOptionsV1,
  ) {}

  prepare(input: GoldenHumanoidProjectionInputV1): GoldenHumanoidPreparedProjectionV1 {
    this.#assertLive();
    if (this.#inFlight) {
      throw failure("3C_TICK_TOKEN_STALE", "a Golden projection Tick is already prepared.");
    }
    const admitted = admitProjectionInput(input, this.options.actionPresentationRegistry);
    if (this.#latestConsumedTick !== undefined && admitted.tick <= this.#latestConsumedTick) {
      throw failure("3C_TICK_TOKEN_STALE", "Golden projection Tick is old or replayed.");
    }
    this.#latestConsumedTick = admitted.tick;
    this.#inFlight = true;
    const generation = ++this.#generation;
    let animation: BabylonPreparedProjectionTransactionV1 | undefined;
    let camera: BabylonPreparedProjectionTransactionV1 | undefined;
    try {
      const animationRequest: BabylonCommittedAnimationProjectionRequestV1 = Object.freeze({
        schemaVersion: 1,
        committedTick: admitted.tick,
        presentation: admitted.presentation,
        ...(admitted.committedActionState === undefined
          ? {}
          : { committedActionState: admitted.committedActionState }),
      });
      animation = this.options.animationProjectionPort.prepareCommittedAnimation(
        animationRequest,
      );
      const cameraRequest: BabylonPreparedCameraDirectorProjectionRequestV1 = Object.freeze({
        schemaVersion: 1,
        committedTick: admitted.tick,
        cameraContext: admitted.cameraContext,
      });
      camera = this.options.cameraDirectorProjectionPort.prepareCameraDirectorUpdate(
        cameraRequest,
      );
    } catch (error) {
      abortPreparedPair(camera, animation);
      this.#inFlight = false;
      throw error;
    }

    let state: "prepared" | "committed" | "aborted" = "prepared";
    const abort = (): void => {
      if (state === "aborted") return;
      if (generation !== this.#generation) {
        throw failure("3C_TICK_TOKEN_STALE", "projection transaction was superseded.");
      }
      const rollbackError = abortPreparedPair(camera, animation);
      state = "aborted";
      this.#inFlight = false;
      if (rollbackError !== undefined) throw rollbackError;
    };
    return Object.freeze({
      commit: (): void => {
        this.#assertLive();
        if (state !== "prepared" || generation !== this.#generation) {
          throw failure("3C_TICK_TOKEN_STALE", "projection transaction is not prepared.");
        }
        try {
          animation!.commit();
          camera!.commit();
          state = "committed";
          this.#inFlight = false;
        } catch (error) {
          abortPreparedPair(camera, animation);
          state = "aborted";
          this.#inFlight = false;
          throw error;
        }
      },
      abort,
    });
  }

  reset(): void {
    this.#assertLive();
    if (this.#inFlight) {
      throw failure("3C_TICK_TOKEN_STALE", "cannot reset a prepared projection Tick.");
    }
    this.#latestConsumedTick = undefined;
    this.#generation += 1;
  }

  dispose(): void {
    if (this.#disposed) return;
    if (this.#inFlight) {
      throw failure("3C_TICK_TOKEN_STALE", "cannot dispose a prepared projection Tick.");
    }
    this.#disposed = true;
    this.#latestConsumedTick = undefined;
    this.#generation += 1;
  }

  #assertLive(): void {
    if (this.#disposed) {
      throw failure("3C_RUNTIME_DISPOSED", "Golden presentation projection is disposed.");
    }
  }
}
