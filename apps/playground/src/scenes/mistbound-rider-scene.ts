import {
  defineOutdoorScene,
  defineWorldFeature,
  terrainNoiseForRelief,
  type LandmarkPrimitiveSpec,
  type TerrainRelief,
} from "@whitebox-world/world";

const MistboundValleyTerrain = defineWorldFeature<
  { relief: TerrainRelief; valleyDepth: number },
  { terrainId: string }
>({
  type: "fantasy.mistbound-valley-terrain",
  version: 1,
  source: "apps/playground/src/scenes/mistbound-rider-scene.ts#MistboundValleyTerrain",
  schema: {
    relief: { type: "string", values: ["flat", "plain", "hills", "mountains"] },
    valleyDepth: "positiveNumber",
  },
  budget: { maxVertices: 160_000, maxTriangles: 300_000, maxColliders: 16 },
  build(context, params) {
    const terrainId = context.terrain.createGrid({
      tileSize: [160, 160],
      tiles: [4, 4],
      segmentsPerTile: [96, 96],
    });
    context.terrain.noise(terrainId, terrainNoiseForRelief(params.relief));
    context.terrain.lower(terrainId, {
      area: context.shape.polygon([
        [-72, 300], [76, 300], [58, 190], [82, 90], [55, -20],
        [72, -130], [48, -300], [-55, -300], [-68, -135], [-48, -20],
        [-76, 90], [-54, 190],
      ]),
      amount: params.valleyDepth,
      falloffWidth: 58,
      curve: "smoother",
    });
    const trailHeight = context.terrain.sample(terrainId, [0, 0]) ?? -params.valleyDepth;
    context.terrain.flatten(terrainId, {
      area: context.shape.polygon([
        [-18, 300], [18, 300], [16, 175], [20, 65], [15, -55],
        [19, -170], [16, -300], [-16, -300], [-19, -170], [-15, -55],
        [-20, 65], [-16, 175],
      ]),
      height: trailHeight,
      strength: 0.72,
      falloffWidth: 24,
      curve: "smoother",
    });
    context.semantic.bind(terrainId, {
      semantic: "misty_wildflower_valley",
      prompt: "a long lush fantasy valley with rolling meadow slopes and a winding grassy trail",
    });
    return { terrainId };
  },
});

function archChildren(prefix: string): LandmarkPrimitiveSpec[] {
  return [
    { id: `${prefix}-left-pier`, kind: "box", size: [4, 12, 4], transform: { position: [-6, 6, 0] } },
    { id: `${prefix}-right-pier`, kind: "box", size: [4, 12, 4], transform: { position: [6, 6, 0] } },
    { id: `${prefix}-lintel`, kind: "box", size: [16, 4, 4], transform: { position: [0, 13, 0] } },
    { id: `${prefix}-fallen-stone`, kind: "box", size: [5, 2, 3], transform: { position: [10, 1, 2], rotation: [0.25, 0.6, 0.15] } },
  ];
}

function cottageChildren(prefix: string): LandmarkPrimitiveSpec[] {
  return [
    { id: `${prefix}-walls`, kind: "box", size: [13, 8, 10], transform: { position: [0, 4, 0] } },
    { id: `${prefix}-roof`, kind: "cone", radius: 9, height: 6, transform: { position: [0, 11, 0], rotation: [0, Math.PI / 4, 0], scale: [1, 1, 0.8] } },
    { id: `${prefix}-chimney`, kind: "box", size: [2, 6, 2], transform: { position: [3.5, 12, 1.5] } },
    { id: `${prefix}-door`, kind: "box", size: [2.5, 5, 0.5], transform: { position: [0, 2.5, 5] }, collision: false },
  ];
}

function castleChildren(): LandmarkPrimitiveSpec[] {
  const children: LandmarkPrimitiveSpec[] = [
    { id: "castle-central-keep", kind: "box", size: [30, 34, 22], transform: { position: [0, 17, 0] } },
    { id: "castle-gate", kind: "box", size: [8, 12, 2], transform: { position: [0, 6, 11] }, collision: false },
    { id: "castle-wall-left", kind: "box", size: [42, 13, 7], transform: { position: [-32, 6.5, 1] } },
    { id: "castle-wall-right", kind: "box", size: [42, 13, 7], transform: { position: [32, 6.5, 1] } },
  ];
  for (const [index, x] of [-45, -24, -11, 11, 24, 45].entries()) {
    const height = index === 0 || index === 5 ? 29 : index === 2 || index === 3 ? 46 : 36;
    children.push(
      { id: `castle-tower-${index}`, kind: "cylinder", radius: 6.5, height, transform: { position: [x, height / 2, 0] } },
      { id: `castle-spire-${index}`, kind: "cone", radius: 8, height: 18, transform: { position: [x, height + 9, 0] } },
    );
  }
  return children;
}

export const mistboundRiderScene = defineOutdoorScene({
  id: "mistbound-rider-valley",
  title: "Mistbound Rider Valley",
  seed: 184731,
  budget: {
    maxVertices: 230_000,
    maxTriangles: 460_000,
    maxColliders: 128,
    maxBuildTimeMs: 1_500,
  },
  build(world) {
    const terrain = world.terrain.custom(
      MistboundValleyTerrain,
      {
        id: "mistbound-valley-terrain",
        seed: world.seed,
        params: { relief: "plain", valleyDepth: 10 },
      },
      (output) => output.terrainId,
    );

    for (const [index, [x, z, rotation]] of ([
      [-32, 90, -0.28], [28, 18, 0.22], [-40, -78, -0.4],
    ] as const).entries()) {
      const ground = world.terrain.height(terrain, [x, z]) ?? 0;
      world.landmark.compound({
        id: `ruined-stone-arch-${index + 1}`,
        dependsOn: [terrain],
        transform: { position: [x, ground, z], rotation: [0, rotation, 0] },
        semantic: "ancient_ruined_stone_arch",
        appearancePrompt: "weathered mossy stone arch ruins emerging from meadow flowers",
        children: archChildren(`arch-${index + 1}`),
      });
    }

    for (const [index, [x, z, rotation]] of ([
      [62, 42, -0.35], [76, 4, -0.55], [-68, -34, 0.42], [-80, -68, 0.5],
    ] as const).entries()) {
      const ground = world.terrain.height(terrain, [x, z]) ?? 0;
      world.landmark.compound({
        id: `valley-cottage-${index + 1}`,
        dependsOn: [terrain],
        transform: { position: [x, ground, z], rotation: [0, rotation, 0] },
        semantic: "storybook_valley_cottage",
        appearancePrompt: "small ivy-covered stone cottage with a steep warm timber roof",
        children: cottageChildren(`cottage-${index + 1}`),
      });
    }

    const flowerChildren: LandmarkPrimitiveSpec[] = [];
    for (let index = 0; index < 36; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const x = side * (15 + ((index * 13) % 34));
      const z = 148 - index * 8;
      flowerChildren.push({
        id: `wildflower-cluster-${index + 1}`,
        kind: "sphere",
        radius: 0.7 + (index % 3) * 0.22,
        transform: { position: [x, 0.7, z], scale: [1.4, 0.7, 1.4] },
        collision: false,
      });
    }
    const horseLegs: LandmarkPrimitiveSpec[] = [];
    for (const [side, x] of [-0.55, 0.55].entries()) {
      for (const [leg, z] of [-0.85, 0.85].entries()) {
        horseLegs.push({
          id: `horse-leg-${side}-${leg}`,
          kind: "cylinder",
          radius: 0.28,
          height: 3.1,
          transform: { position: [x, 1.55, z] },
          collision: false,
        });
      }
    }
    world.landmark.compound({
      id: "wildflower-meadow-banks",
      dependsOn: [terrain],
      transform: { position: [0, world.terrain.height(terrain, [0, 0]) ?? 0, 0] },
      collision: false,
      semantic: "wildflower_meadow",
      appearancePrompt: "dense banks of blue, gold, white and violet valley wildflowers",
      children: flowerChildren,
    });

    const riderGround = world.terrain.height(terrain, [0, 154]) ?? 0;
    world.landmark.compound({
      id: "sword-slung-rider-and-brown-horse",
      dependsOn: [terrain],
      transform: { position: [0, riderGround, 154], rotation: [0, Math.PI, 0] },
      collision: false,
      semantic: "mounted_fantasy_rider",
      appearancePrompt: "a cloaked sword-slung traveler riding a sturdy brown horse away along the valley trail",
      children: [
        { id: "horse-body", kind: "sphere", radius: 2.4, transform: { position: [0, 3.2, 0], scale: [0.75, 0.85, 1.45] }, collision: false },
        { id: "horse-neck", kind: "cylinder", radius: 0.75, height: 3.2, transform: { position: [0, 4.7, -1.5], rotation: [0.55, 0, 0] }, collision: false },
        { id: "horse-head", kind: "sphere", radius: 1, transform: { position: [0, 6, -2.2], scale: [0.8, 0.85, 1.15] }, collision: false },
        ...horseLegs,
        { id: "rider-torso", kind: "cylinder", radius: 0.75, height: 2.8, transform: { position: [0, 6.8, 0] }, collision: false },
        { id: "rider-head", kind: "sphere", radius: 0.65, transform: { position: [0, 8.6, 0] }, collision: false },
        { id: "slung-sword", kind: "box", size: [0.22, 0.22, 4.2], transform: { position: [0.8, 7, 0.35], rotation: [0.2, 0, -0.48] }, collision: false },
      ],
    });

    const castleGround = world.terrain.height(terrain, [0, -238]) ?? 0;
    world.landmark.compound({
      id: "many-spired-valley-castle",
      dependsOn: [terrain],
      transform: { position: [0, castleGround, -238] },
      semantic: "many_spired_fantasy_castle",
      appearancePrompt: "a majestic pale stone castle with many needle-like slate spires above the mist",
      children: castleChildren(),
    });

    world.landmark.compound({
      id: "ringed-gas-giant-and-crescent-moon",
      transform: { position: [118, 108, -255], rotation: [-0.25, 0, 0.28] },
      collision: false,
      semantic: "ringed_planet_and_crescent_moon",
      appearancePrompt: "an enormous softly banded ringed gas giant with a nearby silver crescent moon",
      children: [
        { id: "gas-giant", kind: "sphere", radius: 23, collision: false },
        { id: "planet-ring", kind: "cylinder", radius: 37, height: 0.6, collision: false },
        { id: "crescent-moon", kind: "sphere", radius: 6, transform: { position: [-42, 12, 2] }, collision: false },
      ],
    });

    world.player.spawn({ terrain, at: [0, 172], heightOffset: 0.9, facingRadians: Math.PI });
    world.atmosphere.set({
      preset: "overcast",
      skyColor: 0x8a91ad,
      fogColor: 0xb7bdc8,
      fogNear: 35,
      fogFar: 430,
      sunDirection: [-0.45, 0.72, -0.3],
      sunIntensity: 1.35,
      semantic: "curling_twilight_valley_mist",
      appearancePrompt: "luminous lavender-blue twilight with curling low valley mist and soft shafts of light",
    });
  },
});
