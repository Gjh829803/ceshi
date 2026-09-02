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
        "package://world-package/sha256/2d0424bdcca116c51f230e318a78da3472b4a8de3a5f689c907c5e3c4c8a54bd",
      worldPackageRootHash:
        "sha256:2d0424bdcca116c51f230e318a78da3472b4a8de3a5f689c907c5e3c4c8a54bd",
      normalizedWorldIrHash:
        "sha256:8a243603c757d8088da24bab02d7e907272e3d40bf25fc416b05c602a93dff3b",
      worldBuildIdentityHash:
        "sha256:83b120e34727ab6ad7aef3029a96912586815cc55b0f908d40050671612a64c5",
    });
  }, 30_000);
});
