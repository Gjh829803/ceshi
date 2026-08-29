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
        "package://world-package/sha256/74593c1fedf3c6cca006329bc6f995a0da6e6ee27689d2e6140ab8afe98de849",
      worldPackageRootHash:
        "sha256:74593c1fedf3c6cca006329bc6f995a0da6e6ee27689d2e6140ab8afe98de849",
      normalizedWorldIrHash:
        "sha256:3f838a339c11efce180851a44b63bc9a7d516a763f3738d1f1ea7bf0b30c1fad",
      worldBuildIdentityHash:
        "sha256:f25576c1c46a6075b7f60387aa0aefc186b727e59c76fef52fede2ea864dff02",
    });
  }, 30_000);
});
