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
        "package://world-package/sha256/710ce805e0348c314572425018c66b9982efafe11abb93657eba9db3c44d83ad",
      worldPackageRootHash:
        "sha256:710ce805e0348c314572425018c66b9982efafe11abb93657eba9db3c44d83ad",
      normalizedWorldIrHash:
        "sha256:3f838a339c11efce180851a44b63bc9a7d516a763f3738d1f1ea7bf0b30c1fad",
      executionPlanHash:
        "sha256:efe3a70b0757c3c2f7051439521a7436fde4f1e35b0b20b08db245b5e306e13c",
    });
  }, 30_000);
});
