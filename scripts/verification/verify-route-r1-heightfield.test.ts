import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  runExactAdversarialVitestCheckV1,
} from "./verify-route-r1-heightfield.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("verify:route-r1-heightfield", () => {
  it("fails closed when an exact adversarial test name matches no executed test", async () => {
    await expect(runExactAdversarialVitestCheckV1({
      repositoryRoot,
      checkId: "deliberate-no-match",
      testFile: "packages/traversal-recast/src/recast-config.test.ts",
      expectedTestFullNames: [
        "Recast tiled config mapping this exact test does not exist",
      ],
    })).rejects.toThrow("ADVERSARIAL_CHECK_TEST_NOT_EXECUTED");
  }, 30_000);

});
