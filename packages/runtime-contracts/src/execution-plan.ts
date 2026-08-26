import {
  SUBJECT_RESOURCE_KINDS_V1,
  isBipedBoneIdV1,
  isGroundHumanoidActionIdV1,
  isSubjectBodyTopologyV2,
  type BipedBoneIdV1,
  type GroundHumanoidActionIdV1,
  type SubjectBodyTopologyV2,
} from "@whitebox-world/subject-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type { MountedOnRelationshipStateV1 } from "@whitebox-world/gameplay-contracts";
import type { TraversalSurfaceIdentityV1 } from "@whitebox-world/traversal";
import { isNil } from "lodash-es";

import {
  CAMERA_RIG_PARAMETER_NAMES_V1,
  type CameraRigParameterNameV1,
  type CameraRigParametersV1,
} from "./camera-parameter-contract";

export type Vec2 = readonly [x: number, z: number];
export type Vec3 = readonly [x: number, y: number, z: number];

export interface CompileDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  instancePath: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}

export interface ExecutionTransformV3 {
  positionMetersXYZ: Vec3;
  rotationEulerRadiansXYZ: Vec3;
  scaleXYZ: Vec3;
}

export type ExecutionWaterBoundaryV3 =
  | { kind: "circle"; centerMetersXZ: Vec2; radiusMeters: number }
  | { kind: "ellipse"; centerMetersXZ: Vec2; radiusMetersXZ: Vec2 }
  | { kind: "polygon"; pointsMetersXZ: readonly Vec2[] };

export interface ExecutionTerrainV3 {
  entityId: string;
  centerMetersXZ: Vec2;
  sizeMetersXZ: Vec2;
  resolutionCellsXZ: readonly [columns: number, rows: number];
  /** Row-major: X changes fastest, then Z. */
  heightSamplesMeters: readonly number[];
  heightSamplesHash: string;
  minimumHeightMeters: number;
  maximumHeightMeters: number;
  semanticClassId: string;
}

export interface ExecutionWaterV3 {
  entityId: string;
  terrainEntityId: string;
  boundary: ExecutionWaterBoundaryV3;
  depthMeters: number;
  shoreWidthMeters: number;
  waterLevelMeters: number;
  traversalMode: "blocked" | "swimmable" | "walkable";
  semanticClassId: string;
}

export type ExecutionObjectPrimitiveV3 =
  | { kind: "box"; sizeMetersXYZ: Vec3 }
  | { kind: "sphere"; radiusMeters: number }
  | { kind: "cylinder" | "cone"; radiusMeters: number; heightMeters: number };

export interface ExecutionObjectV3 {
  entityId: string;
  prototypeId: string;
  primitive: ExecutionObjectPrimitiveV3;
  transform: ExecutionTransformV3;
  collisionEnabled: boolean;
  semanticClassId: string;
}

export type SubjectVisualPrimitiveV3 =
  | { kind: "box"; sizeMetersXYZ: Vec3 }
  | { kind: "sphere"; radiusMeters: number }
  | { kind: "cylinder"; radiusMeters: number; heightMeters: number }
  | { kind: "capsule"; radiusMeters: number; heightMeters: number };

export interface SubjectAssetInventoryV1 {
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  skeletonCount: number;
  boneCount: number;
  animationClipNames: readonly string[];
}

export interface ExecutionSubjectAssetV1 {
  subjectAssetRef: string;
  artifactContentHash: string;
  byteLength: number;
  mediaType: "model/gltf-binary";
  format: "glb";
  inventory: SubjectAssetInventoryV1;
}

export interface ExecutionRigProfileV1 {
  rigProfileRef: string;
  bodyTopology: "biped";
  skeletonRootBoneName: string;
  requiredBoneIds: readonly BipedBoneIdV1[];
  sourceNodeNameByBoneId: Readonly<Record<BipedBoneIdV1, string>>;
}

export interface ExecutionAnimationBindingV1 {
  actionId: GroundHumanoidActionIdV1;
  sourceClipName: string;
  loopMode: "repeat" | "once";
  playbackSpeedRatio: number;
  blendDurationSeconds: number;
  rootMotionMode: "in-place";
}

export interface ExecutionAnimationSetV1 {
  animationSetRef: string;
  subjectAssetRef: string;
  rigProfileRef: string;
  defaultActionId: GroundHumanoidActionIdV1;
  requiredActionIds: readonly GroundHumanoidActionIdV1[];
  animationBindings: readonly ExecutionAnimationBindingV1[];
}

export interface ExecutionSubjectCapsuleV1 {
  kind: "capsule";
  radiusMeters: number;
  heightMeters: number;
  centerOffsetFromSubjectOriginMetersXYZ: Vec3;
}

export interface ExecutionColliderProfileV1 {
  colliderProfileRef: string;
  supportedBodyTopologies: readonly SubjectBodyTopologyV2[];
  collider: ExecutionSubjectCapsuleV1;
}

export interface SubjectVisualPrimitivePartV3 {
  id: string;
  kind: "primitive";
  shape: SubjectVisualPrimitiveV3;
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
  };
  semanticTags: readonly string[];
}

export interface SubjectVisualAssetPartV3 {
  id: string;
  kind: "asset";
  subjectAssetRef: string;
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
    scaleXYZ: Vec3;
  };
  appearance: { mode: "whitebox-neutral" };
  semanticTags: readonly string[];
}

export type SubjectVisualPartV3 =
  | SubjectVisualPrimitivePartV3
  | SubjectVisualAssetPartV3;

export interface SubjectLocalSocketV3 {
  id: string;
  kind: "local";
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
  };
  semanticTags: readonly string[];
}

export interface SubjectBoneSocketV3 {
  id: string;
  kind: "bone";
  boneId: BipedBoneIdV1;
  offsetTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
  };
  semanticTags: readonly string[];
}

export type SubjectSocketV3 = SubjectLocalSocketV3 | SubjectBoneSocketV3;

export type ExecutionSubjectVisualBindingV1 =
  | { mode: "static" }
  | {
      mode: "rigged";
      rigProfileRef: string;
      animationSetRef: string;
    };

export type ExecutionMovementMediumV1 = "ground" | "water" | "air";
export type ExecutionMotionCommandKindV1 =
  | "planar-vector"
  | "throttle-steer"
  | "flight-attitude"
  | "none";

export interface ExecutionMotionProfileV1 {
  resourceRef: string;
  contentHash: string;
  motionKernelRef: string;
  motionTags: readonly string[];
}

export interface ExecutionMotionKernelDefinitionV1 {
  resourceRef: string;
  implementationId:
    | "free-ground"
    | "forward-steer"
    | "wheeled-arcade"
    | "surface-slide"
    | "water-surface"
    | "unpowered-glide";
  commandKind: ExecutionMotionCommandKindV1;
  supportedMediums: readonly ExecutionMovementMediumV1[];
  fallbackMotionProfileRef: string;
  deterministic: true;
}

export interface ExecutionControlProfileV1 {
  resourceRef: string;
  contentHash: string;
  commandKind: ExecutionMotionCommandKindV1;
  inputSpace: "camera-relative" | "subject-local" | "flight-frame" | "none";
  facingPolicy:
    | "align-to-move"
    | "align-to-view"
    | "steering-derived"
    | "flight-derived"
    | "fixed";
  lateralMovementPolicy: "allowed" | "forbidden";
  moveDeadzoneRatio: number;
}

export interface ExecutionCameraRigProfileV1 {
  resourceRef: string;
  contentHash: string;
  baseMode:
    | "first-person"
    | "free-orbit"
    | "stable-follow"
    | "speed-chase"
    | "flight-horizon";
  algorithmRef: string;
  headingSource: "view" | "target-forward" | "target-velocity";
  reverseHeadingPolicy: "follow-velocity" | "preserve-target-forward";
  recenterMode: "off" | "forward-motion" | "always";
  preferredSocketIds: readonly string[];
  parameters: CameraRigParametersV1;
  authoringRanges?: Readonly<Partial<
    Record<CameraRigParameterNameV1, { minimum: number; maximum: number; step: number }>
  >>;
}

export interface ExecutionCameraModifierProfileV1 {
  resourceRef: string;
  parameterOverrides: Readonly<Partial<ExecutionCameraRigProfileV1["parameters"]>>;
  headingSourceOverride?: ExecutionCameraRigProfileV1["headingSource"];
  reverseHeadingPolicyOverride?: ExecutionCameraRigProfileV1["reverseHeadingPolicy"];
  recenterModeOverride?: ExecutionCameraRigProfileV1["recenterMode"];
}

export interface ExecutionCameraContextRuleV1 {
  id: string;
  priority: number;
  when: {
    relationshipRoles?: readonly ("none" | "rider" | "driver" | "passenger" | "tethered")[];
    motionKernelRefs?: readonly string[];
    requiredMotionTags?: readonly string[];
    movementMediums?: readonly ExecutionMovementMediumV1[];
    minimumSpeedMetersPerSecond?: number;
    maximumSpeedMetersPerSecond?: number;
    requiredSocketIds?: readonly string[];
    requiredCameraContextTags?: readonly string[];
  };
  cameraRigProfileRef?: string;
  cameraModifierRefs?: readonly string[];
}

export interface ExecutionSubjectCapabilityAssemblyV1 {
  authoringAvailability: "recommended" | "advanced" | "experimental";
  physicsBodyProfileRef: string;
  locomotionProfileRef: string;
  defaultMotionProfile: ExecutionMotionProfileV1;
  optionalMotionProfiles: readonly ExecutionMotionProfileV1[];
  fallbackMotionProfile: ExecutionMotionProfileV1;
  motionKernels: readonly ExecutionMotionKernelDefinitionV1[];
  controlProfile: ExecutionControlProfileV1;
  cameraContext: {
    resourceRef: string;
    defaultCameraRigProfileRef: string;
    firstPersonCameraRigProfileRef?: string;
    rules: readonly ExecutionCameraContextRuleV1[];
    cameraRigProfiles: readonly ExecutionCameraRigProfileV1[];
    cameraModifierProfiles: readonly ExecutionCameraModifierProfileV1[];
  };
  mediumProfile: {
    resourceRef: string;
    air: { gravityRatio: number; linearDragPerSecond: number };
  };
  relationshipProfiles: readonly (
    | Readonly<{
        resourceRef: string;
        relationshipType: "mountedOn";
        requiredRiderSocketIds: readonly string[];
        requiredMountSocketIds: readonly string[];
        controlTransferMode: "keep-rider" | "to-mount" | "none";
        cameraTargetRole: "controlled-entity" | "rider" | "mount";
        maximumMountDistanceMeters?: number;
      }>
    | Readonly<{
        resourceRef: string;
        relationshipType: "seat";
        requiredOccupantSocketIds: readonly string[];
        requiredSeatSocketIds: readonly string[];
      }>
    | Readonly<{
        resourceRef: string;
        relationshipType: "tether";
        requiredTetheredSocketIds: readonly string[];
        requiredTetherAnchorSocketIds: readonly string[];
      }>
  )[];
  harnessProfileRef: string;
  requiredHarnessCheckIds: readonly string[];
  actionOrPoseSetRef: string;
  renderBindingProfileRef: string;
}

export interface ExecutionSubjectV3 {
  entityId: string;
  subjectDefinitionRef: string;
  subjectDefinitionHash: string;
  bodyTopology: SubjectBodyTopologyV2;
  semanticClassId: string;
  spawnAnchorEntityId: string;
  spawnSubjectOriginPositionMetersXYZ: Vec3;
  spawnSubjectFacingRadians: number;
  forwardDirection: "-z";
  visualParts: readonly SubjectVisualPartV3[];
  visualBinding: ExecutionSubjectVisualBindingV1;
  sockets: readonly SubjectSocketV3[];
  mountSlots: readonly ExecutionSubjectMountSlotV1[];
  collider: {
    kind: "capsule";
    radiusMeters: number;
    heightMeters: number;
    centerOffsetFromSubjectOriginMetersXYZ: Vec3;
    massKilograms: number;
    maxSlopeDegrees: number;
    maxStepHeightMeters: number;
  };
  locomotion: {
    allowWalk: boolean;
    allowRun: boolean;
    allowJump: boolean;
  };
  locomotionCapabilityRef: string;
  locomotionCapabilityHash: string;
  physicsBodyProfileRef: string;
  locomotionProfileRef: string;
  controlFeel: {
    resourceRef: string;
    contentHash: string;
    walkSpeedMetersPerSecond: number;
    runSpeedMetersPerSecond: number;
    jumpSpeedMetersPerSecond: number;
    accelerationMetersPerSecondSquared: number;
    decelerationMetersPerSecondSquared: number;
    turnRateRadiansPerSecond: number;
    moveResponseExponent: number;
    airControlRatio: number;
    coyoteTimeSeconds: number;
    jumpBufferSeconds: number;
    variableJumpHoldSeconds: number;
    jumpHoldGravityRatio: number;
    jumpReleaseGravityRatio: number;
  };
  /**
   * Compiler-locked Feel surfaces the Runtime may switch among. Copied from
   * Registry at compile time; the Runtime never reverse-reads the Registry.
   */
  availableControlFeels: readonly ExecutionSubjectV3["controlFeel"][];
  capabilityAssembly: ExecutionSubjectCapabilityAssemblyV1;
}

export interface ExecutionSubjectMountSlotV1 {
  readonly id: string;
  readonly kind: "mount-slot";
  readonly mode: "stand";
  readonly mountSocketId: string;
  readonly riderSubjectOriginOffsetMetersXYZ: Vec3;
  readonly dismountCandidateOffsetsMetersXYZ: readonly Vec3[];
}

interface ExecutionCameraCore {
  cameraEntityId: string;
  rigRef: "worldkit://camera/third-person.standard@1";
  targetEntityId: string;
  pitchRadians: number;
  distanceMeters: number;
  targetHeightMeters: number;
  fovDegrees: number;
  manualSwitchAllowed: boolean;
}

interface ExecutionLayoutAssertionBaseV1 {
  readonly constraintId: string;
  readonly evidenceEntityIds: readonly string[];
  readonly measurements: Readonly<Record<string, number | boolean | string>>;
  readonly tolerances: Readonly<Record<string, number>>;
}

export type ExecutionLayoutAssertionV1 = ExecutionLayoutAssertionBaseV1 &
  (
    | Readonly<{ kind: "inside-region" | "outside-region"; entityId: string; regionId: string; boundaryClearanceMeters: number }>
    | Readonly<{ kind: "distance-range"; entityId: string; referenceEntityId: string; minimumDistanceMeters: number; maximumDistanceMeters: number }>
    | Readonly<{ kind: "faces-entity"; facingEntityId: string; targetEntityId: string; maximumAngularDeviationDegrees: number }>
    | Readonly<{ kind: "supported-by"; supportedEntityId: string; supportingEntityId: string; maximumSupportGapMeters: number; minimumSupportRatio: number }>
    | (Readonly<{ kind: "minimum-clearance"; entityId: string; clearanceMeters: number }> &
        (Readonly<{ otherEntityIds: readonly string[]; semanticClassIds?: never }> |
          Readonly<{ semanticClassIds: readonly string[]; otherEntityIds?: never }>))
    | (Readonly<{ kind: "within-slope-limit"; terrainEntityId: string; maximumSlopeDegrees: number }> &
        (Readonly<{ entityId: string; routeId?: never }> |
          Readonly<{ routeId: string; entityId?: never }>))
    | Readonly<{ kind: "visible-in-camera-region"; visibleEntityId: string; cameraEntityId: string; screenRegionId: string; minimumVisibleRatio: number; minimumProjectedAreaRatio: number }>
  );

export interface ExecutionLayoutPlacementProvenanceV1 {
  readonly kind: "fixed" | "solved";
  readonly candidateId: string;
  readonly placementConstraintIds: readonly string[];
  readonly solverProfileRef: string;
  readonly layoutSolveReportHash: string;
}

export interface ExecutionLayoutPlacementV1 {
  readonly entityId: string;
  readonly transform: ExecutionTransformV3;
  readonly placementProvenance: ExecutionLayoutPlacementProvenanceV1;
}

export interface ExecutionLayoutRegionV1 {
  readonly id: string;
  readonly kind: "polygon-xz";
  readonly pointsMetersXZ: readonly Vec2[];
  readonly minimumHeightMeters?: number;
  readonly maximumHeightMeters?: number;
  readonly semanticClassId: string;
}

export interface ExecutionLayoutRouteV1 {
  readonly id: string;
  readonly kind: "polyline-xz";
  readonly pointsMetersXZ: readonly Vec2[];
  readonly widthMeters: number;
  readonly locomotionProfileRef: string;
}

export interface ExecutionLayoutScreenRegionV1 {
  readonly id: string;
  readonly kind: "rectangle-uv";
  readonly minimumUv: readonly [u: number, v: number];
  readonly maximumUv: readonly [u: number, v: number];
}

export interface ExecutionCameraV5 extends ExecutionCameraCore {
  readonly aspectRatio: number;
}

export interface ExecutionHeightfieldTraversalSurfaceV1
  extends TraversalSurfaceIdentityV1 {
  readonly kind: "heightfield";
}

export interface ExecutionStaticColliderTraversalSurfaceV1
  extends TraversalSurfaceIdentityV1 {
  readonly kind: "static-collider";
  readonly logicalSurfaceId: string;
  readonly logicalSubshapeId: string;
  readonly colliderHash: `sha256:${string}`;
  readonly traversalSurfaceProfileRef: string;
  readonly traversalSurfaceProfileResolvedVersion: string;
  readonly traversalSurfaceProfileHash: `sha256:${string}`;
}

export type ExecutionTraversalSurfaceV1 =
  | ExecutionHeightfieldTraversalSurfaceV1
  | ExecutionStaticColliderTraversalSurfaceV1;

export interface ExecutionTraversalAreaV1 {
  readonly id: string;
  readonly kind: "polygon-xz";
  readonly pointsMetersXZ: readonly Vec2[];
  readonly surfaceEntityId: string;
  readonly mode: "blocked";
}

export type ExecutionStaticColliderShapeV1 =
  | Readonly<{ kind: "box"; sizeMetersXYZ: Vec3 }>
  | Readonly<{ kind: "sphere"; radiusMeters: number }>
  | Readonly<{ kind: "cylinder"; radiusMeters: number; heightMeters: number }>;

export interface ExecutionStaticColliderV1 {
  readonly entityId: string;
  readonly logicalSubshapeId: string;
  readonly colliderSubshapeId: string;
  readonly transform: ExecutionTransformV3;
  readonly shape: ExecutionStaticColliderShapeV1;
  readonly colliderHash: `sha256:${string}`;
}

export interface ExecutionConnectivityRequirementV1 {
  readonly constraintId: string;
  readonly kind: "connected-by-route";
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly routeId: string;
}

export const EXECUTION_RESOURCE_KINDS_V1 = Object.freeze([
  ...SUBJECT_RESOURCE_KINDS_V1,
  "traversal-surface-profile",
  "gameplay-bootstrap",
] as const);

export type ExecutionResourceKindV1 =
  typeof EXECUTION_RESOURCE_KINDS_V1[number];

export interface ExecutionResourceLockEntryV1 {
  readonly resourceRef: string;
  readonly resourceKind: ExecutionResourceKindV1;
  readonly resolvedVersion: string;
  readonly contentHash: `sha256:${string}`;
}

export interface GameplayBootstrapExecutionResourceLockV1
  extends ExecutionResourceLockEntryV1 {
  readonly resourceKind: "gameplay-bootstrap";
}

const EXECUTION_RESOURCE_LOCK_ENTRY_FIELDS_V1 = [
  "resourceRef",
  "resourceKind",
  "resolvedVersion",
  "contentHash",
] as const;
const EXECUTION_RESOURCE_HASH_PATTERN_V1 = /^sha256:[a-f0-9]{64}$/;

/**
 * Validates and canonicalizes the complete Execution Resource Lock. Callers
 * compare the returned order with serialized input when canonical wire order
 * is required.
 */
export function canonicalExecutionResourceLockEntriesV1<
  Entry extends Readonly<{
    resourceRef: string;
    resourceKind: string;
    resolvedVersion: string;
    contentHash: string;
  }>,
>(
  value: readonly Entry[],
): readonly (ExecutionResourceLockEntryV1 & {
  readonly resourceKind: Entry["resourceKind"];
})[];
export function canonicalExecutionResourceLockEntriesV1(
  value: unknown,
): readonly ExecutionResourceLockEntryV1[];
export function canonicalExecutionResourceLockEntriesV1(
  value: unknown,
): readonly ExecutionResourceLockEntryV1[] {
  if (!Array.isArray(value)) {
    throw new TypeError("EXECUTION_RESOURCE_LOCK_INVALID");
  }
  const seenResourceKeys = new Set<string>();
  const rows = value.map((candidate) => {
    if (isNil(candidate) || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new TypeError("EXECUTION_RESOURCE_LOCK_INVALID");
    }
    const record = candidate as Record<string, unknown>;
    const fields = Object.keys(record).sort();
    const expectedFields = [...EXECUTION_RESOURCE_LOCK_ENTRY_FIELDS_V1].sort();
    if (
      fields.length !== expectedFields.length ||
      fields.some((field, index) => field !== expectedFields[index]) ||
      typeof record.resourceRef !== "string" ||
      record.resourceRef.length === 0 ||
      typeof record.resolvedVersion !== "string" ||
      record.resolvedVersion.length === 0 ||
      typeof record.contentHash !== "string" ||
      !EXECUTION_RESOURCE_HASH_PATTERN_V1.test(record.contentHash) ||
      !EXECUTION_RESOURCE_KINDS_V1.includes(
        record.resourceKind as ExecutionResourceKindV1,
      )
    ) {
      throw new TypeError("EXECUTION_RESOURCE_LOCK_INVALID");
    }
    const resourceKey = `${record.resourceKind as string}\u0000${record.resourceRef}`;
    if (seenResourceKeys.has(resourceKey)) {
      throw new TypeError("EXECUTION_RESOURCE_LOCK_INVALID");
    }
    seenResourceKeys.add(resourceKey);
    return Object.freeze({
      resourceRef: record.resourceRef,
      resourceKind: record.resourceKind as ExecutionResourceKindV1,
      resolvedVersion: record.resolvedVersion,
      contentHash: record.contentHash as `sha256:${string}`,
    });
  });
  rows.sort((left, right) =>
    left.resourceRef < right.resourceRef
      ? -1
      : left.resourceRef > right.resourceRef
        ? 1
        : left.resourceKind < right.resourceKind
          ? -1
          : left.resourceKind > right.resourceKind
            ? 1
            : 0
  );
  return Object.freeze(rows);
}

export interface ExecutionPlanV5 {
  readonly kind: "worldkit-execution-plan";
  readonly schemaVersion: 5;
  readonly id: string;
  readonly seed: number;
  readonly runtimeBackend: "babylon-havok";
  readonly authoringSpecHash: `sha256:${string}`;
  readonly normalizedWorldIrHash: string;
  readonly resourceLockHash: string;
  readonly resourceLockEntries: readonly ExecutionResourceLockEntryV1[];
  readonly coordinateSystem: "right-handed-y-up-minus-z-forward";
  readonly gravityMetersPerSecondSquaredXYZ: Vec3;
  readonly atmospherePreset: "clear-day" | "golden-hour" | "overcast" | "night";
  readonly terrain: ExecutionTerrainV3;
  readonly waters: readonly ExecutionWaterV3[];
  readonly objects: readonly ExecutionObjectV3[];
  readonly subjectAssets: readonly ExecutionSubjectAssetV1[];
  readonly rigProfiles: readonly ExecutionRigProfileV1[];
  readonly animationSets: readonly ExecutionAnimationSetV1[];
  readonly colliderProfiles: readonly ExecutionColliderProfileV1[];
  readonly initialControlledEntityId: string;
  readonly subjects: readonly ExecutionSubjectV3[];
  readonly initialRelationships: readonly MountedOnRelationshipStateV1[];
  readonly camera: ExecutionCameraV5;
  readonly resourceUsage: Readonly<{
    vertices: number;
    triangles: number;
    colliders: number;
  }>;
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

const EXECUTION_PLAN_V5_FIELDS = [
  "kind",
  "schemaVersion",
  "id",
  "seed",
  "runtimeBackend",
  "normalizedWorldIrHash",
  "resourceLockHash",
  "coordinateSystem",
  "gravityMetersPerSecondSquaredXYZ",
  "atmospherePreset",
  "terrain",
  "waters",
  "objects",
  "subjectAssets",
  "rigProfiles",
  "animationSets",
  "colliderProfiles",
  "initialControlledEntityId",
  "subjects",
  "initialRelationships",
  "camera",
  "resourceUsage",
  "layout",
  "authoringSpecHash",
  "resourceLockEntries",
  "traversal",
  "staticColliders",
] as const;

function invalidExecutionPlanV5(): never {
  throw new TypeError("EXECUTION_PLAN_V5_INVALID");
}

function snapshotExecutionPlanData(input: unknown): unknown {
  if (isNil(input)) return invalidExecutionPlanV5();
  if (typeof input === "string" || typeof input === "boolean") return input;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || Object.is(input, -0)) {
      return invalidExecutionPlanV5();
    }
    return input;
  }
  if (Array.isArray(input)) {
    if (
      Reflect.getPrototypeOf(input) !== Array.prototype ||
      Reflect.ownKeys(input).some((key) => typeof key === "symbol") ||
      Object.getOwnPropertyNames(input).length !== input.length + 1
    ) return invalidExecutionPlanV5();
    const snapshot: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
      if (
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return invalidExecutionPlanV5();
      snapshot.push(snapshotExecutionPlanData(descriptor.value));
    }
    return snapshot;
  }
  if (typeof input !== "object" || isNil(input)) {
    return invalidExecutionPlanV5();
  }
  const prototype = Reflect.getPrototypeOf(input);
  if (prototype !== Object.prototype) {
    return invalidExecutionPlanV5();
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (
      typeof key !== "string" ||
      isNil(descriptor) ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      isNil(descriptor.value)
    ) return invalidExecutionPlanV5();
    snapshot[key] = snapshotExecutionPlanData(descriptor.value);
  }
  return snapshot;
}

function dataRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalidExecutionPlanV5();
  }
  return input as Record<string, unknown>;
}

function exactDataRecord(
  input: unknown,
  requiredFields: readonly string[],
  optionalFields: readonly string[] = [],
): Record<string, unknown> {
  const record = dataRecord(input);
  const keys = Object.keys(record);
  if (
    requiredFields.some((field) => !Object.hasOwn(record, field)) ||
    keys.some((field) =>
      !requiredFields.includes(field) && !optionalFields.includes(field)
    )
  ) return invalidExecutionPlanV5();
  return record;
}

function dataArray(input: unknown): unknown[] {
  if (!Array.isArray(input)) return invalidExecutionPlanV5();
  return input;
}

function requireString(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) {
    return invalidExecutionPlanV5();
  }
  return input;
}

function requireHash(input: unknown): `sha256:${string}` {
  if (
    typeof input !== "string" ||
    !EXECUTION_RESOURCE_HASH_PATTERN_V1.test(input)
  ) return invalidExecutionPlanV5();
  return input as `sha256:${string}`;
}

function requireFinite(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return invalidExecutionPlanV5();
  }
  return input;
}

function requireSafeNonNegativeInteger(input: unknown): number {
  if (
    typeof input !== "number" ||
    !Number.isSafeInteger(input) ||
    input < 0
  ) return invalidExecutionPlanV5();
  return input;
}

function requireSafePositiveInteger(input: unknown): number {
  if (
    typeof input !== "number" ||
    !Number.isSafeInteger(input) ||
    input <= 0
  ) return invalidExecutionPlanV5();
  return input;
}

function requireBoolean(input: unknown): boolean {
  if (typeof input !== "boolean") return invalidExecutionPlanV5();
  return input;
}

function requireLiteral<Value extends string | number | boolean>(
  input: unknown,
  values: readonly Value[],
): Value {
  if (!values.includes(input as Value)) return invalidExecutionPlanV5();
  return input as Value;
}

function requireTuple(input: unknown, length: number): readonly number[] {
  const values = dataArray(input);
  if (values.length !== length) return invalidExecutionPlanV5();
  values.forEach(requireFinite);
  return values as readonly number[];
}

function requireStringArray(input: unknown): void {
  dataArray(input).forEach(requireString);
}

function requireBipedBoneId(input: unknown): BipedBoneIdV1 {
  if (!isBipedBoneIdV1(input)) return invalidExecutionPlanV5();
  return input;
}

function requireGroundHumanoidActionId(
  input: unknown,
): GroundHumanoidActionIdV1 {
  if (!isGroundHumanoidActionIdV1(input)) return invalidExecutionPlanV5();
  return input;
}

function requireSubjectBodyTopology(input: unknown): SubjectBodyTopologyV2 {
  if (!isSubjectBodyTopologyV2(input)) return invalidExecutionPlanV5();
  return input;
}

function validateTransform(input: unknown): void {
  const value = exactDataRecord(input, [
    "positionMetersXYZ",
    "rotationEulerRadiansXYZ",
    "scaleXYZ",
  ]);
  requireTuple(value.positionMetersXYZ, 3);
  requireTuple(value.rotationEulerRadiansXYZ, 3);
  requireTuple(value.scaleXYZ, 3);
}

function validatePrimitive(
  input: unknown,
  allowedKinds: readonly ("box" | "sphere" | "cylinder" | "cone" | "capsule")[],
): void {
  const value = dataRecord(input);
  const kind = requireLiteral(value.kind, allowedKinds);
  if (kind === "box") {
    const box = exactDataRecord(value, ["kind", "sizeMetersXYZ"]);
    requireTuple(box.sizeMetersXYZ, 3);
  } else if (kind === "sphere") {
    requireFinite(exactDataRecord(value, ["kind", "radiusMeters"]).radiusMeters);
  } else {
    const cylinder = exactDataRecord(value, [
      "kind",
      "radiusMeters",
      "heightMeters",
    ]);
    requireFinite(cylinder.radiusMeters);
    requireFinite(cylinder.heightMeters);
  }
}

function validateTerrain(input: unknown): void {
  const value = exactDataRecord(input, [
    "entityId",
    "centerMetersXZ",
    "sizeMetersXZ",
    "resolutionCellsXZ",
    "heightSamplesMeters",
    "heightSamplesHash",
    "minimumHeightMeters",
    "maximumHeightMeters",
    "semanticClassId",
  ]);
  requireString(value.entityId);
  requireTuple(value.centerMetersXZ, 2);
  requireTuple(value.sizeMetersXZ, 2);
  const resolution = requireTuple(value.resolutionCellsXZ, 2)
    .map(requireSafePositiveInteger);
  const heightSamplesMeters = dataArray(value.heightSamplesMeters)
    .map(requireFinite);
  if (
    heightSamplesMeters.length !== resolution[0]! * resolution[1]! ||
    requireHash(value.heightSamplesHash) !== sha256CanonicalJson(heightSamplesMeters)
  ) return invalidExecutionPlanV5();
  const minimumHeightMeters = heightSamplesMeters.reduce(
    (minimum, sample) => Math.min(minimum, sample),
    Number.POSITIVE_INFINITY,
  );
  const maximumHeightMeters = heightSamplesMeters.reduce(
    (maximum, sample) => Math.max(maximum, sample),
    Number.NEGATIVE_INFINITY,
  );
  if (
    requireFinite(value.minimumHeightMeters) !== minimumHeightMeters ||
    requireFinite(value.maximumHeightMeters) !== maximumHeightMeters ||
    minimumHeightMeters > maximumHeightMeters
  ) return invalidExecutionPlanV5();
  requireString(value.semanticClassId);
}

function validateWater(input: unknown): void {
  const value = exactDataRecord(input, [
    "entityId",
    "terrainEntityId",
    "boundary",
    "depthMeters",
    "shoreWidthMeters",
    "waterLevelMeters",
    "traversalMode",
    "semanticClassId",
  ]);
  requireString(value.entityId);
  requireString(value.terrainEntityId);
  const boundary = dataRecord(value.boundary);
  const kind = requireLiteral(boundary.kind, ["circle", "ellipse", "polygon"]);
  if (kind === "circle") {
    const circle = exactDataRecord(boundary, ["kind", "centerMetersXZ", "radiusMeters"]);
    requireTuple(circle.centerMetersXZ, 2);
    requireFinite(circle.radiusMeters);
  } else if (kind === "ellipse") {
    const ellipse = exactDataRecord(boundary, ["kind", "centerMetersXZ", "radiusMetersXZ"]);
    requireTuple(ellipse.centerMetersXZ, 2);
    requireTuple(ellipse.radiusMetersXZ, 2);
  } else {
    const polygon = exactDataRecord(boundary, ["kind", "pointsMetersXZ"]);
    dataArray(polygon.pointsMetersXZ).forEach((point) => requireTuple(point, 2));
  }
  requireFinite(value.depthMeters);
  requireFinite(value.shoreWidthMeters);
  requireFinite(value.waterLevelMeters);
  requireLiteral(value.traversalMode, ["blocked", "swimmable", "walkable"]);
  requireString(value.semanticClassId);
}

function validateObject(input: unknown): void {
  const value = exactDataRecord(input, [
    "entityId",
    "prototypeId",
    "primitive",
    "transform",
    "collisionEnabled",
    "semanticClassId",
  ]);
  requireString(value.entityId);
  requireString(value.prototypeId);
  validatePrimitive(value.primitive, ["box", "sphere", "cylinder", "cone"]);
  validateTransform(value.transform);
  requireBoolean(value.collisionEnabled);
  requireString(value.semanticClassId);
}

function validateSubjectAsset(input: unknown): void {
  const value = exactDataRecord(input, [
    "subjectAssetRef",
    "artifactContentHash",
    "byteLength",
    "mediaType",
    "format",
    "inventory",
  ]);
  requireString(value.subjectAssetRef);
  requireHash(value.artifactContentHash);
  requireSafeNonNegativeInteger(value.byteLength);
  requireLiteral(value.mediaType, ["model/gltf-binary"]);
  requireLiteral(value.format, ["glb"]);
  const inventory = exactDataRecord(value.inventory, [
    "meshCount",
    "vertexCount",
    "triangleCount",
    "skeletonCount",
    "boneCount",
    "animationClipNames",
  ]);
  [
    inventory.meshCount,
    inventory.vertexCount,
    inventory.triangleCount,
    inventory.skeletonCount,
    inventory.boneCount,
  ].forEach(requireSafeNonNegativeInteger);
  requireStringArray(inventory.animationClipNames);
}

function validateRigProfile(input: unknown): void {
  const value = exactDataRecord(input, [
    "rigProfileRef",
    "bodyTopology",
    "skeletonRootBoneName",
    "requiredBoneIds",
    "sourceNodeNameByBoneId",
  ]);
  requireString(value.rigProfileRef);
  requireLiteral(value.bodyTopology, ["biped"]);
  requireString(value.skeletonRootBoneName);
  dataArray(value.requiredBoneIds).forEach(requireBipedBoneId);
  Object.entries(dataRecord(value.sourceNodeNameByBoneId)).forEach(
    ([boneId, sourceNodeName]) => {
      requireBipedBoneId(boneId);
      requireString(sourceNodeName);
    },
  );
}

function validateAnimationSet(input: unknown): void {
  const value = exactDataRecord(input, [
    "animationSetRef",
    "subjectAssetRef",
    "rigProfileRef",
    "defaultActionId",
    "requiredActionIds",
    "animationBindings",
  ]);
  requireString(value.animationSetRef);
  requireString(value.subjectAssetRef);
  requireString(value.rigProfileRef);
  requireGroundHumanoidActionId(value.defaultActionId);
  dataArray(value.requiredActionIds).forEach(requireGroundHumanoidActionId);
  dataArray(value.animationBindings).forEach((binding) => {
    const row = exactDataRecord(binding, [
      "actionId",
      "sourceClipName",
      "loopMode",
      "playbackSpeedRatio",
      "blendDurationSeconds",
      "rootMotionMode",
    ]);
    requireGroundHumanoidActionId(row.actionId);
    requireString(row.sourceClipName);
    requireLiteral(row.loopMode, ["repeat", "once"]);
    requireFinite(row.playbackSpeedRatio);
    requireFinite(row.blendDurationSeconds);
    requireLiteral(row.rootMotionMode, ["in-place"]);
  });
}

function validateColliderProfile(input: unknown): void {
  const value = exactDataRecord(input, [
    "colliderProfileRef",
    "supportedBodyTopologies",
    "collider",
  ]);
  requireString(value.colliderProfileRef);
  dataArray(value.supportedBodyTopologies).forEach(requireSubjectBodyTopology);
  const collider = exactDataRecord(value.collider, [
    "kind",
    "radiusMeters",
    "heightMeters",
    "centerOffsetFromSubjectOriginMetersXYZ",
  ]);
  requireLiteral(collider.kind, ["capsule"]);
  requireFinite(collider.radiusMeters);
  requireFinite(collider.heightMeters);
  requireTuple(collider.centerOffsetFromSubjectOriginMetersXYZ, 3);
}

function validateMotionProfile(input: unknown): void {
  const value = exactDataRecord(input, [
    "resourceRef",
    "contentHash",
    "motionKernelRef",
    "motionTags",
  ]);
  requireString(value.resourceRef);
  requireHash(value.contentHash);
  requireString(value.motionKernelRef);
  requireStringArray(value.motionTags);
}

function validateCameraRigParameters(input: unknown, partial: boolean): void {
  const value = dataRecord(input);
  const keys = Object.keys(value);
  if (
    keys.some((key) =>
      !CAMERA_RIG_PARAMETER_NAMES_V1.includes(key as CameraRigParameterNameV1)
    ) ||
    (!partial && keys.length !== CAMERA_RIG_PARAMETER_NAMES_V1.length) ||
    (!partial && CAMERA_RIG_PARAMETER_NAMES_V1.some((key) => !Object.hasOwn(value, key)))
  ) return invalidExecutionPlanV5();
  Object.values(value).forEach(requireFinite);
}

function validateCameraContextRule(input: unknown): void {
  const value = exactDataRecord(
    input,
    ["id", "priority", "when"],
    ["cameraRigProfileRef", "cameraModifierRefs"],
  );
  requireString(value.id);
  requireFinite(value.priority);
  const when = exactDataRecord(value.when, [], [
    "relationshipRoles",
    "motionKernelRefs",
    "requiredMotionTags",
    "movementMediums",
    "minimumSpeedMetersPerSecond",
    "maximumSpeedMetersPerSecond",
    "requiredSocketIds",
    "requiredCameraContextTags",
  ]);
  for (const key of [
    "relationshipRoles",
    "motionKernelRefs",
    "requiredMotionTags",
    "movementMediums",
    "requiredSocketIds",
    "requiredCameraContextTags",
  ]) {
    if (Object.hasOwn(when, key)) requireStringArray(when[key]);
  }
  if (Object.hasOwn(when, "minimumSpeedMetersPerSecond")) {
    requireFinite(when.minimumSpeedMetersPerSecond);
  }
  if (Object.hasOwn(when, "maximumSpeedMetersPerSecond")) {
    requireFinite(when.maximumSpeedMetersPerSecond);
  }
  if (Object.hasOwn(value, "cameraRigProfileRef")) {
    requireString(value.cameraRigProfileRef);
  }
  if (Object.hasOwn(value, "cameraModifierRefs")) {
    requireStringArray(value.cameraModifierRefs);
  }
}

function validateCapabilityAssembly(input: unknown): void {
  const value = exactDataRecord(input, [
    "authoringAvailability",
    "physicsBodyProfileRef",
    "locomotionProfileRef",
    "defaultMotionProfile",
    "optionalMotionProfiles",
    "fallbackMotionProfile",
    "motionKernels",
    "controlProfile",
    "cameraContext",
    "mediumProfile",
    "relationshipProfiles",
    "harnessProfileRef",
    "requiredHarnessCheckIds",
    "actionOrPoseSetRef",
    "renderBindingProfileRef",
  ]);
  requireLiteral(value.authoringAvailability, [
    "recommended",
    "advanced",
    "experimental",
  ]);
  requireString(value.physicsBodyProfileRef);
  requireString(value.locomotionProfileRef);
  validateMotionProfile(value.defaultMotionProfile);
  dataArray(value.optionalMotionProfiles).forEach(validateMotionProfile);
  validateMotionProfile(value.fallbackMotionProfile);
  dataArray(value.motionKernels).forEach((kernel) => {
    const row = exactDataRecord(kernel, [
      "resourceRef",
      "implementationId",
      "commandKind",
      "supportedMediums",
      "fallbackMotionProfileRef",
      "deterministic",
    ]);
    requireString(row.resourceRef);
    requireLiteral(row.implementationId, [
      "free-ground",
      "forward-steer",
      "wheeled-arcade",
      "surface-slide",
      "water-surface",
      "unpowered-glide",
    ]);
    requireLiteral(row.commandKind, [
      "planar-vector",
      "throttle-steer",
      "flight-attitude",
      "none",
    ]);
    requireStringArray(row.supportedMediums);
    requireString(row.fallbackMotionProfileRef);
    requireLiteral(row.deterministic, [true]);
  });
  const control = exactDataRecord(value.controlProfile, [
    "resourceRef",
    "contentHash",
    "commandKind",
    "inputSpace",
    "facingPolicy",
    "lateralMovementPolicy",
    "moveDeadzoneRatio",
  ]);
  requireString(control.resourceRef);
  requireHash(control.contentHash);
  requireLiteral(control.commandKind, [
    "planar-vector",
    "throttle-steer",
    "flight-attitude",
    "none",
  ]);
  requireLiteral(control.inputSpace, [
    "camera-relative",
    "subject-local",
    "flight-frame",
    "none",
  ]);
  requireLiteral(control.facingPolicy, [
    "align-to-move",
    "align-to-view",
    "steering-derived",
    "flight-derived",
    "fixed",
  ]);
  requireLiteral(control.lateralMovementPolicy, ["allowed", "forbidden"]);
  requireFinite(control.moveDeadzoneRatio);

  const camera = exactDataRecord(value.cameraContext, [
    "resourceRef",
    "defaultCameraRigProfileRef",
    "rules",
    "cameraRigProfiles",
    "cameraModifierProfiles",
  ], ["firstPersonCameraRigProfileRef"]);
  requireString(camera.resourceRef);
  requireString(camera.defaultCameraRigProfileRef);
  if (Object.hasOwn(camera, "firstPersonCameraRigProfileRef")) {
    requireString(camera.firstPersonCameraRigProfileRef);
  }
  dataArray(camera.rules).forEach(validateCameraContextRule);
  dataArray(camera.cameraRigProfiles).forEach((profile) => {
    const row = exactDataRecord(profile, [
      "resourceRef",
      "contentHash",
      "baseMode",
      "algorithmRef",
      "headingSource",
      "reverseHeadingPolicy",
      "recenterMode",
      "preferredSocketIds",
      "parameters",
    ], ["authoringRanges"]);
    requireString(row.resourceRef);
    requireHash(row.contentHash);
    requireLiteral(row.baseMode, [
      "first-person",
      "free-orbit",
      "stable-follow",
      "speed-chase",
      "flight-horizon",
    ]);
    requireString(row.algorithmRef);
    requireLiteral(row.headingSource, ["view", "target-forward", "target-velocity"]);
    requireLiteral(row.reverseHeadingPolicy, [
      "follow-velocity",
      "preserve-target-forward",
    ]);
    requireLiteral(row.recenterMode, ["off", "forward-motion", "always"]);
    requireStringArray(row.preferredSocketIds);
    validateCameraRigParameters(row.parameters, false);
    if (Object.hasOwn(row, "authoringRanges")) {
      const ranges = dataRecord(row.authoringRanges);
      for (const [key, range] of Object.entries(ranges)) {
        if (!CAMERA_RIG_PARAMETER_NAMES_V1.includes(key as CameraRigParameterNameV1)) {
          return invalidExecutionPlanV5();
        }
        const bounds = exactDataRecord(range, ["minimum", "maximum", "step"]);
        requireFinite(bounds.minimum);
        requireFinite(bounds.maximum);
        requireFinite(bounds.step);
      }
    }
  });
  dataArray(camera.cameraModifierProfiles).forEach((profile) => {
    const row = exactDataRecord(profile, [
      "resourceRef",
      "parameterOverrides",
    ], [
      "headingSourceOverride",
      "reverseHeadingPolicyOverride",
      "recenterModeOverride",
    ]);
    requireString(row.resourceRef);
    validateCameraRigParameters(row.parameterOverrides, true);
    if (Object.hasOwn(row, "headingSourceOverride")) {
      requireLiteral(row.headingSourceOverride, ["view", "target-forward", "target-velocity"]);
    }
    if (Object.hasOwn(row, "reverseHeadingPolicyOverride")) {
      requireLiteral(row.reverseHeadingPolicyOverride, [
        "follow-velocity",
        "preserve-target-forward",
      ]);
    }
    if (Object.hasOwn(row, "recenterModeOverride")) {
      requireLiteral(row.recenterModeOverride, ["off", "forward-motion", "always"]);
    }
  });
  const medium = exactDataRecord(value.mediumProfile, ["resourceRef", "air"]);
  requireString(medium.resourceRef);
  const air = exactDataRecord(medium.air, ["gravityRatio", "linearDragPerSecond"]);
  requireFinite(air.gravityRatio);
  requireFinite(air.linearDragPerSecond);
  dataArray(value.relationshipProfiles).forEach((profile) => {
    const source = dataRecord(profile);
    const relationshipType = requireLiteral(source.relationshipType, [
      "mountedOn",
      "seat",
      "tether",
    ]);
    if (relationshipType === "mountedOn") {
      const row = exactDataRecord(profile, [
        "resourceRef",
        "relationshipType",
        "requiredRiderSocketIds",
        "requiredMountSocketIds",
        "controlTransferMode",
        "cameraTargetRole",
      ], ["maximumMountDistanceMeters"]);
      requireString(row.resourceRef);
      requireStringArray(row.requiredRiderSocketIds);
      requireStringArray(row.requiredMountSocketIds);
      requireLiteral(row.controlTransferMode, ["keep-rider", "to-mount", "none"]);
      requireLiteral(row.cameraTargetRole, ["controlled-entity", "rider", "mount"]);
      if (Object.hasOwn(row, "maximumMountDistanceMeters")) {
        requireFinite(row.maximumMountDistanceMeters);
      }
      return;
    }
    const row = relationshipType === "seat"
      ? exactDataRecord(profile, [
          "resourceRef",
          "relationshipType",
          "requiredOccupantSocketIds",
          "requiredSeatSocketIds",
        ])
      : exactDataRecord(profile, [
          "resourceRef",
          "relationshipType",
          "requiredTetheredSocketIds",
          "requiredTetherAnchorSocketIds",
        ]);
    requireString(row.resourceRef);
    if (relationshipType === "seat") {
      requireStringArray(row.requiredOccupantSocketIds);
      requireStringArray(row.requiredSeatSocketIds);
    } else {
      requireStringArray(row.requiredTetheredSocketIds);
      requireStringArray(row.requiredTetherAnchorSocketIds);
    }
  });
  requireString(value.harnessProfileRef);
  requireStringArray(value.requiredHarnessCheckIds);
  requireString(value.actionOrPoseSetRef);
  requireString(value.renderBindingProfileRef);
}

function validateSubject(input: unknown): void {
  const value = exactDataRecord(input, [
    "entityId",
    "subjectDefinitionRef",
    "subjectDefinitionHash",
    "bodyTopology",
    "semanticClassId",
    "spawnAnchorEntityId",
    "spawnSubjectOriginPositionMetersXYZ",
    "spawnSubjectFacingRadians",
    "forwardDirection",
    "visualParts",
    "visualBinding",
    "sockets",
    "mountSlots",
    "collider",
    "locomotion",
    "locomotionCapabilityRef",
    "locomotionCapabilityHash",
    "physicsBodyProfileRef",
    "locomotionProfileRef",
    "controlFeel",
    "availableControlFeels",
    "capabilityAssembly",
  ]);
  requireString(value.entityId);
  requireString(value.subjectDefinitionRef);
  requireHash(value.subjectDefinitionHash);
  requireSubjectBodyTopology(value.bodyTopology);
  requireString(value.semanticClassId);
  requireString(value.spawnAnchorEntityId);
  requireTuple(value.spawnSubjectOriginPositionMetersXYZ, 3);
  requireFinite(value.spawnSubjectFacingRadians);
  requireLiteral(value.forwardDirection, ["-z"]);
  let assetPartCount = 0;
  dataArray(value.visualParts).forEach((part) => {
    const row = dataRecord(part);
    const kind = requireLiteral(row.kind, ["primitive", "asset"]);
    if (kind === "primitive") {
      const primitive = exactDataRecord(row, [
        "id",
        "kind",
        "shape",
        "localTransform",
        "semanticTags",
      ]);
      requireString(primitive.id);
      validatePrimitive(primitive.shape, ["box", "sphere", "cylinder", "capsule"]);
      const transform = exactDataRecord(primitive.localTransform, [
        "positionMetersXYZ",
        "rotationEulerRadiansXYZ",
      ]);
      requireTuple(transform.positionMetersXYZ, 3);
      requireTuple(transform.rotationEulerRadiansXYZ, 3);
      requireStringArray(primitive.semanticTags);
    } else {
      assetPartCount += 1;
      const asset = exactDataRecord(row, [
        "id",
        "kind",
        "subjectAssetRef",
        "localTransform",
        "appearance",
        "semanticTags",
      ]);
      requireString(asset.id);
      requireString(asset.subjectAssetRef);
      validateTransform(asset.localTransform);
      requireLiteral(exactDataRecord(asset.appearance, ["mode"]).mode, [
        "whitebox-neutral",
      ]);
      requireStringArray(asset.semanticTags);
    }
  });
  const visualBinding = dataRecord(value.visualBinding);
  const bindingMode = requireLiteral(visualBinding.mode, ["static", "rigged"]);
  if (bindingMode === "static") {
    exactDataRecord(visualBinding, ["mode"]);
    if (assetPartCount > 1) return invalidExecutionPlanV5();
  } else {
    if (assetPartCount !== 1) return invalidExecutionPlanV5();
    const rigged = exactDataRecord(visualBinding, [
      "mode",
      "rigProfileRef",
      "animationSetRef",
    ]);
    requireString(rigged.rigProfileRef);
    requireString(rigged.animationSetRef);
  }
  const socketIds = new Set<string>();
  dataArray(value.sockets).forEach((socket) => {
    const row = dataRecord(socket);
    const kind = requireLiteral(row.kind, ["local", "bone"]);
    const socketValue = kind === "local"
      ? exactDataRecord(row, ["id", "kind", "localTransform", "semanticTags"])
      : exactDataRecord(row, ["id", "kind", "boneId", "offsetTransform", "semanticTags"]);
    const socketId = requireString(socketValue.id);
    if (socketIds.has(socketId)) return invalidExecutionPlanV5();
    socketIds.add(socketId);
    requireStringArray(socketValue.semanticTags);
    if (kind === "local") {
      const transform = exactDataRecord(socketValue.localTransform, [
        "positionMetersXYZ",
        "rotationEulerRadiansXYZ",
      ]);
      requireTuple(transform.positionMetersXYZ, 3);
      requireTuple(transform.rotationEulerRadiansXYZ, 3);
    } else {
      requireBipedBoneId(socketValue.boneId);
      const transform = exactDataRecord(socketValue.offsetTransform, [
        "positionMetersXYZ",
        "rotationEulerRadiansXYZ",
      ]);
      requireTuple(transform.positionMetersXYZ, 3);
      requireTuple(transform.rotationEulerRadiansXYZ, 3);
    }
  });
  const mountSlotIds = new Set<string>();
  dataArray(value.mountSlots).forEach((slot) => {
    const row = exactDataRecord(slot, [
      "id",
      "kind",
      "mode",
      "mountSocketId",
      "riderSubjectOriginOffsetMetersXYZ",
      "dismountCandidateOffsetsMetersXYZ",
    ]);
    const mountSlotId = requireString(row.id);
    if (mountSlotIds.has(mountSlotId)) return invalidExecutionPlanV5();
    mountSlotIds.add(mountSlotId);
    requireLiteral(row.kind, ["mount-slot"]);
    requireLiteral(row.mode, ["stand"]);
    const mountSocketId = requireString(row.mountSocketId);
    if (!socketIds.has(mountSocketId)) return invalidExecutionPlanV5();
    requireTuple(row.riderSubjectOriginOffsetMetersXYZ, 3);
    const dismountCandidateOffsets = dataArray(
      row.dismountCandidateOffsetsMetersXYZ,
    );
    if (dismountCandidateOffsets.length < 1 || dismountCandidateOffsets.length > 8) {
      return invalidExecutionPlanV5();
    }
    dismountCandidateOffsets.forEach((offset) => requireTuple(offset, 3));
  });
  const collider = exactDataRecord(value.collider, [
    "kind",
    "radiusMeters",
    "heightMeters",
    "centerOffsetFromSubjectOriginMetersXYZ",
    "massKilograms",
    "maxSlopeDegrees",
    "maxStepHeightMeters",
  ]);
  requireLiteral(collider.kind, ["capsule"]);
  requireFinite(collider.radiusMeters);
  requireFinite(collider.heightMeters);
  requireTuple(collider.centerOffsetFromSubjectOriginMetersXYZ, 3);
  requireFinite(collider.massKilograms);
  requireFinite(collider.maxSlopeDegrees);
  requireFinite(collider.maxStepHeightMeters);
  const locomotion = exactDataRecord(value.locomotion, [
    "allowWalk",
    "allowRun",
    "allowJump",
  ]);
  requireBoolean(locomotion.allowWalk);
  requireBoolean(locomotion.allowRun);
  requireBoolean(locomotion.allowJump);
  requireString(value.locomotionCapabilityRef);
  requireHash(value.locomotionCapabilityHash);
  requireString(value.physicsBodyProfileRef);
  requireString(value.locomotionProfileRef);
  const validateFeel = (inputValue: unknown): void => {
    const feel = exactDataRecord(inputValue, [
      "resourceRef",
      "contentHash",
      "walkSpeedMetersPerSecond",
      "runSpeedMetersPerSecond",
      "jumpSpeedMetersPerSecond",
      "accelerationMetersPerSecondSquared",
      "decelerationMetersPerSecondSquared",
      "turnRateRadiansPerSecond",
      "moveResponseExponent",
      "airControlRatio",
      "coyoteTimeSeconds",
      "jumpBufferSeconds",
      "variableJumpHoldSeconds",
      "jumpHoldGravityRatio",
      "jumpReleaseGravityRatio",
    ]);
    requireString(feel.resourceRef);
    requireHash(feel.contentHash);
    Object.entries(feel)
      .filter(([key]) => key !== "resourceRef" && key !== "contentHash")
      .forEach(([, number]) => requireFinite(number));
  };
  validateFeel(value.controlFeel);
  dataArray(value.availableControlFeels).forEach(validateFeel);
  validateCapabilityAssembly(value.capabilityAssembly);
}

function validateCamera(input: unknown): void {
  const value = exactDataRecord(input, [
    "cameraEntityId",
    "rigRef",
    "targetEntityId",
    "pitchRadians",
    "distanceMeters",
    "targetHeightMeters",
    "fovDegrees",
    "manualSwitchAllowed",
    "aspectRatio",
  ]);
  requireString(value.cameraEntityId);
  requireLiteral(value.rigRef, ["worldkit://camera/third-person.standard@1"]);
  requireString(value.targetEntityId);
  requireFinite(value.pitchRadians);
  requireFinite(value.distanceMeters);
  requireFinite(value.targetHeightMeters);
  requireFinite(value.fovDegrees);
  requireBoolean(value.manualSwitchAllowed);
  requireFinite(value.aspectRatio);
}

function validateLayoutAssertion(input: unknown): void {
  const value = dataRecord(input);
  const kind = requireLiteral(value.kind, [
    "inside-region",
    "outside-region",
    "distance-range",
    "faces-entity",
    "supported-by",
    "minimum-clearance",
    "within-slope-limit",
    "visible-in-camera-region",
  ]);
  const baseFields = [
    "constraintId",
    "kind",
    "evidenceEntityIds",
    "measurements",
    "tolerances",
  ];
  let required = [...baseFields];
  let optional: string[] = [];
  if (kind === "inside-region" || kind === "outside-region") {
    required.push("entityId", "regionId", "boundaryClearanceMeters");
  } else if (kind === "distance-range") {
    required.push(
      "entityId",
      "referenceEntityId",
      "minimumDistanceMeters",
      "maximumDistanceMeters",
    );
  } else if (kind === "faces-entity") {
    required.push("facingEntityId", "targetEntityId", "maximumAngularDeviationDegrees");
  } else if (kind === "supported-by") {
    required.push(
      "supportedEntityId",
      "supportingEntityId",
      "maximumSupportGapMeters",
      "minimumSupportRatio",
    );
  } else if (kind === "minimum-clearance") {
    required.push("entityId", "clearanceMeters");
    const hasEntities = Object.hasOwn(value, "otherEntityIds");
    const hasClasses = Object.hasOwn(value, "semanticClassIds");
    if (hasEntities === hasClasses) return invalidExecutionPlanV5();
    required.push(hasEntities ? "otherEntityIds" : "semanticClassIds");
  } else if (kind === "within-slope-limit") {
    required.push("terrainEntityId", "maximumSlopeDegrees");
    const hasEntity = Object.hasOwn(value, "entityId");
    const hasRoute = Object.hasOwn(value, "routeId");
    if (hasEntity === hasRoute) return invalidExecutionPlanV5();
    required.push(hasEntity ? "entityId" : "routeId");
  } else {
    required.push(
      "visibleEntityId",
      "cameraEntityId",
      "screenRegionId",
      "minimumVisibleRatio",
      "minimumProjectedAreaRatio",
    );
  }
  const row = exactDataRecord(value, required, optional);
  requireString(row.constraintId);
  requireStringArray(row.evidenceEntityIds);
  Object.values(dataRecord(row.measurements)).forEach((measurement) => {
    if (
      typeof measurement !== "string" &&
      typeof measurement !== "boolean" &&
      (typeof measurement !== "number" || !Number.isFinite(measurement))
    ) return invalidExecutionPlanV5();
  });
  Object.values(dataRecord(row.tolerances)).forEach(requireFinite);
  for (const [key, field] of Object.entries(row)) {
    if (baseFields.includes(key) || key === "kind") continue;
    if (key.endsWith("Ids")) requireStringArray(field);
    else if (key.endsWith("Id")) requireString(field);
    else requireFinite(field);
  }
}

function validateLayout(input: unknown): void {
  const value = exactDataRecord(input, [
    "solverProfileRef",
    "resolvedVersion",
    "solverProfileHash",
    "layoutSolveReportHash",
    "regions",
    "routes",
    "screenRegions",
    "placementsByEntityId",
    "layoutAssertions",
  ]);
  requireString(value.solverProfileRef);
  requireString(value.resolvedVersion);
  requireHash(value.solverProfileHash);
  requireHash(value.layoutSolveReportHash);
  dataArray(value.regions).forEach((region) => {
    const row = exactDataRecord(region, [
      "id",
      "kind",
      "pointsMetersXZ",
      "semanticClassId",
    ], ["minimumHeightMeters", "maximumHeightMeters"]);
    requireString(row.id);
    requireLiteral(row.kind, ["polygon-xz"]);
    dataArray(row.pointsMetersXZ).forEach((point) => requireTuple(point, 2));
    requireString(row.semanticClassId);
    if (Object.hasOwn(row, "minimumHeightMeters")) requireFinite(row.minimumHeightMeters);
    if (Object.hasOwn(row, "maximumHeightMeters")) requireFinite(row.maximumHeightMeters);
  });
  dataArray(value.routes).forEach((route) => {
    const row = exactDataRecord(route, [
      "id",
      "kind",
      "pointsMetersXZ",
      "widthMeters",
      "locomotionProfileRef",
    ]);
    requireString(row.id);
    requireLiteral(row.kind, ["polyline-xz"]);
    dataArray(row.pointsMetersXZ).forEach((point) => requireTuple(point, 2));
    requireFinite(row.widthMeters);
    requireString(row.locomotionProfileRef);
  });
  dataArray(value.screenRegions).forEach((region) => {
    const row = exactDataRecord(region, [
      "id",
      "kind",
      "minimumUv",
      "maximumUv",
    ]);
    requireString(row.id);
    requireLiteral(row.kind, ["rectangle-uv"]);
    requireTuple(row.minimumUv, 2);
    requireTuple(row.maximumUv, 2);
  });
  for (const [entityId, placement] of Object.entries(
    dataRecord(value.placementsByEntityId),
  )) {
    const row = exactDataRecord(placement, [
      "entityId",
      "transform",
      "placementProvenance",
    ]);
    if (requireString(row.entityId) !== entityId) return invalidExecutionPlanV5();
    validateTransform(row.transform);
    const provenance = exactDataRecord(row.placementProvenance, [
      "kind",
      "candidateId",
      "placementConstraintIds",
      "solverProfileRef",
      "layoutSolveReportHash",
    ]);
    requireLiteral(provenance.kind, ["fixed", "solved"]);
    requireString(provenance.candidateId);
    requireStringArray(provenance.placementConstraintIds);
    requireString(provenance.solverProfileRef);
    requireHash(provenance.layoutSolveReportHash);
  }
  dataArray(value.layoutAssertions).forEach(validateLayoutAssertion);
}

function validateTraversalSurface(input: unknown): void {
  const value = dataRecord(input);
  const kind = requireLiteral(value.kind, ["heightfield", "static-collider"]);
  const base = [
    "kind",
    "traversalSurfaceId",
    "surfaceEntityId",
    "colliderSubshapeId",
    "resourceRef",
    "resolvedVersion",
    "resourceHash",
  ];
  const row = kind === "heightfield"
    ? exactDataRecord(value, base)
    : exactDataRecord(value, [
        ...base,
        "logicalSurfaceId",
        "logicalSubshapeId",
        "colliderHash",
        "traversalSurfaceProfileRef",
        "traversalSurfaceProfileResolvedVersion",
        "traversalSurfaceProfileHash",
      ]);
  requireString(row.traversalSurfaceId);
  requireString(row.surfaceEntityId);
  requireString(row.colliderSubshapeId);
  requireString(row.resourceRef);
  requireString(row.resolvedVersion);
  requireHash(row.resourceHash);
  if (kind === "static-collider") {
    requireString(row.logicalSurfaceId);
    requireString(row.logicalSubshapeId);
    requireHash(row.colliderHash);
    requireString(row.traversalSurfaceProfileRef);
    requireString(row.traversalSurfaceProfileResolvedVersion);
    requireHash(row.traversalSurfaceProfileHash);
  }
}

function validateTraversal(input: unknown): void {
  const value = exactDataRecord(input, [
    "surfaces",
    "traversalAreas",
    "connectivityRequirements",
    "anchorEntityIds",
  ]);
  dataArray(value.surfaces).forEach(validateTraversalSurface);
  dataArray(value.traversalAreas).forEach((area) => {
    const row = exactDataRecord(area, [
      "id",
      "kind",
      "pointsMetersXZ",
      "surfaceEntityId",
      "mode",
    ]);
    requireString(row.id);
    requireLiteral(row.kind, ["polygon-xz"]);
    dataArray(row.pointsMetersXZ).forEach((point) => requireTuple(point, 2));
    requireString(row.surfaceEntityId);
    requireLiteral(row.mode, ["blocked"]);
  });
  dataArray(value.connectivityRequirements).forEach((requirement) => {
    const row = exactDataRecord(requirement, [
      "constraintId",
      "kind",
      "traversingEntityId",
      "startAnchorEntityId",
      "destinationAnchorEntityId",
      "routeId",
    ]);
    requireString(row.constraintId);
    requireLiteral(row.kind, ["connected-by-route"]);
    requireString(row.traversingEntityId);
    requireString(row.startAnchorEntityId);
    requireString(row.destinationAnchorEntityId);
    requireString(row.routeId);
  });
  requireStringArray(value.anchorEntityIds);
}

function validateStaticCollider(input: unknown): void {
  const value = exactDataRecord(input, [
    "entityId",
    "logicalSubshapeId",
    "colliderSubshapeId",
    "transform",
    "shape",
    "colliderHash",
  ]);
  requireString(value.entityId);
  requireString(value.logicalSubshapeId);
  requireString(value.colliderSubshapeId);
  validateTransform(value.transform);
  validatePrimitive(value.shape, ["box", "sphere", "cylinder"]);
  requireHash(value.colliderHash);
}

function validateInitialRelationships(
  input: unknown,
  subjectsByEntityId: ReadonlyMap<string, Record<string, unknown>>,
  initialControlledEntityId: string,
): void {
  const relationshipIds = new Set<string>();
  const occupiedRiderEntityIds = new Set<string>();
  const occupiedMountSlotKeys = new Set<string>();
  let previousRelationshipId: string | undefined;

  dataArray(input).forEach((relationship) => {
    const row = exactDataRecord(relationship, [
      "id",
      "type",
      "schemaVersion",
      "riderEntityId",
      "mountEntityId",
      "mountSlotId",
      "establishedSimulationTick",
    ]);
    const id = requireString(row.id);
    if (
      relationshipIds.has(id) ||
      (previousRelationshipId !== undefined && id.localeCompare(previousRelationshipId) <= 0)
    ) return invalidExecutionPlanV5();
    relationshipIds.add(id);
    previousRelationshipId = id;
    requireLiteral(row.type, ["mountedOn"]);
    requireLiteral(row.schemaVersion, [1]);
    const riderEntityId = requireString(row.riderEntityId);
    const mountEntityId = requireString(row.mountEntityId);
    const mountSlotId = requireString(row.mountSlotId);
    if (riderEntityId === mountEntityId) return invalidExecutionPlanV5();
    if (requireSafeNonNegativeInteger(row.establishedSimulationTick) !== 0) {
      return invalidExecutionPlanV5();
    }

    const rider = subjectsByEntityId.get(riderEntityId);
    const mount = subjectsByEntityId.get(mountEntityId);
    if (rider === undefined || mount === undefined) return invalidExecutionPlanV5();
    if (occupiedRiderEntityIds.has(riderEntityId)) return invalidExecutionPlanV5();
    occupiedRiderEntityIds.add(riderEntityId);
    const mountSlotKey = `${mountEntityId}\u0000${mountSlotId}`;
    if (occupiedMountSlotKeys.has(mountSlotKey)) return invalidExecutionPlanV5();
    occupiedMountSlotKeys.add(mountSlotKey);
    if (initialControlledEntityId !== mountEntityId) return invalidExecutionPlanV5();

    const mountSlot = dataArray(mount.mountSlots)
      .map(dataRecord)
      .find((slot) => slot.id === mountSlotId);
    if (mountSlot === undefined) return invalidExecutionPlanV5();
    const mountSocketId = requireString(mountSlot.mountSocketId);

    const relationshipProfile = dataArray(
      dataRecord(mount.capabilityAssembly).relationshipProfiles,
    )
      .map(dataRecord)
      .find((profile) =>
        profile.resourceRef ===
          "worldkit://relationship-profile/mounted-on.stand-ground@1" &&
        profile.relationshipType === "mountedOn"
      );
    if (relationshipProfile === undefined) return invalidExecutionPlanV5();
    const requiredRiderSocketIds = dataArray(
      relationshipProfile.requiredRiderSocketIds,
    ).map(requireString);
    const requiredMountSocketIds = dataArray(
      relationshipProfile.requiredMountSocketIds,
    ).map(requireString);
    const riderSocketIds = new Set(
      dataArray(rider.sockets).map((socket) => requireString(dataRecord(socket).id)),
    );
    const mountSocketIds = new Set(
      dataArray(mount.sockets).map((socket) => requireString(dataRecord(socket).id)),
    );
    if (
      requiredRiderSocketIds.some((socketId) => !riderSocketIds.has(socketId)) ||
      requiredMountSocketIds.some((socketId) => !mountSocketIds.has(socketId)) ||
      !requiredMountSocketIds.includes(mountSocketId)
    ) return invalidExecutionPlanV5();
  });
}

function deepFreezeExecutionPlan<Value>(value: Value): Value {
  if (typeof value !== "object" || isNil(value) || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value as Record<string, unknown>).forEach(deepFreezeExecutionPlan);
  return Object.freeze(value);
}

export function parseExecutionPlanV5(input: unknown): ExecutionPlanV5 {
  try {
    const snapshot = snapshotExecutionPlanData(input);
    const plan = exactDataRecord(snapshot, EXECUTION_PLAN_V5_FIELDS);
    requireLiteral(plan.kind, ["worldkit-execution-plan"]);
    requireLiteral(plan.schemaVersion, [5]);
    requireString(plan.id);
    requireSafeNonNegativeInteger(plan.seed);
    requireLiteral(plan.runtimeBackend, ["babylon-havok"]);
    requireHash(plan.normalizedWorldIrHash);
    requireHash(plan.resourceLockHash);
    requireLiteral(plan.coordinateSystem, [
      "right-handed-y-up-minus-z-forward",
    ]);
    requireTuple(plan.gravityMetersPerSecondSquaredXYZ, 3);
    requireLiteral(plan.atmospherePreset, [
      "clear-day",
      "golden-hour",
      "overcast",
      "night",
    ]);
    validateTerrain(plan.terrain);
    dataArray(plan.waters).forEach(validateWater);
    dataArray(plan.objects).forEach(validateObject);
    dataArray(plan.subjectAssets).forEach(validateSubjectAsset);
    dataArray(plan.rigProfiles).forEach(validateRigProfile);
    dataArray(plan.animationSets).forEach(validateAnimationSet);
    dataArray(plan.colliderProfiles).forEach(validateColliderProfile);
    const initialControlledEntityId = requireString(
      plan.initialControlledEntityId,
    );
    const subjectEntityIds = new Set<string>();
    const subjectsByEntityId = new Map<string, Record<string, unknown>>();
    dataArray(plan.subjects).forEach((subject) => {
      validateSubject(subject);
      const entityId = requireString(dataRecord(subject).entityId);
      if (subjectEntityIds.has(entityId)) return invalidExecutionPlanV5();
      subjectEntityIds.add(entityId);
      subjectsByEntityId.set(entityId, dataRecord(subject));
    });
    if (!subjectEntityIds.has(initialControlledEntityId)) {
      return invalidExecutionPlanV5();
    }
    validateInitialRelationships(
      plan.initialRelationships,
      subjectsByEntityId,
      initialControlledEntityId,
    );
    validateCamera(plan.camera);
    if (
      !subjectEntityIds.has(
        requireString(dataRecord(plan.camera).targetEntityId),
      )
    ) return invalidExecutionPlanV5();
    const usage = exactDataRecord(plan.resourceUsage, [
      "vertices",
      "triangles",
      "colliders",
    ]);
    requireSafeNonNegativeInteger(usage.vertices);
    requireSafeNonNegativeInteger(usage.triangles);
    requireSafeNonNegativeInteger(usage.colliders);
    validateLayout(plan.layout);
    requireHash(plan.authoringSpecHash);
    const resourceLockEntries = canonicalExecutionResourceLockEntriesV1(
      plan.resourceLockEntries,
    );
    if (
      sha256CanonicalJson(resourceLockEntries) !== plan.resourceLockHash
    ) return invalidExecutionPlanV5();
    plan.resourceLockEntries = resourceLockEntries;
    validateTraversal(plan.traversal);
    dataArray(plan.staticColliders).forEach(validateStaticCollider);
    return deepFreezeExecutionPlan(plan) as unknown as ExecutionPlanV5;
  } catch {
    return invalidExecutionPlanV5();
  }
}

export function hashExecutionPlanV5(input: unknown): `sha256:${string}` {
  return sha256CanonicalJson(parseExecutionPlanV5(input)) as `sha256:${string}`;
}

export interface CompileWorldResultV5 {
  readonly ok: boolean;
  readonly executionPlan?: ExecutionPlanV5;
  readonly executionPlanHash?: string;
  readonly diagnostics: readonly CompileDiagnostic[];
}
