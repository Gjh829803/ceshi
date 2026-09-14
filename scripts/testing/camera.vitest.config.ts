import {defineConfig} from "vitest/config";
import resourceHeavyConfig from "../../vitest.resource-heavy.config";
import {TEST_GATE_MANIFEST_V1} from "../lib/test-gate-manifest";

// Camera maintenance includes real physics and browser consumers. Reuse the CI
// process/isolation policy; the existing manifest remains the only file list.
export default defineConfig({
  test: {
    ...resourceHeavyConfig.test,
    include: TEST_GATE_MANIFEST_V1
      .filter(entry => entry.suites?.includes("camera"))
      .map(entry => entry.path),
  },
});
