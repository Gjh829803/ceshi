import { createBabylonNativeBlockVisualClustersV1, type BabylonNativeBlockVisualClusterSourceV1 } from "./visual-clusters.js";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { groupBy, isEqual } from "lodash-es";

import {
  hashBabylonNativeBlockChunkPolicyV1,
  parseBabylonNativeBlockChunkPolicyV1,
  resolveBabylonNativeBlockChunkAssignmentV1,
  type BabylonNativeBlockChunkPolicyV1,
} from "./chunk-policy.js";
import type {
  BabylonNativeBlockColliderCandidateInventoryEntryV1,
} from "./collider-contribution.js";
import type { BabylonNativeBlockLayoutEntryV1 } from "./layout.js";
import type { BabylonNativeBlockPaletteRoleV1 } from "./profile.js";
import type {
  BabylonNativeBlockFinalizedEpochV1,
} from "./session.js";
import type { BabylonNativeBlockShapeKindV1 } from "./shapes.js";

export type BabylonNativeBlockOptimizationResidencyGroupV1 =
  | Readonly<{
      kind: "grid-chunk";
      id: string;
      chunkIndexXZ: readonly [number, number];
      minimumMetersXZ: readonly [number, number];
      maximumMetersXZ: readonly [number, number];
      blockIds: readonly string[];
    }>
  | Readonly<{
      kind: "chunk-straddling-block";
      id: string;
      blockIds: readonly [string];
    }>;

export interface BabylonNativeBlockThinInstanceGroupV1 {
  readonly id: string;
  readonly visualChunkIndexXZ: readonly [number, number];
  readonly clusters: readonly Readonly<{
    sourceBlockIds: readonly string[];
    minimumMetersXYZ: readonly [number, number, number];
    maximumMetersXYZ: readonly [number, number, number];
  }>[];
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly semanticCaptureClassId: string;
  readonly blockIds: readonly string[];
}

export interface BabylonNativeBlockOptimizationBaselineResourcesV1 {
  readonly visualMeshCount: number;
  readonly visualDrawUnitCount: number;
  readonly visualGeometryBufferSetCount: number;
  readonly paletteMaterialCount: number;
  readonly colliderProxyCount: number;
  readonly colliderTriangleCount: number;
}

export interface BabylonNativeBlockOptimizationProjectedResourcesV1 {
  readonly thinInstanceBatchCount: number;
  readonly independentVisualMeshCount: number;
  readonly visualDrawUnitCount: number;
  readonly visualGeometryBufferSetCount: number;
  readonly residencyGroupCount: number;
  readonly colliderProxyCount: number;
  readonly colliderTriangleCount: number;
}

export interface BabylonNativeBlockOptimizationEquivalenceV1 {
  readonly areBlockIdsPreserved: true;
  readonly isResidencyCoverageComplete: true;
  readonly isSemanticCaptureMembershipPreserved: true;
  readonly areColliderIdsPreserved: true;
  readonly areColliderSemanticsPreserved: true;
  readonly isColliderTopologyPreserved: true;
}

export interface BabylonNativeBlockOptimizationAssessmentV1 {
  readonly kind: "babylon-native-block-optimization-assessment";
  readonly schemaVersion: 1;
  readonly profileInventoryHash: `sha256:${string}`;
  readonly measurementKind: "deterministic-resource-counts";
  readonly chunkPolicy: BabylonNativeBlockChunkPolicyV1;
  readonly chunkPolicyHash: `sha256:${string}`;
  readonly residencyGroups:
    readonly BabylonNativeBlockOptimizationResidencyGroupV1[];
  readonly thinInstanceGroups: readonly BabylonNativeBlockThinInstanceGroupV1[];
  readonly independentVisualBlockIds: readonly string[];
  readonly topologyColliderIds: readonly string[];
  readonly baselineResources: BabylonNativeBlockOptimizationBaselineResourcesV1;
  readonly projectedResources:
    BabylonNativeBlockOptimizationProjectedResourcesV1;
  readonly equivalence: BabylonNativeBlockOptimizationEquivalenceV1;
  readonly assessmentHash: `sha256:${string}`;
}

const HASH = /^sha256:[0-9a-f]{64}$/;
const INPUT_INVALID_CODE = "WORLDKIT_NATIVE_BLOCK_OPTIMIZATION_INPUT_INVALID";

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message: string): never {
  throw new TypeError(
    `${INPUT_INVALID_CODE}: ${message}`,
  );
}

function deepFreezeData<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  for (const child of Object.values(value)) deepFreezeData(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function validateRatio(
  collider: BabylonNativeBlockColliderCandidateInventoryEntryV1,
  key: "frictionRatio" | "restitutionRatio",
): void {
  if (!Object.hasOwn(collider, key)) return;
  const value = collider[key];
  if (
    typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
    value > 1 || Object.is(value, -0)
  ) fail(`${key} must retain one explicit canonical Ratio when present`);
}

function validateInput(
  epoch: BabylonNativeBlockFinalizedEpochV1,
): Readonly<{
  blocks: readonly BabylonNativeBlockLayoutEntryV1[];
  colliders: readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[];
}> {
  if (
    epoch.kind !== "babylon-native-block-finalized-epoch" ||
    epoch.schemaVersion !== 1 ||
    !HASH.test(epoch.profileInventoryHash) ||
    epoch.checkedLayout.kind !== "babylon-native-block-checked-layout" ||
    epoch.checkedLayout.schemaVersion !== 1 ||
    epoch.checkedLayout.checkResult.outcome !== "passed" ||
    epoch.checkedLayout.layout.issues.length !== 0 ||
    !isEqual(
      epoch.visualGroups,
      epoch.checkedLayout.checkResult.visualGroups,
    )
  ) fail("assessment requires one passed, issue-free finalized Profile epoch");

  const blocks = [...epoch.checkedLayout.layout.blocks]
    .sort((left, right) => stableCompare(left.id, right.id));
  const blockIds = new Set(blocks.map(({ id }) => id));
  const blockById = new Map(blocks.map((block) => [block.id, block] as const));
  const recordIds = new Set(epoch.checkedLayout.records.map(({ input }) =>
    input.id));
  if (
    blockIds.size !== blocks.length ||
    recordIds.size !== epoch.checkedLayout.records.length ||
    blockIds.size !== recordIds.size ||
    blocks.some(({ id }) => !recordIds.has(id)) ||
    epoch.checkedLayout.records.some(({ input: recordInput }) => {
      const block = blockById.get(recordInput.id);
      return block === undefined ||
        recordInput.shape !== block.shape ||
        recordInput.paletteRole !== block.paletteRole ||
        recordInput.visualGroupId !== block.visualGroupId ||
        recordInput.colliderGroupId !== block.colliderGroupId;
    })
  ) fail("checked Block identities must be unique and exactly joined");

  const colliders = [...epoch.colliderInventory]
    .sort((left, right) => stableCompare(left.colliderId, right.colliderId));
  const colliderIds = new Set<string>();
  const colliderBlockIds = new Set<string>();
  for (const collider of colliders) {
    const sourceBlocks = collider.sourceBlockIds.map((sourceBlockId) =>
      blockById.get(sourceBlockId));
    const expectedVisualGroupIds = [...new Set(sourceBlocks.flatMap((block) =>
      block?.visualGroupId === undefined ? [] : [block.visualGroupId]))]
      .sort(stableCompare);
    const binding = collider.traversalBinding;
    const bindingIsClosed = binding.kind === "not-traversable"
      ? Object.keys(binding).length === 1
      : binding.kind === "static-surface" &&
        Object.keys(binding).length === 4 &&
        [
          binding.surfaceEntityId,
          binding.logicalSubshapeId,
          binding.traversalSurfaceProfileRef,
        ].every((value) => typeof value === "string" && value.length > 0);
    if (
      collider.sourceBlockIds.length === 0 ||
      sourceBlocks.some((block) => block === undefined) ||
      ![...collider.sourceBlockIds].sort(stableCompare)
        .every((id, index) => id === collider.sourceBlockIds[index]) ||
      new Set(collider.sourceBlockIds).size !== collider.sourceBlockIds.length ||
      (collider.proxyKind !== "continuous-walkable-surface" &&
        collider.proxyKind !== "exact-solid-union") ||
      (collider.exposedEdgePolicy !== "none" &&
        collider.exposedEdgePolicy !== "protect-ground-subject") ||
      (collider.exposedEdgePolicy === "protect-ground-subject" &&
        binding.kind !== "static-surface") ||
      colliderIds.has(collider.colliderId) ||
      collider.sourceBlockIds.some((sourceBlockId) =>
        colliderBlockIds.has(sourceBlockId)) ||
      !bindingIsClosed ||
      !isEqual(collider.visualGroupIds, expectedVisualGroupIds) ||
      ![...collider.visualGroupIds].sort(stableCompare)
        .every((id, index) => id === collider.visualGroupIds[index]) ||
      collider.minimumMetersXYZ.some((value) => !Number.isFinite(value)) ||
      collider.maximumMetersXYZ.some((value, axis) =>
        !Number.isFinite(value) || value < collider.minimumMetersXYZ[axis]!) ||
      (collider.proxyKind === "continuous-walkable-surface"
        ? collider.maximumMetersXYZ[0] <= collider.minimumMetersXYZ[0] ||
          collider.maximumMetersXYZ[2] <= collider.minimumMetersXYZ[2]
        : collider.maximumMetersXYZ.some((value, axis) =>
          value <= collider.minimumMetersXYZ[axis]!)) ||
      !Number.isSafeInteger(collider.vertexCount) ||
      collider.vertexCount < 3 ||
      !Number.isSafeInteger(collider.triangleCount) ||
      collider.triangleCount < 1 ||
      !HASH.test(collider.topologyHash)
    ) fail("Collider identities and source Block joins must be exact and unique");
    colliderIds.add(collider.colliderId);
    collider.sourceBlockIds.forEach((sourceBlockId) =>
      colliderBlockIds.add(sourceBlockId));
    validateRatio(collider, "frictionRatio");
    validateRatio(collider, "restitutionRatio");
  }
  return Object.freeze({
    blocks,
    colliders,
  });
}

export type BabylonNativeBlockResidencyExtentV1 = Readonly<{
  id: string;
  minimumMetersXYZ: readonly number[];
  maximumMetersXYZ: readonly number[];
}>;

export function createBabylonNativeBlockResidencyGroupsV1(
  blocks: readonly BabylonNativeBlockResidencyExtentV1[],
  chunkPolicy: BabylonNativeBlockChunkPolicyV1,
): Readonly<{
  groups: readonly BabylonNativeBlockOptimizationResidencyGroupV1[];
  residencyGroupIdByBlockId: ReadonlyMap<string, string>;
}> {
  const blocksByResidencyId = new Map<
    string,
    BabylonNativeBlockResidencyExtentV1[]
  >();
  type ResidencyDefinition =
    | Readonly<{
        kind: "grid-chunk";
        id: string;
        chunkIndexXZ: readonly [number, number];
        minimumMetersXZ: readonly [number, number];
        maximumMetersXZ: readonly [number, number];
      }>
    | Readonly<{ kind: "chunk-straddling-block"; id: string }>;
  const definitionById = new Map<string, ResidencyDefinition>();
  const residencyGroupIdByBlockId = new Map<string, string>();
  for (const block of blocks) {
    const assignment = resolveBabylonNativeBlockChunkAssignmentV1(chunkPolicy, {
      minimumMetersXYZ: block.minimumMetersXYZ,
      maximumMetersXYZ: block.maximumMetersXYZ,
      straddlingId: `chunk-straddling-block-${block.id}`,
    });
    residencyGroupIdByBlockId.set(block.id, assignment.id);
    const members = blocksByResidencyId.get(assignment.id) ?? [];
    members.push(block);
    blocksByResidencyId.set(assignment.id, members);
    if (!definitionById.has(assignment.id)) {
      definitionById.set(assignment.id, assignment.kind === "grid-chunk"
        ? {
            kind: "grid-chunk",
            id: assignment.id,
            chunkIndexXZ: assignment.chunkIndexXZ,
            minimumMetersXZ: assignment.minimumMetersXZ,
            maximumMetersXZ: assignment.maximumMetersXZ,
          }
        : { kind: "chunk-straddling-block", id: assignment.id });
    }
  }
  const groups = [...blocksByResidencyId.entries()]
    .sort(([left], [right]) => stableCompare(left, right))
    .map(([id, members]): BabylonNativeBlockOptimizationResidencyGroupV1 => {
      const definition = definitionById.get(id)!;
      const blockIds = members.map(({ id: blockId }) => blockId)
        .sort(stableCompare);
      return definition.kind === "grid-chunk"
        ? Object.freeze({
            ...definition,
            chunkIndexXZ: Object.freeze([...definition.chunkIndexXZ]) as
              readonly [number, number],
            minimumMetersXZ: Object.freeze([...definition.minimumMetersXZ]) as
              readonly [number, number],
            maximumMetersXZ: Object.freeze([...definition.maximumMetersXZ]) as
              readonly [number, number],
            blockIds: Object.freeze(blockIds),
          })
        : Object.freeze({
            ...definition,
            blockIds: Object.freeze([blockIds[0]!] as [string]),
          });
    });
  return Object.freeze({ groups, residencyGroupIdByBlockId });
}

/**
 * Single owner of Thin Instance batch membership. A batch may join Blocks only
 * inside one 32m visual Chunk, one fixed shape, one palette role and at most one semantic
 * visual group; every other Block stays an independent Mesh.
 */
export function createBabylonNativeBlockThinInstanceGroupsV1(
  blocks: readonly BabylonNativeBlockVisualClusterSourceV1[],
): Readonly<{
  groups: readonly BabylonNativeBlockThinInstanceGroupV1[];
  independentBlockIds: readonly string[];
}> {
  const clusters = createBabylonNativeBlockVisualClustersV1(blocks);
  const partitions = groupBy(clusters, (cluster) => JSON.stringify([
    cluster.chunkIndexXZ, cluster.source.shape, cluster.source.paletteRole,
    cluster.source.visualGroupId ?? null,
  ]));
  const groupedBlockIds = new Set<string>();
  const groups = Object.entries(partitions)
    .filter(([, members]) => members.reduce((sum, member) => sum + member.sourceBlockIds.length, 0) >= 2)
    .sort(([left], [right]) => stableCompare(left, right))
    .map(([, members], index) => {
      const first = members[0]!;
      const blockIds = members.flatMap(({ sourceBlockIds }) => sourceBlockIds).sort(stableCompare);
      blockIds.forEach((id) => groupedBlockIds.add(id));
      return Object.freeze({
        id: `thin-instance-group-${String(index + 1).padStart(4, "0")}`,
        visualChunkIndexXZ: first.chunkIndexXZ,
        shape: first.source.shape,
        paletteRole: first.source.paletteRole,
        semanticCaptureClassId: `worldkit.native-block.group.${first.source.visualGroupId ?? "ungrouped"}`,
        blockIds: Object.freeze(blockIds),
        clusters: Object.freeze(members.map(({ sourceBlockIds, minimumMetersXYZ, maximumMetersXYZ }) =>
          Object.freeze({ sourceBlockIds, minimumMetersXYZ, maximumMetersXYZ }))),
      });
    });
  return Object.freeze({
    groups: Object.freeze(groups),
    independentBlockIds: Object.freeze(blocks.map(({ id }) => id)
      .filter((id) => !groupedBlockIds.has(id)).sort(stableCompare)),
  });
}

function assertExactCoverage(
  expectedIds: readonly string[],
  proposedIds: readonly string[],
  label: string,
): void {
  if (!isEqual([...expectedIds].sort(stableCompare),
    [...proposedIds].sort(stableCompare))) {
    fail(`${label} coverage is incomplete or duplicated`);
  }
}

export function assessBabylonNativeBlockOptimizationV1(input: Readonly<{
  finalizedEpoch: BabylonNativeBlockFinalizedEpochV1;
  chunkPolicy: BabylonNativeBlockChunkPolicyV1;
}>): BabylonNativeBlockOptimizationAssessmentV1 {
  if (
    typeof input !== "object" || input === null || Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype ||
    !isEqual([...Object.keys(input)].sort(stableCompare),
      ["chunkPolicy", "finalizedEpoch"]) ||
    typeof input.finalizedEpoch !== "object" ||
    input.finalizedEpoch === null
  ) fail("input must contain exactly one finalizedEpoch and one chunkPolicy");
  const chunkPolicy = parseBabylonNativeBlockChunkPolicyV1(input.chunkPolicy);
  let validated: ReturnType<typeof validateInput>;
  try {
    validated = validateInput(input.finalizedEpoch);
  } catch (error) {
    if (
      error instanceof TypeError && error.message.startsWith(INPUT_INVALID_CODE)
    ) throw error;
    return fail("finalizedEpoch does not match the current closed contract");
  }
  const { blocks, colliders } = validated;
  const residency = createBabylonNativeBlockResidencyGroupsV1(
    blocks,
    chunkPolicy,
  );
  const thin = createBabylonNativeBlockThinInstanceGroupsV1(
    blocks,
  );
  assertExactCoverage(
    blocks.map(({ id }) => id),
    [...thin.groups.flatMap(({ blockIds }) => blockIds),
      ...thin.independentBlockIds],
    "Block",
  );
  assertExactCoverage(
    blocks.map(({ id }) => id),
    residency.groups.flatMap(({ blockIds }) => blockIds),
    "residency",
  );
  const topologyColliderIds = colliders.map(({ colliderId }) => colliderId)
    .sort(stableCompare);

  const authoringClusterCount = thin.groups.reduce(
    (sum, group) => sum + group.clusters.length, thin.independentBlockIds.length);
  const baselineResources = {
    visualMeshCount: authoringClusterCount,
    visualDrawUnitCount: authoringClusterCount,
    visualGeometryBufferSetCount: authoringClusterCount,
    paletteMaterialCount: new Set(blocks.map(({ paletteRole }) => paletteRole))
      .size,
    colliderProxyCount: colliders.length,
    colliderTriangleCount: colliders.reduce(
      (sum, { triangleCount }) => sum + triangleCount,
      0,
    ),
  };
  const projectedResources = {
    thinInstanceBatchCount: thin.groups.length,
    independentVisualMeshCount: thin.independentBlockIds.length,
    visualDrawUnitCount: thin.groups.length + thin.independentBlockIds.length,
    visualGeometryBufferSetCount:
      thin.groups.length + thin.independentBlockIds.length,
    residencyGroupCount: residency.groups.length,
    colliderProxyCount: baselineResources.colliderProxyCount,
    colliderTriangleCount: baselineResources.colliderTriangleCount,
  };
  const payload = {
    kind: "babylon-native-block-optimization-assessment" as const,
    schemaVersion: 1 as const,
    profileInventoryHash: input.finalizedEpoch.profileInventoryHash,
    measurementKind: "deterministic-resource-counts" as const,
    chunkPolicy,
    chunkPolicyHash: hashBabylonNativeBlockChunkPolicyV1(chunkPolicy),
    residencyGroups: residency.groups,
    thinInstanceGroups: thin.groups,
    independentVisualBlockIds: thin.independentBlockIds,
    topologyColliderIds,
    baselineResources,
    projectedResources,
    equivalence: {
      areBlockIdsPreserved: true as const,
      isResidencyCoverageComplete: true as const,
      isSemanticCaptureMembershipPreserved: true as const,
      areColliderIdsPreserved: true as const,
      areColliderSemanticsPreserved: true as const,
      isColliderTopologyPreserved: true as const,
    },
  };
  return deepFreezeData({
    ...payload,
    assessmentHash: sha256CanonicalJson(payload) as `sha256:${string}`,
  }) as BabylonNativeBlockOptimizationAssessmentV1;
}
