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
        "sha256:acb1852299b596692189becb7047418ccb9209ea5b18eb289d61bd82a4e6ce1f",
      normalizedWorldIrHash:
        "sha256:5f2f459f9dc45f019d5ac813b77d4e873e8d165eff91bda054e4e442b84eac52",
      executionPlanHash:
        "sha256:e2656bf5d08d2f30c6bcab4e332994effcbb31acaf6ceb0f96d4e726202eeaa8",
    });
  });
});
