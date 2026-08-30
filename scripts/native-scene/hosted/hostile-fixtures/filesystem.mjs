import { writeFile } from "node:fs/promises";

try {
  await writeFile("/runner/hostile-write", "unexpected", { flag: "wx" });
  process.stdout.write("UNEXPECTED_FILESYSTEM_WRITE\n");
} catch {
  // Expected: the container root filesystem is read-only.
}
