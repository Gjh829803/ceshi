import {
  createGameplayBootstrapV1,
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
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
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import {
  canonicalWorldPackageFileIntegrityEntriesV1,
  canonicalWorldPackageManifestV1,
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
const EMPTY_RESOURCE_LOCK_HASH = sha256CanonicalJson([]) as WorldPackageSha256HashV1;
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
  snapshot(): WorldSessionPublicationV1;
  runFixedInput(input: unknown): Promise<WorldSessionPublicationV1>;
  replaceWorld(world: unknown): Promise<WorldSessionPublicationV1>;
  reset(): Promise<WorldSessionPublicationV1>;
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
    resourceLockHash: EMPTY_RESOURCE_LOCK_HASH,
    resourceLockEntries: [],
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
    controlledEntityId: heroState.id,
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
      physicsBodyProfileRef: "worldkit://physics-body-profile/humanoid@1",
      locomotionProfileRef: "worldkit://locomotion-profile/humanoid.ground@1",
      controlFeel,
      availableControlFeels: [controlFeel],
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
    controlledEntityId: executionPlan.controlledEntityId,
    entryPoint: {
      executionPlanPath: "targets/babylon-web/execution-plan.json",
    },
    resources: [],
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
