import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";

import type {
  BabylonNativeBlockProfileCheckResultV1,
  BabylonNativeBlockVisualGroupInventoryV1,
} from "./check.js";
import type { BabylonNativeBlockLayoutV1 } from "./layout.js";
import {
  BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1,
  type BabylonNativeBlockPaletteRoleV1,
} from "./profile.js";
import type { BabylonNativeBlockSessionRecordV1 } from "./session.js";
import { BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1 } from "./shapes.js";

export interface BabylonNativeBlockVisualNodeV1 {
  readonly blockId: string;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly visualGroupId?: string;
  readonly mesh: Mesh;
}

export interface BabylonNativeBlockVisualsV1 {
  readonly kind: "babylon-native-block-visuals";
  readonly schemaVersion: 1;
  readonly buildEpochId: string;
  readonly nodes: readonly BabylonNativeBlockVisualNodeV1[];
  readonly visualGroups: readonly BabylonNativeBlockVisualGroupInventoryV1[];
  dispose(): void;
}

export interface CreateBabylonNativeBlockVisualsInputV1 {
  readonly scene: Scene;
  readonly buildEpochId: string;
  readonly layout: BabylonNativeBlockLayoutV1;
  readonly checkResult: BabylonNativeBlockProfileCheckResultV1;
  readonly records: readonly BabylonNativeBlockSessionRecordV1[];
  readonly displayGapMeters?: number;
}

const BUILD_EPOCH_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const DEFAULT_DISPLAY_GAP_METERS = 0.04;

function fail(code: string, message: string): never {
  throw new TypeError(`${code}: ${message}`);
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameNumbers(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

export function deriveBabylonNativeBlockVisualGroupsV1(
  layout: BabylonNativeBlockLayoutV1,
): readonly BabylonNativeBlockVisualGroupInventoryV1[] {
  const blocksByGroup = new Map<string, typeof layout.blocks[number][]>();
  for (const block of layout.blocks) {
    if (block.visualGroupId === undefined) continue;
    const blocks = blocksByGroup.get(block.visualGroupId) ?? [];
    blocks.push(block);
    blocksByGroup.set(block.visualGroupId, blocks);
  }
  return Object.freeze([...blocksByGroup.entries()]
    .sort(([left], [right]) => stableCompare(left, right))
    .map(([id, blocks]) => {
      const sortedBlocks = [...blocks].sort((left, right) =>
        stableCompare(left.id, right.id));
      return Object.freeze({
        id,
        blockIds: Object.freeze(sortedBlocks.map(({ id: blockId }) => blockId)),
        paletteRoles: Object.freeze([...new Set(sortedBlocks.map(
          ({ paletteRole }) => paletteRole,
        ))].sort(stableCompare)),
        minimumMetersXYZ: Object.freeze([0, 1, 2].map((axis) =>
          Math.min(...sortedBlocks.map((block) =>
            block.minimumMetersXYZ[axis]!)),
        ) as [number, number, number]),
        maximumMetersXYZ: Object.freeze([0, 1, 2].map((axis) =>
          Math.max(...sortedBlocks.map((block) =>
            block.maximumMetersXYZ[axis]!)),
        ) as [number, number, number]),
      });
    }));
}

export function babylonNativeBlockVisualGroupsMatchV1(
  left: readonly BabylonNativeBlockVisualGroupInventoryV1[],
  right: readonly BabylonNativeBlockVisualGroupInventoryV1[],
): boolean {
  return left.length === right.length && left.every((group, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      group.id === candidate.id &&
      sameStrings(group.blockIds, candidate.blockIds) &&
      sameStrings(group.paletteRoles, candidate.paletteRoles) &&
      sameNumbers(group.minimumMetersXYZ, candidate.minimumMetersXYZ) &&
      sameNumbers(group.maximumMetersXYZ, candidate.maximumMetersXYZ);
  });
}

function validateInput(
  input: CreateBabylonNativeBlockVisualsInputV1,
): Readonly<{
  displayGapMeters: number;
  sortedRecords: readonly BabylonNativeBlockSessionRecordV1[];
}> {
  if (!(input.scene instanceof Scene) || input.scene.isDisposed) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_VISUAL_SCENE_INVALID",
      "visuals require one live Host Candidate Scene",
    );
  }
  if (!BUILD_EPOCH_ID.test(input.buildEpochId)) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_VISUAL_INPUT_INVALID",
      "buildEpochId must be one stable lowercase id",
    );
  }
  if (input.checkResult.outcome !== "passed" || input.layout.issues.length > 0) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_VISUAL_INPUT_REJECTED",
      "only a passed check over an issue-free in-memory layout may materialize",
    );
  }
  const expectedGroups = deriveBabylonNativeBlockVisualGroupsV1(input.layout);
  if (!babylonNativeBlockVisualGroupsMatchV1(
    expectedGroups,
    input.checkResult.visualGroups,
  )) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_VISUAL_GROUP_MISMATCH",
      "checkResult.visualGroups does not describe the supplied layout",
    );
  }
  const displayGapMeters = input.displayGapMeters ??
    DEFAULT_DISPLAY_GAP_METERS;
  if (
    !Number.isFinite(displayGapMeters) ||
    displayGapMeters < 0 ||
    displayGapMeters >= 0.5
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_VISUAL_INPUT_INVALID",
      "displayGapMeters must be finite and within 0..<0.5m",
    );
  }
  const blocksById = new Map(input.layout.blocks.map((block) =>
    [block.id, block] as const));
  if (
    blocksById.size !== input.layout.blocks.length ||
    input.records.length !== input.layout.blocks.length
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_VISUAL_RECORD_MISMATCH",
      "records and layout must have one unique entry per block",
    );
  }
  const sortedRecords = [...input.records].sort((left, right) =>
    stableCompare(left.input.id, right.input.id));
  const seen = new Set<string>();
  for (const record of sortedRecords) {
    const block = blocksById.get(record.input.id);
    if (
      seen.has(record.input.id) ||
      block === undefined ||
      record.mesh.isDisposed() ||
      record.mesh.getScene() !== input.scene ||
      record.input.shape !== block.shape ||
      record.input.paletteRole !== block.paletteRole ||
      record.input.visualGroupId !== block.visualGroupId
    ) {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_VISUAL_RECORD_MISMATCH",
        "records must be the live Babylon nodes checked into the supplied layout",
      );
    }
    seen.add(record.input.id);
  }
  return Object.freeze({
    displayGapMeters,
    sortedRecords: Object.freeze(sortedRecords),
  });
}

export function createBabylonNativeBlockVisualsV1(
  input: CreateBabylonNativeBlockVisualsInputV1,
): BabylonNativeBlockVisualsV1 {
  const validated = validateInput(input);
  const materialsByRole = new Map<
    BabylonNativeBlockPaletteRoleV1,
    StandardMaterial
  >();
  const materials: StandardMaterial[] = [];
  const nodes: BabylonNativeBlockVisualNodeV1[] = [];
  try {
    for (const record of validated.sortedRecords) {
      const role = record.input.paletteRole;
      let material = materialsByRole.get(role);
      if (material === undefined) {
        material = new StandardMaterial(
          `${input.buildEpochId}.palette.${role}`,
          input.scene,
        );
        material.diffuseColor = Color3.FromHexString(
          BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1[role],
        );
        material.specularColor = new Color3(0.08, 0.08, 0.08);
        materialsByRole.set(role, material);
        materials.push(material);
      }
      const localSize = BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1[
        record.input.shape
      ];
      record.mesh.scaling.set(
        (localSize[0] - validated.displayGapMeters) / localSize[0],
        (localSize[1] - validated.displayGapMeters) / localSize[1],
        (localSize[2] - validated.displayGapMeters) / localSize[2],
      );
      record.mesh.material = material;
      nodes.push(Object.freeze({
        blockId: record.input.id,
        paletteRole: role,
        ...(record.input.visualGroupId === undefined
          ? {}
          : { visualGroupId: record.input.visualGroupId }),
        mesh: record.mesh,
      }));
    }
  } catch (error) {
    for (const record of validated.sortedRecords) record.mesh.dispose();
    for (const material of materials) material.dispose();
    throw error;
  }

  let isDisposed = false;
  return Object.freeze({
    kind: "babylon-native-block-visuals",
    schemaVersion: 1,
    buildEpochId: input.buildEpochId,
    nodes: Object.freeze(nodes),
    visualGroups: input.checkResult.visualGroups,
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      for (const { mesh } of nodes) mesh.dispose();
      for (const material of materials) material.dispose();
      materialsByRole.clear();
    },
  });
}
