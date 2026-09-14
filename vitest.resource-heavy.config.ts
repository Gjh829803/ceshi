import { defineConfig } from "vitest/config";

import { TEST_GATE_MANIFEST_V1 } from "./scripts/lib/test-gate-manifest";
import { sharedVitestTestConfig } from "./vitest.shared";

export default defineConfig({
  test: {
    ...sharedVitestTestConfig,
    setupFiles: ["./scripts/testing/resource-heavy-setup.ts"],
    include: TEST_GATE_MANIFEST_V1
      .filter((entry) => entry.lane === "resource-heavy")
      .map((entry) => entry.path),
    // Isolate WASM/native state in child processes after the V8 JIT allocation
    // assertion observed in the CI worker-thread pool.
    pool: "forks",
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
  },
});
