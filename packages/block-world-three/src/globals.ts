import * as THREE from "three";

import { BLOCK_PRESET_REFS_V1 } from "@whitebox-world/block-world";

import {
  bindWorldkitBlockV1,
  createWorldkitBlockMaterialV1,
} from "./binding.js";

export interface BlockWorldAuthoringGlobalsV1 {
  readonly THREE: typeof THREE;
  readonly WorldKitBlock: Readonly<{
    BLOCK_PRESET_REFS_V1: typeof BLOCK_PRESET_REFS_V1;
    bindWorldkitBlockV1: typeof bindWorldkitBlockV1;
    createWorldkitBlockMaterialV1: typeof createWorldkitBlockMaterialV1;
  }>;
}

export function installBlockWorldAuthoringGlobalsV1(): BlockWorldAuthoringGlobalsV1 {
  const worldKitBlock = Object.freeze({
    BLOCK_PRESET_REFS_V1,
    bindWorldkitBlockV1,
    createWorldkitBlockMaterialV1,
  });
  Object.defineProperty(globalThis, "THREE", {
    value: THREE,
    writable: false,
    configurable: true,
  });
  Object.defineProperty(globalThis, "WorldKitBlock", {
    value: worldKitBlock,
    writable: false,
    configurable: true,
  });
  return Object.freeze({ THREE, WorldKitBlock: worldKitBlock });
}
