import { describe, expect, it } from "vitest";
import { sampleTriangleHeightfieldSurface } from "@whitebox-world/terrain-surface";

import { applyTerrainConstraintsV0 } from "./apply-terrain-constraints";
import type { TerrainConstraintV0 } from "./terrain-constraint-types";

function sampleAt(
  values: Float32Array,
  columns: number,
  column: number,
  row: number,
): number {
  return values[row * columns + column]!;
}

describe("applyTerrainConstraintsV0", () => {
  it("applies stable Water > Spawn > Landmark > Route priority on an asymmetric grid", () => {
    const columns = 7;
    const rows = 5;
    const heightSamplesMeters = new Float32Array(
      Array.from({ length: rows }, () =>
        Array.from({ length: columns }, (_, column) => column + 7),
      ).flat(),
    );
    const before = Array.from(heightSamplesMeters);
    const constraints: TerrainConstraintV0[] = [
      {
        id: "route-main",
        kind: "route-slope",
        pointsMetersXZ: [[-3, 0], [3, 0]],
        widthMeters: 2,
        maximumSlopeDegrees: 0,
      },
      {
        id: "support-east",
        kind: "flatten-footprint",
        centerMetersXZ: [2, 0],
        sizeMetersXZ: [2, 2],
        falloffWidthMeters: 0,
        role: "landmark-support",
      },
      {
        id: "spawn-safe",
        kind: "flatten-region",
        pointsMetersXZ: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
        targetHeightMeters: 5,
        falloffWidthMeters: 0,
        role: "spawn",
      },
      {
        id: "water-center",
        kind: "water-basin",
        boundary: { kind: "circle", centerMetersXZ: [0, 0], radiusMeters: 1 },
        waterLevelMeters: 0,
        depthMeters: 2,
        shoreWidthMeters: 0,
      },
    ];

    const forward = applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [6, 4],
      heightRangeMeters: [-20, 20],
      resolutionVerticesXZ: [columns, rows],
      heightSamplesMeters,
      constraints,
    });
    const reversed = applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [6, 4],
      heightRangeMeters: [-20, 20],
      resolutionVerticesXZ: [columns, rows],
      heightSamplesMeters,
      constraints: [...constraints].reverse(),
    });

    expect(sampleAt(forward.heightSamplesMeters, columns, 3, 2)).toBe(-2);
    expect(sampleAt(forward.heightSamplesMeters, columns, 4, 3)).toBe(5);
    expect(sampleAt(forward.heightSamplesMeters, columns, 5, 3)).toBe(12);
    expect(sampleAt(forward.heightSamplesMeters, columns, 1, 2)).toBe(7);
    expect(sampleAt(forward.heightSamplesMeters, columns, 0, 4)).toBe(7);
    expect(forward.deltas.map((delta) => delta.constraintId)).toEqual([
      "water-center",
      "spawn-safe",
      "support-east",
      "route-main",
    ]);
    expect(forward.deltas.every((delta) => delta.changedSampleCount > 0)).toBe(true);
    expect(forward.protectedSampleMask.some((value) => value === 1)).toBe(true);
    expect(forward).toEqual(reversed);
    expect(Array.from(heightSamplesMeters)).toEqual(before);
  });

  it.each([
    {
      name: "circle",
      constraint: {
        id: "water",
        kind: "water-basin",
        boundary: { kind: "circle", centerMetersXZ: [0, 0], radiusMeters: 1 },
        waterLevelMeters: 1,
        depthMeters: 3,
        shoreWidthMeters: 0,
      } as const,
      sample: [0, 0] as const,
    },
    {
      name: "ellipse",
      constraint: {
        id: "water",
        kind: "water-basin",
        boundary: { kind: "ellipse", centerMetersXZ: [0, 0], radiusMetersXZ: [2, 1] },
        waterLevelMeters: 1,
        depthMeters: 3,
        shoreWidthMeters: 0,
      } as const,
      sample: [1, 0] as const,
    },
    {
      name: "polygon",
      constraint: {
        id: "water",
        kind: "water-basin",
        boundary: {
          kind: "polygon",
          pointsMetersXZ: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
        },
        waterLevelMeters: 1,
        depthMeters: 3,
        shoreWidthMeters: 0,
      } as const,
      sample: [0, 1] as const,
    },
  ])("rasterizes $name Water boundaries", ({ constraint, sample }) => {
    const result = applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [4, 4],
      heightRangeMeters: [-20, 20],
      resolutionVerticesXZ: [5, 5],
      heightSamplesMeters: new Float32Array(25).fill(10),
      constraints: [constraint],
    });
    const column = sample[0] + 2;
    const row = sample[1] + 2;
    expect(sampleAt(result.heightSamplesMeters, 5, column, row)).toBe(-2);
  });

  it("flattens a landmark footprint plus one-cell surface guard at the world edge", () => {
    const values = new Float32Array([
      0, 1, 2,
      3, 4, 5,
      6, 7, 8,
    ]);
    const result = applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [2, 2],
      heightRangeMeters: [-20, 20],
      resolutionVerticesXZ: [3, 3],
      heightSamplesMeters: values,
      constraints: [{
        id: "edge-support",
        kind: "flatten-footprint",
        centerMetersXZ: [1, 1],
        sizeMetersXZ: [2, 2],
        falloffWidthMeters: 0,
        role: "landmark-support",
      }],
    });

    expect(Array.from(result.heightSamplesMeters)).toEqual([
      8, 8, 8,
      8, 8, 8,
      8, 8, 8,
    ]);
  });

  it("keeps a one-cell guard band outside the Route width for edge-triangle slope checks", () => {
    const heightSamplesMeters = new Float32Array([
      8, 8, 8, 8, 8,
      4, 4, 4, 4, 4,
      0, 0, 0, 0, 0,
      4, 4, 4, 4, 4,
      8, 8, 8, 8, 8,
    ]);

    const result = applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [4, 4],
      heightRangeMeters: [-20, 20],
      resolutionVerticesXZ: [5, 5],
      heightSamplesMeters,
      constraints: [{
        id: "cross-slope-route",
        kind: "route-slope",
        pointsMetersXZ: [[-2, 0], [2, 0]],
        widthMeters: 1,
        maximumSlopeDegrees: 45,
      }],
    });

    expect(result.diagnostics).toEqual([]);
    expect(sampleAt(result.heightSamplesMeters, 5, 2, 3)).toBe(0);
  });

  it("projects a Route guard-band sample to the nearest segment instead of an envelope midpoint", () => {
    const heightSamplesMeters = new Float32Array(
      [0, 0, 0, 0, 2, 2, 2].flatMap((height) => Array(7).fill(height)),
    );

    const result = applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [6, 6],
      heightRangeMeters: [-20, 20],
      resolutionVerticesXZ: [7, 7],
      heightSamplesMeters,
      constraints: [{
        id: "segmented-route",
        kind: "route-slope",
        pointsMetersXZ: [[0, -2], [0, 0], [0, 2]],
        widthMeters: 1,
        maximumSlopeDegrees: 45,
      }],
    });

    expect(result.diagnostics).toEqual([]);
    expect(sampleAt(result.heightSamplesMeters, 7, 4, 4)).toBeCloseTo(1, 6);
  });

  it("smooths a bent Route deterministically and validates its full declared width", () => {
    const heightSamplesMeters = new Float32Array(
      Array.from({ length: 7 }, () =>
        Array.from({ length: 7 }, (_, column) => (column - 3) * 0.8),
      ).flat(),
    );
    const input = {
      centerMetersXZ: [0, 0] as const,
      sizeMetersXZ: [6, 6] as const,
      heightRangeMeters: [-20, 20] as const,
      resolutionVerticesXZ: [7, 7] as const,
      heightSamplesMeters,
      constraints: [{
        id: "bent-route",
        kind: "route-slope" as const,
        pointsMetersXZ: [[-2, -2], [-2, 2], [2, 2]] as const,
        widthMeters: 1,
        maximumSlopeDegrees: 45,
      }],
    };

    const first = applyTerrainConstraintsV0(input);
    const second = applyTerrainConstraintsV0(input);

    expect(first).toEqual(second);
    expect(first.deltas[0]?.changedSampleCount).toBeGreaterThan(0);
    expect(first.diagnostics).toEqual([]);
  });

  it("reports the steepest triangle sampled across a bent Route width", () => {
    const heightSamplesMeters = new Float32Array(
      Array.from({ length: 7 }, () =>
        Array.from({ length: 7 }, (_, column) => (column - 3) * 2),
      ).flat(),
    );
    const result = applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [6, 6],
      heightRangeMeters: [-20, 20],
      resolutionVerticesXZ: [7, 7],
      heightSamplesMeters,
      constraints: [{
        id: "steep-bent-route",
        kind: "route-slope",
        pointsMetersXZ: [[-2, -2], [-2, 2], [2, 2]],
        widthMeters: 1,
        maximumSlopeDegrees: 45,
      }],
    });

    const diagnostic = result.diagnostics.find(
      (candidate) => candidate.code === "TERRAIN_INTENT_ROUTE_SLOPE_UNSATISFIED",
    );
    expect(diagnostic?.details?.measuredMaximumSlopeDegrees).toBeGreaterThan(45.25);
  });

  it("reports a blocking diagnostic when higher-priority Water makes Route slope impossible", () => {
    const result = applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [4, 2],
      heightRangeMeters: [-20, 20],
      resolutionVerticesXZ: [5, 3],
      heightSamplesMeters: new Float32Array(15),
      constraints: [
        {
          id: "locked-basin",
          kind: "water-basin",
          boundary: { kind: "circle", centerMetersXZ: [0, 0], radiusMeters: 0.25 },
          waterLevelMeters: -9,
          depthMeters: 1,
          shoreWidthMeters: 0,
        },
        {
          id: "crossing-route",
          kind: "route-slope",
          pointsMetersXZ: [[-2, 0], [2, 0]],
          widthMeters: 1,
          maximumSlopeDegrees: 1,
        },
      ],
    });

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "blocking",
        code: "TERRAIN_INTENT_ROUTE_SLOPE_UNSATISFIED",
      }),
    ]));
  });

  it("revalidates every Route against the final raster after equal-priority overlaps", () => {
    const result = applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [4, 4],
      heightRangeMeters: [-20, 20],
      resolutionVerticesXZ: [5, 5],
      heightSamplesMeters: new Float32Array(
        [-10, -5, 0, 5, 10].flatMap((height) => Array(5).fill(height)),
      ),
      constraints: [
        {
          id: "a-horizontal-flat",
          kind: "route-slope",
          pointsMetersXZ: [[-2, 0], [2, 0]],
          widthMeters: 1,
          maximumSlopeDegrees: 0,
        },
        {
          id: "b-vertical-flat",
          kind: "route-slope",
          pointsMetersXZ: [[0, -2], [0, 2]],
          widthMeters: 1,
          maximumSlopeDegrees: 0,
        },
      ],
    });

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "blocking",
        code: "TERRAIN_INTENT_ROUTE_SLOPE_UNSATISFIED",
        instancePath: "/constraints/a-horizontal-flat",
      }),
    ]));
  });

  it("conservatively rasterizes a required Spawn region smaller than one grid cell", () => {
    const result = applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [2, 2],
      heightRangeMeters: [-10, 10],
      resolutionVerticesXZ: [3, 3],
      heightSamplesMeters: new Float32Array(9),
      constraints: [{
        id: "tiny-spawn",
        kind: "flatten-region",
        pointsMetersXZ: [[0.15, 0.15], [0.25, 0.15], [0.25, 0.25], [0.15, 0.25]],
        targetHeightMeters: 5,
        falloffWidthMeters: 0,
        role: "spawn",
      }],
    });
    const spawnSurface = sampleTriangleHeightfieldSurface({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [2, 2],
      resolutionVerticesXZ: [3, 3],
      heightSamplesMeters: result.heightSamplesMeters,
    }, [0.2, 0.2]);

    expect(result.deltas[0]?.changedSampleCount).toBeGreaterThan(0);
    expect(spawnSurface?.heightMeters).toBeCloseTo(5, 6);
  });

  it("conservatively rasterizes a Water body smaller than one grid cell", () => {
    const result = applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [2, 2],
      heightRangeMeters: [-10, 10],
      resolutionVerticesXZ: [3, 3],
      heightSamplesMeters: new Float32Array(9),
      constraints: [{
        id: "tiny-water",
        kind: "water-basin",
        boundary: { kind: "circle", centerMetersXZ: [0.2, 0.2], radiusMeters: 0.05 },
        waterLevelMeters: 0,
        depthMeters: 2,
        shoreWidthMeters: 0,
      }],
    });
    const waterSurface = sampleTriangleHeightfieldSurface({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [2, 2],
      resolutionVerticesXZ: [3, 3],
      heightSamplesMeters: result.heightSamplesMeters,
    }, [0.2, 0.2]);

    expect(result.deltas[0]?.changedSampleCount).toBeGreaterThan(0);
    expect(waterSurface?.heightMeters).toBeCloseTo(-2, 6);
  });

  it("fails closed when a constraint writes outside the world height range", () => {
    const result = applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [2, 2],
      heightRangeMeters: [-10, 10],
      resolutionVerticesXZ: [3, 3],
      heightSamplesMeters: new Float32Array(9),
      constraints: [{
        id: "out-of-range-water",
        kind: "water-basin",
        boundary: { kind: "circle", centerMetersXZ: [0, 0], radiusMeters: 0.5 },
        waterLevelMeters: -9,
        depthMeters: 100,
        shoreWidthMeters: 0,
      }],
    });

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "blocking",
        code: "TERRAIN_INTENT_HEIGHT_RANGE_EXCEEDED",
        instancePath: "/heightSamplesMeters",
      }),
    ]));
  });

  it("rejects invalid grids and non-finite constraint edits", () => {
    expect(() => applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [2, 2],
      heightRangeMeters: [-20, 20],
      resolutionVerticesXZ: [2, 2],
      heightSamplesMeters: new Float32Array([0, 1, 2]),
      constraints: [],
    })).toThrow("sample count");
    expect(() => applyTerrainConstraintsV0({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [2, 2],
      heightRangeMeters: [-20, 20],
      resolutionVerticesXZ: [2, 2],
      heightSamplesMeters: new Float32Array([0, 1, 2, 3]),
      constraints: [{
        id: "invalid-spawn",
        kind: "flatten-region",
        pointsMetersXZ: [[-1, -1], [1, -1], [0, 1]],
        targetHeightMeters: Number.NaN,
        falloffWidthMeters: 0,
        role: "spawn",
      }],
    })).toThrow("finite");
  });
});
