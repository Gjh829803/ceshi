import {
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  gameplayBootstrapCanonicalBytesV1,
  type ControllerEntityStateV1,
  type GameplayParticipantStateV1,
  type SpatialEntityStateV1,
} from "@whitebox-world/gameplay-contracts";
import {
  CONTROL_TRANSITION_CAPABILITY_REF,
  createCoreControlFeatureFactoryV1,
  type GameplayModeV1,
} from "@whitebox-world/gameplay";
import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import {
  canonicalWorldPackageFileIntegrityEntriesV1,
  canonicalWorldPackageManifestV1,
  GAMEPLAY_BOOTSTRAP_MEDIA_TYPE_V1,
  GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1,
  hashWorldPackageManifestV1,
  hashWorldPackageRootV1,
  type WorldPackageBuildReceiptV1,
  type WorldPackageFileIntegrityEntryV1,
  type WorldPackageSha256HashV1,
} from "@whitebox-world/world-package";
import { describe, expect, it, vi } from "vitest";

import type { GameplayWorldPortV1 } from "./gameplay-world-port";
import * as runtimeHostModule from "./runtime-host";
import type {
  RuntimeActivityAcquireResultV1,
} from "./runtime-host";
import {
  createFakeGameplayWorldPortHarnessV1,
  type FakeGameplayWorldPortHarnessV1,
} from "./test/fake-gameplay-world-adapter";
import type { WorldSessionPublicationV1 } from "./world-session";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const HASH_D = `sha256:${"d".repeat(64)}` as const;
const RUNTIME_SESSION_ID = "runtime.lifecycle";
const INITIAL_WORLD_PACKAGE_REF = "worldkit://world-package/initial@1";
const REPLACEMENT_WORLD_PACKAGE_REF = "worldkit://world-package/replacement@1";

/*
 * RuntimeHost is intentionally exercised through the frozen Task 4 public
 * shape instead of importing a not-yet-implemented named export. This keeps
 * the RED lifecycle suite in the typecheck graph while the implementation is
 * still being introduced in runtime-host.ts.
 */
interface RuntimeHostUnderTestV1 {
  readonly phase: runtimeHostModule.RuntimeHostPhaseV1;
  readonly currentWorldSessionId: string;
  snapshot(): WorldSessionPublicationV1;
  runFixedInput(input: unknown): Promise<WorldSessionPublicationV1>;
  replaceWorld(world: unknown): Promise<WorldSessionPublicationV1>;
  reset(): Promise<WorldSessionPublicationV1>;
  resetWithInitialControlBinding(
    input: unknown,
  ): Promise<WorldSessionPublicationV1>;
  runtimeActivitySnapshot(): runtimeHostModule.RuntimeActivityCoordinatorSnapshotV1;
  acquireRuntimeActivity(input: unknown): RuntimeActivityAcquireResultV1;
  dispose(): Promise<void>;
}

interface RuntimeHostConstructorUnderTestV1 {
  create(input: unknown): Promise<RuntimeHostUnderTestV1>;
}

function runtimeHostConstructor(): RuntimeHostConstructorUnderTestV1 {
  const candidate = (runtimeHostModule as Readonly<Record<string, unknown>>)
    .RuntimeHost;
  if (
    typeof candidate !== "function" ||
    typeof (candidate as { readonly create?: unknown }).create !== "function"
  ) {
    throw new Error("RED: RuntimeHost lifecycle is not implemented yet.");
  }
  return candidate as unknown as RuntimeHostConstructorUnderTestV1;
}

const participantState = Object.freeze({
  id: "participant.primary",
  mode: "active",
}) satisfies GameplayParticipantStateV1;

const controllerState = Object.freeze({
  id: "controller.primary",
  kind: "controller-entity-state",
  controllerDefinitionRef: "worldkit://controller-definition/local@1",
  controllerDefinitionHash: HASH_A,
  participantId: participantState.id,
  lifecycleMode: "active",
  inputMode: "human",
}) satisfies ControllerEntityStateV1;

const heroState = Object.freeze({
  id: "entity.hero",
  kind: "spatial-entity-state",
  entityDefinitionRef: "worldkit://entity-definition/hero@1",
  entityDefinitionHash: HASH_A,
  semanticClassId: "character.humanoid",
  lifecycleMode: "active",
  positionMetersXYZ: [0, 0, 0] as const,
  rotationQuaternionXYZW: [0, 0, 0, 1] as const,
  scaleRatioXYZ: [1, 1, 1] as const,
  linearVelocityMetersPerSecondXYZ: [0, 0, 0] as const,
}) satisfies SpatialEntityStateV1;

const controlFeatureFactory = createCoreControlFeatureFactoryV1();
const gameplayBootstrap = createGameplayBootstrapV1({
  kind: "gameplay-bootstrap",
  id: "gameplay.lifecycle",
  version: 1,
  resourceRef: "worldkit://gameplay-bootstrap/lifecycle@1",
  entityDescriptors: [{
    id: heroState.id,
    entityDefinitionRef: heroState.entityDefinitionRef,
    capabilityRefs: [CONTROL_TRANSITION_CAPABILITY_REF],
  }],
  featureResourceLocks: [{
    resourceRef: controlFeatureFactory.manifest.resourceRef,
    contentHash: controlFeatureFactory.manifest.contentHash,
  }],
  semanticActionDefinitions: [],
  availableCapabilityRefs: [CONTROL_TRANSITION_CAPABILITY_REF],
});
const gameplayBootstrapResourceLock =
  createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap);
const gameplayResourceLock = Object.freeze([gameplayBootstrapResourceLock]);
const gameplayResourceLockHash = sha256CanonicalJson(
  gameplayResourceLock,
) as WorldPackageSha256HashV1;

const gameplayMode = Object.freeze({
  gameplayModeRef: "worldkit://gameplay-mode/exploration@1",
  evaluateCommand: () => Object.freeze({ status: "accepted" as const }),
}) satisfies GameplayModeV1;

function projection(simulationTick = 0) {
  return Object.freeze({
    simulationTick,
    spatialEntityStatesById: Object.freeze({ [heroState.id]: heroState }),
    capabilityStatesById: Object.freeze({}),
    semanticFactsById: Object.freeze({}),
  });
}

function createPortHarness(): FakeGameplayWorldPortHarnessV1 {
  return createFakeGameplayWorldPortHarnessV1({
    initialWorldProjection: projection(),
    controllableEntityIds: [heroState.id],
  });
}

interface AdapterFactoryHarnessV1 {
  readonly factory: Readonly<{
    preflightConcurrentResidency: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    awaitCandidatePublicationReady: ReturnType<typeof vi.fn>;
  }>;
  readonly ports: readonly FakeGameplayWorldPortHarnessV1[];
}

function createAdapterFactoryHarness(
  ports: readonly FakeGameplayWorldPortHarnessV1[],
): AdapterFactoryHarnessV1 {
  let index = 0;
  return Object.freeze({
    ports,
    factory: Object.freeze({
      preflightConcurrentResidency: vi.fn(() =>
        Object.freeze({ status: "accepted" as const })
      ),
      create: vi.fn(async (): Promise<GameplayWorldPortV1> => {
        const port = ports[index];
        index += 1;
        if (port === undefined) {
          throw new Error("private fake adapter exhaustion");
        }
        return port.port;
      }),
      awaitCandidatePublicationReady: vi.fn(async () => undefined),
    }),
  });
}

function createExecutionPlan(worldPackageRef: string): ExecutionPlanV5 {
  const worldId = worldPackageRef === INITIAL_WORLD_PACKAGE_REF
    ? "world.lifecycle.initial"
    : "world.lifecycle.replacement";
  const controlFeel = {
    resourceRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
    contentHash: HASH_A,
    walkSpeedMetersPerSecond: 2,
    runSpeedMetersPerSecond: 4,
    jumpSpeedMetersPerSecond: 5,
    accelerationMetersPerSecondSquared: 16,
    decelerationMetersPerSecondSquared: 20,
    turnRateRadiansPerSecond: 8,
    moveResponseExponent: 1,
    airControlRatio: 0.25,
    coyoteTimeSeconds: 0.1,
    jumpBufferSeconds: 0.1,
    variableJumpHoldSeconds: 0.15,
    jumpHoldGravityRatio: 0.5,
    jumpReleaseGravityRatio: 1.5,
  } as const;
  return {
    kind: "worldkit-execution-plan",
    schemaVersion: 5,
    id: worldId,
    seed: 24,
    runtimeBackend: "babylon-havok",
    authoringSpecHash: HASH_A,
    normalizedWorldIrHash: HASH_B,
    resourceLockHash: gameplayResourceLockHash,
    resourceLockEntries: gameplayResourceLock,
    coordinateSystem: "right-handed-y-up-minus-z-forward",
    gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
    atmospherePreset: "clear-day",
    terrain: {
      entityId: "terrain.main",
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [16, 16],
      resolutionCellsXZ: [2, 2],
      heightSamplesMeters: [0, 0, 0, 0],
      heightSamplesHash: sha256CanonicalJson([0, 0, 0, 0]),
      minimumHeightMeters: 0,
      maximumHeightMeters: 0,
      semanticClassId: "terrain.ground",
    },
    waters: [],
    objects: [],
    subjectAssets: [],
    rigProfiles: [],
    animationSets: [],
    colliderProfiles: [],
    initialControlledEntityId: heroState.id,
    subjects: [{
      entityId: heroState.id,
      subjectDefinitionRef: heroState.entityDefinitionRef,
      subjectDefinitionHash: heroState.entityDefinitionHash,
      bodyTopology: "biped",
      semanticClassId: heroState.semanticClassId,
      spawnAnchorEntityId: "anchor.spawn",
      spawnSubjectOriginPositionMetersXYZ: [0, 0, 0],
      spawnSubjectFacingRadians: 0,
      forwardDirection: "-z",
      visualParts: [{
        id: "body",
        kind: "primitive",
        shape: { kind: "capsule", radiusMeters: 0.35, heightMeters: 1.8 },
        localTransform: {
          positionMetersXYZ: [0, 0.9, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
        },
        semanticTags: ["body"],
      }],
      visualBinding: { mode: "static" },
      sockets: [],
      collider: {
        kind: "capsule",
        radiusMeters: 0.35,
        heightMeters: 1.8,
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.9, 0],
        massKilograms: 70,
        maxSlopeDegrees: 42,
        maxStepHeightMeters: 0.4,
      },
      locomotion: {
        allowWalk: true,
        allowRun: true,
        allowJump: true,
      },
      locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
      locomotionCapabilityHash: HASH_A,
      physicsBodyProfileRef: "worldkit://physics-body-profile/humanoid@1",
      locomotionProfileRef: "worldkit://locomotion-profile/humanoid.ground@1",
      controlFeel,
      availableControlFeels: [controlFeel],
      capabilityAssembly: {
        authoringAvailability: "recommended",
        physicsBodyProfileRef: "worldkit://physics-body-profile/humanoid@1",
        locomotionProfileRef: "worldkit://locomotion-profile/humanoid.ground@1",
        defaultMotionProfile: {
          resourceRef: "worldkit://motion-profile/free-ground@1",
          contentHash: HASH_A,
          motionKernelRef: "worldkit://motion-kernel/free-ground@1",
          motionTags: ["ground"],
        },
        optionalMotionProfiles: [],
        fallbackMotionProfile: {
          resourceRef: "worldkit://motion-profile/safe-ground@1",
          contentHash: HASH_B,
          motionKernelRef: "worldkit://motion-kernel/free-ground@1",
          motionTags: ["ground", "fallback"],
        },
        motionKernels: [{
          resourceRef: "worldkit://motion-kernel/free-ground@1",
          implementationId: "free-ground",
          commandKind: "planar-vector",
          supportedMediums: ["ground", "air"],
          runtimeParameterNames: [],
          fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
          deterministic: true,
        }],
        controlProfile: {
          resourceRef: "worldkit://control-profile/planar.camera-relative@1",
          contentHash: HASH_C,
          commandKind: "planar-vector",
          inputSpace: "camera-relative",
          facingPolicy: "align-to-move",
          lateralMovementPolicy: "allowed",
          moveDeadzoneRatio: 0.1,
        },
        cameraContext: {
          resourceRef: "worldkit://camera-context/default@1",
          defaultCameraRigProfileRef: "worldkit://camera/third-person.standard@1",
          rules: [],
          cameraRigProfiles: [],
          cameraModifierProfiles: [],
        },
        mediumProfile: {
          resourceRef: "worldkit://medium-profile/ground-air.standard@1",
          air: { gravityRatio: 1, linearDragPerSecond: 0 },
        },
        relationshipProfiles: [],
        harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
        requiredHarnessCheckIds: [],
        actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
        renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
      },
    }],
    camera: {
      cameraEntityId: "camera.main",
      rigRef: "worldkit://camera/third-person.standard@1",
      targetEntityId: heroState.id,
      pitchRadians: 0.2,
      distanceMeters: 4,
      targetHeightMeters: 1.2,
      fovDegrees: 60,
      manualSwitchAllowed: true,
      aspectRatio: 16 / 9,
    },
    resourceUsage: {
      vertices: 0,
      triangles: 0,
      colliders: 2,
    },
    layout: {
      solverProfileRef: "worldkit://layout-solver-profile/test@1",
      resolvedVersion: "1",
      solverProfileHash: HASH_C,
      layoutSolveReportHash: HASH_D,
      regions: [],
      routes: [],
      screenRegions: [],
      placementsByEntityId: {},
      layoutAssertions: [],
    },
    traversal: {
      surfaces: [],
      traversalAreas: [],
      connectivityRequirements: [],
      anchorEntityIds: ["anchor.spawn"],
    },
    staticColliders: [],
  };
}

function jsonIntegrityEntry(
  path: string,
  value: unknown,
  hash?: WorldPackageSha256HashV1,
): WorldPackageFileIntegrityEntryV1 {
  const bytes = canonicalJsonBytes(value);
  return {
    path,
    mediaType: "application/json",
    sizeBytes: bytes.byteLength,
    sha256: hash ?? sha256CanonicalJson(value) as WorldPackageSha256HashV1,
  };
}

function createBuildReceipt(
  executionPlan: ExecutionPlanV5,
  executionPlanHash: WorldPackageSha256HashV1,
): WorldPackageBuildReceiptV1 {
  const manifest = canonicalWorldPackageManifestV1({
    kind: "worldkit-world-package-manifest",
    schemaVersion: 1,
    id: `${executionPlan.id}.package`,
    packageFormatVersion: 1,
    worldId: executionPlan.id,
    seed: executionPlan.seed,
    runtimeTarget: "babylon-web",
    canonicalizationProfile: "canonical-json-jcs@1",
    hashAlgorithm: "sha256",
    authoringSchemaVersion: 4,
    normalizedWorldIrSchemaVersion: 4,
    executionPlanSchemaVersion: 5,
    authoringSpecHash: executionPlan.authoringSpecHash,
    normalizedWorldIrHash: executionPlan.normalizedWorldIrHash,
    executionPlanHash,
    resourceLockHash: executionPlan.resourceLockHash,
    layoutSolveReportHash: executionPlan.layout.layoutSolveReportHash,
    initialControlledEntityId: executionPlan.initialControlledEntityId,
    entryPoint: {
      executionPlanPath: "targets/babylon-web/execution-plan.json",
    },
    resources: [{
      resourceRef: gameplayBootstrap.resourceRef,
      packagePath: GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1,
      mediaType: GAMEPLAY_BOOTSTRAP_MEDIA_TYPE_V1,
      sizeBytes: gameplayBootstrapCanonicalBytesV1(gameplayBootstrap).byteLength,
      contentHash: sha256Bytes(
        gameplayBootstrapCanonicalBytesV1(gameplayBootstrap),
      ) as WorldPackageSha256HashV1,
    }],
  });
  const manifestHash = hashWorldPackageManifestV1(manifest);
  const fileIntegrityEntries = canonicalWorldPackageFileIntegrityEntriesV1([
    jsonIntegrityEntry("manifest.json", manifest, manifestHash),
    jsonIntegrityEntry(
      "world.normalized.json",
      { fixture: executionPlan.id },
      manifest.normalizedWorldIrHash,
    ),
    jsonIntegrityEntry(
      "registry-lock.json",
      executionPlan.resourceLockEntries,
      manifest.resourceLockHash,
    ),
    jsonIntegrityEntry(
      "layout-solve-report.json",
      { fixture: executionPlan.id },
      manifest.layoutSolveReportHash,
    ),
    jsonIntegrityEntry(
      manifest.entryPoint.executionPlanPath,
      executionPlan,
      executionPlanHash,
    ),
    {
      path: GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1,
      mediaType: GAMEPLAY_BOOTSTRAP_MEDIA_TYPE_V1,
      sizeBytes: gameplayBootstrapCanonicalBytesV1(gameplayBootstrap).byteLength,
      sha256: sha256Bytes(
        gameplayBootstrapCanonicalBytesV1(gameplayBootstrap),
      ) as WorldPackageSha256HashV1,
    },
  ]);
  return Object.freeze({
    kind: "worldkit-world-package-build-receipt",
    schemaVersion: 1,
    manifest,
    manifestHash,
    fileIntegrityEntries,
    worldPackageRootHash: hashWorldPackageRootV1(fileIntegrityEntries),
  });
}

function mutableWorldConfiguration(worldPackageRef: string) {
  const executionPlan = createExecutionPlan(worldPackageRef);
  const executionPlanHash = sha256CanonicalJson(
    executionPlan,
  ) as WorldPackageSha256HashV1;
  return {
    executionPlan,
    executionPlanHash,
    worldPackageRef,
    worldPackageBuildReceipt: createBuildReceipt(executionPlan, executionPlanHash),
    gameplayBootstrap,
  };
}

function replacementRequest(worldPackageRef: string) {
  return { worldConfiguration: mutableWorldConfiguration(worldPackageRef) };
}

function worldSessionIdFactory(ids: readonly string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `unexpected-world-session-${index}`;
}

function hostOptions(
  adapterFactory: AdapterFactoryHarnessV1["factory"],
  ids: readonly string[],
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    runtimeSessionId: RUNTIME_SESSION_ID,
    initialWorld: mutableWorldConfiguration(INITIAL_WORLD_PACKAGE_REF),
    participantStates: [participantState],
    controllerStates: [controllerState],
    fixedInputControllerEntityId: controllerState.id,
    gameplayModeFactory: () => gameplayMode,
    gameplayFeatureFactories: [controlFeatureFactory],
    gameplayCapacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
    runtimeHostCapacityBudget: {
      maximumWorldSessionCount: 8,
      maximumRuntimeActivityRecordCount: 8,
    },
    adapterFactory,
    worldSessionIdFactory: worldSessionIdFactory(ids),
    ...overrides,
  };
}

async function createHost(
  ports: readonly FakeGameplayWorldPortHarnessV1[],
  ids: readonly string[] = ["world-session.initial", "world-session.next"],
  overrides: Readonly<Record<string, unknown>> = {},
) {
  const adapter = createAdapterFactoryHarness(ports);
  const options = hostOptions(adapter.factory, ids, overrides);
  const host = await runtimeHostConstructor().create(options);
  return { adapter, host, options };
}

describe("RuntimeHost lifecycle isolation and admission", () => {
  it("publishes immutable provider-neutral Runtime Activity counters without lease authority", async () => {
    const current = createPortHarness();
    const { host } = await createHost([current]);

    const initial = host.runtimeActivitySnapshot();
    expect(initial).toEqual({
      runtimeActivityEpoch: 0,
      activeRuntimeActivityCount: 0,
      retainedRuntimeActivityRecordCount: 0,
    });
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.keys(initial)).toEqual([
      "runtimeActivityEpoch",
      "activeRuntimeActivityCount",
      "retainedRuntimeActivityRecordCount",
    ]);
    expect(initial).not.toHaveProperty("lease");
    expect(initial).not.toHaveProperty("handle");

    const acquired = host.acquireRuntimeActivity({
      kind: "runtime-run",
      requestId: "activity.snapshot",
      payloadHash: HASH_A,
    });
    if (acquired.status !== "active") {
      throw new Error("Expected an active Runtime Activity lease.");
    }
    expect(host.runtimeActivitySnapshot()).toEqual({
      runtimeActivityEpoch: 1,
      activeRuntimeActivityCount: 1,
      retainedRuntimeActivityRecordCount: 1,
    });
    expect(initial).toEqual({
      runtimeActivityEpoch: 0,
      activeRuntimeActivityCount: 0,
      retainedRuntimeActivityRecordCount: 0,
    });

    acquired.lease.release();
    expect(host.runtimeActivitySnapshot()).toEqual({
      runtimeActivityEpoch: 2,
      activeRuntimeActivityCount: 0,
      retainedRuntimeActivityRecordCount: 1,
    });
  });

  it("keeps WorldSession state and ID ledgers isolated between two Hosts", async () => {
    const firstPort = createPortHarness();
    const secondPort = createPortHarness();
    const first = await createHost([firstPort], ["world-session.shared"]);
    const second = await createHost([secondPort], ["world-session.shared"]);

    expect(first.host.snapshot().worldState.worldSessionId).toBe(
      "world-session.shared",
    );
    expect(second.host.snapshot().worldState.worldSessionId).toBe(
      "world-session.shared",
    );
    expect(first.host.snapshot()).not.toBe(second.host.snapshot());

    await first.host.runFixedInput({ actions: [], ticks: 1 });
    expect(first.host.snapshot().worldState.simulationTick).toBe(1);
    expect(second.host.snapshot().worldState.simulationTick).toBe(0);
  });

  it("returns a closed capacity Diagnostic after preserving prior fixed Ticks", async () => {
    const current = createPortHarness();
    current.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 0,
        maximumSemanticFactTransitionEventCount: 0,
      },
      worldProjectionAfter: projection(1),
    });
    current.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput:
          DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1.maximumSemanticFactCount + 1,
        maximumSemanticFactTransitionEventCount: 0,
      },
      worldProjectionAfter: projection(2),
    });
    const { host } = await createHost([current]);

    await expect(host.runFixedInput({ actions: [], ticks: 2 })).rejects
      .toMatchObject({
        diagnostic: { code: "GAMEPLAY_CAPACITY_EXCEEDED" },
      });
    expect(host.snapshot().worldState.simulationTick).toBe(1);
    expect(current.calls.filter(({ operation }) =>
      operation === "run-fixed-input-tick"
    )).toHaveLength(1);
  });

  it("rejects exact hostile Host options before ID, preflight, or adapter factories", async () => {
    const port = createPortHarness();
    const adapter = createAdapterFactoryHarness([port]);
    const idFactory = vi.fn(() => "world-session.hostile");
    const options = hostOptions(adapter.factory, ["unused"], {
      worldSessionIdFactory: idFactory,
    }) as Record<string, unknown>;
    let accessorReads = 0;
    Object.defineProperty(options, "runtimeSessionId", {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return RUNTIME_SESSION_ID;
      },
    });

    await expect(runtimeHostConstructor().create(options)).rejects.toThrow(
      /RuntimeHostCreateOptionsV1/,
    );
    expect(accessorReads).toBe(0);
    expect(idFactory).not.toHaveBeenCalled();
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(adapter.factory.create).not.toHaveBeenCalled();
    expect(port.calls).toEqual([]);
  });

  it("rejects a consistently rehashed nested ExecutionPlan dialect before adapter creation", async () => {
    const port = createPortHarness();
    const adapter = createAdapterFactoryHarness([port]);
    const baseline = mutableWorldConfiguration(INITIAL_WORLD_PACKAGE_REF);
    const executionPlan = {
      ...baseline.executionPlan,
      terrain: {
        ...baseline.executionPlan.terrain,
        providerName: "private-heightfield-provider",
      },
    } as unknown as ExecutionPlanV5;
    const executionPlanHash = sha256CanonicalJson(
      executionPlan,
    ) as WorldPackageSha256HashV1;
    const initialWorld = {
      ...baseline,
      executionPlan,
      executionPlanHash,
      worldPackageBuildReceipt: createBuildReceipt(
        executionPlan,
        executionPlanHash,
      ),
    };

    await expect(runtimeHostConstructor().create(hostOptions(
      adapter.factory,
      ["world-session.invalid-plan"],
      { initialWorld },
    ))).rejects.toThrow(/RuntimeWorldConfigurationV1/);
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(adapter.factory.create).not.toHaveBeenCalled();
    expect(port.calls).toEqual([]);
  });

  it("applies the same closed Plan admission before replacement preflight", async () => {
    const current = createPortHarness();
    const candidate = createPortHarness();
    const { adapter, host } = await createHost(
      [current, candidate],
      ["world-session.initial", "world-session.candidate"],
    );
    const baseline = mutableWorldConfiguration(REPLACEMENT_WORLD_PACKAGE_REF);
    const executionPlan = {
      ...baseline.executionPlan,
      traversal: {
        ...baseline.executionPlan.traversal,
        providerHandle: 7,
      },
    } as unknown as ExecutionPlanV5;
    const executionPlanHash = sha256CanonicalJson(
      executionPlan,
    ) as WorldPackageSha256HashV1;

    expect(() => host.replaceWorld({
      worldConfiguration: {
        ...baseline,
        executionPlan,
        executionPlanHash,
        worldPackageBuildReceipt: createBuildReceipt(
          executionPlan,
          executionPlanHash,
        ),
      },
    })).toThrow(/RuntimeWorldConfigurationV1/);
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(adapter.factory.create).toHaveBeenCalledTimes(1);
    expect(host.snapshot().worldState.worldSessionId).toBe(
      "world-session.initial",
    );
  });

  it("sanitizes a throwing initial WorldSession ID factory with a closed diagnostic", async () => {
    const port = createPortHarness();
    const adapter = createAdapterFactoryHarness([port]);
    const privateMessage = "private initial WorldSession ID allocation failure";
    const idFactory = vi.fn((): string => {
      throw new Error(privateMessage);
    });
    const error = await runtimeHostConstructor().create(hostOptions(
      adapter.factory,
      ["unused"],
      { worldSessionIdFactory: idFactory },
    )).catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_ID_INVALID" },
    });
    expect(String(error)).not.toContain(privateMessage);
    expect(idFactory).toHaveBeenCalledTimes(1);
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(adapter.factory.create).not.toHaveBeenCalled();
    expect(port.calls).toEqual([]);
  });

  it("rejects invalid identity bootstrap and fixed-input lane before adapter creation", async () => {
    const invalidOverrides = [
      {
        name: "participant",
        overrides: {
          participantStates: [{ ...participantState, mode: "disabled" }],
        },
      },
      {
        name: "controller",
        overrides: {
          controllerStates: [{
            ...controllerState,
            participantId: "participant.missing",
          }],
        },
      },
      {
        name: "fixed-input lane",
        overrides: {
          fixedInputControllerEntityId: "controller.missing",
        },
      },
    ] as const;

    for (const invalid of invalidOverrides) {
      const port = createPortHarness();
      const adapter = createAdapterFactoryHarness([port]);
      const idFactory = vi.fn(() => `world-session.invalid-${invalid.name}`);

      await expect(runtimeHostConstructor().create(hostOptions(
        adapter.factory,
        ["unused"],
        { ...invalid.overrides, worldSessionIdFactory: idFactory },
      ))).rejects.toThrow(/RuntimeHostCreateOptionsV1/);
      expect(idFactory, invalid.name).not.toHaveBeenCalled();
      expect(
        adapter.factory.preflightConcurrentResidency,
        invalid.name,
      ).not.toHaveBeenCalled();
      expect(adapter.factory.create, invalid.name).not.toHaveBeenCalled();
      expect(port.calls, invalid.name).toEqual([]);
    }
  });

  it("retains unique WorldSession IDs through N and closes before N+1 adapter creation", async () => {
    const ports = [createPortHarness(), createPortHarness(), createPortHarness()];
    const { adapter, host } = await createHost(
      ports,
      ["world-session.1", "world-session.2", "world-session.3"],
      {
        runtimeHostCapacityBudget: {
          maximumWorldSessionCount: 2,
          maximumRuntimeActivityRecordCount: 8,
        },
      },
    );

    await expect(host.reset()).resolves.toMatchObject({
      worldState: { worldSessionId: "world-session.2" },
    });
    await expect(host.reset()).rejects.toMatchObject({
      diagnostic: { code: "RUNTIME_HOST_CAPACITY_EXCEEDED" },
    });
    expect(adapter.factory.create).toHaveBeenCalledTimes(2);
    expect(ports[2]!.calls).toEqual([]);
  });

  it("never reuses a retained WorldSession ID and preserves the old route", async () => {
    const initial = createPortHarness();
    const unusedCandidate = createPortHarness();
    const { adapter, host } = await createHost(
      [initial, unusedCandidate],
      ["world-session.same", "world-session.same"],
    );
    const before = host.snapshot();

    await expect(host.reset()).rejects.toMatchObject({
      diagnostic: { code: "WORLD_SESSION_ID_INVALID" },
    });
    expect(host.snapshot()).toBe(before);
    expect(adapter.factory.create).toHaveBeenCalledTimes(1);
    expect(initial.disposeCount).toBe(0);
  });
});

describe("RuntimeHost two-phase replacement", () => {
  it("publishes a tick-zero bound reset only after the candidate publication gate", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const { adapter, host } = await createHost([oldPort, candidatePort]);
    const oldPublication = host.snapshot();
    let enterGate!: () => void;
    const gateEntered = new Promise<void>((resolve) => {
      enterGate = resolve;
    });
    let releaseGate!: () => void;
    const gateReleased = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    adapter.factory.awaitCandidatePublicationReady.mockImplementation(
      async (input: {
        runtimeSessionId: string;
        worldSessionId: string;
        publication: WorldSessionPublicationV1;
      }) => {
        expect(Object.keys(input)).toEqual([
          "runtimeSessionId",
          "worldSessionId",
          "publication",
        ]);
        expect(input.runtimeSessionId).toBe(RUNTIME_SESSION_ID);
        expect(input.worldSessionId).toBe("world-session.next");
        const { publication } = input;
        expect(publication.worldState).toMatchObject({
          worldSessionId: "world-session.next",
          simulationTick: 0,
        });
        expect(Object.values(
          publication.gameplayInspection.possessedByRelationshipsById,
        )).toEqual([
          expect.objectContaining({
            controllerEntityId: controllerState.id,
            controlledEntityId: heroState.id,
          }),
        ]);
        expect(candidatePort.commitCount).toBe(1);
        enterGate();
        await gateReleased;
      },
    );

    const resetting = host.resetWithInitialControlBinding({
      controllerEntityId: controllerState.id,
      controlledEntityId: heroState.id,
    });
    await gateEntered;

    expect(host.phase).toBe("replacing");
    expect(host.snapshot()).toBe(oldPublication);
    expect(oldPort.disposeCount).toBe(0);
    releaseGate();

    await expect(resetting).resolves.toMatchObject({
      worldState: {
        worldSessionId: "world-session.next",
        simulationTick: 0,
      },
      gameplayInspection: {
        possessedByRelationshipsById: expect.objectContaining({}),
      },
    });
    expect(Object.values(
      host.snapshot().gameplayInspection.possessedByRelationshipsById,
    )).toEqual([
      expect.objectContaining({
        controllerEntityId: controllerState.id,
        controlledEntityId: heroState.id,
      }),
    ]);
    expect(host.phase).toBe("ready");
    expect(adapter.factory.awaitCandidatePublicationReady).toHaveBeenCalledTimes(1);
    expect(oldPort.disposeCount).toBe(1);
    expect(candidatePort.disposeCount).toBe(0);
  });

  it("rejects an uncommitted initial bind without gating or swapping and keeps the old Session usable", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const { adapter, host } = await createHost([oldPort, candidatePort]);
    const oldSessionId = host.currentWorldSessionId;

    await expect(host.resetWithInitialControlBinding({
      controllerEntityId: controllerState.id,
      controlledEntityId: "entity.not-controllable",
    })).rejects.toMatchObject({
      diagnostic: expect.objectContaining({ code: expect.any(String) }),
    });

    expect(host.phase).toBe("ready");
    expect(host.currentWorldSessionId).toBe(oldSessionId);
    expect(adapter.factory.awaitCandidatePublicationReady).not.toHaveBeenCalled();
    expect(candidatePort.disposeCount).toBe(1);
    await expect(host.runFixedInput({ actions: [], ticks: 1 })).resolves
      .toMatchObject({
        worldState: { worldSessionId: oldSessionId, simulationTick: 1 },
      });
  });

  it("rejects a non-exact initial binding before starting replacement", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const { adapter, host } = await createHost([oldPort, candidatePort]);
    const before = host.snapshot();

    expect(() => host.resetWithInitialControlBinding({
      controllerEntityId: controllerState.id,
      controlledEntityId: heroState.id,
      legacyControlledSubjectId: heroState.id,
    })).toThrow(/RuntimeHostInitialControlBindingV1/);

    expect(host.snapshot()).toBe(before);
    expect(adapter.factory.create).toHaveBeenCalledTimes(1);
    expect(adapter.factory.awaitCandidatePublicationReady).not.toHaveBeenCalled();
    expect(candidatePort.calls).toEqual([]);
  });

  it("does not publish a bound candidate when its publication gate throws", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const { adapter, host } = await createHost([oldPort, candidatePort]);
    const oldSessionId = host.currentWorldSessionId;
    adapter.factory.awaitCandidatePublicationReady.mockRejectedValueOnce(
      new Error("private first-render failure"),
    );

    const error = await host.resetWithInitialControlBinding({
      controllerEntityId: controllerState.id,
      controlledEntityId: heroState.id,
    }).catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(String(error)).not.toContain("private first-render failure");
    expect(host.phase).toBe("ready");
    expect(host.currentWorldSessionId).toBe(oldSessionId);
    expect(candidatePort.disposeCount).toBe(1);
    await expect(host.runFixedInput({ actions: [], ticks: 1 })).resolves
      .toMatchObject({
        worldState: { worldSessionId: oldSessionId, simulationTick: 1 },
      });
  });

  it("keeps the old Session routable while candidate initialization is deferred", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const initialize = candidatePort.deferNextOperation("initialize");
    const { host } = await createHost([oldPort, candidatePort]);
    const oldSessionId = host.snapshot().worldState.worldSessionId;

    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    await initialize.entered;

    await expect(host.runFixedInput({ actions: [], ticks: 1 })).resolves
      .toMatchObject({
        worldState: {
          worldSessionId: oldSessionId,
          simulationTick: 1,
        },
      });
    expect(host.snapshot().worldState.worldSessionId).toBe(oldSessionId);

    initialize.release();
    await expect(replacement).resolves.toMatchObject({
      worldState: {
        worldSessionId: "world-session.next",
        worldPackageRef: REPLACEMENT_WORLD_PACKAGE_REF,
      },
    });
    expect(oldPort.disposeCount).toBe(1);
  });

  it("does not swap a deferred candidate after the old Session fail-closes", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const initialize = candidatePort.deferNextOperation("initialize");
    oldPort.failNextOperation(
      "run-fixed-input-tick",
      "reject",
      new Error("private old fixed-input failure"),
    );
    const { host } = await createHost([oldPort, candidatePort]);
    const oldSessionId = host.snapshot().worldState.worldSessionId;
    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    await initialize.entered;

    const failedPublication = await host.runFixedInput({ actions: [], ticks: 1 });
    expect(failedPublication).toMatchObject({
      worldState: {
        worldSessionId: oldSessionId,
        worldPackageRef: INITIAL_WORLD_PACKAGE_REF,
        simulationTick: 0,
      },
      gameplayInspection: {
        phase: "failed",
        diagnostic: { code: "ADAPTER_FIXED_INPUT_FAILED" },
      },
    });
    expect(host.snapshot()).toBe(failedPublication);

    initialize.release();
    await expect(replacement).rejects.toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(host.snapshot()).toBe(failedPublication);
    expect(host.snapshot().worldState.worldSessionId).toBe(oldSessionId);
    expect(candidatePort.disposeCount).toBe(1);
  });

  it("sanitizes a throwing replacement WorldSession ID factory", async () => {
    const initialPort = createPortHarness();
    const unusedCandidate = createPortHarness();
    const privateMessage = "private replacement WorldSession ID allocation failure";
    const idFactory = vi.fn()
      .mockReturnValueOnce("world-session.initial")
      .mockImplementation((): string => {
        throw new Error(privateMessage);
      });
    const { adapter, host } = await createHost(
      [initialPort, unusedCandidate],
      ["unused"],
      { worldSessionIdFactory: idFactory },
    );
    const before = host.snapshot();
    const error = await host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    ).catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_ID_INVALID" },
    });
    expect(String(error)).not.toContain(privateMessage);
    expect(host.snapshot()).toBe(before);
    expect(idFactory).toHaveBeenCalledTimes(2);
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(adapter.factory.create).toHaveBeenCalledTimes(1);
    expect(initialPort.disposeCount).toBe(0);
    expect(unusedCandidate.calls).toEqual([]);
  });

  it("cancels a candidate swap when Activity epoch changes during its build", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const initialize = candidatePort.deferNextOperation("initialize");
    const { host } = await createHost([oldPort, candidatePort]);
    const oldPublication = host.snapshot();
    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    await initialize.entered;

    const acquisition = host.acquireRuntimeActivity({
      kind: "simulation-take",
      requestId: "activity.during-candidate",
      payloadHash: HASH_B,
    });
    expect(acquisition.status).toBe("active");
    if (acquisition.status !== "active") {
      throw new Error("Expected an active Runtime Activity lease.");
    }
    acquisition.lease.release();
    initialize.release();

    await expect(replacement).rejects.toMatchObject({
      diagnostic: { code: "WORLD_REPLACEMENT_BLOCKED_BY_ACTIVE_ACTIVITY" },
    });
    expect(host.snapshot()).toBe(oldPublication);
    expect(candidatePort.disposeCount).toBe(1);
    expect(oldPort.disposeCount).toBe(0);
    await expect(host.runFixedInput({ actions: [], ticks: 1 })).resolves
      .toMatchObject({ worldState: { simulationTick: 1 } });
  });

  it("preserves the cancellation diagnostic when candidate cleanup throws", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const initialize = candidatePort.deferNextOperation("initialize");
    const privateMessage = "private cancelled candidate cleanup failure";
    candidatePort.failNextOperation(
      "dispose",
      "throw",
      new Error(privateMessage),
    );
    const { host } = await createHost([oldPort, candidatePort]);
    const oldPublication = host.snapshot();
    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    await initialize.entered;

    const acquisition = host.acquireRuntimeActivity({
      kind: "simulation-take",
      requestId: "activity.cancel-with-throwing-cleanup",
      payloadHash: HASH_B,
    });
    expect(acquisition.status).toBe("active");
    if (acquisition.status !== "active") {
      throw new Error("Expected an active Runtime Activity lease.");
    }
    acquisition.lease.release();
    initialize.release();

    const error = await replacement.catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_REPLACEMENT_BLOCKED_BY_ACTIVE_ACTIVITY" },
    });
    expect(String(error)).not.toContain(privateMessage);
    expect(host.snapshot()).toBe(oldPublication);
    expect(oldPort.disposeCount).toBe(0);
  });

  it("publishes the successful swap before disposing old and never rolls back on cleanup failure", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    oldPort.failNextOperation(
      "dispose",
      "reject",
      new Error("private old cleanup failure"),
    );
    const { host } = await createHost([oldPort, candidatePort]);

    const error = await host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    ).catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(String(error)).not.toContain("private old cleanup failure");
    expect(host.snapshot().worldState).toMatchObject({
      worldSessionId: "world-session.next",
      worldPackageRef: REPLACEMENT_WORLD_PACKAGE_REF,
    });
    expect(candidatePort.disposeCount).toBe(0);
  });

  it("starts old cleanup only after pointer swap and sanitizes deferred cleanup failure", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const retiringDispose = oldPort.deferNextOperation("dispose");
    const { host } = await createHost([oldPort, candidatePort]);
    const privateMessage = "private deferred retiring cleanup failure";
    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );

    await retiringDispose.entered;
    expect(host.snapshot().worldState).toMatchObject({
      worldSessionId: "world-session.next",
      worldPackageRef: REPLACEMENT_WORLD_PACKAGE_REF,
    });
    expect(candidatePort.disposeCount).toBe(0);

    retiringDispose.reject(new Error(privateMessage));
    const error = await replacement.catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(String(error)).not.toContain(privateMessage);
    expect(host.snapshot().worldState).toMatchObject({
      worldSessionId: "world-session.next",
      worldPackageRef: REPLACEMENT_WORLD_PACKAGE_REF,
    });
    expect(candidatePort.disposeCount).toBe(0);
  });

  it("reset reuses the frozen initial configuration and creates an unbound Session", async () => {
    const initialPort = createPortHarness();
    const replacementPort = createPortHarness();
    const resetPort = createPortHarness();
    const created = await createHost(
      [initialPort, replacementPort, resetPort],
      ["world-session.initial", "world-session.replacement", "world-session.reset"],
    );
    const callerOwnedInitial = (
      created.options as { initialWorld: { worldPackageRef: string } }
    ).initialWorld;
    callerOwnedInitial.worldPackageRef = "worldkit://world-package/mutated-after-create@1";

    await created.host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    const reset = await created.host.reset();

    expect(reset.worldState).toMatchObject({
      worldSessionId: "world-session.reset",
      worldPackageRef: INITIAL_WORLD_PACKAGE_REF,
    });
    expect(reset.gameplayInspection.possessedByRelationshipsById).toEqual({});
    expect(reset.worldState.simulationTick).toBe(0);
    const resetGateInput = created.adapter.factory
      .awaitCandidatePublicationReady.mock.calls.at(-1)?.[0] as
        | { publication: WorldSessionPublicationV1 }
        | undefined;
    expect(resetGateInput?.publication.gameplayInspection
      .possessedByRelationshipsById).toEqual({});
  });
});

describe("RuntimeHost disposal joins", () => {
  it("aborts active Runtime Activity and waits for its registered cleanup", async () => {
    const current = createPortHarness();
    const { host } = await createHost([current]);
    const acquired = host.acquireRuntimeActivity({
      kind: "runtime-run",
      requestId: "activity.dispose-join",
      payloadHash: HASH_A,
    });
    if (acquired.status !== "active") {
      throw new Error("Expected an active Runtime Activity lease.");
    }
    let finishCleanup!: () => void;
    acquired.lease.registerCleanup(new Promise<void>((resolve) => {
      finishCleanup = resolve;
    }));

    const disposing = host.dispose();
    await vi.waitFor(() => {
      expect(acquired.lease.cancellationSignal.aborted).toBe(true);
    });
    let settled = false;
    void disposing.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishCleanup();
    await expect(disposing).resolves.toBeUndefined();
    expect(acquired.lease.release()).toMatchObject({
      status: "terminated-by-host",
    });
    expect(current.disposeCount).toBe(1);
  });

  it("sanitizes a registered Runtime Activity cleanup that failed before disposal", async () => {
    const current = createPortHarness();
    const { host } = await createHost([current]);
    const acquired = host.acquireRuntimeActivity({
      kind: "control-capture",
      requestId: "activity.failed-cleanup",
      payloadHash: HASH_A,
    });
    if (acquired.status !== "active") {
      throw new Error("Expected an active Runtime Activity lease.");
    }
    const privateMessage = "private capture cleanup failure";
    acquired.lease.registerCleanup(Promise.reject(new Error(privateMessage)));
    await Promise.resolve();

    const error = await host.dispose().catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(String(error)).not.toContain(privateMessage);
    expect(acquired.lease.cancellationSignal.aborted).toBe(true);
    expect(current.disposeCount).toBe(1);
  });

  it("joins cleanup registered before a Runtime Activity was released", async () => {
    const current = createPortHarness();
    const { host } = await createHost([current]);
    const acquired = host.acquireRuntimeActivity({
      kind: "runtime-run",
      requestId: "activity.released-cleanup",
      payloadHash: HASH_A,
    });
    if (acquired.status !== "active") {
      throw new Error("Expected an active Runtime Activity lease.");
    }
    let finishCleanup!: () => void;
    acquired.lease.registerCleanup(new Promise<void>((resolve) => {
      finishCleanup = resolve;
    }));
    expect(acquired.lease.release()).toMatchObject({ status: "released" });

    const disposing = host.dispose();
    let settled = false;
    void disposing.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishCleanup();
    await expect(disposing).resolves.toBeUndefined();
    expect(current.disposeCount).toBe(1);
  });

  it("waits for every Activity cleanup before returning a sanitized failure", async () => {
    const current = createPortHarness();
    const { host } = await createHost([current]);
    const first = host.acquireRuntimeActivity({
      kind: "control-capture",
      requestId: "activity.cleanup-fails",
      payloadHash: HASH_A,
    });
    const second = host.acquireRuntimeActivity({
      kind: "simulation-take",
      requestId: "activity.cleanup-pending",
      payloadHash: HASH_B,
    });
    if (first.status !== "active" || second.status !== "active") {
      throw new Error("Expected active Runtime Activity leases.");
    }
    const privateMessage = "private first cleanup failure";
    first.lease.registerCleanup(Promise.reject(new Error(privateMessage)));
    let finishSecondCleanup!: () => void;
    second.lease.registerCleanup(new Promise<void>((resolve) => {
      finishSecondCleanup = resolve;
    }));

    const disposing = host.dispose();
    let settled = false;
    void disposing.catch(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    finishSecondCleanup();
    const error = await disposing.catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(String(error)).not.toContain(privateMessage);
    expect(current.disposeCount).toBe(1);
  });

  it("synchronously closes admission and returns the same dispose Promise", async () => {
    const current = createPortHarness();
    const unused = createPortHarness();
    const currentDispose = current.deferNextOperation("dispose");
    const { adapter, host } = await createHost([current, unused]);

    const first = host.dispose();
    const second = host.dispose();
    expect(second).toBe(first);
    await currentDispose.entered;

    await expect(host.reset()).rejects.toMatchObject({
      diagnostic: { code: "WORLD_SESSION_NOT_READY" },
    });
    expect(adapter.factory.create).toHaveBeenCalledTimes(1);

    currentDispose.release();
    await expect(first).resolves.toBeUndefined();
    expect(current.disposeCount).toBe(1);
  });

  it("joins a pending candidate and disposes candidate and current exactly once", async () => {
    const current = createPortHarness();
    const candidate = createPortHarness();
    const candidateInitialize = candidate.deferNextOperation("initialize");
    const currentDispose = current.deferNextOperation("dispose");
    const { host } = await createHost([current, candidate]);
    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    await candidateInitialize.entered;

    const firstDispose = host.dispose();
    const repeatedDispose = host.dispose();
    expect(repeatedDispose).toBe(firstDispose);
    await currentDispose.entered;
    candidateInitialize.release();
    currentDispose.release();

    await expect(replacement).rejects.toMatchObject({
      diagnostic: { code: "WORLD_SESSION_NOT_READY" },
    });
    await expect(firstDispose).resolves.toBeUndefined();
    expect(current.disposeCount).toBe(1);
    expect(candidate.disposeCount).toBe(1);
  });

  it("joins retiring-old cleanup after a committed swap as well as current cleanup", async () => {
    const oldPort = createPortHarness();
    const currentPort = createPortHarness();
    const retiringDispose = oldPort.deferNextOperation("dispose");
    const currentDispose = currentPort.deferNextOperation("dispose");
    const { host } = await createHost([oldPort, currentPort]);
    const replacement = host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    await retiringDispose.entered;
    expect(host.snapshot().worldState.worldSessionId).toBe("world-session.next");

    const disposing = host.dispose();
    await currentDispose.entered;
    let isSettled = false;
    void disposing.finally(() => {
      isSettled = true;
    });
    await Promise.resolve();
    expect(isSettled).toBe(false);

    currentDispose.release();
    await Promise.resolve();
    expect(isSettled).toBe(false);
    retiringDispose.release();

    await expect(replacement).resolves.toMatchObject({
      worldState: { worldSessionId: "world-session.next" },
    });
    await expect(disposing).resolves.toBeUndefined();
    expect(oldPort.disposeCount).toBe(1);
    expect(currentPort.disposeCount).toBe(1);
  });
});
