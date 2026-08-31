import { sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  hashBabylonNativeBlockMaterializerMetadataV1,
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeBlockMaterializerMetadataV1,
  parseBabylonNativeSceneContributionV1,
  parseFormalSemanticCaptureMapV1,
  parseFormalTraversalCheckpointSpatialCriteriaV1,
  type FormalSemanticCaptureMapV1,
  type FormalTraversalCheckpointSpatialCriterionV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashWorldReconstructionCaseV1,
  parseWorldReconstructionCaseV1,
  type WorldReconstructionCaseV1,
} from "@whitebox-world/validation";
import { isEqual, isNil } from "lodash-es";

export interface BindBlockMaterializerMetadataToSemanticCaptureTargetsInputV1 {
  readonly case: WorldReconstructionCaseV1;
  readonly materializerMetadata: unknown;
  readonly materializerMetadataHash: Sha256HashV1;
  readonly contribution: unknown;
  readonly checkpointSpatialCriteria:
    readonly FormalTraversalCheckpointSpatialCriterionV1[];
}

const CONTRACT = "FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID";
const INPUT_FIELDS = [
  "case", "materializerMetadata", "materializerMetadataHash", "contribution",
  "checkpointSpatialCriteria",
] as const;

function fail(path: string, message: string): never {
  throw new Error(`${CONTRACT}:${path.length === 0 ? "" : ` ${path}:`} ${message}`);
}

function assertAccessorFree(value: unknown, path = "", seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail(path, "symbol keys are forbidden");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!isNil(descriptor?.get) || !isNil(descriptor?.set)) {
      fail(`${path}/${key}`, "accessors are forbidden");
    }
    assertAccessorFree(descriptor?.value, `${path}/${key}`, seen);
  }
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
  const checkpointSpatialCriteria =
    parseFormalTraversalCheckpointSpatialCriteriaV1(
      source.checkpointSpatialCriteria,
    );
  const groupById = new Map(metadata.visualGroups.map((group) => [
    group.visualGroupId, group,
  ]));
  const criteriaByCheckpointId = new Map(checkpointSpatialCriteria.map(
    (criterion) => [criterion.checkpointId, criterion],
  ));
  for (const criterion of checkpointSpatialCriteria) {
    const group = groupById.get(criterion.sourceVisualGroupId);
    if (
      isNil(group) ||
      !isEqual(criterion.sourceBoundsMeters, {
        minimumMetersXYZ: group.minimumMetersXYZ,
        maximumMetersXYZ: group.maximumMetersXYZ,
      }) ||
      (criterion.kind === "block-plane" &&
        !metadata.colliderJoins.some(
          ({ colliderId }) => colliderId === criterion.colliderId,
        ))
    ) fail("checkpointSpatialCriteria", "must join verified Package metadata");
  }
  const expectedCheckpointIds = reconstructionCase.expected
    .criticalTraversalChecks.flatMap(({ checkpointIds }) => checkpointIds)
    .sort();
  if (!isEqual(
    checkpointSpatialCriteria.map(({ checkpointId }) => checkpointId).sort(),
    expectedCheckpointIds,
  )) fail("checkpointSpatialCriteria", "must bind every Case checkpoint exactly once");
  return parseFormalSemanticCaptureMapV1({
    kind: "formal-semantic-capture-map",
    schemaVersion: 1,
    id: `${reconstructionCase.id}.semantic-capture-map`,
    caseRef: `worldkit://world-reconstruction-case/${reconstructionCase.id}`,
    caseHash: metadata.caseHash,
    authoringManifestHash: metadata.authoringManifestHash,
    layoutInventoryHash: metadata.checkedLayoutInventoryHash,
    contributionHash: metadata.contributionHash,
    bindings: metadata.visualGroups.map((group) => ({
      acceptanceTargetRef: group.acceptanceTargetRef,
      blockVisualGroupId: group.visualGroupId,
      semanticClassId: group.semanticClassId,
      identityColor: group.identityColorHex,
      projectedBoundsSource: "checked-layout-visual-group",
      requiredWorldViewIds: ["opening", "world-side", "world-top-down"],
      authoringManifestHash: metadata.authoringManifestHash,
      layoutInventoryHash: metadata.checkedLayoutInventoryHash,
      contributionHash: metadata.contributionHash,
    })),
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
