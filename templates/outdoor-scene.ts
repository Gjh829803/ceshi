import { defineOutdoorScene } from "@whitebox-world/world";

export const scene = defineOutdoorScene({
  id: "replace-with-scene-id",
  title: "Replace with scene title",
  seed: 1,
  budget: {
    maxVertices: 200_000,
    maxTriangles: 400_000,
    maxColliders: 96,
    maxBuildTimeMs: 1_500,
  },
  build(world) {
    const terrain = world.terrain.landscape({
      id: "main-terrain",
      tileSize: [160, 160],
      tiles: [4, 4],
      segmentsPerTile: [96, 96],
      relief: "plain",
      semantic: "replace_terrain_semantic",
      appearancePrompt: "describe the terrain for the generative renderer",
    });

    world.water.lake({
      id: "main-lake",
      terrain,
      center: [0, 0],
      radius: [28, 20],
      depth: 6,
      shoreWidth: 8,
      semantic: "replace_water_semantic",
      appearancePrompt: "describe the water body",
    });

    const ground = world.terrain.height(terrain, [-45, -55]) ?? 0;
    world.landmark.compound({
      id: "main-landmark",
      dependsOn: [terrain],
      transform: { position: [-45, ground, -55] },
      semantic: "replace_landmark_semantic",
      children: [
        { kind: "box", size: [12, 18, 12], transform: { position: [0, 9, 0] } },
        { kind: "cone", radius: 10, height: 8, transform: { position: [0, 22, 0] } },
      ],
    });

    world.player.spawn({
      terrain,
      at: [0, 45],
      heightOffset: 0.9,
      // 0 faces -Z; Math.PI faces +Z. Tune camera only when opening composition matters.
      facingRadians: 0,
      camera: { pitchRadians: 0.3, distance: 4.5 },
    });
    world.atmosphere.set({
      preset: "clear-day",
      semantic: "replace_atmosphere_semantic",
      appearancePrompt: "describe the sky, light, and atmosphere",
    });
  },
});
