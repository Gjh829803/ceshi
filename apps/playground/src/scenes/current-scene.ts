import {
  definePlannedOutdoorScene,
  defineWorldFeature,
  terrainNoiseForRelief,
} from "@whitebox-world/world";

import { worldSpec } from "./plans/grassland.js";

const GrasslandTerrainFeature = defineWorldFeature<{}, { terrainId: string }>({
  type: "scene.grassland-planned-terrain",
  version: 1,
  source: "apps/playground/src/scenes/current-scene.ts#GrasslandTerrainFeature",
  schema: {},
  budget: {
    maxVertices: 350_000,
    maxTriangles: 700_000,
    maxColliders: 16,
  },
  build(context) {
    const terrainId = context.terrain.createGrid({
      tileSize: [160, 160],
      tiles: [4, 4],
      segmentsPerTile: [128, 128],
    });
    context.terrain.noise(terrainId, terrainNoiseForRelief("plain"));
    context.terrain.raise(terrainId, {
      area: context.shape.ellipse([-105, -65], [92, 70]),
      amount: 8,
      falloffWidth: 58,
      curve: "smoother",
    });
    context.semantic.bind(terrainId, {
      semantic: "rolling_grassland_with_northwest_watchtower_ridge",
      prompt: "lush green grass across a vast gently rolling plain with one low north-west ridge",
    });
    return { terrainId };
  },
});

/**
 * This is the only file a Coding Agent needs to replace for a new outdoor world.
 * Runtime, rendering, physics, subject, camera, inspection, and QA remain SDK-owned.
 */
export const currentScene = definePlannedOutdoorScene({
  id: "grassland",
  title: "Great Lake Grassland",
  seed: 42,
  worldSpec,
  budget: {
    maxVertices: 350_000,
    maxTriangles: 700_000,
    maxColliders: 128,
    // This is an authoring safety budget, not a micro-benchmark. Keep enough
    // headroom for deterministic validation while the full test suite is under load.
    maxBuildTimeMs: 3_000,
  },
  build(world) {
    const terrain = world.terrain.custom(
      GrasslandTerrainFeature,
      {
        id: "rolling-grassland",
        seed: world.seed,
        params: {},
      },
      (output) => output.terrainId,
    );

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

    world.player.spawn({
      terrain,
      at: [0, 68],
      heightOffset: 0.9,
      facingRadians: 0,
      camera: { pitchRadians: 0.3, distance: 4.5, fovDegrees: 56 },
    });
    world.atmosphere.set({
      preset: "clear-day",
      semantic: "bright_open_grassland",
      appearancePrompt: "a clear expansive sky with warm directional sunlight",
      fogNear: 260,
      fogFar: 900,
    });
  },
});
