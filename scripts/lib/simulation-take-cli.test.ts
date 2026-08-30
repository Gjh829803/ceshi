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
        "package://world-package/sha256/2a8298a5d5c771d6a2dd1c59f6775ff61a0616381c567d3370a59383581e96d2",
      worldPackageRootHash:
        "sha256:2a8298a5d5c771d6a2dd1c59f6775ff61a0616381c567d3370a59383581e96d2",
      normalizedWorldIrHash:
        "sha256:dd6ca5cbbe6532ba3c347d12f3537b455abd861d4c9fcc2082294e4ef70e6191",
      worldBuildIdentityHash:
        "sha256:d532a567f9dc6baa4a9de2b85c575df3d041e66b47b3f7839fcec343f6d79d09",
    });
  }, 30_000);
});
