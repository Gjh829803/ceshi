import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createOwnedNativeBlockBoxV1 } from "./owned-box-allocation.js";
import { CreateBoxVertexData } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { createBabylonNativeBlockVisualClustersV1 } from "./visual-clusters.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import { isNil, min, max } from "lodash-es";

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
import { BABYLON_NATIVE_BLOCK_DISPLAY_SCALE_RATIO_V1 } from "./shapes.js";
import {
  registerBabylonNativeBlockLiveHandleRegistryV1,
  unregisterBabylonNativeBlockLiveHandleRegistryV1,
  type BabylonNativeBlockLiveHandleRegistryV1,
} from "./live-handle-registry.js";
import { BABYLON_NATIVE_BLOCK_WHITEBOX_DISPLAY_V1 } from
  "./whitebox-display.js";

export interface BabylonNativeBlockVisualNodeV1 {
  readonly id: string;
  readonly sourceBlockIds: readonly string[];
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
}

const BUILD_EPOCH_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const UNIT_BOX = CreateBoxVertexData({ size: 1 });

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
  nodes: readonly Readonly<{ mesh: Mesh }>[],
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
    try {
      nodes[index]!.mesh.dispose();
    } catch (error) {
      if (!didFail) { didFail = true; firstFailure = error; }
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
          min(sortedBlocks.map((block) =>
            block.minimumMetersXYZ[axis]!))!,
        ) as [number, number, number]),
        maximumMetersXYZ: Object.freeze([0, 1, 2].map((axis) =>
          max(sortedBlocks.map((block) =>
            block.maximumMetersXYZ[axis]!))!,
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
      record.input.shape !== block.shape ||
      record.input.paletteRole !== block.paletteRole ||
      record.input.visualGroupId !== block.visualGroupId ||
      record.input.colliderGroupId !== block.colliderGroupId ||
      !sameNumbers(record.input.centerMetersXYZ, block.centerMetersXYZ) ||
      (record.input.rotationQuarterTurnsY ?? 0) !== block.rotationQuarterTurnsY
    ) {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_VISUAL_RECORD_MISMATCH",
        "records must describe the same immutable intent as the checked layout",
      );
    }
    seen.add(record.input.id);
  }
  return Object.freeze({
    sortedRecords: Object.freeze(sortedRecords),
  });
}

export function createBabylonNativeBlockVisualsV1(
  input: CreateBabylonNativeBlockVisualsInputV1,
): BabylonNativeBlockVisualsV1 {
  validateInput(input);
  const clusters = createBabylonNativeBlockVisualClustersV1(input.checkedLayout.layout.blocks);
  const blocksById = new Map(input.checkedLayout.layout.blocks.map(block => [block.id, block]));
  const handles: BabylonNativeBlockLiveHandleRegistryV1["blocks"][number][] = [];
  const acquiredMeshes = new Set<AbstractMesh>();
  const materialsByRole = new Map<
    BabylonNativeBlockPaletteRoleV1,
    StandardMaterial
  >();
  const materials: StandardMaterial[] = [];
  const nodes: BabylonNativeBlockVisualNodeV1[] = [];
  try {
    for (const [index, cluster] of clusters.entries()) {
      const role = cluster.source.paletteRole;
      let material = materialsByRole.get(role);
      if (isNil(material)) {
        material = new StandardMaterial(
          `${input.buildEpochId}.palette.${role}`,
          input.scene,
        );
        const displayColor = Color3.FromHexString(
          BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1[role],
        );
        material.diffuseColor = displayColor;
        material.ambientColor = displayColor.scale(
          BABYLON_NATIVE_BLOCK_WHITEBOX_DISPLAY_V1.ambientRatio,
        );
        material.emissiveColor = displayColor.scale(
          BABYLON_NATIVE_BLOCK_WHITEBOX_DISPLAY_V1.emissiveRatio,
        );
        material.specularColor = displayColor.scale(
          BABYLON_NATIVE_BLOCK_WHITEBOX_DISPLAY_V1.specularRatio,
        );
        material.disableLighting = false;
        material.maxSimultaneousLights = 2;
        materialsByRole.set(role, material);
        materials.push(material);
      }
      const id = `block-cluster-${String(index + 1).padStart(6, "0")}`;
      const mesh = createOwnedNativeBlockBoxV1(input.scene, id, acquiredMeshes);
      const visualGroupId = cluster.source.visualGroupId;
      nodes.push(Object.freeze({
        id, sourceBlockIds: cluster.sourceBlockIds, paletteRole: role,
        ...(isNil(visualGroupId) ? {} : { visualGroupId }), mesh,
      }));
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
      const indices = mesh.getIndices();
      if (isNil(positions) || isNil(indices) ||
          positions.length !== UNIT_BOX.positions!.length ||
          indices.length !== UNIT_BOX.indices!.length ||
          !positions.every((value, offset) => Object.is(value, UNIT_BOX.positions![offset])) ||
          !Array.from(indices).every((value, offset) => value === UNIT_BOX.indices![offset])) {
        return fail("WORLDKIT_NATIVE_BLOCK_MESH_GEOMETRY_INVALID",
          "Cluster materialization requires the exact fixed unit-cuboid geometry.");
      }
      const center = Vector3.FromArray(cluster.minimumMetersXYZ)
        .add(Vector3.FromArray(cluster.maximumMetersXYZ)).scale(0.5);
      const size = Vector3.FromArray(cluster.maximumMetersXYZ)
        .subtract(Vector3.FromArray(cluster.minimumMetersXYZ));
      mesh.position.copyFrom(center);
      mesh.scaling.copyFrom(size.scale(BABYLON_NATIVE_BLOCK_DISPLAY_SCALE_RATIO_V1));
      mesh.material = material;
      for (const blockId of cluster.sourceBlockIds) {
        const block = blocksById.get(blockId)!;
        const memberCenter = Vector3.FromArray(block.centerMetersXYZ).subtract(center)
          .scale(BABYLON_NATIVE_BLOCK_DISPLAY_SCALE_RATIO_V1).add(center);
        const identity = {
          blockId, runtimeEntityId: `native-block:${blockId}`,
          semanticCaptureClassId: `worldkit.native-block.group.${visualGroupId ?? "ungrouped"}`,
        };
        handles.push(cluster.sourceBlockIds.length === 1
          ? Object.freeze({ ...identity, kind: "independent-mesh" as const, mesh })
          : Object.freeze({
              ...identity, kind: "cluster-mesh" as const, clusterId: id, mesh,
              sourceWorldMatrix: Matrix.Compose(
                Vector3.FromArray(block.sizeMetersXYZ).scale(BABYLON_NATIVE_BLOCK_DISPLAY_SCALE_RATIO_V1),
                Quaternion.Identity(), memberCenter),
            }));
      }
    }
  } catch (error) {
    // Include a constructor that registered its Mesh and then threw, last in
    // acquisition order so it is released first. Preserve unrelated Scene nodes.
    const returned = new Set(nodes.map(node => node.mesh));
    const unreturned = [...acquiredMeshes].filter(mesh => !returned.has(mesh as Mesh));
    disposeVisualResources([...nodes, ...unreturned.map(mesh => ({ mesh: mesh as Mesh }))], materials);
    throw error;
  }

  let isDisposed = false;
  handles.sort((left, right) => stableCompare(left.blockId, right.blockId));
  const handleByBlockId = new Map(handles.map(handle => [handle.blockId, handle] as const));
  const liveHandles: BabylonNativeBlockLiveHandleRegistryV1 = Object.freeze({
    kind: "babylon-native-block-live-handle-registry" as const,
    schemaVersion: 1 as const,
    realization: Object.freeze({ kind: "authoring-clustered" as const }),
    blocks: Object.freeze([...handleByBlockId.values()]),
    visualBatches: Object.freeze([]),
    visualGroups: Object.freeze(input.checkedLayout.checkResult.visualGroups.map(
      (group) => Object.freeze({
        visualGroupId: group.id,
        blockHandles: Object.freeze(group.blockIds.map((blockId) =>
          handleByBlockId.get(blockId)!)),
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
