import {
  parseCharacterMovementCommandV1,
  type BodyResolutionV1,
  type BodySampleV1,
  type BodySupportSampleV1,
  type CharacterBodyPortV1,
  type CharacterMovementCommandV1,
  type CharacterMovementRuntimeV1,
  type CharacterMovementSnapshotV1,
  type JumpEpisodeStateV1,
  type MovementCommitV1,
  type MovementProposalV1,
  type MovementTickTokenV1,
} from "@whitebox-world/character-movement";
import {
  parseCameraContextSampleV2,
  type CameraContextSampleV2,
} from "@whitebox-world/camera";
import type { GameplayActionStateV1 } from "@whitebox-world/gameplay-contracts";
import {
  resolveActionPresentationV1,
  verifyResolvedActionPresentationV1,
  type ActionPresentationRegistryV1,
  type ResolvedActionPresentationV1,
} from "@whitebox-world/subject-actions";

export const GOLDEN_HUMANOID_TICK_STAGES_V1 = Object.freeze([
  "normalize-input",
  "possession-action-admission",
  "action-layered-move",
  "body-begin-sample",
  "movement-mode",
  "movement-proposal",
  "body-resolve",
  "authority-commit",
  "animation-camera-projection",
  "render-interpolation",
] as const);

export type GoldenHumanoidTickStageV1 =
  typeof GOLDEN_HUMANOID_TICK_STAGES_V1[number];

/**
 * Provider-specific transaction control. The provider-neutral BodyPort remains
 * unchanged; only the Babylon owner can commit or restore its staged native
 * center, velocity and contact-visible state.
 */
export interface GoldenCharacterBodyTransactionPortV1
  extends CharacterBodyPortV1 {
  commitTick(token: MovementTickTokenV1): void;
  abortTick(token: MovementTickTokenV1): void;
  resetToState(state: Readonly<{
    positionMetersXYZ: readonly [number, number, number];
    linearVelocityMetersPerSecondXYZ: readonly [number, number, number];
  }>): BodySupportSampleV1;
}

export interface GoldenHumanoidPreparedProjectionV1 {
  commit(): void;
  abort(): void;
}

export interface GoldenHumanoidProjectionInputV1 {
  readonly commit: MovementCommitV1;
  readonly presentation: ResolvedActionPresentationV1;
  readonly cameraContext: CameraContextSampleV2;
  readonly committedActionState?: GameplayActionStateV1;
}

export interface GoldenHumanoidProjectionPortV1 {
  prepare(
    input: GoldenHumanoidProjectionInputV1,
  ): GoldenHumanoidPreparedProjectionV1;
}

export interface GoldenHumanoidCameraContextAuthorityV1 {
  readonly controlledEntityId: string;
  readonly targetEntityId: string;
  readonly relationshipContexts:
    CameraContextSampleV2["environment"]["relationshipContexts"];
}

export interface GoldenHumanoidTickInputV1 {
  readonly command: CharacterMovementCommandV1;
  readonly activeActionState?: GameplayActionStateV1;
  readonly cameraContextAuthority?: GoldenHumanoidCameraContextAuthorityV1;
}

export interface GoldenHumanoidTickResultV1 {
  readonly commit: MovementCommitV1;
  readonly presentation: ResolvedActionPresentationV1;
  readonly stateHash: `sha256:${string}`;
}

export interface GoldenHumanoidBodyDiagnosticV1 {
  readonly tick: number;
  readonly sample: BodySampleV1;
  readonly proposal: MovementProposalV1;
  readonly resolution: BodyResolutionV1;
}

export interface GoldenHumanoid3CVNextTransactionOptionsV1 {
  readonly subjectEntityId: string;
  readonly fixedDeltaSeconds: number;
  readonly movementRuntime: CharacterMovementRuntimeV1;
  readonly bodyPort: GoldenCharacterBodyTransactionPortV1;
  readonly actionPresentationRegistry: ActionPresentationRegistryV1;
  readonly projectionPorts?: readonly GoldenHumanoidProjectionPortV1[];
  readonly onStage?: (stage: GoldenHumanoidTickStageV1) => void;
}

function availableCameraContext(
  options: GoldenHumanoid3CVNextTransactionOptionsV1,
  authority: GoldenHumanoidCameraContextAuthorityV1 | undefined,
  commit: MovementCommitV1,
  action: GameplayActionStateV1 | undefined,
): CameraContextSampleV2 {
  const resolvedAuthority = authority ?? {
    controlledEntityId: options.subjectEntityId,
    targetEntityId: options.subjectEntityId,
    relationshipContexts: [],
  };
  const actionBinding = action === undefined
    ? undefined
    : options.actionPresentationRegistry.resolveAction(
        action.semanticActionRef,
        action.semanticActionHash,
      );
  return parseCameraContextSampleV2({
    schemaVersion: 2,
    semanticAuthorityStatus: "available",
    committedTick: commit.tick,
    controlledEntityId: resolvedAuthority.controlledEntityId,
    targetEntityId: resolvedAuthority.targetEntityId,
    subjectPose: {
      positionMetersXYZ: commit.positionMetersXYZ,
      facingYawRadians: commit.facingYawRadians,
    },
    locomotion: commit.locomotion,
    actionSummary: {
      status: "available",
      activeActionRefs: action === undefined ? [] : [action.semanticActionRef],
      isInterruptible: actionBinding?.isInterruptible ?? true,
    },
    environment: {
      relationshipContexts: resolvedAuthority.relationshipContexts,
      socketPositionsMetersXYZById: {},
      cameraContextTags: [],
    },
  });
}

function failure(code: string, detail: string): Error {
  return new Error(`${code}: ${detail}`);
}

function actionForSubject(
  input: GameplayActionStateV1 | undefined,
  subjectEntityId: string,
): GameplayActionStateV1 | undefined {
  if (input === undefined) return undefined;
  if (input.actorEntityId !== subjectEntityId) {
    throw failure(
      "3C_INPUT_INVALID",
      "committed Action actor does not match the Golden Subject.",
    );
  }
  return input;
}

function currentTickLocomotion(
  snapshot: CharacterMovementSnapshotV1,
  tick: number,
): CharacterMovementSnapshotV1["locomotion"] {
  const previous = snapshot.locomotion;
  if (previous.status !== "active") {
    throw failure(
      "3C_LOCOMOTION_TRANSITION_INVALID",
      "active Golden movement cannot begin from suspended Locomotion.",
    );
  }
  return Object.freeze({
    ...previous,
    linearVelocity: Object.freeze({ ...previous.linearVelocity }),
    committedTick: tick,
  });
}

function prepareActionPresentation(
  tick: number,
  fixedDeltaSeconds: number,
  locomotion: CharacterMovementSnapshotV1["locomotion"],
  jumpEpisode: JumpEpisodeStateV1 | undefined,
  activeActionState: GameplayActionStateV1 | undefined,
  registry: ActionPresentationRegistryV1,
): ResolvedActionPresentationV1 {
  return resolveActionPresentationV1({
    schemaVersion: 1,
    committedTick: tick,
    fixedDeltaSeconds,
    locomotion,
    ...(jumpEpisode === undefined ? {} : { jumpEpisode }),
    ...(activeActionState === undefined ? {} : { activeActionState }),
  }, registry);
}

/**
 * The Golden fixed-Tick coordinator. MovementRuntime is the only semantic
 * movement owner; Babylon BodyPort is the only native-body owner. Projection
 * ports can validate and stage animation, Camera and RuntimeHost publication,
 * but cannot change the movement proposal.
 */
export class GoldenHumanoid3CVNextTransactionV1 {
  readonly #projectionPorts: readonly GoldenHumanoidProjectionPortV1[];
  readonly #failedTicks = new Set<number>();
  #running = false;
  #disposed = false;
  #rollbackFailedClosed = false;
  #latestBodyDiagnostic: GoldenHumanoidBodyDiagnosticV1 | undefined;

  constructor(
    readonly options: GoldenHumanoid3CVNextTransactionOptionsV1,
  ) {
    if (
      options.subjectEntityId.length === 0 ||
      !Number.isFinite(options.fixedDeltaSeconds) ||
      options.fixedDeltaSeconds <= 0
    ) {
      throw failure("3C_INPUT_INVALID", "Golden transaction options are invalid.");
    }
    this.#projectionPorts = Object.freeze([...(options.projectionPorts ?? [])]);
  }

  runTick(input: GoldenHumanoidTickInputV1): GoldenHumanoidTickResultV1 {
    this.#assertRunnable();
    if (this.#running) {
      throw failure("3C_TICK_TOKEN_STALE", "Golden Tick is already active.");
    }
    this.#running = true;
    let token: MovementTickTokenV1 | undefined;
    let bodyBegun = false;
    let movementAdvanced = false;
    const prepared: GoldenHumanoidPreparedProjectionV1[] = [];
    const before = this.options.movementRuntime.snapshot();
    let commandTick: number | undefined;
    try {
      this.#stage("normalize-input");
      const admittedCommand = parseCharacterMovementCommandV1(input.command);
      commandTick = admittedCommand.tick;
      if (this.#failedTicks.has(admittedCommand.tick)) {
        throw failure(
          "3C_TICK_TOKEN_STALE",
          "a failed Golden Tick token cannot be replayed.",
        );
      }
      if (admittedCommand.layeredMoves.length !== 0) {
        throw failure(
          "3C_INPUT_INVALID",
          "external Commands cannot inject Golden LayeredMove authority.",
        );
      }

      this.#stage("possession-action-admission");
      const committedActionState = actionForSubject(
        input.activeActionState,
        this.options.subjectEntityId,
      );

      this.#stage("action-layered-move");
      const provisionalPresentation = prepareActionPresentation(
        admittedCommand.tick,
        this.options.fixedDeltaSeconds,
        currentTickLocomotion(before, admittedCommand.tick),
        undefined,
        committedActionState,
        this.options.actionPresentationRegistry,
      );
      const movementCommand = parseCharacterMovementCommandV1({
        ...admittedCommand,
        layeredMoves: provisionalPresentation.layeredMoves,
      });
      token = this.options.movementRuntime.beginTick(movementCommand);

      this.#stage("body-begin-sample");
      const sample = this.options.bodyPort.beginTick({
        token,
        tick: movementCommand.tick,
      });
      bodyBegun = true;
      if (before.tick === 0) {
        this.options.movementRuntime.reconcileSupportAfterReset(
          sample.support,
          token,
        );
      }

      this.#stage("movement-mode");
      const proposal = this.options.movementRuntime.proposeMovement(token, sample);
      this.#stage("movement-proposal");

      this.#stage("body-resolve");
      const bodyResolution = this.options.bodyPort.resolve({ token, proposal });

      this.#stage("authority-commit");
      const commit = this.options.movementRuntime.reconcile(token, bodyResolution);
      movementAdvanced = true;
      this.#stage("animation-camera-projection");
      const presentation = prepareActionPresentation(
        commit.tick,
        this.options.fixedDeltaSeconds,
        commit.locomotion,
        commit.jumpEpisode,
        committedActionState,
        this.options.actionPresentationRegistry,
      );
      verifyResolvedActionPresentationV1(
        presentation,
        this.options.actionPresentationRegistry,
        committedActionState,
      );
      const projectionInput = Object.freeze({
        commit,
        presentation,
        cameraContext: availableCameraContext(
          this.options,
          input.cameraContextAuthority,
          commit,
          committedActionState,
        ),
        ...(committedActionState === undefined
          ? {}
          : { committedActionState }),
      });
      for (const port of this.#projectionPorts) {
        prepared.push(port.prepare(projectionInput));
      }

      this.#stage("render-interpolation");
      for (const projection of prepared) projection.commit();
      const snapshot = this.options.movementRuntime.snapshot();
      const result = Object.freeze({
        commit,
        presentation,
        stateHash: snapshot.stateHash,
      });
      // Body commit is the final irreversible publication. Every fallible
      // projection prepare/commit and semantic snapshot has completed while
      // the native begin checkpoint is still abortable.
      this.options.bodyPort.commitTick(token);
      this.#latestBodyDiagnostic = Object.freeze({
        tick: commit.tick,
        sample,
        proposal,
        resolution: bodyResolution,
      });
      return result;
    } catch (error) {
      let rollbackFailed = false;
      for (const projection of [...prepared].reverse()) {
        try {
          projection.abort();
        } catch {
          // Preserve the first prepare/commit failure while continuing rollback.
          rollbackFailed = true;
        }
      }
      if (token !== undefined && bodyBegun) {
        try {
          this.options.bodyPort.abortTick(token);
        } catch {
          // Preserve the primary failure. Provider abort is specified fail-closed.
          rollbackFailed = true;
        }
      }
      if (token !== undefined || movementAdvanced) {
        try {
          this.options.movementRuntime.reset(before);
        } catch {
          // Preserve the primary failure and leave the transaction fail-closed.
          rollbackFailed = true;
        }
      }
      if (commandTick !== undefined) this.#failedTicks.add(commandTick);
      if (rollbackFailed) this.#rollbackFailedClosed = true;
      throw error;
    } finally {
      this.#running = false;
    }
  }

  reset(snapshot?: CharacterMovementSnapshotV1): void {
    this.#resetMovementAndBody(() => {
      this.options.movementRuntime.reset(snapshot);
    });
  }

  resetAtSupportedPlacement(
    input: Parameters<
      CharacterMovementRuntimeV1["resetAtSupportedPlacement"]
    >[0],
  ): void {
    this.#resetMovementAndBody(() => {
      this.options.movementRuntime.resetAtSupportedPlacement(input);
    });
  }

  suspendForRelationship(
    input: Parameters<
      CharacterMovementRuntimeV1["suspendForRelationship"]
    >[0],
  ): void {
    this.#resetMovementAndBody(() => {
      this.options.movementRuntime.suspendForRelationship(input);
    });
  }

  #resetMovementAndBody(mutateOwner: () => void): void {
    this.#assertRunnable();
    if (this.#running) {
      throw failure("3C_TICK_TOKEN_STALE", "Golden Tick is active during reset.");
    }
    const before = this.options.movementRuntime.snapshot();
    mutateOwner();
    const after = this.options.movementRuntime.snapshot();
    try {
      const support = this.options.bodyPort.resetToState({
        positionMetersXYZ: after.positionMetersXYZ,
        linearVelocityMetersPerSecondXYZ:
          after.linearVelocityMetersPerSecondXYZ,
      });
      if (after.locomotion.status === "active") {
        this.options.movementRuntime.reconcileSupportAfterReset(
          support,
          undefined,
        );
      }
    } catch (error) {
      this.options.movementRuntime.reset(before);
      throw error;
    }
    this.#latestBodyDiagnostic = undefined;
    this.#failedTicks.clear();
  }

  snapshot(): CharacterMovementSnapshotV1 {
    this.#assertNotDisposed();
    return this.options.movementRuntime.snapshot();
  }

  latestBodyDiagnostic(): GoldenHumanoidBodyDiagnosticV1 | undefined {
    this.#assertNotDisposed();
    return this.#latestBodyDiagnostic;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.options.movementRuntime.dispose();
    this.options.bodyPort.dispose();
    this.#failedTicks.clear();
  }

  #stage(stage: GoldenHumanoidTickStageV1): void {
    this.options.onStage?.(stage);
  }

  #assertRunnable(): void {
    this.#assertNotDisposed();
    if (this.#rollbackFailedClosed) {
      throw failure(
        "3C_ROLLBACK_FAILED_CLOSED",
        "a failed Golden Tick could not restore every transaction participant.",
      );
    }
  }

  #assertNotDisposed(): void {
    if (this.#disposed) {
      throw failure("3C_RUNTIME_DISPOSED", "Golden transaction is disposed.");
    }
  }
}
