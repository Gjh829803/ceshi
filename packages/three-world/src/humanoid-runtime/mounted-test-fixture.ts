import { readFileSync } from "node:fs";
import { Group, PerspectiveCamera } from "three";
import { createWorld, type ThreeWorld } from "../world";
import type { EnvironmentDefinition } from "./environment/types";
import type { VehicleSpec } from "./config";
import {composeAssetCatalog} from '@worldkit/preset-content/assets/host-adapter';
const catalog = JSON.parse(
  readFileSync(
    new URL(
      "@worldkit/asset-library/catalog",
      import.meta.url,
    ),
    "utf8",
  ),
);
const source = composeAssetCatalog(catalog.assets).find(
  (entry: { id: string }) => entry.id === "creature.horse",
)!.vehicle!.spec as VehicleSpec;
export async function createMountedFixture(
  options: {
    boxes?: EnvironmentDefinition["boxes"];
    initialMountId?:string;
    spawnYawRadians?:number;
    animation?:import("./character").Character;
    playerSpawn?:[number,number,number];
    secondHorsePosition?: [number, number, number];
  } = {},
): Promise<ThreeWorld> {
  const positions: [number, number, number][] = [
    [0, 0.025, 0],
    ...(options.secondHorsePosition ? [options.secondHorsePosition] : []),
  ];
  const map: EnvironmentDefinition = {
    id: "mount-test",
    name: "Mount test",
    description: "",
    bounds: { min: [-50, -10, -50], max: [50, 50, 50] },
    boxes: [
      { id: "ground", position: [0, -0.5, 0], size: [100, 1, 100] },
      ...(options.boxes ?? []),
    ],
    water: [],
    regions: [
      {
        id: "mount",
        name: "Mount",
        description: "",
        center: [0, 0, 0],
        size: [100, 100],
        color: "#fff",
        modes: ["mount"],
      },
    ],
    spawns: positions.map((position, n) => ({
      id: `spawn-${n}`,
      name: "Horse",
      vehicleId: `horse-${n + 1}`,
      position,
      yaw: options.spawnYawRadians??0,
      regionId: "mount",
    })),
    playerSpawn: options.playerSpawn??[1.45, 0.025, 0],
  };
  const world = await createWorld({
    camera: new PerspectiveCamera(),
    navigation: false,
    assetDefinitions: {},
    humanoid: {
      map,
      character: { ...(options.initialMountId?{initialMountId:options.initialMountId}:{}),instanceId: "person", object: options.animation?.root??new Group(),...(options.animation?{animation:options.animation}:{}) },
      vehicles: positions.map((spawn, n) => ({
        instanceId: `horse-${n + 1}`,
        assetId: "creature.horse",
        spec: { ...structuredClone(source), id: `horse-${n + 1}`, spawn },
        object: new Group(),
      })),
    },
  });
  if(!options.initialMountId)world.humanoid!.prepareCharacter(options.playerSpawn??[1.45, 0.025, 0]);
  return world;
}
