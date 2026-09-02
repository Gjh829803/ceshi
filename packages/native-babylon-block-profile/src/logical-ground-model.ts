import type { BabylonNativeTraversalBindingV1 } from
  "@whitebox-world/native-babylon";
import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import { hashBabylonNativeBlockCheckedLayoutInventoryV1 } from
  "./authoring-manifest.js";
import {
  failBabylonNativeBlockProfileBuildV1 as fail,
} from "./build-failure.js";
import type {
  BabylonNativeBlockExposedEdgePolicyV1,
  BabylonNativeBlockStaticColliderSelectionV1,
} from "./collider-contribution.js";
import type { BabylonNativeBlockLayoutEntryV1 } from "./layout.js";
import type { BabylonNativeBlockCheckedLayoutV1 } from "./session.js";

export interface BabylonNativeBlockLogicalGroundIdentityV1 {
  readonly buildEpochId: string;
  readonly checkedLayoutInventoryHash: Sha256HashV1;
  readonly profileInventoryHash: Sha256HashV1;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly traversalCapabilityEnvelopeHash: Sha256HashV1;
  readonly caseHash: Sha256HashV1;
}

export interface BabylonNativeBlockLogicalColliderGroupV1 {
  readonly colliderId: string;
  readonly colliderGeometrySource:
    BabylonNativeBlockStaticColliderSelectionV1["colliderGeometrySource"];
  readonly sourceBlockIds: readonly string[];
  readonly visualGroupIds: readonly string[];
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly exposedEdgePolicy: BabylonNativeBlockExposedEdgePolicyV1;
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
  readonly occupiedMicroCellKeys: readonly string[];
}

export interface BabylonNativeBlockLogicalSolidOccupancyCellV1 {
  readonly cellKey: string;
  readonly colliderId: string;
  readonly sourceBlockId: string;
  readonly colliderGroupId?: string;
  readonly visualGroupId?: string;
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
}

export interface BabylonNativeBlockLogicalSupportTopCellV1 {
  readonly topCellKey: string;
  readonly sourceOccupiedCellKey: string;
  readonly colliderId: string;
  readonly sourceBlockId: string;
  readonly colliderGroupId?: string;
  readonly visualGroupId?: string;
  readonly traversalBinding: Extract<
    BabylonNativeTraversalBindingV1,
    Readonly<{ kind: "static-surface" }>
  >;
}

export interface BabylonNativeBlockLogicalGroundModelV1 {
  readonly kind: "babylon-native-block-logical-ground-model";
  readonly schemaVersion: 1;
  readonly identity: BabylonNativeBlockLogicalGroundIdentityV1;
  readonly supportedTraversalSurfaceProfileRefs: readonly string[];
  readonly colliderGroups: readonly BabylonNativeBlockLogicalColliderGroupV1[];
  readonly solidOccupancyCells:
    readonly BabylonNativeBlockLogicalSolidOccupancyCellV1[];
  readonly exposedSupportTopCells:
    readonly BabylonNativeBlockLogicalSupportTopCellV1[];
  readonly logicalGroundModelHash: Sha256HashV1;
}

export interface FreezeBabylonNativeBlockLogicalGroundModelInputV1 {
  readonly buildEpochId: string;
  readonly checkedLayout: Pick<
    BabylonNativeBlockCheckedLayoutV1,
    "kind" | "schemaVersion" | "layout" | "checkResult"
  >;
  readonly profileInventoryHash: Sha256HashV1;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly traversalCapabilityEnvelopeHash: Sha256HashV1;
  readonly caseHash: Sha256HashV1;
  readonly supportedTraversalSurfaceProfileRefs: readonly string[];
  readonly selections: readonly BabylonNativeBlockStaticColliderSelectionV1[];
}

const INPUT_CODE = "WORLDKIT_NATIVE_BLOCK_LOGICAL_GROUND_INPUT_INVALID";
const IDENTITY_CODE = "WORLDKIT_NATIVE_BLOCK_LOGICAL_GROUND_IDENTITY_MISMATCH";
const SOURCE_MISSING_CODE = "WORLDKIT_NATIVE_BLOCK_LOGICAL_GROUND_SOURCE_MISSING";
const SOURCE_DUPLICATE_CODE = "WORLDKIT_NATIVE_BLOCK_LOGICAL_GROUND_SOURCE_DUPLICATE";
const OCCUPANCY_CODE = "WORLDKIT_NATIVE_BLOCK_LOGICAL_GROUND_OCCUPANCY_INVALID";
const STABLE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const SHA256_HASH = /^sha256:[a-f0-9]{64}$/;
const STABLE_REF = /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/;
const MICRO_CELL_KEY = /^-?(?:0|[1-9][0-9]*),-?(?:0|[1-9][0-9]*),-?(?:0|[1-9][0-9]*)$/;

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreezePlainData<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => deepFreezePlainData(entry))) as T;
  }
  if (typeof value !== "object" || isNil(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = deepFreezePlainData(entry);
  }
  return Object.freeze(output) as T;
}

function assertAcyclicPlainData(value: unknown): void {
  const seen = new Set<object>();
  const visit = (entry: unknown, path: string): void => {
    if (
      isNil(entry) ||
      typeof entry === "string" ||
      typeof entry === "boolean"
    ) return;
    if (typeof entry === "number") {
      if (!Number.isFinite(entry) || Object.is(entry, -0)) {
        return fail(INPUT_CODE, `${path} must be one finite canonical number.`);
      }
      return;
    }
    if (typeof entry !== "object" || seen.has(entry)) {
      return fail(INPUT_CODE, `${path} must be acyclic plain data.`);
    }
    seen.add(entry);
    let prototype: object | null;
    let descriptors: PropertyDescriptorMap;
    try {
      prototype = Reflect.getPrototypeOf(entry);
      descriptors = Object.getOwnPropertyDescriptors(entry);
    } catch {
      return fail(INPUT_CODE, `${path} cannot be inspected safely.`);
    }
    if (Array.isArray(entry)) {
      if (prototype !== Array.prototype) {
        return fail(INPUT_CODE, `${path} must use the ordinary Array prototype.`);
      }
      const ownKeys = Reflect.ownKeys(descriptors);
      const expectedKeys = [
        ...Array.from({ length: entry.length }, (_unused, index) => String(index)),
        "length",
      ];
      if (
        ownKeys.some((key) => typeof key !== "string") ||
        ownKeys.length !== expectedKeys.length ||
        expectedKeys.some((key) => !Object.hasOwn(descriptors, key))
      ) return fail(INPUT_CODE, `${path} must be one ordinary dense Array.`);
      for (let index = 0; index < entry.length; index += 1) {
        const descriptor = descriptors[String(index)]!;
        if (!descriptor.enumerable || !("value" in descriptor)) {
          return fail(INPUT_CODE, `${path}[${index}] must be one data field.`);
        }
        visit(descriptor.value, `${path}[${index}]`);
      }
      seen.delete(entry);
      return;
    }
    if (prototype !== Object.prototype) {
      return fail(INPUT_CODE, `${path} must use the ordinary Object prototype.`);
    }
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") {
        return fail(INPUT_CODE, `${path} must not contain symbol fields.`);
      }
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !("value" in descriptor)) {
        return fail(INPUT_CODE, `${path}.${key} must be one enumerable data field.`);
      }
      visit(descriptor.value, `${path}.${key}`);
    }
    seen.delete(entry);
  };
  visit(value, "input");
}

function requireClosedKeys(
  value: object,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  path: string,
): void {
  const keys = Object.keys(value);
  if (
    requiredKeys.some((key) => !keys.includes(key)) ||
    keys.some((key) => !requiredKeys.includes(key) && !optionalKeys.includes(key))
  ) return fail(INPUT_CODE, `${path} must use the closed current field set.`);
}

function requireStableId(value: unknown, path: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !STABLE_ID.test(value) ||
    value.normalize("NFC") !== value
  ) return fail(INPUT_CODE, `${path} must be one canonical stable ID.`);
}

function requireHash(value: unknown, path: string): asserts value is Sha256HashV1 {
  if (typeof value !== "string" || !SHA256_HASH.test(value)) {
    return fail(INPUT_CODE, `${path} must be one lowercase sha256 hash.`);
  }
}

function parseCellKey(key: string): readonly [number, number, number] {
  if (!MICRO_CELL_KEY.test(key)) {
    return fail(OCCUPANCY_CODE, `Microcell key '${key}' is not canonical.`);
  }
  const values = key.split(",").map(Number) as [number, number, number];
  if (!values.every(Number.isSafeInteger)) {
    return fail(OCCUPANCY_CODE, `Microcell key '${key}' exceeds safe integer range.`);
  }
  return values;
}

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function validateTraversalBinding(
  binding: BabylonNativeTraversalBindingV1,
  path: string,
): void {
  if (binding.kind === "not-traversable") {
    requireClosedKeys(binding, ["kind"], [], path);
    return;
  }
  if (binding.kind !== "static-surface") {
    return fail(INPUT_CODE, `${path}.kind is not supported.`);
  }
  requireClosedKeys(binding, [
    "kind",
    "surfaceEntityId",
    "logicalSubshapeId",
    "traversalSurfaceProfileRef",
  ], [], path);
  requireStableId(binding.surfaceEntityId, `${path}.surfaceEntityId`);
  requireStableId(binding.logicalSubshapeId, `${path}.logicalSubshapeId`);
  if (!STABLE_REF.test(binding.traversalSurfaceProfileRef)) {
    return fail(INPUT_CODE, `${path}.traversalSurfaceProfileRef is invalid.`);
  }
}

function validateSelection(
  selection: BabylonNativeBlockStaticColliderSelectionV1,
  index: number,
): void {
  const path = `input.selections[${index}]`;
  requireClosedKeys(selection, [
    "id",
    "colliderGeometrySource",
    "traversalBinding",
    "exposedEdgePolicy",
  ], ["frictionRatio", "restitutionRatio"], path);
  requireStableId(selection.id, `${path}.id`);
  const source = selection.colliderGeometrySource;
  if (source.kind === "block") {
    requireClosedKeys(source, ["kind", "blockId"], [], `${path}.colliderGeometrySource`);
    requireStableId(source.blockId, `${path}.colliderGeometrySource.blockId`);
  } else if (source.kind === "block-group") {
    requireClosedKeys(source, ["kind", "colliderGroupId"], [], `${path}.colliderGeometrySource`);
    requireStableId(
      source.colliderGroupId,
      `${path}.colliderGeometrySource.colliderGroupId`,
    );
  } else {
    return fail(INPUT_CODE, `${path}.colliderGeometrySource.kind is invalid.`);
  }
  validateTraversalBinding(selection.traversalBinding, `${path}.traversalBinding`);
  if (
    selection.exposedEdgePolicy !== "none" &&
    selection.exposedEdgePolicy !== "protect-ground-subject"
  ) return fail(INPUT_CODE, `${path}.exposedEdgePolicy is invalid.`);
  if (
    selection.exposedEdgePolicy === "protect-ground-subject" &&
    selection.traversalBinding.kind !== "static-surface"
  ) return fail(INPUT_CODE, `${path}.exposedEdgePolicy requires static-surface.`);
  for (const key of ["frictionRatio", "restitutionRatio"] as const) {
    if (!Object.hasOwn(selection, key)) continue;
    const ratio = selection[key];
    if (
      typeof ratio !== "number" ||
      !Number.isFinite(ratio) ||
      ratio < 0 ||
      ratio > 1 ||
      Object.is(ratio, -0)
    ) return fail(INPUT_CODE, `${path}.${key} must be within 0..1.`);
  }
}

function groupRow(
  selection: BabylonNativeBlockStaticColliderSelectionV1,
  blocks: readonly BabylonNativeBlockLayoutEntryV1[],
): BabylonNativeBlockLogicalColliderGroupV1 {
  const sortedBlocks = [...blocks].sort((left, right) =>
    stableCompare(left.id, right.id));
  return deepFreezePlainData({
    colliderId: selection.id,
    colliderGeometrySource: selection.colliderGeometrySource,
    sourceBlockIds: sortedBlocks.map(({ id }) => id),
    visualGroupIds: [...new Set(sortedBlocks.flatMap(({ visualGroupId }) =>
      isNil(visualGroupId) ? [] : [visualGroupId]))].sort(stableCompare),
    traversalBinding: selection.traversalBinding,
    exposedEdgePolicy: selection.exposedEdgePolicy,
    ...(!Object.hasOwn(selection, "frictionRatio")
      ? {}
      : { frictionRatio: selection.frictionRatio }),
    ...(!Object.hasOwn(selection, "restitutionRatio")
      ? {}
      : { restitutionRatio: selection.restitutionRatio }),
    occupiedMicroCellKeys: [...new Set(sortedBlocks.flatMap(
      ({ occupiedMicroCellKeys }) => occupiedMicroCellKeys,
    ))].sort(stableCompare),
  });
}

export function freezeBabylonNativeBlockLogicalGroundModelV1(
  rawInput: FreezeBabylonNativeBlockLogicalGroundModelInputV1,
): BabylonNativeBlockLogicalGroundModelV1 {
  assertAcyclicPlainData(rawInput);
  requireClosedKeys(rawInput, [
    "buildEpochId",
    "checkedLayout",
    "profileInventoryHash",
    "worldRuntimeBootstrapHash",
    "traversalCapabilityEnvelopeHash",
    "caseHash",
    "supportedTraversalSurfaceProfileRefs",
    "selections",
  ], [], "input");
  requireStableId(rawInput.buildEpochId, "input.buildEpochId");
  requireHash(rawInput.profileInventoryHash, "input.profileInventoryHash");
  requireHash(
    rawInput.worldRuntimeBootstrapHash,
    "input.worldRuntimeBootstrapHash",
  );
  requireHash(
    rawInput.traversalCapabilityEnvelopeHash,
    "input.traversalCapabilityEnvelopeHash",
  );
  requireHash(rawInput.caseHash, "input.caseHash");
  if (
    rawInput.checkedLayout.checkResult.id !==
      `${rawInput.buildEpochId}.whitebox-blocks-check`
  ) return fail(IDENTITY_CODE, "checked Layout belongs to another Build Epoch.");

  const checkedLayoutInventoryHash =
    hashBabylonNativeBlockCheckedLayoutInventoryV1(rawInput.checkedLayout);
  const supportedTraversalSurfaceProfileRefs = [...new Set(
    rawInput.supportedTraversalSurfaceProfileRefs,
  )].sort(stableCompare);
  if (
    supportedTraversalSurfaceProfileRefs.length !==
      rawInput.supportedTraversalSurfaceProfileRefs.length ||
    supportedTraversalSurfaceProfileRefs.some((ref) => !STABLE_REF.test(ref))
  ) return fail(INPUT_CODE,
    "supportedTraversalSurfaceProfileRefs must be unique canonical refs.");

  const blocksById = new Map<string, BabylonNativeBlockLayoutEntryV1>();
  const blocksByColliderGroupId = new Map<
    string,
    BabylonNativeBlockLayoutEntryV1[]
  >();
  const sourceBlockIdByCellKey = new Map<string, string>();
  for (const entry of rawInput.checkedLayout.layout.blocks) {
    if (blocksById.has(entry.id)) {
      return fail(SOURCE_DUPLICATE_CODE, `Block '${entry.id}' appears twice.`);
    }
    blocksById.set(entry.id, entry);
    if (!isNil(entry.colliderGroupId)) {
      const entries = blocksByColliderGroupId.get(entry.colliderGroupId) ?? [];
      entries.push(entry);
      blocksByColliderGroupId.set(entry.colliderGroupId, entries);
    }
    if (entry.occupiedMicroCellKeys.length === 0) {
      return fail(OCCUPANCY_CODE, `Block '${entry.id}' has no occupied microcells.`);
    }
    const localCells = new Set<string>();
    for (const key of entry.occupiedMicroCellKeys) {
      parseCellKey(key);
      if (localCells.has(key) || sourceBlockIdByCellKey.has(key)) {
        return fail(OCCUPANCY_CODE, `Microcell '${key}' is not uniquely occupied.`);
      }
      localCells.add(key);
      sourceBlockIdByCellKey.set(key, entry.id);
    }
  }

  const colliderIds = new Set<string>();
  const selectedSourceKeys = new Set<string>();
  const selectedBlockIds = new Set<string>();
  const resolved = [...rawInput.selections]
    .map((selection, index) => {
      validateSelection(selection, index);
      if (colliderIds.has(selection.id)) {
        return fail(SOURCE_DUPLICATE_CODE,
          `Collider '${selection.id}' appears more than once.`);
      }
      colliderIds.add(selection.id);
      const source = selection.colliderGeometrySource;
      const sourceKey = source.kind === "block"
        ? `block:${source.blockId}`
        : `block-group:${source.colliderGroupId}`;
      if (selectedSourceKeys.has(sourceKey)) {
        return fail(SOURCE_DUPLICATE_CODE,
          `Collider geometry source '${sourceKey}' appears more than once.`);
      }
      selectedSourceKeys.add(sourceKey);
      const blocks = source.kind === "block"
        ? (() => {
            const entry = blocksById.get(source.blockId);
            return isNil(entry) ? [] : [entry];
          })()
        : blocksByColliderGroupId.get(source.colliderGroupId) ?? [];
      if (blocks.length === 0) {
        return fail(SOURCE_MISSING_CODE,
          `Collider geometry source '${sourceKey}' has no checked Blocks.`);
      }
      for (const entry of blocks) {
        if (selectedBlockIds.has(entry.id)) {
          return fail(SOURCE_DUPLICATE_CODE,
            `Block '${entry.id}' belongs to more than one selected Collider source.`);
        }
        selectedBlockIds.add(entry.id);
      }
      return Object.freeze({ selection, blocks: Object.freeze(blocks) });
    })
    .sort((left, right) => stableCompare(
      left.selection.id,
      right.selection.id,
    ));

  const colliderGroups = Object.freeze(resolved.map(({ selection, blocks }) =>
    groupRow(selection, blocks)));
  const solidOccupancyCells = Object.freeze(resolved.flatMap(
    ({ selection, blocks }) => blocks.flatMap((entry) =>
      entry.occupiedMicroCellKeys.map((key) => deepFreezePlainData({
        cellKey: key,
        colliderId: selection.id,
        sourceBlockId: entry.id,
        ...(isNil(entry.colliderGroupId)
          ? {}
          : { colliderGroupId: entry.colliderGroupId }),
        ...(isNil(entry.visualGroupId)
          ? {}
          : { visualGroupId: entry.visualGroupId }),
        traversalBinding: selection.traversalBinding,
      })),
    ),
  ).sort((left, right) =>
    stableCompare(left.cellKey, right.cellKey) ||
    stableCompare(left.colliderId, right.colliderId)));
  const occupiedCellKeys = new Set(solidOccupancyCells.map(({ cellKey: key }) => key));
  const supportedRefs = new Set(supportedTraversalSurfaceProfileRefs);
  const exposedSupportTopCells = Object.freeze(solidOccupancyCells.flatMap((cell) => {
    const binding = cell.traversalBinding;
    if (
      binding.kind !== "static-surface" ||
      !supportedRefs.has(binding.traversalSurfaceProfileRef)
    ) return [];
    const [x, y, z] = parseCellKey(cell.cellKey);
    const topCellKey = cellKey(x, y + 1, z);
    if (occupiedCellKeys.has(topCellKey)) return [];
    return [deepFreezePlainData({
      topCellKey,
      sourceOccupiedCellKey: cell.cellKey,
      colliderId: cell.colliderId,
      sourceBlockId: cell.sourceBlockId,
      ...(isNil(cell.colliderGroupId)
        ? {}
        : { colliderGroupId: cell.colliderGroupId }),
      ...(isNil(cell.visualGroupId)
        ? {}
        : { visualGroupId: cell.visualGroupId }),
      traversalBinding: binding,
    })];
  }).sort((left, right) =>
    stableCompare(left.topCellKey, right.topCellKey) ||
    stableCompare(left.colliderId, right.colliderId)));

  const identity = deepFreezePlainData({
    buildEpochId: rawInput.buildEpochId,
    checkedLayoutInventoryHash,
    profileInventoryHash: rawInput.profileInventoryHash,
    worldRuntimeBootstrapHash: rawInput.worldRuntimeBootstrapHash,
    traversalCapabilityEnvelopeHash:
      rawInput.traversalCapabilityEnvelopeHash,
    caseHash: rawInput.caseHash,
  });
  const body = deepFreezePlainData({
    kind: "babylon-native-block-logical-ground-model" as const,
    schemaVersion: 1 as const,
    identity,
    supportedTraversalSurfaceProfileRefs,
    colliderGroups,
    solidOccupancyCells,
    exposedSupportTopCells,
  });
  return Object.freeze({
    ...body,
    logicalGroundModelHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}
