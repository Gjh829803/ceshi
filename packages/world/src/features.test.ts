import { describe, expect, it } from "vitest";

import { FeatureRegistry, defineWorldFeature } from "./features";
import {
  CompoundLandmarkFeature,
  LakeFeature,
  RollingTerrainFeature,
  TiledRollingTerrainFeature,
} from "./official-features";
import { Heightfield, HeightfieldGrid } from "./terrain";
import type { WaterSurfaceDescriptor } from "./surfaces";

describe("FeatureRegistry", () => {
  it("tracks definition, source, parameters, deterministic seed, outputs, and ownership", () => {
    const registry = new FeatureRegistry();
    const inspection = registry.instantiate(RollingTerrainFeature, {
      id: "main-terrain",
      seed: "world-seed",
      source: "game/features/terrain.ts",
      params: {
        size: [200, 150],
        segments: [16, 12],
        amplitude: 12,
        frequency: 0.02,
        semantic: "grassland",
      },
    });

    expect(inspection.status).toBe("built");
    expect(inspection.type).toBe("official.rolling-terrain");
    expect(inspection.source).toBe("game/features/terrain.ts");
    expect(inspection.sourceHash).toMatch(/^[0-9a-f]{8}$/);
    expect(inspection.resourceIds).toHaveLength(3);
    expect(inspection.usage.vertices).toBe(17 * 13);
    expect(inspection.usage.triangles).toBe(16 * 12 * 2);
    expect(registry.listResources("main-terrain").every((resource) => resource.ownerFeatureId === "main-terrain")).toBe(true);
    expect(inspection.output?.terrainId).toBe("main-terrain:terrain:1");
  });

  it("builds dependent lake features and restores terrain when they are removed", () => {
    const registry = new FeatureRegistry();
    const terrain = registry.instantiate(RollingTerrainFeature, {
      id: "terrain",
      seed: 99,
      params: {
        size: [100, 100],
        segments: [20, 20],
        amplitude: 0,
        frequency: 0.02,
        baseHeight: 10,
      },
    });
    const terrainId = terrain.output?.terrainId;
    expect(terrainId).toBeDefined();
    if (!terrainId) throw new Error("Missing terrain id");

    const baseline = registry.getResource<Heightfield>(terrainId)?.value.sampleHeight(0, 0);
    const lake = registry.instantiate(LakeFeature, {
      id: "central-lake",
      seed: 7,
      dependsOn: ["terrain"],
      params: {
        terrainId,
        center: [0, 0],
        radius: [20, 15],
        depth: 8,
        shoreWidth: 4,
      },
    });

    expect(lake.status).toBe("built");
    expect(lake.resourceIds).toHaveLength(3);
    expect(registry.getResource<Heightfield>(terrainId)?.value.sampleHeight(0, 0)).toBeCloseTo(0.5);
    const waterId = lake.output?.waterSurfaceId;
    expect(waterId).toBeDefined();
    expect(registry.getResource<WaterSurfaceDescriptor>(waterId ?? "")?.value).toMatchObject({
      elevation: 8.5,
      minimumDepth: 8,
      shoreWidth: 4,
    });
    expect(registry.remove("central-lake")).toBe(true);
    expect(registry.getResource<Heightfield>(terrainId)?.value.sampleHeight(0, 0)).toBeCloseTo(baseline ?? 0);
    expect(registry.listResources("central-lake")).toHaveLength(0);
  });

  it("tracks a continuous tiled terrain as one agent-owned feature", () => {
    const registry = new FeatureRegistry();
    const terrain = registry.instantiate(TiledRollingTerrainFeature, {
      id: "large-terrain",
      seed: 42,
      params: {
        tileSize: [160, 160],
        tiles: [2, 2],
        segmentsPerTile: [8, 8],
        amplitude: 5,
        frequency: 0.02,
      },
    });
    const resource = registry.getResource<HeightfieldGrid>(terrain.output?.terrainId ?? "");
    expect(terrain.status).toBe("built");
    expect(terrain.usage.colliders).toBe(4);
    expect(resource?.value.tiles).toHaveLength(4);
    expect(resource?.value.width).toBe(320);
  });

  it("updates and deterministically rebuilds feature parameters", () => {
    const registry = new FeatureRegistry();
    const initial = registry.instantiate(RollingTerrainFeature, {
      id: "terrain",
      seed: 123,
      params: {
        size: [40, 40],
        segments: [8, 8],
        amplitude: 2,
        frequency: 0.1,
      },
    });
    const terrainId = initial.output?.terrainId;
    if (!terrainId) throw new Error("Missing terrain id");
    const firstHeights = [...(registry.getResource<Heightfield>(terrainId)?.value.heights ?? [])];
    registry.rebuild("terrain");
    expect([...(registry.getResource<Heightfield>(terrainId)?.value.heights ?? [])]).toEqual(firstHeights);

    registry.update("terrain", { params: { amplitude: 8 } });
    const updatedHeights = [...(registry.getResource<Heightfield>(terrainId)?.value.heights ?? [])];
    expect(updatedHeights).not.toEqual(firstHeights);
    expect(registry.inspect("terrain").params).toMatchObject({ amplitude: 8 });
  });

  it("rolls back shared terrain mutations when a dependent feature fails", () => {
    const registry = new FeatureRegistry();
    const terrain = registry.instantiate(RollingTerrainFeature, {
      id: "terrain",
      params: {
        size: [20, 20],
        segments: [4, 4],
        amplitude: 0,
        frequency: 0.1,
        baseHeight: 5,
      },
    });
    const terrainId = terrain.output?.terrainId;
    if (!terrainId) throw new Error("Missing terrain id");

    const BrokenLake = defineWorldFeature<{ terrainId: string }, void>({
      type: "test.broken-lake",
      version: 1,
      schema: { terrainId: "string" },
      build(context, params) {
        context.terrain.lower(params.terrainId, {
          area: context.shape.circle([0, 0], 8),
          amount: 4,
        });
        throw new Error("intentional build failure");
      },
    });
    const broken = registry.instantiate(BrokenLake, {
      id: "broken",
      dependsOn: ["terrain"],
      params: { terrainId },
    });
    expect(broken.status).toBe("failed");
    expect(broken.diagnostics.some((diagnostic) => diagnostic.code === "FEATURE_BUILD_FAILED")).toBe(true);
    expect(registry.getResource<Heightfield>(terrainId)?.value.sampleHeight(0, 0)).toBeCloseTo(5);
    expect(registry.listResources("broken")).toHaveLength(0);
  });

  it("enforces hard resource budgets and returns actionable diagnostics", () => {
    const registry = new FeatureRegistry({ budget: { maxVertices: 50 } });
    const feature = registry.instantiate(RollingTerrainFeature, {
      id: "too-dense",
      params: {
        size: [100, 100],
        segments: [10, 10],
        amplitude: 1,
        frequency: 0.1,
      },
    });
    expect(feature.status).toBe("failed");
    expect(feature.resourceIds).toHaveLength(0);
    expect(feature.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "FEATURE_BUDGET_VERTICES",
          suggestions: expect.arrayContaining([expect.stringMatching(/terrain resolution/i)]),
        }),
      ]),
    );
  });

  it("diagnoses missing dependencies and invalid parameters without executing", () => {
    const registry = new FeatureRegistry();
    const feature = registry.instantiate(LakeFeature, {
      id: "orphan-lake",
      dependsOn: ["missing-terrain"],
      params: {
        terrainId: "nothing",
        center: [0, 0],
        radius: [-1, 4],
        depth: 2,
      },
    });
    expect(feature.status).toBe("failed");
    expect(feature.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["FEATURE_DEPENDENCY_MISSING", "FEATURE_PARAMETER_CUSTOM"]),
    );
  });

  it("supports agent-defined features using only the tracked context", () => {
    const VolcanoFeature = defineWorldFeature<
      { size: number; height: number },
      { terrainId: string; conePatchId: string; craterPatchId: string }
    >({
      type: "custom.volcano",
      version: 1,
      source: "game/features/volcano.ts",
      schema: {
        size: "positiveNumber",
        height: "positiveNumber",
      },
      build(context, params) {
        const terrainId = context.terrain.create({
          width: params.size * 3,
          depth: params.size * 3,
          xSegments: 16,
          zSegments: 16,
        });
        const conePatchId = context.terrain.raise(terrainId, {
          area: context.shape.circle([0, 0], params.size),
          amount: params.height,
          falloffWidth: params.size,
          curve: "linear",
        });
        const craterPatchId = context.terrain.lower(terrainId, {
          area: context.shape.circle([0, 0], params.size * 0.2),
          amount: params.height * 0.4,
          falloffWidth: params.size * 0.2,
        });
        context.semantic.bind(terrainId, { semantic: "volcano" });
        return { terrainId, conePatchId, craterPatchId };
      },
    });

    const registry = new FeatureRegistry();
    const volcano = registry.instantiate(VolcanoFeature, {
      id: "north-volcano",
      seed: 88,
      params: { size: 50, height: 30 },
    });
    expect(volcano.status).toBe("built");
    expect(volcano.resourceIds).toHaveLength(4);
    expect(volcano.output?.terrainId).toBe("north-volcano:terrain:1");
    expect(registry.getResource(volcano.output?.terrainId ?? "")?.ownerFeatureId).toBe("north-volcano");
  });

  it("tracks agent-authored raster terrain and semantic mask layers", () => {
    const RasterFeature = defineWorldFeature<{}, { terrainId: string }>({
      type: "test.raster-terrain",
      version: 1,
      schema: {},
      build(context) {
        const terrainId = context.terrain.create({
          width: 20,
          depth: 20,
          xSegments: 4,
          zSegments: 4,
        });
        const field = {
          columns: 2,
          rows: 2,
          values: [0, 2, 4, 6],
        } as const;
        context.terrain.raster(terrainId, {
          field,
          bounds: { center: [0, 0], size: [20, 20] },
        });
        context.semantic.terrainLayer(terrainId, {
          id: "grass",
          semantic: "grassland",
          color: "#88AA77",
          field: { columns: 2, rows: 2, values: [1, 1, 1, 1] },
          bounds: { center: [0, 0], size: [20, 20] },
          priority: 1,
        });
        return { terrainId };
      },
    });
    const registry = new FeatureRegistry();
    const feature = registry.instantiate(RasterFeature, { id: "raster", params: {} });
    expect(feature.status).toBe("built");
    expect(registry.listResources("raster").map((resource) => resource.kind)).toEqual([
      "terrain",
      "terrainPatch",
      "semantic",
    ]);
    expect(registry.getResource<Heightfield>(feature.output?.terrainId ?? "")?.value.sampleHeight(0, 0)).toBeCloseTo(3);
  });

  it("builds compound landmark descriptions as a tracked official feature", () => {
    const registry = new FeatureRegistry();
    const tower = registry.instantiate(CompoundLandmarkFeature, {
      id: "tower",
      params: {
        semantic: "distant_stone_tower",
        children: [
          { kind: "cylinder", radius: 5, height: 30 },
          { kind: "cone", radius: 7, height: 8, transform: { position: [0, 19, 0] } },
        ],
      },
    });
    expect(tower.status).toBe("built");
    expect(tower.usage.colliders).toBe(2);
    expect(tower.resourceIds).toHaveLength(2);
  });
});
