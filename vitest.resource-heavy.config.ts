import { defineConfig } from "vitest/config";

import { TEST_GATE_MANIFEST_V1 } from "./scripts/lib/test-gate-manifest";
import { sharedVitestTestConfig } from "./vitest.shared";

export default defineConfig({
  test: {
    ...sharedVitestTestConfig,
    include: TEST_GATE_MANIFEST_V1
      .filter((entry) => entry.lane === "resource-heavy")
      .map((entry) => entry.path),
    pool: "threads",
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
  },
});
