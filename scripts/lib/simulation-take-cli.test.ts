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
        "sha256:9137aa480f712728a68e70caa200f3f44849cfd45e927ba88615a6e51a8a9b06",
      normalizedWorldIrHash:
        "sha256:670cfe30b2a88254050b4d0448e80c3361ed143fd88956621c62f0eab8dd0211",
      executionPlanHash:
        "sha256:68a38a9c28f99daa19383ce06119fc8d3f0ae57feed57929f116a92ad0788ce0",
    });
  });
});
