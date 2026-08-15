import type { OutdoorSceneDefinition } from "@whitebox-world/world";

import { azureBayScene } from "./azure-bay-scene.js";
import { canyonScene } from "./canyon-scene.js";
import { currentScene } from "./current-scene.js";
import { mistboundRiderScene } from "./mistbound-rider-scene.js";

export const sceneCatalog: Readonly<Record<string, OutdoorSceneDefinition>> = {
  grassland: currentScene,
  "azure-bay": azureBayScene,
  canyon: canyonScene,
  "mistbound-rider": mistboundRiderScene,
};

export function resolveScene(search: string): OutdoorSceneDefinition {
  const requested = new URLSearchParams(search).get("scene") ?? "grassland";
  return sceneCatalog[requested] ?? currentScene;
}
