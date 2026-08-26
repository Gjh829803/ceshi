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
        "sha256:ac5aa63e359f6148d25b253fc5a16b4532ae3eeb585e7d56d98984aeabfe7365",
      normalizedWorldIrHash:
        "sha256:d60cfe42c0887c62c19a653ded273f60bb6528b898ec945ce09a872832932ffe",
      executionPlanHash:
        "sha256:0dff5ee54663f78407f90198f82d3557e6133ee03ec78e60fe3416f37458e424",
    });
  });
});
