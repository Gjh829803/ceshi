import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createSimulationTakeWorldPackageIdentityV1,
} from "./simulation-take-cli";
import { loadWorldkitRoutePipeline } from "./worldkit-pipeline";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const WORLD_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/placement-coastal-world.json",
);

describe("createSimulationTakeWorldPackageIdentityV1", () => {
  it("builds the runtime WorldPackage identity from the canonical build receipt", async () => {
    const pipeline = await loadWorldkitRoutePipeline(WORLD_PATH);
    if (!pipeline.ok) {
      throw new Error(JSON.stringify(pipeline.diagnostics));
    }

    const identity = await createSimulationTakeWorldPackageIdentityV1(
      pipeline,
    );

    expect(identity).toEqual({
      worldPackageRef:
        "package://world-package/sha256/7fad22cf6c9eebb4a8d7abc885afa18db00bef843f1d09cbd87929f78f60e034",
      worldPackageRootHash:
        "sha256:7fad22cf6c9eebb4a8d7abc885afa18db00bef843f1d09cbd87929f78f60e034",
      normalizedWorldIrHash:
        "sha256:76d3a0afeec7eb6382ad44aa4a9c808ee523c7987c346515bd38ee34df583a1e",
      worldBuildIdentityHash:
        "sha256:ddb1a06d041ae2d6df3100e8c1a165ff0d059a5fca5261e98a8b3e3d26172f30",
    });
  }, 30_000);
});
