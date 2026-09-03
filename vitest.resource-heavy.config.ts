import { defineConfig } from "vitest/config";

import { TEST_GATE_MANIFEST_V1 } from "./scripts/lib/test-gate-manifest";
import { sharedVitestTestConfig } from "./vitest.shared";

export default defineConfig({
  test: {
    ...sharedVitestTestConfig,
    include: TEST_GATE_MANIFEST_V1
      .filter((entry) => entry.lane === "resource-heavy")
      .map((entry) => entry.path),
    // One worker, one file at a time. Use forks so Havok/WASM/Vite heaps from
    // an earlier file cannot accumulate into ERR_WORKER_OUT_OF_MEMORY.
    // native-package.test.ts still packs several Vite+Havok publishes into one
    // file and needs the 4 GiB NODE_OPTIONS budget from test:resource-heavy on
    // GitHub runners.
    pool: "forks",
    isolate: true,
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
  },
});
