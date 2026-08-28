import { worldPackageRefFromRootHashV1 } from "@whitebox-world/world-identity";

import type { Sha256HashV1 } from "@whitebox-world/protocol";

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
  BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V2,
  GAMEPLAY_BOOTSTRAP_MEDIA_TYPE_V1,
  GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1,
  hashWorldPackageManifestV1,
  hashWorldPackageRootV1,
  migrateWorldPackageBuildReceiptV1ToV2,
  type WorldPackageBuildReceiptV1,
  type WorldPackageBuildReceiptV2,
  type WorldPackageFileIntegrityEntryV1,
} from "@whitebox-world/world-package";
import { vi } from "vitest";

import type { GameplayWorldPortV1 } from "../gameplay-world-port";
import * as runtimeHostModule from "../runtime-host";
import type {
  PublishWorldReplacementResultV1,
  RuntimeActivityAcquireResultV1,
} from "../runtime-host";
import {
  createFakeGameplayWorldPortHarnessV1,
  type FakeGameplayWorldPortHarnessV1,
} from "./fake-gameplay-world-adapter";
import type { WorldSessionPublicationV1 } from "../world-session";

export const HASH_A = `sha256:${"a".repeat(64)}` as const;
export const HASH_B = `sha256:${"b".repeat(64)}` as const;
export const HASH_C = `sha256:${"c".repeat(64)}` as const;
export const HASH_D = `sha256:${"d".repeat(64)}` as const;
export const RUNTIME_SESSION_ID = "runtime.lifecycle";

/*
 * RuntimeHost is intentionally exercised through the frozen Task 4 public
 * shape instead of importing a not-yet-implemented named export. This keeps
 * the RED lifecycle suite in the typecheck graph while the implementation is
 * still being introduced in runtime-host.ts.
 */
export interface RuntimeHostUnderTestV1 {
  readonly runtimeSessionId: string;
  readonly phase: runtimeHostModule.RuntimeHostPhaseV1;
  readonly currentWorldSessionId: string;
  snapshot(): WorldSessionPublicationV1;
  getWorldStateSnapshot(worldStateRef: string): unknown;
  eventsAfter(afterEventSequence: number, maximumEventCount: number): readonly unknown[];
  runFixedInput(input: unknown): Promise<WorldSessionPublicationV1>;
  replaceWorld(world: unknown): Promise<WorldSessionPublicationV1>;
  publishWorldReplacementV1(input: unknown): Promise<PublishWorldReplacementResultV1>;
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

export function runtimeHostConstructor(): RuntimeHostConstructorUnderTestV1 {
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

export const participantState = Object.freeze({
  id: "participant.primary",
  mode: "active",
}) satisfies GameplayParticipantStateV1;

export const controllerState = Object.freeze({
  id: "controller.primary",
  kind: "controller-entity-state",
  controllerDefinitionRef: "worldkit://controller-definition/local@1",
  controllerDefinitionHash: HASH_A,
  participantId: participantState.id,
  lifecycleMode: "active",
  inputMode: "human",
}) satisfies ControllerEntityStateV1;

export const heroState = Object.freeze({
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
export const gameplayBootstrap = createGameplayBootstrapV1({
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
  initialRelationshipStates: [],
});
const gameplayBootstrapResourceLock =
  createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap);
const gameplayResourceLock = Object.freeze([gameplayBootstrapResourceLock]);
const gameplayResourceLockHash = sha256CanonicalJson(
  gameplayResourceLock,
) as Sha256HashV1;

const gameplayMode = Object.freeze({
  gameplayModeRef: "worldkit://gameplay-mode/exploration@1",
  evaluateCommand: () => Object.freeze({ status: "accepted" as const }),
}) satisfies GameplayModeV1;

export function projection(simulationTick = 0) {
  return Object.freeze({
    simulationTick,
    spatialEntityStatesById: Object.freeze({ [heroState.id]: heroState }),
    capabilityStatesById: Object.freeze({}),
    semanticFactsById: Object.freeze({}),
  });
}

export function createPortHarness(): FakeGameplayWorldPortHarnessV1 {
  return createFakeGameplayWorldPortHarnessV1({
    initialWorldProjection: projection(),
    controllableEntityIds: [heroState.id],
  });
}

export interface AdapterFactoryHarnessV1 {
  readonly factory: Readonly<{
    preflightConcurrentResidency: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    awaitCandidatePublicationReady: ReturnType<typeof vi.fn>;
  }>;
  readonly ports: readonly FakeGameplayWorldPortHarnessV1[];
}

export function createAdapterFactoryHarness(
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

function createExecutionPlan(
  worldKind: "initial" | "replacement",
): ExecutionPlanV5 {
  const worldId = worldKind === "initial"
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
    actionPresentationRegistry: {
      schemaVersion: 1,
      bindings: [],
      rootMotionSources: [],
    },
    initialControlledEntityId: heroState.id,
    initialRelationships: [],
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
    mountSlots: [],
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
  hash?: Sha256HashV1,
): WorldPackageFileIntegrityEntryV1 {
  const bytes = canonicalJsonBytes(value);
  return {
    path,
    mediaType: "application/json",
    sizeBytes: bytes.byteLength,
    sha256: hash ?? sha256CanonicalJson(value) as Sha256HashV1,
  };
}

export function createBuildReceipt(
  executionPlan: ExecutionPlanV5,
  executionPlanHash: Sha256HashV1,
): WorldPackageBuildReceiptV2 {
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
      ) as Sha256HashV1,
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
      ) as Sha256HashV1,
    },
  ]);
  const sourceReceipt: WorldPackageBuildReceiptV1 = Object.freeze({
    kind: "worldkit-world-package-build-receipt",
    schemaVersion: 1,
    manifest,
    manifestHash,
    fileIntegrityEntries,
    worldPackageRootHash: hashWorldPackageRootV1(fileIntegrityEntries),
  });
  const noticeBytes = new TextEncoder().encode(
    "RuntimeHost V2 fixture\nSee LICENSES/project-owned.txt.\n",
  );
  const licenseBytes = new TextEncoder().encode(
    "Project-owned RuntimeHost V2 test fixture. Redistribution allowed.\n",
  );
  return migrateWorldPackageBuildReceiptV1ToV2({
    sourceReceipt,
    context: {
      title: `${executionPlan.id} RuntimeHost fixture`,
      sdkVersion: "0.0.0",
      canonicalAuthoringSchemaHash: HASH_A,
      aiSchemaProjectionProfile: {
        resourceRef:
          "worldkit://ai-schema-projection-profile/constrained-json@1",
        contentHash: HASH_B,
      },
      worldBounds: {
        centerMetersXZ: [0, 0],
        sizeMetersXZ: [16, 16],
        heightRangeMeters: [0, 8],
      },
      resourceBudget: {
        maximumVertices: 1_000,
        maximumTriangles: 1_000,
        maximumColliders: 16,
      },
      lockedResources: executionPlan.resourceLockEntries,
      legal: {
        distributionPolicy: "redistributable",
        noticePath: "NOTICE",
        licenseDocuments: [{
          id: "project-owned",
          spdxLicenseExpression: "LicenseRef-Project-Owned",
          path: "LICENSES/project-owned.txt",
          mediaType: "text/plain; charset=utf-8",
          sizeBytes: licenseBytes.byteLength,
          contentHash: sha256Bytes(licenseBytes) as Sha256HashV1,
        }],
      },
      hostCompatibility: BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V2,
      resources: sourceReceipt.manifest.resources.map((resource) => ({
        ...resource,
        licenseDocumentId: "project-owned",
        redistributionPolicy: "allowed",
      })),
      v2OnlyFileIntegrityEntries: [
        {
          path: "LICENSES/project-owned.txt",
          mediaType: "text/plain; charset=utf-8",
          sizeBytes: licenseBytes.byteLength,
          sha256: sha256Bytes(licenseBytes) as Sha256HashV1,
        },
        {
          path: "NOTICE",
          mediaType: "text/plain; charset=utf-8",
          sizeBytes: noticeBytes.byteLength,
          sha256: sha256Bytes(noticeBytes) as Sha256HashV1,
        },
      ],
    },
  }).receipt;
}

function mutableWorldConfigurationForKind(
  worldKind: "initial" | "replacement",
) {
  const executionPlan = createExecutionPlan(worldKind);
  const executionPlanHash = sha256CanonicalJson(
    executionPlan,
  ) as Sha256HashV1;
  const worldPackageBuildReceipt = createBuildReceipt(
    executionPlan,
    executionPlanHash,
  );
  return {
    executionPlan,
    executionPlanHash,
    worldPackageRef: worldPackageRefFromRootHashV1(
      worldPackageBuildReceipt.worldPackageRootHash,
    ),
    worldPackageBuildReceipt,
    gameplayBootstrap,
  };
}

export const INITIAL_WORLD_PACKAGE_REF =
  mutableWorldConfigurationForKind("initial").worldPackageRef;
export const REPLACEMENT_WORLD_PACKAGE_REF =
  mutableWorldConfigurationForKind("replacement").worldPackageRef;

export function mutableWorldConfiguration(worldPackageRef: string) {
  return mutableWorldConfigurationForKind(
    worldPackageRef === INITIAL_WORLD_PACKAGE_REF ? "initial" : "replacement",
  );
}

export function replacementRequest(worldPackageRef: string) {
  return { worldConfiguration: mutableWorldConfiguration(worldPackageRef) };
}

export function worldSessionIdFactory(ids: readonly string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `unexpected-world-session-${index}`;
}

export function hostOptions(
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

export async function createHost(
  ports: readonly FakeGameplayWorldPortHarnessV1[],
  ids: readonly string[] = ["world-session.initial", "world-session.next"],
  overrides: Readonly<Record<string, unknown>> = {},
) {
  const adapter = createAdapterFactoryHarness(ports);
  const options = hostOptions(adapter.factory, ids, overrides);
  const host = await runtimeHostConstructor().create(options);
  return { adapter, host, options };
}
