import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    // The suite includes real Havok, Playwright/Vite subprocesses, Recast, and
    // temporary Git repositories. Letting Vitest use every host core makes
    // those integration tests compete for process and CPU budgets until their
    // lifecycle assertions time out. Keep the default gate bounded; focused
    // commands can still override this explicitly from the CLI.
    maxWorkers: 4,
    minWorkers: 1,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
  },
});
