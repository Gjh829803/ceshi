import { describe, expect, it } from "vitest";

import { CircleShape } from "./shapes";
import {
  createScalarRasterField,
  Heightfield,
  HeightfieldGrid,
  sampleTerrainSlopeDegrees,
} from "./terrain";

describe("Heightfield", () => {
  it("creates deterministic rolling terrain", () => {
    const first = new Heightfield({ width: 100, depth: 100, xSegments: 10, zSegments: 10 });
    const second = new Heightfield({ width: 100, depth: 100, xSegments: 10, zSegments: 10 });
    first.applyNoise({ seed: 1234, amplitude: 20, frequency: 0.03, octaves: 4 });
    second.applyNoise({ seed: 1234, amplitude: 20, frequency: 0.03, octaves: 4 });
    expect(first.heights).toEqual(second.heights);
    expect(new Set(first.heights).size).toBeGreaterThan(10);
  });

  it("raises, lowers, flattens, and smooths shaped areas", () => {
    const terrain = new Heightfield({ width: 20, depth: 20, xSegments: 4, zSegments: 4 });
    const center = new CircleShape([0, 0], 8);
    terrain.raise({ area: center, amount: 10, falloffWidth: 4 });
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(10);
    expect(terrain.sampleHeight(10, 10)).toBeCloseTo(0);

    terrain.lower({ area: center, amount: 4, falloffWidth: 4 });
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(6);
    terrain.flatten({ area: center, height: 2, strength: 0.5 });
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(4);
    terrain.smooth({ area: center, iterations: 2, strength: 0.5 });
    expect(terrain.sampleHeight(0, 0)).toBeLessThan(4);
  });

  it("samples interpolated height and returns undefined outside", () => {
    const terrain = new Heightfield({ width: 2, depth: 2, xSegments: 1, zSegments: 1 });
    terrain.setHeight(0, 0, 0).setHeight(1, 0, 2).setHeight(0, 1, 2).setHeight(1, 1, 4);
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(2);
    expect(terrain.sampleHeight(2, 0)).toBeUndefined();
  });

  it("generates indexed Three.js BufferGeometry data", () => {
    const terrain = new Heightfield({ width: 10, depth: 20, xSegments: 2, zSegments: 3, baseHeight: 2 });
    const data = terrain.toGeometryData();
    expect(data.positions).toHaveLength(12 * 3);
    expect(data.normals).toHaveLength(12 * 3);
    expect(data.uvs).toHaveLength(12 * 2);
    expect(data.indices).toHaveLength(12 * 3);
    expect(data.normals[1]).toBeCloseTo(1);

    const geometry = terrain.toBufferGeometry();
    expect(geometry.getAttribute("position").count).toBe(12);
    expect(geometry.index?.count).toBe(36);
    expect(geometry.boundingBox?.min.y).toBe(2);
    geometry.dispose();
  });

  it("supports snapshots for deterministic rollback", () => {
    const terrain = new Heightfield({ width: 10, depth: 10, xSegments: 2, zSegments: 2, baseHeight: 1 });
    const snapshot = terrain.clone();
    terrain.raise({ area: new CircleShape([0, 0], 10), amount: 5 });
    terrain.copyFrom(snapshot);
    expect([...terrain.heights]).toEqual([...snapshot.heights]);
  });

  it("carves a basin with an exact shoreline level and minimum depth", () => {
    const terrain = new Heightfield({
      width: 20,
      depth: 20,
      xSegments: 20,
      zSegments: 20,
      baseHeight: 10,
    });
    terrain.carveBasin({
      area: new CircleShape([0, 0], 5),
      waterLevel: 2,
      minimumDepth: 5,
      shoreWidth: 3,
    });
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(-3);
    expect(terrain.sampleHeight(5, 0)).toBeCloseTo(2);
    expect(terrain.sampleHeight(6.5, 0)).toBeGreaterThan(2);
    expect(terrain.sampleHeight(6.5, 0)).toBeLessThan(10);
    expect(terrain.sampleHeight(8, 0)).toBeCloseTo(10);
  });

  it("builds continuous deterministic terrain across independently owned tiles", () => {
    const grid = new HeightfieldGrid({
      tileSize: [10, 10],
      tiles: [2, 2],
      segmentsPerTile: [4, 4],
    });
    grid.applyNoise({ seed: 7, amplitude: 4, frequency: 0.03, octaves: 3 });
    const left = grid.tiles[0];
    const right = grid.tiles[1];
    expect(left?.getHeight(4, 2)).toBeCloseTo(right?.getHeight(0, 2) ?? Number.NaN);
    expect(grid.sampleHeight(-9, -9)).toBeTypeOf("number");
    expect(grid.sampleHeight(11, 0)).toBeUndefined();
    expect(grid.vertexCount).toBe(100);

    const snapshot = grid.clone();
    grid.raise({ area: new CircleShape([0, 0], 5), amount: 3 });
    grid.copyFrom(snapshot);
    expect(grid.sampleHeight(0, 0)).toBeCloseTo(snapshot.sampleHeight(0, 0) ?? Number.NaN);
  });

  it("projects one global raster across tiles without seams", () => {
    const grid = new HeightfieldGrid({
      tileSize: [10, 10],
      tiles: [2, 1],
      segmentsPerTile: [4, 4],
    });
    const field = createScalarRasterField(5, 3, (u, v) => u * 20 + v * 4);
    grid.applyRaster({
      field,
      bounds: { center: [0, 0], size: [20, 10] },
      mode: "set",
    });
    const left = grid.tiles[0] as Heightfield;
    const right = grid.tiles[1] as Heightfield;
    expect(grid.sampleHeight(0, 0)).toBeCloseTo(12);
    for (let z = 0; z <= left.zSegments; z += 1) {
      expect(left.getHeight(left.xSegments, z)).toBe(
        right.getHeight(0, z),
      );
    }
  });

  it("supports masked raster blending and rejects malformed fields", () => {
    const terrain = new Heightfield({ width: 10, depth: 10, xSegments: 2, zSegments: 2 });
    const height = createScalarRasterField(2, 2, () => 8);
    const mask = createScalarRasterField(2, 2, (u) => u);
    terrain.applyRaster({
      field: height,
      mask,
      bounds: { center: [0, 0], size: [10, 10] },
    });
    expect(terrain.sampleHeight(-5, 0)).toBeCloseTo(0);
    expect(terrain.sampleHeight(5, 0)).toBeCloseTo(8);
    expect(() => terrain.applyRaster({
      field: { columns: 2, rows: 2, values: [1] },
      bounds: { center: [0, 0], size: [10, 10] },
    })).toThrow(/expected 4 values/i);
  });

  it("keeps heights and lighting normals continuous after tiled smoothing", () => {
    const grid = new HeightfieldGrid({
      tileSize: [20, 20],
      tiles: [2, 1],
      segmentsPerTile: [8, 8],
    });
    grid.applyNoise({ seed: 91, amplitude: 8, frequency: 0.045, octaves: 4 });
    grid.smooth({ iterations: 2, strength: 0.7 });
    const left = grid.tiles[0] as Heightfield;
    const right = grid.tiles[1] as Heightfield;
    const leftGeometry = left.toGeometryData(grid);
    const rightGeometry = right.toGeometryData(grid);

    for (let zIndex = 0; zIndex <= left.zSegments; zIndex += 1) {
      expect(left.getHeight(left.xSegments, zIndex)).toBeCloseTo(
        right.getHeight(0, zIndex),
        7,
      );
      const leftNormalOffset = left.index(left.xSegments, zIndex) * 3;
      const rightNormalOffset = right.index(0, zIndex) * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        expect(leftGeometry.normals[leftNormalOffset + axis]).toBeCloseTo(
          rightGeometry.normals[rightNormalOffset + axis] ?? Number.NaN,
          7,
        );
      }
    }
  });

  it("reports local slope in the same degrees used by humanoid traversal", () => {
    const terrain = new Heightfield({
      width: 2,
      depth: 2,
      xSegments: 1,
      zSegments: 1,
    });
    terrain.setHeight(0, 0, 0).setHeight(1, 0, 2).setHeight(0, 1, 0).setHeight(1, 1, 2);

    expect(sampleTerrainSlopeDegrees(terrain, 0, 0, 0.5)).toBeCloseTo(45, 5);
  });
});
