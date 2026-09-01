import { sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  hashBabylonNativeBlockMaterializerMetadataV1,
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeBlockMaterializerMetadataV1,
  parseBabylonNativeSceneContributionV1,
  parseFormalSemanticCaptureMapV1,
  parseFormalTraversalCheckpointSpatialCriteriaV1,
  type FormalSemanticCaptureMapV1,
  type FormalSemanticTopologyRelationBindingV1,
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
  readonly semanticCaptureTargetBindings: readonly Readonly<{
    acceptanceTargetRef: string;
    compositionTargetRef: string;
    topologyNodeId: string;
    semanticLayerId: string;
    blockVisualGroupId: string;
  }>[];
  readonly topologyRelations:
    readonly FormalSemanticTopologyRelationBindingV1[];
  readonly checkpointSpatialCriteria:
    readonly FormalTraversalCheckpointSpatialCriterionV1[];
}

const CONTRACT = "FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID";
const INPUT_FIELDS = [
  "case", "materializerMetadata", "materializerMetadataHash", "contribution",
  "semanticCaptureTargetBindings", "topologyRelations", "checkpointSpatialCriteria",
] as const;
const TARGET_BINDING_FIELDS = [
  "acceptanceTargetRef", "compositionTargetRef", "topologyNodeId",
  "semanticLayerId", "blockVisualGroupId",
] as const;
const TOPOLOGY_RELATION_FIELDS = [
  "fromNodeId", "relation", "toNodeId", "measurementSource",
] as const;
const PACKAGE_BOUNDS_TOPOLOGY_RELATION_FIELDS = [
  ...TOPOLOGY_RELATION_FIELDS, "fromVisualGroupId", "toVisualGroupId",
] as const;
const SDK_SUPPORT_TOPOLOGY_RELATION_FIELDS = [
  ...TOPOLOGY_RELATION_FIELDS, "subjectEntityId", "colliderId",
] as const;
const SDK_COLLIDER_TOPOLOGY_RELATION_FIELDS = [
  ...TOPOLOGY_RELATION_FIELDS, "colliderId", "sourceVisualGroupId",
] as const;
const SCRIPTED_TRAVERSAL_TOPOLOGY_RELATION_FIELDS = [
  ...TOPOLOGY_RELATION_FIELDS, "traversalCheckId",
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

function plainObject(
  value: unknown,
  path: string,
  fields: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    isNil(value) || typeof value !== "object" || Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  ) fail(path, "expected an ordinary plain object");
  const source = value as Readonly<Record<string, unknown>>;
  const allowed = new Set(fields);
  const unknown = Object.keys(source).find((key) => !allowed.has(key));
  if (!isNil(unknown)) fail(`${path}/${unknown}`, "unknown field");
  const missing = fields.find((key) => !Object.hasOwn(source, key));
  if (!isNil(missing)) fail(`${path}/${missing}`, "required field is missing");
  return source;
}

function topologyRelationBinding(
  value: unknown,
  path: string,
): FormalSemanticTopologyRelationBindingV1 {
  if (
    isNil(value) || typeof value !== "object" || Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  ) fail(path, "expected an ordinary plain object");
  const candidate = value as Readonly<Record<string, unknown>>;
  const measurementSource = stringField(
    candidate.measurementSource,
    `${path}/measurementSource`,
  );
  const fields = measurementSource === "package-bounds"
    ? PACKAGE_BOUNDS_TOPOLOGY_RELATION_FIELDS
    : measurementSource === "sdk-support"
      ? SDK_SUPPORT_TOPOLOGY_RELATION_FIELDS
      : measurementSource === "sdk-collider"
        ? SDK_COLLIDER_TOPOLOGY_RELATION_FIELDS
        : measurementSource === "scripted-traversal"
          ? SCRIPTED_TRAVERSAL_TOPOLOGY_RELATION_FIELDS
          : fail(`${path}/measurementSource`, "unexpected measurement source");
  const row = plainObject(candidate, path, fields);
  const relation = row.relation;
  if (![
    "connects-to", "contains", "above", "blocks",
  ].includes(relation as string)) fail(`${path}/relation`, "unexpected relation");
  const base = {
    fromNodeId: stringField(row.fromNodeId, `${path}/fromNodeId`),
    relation: relation as "connects-to" | "contains" | "above" | "blocks",
    toNodeId: stringField(row.toNodeId, `${path}/toNodeId`),
  } as const;
  if (measurementSource === "package-bounds") {
    return Object.freeze({
      ...base,
      measurementSource,
      fromVisualGroupId: stringField(
        row.fromVisualGroupId,
        `${path}/fromVisualGroupId`,
      ),
      toVisualGroupId: stringField(
        row.toVisualGroupId,
        `${path}/toVisualGroupId`,
      ),
    });
  }
  if (measurementSource === "sdk-support") {
    return Object.freeze({
      ...base,
      measurementSource,
      subjectEntityId: stringField(
        row.subjectEntityId,
        `${path}/subjectEntityId`,
      ),
      colliderId: stringField(row.colliderId, `${path}/colliderId`),
    });
  }
  if (measurementSource === "sdk-collider") {
    return Object.freeze({
      ...base,
      measurementSource,
      colliderId: stringField(row.colliderId, `${path}/colliderId`),
      sourceVisualGroupId: stringField(
        row.sourceVisualGroupId,
        `${path}/sourceVisualGroupId`,
      ),
    });
  }
  return Object.freeze({
    ...base,
    measurementSource: measurementSource as "scripted-traversal",
    traversalCheckId: stringField(
      row.traversalCheckId,
      `${path}/traversalCheckId`,
    ),
  });
}

function plainArray(value: unknown, path: string): readonly unknown[] {
  if (
    !Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertyNames(value).length !== value.length + 1
  ) fail(path, "expected an ordinary dense array");
  return value;
}

function stringField(value: unknown, path: string): string {
  if (
    typeof value !== "string" || value.length === 0 || value.trim() !== value ||
    value.normalize("NFC") !== value
  ) fail(path, "expected a non-empty trimmed NFC string");
  return value;
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
  const semanticCaptureTargetBindings = plainArray(
    source.semanticCaptureTargetBindings,
    "semanticCaptureTargetBindings",
  ).map((entry, index) => {
    const path = `semanticCaptureTargetBindings/${index}`;
    const row = plainObject(entry, path, TARGET_BINDING_FIELDS);
    return Object.freeze({
      acceptanceTargetRef: stringField(
        row.acceptanceTargetRef,
        `${path}/acceptanceTargetRef`,
      ),
      compositionTargetRef: stringField(
        row.compositionTargetRef,
        `${path}/compositionTargetRef`,
      ),
      topologyNodeId: stringField(row.topologyNodeId, `${path}/topologyNodeId`),
      semanticLayerId: stringField(row.semanticLayerId, `${path}/semanticLayerId`),
      blockVisualGroupId: stringField(
        row.blockVisualGroupId,
        `${path}/blockVisualGroupId`,
      ),
    });
  });
  if (
    semanticCaptureTargetBindings.length === 0 ||
    semanticCaptureTargetBindings.some((row, index) => index > 0 &&
      semanticCaptureTargetBindings[index - 1]!.acceptanceTargetRef >=
        row.acceptanceTargetRef)
  ) fail("semanticCaptureTargetBindings", "must be non-empty, unique, and acceptance-target sorted");
  for (const key of [
    "compositionTargetRef", "topologyNodeId", "blockVisualGroupId",
  ] as const) {
    if (
      new Set(semanticCaptureTargetBindings.map((row) => row[key])).size !==
        semanticCaptureTargetBindings.length
    ) fail("semanticCaptureTargetBindings", `${key} must map one-to-one`);
  }
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
  if (
    !isEqual(explicitTargetGroupPairs, packageTargetGroupPairs) ||
    !isEqual(explicitTargetGroupPairs, caseSilhouettePairs) ||
    !isEqual(
      semanticCaptureTargetBindings.map(({ acceptanceTargetRef }) => acceptanceTargetRef),
      [...reconstructionCase.acceptanceTargetRefs].sort(),
    ) ||
    !isEqual(
      semanticCaptureTargetBindings.map(({ compositionTargetRef }) => compositionTargetRef)
        .sort(),
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
  const topologyRelations = plainArray(source.topologyRelations, "topologyRelations")
    .map((entry, index) => topologyRelationBinding(
      entry,
      `topologyRelations/${index}`,
    ));
  const relationKeys = topologyRelations.map(({ fromNodeId, relation, toNodeId }) =>
    `${fromNodeId}\0${relation}\0${toNodeId}`);
  if (
    topologyRelations.length === 0 ||
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
    const matchingColliderJoins = criterion.kind === "block-plane"
      ? metadata.colliderJoins.filter(
        ({ colliderId }) => colliderId === criterion.colliderId,
      )
      : [];
    if (
      isNil(group) ||
      !isEqual(criterion.sourceBoundsMeters, {
        minimumMetersXYZ: group.minimumMetersXYZ,
        maximumMetersXYZ: group.maximumMetersXYZ,
      }) ||
      (criterion.kind === "block-plane" &&
        (matchingColliderJoins.length !== 1 ||
          !group.blockIds.includes(matchingColliderJoins[0]!.blockId)))
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
        requiredWorldViewIds: ["opening", "world-side", "world-top-down"],
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
