import { readFile } from "node:fs/promises";

try {
  await readFile("/tmp/worldkit-cross-run-canary", "utf8");
  process.stdout.write("UNEXPECTED_CROSS_RUN_CANARY\n");
} catch {
  // Expected: every container owns a fresh request-scoped tmpfs.
}
