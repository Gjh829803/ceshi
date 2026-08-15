import {
  definePlannedOutdoorScene,
  defineWorldFeature,
  type LandmarkPrimitiveSpec,
} from "@whitebox-world/world";

import { worldSpec } from "./plans/sunlit-flower-bay.js";

type PlannedRegionParams = {
  semantic: string;
  role: string;
};

const PlannedRegionFeature = defineWorldFeature<PlannedRegionParams, { regionId: string }>({
  type: "scene.sunlit-flower-bay-region",
  version: 1,
  source: "apps/playground/src/scenes/sunlit-flower-bay.ts#PlannedRegionFeature",
  schema: {
    semantic: { type: "string" },
    role: { type: "string" },
  },
  build(context, params) {
    const regionId = context.resources.create("custom", {
      kind: "planned-terrain-region",
      semantic: params.semantic,
      role: params.role,
    });
    return { regionId };
  },
});

const SunlitFlowerBayTerrain = defineWorldFeature<{}, { terrainId: string }>({
  type: "scene.sunlit-flower-bay-terrain",
  version: 1,
  source: "apps/playground/src/scenes/sunlit-flower-bay.ts#SunlitFlowerBayTerrain",
  schema: {},
  budget: { maxVertices: 350_000, maxTriangles: 700_000, maxColliders: 32 },
  build(context) {
    // Six by five 200m tiles preserve the frozen bounds at 2.5m/cell.
    const terrainId = context.terrain.createGrid({
      tileSize: [200, 200],
      tiles: [6, 5],
      segmentsPerTile: [80, 80],
      origin: [0, 0],
      baseHeight: 12,
    });
    // Southern high country supplies the long entry descent without relying on
    // high-amplitude global noise.
    context.terrain.raise(terrainId, {
      area: context.shape.circle([0, 500], 760),
      amount: 70,
      falloffWidth: 700,
      curve: "smoother",
    });
    // Open the central sightline into the bay while keeping the entry shelf and
    // rear loop high. This broad inner valley is structural, not surface detail.
    context.terrain.lower(terrainId, {
      area: context.shape.circle([0, 0], 360),
      amount: 55,
      falloffWidth: 250,
      curve: "smoother",
    });
    // Asymmetric coastal shoulders form the frozen headland and cliff silhouettes.
    context.terrain.raise(terrainId, {
      area: context.shape.circle([-520, 10], 465),
      amount: 22,
      falloffWidth: 150,
      curve: "smoother",
    });
    context.terrain.raise(terrainId, {
      area: context.shape.circle([520, 5], 455),
      amount: 20,
      falloffWidth: 150,
      curve: "smoother",
    });
    // Composition-critical shelves are explicitly level and clear.
    context.terrain.flatten(terrainId, {
      area: context.shape.circle([0, 350], 40),
      height: 82,
      strength: 1,
      falloffWidth: 32,
      curve: "smoother",
    });
    context.terrain.flatten(terrainId, {
      area: context.shape.circle([295, -45], 60),
      height: 42,
      strength: 1,
      falloffWidth: 36,
      curve: "smoother",
    });

    // The broad southern mound is the continuous grade shared by the frozen
    // central and rear-loop routes. The coast operations use wide falloffs so
    // the branch centerlines remain traversable instead of becoming trenches.
    context.terrain.smooth(terrainId, { iterations: 2, strength: 0.7 });
    context.semantic.bind(terrainId, {
      semantic: "broad_hill_country_base_with_explicit_bay_cutout",
      prompt: "layered walkable green coasts, pale cliff masses, a high southern overlook, low islands, and a broad north-opening bay",
    });
    return { terrainId };
  },
});

function cottageChildren(id: string): LandmarkPrimitiveSpec[] {
  return [
    { id: `${id}-walls`, kind: "box", size: [12, 5.5, 9], transform: { position: [0, 2.75, 0] } },
    { id: `${id}-roof`, kind: "cone", radius: 6, height: 2.5, transform: { position: [0, 6.75, 0], rotation: [0, Math.PI / 4, 0], scale: [1, 1, 0.75] } },
    { id: `${id}-minor-volume`, kind: "box", size: [4, 4, 5], transform: { position: [5, 2, 1.5] } },
  ];
}

function sailboatChildren(id: string): LandmarkPrimitiveSpec[] {
  return [
    { id: `${id}-hull`, kind: "box", size: [3.2, 0.8, 7], transform: { position: [0, -1.2, 0] }, collision: false },
    { id: `${id}-mast`, kind: "cylinder", radius: 0.12, height: 5.5, transform: { position: [0, 0.35, 0] }, collision: false },
    { id: `${id}-sail`, kind: "plane", size: [2.7, 4.2, 0.1], transform: { position: [1.4, 0.6, 0] }, collision: false },
  ];
}

export const sunlitFlowerBayScene = definePlannedOutdoorScene({
  id: "sunlit-flower-bay",
  title: "Sunlit Flower Bay",
  seed: 731942,
  worldSpec,
  budget: {
    maxVertices: 360_000,
    maxTriangles: 720_000,
    maxColliders: 128,
    maxBuildTimeMs: 2_500,
  },
  build(world) {
    const terrain = world.terrain.custom(
      SunlitFlowerBayTerrain,
      { id: "coastal-terrain", seed: world.seed, params: {} },
      (output) => output.terrainId,
    );

    const plannedRegions = [
      ["south-overlook", "flattened_high_meadow_overlook", "plateau"],
      ["central-descent-landform", "long_broad_walkable_descent_to_inner_bay", "route"],
      ["western-coast-landform", "stepped_green_western_headlands_and_coves", "ridge"],
      ["western-cliffs", "pale_rock_cliff_steps_above_western_waterline", "shore"],
      ["eastern-coast-landform", "rolling_eastern_coast_and_lighthouse_headland", "ridge"],
      ["eastern-cliffs", "broken_pale_cliffs_beneath_eastern_headland", "shore"],
      ["lighthouse-cape-ground", "small_walkable_eastern_lighthouse_plateau", "plateau"],
      ["southern-hinterland-landform", "playable_rolling_upland_behind_entry_view", "background"],
    ] as const;
    for (const [id, semantic, role] of plannedRegions) {
      world.feature.add(PlannedRegionFeature, {
        id,
        seed: world.seed,
        dependsOn: [terrain.id],
        params: { semantic, role },
      });
    }

    world.water.body({
      id: "sunlit-bay",
      terrain,
      boundary: {
        kind: "polygon",
        points: [
          [-420, -500], [420, -500], [335, -320], [285, -250], [270, -115],
          [205, 40], [145, 130], [80, 180], [-80, 180], [-145, 130],
          [-215, 35], [-285, -115], [-300, -280],
        ],
      },
      depth: 6,
      waterLevel: 0,
      shoreWidth: 50,
      traversal: "blocked",
      semantic: "broad_north_opening_blue_sea_bay",
      appearancePrompt: "vast brilliant Mediterranean-blue bay with a readable open northern mouth",
    });

    // The frozen water polygon includes the distant-island footprints, so their
    // low whitebox masses sit above the water surface as separate tracked features.
    world.landmark.compound({
      id: "northwest-island",
      dependsOn: [terrain],
      transform: { position: [-245, 0, -430], rotation: [0, -0.08, 0] },
      semantic: "low_distant_island_silhouette",
      appearancePrompt: "low green distant island with a soft readable ridge",
      children: [
        { id: "northwest-island-mass", kind: "box", size: [190, 13, 66], transform: { position: [0, 5, 0], rotation: [0, 0, -0.035] } },
      ],
    });
    world.landmark.compound({
      id: "northeast-island",
      dependsOn: [terrain],
      transform: { position: [215, 0, -445], rotation: [0, 0.04, 0] },
      semantic: "long_low_distant_island_silhouette",
      appearancePrompt: "long low green distant island leaving broad open-water gaps",
      children: [
        { id: "northeast-island-mass", kind: "box", size: [245, 10, 54], transform: { position: [0, 4, 0], rotation: [0, 0, 0.025] } },
      ],
    });

    const addLandmark = (
      id: string,
      at: readonly [number, number, number],
      semantic: string,
      appearancePrompt: string,
      children: LandmarkPrimitiveSpec[],
      collision = true,
    ) => {
      world.landmark.compound({
        id,
        dependsOn: [terrain],
        transform: { position: [at[0], at[1], at[2]], rotation: [0, 0, 0] },
        collision,
        semantic,
        appearancePrompt,
        children,
      });
    };

    addLandmark(
      "east-cape-lighthouse", [295, 42, -45], "white_eastern_cape_lighthouse",
      "slender white stone coastal lighthouse with a dark lantern gallery and restrained red cap",
      [
        { id: "lighthouse-tower", kind: "cylinder", radius: 4, height: 20, transform: { position: [0, 10, 0] } },
        { id: "lighthouse-gallery", kind: "cylinder", radius: 4, height: 2, transform: { position: [0, 21, 0] } },
        { id: "lighthouse-lantern", kind: "cylinder", radius: 2.8, height: 2, transform: { position: [0, 23, 0] } },
        { id: "lighthouse-cap", kind: "cone", radius: 3.2, height: 1, transform: { position: [0, 24.5, 0] } },
      ],
    );

    const cottages = [
      ["west-upper-cottage", -315, 58, 95],
      ["west-cove-cottage", -360, 29, -85],
      ["south-path-cottage", -92, 35, 145],
      ["east-slope-cottage", 235, 33, 105],
      ["lighthouse-keeper-cottage", 330, 42, -15],
    ] as const;
    for (const [id, x, y, z] of cottages) {
      addLandmark(
        id, [x, y, z], "small_pale_coastal_cottage_with_red_tile_roof",
        "small pale plaster coastal cottage with a low terracotta gable roof and sparse rural proportions",
        cottageChildren(id),
      );
    }

    const sailboats = [
      ["bay-sailboat-west", -145, 1, -90],
      ["bay-sailboat-center", 5, 1, -155],
      ["bay-sailboat-east", 135, 1, -105],
      ["bay-sailboat-mouth", -45, 1, -330],
      ["east-cove-sailboat", 215, 1, -15],
    ] as const;
    for (const [id, x, y, z] of sailboats) {
      addLandmark(
        id, [x, y, z], "distant_small_single_mast_sailboat",
        "tiny single-mast coastal sailboat with one bright triangular sail and narrow hull",
        sailboatChildren(id), false,
      );
    }

    world.player.spawn({
      terrain,
      at: [0, 355],
      heightOffset: 0.9,
      facingRadians: 0,
      camera: { pitchRadians: 0.42, distance: 4.2, fovDegrees: 60 },
    });
    world.atmosphere.set({
      preset: "clear-day",
      fogNear: 560,
      fogFar: 1_450,
      sunDirection: [0.55, 0.78, 0.3],
      sunIntensity: 1.15,
      semantic: "clear_bright_late_morning_coastal_day",
      appearancePrompt: "clear late-morning sunlight from the south-east with high visibility over the bay",
    });
  },
});
