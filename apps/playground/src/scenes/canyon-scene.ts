import {
  defineOutdoorScene,
  defineWorldFeature,
  terrainNoiseForRelief,
  type TerrainRelief,
} from "@whitebox-world/world";

const CanyonTerrainFeature = defineWorldFeature<
  { relief: TerrainRelief; canyonDepth: number },
  { terrainId: string }
>({
  type: "example.canyon-terrain",
  version: 1,
  source: "apps/playground/src/scenes/canyon-scene.ts#CanyonTerrainFeature",
  schema: {
    relief: { type: "string", values: ["flat", "plain", "hills", "mountains"] },
    canyonDepth: "positiveNumber",
  },
  budget: {
    maxVertices: 90_000,
    maxTriangles: 180_000,
    maxColliders: 16,
  },
  build(context, params) {
    const terrainId = context.terrain.createGrid({
      tileSize: [160, 160],
      tiles: [4, 4],
      segmentsPerTile: [64, 64],
    });
    context.terrain.noise(terrainId, terrainNoiseForRelief(params.relief));
    context.terrain.lower(terrainId, {
      area: context.shape.polygon([
        [-42, 170],
        [15, 165],
        [28, 75],
        [-12, 20],
        [25, -55],
        [12, -175],
        [-45, -170],
        [-32, -55],
        [-68, 18],
        [-25, 85],
      ]),
      amount: params.canyonDepth,
      falloffWidth: 24,
      curve: "smoother",
    });
    context.semantic.bind(terrainId, {
      semantic: "wind_carved_canyon",
      prompt: "a broad winding canyon across an open rocky plateau",
    });
    return { terrainId };
  },
});

export const canyonScene = defineOutdoorScene({
  id: "agent-canyon-river",
  title: "Agent-authored Canyon River",
  seed: 913,
  budget: {
    maxVertices: 160_000,
    maxTriangles: 320_000,
    maxColliders: 96,
    maxBuildTimeMs: 1_500,
  },
  build(world) {
    const terrain = world.terrain.custom(
      CanyonTerrainFeature,
      {
        id: "canyon-plateau",
        seed: world.seed,
        params: { relief: "hills", canyonDepth: 16 },
      },
      (output) => output.terrainId,
    );

    world.water.body({
      id: "canyon-river",
      terrain,
      boundary: {
        kind: "polygon",
        points: [
          [-18, 145],
          [3, 145],
          [8, 72],
          [-25, 15],
          [6, -58],
          [-2, -145],
          [-22, -145],
          [-16, -62],
          [-46, 14],
          [-10, 76],
        ],
      },
      depth: 4.5,
      shoreWidth: 5,
      traversal: "blocked",
      semantic: "canyon_river",
      appearancePrompt: "a winding blue river at the bottom of a monumental canyon",
    });

    const archGround = world.terrain.height(terrain, [65, -15]) ?? 0;
    world.landmark.compound({
      id: "stone-arch",
      dependsOn: [terrain],
      transform: { position: [65, archGround, -15], rotation: [0, -0.35, 0] },
      semantic: "natural_stone_arch",
      children: [
        { kind: "box", size: [8, 20, 8], transform: { position: [-10, 10, 0] } },
        { kind: "box", size: [8, 20, 8], transform: { position: [10, 10, 0] } },
        { kind: "box", size: [28, 7, 8], transform: { position: [0, 22, 0] } },
      ],
    });

    world.player.spawn({ terrain, at: [80, 80], heightOffset: 0.9, facingRadians: -2.4 });
    world.atmosphere.set({
      preset: "golden-hour",
      fogNear: 300,
      fogFar: 1_000,
      semantic: "dry_canyon_sunset",
    });
  },
});
