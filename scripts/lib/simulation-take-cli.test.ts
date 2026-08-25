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
        "sha256:5806c6e5cc705cbf9b7a0b4e4d4b4bfe2c1561290ad41319fc67deef3c41add5",
      normalizedWorldIrHash:
        "sha256:753e12b2741055bc1216345e1e05d97a9230c8578296cd29006d65a5d1ccafd6",
      executionPlanHash:
        "sha256:6dd96b04788546dceb35d52c4891c200c597796d820a9a1b5c213d60de64f1c4",
    });
  });
});
