import {
  definePlannedOutdoorScene,
  defineWorldFeature,
  type LandmarkPrimitiveSpec,
} from "@whitebox-world/world";

import { worldSpec } from "./plans/world-08170639-54db.js";

const SCENE_SOURCE = "apps/playground/src/scenes/world-08170639-54db.ts";
const RASTER_COLUMNS = 145;
const RASTER_ROWS = 121;

function plannedHeight(z: number): number {
  if (z <= -82) return -6;
  if (z <= -63) return 4;
  if (z <= -58) return 4 - ((z + 63) / 5) * 0.5;
  if (z <= -15) return 3.5;
  if (z <= -8) return 3.5 + ((z + 15) / 7) * 0.8;
  if (z <= -5) return 4.3;
  if (z <= 25) return 4.3;
  if (z <= 28) return 4.3 - ((z - 25) / 3) * 0.3;
  if (z <= 70) return 4;
  // The entire inland neighborhood is a broad 7.8-degree rise, comfortably
  // below the frozen 12-degree route limit.
  return 4 + ((z - 70) / 80) * 11;
}

const coastalHeightField = {
  columns: RASTER_COLUMNS,
  rows: RASTER_ROWS,
  values: Array.from({ length: RASTER_COLUMNS * RASTER_ROWS }, (_, index) => {
    const row = Math.floor(index / RASTER_COLUMNS);
    const z = -150 + (row / (RASTER_ROWS - 1)) * 300;
    return plannedHeight(z);
  }),
};

const CoastalTownTerrain = defineWorldFeature<{}, { terrainId: string }>({
  type: "scene.world-08170639-54db-terrain",
  version: 1,
  source: `${SCENE_SOURCE}#CoastalTownTerrain`,
  schema: {},
  budget: { maxVertices: 80_000, maxTriangles: 160_000, maxColliders: 8 },
  build(context) {
    const terrainId = context.terrain.createGrid({
      tileSize: [360, 300],
      tiles: [1, 1],
      segmentsPerTile: [144, 120],
      origin: [0, 0],
      baseHeight: 4,
    });
    context.terrain.raster(terrainId, {
      field: coastalHeightField,
      bounds: { center: [0, 0], size: [360, 300] },
      mode: "set",
    });
    context.semantic.bind(terrainId, {
      semantic: "flat_constructed_coastal_neighborhood",
      prompt: "flat coastal paving, a low rail bed, level promenade, and a gentle inland neighborhood rise",
    });
    return { terrainId };
  },
});

type RegionParams = { semantic: string; role: string };
const PlannedRegion = defineWorldFeature<RegionParams, { regionId: string }>({
  type: "scene.world-08170639-54db-region",
  version: 1,
  source: `${SCENE_SOURCE}#PlannedRegion`,
  schema: { semantic: { type: "string" }, role: { type: "string" } },
  build(context, params) {
    return {
      regionId: context.resources.create("custom", {
        kind: "planned-region",
        semantic: params.semantic,
        role: params.role,
      }),
    };
  },
});

function personChildren(id: string, height: number): LandmarkPrimitiveSpec[] {
  return [
    { id: `${id}-body`, kind: "box", size: [0.5, height * 0.58, 0.32], transform: { position: [0, height * 0.43, 0] } },
    { id: `${id}-head`, kind: "sphere", radius: 0.23, transform: { position: [0, height - 0.23, 0] } },
    { id: `${id}-left-leg`, kind: "box", size: [0.18, height * 0.38, 0.2], transform: { position: [-0.14, height * 0.19, 0] } },
    { id: `${id}-right-leg`, kind: "box", size: [0.18, height * 0.38, 0.2], transform: { position: [0.14, height * 0.19, 0] } },
  ];
}

function railChildren(): LandmarkPrimitiveSpec[] {
  const children: LandmarkPrimitiveSpec[] = [
    { id: "near-rail", kind: "box", size: [360, 0.12, 0.14], transform: { position: [0, 0.08, 5] } },
    { id: "far-rail", kind: "box", size: [360, 0.12, 0.14], transform: { position: [0, 0.08, 15] } },
  ];
  for (let x = -176; x <= 176; x += 4) {
    children.push({ id: `sleeper-${x + 176}`, kind: "box", size: [0.35, 0.08, 14], transform: { position: [x, 0.04, 10] } });
  }
  return children;
}

export const world0817063954dbScene = definePlannedOutdoorScene({
  id: "world-08170639-54db",
  title: "Seaside Railway Crossing Homage",
  seed: 817063954,
  worldSpec,
  budget: {
    maxVertices: 100_000,
    maxTriangles: 200_000,
    maxColliders: 180,
    maxBuildTimeMs: 2_000,
  },
  build(world) {
    const terrain = world.terrain.custom(
      CoastalTownTerrain,
      { id: "coastal-town-terrain", seed: world.seed, params: {} },
      (output) => output.terrainId,
    );

    const regions = [
      ["crossing-apron", "flat_safe_waiting_pavement", "plateau"],
      ["inland-neighborhood", "gentle_station_forecourt_and_residential_slope", "background"],
      ["coastal-road", "flat_road_between_railway_and_seawall", "route"],
      ["seawall-promenade", "walkable_coastal_promenade", "shore"],
    ] as const;
    for (const [id, semantic, role] of regions) {
      world.feature.add(PlannedRegion, {
        id,
        seed: world.seed,
        dependsOn: [terrain.id],
        params: { semantic, role },
      });
    }

    world.landmark.compound({
      id: "railway-corridor",
      dependsOn: [terrain],
      transform: { position: [0, 4.3, 0] },
      semantic: "east_west_double_rail_embankment",
      appearancePrompt: "two restrained parallel steel rails on a level coastal rail bed",
      children: railChildren(),
    });

    world.water.body({
      id: "open-sea",
      terrain,
      boundary: { kind: "polygon", points: [[-180, -150], [180, -150], [180, -82], [-180, -82]] },
      depth: 6,
      waterLevel: 0,
      shoreWidth: 4,
      traversal: "blocked",
      semantic: "bright_open_blue_sea",
      appearancePrompt: "broad brilliant blue open sea beneath a low uninterrupted horizon",
    });

    const addCompound = (
      id: string,
      position: [number, number, number],
      rotation: number,
      semantic: string,
      appearancePrompt: string,
      children: LandmarkPrimitiveSpec[],
      collision = true,
    ) => world.landmark.compound({
      id,
      dependsOn: [terrain],
      transform: { position, rotation: [0, rotation, 0] },
      collision,
      semantic,
      appearancePrompt,
      children,
    });

    addCompound("waiting-schoolgirl", [0, 4, 32], 0, "waiting_sailor_uniform_schoolgirl", "long-haired schoolgirl in a sailor uniform, clearly read from behind", personChildren("waiting-schoolgirl", 1.62));

    const trainChildren: LandmarkPrimitiveSpec[] = [
      { id: "car-body", kind: "box", size: [3.1, 3.5, 20], transform: { position: [0, 1.75, 0] } },
      { id: "car-roof", kind: "box", size: [3, 0.6, 19.6], transform: { position: [0, 3.8, 0] } },
    ];
    addCompound("train-car-east", [45, 4.3, 10], Math.PI / 2, "teal_cream_local_railcar", "boxy cream and deep teal coastal local railcar without branding", trainChildren);
    addCompound("train-car-west", [22, 4.3, 10], Math.PI / 2, "teal_cream_local_railcar", "boxy cream and deep teal coastal local railcar without branding", trainChildren);

    const gateChildren = (id: string): LandmarkPrimitiveSpec[] => [
      { id: `${id}-housing`, kind: "box", size: [0.65, 1.15, 0.3], transform: { position: [-3.42, 0.575, 0] } },
      { id: `${id}-arm`, kind: "box", size: [6.85, 0.14, 0.14], transform: { position: [0.33, 0.95, 0] } },
    ];
    addCompound("near-gate", [0, 4, 27], 0, "black_yellow_lowered_crossing_barrier", "lowered slender black-yellow Japanese railway barrier", gateChildren("near-gate"));
    addCompound("far-gate", [-35, 4, -1], 0, "black_yellow_lowered_crossing_barrier", "lowered slender black-yellow Japanese railway barrier", gateChildren("far-gate"));

    const carChildren = (id: string, size: [number, number, number]): LandmarkPrimitiveSpec[] => [
      { id: `${id}-lower`, kind: "box", size: [size[0], size[1] * 0.45, size[2]], transform: { position: [0, size[1] * 0.225, 0] } },
      { id: `${id}-cabin`, kind: "box", size: [size[0] * 0.86, size[1] * 0.55, size[2] * 0.58], transform: { position: [0, size[1] * 0.725, -size[2] * 0.04] } },
    ];
    addCompound("dark-wagon", [-42, 3.5, -30], Math.PI / 2, "dark_compact_station_wagon", "late-1990s dark navy compact Japanese station wagon", carChildren("dark-wagon", [1.75, 1.55, 4.3]));
    addCompound("silver-van", [-20, 3.5, -34], Math.PI / 2, "silver_family_minivan", "clean late-1990s silver Japanese family minivan", carChildren("silver-van", [1.85, 1.75, 4.65]));

    addCompound("bystander-west", [-72, 4, -18], 0, "waiting_crossing_bystander", "adult seaside pedestrian in pale summer clothing", personChildren("bystander-west", 1.68));
    addCompound("bystander-center", [-58, 4, -21], 0, "waiting_crossing_bystander", "adult seaside pedestrian in pale summer clothing", personChildren("bystander-center", 1.68));

    addCompound("coastal-station-shelter", [105, 4.3, 18], Math.PI / 2, "small_coastal_station_shelter", "minimal open-air coastal station shelter", [
      { id: "shelter-roof", kind: "box", size: [5, 0.35, 12], transform: { position: [0, 4.025, 0] } },
      { id: "shelter-post-nw", kind: "box", size: [0.25, 4, 0.25], transform: { position: [-2.1, 2, -5.1] } },
      { id: "shelter-post-ne", kind: "box", size: [0.25, 4, 0.25], transform: { position: [2.1, 2, -5.1] } },
      { id: "shelter-post-sw", kind: "box", size: [0.25, 4, 0.25], transform: { position: [-2.1, 2, 5.1] } },
      { id: "shelter-post-se", kind: "box", size: [0.25, 4, 0.25], transform: { position: [2.1, 2, 5.1] } },
    ]);

    world.player.spawn({
      terrain,
      at: [0, 45],
      heightOffset: 0.9,
      facingRadians: 0,
      camera: { pitchRadians: 0.06, distance: 5.2, fovDegrees: 48, targetHeight: 1.05 },
    });
    world.atmosphere.set({
      preset: "clear-day",
      fogNear: 240,
      fogFar: 1_100,
      sunDirection: [-0.55, 0.8, 0.35],
      sunIntensity: 1.15,
      semantic: "clear_high_summer_noon_at_the_coast",
      appearancePrompt: "clear saturated cyan summer sky with crisp noon sunlight from upper left",
    });
  },
});
