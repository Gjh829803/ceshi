import type { OutdoorSceneDefinition } from "@whitebox-world/world";

import { azureBayScene } from "./azure-bay-scene.js";
import { canyonScene } from "./canyon-scene.js";
import { currentScene } from "./current-scene.js";
import { mistboundRiderScene } from "./mistbound-rider-scene.js";
import { sunlitFlowerBayScene } from "./sunlit-flower-bay.js";
import { world0817063954dbScene } from "./world-08170639-54db.js";

export const sceneCatalog: Readonly<Record<string, OutdoorSceneDefinition>> = {
  grassland: currentScene,
  "azure-bay": azureBayScene,
  canyon: canyonScene,
  "mistbound-rider": mistboundRiderScene,
  "sunlit-flower-bay": sunlitFlowerBayScene,
  "world-08170639-54db": world0817063954dbScene,
};

export function resolveScene(search: string): OutdoorSceneDefinition {
  const requested = new URLSearchParams(search).get("scene") ?? "grassland";
  return sceneCatalog[requested] ?? currentScene;
}
