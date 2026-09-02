import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { isEqual, isNil } from "lodash-es";

import { BABYLON_NATIVE_BLOCK_PROFILE_REF_V1 } from
  "./native-scene-contribution.js";

export const BABYLON_NATIVE_BLOCK_MATERIALIZER_METADATA_PATH_V1 =
  "native/block-materializer-metadata.json" as const;

export type BabylonNativeBlockMaterializerShapeV1 =
  | "full"
  | "half"
  | "quarter"
  | "small"
  | "step";

export type BabylonNativeBlockMaterializerPaletteRoleV1 =
  | "ground"
  | "route"
  | "structure"
  | "hazard"
  | "water-like-visual"
  | "background-mass";

export interface BabylonNativeBlockMaterializerBlockV1 {
  readonly blockId: string;
  readonly runtimeEntityId: string;
  readonly semanticCaptureClassId: string;
  readonly shape: BabylonNativeBlockMaterializerShapeV1;
  readonly paletteRole: BabylonNativeBlockMaterializerPaletteRoleV1;
  readonly visualGroupId?: string;
  readonly colliderGroupId?: string;
  readonly centerMetersXYZ: readonly [number, number, number];
  readonly rotationQuarterTurnsY: 0 | 1 | 2 | 3;
  readonly sizeMetersXYZ: readonly [number, number, number];
}

export interface BabylonNativeBlockMaterializerVisualGroupV1 {
  readonly visualGroupId: string;
  readonly acceptanceTargetRef: string;
  readonly semanticClassId: string;
  readonly identityColorHex: `#${string}`;
  readonly blockIds: readonly string[];
  readonly paletteRoles:
    readonly BabylonNativeBlockMaterializerPaletteRoleV1[];
  readonly minimumMetersXYZ: readonly [number, number, number];
  readonly maximumMetersXYZ: readonly [number, number, number];
}

export interface BabylonNativeBlockMaterializerColliderJoinV1 {
  readonly colliderId: string;
  readonly sourceBlockIds: readonly [string, ...string[]];
  readonly visualGroupIds: readonly string[];
  readonly proxyKind: "continuous-walkable-surface" | "exact-solid-union";
  readonly minimumMetersXYZ: readonly [number, number, number];
  readonly maximumMetersXYZ: readonly [number, number, number];
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly topologyHash: Sha256HashV1;
}

export interface BabylonNativeBlockMaterializerMetadataV1 {
  readonly kind: "babylon-native-block-materializer-metadata";
  readonly schemaVersion: 1;
  readonly nativeSceneProfileRef:
    typeof BABYLON_NATIVE_BLOCK_PROFILE_REF_V1;
  readonly caseHash: Sha256HashV1;
  readonly authoringManifestHash: Sha256HashV1;
  readonly checkedLayoutInventoryHash: Sha256HashV1;
  readonly contributionHash: Sha256HashV1;
  readonly profileInventoryHash: Sha256HashV1;
  readonly settledVisualHash: Sha256HashV1;
  readonly blocks: readonly BabylonNativeBlockMaterializerBlockV1[];
  readonly visualGroups:
    readonly BabylonNativeBlockMaterializerVisualGroupV1[];
  readonly colliderJoins:
    readonly BabylonNativeBlockMaterializerColliderJoinV1[];
}

const ERROR = "BABYLON_NATIVE_BLOCK_MATERIALIZER_METADATA_INVALID";
const HASH = /^sha256:[0-9a-f]{64}$/;
const STABLE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const STABLE_REF = /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/;
const SEMANTIC_CLASS = /^[a-z][a-z0-9.-]{2,127}$/;
const IDENTITY_COLOR = /^#[0-9A-F]{6}$/;
const SHAPES = new Set<BabylonNativeBlockMaterializerShapeV1>([
  "full", "half", "quarter", "small", "step",
]);
const PALETTE_ROLES = new Set<BabylonNativeBlockMaterializerPaletteRoleV1>([
  "ground", "route", "structure", "hazard", "water-like-visual",
  "background-mass",
]);

function fail(path: string, message: string): never {
  throw new TypeError(`${ERROR}: ${path}: ${message}`);
}

function assertAccessorFree(
  value: unknown,
  path = "value",
  seen = new Set<object>(),
): void {
  if (isNil(value) || typeof value !== "object") return;
  if (seen.has(value)) fail(path, "must be acyclic plain data");
  seen.add(value);
  const prototype = Reflect.getPrototypeOf(value);
  if (
    prototype !== Object.prototype &&
    prototype !== Array.prototype
  ) fail(path, "must use ordinary object and array prototypes");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") fail(path, "symbol fields are forbidden");
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor)) fail(`${path}/${key}`, "accessors are forbidden");
    if (key !== "length" && descriptor.enumerable !== true) {
      fail(`${path}/${key}`, "data fields must be enumerable");
    }
    if (key !== "length") {
      assertAccessorFree(descriptor.value, `${path}/${key}`, seen);
    }
  }
  if (
    Array.isArray(value) &&
    Object.getOwnPropertyNames(value).length !== value.length + 1
  ) fail(path, "arrays must be dense and ordinary");
}

function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): Record<string, unknown> {
  if (
    isNil(value) ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  ) fail(path, "must be an ordinary object");
  const keys = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !required.includes(key) && !optional.includes(key)) ||
    keys.length < required.length ||
    keys.length > required.length + optional.length
  ) fail(path, "must use the exact closed field set");
  return value as Record<string, unknown>;
}

function exactArray(value: unknown, path: string): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertyNames(value).length !== value.length + 1
  ) fail(path, "must be one dense ordinary array");
  return value;
}

function stableId(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    !STABLE_ID.test(value) ||
    value.normalize("NFC") !== value
  ) fail(path, "must be a stable lowercase id");
  return value;
}

function stableText(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value
  ) fail(path, "must be canonical non-empty text");
  return value;
}

function tuple3(
  value: unknown,
  path: string,
  positive = false,
): readonly [number, number, number] {
  const entries = exactArray(value, path);
  if (
    entries.length !== 3 ||
    entries.some((entry) =>
      typeof entry !== "number" ||
      !Number.isFinite(entry) ||
      Object.is(entry, -0) ||
      (positive && entry <= 0))
  ) fail(path, positive ? "must contain three positive finite numbers" : "must contain three canonical finite numbers");
  return Object.freeze([
    entries[0] as number,
    entries[1] as number,
    entries[2] as number,
  ]);
}

function sortedUnique(values: readonly string[], path: string): void {
  if (values.some((value, index) => index > 0 && values[index - 1]! >= value)) {
    fail(path, "must be strictly sorted and unique");
  }
}

function parseBlock(
  value: unknown,
  index: number,
): BabylonNativeBlockMaterializerBlockV1 {
  const path = `blocks/${index}`;
  const row = exactRecord(value, [
    "blockId", "runtimeEntityId", "semanticCaptureClassId", "shape",
    "paletteRole", "centerMetersXYZ", "rotationQuarterTurnsY",
    "sizeMetersXYZ",
  ], ["visualGroupId", "colliderGroupId"], path);
  const blockId = stableId(row.blockId, `${path}/blockId`);
  const visualGroupId = Object.hasOwn(row, "visualGroupId")
    ? stableId(row.visualGroupId, `${path}/visualGroupId`)
    : undefined;
  const colliderGroupId = Object.hasOwn(row, "colliderGroupId")
    ? stableId(row.colliderGroupId, `${path}/colliderGroupId`)
    : undefined;
  const expectedEntityId = `native-block:${blockId}`;
  const expectedSemanticClassId =
    `worldkit.native-block.group.${visualGroupId ?? "ungrouped"}`;
  if (row.runtimeEntityId !== expectedEntityId) {
    fail(`${path}/runtimeEntityId`, "must be derived from blockId");
  }
  if (row.semanticCaptureClassId !== expectedSemanticClassId) {
    fail(`${path}/semanticCaptureClassId`, "must be derived from visualGroupId");
  }
  if (!SHAPES.has(row.shape as BabylonNativeBlockMaterializerShapeV1)) {
    fail(`${path}/shape`, "is not a supported Block shape");
  }
  if (!PALETTE_ROLES.has(
    row.paletteRole as BabylonNativeBlockMaterializerPaletteRoleV1,
  )) fail(`${path}/paletteRole`, "is not a supported palette role");
  if (
    typeof row.rotationQuarterTurnsY !== "number" ||
    ![0, 1, 2, 3].includes(row.rotationQuarterTurnsY)
  ) fail(`${path}/rotationQuarterTurnsY`, "must be 0, 1, 2 or 3");
  return Object.freeze({
    blockId,
    runtimeEntityId: expectedEntityId,
    semanticCaptureClassId: expectedSemanticClassId,
    shape: row.shape as BabylonNativeBlockMaterializerShapeV1,
    paletteRole: row.paletteRole as BabylonNativeBlockMaterializerPaletteRoleV1,
    ...(isNil(visualGroupId) ? {} : { visualGroupId }),
    ...(isNil(colliderGroupId) ? {} : { colliderGroupId }),
    centerMetersXYZ: tuple3(row.centerMetersXYZ, `${path}/centerMetersXYZ`),
    rotationQuarterTurnsY: row.rotationQuarterTurnsY as 0 | 1 | 2 | 3,
    sizeMetersXYZ: tuple3(row.sizeMetersXYZ, `${path}/sizeMetersXYZ`, true),
  });
}

function parseVisualGroup(
  value: unknown,
  index: number,
): BabylonNativeBlockMaterializerVisualGroupV1 {
  const path = `visualGroups/${index}`;
  const row = exactRecord(value, [
    "visualGroupId", "acceptanceTargetRef", "semanticClassId",
    "identityColorHex", "blockIds", "paletteRoles", "minimumMetersXYZ",
    "maximumMetersXYZ",
  ], [], path);
  const blockIds = exactArray(row.blockIds, `${path}/blockIds`).map(
    (entry, blockIndex) => stableId(entry, `${path}/blockIds/${blockIndex}`),
  );
  const paletteRoles = exactArray(
    row.paletteRoles,
    `${path}/paletteRoles`,
  ).map((entry, roleIndex) => {
    if (!PALETTE_ROLES.has(entry as BabylonNativeBlockMaterializerPaletteRoleV1)) {
      fail(`${path}/paletteRoles/${roleIndex}`, "is not a supported palette role");
    }
    return entry as BabylonNativeBlockMaterializerPaletteRoleV1;
  });
  if (blockIds.length === 0 || paletteRoles.length === 0) {
    fail(path, "must describe at least one Block and palette role");
  }
  sortedUnique(blockIds, `${path}/blockIds`);
  sortedUnique(paletteRoles, `${path}/paletteRoles`);
  const acceptanceTargetRef = stableText(
    row.acceptanceTargetRef,
    `${path}/acceptanceTargetRef`,
  );
  if (!STABLE_REF.test(acceptanceTargetRef)) {
    fail(`${path}/acceptanceTargetRef`, "must be a stable ref");
  }
  const semanticClassId = stableText(
    row.semanticClassId,
    `${path}/semanticClassId`,
  );
  if (!SEMANTIC_CLASS.test(semanticClassId)) {
    fail(`${path}/semanticClassId`, "must be a semantic class id");
  }
  const identityColorHex = stableText(
    row.identityColorHex,
    `${path}/identityColorHex`,
  );
  if (!IDENTITY_COLOR.test(identityColorHex)) {
    fail(`${path}/identityColorHex`, "must be one uppercase identity color");
  }
  return Object.freeze({
    visualGroupId: stableId(row.visualGroupId, `${path}/visualGroupId`),
    acceptanceTargetRef,
    semanticClassId,
    identityColorHex: identityColorHex as `#${string}`,
    blockIds: Object.freeze(blockIds),
    paletteRoles: Object.freeze(paletteRoles),
    minimumMetersXYZ: tuple3(
      row.minimumMetersXYZ,
      `${path}/minimumMetersXYZ`,
    ),
    maximumMetersXYZ: tuple3(
      row.maximumMetersXYZ,
      `${path}/maximumMetersXYZ`,
    ),
  });
}

function parseColliderJoin(
  value: unknown,
  index: number,
): BabylonNativeBlockMaterializerColliderJoinV1 {
  const path = `colliderJoins/${index}`;
  const row = exactRecord(value, [
    "colliderId", "sourceBlockIds", "visualGroupIds", "proxyKind",
    "minimumMetersXYZ", "maximumMetersXYZ", "vertexCount", "triangleCount",
    "topologyHash",
  ], [], path);
  const sourceBlockIds = exactArray(
    row.sourceBlockIds,
    `${path}/sourceBlockIds`,
  ).map((entry, sourceIndex) => stableId(
    entry,
    `${path}/sourceBlockIds/${sourceIndex}`,
  ));
  const visualGroupIds = exactArray(
    row.visualGroupIds,
    `${path}/visualGroupIds`,
  ).map((entry, groupIndex) => stableId(
    entry,
    `${path}/visualGroupIds/${groupIndex}`,
  ));
  sortedUnique(sourceBlockIds, `${path}/sourceBlockIds`);
  sortedUnique(visualGroupIds, `${path}/visualGroupIds`);
  if (sourceBlockIds.length === 0) {
    fail(`${path}/sourceBlockIds`, "must not be empty");
  }
  if (
    row.proxyKind !== "continuous-walkable-surface" &&
    row.proxyKind !== "exact-solid-union"
  ) fail(`${path}/proxyKind`, "is outside the closed union");
  const vertexCount = row.vertexCount as number;
  const triangleCount = row.triangleCount as number;
  if (
    !Number.isSafeInteger(vertexCount) || vertexCount <= 0 ||
    !Number.isSafeInteger(triangleCount) || triangleCount <= 0 ||
    typeof row.topologyHash !== "string" || !HASH.test(row.topologyHash)
  ) fail(path, "geometry counts and topologyHash are invalid");
  return Object.freeze({
    colliderId: stableId(row.colliderId, `${path}/colliderId`),
    sourceBlockIds: Object.freeze(sourceBlockIds) as
      readonly [string, ...string[]],
    visualGroupIds: Object.freeze(visualGroupIds),
    proxyKind: row.proxyKind,
    minimumMetersXYZ: tuple3(
      row.minimumMetersXYZ,
      `${path}/minimumMetersXYZ`,
    ),
    maximumMetersXYZ: tuple3(
      row.maximumMetersXYZ,
      `${path}/maximumMetersXYZ`,
    ),
    vertexCount,
    triangleCount,
    topologyHash: row.topologyHash as Sha256HashV1,
  });
}

export function parseBabylonNativeBlockMaterializerMetadataV1(
  input: unknown,
): BabylonNativeBlockMaterializerMetadataV1 {
  assertAccessorFree(input);
  const source = exactRecord(input, [
    "kind", "schemaVersion", "nativeSceneProfileRef", "caseHash",
    "authoringManifestHash", "checkedLayoutInventoryHash",
    "contributionHash", "profileInventoryHash", "settledVisualHash",
    "blocks", "visualGroups", "colliderJoins",
  ], [], "value");
  if (
    source.kind !== "babylon-native-block-materializer-metadata" ||
    source.schemaVersion !== 1 ||
    source.nativeSceneProfileRef !== BABYLON_NATIVE_BLOCK_PROFILE_REF_V1
  ) fail("value", "kind, schemaVersion or nativeSceneProfileRef is invalid");
  if (
    typeof source.caseHash !== "string" || !HASH.test(source.caseHash) ||
    typeof source.authoringManifestHash !== "string" ||
    !HASH.test(source.authoringManifestHash) ||
    typeof source.checkedLayoutInventoryHash !== "string" ||
    !HASH.test(source.checkedLayoutInventoryHash) ||
    typeof source.contributionHash !== "string" ||
    !HASH.test(source.contributionHash) ||
    typeof source.profileInventoryHash !== "string" ||
    !HASH.test(source.profileInventoryHash) ||
    typeof source.settledVisualHash !== "string" ||
    !HASH.test(source.settledVisualHash)
  ) fail("value", "profile fingerprints must be SHA-256 hashes");
  const blocks = exactArray(source.blocks, "blocks").map(parseBlock);
  const visualGroups = exactArray(
    source.visualGroups,
    "visualGroups",
  ).map(parseVisualGroup);
  const colliderJoins = exactArray(
    source.colliderJoins,
    "colliderJoins",
  ).map(parseColliderJoin);
  if (blocks.length === 0) fail("blocks", "must not be empty");
  sortedUnique(blocks.map(({ blockId }) => blockId), "blocks/blockId");
  sortedUnique(
    visualGroups.map(({ visualGroupId }) => visualGroupId),
    "visualGroups/visualGroupId",
  );
  const colorIds = visualGroups.map(({ identityColorHex }) => identityColorHex);
  if (new Set(colorIds).size !== colorIds.length) {
    fail("visualGroups/identityColorHex", "must be unique");
  }
  const targetRefs = visualGroups.map(({ acceptanceTargetRef }) =>
    acceptanceTargetRef);
  if (new Set(targetRefs).size !== targetRefs.length) {
    fail("visualGroups/acceptanceTargetRef", "must be unique");
  }
  const blocksById = new Map(blocks.map((block) => [block.blockId, block]));
  const groupsById = new Map(
    visualGroups.map((group) => [group.visualGroupId, group]),
  );
  for (const group of visualGroups) {
    const groupedBlocks = group.blockIds.map((blockId) => {
      const block = blocksById.get(blockId);
      if (isNil(block) || block.visualGroupId !== group.visualGroupId) {
        fail("visualGroups/blockIds", "must join only Blocks in that group");
      }
      return block;
    });
    const roles = [...new Set(groupedBlocks.map(({ paletteRole }) =>
      paletteRole))].sort();
    const minimum = [0, 1, 2].map((axis) => Math.min(
      ...groupedBlocks.map((block) =>
        block.centerMetersXYZ[axis]! - block.sizeMetersXYZ[axis]! / 2),
    ));
    const maximum = [0, 1, 2].map((axis) => Math.max(
      ...groupedBlocks.map((block) =>
        block.centerMetersXYZ[axis]! + block.sizeMetersXYZ[axis]! / 2),
    ));
    if (
      !isEqual(roles, group.paletteRoles) ||
      !isEqual(minimum, group.minimumMetersXYZ) ||
      !isEqual(maximum, group.maximumMetersXYZ)
    ) fail("visualGroups", "palette roles or bounds drift from Block inventory");
  }
  for (const block of blocks) {
    if (
      !isNil(block.visualGroupId) &&
      !groupsById.get(block.visualGroupId)?.blockIds.includes(block.blockId)
    ) fail("blocks/visualGroupId", "must join one complete visual group");
  }
  sortedUnique(
    colliderJoins.map(({ colliderId }) => colliderId),
    "colliderJoins/colliderId",
  );
  const joinedBlockIds = colliderJoins.flatMap(({ sourceBlockIds }) =>
    sourceBlockIds);
  if (
    new Set(joinedBlockIds).size !== joinedBlockIds.length ||
    joinedBlockIds.some((blockId) => !blocksById.has(blockId)) ||
    colliderJoins.some(({ visualGroupIds }) =>
      visualGroupIds.some((groupId) => !groupsById.has(groupId)))
  ) fail("colliderJoins", "must partition known source Blocks and visual groups");
  return Object.freeze({
    kind: "babylon-native-block-materializer-metadata",
    schemaVersion: 1,
    nativeSceneProfileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
    caseHash: source.caseHash as Sha256HashV1,
    authoringManifestHash: source.authoringManifestHash as Sha256HashV1,
    checkedLayoutInventoryHash:
      source.checkedLayoutInventoryHash as Sha256HashV1,
    contributionHash: source.contributionHash as Sha256HashV1,
    profileInventoryHash: source.profileInventoryHash as Sha256HashV1,
    settledVisualHash: source.settledVisualHash as Sha256HashV1,
    blocks: Object.freeze(blocks),
    visualGroups: Object.freeze(visualGroups),
    colliderJoins: Object.freeze(colliderJoins),
  });
}

export function hashBabylonNativeBlockMaterializerMetadataV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseBabylonNativeBlockMaterializerMetadataV1(input),
  ) as Sha256HashV1;
}
