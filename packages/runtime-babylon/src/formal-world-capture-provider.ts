import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  babylonNativeBlockLiveVisualHandleMeshV1,
  peekBabylonNativeBlockLiveHandleRegistryV1,
  type BabylonNativeBlockLiveHandleRegistryV1,
  type BabylonNativeBlockLiveVisualHandleV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import {
  FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1,
  hashBabylonNativeBlockMaterializerMetadataV1,
  hashFormalArtifactViewRequestV1,
  hashFormalColliderOverlayObservationV1,
  hashFormalColliderOverlayRequestV1,
  hashFormalOpeningObservationV1,
  hashFormalScriptedTraversalObservationV1,
  hashFormalScriptedTraversalRequestV1,
  hashFormalSemanticCaptureMapV1,
  hashFormalSpawnSupportObservationV1,
  hashFormalWorldCaptureRequestV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalSpawnSupportObservationV1,
  parseFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureRequestV1,
  type BabylonNativeBlockMaterializerMetadataV1,
  type FixedInputV1,
  type FormalArtifactViewRequestV1,
  type FormalColliderOverlayObservationV1,
  type FormalMeasuredObservationIdentityV1,
  type FormalOpeningObservationV1,
  type FormalScriptedTraversalObservationV1,
  type FormalSpawnSupportObservationV1,
  type FormalTraversalCheckpointSpatialCriterionV1,
  type FormalWorldCaptureReceiptV1,
  type FormalWorldCaptureRequestV1,
  type FormalWorldCaptureSdkOwnerIdentityV1,
  type BabylonNativeStaticColliderContributionV1,
  type WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import {
  sha256Bytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import type { VerifiedBabylonNativeWorldPackageDirectoryV1 } from
  "@whitebox-world/world-package";
import { isNil } from "lodash-es";

import type {
  BabylonCharacterBodyCommittedSupportEvidenceV1,
} from "./babylon-character-body-port.js";
import {
  peekBabylonNativeLiveColliderRegistryV1,
  type BabylonNativeLiveColliderRegistryV1,
} from "./babylon-native-live-collider-registry.js";
import type {
  BabylonArtifactCaptureRequestV1,
  BabylonArtifactCaptureResultV1,
} from "./artifact-capture.js";
import {
  measureFormalWorldCaptureViewV1,
  type FormalWorldCaptureViewMeasurementV1,
} from "./formal-world-capture-measurement.js";
import {
  CommittedSupportSelectionErrorV1,
  selectUniqueCommittedSupportContactV1,
} from "./runtime-session-subject-support.js";

export interface FormalHostedWorldCapturePayloadV1 {
  readonly openingPng: Uint8Array;
  readonly worldSidePng: Uint8Array;
  readonly worldTopDownPng: Uint8Array;
  readonly colliderOverlayPng: Uint8Array;
  readonly openingObservation: FormalOpeningObservationV1;
  readonly spawnSupportObservation: FormalSpawnSupportObservationV1;
  readonly colliderOverlayObservation: FormalColliderOverlayObservationV1;
  readonly scriptedTraversal: FormalScriptedTraversalObservationV1;
  readonly receiptWithoutCleanup: Omit<FormalWorldCaptureReceiptV1, "cleanupOutcome">;
}

export interface FormalWorldCaptureProviderPortsV1 {
  resetWithInitialControlBinding(): Promise<WorldRuntimeSnapshotV4>;
  awaitRenderReady(): Promise<void>;
  runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV4>;
  snapshot(): WorldRuntimeSnapshotV4;
  captureArtifactView(
    request: BabylonArtifactCaptureRequestV1,
  ): BabylonArtifactCaptureResultV1;
  readCommittedSupportEvidence(
    subjectEntityId: string,
  ): BabylonCharacterBodyCommittedSupportEvidenceV1 | undefined;
}

export interface ExecuteFormalWorldCaptureProviderInputV1 {
  readonly request: FormalWorldCaptureRequestV1;
  /** Trusted Host-resolved identities bound to the exact clean source commit. */
  readonly sdkOwnerIdentities: readonly FormalWorldCaptureSdkOwnerIdentityV1[];
  readonly verifiedWorldPackage: VerifiedBabylonNativeWorldPackageDirectoryV1;
  readonly runtimeSessionId: string;
  readonly ports: FormalWorldCaptureProviderPortsV1;
}

const SDK_OWNER_IMPLEMENTATION_REF_BY_ID = Object.freeze({
  action: "worldkit://sdk-owner/subject-actions@1",
  camera: "worldkit://sdk-owner/camera@1",
  input: "worldkit://sdk-owner/control-capture@1",
  physics: "worldkit://sdk-owner/character-movement@1",
  subject: "worldkit://sdk-owner/subject-contracts@1",
} satisfies Readonly<Record<
  (typeof FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1)[number],
  string
>>);

function fail(code: string, detail?: string): never {
  throw new Error(detail === undefined ? code : `${code}: ${detail}`);
}

/** @internal Trusted construction-boundary validation; not a public transaction input. */
export function freezeFormalWorldCaptureSdkOwnerIdentitiesV1(
  identities: readonly FormalWorldCaptureSdkOwnerIdentityV1[],
): readonly FormalWorldCaptureSdkOwnerIdentityV1[] {
  if (
    identities.length !== FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1.length ||
    identities.some((identity, index) =>
      identity.ownerId !== FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1[index] ||
      identity.implementationRef !==
        SDK_OWNER_IMPLEMENTATION_REF_BY_ID[identity.ownerId] ||
      !/^sha256:[0-9a-f]{64}$/.test(identity.implementationHash))
  ) fail("BABYLON_FORMAL_CAPTURE_SDK_OWNER_IDENTITIES_INVALID");
  return Object.freeze(identities.map((identity) => Object.freeze({ ...identity })));
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactStringSet(
  expected: readonly string[],
  actual: readonly string[],
  code: string,
): void {
  const left = [...expected].sort(stableCompare);
  const right = [...actual].sort(stableCompare);
  if (
    left.length !== right.length ||
    left.some((value, index) => value !== right[index])
  ) fail(code, `expected [${left.join(",")}] received [${right.join(",")}]`);
}

export function assertFormalCaptureLiveVisualRegistryV1(input: Readonly<{
  scene: Scene;
  materializerMetadata: Readonly<{
    blocks: readonly Readonly<{
      blockId: string;
      runtimeEntityId: string;
      semanticCaptureClassId: string;
      visualGroupId?: string;
    }>[];
    visualGroups: readonly Readonly<{
      visualGroupId: string;
      blockIds: readonly string[];
    }>[];
  }>;
  liveHandleRegistry: BabylonNativeBlockLiveHandleRegistryV1;
}>): void {
  const metadataBlockByRuntimeId = new Map(
    input.materializerMetadata.blocks.map((block) =>
      [block.runtimeEntityId, block] as const),
  );
  exactStringSet(
    [...metadataBlockByRuntimeId.keys()],
    input.liveHandleRegistry.blocks.map(({ runtimeEntityId }) => runtimeEntityId),
    "BABYLON_FORMAL_CAPTURE_LIVE_VISUAL_BLOCK_SET_INVALID",
  );
  const batchById = new Map(input.liveHandleRegistry.visualBatches.map((batch) =>
    [batch.batchId, batch] as const));
  if (batchById.size !== input.liveHandleRegistry.visualBatches.length) {
    fail("BABYLON_FORMAL_CAPTURE_LIVE_VISUAL_BATCH_IDENTITY_INVALID");
  }
  const handleByBlockId =
    new Map<string, BabylonNativeBlockLiveVisualHandleV1>();
  const batchedBlockIds = new Set<string>();
  for (const live of input.liveHandleRegistry.blocks) {
    const metadata = metadataBlockByRuntimeId.get(live.runtimeEntityId)!;
    const mesh = babylonNativeBlockLiveVisualHandleMeshV1(live);
    if (
      metadata.semanticCaptureClassId !== live.semanticCaptureClassId ||
      metadata.blockId !== live.blockId ||
      mesh.isDisposed() ||
      mesh.getScene() !== input.scene ||
      handleByBlockId.has(metadata.blockId)
    ) fail("BABYLON_FORMAL_CAPTURE_LIVE_VISUAL_BLOCK_IDENTITY_INVALID");
    if (live.kind === "thin-instance") {
      const batch = batchById.get(live.batchId);
      if (
        batch === undefined ||
        batch.mesh !== live.batchMesh ||
        batch.blockIds[live.instanceIndex] !== live.blockId ||
        !live.batchMesh.hasThinInstances ||
        live.batchMesh.thinInstanceCount !== batch.blockIds.length
      ) fail("BABYLON_FORMAL_CAPTURE_LIVE_VISUAL_BATCH_IDENTITY_INVALID");
      batchedBlockIds.add(live.blockId);
    }
    handleByBlockId.set(metadata.blockId, live);
  }
  exactStringSet(
    input.liveHandleRegistry.visualBatches.flatMap(({ blockIds }) => blockIds),
    [...batchedBlockIds],
    "BABYLON_FORMAL_CAPTURE_LIVE_VISUAL_BATCH_COVERAGE_INVALID",
  );

  exactStringSet(
    input.materializerMetadata.visualGroups.map(({ visualGroupId }) => visualGroupId),
    input.liveHandleRegistry.visualGroups.map(({ visualGroupId }) => visualGroupId),
    "BABYLON_FORMAL_CAPTURE_LIVE_VISUAL_GROUP_SET_INVALID",
  );
  const liveGroupById = new Map(input.liveHandleRegistry.visualGroups.map(
    (group) => [group.visualGroupId, group] as const,
  ));
  for (const metadataGroup of input.materializerMetadata.visualGroups) {
    const liveGroup = liveGroupById.get(metadataGroup.visualGroupId)!;
    const expectedHandles = metadataGroup.blockIds.map((blockId) =>
      handleByBlockId.get(blockId) ?? fail(
        "BABYLON_FORMAL_CAPTURE_LIVE_VISUAL_GROUP_BLOCK_MISSING",
        blockId,
      ));
    if (
      liveGroup.blockHandles.length !== expectedHandles.length ||
      new Set(liveGroup.blockHandles.map(({ blockId }) => blockId)).size !==
        liveGroup.blockHandles.length ||
      expectedHandles.some((handle) =>
        !liveGroup.blockHandles.includes(handle)) ||
      liveGroup.blockHandles.some((handle) => {
        const mesh = babylonNativeBlockLiveVisualHandleMeshV1(handle);
        return mesh.isDisposed() || mesh.getScene() !== input.scene;
      })
    ) fail("BABYLON_FORMAL_CAPTURE_LIVE_VISUAL_GROUP_IDENTITY_INVALID");
  }
}

function coordinate(
  position: readonly [number, number, number],
  axis: "x" | "y" | "z",
): number {
  return position[axis === "x" ? 0 : axis === "y" ? 1 : 2];
}

function crossedPlane(
  criterion: Extract<
    FormalTraversalCheckpointSpatialCriterionV1,
    { kind: "pass-plane" | "block-plane" }
  >,
  positionMetersXYZ: readonly [number, number, number],
): boolean {
  const value = coordinate(positionMetersXYZ, criterion.axis);
  const clearance = Math.max(
    0,
    criterion.capsuleRadiusMeters - criterion.toleranceMeters,
  );
  return criterion.expectedCenterSide === "positive"
    ? value >= criterion.planeMeters + clearance
    : value <= criterion.planeMeters - clearance;
}

export function measureFormalTraversalCheckpointV1(input: Readonly<{
  criterion: FormalTraversalCheckpointSpatialCriterionV1;
  startPositionMetersXYZ: readonly [number, number, number];
  positionMetersXYZ: readonly [number, number, number];
  tick: number;
  isFinalTick: boolean;
}>): Readonly<{
  checkpointId: string;
  outcome: "reached" | "passed" | "blocked" | "incomplete";
  observedAtTick: number;
}> | undefined {
  const criterion = input.criterion;
  if (criterion.kind === "reach-bounds") {
    const margin = criterion.capsuleRadiusMeters + criterion.toleranceMeters;
    const inside = input.positionMetersXYZ.every((value, axis) =>
      value >= criterion.sourceBoundsMeters.minimumMetersXYZ[axis]! - margin &&
      value <= criterion.sourceBoundsMeters.maximumMetersXYZ[axis]! + margin);
    if (inside) {
      return Object.freeze({
        checkpointId: criterion.checkpointId,
        outcome: "reached" as const,
        observedAtTick: input.tick,
      });
    }
    return input.isFinalTick
      ? Object.freeze({
          checkpointId: criterion.checkpointId,
          outcome: "blocked" as const,
          observedAtTick: input.tick,
        })
      : undefined;
  }
  const crossed = crossedPlane(criterion, input.positionMetersXYZ);
  if (criterion.kind === "pass-plane") {
    if (crossed) {
      return Object.freeze({
        checkpointId: criterion.checkpointId,
        outcome: "passed" as const,
        observedAtTick: input.tick,
      });
    }
    return input.isFinalTick
      ? Object.freeze({
          checkpointId: criterion.checkpointId,
          outcome: "blocked" as const,
          observedAtTick: input.tick,
        })
      : undefined;
  }
  if (crossed) {
    return Object.freeze({
      checkpointId: criterion.checkpointId,
      outcome: "passed" as const,
      observedAtTick: input.tick,
    });
  }
  if (!input.isFinalTick) return undefined;
  const axisIndex = criterion.axis === "x" ? 0 : criterion.axis === "y" ? 1 : 2;
  const startValue = coordinate(input.startPositionMetersXYZ, criterion.axis);
  const endValue = coordinate(input.positionMetersXYZ, criterion.axis);
  const nearDistanceMinimum = Math.max(
    0,
    criterion.capsuleRadiusMeters - criterion.toleranceMeters,
  );
  const nearDistanceMaximum =
    criterion.capsuleRadiusMeters + criterion.toleranceMeters;
  const startsOnApproachSide = criterion.expectedCenterSide === "positive"
    ? startValue <= criterion.planeMeters - nearDistanceMaximum
    : startValue >= criterion.planeMeters + nearDistanceMaximum;
  const approachesPlane = criterion.expectedCenterSide === "positive"
    ? endValue > startValue
    : endValue < startValue;
  const endsNearUncrossedFace = criterion.expectedCenterSide === "positive"
    ? endValue >= criterion.planeMeters - nearDistanceMaximum &&
      endValue <= criterion.planeMeters - nearDistanceMinimum
    : endValue >= criterion.planeMeters + nearDistanceMinimum &&
      endValue <= criterion.planeMeters + nearDistanceMaximum;
  const transverseMargin =
    criterion.capsuleRadiusMeters + criterion.toleranceMeters;
  const overlapsFace = ([0, 1, 2] as const)
    .filter((axis) => axis !== axisIndex)
    .every((axis) =>
      input.positionMetersXYZ[axis] >=
        criterion.sourceBoundsMeters.minimumMetersXYZ[axis]! - transverseMargin &&
      input.positionMetersXYZ[axis] <=
        criterion.sourceBoundsMeters.maximumMetersXYZ[axis]! + transverseMargin);
  return startsOnApproachSide && approachesPlane && endsNearUncrossedFace && overlapsFace
    ? Object.freeze({
        checkpointId: criterion.checkpointId,
        outcome: "blocked" as const,
        observedAtTick: input.tick,
      })
    : undefined;
}

function assertRequestPackageIdentity(
  request: FormalWorldCaptureRequestV1,
  verified: VerifiedBabylonNativeWorldPackageDirectoryV1,
): BabylonNativeBlockMaterializerMetadataV1 {
  const metadata = verified.nativeBlockMaterializerMetadata ?? fail(
    "BABYLON_FORMAL_CAPTURE_BLOCK_METADATA_REQUIRED",
  );
  const source = verified.manifest.sceneSource;
  if (
    source.kind !== "babylon-native-scene" ||
    request.worldPackageRef !== verified.receipt.worldPackageRef ||
    request.worldPackageRootHash !== verified.receipt.worldPackageRootHash ||
    request.worldBuildIdentityHash !== verified.receipt.worldBuildIdentityHash ||
    request.nativeBlockMaterializerMetadataHash !==
      hashBabylonNativeBlockMaterializerMetadataV1(metadata) ||
    request.caseHash !== metadata.caseHash ||
    request.semanticCaptureMapHash !==
      hashFormalSemanticCaptureMapV1(request.semanticCaptureMap) ||
    request.semanticCaptureMap.authoringManifestHash !== metadata.authoringManifestHash ||
    request.semanticCaptureMap.layoutInventoryHash !== metadata.checkedLayoutInventoryHash ||
    request.semanticCaptureMap.contributionHash !== metadata.contributionHash ||
    request.colliderOverlay.contributionHash !== metadata.contributionHash
  ) fail("BABYLON_FORMAL_CAPTURE_PACKAGE_IDENTITY_MISMATCH");
  return metadata;
}

function assertSnapshot(
  snapshot: WorldRuntimeSnapshotV4,
  runtimeSessionId: string,
  worldSessionId?: string,
): void {
  if (
    snapshot.runtimeSessionId !== runtimeSessionId ||
    snapshot.runtime.phase !== "ready" ||
    snapshot.resources.phase !== "ready" ||
    (worldSessionId !== undefined && snapshot.worldSessionId !== worldSessionId)
  ) fail("BABYLON_FORMAL_CAPTURE_RUNTIME_SNAPSHOT_INVALID");
}

async function resetAndSettle(
  runtimeSessionId: string,
  ports: FormalWorldCaptureProviderPortsV1,
): Promise<WorldRuntimeSnapshotV4> {
  const reset = await ports.resetWithInitialControlBinding();
  assertSnapshot(reset, runtimeSessionId);
  await ports.awaitRenderReady();
  const settled = await ports.runFixedInput({ actions: [], axes: {}, ticks: 1 });
  assertSnapshot(settled, runtimeSessionId, reset.worldSessionId);
  if (settled.world.simulationTick !== reset.world.simulationTick + 1) {
    fail("BABYLON_FORMAL_CAPTURE_NEUTRAL_TICK_NOT_COMMITTED");
  }
  await ports.awaitRenderReady();
  const ready = ports.snapshot();
  assertSnapshot(ready, runtimeSessionId, reset.worldSessionId);
  if (ready.world.simulationTick !== settled.world.simulationTick) {
    fail("BABYLON_FORMAL_CAPTURE_READY_SNAPSHOT_STALE");
  }
  return ready;
}

function openingArtifactRequest(
  view: Extract<FormalArtifactViewRequestV1, { viewId: "opening" }>,
  subjectEntityId: string,
  measureAfterRender: NonNullable<
    BabylonArtifactCaptureRequestV1["measureAfterRender"]
  >,
): BabylonArtifactCaptureRequestV1 {
  return {
    kind: "opening-frame",
    widthPixels: view.widthPixels,
    heightPixels: view.heightPixels,
    projectedEntityIds: [subjectEntityId],
    measureAfterRender,
  };
}

function controlledSubjectProjection(
  capture: BabylonArtifactCaptureResultV1,
  subjectEntityId: string,
) {
  const bounds = capture.projectedBoundsByEntityId[subjectEntityId] ?? fail(
    "BABYLON_FORMAL_CAPTURE_CONTROLLED_SUBJECT_PROJECTION_MISSING",
  );
  const [centerXRatio, centerYRatio] = bounds.centerRatioXY;
  const [widthRatio, heightRatio] = bounds.sizeRatioXY;
  if (
    ![centerXRatio, centerYRatio, widthRatio, heightRatio].every(Number.isFinite) ||
    widthRatio <= 0 || heightRatio <= 0
  ) fail("BABYLON_FORMAL_CAPTURE_CONTROLLED_SUBJECT_PROJECTION_INVALID");
  return Object.freeze({
    subjectEntityId,
    centerXBasisPoints: Math.round(centerXRatio * 10_000),
    centerYBasisPoints: Math.round(centerYRatio * 10_000),
    widthBasisPoints: Math.max(1, Math.round(widthRatio * 10_000)),
    heightBasisPoints: Math.max(1, Math.round(heightRatio * 10_000)),
    coverageBasisPoints: Math.max(
      1,
      Math.round(widthRatio * heightRatio * 10_000),
    ),
  });
}

function worldArtifactRequest(
  view: Exclude<FormalArtifactViewRequestV1, { viewId: "opening" }>,
): BabylonArtifactCaptureRequestV1 {
  return {
    kind: view.viewId === "world-side"
      ? "world-side"
      : "formal-world-top-down",
    widthPixels: view.widthPixels,
    heightPixels: view.heightPixels,
    worldBoundsMeters: view.worldBoundsMeters,
    cameraPositionMetersXYZ: view.cameraPositionMetersXYZ,
    targetMetersXYZ: view.targetMetersXYZ,
  } as BabylonArtifactCaptureRequestV1;
}

function pngBytes(result: BabylonArtifactCaptureResultV1): Uint8Array {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    result.dataUrl,
  );
  if (match === null) fail("BABYLON_FORMAL_CAPTURE_PNG_DATA_URL_INVALID");
  const binary = globalThis.atob(match[1]!);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function controlledSubjectState(
  snapshot: WorldRuntimeSnapshotV4,
  subjectEntityId: string,
) {
  return snapshot.world.subjectStatesByEntityId[subjectEntityId] ?? fail(
    "BABYLON_FORMAL_CAPTURE_CONTROLLED_SUBJECT_MISSING",
  );
}

function movementMedium(
  snapshot: WorldRuntimeSnapshotV4,
  subjectEntityId: string,
): "ground" | "air" {
  const state = Object.values(
    controlledSubjectState(snapshot, subjectEntityId).capabilityStatesById,
  ).find(({ kind }) => kind === "locomotion-capability-state-v2");
  if (
    state?.kind !== "locomotion-capability-state-v2" ||
    state.locomotion.status !== "active" ||
    (state.locomotion.movementMedium !== "ground" &&
      state.locomotion.movementMedium !== "air")
  ) fail("BABYLON_FORMAL_CAPTURE_MOVEMENT_MEDIUM_INVALID");
  return state.locomotion.movementMedium;
}

function position(
  snapshot: WorldRuntimeSnapshotV4,
  subjectEntityId: string,
): readonly [number, number, number] {
  return controlledSubjectState(snapshot, subjectEntityId)
    .entityState.positionMetersXYZ;
}

function observationIdentity(
  request: FormalWorldCaptureRequestV1,
  snapshot: WorldRuntimeSnapshotV4,
  sdkOwnerIdentities: readonly FormalWorldCaptureSdkOwnerIdentityV1[],
  ownerId: "camera" | "physics" | "input",
  suffix: string,
): FormalMeasuredObservationIdentityV1 {
  const owner = sdkOwnerIdentities.find(
    (candidate) => candidate.ownerId === ownerId,
  )!;
  return {
    id: `${request.id}.${suffix}`,
    worldPackageRef: request.worldPackageRef,
    worldPackageRootHash: request.worldPackageRootHash,
    worldBuildIdentityRef: request.worldBuildIdentityRef,
    worldBuildIdentityHash: request.worldBuildIdentityHash,
    formalRequestRef: request.formalRequestRef,
    formalRequest: request,
    formalRequestHash: hashFormalWorldCaptureRequestV1(request),
    semanticCaptureMapHash: request.semanticCaptureMapHash,
    runtimeSessionId: snapshot.runtimeSessionId,
    resetReadySnapshot: snapshot,
    resetReadySnapshotHash: sha256CanonicalJson(snapshot) as Sha256HashV1,
    domainOwnerIdentity: owner,
  };
}

function validateColliderRegistry(
  verified: VerifiedBabylonNativeWorldPackageDirectoryV1,
  metadata: BabylonNativeBlockMaterializerMetadataV1,
  registry: BabylonNativeLiveColliderRegistryV1,
): FormalColliderOverlayObservationV1["colliders"] {
  const contribution = verified.nativeSceneContribution;
  exactStringSet(
    contribution.staticColliders.map(({ id }) => id),
    [...new Set(registry.parts.map(({ colliderId }) => colliderId))],
    "BABYLON_FORMAL_CAPTURE_LIVE_COLLIDER_SET_INVALID",
  );
  exactStringSet(
    contribution.staticColliders
      .filter(({ runtimeRole }) => runtimeRole === "scene-static-collider")
      .map(({ id }) => id),
    metadata.colliderJoins.map(({ colliderId }) => colliderId),
    "BABYLON_FORMAL_CAPTURE_COLLIDER_JOIN_SET_INVALID",
  );
  const contributionById = new Map(contribution.staticColliders.map(
    (collider) => [collider.id, collider] as const,
  ));
  const blocksByColliderId = new Map(metadata.colliderJoins.map(
    ({ sourceBlockIds, colliderId }) => [colliderId, sourceBlockIds] as const,
  ));
  const liveByPartId = new Map(registry.colliders.map((handle) =>
    [handle.chunkPartId, handle] as const));
  return Object.freeze([...contribution.staticColliders]
    .sort((left, right) => stableCompare(left.id, right.id))
    .map((collider) => {
      const sourceBlockIds = blocksByColliderId.get(collider.id) ??
        Object.freeze([]);
      if (
        collider.runtimeRole === "scene-static-collider" &&
        sourceBlockIds.length === 0
      ) fail("BABYLON_FORMAL_CAPTURE_COLLIDER_JOIN_MISSING", collider.id);
      if (
        collider.runtimeRole === "ground-safety-boundary" &&
        sourceBlockIds.length !== 0
      ) fail("BABYLON_FORMAL_CAPTURE_COLLIDER_JOIN_INVALID", collider.id);
      const parts = registry.parts
        .filter(({ colliderId }) => colliderId === collider.id)
        .sort((left, right) => stableCompare(left.chunkPartId, right.chunkPartId));
      if (parts.length === 0) {
        fail("BABYLON_FORMAL_CAPTURE_COLLIDER_PARTS_MISSING", collider.id);
      }
      return Object.freeze({
        colliderId: collider.id,
        sourceBlockIds,
        colliderSubshapeId: collider.colliderSubshapeId,
        chunkParts: Object.freeze(parts.map((part) => {
          const live = liveByPartId.get(part.chunkPartId);
          if (
            part.colliderSubshapeId !== collider.colliderSubshapeId ||
            part.sourceBlockIds.length !== sourceBlockIds.length ||
            part.sourceBlockIds.some((sourceBlockId, index) =>
              sourceBlockId !== sourceBlockIds[index]) ||
            (!isNil(live) && (
              live.colliderId !== collider.id ||
              live.colliderSubshapeId !== collider.colliderSubshapeId ||
              live.sourceBlockIds.length !== sourceBlockIds.length ||
              live.sourceBlockIds.some((sourceBlockId, index) =>
                sourceBlockId !== sourceBlockIds[index]) ||
              live.chunkResidencyGroupId !== part.chunkResidencyGroupId ||
              live.overlayRecordId !== part.overlayRecordId ||
              live.mesh.isDisposed() ||
              live.body.isDisposed
            ))
          ) {
            fail("BABYLON_FORMAL_CAPTURE_LIVE_COLLIDER_IDENTITY_INVALID");
          }
          return Object.freeze({
            chunkPartId: part.chunkPartId,
            chunkResidencyGroupId: part.chunkResidencyGroupId,
            overlayRecordId: part.overlayRecordId,
            physicsResidency: isNil(live)
              ? Object.freeze({ mode: "not-resident" as const })
              : Object.freeze({
                  mode: "resident" as const,
                  physicsBodyId: live.physicsBodyId,
                }),
          });
        })),
      });
    }));
}

function materializeColliderOverlayMeshes(
  scene: Scene,
  registry: BabylonNativeLiveColliderRegistryV1,
): Readonly<{ meshes: readonly Mesh[]; dispose(): void }> {
  const meshes: Mesh[] = [];
  try {
    for (const part of registry.parts) {
      const mesh = new Mesh(
        `worldkit.formal-collider-overlay.${part.chunkPartId}`,
        scene,
      );
      meshes.push(mesh);
      const normals: number[] = [];
      VertexData.ComputeNormals(
        part.worldPositionsMetersXYZ,
        part.triangleIndices,
        normals,
      );
      const vertexData = new VertexData();
      vertexData.positions = [...part.worldPositionsMetersXYZ];
      vertexData.indices = [...part.triangleIndices];
      vertexData.normals = normals;
      vertexData.applyToMesh(mesh, false);
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.computeWorldMatrix(true);
    }
  } catch (error) {
    for (let index = meshes.length - 1; index >= 0; index -= 1) {
      try {
        meshes[index]!.dispose();
      } catch {
        // Preserve the construction failure after best-effort rollback.
      }
    }
    throw error;
  }
  let isDisposed = false;
  return Object.freeze({
    meshes: Object.freeze(meshes),
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      let firstFailure: unknown;
      for (let index = meshes.length - 1; index >= 0; index -= 1) {
        try {
          meshes[index]!.dispose();
        } catch (error) {
          firstFailure ??= error;
        }
      }
      if (!isNil(firstFailure)) throw firstFailure;
    },
  });
}

export function selectFormalCommittedSupportContactV1(input: Readonly<{
  evidence: BabylonCharacterBodyCommittedSupportEvidenceV1;
  committedTick: number;
}>): BabylonCharacterBodyCommittedSupportEvidenceV1["contacts"][number] {
  try {
    return selectUniqueCommittedSupportContactV1(input);
  } catch (error) {
    if (error instanceof CommittedSupportSelectionErrorV1) {
      if (error.code === "WORLDKIT_RUNTIME_COMMITTED_SUPPORT_STALE") {
        fail("BABYLON_FORMAL_CAPTURE_COMMITTED_SUPPORT_STALE");
      }
      if (error.code === "WORLDKIT_RUNTIME_COMMITTED_SUPPORT_AMBIGUOUS") {
        fail("BABYLON_FORMAL_CAPTURE_COMMITTED_SUPPORT_AMBIGUOUS");
      }
      fail("BABYLON_FORMAL_CAPTURE_COMMITTED_SUPPORT_UNJOINABLE");
    }
    throw error;
  }
}

export function assertFormalSupportContactContributionIdentityV1(
  contact: BabylonCharacterBodyCommittedSupportEvidenceV1["contacts"][number],
  contribution: BabylonNativeStaticColliderContributionV1,
): void {
  if (
    contribution.colliderSubshapeId !== contact.colliderSubshapeId ||
    contribution.traversalBinding.kind !== "static-surface" ||
    contribution.traversalBinding.logicalSubshapeId !==
      contact.logicalSubshapeId ||
    contribution.traversalBinding.traversalSurfaceId !==
      contact.traversalSurfaceId ||
    contribution.traversalBinding.surfaceEntityId !==
      contact.surfaceEntityId ||
    contribution.traversalBinding.traversalSurfaceProfileRef !==
      contact.traversalSurfaceProfileRef
  ) fail("BABYLON_FORMAL_CAPTURE_SUPPORT_IDENTITY_MISMATCH");
}

function measuredPackageRelations(
  request: FormalWorldCaptureRequestV1,
  metadata: BabylonNativeBlockMaterializerMetadataV1,
) {
  const groupById = new Map(metadata.visualGroups.map((group) =>
    [group.visualGroupId, group] as const));
  return Object.freeze(request.semanticCaptureMap.topologyRelations.filter(
    (relation) => {
      if (relation.measurementSource !== "package-bounds") return false;
      const left = groupById.get(relation.fromVisualGroupId);
      const right = groupById.get(relation.toVisualGroupId);
      if (left === undefined || right === undefined) return false;
      const overlaps = (axis: 0 | 1 | 2): boolean =>
        left.minimumMetersXYZ[axis] <= right.maximumMetersXYZ[axis] &&
        right.minimumMetersXYZ[axis] <= left.maximumMetersXYZ[axis];
      if (relation.relation === "contains") {
        return ([0, 1, 2] as const).every((axis) =>
          left.minimumMetersXYZ[axis] <= right.minimumMetersXYZ[axis] &&
          left.maximumMetersXYZ[axis] >= right.maximumMetersXYZ[axis]);
      }
      if (relation.relation === "above") {
        return overlaps(0) && overlaps(2) &&
          left.minimumMetersXYZ[1] >= right.maximumMetersXYZ[1];
      }
      return ([0, 1, 2] as const).every(overlaps);
    },
  ).map(({ fromNodeId, relation, toNodeId }) =>
    Object.freeze({ fromNodeId, relation, toNodeId })));
}

function measuredRelationsForTraversal(
  request: Pick<FormalWorldCaptureRequestV1, "semanticCaptureMap">,
  traversalCheckId: string,
) {
  return Object.freeze(request.semanticCaptureMap.topologyRelations
    .filter((relation) => relation.measurementSource === "scripted-traversal" &&
      relation.traversalCheckId === traversalCheckId)
    .map(({ fromNodeId, relation, toNodeId }) =>
      Object.freeze({ fromNodeId, relation, toNodeId })));
}

function measuredSupportRelations(
  request: Pick<FormalWorldCaptureRequestV1, "semanticCaptureMap">,
  subjectEntityId: string,
  colliderId: string,
) {
  return Object.freeze(request.semanticCaptureMap.topologyRelations
    .filter((relation) => relation.measurementSource === "sdk-support" &&
      relation.subjectEntityId === subjectEntityId &&
      relation.colliderId === colliderId)
    .map(({ fromNodeId, relation, toNodeId }) =>
      Object.freeze({ fromNodeId, relation, toNodeId })));
}

function measuredColliderRelations(
  request: Pick<FormalWorldCaptureRequestV1, "semanticCaptureMap">,
  metadata: BabylonNativeBlockMaterializerMetadataV1,
  colliders: FormalColliderOverlayObservationV1["colliders"],
) {
  const sourceBlockIdsByGroupId = new Map(metadata.visualGroups.map((group) =>
    [group.visualGroupId, new Set(group.blockIds)] as const));
  return Object.freeze(request.semanticCaptureMap.topologyRelations
    .filter((relation) => {
      if (relation.measurementSource !== "sdk-collider") return false;
      const sourceBlockIds = sourceBlockIdsByGroupId.get(
        relation.sourceVisualGroupId,
      );
      return sourceBlockIds !== undefined && colliders.some((collider) =>
        collider.colliderId === relation.colliderId &&
        collider.sourceBlockIds.some((sourceBlockId) =>
          sourceBlockIds.has(sourceBlockId)));
    })
    .map(({ fromNodeId, relation, toNodeId }) =>
      Object.freeze({ fromNodeId, relation, toNodeId })));
}

function resolveSupportSourceBlockId(
  metadata: BabylonNativeBlockMaterializerMetadataV1,
  sourceBlockIds: readonly string[],
  pointMetersXYZ: readonly [number, number, number],
): string {
  const blocksById = new Map(metadata.blocks.map((block) =>
    [block.blockId, block] as const));
  const ranked = sourceBlockIds.map((sourceBlockId) => {
    const block = blocksById.get(sourceBlockId) ?? fail(
      "BABYLON_FORMAL_CAPTURE_SUPPORT_SOURCE_BLOCK_MISSING",
      sourceBlockId,
    );
    const halfX = block.sizeMetersXYZ[0] / 2;
    const halfZ = block.sizeMetersXYZ[2] / 2;
    const gapX = Math.max(
      Math.abs(pointMetersXYZ[0] - block.centerMetersXYZ[0]) - halfX,
      0,
    );
    const gapZ = Math.max(
      Math.abs(pointMetersXYZ[2] - block.centerMetersXYZ[2]) - halfZ,
      0,
    );
    const topY = block.centerMetersXYZ[1] + block.sizeMetersXYZ[1] / 2;
    return Object.freeze({
      sourceBlockId,
      distanceSquared: gapX ** 2 + gapZ ** 2 +
        (pointMetersXYZ[1] - topY) ** 2,
    });
  }).sort((left, right) =>
    left.distanceSquared - right.distanceSquared ||
    stableCompare(left.sourceBlockId, right.sourceBlockId));
  return ranked[0]?.sourceBlockId ?? fail(
    "BABYLON_FORMAL_CAPTURE_SUPPORT_SOURCE_BLOCK_MISSING",
  );
}

type FormalTraversalCaptureRequestV1 = Pick<
  FormalWorldCaptureRequestV1,
  "semanticCaptureMap" | "scriptedTraversal"
>;

async function captureTraversalChecks(
  request: FormalTraversalCaptureRequestV1,
  runtimeSessionId: string,
  subjectEntityId: string,
  ports: FormalWorldCaptureProviderPortsV1,
): Promise<readonly FormalScriptedTraversalObservationV1["checks"][number][]> {
  const checks = [] as Array<FormalScriptedTraversalObservationV1["checks"][number]>;
  for (const check of request.scriptedTraversal.checks) {
    const resetReadySnapshot = await resetAndSettle(runtimeSessionId, ports);
    const startPositionMetersXYZ = position(resetReadySnapshot, subjectEntityId);
    const fixedTicks = [] as Array<
      FormalScriptedTraversalObservationV1["checks"][number]["fixedTicks"][number]
    >;
    const checkpoints = new Map<string,
      FormalScriptedTraversalObservationV1["checks"][number]["checkpoints"][number]>();
    const totalTicks = check.fixedInputSequence.reduce(
      (total, input) => total + input.ticks,
      0,
    );
    let measuredTickCount = 0;
    for (const [fixedInputStepIndex, step] of check.fixedInputSequence.entries()) {
      for (let tickIndex = 0; tickIndex < step.ticks; tickIndex += 1) {
        measuredTickCount += 1;
        const snapshot = await ports.runFixedInput({
          actions: step.actions,
          ...(step.axes === undefined ? {} : { axes: step.axes }),
          ticks: 1,
        });
        assertSnapshot(snapshot, runtimeSessionId, resetReadySnapshot.worldSessionId);
        const expectedTick = resetReadySnapshot.world.simulationTick + measuredTickCount;
        if (snapshot.world.simulationTick !== expectedTick) {
          fail("BABYLON_FORMAL_CAPTURE_TRAVERSAL_TICK_NOT_COMMITTED");
        }
        const subjectPosition = position(snapshot, subjectEntityId);
        fixedTicks.push(Object.freeze({
          tick: snapshot.world.simulationTick,
          fixedInputStepIndex,
          committedSnapshotHash: sha256CanonicalJson(snapshot) as Sha256HashV1,
          positionMetersXYZ: subjectPosition,
          movementMedium: movementMedium(snapshot, subjectEntityId),
        }));
        for (const criterion of check.checkpointCriteria) {
          if (checkpoints.has(criterion.checkpointId)) continue;
          const measured = measureFormalTraversalCheckpointV1({
            criterion,
            startPositionMetersXYZ,
            positionMetersXYZ: subjectPosition,
            tick: snapshot.world.simulationTick,
            isFinalTick: measuredTickCount === totalTicks,
          });
          if (measured !== undefined) checkpoints.set(criterion.checkpointId, measured);
        }
      }
    }
    const finalMeasuredTick = fixedTicks.at(-1)?.tick ?? fail(
      "BABYLON_FORMAL_CAPTURE_TRAVERSAL_TICK_MISSING",
      check.id,
    );
    for (const criterion of check.checkpointCriteria) {
      if (checkpoints.has(criterion.checkpointId)) continue;
      checkpoints.set(criterion.checkpointId, Object.freeze({
        checkpointId: criterion.checkpointId,
        outcome: "incomplete" as const,
        observedAtTick: finalMeasuredTick,
      }));
    }
    const checkpointRows = [...checkpoints.values()].sort((left, right) =>
      stableCompare(left.checkpointId, right.checkpointId));
    const checkpointOutcomeById = new Map(checkpointRows.map((row) =>
      [row.checkpointId, row.outcome] as const));
    const expectationObserved = check.checkpointCriteria.every((criterion) => {
      const observed = checkpointOutcomeById.get(criterion.checkpointId);
      if (criterion.expectation === "reach") return observed === "reached";
      if (criterion.expectation === "pass") return observed === "passed";
      return observed === "blocked";
    });
    const hasIncompleteCheckpoint = checkpointRows.some(
      ({ outcome }) => outcome === "incomplete",
    );
    const outcome = hasIncompleteCheckpoint
      ? "incomplete"
      : check.checkExpectation === "pass"
        ? expectationObserved ? "passed" : "blocked"
        : expectationObserved ? "blocked" : "passed";
    checks.push(Object.freeze({
      id: check.id,
      acceptanceTargetRef: check.acceptanceTargetRef,
      checkExpectation: check.checkExpectation,
      resetReadySnapshot,
      resetReadySnapshotHash:
        sha256CanonicalJson(resetReadySnapshot) as Sha256HashV1,
      fixedTicks: Object.freeze(fixedTicks),
      checkpoints: Object.freeze(checkpointRows),
      outcome,
      observedTopologyRelations: expectationObserved
        ? measuredRelationsForTraversal(request, check.id)
        : [],
    }));
  }
  return Object.freeze(checks.sort((left, right) => stableCompare(left.id, right.id)));
}

async function captureTraversal(
  request: FormalWorldCaptureRequestV1,
  runtimeSessionId: string,
  subjectEntityId: string,
  sdkOwnerIdentities: readonly FormalWorldCaptureSdkOwnerIdentityV1[],
  ports: FormalWorldCaptureProviderPortsV1,
): Promise<FormalScriptedTraversalObservationV1> {
  const checks = await captureTraversalChecks(
    request,
    runtimeSessionId,
    subjectEntityId,
    ports,
  );
  const identitySnapshot = checks[0]?.resetReadySnapshot ?? fail(
    "BABYLON_FORMAL_CAPTURE_TRAVERSAL_EMPTY",
  );
  return parseFormalScriptedTraversalObservationV1({
    kind: "formal-scripted-traversal-observation",
    schemaVersion: 1,
    ...observationIdentity(
      request,
      identitySnapshot,
      sdkOwnerIdentities,
      "input",
      "scripted-traversal",
    ),
    checks,
  });
}

/** @internal Package-private lifecycle seam for provider regression tests. */
export const FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1 = Object.freeze({
  assertFormalSupportContactContributionIdentityV1,
  captureTraversalChecks,
  controlledSubjectProjection,
  materializeColliderOverlayMeshes,
  measuredColliderRelations,
  measuredPackageRelations,
  measuredSupportRelations,
  validateColliderRegistry,
});

function captureRefBase(request: FormalWorldCaptureRequestV1): string {
  const suffix = "/formal-world-capture-request.json";
  if (!request.formalRequestRef.endsWith(suffix)) {
    fail("BABYLON_FORMAL_CAPTURE_REQUEST_REF_INVALID");
  }
  return `${request.formalRequestRef.slice(0, -suffix.length)}/capture`;
}

export async function executeFormalWorldCaptureProviderV1(
  input: ExecuteFormalWorldCaptureProviderInputV1,
): Promise<FormalHostedWorldCapturePayloadV1> {
  const request = parseFormalWorldCaptureRequestV1(input.request);
  const sdkOwnerIdentities = freezeFormalWorldCaptureSdkOwnerIdentitiesV1(
    input.sdkOwnerIdentities,
  );
  const metadata = assertRequestPackageIdentity(
    request,
    input.verifiedWorldPackage,
  );
  const initialReadySnapshot = await resetAndSettle(
    input.runtimeSessionId,
    input.ports,
  );
  const cameraStateBefore = sha256CanonicalJson(initialReadySnapshot.view.camera);
  let visualRegistry: BabylonNativeBlockLiveHandleRegistryV1 | undefined;
  let colliderRegistry: BabylonNativeLiveColliderRegistryV1 | undefined;
  let captureScene: Scene | undefined;
  let rendererIdentity = "";
  let browserIdentity = "";
  const openingView = request.views[0];
  const subjectEntityId =
    input.verifiedWorldPackage.worldRuntimeBootstrap.initialControlledEntityId;
  const openingCapture = input.ports.captureArtifactView(openingArtifactRequest(
    openingView,
    subjectEntityId,
    ({ camera, engine, scene }) => {
      captureScene = scene;
      visualRegistry = peekBabylonNativeBlockLiveHandleRegistryV1(scene) ?? fail(
        "BABYLON_FORMAL_CAPTURE_LIVE_VISUAL_REGISTRY_MISSING",
      );
      colliderRegistry = peekBabylonNativeLiveColliderRegistryV1(scene) ?? fail(
        "BABYLON_FORMAL_CAPTURE_LIVE_COLLIDER_REGISTRY_MISSING",
      );
      assertFormalCaptureLiveVisualRegistryV1({
        scene,
        materializerMetadata: metadata,
        liveHandleRegistry: visualRegistry,
      });
      rendererIdentity = rendererIdentityFromEngine(engine);
      browserIdentity = browserIdentityFromEnvironment();
      return measureFormalWorldCaptureViewV1({
        view: openingView,
        camera,
        materializerMetadata: metadata,
        semanticCaptureMap: request.semanticCaptureMap,
        liveHandleRegistry: visualRegistry,
      });
    },
  ));
  if (
    visualRegistry === undefined ||
    colliderRegistry === undefined ||
    captureScene === undefined ||
    openingCapture.measurement === undefined
  ) fail("BABYLON_FORMAL_CAPTURE_OPENING_MEASUREMENT_MISSING");
  const openingMeasurement = openingCapture.measurement as
    FormalWorldCaptureViewMeasurementV1;
  const afterOpening = input.ports.snapshot();
  if (sha256CanonicalJson(afterOpening.view.camera) !== cameraStateBefore) {
    fail("BABYLON_FORMAL_CAPTURE_CAMERA_ROLLBACK_FAILED");
  }

  const worldSideCapture = input.ports.captureArtifactView(
    worldArtifactRequest(request.views[1]),
  );
  const worldTopDownCapture = input.ports.captureArtifactView(
    worldArtifactRequest(request.views[2]),
  );
  if (
    sha256CanonicalJson(input.ports.snapshot().view.camera) !== cameraStateBefore
  ) fail("BABYLON_FORMAL_CAPTURE_CAMERA_ROLLBACK_FAILED");

  const colliderRows = validateColliderRegistry(
    input.verifiedWorldPackage,
    metadata,
    colliderRegistry,
  );
  const overlayMeshes = materializeColliderOverlayMeshes(
    captureScene,
    colliderRegistry,
  );
  let colliderOverlayCapture: BabylonArtifactCaptureResultV1;
  try {
    colliderOverlayCapture = input.ports.captureArtifactView({
      kind: "explicit-collider-overlay",
      widthPixels: openingView.widthPixels,
      heightPixels: openingView.heightPixels,
      colliderMeshes: overlayMeshes.meshes,
      overlayColor: "#FF00FF",
    });
  } finally {
    overlayMeshes.dispose();
  }
  if (
    sha256CanonicalJson(input.ports.snapshot().view.camera) !== cameraStateBefore
  ) fail("BABYLON_FORMAL_CAPTURE_CAMERA_ROLLBACK_FAILED");

  const support = input.ports.readCommittedSupportEvidence(subjectEntityId) ?? fail(
    "BABYLON_FORMAL_CAPTURE_COMMITTED_SUPPORT_MISSING",
  );
  const supportContact = selectFormalCommittedSupportContactV1({
    evidence: support,
    committedTick: initialReadySnapshot.world.simulationTick,
  });
  const supportCollider = colliderRows.find(
    ({ colliderId }) => colliderId === supportContact.colliderId,
  ) ?? fail("BABYLON_FORMAL_CAPTURE_SUPPORT_COLLIDER_NOT_LIVE");
  const contributionCollider = input.verifiedWorldPackage.nativeSceneContribution
    .staticColliders.find(({ id }) => id === supportContact.colliderId)!;
  assertFormalSupportContactContributionIdentityV1(
    supportContact,
    contributionCollider,
  );
  const supportSourceBlockId = resolveSupportSourceBlockId(
    metadata,
    supportCollider.sourceBlockIds,
    supportContact.pointMetersXYZ,
  );

  const openingObservation = parseFormalOpeningObservationV1({
    kind: "formal-opening-observation",
    schemaVersion: 1,
    ...observationIdentity(
      request,
      initialReadySnapshot,
      sdkOwnerIdentities,
      "camera",
      "opening-observation",
    ),
    controlledSubjectProjection: controlledSubjectProjection(
      openingCapture,
      subjectEntityId,
    ),
    visualGroups: openingMeasurement.visualGroups,
    observedTopologyRelations: measuredPackageRelations(request, metadata),
  });
  const foot = support.sampledFootPointMetersXYZ;
  const point = supportContact.pointMetersXYZ;
  const supportGapMillimeters = Math.round(Math.hypot(
    foot[0] - point[0],
    foot[1] - point[1],
    foot[2] - point[2],
  ) * 1_000);
  const spawnSupportObservation = parseFormalSpawnSupportObservationV1({
    kind: "formal-spawn-support-observation",
    schemaVersion: 1,
    ...observationIdentity(
      request,
      initialReadySnapshot,
      sdkOwnerIdentities,
      "physics",
      "spawn-support",
    ),
    spawnMarkerId: input.verifiedWorldPackage.nativeSceneContribution.spawnMarker.id,
    subjectEntityId,
    supportContact: {
      colliderId: supportCollider.colliderId,
      sourceBlockId: supportSourceBlockId,
      surfaceEntityId: supportContact.surfaceEntityId,
      logicalSubshapeId: supportContact.logicalSubshapeId,
      pointMetersXYZ: supportContact.pointMetersXYZ,
    },
    capsuleFootPointMetersXYZ: foot,
    supportGapMillimeters,
    movementMedium: movementMedium(initialReadySnapshot, subjectEntityId),
    observedTopologyRelations: measuredSupportRelations(
      request,
      subjectEntityId,
      supportCollider.colliderId,
    ),
  });
  const colliderOverlayObservation = parseFormalColliderOverlayObservationV1({
    kind: "formal-collider-overlay-observation",
    schemaVersion: 1,
    ...observationIdentity(
      request,
      initialReadySnapshot,
      sdkOwnerIdentities,
      "physics",
      "collider-overlay",
    ),
    colliders: colliderRows,
    observedTopologyRelations: measuredColliderRelations(
      request,
      metadata,
      colliderRows,
    ),
  });
  const scriptedTraversal = await captureTraversal(
    request,
    input.runtimeSessionId,
    subjectEntityId,
    sdkOwnerIdentities,
    input.ports,
  );

  const openingPng = pngBytes(openingCapture);
  const worldSidePng = pngBytes(worldSideCapture);
  const worldTopDownPng = pngBytes(worldTopDownCapture);
  const colliderOverlayPng = pngBytes(colliderOverlayCapture);
  const captureBase = captureRefBase(request);
  const viewPngById = new Map([
    ["opening", openingPng],
    ["world-side", worldSidePng],
    ["world-top-down", worldTopDownPng],
  ] as const);
  const receiptWithoutCleanup: Omit<FormalWorldCaptureReceiptV1, "cleanupOutcome"> =
    Object.freeze({
      kind: "formal-world-capture-receipt",
      schemaVersion: 1,
      id: `${request.id}.receipt`,
      formalRequestRef: request.formalRequestRef,
      formalRequest: request,
      formalRequestHash: hashFormalWorldCaptureRequestV1(request),
      caseRef: request.caseRef,
      caseHash: request.caseHash,
      evaluationProfileRef: request.evaluationProfileRef,
      evaluationProfileHash: request.evaluationProfileHash,
      sceneAuthoringRouteDecisionRef: request.sceneAuthoringRouteDecisionRef,
      sceneAuthoringRouteDecisionHash: request.sceneAuthoringRouteDecisionHash,
      sceneAuthoringAttemptRef: request.sceneAuthoringAttemptRef,
      sceneAuthoringAttemptHash: request.sceneAuthoringAttemptHash,
      sceneAuthoringAttemptResultRef: request.sceneAuthoringAttemptResultRef,
      sceneAuthoringAttemptResultHash: request.sceneAuthoringAttemptResultHash,
      worldPackageRef: request.worldPackageRef,
      worldPackageRootHash: request.worldPackageRootHash,
      worldBuildIdentityRef: request.worldBuildIdentityRef,
      worldBuildIdentityHash: request.worldBuildIdentityHash,
      worldPackageBuildReceiptRef: request.worldPackageBuildReceiptRef,
      worldPackageBuildReceiptHash: request.worldPackageBuildReceiptHash,
      runtimeSessionId: input.runtimeSessionId,
      readySnapshot: initialReadySnapshot,
      readySnapshotHash: sha256CanonicalJson(initialReadySnapshot) as Sha256HashV1,
      sdkOwnerIdentities,
      semanticCaptureMapHash: request.semanticCaptureMapHash,
      nativeBlockMaterializerMetadataHash:
        request.nativeBlockMaterializerMetadataHash,
      colliderOverlayRequestHash:
        hashFormalColliderOverlayRequestV1(request.colliderOverlay),
      scriptedTraversalRequestHash:
        hashFormalScriptedTraversalRequestV1(request.scriptedTraversal),
      viewportWidthPixels: openingView.widthPixels,
      viewportHeightPixels: openingView.heightPixels,
      devicePixelRatio: openingView.devicePixelRatio,
      rendererIdentity,
      browserIdentity,
      views: Object.freeze(request.views.map((view) => Object.freeze({
        viewId: view.viewId,
        request: view,
        requestHash: hashFormalArtifactViewRequestV1(view),
        pngArtifactRef: `${captureBase}/${view.viewId}.png`,
        pngContentHash:
          sha256Bytes(viewPngById.get(view.viewId)!) as Sha256HashV1,
      }))),
      openingObservationArtifactRef: `${captureBase}/opening-observation.json`,
      openingObservationContentHash:
        hashFormalOpeningObservationV1(openingObservation),
      spawnSupportObservationArtifactRef:
        `${captureBase}/spawn-support-observation.json`,
      spawnSupportObservationContentHash:
        hashFormalSpawnSupportObservationV1(spawnSupportObservation),
      colliderOverlayPngArtifactRef: `${captureBase}/collider-overlay.png`,
      colliderOverlayPngContentHash:
        sha256Bytes(colliderOverlayPng) as Sha256HashV1,
      colliderOverlayObservationArtifactRef:
        `${captureBase}/collider-overlay-observation.json`,
      colliderOverlayObservationContentHash:
        hashFormalColliderOverlayObservationV1(colliderOverlayObservation),
      scriptedTraversalArtifactRef: `${captureBase}/scripted-traversal.json`,
      scriptedTraversalContentHash:
        hashFormalScriptedTraversalObservationV1(scriptedTraversal),
      cameraRollbackOutcome: "completed",
      resetOutcome: "completed",
    });
  const validatedReceipt = parseFormalWorldCaptureReceiptV1({
    ...receiptWithoutCleanup,
    cleanupOutcome: "completed",
  });
  const {
    cleanupOutcome: _hostOwnedCleanupOutcome,
    ...validatedReceiptWithoutCleanup
  } = validatedReceipt;

  return Object.freeze({
    openingPng,
    worldSidePng,
    worldTopDownPng,
    colliderOverlayPng,
    openingObservation,
    spawnSupportObservation,
    colliderOverlayObservation,
    scriptedTraversal,
    receiptWithoutCleanup: Object.freeze(validatedReceiptWithoutCleanup),
  });
}

function rendererIdentityFromEngine(engine: AbstractEngine): string {
  const identity = engine.getClassName();
  return identity.length > 0 ? identity : fail("BABYLON_FORMAL_CAPTURE_RENDERER_IDENTITY_MISSING");
}

function browserIdentityFromEnvironment(): string {
  const identity = globalThis.navigator?.userAgent;
  return identity !== undefined && identity.length > 0
    ? identity
    : fail("BABYLON_FORMAL_CAPTURE_BROWSER_IDENTITY_MISSING");
}
