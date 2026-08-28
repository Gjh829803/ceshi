import {
  parseGameplayBootstrapV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  createWorldRuntimeBootstrapV1,
  hashExecutionPlanV5,
  parseExecutionPlanV5,
  type ExecutionLayoutAssertionV1,
  type ExecutionLayoutPlacementV1,
  type ExecutionLayoutRegionV1,
  type ExecutionLayoutRouteV1,
  type ExecutionLayoutScreenRegionV1,
  type ExecutionObjectV3,
  type ExecutionPlanV5,
  type ExecutionStaticColliderV1,
  type ExecutionTerrainV3,
  type ExecutionTraversalAreaV1,
  type ExecutionTraversalSurfaceV1,
  type ExecutionConnectivityRequirementV1,
  type ExecutionWaterV3,
  type RuntimeResourceKindV1,
  type RuntimeResourceLockEntryV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

export type ExecutionPlanV5FieldOwnerV1 =
  | "scene-plan"
  | "runtime-bootstrap"
  | "gameplay-bootstrap"
  | "derived-metadata"
  | "deliberate-deletion";

export interface ExecutionPlanV5FieldAllocationV1 {
  readonly sourceSlice: string;
  readonly owner: ExecutionPlanV5FieldOwnerV1;
  readonly targetPath: string;
  readonly reason: string;
}

export interface ExecutionPlanV5FieldAccountingRowV1 {
  readonly sourceField: keyof ExecutionPlanV5;
  readonly allocations: readonly ExecutionPlanV5FieldAllocationV1[];
}

function allocation(
  sourceSlice: string,
  owner: ExecutionPlanV5FieldOwnerV1,
  targetPath: string,
  reason: string,
): ExecutionPlanV5FieldAllocationV1 {
  return Object.freeze({ sourceSlice, owner, targetPath, reason });
}

function row(
  sourceField: keyof ExecutionPlanV5,
  allocations: readonly ExecutionPlanV5FieldAllocationV1[],
): ExecutionPlanV5FieldAccountingRowV1 {
  return Object.freeze({ sourceField, allocations: Object.freeze(allocations) });
}

export const EXECUTION_PLAN_V5_FIELD_ACCOUNTING_V1:
  readonly ExecutionPlanV5FieldAccountingRowV1[] = Object.freeze([
    row("actionPresentationRegistry", [allocation("all", "runtime-bootstrap", "actionPresentationRegistry", "Action presentation is shared Runtime startup authority.")]),
    row("animationSets", [allocation("all", "runtime-bootstrap", "animationSets", "Animation resources are shared Runtime startup authority.")]),
    row("atmospherePreset", [allocation("all", "scene-plan", "atmospherePreset", "Atmosphere is Canonical Scene construction data.")]),
    row("authoringSpecHash", [allocation("all", "scene-plan", "authoringSpecHash", "The Canonical Scene remains bound to its AuthoringSpec.")]),
    row("camera", [
      allocation("all except aspectRatio", "runtime-bootstrap", "initialCamera", "Initial camera composition is shared Runtime startup authority."),
      allocation("aspectRatio", "deliberate-deletion", "none", "The viewport aspect ratio is derived from the active render target."),
    ]),
    row("colliderProfiles", [allocation("all", "runtime-bootstrap", "colliderProfiles", "Subject collider profiles are shared Runtime startup authority.")]),
    row("coordinateSystem", [allocation("all", "scene-plan", "coordinateSystem", "Canonical geometry owns its coordinate convention.")]),
    row("gravityMetersPerSecondSquaredXYZ", [allocation("all", "runtime-bootstrap", "gravityMetersPerSecondSquaredXYZ", "Gravity is shared physics startup authority.")]),
    row("id", [allocation("all", "scene-plan", "id", "The source Plan retains the world id; the Runtime artifact id is deterministically derived from it.")]),
    row("initialControlledEntityId", [allocation("all", "runtime-bootstrap", "initialControlledEntityId", "Controlled Subject selection is shared Runtime startup authority.")]),
    row("initialRelationships", [allocation("all", "gameplay-bootstrap", "initialRelationshipStates", "Gameplay Bootstrap is the sole owner; projection requires exact equality.")]),
    row("kind", [allocation("all", "derived-metadata", "kind", "The terminal Scene Plan publishes its own discriminator.")]),
    row("layout", [allocation("all", "scene-plan", "layout", "Layout is Canonical Scene placement evidence.")]),
    row("normalizedWorldIrHash", [allocation("all", "scene-plan", "normalizedWorldIrHash", "The Canonical Scene remains bound to Normalized World IR.")]),
    row("objects", [allocation("all", "scene-plan", "objects", "Static authored objects are Canonical Scene geometry.")]),
    row("resourceLockEntries", [
      allocation("resourceKind === traversal-surface-profile", "scene-plan", "sceneResourceLockEntries", "Traversal Surface resources are consumed by the Canonical Scene Source."),
      allocation("all remaining resource kinds, including gameplay-bootstrap", "runtime-bootstrap", "runtimeResourceLockEntries", "Subject and shared Runtime resources are consumed by the Runtime Kernel; the Gameplay lock is an exact cross-artifact identity link, not duplicated Gameplay content authority."),
    ]),
    row("resourceLockHash", [allocation("all", "derived-metadata", "partition hashes", "The old combined lock hash is verified by V5 parsing, then replaced by independently hashed owner partitions.")]),
    row("resourceUsage", [allocation("all", "scene-plan", "sceneResourceUsage", "Geometry and Collider budgets are Canonical Scene Source usage.")]),
    row("rigProfiles", [allocation("all", "runtime-bootstrap", "rigProfiles", "Rig resources are shared Runtime startup authority.")]),
    row("runtimeBackend", [allocation("all", "deliberate-deletion", "none", "Runtime backend selection is Host-owned and not serialized in either terminal artifact.")]),
    row("schemaVersion", [allocation("all", "derived-metadata", "schemaVersion", "Both terminal artifacts publish their own current schema version.")]),
    row("seed", [allocation("all", "scene-plan", "seed", "The deterministic scene seed belongs to Canonical Scene construction.")]),
    row("staticColliders", [allocation("all", "scene-plan", "staticColliders", "Static scene collision is Canonical Scene geometry.")]),
    row("subjectAssets", [allocation("all", "runtime-bootstrap", "subjectAssets", "Subject assets are shared Runtime startup authority.")]),
    row("subjects", [
      allocation("spawnAnchorEntityId, spawnSubjectOriginPositionMetersXYZ, spawnSubjectFacingRadians", "scene-plan", "subjectInstances", "Subject placement belongs to the selected Scene Source."),
      allocation("all remaining Subject fields", "runtime-bootstrap", "subjectRuntimeDescriptors", "Shape-independent Subject closure belongs to the shared Runtime Kernel."),
    ]),
    row("terrain", [allocation("all", "scene-plan", "terrain", "Terrain is Canonical Scene geometry.")]),
    row("traversal", [allocation("all", "scene-plan", "traversal", "Traversal topology is Canonical Scene evidence.")]),
    row("waters", [allocation("all", "scene-plan", "waters", "Water bodies are Canonical Scene geometry.")]),
  ]);

export interface ProjectedCanonicalSceneResourceLockEntryV1 {
  readonly resourceRef: string;
  readonly resourceKind: "traversal-surface-profile";
  readonly resolvedVersion: string;
  readonly contentHash: Sha256HashV1;
}

export interface ProjectedCanonicalSceneSubjectInstanceV1 {
  readonly entityId: string;
  readonly spawnAnchorEntityId: string;
  readonly subjectOriginPositionMetersXYZ: readonly [number, number, number];
  readonly subjectFacingRadians: number;
}

export interface ProjectedCanonicalSceneExecutionPlanV1 {
  readonly kind: "worldkit-canonical-scene-execution-plan";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly seed: number;
  readonly authoringSpecHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly coordinateSystem: "right-handed-y-up-minus-z-forward";
  readonly atmospherePreset: ExecutionPlanV5["atmospherePreset"];
  readonly worldRuntimeBootstrapRef: string;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly sceneResourceLockHash: Sha256HashV1;
  readonly sceneResourceLockEntries:
    readonly ProjectedCanonicalSceneResourceLockEntryV1[];
  readonly terrain: ExecutionTerrainV3;
  readonly waters: readonly ExecutionWaterV3[];
  readonly objects: readonly ExecutionObjectV3[];
  readonly subjectInstances:
    readonly ProjectedCanonicalSceneSubjectInstanceV1[];
  readonly sceneResourceUsage: ExecutionPlanV5["resourceUsage"];
  readonly layout: Readonly<{
    solverProfileRef: string;
    resolvedVersion: string;
    solverProfileHash: string;
    layoutSolveReportHash: string;
    regions: readonly ExecutionLayoutRegionV1[];
    routes: readonly ExecutionLayoutRouteV1[];
    screenRegions: readonly ExecutionLayoutScreenRegionV1[];
    placementsByEntityId: Readonly<Record<string, ExecutionLayoutPlacementV1>>;
    layoutAssertions: readonly ExecutionLayoutAssertionV1[];
  }>;
  readonly traversal: Readonly<{
    surfaces: readonly ExecutionTraversalSurfaceV1[];
    traversalAreas: readonly ExecutionTraversalAreaV1[];
    connectivityRequirements: readonly ExecutionConnectivityRequirementV1[];
    anchorEntityIds: readonly string[];
  }>;
  readonly staticColliders: readonly ExecutionStaticColliderV1[];
}

export interface ProjectExecutionPlanV5Input {
  readonly executionPlan: ExecutionPlanV5;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrapRef: string;
}

export interface ProjectExecutionPlanV5Result {
  readonly sourceExecutionPlanHash: Sha256HashV1;
  readonly canonicalSceneExecutionPlan:
    ProjectedCanonicalSceneExecutionPlanV1;
  readonly executionPlanHash: Sha256HashV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly fieldAccounting:
    readonly ExecutionPlanV5FieldAccountingRowV1[];
}

function invalidProjection(): never {
  throw new TypeError(
    "EXECUTION_PLAN_V5_PROJECTION_INVALID: V5 Plan and Gameplay Bootstrap do not form one exact terminal projection",
  );
}

function canonicalRef(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.normalize("NFC") !== input
  ) {
    return invalidProjection();
  }
  return input;
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || isNil(value) || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

export function hashProjectedCanonicalSceneExecutionPlanV1(
  input: ProjectedCanonicalSceneExecutionPlanV1,
): Sha256HashV1 {
  return sha256CanonicalJson(input) as Sha256HashV1;
}

export function projectExecutionPlanV5(
  input: ProjectExecutionPlanV5Input,
): ProjectExecutionPlanV5Result {
  const executionPlan = parseExecutionPlanV5(input.executionPlan);
  const gameplayBootstrap = parseGameplayBootstrapV1(input.gameplayBootstrap);
  const worldRuntimeBootstrapRef = canonicalRef(
    input.worldRuntimeBootstrapRef,
  );
  const gameplayLocks = executionPlan.resourceLockEntries.filter(
    (entry) => entry.resourceKind === "gameplay-bootstrap",
  );
  if (
    gameplayLocks.length !== 1 ||
    gameplayLocks[0]!.resourceRef !== gameplayBootstrap.resourceRef ||
    gameplayLocks[0]!.resolvedVersion !== String(gameplayBootstrap.version) ||
    gameplayLocks[0]!.contentHash !== gameplayBootstrap.contentHash ||
    stringifyCanonicalJson(executionPlan.initialRelationships) !==
      stringifyCanonicalJson(gameplayBootstrap.initialRelationshipStates)
  ) {
    return invalidProjection();
  }

  const sceneResourceLockEntries = Object.freeze(
    executionPlan.resourceLockEntries
      .filter((entry) => entry.resourceKind === "traversal-surface-profile")
      .map((entry) => Object.freeze({
        resourceRef: entry.resourceRef,
        resourceKind: "traversal-surface-profile" as const,
        resolvedVersion: entry.resolvedVersion,
        contentHash: entry.contentHash as Sha256HashV1,
      })),
  );
  const runtimeResourceLockEntries: readonly RuntimeResourceLockEntryV1[] =
    executionPlan.resourceLockEntries
      .filter((entry) => entry.resourceKind !== "traversal-surface-profile")
      .map((entry) => Object.freeze({
        resourceRef: entry.resourceRef,
        resourceKind: entry.resourceKind as RuntimeResourceKindV1,
        resolvedVersion: entry.resolvedVersion,
        contentHash: entry.contentHash as Sha256HashV1,
      }));
  const subjectRuntimeDescriptors = executionPlan.subjects.map((subject) => {
    const {
      spawnAnchorEntityId: _spawnAnchorEntityId,
      spawnSubjectOriginPositionMetersXYZ: _position,
      spawnSubjectFacingRadians: _facing,
      ...descriptor
    } = subject;
    return descriptor;
  });
  const worldRuntimeBootstrap = createWorldRuntimeBootstrapV1({
    kind: "world-runtime-bootstrap",
    schemaVersion: 1,
    id: `${executionPlan.id}.runtime-bootstrap`,
    gameplayBootstrapRef: gameplayBootstrap.resourceRef,
    gameplayBootstrapHash: gameplayBootstrap.contentHash,
    initialControlledEntityId: executionPlan.initialControlledEntityId,
    gravityMetersPerSecondSquaredXYZ:
      executionPlan.gravityMetersPerSecondSquaredXYZ,
    initialCamera: {
      mode: "third-person",
      cameraEntityId: executionPlan.camera.cameraEntityId,
      targetEntityId: executionPlan.camera.targetEntityId,
      cameraRigProfileRef: executionPlan.camera.rigRef,
      pitchRadians: executionPlan.camera.pitchRadians,
      distanceMeters: executionPlan.camera.distanceMeters,
      targetHeightMeters: executionPlan.camera.targetHeightMeters,
      fovDegrees: executionPlan.camera.fovDegrees,
      manualSwitchAllowed: executionPlan.camera.manualSwitchAllowed,
    },
    subjectAssets: executionPlan.subjectAssets,
    rigProfiles: executionPlan.rigProfiles,
    animationSets: executionPlan.animationSets,
    colliderProfiles: executionPlan.colliderProfiles,
    actionPresentationRegistry: executionPlan.actionPresentationRegistry,
    subjectRuntimeDescriptors,
    runtimeResourceLockEntries,
  });
  const canonicalSceneExecutionPlan = deepFreeze({
    kind: "worldkit-canonical-scene-execution-plan" as const,
    schemaVersion: 1 as const,
    id: executionPlan.id,
    seed: executionPlan.seed,
    authoringSpecHash: executionPlan.authoringSpecHash as Sha256HashV1,
    normalizedWorldIrHash: executionPlan.normalizedWorldIrHash as Sha256HashV1,
    coordinateSystem: executionPlan.coordinateSystem,
    atmospherePreset: executionPlan.atmospherePreset,
    worldRuntimeBootstrapRef,
    worldRuntimeBootstrapHash: worldRuntimeBootstrap.contentHash,
    sceneResourceLockHash: sha256CanonicalJson(
      sceneResourceLockEntries,
    ) as Sha256HashV1,
    sceneResourceLockEntries,
    terrain: executionPlan.terrain,
    waters: executionPlan.waters,
    objects: executionPlan.objects,
    subjectInstances: executionPlan.subjects.map((subject) => Object.freeze({
      entityId: subject.entityId,
      spawnAnchorEntityId: subject.spawnAnchorEntityId,
      subjectOriginPositionMetersXYZ:
        subject.spawnSubjectOriginPositionMetersXYZ,
      subjectFacingRadians: subject.spawnSubjectFacingRadians,
    })),
    sceneResourceUsage: executionPlan.resourceUsage,
    layout: executionPlan.layout,
    traversal: executionPlan.traversal,
    staticColliders: executionPlan.staticColliders,
  } satisfies ProjectedCanonicalSceneExecutionPlanV1);

  return Object.freeze({
    sourceExecutionPlanHash: hashExecutionPlanV5(executionPlan) as Sha256HashV1,
    canonicalSceneExecutionPlan,
    executionPlanHash: hashProjectedCanonicalSceneExecutionPlanV1(
      canonicalSceneExecutionPlan,
    ),
    worldRuntimeBootstrap,
    fieldAccounting: EXECUTION_PLAN_V5_FIELD_ACCOUNTING_V1,
  });
}
