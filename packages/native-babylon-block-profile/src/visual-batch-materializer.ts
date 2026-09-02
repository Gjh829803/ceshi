import { Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import {
  failBabylonNativeBlockProfileBuildV1 as fail,
} from "./build-failure.js";
import {
  hashBabylonNativeBlockChunkPolicyV1,
  parseBabylonNativeBlockChunkPolicyV1,
  type BabylonNativeBlockChunkPolicyV1,
} from "./chunk-policy.js";
import {
  babylonNativeBlockLiveVisualHandleMeshV1,
  replaceBabylonNativeBlockLiveHandleRegistryV1,
  type BabylonNativeBlockLiveHandleRegistryV1,
  type BabylonNativeBlockLiveVisualBatchV1,
  type BabylonNativeBlockLiveVisualHandleV1,
} from "./live-handle-registry.js";
import {
  createBabylonNativeBlockResidencyGroupsV1,
  createBabylonNativeBlockThinInstanceGroupsV1,
} from "./optimization.js";
import type { BabylonNativeBlockPaletteRoleV1 } from "./profile.js";
import type { BabylonNativeBlockShapeKindV1 } from "./shapes.js";

const CODE = "WORLDKIT_NATIVE_BLOCK_VISUAL_BATCH_MATERIALIZATION_INVALID";

/**
 * Trusted Host placement row. It is structurally the frozen Package
 * `BabylonNativeBlockMaterializerBlockV1`, so the Runtime passes verified
 * Package metadata instead of rescanning the Scene.
 */
export interface BabylonNativeBlockVisualBatchPlacementV1 {
  readonly blockId: string;
  readonly runtimeEntityId: string;
  readonly semanticCaptureClassId: string;
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly visualGroupId?: string;
  readonly centerMetersXYZ: readonly [number, number, number];
  readonly rotationQuarterTurnsY: 0 | 1 | 2 | 3;
  readonly sizeMetersXYZ: readonly [number, number, number];
}

export interface BabylonNativeBlockVisualBatchResourcesV1 {
  readonly authoringVisualMeshCount: number;
  readonly thinInstanceBatchCount: number;
  readonly thinInstanceCount: number;
  readonly independentVisualMeshCount: number;
  readonly renderedDrawUnitCount: number;
  readonly renderedGeometryBufferSetCount: number;
  readonly hiddenAuthoringMeshCount: number;
}

export interface MaterializedBabylonNativeBlockVisualBatchesV1 {
  readonly chunkPolicy: BabylonNativeBlockChunkPolicyV1;
  readonly chunkPolicyHash: Sha256HashV1;
  readonly batchPlanHash: Sha256HashV1;
  readonly batches: readonly BabylonNativeBlockLiveVisualBatchV1[];
  readonly independentBlockIds: readonly string[];
  readonly resources: BabylonNativeBlockVisualBatchResourcesV1;
  readonly liveHandles: BabylonNativeBlockLiveHandleRegistryV1;
  dispose(): void;
}

export interface MaterializeBabylonNativeBlockVisualBatchesInputV1 {
  readonly scene: Scene;
  readonly realizationId: string;
  readonly chunkPolicy: BabylonNativeBlockChunkPolicyV1;
  readonly placements: readonly BabylonNativeBlockVisualBatchPlacementV1[];
  readonly liveHandles: BabylonNativeBlockLiveHandleRegistryV1;
}

const STABLE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface RestorableVisualStateV1 {
  readonly mesh: Mesh;
  readonly isVisible: boolean;
  readonly alwaysSelectAsActiveMesh: boolean;
}

function extentOf(
  placement: BabylonNativeBlockVisualBatchPlacementV1,
): Readonly<{
  id: string;
  minimumMetersXYZ: readonly number[];
  maximumMetersXYZ: readonly number[];
}> {
  return Object.freeze({
    id: placement.blockId,
    minimumMetersXYZ: Object.freeze([0, 1, 2].map((axis) =>
      placement.centerMetersXYZ[axis]! - placement.sizeMetersXYZ[axis]! / 2)),
    maximumMetersXYZ: Object.freeze([0, 1, 2].map((axis) =>
      placement.centerMetersXYZ[axis]! + placement.sizeMetersXYZ[axis]! / 2)),
  });
}

/**
 * Materialize Chunk-local Thin Instance batches over the already-admitted
 * Native Block visuals. Batching is a Host realization detail: it never changes
 * the authored Block inventory, the frozen settlement fingerprints or the
 * published Package. Batched Blocks stay always resident and far-visible; only
 * physics residency is bounded, and it never touches these Meshes.
 */
export function materializeBabylonNativeBlockVisualBatchesV1(
  input: MaterializeBabylonNativeBlockVisualBatchesInputV1,
): MaterializedBabylonNativeBlockVisualBatchesV1 {
  const chunkPolicy = parseBabylonNativeBlockChunkPolicyV1(input.chunkPolicy);
  const chunkPolicyHash = hashBabylonNativeBlockChunkPolicyV1(chunkPolicy);
  if (
    !STABLE_ID.test(input.realizationId) ||
    input.scene.isDisposed ||
    input.liveHandles.kind !== "babylon-native-block-live-handle-registry" ||
    input.liveHandles.schemaVersion !== 1 ||
    input.liveHandles.realization.kind !== "authoring-unbatched"
  ) {
    return fail(
      CODE,
      "Visual batching requires one live Scene and one unbatched authoring registry.",
    );
  }
  const placements = [...input.placements]
    .sort((left, right) => stableCompare(left.blockId, right.blockId));
  const handleByBlockId = new Map(input.liveHandles.blocks.map((handle) =>
    [handle.blockId, handle] as const));
  if (
    handleByBlockId.size !== input.liveHandles.blocks.length ||
    placements.length !== handleByBlockId.size ||
    new Set(placements.map(({ blockId }) => blockId)).size !== placements.length
  ) {
    return fail(
      CODE,
      "Host placements and live Block handles must join one-to-one.",
    );
  }
  const meshByBlockId = new Map<string, Mesh>();
  for (const placement of placements) {
    const handle = handleByBlockId.get(placement.blockId);
    if (
      isNil(handle) ||
      handle.kind !== "independent-mesh" ||
      handle.runtimeEntityId !== placement.runtimeEntityId ||
      handle.semanticCaptureClassId !== placement.semanticCaptureClassId ||
      handle.mesh.isDisposed() ||
      handle.mesh.getScene() !== input.scene ||
      handle.mesh.hasThinInstances
    ) {
      return fail(
        CODE,
        `Block '${placement.blockId}' has no matching live authoring Mesh.`,
      );
    }
    meshByBlockId.set(placement.blockId, handle.mesh);
  }

  const residency = createBabylonNativeBlockResidencyGroupsV1(
    placements.map(extentOf),
    chunkPolicy,
  );
  const partition = createBabylonNativeBlockThinInstanceGroupsV1(
    placements.map((placement) => Object.freeze({
      id: placement.blockId,
      shape: placement.shape,
      paletteRole: placement.paletteRole,
      ...(isNil(placement.visualGroupId)
        ? {}
        : { visualGroupId: placement.visualGroupId }),
    })),
    residency.residencyGroupIdByBlockId,
  );

  const restorable: RestorableVisualStateV1[] = [];
  const batchMeshes: Mesh[] = [];
  const batches: BabylonNativeBlockLiveVisualBatchV1[] = [];
  const handles: BabylonNativeBlockLiveVisualHandleV1[] = [];
  let materialized: BabylonNativeBlockLiveHandleRegistryV1 | undefined;
  const retain = (mesh: Mesh): void => {
    restorable.push(Object.freeze({
      mesh,
      isVisible: mesh.isVisible,
      alwaysSelectAsActiveMesh: mesh.alwaysSelectAsActiveMesh,
    }));
  };
  try {
    for (const group of partition.groups) {
      const sourceMesh = meshByBlockId.get(group.blockIds[0]!)!;
      const geometry = sourceMesh.geometry;
      if (isNil(geometry)) {
        return fail(
          CODE,
          `Batch '${group.id}' has no shared source geometry.`,
        );
      }
      const batchMesh = new Mesh(
        `worldkit-block-visual-batch-${input.realizationId}-${group.id}`,
        input.scene,
      );
      batchMeshes.push(batchMesh);
      // Sharing the checked Block geometry keeps one buffer set per batch
      // instead of allocating a second copy of the same fixed shape.
      geometry.applyToMesh(batchMesh);
      const matrices = new Float32Array(group.blockIds.length * 16);
      group.blockIds.forEach((blockId, instanceIndex) => {
        const memberMesh = meshByBlockId.get(blockId)!;
        memberMesh.computeWorldMatrix(true).copyToArray(
          matrices,
          instanceIndex * 16,
        );
      });
      batchMesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
      if (batchMesh.thinInstanceCount !== group.blockIds.length) {
        return fail(
          CODE,
          `Batch '${group.id}' did not accept one Thin Instance per Block.`,
        );
      }
      batchMesh.material = sourceMesh.material;
      batchMesh.isPickable = false;
      batchMesh.receiveShadows = sourceMesh.receiveShadows;
      batchMesh.isVisible = true;
      // Finite-world Native Block batches are always resident: opening and
      // exploration views must keep every far silhouette.
      batchMesh.alwaysSelectAsActiveMesh = true;
      batchMesh.thinInstanceRefreshBoundingInfo(true);
      batches.push(Object.freeze({
        batchId: group.id,
        residencyGroupId: group.residencyGroupId,
        shape: group.shape,
        paletteRole: group.paletteRole,
        semanticCaptureClassId: group.semanticCaptureClassId,
        blockIds: Object.freeze([...group.blockIds]),
        mesh: batchMesh,
      }));
      group.blockIds.forEach((blockId, instanceIndex) => {
        const memberHandle = handleByBlockId.get(blockId)!;
        const memberMesh = meshByBlockId.get(blockId)!;
        retain(memberMesh);
        memberMesh.isVisible = false;
        handles.push(Object.freeze({
          kind: "thin-instance" as const,
          blockId,
          runtimeEntityId: memberHandle.runtimeEntityId,
          semanticCaptureClassId: memberHandle.semanticCaptureClassId,
          batchId: group.id,
          batchMesh,
          instanceIndex,
        }));
      });
    }
    for (const blockId of partition.independentBlockIds) {
      const memberMesh = meshByBlockId.get(blockId)!;
      retain(memberMesh);
      memberMesh.alwaysSelectAsActiveMesh = true;
      handles.push(handleByBlockId.get(blockId)!);
    }
    handles.sort((left, right) => stableCompare(left.blockId, right.blockId));
    const handleByBatchedBlockId = new Map(handles.map((handle) =>
      [handle.blockId, handle] as const));
    const batchPlan = {
      kind: "babylon-native-block-visual-batch-plan" as const,
      schemaVersion: 1 as const,
      chunkPolicyHash,
      batches: batches.map((batch) => ({
        batchId: batch.batchId,
        residencyGroupId: batch.residencyGroupId,
        shape: batch.shape,
        paletteRole: batch.paletteRole,
        semanticCaptureClassId: batch.semanticCaptureClassId,
        blockIds: [...batch.blockIds],
      })),
      independentBlockIds: [...partition.independentBlockIds],
    };
    const batchPlanHash = sha256CanonicalJson(batchPlan) as Sha256HashV1;
    materialized = Object.freeze({
      ...input.liveHandles,
      realization: Object.freeze({
        kind: "host-chunk-batched" as const,
        chunkPolicyHash,
        batchPlanHash,
      }),
      blocks: Object.freeze(handles),
      visualBatches: Object.freeze(batches),
      visualGroups: Object.freeze(input.liveHandles.visualGroups.map((group) =>
        Object.freeze({
          visualGroupId: group.visualGroupId,
          blockHandles: Object.freeze(group.blockHandles.map((handle) =>
            handleByBatchedBlockId.get(handle.blockId)!)),
        }))),
    });
    replaceBabylonNativeBlockLiveHandleRegistryV1(
      input.scene,
      input.liveHandles,
      materialized,
    );
    let isDisposed = false;
    const settled = materialized;
    return Object.freeze({
      chunkPolicy,
      chunkPolicyHash,
      batchPlanHash,
      batches: Object.freeze([...batches]),
      independentBlockIds: partition.independentBlockIds,
      resources: Object.freeze({
        authoringVisualMeshCount: placements.length,
        thinInstanceBatchCount: batches.length,
        thinInstanceCount: batches.reduce(
          (sum, batch) => sum + batch.blockIds.length,
          0,
        ),
        independentVisualMeshCount: partition.independentBlockIds.length,
        renderedDrawUnitCount: batches.length +
          partition.independentBlockIds.length,
        renderedGeometryBufferSetCount: batches.length +
          partition.independentBlockIds.length,
        hiddenAuthoringMeshCount: batches.reduce(
          (sum, batch) => sum + batch.blockIds.length,
          0,
        ),
      }),
      liveHandles: settled,
      dispose(): void {
        if (isDisposed) return;
        isDisposed = true;
        let firstFailure: unknown;
        try {
          replaceBabylonNativeBlockLiveHandleRegistryV1(
            input.scene,
            settled,
            input.liveHandles,
          );
        } catch (error) {
          firstFailure = error;
        }
        const cleanup = reverseCleanup(batchMeshes, restorable);
        if (!isNil(firstFailure)) throw firstFailure;
        if (cleanup.didFail) throw cleanup.error;
      },
    });
  } catch (error) {
    reverseCleanup(batchMeshes, restorable);
    throw error;
  }
}

function reverseCleanup(
  batchMeshes: readonly Mesh[],
  restorable: readonly RestorableVisualStateV1[],
): Readonly<{ didFail: boolean; error: unknown }> {
  let didFail = false;
  let firstFailure: unknown;
  const record = (error: unknown): void => {
    if (didFail) return;
    didFail = true;
    firstFailure = error;
  };
  for (let index = restorable.length - 1; index >= 0; index -= 1) {
    const state = restorable[index]!;
    try {
      if (state.mesh.isDisposed()) continue;
      state.mesh.isVisible = state.isVisible;
      state.mesh.alwaysSelectAsActiveMesh = state.alwaysSelectAsActiveMesh;
    } catch (error) {
      record(error);
    }
  }
  for (let index = batchMeshes.length - 1; index >= 0; index -= 1) {
    const mesh = batchMeshes[index]!;
    try {
      mesh.thinInstanceSetBuffer("matrix", null);
    } catch (error) {
      record(error);
    }
    try {
      mesh.material = null;
      mesh.dispose();
    } catch (error) {
      record(error);
    }
  }
  return Object.freeze({ didFail, error: firstFailure });
}

export function babylonNativeBlockLiveVisualHandleWorldMatrixV1(
  handle: BabylonNativeBlockLiveVisualHandleV1,
): Matrix {
  if (handle.kind === "independent-mesh") {
    return handle.mesh.computeWorldMatrix(true).clone();
  }
  const buffer = handle.batchMesh.thinInstanceGetWorldMatrices()[
    handle.instanceIndex
  ];
  if (isNil(buffer)) {
    return fail(
      CODE,
      `Thin Instance ${handle.instanceIndex} of '${handle.blockId}' is absent.`,
    );
  }
  return buffer.clone();
}

export function babylonNativeBlockLiveVisualRenderedMeshesV1(
  registry: BabylonNativeBlockLiveHandleRegistryV1,
): readonly Mesh[] {
  return Object.freeze([...new Set(registry.blocks.map(
    babylonNativeBlockLiveVisualHandleMeshV1,
  ))]);
}
