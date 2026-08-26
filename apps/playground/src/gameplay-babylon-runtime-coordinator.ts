import {
  createCoreControlFeatureFactoryV1,
  createCoreSemanticActionFeatureFactoryV1,
  createMountedRelationshipFeatureFactoryV1,
  type GameplayActionRequestResolverV1,
  type GameplayModeV1,
} from "@whitebox-world/gameplay";
import {
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  deriveWorldStateSnapshotRefV1,
  type GameplayCommandReceiptV1,
  type GameplayCommandV1,
  type GameplayDiagnosticV1,
  type GameplayEventV1,
  type GameplayInspectionSnapshotV1,
  type WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  BabylonWorldRuntime,
  FIXED_TIME_STEP_SECONDS,
  createBabylonGameplayWorldPortV1,
  type BabylonWorldRuntimeInitializationStageV1,
  type BabylonRuntimeProjectionV1,
  type SubjectAssetCacheOptionsV1,
  type SubjectAssetResolverV1,
} from "@whitebox-world/runtime-babylon";
import {
  RuntimeHost,
  type GameplayWorldAdapterFactoryV1,
  type GameplayWorldPortV1,
  type PublishWorldReplacementResultV1,
  type RuntimeActivityLeaseV1,
  type RuntimeActivityRecordV1,
  type RuntimeCandidatePublicationGateInputV1,
  type RuntimeWorldAdapterDescriptorV1,
  type RuntimeWorldConfigurationV1,
  type RuntimeWorldPublicationIdentitiesV1,
  type WorldSessionPublicationV1,
} from "@whitebox-world/runtime-host";
import type {
  FixedInputV1,
  RuntimeActivityReceiptV1,
  RuntimeActivityRequestV1,
  WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

export const PLAYGROUND_PARTICIPANT_ID_V1 = "participant-primary" as const;
export const PLAYGROUND_CONTROLLER_ENTITY_ID_V1 = "controller-primary" as const;

const PLAYGROUND_CONTROLLER_DEFINITION_REF_V1 =
  "worldkit://controller-definition/playground.local@1";
const PLAYGROUND_CONTROLLER_DEFINITION_V1 = Object.freeze({
  kind: "controller-definition" as const,
  id: "playground.local",
  version: 1 as const,
  inputMode: "human" as const,
  controlModel: "single-possessed-entity" as const,
});
const PLAYGROUND_CONTROLLER_DEFINITION_HASH_V1 =
  sha256CanonicalJson(PLAYGROUND_CONTROLLER_DEFINITION_V1);
const PLAYGROUND_GAMEPLAY_MODE_REF_V1 =
  "worldkit://gameplay-mode/outdoor.exploration@1";
const MAXIMUM_WORLD_SESSION_COUNT_V1 = 1_024;
const MAXIMUM_RUNTIME_ACTIVITY_RECORD_COUNT_V1 = 256;
const MAXIMUM_CONCURRENT_RUNTIME_HANDLE_COUNT_V1 = 2;

/**
 * Provider/View surface retained by the Playground adapter. Gameplay mutation,
 * fixed input, reset, and disposal stay exclusively owned by RuntimeHost.
 */
export type GameplayBabylonRuntimeV1 = Pick<
  BabylonWorldRuntime,
  | "renderFrame"
  | "renderFrameWhenReady"
  | "resize"
  | "getControlCaptureCapabilities"
  | "waitForRenderReady"
  | "captureControlFrame"
  | "requestCameraProfile"
  | "resetCameraProfile"
  | "adjustCameraView"
  | "resetCameraView"
  | "getCameraPreviewState"
  | "applyCameraPreview"
  | "applySubjectPresetTuning"
  | "runHarness"
  | "requestMotionProfile"
> & Readonly<{
  snapshot(): BabylonRuntimeProjectionV1;
}>;

export interface GameplayBabylonRuntimeBundleV1 {
  readonly runtime: GameplayBabylonRuntimeV1;
  /** Owns disposal of the Runtime and all provider resources. */
  readonly gameplayWorldPort: GameplayWorldPortV1;
}

export interface GameplayBabylonRuntimeBundleFactoryInputV1 {
  readonly descriptor: RuntimeWorldAdapterDescriptorV1;
  readonly canvas: HTMLCanvasElement;
  readonly subjectAssetResolver?: SubjectAssetResolverV1;
  readonly subjectAssetCacheOptions?: SubjectAssetCacheOptionsV1;
  readonly onInitializationStage?: (
    worldSessionId: string,
    stage: BabylonWorldRuntimeInitializationStageV1,
  ) => void;
}

export type GameplayBabylonRuntimeBundleFactoryV1 = (
  input: GameplayBabylonRuntimeBundleFactoryInputV1,
) => Promise<GameplayBabylonRuntimeBundleV1>;

export interface CreateGameplayBabylonRuntimeCoordinatorOptionsV1 {
  readonly runtimeSessionId: string;
  readonly initialWorldConfiguration: RuntimeWorldConfigurationV1;
  readonly subjectAssetResolver?: SubjectAssetResolverV1;
  readonly subjectAssetCacheOptions?: SubjectAssetCacheOptionsV1;
  readonly onInitializationStage?: (
    worldSessionId: string,
    stage: BabylonWorldRuntimeInitializationStageV1,
  ) => void;
  readonly document?: Pick<Document, "createElement">;
  readonly runtimeBundleFactory?: GameplayBabylonRuntimeBundleFactoryV1;
  readonly worldSessionIdFactory?: () => string;
  readonly gameplayActionRequestResolver?: GameplayActionRequestResolverV1;
}

interface RuntimeHandleV1 {
  readonly canvas: HTMLCanvasElement;
  readonly runtime: GameplayBabylonRuntimeV1;
  readonly port: GameplayWorldPortV1;
}

interface PublicRuntimeActivityRecordV1 {
  readonly request: RuntimeActivityRequestV1;
  readonly requestHash: `sha256:${string}`;
  readonly lease: RuntimeActivityLeaseV1;
  receipt: RuntimeActivityReceiptV1;
}

function gameplayModeFactory(): GameplayModeV1 {
  return Object.freeze({
    gameplayModeRef: PLAYGROUND_GAMEPLAY_MODE_REF_V1,
    evaluateCommand: () => Object.freeze({ status: "accepted" as const }),
  });
}

function diagnostic(
  code: GameplayDiagnosticV1["code"],
  message: string,
): GameplayDiagnosticV1 {
  return Object.freeze({ code, message });
}

async function createProductionRuntimeBundle(
  input: GameplayBabylonRuntimeBundleFactoryInputV1,
): Promise<GameplayBabylonRuntimeBundleV1> {
  const runtime = await BabylonWorldRuntime.create({
    executionPlan: input.descriptor.executionPlan,
    runtimeSessionId: input.descriptor.runtimeSessionId,
    canvas: input.canvas,
    autoStartRenderLoop: false,
    ...(isNil(input.subjectAssetResolver)
      ? {}
      : { subjectAssetResolver: input.subjectAssetResolver }),
    ...(isNil(input.subjectAssetCacheOptions)
      ? {}
      : { subjectAssetCacheOptions: input.subjectAssetCacheOptions }),
    ...(isNil(input.onInitializationStage)
      ? {}
      : {
          onInitializationStage: (stage) =>
            input.onInitializationStage?.(
              input.descriptor.worldSessionId,
              stage,
            ),
        }),
  });
  try {
    return Object.freeze({
      runtime,
      gameplayWorldPort: createBabylonGameplayWorldPortV1(
        runtime,
        PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
      ),
    });
  } catch (error) {
    await runtime.dispose().catch(() => undefined);
    throw error;
  }
}

function wrapOwnedPort(
  port: GameplayWorldPortV1,
  onDisposed: () => void,
): GameplayWorldPortV1 {
  let disposePromise: Promise<void> | undefined;
  return Object.freeze({
    initialize: () => port.initialize(),
    hasEntity: (entityId: string) => port.hasEntity(entityId),
    isEntityControllable: (entityId: string) =>
      port.isEntityControllable(entityId),
    isActionAvailable: (
      actorEntityId: string,
      semanticActionRef: string,
      transition: Parameters<GameplayWorldPortV1["isActionAvailable"]>[2],
    ) =>
      port.isActionAvailable(actorEntityId, semanticActionRef, transition),
    prepareGameplayTransition: (
      transition: Parameters<GameplayWorldPortV1["prepareGameplayTransition"]>[0],
    ) =>
      port.prepareGameplayTransition(transition),
    estimateFixedInputTickCapacity: (
      input: Parameters<GameplayWorldPortV1["estimateFixedInputTickCapacity"]>[0],
    ) =>
      port.estimateFixedInputTickCapacity(input),
    runFixedInputTick: (
      input: Parameters<GameplayWorldPortV1["runFixedInputTick"]>[0],
    ) => port.runFixedInputTick(input),
    snapshot: () => port.snapshot(),
    dispose: (): Promise<void> => {
      if (!isNil(disposePromise)) return disposePromise;
      disposePromise = Promise.resolve().then(() => port.dispose()).finally(
        onDisposed,
      );
      return disposePromise;
    },
  });
}

function activePossessionEntityId(
  inspection: GameplayInspectionSnapshotV1,
): string | undefined {
  const relationships = Object.values(
    inspection.relationshipStatesById,
  ).filter(
    (relationship) =>
      relationship.type === "possessedBy" &&
      relationship.controllerEntityId === PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
  );
  if (relationships.length > 1) {
    throw new Error(
      "WORLDKIT_RUNTIME_POSSESSION_INVALID: Multiple canonical control owners were published.",
    );
  }
  const relationship = relationships[0];
  return relationship?.type === "possessedBy"
    ? relationship.controlledEntityId
    : undefined;
}

function cameraProjection(
  publication: WorldSessionPublicationV1,
  runtimeProjection: BabylonRuntimeProjectionV1,
): WorldRuntimeSnapshotV4["view"]["camera"] {
  const controlledEntityId = activePossessionEntityId(
    publication.gameplayInspection,
  );
  if (isNil(controlledEntityId)) return Object.freeze({ mode: "unbound" });
  const camera = runtimeProjection.camera;
  if (
    isNil(camera.activeCameraProfileRef) ||
    isNil(camera.activeCameraRigRef) ||
    isNil(camera.activeCameraModifierRefs) ||
    isNil(camera.safeFallbackActive) ||
    isNil(camera.viewYawOffsetRadians) ||
    isNil(camera.viewPitchOffsetRadians) ||
    isNil(camera.viewDistanceOffsetMeters) ||
    isNil(camera.selectionDecision) ||
    isNil(camera.isTargetSocketFallback) ||
    isNil(camera.desiredTargetPositionMetersXYZ) ||
    isNil(camera.desiredPositionMetersXYZ) ||
    isNil(camera.actualPositionMetersXYZ) ||
    isNil(camera.finalFovDegrees) ||
    isNil(camera.positionLagXYZ) ||
    isNil(camera.rotationLagRadiansXYZ) ||
    isNil(camera.fixedStepDeltaSeconds) ||
    isNil(camera.resolvedParameters) ||
    isNil(camera.previewParameterOverrides) ||
    isNil(camera.profileTransitionProgressRatio) ||
    isNil(camera.controlForwardXYZ) ||
    isNil(camera.subjectForwardXYZ) ||
    isNil(camera.subjectVelocityMetersPerSecondXYZ)
  ) {
    throw new Error(
      "WORLDKIT_RUNTIME_CAMERA_STATE_INVALID: Bound camera state is incomplete.",
    );
  }
  return Object.freeze({
    mode: "tracking",
    id: camera.entityId,
    targetEntityId: controlledEntityId,
    positionMetersXYZ: Object.freeze([...camera.positionMetersXYZ]) as
      readonly [number, number, number],
    activeCameraProfileRef: camera.activeCameraProfileRef,
    activeCameraRigRef: camera.activeCameraRigRef,
    activeCameraModifierRefs: Object.freeze([
      ...camera.activeCameraModifierRefs,
    ]),
    safeFallbackActive: camera.safeFallbackActive,
    viewYawOffsetRadians: camera.viewYawOffsetRadians,
    viewPitchOffsetRadians: camera.viewPitchOffsetRadians,
    viewDistanceOffsetMeters: camera.viewDistanceOffsetMeters,
    selectionDecision: Object.freeze({
      ...camera.selectionDecision,
      activeCameraModifierRefs: Object.freeze([
        ...camera.selectionDecision.activeCameraModifierRefs,
      ]),
      matchedCameraContextRuleIds: Object.freeze([
        ...camera.selectionDecision.matchedCameraContextRuleIds,
      ]),
      cameraViewPreference: Object.freeze({
        ...camera.selectionDecision.cameraViewPreference,
      }),
      diagnostics: Object.freeze(camera.selectionDecision.diagnostics.map(
        (diagnostic) => Object.freeze({ ...diagnostic }),
      )),
      explain: Object.freeze({
        ...camera.selectionDecision.explain,
        cameraViewPreference: Object.freeze({
          ...camera.selectionDecision.explain.cameraViewPreference,
        }),
        cameraContextRules: Object.freeze(
          camera.selectionDecision.explain.cameraContextRules.map((rule) =>
            Object.freeze({
              ...rule,
              unmatchedReasons: Object.freeze([...rule.unmatchedReasons]),
            })
          ),
        ),
        appliedCameraModifierRefs: Object.freeze([
          ...camera.selectionDecision.explain.appliedCameraModifierRefs,
        ]),
      }),
    }),
    ...(camera.selectedTargetSocketId === undefined
      ? {}
      : { selectedTargetSocketId: camera.selectedTargetSocketId }),
    ...(camera.targetSocketPositionMetersXYZ === undefined
      ? {}
      : {
          targetSocketPositionMetersXYZ: Object.freeze([
            ...camera.targetSocketPositionMetersXYZ,
          ]) as readonly [number, number, number],
        }),
    isTargetSocketFallback: camera.isTargetSocketFallback,
    desiredTargetPositionMetersXYZ: Object.freeze([
      ...camera.desiredTargetPositionMetersXYZ,
    ]) as readonly [number, number, number],
    desiredPositionMetersXYZ: Object.freeze([
      ...camera.desiredPositionMetersXYZ,
    ]) as readonly [number, number, number],
    actualPositionMetersXYZ: Object.freeze([
      ...camera.actualPositionMetersXYZ,
    ]) as readonly [number, number, number],
    finalFovDegrees: camera.finalFovDegrees,
    ...(camera.requestedArmLengthMeters === undefined
      ? {}
      : { requestedArmLengthMeters: camera.requestedArmLengthMeters }),
    ...(camera.safeArmLengthMeters === undefined
      ? {}
      : { safeArmLengthMeters: camera.safeArmLengthMeters }),
    ...(camera.effectiveArmLengthMeters === undefined
      ? {}
      : { effectiveArmLengthMeters: camera.effectiveArmLengthMeters }),
    ...(camera.isCollisionRetracted === undefined
      ? {}
      : { isCollisionRetracted: camera.isCollisionRetracted }),
    ...(camera.collisionHitEntityId === undefined
      ? {}
      : { collisionHitEntityId: camera.collisionHitEntityId }),
    ...(camera.collisionHitPositionXYZ === undefined
      ? {}
      : {
          collisionHitPositionXYZ: Object.freeze([
            ...camera.collisionHitPositionXYZ,
          ]) as readonly [number, number, number],
        }),
    positionLagXYZ: Object.freeze([...camera.positionLagXYZ]) as
      readonly [number, number, number],
    rotationLagRadiansXYZ: Object.freeze([...camera.rotationLagRadiansXYZ]) as
      readonly [number, number, number],
    ...(camera.recenterRemainingSeconds === undefined
      ? {}
      : { recenterRemainingSeconds: camera.recenterRemainingSeconds }),
    fixedStepDeltaSeconds: camera.fixedStepDeltaSeconds,
    resolvedParameters: Object.freeze({ ...camera.resolvedParameters }),
    previewParameterOverrides: Object.freeze({
      ...camera.previewParameterOverrides,
    }),
    profileTransitionProgressRatio: camera.profileTransitionProgressRatio,
    controlForwardXYZ: Object.freeze([...camera.controlForwardXYZ]) as
      readonly [number, number, number],
    subjectForwardXYZ: Object.freeze([...camera.subjectForwardXYZ]) as
      readonly [number, number, number],
    subjectVelocityMetersPerSecondXYZ: Object.freeze([
      ...camera.subjectVelocityMetersPerSecondXYZ,
    ]) as readonly [number, number, number],
  });
}

function subjectProjection(
  worldState: WorldStateSnapshotV1,
): WorldRuntimeSnapshotV4["world"]["subjectStatesByEntityId"] {
  const result: Record<
    string,
    WorldRuntimeSnapshotV4["world"]["subjectStatesByEntityId"][string]
  > = {};
  for (const [entityId, entityState] of Object.entries(
    worldState.entityStatesById,
  )) {
    if (entityState.kind !== "spatial-entity-state") continue;
    result[entityId] = Object.freeze({
      entityState,
      capabilityStatesById: Object.freeze(Object.fromEntries(
        Object.entries(worldState.capabilityStatesById).filter(
          ([, capabilityState]) =>
            capabilityState.ownerEntityId === entityId,
        ),
      )),
    });
  }
  return Object.freeze(result);
}

function publicActivityReceipt(
  request: RuntimeActivityRequestV1,
  record: RuntimeActivityRecordV1,
): RuntimeActivityReceiptV1 {
  return Object.freeze({
    kind: "worldkit-runtime-activity-receipt",
    schemaVersion: 1,
    requestId: request.id,
    activityKind: request.activityKind,
    worldSessionId: record.boundWorldSessionId,
    runtimeActivityEpoch: record.runtimeActivityEpoch,
    status: record.status,
  });
}

export class GameplayBabylonRuntimeCoordinatorV1 {
  private readonly runtimeHandlesByWorldSessionId: Map<string, RuntimeHandleV1>;
  private readonly publicActivitiesByRequestId =
    new Map<string, PublicRuntimeActivityRecordV1>();
  private paused = false;
  private disposePromise: Promise<void> | undefined;

  private constructor(
    private readonly host: RuntimeHost,
    private readonly initialControlledEntityId: string,
    handles: Map<string, RuntimeHandleV1>,
  ) {
    this.runtimeHandlesByWorldSessionId = handles;
  }

  static async create(
    options: CreateGameplayBabylonRuntimeCoordinatorOptionsV1,
  ): Promise<GameplayBabylonRuntimeCoordinatorV1> {
    const documentHost = options.document ?? globalThis.document;
    if (isNil(documentHost)) {
      throw new Error(
        "WORLDKIT_RUNTIME_DOCUMENT_UNAVAILABLE: A canvas document is required.",
      );
    }
    const runtimeBundleFactory = options.runtimeBundleFactory ??
      createProductionRuntimeBundle;
    const handles = new Map<string, RuntimeHandleV1>();
    const adapterFactory: GameplayWorldAdapterFactoryV1 = Object.freeze({
      preflightConcurrentResidency: (
        current: RuntimeWorldAdapterDescriptorV1,
        candidate: RuntimeWorldAdapterDescriptorV1,
      ) => {
        if (
          !handles.has(current.worldSessionId) ||
          handles.has(candidate.worldSessionId) ||
          handles.size >= MAXIMUM_CONCURRENT_RUNTIME_HANDLE_COUNT_V1
        ) {
          return Object.freeze({
            status: "rejected" as const,
            diagnostic: diagnostic(
              "WORLD_REPLACEMENT_CAPACITY_EXCEEDED",
              "The Playground Runtime cannot admit another concurrent World.",
            ),
          });
        }
        return Object.freeze({ status: "accepted" as const });
      },
      create: async (descriptor: RuntimeWorldAdapterDescriptorV1) => {
        const canvas = documentHost.createElement("canvas");
        const bundle = await runtimeBundleFactory({
          descriptor,
          canvas,
          ...(isNil(options.subjectAssetResolver)
            ? {}
            : { subjectAssetResolver: options.subjectAssetResolver }),
          ...(isNil(options.subjectAssetCacheOptions)
            ? {}
            : { subjectAssetCacheOptions: options.subjectAssetCacheOptions }),
          ...(isNil(options.onInitializationStage)
            ? {}
            : { onInitializationStage: options.onInitializationStage }),
        });
        if (handles.has(descriptor.worldSessionId)) {
          await bundle.gameplayWorldPort.dispose().catch(() => undefined);
          throw new Error("WORLDKIT_RUNTIME_WORLD_SESSION_ALREADY_OWNED");
        }
        let ownedPort: GameplayWorldPortV1;
        ownedPort = wrapOwnedPort(
          bundle.gameplayWorldPort,
          () => {
            const retained = handles.get(descriptor.worldSessionId);
            if (retained?.port === ownedPort) {
              handles.delete(descriptor.worldSessionId);
            }
          },
        );
        handles.set(descriptor.worldSessionId, Object.freeze({
          canvas,
          runtime: bundle.runtime,
          port: ownedPort,
        }));
        return ownedPort;
      },
      awaitCandidatePublicationReady: async (
        input: RuntimeCandidatePublicationGateInputV1,
      ) => {
        const { worldSessionId, publication } = input;
        const handle = handles.get(worldSessionId);
        if (isNil(handle)) {
          throw new Error("WORLDKIT_RUNTIME_CANDIDATE_HANDLE_NOT_FOUND");
        }
        if (
          activePossessionEntityId(publication.gameplayInspection) !==
            options.initialWorldConfiguration.executionPlan
              .initialControlledEntityId
        ) {
          throw new Error("WORLDKIT_RUNTIME_CANDIDATE_CONTROL_NOT_BOUND");
        }
        await handle.runtime.renderFrameWhenReady();
      },
    });
    const worldSessionIdFactory = options.worldSessionIdFactory ?? (() => {
      let index = 0;
      return () => `${options.runtimeSessionId}.world.${index += 1}`;
    })();
    const builtInFeatureFactories = [
      createCoreControlFeatureFactoryV1(),
      createCoreSemanticActionFeatureFactoryV1(),
      createMountedRelationshipFeatureFactoryV1(),
    ];
    const lockedFeatureRefs = new Set(
      options.initialWorldConfiguration.gameplayBootstrap.featureResourceLocks
        .map(({ resourceRef }) => resourceRef),
    );
    const gameplayFeatureFactories = builtInFeatureFactories.filter(
      ({ manifest }) => lockedFeatureRefs.has(manifest.resourceRef),
    );
    const gameplayCapacityBudget = Object.freeze({
      ...DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
      maximumRelationshipStateCount: Math.max(
        DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1.maximumRelationshipStateCount,
        options.initialWorldConfiguration.gameplayBootstrap.entityDescriptors
          .length + 1,
      ),
    });
    const host = await RuntimeHost.create({
      runtimeSessionId: options.runtimeSessionId,
      initialWorld: options.initialWorldConfiguration,
      participantStates: [{
        id: PLAYGROUND_PARTICIPANT_ID_V1,
        mode: "active",
      }],
      controllerStates: [{
        id: PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
        kind: "controller-entity-state",
        controllerDefinitionRef: PLAYGROUND_CONTROLLER_DEFINITION_REF_V1,
        controllerDefinitionHash: PLAYGROUND_CONTROLLER_DEFINITION_HASH_V1,
        participantId: PLAYGROUND_PARTICIPANT_ID_V1,
        lifecycleMode: "active",
        inputMode: "human",
      }],
      fixedInputControllerEntityId: PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
      gameplayModeFactory,
      gameplayFeatureFactories,
      ...(isNil(options.gameplayActionRequestResolver)
        ? {}
        : {
            gameplayActionRequestResolver:
              options.gameplayActionRequestResolver,
          }),
      gameplayCapacityBudget,
      runtimeHostCapacityBudget: {
        maximumWorldSessionCount: MAXIMUM_WORLD_SESSION_COUNT_V1,
        maximumRuntimeActivityRecordCount:
          MAXIMUM_RUNTIME_ACTIVITY_RECORD_COUNT_V1,
      },
      adapterFactory,
      worldSessionIdFactory,
    });
    const coordinator = new GameplayBabylonRuntimeCoordinatorV1(
      host,
      options.initialWorldConfiguration.executionPlan.initialControlledEntityId,
      handles,
    );
    try {
      const receipt = await host.executeGameplayCommand({
        schemaVersion: 1,
        id: `command.playground.initial-bind.${host.currentWorldSessionId}`,
        type: "control.bind",
        runtimeSessionId: options.runtimeSessionId,
        worldSessionId: host.currentWorldSessionId,
        controllerEntityId: PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
        controlledEntityId:
          options.initialWorldConfiguration.executionPlan
            .initialControlledEntityId,
        expectedPossession: { mode: "unbound" },
      });
      if (receipt.status !== "committed") {
        throw new Error(
          `${receipt.diagnostic.code}: Initial control binding was rejected.`,
        );
      }
      await coordinator.activeRuntime().renderFrameWhenReady();
      return coordinator;
    } catch (error) {
      await host.dispose().catch(() => undefined);
      throw error;
    }
  }

  activeRuntime(): GameplayBabylonRuntimeV1 {
    return this.activeHandle().runtime;
  }

  activeCanvas(): HTMLCanvasElement {
    return this.activeHandle().canvas;
  }

  hostPublication(): WorldSessionPublicationV1 {
    return this.host.snapshot();
  }

  snapshot(): WorldRuntimeSnapshotV4 {
    const publication = this.host.snapshot();
    const runtimeProjection = this.activeRuntime().snapshot();
    const hostPhase = this.host.phase;
    return Object.freeze({
      kind: "worldkit-runtime-snapshot",
      schemaVersion: 4,
      runtimeSessionId: this.host.runtimeSessionId,
      worldSessionId: publication.worldState.worldSessionId,
      world: Object.freeze({
        publicationEpoch: publication.publicationEpoch,
        simulationTick: publication.worldState.simulationTick,
        worldStateRef: deriveWorldStateSnapshotRefV1({
          runtimeSessionId: publication.worldState.runtimeSessionId,
          worldSessionId: publication.worldState.worldSessionId,
          worldStateHash: publication.worldState.worldStateHash,
        }),
        worldStateHash: publication.worldState.worldStateHash,
        subjectStatesByEntityId: subjectProjection(publication.worldState),
        gameplayInspection: publication.gameplayInspection,
      }),
      view: Object.freeze({
        viewStateRevision: publication.viewState.viewStateRevision,
        camera: cameraProjection(publication, runtimeProjection),
      }),
      runtime: Object.freeze({
        phase: hostPhase === "failed"
          ? "failed" as const
          : hostPhase === "disposed"
          ? "disposed" as const
          : "ready" as const,
        isPaused: this.paused,
        fixedTimeStepSeconds: FIXED_TIME_STEP_SECONDS,
      }),
      resources: Object.freeze({
        phase: hostPhase === "failed" ? "failed" as const : "ready" as const,
        meshCount: runtimeProjection.resources.meshes,
        physicsBodyCount: runtimeProjection.resources.bodies,
        terrainSampleCount: runtimeProjection.resources.terrainSamples,
      }),
    });
  }

  getGameplayInspectionSnapshot(): GameplayInspectionSnapshotV1 {
    return this.host.snapshot().gameplayInspection;
  }

  executeGameplayCommand(
    command: GameplayCommandV1,
  ): Promise<GameplayCommandReceiptV1> {
    return this.host.executeGameplayCommand(command);
  }

  currentRuntimePublicationIdentity(): RuntimeWorldPublicationIdentitiesV1 {
    const publication = this.host.snapshot();
    return Object.freeze({
      runtimeSessionId: this.host.runtimeSessionId,
      worldSessionId: this.host.currentWorldSessionId,
      worldPackageRootHash: publication.worldState.worldPackageRootHash,
      simulationTick: publication.worldState.simulationTick,
    });
  }

  publishWorldReplacementV1(
    input: unknown,
  ): Promise<PublishWorldReplacementResultV1> {
    return this.host.publishWorldReplacementV1(input);
  }

  async runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV4> {
    await this.host.runFixedInput(input);
    return this.snapshot();
  }

  eventsAfter(
    afterEventSequence: number,
    maximumEventCount: number,
  ): readonly GameplayEventV1[] {
    return this.host.eventsAfter(afterEventSequence, maximumEventCount);
  }

  getWorldStateSnapshot(
    worldStateRef: string,
  ): WorldStateSnapshotV1 | undefined {
    return this.host.getWorldStateSnapshot(worldStateRef);
  }

  acquireRuntimeActivity(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1 {
    const requestHash = sha256CanonicalJson(request);
    const retained = this.publicActivitiesByRequestId.get(request.id);
    if (!isNil(retained)) {
      if (retained.requestHash !== requestHash) {
        return this.rejectedActivityReceipt(
          request,
          "RUNTIME_ACTIVITY_ID_CONFLICT",
          `Runtime Activity '${request.id}' conflicts with a retained request.`,
        );
      }
      if (retained.receipt.status === "active") return retained.receipt;
      return this.rejectedActivityReceipt(
        request,
        "RUNTIME_ACTIVITY_NOT_ACTIVE",
        `Runtime Activity '${request.id}' is already terminal.`,
      );
    }
    if (request.expectedWorldSessionId !== this.host.currentWorldSessionId) {
      return this.rejectedActivityReceipt(
        request,
        "WORLD_SESSION_STALE",
        "Runtime Activity expected another WorldSession.",
      );
    }
    const acquisition = this.host.acquireRuntimeActivity({
      kind: request.activityKind,
      requestId: request.id,
      payloadHash: requestHash,
    });
    if (acquisition.status === "rejected") {
      return this.rejectedActivityReceipt(
        request,
        acquisition.diagnostic.code,
        acquisition.diagnostic.message,
      );
    }
    const receipt = Object.freeze({
      kind: "worldkit-runtime-activity-receipt" as const,
      schemaVersion: 1 as const,
      requestId: request.id,
      activityKind: request.activityKind,
      worldSessionId: acquisition.lease.boundWorldSessionId,
      runtimeActivityEpoch: acquisition.lease.runtimeActivityEpoch,
      status: "active" as const,
    });
    this.publicActivitiesByRequestId.set(request.id, {
      request,
      requestHash: requestHash as `sha256:${string}`,
      lease: acquisition.lease,
      receipt,
    });
    return receipt;
  }

  releaseRuntimeActivity(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1 {
    const retained = this.publicActivitiesByRequestId.get(request.id);
    if (isNil(retained)) {
      return this.rejectedActivityReceipt(
        request,
        "RUNTIME_ACTIVITY_NOT_ACTIVE",
        `Runtime Activity '${request.id}' is not retained.`,
      );
    }
    if (retained.requestHash !== sha256CanonicalJson(request)) {
      return this.rejectedActivityReceipt(
        request,
        "RUNTIME_ACTIVITY_ID_CONFLICT",
        `Runtime Activity '${request.id}' conflicts with a retained request.`,
      );
    }
    if (retained.receipt.status !== "active") return retained.receipt;
    retained.receipt = publicActivityReceipt(
      retained.request,
      retained.lease.release(),
    );
    return retained.receipt;
  }

  async resetWithInitialControlBinding(): Promise<WorldRuntimeSnapshotV4> {
    await this.host.resetWithInitialControlBinding({
      controllerEntityId: PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
      controlledEntityId: this.initialControlledEntityId,
    });
    return this.snapshot();
  }

  setPaused(paused: boolean): WorldRuntimeSnapshotV4 {
    this.paused = paused;
    return this.snapshot();
  }

  dispose(): Promise<void> {
    if (!isNil(this.disposePromise)) return this.disposePromise;
    const hostDisposal = this.host.dispose();
    for (const retained of this.publicActivitiesByRequestId.values()) {
      if (retained.receipt.status !== "active") continue;
      const settleTermination = (): void => {
        if (retained.receipt.status !== "active") return;
        retained.receipt = publicActivityReceipt(
          retained.request,
          retained.lease.release(),
        );
      };
      if (retained.lease.cancellationSignal.aborted) settleTermination();
      else {
        retained.lease.cancellationSignal.addEventListener(
          "abort",
          settleTermination,
          { once: true },
        );
      }
    }
    this.disposePromise = hostDisposal;
    return this.disposePromise;
  }

  private activeHandle(): RuntimeHandleV1 {
    const handle = this.runtimeHandlesByWorldSessionId.get(
      this.host.currentWorldSessionId,
    );
    if (isNil(handle)) {
      throw new Error(
        "WORLDKIT_RUNTIME_HANDLE_UNAVAILABLE: Runtime is disposed or not ready.",
      );
    }
    return handle;
  }

  private rejectedActivityReceipt(
    request: RuntimeActivityRequestV1,
    code: GameplayDiagnosticV1["code"],
    message: string,
  ): RuntimeActivityReceiptV1 {
    return Object.freeze({
      kind: "worldkit-runtime-activity-receipt",
      schemaVersion: 1,
      requestId: request.id,
      activityKind: request.activityKind,
      worldSessionId: this.host.currentWorldSessionId,
      runtimeActivityEpoch:
        this.host.runtimeActivitySnapshot().runtimeActivityEpoch,
      status: "rejected",
      diagnostic: diagnostic(code, message),
    });
  }
}

export function createGameplayBabylonRuntimeCoordinatorV1(
  options: CreateGameplayBabylonRuntimeCoordinatorOptionsV1,
): Promise<GameplayBabylonRuntimeCoordinatorV1> {
  return GameplayBabylonRuntimeCoordinatorV1.create(options);
}
