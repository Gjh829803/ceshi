import {
  defineOutdoorWorldSpec,
  definePlannedOutdoorScene,
} from "@whitebox-world/world";

export const worldSpec = defineOutdoorWorldSpec({
  kind: "outdoor-world-spec",
  version: 1,
  id: "replace-with-scene-id",
  source: { request: "preserve the user's original request verbatim" },
  intent: "Summarize the complete playable world and its main spatial experience.",
  bounds: { center: [0, 0], size: [640, 640], heightRange: [-20, 80] },
  terrain: {
    baseRelief: "plain",
    regions: [{
      id: "main-ground-region",
      semantic: "replace_terrain_semantic",
      role: "ground",
      area: { kind: "polygon", points: [[-320, -320], [320, -320], [320, 320], [-320, 320]] },
      featureId: "main-terrain",
      evidence: "user-explicit",
    }],
  },
  water: [{
    id: "main-lake-region",
    semantic: "replace_water_semantic",
    area: { kind: "ellipse", center: [0, 0], radius: [28, 20] },
    featureId: "main-lake",
    evidence: "user-explicit",
  }],
  landmarks: [{
    id: "main-landmark-anchor",
    semantic: "replace_landmark_semantic",
    position: [-45, 0, -55],
    approximateSize: [20, 26, 20],
    importance: "primary",
    featureId: "main-landmark",
    evidence: "user-explicit",
  }],
  routes: [{
    id: "primary-route",
    points: [[0, 45], [-20, 20], [-45, -55]],
    width: 8,
    priority: "primary",
    maxSlopeDegrees: 35,
    evidence: "planner-inferred",
  }],
  entry: {
    spawn: [0, 45],
    facingRadians: 0,
    camera: { pitchRadians: 0.3, distance: 4.5, fovDegrees: 56 },
    composition: {
      foreground: ["replace foreground"],
      middleground: ["replace middle ground"],
      background: ["replace background"],
      visibleLandmarkIds: ["main-landmark-anchor"],
    },
  },
  claims: [
    { id: "claim-required", evidence: "user-explicit", statement: "Replace with an explicit user requirement." },
    { id: "claim-inferred", evidence: "planner-inferred", statement: "Replace with a coherent playable continuation." },
  ],
  artifacts: [
    {
      kind: "world-plan",
      generator: "codex-imagegen",
      uri: "/scene-plans/replace-with-scene-id/world-plan.png",
      prompt: "Use case: infographic-diagram\nAsset type: strict orthographic game-world plan\nPrimary request: replace with the complete topology\nConstraints: no perspective, labels, UI, watermark, or clutter",
    },
    {
      kind: "opening-shot",
      generator: "codex-imagegen",
      uri: "/scene-plans/replace-with-scene-id/opening-shot.png",
      prompt: "Use case: stylized-concept\nAsset type: third-person opening-shot target\nPrimary request: replace with foreground, middle ground and background composition\nConstraints: preserve spatial relationships; no text, UI, logo, or watermark",
    },
    { kind: "height-slope-plan", generator: "sdk-derived", uri: "runtime://planning/height-slope" },
  ],
  traceability: { requiredFeatureIds: ["main-terrain", "main-lake", "main-landmark"] },
});

export const scene = definePlannedOutdoorScene({
  id: "replace-with-scene-id",
  title: "Replace with scene title",
  seed: 1,
  worldSpec,
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
      camera: { pitchRadians: 0.3, distance: 4.5, fovDegrees: 56 },
    });
    world.atmosphere.set({
      preset: "clear-day",
      semantic: "replace_atmosphere_semantic",
      appearancePrompt: "describe the sky, light, and atmosphere",
    });
  },
});
