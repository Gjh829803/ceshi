import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBabylonNativeBlockVisualsV1 } from
  "./babylon-visual-adapter.js";
import { applyBabylonNativeBlockCaptureIsolationV1 } from
  "./capture-isolation.js";
import { createBabylonNativeBlockProfileCheckResultV1 } from "./check.js";
import { BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1 } from
  "./chunk-policy.js";
import { deriveBabylonNativeBlockLayoutV1 } from "./layout.js";
import type {
  BabylonNativeBlockLiveHandleRegistryV1,
} from "./live-handle-registry.js";
import type { BabylonNativeBlockSessionRecordV1 } from "./session.js";
import {
  BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1,
  type BabylonNativeBlockPositionMetersXYZV1,
} from "./shapes.js";
import { materializeBabylonNativeBlockVisualBatchesV1 } from
  "./visual-batch-materializer.js";

const BLOCKS = Object.freeze([
  Object.freeze({
    id: "route-0",
    centerMetersXYZ: Object.freeze([0, 0.5, 0] as const),
    paletteRole: "route" as const,
    visualGroupId: "route",
  }),
  Object.freeze({
    id: "route-1",
    centerMetersXYZ: Object.freeze([1, 0.5, 0] as const),
    paletteRole: "route" as const,
    visualGroupId: "route",
  }),
  Object.freeze({
    id: "route-2",
    centerMetersXYZ: Object.freeze([2, 0.5, 0] as const),
    paletteRole: "route" as const,
    visualGroupId: "route",
  }),
  Object.freeze({
    id: "wall-single",
    centerMetersXYZ: Object.freeze([0, 0.5, 1] as const),
    paletteRole: "structure" as const,
    visualGroupId: "wall",
  }),
]);

const cleanups: Array<() => void> = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (cleanups.length > 0) cleanups.pop()!();
});

function record(
  scene: Scene,
  spec: typeof BLOCKS[number],
): BabylonNativeBlockSessionRecordV1 {
  const size = BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1.full;
  const mesh = MeshBuilder.CreateBox(spec.id, {
    width: size[0],
    height: size[1],
    depth: size[2],
  }, scene);
  mesh.position.set(...(spec.centerMetersXYZ as BabylonNativeBlockPositionMetersXYZV1));
  return Object.freeze({
    input: Object.freeze({
      id: spec.id,
      shape: "full" as const,
      paletteRole: spec.paletteRole,
      centerMetersXYZ: spec.centerMetersXYZ,
      rotationQuarterTurnsY: 0 as const,
      visualGroupId: spec.visualGroupId,
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
  readonly registry: BabylonNativeBlockLiveHandleRegistryV1;
  readonly meshByBlockId: ReadonlyMap<string, Mesh>;
  readonly batchMesh: Mesh;
  readonly independentMesh: Mesh;
}

function createFixture(): FixtureV1 {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const records = Object.freeze(BLOCKS.map((spec) => record(scene, spec)));
  const layout = deriveBabylonNativeBlockLayoutV1(scene, records);
  const checkResult = createBabylonNativeBlockProfileCheckResultV1(
    "capture-isolation-fixture",
    records,
    layout,
  );
  if (checkResult.outcome !== "passed") {
    throw new Error(JSON.stringify(checkResult.diagnostics));
  }
  const visuals = createBabylonNativeBlockVisualsV1({
    scene,
    buildEpochId: "capture-isolation-fixture",
    checkedLayout: Object.freeze({
      kind: "babylon-native-block-checked-layout" as const,
      schemaVersion: 1 as const,
      layout,
      checkResult,
      records,
    }),
  });
  const batches = materializeBabylonNativeBlockVisualBatchesV1({
    scene,
    realizationId: "capture-isolation-fixture",
    chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
    placements: layout.blocks.map((block) => Object.freeze({
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
    })),
    liveHandles: visuals.liveHandles,
  });
  cleanups.push(() => {
    batches.dispose();
    visuals.dispose();
    scene.dispose();
    engine.dispose();
  });
  return Object.freeze({
    scene,
    registry: batches.liveHandles,
    meshByBlockId: new Map(records.map((entry) =>
      [entry.input.id, entry.mesh] as const)),
    batchMesh: batches.batches[0]!.mesh,
    independentMesh: records.find(({ input }) =>
      input.id === "wall-single")!.mesh,
  });
}

function instanceScales(mesh: Mesh): readonly number[] {
  return mesh.thinInstanceGetWorldMatrices()
    .map((matrix) => Math.round(matrix.asArray()[0]! * 1e6) / 1e6);
}

function instanceTranslations(mesh: Mesh): readonly number[] {
  return mesh.thinInstanceGetWorldMatrices()
    .map((matrix) => Math.round(matrix.asArray()[12]! * 1e6) / 1e6);
}

describe("NBR-65F formal Capture target isolation", () => {

  it("fragments disjoint members of one cluster and restores its exact buffers", () => {
    const fixture = createFixture();
    const priorMatrices = fixture.batchMesh.thinInstanceGetWorldMatrices().map(matrix => [...matrix.asArray()]);
    const priorColors = Array.from(fixture.batchMesh.getVertexBuffer(VertexBuffer.ColorInstanceKind)!.getFloatData(1, true)!);
    const isolation = applyBabylonNativeBlockCaptureIsolationV1({
      registry: fixture.registry, targetBlockIds: ["route-2", "route-0"],
    });
    expect(fixture.batchMesh.thinInstanceCount).toBe(2);
    expect(instanceTranslations(fixture.batchMesh)).toEqual([0.015, 1.985]);
    expect(instanceScales(fixture.batchMesh)).toEqual([0.985, 0.985]);
    expect(Array.from(fixture.batchMesh.getVertexBuffer(VertexBuffer.ColorInstanceKind)!.getFloatData(2, true)!))
      .toEqual([...priorColors, ...priorColors]);
    isolation.restore();
    expect(fixture.batchMesh.thinInstanceGetWorldMatrices().map(matrix => [...matrix.asArray()])).toEqual(priorMatrices);
    expect(Array.from(fixture.batchMesh.getVertexBuffer(VertexBuffer.ColorInstanceKind)!.getFloatData(1, true)!))
      .toEqual(priorColors);
  });

  it("restores the normal cluster after a partially applied capture buffer throws", () => {
    const fixture = createFixture();
    const priorMatrices = fixture.batchMesh.thinInstanceGetWorldMatrices().map(matrix => [...matrix.asArray()]);
    const priorColors = Array.from(fixture.batchMesh.getVertexBuffer(VertexBuffer.ColorInstanceKind)!.getFloatData(1, true)!);
    const setBuffer = fixture.batchMesh.thinInstanceSetBuffer;
    let didThrow = false;
    vi.spyOn(fixture.batchMesh, "thinInstanceSetBuffer").mockImplementation(function (kind, buffer, stride, isStatic) {
      setBuffer.call(fixture.batchMesh, kind, buffer, stride, isStatic);
      if (kind === "matrix" && !didThrow) {
        didThrow = true;
        throw new Error("partial capture buffer failure");
      }
    });
    expect(() => applyBabylonNativeBlockCaptureIsolationV1({
      registry: fixture.registry, targetBlockIds: ["route-0", "route-2"],
    })).toThrow("partial capture buffer failure");
    expect(fixture.batchMesh.thinInstanceGetWorldMatrices().map(matrix => [...matrix.asArray()])).toEqual(priorMatrices);
    expect(Array.from(fixture.batchMesh.getVertexBuffer(VertexBuffer.ColorInstanceKind)!.getFloatData(1, true)!))
      .toEqual(priorColors);
    expect(fixture.independentMesh.isVisible).toBe(true);
  });
  it("isolates one batched Block without losing its batch identity", () => {
    const fixture = createFixture();
    const scaleBefore = instanceScales(fixture.batchMesh);
    const isolation = applyBabylonNativeBlockCaptureIsolationV1({
      registry: fixture.registry,
      targetBlockIds: ["route-1"],
    });

    expect(isolation.targetBlockIds).toEqual(["route-1"]);
    expect(isolation.hiddenIndependentBlockIds).toEqual(["wall-single"]);
    expect(isolation.hiddenBatchIds).toEqual([]);
    expect(isolation.maskedThinInstanceCount).toBe(1);
    expect(fixture.independentMesh.isVisible).toBe(false);
    expect(fixture.batchMesh.isVisible).toBe(true);
    expect(fixture.batchMesh.thinInstanceCount).toBe(1);
    expect(instanceScales(fixture.batchMesh)).toEqual([0.985]);
    // Partial selection uses the materializer-owned displayed Block portion.
    expect(instanceTranslations(fixture.batchMesh)).toEqual([1]);

    isolation.restore();
    expect(instanceScales(fixture.batchMesh)).toEqual(scaleBefore);
    expect(instanceTranslations(fixture.batchMesh)).toEqual([1]);
    expect(fixture.independentMesh.isVisible).toBe(true);
    expect(fixture.batchMesh.isVisible).toBe(true);
  });

  it("hides a whole batch when it holds no Capture target", () => {
    const fixture = createFixture();
    const isolation = applyBabylonNativeBlockCaptureIsolationV1({
      registry: fixture.registry,
      targetBlockIds: ["wall-single"],
    });

    expect(isolation.hiddenBatchIds).toEqual(["thin-instance-group-0001"]);
    expect(isolation.maskedThinInstanceCount).toBe(0);
    expect(fixture.batchMesh.isVisible).toBe(false);
    expect(fixture.independentMesh.isVisible).toBe(true);
    expect(instanceScales(fixture.batchMesh)).toEqual([2.955]);

    isolation.restore();
    expect(fixture.batchMesh.isVisible).toBe(true);
  });

  it("restores every tint material and Mesh binding exactly once", () => {
    const fixture = createFixture();
    const priorBatchMaterial = fixture.batchMesh.material;
    const priorIndependentMaterial = fixture.independentMesh.material;
    const materialCountBefore = fixture.scene.materials.length;
    expect(fixture.batchMesh.isVerticesDataPresent(
      VertexBuffer.ColorInstanceKind,
    )).toBe(true);
    const isolation = applyBabylonNativeBlockCaptureIsolationV1({
      registry: fixture.registry,
      targetBlockIds: ["route-0", "wall-single"],
      tint: { materialName: "capture-tint", colorHex: "#FF00AA" },
    });

    expect(isolation.tintedMeshCount).toBe(2);
    expect(fixture.scene.materials.length).toBe(materialCountBefore + 1);
    expect(fixture.batchMesh.material?.name).toBe("capture-tint");
    expect(fixture.independentMesh.material?.name).toBe("capture-tint");
    expect(fixture.batchMesh.material).toBe(fixture.independentMesh.material);
    expect(fixture.batchMesh.isVerticesDataPresent(
      VertexBuffer.ColorInstanceKind,
    )).toBe(false);

    isolation.restore();
    isolation.restore();

    expect(fixture.batchMesh.material).toBe(priorBatchMaterial);
    expect(fixture.independentMesh.material).toBe(priorIndependentMaterial);
    expect(fixture.scene.materials.length).toBe(materialCountBefore);
    expect(fixture.batchMesh.isVerticesDataPresent(
      VertexBuffer.ColorInstanceKind,
    )).toBe(true);
  });

  it("keeps every Block addressable and rejects an unknown target", () => {
    const fixture = createFixture();
    for (const blockId of fixture.registry.blocks.map((row) => row.blockId)) {
      const isolation = applyBabylonNativeBlockCaptureIsolationV1({
        registry: fixture.registry,
        targetBlockIds: [blockId],
      });
      isolation.restore();
    }
    expect(() => applyBabylonNativeBlockCaptureIsolationV1({
      registry: fixture.registry,
      targetBlockIds: ["absent-block"],
    })).toThrow(/WORLDKIT_NATIVE_BLOCK_CAPTURE_ISOLATION_INVALID/);
    expect(() => applyBabylonNativeBlockCaptureIsolationV1({
      registry: fixture.registry,
      targetBlockIds: [],
    })).toThrow(/WORLDKIT_NATIVE_BLOCK_CAPTURE_ISOLATION_INVALID/);
    expect(() => applyBabylonNativeBlockCaptureIsolationV1({
      registry: fixture.registry,
      targetBlockIds: ["route-0", "route-0"],
    })).toThrow(/WORLDKIT_NATIVE_BLOCK_CAPTURE_ISOLATION_INVALID/);
    expect(fixture.independentMesh.isVisible).toBe(true);
    expect(instanceScales(fixture.batchMesh)).toEqual([2.955]);
  });
});
