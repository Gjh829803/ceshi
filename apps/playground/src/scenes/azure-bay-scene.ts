import {
  defineOutdoorScene,
  defineWorldFeature,
  terrainNoiseForRelief,
  type TerrainRelief,
} from "@whitebox-world/world";

const bayWaterLevel = -10;

const AzureBayTerrainFeature = defineWorldFeature<
  { relief: TerrainRelief },
  { terrainId: string }
>({
  type: "scene.azure-bay-terrain",
  version: 1,
  source: "apps/playground/src/scenes/azure-bay-scene.ts#AzureBayTerrainFeature",
  schema: {
    relief: { type: "string", values: ["flat", "plain", "hills", "mountains"] },
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
        [-138, -122],
        [138, -122],
        [218, -18],
        [224, 176],
        [104, 226],
        [-104, 226],
        [-224, 176],
        [-218, -18],
      ]),
      amount: 16,
      falloffWidth: 30,
      curve: "smoother",
    });
    context.terrain.raise(terrainId, {
      area: context.shape.polygon([
        [-320, -170],
        [-190, -160],
        [-138, -55],
        [-170, 125],
        [-255, 245],
        [-320, 260],
      ]),
      amount: 22,
      falloffWidth: 42,
      curve: "smoother",
    });
    context.terrain.raise(terrainId, {
      area: context.shape.polygon([
        [320, -170],
        [190, -160],
        [138, -55],
        [170, 125],
        [255, 245],
        [320, 260],
      ]),
      amount: 21,
      falloffWidth: 42,
      curve: "smoother",
    });
    context.terrain.raise(terrainId, {
      area: context.shape.polygon([
        [-115, 210],
        [-65, 185],
        [10, 195],
        [70, 180],
        [130, 220],
        [105, 275],
        [-110, 280],
      ]),
      amount: 13,
      falloffWidth: 28,
      curve: "smoother",
    });

    // A high southern overlook fades linearly into one continuous walkable route.
    context.terrain.flatten(terrainId, {
      area: context.shape.polygon([
        [-320, -600],
        [320, -600],
        [160, -118],
        [-160, -118],
      ]),
      height: 34,
      strength: 1,
      falloffWidth: 90,
      curve: "linear",
    });
    context.terrain.flatten(terrainId, {
      area: context.shape.ellipse([0, -220], [34, 22]),
      height: 34,
      strength: 1,
      falloffWidth: 12,
      curve: "smoother",
    });
    context.semantic.bind(terrainId, {
      semantic: "azure_bay_green_hills_pale_cliffs_and_flower_meadow",
      prompt:
        "a broad azure bay enclosed by rolling green coastal hills, pale cliff silhouettes, a distant island, and a flower-rich foreground meadow",
    });
    return { terrainId };
  },
});

export const azureBayScene = defineOutdoorScene({
  id: "azure-bay",
  title: "Azure Bay",
  seed: 240517,
  budget: {
    maxVertices: 180_000,
    maxTriangles: 360_000,
    maxColliders: 128,
    maxBuildTimeMs: 1_500,
  },
  build(world) {
    const terrain = world.terrain.custom(
      AzureBayTerrainFeature,
      {
        id: "azure-bay-landscape",
        seed: world.seed,
        params: { relief: "plain" },
      },
      (output) => output.terrainId,
    );

    world.water.body({
      id: "azure-bay-water",
      terrain,
      boundary: {
        kind: "polygon",
        points: [
          [-145, -115],
          [145, -115],
          [222, -15],
          [225, 175],
          [105, 225],
          [-105, 225],
          [-225, 175],
          [-222, -15],
        ],
      },
      depth: 12,
      waterLevel: bayWaterLevel,
      shoreWidth: 8,
      traversal: "blocked",
      semantic: "wide_clear_azure_sea_bay",
      appearancePrompt: "clear deep-blue coastal water under a bright sky with towering soft white clouds",
    });

    const addCompound = (
      id: string,
      at: [number, number],
      semantic: string,
      children: Parameters<typeof world.landmark.compound>[0]["children"],
      rotation = 0,
    ) => {
      const ground = world.terrain.height(terrain, at) ?? 0;
      world.landmark.compound({
        id,
        dependsOn: [terrain],
        transform: { position: [at[0], ground, at[1]], rotation: [0, rotation, 0] },
        semantic,
        children,
      });
    };

    addCompound("east-headland-lighthouse", [-205, 48], "white_coastal_lighthouse", [
      { kind: "box", size: [7, 26, 7], transform: { position: [0, 13, 0] } },
      { kind: "box", size: [11, 3, 11], transform: { position: [0, 27, 0] } },
      { kind: "box", size: [6, 5, 6], transform: { position: [0, 31, 0] } },
    ]);

    const cottage = [
      { kind: "box" as const, size: [18, 9, 14] as [number, number, number], transform: { position: [0, 4.5, 0] as [number, number, number] } },
      { kind: "box" as const, size: [20, 3, 16] as [number, number, number], transform: { position: [0, 10, 0] as [number, number, number], rotation: [0, 0, 0.12] as [number, number, number] } },
    ];
    addCompound("east-village-cottage-one", [-248, -18], "small_coastal_village_cottage", cottage, 0.2);
    addCompound("east-village-cottage-two", [-270, 8], "small_coastal_village_cottage", cottage, -0.25);
    addCompound("east-village-cottage-three", [-238, 28], "small_coastal_village_cottage", cottage, -0.1);

    const sailboats: Array<[number, number, number]> = [
      [-120, 42, -0.15],
      [-62, 125, 0.2],
      [-8, 48, -0.1],
      [54, 104, 0.15],
      [112, 18, -0.2],
      [150, 155, 0.1],
    ];
    for (const [x, z, rotation] of sailboats) {
      world.landmark.compound({
        id: `bay-sailboat-${x}-${z}`,
        dependsOn: [terrain],
        transform: { position: [x, bayWaterLevel, z], rotation: [0, rotation, 0] },
        semantic: "non_colliding_white_sailboat_floating_on_bay_surface",
        collision: false,
        children: [
          { kind: "box", size: [10, 1, 3], transform: { position: [0, 0.6, 0] }, collision: false },
          { kind: "box", size: [0.5, 12, 0.5], transform: { position: [0, 7, 0] }, collision: false },
          { kind: "box", size: [0.5, 9, 7], transform: { position: [0, 7, 3.5], rotation: [0, 0, -0.45] }, collision: false },
        ],
      });
    }

    const fenceChildren = [];
    for (let i = 0; i < 7; i += 1) {
      fenceChildren.push({ kind: "box" as const, size: [2, 8, 2] as [number, number, number], transform: { position: [i * 14, 4, 0] as [number, number, number] } });
      if (i < 6) {
        fenceChildren.push({ kind: "box" as const, size: [14, 1.5, 1.5] as [number, number, number], transform: { position: [i * 14 + 7, 5.5, 0] as [number, number, number] } });
        fenceChildren.push({ kind: "box" as const, size: [14, 1.5, 1.5] as [number, number, number], transform: { position: [i * 14 + 7, 2.8, 0] as [number, number, number] } });
      }
    }
    addCompound("foreground-east-wood-fence", [70, -195], "weathered_wooden_path_fence", fenceChildren, -0.08);
    addCompound("foreground-west-wood-fence", [-140, -195], "weathered_wooden_path_fence", fenceChildren, 0.12);

    world.player.spawn({
      terrain,
      at: [0, -220],
      heightOffset: 0.9,
      facingRadians: Math.PI,
      camera: { pitchRadians: 0.38, distance: 6.5 },
    });
    world.atmosphere.set({
      preset: "clear-day",
      fogNear: 420,
      fogFar: 1_200,
      semantic: "bright_blue_coastal_day_with_towering_white_clouds",
    });
  },
});
