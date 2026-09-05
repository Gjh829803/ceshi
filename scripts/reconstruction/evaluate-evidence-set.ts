import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  assertFormalSemanticViewObservationSetMatchesReceiptV1,
  hashBabylonNativeBlockMaterializerMetadataV1,
  hashBabylonNativeSceneContributionV1,
  hashFormalColliderOverlayObservationV1,
  hashFormalOpeningObservationV1,
  hashFormalSemanticViewObservationSetV1,
  hashFormalScriptedTraversalObservationV1,
  hashFormalSpawnSupportObservationV1,
  hashFormalWorldCaptureReceiptV1,
  hashNativeSceneCheckResultV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalSemanticViewObservationSetV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalSpawnSupportObservationV1,
  parseFormalWorldCaptureReceiptV1,
  type BabylonNativeBlockMaterializerMetadataV1,
  type BabylonNativeContributionTraversalBindingV1,
  type BabylonNativeBlockMaterializerShapeV1,
  type BabylonNativeStaticColliderContributionV1,
  type FormalColliderOverlayObservationV1,
  type FormalOpeningObservationV1,
  type FormalSemanticViewObservationSetV1,
  type FormalScriptedTraversalObservationV1,
  type FormalSpawnSupportObservationV1,
  type FormalTraversalCheckpointSpatialCriterionV1,
  type FormalWorldCaptureReceiptV1,
  type NativeSceneCheckResultV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashSceneAuthoringAttemptResultV1,
  hashSceneAuthoringAttemptV1,
} from "@whitebox-world/scene-authoring-contracts";
import { isNil } from "lodash-es";
import {
  hashNativeBlockAuthoringManifestV1,
  parseNativeBlockAuthoringManifestV1,
  type NativeBlockAuthoringManifestV1,
} from "@whitebox-world/native-babylon-block-profile";
import type {
  VerifiedBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import {
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionEvidenceSetV1,
  type WorldReconstructionCaseV1,
  type WorldReconstructionEvaluationProfileV1,
  type WorldReconstructionEvidenceSetV1,
  type WorldReconstructionTopologyRelationV1,
} from "@whitebox-world/validation";

export interface BuildWorldReconstructionEvidenceSetInputV1 {
  readonly id: string;
  readonly caseRef: string;
  readonly reconstructionCase: WorldReconstructionCaseV1;
  readonly evaluationProfileRef: string;
  readonly evaluationProfile: WorldReconstructionEvaluationProfileV1;
  readonly authoringManifest: NativeBlockAuthoringManifestV1;
  readonly verifiedWorldPackage: VerifiedBabylonNativeWorldPackageDirectoryV1;
  readonly captureReceiptRef: string;
  readonly captureReceipt: FormalWorldCaptureReceiptV1;
  readonly openingObservation: FormalOpeningObservationV1;
  readonly semanticViewObservationSet: FormalSemanticViewObservationSetV1;
  readonly spawnSupportObservation: FormalSpawnSupportObservationV1;
  readonly colliderOverlayObservation: FormalColliderOverlayObservationV1;
  readonly scriptedTraversalObservation: FormalScriptedTraversalObservationV1;
}

function stale(detail: string): never {
  throw new Error(`WORLD_RECONSTRUCTION_EVIDENCE_STALE: ${detail}`);
}

function exact(actual: unknown, expected: unknown, detail: string): void {
  if (actual !== expected) stale(detail);
}

function sameCanonical(actual: unknown, expected: unknown, detail: string): void {
  if (sha256CanonicalJson(actual) !== sha256CanonicalJson(expected)) stale(detail);
}

export function assertColliderOverlaySourceJoinClosureV1(input: Readonly<{
  contributionColliders: readonly Readonly<Pick<
    BabylonNativeStaticColliderContributionV1,
    "id" | "runtimeRole"
  >>[];
  metadata: Readonly<Pick<
    BabylonNativeBlockMaterializerMetadataV1,
    "blocks" | "colliderJoins"
  >>;
  overlayColliders: FormalColliderOverlayObservationV1["colliders"];
}>): void {
  const contributionById = new Map(input.contributionColliders.map((collider) =>
    [collider.id, collider] as const));
  const metadataBlockIds = new Set(input.metadata.blocks.map(({ blockId }) =>
    blockId));
  const colliderJoins = new Map(input.metadata.colliderJoins.map((join) =>
    [join.colliderId, join.sourceBlockIds] as const));
  for (const collider of input.overlayColliders) {
    const contribution = contributionById.get(collider.colliderId);
    if (isNil(contribution)) {
      stale("overlay Collider is absent from verified Contribution");
    }
    const sourceBlockIds = colliderJoins.get(collider.colliderId);
    if (contribution.runtimeRole === "ground-safety-boundary") {
      if (!isNil(sourceBlockIds) || collider.sourceBlockIds.length !== 0) {
        stale("ground safety boundary must not claim a source Block join");
      }
      continue;
    }
    if (isNil(sourceBlockIds)) {
      stale("scene Collider is absent from trusted Block metadata");
    }
    if (collider.sourceBlockIds.some((sourceBlockId) =>
      !metadataBlockIds.has(sourceBlockId))) {
      stale("overlay source Block is absent from trusted Block metadata");
    }
    sameCanonical(sourceBlockIds, collider.sourceBlockIds,
      "overlay collider join does not match trusted Block metadata");
  }
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareText);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

type OpeningDistanceGroupV1 = Readonly<Pick<
  FormalOpeningObservationV1["visualGroups"][number],
  "compositionTargetRef" | "normalizedCenter" | "depthOrder"
>>;

export function projectOpeningCompositionDistancesV1(
  visualGroups: readonly OpeningDistanceGroupV1[],
) {
  const depthOrderedGroups = [...visualGroups].sort((left, right) =>
    left.depthOrder - right.depthOrder ||
    compareText(left.compositionTargetRef, right.compositionTargetRef));
  return depthOrderedGroups.slice(1)
    .map((group, index) => {
      const previous = depthOrderedGroups[index]!;
      const [fromTargetRef, toTargetRef] =
        compareText(previous.compositionTargetRef, group.compositionTargetRef) < 0
          ? [previous.compositionTargetRef, group.compositionTargetRef]
          : [group.compositionTargetRef, previous.compositionTargetRef];
      return {
        fromTargetRef,
        toTargetRef,
        distanceBasisPoints: Math.round(Math.hypot(
          group.normalizedCenter.xBasisPoints - previous.normalizedCenter.xBasisPoints,
          group.normalizedCenter.yBasisPoints - previous.normalizedCenter.yBasisPoints,
        )),
      };
    })
    .sort((left, right) =>
      compareText(left.fromTargetRef, right.fromTargetRef) ||
      compareText(left.toTargetRef, right.toTargetRef));
}

function relationKey(value: WorldReconstructionTopologyRelationV1): string {
  return `${value.fromNodeId}\u0000${value.relation}\u0000${value.toNodeId}`;
}

const GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF =
  "worldkit://traversal-surface-profile/ground.static@1" as const;

export function projectColliderEvidenceRoleV1(
  binding: BabylonNativeContributionTraversalBindingV1,
  sourceBlockShapes: readonly BabylonNativeBlockMaterializerShapeV1[],
): "ground" | "blocker" | "step" {
  if (binding.kind === "not-traversable") return "blocker";
  if (
    binding.kind === "static-surface" &&
    binding.traversalSurfaceProfileRef ===
      GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF
  ) {
    return sourceBlockShapes.length === 1 && sourceBlockShapes[0] === "step"
      ? "step"
      : "ground";
  }
  stale("Contribution traversalBinding does not admit a blocker or ground collider role");
}

export function projectMeasuredTraversalCheck(
  measured: readonly Readonly<{
    checkpointId: string;
    outcome: "reached" | "passed" | "blocked" | "incomplete";
  }>[],
  criteria: readonly FormalTraversalCheckpointSpatialCriterionV1[],
  checkExpectation: "pass" | "block",
): Readonly<{
  outcome: "reached" | "blocked" | "incomplete";
  checkpointIds: readonly string[];
}> {
  const checkpointIds = uniqueSorted(
    measured.map(({ checkpointId }) => checkpointId),
  );
  const requiredCheckpointIds = uniqueSorted(
    criteria.map(({ checkpointId }) => checkpointId),
  );
  if (
    checkpointIds.length !== requiredCheckpointIds.length ||
    checkpointIds.some((id, index) => id !== requiredCheckpointIds[index])
  ) {
    return { outcome: "incomplete", checkpointIds };
  }
  const measuredById = new Map(
    measured.map((row) => [row.checkpointId, row.outcome]),
  );
  const criterionIsSatisfied = (
    criterion: FormalTraversalCheckpointSpatialCriterionV1,
  ): boolean => {
    const outcome = measuredById.get(criterion.checkpointId);
    if (criterion.expectation === "reach") return outcome === "reached";
    if (criterion.expectation === "pass") return outcome === "passed";
    return outcome === "blocked";
  };
  if (
    criteria.some((criterion) => {
      if (criterion.expectation !== "block") return false;
      const outcome = measuredById.get(criterion.checkpointId);
      return outcome !== "blocked" && outcome !== "incomplete";
    })
  ) {
    return { outcome: "reached", checkpointIds };
  }
  if (measured.some(({ outcome }) => outcome === "incomplete")) {
    return { outcome: "incomplete", checkpointIds };
  }
  if (checkExpectation === "block") {
    return criteria.every(criterionIsSatisfied)
      ? { outcome: "blocked", checkpointIds }
      : { outcome: "incomplete", checkpointIds };
  }
  return criteria.every(criterionIsSatisfied)
    ? { outcome: "reached", checkpointIds }
    : { outcome: "blocked", checkpointIds };
}

function candidateReplayOutcomeFromCheckResult(
  checkResult: NativeSceneCheckResultV1,
): "completed" | "failed" | "incomplete" {
  if (checkResult.outcome === "passed") return "completed";
  if (
    checkResult.diagnostics.some((diagnostic) =>
      diagnostic.stage === "runtime-replay" && diagnostic.severity === "error"
    )
  ) {
    return "failed";
  }
  return "incomplete";
}

function assertObservationIdentity(
  observation: FormalOpeningObservationV1 |
    FormalSemanticViewObservationSetV1 |
    FormalSpawnSupportObservationV1 |
    FormalColliderOverlayObservationV1 |
    FormalScriptedTraversalObservationV1,
  receipt: FormalWorldCaptureReceiptV1,
  role: string,
  resetIdentity: "receipt-ready" | "independent-reset",
): void {
  exact(
    observation.formalRequestRef,
    receipt.formalRequestRef,
    `${role} formal Request ref does not match Capture Receipt`,
  );
  exact(
    observation.formalRequestHash,
    receipt.formalRequestHash,
    `${role} formal Request hash does not match Capture Receipt`,
  );
  exact(
    observation.formalRequest.sceneAuthoringAttemptRef,
    receipt.sceneAuthoringAttemptRef,
    `${role} attempt ref does not match Capture Receipt`,
  );
  exact(
    observation.formalRequest.sceneAuthoringAttemptHash,
    receipt.sceneAuthoringAttemptHash,
    `${role} attempt hash does not match Capture Receipt`,
  );
  exact(
    observation.runtimeSessionId,
    receipt.runtimeSessionId,
    `${role} Runtime session does not match Capture Receipt`,
  );
  if (resetIdentity === "receipt-ready") {
    exact(
      observation.resetReadySnapshotHash,
      receipt.readySnapshotHash,
      `${role} reset Snapshot does not match Capture Receipt`,
    );
    sameCanonical(
      observation.resetReadySnapshot,
      receipt.readySnapshot,
      `${role} reset Snapshot payload does not match Capture Receipt`,
    );
  }
  exact(
    observation.semanticCaptureMapHash,
    receipt.semanticCaptureMapHash,
    `${role} semantic map hash does not match Capture Receipt`,
  );
}

function observedRelations(
  input: BuildWorldReconstructionEvidenceSetInputV1,
): readonly WorldReconstructionTopologyRelationV1[] {
  return [
    ...input.openingObservation.observedTopologyRelations,
    ...input.spawnSupportObservation.observedTopologyRelations,
    ...input.colliderOverlayObservation.observedTopologyRelations,
    ...input.scriptedTraversalObservation.checks.flatMap(
      (check) => check.observedTopologyRelations,
    ),
  ];
}

export function buildWorldReconstructionEvidenceSetV1(
  rawInput: BuildWorldReconstructionEvidenceSetInputV1,
): WorldReconstructionEvidenceSetV1 {
  const reconstructionCase = parseWorldReconstructionCaseV1(
    rawInput.reconstructionCase,
  );
  const evaluationProfile = parseWorldReconstructionEvaluationProfileV1(
    rawInput.evaluationProfile,
  );
  const authoringManifest = parseNativeBlockAuthoringManifestV1(
    rawInput.authoringManifest,
  );
  const captureReceipt = parseFormalWorldCaptureReceiptV1(rawInput.captureReceipt);
  const opening = parseFormalOpeningObservationV1(rawInput.openingObservation);
  const semanticViewObservationSet = parseFormalSemanticViewObservationSetV1(
    rawInput.semanticViewObservationSet,
  );
  const spawn = parseFormalSpawnSupportObservationV1(
    rawInput.spawnSupportObservation,
  );
  const overlay = parseFormalColliderOverlayObservationV1(
    rawInput.colliderOverlayObservation,
  );
  const traversal = parseFormalScriptedTraversalObservationV1(
    rawInput.scriptedTraversalObservation,
  );
  const verified = rawInput.verifiedWorldPackage;
  if (verified.kind !== "babylon-native-scene") {
    stale("WorldPackage is not a verified Babylon Native package");
  }
  const metadata = verified.nativeBlockMaterializerMetadata;
  if (metadata === undefined) stale("trusted Block metadata is missing");

  const caseHash = hashWorldReconstructionCaseV1(reconstructionCase);
  const evaluationProfileHash =
    hashWorldReconstructionEvaluationProfileV1(evaluationProfile);
  const authoringManifestHash =
    hashNativeBlockAuthoringManifestV1(authoringManifest);
  const attemptHash = hashSceneAuthoringAttemptV1(verified.sceneAuthoringAttempt);
  const attemptResultHash = hashSceneAuthoringAttemptResultV1(
    verified.sceneAuthoringAttemptResult,
  );
  const buildReceiptHash = sha256CanonicalJson(verified.receipt);
  const captureReceiptHash = hashFormalWorldCaptureReceiptV1(captureReceipt);
  const contributionHash = hashBabylonNativeSceneContributionV1(
    verified.nativeSceneContribution,
  );
  const metadataHash = hashBabylonNativeBlockMaterializerMetadataV1(metadata);
  const formalRequest = captureReceipt.formalRequest;
  const semanticMap = formalRequest.semanticCaptureMap;

  exact(reconstructionCase.evaluationProfileRef, rawInput.evaluationProfileRef,
    "Case evaluation Profile ref does not match input");
  exact(reconstructionCase.evaluationProfileHash, evaluationProfileHash,
    "Case evaluation Profile hash does not match input");
  exact(captureReceipt.caseRef, rawInput.caseRef,
    "Capture Receipt Case ref does not match input");
  exact(captureReceipt.caseHash, caseHash,
    "Capture Receipt Case hash does not match input");
  exact(captureReceipt.evaluationProfileRef, rawInput.evaluationProfileRef,
    "Capture Receipt evaluation Profile ref does not match input");
  exact(captureReceipt.evaluationProfileHash, evaluationProfileHash,
    "Capture Receipt evaluation Profile hash does not match input");
  exact(captureReceipt.sceneAuthoringAttemptHash, attemptHash,
    "Capture Receipt attempt hash does not match verified WorldPackage");
  exact(captureReceipt.sceneAuthoringAttemptResultHash, attemptResultHash,
    "Capture Receipt attempt Result hash does not match verified WorldPackage");
  exact(captureReceipt.worldPackageRef, verified.receipt.worldPackageRef,
    "Capture Receipt Package ref does not match verified WorldPackage");
  exact(captureReceipt.worldPackageRootHash, verified.receipt.worldPackageRootHash,
    "Capture Receipt Package Root does not match verified WorldPackage");
  exact(captureReceipt.worldBuildIdentityHash, verified.receipt.worldBuildIdentityHash,
    "Capture Receipt Build Identity does not match verified WorldPackage");
  exact(captureReceipt.worldPackageBuildReceiptHash, buildReceiptHash,
    "Capture Receipt Build Receipt hash does not match verified WorldPackage");
  exact(semanticMap.caseRef, rawInput.caseRef,
    "semantic map Case ref does not match input");
  exact(semanticMap.caseHash, caseHash,
    "semantic map Case hash does not match input");
  exact(semanticMap.authoringManifestHash, authoringManifestHash,
    "semantic map authoring Manifest hash does not match checked Manifest");
  exact(metadata.caseHash, caseHash,
    "trusted Block metadata Case hash does not match input");
  exact(metadata.authoringManifestHash, authoringManifestHash,
    "trusted Block metadata Manifest hash does not match checked Manifest");
  exact(metadata.contributionHash, contributionHash,
    "trusted Block metadata Contribution hash does not match WorldPackage");
  exact(semanticMap.layoutInventoryHash, metadata.checkedLayoutInventoryHash,
    "semantic map Layout inventory does not match trusted Block metadata");
  exact(semanticMap.contributionHash, contributionHash,
    "semantic map Contribution does not match verified WorldPackage");
  exact(captureReceipt.nativeBlockMaterializerMetadataHash, metadataHash,
    "Capture Receipt materializer metadata hash does not match WorldPackage");
  exact(
    verified.sceneAuthoringAttemptResult.sceneAuthoringAttemptHash,
    attemptHash,
    "WorldPackage attempt Result is stale",
  );
  exact(
    verified.sceneAuthoringAttemptResult.authoredSourceHash,
    verified.sceneModuleBundleManifest.sourceGraphHash,
    "WorldPackage source graph does not match attempt Result",
  );
  if (verified.nativeSceneContribution.profileSettlement.kind !== "host-snapshot") {
    stale("verified Block Contribution lacks Host profile settlement");
  }
  exact(metadata.profileInventoryHash,
    verified.nativeSceneContribution.profileSettlement.profileInventoryHash,
    "profile settlement inventory does not match trusted Block metadata");
  exact(metadata.settledVisualHash,
    verified.nativeSceneContribution.profileSettlement.settledVisualHash,
    "profile settlement visual hash does not match trusted Block metadata");

  for (const [observation, role, resetIdentity] of [
    [opening, "opening", "receipt-ready"],
    [semanticViewObservationSet, "semantic views", "receipt-ready"],
    [spawn, "spawn support", "receipt-ready"],
    [overlay, "collider overlay", "receipt-ready"],
    [traversal, "traversal", formalRequest.scriptedTraversal.checks.length === 0
      ? "receipt-ready" : "independent-reset"],
  ] as const) {
    assertObservationIdentity(
      observation,
      captureReceipt,
      role,
      resetIdentity,
    );
  }
  const firstTraversalCheck = traversal.checks[0];
  if (formalRequest.scriptedTraversal.checks.length > 0) {
    if (firstTraversalCheck === undefined) stale("traversal evidence contains no independently reset check");
    exact(traversal.resetReadySnapshotHash, firstTraversalCheck.resetReadySnapshotHash,
      "traversal identity Snapshot does not match its first reset check");
    sameCanonical(traversal.resetReadySnapshot, firstTraversalCheck.resetReadySnapshot,
      "traversal identity Snapshot payload does not match its first reset check");
  }
  exact(captureReceipt.openingObservationContentHash,
    hashFormalOpeningObservationV1(opening),
    "opening observation content hash does not match Capture Receipt");
  exact(captureReceipt.semanticViewObservationSetContentHash,
    hashFormalSemanticViewObservationSetV1(semanticViewObservationSet),
    "semantic view observation content hash does not match Capture Receipt");
  assertFormalSemanticViewObservationSetMatchesReceiptV1({
    observationSet: semanticViewObservationSet,
    receipt: captureReceipt,
    openingObservation: opening,
  });
  exact(captureReceipt.spawnSupportObservationContentHash,
    hashFormalSpawnSupportObservationV1(spawn),
    "spawn observation content hash does not match Capture Receipt");
  exact(captureReceipt.colliderOverlayObservationContentHash,
    hashFormalColliderOverlayObservationV1(overlay),
    "collider overlay observation content hash does not match Capture Receipt");
  exact(captureReceipt.scriptedTraversalContentHash,
    hashFormalScriptedTraversalObservationV1(traversal),
    "traversal observation content hash does not match Capture Receipt");

  const metadataGroups = new Map(metadata.visualGroups.map((group) => [
    group.visualGroupId,
    group,
  ]));
  const caseTargetByAcceptanceRef = new Map(
    reconstructionCase.expected.semanticSilhouetteTargets.map((target) =>
      [target.acceptanceTargetRef, target] as const),
  );
  for (const binding of semanticMap.bindings) {
    const group = metadataGroups.get(binding.blockVisualGroupId);
    if (group === undefined) stale("semantic target group is absent from trusted Block metadata");
    exact(binding.acceptanceTargetRef, group.acceptanceTargetRef,
      "semantic target acceptance ref does not match trusted Block metadata");
    exact(binding.semanticClassId, group.semanticClassId,
      "semantic target class does not match trusted Block metadata");
    exact(binding.identityColor, group.identityColorHex,
      "semantic target color does not match trusted Block metadata");
    const caseTarget = caseTargetByAcceptanceRef.get(
      binding.acceptanceTargetRef,
    );
    if (caseTarget === undefined) {
      stale("semantic target is absent from Case");
    }
    exact(binding.blockVisualGroupId, caseTarget.visualGroupId,
      "semantic target group does not match Case");
    sameCanonical(
      binding.viewRequirements,
      caseTarget.viewRequirements.map(({ viewId, mode }) => ({ viewId, mode })),
      "semantic target view requirements do not match Case",
    );
  }
  exact(semanticMap.bindings.length, caseTargetByAcceptanceRef.size,
    "semantic map does not contain the exact Case target set");
  const metadataBlocks = new Map(metadata.blocks.map((block) => [block.blockId, block]));
  const colliderJoins = new Map(metadata.colliderJoins.map((join) => [
    join.colliderId,
    join.sourceBlockIds,
  ]));
  assertColliderOverlaySourceJoinClosureV1({
    contributionColliders:
      verified.nativeSceneContribution.staticColliders,
    metadata,
    overlayColliders: overlay.colliders,
  });
  exact(spawn.spawnMarkerId, verified.nativeSceneContribution.spawnMarker.id,
    "spawn marker does not match verified Contribution");
  if (!metadataBlocks.has(spawn.supportContact.sourceBlockId)) {
    stale("spawn support Block is absent from trusted Block metadata");
  }
  if (!colliderJoins.get(spawn.supportContact.colliderId)?.includes(
    spawn.supportContact.sourceBlockId,
  )) stale("spawn support collider join does not match trusted Block metadata");

  const expectedChecks = new Map(
    reconstructionCase.expected.criticalTraversalChecks.map((check) => [check.id, check]),
  );
  const requestChecks = new Map(formalRequest.scriptedTraversal.checks.map(
    (check) => [check.id, check],
  ));
  for (const check of traversal.checks) {
    const expected = expectedChecks.get(check.id);
    const request = requestChecks.get(check.id);
    if (expected === undefined || request === undefined) {
      stale("traversal check is absent from Case or formal Request");
    }
    exact(check.acceptanceTargetRef, expected.acceptanceTargetRef,
      "traversal acceptance target does not match Case");
    exact(check.checkExpectation, expected.expectation,
      "traversal expectation does not match Case");
    exact(request.fixedInputSequenceHash,
      sha256CanonicalJson(expected.fixedInputSequence),
      "traversal fixed input does not match Case");
    sameCanonical(request.checkpointCriteria,
      semanticMap.traversalCheckBindings.find(
        (binding) => binding.traversalCheckId === check.id,
      )?.checkpointCriteria,
      "traversal criteria do not match semantic map");
  }
  exact(traversal.checks.length, expectedChecks.size,
    "traversal evidence does not contain the exact Case check set");

  const observedRelationRows = observedRelations({
    ...rawInput,
    openingObservation: opening,
    spawnSupportObservation: spawn,
    colliderOverlayObservation: overlay,
    scriptedTraversalObservation: traversal,
  });

  const openingTargetRefs = new Set(
    reconstructionCase.expected.openingComposition.targetRefs,
  );
  const openingGroups = opening.visualGroups
    .filter(({ compositionTargetRef }) =>
      openingTargetRefs.has(compositionTargetRef))
    .sort((left, right) =>
    compareText(left.compositionTargetRef, right.compositionTargetRef));
  const depthOrderedGroups = [...openingGroups].sort((left, right) =>
    left.depthOrder - right.depthOrder ||
    compareText(left.compositionTargetRef, right.compositionTargetRef));
  const distances = projectOpeningCompositionDistancesV1(openingGroups);
  const overlayColliderIds = new Set(overlay.colliders.map(({ colliderId }) => colliderId));
  const colliderContributions = [...verified.nativeSceneContribution.staticColliders]
    .filter(({ runtimeRole }) => runtimeRole === "scene-static-collider")
    .sort((left, right) => compareText(left.id, right.id))
    .map((collider) => {
      const sourceBlockIds = colliderJoins.get(collider.id);
      if (sourceBlockIds === undefined || sourceBlockIds.length === 0) {
        stale("Contribution collider is absent from trusted Block metadata");
      }
      const sourceBlockShapes = sourceBlockIds.map((sourceBlockId) => {
        const sourceBlock = metadataBlocks.get(sourceBlockId);
        if (sourceBlock === undefined) {
          stale("Contribution collider Block is absent from trusted Block metadata");
        }
        return sourceBlock.shape;
      });
      return {
        contributionId: collider.id,
        colliderId: collider.id,
        role: projectColliderEvidenceRoleV1(
          collider.traversalBinding,
          sourceBlockShapes,
        ),
        hasOverlay: overlayColliderIds.has(collider.id),
      };
    });
  const observedTraversalChecks = [...traversal.checks]
    .sort((left, right) => compareText(left.id, right.id))
    .map((check) => {
      const expected = expectedChecks.get(check.id);
      const request = requestChecks.get(check.id);
      if (expected === undefined || request === undefined) {
        stale("traversal check is absent from Case or formal Request");
      }
      return {
        id: check.id,
        ...projectMeasuredTraversalCheck(
          check.checkpoints,
          request.checkpointCriteria,
          request.checkExpectation,
        ),
      };
    });
  const nativeSceneCheckResultRef =
    `world-package://${verified.manifest.sceneSource.nativeSceneCheckResultPath}`;
  exact(
    verified.manifest.sceneSource.nativeSceneCheckResultHash,
    hashNativeSceneCheckResultV1(verified.nativeSceneCheckResult),
    "verified Package Check Result hash does not match official Check Result bytes",
  );
  const worldPackageIdentityMatches =
    captureReceipt.worldPackageRef === verified.receipt.worldPackageRef &&
    captureReceipt.worldPackageRootHash === verified.receipt.worldPackageRootHash;
  const buildIdentityMatches =
    captureReceipt.worldBuildIdentityHash === verified.receipt.worldBuildIdentityHash;
  const captureIdentityMatches =
    captureReceipt.worldPackageBuildReceiptHash === buildReceiptHash &&
    captureReceipt.worldPackageRef === verified.receipt.worldPackageRef &&
    captureReceipt.worldPackageRootHash === verified.receipt.worldPackageRootHash &&
    captureReceipt.worldBuildIdentityHash === verified.receipt.worldBuildIdentityHash;
  const topologyRelations = uniqueSorted(observedRelationRows.map(relationKey)).map((key) => {
    const relation = observedRelationRows.find((candidate) => relationKey(candidate) === key);
    if (relation === undefined) stale("topology relation canonicalization failed");
    return relation;
  });

  return parseWorldReconstructionEvidenceSetV1({
    kind: "world-reconstruction-evidence-set",
    schemaVersion: 1,
    id: rawInput.id,
    caseRef: rawInput.caseRef,
    caseHash,
    evaluationProfileRef: rawInput.evaluationProfileRef,
    evaluationProfileHash,
    attemptRef: captureReceipt.sceneAuthoringAttemptRef,
    attemptHash,
    sceneAuthoringAttemptResultRef: captureReceipt.sceneAuthoringAttemptResultRef,
    sceneAuthoringAttemptResultHash: attemptResultHash,
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    worldPackageBuildReceiptRef: captureReceipt.worldPackageBuildReceiptRef,
    worldPackageBuildReceiptHash: buildReceiptHash,
    worldBuildIdentityRef: captureReceipt.worldBuildIdentityRef,
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    captureReceiptRef: rawInput.captureReceiptRef,
    captureReceiptHash,
    identityEvidence: [
      { role: "scene-authoring-attempt", artifactRef: captureReceipt.sceneAuthoringAttemptRef, contentHash: attemptHash },
      { role: "scene-authoring-attempt-result", artifactRef: captureReceipt.sceneAuthoringAttemptResultRef, contentHash: attemptResultHash },
      { role: "world-package", artifactRef: verified.receipt.worldPackageRef, contentHash: verified.receipt.worldPackageRootHash },
      { role: "world-package-build-receipt", artifactRef: captureReceipt.worldPackageBuildReceiptRef, contentHash: buildReceiptHash },
      { role: "world-build-identity", artifactRef: captureReceipt.worldBuildIdentityRef, contentHash: verified.receipt.worldBuildIdentityHash },
      { role: "capture", artifactRef: rawInput.captureReceiptRef, contentHash: captureReceiptHash },
    ],
    observedDimensions: [
      {
        dimensionId: "collider",
        evidenceRefs: [captureReceipt.colliderOverlayObservationArtifactRef],
        observed: { kind: "collider-observed", contributions: colliderContributions },
      },
      {
        dimensionId: "critical-traversal",
        evidenceRefs: [captureReceipt.scriptedTraversalArtifactRef],
        observed: { kind: "critical-traversal-observed", checks: observedTraversalChecks },
      },
      {
        dimensionId: "deterministic-build",
        evidenceRefs: uniqueSorted([
          nativeSceneCheckResultRef,
          captureReceipt.worldPackageBuildReceiptRef,
          captureReceipt.worldBuildIdentityRef,
          rawInput.captureReceiptRef,
        ]),
        observed: {
          kind: "deterministic-build-observed",
          candidateReplayOutcome: candidateReplayOutcomeFromCheckResult(
            verified.nativeSceneCheckResult,
          ),
          worldPackageIdentityMatches,
          buildIdentityMatches,
          captureIdentityMatches,
        },
      },
      {
        dimensionId: "opening-composition",
        evidenceRefs: [captureReceipt.openingObservationArtifactRef],
        observed: {
          kind: "opening-composition-observed",
          regions: openingGroups.map((group) => ({ targetRef: group.compositionTargetRef, normalizedBounds: group.normalizedBounds })),
          anchors: openingGroups.map((group) => ({ targetRef: group.compositionTargetRef, normalizedCenter: group.normalizedCenter })),
          orderedTargetRefs: depthOrderedGroups.map(({ compositionTargetRef }) => compositionTargetRef),
          distances,
        },
      },
      {
        dimensionId: "semantic-silhouette",
        evidenceRefs: [captureReceipt.semanticViewObservationSetArtifactRef],
        observed: {
          kind: "semantic-silhouette-observed",
          views: semanticViewObservationSet.views.map((view) => ({
            viewId: view.viewId,
            targets: view.targets.map((target) => ({
              acceptanceTargetRef: target.acceptanceTargetRef,
              visualGroupId: target.blockVisualGroupId,
              structuralProjection: target.structuralProjection.outcome === "projected"
                ? {
                    outcome: target.structuralProjection.outcome,
                    normalizedBounds: target.structuralProjection.normalizedBounds,
                    normalizedCenter: target.structuralProjection.normalizedCenter,
                    coverageBasisPoints:
                      target.structuralProjection.coverageBasisPoints,
                  }
                : { outcome: target.structuralProjection.outcome },
            })),
          })),
        },
      },
      {
        dimensionId: "spawn-support",
        evidenceRefs: [captureReceipt.spawnSupportObservationArtifactRef],
        observed: {
          kind: "spawn-support-observed",
          spawnMarkerId: spawn.spawnMarkerId,
          supportColliderId: spawn.supportContact.colliderId,
          medium: spawn.movementMedium,
          positionXYZMeters: {
            xMeters: spawn.capsuleFootPointMetersXYZ[0],
            yMeters: spawn.capsuleFootPointMetersXYZ[1],
            zMeters: spawn.capsuleFootPointMetersXYZ[2],
          },
          supportGapMillimeters: spawn.supportGapMillimeters,
        },
      },
      {
        dimensionId: "topology",
        evidenceRefs: uniqueSorted([
          captureReceipt.openingObservationArtifactRef,
          captureReceipt.spawnSupportObservationArtifactRef,
          captureReceipt.colliderOverlayObservationArtifactRef,
          captureReceipt.scriptedTraversalArtifactRef,
        ]),
        observed: {
          kind: "topology-observed",
          nodeIds: uniqueSorted(semanticMap.bindings.map(({ topologyNodeId }) => topologyNodeId)),
          relations: topologyRelations,
          layerIds: uniqueSorted(semanticMap.bindings.map(({ semanticLayerId }) => semanticLayerId)),
        },
      },
    ],
    advisoryPixelMetrics: [],
  });
}
