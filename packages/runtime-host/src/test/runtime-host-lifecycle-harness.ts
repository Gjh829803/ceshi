import {
  hashWorldBuildIdentityV1,
  worldPackageRefFromRootHashV1,
  type WorldBuildIdentityV1,
} from "@whitebox-world/world-identity";
import {
  createGameplayBootstrapResourceLockEntryV1,
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
import { sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  createCanonicalSceneExecutionPlanV1,
  createWorldRuntimeBootstrapV1,
  hashCanonicalSceneExecutionPlanV1,
} from "@whitebox-world/runtime-contracts";
import { vi } from "vitest";

import type { GameplayWorldPortV1 } from "../gameplay-world-port";
import * as runtimeHostModule from "../runtime-host";
import type { PublishWorldReplacementResultV1, RuntimeActivityAcquireResultV1 } from "../runtime-host";
import { createFakeGameplayWorldPortHarnessV1, type FakeGameplayWorldPortHarnessV1 } from "./fake-gameplay-world-adapter";
import type { WorldSessionPublicationV1 } from "../world-session";

export const HASH_A = `sha256:${"a".repeat(64)}` as const;
export const HASH_B = `sha256:${"b".repeat(64)}` as const;
export const HASH_C = `sha256:${"c".repeat(64)}` as const;
export const HASH_D = `sha256:${"d".repeat(64)}` as const;
export const RUNTIME_SESSION_ID = "runtime.lifecycle";

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
  resetWithInitialControlBinding(input: unknown): Promise<WorldSessionPublicationV1>;
  runtimeActivitySnapshot(): runtimeHostModule.RuntimeActivityCoordinatorSnapshotV1;
  acquireRuntimeActivity(input: unknown): RuntimeActivityAcquireResultV1;
  dispose(): Promise<void>;
}

interface RuntimeHostConstructorUnderTestV1 {
  create(input: unknown): Promise<RuntimeHostUnderTestV1>;
}

export function runtimeHostConstructor(): RuntimeHostConstructorUnderTestV1 {
  return runtimeHostModule.RuntimeHost;
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
      preflightConcurrentResidency: vi.fn(() => Object.freeze({ status: "accepted" as const })),
      create: vi.fn(async (): Promise<GameplayWorldPortV1> => {
        const port = ports[index++];
        if (port === undefined) throw new Error("private fake adapter exhaustion");
        return port.port;
      }),
      awaitCandidatePublicationReady: vi.fn(async () => undefined),
    }),
  });
}

function createArtifacts(worldKind: "initial" | "replacement") {
  const worldId = worldKind === "initial" ? "world.lifecycle.initial" : "world.lifecycle.replacement";
  const runtimeBootstrapRef = `worldkit://world-runtime-bootstrap/${worldId}@1`;
  const controlFeel = {
    resourceRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
    contentHash: HASH_A,
    jumpVariantPolicy: { mode: "hold-height" },
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
  const worldRuntimeBootstrap = createWorldRuntimeBootstrapV1({
    kind: "world-runtime-bootstrap",
    schemaVersion: 1,
    id: `${worldId}.runtime-bootstrap`,
    gameplayBootstrapRef: gameplayBootstrap.resourceRef,
    gameplayBootstrapHash: gameplayBootstrap.contentHash,
    initialControlledEntityId: heroState.id,
    gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
    initialCamera: {
      mode: "third-person",
      cameraEntityId: "camera.main",
      targetEntityId: heroState.id,
      cameraRigProfileRef: "worldkit://camera/third-person.standard@1",
      pitchRadians: 0.2,
      distanceMeters: 4,
      targetHeightMeters: 1.2,
      fovDegrees: 60,
      manualSwitchAllowed: true,
    },
    subjectAssets: [],
    rigProfiles: [],
    animationSets: [],
    colliderProfiles: [],
    actionPresentationRegistry: { schemaVersion: 1, bindings: [], rootMotionSources: [] },
    subjectRuntimeDescriptors: [{
      entityId: heroState.id,
      subjectDefinitionRef: heroState.entityDefinitionRef,
      subjectDefinitionHash: heroState.entityDefinitionHash,
      bodyTopology: "biped",
      semanticClassId: heroState.semanticClassId,
      forwardDirection: "-z",
      visualParts: [{
        id: "body",
        kind: "primitive",
        shape: { kind: "capsule", radiusMeters: 0.35, heightMeters: 1.8 },
        localTransform: { positionMetersXYZ: [0, 0.9, 0], rotationEulerRadiansXYZ: [0, 0, 0] },
        semanticTags: ["body"],
      }],
      visualBinding: { mode: "static" },
      sockets: [],
      mountSlots: [],
      collider: { kind: "capsule", radiusMeters: 0.35, heightMeters: 1.8, centerOffsetFromSubjectOriginMetersXYZ: [0, 0.9, 0], massKilograms: 70, maxSlopeDegrees: 42, maxStepHeightMeters: 0.4 },
      locomotion: { allowWalk: true, allowRun: true, allowJump: true },
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
        defaultMotionProfile: { resourceRef: "worldkit://motion-profile/free-ground@1", contentHash: HASH_A, motionKernelRef: "worldkit://motion-kernel/free-ground@1", motionTags: ["ground"] },
        optionalMotionProfiles: [],
        fallbackMotionProfile: { resourceRef: "worldkit://motion-profile/safe-ground@1", contentHash: HASH_B, motionKernelRef: "worldkit://motion-kernel/free-ground@1", motionTags: ["ground", "fallback"] },
        motionKernels: [{ resourceRef: "worldkit://motion-kernel/free-ground@1", implementationId: "free-ground", commandKind: "planar-vector", supportedMediums: ["ground", "air"], fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1", deterministic: true }],
        controlProfile: { resourceRef: "worldkit://control-profile/planar.camera-relative@1", contentHash: HASH_C, commandKind: "planar-vector", inputSpace: "camera-relative", facingPolicy: "align-to-move", lateralMovementPolicy: "allowed", moveDeadzoneRatio: 0.1 },
        cameraContext: { resourceRef: "worldkit://camera-context/default@1", defaultCameraRigProfileRef: "worldkit://camera/third-person.standard@1", rules: [], cameraRigProfiles: [], cameraModifierProfiles: [] },
        mediumProfile: { resourceRef: "worldkit://medium-profile/ground-air.standard@1", air: { gravityRatio: 1, linearDragPerSecond: 0 } },
        relationshipProfiles: [],
        harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
        requiredHarnessCheckIds: [],
        actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
        renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
      },
    }],
    runtimeResourceLockEntries: [createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap)],
  });
  const executionPlan = createCanonicalSceneExecutionPlanV1({
    kind: "worldkit-canonical-scene-execution-plan",
    schemaVersion: 1,
    id: worldId,
    seed: 24,
    authoringSpecHash: HASH_A,
    normalizedWorldIrHash: HASH_B,
    coordinateSystem: "right-handed-y-up-minus-z-forward",
    atmospherePreset: "clear-day",
    worldRuntimeBootstrapRef: runtimeBootstrapRef,
    worldRuntimeBootstrapHash: worldRuntimeBootstrap.contentHash,
    sceneResourceLockHash: sha256CanonicalJson([]) as Sha256HashV1,
    sceneResourceLockEntries: [],
    terrain: { entityId: "terrain.main", centerMetersXZ: [0, 0], sizeMetersXZ: [16, 16], resolutionCellsXZ: [2, 2], heightSamplesMeters: [0, 0, 0, 0], heightSamplesHash: sha256CanonicalJson([0, 0, 0, 0]) as Sha256HashV1, minimumHeightMeters: 0, maximumHeightMeters: 0, semanticClassId: "terrain.ground" },
    waters: [],
    objects: [],
    subjectInstances: [{ entityId: heroState.id, spawnAnchorEntityId: "anchor.spawn", subjectOriginPositionMetersXYZ: [0, 0, 0], subjectFacingRadians: 0 }],
    sceneResourceUsage: { vertices: 0, triangles: 0, colliders: 2 },
    layout: { solverProfileRef: "worldkit://layout-solver-profile/test@1", resolvedVersion: "1", solverProfileHash: HASH_C, layoutSolveReportHash: HASH_D, regions: [], routes: [], screenRegions: [], placementsByEntityId: {}, layoutAssertions: [] },
    traversal: { surfaces: [], traversalAreas: [], connectivityRequirements: [], anchorEntityIds: ["anchor.spawn"] },
    staticColliders: [],
  });
  return { executionPlan, worldRuntimeBootstrap };
}

function mutableWorldConfigurationForKind(worldKind: "initial" | "replacement") {
  const { executionPlan, worldRuntimeBootstrap } = createArtifacts(worldKind);
  const executionPlanHash = hashCanonicalSceneExecutionPlanV1(executionPlan);
  const worldPackageRootHash = sha256CanonicalJson({ worldKind, executionPlanHash }) as Sha256HashV1;
  const worldPackageRef = worldPackageRefFromRootHashV1(worldPackageRootHash);
  const worldBuildIdentity: WorldBuildIdentityV1 = {
    kind: "world-build-identity",
    schemaVersion: 1,
    id: `${executionPlan.id}.world-build`,
    worldPackageRef,
    worldPackageRootHash,
    gameplayBootstrapHash: gameplayBootstrap.contentHash,
    worldRuntimeBootstrapHash: worldRuntimeBootstrap.contentHash,
    sceneSourceIdentity: { kind: "canonical-execution-plan", executionPlanHash },
  };
  hashWorldBuildIdentityV1(worldBuildIdentity);
  return {
    worldBuildIdentity,
    gameplayBootstrap,
    worldRuntimeBootstrap,
    sceneSource: { kind: "canonical-execution-plan" as const, executionPlan, executionPlanHash },
  };
}

export const INITIAL_WORLD_PACKAGE_REF = mutableWorldConfigurationForKind("initial").worldBuildIdentity.worldPackageRef;
export const REPLACEMENT_WORLD_PACKAGE_REF = mutableWorldConfigurationForKind("replacement").worldBuildIdentity.worldPackageRef;

export function mutableWorldConfiguration(worldPackageRef: string) {
  return mutableWorldConfigurationForKind(worldPackageRef === INITIAL_WORLD_PACKAGE_REF ? "initial" : "replacement");
}

export function replacementRequest(worldPackageRef: string) {
  return { worldConfiguration: mutableWorldConfiguration(worldPackageRef) };
}

export function worldSessionIdFactory(ids: readonly string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `unexpected-world-session-${index}`;
}

export function hostOptions(adapterFactory: AdapterFactoryHarnessV1["factory"], ids: readonly string[], overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    runtimeSessionId: RUNTIME_SESSION_ID,
    initialWorld: mutableWorldConfiguration(INITIAL_WORLD_PACKAGE_REF),
    participantStates: [participantState],
    controllerStates: [controllerState],
    fixedInputControllerEntityId: controllerState.id,
    gameplayModeFactory: () => gameplayMode,
    gameplayFeatureFactories: [controlFeatureFactory],
    gameplayCapacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
    runtimeHostCapacityBudget: { maximumWorldSessionCount: 8, maximumRuntimeActivityRecordCount: 8 },
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
  adapter.factory.awaitCandidatePublicationReady.mockClear();
  return { adapter, host, options };
}
