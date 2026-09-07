import { fileURLToPath } from "node:url";

import { scanThreeWorkspace } from "../lib/three-workspace-boundary";

const violations = await scanThreeWorkspace(fileURLToPath(new URL("../..", import.meta.url)));
if (violations.length > 0) {
  process.stderr.write(violations.map(({ code, importer, specifier }) => `${code}: ${importer} -> ${specifier}`).join("\n") + "\n");
  process.exitCode = 2;
} else {
  process.stdout.write("Three workspace retirement boundary passed.\n");
}
