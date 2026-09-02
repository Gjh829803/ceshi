import type { BabylonNativeTraversalBindingV1 } from
  "@whitebox-world/native-babylon";
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
  BabylonNativeBlockExposedEdgePolicyV1,
} from "./collider-contribution.js";
import type { BabylonNativeBlockLayoutEntryV1 } from "./layout.js";
import type { BabylonNativeBlockPaletteRoleV1 } from "./profile.js";
import type {
  BabylonNativeBlockFinalizedEpochV1,
} from "./session.js";
import type {
  BabylonNativeBlockPositionMetersXYZV1,
  BabylonNativeBlockShapeKindV1,
} from "./shapes.js";

type BabylonNativeBlockLayoutVolumeColliderV1 = Extract<
  BabylonNativeBlockColliderCandidateInventoryEntryV1,
  Readonly<{ proxyKind: "layout-block-volume" }>
>;

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
  readonly residencyGroupId: string;
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly semanticCaptureClassId: string;
  readonly blockIds: readonly string[];
}

export interface BabylonNativeBlockColliderCoalescingGroupV1 {
  readonly id: string;
  readonly residencyGroupId: string;
  readonly colliderIds: readonly string[];
  readonly sourceBlockIds: readonly string[];
  readonly visualGroupIds: readonly string[];
  readonly proxyKind: "layout-block-volume";
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly exposedEdgePolicy: BabylonNativeBlockExposedEdgePolicyV1;
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
  readonly minimumMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly maximumMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
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
  readonly areCoalescedBoundsExact: true;
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
  readonly colliderCoalescingGroups:
    readonly BabylonNativeBlockColliderCoalescingGroupV1[];
  readonly independentColliderIds: readonly string[];
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
  colliders: readonly BabylonNativeBlockLayoutVolumeColliderV1[];
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
    const sourceBlockId = collider.sourceBlockIds[0];
    const sourceBlock = typeof sourceBlockId === "string"
      ? blockById.get(sourceBlockId)
      : undefined;
    const expectedVisualGroupIds = sourceBlock?.visualGroupId === undefined
      ? []
      : [sourceBlock.visualGroupId];
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
      collider.sourceBlockIds.length !== 1 ||
      typeof sourceBlockId !== "string" ||
      !blockIds.has(sourceBlockId) ||
      collider.proxyKind !== "layout-block-volume" ||
      (collider.exposedEdgePolicy !== "none" &&
        collider.exposedEdgePolicy !== "protect-ground-subject") ||
      (collider.exposedEdgePolicy === "protect-ground-subject" &&
        binding.kind !== "static-surface") ||
      colliderIds.has(collider.colliderId) ||
      colliderBlockIds.has(sourceBlockId) ||
      !bindingIsClosed ||
      !isEqual(collider.visualGroupIds, expectedVisualGroupIds) ||
      ![...collider.visualGroupIds].sort(stableCompare)
        .every((id, index) => id === collider.visualGroupIds[index])
    ) fail("Collider identities and source Block joins must be exact and unique");
    colliderIds.add(collider.colliderId);
    colliderBlockIds.add(sourceBlockId);
    validateRatio(collider, "frictionRatio");
    validateRatio(collider, "restitutionRatio");
  }
  return Object.freeze({
    blocks,
    colliders: colliders as readonly BabylonNativeBlockLayoutVolumeColliderV1[],
  });
}

export function createBabylonNativeBlockResidencyGroupsV1(
  blocks: readonly BabylonNativeBlockLayoutEntryV1[],
  chunkPolicy: BabylonNativeBlockChunkPolicyV1,
): Readonly<{
  groups: readonly BabylonNativeBlockOptimizationResidencyGroupV1[];
  residencyGroupIdByBlockId: ReadonlyMap<string, string>;
}> {
  const blocksByResidencyId = new Map<string, BabylonNativeBlockLayoutEntryV1[]>();
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
 * inside one Chunk, one fixed shape, one palette role and at most one semantic
 * visual group; every other Block stays an independent Mesh.
 */
export function createBabylonNativeBlockThinInstanceGroupsV1(
  blocks: readonly BabylonNativeBlockLayoutEntryV1[],
  residencyByBlockId: ReadonlyMap<string, string>,
): Readonly<{
  groups: readonly BabylonNativeBlockThinInstanceGroupV1[];
  independentBlockIds: readonly string[];
}> {
  const candidateBlocks = blocks.filter((block) =>
    residencyByBlockId.get(block.id)?.startsWith("grid-chunk-") === true);
  const partitions = groupBy(candidateBlocks, (block) => JSON.stringify([
    residencyByBlockId.get(block.id),
    block.shape,
    block.paletteRole,
    block.visualGroupId ?? null,
  ]));
  const eligiblePartitions = Object.entries(partitions)
    .filter(([, members]) => members.length >= 2)
    .sort(([left], [right]) => stableCompare(left, right));
  const groupedBlockIds = new Set<string>();
  const groups = eligiblePartitions.map(([, members], index) => {
    const first = members[0]!;
    const blockIds = members.map(({ id }) => id).sort(stableCompare);
    blockIds.forEach((id) => groupedBlockIds.add(id));
    return {
      id: `thin-instance-group-${String(index + 1).padStart(4, "0")}`,
      residencyGroupId: residencyByBlockId.get(first.id)!,
      shape: first.shape,
      paletteRole: first.paletteRole,
      semanticCaptureClassId:
        `worldkit.native-block.group.${first.visualGroupId ?? "ungrouped"}`,
      blockIds,
    };
  });
  return Object.freeze({
    groups,
    independentBlockIds: blocks.map(({ id }) => id)
      .filter((id) => !groupedBlockIds.has(id))
      .sort(stableCompare),
  });
}

function colliderPartitionKey(
  collider: BabylonNativeBlockLayoutVolumeColliderV1,
  residencyGroupId: string,
): string {
  return sha256CanonicalJson({
    residencyGroupId,
    proxyKind: collider.proxyKind,
    traversalBinding: collider.traversalBinding,
    exposedEdgePolicy: collider.exposedEdgePolicy,
    frictionRatio: Object.hasOwn(collider, "frictionRatio")
      ? { kind: "present", value: collider.frictionRatio }
      : { kind: "absent" },
    restitutionRatio: Object.hasOwn(collider, "restitutionRatio")
      ? { kind: "present", value: collider.restitutionRatio }
      : { kind: "absent" },
    visualGroupIds: collider.visualGroupIds,
  });
}

function connectedComponents(
  colliders: readonly BabylonNativeBlockLayoutVolumeColliderV1[],
  blockById: ReadonlyMap<string, BabylonNativeBlockLayoutEntryV1>,
): readonly (readonly BabylonNativeBlockLayoutVolumeColliderV1[])[] {
  const colliderByCell = new Map<string, string>();
  const colliderById = new Map(colliders.map((collider) =>
    [collider.colliderId, collider] as const));
  for (const collider of colliders) {
    for (const key of blockById.get(collider.sourceBlockIds[0])!
      .occupiedMicroCellKeys) colliderByCell.set(key, collider.colliderId);
  }
  const adjacentById = new Map(colliders.map((collider) =>
    [collider.colliderId, new Set<string>()] as const));
  const directions = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ] as const;
  for (const collider of colliders) {
    for (const key of blockById.get(collider.sourceBlockIds[0])!
      .occupiedMicroCellKeys) {
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      for (const [dx, dy, dz] of directions) {
        const neighbor = colliderByCell.get(`${x + dx},${y + dy},${z + dz}`);
        if (neighbor !== undefined && neighbor !== collider.colliderId) {
          adjacentById.get(collider.colliderId)!.add(neighbor);
        }
      }
    }
  }
  const unseen = new Set(colliders.map(({ colliderId }) => colliderId));
  const components: BabylonNativeBlockLayoutVolumeColliderV1[][] = [];
  while (unseen.size > 0) {
    const seed = [...unseen].sort(stableCompare)[0]!;
    const pending = [seed];
    unseen.delete(seed);
    const component: BabylonNativeBlockLayoutVolumeColliderV1[] = [];
    while (pending.length > 0) {
      const id = pending.shift()!;
      component.push(colliderById.get(id)!);
      for (const neighbor of [...adjacentById.get(id)!].sort(stableCompare)) {
        if (!unseen.delete(neighbor)) continue;
        pending.push(neighbor);
      }
    }
    components.push(component.sort((left, right) =>
      stableCompare(left.colliderId, right.colliderId)));
  }
  return components;
}

function isExactRectangularPrism(
  component: readonly BabylonNativeBlockLayoutVolumeColliderV1[],
  blockById: ReadonlyMap<string, BabylonNativeBlockLayoutEntryV1>,
): boolean {
  const cells = new Set(component.flatMap((collider) =>
    blockById.get(collider.sourceBlockIds[0])!.occupiedMicroCellKeys));
  const parsed = [...cells].map((key) => key.split(",").map(Number));
  const minimum = [0, 1, 2].map((axis) =>
    Math.min(...parsed.map((cell) => cell[axis]!)));
  const maximum = [0, 1, 2].map((axis) =>
    Math.max(...parsed.map((cell) => cell[axis]!)));
  const expectedCount = (maximum[0]! - minimum[0]! + 1) *
    (maximum[1]! - minimum[1]! + 1) *
    (maximum[2]! - minimum[2]! + 1);
  return cells.size === expectedCount;
}

function createColliderGroups(
  colliders: readonly BabylonNativeBlockLayoutVolumeColliderV1[],
  blocks: readonly BabylonNativeBlockLayoutEntryV1[],
  residencyByBlockId: ReadonlyMap<string, string>,
): Readonly<{
  groups: readonly BabylonNativeBlockColliderCoalescingGroupV1[];
  independentColliderIds: readonly string[];
}> {
  const blockById = new Map(blocks.map((block) => [block.id, block] as const));
  const partitions = groupBy(colliders, (collider) => colliderPartitionKey(
    collider,
    residencyByBlockId.get(collider.sourceBlockIds[0])!,
  ));
  const eligibleComponents = Object.entries(partitions)
    .sort(([left], [right]) => stableCompare(left, right))
    .flatMap(([, members]) => connectedComponents(members, blockById))
    .filter((component) => component.length >= 2 &&
      isExactRectangularPrism(component, blockById))
    .sort((left, right) => stableCompare(
      left.map(({ colliderId }) => colliderId).join("\0"),
      right.map(({ colliderId }) => colliderId).join("\0"),
    ));
  const groupedColliderIds = new Set<string>();
  const groups = eligibleComponents.map((component, index) => {
    const first = component[0]!;
    const sourceBlocks = component.map((collider) =>
      blockById.get(collider.sourceBlockIds[0])!);
    component.forEach(({ colliderId }) => groupedColliderIds.add(colliderId));
    const minimumMetersXYZ = [0, 1, 2].map((axis) => Math.min(
      ...sourceBlocks.map((block) => block.minimumMetersXYZ[axis]!),
    )) as [number, number, number];
    const maximumMetersXYZ = [0, 1, 2].map((axis) => Math.max(
      ...sourceBlocks.map((block) => block.maximumMetersXYZ[axis]!),
    )) as [number, number, number];
    return {
      id: `collider-coalescing-group-${String(index + 1).padStart(4, "0")}`,
      residencyGroupId: residencyByBlockId.get(first.sourceBlockIds[0])!,
      colliderIds: component.map(({ colliderId }) => colliderId)
        .sort(stableCompare),
      sourceBlockIds: component.map(({ sourceBlockIds }) => sourceBlockIds[0])
        .sort(stableCompare),
      visualGroupIds: [...first.visualGroupIds],
      proxyKind: first.proxyKind,
      traversalBinding: { ...first.traversalBinding },
      exposedEdgePolicy: first.exposedEdgePolicy,
      ...(Object.hasOwn(first, "frictionRatio")
        ? { frictionRatio: first.frictionRatio }
        : {}),
      ...(Object.hasOwn(first, "restitutionRatio")
        ? { restitutionRatio: first.restitutionRatio }
        : {}),
      minimumMetersXYZ,
      maximumMetersXYZ,
    };
  });
  return Object.freeze({
    groups,
    independentColliderIds: colliders.map(({ colliderId }) => colliderId)
      .filter((id) => !groupedColliderIds.has(id))
      .sort(stableCompare),
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
    residency.residencyGroupIdByBlockId,
  );
  const collider = createColliderGroups(
    colliders,
    blocks,
    residency.residencyGroupIdByBlockId,
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
  assertExactCoverage(
    colliders.map(({ colliderId }) => colliderId),
    [...collider.groups.flatMap(({ colliderIds }) => colliderIds),
      ...collider.independentColliderIds],
    "Collider",
  );

  const baselineResources = {
    visualMeshCount: blocks.length,
    visualDrawUnitCount: blocks.length,
    visualGeometryBufferSetCount: blocks.length,
    paletteMaterialCount: new Set(blocks.map(({ paletteRole }) => paletteRole))
      .size,
    colliderProxyCount: colliders.length,
    colliderTriangleCount: colliders.length * 12,
  };
  const projectedColliderProxyCount = collider.groups.length +
    collider.independentColliderIds.length;
  const projectedResources = {
    thinInstanceBatchCount: thin.groups.length,
    independentVisualMeshCount: thin.independentBlockIds.length,
    visualDrawUnitCount: thin.groups.length + thin.independentBlockIds.length,
    visualGeometryBufferSetCount:
      thin.groups.length + thin.independentBlockIds.length,
    residencyGroupCount: residency.groups.length,
    colliderProxyCount: projectedColliderProxyCount,
    colliderTriangleCount: projectedColliderProxyCount * 12,
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
    colliderCoalescingGroups: collider.groups,
    independentColliderIds: collider.independentColliderIds,
    baselineResources,
    projectedResources,
    equivalence: {
      areBlockIdsPreserved: true as const,
      isResidencyCoverageComplete: true as const,
      isSemanticCaptureMembershipPreserved: true as const,
      areColliderIdsPreserved: true as const,
      areColliderSemanticsPreserved: true as const,
      areCoalescedBoundsExact: true as const,
    },
  };
  return deepFreezeData({
    ...payload,
    assessmentHash: sha256CanonicalJson(payload) as `sha256:${string}`,
  }) as BabylonNativeBlockOptimizationAssessmentV1;
}
