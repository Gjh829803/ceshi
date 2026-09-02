import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
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
  const size = BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1[shape];
  const mesh = MeshBuilder.CreateBox(spec.id, {
    width: size[0],
    height: size[1],
    depth: size[2],
  }, scene);
  mesh.position.set(...spec.centerMetersXYZ);
  return Object.freeze({
    input: Object.freeze({
      id: spec.id,
      shape,
      paletteRole: spec.paletteRole ?? "ground",
      centerMetersXYZ: spec.centerMetersXYZ,
      rotationQuarterTurnsY: 0 as const,
      ...(spec.visualGroupId === undefined
        ? {}
        : { visualGroupId: spec.visualGroupId }),
    }),
    mesh,
    localGeometrySnapshot: Object.freeze({
      positions: Object.freeze(Array.from(
        mesh.getVerticesData(VertexBuffer.PositionKind)!,
      )),
      indices: Object.freeze(Array.from(mesh.getIndices()!)),
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
    meshByBlockId: new Map(records.map((entry) =>
      [entry.input.id, entry.mesh] as const)),
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
  it("batches only inside one Chunk, shape, palette role and visual group", () => {
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
      residencyGroupId: batch.residencyGroupId,
      shape: batch.shape,
      paletteRole: batch.paletteRole,
      semanticCaptureClassId: batch.semanticCaptureClassId,
      blockIds: [...batch.blockIds],
    }))).toEqual([
      {
        batchId: "thin-instance-group-0001",
        residencyGroupId: "grid-chunk-xp0-zp0",
        shape: "full",
        paletteRole: "route",
        semanticCaptureClassId: "worldkit.native-block.group.route",
        blockIds: ["route-0", "route-1", "route-2", "route-3"],
      },
      {
        batchId: "thin-instance-group-0002",
        residencyGroupId: "grid-chunk-xp1-zp0",
        shape: "full",
        paletteRole: "route",
        semanticCaptureClassId: "worldkit.native-block.group.route",
        blockIds: ["route-4", "route-5"],
      },
    ]);
    expect(materialized.independentBlockIds).toEqual(["wall-single"]);
    expect(materialized.resources).toEqual({
      authoringVisualMeshCount: 7,
      thinInstanceBatchCount: 2,
      thinInstanceCount: 6,
      independentVisualMeshCount: 1,
      renderedDrawUnitCount: 3,
      renderedGeometryBufferSetCount: 3,
      hiddenAuthoringMeshCount: 6,
    });
    expect(materialized.chunkPolicyHash)
      .toBe(BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1);
    expect(materialized.batchPlanHash).toMatch(/^sha256:[0-9a-f]{64}$/);
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
      const authoringMatrix = fixture.meshByBlockId.get(handle.blockId)!
        .computeWorldMatrix(true);
      expect(
        [...babylonNativeBlockLiveVisualHandleWorldMatrixV1(handle).asArray()]
          .map((value) => Math.round(value * 1e6) / 1e6),
      ).toEqual(
        [...authoringMatrix.asArray()]
          .map((value) => Math.round(value * 1e6) / 1e6),
      );
    }
    const thinHandles = registry.blocks.filter((handle) =>
      handle.kind === "thin-instance");
    expect(thinHandles.map((handle) => [
      handle.blockId,
      handle.kind === "thin-instance" ? handle.batchId : "",
      handle.kind === "thin-instance" ? handle.instanceIndex : -1,
    ])).toEqual([
      ["route-0", "thin-instance-group-0001", 0],
      ["route-1", "thin-instance-group-0001", 1],
      ["route-2", "thin-instance-group-0001", 2],
      ["route-3", "thin-instance-group-0001", 3],
      ["route-4", "thin-instance-group-0002", 0],
      ["route-5", "thin-instance-group-0002", 1],
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
      .toHaveLength(3);
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
      expect(batch.mesh.thinInstanceCount).toBe(batch.blockIds.length);
      expect(batch.mesh.material)
        .toBe(fixture.meshByBlockId.get(batch.blockIds[0]!)!.material);
      const bounds = batch.mesh.getBoundingInfo().boundingBox;
      for (const blockId of batch.blockIds) {
        const member = fixture.meshByBlockId.get(blockId)!;
        const memberBounds = member.getBoundingInfo().boundingBox;
        expect(bounds.minimumWorld.x)
          .toBeLessThanOrEqual(memberBounds.minimumWorld.x + 1e-6);
        expect(bounds.maximumWorld.x)
          .toBeGreaterThanOrEqual(memberBounds.maximumWorld.x - 1e-6);
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
    expect(coarse.resources).not.toEqual(currentResources);
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
    expect(batchMeshNames(fixture.scene)).toHaveLength(2);

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

    expect(batchMeshNames(first.scene)).toHaveLength(2);
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
