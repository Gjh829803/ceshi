import { describe, expect, it } from "vitest";

import { deriveWorldPlanArtifacts } from "./planning-artifacts";
import { compileOutdoorScene, definePlannedOutdoorScene } from "./scene";
import { defineOutdoorWorldSpec } from "./world-spec";

const spec = defineOutdoorWorldSpec({
  kind: "outdoor-world-spec",
  version: 1,
  id: "planned-flat-world",
  source: { request: "a flat field with a tower" },
  intent: "A deterministic planning artifact fixture.",
  bounds: { center: [0, 0], size: [80, 80], heightRange: [-1, 4] },
  terrain: {
    baseRelief: "flat",
    regions: [
      {
        id: "field-region",
        role: "ground",
        semantic: "flat_field",
        area: { kind: "polygon", points: [[-40, -40], [40, -40], [40, 40], [-40, 40]] },
        featureId: "terrain",
        evidence: "user-explicit",
      },
    ],
  },
  water: [],
  landmarks: [
    {
      id: "tower-anchor",
      semantic: "tower",
      position: [0, 0, -20],
      approximateSize: [6, 20, 6],
      importance: "primary",
      featureId: "tower",
      evidence: "user-explicit",
    },
  ],
  routes: [
    {
      id: "entry-to-tower",
      points: [[0, 20], [0, -20]],
      width: 5,
      priority: "primary",
      maxSlopeDegrees: 10,
      evidence: "planner-inferred",
    },
  ],
  entry: {
    spawn: [0, 20],
    facingRadians: 0,
    camera: { pitchRadians: 0.3, distance: 4.5, fovDegrees: 56 },
    composition: {
      foreground: ["field"],
      middleground: ["tower"],
      background: ["horizon"],
      visibleLandmarkIds: ["tower-anchor"],
    },
  },
  claims: [
    { id: "claim-tower", evidence: "user-explicit", statement: "A tower is visible ahead." },
  ],
  artifacts: [
    {
      kind: "world-plan",
      generator: "codex-imagegen",
      uri: "/scene-plans/planned-flat-world/world-plan.png",
      prompt: "An orthographic level-design plan.",
    },
    {
      kind: "opening-shot",
      generator: "codex-imagegen",
      uri: "/scene-plans/planned-flat-world/opening-shot.png",
      prompt: "A ground-level opening composition.",
    },
    { kind: "height-slope-plan", generator: "sdk-derived", uri: "runtime://planning/height-slope" },
  ],
  traceability: { requiredFeatureIds: ["terrain", "tower"] },
});

function compileFixture() {
  return compileOutdoorScene(definePlannedOutdoorScene({
    id: "planned-flat-world",
    seed: 7,
    worldSpec: spec,
    build(world) {
      const terrain = world.terrain.landscape({
        id: "terrain",
        tileSize: [80, 80],
        tiles: [1, 1],
        segmentsPerTile: [16, 16],
        relief: "flat",
      });
      world.landmark.compound({
        id: "tower",
        dependsOn: [terrain],
        transform: { position: [0, 0, -20] },
        children: [{ kind: "box", size: [6, 20, 6], transform: { position: [0, 10, 0] } }],
      });
      world.player.spawn({
        terrain,
        at: [0, 20],
        facingRadians: 0,
        camera: { pitchRadians: 0.3, distance: 4.5, fovDegrees: 56 },
      });
    },
  }));
}

describe("world planning artifacts", () => {
  it("derives deterministic top-down and height/slope data from the built world", () => {
    const first = deriveWorldPlanArtifacts(compileFixture(), { sampleSpacingMeters: 10 });
    const second = deriveWorldPlanArtifacts(compileFixture(), { sampleSpacingMeters: 10 });
    expect(first).toEqual(second);
    expect(first.topDown.bounds.size).toEqual([80, 80]);
    expect(first.topDown.spawn).toEqual([0, 20]);
    expect(first.heightSlope.grid.columns).toBe(9);
    expect(first.heightSlope.grid.rows).toBe(9);
    expect(first.heightSlope.grid.heights.every((height) => height === 0)).toBe(true);
    expect(first.heightSlope.routeChecks).toEqual([
      expect.objectContaining({ routeId: "entry-to-tower", pass: true }),
    ]);
    expect(first.diagnostics).toEqual([]);
  });

  it("caps dense artifact grids", () => {
    const artifact = deriveWorldPlanArtifacts(compileFixture(), {
      sampleSpacingMeters: 0.1,
      maxGridDimension: 32,
    });
    expect(artifact.heightSlope.grid.columns).toBe(32);
    expect(artifact.heightSlope.grid.rows).toBe(32);
  });
});
