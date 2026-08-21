import { describe, expect, it } from "vitest";

import { defineWorldFeature } from "./features";
import { compileOutdoorScene, defineOutdoorScene, SceneCompilationError } from "./scene";
import { Heightfield, HeightfieldGrid } from "./terrain";

describe("outdoor scene authoring", () => {
  it("samples the canonical rendered triangle across an asymmetric saddle cell", () => {
    const terrain = new Heightfield({
      width: 2,
      depth: 2,
      xSegments: 1,
      zSegments: 1,
    });
    terrain.heights.set([0, 2, 4, 0]);

    expect(terrain.sampleHeight(0, 0)).toBe(3);
  });

  it("uses explicit relief profiles instead of applying strong noise to every world", () => {
    const makeScene = (relief: "flat" | "plain" | "hills") => defineOutdoorScene({
      id: `relief-${relief}`,
      seed: 42,
      build(world) {
        const terrain = world.terrain.landscape({
          id: "terrain",
          tileSize: [80, 80],
          tiles: [1, 1],
          segmentsPerTile: [32, 32],
          relief,
        });
        world.player.spawn({ terrain, at: [0, 0] });
      },
    });
    const heightRange = (relief: "flat" | "plain" | "hills") => {
      const compiled = compileOutdoorScene(makeScene(relief));
      const resource = compiled.registry.getResource<HeightfieldGrid>(
        compiled.terrainHandles[0]?.terrainId ?? "",
      );
      const heights = resource?.value.tiles.flatMap((tile) => [...tile.heights]) ?? [];
      return Math.max(...heights) - Math.min(...heights);
    };

    expect(heightRange("flat")).toBe(0);
    expect(heightRange("plain")).toBeGreaterThan(0);
    expect(heightRange("hills")).toBeGreaterThan(heightRange("plain"));
  });

  it("lets an agent compose a tracked playable scene without touching runtime internals", () => {
    const scene = defineOutdoorScene({
      id: "agent-lake-valley",
      seed: 42,
      build(world) {
        const terrain = world.terrain.landscape({
          id: "valley",
          tileSize: [160, 160],
          tiles: [2, 2],
          segmentsPerTile: [16, 16],
          relief: "plain",
          amplitude: 7,
          frequency: 0.015,
          semantic: "open_grass_valley",
        });
        world.water.lake({
          id: "lake",
          terrain,
          center: [0, 0],
          radius: [24, 18],
          depth: 6,
          shoreWidth: 7,
          semantic: "clear_lake",
        });
        const towerGround = world.terrain.height(terrain, [-45, -50]) ?? 0;
        world.landmark.compound({
          id: "tower",
          dependsOn: [terrain],
          transform: { position: [-45, towerGround, -50] },
          semantic: "watchtower",
          children: [
            { kind: "cylinder", radius: 5, height: 20, transform: { position: [0, 10, 0] } },
            { kind: "cone", radius: 7, height: 7, transform: { position: [0, 23.5, 0] } },
          ],
        });
        world.player.spawn({
          terrain,
          at: [0, 45],
          facingRadians: Math.PI,
          camera: { pitchRadians: 0.55, distance: 7 },
        });
        world.atmosphere.set({ preset: "golden-hour", semantic: "warm_open_world" });
      },
    });

    const compiled = compileOutdoorScene(scene);

    expect(compiled.registry.list().map((feature) => feature.type)).toEqual([
      "official.tiled-rolling-terrain",
      "official.lake",
      "official.compound-landmark",
    ]);
    expect(compiled.registry.listResources().length).toBeGreaterThan(6);
    expect(compiled.terrainHandles).toHaveLength(1);
    expect(compiled.spawn.position[2]).toBe(45);
    expect(compiled.spawn.facingRadians).toBe(Math.PI);
    expect(compiled.spawn.camera).toEqual({
      pitchRadians: 0.55,
      distance: 7,
      fovDegrees: 56,
      targetHeight: 0.85,
    });
    expect(compiled.atmosphere.preset).toBe("golden-hour");
    expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toHaveLength(0);
    const terrainResource = compiled.registry.getResource<HeightfieldGrid>(
      compiled.terrainHandles[0]?.terrainId ?? "",
    );
    expect(terrainResource?.value.tiles).toHaveLength(4);
  });

  it("supports a custom agent-authored terrain feature through the same compiler", () => {
    const MesaFeature = defineWorldFeature<
      { size: number; height: number },
      { terrainId: string }
    >({
      type: "custom.mesa",
      version: 1,
      source: "scenes/features/mesa.ts",
      schema: { size: "positiveNumber", height: "positiveNumber" },
      build(context, params) {
        const terrainId = context.terrain.create({
          width: params.size,
          depth: params.size,
          xSegments: 32,
          zSegments: 32,
        });
        context.terrain.raise(terrainId, {
          area: context.shape.polygon([
            [-20, -15],
            [18, -18],
            [24, 10],
            [-12, 22],
          ]),
          amount: params.height,
          falloffWidth: 7,
        });
        context.semantic.bind(terrainId, { semantic: "mesa_plateau" });
        return { terrainId };
      },
    });
    const scene = defineOutdoorScene({
      id: "custom-mesa-scene",
      seed: "mesa-seed",
      build(world) {
        const terrain = world.terrain.custom(
          MesaFeature,
          { id: "mesa", params: { size: 120, height: 18 }, seed: world.seed },
          (output) => output.terrainId,
        );
        world.player.spawn({ terrain, at: [0, 0] });
      },
    });

    const first = compileOutdoorScene(scene);
    const second = compileOutdoorScene(scene);
    const firstTerrain = first.registry.getResource<Heightfield>(
      first.terrainHandles[0]?.terrainId ?? "",
    );
    const secondTerrain = second.registry.getResource<Heightfield>(
      second.terrainHandles[0]?.terrainId ?? "",
    );
    expect(firstTerrain?.value.sampleHeight(0, 0)).toBeGreaterThan(10);
    expect(firstTerrain?.value.heights).toEqual(secondTerrain?.value.heights);
  });

  it("returns an actionable error when the agent places a spawn outside terrain", () => {
    const scene = defineOutdoorScene({
      id: "invalid-spawn",
      build(world) {
        const terrain = world.terrain.rolling({
          id: "tiny",
          size: [20, 20],
          segments: [8, 8],
          amplitude: 0,
          frequency: 0.1,
        });
        world.player.spawn({ terrain, at: [100, 100] });
      },
    });
    expect(() => compileOutdoorScene(scene)).toThrow(SceneCompilationError);
    expect(() => compileOutdoorScene(scene)).toThrow(/outside terrain/);
  });

  it("rejects a spawn on a slope the humanoid controller cannot climb", () => {
    const SteepSpawnTerrain = defineWorldFeature<{}, { terrainId: string }>({
      type: "test.steep-spawn",
      version: 1,
      schema: {},
      build(context) {
        const terrainId = context.terrain.create({
          width: 40,
          depth: 40,
          xSegments: 40,
          zSegments: 40,
        });
        context.terrain.raise(terrainId, {
          area: context.shape.circle([0, 0], 10),
          amount: 20,
          falloffWidth: 10,
          curve: "linear",
        });
        return { terrainId };
      },
    });
    const scene = defineOutdoorScene({
      id: "steep-spawn",
      build(world) {
        const terrain = world.terrain.custom(
          SteepSpawnTerrain,
          { id: "steep", params: {} },
          (output) => output.terrainId,
        );
        world.player.spawn({ terrain, at: [7, 0] });
      },
    });

    expect(() => compileOutdoorScene(scene)).toThrow(/climb limit/);
  });

  it("rejects a spawn inside blocked water with a stable diagnostic", () => {
    const scene = defineOutdoorScene({
      id: "blocked-water-spawn",
      build(world) {
        const terrain = world.terrain.rolling({
          id: "ground",
          size: [40, 40],
          segments: [8, 8],
          amplitude: 0,
          frequency: 0.1,
        });
        world.water.lake({
          id: "blocked-lake",
          terrain,
          center: [0, 0],
          radius: [5, 4],
          depth: 2,
          traversal: "blocked",
        });
        world.player.spawn({ terrain, at: [0, 0] });
      },
    });

    try {
      compileOutdoorScene(scene);
      throw new Error("Expected blocked water spawn to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(SceneCompilationError);
      expect((error as SceneCompilationError).diagnostics).toContainEqual(
        expect.objectContaining({
          code: "SPAWN_IN_BLOCKED_WATER",
          entityId: "player",
          featureId: "blocked-lake",
        }),
      );
    }
  });

  it("rejects capsule-disc overlap with blocked water when the spawn center is outside", () => {
    const scene = defineOutdoorScene({
      id: "blocked-water-edge-spawn",
      build(world) {
        const terrain = world.terrain.rolling({
          id: "ground",
          size: [40, 40],
          segments: [8, 8],
          amplitude: 0,
          frequency: 0.1,
        });
        world.water.lake({
          id: "blocked-lake",
          terrain,
          center: [0, 0],
          radius: [1, 1],
          depth: 2,
          waterLevel: 1,
          traversal: "blocked",
        });
        world.player.spawn({ terrain, at: [1.2, 0] });
      },
    });

    expect(() => compileOutdoorScene(scene)).toThrow(SceneCompilationError);
  });

  it("allows a spawn inside an explicitly walkable water surface", () => {
    const scene = defineOutdoorScene({
      id: "walkable-water-spawn",
      build(world) {
        const terrain = world.terrain.rolling({
          id: "ground",
          size: [40, 40],
          segments: [8, 8],
          amplitude: 0,
          frequency: 0.1,
        });
        world.water.lake({
          id: "walkable-lake",
          terrain,
          center: [0, 0],
          radius: [5, 4],
          depth: 2,
          traversal: "walkable",
        });
        world.player.spawn({ terrain, at: [0, 0] });
      },
    });

    expect(compileOutdoorScene(scene).diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "SPAWN_IN_BLOCKED_WATER" }),
    );
  });

  it("allows a spawn below an elevated blocked-water volume", () => {
    const ElevatedWater = defineWorldFeature<{}, {}>({
      type: "test.elevated-water",
      version: 1,
      source: "scene.test.ts#ElevatedWater",
      schema: {},
      build(context) {
        context.surface.water({
          area: context.shape.circle([0, 0], 4),
          elevation: 5,
          minimumDepth: 2,
          traversal: "blocked",
        });
        return {};
      },
    });
    const scene = defineOutdoorScene({
      id: "elevated-water-spawn",
      build(world) {
        const terrain = world.terrain.rolling({
          id: "ground",
          size: [40, 40],
          segments: [8, 8],
          amplitude: 0,
          frequency: 0.1,
        });
        world.feature.add(ElevatedWater, { id: "reservoir", params: {} });
        world.player.spawn({ terrain, at: [0, 0] });
      },
    });

    expect(compileOutdoorScene(scene).diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "SPAWN_IN_BLOCKED_WATER" }),
    );
  });

  it("rejects a spawn inside a static blocking landmark footprint", () => {
    const scene = defineOutdoorScene({
      id: "static-blocker-spawn",
      build(world) {
        const terrain = world.terrain.rolling({
          id: "ground",
          size: [40, 40],
          segments: [8, 8],
          amplitude: 0,
          frequency: 0.1,
        });
        world.landmark.compound({
          id: "blocking-post",
          transform: { position: [0, 0, 0] },
          children: [{
            id: "post",
            kind: "box",
            size: [2, 3, 2],
            transform: { position: [0, 1.5, 0] },
          }],
        });
        world.player.spawn({ terrain, at: [0, 0] });
      },
    });

    try {
      compileOutdoorScene(scene);
      throw new Error("Expected static blocker spawn to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(SceneCompilationError);
      expect((error as SceneCompilationError).diagnostics).toContainEqual(
        expect.objectContaining({
          code: "SPAWN_INSIDE_STATIC_BLOCKER",
          entityId: "player",
          featureId: "blocking-post",
        }),
      );
    }
  });

  it("conservatively rejects overlap along a non-uniform sphere blocker's long axis", () => {
    const scene = defineOutdoorScene({
      id: "non-uniform-sphere-blocker",
      build(world) {
        const terrain = world.terrain.rolling({
          id: "ground",
          size: [40, 40],
          segments: [8, 8],
          amplitude: 0,
          frequency: 0.1,
        });
        world.landmark.compound({
          id: "scaled-sphere",
          children: [{
            id: "sphere",
            kind: "sphere",
            radius: 1,
            transform: { position: [0, 1, 0], scale: [4, 1, 1] },
          }],
        });
        world.player.spawn({ terrain, at: [4.2, 0] });
      },
    });

    expect(() => compileOutdoorScene(scene)).toThrow(SceneCompilationError);
  });

  it("allows a spawn standing exactly on top of a static blocking landmark", () => {
    const scene = defineOutdoorScene({
      id: "static-blocker-top-contact",
      build(world) {
        const terrain = world.terrain.rolling({
          id: "ground",
          size: [40, 40],
          segments: [8, 8],
          amplitude: 0,
          frequency: 0.1,
        });
        world.landmark.compound({
          id: "support-box",
          transform: { position: [0, 0, 0] },
          children: [{
            id: "box",
            kind: "box",
            size: [2, 2, 2],
            transform: { position: [0, 1, 0] },
          }],
        });
        world.player.spawn({ terrain, at: [0, 0], heightOffset: 2.9 });
      },
    });

    expect(compileOutdoorScene(scene).diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "SPAWN_INSIDE_STATIC_BLOCKER" }),
    );
  });
});
