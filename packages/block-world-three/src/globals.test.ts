import { describe, expect, it } from "vitest";

import { BLOCK_PRESET_REFS_V1 } from "@whitebox-world/block-world";

import { installBlockWorldAuthoringGlobalsV1 } from "./globals.js";

describe("portable Block World authoring globals", () => {
  it("installs the real Three namespace and the narrow immutable binding surface", () => {
    const installed = installBlockWorldAuthoringGlobalsV1();
    expect(globalThis).toHaveProperty("THREE", installed.THREE);
    expect(globalThis).toHaveProperty("WorldKitBlock", installed.WorldKitBlock);
    expect(installed.WorldKitBlock.BLOCK_PRESET_REFS_V1.walkable).toBe(
      BLOCK_PRESET_REFS_V1.walkable,
    );
    expect(Object.isFrozen(installed.WorldKitBlock)).toBe(true);
  });
});
