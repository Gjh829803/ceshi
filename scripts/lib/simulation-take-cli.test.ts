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
        "worldkit://world-package/placement-coastal-world.20310417@1",
      worldPackageRootHash:
        "sha256:3f3daf9970f36f64bbe254d20ce56a266468a7b2f73bd0e6cfe70c1d560add32",
      normalizedWorldIrHash:
        "sha256:f2f6d79546255eb09676a2db9a68502c0f02d486a91f074856499a985671f55d",
      executionPlanHash:
        "sha256:e0f39f3df76b4dfa919caf0a8275dbfcd34b812a1208565c42c7b5e1fe41b268",
    });
  });
});
