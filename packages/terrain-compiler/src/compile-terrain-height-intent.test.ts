import type { AuthoringSpecV4 } from "@whitebox-world/authoring";
import { sha256CanonicalJson, stringifyCanonicalJson } from "@whitebox-world/protocol";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  compileTerrainHeightIntent,
  TERRAIN_HEIGHT_INTENT_NORMALIZATION_PROFILE,
} from "./compile-terrain-height-intent";

function focusedCompileSpec(): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
  return {
    ...source,
    world: {
      ...source.world,
      bounds: {
        centerMetersXZ: [0, 0] as const,
        sizeMetersXZ: [4, 4] as const,
        heightRangeMeters: [-4, 8] as const,
      },
    },
    spatial: {
      ...source.spatial,
      regions: [{
        id: "spawn-region",
        kind: "polygon-xz" as const,
        pointsMetersXZ: [[-1.5, 1], [-0.5, 1], [-0.5, 2], [-1.5, 2]] as const,
        semanticClassId: "region.spawn",
      }],
      routes: [{
        id: "main-route",
        kind: "polyline-xz" as const,
        pointsMetersXZ: [[-1, 1.5], [1, 1.5]] as const,
        widthMeters: 0.5,
        locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      }],
    },
    resources: {
      ...source.resources,
      prototypes: [{
        id: "wall",
        version: 1 as const,
        kind: "primitive" as const,
        primitive: "box" as const,
        sizeMetersXYZ: [0.5, 1, 0.5] as const,
        collisionEnabled: true,
        semantic: { classId: "landmark.marker" },
      }],
    },
    nodes: source.nodes.map((node) => {
      if (node.kind === "terrain") {
        return {
          ...node,
          components: {
            terrain: {
              ...node.components.terrain,
              source: { ...node.components.terrain.source, baseHeightMeters: 0 },
              grid: {
                centerMetersXZ: [0, 0] as const,
                sizeMetersXZ: [4, 4] as const,
                resolutionCellsXZ: [5, 5] as const,
              },
            },
          },
        };
      }
      if (node.kind === "water") {
        return {
          ...node,
          components: {
            water: {
              ...node.components.water,
              boundary: {
                kind: "circle" as const,
                centerMetersXZ: [0, -1] as const,
                radiusMeters: 0.5,
              },
              waterLevelMeters: 0,
              depthMeters: 1,
              shoreWidthMeters: 0,
            },
          },
        };
      }
      if (node.kind === "object") {
        return {
          ...node,
          placement: {
            kind: "fixed" as const,
            transform: { positionMetersXYZ: [1, 0, 1.5] as const },
          },
        };
      }
      if (node.kind === "anchor" && node.id === "spawn-main") {
        return {
          ...node,
          placement: {
            kind: "fixed" as const,
            transform: { positionMetersXYZ: [-1, 0, 1.5] as const },
          },
        };
      }
      return node;
    }),
    constraints: {
      connectivity: [],
      placements: [
        {
          id: "spawn-inside",
          kind: "inside-region" as const,
          requirement: "required" as const,
          entityId: "spawn-main",
          regionId: "spawn-region",
          boundaryClearanceMeters: 0,
        },
        {
          id: "landmark-supported",
          kind: "supported-by" as const,
          requirement: "required" as const,
          supportedEntityId: "wall-east",
          supportingEntityId: "terrain-main",
          maximumSupportGapMeters: 0,
          minimumSupportRatio: 1,
        },
        {
          id: "route-slope",
          kind: "within-slope-limit" as const,
          requirement: "required" as const,
          routeId: "main-route",
          terrainEntityId: "terrain-main",
          maximumSlopeDegrees: 35,
        },
      ],
    },
  };
}

async function neutralIntentPng(): Promise<Uint8Array> {
  return sharp(new Uint8Array(9 * 9 * 3).fill(128), {
    raw: { width: 9, height: 9, channels: 3 },
  }).png().toBuffer();
}

async function globallyHighVariedIntentPng(): Promise<Uint8Array> {
  const bytes = new Uint8Array(9 * 9 * 3);
  const colors = [
    [152, 120, 104],
    [176, 112, 80],
    [200, 104, 56],
  ] as const;
  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      const color = colors[Math.floor(column / 3)]!;
      const offset = (row * 9 + column) * 3;
      bytes[offset] = color[0];
      bytes[offset + 1] = color[1];
      bytes[offset + 2] = color[2];
    }
  }
  return sharp(bytes, {
    raw: { width: 9, height: 9, channels: 3 },
  }).png().toBuffer();
}

describe("compileTerrainHeightIntent", () => {
  it("compiles a deterministic metric heightfield into a copy of AuthoringSpec V4", async () => {
    const authoringSpec = focusedCompileSpec();
    const inputBefore = stringifyCanonicalJson(authoringSpec);
    const sourcePngBytes = await neutralIntentPng();

    const first = await compileTerrainHeightIntent({ sourcePngBytes, authoringSpec });
    const second = await compileTerrainHeightIntent({ sourcePngBytes, authoringSpec });

    expect(first).toEqual(second);
    expect(first.report).toMatchObject({
      kind: "worldkit-terrain-height-intent-compile-report",
      schemaVersion: 1,
      status: "passed",
      terrainEntityId: "terrain-main",
      sourcePngHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      canonicalRgbHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      inputAuthoringSpecHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      outputAuthoringSpecHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      projection: {
        minimumHeightRatio: 0,
        medianHeightRatio: 0,
        maximumHeightRatio: 0,
        meanRampResidualRgbUnits: 0,
        p95RampResidualRgbUnits: 0,
        meanNeighborDeltaRatio: 0,
        p95NeighborDeltaRatio: 0,
      },
      prefilter: {
        kind: "separable-box",
        radiusPixelsXY: [1, 1],
      },
      normalization: {
        profileId: TERRAIN_HEIGHT_INTENT_NORMALIZATION_PROFILE,
        medianHeightRatioBefore: 0,
        heightRatioOffsetApplied: 0,
        inputRange: [0, 0],
        outputRange: [0, 0],
        clampedSampleCount: 0,
      },
      diagnostics: [],
    });
    const terrain = first.compiledAuthoringSpec?.nodes.find((node) => node.kind === "terrain");
    if (terrain?.kind !== "terrain") throw new Error("TEST_COMPILED_TERRAIN_MISSING");
    expect(terrain.components.terrain.grid.heightSamplesMeters).toHaveLength(25);
    expect(terrain.components.terrain.grid.heightSamplesMeters?.every(Number.isFinite)).toBe(true);
    expect(first.compiledAuthoringSpec).not.toBe(authoringSpec);
    expect(first.report.outputAuthoringSpecHash).toBe(
      sha256CanonicalJson(first.compiledAuthoringSpec),
    );
    expect(stringifyCanonicalJson(authoringSpec)).toBe(inputBefore);
  });

  it("records compact base quantization only above the large-grid threshold", async () => {
    const authoringSpec = focusedCompileSpec();
    const terrain = authoringSpec.nodes.find((node) => node.kind === "terrain");
    if (terrain?.kind !== "terrain") throw new Error("TEST_TERRAIN_MISSING");
    terrain.components.terrain.grid.resolutionCellsXZ = [401, 301];
    terrain.components.terrain.grid.sizeMetersXZ = [1000, 750];
    authoringSpec.world.bounds.sizeMetersXZ = [1000, 750];
    authoringSpec.world.resourceBudget.maxVertices = 130_000;
    authoringSpec.world.resourceBudget.maxTriangles = 250_000;

    const result = await compileTerrainHeightIntent({
      sourcePngBytes: await neutralIntentPng(),
      authoringSpec,
    });

    expect(result.report.status).toBe("passed");
    expect(result.report.baseSampleQuantization).toEqual({
      quantumMeters: 0.1,
      quantizedSampleCount: expect.any(Number),
      protectedSampleCount: expect.any(Number),
    });
    expect(
      result.report.baseSampleQuantization!.quantizedSampleCount +
      result.report.baseSampleQuantization!.protectedSampleCount,
    ).toBe(401 * 301);
  });

  it("omits compiled output when Authoring evidence produces a blocking diagnostic", async () => {
    const authoringSpec = focusedCompileSpec();
    const terrain = authoringSpec.nodes.find((node) => node.kind === "terrain");
    if (terrain?.kind !== "terrain") throw new Error("TEST_TERRAIN_MISSING");
    delete terrain.components.terrain.source.baseHeightMeters;

    const result = await compileTerrainHeightIntent({
      sourcePngBytes: await neutralIntentPng(),
      authoringSpec,
    });

    expect(result.report.status).toBe("failed");
    expect(result.report.outputAuthoringSpecHash).toBeUndefined();
    expect(result.compiledAuthoringSpec).toBeUndefined();
    expect(result.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "blocking",
        code: "TERRAIN_INTENT_BASE_HEIGHT_REQUIRED",
      }),
    ]));
  });

  it("omits compiled output when a constraint escapes world.bounds.heightRangeMeters", async () => {
    const authoringSpec = focusedCompileSpec();
    const water = authoringSpec.nodes.find((node) => node.kind === "water");
    if (water?.kind !== "water") throw new Error("TEST_WATER_MISSING");
    water.components.water.waterLevelMeters = -3;
    water.components.water.depthMeters = 100;

    const result = await compileTerrainHeightIntent({
      sourcePngBytes: await neutralIntentPng(),
      authoringSpec,
    });

    expect(result.report.status).toBe("failed");
    expect(result.report.outputAuthoringSpecHash).toBeUndefined();
    expect(result.compiledAuthoringSpec).toBeUndefined();
    expect(result.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "blocking",
        code: "TERRAIN_INTENT_HEIGHT_RANGE_EXCEEDED",
      }),
    ]));
  });

  it("centers a globally high generated raster around the Builder datum", async () => {
    const authoringSpec = focusedCompileSpec();
    authoringSpec.spatial.routes = [];
    authoringSpec.constraints.placements = authoringSpec.constraints.placements.filter(
      ({ kind }) => kind !== "within-slope-limit",
    );
    const result = await compileTerrainHeightIntent({
      sourcePngBytes: await globallyHighVariedIntentPng(),
      authoringSpec,
    });

    expect(
      result.report.status,
      JSON.stringify(result.report.diagnostics),
    ).toBe("passed");
    expect(result.report).toMatchObject({
      kind: "worldkit-terrain-height-intent-compile-report",
      schemaVersion: 1,
      status: "passed",
      normalization: {
        profileId: TERRAIN_HEIGHT_INTENT_NORMALIZATION_PROFILE,
        medianHeightRatioBefore: 0.5,
        heightRatioOffsetApplied: -0.5,
        inputRange: [0.25, 0.75],
        outputRange: [-0.25, 0.25],
        clampedSampleCount: 0,
      },
    });
  });

});
