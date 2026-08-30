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
        "package://world-package/sha256/f5a197fcd304f2c7d19cf742cd4f61d1698208d1859241361a49b80a75d6e19e",
      worldPackageRootHash:
        "sha256:f5a197fcd304f2c7d19cf742cd4f61d1698208d1859241361a49b80a75d6e19e",
      normalizedWorldIrHash:
        "sha256:dd6ca5cbbe6532ba3c347d12f3537b455abd861d4c9fcc2082294e4ef70e6191",
      worldBuildIdentityHash:
        "sha256:25113831a21c837d4ea742e16abf0fb396d050fb4d5e2249523dfd5ce127a8bf",
    });
  }, 30_000);
});
