import { readFileSync } from "node:fs";
import { Group, PerspectiveCamera } from "three";
import { createWorld, type ThreeWorld } from "../world";
import type { MapDefinition } from "./environment/types";
import type { VehicleSpec } from "./config";
const catalog = JSON.parse(
  readFileSync(
    new URL(
      "../../../../assets/three-creator/asset-catalog.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const source = catalog.assets.find(
  (entry: { id: string }) => entry.id === "training.horse",
).training.spec as VehicleSpec;
export async function createMountedFixture(
  options: {
    boxes?: MapDefinition["boxes"];
    secondHorsePosition?: [number, number, number];
  } = {},
): Promise<ThreeWorld> {
  const positions: [number, number, number][] = [
    [0, 0.025, 0],
    ...(options.secondHorsePosition ? [options.secondHorsePosition] : []),
  ];
  const map: MapDefinition = {
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
      yaw: 0,
      regionId: "mount",
    })),
    playerSpawn: [1.45, 0.025, 0],
  };
  const world = await createWorld({
    camera: new PerspectiveCamera(),
    navigation: false,
    assetDefinitions: {},
    training: {
      map,
      character: { instanceId: "person", object: new Group() },
      vehicles: positions.map((spawn, n) => ({
        instanceId: `horse-${n + 1}`,
        assetId: "training.horse",
        spec: { ...structuredClone(source), id: `horse-${n + 1}`, spawn },
        object: new Group(),
      })),
    },
  });
  world.training!.prepareCharacter([1.45, 0.025, 0]);
  return world;
}
