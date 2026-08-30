import { writeFile } from "node:fs/promises";

await writeFile("/tmp/worldkit-cross-run-canary", "tenant-a", {
  flag: "wx",
  mode: 0o600,
});
