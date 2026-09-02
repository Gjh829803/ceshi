import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import { isNil } from "lodash-es";

import {
  failBabylonNativeBlockProfileBuildV1 as fail,
} from "./build-failure.js";
import type {
  BabylonNativeBlockVisualGroupInventoryV1,
} from "./check.js";
import type { BabylonNativeBlockLayoutV1 } from "./layout.js";
import {
  BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1,
  type BabylonNativeBlockPaletteRoleV1,
} from "./profile.js";
import type {
  BabylonNativeBlockCheckedLayoutV1,
  BabylonNativeBlockSessionRecordV1,
} from "./session.js";
import { BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1 } from "./shapes.js";
import {
  registerBabylonNativeBlockLiveHandleRegistryV1,
  unregisterBabylonNativeBlockLiveHandleRegistryV1,
  type BabylonNativeBlockLiveHandleRegistryV1,
} from "./live-handle-registry.js";

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
  readonly liveHandles: BabylonNativeBlockLiveHandleRegistryV1;
  dispose(): void;
}

export interface CreateBabylonNativeBlockVisualsInputV1 {
  readonly scene: Scene;
  readonly buildEpochId: string;
  readonly checkedLayout: BabylonNativeBlockCheckedLayoutV1;
  readonly displayGapMeters?: number;
}

const BUILD_EPOCH_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const DEFAULT_DISPLAY_GAP_METERS = 0.04;

export function validateBabylonNativeBlockDisplayGapV1(
  layout: BabylonNativeBlockLayoutV1,
  displayGapMeters: unknown,
  code = "WORLDKIT_NATIVE_BLOCK_VISUAL_INPUT_INVALID",
): asserts displayGapMeters is number {
  if (
    typeof displayGapMeters !== "number" ||
    !Number.isFinite(displayGapMeters) ||
    displayGapMeters < 0 ||
    layout.blocks.some((block) =>
      displayGapMeters >= Math.min(...block.sizeMetersXYZ))
  ) {
    return fail(
      code,
      "displayGapMeters must be finite, non-negative, and smaller than every checked block dimension",
    );
  }
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

function disposeVisualResources(
  nodes: readonly BabylonNativeBlockVisualNodeV1[],
  materials: readonly StandardMaterial[],
): Readonly<{ didFail: boolean; error: unknown }> {
  let didFail = false;
  let firstFailure: unknown;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    try {
      nodes[index]!.mesh.material = null;
    } catch (error) {
      if (!didFail) {
        didFail = true;
        firstFailure = error;
      }
    }
  }
  for (let index = materials.length - 1; index >= 0; index -= 1) {
    try {
      materials[index]!.dispose();
    } catch (error) {
      if (!didFail) {
        didFail = true;
        firstFailure = error;
      }
    }
  }
  return Object.freeze({ didFail, error: firstFailure });
}

export function deriveBabylonNativeBlockVisualGroupsV1(
  layout: BabylonNativeBlockLayoutV1,
): readonly BabylonNativeBlockVisualGroupInventoryV1[] {
  const blocksByGroup = new Map<string, typeof layout.blocks[number][]>();
  for (const block of layout.blocks) {
    if (isNil(block.visualGroupId)) continue;
    const priorBlocks = blocksByGroup.get(block.visualGroupId);
    const blocks = isNil(priorBlocks) ? [] : priorBlocks;
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
    return !isNil(candidate) &&
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
  const { checkedLayout } = input;
  if (
    checkedLayout.kind !== "babylon-native-block-checked-layout" ||
    checkedLayout.schemaVersion !== 1 ||
    checkedLayout.checkResult.outcome !== "passed" ||
    checkedLayout.layout.issues.length > 0
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_VISUAL_INPUT_REJECTED",
      "only a passed check over an issue-free in-memory layout may materialize",
    );
  }
  const expectedGroups = deriveBabylonNativeBlockVisualGroupsV1(
    checkedLayout.layout,
  );
  if (!babylonNativeBlockVisualGroupsMatchV1(
    expectedGroups,
    checkedLayout.checkResult.visualGroups,
  )) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_VISUAL_GROUP_MISMATCH",
      "checkResult.visualGroups does not describe the supplied layout",
    );
  }
  const displayGapMeters = Object.hasOwn(input, "displayGapMeters")
    ? input.displayGapMeters
    : DEFAULT_DISPLAY_GAP_METERS;
  validateBabylonNativeBlockDisplayGapV1(
    checkedLayout.layout,
    displayGapMeters,
  );
  const blocksById = new Map(checkedLayout.layout.blocks.map((block) =>
    [block.id, block] as const));
  if (
    blocksById.size !== checkedLayout.layout.blocks.length ||
    checkedLayout.records.length !== checkedLayout.layout.blocks.length
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_VISUAL_RECORD_MISMATCH",
      "records and layout must have one unique entry per block",
    );
  }
  const sortedRecords = [...checkedLayout.records].sort((left, right) =>
    stableCompare(left.input.id, right.input.id));
  const seen = new Set<string>();
  for (const record of sortedRecords) {
    const block = blocksById.get(record.input.id);
    if (
      seen.has(record.input.id) ||
      isNil(block) ||
      record.mesh.isDisposed() ||
      record.mesh.getScene() !== input.scene ||
      !isNil(record.mesh.parent) ||
      record.mesh.instances.length !== 0 ||
      record.mesh.hasThinInstances ||
      !isNil(record.mesh.physicsBody) ||
      record.mesh.isVisible !== true ||
      !Number.isFinite(record.mesh.visibility) ||
      record.mesh.visibility <= 0 ||
      record.mesh.isEnabled() !== true ||
      record.input.shape !== block.shape ||
      record.input.paletteRole !== block.paletteRole ||
      record.input.visualGroupId !== block.visualGroupId ||
      record.input.colliderGroupId !== block.colliderGroupId
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
      if (isNil(material)) {
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
        ...(isNil(record.input.visualGroupId)
          ? {}
          : { visualGroupId: record.input.visualGroupId }),
        mesh: record.mesh,
      }));
    }
  } catch (error) {
    disposeVisualResources(nodes, materials);
    throw error;
  }

  let isDisposed = false;
  const liveHandles = Object.freeze({
    kind: "babylon-native-block-live-handle-registry" as const,
    schemaVersion: 1 as const,
    blocks: Object.freeze(nodes.map((node) => Object.freeze({
      runtimeEntityId: `native-block:${node.blockId}`,
      semanticCaptureClassId:
        `worldkit.native-block.group.${node.visualGroupId ?? "ungrouped"}`,
      mesh: node.mesh,
    }))),
    visualGroups: Object.freeze(input.checkedLayout.checkResult.visualGroups.map(
      (group) => Object.freeze({
        visualGroupId: group.id,
        meshes: Object.freeze(group.blockIds.map((blockId) =>
          nodes.find((node) => node.blockId === blockId)!.mesh)),
      }),
    )),
    walkableOverlays: Object.freeze([]),
  });
  try {
    registerBabylonNativeBlockLiveHandleRegistryV1(input.scene, liveHandles);
  } catch (error) {
    disposeVisualResources(nodes, materials);
    throw error;
  }
  return Object.freeze({
    kind: "babylon-native-block-visuals",
    schemaVersion: 1,
    buildEpochId: input.buildEpochId,
    nodes: Object.freeze(nodes),
    visualGroups: input.checkedLayout.checkResult.visualGroups,
    liveHandles,
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      unregisterBabylonNativeBlockLiveHandleRegistryV1(
        input.scene,
        liveHandles,
      );
      const cleanup = disposeVisualResources(nodes, materials);
      materialsByRole.clear();
      if (cleanup.didFail) throw cleanup.error;
    },
  });
}
