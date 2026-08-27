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
        "package://world-package/sha256/8dd52f869efbbeac7eb1f7ccb901c68ba8634e4ffe666a8268de66757f711fc6",
      worldPackageRootHash:
        "sha256:8dd52f869efbbeac7eb1f7ccb901c68ba8634e4ffe666a8268de66757f711fc6",
      normalizedWorldIrHash:
        "sha256:3f838a339c11efce180851a44b63bc9a7d516a763f3738d1f1ea7bf0b30c1fad",
      executionPlanHash:
        "sha256:bea6f477437b85dae1932c807a6ad8bb55026e6b5dff18038fd963228db6ae94",
    });
  });
});
