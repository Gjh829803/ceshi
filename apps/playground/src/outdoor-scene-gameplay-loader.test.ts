import { describe, expect, it } from "vitest";

import {
  Heightfield,
  HeightfieldGrid,
  defineOutdoorScene,
  defineWorldFeature,
  type OutdoorSceneDefinition,
  type TerrainSurface,
} from "@whitebox-world/world";

import { loadOutdoorGameplayScene } from "./outdoor-scene-gameplay-loader.js";

type TestTerrainParams = Readonly<{ kind: "single" | "tiled" }>;

const TestLockedTerrainFeature = defineWorldFeature<
  TestTerrainParams,
  { terrainId: string }
>({
  type: "test.locked-outdoor-terrain",
  version: 1,
  schema: { kind: { type: "string", values: ["single", "tiled"] } },
  build(context, params) {
    const surface: TerrainSurface = params.kind === "single"
      ? new Heightfield({
          width: 8,
          depth: 4,
          xSegments: 3,
          zSegments: 2,
          origin: [2, -1],
        })
      : new HeightfieldGrid({
          tileSize: [2, 2],
          tiles: [2, 2],
          segmentsPerTile: [1, 1],
          origin: [0, 0],
        });
    const field = params.kind === "single"
      ? {
          columns: 4,
          rows: 3,
          values: [
            1, 1.4, 1.2, 1.3,
            1.7, 1.5, 1.9, 1.6,
            1.8, 2, 2.1, 2.2,
          ],
        }
      : {
          columns: 3,
          rows: 3,
          values: [
            0, 0.2, 0.4,
            0.3, 0.5, 0.7,
            0.6, 0.8, 1,
          ],
        };
    surface.applyRaster({
      field,
      bounds: { center: surface.origin, size: [surface.width, surface.depth] },
      mode: "set",
    });
    return {
      terrainId: context.resources.create("terrain", surface, {
        vertices: surface.vertexCount,
        triangles: surface.triangleCount,
        colliders: params.kind === "single" ? 1 : 4,
      }),
    };
  },
});

function createTerrainScene(
  kind: TestTerrainParams["kind"],
  id = `test-${kind}-outdoor-import`,
): OutdoorSceneDefinition {
  return defineOutdoorScene({
    id,
    seed: 147,
    build(world) {
      const terrain = world.terrain.custom(
        TestLockedTerrainFeature,
        { id: "terrain-feature", params: { kind } },
        (output) => output.terrainId,
      );
      world.player.spawn({
        terrain,
        at: kind === "single" ? [-2, -3] : [0, 0],
        heightOffset: 1.2,
        facingRadians: 0.75,
        camera: {
          pitchRadians: -0.25,
          distance: 6.25,
          fovDegrees: 64,
          targetHeight: 1.4,
        },
      });
      world.atmosphere.set({ preset: "golden-hour" });
    },
  });
}

function createContentScene(): OutdoorSceneDefinition {
  return defineOutdoorScene({
    id: "test-outdoor-content-import",
    seed: 812,
    build(world) {
      const terrain = world.terrain.rolling({
        id: "terrain-feature",
        size: [80, 60],
        segments: [8, 6],
        relief: "flat",
        baseHeight: 0,
        amplitude: 0,
        frequency: 0.02,
      });
      world.water.body({
        id: "water-circle",
        terrain,
        boundary: { kind: "circle", center: [22, 15], radius: 4 },
        waterLevel: 0,
        depth: 1,
        shoreWidth: 1,
        traversal: "blocked",
        semantic: "water.circle",
      });
      world.water.body({
        id: "water-ellipse",
        terrain,
        boundary: { kind: "ellipse", center: [-20, 14], radius: [5, 3] },
        waterLevel: 0,
        depth: 1,
        shoreWidth: 1,
        traversal: "walkable",
        semantic: "water.ellipse",
      });
      world.water.body({
        id: "water-polygon",
        terrain,
        boundary: {
          kind: "polygon",
          points: [[18, -18], [26, -18], [25, -10], [19, -12]],
        },
        waterLevel: 0,
        depth: 1,
        shoreWidth: 1,
        traversal: "swimmable",
        semantic: "water.polygon",
      });
      world.landmark.compound({
        id: "asymmetric-monument",
        dependsOn: [terrain],
        transform: {
          position: [3, 2, 4],
          rotation: [0, Math.PI / 2, 0],
          scale: [2, 3, 4],
        },
        semantic: "landmark.monument",
        children: [
          {
            id: "leaf-box",
            kind: "box",
            transform: {
              position: [1, 2, 3],
              scale: [0.5, 1, 1.5],
            },
            size: [2, 4, 6],
            appearance: { semantic: "landmark.leaf" },
          },
          {
            id: "floor-plane",
            kind: "plane",
            transform: { position: [0, -2, 0] },
            size: [4, 1, 6],
            collision: false,
          },
          {
            id: "marker-sphere",
            kind: "sphere",
            transform: { position: [-3, 1, 0] },
            radius: 1.25,
          },
          {
            id: "marker-cylinder",
            kind: "cylinder",
            transform: { position: [0, 1, -3] },
            radius: 0.75,
            height: 2.5,
          },
          {
            id: "marker-cone",
            kind: "cone",
            transform: { position: [3, 1, 0] },
            radius: 0.8,
            height: 3,
          },
        ],
      });
      world.player.spawn({ terrain, at: [-30, -22] });
      world.atmosphere.set({ preset: "overcast" });
    },
  });
}

describe("loadOutdoorGameplayScene", () => {
  it("locks the exact rectangular X-fast terrain and preserves spawn/camera semantics", () => {
    const result = loadOutdoorGameplayScene(createTerrainScene("single"), {
      aspectRatio: 2,
    });

    expect(result.diagnostics.filter((row) => row.severity === "error")).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.executionPlan).toMatchObject({
      kind: "worldkit-execution-plan",
      schemaVersion: 5,
      id: "test-single-outdoor-import",
      runtimeBackend: "babylon-havok",
      atmospherePreset: "golden-hour",
      initialControlledEntityId: "player",
      terrain: {
        centerMetersXZ: [2, -1],
        sizeMetersXZ: [8, 4],
        resolutionCellsXZ: [4, 3],
        heightSamplesMeters: [
          1, 1.399999976158142, 1.2000000476837158, 1.2999999523162842,
          1.7000000476837158, 1.5, 1.899999976158142, 1.600000023841858,
          1.7999999523162842, 2, 2.0999999046325684, 2.200000047683716,
        ],
        minimumHeightMeters: 1,
        maximumHeightMeters: 2.200000047683716,
      },
      camera: {
        pitchRadians: -0.25,
        distanceMeters: 6.25,
        targetHeightMeters: 1.4,
        fovDegrees: 64,
        aspectRatio: 2,
      },
    });
    expect(result.executionPlan?.subjects).toContainEqual(
      expect.objectContaining({
        entityId: "player",
        spawnSubjectOriginPositionMetersXYZ: [-2, 1.3, -3],
        spawnSubjectFacingRadians: 0.75,
      }),
    );
    expect(result.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.normalizedWorldIrHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("collapses tiled seams into one global heightfield without changing samples", () => {
    const result = loadOutdoorGameplayScene(createTerrainScene("tiled"));

    expect(result.diagnostics.filter((row) => row.severity === "error")).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.executionPlan?.terrain).toMatchObject({
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [4, 4],
      resolutionCellsXZ: [3, 3],
      heightSamplesMeters: [
        0, 0.20000000298023224, 0.4000000059604645,
        0.30000001192092896, 0.5, 0.699999988079071,
        0.6000000238418579, 0.800000011920929, 1,
      ],
    });
    expect(result.executionPlan?.terrain.heightSamplesMeters).toHaveLength(9);
  });

  it("is byte-deterministic for the same scene definition", () => {
    const scene = createTerrainScene("single");

    const first = loadOutdoorGameplayScene(scene);
    const second = loadOutdoorGameplayScene(scene);

    expect(first.executionPlan).toEqual(second.executionPlan);
    expect(first.executionPlanHash).toBe(second.executionPlanHash);
    expect(first.normalizedWorldIrHash).toBe(second.normalizedWorldIrHash);
  });

  it("projects all supported water boundaries and flattens primitive landmark leaves", () => {
    const result = loadOutdoorGameplayScene(createContentScene());

    expect(result.diagnostics.filter((row) => row.severity === "error")).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.executionPlan?.waters.map((water) => ({
      boundary: water.boundary,
      traversalMode: water.traversalMode,
      semanticClassId: water.semanticClassId,
    }))).toEqual([
      {
        boundary: { kind: "circle", centerMetersXZ: [22, 15], radiusMeters: 4 },
        traversalMode: "blocked",
        semanticClassId: "water.circle",
      },
      {
        boundary: { kind: "ellipse", centerMetersXZ: [-20, 14], radiusMetersXZ: [5, 3] },
        traversalMode: "walkable",
        semanticClassId: "water.ellipse",
      },
      {
        boundary: {
          kind: "polygon",
          pointsMetersXZ: [[18, -18], [26, -18], [25, -10], [19, -12]],
        },
        traversalMode: "swimmable",
        semanticClassId: "water.polygon",
      },
    ]);
    expect(result.executionPlan?.objects).toHaveLength(5);
    expect(result.executionPlan?.objects.map((object) => object.primitive.kind).sort()).toEqual([
      "box",
      "box",
      "cone",
      "cylinder",
      "sphere",
    ]);

    const leaf = result.executionPlan?.objects.find(
      (object) => object.semanticClassId === "landmark.leaf",
    );
    expect(leaf).toMatchObject({
      collisionEnabled: true,
      primitive: { kind: "box", sizeMetersXYZ: [2, 4, 6] },
      transform: {
        positionMetersXYZ: [15, 8, 2],
        rotationEulerRadiansXYZ: [0, 1.570796, 0],
        scaleXYZ: [1, 3, 6],
      },
    });
    const plane = result.executionPlan?.objects.find(
      (object) => object.collisionEnabled === false,
    );
    expect(plane).toMatchObject({
      semanticClassId: "landmark.monument",
      primitive: { kind: "box", sizeMetersXYZ: [4, 0.1, 6] },
    });
    expect(new Set(result.executionPlan?.objects.map((object) => object.entityId)).size).toBe(5);
  });

  it("fails closed instead of choosing one of multiple terrain authorities", () => {
    const scene = defineOutdoorScene({
      id: "test-multiple-terrain-import",
      build(world) {
        const first = world.terrain.rolling({
          id: "terrain-first",
          size: [20, 20],
          segments: [4, 4],
          relief: "flat",
          amplitude: 0,
          frequency: 0.1,
        });
        world.terrain.rolling({
          id: "terrain-second",
          size: [20, 20],
          segments: [4, 4],
          relief: "flat",
          amplitude: 0,
          frequency: 0.1,
        });
        world.player.spawn({ terrain: first, at: [0, 0] });
      },
    });

    expect(loadOutdoorGameplayScene(scene)).toMatchObject({
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "OUTDOOR_SCENE_IMPORT_TERRAIN_COUNT_UNSUPPORTED",
      }],
    });
  });
});
