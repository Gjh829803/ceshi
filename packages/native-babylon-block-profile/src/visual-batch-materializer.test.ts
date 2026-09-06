import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBabylonNativeBlockVisualsV1 } from
  "./babylon-visual-adapter.js";
import {
  BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
} from "./chunk-policy.js";
import { createBabylonNativeBlockProfileCheckResultV1 } from "./check.js";
import { deriveBabylonNativeBlockLayoutV1 } from "./layout.js";
import {
  peekBabylonNativeBlockLiveHandleRegistryV1,
  type BabylonNativeBlockLiveHandleRegistryV1,
} from "./live-handle-registry.js";
import type { BabylonNativeBlockPaletteRoleV1 } from "./profile.js";
import {
  BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1,
  type BabylonNativeBlockPositionMetersXYZV1,
  type BabylonNativeBlockShapeKindV1,
} from "./shapes.js";
import type { BabylonNativeBlockSessionRecordV1 } from "./session.js";
import {
  babylonNativeBlockLiveVisualHandleWorldMatrixV1,
  babylonNativeBlockLiveVisualRenderedMeshesV1,
  materializeBabylonNativeBlockVisualBatchesV1,
  type BabylonNativeBlockVisualBatchPlacementV1,
} from "./visual-batch-materializer.js";

interface BlockSpecV1 {
  readonly id: string;
  readonly shape?: BabylonNativeBlockShapeKindV1;
  readonly rotationQuarterTurnsY?: 0 | 1 | 2 | 3;
  readonly paletteRole?: BabylonNativeBlockPaletteRoleV1;
  readonly visualGroupId?: string;
  readonly centerMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
}

/**
 * One continuous route floor crosses the 4 m Chunk seam at x = 3.5: four Blocks
 * belong to Chunk `xp0-zp0` and two to `xp1-zp0`. The single wall Block is the
 * only member of its partition and must stay an independent Mesh.
 */
const FIXTURE_BLOCKS: readonly BlockSpecV1[] = Object.freeze([
  { id: "route-0", centerMetersXYZ: [0, 0.5, 0], paletteRole: "route",
    visualGroupId: "route" },
  { id: "route-1", centerMetersXYZ: [1, 0.5, 0], paletteRole: "route",
    visualGroupId: "route" },
  { id: "route-2", centerMetersXYZ: [2, 0.5, 0], paletteRole: "route",
    visualGroupId: "route" },
  { id: "route-3", centerMetersXYZ: [3, 0.5, 0], paletteRole: "route",
    visualGroupId: "route" },
  { id: "route-4", centerMetersXYZ: [4, 0.5, 0], paletteRole: "route",
    visualGroupId: "route" },
  { id: "route-5", centerMetersXYZ: [5, 0.5, 0], paletteRole: "route",
    visualGroupId: "route" },
  { id: "wall-single", centerMetersXYZ: [0, 0.5, 1], paletteRole: "structure",
    visualGroupId: "wall" },
]);

const cleanups: Array<() => void> = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (cleanups.length > 0) cleanups.pop()!();
});

function record(
  scene: Scene,
  spec: BlockSpecV1,
): BabylonNativeBlockSessionRecordV1 {
  const shape = spec.shape ?? "full";
  return Object.freeze({
    input: Object.freeze({
      id: spec.id,
      shape,
      paletteRole: spec.paletteRole ?? "ground",
      centerMetersXYZ: spec.centerMetersXYZ,
      rotationQuarterTurnsY: spec.rotationQuarterTurnsY ?? 0,
      ...(spec.visualGroupId === undefined
        ? {}
        : { visualGroupId: spec.visualGroupId }),
    }),

  });
}

interface FixtureV1 {
  readonly scene: Scene;
  readonly liveHandles: BabylonNativeBlockLiveHandleRegistryV1;
  readonly placements: readonly BabylonNativeBlockVisualBatchPlacementV1[];
  readonly meshByBlockId: ReadonlyMap<string, Mesh>;
  dispose(): void;
}

function createFixture(
  specs: readonly BlockSpecV1[] = FIXTURE_BLOCKS,
  reverse = false,
): FixtureV1 {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const ordered = reverse ? [...specs].reverse() : [...specs];
  const records = Object.freeze(ordered.map((spec) => record(scene, spec)));
  const layout = deriveBabylonNativeBlockLayoutV1(scene, records);
  const checkResult = createBabylonNativeBlockProfileCheckResultV1(
    "visual-batch-fixture",
    records,
    layout,
  );
  if (checkResult.outcome !== "passed") {
    throw new Error(JSON.stringify(checkResult.diagnostics));
  }
  const visuals = createBabylonNativeBlockVisualsV1({
    scene,
    buildEpochId: "visual-batch-fixture",
    checkedLayout: Object.freeze({
      kind: "babylon-native-block-checked-layout" as const,
      schemaVersion: 1 as const,
      layout,
      checkResult,
      records,
    }),
  });
  const placements = Object.freeze(layout.blocks.map((block) => Object.freeze({
    blockId: block.id,
    runtimeEntityId: `native-block:${block.id}`,
    semanticCaptureClassId:
      `worldkit.native-block.group.${block.visualGroupId ?? "ungrouped"}`,
    shape: block.shape,
    paletteRole: block.paletteRole,
    ...(block.visualGroupId === undefined
      ? {}
      : { visualGroupId: block.visualGroupId }),
    centerMetersXYZ: block.centerMetersXYZ,
    rotationQuarterTurnsY: block.rotationQuarterTurnsY,
    sizeMetersXYZ: block.sizeMetersXYZ,
  })));
  const fixture: FixtureV1 = Object.freeze({
    scene,
    liveHandles: visuals.liveHandles,
    placements,
    meshByBlockId: new Map(visuals.nodes.flatMap(node => node.sourceBlockIds.map(id => [id, node.mesh] as const))),
    dispose(): void {
      visuals.dispose();
      scene.dispose();
      engine.dispose();
    },
  });
  cleanups.push(() => fixture.dispose());
  return fixture;
}

function batchMeshNames(scene: Scene): readonly string[] {
  return scene.meshes.map(({ name }) => name)
    .filter((name) => name.startsWith("worldkit-block-visual-batch-"))
    .sort();
}

describe("NBR-65F Native Block visual batch realization", () => {

  it("merges rotated non-square shapes using effective dimensions and keeps holes", () => {
    const fixture = createFixture([
      { id: "quarter-west", shape: "quarter", rotationQuarterTurnsY: 1, centerMetersXYZ: [0, 0.25, 0.25], paletteRole: "structure" },
      { id: "quarter-east", shape: "quarter", rotationQuarterTurnsY: 1, centerMetersXYZ: [1, 0.25, 0.25], paletteRole: "structure" },
      { id: "quarter-remote", shape: "quarter", rotationQuarterTurnsY: 1, centerMetersXYZ: [4, 0.25, 0.25], paletteRole: "structure" },
    ]);
    const materialized = materializeBabylonNativeBlockVisualBatchesV1({
      scene: fixture.scene, realizationId: "rotated-cluster-parity",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      placements: fixture.placements, liveHandles: fixture.liveHandles,
    });
    cleanups.push(() => materialized.dispose());
    expect(materialized.batches).toHaveLength(1);
    const batch = materialized.batches[0]!;
    expect(batch.instances.map(({ sourceBlockIds }) => sourceBlockIds))
      .toEqual([["quarter-east", "quarter-west"], ["quarter-remote"]]);
    const matrices = batch.mesh.thinInstanceGetWorldMatrices();
    expect(matrices).toHaveLength(2);
    expect(matrices[0]!.m[0]).toBeCloseTo(1.97, 6);
    expect(matrices[0]!.m[5]).toBeCloseTo(0.4925, 6);
    expect(matrices[0]!.m[10]).toBeCloseTo(0.4925, 6);
    expect(matrices[0]!.m[12]).toBeCloseTo(0.5, 6);
    expect(matrices[1]!.m[12]).toBeCloseTo(4, 6);
    expect(batch.mesh.geometry).not.toBe(fixture.meshByBlockId.get("quarter-west")!.geometry);
  });
  it("batches old 32m visual clusters independently of physics Chunk seams", () => {
    const fixture = createFixture();
    const materialized = materializeBabylonNativeBlockVisualBatchesV1({
      scene: fixture.scene,
      realizationId: "visual-batch-fixture",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      placements: fixture.placements,
      liveHandles: fixture.liveHandles,
    });
    cleanups.push(() => materialized.dispose());

    expect(materialized.batches.map((batch) => ({
      batchId: batch.batchId,
      visualChunkIndexXZ: batch.visualChunkIndexXZ,
      shape: batch.shape,
      paletteRole: batch.paletteRole,
      semanticCaptureClassId: batch.semanticCaptureClassId,
      blockIds: [...batch.blockIds],
    }))).toEqual([
      {
        batchId: "thin-instance-group-0001",
        visualChunkIndexXZ: [0, 0],
        shape: "full",
        paletteRole: "route",
        semanticCaptureClassId: "worldkit.native-block.group.route",
        blockIds: ["route-0", "route-1", "route-2", "route-3", "route-4", "route-5"],
      },
    ]);
    expect(materialized.independentBlockIds).toEqual(["wall-single"]);
    expect(materialized.resources).toEqual({
      authoringVisualMeshCount: 2,
      thinInstanceBatchCount: 1,
      thinInstanceCount: 1,
      independentVisualMeshCount: 1,
      renderedDrawUnitCount: 2,
      renderedGeometryBufferSetCount: 2,
      hiddenAuthoringMeshCount: 1,
    });
    expect(materialized.chunkPolicyHash)
      .toBe(BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1);
    expect(materialized.batchPlanHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });


  it("realizes the old whole-cluster display extent without per-Block seams", () => {
    const fixture = createFixture([
      { id: "mass-west", centerMetersXYZ: [0, 0.5, 0], paletteRole: "structure", visualGroupId: "mass" },
      { id: "mass-east", centerMetersXYZ: [1, 0.5, 0], paletteRole: "structure", visualGroupId: "mass" },
    ]);
    const materialized = materializeBabylonNativeBlockVisualBatchesV1({
      scene: fixture.scene,
      realizationId: "cluster-display-parity",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      placements: fixture.placements,
      liveHandles: fixture.liveHandles,
    });
    cleanups.push(() => materialized.dispose());
    const meshes = babylonNativeBlockLiveVisualRenderedMeshesV1(materialized.liveHandles);
    const xCoordinates: number[] = [];
    let displayedVolumeCount = 0;
    for (const mesh of meshes) {
      const matrices = mesh.hasThinInstances
        ? mesh.thinInstanceGetWorldMatrices()
        : [mesh.computeWorldMatrix(true)];
      displayedVolumeCount += matrices.length;
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      for (const matrix of matrices) {
        for (let offset = 0; offset < positions.length; offset += 3) {
          xCoordinates.push(Vector3.TransformCoordinates(
            Vector3.FromArray(positions, offset), matrix,
          ).x);
        }
      }
    }
    // Old cluster spans [-0.5, 1.5]; 0.985 scales that 2m cuboid about x=0.5.
    expect(Math.min(...xCoordinates)).toBeCloseTo(-0.485, 6);
    expect(Math.max(...xCoordinates)).toBeCloseTo(1.485, 6);
    expect(displayedVolumeCount).toBe(1);
    expect(materialized.liveHandles.blocks.map(({ blockId }) => blockId).sort())
      .toEqual(["mass-east", "mass-west"]);
  });
  it("maps every logical Block to one live Mesh or batch instance", () => {
    const fixture = createFixture();
    const materialized = materializeBabylonNativeBlockVisualBatchesV1({
      scene: fixture.scene,
      realizationId: "visual-batch-fixture",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      placements: fixture.placements,
      liveHandles: fixture.liveHandles,
    });
    cleanups.push(() => materialized.dispose());

    const registry = peekBabylonNativeBlockLiveHandleRegistryV1(fixture.scene)!;
    expect(registry).toBe(materialized.liveHandles);
    expect(registry.realization).toEqual({
      kind: "host-chunk-batched",
      chunkPolicyHash: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1,
      batchPlanHash: materialized.batchPlanHash,
    });
    expect(registry.blocks.map(({ blockId }) => blockId)).toEqual([
      "route-0",
      "route-1",
      "route-2",
      "route-3",
      "route-4",
      "route-5",
      "wall-single",
    ]);
    for (const handle of registry.blocks) {
      expect(handle.runtimeEntityId).toBe(`native-block:${handle.blockId}`);
      const displayMatrix = babylonNativeBlockLiveVisualHandleWorldMatrixV1(handle);
      const center = Vector3.TransformCoordinates(Vector3.Zero(), displayMatrix);
      const sourceCenter = Vector3.FromArray(fixture.placements.find(row => row.blockId === handle.blockId)!.centerMetersXYZ);
      const expectedX = handle.kind === "thin-instance"
        ? 2.5 + (sourceCenter.x - 2.5) * 0.985 : sourceCenter.x;
      expect(center.x).toBeCloseTo(expectedX, 6);
      expect(center.y).toBeCloseTo(sourceCenter.y, 6);
      expect(center.z).toBeCloseTo(sourceCenter.z, 6);
      expect(displayMatrix.m[0]).toBeCloseTo(0.985, 6);
    }
    const thinHandles = registry.blocks.filter((handle) =>
      handle.kind === "thin-instance");
    expect(thinHandles.map((handle) => [
      handle.blockId,
      handle.kind === "thin-instance" ? handle.batchId : "",
      handle.kind === "thin-instance" ? handle.instanceIndex : -1,
    ])).toEqual([
      ["route-0", "thin-instance-group-0001", 0],
      ["route-1", "thin-instance-group-0001", 0],
      ["route-2", "thin-instance-group-0001", 0],
      ["route-3", "thin-instance-group-0001", 0],
      ["route-4", "thin-instance-group-0001", 0],
      ["route-5", "thin-instance-group-0001", 0],
    ]);
    expect(registry.visualGroups.map((group) => [
      group.visualGroupId,
      group.blockHandles.map(({ blockId }) => blockId),
    ])).toEqual([
      ["route", [
        "route-0",
        "route-1",
        "route-2",
        "route-3",
        "route-4",
        "route-5",
      ]],
      ["wall", ["wall-single"]],
    ]);
    expect(babylonNativeBlockLiveVisualRenderedMeshesV1(registry))
      .toHaveLength(2);
  });

  it("keeps every batch resident and far-visible instead of culling it", () => {
    const fixture = createFixture();
    const materialized = materializeBabylonNativeBlockVisualBatchesV1({
      scene: fixture.scene,
      realizationId: "visual-batch-fixture",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      placements: fixture.placements,
      liveHandles: fixture.liveHandles,
    });
    cleanups.push(() => materialized.dispose());

    for (const batch of materialized.batches) {
      expect(batch.mesh.isVisible).toBe(true);
      expect(batch.mesh.isEnabled()).toBe(true);
      expect(batch.mesh.alwaysSelectAsActiveMesh).toBe(true);
      expect(batch.mesh.thinInstanceCount).toBe(batch.instances.length);
      expect(batch.mesh.material)
        .toBe(fixture.meshByBlockId.get(batch.blockIds[0]!)!.material);
      const bounds = batch.mesh.getBoundingInfo().boundingBox;
      for (const blockId of batch.blockIds) {
        const handle = materialized.liveHandles.blocks.find((entry) => entry.blockId === blockId)!;
        const matrix = babylonNativeBlockLiveVisualHandleWorldMatrixV1(handle);
        const minimum = Vector3.TransformCoordinates(new Vector3(-0.5, -0.5, -0.5), matrix);
        const maximum = Vector3.TransformCoordinates(new Vector3(0.5, 0.5, 0.5), matrix);
        expect(bounds.minimumWorld.x).toBeLessThanOrEqual(minimum.x + 1e-6);
        expect(bounds.maximumWorld.x).toBeGreaterThanOrEqual(maximum.x - 1e-6);
      }
    }
    // Batched authoring Meshes stop rendering, but they are never disposed,
    // disabled or removed: physics residency must not be able to cull visuals.
    for (const blockId of ["route-0", "route-5"]) {
      const member = fixture.meshByBlockId.get(blockId)!;
      expect(member.isVisible).toBe(false);
      expect(member.isEnabled()).toBe(true);
      expect(member.isDisposed()).toBe(false);
    }
    const independent = fixture.meshByBlockId.get("wall-single")!;
    expect(independent.isVisible).toBe(true);
    expect(independent.alwaysSelectAsActiveMesh).toBe(true);
  });

  it("publishes one deterministic batch plan across creation orders", () => {
    const forward = createFixture();
    const reversed = createFixture(FIXTURE_BLOCKS, true);
    const forwardBatches = materializeBabylonNativeBlockVisualBatchesV1({
      scene: forward.scene,
      realizationId: "visual-batch-fixture",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      placements: [...forward.placements].reverse(),
      liveHandles: forward.liveHandles,
    });
    cleanups.push(() => forwardBatches.dispose());
    const reversedBatches = materializeBabylonNativeBlockVisualBatchesV1({
      scene: reversed.scene,
      realizationId: "visual-batch-fixture",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      placements: reversed.placements,
      liveHandles: reversed.liveHandles,
    });
    cleanups.push(() => reversedBatches.dispose());

    expect(reversedBatches.batchPlanHash).toBe(forwardBatches.batchPlanHash);
    expect(reversedBatches.resources).toEqual(forwardBatches.resources);
  });

  it("changes the realization identity when the Chunk profile changes", () => {
    const fixture = createFixture();
    const current = materializeBabylonNativeBlockVisualBatchesV1({
      scene: fixture.scene,
      realizationId: "visual-batch-fixture",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      placements: fixture.placements,
      liveHandles: fixture.liveHandles,
    });
    const currentPlanHash = current.batchPlanHash;
    const currentResources = current.resources;
    current.dispose();

    const coarse = materializeBabylonNativeBlockVisualBatchesV1({
      scene: fixture.scene,
      realizationId: "visual-batch-fixture",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1[3],
      placements: fixture.placements,
      liveHandles: fixture.liveHandles,
    });
    cleanups.push(() => coarse.dispose());
    expect(coarse.batchPlanHash).not.toBe(currentPlanHash);
    expect(coarse.resources).toEqual(currentResources);
    expect(coarse.batches).toHaveLength(1);
    expect(coarse.batches[0]!.blockIds).toEqual([
      "route-0",
      "route-1",
      "route-2",
      "route-3",
      "route-4",
      "route-5",
    ]);
  });

  it("reverses every batch resource and visibility mutation exactly once", () => {
    const fixture = createFixture();
    const materialized = materializeBabylonNativeBlockVisualBatchesV1({
      scene: fixture.scene,
      realizationId: "visual-batch-fixture",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      placements: fixture.placements,
      liveHandles: fixture.liveHandles,
    });
    expect(batchMeshNames(fixture.scene)).toHaveLength(1);

    materialized.dispose();
    materialized.dispose();

    expect(batchMeshNames(fixture.scene)).toEqual([]);
    expect(peekBabylonNativeBlockLiveHandleRegistryV1(fixture.scene))
      .toBe(fixture.liveHandles);
    for (const [, mesh] of fixture.meshByBlockId) {
      expect(mesh.isDisposed()).toBe(false);
      expect(mesh.isVisible).toBe(true);
      expect(mesh.alwaysSelectAsActiveMesh).toBe(false);
      expect(mesh.hasThinInstances).toBe(false);
    }
  });

  it("fails closed and unwinds a partially activated realization", () => {
    const fixture = createFixture();
    let refreshCount = 0;
    vi.spyOn(Mesh.prototype, "thinInstanceRefreshBoundingInfo")
      .mockImplementation(function refreshOrFail(this: Mesh): Mesh {
        refreshCount += 1;
        if (refreshCount === 2) throw new Error("batch bounds unavailable");
        return this;
      });

    expect(() => materializeBabylonNativeBlockVisualBatchesV1({
      scene: fixture.scene,
      realizationId: "visual-batch-fixture",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      placements: fixture.placements,
      liveHandles: fixture.liveHandles,
    })).toThrow(/batch bounds unavailable/);

    expect(batchMeshNames(fixture.scene)).toEqual([]);
    expect(peekBabylonNativeBlockLiveHandleRegistryV1(fixture.scene))
      .toBe(fixture.liveHandles);
    for (const [, mesh] of fixture.meshByBlockId) {
      expect(mesh.isVisible).toBe(true);
      expect(mesh.isDisposed()).toBe(false);
    }
  });

  it("rejects forged realization inputs instead of guessing identity", () => {
    const fixture = createFixture();
    const invalid: readonly Parameters<
      typeof materializeBabylonNativeBlockVisualBatchesV1
    >[0][] = [
      {
        scene: fixture.scene,
        realizationId: "Visual-Batch",
        chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
        placements: fixture.placements,
        liveHandles: fixture.liveHandles,
      },
      {
        scene: fixture.scene,
        realizationId: "visual-batch-fixture",
        chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
        placements: fixture.placements.slice(1),
        liveHandles: fixture.liveHandles,
      },
      {
        scene: fixture.scene,
        realizationId: "visual-batch-fixture",
        chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
        placements: fixture.placements.map((placement, index) =>
          index === 0
            ? { ...placement, runtimeEntityId: "native-block:forged" }
            : placement),
        liveHandles: fixture.liveHandles,
      },
    ];
    for (const candidate of invalid) {
      expect(() => materializeBabylonNativeBlockVisualBatchesV1(candidate))
        .toThrow(/WORLDKIT_NATIVE_BLOCK/);
    }
    expect(batchMeshNames(fixture.scene)).toEqual([]);
  });

  it("keeps two concurrent Build Epoch realizations isolated", () => {
    const first = createFixture();
    const second = createFixture();
    const firstBatches = materializeBabylonNativeBlockVisualBatchesV1({
      scene: first.scene,
      realizationId: "visual-batch-first",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      placements: first.placements,
      liveHandles: first.liveHandles,
    });
    cleanups.push(() => firstBatches.dispose());

    expect(batchMeshNames(first.scene)).toHaveLength(1);
    expect(batchMeshNames(second.scene)).toEqual([]);
    expect(peekBabylonNativeBlockLiveHandleRegistryV1(second.scene))
      .toBe(second.liveHandles);
    for (const [, mesh] of second.meshByBlockId) {
      expect(mesh.isVisible).toBe(true);
    }
    expect(() => materializeBabylonNativeBlockVisualBatchesV1({
      scene: second.scene,
      realizationId: "visual-batch-second",
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      placements: second.placements,
      liveHandles: first.liveHandles,
    })).toThrow(/WORLDKIT_NATIVE_BLOCK/);
  });
});
