import { describe, expect, it, vi } from "vitest";

import {
  assertTraversalGraphBuildBudgetV1,
  estimateHeightfieldTileCountV1,
  quantizeTraversalMetersToMicrometersV1,
} from "./index.js";

describe("Heightfield traversal tile budget", () => {
  it("normalizes decimal meter values without exact-multiple drift", () => {
    expect(quantizeTraversalMetersToMicrometersV1(0.3)).toBe(300000);
    expect(quantizeTraversalMetersToMicrometersV1(0.299)).toBe(299000);
    expect(quantizeTraversalMetersToMicrometersV1(2.4)).toBe(2400000);
  });

  it("estimates exact and partial tiles for the one-layer R1 Heightfield", () => {
    expect(estimateHeightfieldTileCountV1({
      widthMeters: 19.2,
      depthMeters: 9.6,
      tileSizeCells: 64,
      voxelCellSizeMeters: 0.15,
    })).toEqual({ tilesX: 2, tilesZ: 1, estimatedTiles: 2 });
    expect(estimateHeightfieldTileCountV1({
      widthMeters: 19.201,
      depthMeters: 9.601,
      tileSizeCells: 64,
      voxelCellSizeMeters: 0.15,
    })).toEqual({ tilesX: 3, tilesZ: 2, estimatedTiles: 6 });
  });

  it("fails closed before a provider callback can run", () => {
    const provider = vi.fn();

    expect(() => {
      assertTraversalGraphBuildBudgetV1({
        widthMeters: 19.201,
        depthMeters: 9.601,
        tileSizeCells: 64,
        voxelCellSizeMeters: 0.15,
        maximumTiles: 5,
      });
      provider();
    }).toThrow("ROUTE_GRAPH_BUDGET_EXCEEDED");
    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects non-finite, non-positive, and overflowing estimates", () => {
    for (const input of [
      {
        widthMeters: Number.NaN,
        depthMeters: 1,
        tileSizeCells: 64,
        voxelCellSizeMeters: 0.15,
      },
      {
        widthMeters: 1,
        depthMeters: 0,
        tileSizeCells: 64,
        voxelCellSizeMeters: 0.15,
      },
      {
        widthMeters: 1,
        depthMeters: 1,
        tileSizeCells: 1.5,
        voxelCellSizeMeters: 0.15,
      },
      {
        widthMeters: Number.MAX_SAFE_INTEGER,
        depthMeters: Number.MAX_SAFE_INTEGER,
        tileSizeCells: 1,
        voxelCellSizeMeters: 0.001,
      },
    ]) {
      expect(() => estimateHeightfieldTileCountV1(input)).toThrow(
        "TRAVERSAL_GRAPH_BUILD_BUDGET_INVALID",
      );
    }
  });
});
