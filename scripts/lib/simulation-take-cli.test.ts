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
        "package://world-package/sha256/ca6aecf73fef480b0dd4f2ec73b77448ca607c52ad060d6706eb9f730bdc9409",
      worldPackageRootHash:
        "sha256:ca6aecf73fef480b0dd4f2ec73b77448ca607c52ad060d6706eb9f730bdc9409",
      normalizedWorldIrHash:
        "sha256:ddc8777b84f26953e2a912485a2a4b7209847e3a7c6032092e1eddce03b95384",
      worldBuildIdentityHash:
        "sha256:fe0b85837b5ac55edf3af2f0945d21e24bb0f7d048802d4f231b769a6c7e8e55",
    });
  }, 30_000);
});
