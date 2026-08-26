import { describe, expect, it } from "vitest";

import * as terrainCompiler from "@whitebox-world/terrain-compiler";

describe("terrain compiler public boundary", () => {
  it("exports only the supported Height Intent compiler operation", () => {
    expect(Object.keys(terrainCompiler).sort()).toEqual([
      "compileTerrainHeightIntentV0",
    ]);
  });
});
