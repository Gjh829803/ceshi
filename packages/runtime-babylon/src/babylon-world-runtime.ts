import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import {
  PhysicsShapeBox,
  PhysicsShapeMesh,
  type PhysicsShape,
} from "@babylonjs/core/Physics/v2/physicsShape.js";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { CONTROL_CAPTURE_PASS_IDS_V1 } from "@whitebox-world/control-capture";
import {
  parseCameraContextSampleV2,
  type CameraContextSampleV2,
  type CameraViewPreferenceV1,
} from "@whitebox-world/camera";
import {
  EntityRegistryV1,
  RuntimeEntityV1,
} from "@whitebox-world/runtime-framework";
import type {
  GameplayActionStateV1,
  GameplayCapabilityStateV1,
  GameplaySemanticFactV1,
  LocomotionCapabilityStateV2,
  MountedOnRelationshipStateV1,
  SpatialEntityStateV1,
} from "@whitebox-world/gameplay-contracts";
import type { RuntimeWorldAdapterDescriptorV1 } from
  "@whitebox-world/runtime-host";
import type {
  ApplyCameraPreviewRequestV1,
  ApplySubjectPresetTuningRequestV1,
  BabylonNativeSceneContributionV1,
  CameraPreviewStateV1,
  CameraViewInputV1,
  BabylonNativeSceneBootstrapV1,
  BabylonNativeSpawnMarkerContributionV1,
  BabylonNativeStaticColliderContributionV1,
  ControlCaptureCapabilitiesV1,
  ControlCaptureRequestV1,
  ControlInputAxesV2,
  CanonicalSceneLayoutAssertionV1,
  CanonicalSceneLayoutPlacementV1,
  CanonicalSceneExecutionPlanV1,
  CanonicalSceneStaticColliderV1,
  CanonicalSceneWaterBoundaryV1,
  FixedInputV1,
  LocomotionModeV1,
  PublishedMovementMediumV1,
  RenderReadyReceiptV1,
  SemanticInputActionV1,
  SubjectHarnessReportV1,
  SubjectPresetTuningReceiptV1,
  CanonicalSceneVec2V1,
  RuntimeVec3V1,
  ViewTargetSampleV1,
  WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import { hashBabylonNativeSceneContributionV1 } from
  "@whitebox-world/runtime-contracts";
import type { GameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import { parseGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import {
  admitBabylonNativeSceneCandidateV1,
} from "@whitebox-world/native-babylon/host";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type {
  ActionPresentationRegistryV1,
  LocomotionPresentationKeyV1,
  ResolvedActionPresentationV1,
} from "@whitebox-world/subject-actions";
import { createActionPresentationRegistryV1 } from "@whitebox-world/subject-actions";
import {
  emitStaticColliderTriangleMeshV1,
  emitTransformedStaticColliderTriangleMeshV1,
  queryStaticColliderTriangleMeshSupportHeightMetersV1,
} from "@whitebox-world/terrain-surface";
import type { VerifiedBabylonNativeWorldPackageDirectoryV1 } from
  "@whitebox-world/world-package";
import { isEqual, isNil } from "lodash-es";

import "./babylon-shader-bootstrap";
import {
  prepareBabylonNativeRuntimePackageV1,
  type BabylonNativeSceneModuleLoaderV1,
} from "./babylon-native-package-runtime";
import { admitBabylonNativeSurfacesV1 } from
  "./babylon-native-surface-admission";
import { BabylonCharacterEntityV1 } from "./babylon-character-entity";
import { BabylonHavokCameraGeometryQueryV2 } from "./babylon-camera-geometry-query";
import { CameraComponentV1 } from "./camera-component";
import { resolveCameraViewTargetContextV1 } from "./camera-view-target-context";
import { createWhiteboxMaterials } from "./materials";
import { enableHavokPhysics, FIXED_TIME_STEP_SECONDS } from "./physics";
import {
  SpecializedMotionSubjectControllerV1,
  CharacterMovementSubjectControllerV1,
  createCharacterMovementSubjectControllerV1,
  supportsCharacterMovementSubjectV1,
} from "./character-movement-component";
import {
  committedCameraContextFromViewTargetV2,
  type CameraDirectorSnapshotV1,
} from "./camera-director";
import type {
  BabylonCharacterBodyCommittedSupportEvidenceV1,
} from "./babylon-character-body-port";
import { hasForwardControlIntentV1 } from "./control-profile-runtime";
import {
  isSubjectAssetRuntimeErrorV1,
  SubjectAssetCacheV1,
  type SubjectAssetCacheOptionsV1,
  type SubjectAssetResolverV1,
} from "./subject-asset-cache";
import { createSubjectVisual, type SubjectVisual } from "./subject-visual";
import { projectSemanticFactsV1 } from "./semantic-fact-projector";
import {
  createTerrainMesh,
  sampleExecutionTerrainHeight,
} from "./terrain";
import {
  captureBabylonControlFrameV1,
  type BabylonControlCaptureFrameV1,
} from "./control-capture";
import {
  BABYLON_GAMEPLAY_RUNTIME_INTERNAL,
  type BabylonGameplayPossessionTargetV1,
  type BabylonGameplayMountedTransitionV1,
  type BabylonGameplayRuntimeInternalV1,
  type PreparedBabylonGameplayPossessionV1,
} from "./gameplay-runtime-internal";
import {
  BABYLON_TRAVERSAL_RUNTIME_INTERNAL,
  type BabylonTraversalRuntimeInternalV1,
  type StaticCollisionMeshEntryV1,
} from "./traversal-runtime-internal";
import type {
  BabylonPreparedProjectionTransactionV1,
  BabylonRuntimeProjectionV1,
} from "./runtime-projection";
import { GoldenHumanoidPresentationContextProjectionV1 } from
  "./golden-humanoid-presentation-context";
import {
  captureBabylonArtifactViewV1,
  type BabylonArtifactCaptureRequestV1,
  type BabylonArtifactCaptureResultV1,
} from "./artifact-capture";
import {
  createBabylonObjectMeshV1,
  createBabylonWaterMeshV1,
} from "./scene-geometry";
import {
  canonicalizeSignedZero,
  canonicalizeVec3,
} from "./canonical-numbers";
import {
  resolveBabylonNativeRuntimeSubjectsV1,
  resolveBabylonRuntimeSubjectsV1,
  type BabylonRuntimeSubjectV1,
} from "./runtime-subject";
import {
  createBabylonNativeLiveColliderRegistryV1,
  registerBabylonNativeLiveColliderRegistryV1,
  replaceBabylonNativeLiveColliderRegistryV1,
  unregisterBabylonNativeLiveColliderRegistryV1,
  type BabylonNativeLiveColliderRegistryV1,
  type BabylonNativeLiveColliderResidencyEvidenceV1,
} from "./babylon-native-live-collider-registry";
import {
  createBabylonNativeColliderResidencyV1,
  type BabylonNativeColliderResidencyV1,
} from "./native-collider-residency";
import {
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
  materializeBabylonNativeBlockVisualBatchesV1,
  peekBabylonNativeBlockLiveHandleRegistryV1,
} from "@whitebox-world/native-babylon-block-profile/host";

function residencyEvidence(
  residency: BabylonNativeColliderResidencyV1,
): BabylonNativeLiveColliderResidencyEvidenceV1 {
  const metrics = residency.metrics();
  return Object.freeze({
    chunkPolicyHash: residency.chunkPolicyHash,
    partitionHash: residency.partitionHash,
    logicalColliderCount: metrics.logicalColliderCount,
    partCount: metrics.partCount,
    activePartCount: metrics.activePartCount,
    peakActivePartCount: metrics.peakActivePartCount,
  });
}

function committedPresentationFromLocomotionMode(
  committedTick: number,
  locomotionMode: LocomotionModeV1 | "suspended",
): ResolvedActionPresentationV1 {
  const presentationKey: LocomotionPresentationKeyV1 =
    locomotionMode === "airborne"
      ? "locomotion.falling"
      : locomotionMode === "suspended"
        ? "locomotion.suspended"
        : `locomotion.${locomotionMode}`;
  return Object.freeze({
    schemaVersion: 1,
    committedTick,
    source: "locomotion",
    presentationKey,
    layeredMoves: Object.freeze([]),
  });
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectLockedLocalCameraSocketsV1(
  subject: BabylonRuntimeSubjectV1,
  subjectOriginMetersXYZ: RuntimeVec3V1,
  facingYawRadians: number,
): Readonly<Record<string, RuntimeVec3V1>> {
  const subjectOrigin = new Vector3(...subjectOriginMetersXYZ);
  const subjectRotation = Matrix.RotationY(facingYawRadians);
  const socketPositionsMetersXYZById: Record<string, RuntimeVec3V1> = {};
  for (const socket of subject.sockets) {
    if (socket.kind !== "local") continue;
    const worldPosition = Vector3.TransformCoordinates(
      new Vector3(...socket.localTransform.positionMetersXYZ),
      subjectRotation,
    ).addInPlace(subjectOrigin);
    socketPositionsMetersXYZById[socket.id] = Object.freeze([
      canonicalizeSignedZero(worldPosition.x),
      canonicalizeSignedZero(worldPosition.y),
      canonicalizeSignedZero(worldPosition.z),
    ]) as RuntimeVec3V1;
  }
  return Object.freeze(socketPositionsMetersXYZById);
}

function lockedLocalSocketV1(
  subject: BabylonRuntimeSubjectV1,
  socketId: string,
) {
  const socket = subject.sockets.find((candidate) => candidate.id === socketId);
  return socket?.kind === "local" ? socket : undefined;
}

function cameraContextWithLockedLocalSocketsV1(
  subject: BabylonRuntimeSubjectV1,
  context: CameraContextSampleV2,
): CameraContextSampleV2 {
  const centerOffset = subject.collider.centerOffsetFromSubjectOriginMetersXYZ;
  const subjectOriginMetersXYZ = Object.freeze([
    canonicalizeSignedZero(context.subjectPose.positionMetersXYZ[0] - centerOffset[0]),
    canonicalizeSignedZero(context.subjectPose.positionMetersXYZ[1] - centerOffset[1]),
    canonicalizeSignedZero(context.subjectPose.positionMetersXYZ[2] - centerOffset[2]),
  ]) as RuntimeVec3V1;
  return parseCameraContextSampleV2({
    ...context,
    subjectPose: {
      ...context.subjectPose,
      positionMetersXYZ: subjectOriginMetersXYZ,
    },
    environment: {
      ...context.environment,
      socketPositionsMetersXYZById: projectLockedLocalCameraSocketsV1(
        subject,
        subjectOriginMetersXYZ,
        context.subjectPose.facingYawRadians,
      ),
    },
  });
}

export type BabylonWorldRuntimeInitializationStageV1 =
  | "engine"
  | "scene"
  | "havok"
  | "terrain"
  | "native-scene"
  | "subjects"
  | "camera"
  | "ready";

interface BabylonWorldRuntimeCommonOptionsV1 {
  worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  gameplayBootstrap: GameplayBootstrapV1;
  runtimeSessionId?: string;
  canvas?: HTMLCanvasElement;
  engineFactory?: () => AbstractEngine;
  autoStartRenderLoop?: boolean;
  /** Required by headless Node hosts because Node cannot fetch file:// WASM URLs. */
  havokWasmBinary?: ArrayBuffer;
  subjectAssetResolver?: SubjectAssetResolverV1;
  subjectAssetCacheOptions?: SubjectAssetCacheOptionsV1;
  onInitializationStage?(stage: BabylonWorldRuntimeInitializationStageV1): void;
  onNativeSceneAdmission?(admission: Readonly<{
    contribution: BabylonNativeSceneContributionV1;
    contributionHash: `sha256:${string}`;
  }>): void;
}

export type BabylonWorldRuntimeOptions = BabylonWorldRuntimeCommonOptionsV1 &
  Readonly<{
    sceneSource:
      | Readonly<{
          kind: "canonical-execution-plan";
          executionPlan: CanonicalSceneExecutionPlanV1;
        }>
      | Readonly<{
          kind: "babylon-native-scene";
          descriptor: RuntimeWorldAdapterDescriptorV1;
          verifiedWorldPackage:
            VerifiedBabylonNativeWorldPackageDirectoryV1;
          moduleLoader: BabylonNativeSceneModuleLoaderV1;
        }>;
  }>;

export interface PreparedBabylonCameraViewMutationV1 {
  readonly previous: BabylonRuntimeProjectionV1;
  readonly next: BabylonRuntimeProjectionV1;
  commitPrepared(): void;
  rollbackPrepared(): void;
}

type OwnedDisposer = () => void | Promise<void>;

interface BabylonGameplayPublishedStateV1 {
  readonly possessionTarget: BabylonGameplayPossessionTargetV1;
  readonly mountedRelationshipsByRiderEntityId: Readonly<
    Record<string, BabylonMountedRelationshipProjectionV1>
  >;
  readonly semanticFactsById: Readonly<
    Record<string, GameplaySemanticFactV1>
  >;
  readonly viewProjection: ReturnType<
    BabylonGameplayRuntimeInternalV1["readViewProjection"]
  >;
}

interface BabylonMountedRelationshipProjectionV1 {
  readonly relationship: MountedOnRelationshipStateV1;
  readonly riderCollisionFilterMembershipMask: number;
  readonly riderCollisionFilterCollideMask: number;
}

function assertRuntimeSubjectSetV1(
  runtimeSubjects: readonly BabylonRuntimeSubjectV1[],
  initialControlledEntityId: string,
): void {
  if (runtimeSubjects.length === 0) {
    throw new Error("WORLDKIT_RUNTIME_SUBJECTS_EMPTY");
  }
  const subjectEntityIds = new Set<string>();
  for (const subject of runtimeSubjects) {
    if (subject.capabilityAssembly === undefined) {
      throw new Error(
        `WORLDKIT_RUNTIME_CAPABILITY_ASSEMBLY_REQUIRED: ${subject.entityId}`,
      );
    }
    if (subjectEntityIds.has(subject.entityId)) {
      throw new Error(`WORLDKIT_RUNTIME_SUBJECT_DUPLICATE: ${subject.entityId}`);
    }
    subjectEntityIds.add(subject.entityId);
  }
  if (!subjectEntityIds.has(initialControlledEntityId)) {
    throw new Error(
      `WORLDKIT_RUNTIME_CONTROL_TARGET_NOT_FOUND: ${initialControlledEntityId}`,
    );
  }
}

type GameplayFixedTickActionProjectionV1 = Parameters<
  BabylonGameplayRuntimeInternalV1["prepareFixedInputTick"]
>[1];

type BabylonPublishedCameraProjectionV1 = Readonly<{
  director: CameraDirectorSnapshotV1;
  positionMetersXYZ: RuntimeVec3V1;
}>;

type FixedInputReplayHistoryEntryV1 =
  | Readonly<{
      kind: "fixed-input";
      input: Parameters<
        BabylonGameplayRuntimeInternalV1["prepareFixedInputTick"]
      >[0];
      actionProjection: GameplayFixedTickActionProjectionV1;
    }>
  | Readonly<{
      kind: "possession";
      publishedState: BabylonGameplayPublishedStateV1;
      traversalConfigurationEpoch: number;
      resetCameraViewPreference: boolean;
      pendingCameraHeadingLockBeforeNextTick: boolean;
      pendingPublishedCameraViewSyncBeforeNextTick: boolean;
      clearPublishedCameraProjection: boolean;
    }>
  | Readonly<{
      kind: "camera-state";
      cameraTransactionState: ReturnType<
        CameraComponentV1["captureTransactionState"]
      >;
      cameraPositionMetersXYZ: RuntimeVec3V1;
      cameraFovRadians: number;
      appliedCameraViewStateRevision: number;
      pendingCameraHeadingLockBeforeNextTick: boolean;
      pendingPublishedCameraViewSyncBeforeNextTick: boolean;
      publishedCameraProjection: BabylonPublishedCameraProjectionV1 | undefined;
    }>
  | Readonly<{
      kind: "mount";
      publishedState: BabylonGameplayPublishedStateV1;
      relationship: MountedOnRelationshipStateV1;
      subjectOriginPositionMetersXYZ: RuntimeVec3V1;
      facingYawRadians: number;
      committedTick: number;
      traversalConfigurationEpoch: number;
    }>
  | Readonly<{
      kind: "dismount";
      publishedState: BabylonGameplayPublishedStateV1;
      relationship: MountedOnRelationshipStateV1;
      subjectOriginPositionMetersXYZ: RuntimeVec3V1;
      facingYawRadians: number;
      riderCollisionFilterMembershipMask: number;
      riderCollisionFilterCollideMask: number;
      committedTick: number;
      traversalConfigurationEpoch: number;
    }>;

interface FixedInputReplayBaselineCheckpointV1 {
  readonly gameplayPublishedState: BabylonGameplayPublishedStateV1;
  readonly traversalConfigurationEpoch: number;
  readonly cameraTransactionState: ReturnType<
    CameraComponentV1["captureTransactionState"]
  >;
  readonly cameraPositionMetersXYZ: RuntimeVec3V1;
  readonly cameraFovRadians: number;
  readonly appliedCameraViewStateRevision: number;
  readonly pendingCameraHeadingLockBeforeNextTick: boolean;
  readonly pendingPublishedCameraViewSyncBeforeNextTick: boolean;
  readonly publishedCameraProjection: BabylonPublishedCameraProjectionV1 | undefined;
  readonly latestGoldenCameraContextsByEntityId: readonly (readonly [
    string,
    CameraContextSampleV2,
  ])[];
  readonly collisionFilterMasksByEntityId: readonly (readonly [
    string,
    Readonly<{ membershipMask: number; collideMask: number }>,
  ])[];
}

const WATER_SURFACE_CLASSIFICATION_EPSILON_METERS = 0.1;
const EMPTY_INPUT_ACTIONS: readonly SemanticInputActionV1[] = Object.freeze([]);
const EMPTY_INPUT_AXES: Readonly<ControlInputAxesV2> = Object.freeze({});

type LiveSubjectControllerV1 =
  | SpecializedMotionSubjectControllerV1
  | CharacterMovementSubjectControllerV1;

function isCharacterMovementControllerV1(
  controller: LiveSubjectControllerV1 | undefined,
): controller is CharacterMovementSubjectControllerV1 {
  return controller instanceof CharacterMovementSubjectControllerV1;
}

function locomotionModeFromV2(
  locomotion: LocomotionCapabilityStateV2,
): LocomotionModeV1 {
  if (locomotion.status === "suspended") return "idle";
  if (locomotion.mobilityMode === "airborne") return "airborne";
  return locomotion.gait === "walk" || locomotion.gait === "run"
    ? locomotion.gait
    : "idle";
}

class WorldRuntimeDisposeErrorV1 extends Error {
  readonly name = "WorldRuntimeDisposeErrorV1";
  readonly code = "WORLDKIT_RUNTIME_DISPOSE_FAILED" as const;

  constructor() {
    super("WORLDKIT_RUNTIME_DISPOSE_FAILED: Runtime cleanup failed.");
  }
}

export class WorldRuntimeLayoutAssertionErrorV1 extends Error {
  readonly name = "WorldRuntimeLayoutAssertionErrorV1";
  readonly code = "WORLDKIT_LAYOUT_ASSERTION_FAILED" as const;

  constructor() {
    super("WORLDKIT_LAYOUT_ASSERTION_FAILED: A frozen layout assertion failed.");
  }
}

export function isWorldRuntimeLayoutAssertionErrorV1(
  value: unknown,
): value is WorldRuntimeLayoutAssertionErrorV1 {
  return value instanceof WorldRuntimeLayoutAssertionErrorV1 &&
    value.code === "WORLDKIT_LAYOUT_ASSERTION_FAILED";
}

interface RuntimeLayoutBoundsV1 {
  readonly minimumMetersXYZ: RuntimeVec3V1;
  readonly maximumMetersXYZ: RuntimeVec3V1;
}

function runtimeLayoutBounds(
  executionPlan: CanonicalSceneExecutionPlanV1,
  placement: CanonicalSceneLayoutPlacementV1,
): RuntimeLayoutBoundsV1 {
  const object = executionPlan.objects.find((row) => row.entityId === placement.entityId);
  const halfExtents = object === undefined
    ? [0, 0, 0] as const
    : object.primitive.kind === "box"
      ? object.primitive.sizeMetersXYZ.map((value) => value / 2) as [number, number, number]
      : object.primitive.kind === "sphere"
        ? [object.primitive.radiusMeters, object.primitive.radiusMeters, object.primitive.radiusMeters] as const
        : [object.primitive.radiusMeters, object.primitive.heightMeters / 2, object.primitive.radiusMeters] as const;
  const scaled = halfExtents.map((value, axis) =>
    value * placement.transform.scaleXYZ[axis]!
  ) as [number, number, number];
  const [x, y, z] = placement.transform.rotationEulerRadiansXYZ;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  // Matches Babylon Quaternion.FromEulerAngles(x, y, z): yaw(Y) * pitch(X) * roll(Z).
  const rotation = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ] as const;
  const rotated = rotation.map((row) => row.reduce(
    (sum, coefficient, axis) => sum + Math.abs(coefficient) * scaled[axis]!,
    0,
  )) as [number, number, number];
  return {
    minimumMetersXYZ: placement.transform.positionMetersXYZ.map((value, axis) =>
      value - rotated[axis]!
    ) as unknown as RuntimeVec3V1,
    maximumMetersXYZ: placement.transform.positionMetersXYZ.map((value, axis) =>
      value + rotated[axis]!
    ) as unknown as RuntimeVec3V1,
  };
}

function runtimeSupportSamples(bounds: RuntimeLayoutBoundsV1): readonly CanonicalSceneVec2V1[] {
  const minimum = bounds.minimumMetersXYZ;
  const maximum = bounds.maximumMetersXYZ;
  return [
    [(minimum[0] + maximum[0]) / 2, (minimum[2] + maximum[2]) / 2],
    [minimum[0], minimum[2]],
    [maximum[0], minimum[2]],
    [maximum[0], maximum[2]],
    [minimum[0], maximum[2]],
  ];
}

function runtimeAabbSeparation(
  left: RuntimeLayoutBoundsV1,
  right: RuntimeLayoutBoundsV1,
): number {
  const distances = [0, 1, 2].map((axis) => Math.max(
    0,
    right.minimumMetersXYZ[axis]! - left.maximumMetersXYZ[axis]!,
    left.minimumMetersXYZ[axis]! - right.maximumMetersXYZ[axis]!,
  ));
  return Math.hypot(...distances);
}

function runtimeAabbsOverlap(
  left: RuntimeLayoutBoundsV1,
  right: RuntimeLayoutBoundsV1,
): boolean {
  return [0, 1, 2].every((axis) =>
    Math.min(left.maximumMetersXYZ[axis]!, right.maximumMetersXYZ[axis]!) -
      Math.max(left.minimumMetersXYZ[axis]!, right.minimumMetersXYZ[axis]!) > 0
  );
}

function revalidateSupportAssertion(
  executionPlan: CanonicalSceneExecutionPlanV1,
  assertion: Extract<CanonicalSceneLayoutAssertionV1, { kind: "supported-by" }>,
  boundsByEntityId: Readonly<Record<string, RuntimeLayoutBoundsV1>>,
): boolean {
  const supported = boundsByEntityId[assertion.supportedEntityId];
  if (supported === undefined) return false;
  const supportGapTolerance = assertion.tolerances.supportGapMeters ?? 0;
  const bottom = supported.minimumMetersXYZ[1];
  if (assertion.supportingEntityId === executionPlan.terrain.entityId) {
    const gaps = runtimeSupportSamples(supported).map((point) => Math.abs(
      bottom - sampleExecutionTerrainHeight(executionPlan.terrain, point[0], point[1])
    ));
    const passing = gaps.filter((gap) =>
      gap <= assertion.maximumSupportGapMeters + supportGapTolerance
    ).length;
    return Math.max(...gaps) <= assertion.maximumSupportGapMeters + supportGapTolerance &&
      passing / gaps.length + 0.000001 >= assertion.minimumSupportRatio;
  }
  const colliderMeshes = executionPlan.staticColliders
    .filter((collider) => collider.entityId === assertion.supportingEntityId)
    .map((collider) => emitTransformedStaticColliderTriangleMeshV1(
      collider.shape,
      collider.transform,
    ));
  if (colliderMeshes.length === 0) return false;
  const samples = runtimeSupportSamples(supported);
  const gaps: number[] = [];
  for (const point of samples) {
    const supportHeightsMeters = colliderMeshes
      .map((mesh) =>
        queryStaticColliderTriangleMeshSupportHeightMetersV1(mesh, point)
      )
      .filter((heightMeters): heightMeters is number => !isNil(heightMeters));
    if (supportHeightsMeters.length === 0) continue;
    gaps.push(Math.abs(bottom - Math.max(...supportHeightsMeters)));
  }
  if (gaps.length === 0) return false;
  const passing = gaps.filter((gap) =>
    gap <= assertion.maximumSupportGapMeters + supportGapTolerance
  ).length;
  return Math.max(...gaps) <=
      assertion.maximumSupportGapMeters + supportGapTolerance &&
    passing / samples.length + 0.000001 >= assertion.minimumSupportRatio;
}

function revalidateClearanceAssertion(
  assertion: Extract<CanonicalSceneLayoutAssertionV1, { kind: "minimum-clearance" }>,
  executionPlan: CanonicalSceneExecutionPlanV1,
  boundsByEntityId: Readonly<Record<string, RuntimeLayoutBoundsV1>>,
): boolean {
  const entity = boundsByEntityId[assertion.entityId];
  if (entity === undefined) return false;
  const targetIds = assertion.otherEntityIds ?? assertion.evidenceEntityIds
    .filter((entityId) => entityId !== assertion.entityId);
  if (targetIds.length === 0) return false;
  let minimumClearance = Number.POSITIVE_INFINITY;
  for (const targetId of targetIds) {
    const target = boundsByEntityId[targetId];
    if (target === undefined || runtimeAabbsOverlap(entity, target)) return false;
    minimumClearance = Math.min(minimumClearance, runtimeAabbSeparation(entity, target));
  }
  return minimumClearance + (assertion.tolerances.overlapMeters ?? 0) >= assertion.clearanceMeters;
}

function revalidateRuntimeLayoutAssertions(
  executionPlan: CanonicalSceneExecutionPlanV1,
): void {
  const placements = Object.values(executionPlan.layout.placementsByEntityId);
  const boundsByEntityId = Object.fromEntries(placements.map((placement) => [
    placement.entityId,
    runtimeLayoutBounds(executionPlan, placement),
  ]));
  for (const assertion of executionPlan.layout.layoutAssertions) {
    const satisfied = assertion.kind === "supported-by"
      ? revalidateSupportAssertion(executionPlan, assertion, boundsByEntityId)
      : assertion.kind === "minimum-clearance"
        ? revalidateClearanceAssertion(assertion, executionPlan, boundsByEntityId)
        : true;
    if (!satisfied) throw new WorldRuntimeLayoutAssertionErrorV1();
  }
}

function createStaticCollisionMesh(
  collider: CanonicalSceneStaticColliderV1,
  traversalSurface:
    | Extract<
        CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number],
        { kind: "static-collider" }
      >
    | undefined,
  scene: Scene,
): Mesh {
  const topology = emitStaticColliderTriangleMeshV1(collider.shape);
  const mesh = new Mesh(`worldkit.static-collider.${collider.colliderSubshapeId}`, scene);
  const positions = [...topology.localPositionsMetersXYZ];
  const indices = [...topology.triangleIndices];
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh, false);
  mesh.position = new Vector3(...collider.transform.positionMetersXYZ);
  mesh.rotationQuaternion = Quaternion.FromEulerAngles(
    ...collider.transform.rotationEulerRadiansXYZ,
  );
  mesh.scaling = new Vector3(...collider.transform.scaleXYZ);
  mesh.metadata = {
    worldkitEntityId: collider.entityId,
    colliderSubshapeId: collider.colliderSubshapeId,
    worldkitLogicalSubshapeId: collider.logicalSubshapeId,
    ...(traversalSurface === undefined
      ? {}
      : {
          worldkitTraversalSurfaceId:
            traversalSurface.traversalSurfaceId,
          worldkitSurfaceEntityId: traversalSurface.surfaceEntityId,
          worldkitTraversalSurfaceProfileRef:
            traversalSurface.traversalSurfaceProfileRef,
        }),
  };
  mesh.isVisible = false;
  mesh.computeWorldMatrix(true);
  return mesh;
}

function canonicalHeightfieldTraversalSurface(
  executionPlan: CanonicalSceneExecutionPlanV1,
): Extract<
  CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number],
  { kind: "heightfield" }
> {
  const matches = executionPlan.traversal.surfaces.filter(
    (surface): surface is Extract<
      CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number],
      { kind: "heightfield" }
    > => surface.kind === "heightfield" &&
      surface.surfaceEntityId === executionPlan.terrain.entityId,
  );
  if (matches.length !== 1) {
    throw new Error(
      "WORLDKIT_RUNTIME_HEIGHTFIELD_TRAVERSAL_IDENTITY_INVALID",
    );
  }
  return matches[0]!;
}

function canonicalStaticColliderTraversalSurface(
  executionPlan: CanonicalSceneExecutionPlanV1,
  collider: CanonicalSceneStaticColliderV1,
): Extract<
  CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number],
  { kind: "static-collider" }
> | undefined {
  const matches = executionPlan.traversal.surfaces.filter(
    (surface): surface is Extract<
      CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number],
      { kind: "static-collider" }
    > => surface.kind === "static-collider" &&
      surface.surfaceEntityId === collider.entityId &&
      surface.colliderSubshapeId === collider.colliderSubshapeId,
  );
  if (matches.length > 1) {
    throw new Error(
      "WORLDKIT_RUNTIME_STATIC_TRAVERSAL_IDENTITY_AMBIGUOUS",
    );
  }
  return matches[0];
}

function attachCanonicalTraversalSurfaceIdentity(
  mesh: Mesh,
  surface: CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number],
): void {
  const retained = typeof mesh.metadata === "object" && !isNil(mesh.metadata)
    ? mesh.metadata as Readonly<Record<string, unknown>>
    : {};
  mesh.metadata = {
    ...retained,
    worldkitEntityId: surface.surfaceEntityId,
    colliderSubshapeId: surface.colliderSubshapeId,
    worldkitLogicalSubshapeId:
      surface.kind === "static-collider"
        ? surface.logicalSubshapeId
        : "heightfield",
    worldkitTraversalSurfaceId: surface.traversalSurfaceId,
    worldkitSurfaceEntityId: surface.surfaceEntityId,
    worldkitTraversalSurfaceProfileRef:
      surface.kind === "static-collider"
        ? surface.traversalSurfaceProfileRef
        : surface.resourceRef,
  };
}

function containsPoint(boundary: CanonicalSceneWaterBoundaryV1, x: number, z: number): boolean {
  if (boundary.kind === "circle") {
    const dx = x - boundary.centerMetersXZ[0];
    const dz = z - boundary.centerMetersXZ[1];
    return dx * dx + dz * dz <= boundary.radiusMeters * boundary.radiusMeters;
  }
  if (boundary.kind === "ellipse") {
    const dx = (x - boundary.centerMetersXZ[0]) / boundary.radiusMetersXZ[0];
    const dz = (z - boundary.centerMetersXZ[1]) / boundary.radiusMetersXZ[1];
    return dx * dx + dz * dz <= 1;
  }
  let inside = false;
  for (let current = 0, previous = boundary.pointsMetersXZ.length - 1; current < boundary.pointsMetersXZ.length; previous = current, current += 1) {
    const currentPoint = boundary.pointsMetersXZ[current]!;
    const previousPoint = boundary.pointsMetersXZ[previous]!;
    const crosses = currentPoint[1] > z !== previousPoint[1] > z &&
      x < ((previousPoint[0] - currentPoint[0]) * (z - currentPoint[1])) /
        (previousPoint[1] - currentPoint[1]) + currentPoint[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function waterSurfaceHeightAtSubjectOrigin(
  executionPlan: CanonicalSceneExecutionPlanV1,
  subjectOrigin: Vector3,
): number | undefined {
  return executionPlan.waters.find((water) =>
    water.traversalMode === "swimmable" &&
    containsPoint(water.boundary, subjectOrigin.x, subjectOrigin.z) &&
    subjectOrigin.y >= water.waterLevelMeters - water.depthMeters - 1 &&
    subjectOrigin.y <=
      water.waterLevelMeters + WATER_SURFACE_CLASSIFICATION_EPSILON_METERS
  )?.waterLevelMeters;
}

function configureAtmosphere(
  scene: Scene,
  preset: CanonicalSceneExecutionPlanV1["atmospherePreset"],
): DirectionalLight {
  const colors = {
    "clear-day": new Color4(0.55, 0.78, 0.92, 1),
    "golden-hour": new Color4(0.91, 0.65, 0.42, 1),
    overcast: new Color4(0.57, 0.62, 0.66, 1),
    night: new Color4(0.035, 0.055, 0.11, 1),
  } as const;
  scene.clearColor = colors[preset];
  scene.ambientColor = preset === "night" ? new Color3(0.08, 0.1, 0.18) : new Color3(0.32, 0.32, 0.32);
  const ambient = new HemisphericLight("worldkit.light.ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = preset === "night" ? 0.3 : 0.72;
  const sun = new DirectionalLight("worldkit.light.sun", new Vector3(-0.45, -1, 0.35), scene);
  sun.intensity = preset === "night" ? 0.22 : 1.1;
  return sun;
}

function createCanonicalContactShadows(
  sun: DirectionalLight,
): ShadowGenerator {
  const shadowGenerator = new ShadowGenerator(1024, sun);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadowGenerator.bias = 0.0005;
  shadowGenerator.normalBias = 0.02;
  return shadowGenerator;
}

function nativeColliderMetadata(
  mesh: Mesh,
  collider: BabylonNativeStaticColliderContributionV1,
  traversalBinding: BabylonNativeStaticColliderContributionV1["traversalBinding"],
): void {
  const retained = typeof mesh.metadata === "object" && !isNil(mesh.metadata)
    ? mesh.metadata as Readonly<Record<string, unknown>>
    : {};
  mesh.metadata = {
    ...retained,
    worldkitEntityId: collider.id,
    worldkitNativeColliderRuntimeRole: collider.runtimeRole,
    colliderSubshapeId: collider.colliderSubshapeId,
    worldkitNativeTraversalKind: traversalBinding.kind,
    ...(traversalBinding.kind === "static-surface"
      ? {
          worldkitTraversalSurfaceId: traversalBinding.traversalSurfaceId,
          worldkitSurfaceEntityId: traversalBinding.surfaceEntityId,
          worldkitLogicalSubshapeId: traversalBinding.logicalSubshapeId,
          worldkitTraversalSurfaceProfileRef:
            traversalBinding.traversalSurfaceProfileRef,
        }
      : {}),
  };
}

async function disposeOwnedStack(
  ownedDisposers: readonly OwnedDisposer[],
): Promise<void> {
  let firstFailure: unknown;
  for (const dispose of [...ownedDisposers].reverse()) {
    try {
      await dispose();
    } catch (error) {
      firstFailure ??= error;
    }
  }
  if (firstFailure !== undefined) {
    if (isSubjectAssetRuntimeErrorV1(firstFailure)) throw firstFailure;
    throw new WorldRuntimeDisposeErrorV1();
  }
}

export interface BabylonSubjectPresetTuningReceiptV1 extends Omit<
  SubjectPresetTuningReceiptV1,
  "snapshot"
> {
  readonly snapshot: BabylonRuntimeProjectionV1;
}

export class BabylonWorldRuntime {
  readonly runtimeBackend = "babylon-havok" as const;
  readonly ready: Promise<void> = Promise.resolve();

  private tick = 0;
  private renderFrameIndex = 0;
  private disposed = false;
  private latestRenderReadyReceipt: RenderReadyReceiptV1 | undefined;
  private appliedCameraViewStateRevision = 0;
  private pendingCameraHeadingLockBeforeNextTick = false;
  private pendingPublishedCameraViewSyncBeforeNextTick = false;
  private publishedCameraProjection: BabylonPublishedCameraProjectionV1 | undefined;
  private traversalConfigurationEpoch = 0;
  private readonly aggregates: PhysicsAggregate[] = [];
  private readonly ownedTerrainShape: PhysicsShape | undefined;
  private readonly staticCollisionMeshes: readonly StaticCollisionMeshEntryV1[];
  private readonly entityRegistry: EntityRegistryV1;
  private readonly characterEntitiesByEntityId: ReadonlyMap<string, BabylonCharacterEntityV1>;
  private readonly goldenProjectionsByEntityId: ReadonlyMap<
    string,
    GoldenHumanoidPresentationContextProjectionV1
  >;
  private readonly latestGoldenCameraContextsByEntityId: Map<
    string,
    CameraContextSampleV2
  >;
  private readonly latestSpecializedCameraContextsByEntityId = new Map<
    string,
    CameraContextSampleV2
  >();
  private readonly actionPresentationRegistry: ActionPresentationRegistryV1;
  private readonly subjectVisuals: readonly SubjectVisual[];
  private readonly subjectVisualsByEntityId: ReadonlyMap<string, SubjectVisual>;
  private readonly contactShadowGenerator: ShadowGenerator | undefined;
  private publishedContactShadowCasterMeshes: ReadonlySet<AbstractMesh> = new Set();
  private readonly camera: FreeCamera;
  private readonly cameraComponent: CameraComponentV1;
  private readonly cameraGeometryQuery: BabylonHavokCameraGeometryQueryV2;
  private readonly renderLoop: () => void;
  private readonly autoStartRenderLoop: boolean;
  private readonly ownedDisposers: readonly OwnedDisposer[];
  private readonly terrainSampleCount: number;
  private activeInputActions: readonly SemanticInputActionV1[] = [];
  private activeInputAxes: Readonly<ControlInputAxesV2> = {};
  private gameplayPublishedState: BabylonGameplayPublishedStateV1;
  private fixedInputReplayHistory: readonly FixedInputReplayHistoryEntryV1[] = [];
  private fixedInputReplayBaseline: FixedInputReplayBaselineCheckpointV1 | undefined;
  private isReplayingFixedInputHistory = false;
  private preparedFixedInput: Readonly<{
    beforeRuntimeProjection: BabylonRuntimeProjectionV1;
    beforeWorldProjection: ReturnType<
      BabylonGameplayRuntimeInternalV1["readWorldProjection"]
    >;
    beforeLatestRenderReadyReceipt: BabylonWorldRuntime["latestRenderReadyReceipt"];
  }> | undefined;
  readonly #creationExecutionPlanHash: `sha256:${string}` | undefined;

  private constructor(
    private readonly executionPlan: CanonicalSceneExecutionPlanV1 | undefined,
    private readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1,
    private readonly gameplayBootstrap: GameplayBootstrapV1,
    private readonly runtimeSubjects: readonly BabylonRuntimeSubjectV1[],
    private readonly runtimeSessionId: string,
    private readonly engine: AbstractEngine,
    private readonly scene: Scene,
    entityRegistry: EntityRegistryV1,
    characterEntitiesByEntityId: ReadonlyMap<string, BabylonCharacterEntityV1>,
    goldenProjectionsByEntityId: ReadonlyMap<
      string,
      GoldenHumanoidPresentationContextProjectionV1
    >,
    latestGoldenCameraContextsByEntityId: Map<string, CameraContextSampleV2>,
    actionPresentationRegistry: ActionPresentationRegistryV1,
    subjectVisuals: readonly SubjectVisual[],
    contactShadowGenerator: ShadowGenerator | undefined,
    camera: FreeCamera,
    cameraComponent: CameraComponentV1,
    cameraGeometryQuery: BabylonHavokCameraGeometryQueryV2,
    ownedTerrainShape: PhysicsShape | undefined,
    aggregates: PhysicsAggregate[],
    staticCollisionMeshes: readonly StaticCollisionMeshEntryV1[],
    ownedDisposers: readonly OwnedDisposer[],
    autoStartRenderLoop: boolean,
    creationExecutionPlanHash: `sha256:${string}` | undefined,
    terrainSampleCount: number,
    private readonly expectedPhysicsBodyCount: number,
    private readonly nativeColliderResidency:
      BabylonNativeColliderResidencyV1 | undefined,
    private nativeColliderRegistry:
      BabylonNativeLiveColliderRegistryV1 | undefined,
  ) {
    this.gameplayPublishedState = Object.freeze({
      possessionTarget: Object.freeze({ mode: "unbound" }),
      mountedRelationshipsByRiderEntityId: Object.freeze({}),
      semanticFactsById: Object.freeze({}),
      viewProjection: Object.freeze({ viewStateRevision: 0 }),
    });
    this.entityRegistry = entityRegistry;
    this.characterEntitiesByEntityId = characterEntitiesByEntityId;
    this.goldenProjectionsByEntityId = goldenProjectionsByEntityId;
    this.latestGoldenCameraContextsByEntityId =
      latestGoldenCameraContextsByEntityId;
    this.actionPresentationRegistry = actionPresentationRegistry;
    this.subjectVisuals = subjectVisuals;
    this.subjectVisualsByEntityId = new Map(
      subjectVisuals.map((visual) => [
        String(visual.root.metadata?.worldkitEntityId),
        visual,
      ]),
    );
    this.contactShadowGenerator = contactShadowGenerator;
    const contactShadowMap = contactShadowGenerator?.getShadowMap();
    if (contactShadowMap !== undefined && contactShadowMap !== null) {
      contactShadowMap.renderListPredicate = (mesh) =>
        this.publishedContactShadowCasterMeshes.has(mesh);
    }
    this.camera = camera;
    this.cameraComponent = cameraComponent;
    this.cameraGeometryQuery = cameraGeometryQuery;
    this.ownedTerrainShape = ownedTerrainShape;
    this.aggregates.push(...aggregates);
    this.staticCollisionMeshes = staticCollisionMeshes;
    this.ownedDisposers = ownedDisposers;
    this.renderLoop = () => this.renderFrame();
    this.autoStartRenderLoop = autoStartRenderLoop;
    this.#creationExecutionPlanHash = creationExecutionPlanHash;
    this.terrainSampleCount = terrainSampleCount;
    this.initializeInitialMountedRelationships();
    this.reconcileSemanticFacts();
    this.updateCamera();
    this.publishCameraProjection();
    if (autoStartRenderLoop) this.engine.runRenderLoop(this.renderLoop);
  }

  static async create(options: BabylonWorldRuntimeOptions): Promise<BabylonWorldRuntime> {
    const gameplayBootstrap = parseGameplayBootstrapV1(
      options.gameplayBootstrap,
    );
    const canonicalScenePlan = options.sceneSource.kind ===
        "canonical-execution-plan"
      ? options.sceneSource.executionPlan
      : undefined;
    const nativeScene = options.sceneSource.kind === "babylon-native-scene"
      ? options.sceneSource
      : undefined;
    const preparedNativeScene = isNil(nativeScene)
      ? undefined
      : await prepareBabylonNativeRuntimePackageV1({
          descriptor: nativeScene.descriptor,
          verifiedWorldPackage: nativeScene.verifiedWorldPackage,
          moduleLoader: nativeScene.moduleLoader,
        });
    if (
      !isNil(canonicalScenePlan) &&
      (canonicalScenePlan.kind !==
        "worldkit-canonical-scene-execution-plan" ||
      canonicalScenePlan.schemaVersion !== 1)
    ) {
      throw new Error(
        "WORLDKIT_RUNTIME_CANONICAL_SCENE_PLAN_REQUIRED",
      );
    }
    if (
      options.worldRuntimeBootstrap.gameplayBootstrapRef !==
        gameplayBootstrap.resourceRef ||
      options.worldRuntimeBootstrap.gameplayBootstrapHash !==
        gameplayBootstrap.contentHash
    ) {
      throw new Error("WORLDKIT_RUNTIME_GAMEPLAY_BOOTSTRAP_MISMATCH");
    }
    let runtimeSubjects = isNil(canonicalScenePlan)
      ? Object.freeze([]) as readonly BabylonRuntimeSubjectV1[]
      : resolveBabylonRuntimeSubjectsV1(
          canonicalScenePlan,
          options.worldRuntimeBootstrap,
        );
    const initialControlledEntityId =
      options.worldRuntimeBootstrap.initialControlledEntityId;
    if (!isNil(canonicalScenePlan)) {
      assertRuntimeSubjectSetV1(runtimeSubjects, initialControlledEntityId);
    }
    if (options.engineFactory === undefined && options.canvas === undefined) {
      throw new TypeError("BabylonWorldRuntime requires canvas or engineFactory.");
    }
    const actionPresentationRegistry = createActionPresentationRegistryV1(
      options.worldRuntimeBootstrap.actionPresentationRegistry,
    );
    const creationExecutionPlanHash = !isNil(canonicalScenePlan)
      ? sha256CanonicalJson(canonicalScenePlan) as `sha256:${string}`
      : undefined;
    const ownedDisposers: OwnedDisposer[] = [];
    options.onInitializationStage?.("engine");
    const engine = options.engineFactory?.() ?? new Engine(options.canvas!, true, { preserveDrawingBuffer: true, stencil: true });
    ownedDisposers.push(() => engine.dispose());
    try {
      options.onInitializationStage?.("scene");
      const scene = new Scene(engine);
      ownedDisposers.push(() => scene.dispose());
      scene.useRightHandedSystem = true;
      const executionPlan = canonicalScenePlan;
      let effectiveRuntimeSubjects = runtimeSubjects;
      let effectiveGravityMetersPerSecondSquaredXYZ =
        options.worldRuntimeBootstrap.gravityMetersPerSecondSquaredXYZ;
      let effectiveCamera = options.worldRuntimeBootstrap.initialCamera;
      let nativeContribution: BabylonNativeSceneContributionV1 | undefined;
      if (!isNil(nativeScene) && !isNil(preparedNativeScene)) {
        options.onInitializationStage?.("native-scene");
        const nativeResult = await admitBabylonNativeSceneCandidateV1({
          candidate: { engine, scene },
          bootstrap: preparedNativeScene.verifiedWorldPackage.bootstrap,
          module: preparedNativeScene.module,
          assets: preparedNativeScene.assets,
          budget: preparedNativeScene.budget,
          hostDerivedStaticColliders:
            preparedNativeScene.verifiedWorldPackage.nativeSceneContribution
              .staticColliders.filter(({ runtimeRole }) =>
                runtimeRole === "ground-safety-boundary"),
        });
        if (nativeResult.outcome !== "passed") {
          const problem = nativeResult.diagnostics.find(
            ({ severity }) => severity === "error",
          );
          throw new Error(
            problem === undefined
              ? "WORLDKIT_NATIVE_SCENE_CONTRIBUTION_REJECTED: Native Scene Contribution was rejected."
              : `${problem.code}: ${problem.message}`,
          );
        }
        const packagedContribution =
          preparedNativeScene.verifiedWorldPackage.nativeSceneContribution;
        if (
          nativeResult.contributionHash !==
            hashBabylonNativeSceneContributionV1(packagedContribution) ||
          !isEqual(nativeResult.contribution, packagedContribution)
        ) {
          throw new Error(
            "WORLDKIT_NATIVE_SCENE_RUNTIME_CONTRIBUTION_MISMATCH: Actual Native Contribution differs from the verified WorldPackage.",
          );
        }
        nativeContribution = nativeResult.contribution;
        if (
          options.worldRuntimeBootstrap.initialControlledEntityId !==
            preparedNativeScene.verifiedWorldPackage.bootstrap.initialControlledEntityId ||
          options.worldRuntimeBootstrap.gameplayBootstrapRef !==
            preparedNativeScene.verifiedWorldPackage.bootstrap.gameplayBootstrapRef ||
          !options.worldRuntimeBootstrap.gravityMetersPerSecondSquaredXYZ.every(
            (value, index) => Object.is(
              value,
              preparedNativeScene.verifiedWorldPackage.bootstrap.gravityMetersPerSecondSquaredXYZ[index],
            ),
          ) ||
          !Object.is(
            options.worldRuntimeBootstrap.initialCamera.pitchRadians,
            preparedNativeScene.verifiedWorldPackage.bootstrap.initialCamera.pitchRadians,
          ) ||
          !Object.is(
            options.worldRuntimeBootstrap.initialCamera.distanceMeters,
            preparedNativeScene.verifiedWorldPackage.bootstrap.initialCamera.distanceMeters,
          ) ||
          !Object.is(
            options.worldRuntimeBootstrap.initialCamera.fovDegrees,
            preparedNativeScene.verifiedWorldPackage.bootstrap.initialCamera.fovDegrees,
          ) ||
          !Object.is(
            options.worldRuntimeBootstrap.initialCamera.targetHeightMeters,
            preparedNativeScene.verifiedWorldPackage.bootstrap.initialCamera.targetHeightMeters,
          )
        ) {
          throw new Error(
            "WORLDKIT_NATIVE_SCENE_RUNTIME_BOOTSTRAP_MISMATCH: Native Bootstrap must match the shared Runtime Bootstrap.",
          );
        }
        const admittedNativeContribution = nativeContribution;
        runtimeSubjects = resolveBabylonNativeRuntimeSubjectsV1(
          options.worldRuntimeBootstrap,
          admittedNativeContribution.spawnMarker,
        );
        assertRuntimeSubjectSetV1(runtimeSubjects, initialControlledEntityId);
        effectiveRuntimeSubjects = runtimeSubjects;
        const controlledSubject = runtimeSubjects.find(({ entityId }) =>
          entityId === initialControlledEntityId,
        );
        if (isNil(controlledSubject)) {
          throw new Error(
            "WORLDKIT_NATIVE_SCENE_RUNTIME_CONTROLLED_SUBJECT_MISSING: Native Runtime Bootstrap has no controlled Subject descriptor.",
          );
        }
        const surfaceAdmission = admitBabylonNativeSurfacesV1({
          contribution: admittedNativeContribution,
          registryLock: preparedNativeScene.verifiedWorldPackage.registryLock,
          controlledSubject,
          worldBounds:
            preparedNativeScene.verifiedWorldPackage.manifest.worldBounds,
        });
        if (surfaceAdmission.outcome !== "passed") {
          throw new Error(
            `${surfaceAdmission.diagnostic.code}: ${surfaceAdmission.diagnostic.message}`,
          );
        }
        options.onNativeSceneAdmission?.(Object.freeze({
          contribution: nativeResult.contribution,
          contributionHash: nativeResult.contributionHash,
        }));
      }
      options.onInitializationStage?.("havok");
      const havokPlugin = await enableHavokPhysics(
        scene,
        effectiveGravityMetersPerSecondSquaredXYZ,
        options.havokWasmBinary,
      );
      const cameraGeometryQuery = new BabylonHavokCameraGeometryQueryV2(scene, havokPlugin);
      ownedDisposers.push(() => cameraGeometryQuery.dispose());
      const entityRegistry = new EntityRegistryV1();
      const materials = createWhiteboxMaterials(scene);
      const aggregates: PhysicsAggregate[] = [];
      let nativeColliderResidency: BabylonNativeColliderResidencyV1 | undefined;
      let nativeColliderRegistry:
        BabylonNativeLiveColliderRegistryV1 | undefined;
      let runtime: BabylonWorldRuntime | undefined;
      let terrainShape: PhysicsShape | undefined;
      let canonicalSun: DirectionalLight | undefined;
      let contactShadowGenerator: ShadowGenerator | undefined;
      const staticCollisionMeshes: StaticCollisionMeshEntryV1[] = [];
      let terrainSampleCount = executionPlan?.terrain.heightSamplesMeters.length ?? 0;
      if (!isNil(executionPlan)) {
        options.onInitializationStage?.("terrain");
        canonicalSun = configureAtmosphere(scene, executionPlan.atmospherePreset);
        const terrainMesh = createTerrainMesh(
          executionPlan.terrain,
          materials.terrain,
          scene,
        );
        attachCanonicalTraversalSurfaceIdentity(
          terrainMesh,
          canonicalHeightfieldTraversalSurface(executionPlan),
        );
        const terrain = executionPlan.terrain;
        const firstTerrainHeight = terrain.heightSamplesMeters[0]!;
        const isFlatTerrain = terrain.heightSamplesMeters.every((height) =>
          height === firstTerrainHeight
        );
        const flatTerrainThicknessMeters = 1;
        terrainShape = isFlatTerrain
          ? new PhysicsShapeBox(
              new Vector3(
                0,
                firstTerrainHeight - flatTerrainThicknessMeters / 2,
                0,
              ),
              Quaternion.Identity(),
              new Vector3(
                terrain.sizeMetersXZ[0],
                flatTerrainThicknessMeters,
                terrain.sizeMetersXZ[1],
              ),
              scene,
            )
          : new PhysicsShapeMesh(terrainMesh, scene);
        ownedDisposers.push(() => terrainShape?.dispose());
        const terrainAggregate = new PhysicsAggregate(
          terrainMesh,
          terrainShape,
          { mass: 0, friction: 0.9, restitution: 0 },
          scene,
        );
        aggregates.push(terrainAggregate);
        ownedDisposers.push(() => terrainAggregate.dispose());

        for (const water of executionPlan.waters) {
          createBabylonWaterMeshV1(water, materials, scene);
        }
        for (const object of executionPlan.objects) {
          createBabylonObjectMeshV1(object, materials, scene);
        }
        for (const collider of executionPlan.staticColliders) {
          const traversalSurface = canonicalStaticColliderTraversalSurface(
            executionPlan,
            collider,
          );
          const mesh = createStaticCollisionMesh(
            collider,
            traversalSurface,
            scene,
          );
          const shape = new PhysicsShapeMesh(mesh, scene);
          ownedDisposers.push(() => shape.dispose());
          const aggregate = new PhysicsAggregate(
            mesh,
            shape,
            { mass: 0, friction: 0.75, restitution: 0 },
            scene,
          );
          aggregates.push(aggregate);
          staticCollisionMeshes.push({ collider, mesh });
          ownedDisposers.push(() => aggregate.dispose());
        }
        revalidateRuntimeLayoutAssertions(executionPlan);
      } else {
        if (scene.lights.length === 0) {
          configureAtmosphere(scene, "clear-day");
        }
        terrainSampleCount = 0;
        if (nativeContribution === undefined) {
          throw new Error(
            "WORLDKIT_NATIVE_SCENE_CONTRIBUTION_MISSING: Native Scene Contribution must pass before physics attachment.",
          );
        }
        const nativeBlockMaterializerMetadata =
          preparedNativeScene?.verifiedWorldPackage
            .nativeBlockMaterializerMetadata;
        const sourceBlockIdsByColliderId = new Map(
          nativeBlockMaterializerMetadata?.colliderJoins.map(
            ({ sourceBlockIds, colliderId }) =>
              [colliderId, sourceBlockIds] as const,
          ) ?? [],
        );
        nativeColliderResidency = createBabylonNativeColliderResidencyV1({
          scene,
          chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
          colliders: nativeContribution.staticColliders,
          requiresSourceBlockJoins: !isNil(nativeBlockMaterializerMetadata),
          sourceBlockIdsByColliderId,
          cameraGeometryQuery,
          applyColliderMetadata: (mesh, collider) =>
            nativeColliderMetadata(mesh, collider, collider.traversalBinding),
        });
        const residency = nativeColliderResidency;
        ownedDisposers.push(() => residency.dispose());
        // Activate the Spawn ring before readiness: the controlled Subject must
        // land on real Havok geometry, not on a ring that only fills in later.
        residency.update(effectiveRuntimeSubjects.map(
          ({ spawnSubjectOriginPositionMetersXYZ }) =>
            spawnSubjectOriginPositionMetersXYZ,
        ));
        nativeColliderRegistry = createBabylonNativeLiveColliderRegistryV1({
          handles: residency.activeHandles(),
          requiresSourceBlockJoins: !isNil(nativeBlockMaterializerMetadata),
          residency: residencyEvidence(residency),
          parts: residency.partInventory(),
        });
        registerBabylonNativeLiveColliderRegistryV1(
          scene,
          nativeColliderRegistry,
        );
        ownedDisposers.push(() => {
          const currentRegistry = runtime?.nativeColliderRegistry ??
            nativeColliderRegistry;
          if (isNil(currentRegistry)) return;
          unregisterBabylonNativeLiveColliderRegistryV1(
            scene,
            currentRegistry,
          );
        });
        if (!isNil(nativeBlockMaterializerMetadata)) {
          const visualRegistry =
            peekBabylonNativeBlockLiveHandleRegistryV1(scene);
          if (isNil(visualRegistry)) {
            throw new Error(
              "WORLDKIT_NATIVE_BLOCK_LIVE_VISUAL_REGISTRY_MISSING: Native Block visuals must be registered before Chunk batching.",
            );
          }
          const visualBatches =
            materializeBabylonNativeBlockVisualBatchesV1({
              scene,
              realizationId: preparedNativeScene!.verifiedWorldPackage
                .bootstrap.id,
              chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
              placements: nativeBlockMaterializerMetadata.blocks,
              liveHandles: visualRegistry,
            });
          ownedDisposers.push(() => visualBatches.dispose());
        }
      }

      options.onInitializationStage?.("camera");
      const cameraPlan = effectiveCamera;
      const camera = new FreeCamera(cameraPlan.cameraEntityId, Vector3.Zero(), scene);
      camera.fov = (cameraPlan.fovDegrees * Math.PI) / 180;
      camera.minZ = 0.05;
      scene.activeCamera = camera;
      const cameraEntity = entityRegistry.register(
        new RuntimeEntityV1(cameraPlan.cameraEntityId),
      );
      ownedDisposers.push(() => cameraEntity.dispose());
      const cameraComponent = cameraEntity.registerComponent(new CameraComponentV1(
        effectiveCamera,
        camera,
        scene,
        cameraGeometryQuery,
      ));
      options.onInitializationStage?.("subjects");
      const subjectAssetCache = new SubjectAssetCacheV1(
        scene,
        options.subjectAssetResolver,
        options.subjectAssetCacheOptions,
      );
      ownedDisposers.push(() => subjectAssetCache.dispose());
      const goldenProjectionsByEntityId = new Map<
        string,
        GoldenHumanoidPresentationContextProjectionV1
      >();
      const latestGoldenCameraContextsByEntityId = new Map<
        string,
        CameraContextSampleV2
      >();
      const characterEntitiesByEntityId = new Map<string, BabylonCharacterEntityV1>();
      const subjectVisuals: SubjectVisual[] = [];
      const sortedSubjects = [...effectiveRuntimeSubjects].sort((left, right) =>
        compareCodeUnits(left.entityId, right.entityId),
      );
      for (const subject of sortedSubjects) {
        const visual = await createSubjectVisual({
          subject,
          worldRuntimeBootstrap: options.worldRuntimeBootstrap,
          material: materials.subject,
          scene,
          subjectAssetCache,
          actionPresentationRegistry,
        });
        subjectVisuals.push(visual);
        ownedDisposers.push(() => visual.dispose());
        let controller: LiveSubjectControllerV1;
        const usesCharacterMovement = supportsCharacterMovementSubjectV1(subject);
        if (usesCharacterMovement && subject.visualBinding.mode === "rigged") {
          let latestAnimation: Readonly<{
            presentation: ResolvedActionPresentationV1;
            committedActionState?: Parameters<SubjectVisual["stepAnimation"]>[1];
            jumpEpisode?: Parameters<SubjectVisual["stepAnimation"]>[2];
          }> | undefined;
          const projection = new GoldenHumanoidPresentationContextProjectionV1({
            actionPresentationRegistry,
            animationProjectionPort: {
              prepareCommittedAnimation: (request) => {
                const previous = latestAnimation;
                let state: "prepared" | "committed" | "aborted" = "prepared";
                const restorePrevious = (): void => {
                  if (previous === undefined) {
                    visual.resetAnimation();
                  } else {
                    visual.stepAnimation(
                      previous.presentation,
                      previous.committedActionState,
                      previous.jumpEpisode,
                    );
                  }
                  latestAnimation = previous;
                };
                return Object.freeze({
                  commit: (): void => {
                    if (state !== "prepared") return;
                    try {
                      visual.stepAnimation(
                        request.presentation,
                        request.committedActionState,
                        request.jumpEpisode,
                      );
                      latestAnimation = Object.freeze({
                        presentation: request.presentation,
                        ...(request.committedActionState === undefined
                          ? {}
                          : { committedActionState: request.committedActionState }),
                        ...(request.jumpEpisode === undefined
                          ? {}
                          : { jumpEpisode: request.jumpEpisode }),
                      });
                      state = "committed";
                    } catch (error) {
                      restorePrevious();
                      state = "aborted";
                      throw error;
                    }
                  },
                  abort: (): void => {
                    if (state === "aborted") return;
                    if (state === "committed") restorePrevious();
                    state = "aborted";
                  },
                }) satisfies BabylonPreparedProjectionTransactionV1;
              },
            },
            cameraDirectorProjectionPort: {
              prepareCameraDirectorUpdate: (request) => {
                const previous = cameraComponent.captureTransactionState();
                const previousCameraContext =
                  latestGoldenCameraContextsByEntityId.get(subject.entityId);
                let state: "prepared" | "committed" | "aborted" = "prepared";
                const restorePrevious = (): void => {
                  cameraComponent.restoreTransactionState(previous);
                  if (previousCameraContext === undefined) {
                    latestGoldenCameraContextsByEntityId.delete(subject.entityId);
                  } else {
                    latestGoldenCameraContextsByEntityId.set(
                      subject.entityId,
                      previousCameraContext,
                    );
                  }
                };
                return Object.freeze({
                  commit: (): void => {
                    if (state !== "prepared") return;
                    try {
                      const cameraContext = cameraContextWithLockedLocalSocketsV1(
                        subject,
                        request.cameraContext,
                      );
                      if (runtime?.controlledEntityId() === subject.entityId) {
                        runtime.synchronizeCameraGeometrySubjectQueryState();
                        const locomotion = cameraContext.locomotion;
                        const velocity = locomotion.status === "active"
                          ? locomotion.linearVelocity
                          : { x: 0, y: 0, z: 0 };
                        const facingYawRadians =
                          cameraContext.subjectPose.facingYawRadians;
                        const sample: ViewTargetSampleV1 = {
                          controlledEntityId:
                            cameraContext.controlledEntityId,
                          entityId: cameraContext.targetEntityId,
                          targetPositionMetersXYZ:
                            cameraContext.subjectPose.positionMetersXYZ,
                          forwardXYZ: [
                            canonicalizeSignedZero(-Math.sin(facingYawRadians)),
                            0,
                            canonicalizeSignedZero(-Math.cos(facingYawRadians)),
                          ],
                          upXYZ: [0, 1, 0],
                          velocityMetersPerSecondXYZ: [
                            velocity.x,
                            velocity.y,
                            velocity.z,
                          ],
                          approximateRadiusMeters: subject.collider.radiusMeters,
                          socketPositionsMetersXYZById:
                            cameraContext.environment
                              .socketPositionsMetersXYZById,
                          movementMedium: locomotion.status === "active"
                            ? locomotion.movementMedium
                            : "ground",
                          relationshipContexts:
                            cameraContext.environment.relationshipContexts,
                          cameraContextTags:
                            cameraContext.environment.cameraContextTags,
                        };
                        cameraComponent.update(
                          subject.capabilityAssembly.cameraContext,
                          sample,
                          FIXED_TIME_STEP_SECONDS,
                          cameraContext,
                          runtime.characterFor(subject.entityId).springArm,
                        );
                      }
                      latestGoldenCameraContextsByEntityId.set(
                        subject.entityId,
                        cameraContext,
                      );
                      state = "committed";
                    } catch (error) {
                      restorePrevious();
                      state = "aborted";
                      throw error;
                    }
                  },
                  abort: (): void => {
                    if (state === "aborted") return;
                    if (state === "committed") restorePrevious();
                    state = "aborted";
                  },
                }) satisfies BabylonPreparedProjectionTransactionV1;
              },
            },
          });
          goldenProjectionsByEntityId.set(subject.entityId, projection);
          ownedDisposers.push(() => projection.dispose());
          controller = createCharacterMovementSubjectControllerV1({
            subject,
            gravityMetersPerSecondSquaredXYZ:
              effectiveGravityMetersPerSecondSquaredXYZ,
            visualRoot: visual.root,
            scene,
            actionPresentationRegistry,
            projectionPorts: [projection],
          });
        } else if (usesCharacterMovement) {
          controller = createCharacterMovementSubjectControllerV1({
            subject,
            gravityMetersPerSecondSquaredXYZ:
              effectiveGravityMetersPerSecondSquaredXYZ,
            visualRoot: visual.root,
            scene,
            actionPresentationRegistry,
          });
        } else {
          controller = new SpecializedMotionSubjectControllerV1(
            subject,
            effectiveGravityMetersPerSecondSquaredXYZ,
            visual.root,
            scene,
            (subjectOrigin) =>
              !isNil(executionPlan)
                ? waterSurfaceHeightAtSubjectOrigin(executionPlan, subjectOrigin)
                : undefined,
          );
        }
        const character = new BabylonCharacterEntityV1({
          subject,
          gravityMetersPerSecondSquaredXYZ:
            effectiveGravityMetersPerSecondSquaredXYZ,
          visualRoot: visual.root,
          scene,
          waterSurfaceHeightAtSubjectOrigin: (subjectOrigin) =>
            !isNil(executionPlan)
              ? waterSurfaceHeightAtSubjectOrigin(executionPlan, subjectOrigin)
              : undefined,
          movement: controller,
        });
        entityRegistry.register(character.entity);
        // Register entity rollback immediately. The registry itself is added to
        // the completed-runtime stack after activation, but a later Subject,
        // physics-body binding, or Camera construction may still fail first.
        ownedDisposers.push(() => character.entity.dispose());
        characterEntitiesByEntityId.set(subject.entityId, character);
        cameraGeometryQuery.registerEntityPhysicsBody(
          subject.entityId,
          character.movement.physicsBody,
        );
      }

      if (
        executionPlan?.atmospherePreset === "clear-day" &&
        !isNil(canonicalSun)
      ) {
        contactShadowGenerator = createCanonicalContactShadows(canonicalSun);
        ownedDisposers.push(() => contactShadowGenerator?.dispose());
      }

      entityRegistry.activateAll();
      const initiallyMountedRiderEntityIds = new Set(
        gameplayBootstrap.initialRelationshipStates.flatMap((relationship) =>
          relationship.type === "mountedOn"
            ? [relationship.riderEntityId]
            : []
        ),
      );
      // Authoring placement is not physics support evidence. Sample every
      // active, unmounted CharacterMovement Body exactly once after all
      // colliders and Subjects are active, but before constructing the
      // publishable Runtime Snapshot. An initially mounted rider is sampled by
      // its one suspension projection in the Runtime constructor instead.
      // This keeps BodyPort/checkSupport as the sole support authority for the
      // first committed locomotion state as well as later reset/tick states.
      for (const [entityId, character] of characterEntitiesByEntityId) {
        if (isCharacterMovementControllerV1(character.movement) &&
          !initiallyMountedRiderEntityIds.has(entityId)) {
          character.movement.reset();
        }
      }
      ownedDisposers.push(() => entityRegistry.dispose());
      options.onInitializationStage?.("ready");
      runtime = new BabylonWorldRuntime(
        executionPlan,
        options.worldRuntimeBootstrap,
        gameplayBootstrap,
        effectiveRuntimeSubjects,
        options.runtimeSessionId ?? "runtime-session-local",
        engine,
        scene,
        entityRegistry,
        characterEntitiesByEntityId,
        goldenProjectionsByEntityId,
        latestGoldenCameraContextsByEntityId,
        actionPresentationRegistry,
        subjectVisuals,
        contactShadowGenerator,
        camera,
        cameraComponent,
        cameraGeometryQuery,
        terrainShape,
        aggregates,
        staticCollisionMeshes,
        ownedDisposers,
        options.engineFactory === undefined && options.autoStartRenderLoop !== false,
        creationExecutionPlanHash,
        terrainSampleCount,
        executionPlan?.sceneResourceUsage.colliders ??
          runtimeSubjects.length +
            (nativeColliderResidency?.metrics().activePartCount ?? 0),
        nativeColliderResidency,
        nativeColliderRegistry,
      );
      return runtime;
    } catch (error) {
      try {
        await disposeOwnedStack(ownedDisposers);
      } catch {
        // Preserve the primary initialization failure.
      }
      throw error;
    }
  }

  async runFixedInput(input: FixedInputV1): Promise<BabylonRuntimeProjectionV1> {
    this.assertUsable();
    if (!Number.isSafeInteger(input.ticks) || input.ticks < 0 || input.ticks > 36_000) {
      throw new RangeError("Fixed input ticks must be an integer from 0 through 36000.");
    }
    if (input.ticks > 0) this.latestRenderReadyReceipt = undefined;
    for (let index = 0; index < input.ticks; index += 1) {
      this.lockPublishedCameraHeadingBeforeTick();
      const controlledEntityId = this.controlledEntityId();
      const targetIsBound = controlledEntityId !== undefined;
      this.activeInputActions = targetIsBound ? [...input.actions] : [];
      this.activeInputAxes = targetIsBound && input.axes !== undefined
        ? { ...input.axes }
        : {};
      this.cameraComponent.setInputActions(this.activeInputActions);
      const viewControlFrame = this.cameraComponent.controlFrame(this.tick);
      for (const subject of this.runtimeSubjects) {
        const controller = this.controllerFor(subject.entityId);
        if (!isNil(this.gameplayPublishedState
          .mountedRelationshipsByRiderEntityId[subject.entityId])) {
          continue;
        }
        const controlled = subject.entityId === controlledEntityId;
        if (isCharacterMovementControllerV1(controller)) {
          controller.step(
            controlled ? input.actions : [],
            viewControlFrame,
            controlled ? input.axes : undefined,
            undefined,
            this.goldenCameraContextAuthorityForSubject(
              subject.entityId,
              controlledEntityId,
            ),
          );
        } else if (controlled || controller.movementMedium !== "ground") {
          controller.step(
            controlled ? input.actions : [],
            viewControlFrame,
            controlled ? input.axes : undefined,
          );
        } else {
          // A possession publication only swaps prebuilt authority state. The
          // next fixed Tick consumes that state as neutral input for every
          // uncontrolled grounded Subject before physics advances.
          controller.stop();
          controller.publishSupport();
        }
      }
      this.commitFixedTick({ cameraMode: "controlled-entity" });
    }
    return this.snapshot();
  }

  [BABYLON_TRAVERSAL_RUNTIME_INTERNAL](): BabylonTraversalRuntimeInternalV1 {
    return {
      readCanonicalSceneExecutionPlan: () => {
        if (isNil(this.executionPlan)) {
          throw new Error("WORLDKIT_RUNTIME_CANONICAL_SCENE_PLAN_REQUIRED");
        }
        return this.executionPlan;
      },
      readWorldRuntimeBootstrap: () => this.worldRuntimeBootstrap,
      readRuntimeSubjects: () => this.runtimeSubjects,
      readCreationExecutionPlanHash: () => this.#creationExecutionPlanHash,
      readControlledEntityId: () => this.controlledEntityId(),
      readConfigurationEpoch: () => this.traversalConfigurationEpoch,
      readTick: () => this.tick,
      isDisposed: () => this.disposed,
      readCharacterMovement: (entityId) => {
        const movement = this.characterEntitiesByEntityId.get(entityId)?.movement;
        return isCharacterMovementControllerV1(movement)
          ? movement
          : undefined;
      },
      readStaticCollisionMeshes: () => this.staticCollisionMeshes,
      resetToTraversalAnchor: (input) => this.resetToTraversalAnchor(input),
      runTraversalFixedTick: (input) => this.runTraversalFixedTick(input),
    };
  }

  [BABYLON_GAMEPLAY_RUNTIME_INTERNAL](): BabylonGameplayRuntimeInternalV1 {
    const internal: BabylonGameplayRuntimeInternalV1 = {
      readPossessionTarget: () => this.gameplayPublishedState.possessionTarget,
      readWorldProjection: () => this.gameplayWorldProjection(),
      readViewProjection: () => this.gameplayPublishedState.viewProjection,
      hasEntity: (entityId) => this.characterEntitiesByEntityId.has(entityId),
      isEntityControllable: (entityId) =>
        this.characterEntitiesByEntityId.has(entityId),
      estimateSemanticFactProjectionCapacity: () => {
        const mountedRiderEntityIds = new Set(Object.keys(
          this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
        ));
        const maximumSupportedByFactCount = this.runtimeSubjects.filter(
          (subject) => {
            if (mountedRiderEntityIds.has(subject.entityId)) return false;
            const controller = this.controllerFor(subject.entityId);
            return !isCharacterMovementControllerV1(controller) ||
              controller.locomotionStateV2().status !== "suspended";
          },
        ).length;
        const currentFacts = Object.values(
          this.gameplayPublishedState.semanticFactsById,
        );
        return Object.freeze({
          maximumSemanticFactCountAfterInput:
            currentFacts.filter((fact) => fact.type !== "supportedBy").length +
            maximumSupportedByFactCount,
          maximumSemanticFactTransitionEventCount:
            currentFacts.filter((fact) => fact.type === "supportedBy").length +
            maximumSupportedByFactCount,
        });
      },
      hasLockedActionPresentation: (actorEntityId, semanticActionRef) => {
        const controller = this.characterEntitiesByEntityId.get(
          actorEntityId,
        )?.movement;
        return controller !== undefined &&
          isCharacterMovementControllerV1(controller) &&
          this.actionPresentationRegistry.bindings.some((binding) =>
            binding.semanticActionRef === semanticActionRef
          );
      },
      preparePossessionTarget: (target) =>
        this.prepareGameplayPossessionTarget(target),
      prepareMountedRelationshipTransition: (transition) =>
        this.prepareMountedRelationshipTransition(transition),
      prepareFixedInputTick: (input, actionProjection) =>
        this.prepareGameplayFixedInputTick(input, actionProjection),
      dispose: () => this.dispose(),
    };
    return internal;
  }

  private gameplayWorldProjection(
    includePreparedState = false,
  ): ReturnType<
    BabylonGameplayRuntimeInternalV1["readWorldProjection"]
  > {
    if (!includePreparedState && this.preparedFixedInput !== undefined) {
      return this.preparedFixedInput.beforeWorldProjection;
    }
    const spatialEntityStatesById: Record<string, SpatialEntityStateV1> = {};
    const capabilityStatesById: Record<string, GameplayCapabilityStateV1> = {};
    for (const subject of this.runtimeSubjects) {
      const controller = this.characterMovementControllerFor(subject.entityId);
      const origin = controller.subjectOrigin;
      const velocity = controller.velocity;
      const halfYawRadians = controller.facingYawRadians / 2;
      spatialEntityStatesById[subject.entityId] = Object.freeze({
        id: subject.entityId,
        kind: "spatial-entity-state",
        entityDefinitionRef: subject.subjectDefinitionRef,
        entityDefinitionHash:
          subject.subjectDefinitionHash as `sha256:${string}`,
        semanticClassId: subject.semanticClassId,
        lifecycleMode: "active",
        positionMetersXYZ: Object.freeze([
          canonicalizeSignedZero(origin.x),
          canonicalizeSignedZero(origin.y),
          canonicalizeSignedZero(origin.z),
        ]) as readonly [number, number, number],
        rotationQuaternionXYZW: Object.freeze([
          0,
          canonicalizeSignedZero(Math.sin(halfYawRadians)),
          0,
          canonicalizeSignedZero(Math.cos(halfYawRadians)),
        ]) as readonly [number, number, number, number],
        scaleRatioXYZ: Object.freeze([1, 1, 1]) as readonly [number, number, number],
        linearVelocityMetersPerSecondXYZ: Object.freeze([
          canonicalizeSignedZero(velocity.x),
          canonicalizeSignedZero(velocity.y),
          canonicalizeSignedZero(velocity.z),
        ]) as readonly [number, number, number],
      });
      const capabilityStateId = `capability-state:${subject.entityId}:locomotion`;
      const mounted = this.gameplayPublishedState
        .mountedRelationshipsByRiderEntityId[subject.entityId];
      const locomotion = controller.locomotionStateV2();
      if ((!isNil(mounted) &&
          (locomotion.status !== "suspended" ||
            locomotion.suspendedByRelationshipId !== mounted.relationship.id)) ||
        (isNil(mounted) && locomotion.status === "suspended")) {
        throw new Error("WORLDKIT_MOUNTED_LOCOMOTION_STATE_MISMATCH");
      }
      capabilityStatesById[capabilityStateId] = Object.freeze({
        id: capabilityStateId,
        kind: "locomotion-capability-state-v2",
        ownerEntityId: subject.entityId,
        locomotionCapabilityRef: subject.locomotionCapabilityRef,
        locomotionCapabilityHash:
          subject.locomotionCapabilityHash as `sha256:${string}`,
        locomotion,
      });
    }
    return Object.freeze({
      simulationTick: this.tick,
      spatialEntityStatesById: Object.freeze(spatialEntityStatesById),
      capabilityStatesById: Object.freeze(capabilityStatesById),
      semanticFactsById: this.gameplayPublishedState.semanticFactsById,
    });
  }

  private reconcileSemanticFacts(): void {
    const mountedRiderEntityIds = new Set(Object.keys(
      this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
    ));
    const subjects = this.runtimeSubjects.flatMap((subject) => {
      if (mountedRiderEntityIds.has(subject.entityId)) return [];
      const controller = this.controllerFor(subject.entityId);
      if (
        isCharacterMovementControllerV1(controller) &&
        controller.locomotionStateV2().status === "suspended"
      ) return [];
      return [{
        entityId: subject.entityId,
        sample: controller.retainedCharacterSupportSample(),
        live: controller.liveLockState(),
      }];
    });
    this.gameplayPublishedState = Object.freeze({
      ...this.gameplayPublishedState,
      semanticFactsById: projectSemanticFactsV1({
        previousSemanticFactsById:
          this.gameplayPublishedState.semanticFactsById,
        simulationTick: this.tick,
        profileResource:
          this.gameplayBootstrap.semanticFactProjectorProfileResource,
        executionPlan: this.executionPlan,
        subjects,
      }),
    });
  }

  private async prepareGameplayPossessionTarget(
    targetInput: BabylonGameplayPossessionTargetV1,
  ): Promise<PreparedBabylonGameplayPossessionV1> {
    this.assertUsable();
    const target = targetInput.mode === "unbound"
      ? Object.freeze({ mode: "unbound" as const })
      : Object.freeze({
          mode: "possessed" as const,
          controlledEntityId: targetInput.controlledEntityId,
        });
    if (
      target.mode === "possessed" &&
      !this.characterEntitiesByEntityId.has(target.controlledEntityId)
    ) {
      throw new Error(
        `WORLDKIT_GAMEPLAY_CONTROL_TARGET_NOT_FOUND: Gameplay target '${target.controlledEntityId}' does not exist.`,
      );
    }
    if (
      this.gameplayPublishedState.viewProjection.viewStateRevision ===
        Number.MAX_SAFE_INTEGER
    ) {
      throw new Error(
        "WORLDKIT_GAMEPLAY_VIEW_REVISION_EXHAUSTED: Gameplay View revision is exhausted.",
      );
    }
    const projectedWorldStateAfter = this.gameplayWorldProjection();
    const projectedViewStateAfter = Object.freeze({
      viewStateRevision:
        this.gameplayPublishedState.viewProjection.viewStateRevision + 1,
    });
    const stagedState: BabylonGameplayPublishedStateV1 = Object.freeze({
      possessionTarget: target,
      mountedRelationshipsByRiderEntityId:
        this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
      semanticFactsById: this.gameplayPublishedState.semanticFactsById,
      viewProjection: projectedViewStateAfter,
    });
    const stagedContactShadowCasterMeshes =
      this.contactShadowCasterMeshesFor(target);
    const previousControlledEntityId = this.controlledEntityId();
    const targetControlledEntityId = target.mode === "possessed"
      ? target.controlledEntityId
      : undefined;
    const targetChanged = targetControlledEntityId !== previousControlledEntityId;
    if (
      targetChanged &&
      this.traversalConfigurationEpoch === Number.MAX_SAFE_INTEGER
    ) {
      throw new Error(
        "WORLDKIT_TRAVERSAL_CONFIGURATION_EPOCH_EXHAUSTED: Traversal configuration epoch is exhausted.",
      );
    }
    const traversalConfigurationEpochAfter = targetChanged
      ? this.traversalConfigurationEpoch + 1
      : this.traversalConfigurationEpoch;
    const nextFixedInputReplayHistory = this.nextFixedInputReplayHistory(Object.freeze({
      kind: "possession" as const,
      publishedState: stagedState,
      traversalConfigurationEpoch: traversalConfigurationEpochAfter,
      resetCameraViewPreference: targetChanged,
      pendingCameraHeadingLockBeforeNextTick: targetChanged,
      pendingPublishedCameraViewSyncBeforeNextTick:
        targetChanged && !isNil(previousControlledEntityId),
      clearPublishedCameraProjection: target.mode === "unbound",
    }));
    let lifecycle: "prepared" | "committed" | "aborted" = "prepared";
    let abortPromise: Promise<void> | undefined;
    return Object.freeze({
      projectedWorldStateAfter,
      projectedViewStateAfter,
      commitPrepared: (): void => {
        if (lifecycle !== "prepared") return;
        if (targetChanged) {
          this.cameraComponent.resetViewPreference();
          this.pendingCameraHeadingLockBeforeNextTick = true;
          this.pendingPublishedCameraViewSyncBeforeNextTick =
            !isNil(previousControlledEntityId);
        }
        lifecycle = "committed";
        this.gameplayPublishedState = stagedState;
        this.publishedContactShadowCasterMeshes = stagedContactShadowCasterMeshes;
        if (target.mode === "unbound") {
          this.publishedCameraProjection = undefined;
        }
        this.traversalConfigurationEpoch = traversalConfigurationEpochAfter;
        this.activeInputActions = EMPTY_INPUT_ACTIONS;
        this.activeInputAxes = EMPTY_INPUT_AXES;
        this.latestRenderReadyReceipt = undefined;
        this.fixedInputReplayHistory = nextFixedInputReplayHistory;
      },
      abort: (): Promise<void> => {
        if (!isNil(abortPromise)) return abortPromise;
        if (lifecycle === "committed") {
          abortPromise = Promise.reject(
            new Error("Babylon Gameplay possession transaction is already committed."),
          );
          return abortPromise;
        }
        lifecycle = "aborted";
        abortPromise = Promise.resolve();
        return abortPromise;
      },
    });
  }

  private mountedPose(
    relationship: MountedOnRelationshipStateV1,
  ): Readonly<{ subjectOrigin: Vector3; facingYawRadians: number }> {
    const mountSubject = this.runtimeSubjects.find(
      (subject) => subject.entityId === relationship.mountEntityId,
    );
    const slot = mountSubject?.mountSlots.find(
      (candidate) => candidate.id === relationship.mountSlotId,
    );
    const mountController = this.characterEntitiesByEntityId.get(
      relationship.mountEntityId,
    )?.movement;
    const mountSocket = isNil(slot) || isNil(mountSubject)
      ? undefined
      : lockedLocalSocketV1(mountSubject, slot.mountSocketId);
    if (
      isNil(mountSubject) ||
      isNil(slot) ||
      isNil(mountController) ||
      isNil(mountSocket)
    ) {
      throw new Error("WORLDKIT_MOUNTED_SLOT_UNAVAILABLE");
    }
    const socketLocalTransform = Matrix.Compose(
      Vector3.One(),
      Quaternion.FromEulerAngles(
        ...mountSocket.localTransform.rotationEulerRadiansXYZ,
      ),
      new Vector3(...mountSocket.localTransform.positionMetersXYZ),
    );
    const subjectOriginInMountSpace = Vector3.TransformCoordinates(
      new Vector3(...slot.riderSubjectOriginOffsetMetersXYZ),
      socketLocalTransform,
    );
    const subjectOrigin = Vector3.TransformCoordinates(
      subjectOriginInMountSpace,
      Matrix.RotationY(mountController.facingYawRadians),
    ).addInPlace(
      mountController.subjectOrigin,
    );
    if (![subjectOrigin.x, subjectOrigin.y, subjectOrigin.z].every(Number.isFinite)) {
      throw new Error("WORLDKIT_MOUNTED_POSE_NON_FINITE");
    }
    return Object.freeze({
      subjectOrigin,
      facingYawRadians: mountController.facingYawRadians,
    });
  }

  private initializeInitialMountedRelationships(): void {
    if (this.gameplayBootstrap.initialRelationshipStates.length === 0) return;
    const mountedRelationshipsByRiderEntityId: Record<
      string,
      BabylonMountedRelationshipProjectionV1
    > = {};
    for (const relationship of this.gameplayBootstrap.initialRelationshipStates) {
      if (relationship.type !== "mountedOn") continue;
      const rider = this.controllerFor(relationship.riderEntityId);
      const pose = this.mountedPose(relationship);
      const collisionFilters = rider.collisionFilterMasks();
      const staged = Object.freeze({
        relationship,
        riderCollisionFilterMembershipMask:
          collisionFilters.membershipMask,
        riderCollisionFilterCollideMask:
          collisionFilters.collideMask,
      });
      rider.setCollisionFilterMasks(0, 0);
      this.projectMountedRider(rider, relationship, pose, this.tick);
      mountedRelationshipsByRiderEntityId[relationship.riderEntityId] = staged;
    }
    this.gameplayPublishedState = Object.freeze({
      ...this.gameplayPublishedState,
      mountedRelationshipsByRiderEntityId: Object.freeze(
        mountedRelationshipsByRiderEntityId,
      ),
    });
  }

  private projectMountedRider(
    rider: LiveSubjectControllerV1,
    relationship: MountedOnRelationshipStateV1,
    pose: Readonly<{ subjectOrigin: Vector3; facingYawRadians: number }>,
    committedTick: number,
  ): void {
    const subjectOrigin = [
      pose.subjectOrigin.x,
      pose.subjectOrigin.y,
      pose.subjectOrigin.z,
    ] as const;
    if (isCharacterMovementControllerV1(rider)) {
      rider.projectSuspendedAt(
        subjectOrigin,
        pose.facingYawRadians,
        relationship.id,
        committedTick,
      );
      return;
    }
    rider.projectSuspendedAt(subjectOrigin, pose.facingYawRadians);
  }

  private async prepareMountedRelationshipTransition(
    input: BabylonGameplayMountedTransitionV1,
  ): Promise<PreparedBabylonGameplayPossessionV1> {
    this.assertUsable();
    const { relationship } = input;
    if (input.operation === "dismount") {
      return this.prepareDismountRelationshipTransition(input);
    }
    const rider = this.characterEntitiesByEntityId.get(
      relationship.riderEntityId,
    )?.movement;
    const riderSubject = this.runtimeSubjects.find(
      (subject) => subject.entityId === relationship.riderEntityId,
    );
    const mount = this.runtimeSubjects.find(
      (subject) => subject.entityId === relationship.mountEntityId,
    );
    const profile = mount?.capabilityAssembly.relationshipProfiles.find(
      (candidate) =>
        candidate.relationshipType === "mountedOn" &&
        candidate.resourceRef ===
          "worldkit://relationship-profile/mounted-on.stand-ground@1",
    );
    if (
      isNil(rider) ||
      isNil(riderSubject) ||
      isNil(mount) ||
      isNil(profile) ||
      profile.relationshipType !== "mountedOn" ||
      profile.requiredRiderSocketIds.some(
        (socketId) => isNil(lockedLocalSocketV1(riderSubject, socketId)),
      ) ||
      profile.requiredMountSocketIds.some(
        (socketId) => isNil(lockedLocalSocketV1(mount, socketId)),
      ) ||
      !isNil(this.gameplayPublishedState
        .mountedRelationshipsByRiderEntityId[relationship.riderEntityId])
    ) {
      throw new Error("WORLDKIT_MOUNTED_RELATIONSHIP_UNAVAILABLE");
    }
    const pose = this.mountedPose(relationship);
    const distanceMeters = Vector3.Distance(rider.subjectOrigin, pose.subjectOrigin);
    if (
      !Number.isFinite(distanceMeters) ||
      (!isNil(profile.maximumMountDistanceMeters) &&
        distanceMeters > profile.maximumMountDistanceMeters)
    ) {
      throw new Error("WORLDKIT_MOUNTED_DISTANCE_EXCEEDED");
    }
    const baseProjection = this.gameplayWorldProjection();
    const riderState = baseProjection.spatialEntityStatesById[
      relationship.riderEntityId
    ];
    if (isNil(riderState) || isNil(riderSubject)) {
      throw new Error("WORLDKIT_MOUNTED_RIDER_UNAVAILABLE");
    }
    const halfYawRadians = pose.facingYawRadians / 2;
    const riderCenterOffset =
      riderSubject.collider.centerOffsetFromSubjectOriginMetersXYZ;
    const poseSubjectOrigin = pose.subjectOrigin.asArray();
    // Preserve the exact floating-point operation order used by the committed
    // Body center-to-origin projection. Although the offset cancels
    // algebraically, applying and removing it here avoids a one-ULP mismatch
    // between the prepared Gameplay projection and the Body transaction.
    const projectedRiderOrigin: RuntimeVec3V1 = [
      poseSubjectOrigin[0]! + riderCenterOffset[0] - riderCenterOffset[0],
      poseSubjectOrigin[1]! + riderCenterOffset[1] - riderCenterOffset[1],
      poseSubjectOrigin[2]! + riderCenterOffset[2] - riderCenterOffset[2],
    ];
    const capabilityStateId =
      `capability-state:${relationship.riderEntityId}:locomotion`;
    const transactionalRider = this.characterMovementControllerFor(
      relationship.riderEntityId,
    );
    const suspendedLocomotion = transactionalRider.previewSuspendedAt(
      projectedRiderOrigin,
      pose.facingYawRadians,
      relationship.id,
      this.tick,
    ).locomotion;
    const suspendedCapability: GameplayCapabilityStateV1 = Object.freeze({
      id: capabilityStateId,
      kind: "locomotion-capability-state-v2" as const,
      ownerEntityId: relationship.riderEntityId,
      locomotionCapabilityRef: riderSubject.locomotionCapabilityRef,
      locomotionCapabilityHash:
        riderSubject.locomotionCapabilityHash as `sha256:${string}`,
      locomotion: suspendedLocomotion,
    });
    const projectedWorldStateAfter = Object.freeze({
      ...baseProjection,
      spatialEntityStatesById: Object.freeze({
        ...baseProjection.spatialEntityStatesById,
        [relationship.riderEntityId]: Object.freeze({
          ...riderState,
          positionMetersXYZ: Object.freeze([
            canonicalizeSignedZero(projectedRiderOrigin[0]),
            canonicalizeSignedZero(projectedRiderOrigin[1]),
            canonicalizeSignedZero(projectedRiderOrigin[2]),
          ]) as readonly [number, number, number],
          rotationQuaternionXYZW: Object.freeze([
            0,
            canonicalizeSignedZero(Math.sin(halfYawRadians)),
            0,
            canonicalizeSignedZero(Math.cos(halfYawRadians)),
          ]) as readonly [number, number, number, number],
          linearVelocityMetersPerSecondXYZ: Object.freeze([0, 0, 0]) as
            readonly [number, number, number],
        }),
      }),
      capabilityStatesById: Object.freeze({
        ...baseProjection.capabilityStatesById,
        [capabilityStateId]: suspendedCapability,
      }),
    });
    const projectedViewStateAfter = Object.freeze({
      viewStateRevision:
        this.gameplayPublishedState.viewProjection.viewStateRevision + 1,
    });
    const collisionFilters = rider.collisionFilterMasks();
    const stagedRelationship: BabylonMountedRelationshipProjectionV1 =
      Object.freeze({
        relationship,
        riderCollisionFilterMembershipMask: collisionFilters.membershipMask,
        riderCollisionFilterCollideMask: collisionFilters.collideMask,
      });
    const stagedState: BabylonGameplayPublishedStateV1 = Object.freeze({
      possessionTarget: input.possessionTarget,
      mountedRelationshipsByRiderEntityId: Object.freeze({
        ...this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
        [relationship.riderEntityId]: stagedRelationship,
      }),
      semanticFactsById: this.gameplayPublishedState.semanticFactsById,
      viewProjection: projectedViewStateAfter,
    });
    const stagedContactShadowCasterMeshes =
      this.contactShadowCasterMeshesFor(input.possessionTarget);
    if (this.traversalConfigurationEpoch === Number.MAX_SAFE_INTEGER) {
      throw new Error(
        "WORLDKIT_TRAVERSAL_CONFIGURATION_EPOCH_EXHAUSTED",
      );
    }
    const traversalConfigurationEpochAfter =
      this.traversalConfigurationEpoch + 1;
    const nextFixedInputReplayHistory = this.nextFixedInputReplayHistory(Object.freeze({
      kind: "mount" as const,
      publishedState: stagedState,
      relationship,
      subjectOriginPositionMetersXYZ: Object.freeze([
        canonicalizeSignedZero(pose.subjectOrigin.x),
        canonicalizeSignedZero(pose.subjectOrigin.y),
        canonicalizeSignedZero(pose.subjectOrigin.z),
      ]) as RuntimeVec3V1,
      facingYawRadians: canonicalizeSignedZero(pose.facingYawRadians),
      committedTick: this.tick,
      traversalConfigurationEpoch: traversalConfigurationEpochAfter,
    }));
    let lifecycle: "prepared" | "committed" | "aborted" = "prepared";
    let abortPromise: Promise<void> | undefined;
    return Object.freeze({
      projectedWorldStateAfter,
      projectedViewStateAfter,
      commitPrepared: (): void => {
        if (lifecycle !== "prepared") return;
        const beforeFilters = rider.collisionFilterMasks();
        try {
          rider.setCollisionFilterMasks(0, 0);
          this.projectMountedRider(rider, relationship, pose, this.tick);
          this.gameplayPublishedState = stagedState;
          this.publishedContactShadowCasterMeshes = stagedContactShadowCasterMeshes;
          this.traversalConfigurationEpoch = traversalConfigurationEpochAfter;
          this.activeInputActions = EMPTY_INPUT_ACTIONS;
          this.activeInputAxes = EMPTY_INPUT_AXES;
          this.latestRenderReadyReceipt = undefined;
          this.fixedInputReplayHistory = nextFixedInputReplayHistory;
          lifecycle = "committed";
        } catch (error) {
          rider.setCollisionFilterMasks(
            beforeFilters.membershipMask,
            beforeFilters.collideMask,
          );
          throw error;
        }
      },
      abort: (): Promise<void> => {
        if (!isNil(abortPromise)) return abortPromise;
        if (lifecycle === "committed") {
          abortPromise = Promise.reject(
            new Error("Babylon mounted transaction is already committed."),
          );
          return abortPromise;
        }
        lifecycle = "aborted";
        abortPromise = Promise.resolve();
        return abortPromise;
      },
    });
  }

  private safeDismountSubjectOrigin(
    relationship: MountedOnRelationshipStateV1,
  ): Readonly<{ subjectOrigin: Vector3; facingYawRadians: number }> {
    const riderSubject = this.runtimeSubjects.find(
      (subject) => subject.entityId === relationship.riderEntityId,
    );
    const mountSubject = this.runtimeSubjects.find(
      (subject) => subject.entityId === relationship.mountEntityId,
    );
    const slot = mountSubject?.mountSlots.find(
      (candidate) => candidate.id === relationship.mountSlotId,
    );
    const mountController = this.characterEntitiesByEntityId.get(
      relationship.mountEntityId,
    )?.movement;
    const riderController = this.characterEntitiesByEntityId.get(
      relationship.riderEntityId,
    )?.movement;
    const mounted = this.gameplayPublishedState
      .mountedRelationshipsByRiderEntityId[relationship.riderEntityId];
    if (
      isNil(riderSubject) ||
      isNil(mountSubject) ||
      isNil(slot) ||
      isNil(mountController) ||
      isNil(riderController) ||
      isNil(mounted) ||
      mounted.relationship.id !== relationship.id
    ) throw new Error("WORLDKIT_DISMOUNT_SLOT_UNAVAILABLE");
    const mountOrigin = mountController.subjectOrigin;
    if (isNil(this.executionPlan)) {
      throw new Error("WORLDKIT_NATIVE_SCENE_RELATIONSHIP_UNSUPPORTED");
    }
    const terrainMinimumX = this.executionPlan.terrain.centerMetersXZ[0] -
      this.executionPlan.terrain.sizeMetersXZ[0] / 2;
    const terrainMaximumX = this.executionPlan.terrain.centerMetersXZ[0] +
      this.executionPlan.terrain.sizeMetersXZ[0] / 2;
    const terrainMinimumZ = this.executionPlan.terrain.centerMetersXZ[1] -
      this.executionPlan.terrain.sizeMetersXZ[1] / 2;
    const terrainMaximumZ = this.executionPlan.terrain.centerMetersXZ[1] +
      this.executionPlan.terrain.sizeMetersXZ[1] / 2;
    const yaw = mountController.facingYawRadians;
    const cosine = Math.cos(yaw);
    const sine = Math.sin(yaw);
    for (const offset of slot.dismountCandidateOffsetsMetersXYZ) {
      const x = mountOrigin.x + offset[0] * cosine + offset[2] * sine;
      const z = mountOrigin.z - offset[0] * sine + offset[2] * cosine;
      const y = mountOrigin.y + offset[1];
      if (
        ![x, y, z].every(Number.isFinite) ||
        x < terrainMinimumX ||
        x > terrainMaximumX ||
        z < terrainMinimumZ ||
        z > terrainMaximumZ
      ) continue;
      const placement = riderController.probeGroundPlacementAt(
        [x, y, z],
        mounted.riderCollisionFilterMembershipMask,
        mounted.riderCollisionFilterCollideMask,
      );
      if (isNil(placement)) continue;
      const subjectOrigin = new Vector3(...placement);
      const candidateCenter = subjectOrigin.add(
        new Vector3(...riderSubject.collider.centerOffsetFromSubjectOriginMetersXYZ),
      );
      const candidateRadius = riderSubject.collider.radiusMeters;
      const isBlockedBySubject = this.runtimeSubjects.some((subject) => {
        if (subject.entityId === relationship.riderEntityId) return false;
        const controller = this.characterEntitiesByEntityId.get(
          subject.entityId,
        )?.movement;
        if (isNil(controller)) return true;
        const otherCenter = controller.subjectOrigin.add(
          new Vector3(...subject.collider.centerOffsetFromSubjectOriginMetersXYZ),
        );
        const horizontalDistance = Math.hypot(
          candidateCenter.x - otherCenter.x,
          candidateCenter.z - otherCenter.z,
        );
        const verticalDistance = Math.abs(candidateCenter.y - otherCenter.y);
        return horizontalDistance < candidateRadius + subject.collider.radiusMeters &&
          verticalDistance <
            (riderSubject.collider.heightMeters + subject.collider.heightMeters) / 2;
      });
      if (!isBlockedBySubject) {
        return Object.freeze({ subjectOrigin, facingYawRadians: yaw });
      }
    }
    throw new Error("WORLDKIT_DISMOUNT_SAFE_PLACEMENT_UNAVAILABLE");
  }

  private async prepareDismountRelationshipTransition(
    input: BabylonGameplayMountedTransitionV1,
  ): Promise<PreparedBabylonGameplayPossessionV1> {
    const { relationship } = input;
    const mounted = this.gameplayPublishedState
      .mountedRelationshipsByRiderEntityId[relationship.riderEntityId];
    const rider = this.characterEntitiesByEntityId.get(
      relationship.riderEntityId,
    )?.movement;
    const riderSubject = this.runtimeSubjects.find(
      (subject) => subject.entityId === relationship.riderEntityId,
    );
    if (
      isNil(mounted) ||
      mounted.relationship.id !== relationship.id ||
      isNil(rider) ||
      isNil(riderSubject)
    ) throw new Error("WORLDKIT_DISMOUNT_RELATIONSHIP_STALE");
    const placement = this.safeDismountSubjectOrigin(relationship);
    const baseProjection = this.gameplayWorldProjection();
    const riderState = baseProjection.spatialEntityStatesById[
      relationship.riderEntityId
    ];
    if (isNil(riderState)) throw new Error("WORLDKIT_DISMOUNT_RIDER_UNAVAILABLE");
    const halfYawRadians = placement.facingYawRadians / 2;
    const capabilityStateId =
      `capability-state:${relationship.riderEntityId}:locomotion`;
    const transactionalRider = this.characterMovementControllerFor(
      relationship.riderEntityId,
    );
    const dismountedLocomotion = transactionalRider.previewResetAt(
      [
        placement.subjectOrigin.x,
        placement.subjectOrigin.y,
        placement.subjectOrigin.z,
      ],
      placement.facingYawRadians,
      this.tick,
    ).locomotion;
    const dismountedCapability: GameplayCapabilityStateV1 = Object.freeze({
      id: capabilityStateId,
      kind: "locomotion-capability-state-v2" as const,
      ownerEntityId: relationship.riderEntityId,
      locomotionCapabilityRef: riderSubject.locomotionCapabilityRef,
      locomotionCapabilityHash:
        riderSubject.locomotionCapabilityHash as `sha256:${string}`,
      locomotion: dismountedLocomotion,
    });
    const projectedWorldStateAfter: ReturnType<
      BabylonGameplayRuntimeInternalV1["readWorldProjection"]
    > =
      Object.freeze({
        ...baseProjection,
        spatialEntityStatesById: Object.freeze({
          ...baseProjection.spatialEntityStatesById,
          [relationship.riderEntityId]: Object.freeze({
            ...riderState,
            positionMetersXYZ: Object.freeze([
              canonicalizeSignedZero(placement.subjectOrigin.x),
              canonicalizeSignedZero(placement.subjectOrigin.y),
              canonicalizeSignedZero(placement.subjectOrigin.z),
            ]) as readonly [number, number, number],
            rotationQuaternionXYZW: Object.freeze([
              0,
              canonicalizeSignedZero(Math.sin(halfYawRadians)),
              0,
              canonicalizeSignedZero(Math.cos(halfYawRadians)),
            ]) as readonly [number, number, number, number],
            linearVelocityMetersPerSecondXYZ: Object.freeze([0, 0, 0]) as
              readonly [number, number, number],
          }),
        }),
        capabilityStatesById: Object.freeze({
          ...baseProjection.capabilityStatesById,
          [capabilityStateId]: dismountedCapability,
        }),
      });
    const mountedRelationshipsByRiderEntityId = {
      ...this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
    };
    delete mountedRelationshipsByRiderEntityId[relationship.riderEntityId];
    const projectedViewStateAfter = Object.freeze({
      viewStateRevision:
        this.gameplayPublishedState.viewProjection.viewStateRevision + 1,
    });
    const stagedState: BabylonGameplayPublishedStateV1 = Object.freeze({
      possessionTarget: input.possessionTarget,
      mountedRelationshipsByRiderEntityId: Object.freeze(
        mountedRelationshipsByRiderEntityId,
      ),
      semanticFactsById: this.gameplayPublishedState.semanticFactsById,
      viewProjection: projectedViewStateAfter,
    });
    const stagedContactShadowCasterMeshes =
      this.contactShadowCasterMeshesFor(input.possessionTarget);
    if (this.traversalConfigurationEpoch === Number.MAX_SAFE_INTEGER) {
      throw new Error(
        "WORLDKIT_TRAVERSAL_CONFIGURATION_EPOCH_EXHAUSTED",
      );
    }
    const traversalConfigurationEpochAfter =
      this.traversalConfigurationEpoch + 1;
    const nextFixedInputReplayHistory = this.nextFixedInputReplayHistory(Object.freeze({
      kind: "dismount" as const,
      publishedState: stagedState,
      relationship,
      subjectOriginPositionMetersXYZ: Object.freeze([
        canonicalizeSignedZero(placement.subjectOrigin.x),
        canonicalizeSignedZero(placement.subjectOrigin.y),
        canonicalizeSignedZero(placement.subjectOrigin.z),
      ]) as RuntimeVec3V1,
      facingYawRadians: canonicalizeSignedZero(placement.facingYawRadians),
      riderCollisionFilterMembershipMask:
        mounted.riderCollisionFilterMembershipMask,
      riderCollisionFilterCollideMask:
        mounted.riderCollisionFilterCollideMask,
      committedTick: this.tick,
      traversalConfigurationEpoch: traversalConfigurationEpochAfter,
    }));
    let lifecycle: "prepared" | "committed" | "aborted" = "prepared";
    let abortPromise: Promise<void> | undefined;
    return Object.freeze({
      projectedWorldStateAfter,
      projectedViewStateAfter,
      commitPrepared: (): void => {
        if (lifecycle !== "prepared") return;
        const beforeFilters = rider.collisionFilterMasks();
        try {
          rider.setCollisionFilterMasks(
            mounted.riderCollisionFilterMembershipMask,
            mounted.riderCollisionFilterCollideMask,
          );
          rider.resetAt(
            [
              placement.subjectOrigin.x,
              placement.subjectOrigin.y,
              placement.subjectOrigin.z,
            ],
            placement.facingYawRadians,
            this.tick,
          );
          this.gameplayPublishedState = stagedState;
          this.publishedContactShadowCasterMeshes = stagedContactShadowCasterMeshes;
          this.traversalConfigurationEpoch = traversalConfigurationEpochAfter;
          this.activeInputActions = EMPTY_INPUT_ACTIONS;
          this.activeInputAxes = EMPTY_INPUT_AXES;
          this.latestRenderReadyReceipt = undefined;
          this.fixedInputReplayHistory = nextFixedInputReplayHistory;
          lifecycle = "committed";
        } catch (error) {
          rider.setCollisionFilterMasks(
            beforeFilters.membershipMask,
            beforeFilters.collideMask,
          );
          throw error;
        }
      },
      abort: (): Promise<void> => {
        if (!isNil(abortPromise)) return abortPromise;
        if (lifecycle === "committed") {
          abortPromise = Promise.reject(
            new Error("Babylon dismount transaction is already committed."),
          );
          return abortPromise;
        }
        lifecycle = "aborted";
        abortPromise = Promise.resolve();
        return abortPromise;
      },
    });
  }

  private async prepareGameplayFixedInputTick(
    input: Parameters<BabylonGameplayRuntimeInternalV1["prepareFixedInputTick"]>[0],
    actionProjection: GameplayFixedTickActionProjectionV1,
  ): Promise<NonNullable<
    Awaited<ReturnType<NonNullable<
      BabylonGameplayRuntimeInternalV1["prepareFixedInputTick"]
    >>>
  >> {
    this.assertUsable();
    if ([...this.characterEntitiesByEntityId.values()].some(
      (character) => !isCharacterMovementControllerV1(character.movement),
    )) {
      throw new Error(
        "3C_TRANSACTIONAL_GAMEPLAY_CONTROL_UNSUPPORTED: hosted Gameplay requires CharacterMovement-backed planar-vector Subjects.",
      );
    }
    if (this.preparedFixedInput !== undefined) {
      throw new Error("3C_TICK_TOKEN_STALE: a Transactional Runtime Tick is already prepared.");
    }
    if (input.ticks !== 1) {
      throw new RangeError("Gameplay Runtime input must contain exactly one fixed Tick.");
    }
    this.assertActionProjectionForNextTick(actionProjection);
    const committedFixedTickCount = this.fixedInputReplayHistory.reduce(
      (count, entry) => count + (entry.kind === "fixed-input" ? 1 : 0),
      0,
    );
    if (this.tick !== committedFixedTickCount) {
      throw new Error(
        "3C_TICK_TOKEN_STALE: Transactional Runtime replay baseline was invalidated by an unstaged Tick.",
      );
    }
    if (this.fixedInputReplayBaseline === undefined) {
      if (this.tick !== 0) {
        throw new Error(
          "3C_TICK_TOKEN_STALE: Prepared fixed-input publication must begin from Tick zero.",
        );
      }
      this.fixedInputReplayBaseline = Object.freeze({
        gameplayPublishedState: this.gameplayPublishedState,
        traversalConfigurationEpoch: this.traversalConfigurationEpoch,
        cameraTransactionState: this.cameraComponent.captureTransactionState(),
        cameraPositionMetersXYZ: Object.freeze([
          canonicalizeSignedZero(this.camera.position.x),
          canonicalizeSignedZero(this.camera.position.y),
          canonicalizeSignedZero(this.camera.position.z),
        ]) as RuntimeVec3V1,
        cameraFovRadians: this.camera.fov,
        appliedCameraViewStateRevision: this.appliedCameraViewStateRevision,
        pendingCameraHeadingLockBeforeNextTick:
          this.pendingCameraHeadingLockBeforeNextTick,
        pendingPublishedCameraViewSyncBeforeNextTick:
          this.pendingPublishedCameraViewSyncBeforeNextTick,
        publishedCameraProjection: this.publishedCameraProjection,
        latestGoldenCameraContextsByEntityId: Object.freeze(
          [...this.latestGoldenCameraContextsByEntityId.entries()].map(
            ([entityId, context]) => Object.freeze([entityId, context] as const),
          ),
        ),
        collisionFilterMasksByEntityId: Object.freeze(
          [...this.characterEntitiesByEntityId.entries()]
            .sort(([leftEntityId], [rightEntityId]) =>
              compareCodeUnits(leftEntityId, rightEntityId)
            )
            .map(([entityId, character]) => Object.freeze([
              entityId,
              Object.freeze({ ...character.movement.collisionFilterMasks() }),
            ] as const)),
        ),
      });
    }
    const admittedInput = Object.freeze({
      actions: Object.freeze([...input.actions]),
      ticks: 1 as const,
      ...(input.axes === undefined
        ? {}
        : { axes: Object.freeze({ ...input.axes }) }),
    });
    const admittedActionProjection = Object.freeze({
      simulationTick: actionProjection.simulationTick,
      activeActionStatesById: Object.freeze({
        ...actionProjection.activeActionStatesById,
      }),
    });
    const nextFixedInputReplayHistory = this.nextFixedInputReplayHistory(Object.freeze({
      kind: "fixed-input" as const,
      input: admittedInput,
      actionProjection: admittedActionProjection,
    }));
    const beforeRuntimeProjection = this.snapshot();
    const beforeWorldProjection = this.gameplayWorldProjection();
    this.preparedFixedInput = Object.freeze({
      beforeRuntimeProjection,
      beforeWorldProjection,
      beforeLatestRenderReadyReceipt: this.latestRenderReadyReceipt,
    });
    let projectedWorldStateAfter: ReturnType<
      BabylonGameplayRuntimeInternalV1["readWorldProjection"]
    >;
    try {
      projectedWorldStateAfter = await this.runGameplayFixedInputTick(
        admittedInput,
        admittedActionProjection,
      );
    } catch (error) {
      try {
        await this.restorePreparedFixedInput();
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Transactional Runtime Tick prepare failed and its checkpoint could not be restored.",
        );
      }
      throw error;
    }
    let lifecycle: "prepared" | "committed" | "aborted" = "prepared";
    let abortPromise: Promise<void> | undefined;
    return Object.freeze({
      projectedWorldStateAfter,
      projectedViewStateAfter: this.gameplayPublishedState.viewProjection,
      commitPrepared: (): void => {
        if (lifecycle !== "prepared") return;
        lifecycle = "committed";
        this.preparedFixedInput = undefined;
        this.fixedInputReplayHistory = nextFixedInputReplayHistory;
      },
      abort: (): Promise<void> => {
        if (abortPromise !== undefined) return abortPromise;
        if (lifecycle === "committed") {
          abortPromise = Promise.reject(new Error(
            "3C_TICK_TOKEN_STALE: committed Transactional Runtime Tick cannot be aborted.",
          ));
          return abortPromise;
        }
        lifecycle = "aborted";
        abortPromise = this.restorePreparedFixedInput();
        return abortPromise;
      },
    });
  }

  private nextFixedInputReplayHistory(
    entry: FixedInputReplayHistoryEntryV1,
  ): readonly FixedInputReplayHistoryEntryV1[] {
    if (this.fixedInputReplayBaseline === undefined || this.isReplayingFixedInputHistory) {
      return this.fixedInputReplayHistory;
    }
    return Object.freeze([...this.fixedInputReplayHistory, entry]);
  }

  private async applyFixedInputReplayHistoryEntry(
    entry: FixedInputReplayHistoryEntryV1,
  ): Promise<void> {
    if (entry.kind === "fixed-input") {
      await this.runGameplayFixedInputTick(
        entry.input,
        entry.actionProjection,
      );
      return;
    }
    if (entry.kind === "camera-state") {
      this.latestRenderReadyReceipt = undefined;
      this.cameraComponent.restoreTransactionState(
        entry.cameraTransactionState,
      );
      this.camera.position.copyFromFloats(...entry.cameraPositionMetersXYZ);
      this.camera.fov = entry.cameraFovRadians;
      this.appliedCameraViewStateRevision =
        entry.appliedCameraViewStateRevision;
      this.pendingCameraHeadingLockBeforeNextTick =
        entry.pendingCameraHeadingLockBeforeNextTick;
      this.pendingPublishedCameraViewSyncBeforeNextTick =
        entry.pendingPublishedCameraViewSyncBeforeNextTick;
      this.publishedCameraProjection = entry.publishedCameraProjection;
      return;
    }
    this.gameplayPublishedState = entry.publishedState;
    this.publishedContactShadowCasterMeshes = this.contactShadowCasterMeshesFor(
      entry.publishedState.possessionTarget,
    );
    this.traversalConfigurationEpoch = entry.traversalConfigurationEpoch;
    this.activeInputActions = EMPTY_INPUT_ACTIONS;
    this.activeInputAxes = EMPTY_INPUT_AXES;
    this.latestRenderReadyReceipt = undefined;
    if (entry.kind === "possession") {
      if (entry.resetCameraViewPreference) {
        this.cameraComponent.resetViewPreference();
      }
      this.pendingCameraHeadingLockBeforeNextTick =
        entry.pendingCameraHeadingLockBeforeNextTick;
      this.pendingPublishedCameraViewSyncBeforeNextTick =
        entry.pendingPublishedCameraViewSyncBeforeNextTick;
      if (entry.clearPublishedCameraProjection) {
        this.publishedCameraProjection = undefined;
      }
      return;
    }
    if (entry.kind === "mount") {
      const rider = this.controllerFor(entry.relationship.riderEntityId);
      rider.setCollisionFilterMasks(0, 0);
      this.projectMountedRider(
        rider,
        entry.relationship,
        {
          subjectOrigin: new Vector3(
            ...entry.subjectOriginPositionMetersXYZ,
          ),
          facingYawRadians: entry.facingYawRadians,
        },
        entry.committedTick,
      );
      return;
    }
    if (entry.kind === "dismount") {
      const rider = this.controllerFor(entry.relationship.riderEntityId);
      rider.setCollisionFilterMasks(
        entry.riderCollisionFilterMembershipMask,
        entry.riderCollisionFilterCollideMask,
      );
      rider.resetAt(
        entry.subjectOriginPositionMetersXYZ,
        entry.facingYawRadians,
        entry.committedTick,
      );
      return;
    }

    const exhaustive: never = entry;
    throw new Error(`GOLDEN_REPLAY_HISTORY_ENTRY_UNHANDLED: ${String(exhaustive)}`);
  }

  private async restorePreparedFixedInput(): Promise<void> {
    const prepared = this.preparedFixedInput;
    const baseline = this.fixedInputReplayBaseline;
    if (prepared === undefined || baseline === undefined) {
      throw new Error("3C_TICK_TOKEN_STALE: Transactional Runtime Tick is not prepared.");
    }
    try {
      for (const projection of this.goldenProjectionsByEntityId.values()) {
        projection.reset();
      }
      this.latestGoldenCameraContextsByEntityId.clear();
      // Collision admission is part of the Body baseline. Restore it before
      // reset samples support; a mounted Rider may currently have zero masks.
      for (const [entityId, collisionFilterMasks] of
        baseline.collisionFilterMasksByEntityId) {
        this.controllerFor(entityId).setCollisionFilterMasks(
          collisionFilterMasks.membershipMask,
          collisionFilterMasks.collideMask,
        );
      }
      for (const character of this.characterEntitiesByEntityId.values()) {
        const controller = character.movement;
        if (!isCharacterMovementControllerV1(controller)) {
          throw new Error(
            "3C_INPUT_INVALID: Fixed-input replay cannot include a specialized movement owner.",
          );
        }
        controller.reset();
      }
      for (const visual of this.subjectVisuals) visual.resetAnimation();
      this.tick = 0;
      this.gameplayPublishedState = baseline.gameplayPublishedState;
      this.publishedContactShadowCasterMeshes = this.contactShadowCasterMeshesFor(
        baseline.gameplayPublishedState.possessionTarget,
      );
      this.traversalConfigurationEpoch =
        baseline.traversalConfigurationEpoch;
      this.appliedCameraViewStateRevision =
        baseline.appliedCameraViewStateRevision;
      this.pendingCameraHeadingLockBeforeNextTick =
        baseline.pendingCameraHeadingLockBeforeNextTick;
      this.pendingPublishedCameraViewSyncBeforeNextTick =
        baseline.pendingPublishedCameraViewSyncBeforeNextTick;
      this.activeInputActions = EMPTY_INPUT_ACTIONS;
      this.activeInputAxes = EMPTY_INPUT_AXES;
      this.cameraComponent.restoreTransactionState(
        baseline.cameraTransactionState,
      );
      this.camera.position.copyFromFloats(
        baseline.cameraPositionMetersXYZ[0],
        baseline.cameraPositionMetersXYZ[1],
        baseline.cameraPositionMetersXYZ[2],
      );
      this.camera.fov = baseline.cameraFovRadians;
      this.publishedCameraProjection = baseline.publishedCameraProjection;
      this.latestGoldenCameraContextsByEntityId.clear();
      for (const [entityId, context] of
        baseline.latestGoldenCameraContextsByEntityId) {
        this.latestGoldenCameraContextsByEntityId.set(entityId, context);
      }
      this.latestRenderReadyReceipt = undefined;
      for (const mounted of Object.values(
        baseline.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
      )) {
        const rider = this.controllerFor(mounted.relationship.riderEntityId);
        rider.setCollisionFilterMasks(0, 0);
        this.projectMountedRider(
          rider,
          mounted.relationship,
          this.mountedPose(mounted.relationship),
          0,
        );
      }
      this.isReplayingFixedInputHistory = true;
      try {
        for (const entry of this.fixedInputReplayHistory) {
          await this.applyFixedInputReplayHistoryEntry(entry);
        }
      } finally {
        this.isReplayingFixedInputHistory = false;
      }
      this.latestRenderReadyReceipt = prepared.beforeLatestRenderReadyReceipt;
      this.preparedFixedInput = undefined;
      const restoredProjection = this.snapshot();
      if (
        sha256CanonicalJson(restoredProjection) !==
          sha256CanonicalJson(prepared.beforeRuntimeProjection)
      ) {
        throw new Error(
          "3C_TICK_TOKEN_STALE: Transactional Runtime replay did not restore the committed Snapshot.",
        );
      }
    } catch (error) {
      this.preparedFixedInput = undefined;
      throw error;
    }
  }

  private async runGameplayFixedInputTick(
    input: Parameters<BabylonGameplayRuntimeInternalV1["prepareFixedInputTick"]>[0],
    actionProjection: GameplayFixedTickActionProjectionV1,
  ): Promise<ReturnType<BabylonGameplayRuntimeInternalV1["readWorldProjection"]>> {
    this.assertUsable();
    if (input.ticks !== 1) {
      throw new RangeError("Gameplay Runtime input must contain exactly one fixed Tick.");
    }
    this.assertActionProjectionForNextTick(actionProjection);
    this.assertAdmittedGoldenActionProjection(actionProjection);
    this.latestRenderReadyReceipt = undefined;
    const targetEntityId = this.gameplayPublishedState.possessionTarget.mode ===
        "possessed"
      ? this.gameplayPublishedState.possessionTarget.controlledEntityId
      : undefined;
    const targetIsBound = !isNil(targetEntityId);
    this.activeInputActions = targetIsBound ? [...input.actions] : [];
    this.activeInputAxes = targetIsBound && !isNil(input.axes)
      ? { ...input.axes }
      : {};
    this.cameraComponent.setInputActions(this.activeInputActions);
    this.lockPublishedCameraHeadingBeforeTick();
    const viewControlFrame = this.cameraComponent.controlFrame(this.tick);
    for (const subject of this.runtimeSubjects) {
      const controller = this.controllerFor(subject.entityId);
      if (!isNil(this.gameplayPublishedState
        .mountedRelationshipsByRiderEntityId[subject.entityId])) {
        continue;
      }
      const isTarget = subject.entityId === targetEntityId;
      if (isCharacterMovementControllerV1(controller)) {
        const activeActionState = this.goldenActionStateForSubject(
          actionProjection,
          subject.entityId,
        );
        controller.step(
          isTarget ? input.actions : [],
          viewControlFrame,
          isTarget ? input.axes : undefined,
          activeActionState,
          this.goldenCameraContextAuthorityForSubject(
            subject.entityId,
            targetEntityId,
          ),
        );
      } else if (isTarget || controller.movementMedium !== "ground") {
        controller.step(
          isTarget ? input.actions : [],
          viewControlFrame,
          isTarget ? input.axes : undefined,
        );
      } else {
        controller.stop();
        controller.publishSupport();
      }
    }
    this.commitFixedTick({
      cameraMode: "gameplay-target",
      targetEntityId,
    });
    return this.gameplayWorldProjection(true);
  }

  private assertActionProjectionForNextTick(
    actionProjection: GameplayFixedTickActionProjectionV1,
  ): void {
    if (
      actionProjection === undefined ||
      actionProjection.simulationTick !== this.tick + 1
    ) {
      throw new Error(
        "3C_ACTION_TICK_MISMATCH: committed Action projection must match the next Movement Tick.",
      );
    }
  }

  private assertAdmittedGoldenActionProjection(
    actionProjection: GameplayFixedTickActionProjectionV1,
  ): void {
    for (const subject of this.runtimeSubjects) {
      if (!isCharacterMovementControllerV1(this.controllerFor(subject.entityId))) {
        continue;
      }
      this.goldenActionStateForSubject(actionProjection, subject.entityId);
    }
  }

  private goldenActionStateForSubject(
    actionProjection: GameplayFixedTickActionProjectionV1,
    subjectEntityId: string,
  ): GameplayActionStateV1 | undefined {
    const matches = Object.entries(
      actionProjection.activeActionStatesById,
    ).filter(([, state]) => state.actorEntityId === subjectEntityId);
    if (matches.length > 1) {
      throw new Error(
        "3C_ACTION_AUTHORITY_AMBIGUOUS: Golden Subject has more than one active committed Action.",
      );
    }
    const match = matches[0];
    if (match === undefined) return undefined;
    const [actionExecutionId, state] = match;
    if (state.id !== actionExecutionId) {
      throw new Error(
        "3C_ACTION_AUTHORITY_INVALID: Action projection key does not match its execution id.",
      );
    }
    return state;
  }

  /**
   * Bring the bounded Havok residency ring in line with the union of every
   * active Subject position. Visual batches are untouched: physics residency
   * must never cull rendering.
   */
  private updateNativeColliderResidencyBeforeTick(): void {
    const positions = this.runtimeSubjects.map((subject) => {
      const origin = this.controllerFor(subject.entityId).subjectOrigin;
      return [origin.x, origin.y, origin.z] as const;
    });
    this.updateNativeColliderResidencyForPositions(positions);
  }

  private updateNativeColliderResidencyForPositions(
    positions: readonly RuntimeVec3V1[],
  ): void {
    const residency = this.nativeColliderResidency;
    if (isNil(residency)) return;
    if (!residency.update(positions)) return;
    const previous = this.nativeColliderRegistry;
    if (isNil(previous)) return;
    const replacement = createBabylonNativeLiveColliderRegistryV1({
      handles: residency.activeHandles(),
      requiresSourceBlockJoins: previous.requiresSourceBlockJoins,
      residency: residencyEvidence(residency),
      parts: residency.partInventory(),
    });
    replaceBabylonNativeLiveColliderRegistryV1(
      this.scene,
      previous,
      replacement,
    );
    this.nativeColliderRegistry = replacement;
  }

  private commitFixedTick(input: Readonly<
    | {
        cameraMode: "gameplay-target";
        targetEntityId: string | undefined;
      }
    | {
        cameraMode: "controlled-entity";
      }
  >): void {
    this.updateNativeColliderResidencyBeforeTick();
    const physicsEngine = this.scene.getPhysicsEngine();
    if (physicsEngine === null) throw new Error("WORLDKIT_HAVOK_ENGINE_MISSING");
    physicsEngine._step(FIXED_TIME_STEP_SECONDS);
    this.tick += 1;
    for (const subject of this.runtimeSubjects) {
      const controller = this.controllerFor(subject.entityId);
      const visual = this.visualFor(subject.entityId);
      if (!isNil(this.gameplayPublishedState
        .mountedRelationshipsByRiderEntityId[subject.entityId])) {
        continue;
      }
      controller.synchronizeVisual();
      if (!isCharacterMovementControllerV1(controller)) {
        visual.stepAnimation(committedPresentationFromLocomotionMode(
          this.tick,
          controller.motionSnapshot().locomotionMode,
        ));
      }
    }
    for (const mounted of Object.values(
      this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
    ).sort((left, right) =>
      compareCodeUnits(
        left.relationship.riderEntityId,
        right.relationship.riderEntityId,
      ))) {
      const pose = this.mountedPose(mounted.relationship);
      const rider = this.controllerFor(mounted.relationship.riderEntityId);
      this.projectMountedRider(rider, mounted.relationship, pose, this.tick);
      this.visualFor(mounted.relationship.riderEntityId)
        .stepAnimation(committedPresentationFromLocomotionMode(
          this.tick,
          "suspended",
        ));
    }
    this.reconcileSemanticFacts();
    if (input.cameraMode === "gameplay-target") {
      if (!isNil(input.targetEntityId)) {
        this.updateCameraForEntity(input.targetEntityId);
      }
      this.publishCameraProjection();
      return;
    }
    const controlledEntityId = this.controlledEntityId();
    if (controlledEntityId !== undefined) {
      const controlled = this.controllerFor(controlledEntityId);
      if (!isCharacterMovementControllerV1(controlled)) {
        this.updateCameraForEntity(controlledEntityId);
      } else {
        const context = this.latestGoldenCameraContextsByEntityId.get(
          controlledEntityId,
        );
        if (context?.committedTick === this.tick) {
          // The fixed-input transaction already published this Tick's Camera
          // Context. Stamp the view revision so render cannot reset the session.
          this.appliedCameraViewStateRevision =
            this.gameplayPublishedState.viewProjection.viewStateRevision;
        } else {
          // Trusted Traversal drives the same CharacterMovement authority
          // directly and therefore needs the Host to derive its Camera Context.
          this.updateCameraForEntity(controlledEntityId);
        }
      }
    }
    this.publishCameraProjection();
  }

  private resetToTraversalAnchor(input: Readonly<{
    traversingEntityId: string;
    subjectOriginPositionMetersXYZ: RuntimeVec3V1;
    facingYawRadians: number;
  }>): void {
    this.assertUsable();
    this.assertCommittedCameraViewEpoch();
    if (input.traversingEntityId !== this.controlledEntityId()) {
      throw new Error("TRAVERSAL_RUNTIME_NOT_CONTROLLED");
    }
    const mountedRelationships = Object.values(
      this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
    );
    const mountedRiderEntityIds = new Set(
      mountedRelationships.map(({ relationship }) => relationship.riderEntityId),
    );
    if (mountedRiderEntityIds.has(input.traversingEntityId)) {
      throw new Error("TRAVERSAL_RUNTIME_MOUNTED_SUBJECT_UNSUPPORTED");
    }
    this.characterMovementControllerFor(input.traversingEntityId);
    this.updateNativeColliderResidencyForPositions(
      this.runtimeSubjects.map((subject) =>
        subject.entityId === input.traversingEntityId
          ? input.subjectOriginPositionMetersXYZ
          : subject.spawnSubjectOriginPositionMetersXYZ),
    );
    this.traversalConfigurationEpoch += 1;
    for (const subject of this.runtimeSubjects) {
      const controller = this.controllerFor(subject.entityId);
      if (mountedRiderEntityIds.has(subject.entityId)) continue;
      if (subject.entityId === input.traversingEntityId) {
        this.characterMovementControllerFor(subject.entityId).resetAt(
          input.subjectOriginPositionMetersXYZ,
          input.facingYawRadians,
          0,
        );
      } else {
        controller.reset();
      }
    }
    this.tick = 0;
    for (const mounted of mountedRelationships) {
      const rider = this.controllerFor(mounted.relationship.riderEntityId);
      this.projectMountedRider(
        rider,
        mounted.relationship,
        this.mountedPose(mounted.relationship),
        this.tick,
      );
    }
    for (const visual of this.subjectVisuals) visual.resetAnimation();
    this.activeInputActions = [];
    this.activeInputAxes = {};
    this.cameraComponent.reset();
    this.latestGoldenCameraContextsByEntityId.clear();
    this.latestSpecializedCameraContextsByEntityId.clear();
    this.latestRenderReadyReceipt = undefined;
    this.gameplayPublishedState = Object.freeze({
      ...this.gameplayPublishedState,
      semanticFactsById: Object.freeze({}),
    });
    this.reconcileSemanticFacts();
    this.updateCamera();
    this.publishCameraProjection();
  }

  private runTraversalFixedTick(input: Readonly<{
    traversingEntityId: string;
    walkDirectionWorldXZ: readonly [number, number];
  }>): void {
    this.assertUsable();
    if (input.traversingEntityId !== this.controlledEntityId()) {
      throw new Error("TRAVERSAL_RUNTIME_NOT_CONTROLLED");
    }
    if (Object.prototype.hasOwnProperty.call(
      this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
      input.traversingEntityId,
    )) {
      throw new Error("TRAVERSAL_RUNTIME_MOUNTED_SUBJECT_UNSUPPORTED");
    }
    this.characterMovementControllerFor(input.traversingEntityId);
    this.latestRenderReadyReceipt = undefined;
    this.activeInputActions = [];
    this.activeInputAxes = {};
    this.cameraComponent.setInputActions([]);
    const mountedRiderEntityIds = new Set(Object.keys(
      this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
    ));
    for (const subject of this.runtimeSubjects) {
      const controller = this.controllerFor(subject.entityId);
      if (mountedRiderEntityIds.has(subject.entityId)) continue;
      if (isCharacterMovementControllerV1(controller)) {
        const direction = subject.entityId === input.traversingEntityId
          ? input.walkDirectionWorldXZ
          : [0, 0] as const;
        const before = controller.movementSnapshot();
        controller.runCommand({
          schemaVersion: 1,
          tick: before.tick + 1,
          fixedDeltaSeconds: FIXED_TIME_STEP_SECONDS,
          // CharacterMovement input is view-relative; with zero view yaw,
          // world +Z is input -Z.
          movementInputXZ: [
            direction[0] === 0 ? 0 : direction[0],
            direction[1] === 0 ? 0 : -direction[1],
          ],
          facingInputXZ: [
            direction[0] === 0 ? 0 : direction[0],
            direction[1] === 0 ? 0 : -direction[1],
          ],
          runRequested: false,
          jumpPressed: false,
          jumpHeld: false,
          viewYawRadians: 0,
          layeredMoves: [],
        });
      } else if (
        controller.movementMedium !== "ground"
      ) {
        controller.stepCommand({ kind: "none" });
      } else {
        controller.publishSupport();
      }
    }
    this.commitFixedTick({ cameraMode: "controlled-entity" });
  }

  snapshot(): BabylonRuntimeProjectionV1 {
    this.assertUsable();
    if (this.preparedFixedInput !== undefined) {
      return this.preparedFixedInput.beforeRuntimeProjection;
    }
    const possessionTarget = this.gameplayPublishedState.possessionTarget;
    const controlledEntityId = this.controlledEntityId();
    const subjectStatesByEntityId: Record<
      string,
      BabylonRuntimeProjectionV1["subjectStatesByEntityId"][string]
    > = {};
    for (const subject of this.runtimeSubjects) {
      const controller = this.controllerFor(subject.entityId);
      const subjectOrigin = controller.subjectOrigin;
      const velocity = controller.velocity;
      if (isCharacterMovementControllerV1(controller)) {
        const locomotion = controller.locomotionStateV2();
        const forward = controller.forward;
        subjectStatesByEntityId[subject.entityId] = {
          entityId: subject.entityId,
          subjectDefinitionRef: subject.subjectDefinitionRef,
          subjectDefinitionHash: subject.subjectDefinitionHash,
          positionMetersXYZ: canonicalizeVec3([
            subjectOrigin.x,
            subjectOrigin.y,
            subjectOrigin.z,
          ]),
          velocityMetersPerSecondXYZ: canonicalizeVec3([
            velocity.x,
            velocity.y,
            velocity.z,
          ]),
          movementMedium: locomotion.status === "active"
            ? locomotion.movementMedium
            : "ground",
          activeActionId: this.visualFor(subject.entityId).activeActionId,
          forwardXYZ: canonicalizeVec3([forward.x, forward.y, forward.z]),
          speedMetersPerSecond: locomotion.status === "active"
            ? locomotion.horizontalSpeedMetersPerSecond
            : 0,
          activeControlFeelProfileRef: subject.controlFeel.resourceRef,
          activePhysicsBodyProfileRef: subject.physicsBodyProfileRef,
          activeLocomotionProfileRef: subject.locomotionProfileRef,
          locomotionMode: locomotionModeFromV2(locomotion),
          activeMotionProfileRef:
            subject.capabilityAssembly.defaultMotionProfile.resourceRef,
          movementOwner: "character-movement",
          motionTags: locomotion.status === "active"
            ? [
                `mobility:${locomotion.mobilityMode}`,
                `gait:${locomotion.gait}`,
                `vertical:${locomotion.verticalPhase}`,
              ]
            : ["mobility:suspended"],
          locomotion,
          safeFallbackActive: false,
        };
      } else {
        const motion = controller.motionSnapshot();
        subjectStatesByEntityId[subject.entityId] = {
          entityId: subject.entityId,
          subjectDefinitionRef: subject.subjectDefinitionRef,
          subjectDefinitionHash: subject.subjectDefinitionHash,
          positionMetersXYZ: [subjectOrigin.x, subjectOrigin.y, subjectOrigin.z],
          velocityMetersPerSecondXYZ: [velocity.x, velocity.y, velocity.z],
          movementMedium: controller.movementMedium,
          activeActionId: this.visualFor(subject.entityId).activeActionId,
          forwardXYZ: motion.forwardXYZ,
          speedMetersPerSecond: motion.speedMetersPerSecond,
          activeControlFeelProfileRef: motion.activeControlFeelProfileRef,
          activePhysicsBodyProfileRef: motion.activePhysicsBodyProfileRef,
          activeLocomotionProfileRef: motion.activeLocomotionProfileRef,
          locomotionMode: motion.locomotionMode,
          activeMotionProfileRef: motion.activeMotionProfileRef,
          movementOwner: "specialized-motion",
          activeMotionKernelRef: motion.activeMotionKernelRef,
          motionTags: motion.motionTags,
          safeFallbackActive: motion.fallbackActive,
          ...(motion.lastFailureCode === undefined
            ? {}
            : { motionFailureCode: motion.lastFailureCode }),
        };
      }
    }
    const publishedCameraProjection = this.publishedCameraProjection ??
      this.captureCurrentCameraProjection();
    const cameraDirectorSnapshot = publishedCameraProjection.director;
    return {
      runtimeBackend: "babylon-havok",
      tick: this.tick,
      ready: true,
      possessionTarget,
      subjectStatesByEntityId,
      physics: { backend: "havok", ready: true, fixedTimeStepSeconds: FIXED_TIME_STEP_SECONDS },
      camera: {
        entityId: this.worldRuntimeBootstrap.initialCamera.cameraEntityId,
        ...(controlledEntityId === undefined ||
            cameraDirectorSnapshot.selectionDecision === undefined
          ? {}
          : {
              targetEntityId:
                cameraDirectorSnapshot.selectionDecision.targetEntityId,
            }),
        positionMetersXYZ: canonicalizeVec3([
          ...publishedCameraProjection.positionMetersXYZ,
        ]),
        activeCameraProfileRef: cameraDirectorSnapshot.activeCameraProfileRef,
        activeCameraRigRef: cameraDirectorSnapshot.activeCameraRigRef,
        activeCameraModifierRefs: cameraDirectorSnapshot.activeCameraModifierRefs,
        safeFallbackActive: cameraDirectorSnapshot.fallbackActive,
        viewYawOffsetRadians: cameraDirectorSnapshot.viewYawOffsetRadians,
        viewPitchOffsetRadians: cameraDirectorSnapshot.viewPitchOffsetRadians,
        viewDistanceOffsetMeters: cameraDirectorSnapshot.viewDistanceOffsetMeters,
        ...(cameraDirectorSnapshot.selectionDecision === undefined
          ? {}
          : { selectionDecision: cameraDirectorSnapshot.selectionDecision }),
        ...(cameraDirectorSnapshot.selectedTargetSocketId === undefined
          ? {}
          : { selectedTargetSocketId: cameraDirectorSnapshot.selectedTargetSocketId }),
        ...(cameraDirectorSnapshot.targetSocketPositionMetersXYZ === undefined
          ? {}
          : {
              targetSocketPositionMetersXYZ: canonicalizeVec3(
                cameraDirectorSnapshot.targetSocketPositionMetersXYZ,
              ),
            }),
        ...(cameraDirectorSnapshot.isTargetSocketFallback === undefined
          ? {}
          : { isTargetSocketFallback: cameraDirectorSnapshot.isTargetSocketFallback }),
        ...(cameraDirectorSnapshot.desiredTargetPositionMetersXYZ === undefined
          ? {}
          : {
              desiredTargetPositionMetersXYZ: canonicalizeVec3(
                cameraDirectorSnapshot.desiredTargetPositionMetersXYZ,
              ),
            }),
        ...(cameraDirectorSnapshot.desiredPositionMetersXYZ === undefined
          ? {}
          : {
              desiredPositionMetersXYZ: canonicalizeVec3(
                cameraDirectorSnapshot.desiredPositionMetersXYZ,
              ),
            }),
        ...(cameraDirectorSnapshot.actualPositionMetersXYZ === undefined
          ? {}
          : {
              actualPositionMetersXYZ: canonicalizeVec3(
                cameraDirectorSnapshot.actualPositionMetersXYZ,
              ),
            }),
        ...(cameraDirectorSnapshot.finalFovDegrees === undefined
          ? {}
          : { finalFovDegrees: cameraDirectorSnapshot.finalFovDegrees }),
        ...(cameraDirectorSnapshot.requestedArmLengthMeters === undefined
          ? {}
          : { requestedArmLengthMeters: cameraDirectorSnapshot.requestedArmLengthMeters }),
        ...(cameraDirectorSnapshot.safeArmLengthMeters === undefined
          ? {}
          : { safeArmLengthMeters: cameraDirectorSnapshot.safeArmLengthMeters }),
        ...(cameraDirectorSnapshot.effectiveArmLengthMeters === undefined
          ? {}
          : { effectiveArmLengthMeters: cameraDirectorSnapshot.effectiveArmLengthMeters }),
        ...(cameraDirectorSnapshot.isCollisionRetracted === undefined
          ? {}
          : { isCollisionRetracted: cameraDirectorSnapshot.isCollisionRetracted }),
        ...(cameraDirectorSnapshot.collisionHitEntityId === undefined
          ? {}
          : { collisionHitEntityId: cameraDirectorSnapshot.collisionHitEntityId }),
        ...(cameraDirectorSnapshot.collisionHitPositionXYZ === undefined
          ? {}
          : {
              collisionHitPositionXYZ: canonicalizeVec3(
                cameraDirectorSnapshot.collisionHitPositionXYZ,
              ),
            }),
        ...(cameraDirectorSnapshot.collisionHitNormalXYZ === undefined
          ? {}
          : {
              collisionHitNormalXYZ: canonicalizeVec3(
                cameraDirectorSnapshot.collisionHitNormalXYZ,
              ),
            }),
        ...(cameraDirectorSnapshot.decollisionPhase === undefined
          ? {}
          : { decollisionPhase: cameraDirectorSnapshot.decollisionPhase }),
        ...(cameraDirectorSnapshot.startedOverlapping === undefined
          ? {}
          : { startedOverlapping: cameraDirectorSnapshot.startedOverlapping }),
        ...(cameraDirectorSnapshot.penetrationDepthMeters === undefined
          ? {}
          : { penetrationDepthMeters: cameraDirectorSnapshot.penetrationDepthMeters }),
        ...(cameraDirectorSnapshot.clearHoldRemainingSeconds === undefined
          ? {}
          : {
              clearHoldRemainingSeconds:
                cameraDirectorSnapshot.clearHoldRemainingSeconds,
            }),
        ...(cameraDirectorSnapshot.positionLagXYZ === undefined
          ? {}
          : {
              positionLagXYZ: canonicalizeVec3(
                cameraDirectorSnapshot.positionLagXYZ,
              ),
            }),
        ...(cameraDirectorSnapshot.rotationLagRadiansXYZ === undefined
          ? {}
          : {
              rotationLagRadiansXYZ: canonicalizeVec3(
                cameraDirectorSnapshot.rotationLagRadiansXYZ,
              ),
            }),
        ...(cameraDirectorSnapshot.recenterRemainingSeconds === undefined
          ? {}
          : {
              recenterRemainingSeconds:
                cameraDirectorSnapshot.recenterRemainingSeconds,
            }),
        ...(cameraDirectorSnapshot.fixedStepDeltaSeconds === undefined
          ? {}
          : { fixedStepDeltaSeconds: cameraDirectorSnapshot.fixedStepDeltaSeconds }),
        ...(cameraDirectorSnapshot.resolvedParameters === undefined
          ? {}
          : {
              resolvedParameters: Object.freeze({
                ...cameraDirectorSnapshot.resolvedParameters,
              }),
            }),
        ...(cameraDirectorSnapshot.previewParameterOverrides === undefined
          ? {}
          : {
              previewParameterOverrides: Object.freeze({
                ...cameraDirectorSnapshot.previewParameterOverrides,
              }),
            }),
        ...(cameraDirectorSnapshot.profileTransitionProgressRatio === undefined
          ? {}
          : {
              profileTransitionProgressRatio:
                cameraDirectorSnapshot.profileTransitionProgressRatio,
            }),
        ...(cameraDirectorSnapshot.controlForwardXYZ === undefined
          ? {}
          : {
              controlForwardXYZ: canonicalizeVec3(
                cameraDirectorSnapshot.controlForwardXYZ,
              ),
            }),
        ...(cameraDirectorSnapshot.subjectForwardXYZ === undefined
          ? {}
          : {
              subjectForwardXYZ: canonicalizeVec3(
                cameraDirectorSnapshot.subjectForwardXYZ,
              ),
            }),
        ...(cameraDirectorSnapshot.subjectVelocityMetersPerSecondXYZ === undefined
          ? {}
          : {
              subjectVelocityMetersPerSecondXYZ: canonicalizeVec3(
                cameraDirectorSnapshot.subjectVelocityMetersPerSecondXYZ,
              ),
            }),
      },
      resources: {
        meshes: this.scene.meshes.length,
        bodies: (this.scene.getPhysicsEngine() as PhysicsEngine | null)?.getBodies().length ?? 0,
        terrainSamples: this.terrainSampleCount,
      },
    };
  }

  reset(): BabylonRuntimeProjectionV1 {
    this.assertUsable();
    if (this.preparedFixedInput !== undefined) {
      throw new Error(
        "3C_TICK_TOKEN_STALE: cannot reset while a Transactional Runtime Tick is prepared.",
      );
    }
    this.updateNativeColliderResidencyForPositions(
      this.runtimeSubjects.map(({ spawnSubjectOriginPositionMetersXYZ }) =>
        spawnSubjectOriginPositionMetersXYZ),
    );
    this.traversalConfigurationEpoch += 1;
    for (const mounted of Object.values(
      this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
    )) {
      const rider = this.controllerFor(mounted.relationship.riderEntityId);
      rider.setCollisionFilterMasks(
        mounted.riderCollisionFilterMembershipMask,
        mounted.riderCollisionFilterCollideMask,
      );
    }
    for (const projection of this.goldenProjectionsByEntityId.values()) {
      projection.reset();
    }
    this.latestGoldenCameraContextsByEntityId.clear();
    this.latestSpecializedCameraContextsByEntityId.clear();
    for (const character of this.characterEntitiesByEntityId.values()) {
      character.movement.reset();
    }
    for (const visual of this.subjectVisuals) visual.resetAnimation();
    this.tick = 0;
    this.gameplayPublishedState = Object.freeze({
      possessionTarget: Object.freeze({ mode: "unbound" }),
      mountedRelationshipsByRiderEntityId: Object.freeze({}),
      semanticFactsById: Object.freeze({}),
      viewProjection: Object.freeze({ viewStateRevision: 0 }),
    });
    this.publishedContactShadowCasterMeshes = new Set();
    this.initializeInitialMountedRelationships();
    this.reconcileSemanticFacts();
    this.appliedCameraViewStateRevision = 0;
    this.pendingCameraHeadingLockBeforeNextTick = false;
    this.pendingPublishedCameraViewSyncBeforeNextTick = false;
    this.fixedInputReplayHistory = [];
    this.fixedInputReplayBaseline = undefined;
    this.isReplayingFixedInputHistory = false;
    this.activeInputActions = [];
    this.activeInputAxes = {};
    this.cameraComponent.reset();
    this.latestRenderReadyReceipt = undefined;
    this.updateCamera();
    this.publishCameraProjection();
    return this.snapshot();
  }

  getControlCaptureCapabilities(): ControlCaptureCapabilitiesV1 {
    this.assertUsable();
    const capabilities = this.engine.getCaps();
    const diagnostics: ControlCaptureCapabilitiesV1["diagnostics"][number][] = [];
    if (!capabilities.textureFloatRender) {
      diagnostics.push({
        code: "CONTROL_CAPTURE_FLOAT_RENDER_UNAVAILABLE",
        message: "The active graphics device cannot render required float depth and normal targets.",
      });
    }
    if (!capabilities.drawBuffersExtension) {
      diagnostics.push({
        code: "CONTROL_CAPTURE_MRT_UNAVAILABLE",
        message: "The active graphics device cannot render the required world-normal G-buffer.",
      });
    }
    const maximumDimensionPixels = Math.min(capabilities.maxTextureSize, 4_096);
    return {
      kind: "worldkit-control-capture-capabilities",
      schemaVersion: 1,
      available: diagnostics.length === 0,
      captureProfileRef: "worldkit://capture/profile/control-video@1",
      captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1",
      requiredPassIds: CONTROL_CAPTURE_PASS_IDS_V1,
      maximumWidthPixels: maximumDimensionPixels,
      maximumHeightPixels: maximumDimensionPixels,
      diagnostics,
    };
  }

  waitForRenderReady(expectedSimulationTick: number): RenderReadyReceiptV1 {
    this.assertUsable();
    if (!Number.isSafeInteger(expectedSimulationTick) || expectedSimulationTick < 0) {
      throw new RangeError("Expected Simulation Tick must be a non-negative safe integer.");
    }
    this.assertCommittedCameraViewEpoch();
    if (this.latestRenderReadyReceipt?.simulationTick !== expectedSimulationTick) {
      throw new Error("CONTROL_CAPTURE_RENDER_READY_REQUIRED: No rendered frame matches the requested Simulation Tick.");
    }
    return this.latestRenderReadyReceipt;
  }

  async captureControlFrame(
    request: ControlCaptureRequestV1,
  ): Promise<BabylonControlCaptureFrameV1> {
    this.assertUsable();
    if (!Number.isSafeInteger(request.captureFrameIndex) || request.captureFrameIndex < 0) {
      throw new RangeError("Capture Frame Index must be a non-negative safe integer.");
    }
    if (!Number.isSafeInteger(request.expectedSimulationTick) || request.expectedSimulationTick < 0) {
      throw new RangeError("Expected Simulation Tick must be a non-negative safe integer.");
    }
    this.assertCommittedCameraViewEpoch();
    const receipt = this.latestRenderReadyReceipt;
    if (
      receipt === undefined ||
      receipt.id !== request.renderReadyReceiptId ||
      receipt.simulationTick !== request.expectedSimulationTick ||
      receipt.runtimeSessionId !== this.runtimeSessionId
    ) {
      throw new Error("CONTROL_CAPTURE_RENDER_READY_REQUIRED: Capture requires the exact current Render Ready receipt.");
    }
    const capabilities = this.getControlCaptureCapabilities();
    if (!capabilities.available) {
      throw new Error("CONTROL_CAPTURE_CAPABILITY_UNAVAILABLE: The active graphics device cannot produce the locked pass set.");
    }
    if (
      !Number.isSafeInteger(request.widthPixels) ||
      !Number.isSafeInteger(request.heightPixels) ||
      request.widthPixels < 1 ||
      request.heightPixels < 1 ||
      request.widthPixels > capabilities.maximumWidthPixels ||
      request.heightPixels > capabilities.maximumHeightPixels
    ) {
      throw new RangeError("Capture dimensions exceed the active graphics device limits.");
    }
    const snapshot = this.snapshot();
    const cameraRigRef = snapshot.camera.activeCameraRigRef;
    if (cameraRigRef === undefined) {
      throw new Error("CONTROL_CAPTURE_CAMERA_RIG_UNAVAILABLE");
    }
    if (this.autoStartRenderLoop) this.engine.stopRenderLoop(this.renderLoop);
    try {
      return await captureBabylonControlFrameV1({
        engine: this.engine,
        scene: this.scene,
        camera: this.camera,
        runtimeSessionId: this.runtimeSessionId,
        captureFrameIndex: request.captureFrameIndex,
        simulationTick: receipt.simulationTick,
        renderFrameIndex: receipt.renderFrameIndex,
        renderReadyReceiptId: receipt.id,
        widthPixels: request.widthPixels,
        heightPixels: request.heightPixels,
        cameraEntityId: this.worldRuntimeBootstrap.initialCamera.cameraEntityId,
        cameraRigRef,
        snapshot,
      });
    } finally {
      if (this.autoStartRenderLoop && !this.disposed) {
        this.engine.runRenderLoop(this.renderLoop);
      }
    }
  }

  renderFrame(interpolationAlphaRatio = 1): RenderReadyReceiptV1 {
    this.assertUsable();
    if (
      !Number.isFinite(interpolationAlphaRatio) ||
      interpolationAlphaRatio < 0 ||
      interpolationAlphaRatio > 1
    ) {
      throw new RangeError(
        "3C_RENDER_INTERPOLATION_INVALID: alpha must be finite from 0 through 1.",
      );
    }
    for (const subject of this.runtimeSubjects) {
      this.controllerFor(subject.entityId).renderVisual(interpolationAlphaRatio);
    }
    for (const visual of this.subjectVisuals) visual.applyAnimationPose();
    this.scene.render();
    const receipt: RenderReadyReceiptV1 = {
      kind: "worldkit-render-ready-receipt",
      schemaVersion: 1,
      id: `render-ready:${this.runtimeSessionId}:${this.renderFrameIndex}`,
      runtimeSessionId: this.runtimeSessionId,
      simulationTick: this.tick,
      renderFrameIndex: this.renderFrameIndex,
    };
    this.renderFrameIndex += 1;
    this.latestRenderReadyReceipt = receipt;
    return receipt;
  }

  /**
   * Provider-internal bootstrap publication. RuntimeHost calls this only after
   * the candidate's initial control.bind has committed and before its first
   * readiness render. Ordinary bind/rebind and Relationship transitions must
   * wait for the next fixed Tick instead.
   */
  publishInitialBoundCameraView(
    expectedViewStateRevision: number,
  ): BabylonRuntimeProjectionV1 {
    this.assertUsable();
    if (
      !Number.isSafeInteger(expectedViewStateRevision) ||
      expectedViewStateRevision < 0 ||
      expectedViewStateRevision !==
        this.gameplayPublishedState.viewProjection.viewStateRevision
    ) {
      throw new Error("WORLDKIT_RUNTIME_INITIAL_CAMERA_VIEW_REVISION_MISMATCH");
    }
    if (this.preparedFixedInput !== undefined) {
      throw new Error("WORLDKIT_RUNTIME_INITIAL_CAMERA_VIEW_TICK_PREPARED");
    }
    const controlledEntityId = this.controlledEntityId();
    if (controlledEntityId === undefined) {
      if (expectedViewStateRevision === 0) return this.snapshot();
      throw new Error("WORLDKIT_RUNTIME_INITIAL_CAMERA_VIEW_UNBOUND");
    }
    if (
      this.tick !== 0 ||
      this.latestRenderReadyReceipt !== undefined ||
      this.fixedInputReplayBaseline !== undefined
    ) {
      throw new Error("WORLDKIT_RUNTIME_INITIAL_CAMERA_VIEW_PHASE_INVALID");
    }
    if (
      this.publishedCameraProjection?.director.selectionDecision !== undefined
    ) {
      if (this.appliedCameraViewStateRevision === expectedViewStateRevision) {
        return this.snapshot();
      }
      throw new Error("WORLDKIT_RUNTIME_INITIAL_CAMERA_VIEW_ALREADY_PUBLISHED");
    }
    this.updateCameraForEntity(controlledEntityId, 0);
    this.publishCameraProjection();
    return this.snapshot();
  }

  /** @internal Formal evidence from the controlled Body owner's committed Tick. */
  readCommittedSupportEvidence(
    subjectEntityId: string,
  ): BabylonCharacterBodyCommittedSupportEvidenceV1 | undefined {
    this.assertUsable();
    const controller = this.controllerFor(subjectEntityId);
    return isCharacterMovementControllerV1(controller)
      ? controller.readCommittedSupportEvidence()
      : controller.readCommittedSupportEvidence(this.tick);
  }

  /** Provider-internal artifact capture; public Authoring and Browser DTOs stay engine-neutral. */
  captureArtifactView(
    request: BabylonArtifactCaptureRequestV1,
  ): BabylonArtifactCaptureResultV1 {
    this.assertUsable();
    this.assertCommittedCameraViewEpoch();
    return captureBabylonArtifactViewV1({
      scene: this.scene,
      engine: this.engine,
      camera: this.camera,
      request,
    });
  }

  async renderFrameWhenReady(): Promise<RenderReadyReceiptV1> {
    this.assertUsable();
    await this.scene.whenReadyAsync();
    return this.renderFrame();
  }

  resize(): void {
    this.assertUsable();
    this.engine.resize();
    this.latestRenderReadyReceipt = undefined;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    let renderLoopStopFailed = false;
    try {
      this.engine.stopRenderLoop(this.renderLoop);
    } catch {
      renderLoopStopFailed = true;
    }
    try {
      await disposeOwnedStack(this.ownedDisposers);
    } catch (error) {
      if (renderLoopStopFailed) throw new WorldRuntimeDisposeErrorV1();
      throw error;
    }
    if (renderLoopStopFailed) throw new WorldRuntimeDisposeErrorV1();
  }

  private detectMovementMedium(
    controller: LiveSubjectControllerV1,
  ): PublishedMovementMediumV1 {
    if (isCharacterMovementControllerV1(controller)) {
      const locomotion = controller.locomotionStateV2();
      return locomotion.status === "active" ? locomotion.movementMedium : "ground";
    }
    return controller.movementMedium;
  }

  private updateCamera(): void {
    const controlledEntityId = this.controlledEntityId();
    if (controlledEntityId !== undefined) {
      this.updateCameraForEntity(controlledEntityId);
    }
  }

  private goldenCameraContextAuthorityForSubject(
    subjectEntityId: string,
    committedControlledEntityId: string | undefined,
  ) {
    if (committedControlledEntityId === undefined) return undefined;
    return resolveCameraViewTargetContextV1({
      controlledEntityId: committedControlledEntityId,
      targetEntityId: subjectEntityId,
      mountedRelationships: Object.values(
        this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
      ).map((projection) => projection.relationship),
    });
  }

  private captureCurrentCameraProjection(): Readonly<{
    director: CameraDirectorSnapshotV1;
    positionMetersXYZ: RuntimeVec3V1;
  }> {
    return Object.freeze({
      director: this.cameraComponent.snapshot(),
      positionMetersXYZ: canonicalizeVec3([
        this.camera.position.x,
        this.camera.position.y,
        this.camera.position.z,
      ]),
    });
  }

  private publishCameraProjection(): void {
    this.publishedCameraProjection = this.captureCurrentCameraProjection();
  }

  private journalCommittedCameraState(): void {
    if (this.fixedInputReplayBaseline === undefined || this.isReplayingFixedInputHistory) {
      return;
    }
    const entry = Object.freeze({
      kind: "camera-state" as const,
      cameraTransactionState: this.cameraComponent.captureTransactionState(),
      cameraPositionMetersXYZ: Object.freeze([
        canonicalizeSignedZero(this.camera.position.x),
        canonicalizeSignedZero(this.camera.position.y),
        canonicalizeSignedZero(this.camera.position.z),
      ]) as RuntimeVec3V1,
      cameraFovRadians: this.camera.fov,
      appliedCameraViewStateRevision: this.appliedCameraViewStateRevision,
      pendingCameraHeadingLockBeforeNextTick:
        this.pendingCameraHeadingLockBeforeNextTick,
      pendingPublishedCameraViewSyncBeforeNextTick:
        this.pendingPublishedCameraViewSyncBeforeNextTick,
      publishedCameraProjection: this.publishedCameraProjection,
    });
    const previousEntry = this.fixedInputReplayHistory.at(-1);
    this.fixedInputReplayHistory = previousEntry?.kind === "camera-state"
      ? Object.freeze([...this.fixedInputReplayHistory.slice(0, -1), entry])
      : Object.freeze([...this.fixedInputReplayHistory, entry]);
  }

  private isCameraViewEpochPending(): boolean {
    return this.preparedFixedInput !== undefined ||
      this.pendingCameraHeadingLockBeforeNextTick ||
      this.pendingPublishedCameraViewSyncBeforeNextTick ||
      this.appliedCameraViewStateRevision !==
        this.gameplayPublishedState.viewProjection.viewStateRevision;
  }

  private assertCommittedCameraViewEpoch(): void {
    if (this.isCameraViewEpochPending()) {
      throw new Error("WORLDKIT_RUNTIME_CAMERA_VIEW_EPOCH_PENDING");
    }
  }

  private lockPublishedCameraHeadingBeforeTick(): void {
    if (
      !this.pendingCameraHeadingLockBeforeNextTick &&
      !this.pendingPublishedCameraViewSyncBeforeNextTick
    ) {
      return;
    }
    const controlledEntityId = this.controlledEntityId();
    if (!isNil(controlledEntityId)) {
      if (this.pendingCameraHeadingLockBeforeNextTick) {
        // Initial bind locks control heading from Subject facing without
        // publishing a Camera Context. The Golden Tick still owns the one
        // Motion Kernel update().
        const facingYawRadians =
          this.controllerFor(controlledEntityId).facingYawRadians;
        this.cameraComponent.initializeControlHeading([
          canonicalizeSignedZero(-Math.sin(facingYawRadians)),
          0,
          canonicalizeSignedZero(-Math.cos(facingYawRadians)),
        ]);
      }
      if (this.pendingPublishedCameraViewSyncBeforeNextTick) {
        // Possessed A→B rebind must publish the new view before controlFrame
        // so orbit heading is taken from the new Subject, not the previous one.
        this.synchronizePublishedCameraView(0);
      }
    }
    this.pendingCameraHeadingLockBeforeNextTick = false;
    this.pendingPublishedCameraViewSyncBeforeNextTick = false;
  }

  private synchronizePublishedCameraView(deltaSeconds = 0): void {
    const controlledEntityId = this.controlledEntityId();
    if (
      isNil(controlledEntityId) ||
      this.appliedCameraViewStateRevision ===
        this.gameplayPublishedState.viewProjection.viewStateRevision
    ) {
      return;
    }
    this.updateCameraForEntity(controlledEntityId, deltaSeconds);
  }

  private synchronizeCameraViewSession(): void {
    const publishedViewStateRevision =
      this.gameplayPublishedState.viewProjection.viewStateRevision;
    if (this.appliedCameraViewStateRevision === publishedViewStateRevision) {
      return;
    }
    this.cameraComponent.reset();
    this.latestSpecializedCameraContextsByEntityId.clear();
    this.appliedCameraViewStateRevision = publishedViewStateRevision;
  }

  private updateCameraForEntity(
    entityId: string,
    deltaSeconds = FIXED_TIME_STEP_SECONDS,
  ): void {
    this.synchronizeCameraViewSession();
    this.synchronizeCameraGeometrySubjectQueryState();
    const subject = this.runtimeSubjects.find(
      (candidate) => candidate.entityId === entityId,
    );
    if (subject === undefined) {
      throw new Error(
        `WORLDKIT_RUNTIME_CONTROL_TARGET_NOT_FOUND: ${entityId}`,
      );
    }
    this.pendingCameraHeadingLockBeforeNextTick = false;
    this.pendingPublishedCameraViewSyncBeforeNextTick = false;
    const controller = this.controllerFor(subject.entityId);
    if (isCharacterMovementControllerV1(controller)) {
      const committedControlledEntityId = this.controlledEntityId();
      if (committedControlledEntityId === undefined) {
        throw new Error(
          "WORLDKIT_RUNTIME_CAMERA_STATE_INVALID: Golden Camera projection requires committed control authority.",
        );
      }
      let context = this.latestGoldenCameraContextsByEntityId.get(
        subject.entityId,
      );
      if (
        context === undefined ||
        context.committedTick !== this.tick ||
        context.controlledEntityId !== committedControlledEntityId ||
        context.targetEntityId !== subject.entityId
      ) {
        const committed = controller.movementSnapshot();
        const cameraViewTargetContext = resolveCameraViewTargetContextV1({
          controlledEntityId: committedControlledEntityId,
          targetEntityId: subject.entityId,
          mountedRelationships: Object.values(
            this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
          ).map((projection) => projection.relationship),
        });
        context = parseCameraContextSampleV2({
          schemaVersion: 2,
          semanticAuthorityStatus: "available",
          committedTick: committed.tick,
          controlledEntityId: cameraViewTargetContext.controlledEntityId,
          targetEntityId: cameraViewTargetContext.targetEntityId,
          subjectPose: {
            positionMetersXYZ: committed.positionMetersXYZ,
            facingYawRadians: committed.facingYawRadians,
          },
          locomotion: committed.locomotion,
          actionSummary: {
            status: "available",
            activeActionRefs: [],
            isInterruptible: true,
          },
          environment: {
            relationshipContexts:
              cameraViewTargetContext.relationshipContexts,
            socketPositionsMetersXYZById: projectLockedLocalCameraSocketsV1(
              subject,
              committed.positionMetersXYZ,
              committed.facingYawRadians,
            ),
            cameraContextTags: [],
          },
        });
        this.latestGoldenCameraContextsByEntityId.set(subject.entityId, context);
      }
      const locomotion = context.locomotion;
      const velocity = locomotion.status === "active"
        ? locomotion.linearVelocity
        : { x: 0, y: 0, z: 0 };
      const facingYawRadians = context.subjectPose.facingYawRadians;
      const sample: ViewTargetSampleV1 = {
        controlledEntityId: context.controlledEntityId,
        entityId: context.targetEntityId,
        targetPositionMetersXYZ: context.subjectPose.positionMetersXYZ,
        forwardXYZ: [
          canonicalizeSignedZero(-Math.sin(facingYawRadians)),
          0,
          canonicalizeSignedZero(-Math.cos(facingYawRadians)),
        ],
        upXYZ: [0, 1, 0],
        velocityMetersPerSecondXYZ: [
          velocity.x,
          velocity.y,
          velocity.z,
        ],
        approximateRadiusMeters: subject.collider.radiusMeters,
        socketPositionsMetersXYZById:
          context.environment.socketPositionsMetersXYZById,
        movementMedium: locomotion.status === "active"
          ? locomotion.movementMedium
          : "ground",
        relationshipContexts: context.environment.relationshipContexts,
        cameraContextTags: context.environment.cameraContextTags,
      };
      this.cameraComponent.update(
        subject.capabilityAssembly.cameraContext,
        sample,
        deltaSeconds,
        context,
        this.characterFor(subject.entityId).springArm,
      );
      return;
    }
    const origin = controller.subjectOrigin;
    const velocity = controller.velocity;
    const motion = controller.motionSnapshot();
    const socketPositionsMetersXYZById = projectLockedLocalCameraSocketsV1(
      subject,
      canonicalizeVec3([origin.x, origin.y, origin.z]),
      controller.facingYawRadians,
    );
    const cameraViewTargetContext = resolveCameraViewTargetContextV1({
      controlledEntityId: this.controlledEntityId() ?? subject.entityId,
      targetEntityId: subject.entityId,
      mountedRelationships: Object.values(
        this.gameplayPublishedState.mountedRelationshipsByRiderEntityId,
      ).map((projection) => projection.relationship),
    });
    const sample: ViewTargetSampleV1 = {
      controlledEntityId: cameraViewTargetContext.controlledEntityId,
      entityId: subject.entityId,
      targetPositionMetersXYZ: [origin.x, origin.y, origin.z],
      forwardXYZ: motion.forwardXYZ,
      upXYZ: [0, 1, 0],
      velocityMetersPerSecondXYZ: [velocity.x, velocity.y, velocity.z],
      approximateRadiusMeters: subject.collider.radiusMeters,
      socketPositionsMetersXYZById,
      movementMedium: this.detectMovementMedium(controller),
      relationshipContexts: cameraViewTargetContext.relationshipContexts,
      cameraContextTags: [
        ...(hasForwardControlIntentV1(
          subject.capabilityAssembly.controlProfile,
          controller.activeControlFeel.moveResponseExponent,
          this.activeInputActions,
          this.activeInputAxes,
        )
          ? ["forward-intent"]
          : []),
        ...(this.activeInputActions.includes("aim") ? ["aim"] : []),
        ...(this.activeInputActions.includes("run") ||
            this.activeInputActions.includes("boost")
          ? ["sprint"]
          : []),
        ...(Vector3.Dot(velocity, new Vector3(...motion.forwardXYZ)) < -0.1
          ? ["reverse"]
          : []),
      ],
    };
    let committedCameraContext =
      this.latestSpecializedCameraContextsByEntityId.get(subject.entityId);
    if (committedCameraContext?.committedTick !== this.tick) {
      committedCameraContext = committedCameraContextFromViewTargetV2(
        sample,
        this.tick,
        motion.locomotionMode,
        controller.facingYawRadians,
      );
      this.latestSpecializedCameraContextsByEntityId.set(
        subject.entityId,
        committedCameraContext,
      );
    }
    this.cameraComponent.update(
      subject.capabilityAssembly.cameraContext,
      sample,
      deltaSeconds,
      committedCameraContext,
      this.characterFor(subject.entityId).springArm,
    );
  }

  private synchronizeCameraGeometrySubjectQueryState(): void {
    for (const runtimeSubject of this.runtimeSubjects) {
      this.cameraGeometryQuery.setEntityQueryEnabled(
        runtimeSubject.entityId,
        this.gameplayPublishedState.mountedRelationshipsByRiderEntityId[
          runtimeSubject.entityId
        ] === undefined,
      );
    }
  }

  setCameraViewPreference(
    preference: CameraViewPreferenceV1,
  ): BabylonRuntimeProjectionV1 {
    this.assertUsable();
    this.assertCommittedCameraViewEpoch();
    const controlledEntityId = this.controlledEntityId();
    const subject = this.runtimeSubjects.find(
      (candidate) => candidate.entityId === controlledEntityId,
    );
    if (subject === undefined) {
      throw new Error(
        `WORLDKIT_RUNTIME_CONTROL_TARGET_NOT_FOUND: ${String(controlledEntityId)}`,
      );
    }
    this.synchronizeCameraViewSession();
    const admission = this.cameraComponent.setViewPreference(
      subject.capabilityAssembly.cameraContext,
      preference,
    );
    if (!admission.ok) {
      throw new RangeError(admission.diagnostics.map((row) => row.code).join(","));
    }
    this.latestRenderReadyReceipt = undefined;
    this.updateCamera();
    this.publishCameraProjection();
    this.journalCommittedCameraState();
    return this.snapshot();
  }

  resetCameraViewPreference(): BabylonRuntimeProjectionV1 {
    this.assertUsable();
    this.assertCommittedCameraViewEpoch();
    this.synchronizeCameraViewSession();
    this.cameraComponent.resetViewPreference();
    this.latestRenderReadyReceipt = undefined;
    this.updateCamera();
    this.publishCameraProjection();
    this.journalCommittedCameraState();
    return this.snapshot();
  }

  prepareCameraViewPreference(
    preference: CameraViewPreferenceV1,
  ): PreparedBabylonCameraViewMutationV1 {
    return this.prepareCameraViewMutation(() => {
      this.setCameraViewPreference(preference);
    });
  }

  prepareCameraViewPreferenceReset(): PreparedBabylonCameraViewMutationV1 {
    return this.prepareCameraViewMutation(() => {
      this.resetCameraViewPreference();
    });
  }

  private prepareCameraViewMutation(
    apply: () => void,
  ): PreparedBabylonCameraViewMutationV1 {
    this.assertUsable();
    this.assertCommittedCameraViewEpoch();
    const checkpoint = Object.freeze({
      camera: this.cameraComponent.captureTransactionState(),
      cameraPositionMetersXYZ: Object.freeze([
        this.camera.position.x,
        this.camera.position.y,
        this.camera.position.z,
      ] as const),
      cameraFovRadians: this.camera.fov,
      latestRenderReadyReceipt: this.latestRenderReadyReceipt,
      appliedCameraViewStateRevision: this.appliedCameraViewStateRevision,
      publishedCameraProjection: this.publishedCameraProjection,
      fixedInputReplayHistory: this.fixedInputReplayHistory,
    });
    const restore = (): void => {
      this.cameraComponent.restoreTransactionState(checkpoint.camera);
      this.camera.position.copyFromFloats(...checkpoint.cameraPositionMetersXYZ);
      this.camera.fov = checkpoint.cameraFovRadians;
      this.latestRenderReadyReceipt = checkpoint.latestRenderReadyReceipt;
      this.appliedCameraViewStateRevision = checkpoint.appliedCameraViewStateRevision;
      this.publishedCameraProjection = checkpoint.publishedCameraProjection;
      this.fixedInputReplayHistory = checkpoint.fixedInputReplayHistory;
    };
    const previous = this.snapshot();
    let next: BabylonRuntimeProjectionV1;
    try {
      apply();
      next = this.snapshot();
    } finally {
      restore();
    }
    let state: "prepared" | "committed" | "rolled-back" = "prepared";
    return Object.freeze({
      previous,
      next,
      commitPrepared: (): void => {
        if (state !== "prepared") {
          throw new Error(`Camera View mutation is already ${state}.`);
        }
        try {
          apply();
          state = "committed";
        } catch (error) {
          restore();
          state = "rolled-back";
          throw error;
        }
      },
      rollbackPrepared: (): void => {
        if (state === "rolled-back") return;
        restore();
        state = "rolled-back";
      },
    });
  }

  adjustCameraView(input: CameraViewInputV1): BabylonRuntimeProjectionV1 {
    this.assertUsable();
    this.assertCommittedCameraViewEpoch();
    if (![input.yawDeltaRadians ?? 0, input.pitchDeltaRadians ?? 0, input.zoomDeltaMeters ?? 0]
      .every(Number.isFinite)) {
      throw new RangeError("Camera view deltas must be finite numbers.");
    }
    this.synchronizeCameraViewSession();
    if (!this.cameraComponent.adjustView(input)) {
      throw new RangeError("Camera view deltas must be finite numbers.");
    }
    this.latestRenderReadyReceipt = undefined;
    this.updateCamera();
    this.publishCameraProjection();
    this.journalCommittedCameraState();
    return this.snapshot();
  }

  resetCameraView(): BabylonRuntimeProjectionV1 {
    this.assertUsable();
    this.assertCommittedCameraViewEpoch();
    this.synchronizeCameraViewSession();
    this.cameraComponent.resetView();
    this.latestRenderReadyReceipt = undefined;
    this.updateCamera();
    this.publishCameraProjection();
    this.journalCommittedCameraState();
    return this.snapshot();
  }

  getCameraPreviewState(): CameraPreviewStateV1 {
    this.assertUsable();
    return this.cameraComponent.previewState();
  }

  applyCameraPreview(request: ApplyCameraPreviewRequestV1): CameraPreviewStateV1 {
    this.assertUsable();
    this.assertCommittedCameraViewEpoch();
    const tuningByProfileRef = request?.tuningByProfileRef;
    if (
      isNil(tuningByProfileRef) ||
      typeof tuningByProfileRef !== "object" ||
      Array.isArray(tuningByProfileRef)
    ) {
      throw new Error("SUBJECT_PRESET_INVALID_CAMERA_TUNING");
    }
    const controlledEntityId = this.controlledEntityId();
    const subject = this.runtimeSubjects.find(
      (candidate) => candidate.entityId === controlledEntityId,
    );
    if (subject === undefined) {
      throw new Error(
        `WORLDKIT_RUNTIME_CONTROL_TARGET_NOT_FOUND: ${String(controlledEntityId)}`,
      );
    }
    if (!this.cameraComponent.applyPreview(
      tuningByProfileRef,
      subject.capabilityAssembly.cameraContext,
    )) {
      throw new Error("SUBJECT_PRESET_INVALID_CAMERA_TUNING");
    }
    this.latestRenderReadyReceipt = undefined;
    this.updateCamera();
    this.publishCameraProjection();
    this.journalCommittedCameraState();
    return this.cameraComponent.previewState();
  }

  requestMotionProfile(subjectEntityId: string, motionProfileRef: string): boolean {
    this.assertUsable();
    const controller = this.controllerFor(subjectEntityId);
    if (isCharacterMovementControllerV1(controller)) {
      const subject = this.runtimeSubjects.find(
        (candidate) => candidate.entityId === subjectEntityId,
      )!;
      if (
        motionProfileRef !==
          subject.capabilityAssembly.defaultMotionProfile.resourceRef
      ) {
        throw new Error("SUBJECT_OVERRIDE_FORBIDDEN: Golden locomotion is compiler-locked.");
      }
      return true;
    }
    const changed = controller.requestMotionProfile(motionProfileRef);
    if (changed) {
      this.traversalConfigurationEpoch += 1;
      this.latestRenderReadyReceipt = undefined;
    }
    return changed;
  }

  requestControlFeelProfile(subjectEntityId: string, resourceRef: string): boolean {
    this.assertUsable();
    const controller = this.controllerFor(subjectEntityId);
    if (isCharacterMovementControllerV1(controller)) {
      const subject = this.runtimeSubjects.find(
        (candidate) => candidate.entityId === subjectEntityId,
      )!;
      if (resourceRef !== subject.controlFeel.resourceRef) {
        throw new Error("SUBJECT_OVERRIDE_FORBIDDEN: Golden Control Feel is compiler-locked.");
      }
      return true;
    }
    const changed = controller.requestControlFeelProfile(resourceRef);
    if (changed) {
      this.traversalConfigurationEpoch += 1;
      this.latestRenderReadyReceipt = undefined;
    }
    return changed;
  }

  applySubjectPresetTuning(
    request: ApplySubjectPresetTuningRequestV1,
  ): BabylonSubjectPresetTuningReceiptV1 {
    this.assertUsable();
    const reject = (
      code: string,
      message: string,
    ): BabylonSubjectPresetTuningReceiptV1 => ({
      status: "rejected",
      diagnostic: { code, message },
      snapshot: this.snapshot(),
    });
    if (this.isCameraViewEpochPending()) {
      return reject(
        "WORLDKIT_RUNTIME_CAMERA_VIEW_EPOCH_PENDING",
        "Camera tuning requires the committed Gameplay view epoch from the next fixed Tick.",
      );
    }
    const subject = this.runtimeSubjects.find(
      (candidate) => candidate.entityId === request.subjectEntityId,
    );
    if (subject === undefined) {
      return reject(
        "SUBJECT_PRESET_SUBJECT_NOT_FOUND",
        `Subject '${request.subjectEntityId}' was not found.`,
      );
    }
    if (
      subject.subjectDefinitionRef !== request.expectedSubjectDefinitionRef ||
      subject.subjectDefinitionHash !== request.expectedSubjectDefinitionContentHash
    ) {
      return reject(
        "SUBJECT_PRESET_BASE_MISMATCH",
        "The active Subject Definition does not match the locked preset base.",
      );
    }
    const assembly = subject.capabilityAssembly;
    const controller = this.controllerFor(subject.entityId);
    if (isCharacterMovementControllerV1(controller)) {
      return reject(
        "SUBJECT_PRESET_GOLDEN_RECOMPILE_REQUIRED",
        "Golden Subject tuning is compiler-locked and requires a new Execution Plan.",
      );
    }
    const controlFeelProfiles = [
      subject.controlFeel,
      ...subject.availableControlFeels.filter(
        (profile) => profile.resourceRef !== subject.controlFeel.resourceRef,
      ),
    ];
    const selectedControlFeelProfile = controlFeelProfiles.find(
      (profile) => profile.resourceRef === request.selectedControlFeelProfileRef,
    );
    if (selectedControlFeelProfile === undefined) {
      return reject(
        "SUBJECT_PRESET_CONTROL_FEEL_PROFILE_MISMATCH",
        "The selected Control Feel Profile is not locked in the Subject Execution Plan.",
      );
    }
    if (request.selectedControlProfileRef !== assembly.controlProfile.resourceRef) {
      return reject(
        "SUBJECT_PRESET_CONTROL_PROFILE_MISMATCH",
        "The selected Control Profile does not match the exact locked Control Profile.",
      );
    }
    const selectableMotionRefs = [
      assembly.defaultMotionProfile.resourceRef,
      ...assembly.optionalMotionProfiles.map((profile) => profile.resourceRef),
      assembly.fallbackMotionProfile.resourceRef,
    ];
    if (!selectableMotionRefs.includes(request.selectedMotionProfileRef)) {
      return reject(
        "SUBJECT_PRESET_MOTION_SELECTION_UNREACHABLE",
        "The selected Motion Profile is not locked in the Subject Execution Plan.",
      );
    }
    if (!controller.requestControlFeelProfile(selectedControlFeelProfile.resourceRef)) {
      throw new Error(
        "Preset profile validation diverged from fixed-tick Runtime application.",
      );
    }
    if (!controller.requestMotionProfile(request.selectedMotionProfileRef)) {
      throw new Error(
        "Preset Motion selection validation diverged from fixed-tick Runtime application.",
      );
    }
    this.traversalConfigurationEpoch += 1;
    this.latestRenderReadyReceipt = undefined;
    this.updateCamera();
    this.publishCameraProjection();
    return { status: "committed", snapshot: this.snapshot() };
  }

  async runHarness(subjectEntityId: string): Promise<SubjectHarnessReportV1> {
    this.assertUsable();
    const subject = this.runtimeSubjects.find((row) => row.entityId === subjectEntityId);
    if (subject === undefined) throw new Error(`WORLDKIT_RUNTIME_SUBJECT_NOT_FOUND: ${subjectEntityId}`);
    const controller = this.controllerFor(subjectEntityId);
    const golden = isCharacterMovementControllerV1(controller);
    const motion = golden ? undefined : controller.motionSnapshot();
    const state = this.snapshot().subjectStatesByEntityId[subjectEntityId]!;
    const assembly = subject.capabilityAssembly;
    const activeMotionKernel = golden ? undefined : assembly.motionKernels.find(
      (candidate) => candidate.resourceRef === motion!.activeMotionKernelRef,
    );
    const finiteState = [
      ...state.positionMetersXYZ,
      ...state.velocityMetersPerSecondXYZ,
      state.speedMetersPerSecond,
    ].every(Number.isFinite);
    const mediumCompatible =
      state.movementMedium === "ground" || state.movementMedium === "air";
    const cameraState = this.snapshot().camera;
    const cameraFinite = cameraState.positionMetersXYZ.every(Number.isFinite);
    const availableSocketIds = new Set(subject.sockets.map((socket) => socket.id));
    const relationshipSocketCoverage = assembly.relationshipProfiles.every(
      (profile) => {
        if (profile.relationshipType === "mountedOn") {
          const riderAvailable = profile.requiredRiderSocketIds.every(
            (socketId) => availableSocketIds.has(socketId),
          );
          const mountAvailable = profile.requiredMountSocketIds.every(
            (socketId) => availableSocketIds.has(socketId),
          );
          return riderAvailable || mountAvailable;
        }
        if (profile.relationshipType === "seat") {
          const occupantAvailable = profile.requiredOccupantSocketIds.every(
            (socketId) => availableSocketIds.has(socketId),
          );
          const seatAvailable = profile.requiredSeatSocketIds.every(
            (socketId) => availableSocketIds.has(socketId),
          );
          return occupantAvailable || seatAvailable;
        }
        const tetheredAvailable = profile.requiredTetheredSocketIds.every(
          (socketId) => availableSocketIds.has(socketId),
        );
        const anchorAvailable = profile.requiredTetherAnchorSocketIds.every(
          (socketId) => availableSocketIds.has(socketId),
        );
        return tetheredAvailable || anchorAvailable;
      },
    );
    const checks: SubjectHarnessReportV1["checks"] = [
      {
        checkId: "H01",
        status:
          golden || activeMotionKernel?.commandKind === assembly.controlProfile.commandKind
            ? "passed"
            : "failed",
        message: "Control Profile and Motion Kernel command semantics agree.",
      },
      {
        checkId: "H02",
        status: finiteState && state.speedMetersPerSecond < 100 ? "passed" : "failed",
        message: "Committed transform and velocity are finite and bounded.",
      },
      {
        checkId: "H03",
        status: mediumCompatible ? "passed" : "failed",
        message: "Committed movement medium is supported by the active Kernel.",
      },
      {
        checkId: "H04",
        status:
          assembly.relationshipProfiles.length === 0
            ? "not-exercised"
            : relationshipSocketCoverage
              ? "passed"
              : "failed",
        message: "Declared Seat/Tether profiles have a compatible source or target Socket set.",
      },
      {
        checkId: "H05",
        status: cameraFinite ? "passed" : "failed",
        message: "Camera output is finite and uses the shared Director fallback chain.",
      },
      {
        checkId: "H06",
          status: (this.scene.getPhysicsEngine() as PhysicsEngine | null)?.getBodies().length === this.expectedPhysicsBodyCount
          ? "passed"
          : "not-exercised",
        message: "Runtime resource ownership is tracked for disposal.",
      },
      {
        checkId: "H07",
        status: "not-exercised",
        message: "Use the deterministic replay test fixture for a two-session comparison.",
      },
      {
        checkId: "H08",
        status: "passed",
        message: "The package runs from its locked Execution Plan without a World Model connection.",
      },
      {
        checkId: "H09",
        status:
          golden || assembly.fallbackMotionProfile.resourceRef.length > 0
            ? "passed"
            : "failed",
        message: "Safe fallback is declared and invalid states are trapped by the Kernel Runtime.",
      },
    ];
    return {
      subjectEntityId,
      passed: checks.every((check) => check.status !== "failed"),
      checks,
      tick: this.tick,
    };
  }

  private characterFor(subjectEntityId: string): BabylonCharacterEntityV1 {
    const character = this.characterEntitiesByEntityId.get(subjectEntityId);
    if (character === undefined) {
      throw new Error(`WORLDKIT_RUNTIME_SUBJECT_NOT_FOUND: ${subjectEntityId}`);
    }
    return character;
  }

  private controllerFor(subjectEntityId: string): LiveSubjectControllerV1 {
    return this.characterFor(subjectEntityId).movement;
  }

  private characterMovementControllerFor(
    subjectEntityId: string,
  ): CharacterMovementSubjectControllerV1 {
    const controller = this.controllerFor(subjectEntityId);
    if (!isCharacterMovementControllerV1(controller)) {
      throw new Error(
        "3C_TRANSACTIONAL_GAMEPLAY_CONTROL_UNSUPPORTED: hosted Gameplay requires CharacterMovement-backed planar-vector Subjects.",
      );
    }
    return controller;
  }

  private controlledEntityId(): string | undefined {
    return this.gameplayPublishedState.possessionTarget.mode === "possessed"
      ? this.gameplayPublishedState.possessionTarget.controlledEntityId
      : undefined;
  }

  private contactShadowCasterMeshesFor(
    target: BabylonGameplayPossessionTargetV1,
  ): ReadonlySet<AbstractMesh> {
    if (this.contactShadowGenerator === undefined || target.mode === "unbound") {
      return new Set();
    }
    const visual = this.subjectVisualsByEntityId.get(target.controlledEntityId);
    return new Set(visual?.meshes ?? []);
  }

  private visualFor(subjectEntityId: string): SubjectVisual {
    const visual = this.subjectVisualsByEntityId.get(subjectEntityId);
    if (visual === undefined) {
      throw new Error(`WORLDKIT_RUNTIME_SUBJECT_NOT_FOUND: ${subjectEntityId}`);
    }
    return visual;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("WORLDKIT_RUNTIME_DISPOSED");
  }
}
