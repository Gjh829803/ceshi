import { sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  hashBabylonNativeBlockMaterializerMetadataV1,
  hashBabylonNativeSceneContributionV1,
  hashFormalWorldCaptureIntentV1,
  parseBabylonNativeBlockMaterializerMetadataV1,
  parseBabylonNativeSceneContributionV1,
  parseFormalSemanticCaptureMapV1,
  parseFormalWorldCaptureIntentV1,
  type FormalSemanticCaptureMapV1,
  type FormalTraversalCheckpointSpatialCriterionV1,
  type FormalWorldBoundsMetersV1,
  type FormalWorldCaptureIntentV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashWorldReconstructionCaseV1,
  parseWorldReconstructionCaseV1,
  type WorldReconstructionCaseV1,
} from "@whitebox-world/validation/reconstruction-contracts";
import { parseWorldReconstructionCaseArtifactRefV1 } from
  "@whitebox-world/world-identity";
import { isEqual, isNil } from "lodash-es";

export interface BindBlockMaterializerMetadataToSemanticCaptureTargetsInputV1 {
  readonly case: WorldReconstructionCaseV1;
  readonly materializerMetadata: unknown;
  readonly materializerMetadataHash: Sha256HashV1;
  readonly contribution: unknown;
  readonly formalCaptureIntent: FormalWorldCaptureIntentV1;
}

const CONTRACT = "FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID";
const INPUT_FIELDS = [
  "case", "materializerMetadata", "materializerMetadataHash", "contribution",
  "formalCaptureIntent",
] as const;

function fail(path: string, message: string): never {
  throw new Error(`${CONTRACT}:${path.length === 0 ? "" : ` ${path}:`} ${message}`);
}

function assertAccessorFree(value: unknown, path = "", seen = new Set<object>()): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) fail(path, "must be acyclic plain data");
  seen.add(value);
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) {
    fail(path, "must use ordinary object and array prototypes");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail(path, "symbol keys are forbidden");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!isNil(descriptor?.get) || !isNil(descriptor?.set)) {
      fail(`${path}/${key}`, "accessors are forbidden");
    }
    if (key !== "length" && descriptor?.enumerable !== true) {
      fail(`${path}/${key}`, "data fields must be enumerable");
    }
    assertAccessorFree(descriptor?.value, `${path}/${key}`, seen);
  }
  seen.delete(value);
}

function exactInput(value: unknown): Readonly<Record<string, unknown>> {
  if (
    isNil(value) || typeof value !== "object" || Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  ) fail("", "expected an ordinary plain object");
  const allowed = new Set<string>(INPUT_FIELDS);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (!isNil(unknown)) fail(`/${unknown}`, "unknown field");
  const missing = INPUT_FIELDS.find((key) => !Object.hasOwn(value, key));
  if (!isNil(missing)) fail(`/${missing}`, "required field is missing");
  return value as Readonly<Record<string, unknown>>;
}

function blockBoundsMeters(
  blocks: readonly Readonly<{
    centerMetersXYZ: readonly [number, number, number];
    sizeMetersXYZ: readonly [number, number, number];
  }>[],
): FormalWorldBoundsMetersV1 {
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY];
  for (const block of blocks) {
    for (let axis = 0; axis < 3; axis += 1) {
      const halfSize = block.sizeMetersXYZ[axis]! / 2;
      minimum[axis] = Math.min(
        minimum[axis]!,
        block.centerMetersXYZ[axis]! - halfSize,
      );
      maximum[axis] = Math.max(
        maximum[axis]!,
        block.centerMetersXYZ[axis]! + halfSize,
      );
    }
  }
  return Object.freeze({
    minimumMetersXYZ: Object.freeze(minimum) as readonly [number, number, number],
    maximumMetersXYZ: Object.freeze(maximum) as readonly [number, number, number],
  });
}

export function bindBlockMaterializerMetadataToSemanticCaptureTargetsV1(
  input: BindBlockMaterializerMetadataToSemanticCaptureTargetsInputV1,
): FormalSemanticCaptureMapV1 {
  assertAccessorFree(input);
  const source = exactInput(input);
  const reconstructionCase = parseWorldReconstructionCaseV1(source.case);
  const metadata = parseBabylonNativeBlockMaterializerMetadataV1(
    source.materializerMetadata,
  );
  const contribution = parseBabylonNativeSceneContributionV1(source.contribution);
  if (
    hashBabylonNativeBlockMaterializerMetadataV1(metadata) !==
      source.materializerMetadataHash ||
    metadata.caseHash !== hashWorldReconstructionCaseV1(reconstructionCase) ||
    metadata.contributionHash !== hashBabylonNativeSceneContributionV1(contribution)
  ) fail("materializerMetadata", "must match the verified Package identity closure");
  let formalCaptureIntent: FormalWorldCaptureIntentV1;
  try {
    formalCaptureIntent = parseFormalWorldCaptureIntentV1(
      source.formalCaptureIntent,
    );
  } catch {
    fail("formalCaptureIntent", "must be a parsed FormalWorldCaptureIntentV1");
  }
  if (
    reconstructionCase.formalCaptureIntentHash !==
      hashFormalWorldCaptureIntentV1(formalCaptureIntent) ||
    formalCaptureIntent.id !==
      `${reconstructionCase.id}.formal-world-capture-intent`
  ) fail("formalCaptureIntent", "must match the Case-bound Intent identity");
  const semanticCaptureTargetBindings =
    formalCaptureIntent.semanticCaptureTargetBindings;
  const packageTargetGroupPairs = metadata.visualGroups
    .map(({ acceptanceTargetRef, visualGroupId }) => ({
      acceptanceTargetRef,
      blockVisualGroupId: visualGroupId,
    }))
    .sort((left, right) => left.acceptanceTargetRef.localeCompare(right.acceptanceTargetRef));
  const caseSilhouettePairs = reconstructionCase.expected.semanticSilhouetteTargets
    .map(({ acceptanceTargetRef, visualGroupId }) => ({
      acceptanceTargetRef,
      blockVisualGroupId: visualGroupId,
    }))
    .sort((left, right) => left.acceptanceTargetRef.localeCompare(right.acceptanceTargetRef));
  const explicitTargetGroupPairs = semanticCaptureTargetBindings.map(
    ({ acceptanceTargetRef, blockVisualGroupId }) => ({
      acceptanceTargetRef,
      blockVisualGroupId,
    }),
  );
  const caseTargetByAcceptanceRef = new Map(
    reconstructionCase.expected.semanticSilhouetteTargets.map((target) =>
      [target.acceptanceTargetRef, target] as const),
  );
  const openingReferenceCompositionTargetRefs = semanticCaptureTargetBindings
    .filter(({ acceptanceTargetRef }) =>
      caseTargetByAcceptanceRef.get(acceptanceTargetRef)?.viewRequirements[0]
        ?.mode === "reference-projection-required")
    .map(({ compositionTargetRef }) => compositionTargetRef)
    .sort();
  if (
    !isEqual(explicitTargetGroupPairs, packageTargetGroupPairs) ||
    !isEqual(explicitTargetGroupPairs, caseSilhouettePairs) ||
    !isEqual(
      openingReferenceCompositionTargetRefs,
      [...reconstructionCase.expected.openingComposition.targetRefs].sort(),
    ) ||
    !isEqual(
      semanticCaptureTargetBindings.map(({ topologyNodeId }) => topologyNodeId).sort(),
      [...reconstructionCase.expected.topology.nodeIds].sort(),
    ) ||
    !isEqual(
      [...new Set(semanticCaptureTargetBindings.map(
        ({ semanticLayerId }) => semanticLayerId,
      ))].sort(),
      [...new Set(reconstructionCase.expected.topology.layerIds)].sort(),
    )
  ) {
    fail(
      "semanticCaptureTargetBindings",
      "must explicitly cover every Case target and Package visual group exactly once",
    );
  }
  for (const binding of semanticCaptureTargetBindings) {
    const target = caseTargetByAcceptanceRef.get(binding.acceptanceTargetRef)!;
    const openingRequirement = target.viewRequirements[0]!;
    if (openingRequirement.mode !== "reference-projection-required") continue;
    const region = reconstructionCase.expected.openingComposition.regions.find(
      ({ targetRef }) => targetRef === binding.compositionTargetRef,
    );
    const anchor = reconstructionCase.expected.openingComposition.anchors.find(
      ({ targetRef }) => targetRef === binding.compositionTargetRef,
    );
    if (
      region === undefined ||
      anchor === undefined ||
      !isEqual(region.normalizedBounds, openingRequirement.normalizedBounds) ||
      !isEqual(anchor.normalizedCenter, openingRequirement.normalizedCenter)
    ) fail("semanticCaptureTargetBindings", "Opening composition must match the Case reference projection");
  }
  const topologyRelations = formalCaptureIntent.topologyRelations;
  const relationKeys = topologyRelations.map(({ fromNodeId, relation, toNodeId }) =>
    `${fromNodeId}\0${relation}\0${toNodeId}`);
  if (
    relationKeys.some((key, index) => index > 0 && relationKeys[index - 1]! >= key) ||
    !isEqual(
      topologyRelations.map(({ fromNodeId, relation, toNodeId }) => ({
        fromNodeId,
        relation,
        toNodeId,
      })),
      reconstructionCase.expected.topology.relations,
    )
  ) fail("topologyRelations", "must explicitly bind every Case topology relation once");
  const authoredCheckpointCriteria = formalCaptureIntent.checkpointSpatialCriteria;
  const groupById = new Map(metadata.visualGroups.map((group) => [
    group.visualGroupId, group,
  ]));
  const blockById = new Map(metadata.blocks.map((block) => [block.blockId, block]));
  const contributionColliderById = new Map(contribution.staticColliders.map(
    (collider) => [collider.id, collider],
  ));
  const checkpointSpatialCriteria = authoredCheckpointCriteria.map((criterion) => {
    const group = groupById.get(criterion.sourceVisualGroupId);
    if (isNil(group)) {
      fail("checkpointSpatialCriteria", "must join a verified Package visual group");
    }
    const groupBounds = Object.freeze({
        minimumMetersXYZ: group.minimumMetersXYZ,
        maximumMetersXYZ: group.maximumMetersXYZ,
    });
    if (criterion.kind === "reach-position") {
      // The frozen intent owns a local endpoint. A visual group can span the
      // whole route and must not turn every point on it into arrival evidence.
      return criterion;
    }
    let sourceBoundsMeters = groupBounds;
    if (criterion.kind === "block-plane") {
      const matchingColliderJoins = metadata.colliderJoins.filter(
        ({ colliderId }) => colliderId === criterion.colliderId,
      );
      const collider = contributionColliderById.get(criterion.colliderId);
      const joinedBlocks = matchingColliderJoins.length === 1
        ? matchingColliderJoins[0]!.sourceBlockIds.map((blockId) =>
            blockById.get(blockId))
        : [];
      const visualGroupBlocks = joinedBlocks.filter(
        (block): block is NonNullable<typeof block> =>
          !isNil(block) &&
          block.visualGroupId === criterion.sourceVisualGroupId &&
          group.blockIds.includes(block.blockId),
      );
      if (
        matchingColliderJoins.length !== 1 ||
        isNil(collider) ||
        joinedBlocks.length === 0 ||
        joinedBlocks.some(isNil) ||
        !matchingColliderJoins[0]!.visualGroupIds.includes(
          criterion.sourceVisualGroupId,
        ) ||
        visualGroupBlocks.length === 0
      ) {
        fail(
          "checkpointSpatialCriteria",
          "block-plane must join one frozen Collider to the declared visual group",
        );
      }
      // A logical Collider may merge Blocks from several semantic visual
      // groups. The criterion names one of those groups, so its plane must be
      // resolved from only the explicitly joined source Blocks in that group;
      // the whole merged proxy bounds would move the checkpoint when an
      // unrelated distant Block shares the Collider.
      sourceBoundsMeters = blockBoundsMeters(visualGroupBlocks);
    }
    const axisIndex = criterion.axis === "x" ? 0 : criterion.axis === "y" ? 1 : 2;
    const planeMeters = criterion.sourceFace === "minimum"
      ? sourceBoundsMeters.minimumMetersXYZ[axisIndex]
      : sourceBoundsMeters.maximumMetersXYZ[axisIndex];
    const spawnMeters = contribution.spawnMarker.positionMetersXYZ[axisIndex];
    const approachClearanceMeters =
      criterion.capsuleRadiusMeters + criterion.toleranceMeters;
    const startsOnApproachSide = criterion.expectedCenterSide === "positive"
      ? spawnMeters <= planeMeters - approachClearanceMeters
      : spawnMeters >= planeMeters + approachClearanceMeters;
    if (!startsOnApproachSide) {
      fail(
        "checkpointSpatialCriteria",
        `${criterion.checkpointId} must start with Spawn on the opposite ` +
          "approach side outside capsule clearance",
      );
    }
    return Object.freeze({
      ...criterion,
      sourceBoundsMeters,
      planeMeters,
    }) satisfies FormalTraversalCheckpointSpatialCriterionV1;
  });
  const criteriaByCheckpointId = new Map(checkpointSpatialCriteria.map(
    (criterion) => [criterion.checkpointId, criterion],
  ));
  const expectedCheckpointIds = reconstructionCase.expected
    .criticalTraversalChecks.flatMap(({ checkpointIds }) => checkpointIds)
    .sort();
  if (!isEqual(
    authoredCheckpointCriteria.map(({ checkpointId }) => checkpointId).sort(),
    expectedCheckpointIds,
  )) fail("checkpointSpatialCriteria", "must bind every Case checkpoint exactly once");
  return parseFormalSemanticCaptureMapV1({
    kind: "formal-semantic-capture-map",
    schemaVersion: 1,
    id: `${reconstructionCase.id}.semantic-capture-map`,
    caseRef: parseWorldReconstructionCaseArtifactRefV1(
      `artifact://world-reconstruction-case/${reconstructionCase.id}/case.json`,
    ),
    caseHash: metadata.caseHash,
    authoringManifestHash: metadata.authoringManifestHash,
    layoutInventoryHash: metadata.checkedLayoutInventoryHash,
    contributionHash: metadata.contributionHash,
    bindings: semanticCaptureTargetBindings.map((semanticBinding) => {
      const group = groupById.get(semanticBinding.blockVisualGroupId)!;
      return {
        acceptanceTargetRef: semanticBinding.acceptanceTargetRef,
        compositionTargetRef: semanticBinding.compositionTargetRef,
        topologyNodeId: semanticBinding.topologyNodeId,
        semanticLayerId: semanticBinding.semanticLayerId,
        blockVisualGroupId: semanticBinding.blockVisualGroupId,
        semanticClassId: group.semanticClassId,
        identityColor: group.identityColorHex,
        projectedBoundsSource: "checked-layout-visual-group",
        viewRequirements: caseTargetByAcceptanceRef.get(
          semanticBinding.acceptanceTargetRef,
        )!.viewRequirements.map(({ viewId, mode }) => ({ viewId, mode })),
        authoringManifestHash: metadata.authoringManifestHash,
        layoutInventoryHash: metadata.checkedLayoutInventoryHash,
        contributionHash: metadata.contributionHash,
      };
    }),
    topologyRelations,
    traversalCheckBindings: reconstructionCase.expected.criticalTraversalChecks
      .map((check) => ({
        traversalCheckId: check.id,
        acceptanceTargetRef: check.acceptanceTargetRef,
        checkExpectation: check.expectation,
        fixedInputSequenceHash: sha256CanonicalJson(
          check.fixedInputSequence,
        ) as Sha256HashV1,
        checkpointCriteria: check.checkpointIds.map(
          (checkpointId) => criteriaByCheckpointId.get(checkpointId)!,
        ),
      })),
  });
}
