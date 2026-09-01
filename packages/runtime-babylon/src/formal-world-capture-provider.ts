import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  peekBabylonNativeBlockLiveHandleRegistryV1,
  type BabylonNativeBlockLiveHandleRegistryV1,
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
  type WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import {
  sha256Bytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import type { VerifiedBabylonNativeWorldPackageDirectoryV1 } from
  "@whitebox-world/world-package";

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

const OWNER_IMPLEMENTATION_DESCRIPTORS = Object.freeze([
  { ownerId: "action", implementationRef: "worldkit://sdk-owner/subject-actions@1" },
  { ownerId: "camera", implementationRef: "worldkit://sdk-owner/camera@1" },
  { ownerId: "input", implementationRef: "worldkit://sdk-owner/control-capture@1" },
  { ownerId: "physics", implementationRef: "worldkit://sdk-owner/character-movement@1" },
  { ownerId: "subject", implementationRef: "worldkit://sdk-owner/subject-contracts@1" },
] as const);

/** Fixed provider identities; callers cannot supply or rewrite SDK authority. */
export const BABYLON_FORMAL_WORLD_CAPTURE_SDK_OWNER_IDENTITIES_V1 =
  Object.freeze(OWNER_IMPLEMENTATION_DESCRIPTORS.map((descriptor) =>
    Object.freeze({
      ...descriptor,
      implementationHash: sha256CanonicalJson({
        ...descriptor,
        providerRef: "worldkit://runtime-provider/babylon-formal-capture@1",
      }) as Sha256HashV1,
    }))) satisfies readonly FormalWorldCaptureSdkOwnerIdentityV1[];

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
  readonly verifiedWorldPackage: VerifiedBabylonNativeWorldPackageDirectoryV1;
  readonly runtimeSessionId: string;
  readonly ports: FormalWorldCaptureProviderPortsV1;
}

function fail(code: string, detail?: string): never {
  throw new Error(detail === undefined ? code : `${code}: ${detail}`);
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
  const meshByBlockId = new Map<string, Mesh>();
  for (const live of input.liveHandleRegistry.blocks) {
    const metadata = metadataBlockByRuntimeId.get(live.runtimeEntityId)!;
    if (
      metadata.semanticCaptureClassId !== live.semanticCaptureClassId ||
      live.mesh.isDisposed() ||
      live.mesh.getScene() !== input.scene ||
      meshByBlockId.has(metadata.blockId)
    ) fail("BABYLON_FORMAL_CAPTURE_LIVE_VISUAL_BLOCK_IDENTITY_INVALID");
    meshByBlockId.set(metadata.blockId, live.mesh);
  }

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
    const expectedMeshes = metadataGroup.blockIds.map((blockId) =>
      meshByBlockId.get(blockId) ?? fail(
        "BABYLON_FORMAL_CAPTURE_LIVE_VISUAL_GROUP_BLOCK_MISSING",
        blockId,
      ));
    if (
      liveGroup.meshes.length !== expectedMeshes.length ||
      new Set(liveGroup.meshes).size !== liveGroup.meshes.length ||
      expectedMeshes.some((mesh) => !liveGroup.meshes.includes(mesh)) ||
      liveGroup.meshes.some((mesh) =>
        mesh.isDisposed() || mesh.getScene() !== input.scene)
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
  positionMetersXYZ: readonly [number, number, number];
  tick: number;
  isFinalTick: boolean;
}>): Readonly<{
  checkpointId: string;
  outcome: "reached" | "passed" | "blocked";
  observedAtTick: number;
}> | undefined {
  const criterion = input.criterion;
  if (criterion.kind === "reach-bounds") {
    const margin = criterion.capsuleRadiusMeters + criterion.toleranceMeters;
    const inside = input.positionMetersXYZ.every((value, axis) =>
      value >= criterion.sourceBoundsMeters.minimumMetersXYZ[axis]! - margin &&
      value <= criterion.sourceBoundsMeters.maximumMetersXYZ[axis]! + margin);
    return inside
      ? Object.freeze({
          checkpointId: criterion.checkpointId,
          outcome: "reached" as const,
          observedAtTick: input.tick,
        })
      : undefined;
  }
  const crossed = crossedPlane(criterion, input.positionMetersXYZ);
  if (criterion.kind === "pass-plane") {
    return crossed
      ? Object.freeze({
          checkpointId: criterion.checkpointId,
          outcome: "passed" as const,
          observedAtTick: input.tick,
        })
      : undefined;
  }
  return input.isFinalTick && !crossed
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
  measureAfterRender: NonNullable<
    BabylonArtifactCaptureRequestV1["measureAfterRender"]
  >,
): BabylonArtifactCaptureRequestV1 {
  return {
    kind: "opening-frame",
    widthPixels: view.widthPixels,
    heightPixels: view.heightPixels,
    projectedEntityIds: [],
    measureAfterRender,
  };
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
  ownerId: "camera" | "physics" | "input",
  suffix: string,
): FormalMeasuredObservationIdentityV1 {
  const owner = BABYLON_FORMAL_WORLD_CAPTURE_SDK_OWNER_IDENTITIES_V1.find(
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
    registry.colliders.map(({ colliderId }) => colliderId),
    "BABYLON_FORMAL_CAPTURE_LIVE_COLLIDER_SET_INVALID",
  );
  exactStringSet(
    contribution.staticColliders.map(({ id }) => id),
    metadata.colliderJoins.map(({ colliderId }) => colliderId),
    "BABYLON_FORMAL_CAPTURE_COLLIDER_JOIN_SET_INVALID",
  );
  const contributionById = new Map(contribution.staticColliders.map(
    (collider) => [collider.id, collider] as const,
  ));
  const blockByColliderId = new Map(metadata.colliderJoins.map(
    ({ blockId, colliderId }) => [colliderId, blockId] as const,
  ));
  return Object.freeze(registry.colliders.map((handle) => {
    const collider = contributionById.get(handle.colliderId)!;
    const sourceBlockId = blockByColliderId.get(handle.colliderId)!;
    if (
      handle.colliderSubshapeId !== collider.colliderSubshapeId ||
      handle.sourceBlockId !== sourceBlockId ||
      handle.mesh.isDisposed() ||
      handle.body.isDisposed
    ) fail("BABYLON_FORMAL_CAPTURE_LIVE_COLLIDER_IDENTITY_INVALID");
    return Object.freeze({
      colliderId: handle.colliderId,
      sourceBlockId,
      physicsBodyId: handle.physicsBodyId,
      colliderSubshapeId: handle.colliderSubshapeId,
      overlayRecordId: handle.overlayRecordId,
    });
  }).sort((left, right) => stableCompare(left.colliderId, right.colliderId)));
}

export function selectFormalCommittedSupportContactV1(input: Readonly<{
  evidence: BabylonCharacterBodyCommittedSupportEvidenceV1;
  committedTick: number;
}>): BabylonCharacterBodyCommittedSupportEvidenceV1["contacts"][number] {
  if (
    input.evidence.tick !== input.committedTick ||
    input.evidence.support.mode !== "supported"
  ) fail("BABYLON_FORMAL_CAPTURE_COMMITTED_SUPPORT_STALE");
  const contactGroups = new Map<string,
    BabylonCharacterBodyCommittedSupportEvidenceV1["contacts"]>();
  for (const contact of input.evidence.contacts) {
    if (
      contact.colliderId === undefined ||
      contact.colliderSubshapeId === undefined ||
      contact.logicalSubshapeId === undefined ||
      contact.surfaceEntityId === undefined
    ) continue;
    const key = [
      contact.colliderId,
      contact.colliderSubshapeId,
      contact.logicalSubshapeId,
      contact.surfaceEntityId,
    ].join("\0");
    contactGroups.set(key, Object.freeze([
      ...(contactGroups.get(key) ?? []),
      contact,
    ]));
  }
  if (contactGroups.size !== 1) {
    fail("BABYLON_FORMAL_CAPTURE_COMMITTED_SUPPORT_AMBIGUOUS");
  }
  return [...[...contactGroups.values()][0]!].sort((left, right) =>
    left.distanceMeters - right.distanceMeters)[0]!;
}

function measuredPackageRelations(
  request: FormalWorldCaptureRequestV1,
  metadata: BabylonNativeBlockMaterializerMetadataV1,
) {
  const groupByNodeId = new Map(request.semanticCaptureMap.bindings.map(
    (binding) => [binding.topologyNodeId, metadata.visualGroups.find(
      ({ visualGroupId }) => visualGroupId === binding.blockVisualGroupId,
    )!] as const,
  ));
  return Object.freeze(request.semanticCaptureMap.topologyRelations.filter(
    (relation) => {
      if (relation.measurementSource !== "package-bounds") return false;
      const left = groupByNodeId.get(relation.fromNodeId);
      const right = groupByNodeId.get(relation.toNodeId);
      if (left === undefined || right === undefined) return false;
      return [0, 1, 2].every((axis) =>
        left.minimumMetersXYZ[axis]! <= right.maximumMetersXYZ[axis]! &&
        right.minimumMetersXYZ[axis]! <= left.maximumMetersXYZ[axis]!);
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
            positionMetersXYZ: subjectPosition,
            tick: snapshot.world.simulationTick,
            isFinalTick: measuredTickCount === totalTicks,
          });
          if (measured !== undefined) checkpoints.set(criterion.checkpointId, measured);
        }
      }
    }
    if (checkpoints.size !== check.checkpointCriteria.length) {
      fail("BABYLON_FORMAL_CAPTURE_TRAVERSAL_CHECKPOINT_UNMEASURED", check.id);
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
    if (!expectationObserved) {
      fail("BABYLON_FORMAL_CAPTURE_TRAVERSAL_EXPECTATION_NOT_OBSERVED", check.id);
    }
    const outcome = check.checkExpectation === "pass" ? "passed" : "blocked";
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
      observedTopologyRelations: measuredRelationsForTraversal(request, check.id),
    }));
  }
  return Object.freeze(checks.sort((left, right) => stableCompare(left.id, right.id)));
}

async function captureTraversal(
  request: FormalWorldCaptureRequestV1,
  runtimeSessionId: string,
  subjectEntityId: string,
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
    ...observationIdentity(request, identitySnapshot, "input", "scripted-traversal"),
    checks,
  });
}

/** @internal Package-private lifecycle seam for provider regression tests. */
export const FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1 = Object.freeze({
  captureTraversalChecks,
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
  let rendererIdentity = "";
  let browserIdentity = "";
  const openingView = request.views[0];
  const openingCapture = input.ports.captureArtifactView(openingArtifactRequest(
    openingView,
    ({ camera, engine, scene }) => {
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
  const colliderOverlayCapture = input.ports.captureArtifactView({
    kind: "explicit-collider-overlay",
    widthPixels: openingView.widthPixels,
    heightPixels: openingView.heightPixels,
    colliderMeshes: colliderRegistry.colliders.map(({ mesh }) => mesh),
    overlayColor: "#FF00FF",
  });
  if (
    sha256CanonicalJson(input.ports.snapshot().view.camera) !== cameraStateBefore
  ) fail("BABYLON_FORMAL_CAPTURE_CAMERA_ROLLBACK_FAILED");

  const subjectEntityId =
    input.verifiedWorldPackage.worldRuntimeBootstrap.initialControlledEntityId;
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
  if (
    contributionCollider.colliderSubshapeId !== supportContact.colliderSubshapeId ||
    contributionCollider.traversalBinding.kind !== "static-surface" ||
    contributionCollider.traversalBinding.logicalSubshapeId !==
      supportContact.logicalSubshapeId ||
    contributionCollider.traversalBinding.surfaceEntityId !==
      supportContact.surfaceEntityId
  ) fail("BABYLON_FORMAL_CAPTURE_SUPPORT_IDENTITY_MISMATCH");

  const openingObservation = parseFormalOpeningObservationV1({
    kind: "formal-opening-observation",
    schemaVersion: 1,
    ...observationIdentity(request, initialReadySnapshot, "camera", "opening-observation"),
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
    ...observationIdentity(request, initialReadySnapshot, "physics", "spawn-support"),
    spawnMarkerId: input.verifiedWorldPackage.nativeSceneContribution.spawnMarker.id,
    subjectEntityId,
    supportContact: {
      colliderId: supportCollider.colliderId,
      sourceBlockId: supportCollider.sourceBlockId,
      surfaceEntityId: supportContact.surfaceEntityId,
      logicalSubshapeId: supportContact.logicalSubshapeId,
      pointMetersXYZ: supportContact.pointMetersXYZ,
    },
    capsuleFootPointMetersXYZ: foot,
    supportGapMillimeters,
    movementMedium: movementMedium(initialReadySnapshot, subjectEntityId),
    observedTopologyRelations: [],
  });
  const colliderOverlayObservation = parseFormalColliderOverlayObservationV1({
    kind: "formal-collider-overlay-observation",
    schemaVersion: 1,
    ...observationIdentity(request, initialReadySnapshot, "physics", "collider-overlay"),
    colliders: colliderRows,
    observedTopologyRelations: [],
  });
  const scriptedTraversal = await captureTraversal(
    request,
    input.runtimeSessionId,
    subjectEntityId,
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
      sdkOwnerIdentities: BABYLON_FORMAL_WORLD_CAPTURE_SDK_OWNER_IDENTITIES_V1,
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

if (
  BABYLON_FORMAL_WORLD_CAPTURE_SDK_OWNER_IDENTITIES_V1.map(({ ownerId }) => ownerId)
    .some((ownerId, index) => ownerId !== FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1[index])
) {
  throw new Error("BABYLON_FORMAL_CAPTURE_SDK_OWNER_IDENTITY_ORDER_INVALID");
}
