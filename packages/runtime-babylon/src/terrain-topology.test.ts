import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import type { CanonicalSceneTerrainV1 } from "@whitebox-world/runtime-contracts";
import * as terrainSurface from "@whitebox-world/terrain-surface";
import { describe, expect, it } from "vitest";

import { createTerrainMesh } from "./terrain.js";
import { compileRuntimeTestScenePlanV1 } from "./runtime-test-plan.js";

type HeightfieldEmitter = (
  input: terrainSurface.TriangleHeightfieldSurfaceInput,
) => Readonly<{
  originMetersXYZ: readonly [number, number, number];
  localPositionsMetersXYZ: readonly number[];
  triangleIndices: readonly number[];
}>;

function emitter(): HeightfieldEmitter {
  const candidate = (
    terrainSurface as typeof terrainSurface & {
      emitTriangleHeightfieldSurfaceV1?: HeightfieldEmitter;
    }
  ).emitTriangleHeightfieldSurfaceV1;
  expect(candidate).toBeTypeOf("function");
  return candidate!;
}

describe("Babylon terrain topology", () => {
  it("uses canonical non-square mesh bytes without changing world placement", () => {
    const terrain: CanonicalSceneTerrainV1 = {
      entityId: "terrain-offset",
      centerMetersXZ: [10, -4],
      sizeMetersXZ: [4, 6],
      resolutionCellsXZ: [3, 2],
      heightSamplesMeters: [0, 1, 2, 3, 4, 5],
      heightSamplesHash: `sha256:${"a".repeat(64)}`,
      minimumHeightMeters: 0,
      maximumHeightMeters: 5,
      semanticClassId: "terrain.ground",
    };
    const canonical = emitter()({
      centerMetersXZ: terrain.centerMetersXZ,
      sizeMetersXZ: terrain.sizeMetersXZ,
      resolutionVerticesXZ: terrain.resolutionCellsXZ,
      heightSamplesMeters: terrain.heightSamplesMeters,
    });
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const material = new StandardMaterial("terrain-material", scene);

    try {
      const mesh = createTerrainMesh(terrain, material, scene);
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
      const indices = mesh.getIndices();
      const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
      const uvs = mesh.getVerticesData(VertexBuffer.UVKind);

      expect(positions).toEqual([...canonical.localPositionsMetersXYZ]);
      expect(indices).toEqual([...canonical.triangleIndices]);
      expect(mesh.position.asArray()).toEqual([...canonical.originMetersXYZ]);
      expect(positions).toEqual([
        -2, 0, -3,
        0, 1, -3,
        2, 2, -3,
        -2, 3, 3,
        0, 4, 3,
        2, 5, 3,
      ]);
      expect(indices).toEqual([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]);
      expect(normals).toHaveLength(positions!.length);
      expect(uvs).toHaveLength(terrain.heightSamplesMeters.length * 2);

      const firstWorldVertex = [
        positions![0]! + mesh.position.x,
        positions![1]! + mesh.position.y,
        positions![2]! + mesh.position.z,
      ];
      const lastOffset = positions!.length - 3;
      const lastWorldVertex = [
        positions![lastOffset]! + mesh.position.x,
        positions![lastOffset + 1]! + mesh.position.y,
        positions![lastOffset + 2]! + mesh.position.z,
      ];
      expect(firstWorldVertex).toEqual([8, 0, -7]);
      expect(lastWorldVertex).toEqual([12, 5, -1]);
    } finally {
      material.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("does not retain a partial Mesh when canonical input validation fails", () => {
    const terrain: CanonicalSceneTerrainV1 = {
      entityId: "terrain-invalid",
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [2, 2],
      resolutionCellsXZ: [2, 2],
      heightSamplesMeters: [0, 1, 2],
      heightSamplesHash: `sha256:${"b".repeat(64)}`,
      minimumHeightMeters: 0,
      maximumHeightMeters: 2,
      semanticClassId: "terrain.ground",
    };
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const material = new StandardMaterial("terrain-material-invalid", scene);

    try {
      expect(() => createTerrainMesh(terrain, material, scene)).toThrow(
        /^TRIANGLE_HEIGHTFIELD_INPUT_INVALID:/,
      );
      expect(scene.meshes).toEqual([]);
    } finally {
      material.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("builds a 1km 401x401 Heightfield with 32-bit topology", () => {
    const columns = 401;
    const rows = 401;
    const authoring = createValidAuthoringSpec();
    authoring.world.bounds.sizeMetersXZ = [1000, 1000];
    authoring.world.resourceBudget.maxVertices = 200_000;
    authoring.world.resourceBudget.maxTriangles = 400_000;
    const terrainNode = authoring.nodes.find((node) => node.kind === "terrain");
    if (terrainNode?.kind !== "terrain") throw new Error("TEST_TERRAIN_MISSING");
    terrainNode.components.terrain.grid.sizeMetersXZ = [1000, 1000];
    terrainNode.components.terrain.grid.resolutionCellsXZ = [columns, rows];
    if (terrainNode.components.terrain.source.kind !== "procedural") {
      throw new Error("TEST_PROCEDURAL_TERRAIN_MISSING");
    }
    terrainNode.components.terrain.source.relief = "flat";
    terrainNode.components.terrain.source.baseHeightMeters = 0;
    terrainNode.components.terrain.source.amplitudeMeters = 0;
    const terrain = compileRuntimeTestScenePlanV1(authoring).terrain;
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const material = new StandardMaterial("terrain-material-large-1km", scene);

    try {
      const mesh = createTerrainMesh(terrain, material, scene);
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
      const indices = mesh.getIndices();
      if (positions === null || indices === null) {
        throw new Error("TEST_LARGE_TERRAIN_TOPOLOGY_MISSING");
      }
      let maximumIndex = 0;
      for (const index of indices) maximumIndex = Math.max(maximumIndex, index);

      expect(terrain.sizeMetersXZ[0] / (columns - 1)).toBe(2.5);
      expect(mesh.getTotalVertices()).toBe(160_801);
      expect(positions).toHaveLength(160_801 * 3);
      expect(indices).toHaveLength(320_000 * 3);
      expect(maximumIndex).toBe(160_800);
      expect(maximumIndex).toBeGreaterThan(65_535);
      expect(scene.meshes).toEqual([mesh]);
    } finally {
      material.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
