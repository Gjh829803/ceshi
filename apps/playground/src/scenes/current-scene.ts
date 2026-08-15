import { defineOutdoorScene } from "@whitebox-world/world";

/**
 * This is the only file a Coding Agent needs to replace for a new outdoor world.
 * Runtime, rendering, physics, subject, camera, inspection, and QA remain SDK-owned.
 */
export const currentScene = defineOutdoorScene({
  id: "great-lake-grassland",
  title: "Great Lake Grassland",
  seed: 42,
  budget: {
    maxVertices: 350_000,
    maxTriangles: 700_000,
    maxColliders: 128,
    maxBuildTimeMs: 1_500,
  },
  build(world) {
    const terrain = world.terrain.landscape({
      id: "rolling-grassland",
      tileSize: [160, 160],
      tiles: [4, 4],
      segmentsPerTile: [128, 128],
      baseHeight: 0,
      relief: "plain",
      semantic: "rolling_grassland",
      appearancePrompt: "lush green grass across a vast landscape of rolling hills",
    });

    world.water.lake({
      id: "central-lake",
      terrain,
      center: [0, 2],
      radius: [62, 45],
      depth: 9,
      shoreWidth: 18,
      traversal: "blocked",
      semantic: "clear_lake",
      appearancePrompt: "a broad clear alpine lake with a soft natural shoreline",
      surfaceStyle: {
        deepColor: 0x4e8796,
        shallowColor: 0xc2dddd,
        opacity: 0.78,
        waveAmplitude: 0.045,
        waveFrequency: 0.16,
      },
    });

    const towerGround = world.terrain.height(terrain, [-95, -65]) ?? 0;
    world.landmark.compound({
      id: "northern-watchtower",
      dependsOn: [terrain],
      transform: { position: [-95, towerGround, -65] },
      collision: true,
      semantic: "watchtower",
      appearancePrompt: "a monumental stone watchtower on the northern ridge",
      children: [
        {
          kind: "cylinder",
          height: 15,
          radius: 6.2,
          transform: { position: [0, 7.5, 0] },
        },
        {
          kind: "cylinder",
          height: 4,
          radius: 7,
          transform: { position: [0, 17, 0] },
        },
        {
          kind: "cone",
          height: 8,
          radius: 8,
          transform: { position: [0, 23, 0] },
        },
        {
          kind: "box",
          size: [3, 5.5, 1],
          transform: { position: [0, 2.75, 5.7] },
        },
      ],
    });

    world.player.spawn({ terrain, at: [0, 68], heightOffset: 0.9 });
    world.atmosphere.set({
      preset: "clear-day",
      semantic: "bright_open_grassland",
      appearancePrompt: "a clear expansive sky with warm directional sunlight",
      fogNear: 260,
      fogFar: 900,
    });
  },
});
