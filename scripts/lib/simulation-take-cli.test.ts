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
        "package://world-package/sha256/f6173512a334fb0ea45e48049f70598301098b500f4c57f83a04b6d19129d0c7",
      worldPackageRootHash:
        "sha256:f6173512a334fb0ea45e48049f70598301098b500f4c57f83a04b6d19129d0c7",
      normalizedWorldIrHash:
        "sha256:8a243603c757d8088da24bab02d7e907272e3d40bf25fc416b05c602a93dff3b",
      worldBuildIdentityHash:
        "sha256:fb8d5220eec9608169ab5e3a2c200f8d15a948d8f90c022bb32b681d312aa856",
    });
  }, 30_000);
});
