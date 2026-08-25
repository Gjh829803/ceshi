import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  reconcileWorkspaceBoundaryDebt,
  scanWorkspaceBoundaries,
  type WorkspaceBoundaryDebtV1,
} from "./lib/workspace-boundary";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const debt = JSON.parse(
  await readFile(new URL("../config/workspace-boundary-debt.json", import.meta.url), "utf8"),
) as { schemaVersion?: unknown; entries?: unknown };
if (debt.schemaVersion !== 1 || !Array.isArray(debt.entries)) {
  throw new Error("WORKSPACE_BOUNDARY_DEBT_FILE_INVALID");
}
const violations = await scanWorkspaceBoundaries(repositoryRoot);
const errors = reconcileWorkspaceBoundaryDebt(
  violations,
  debt.entries as readonly WorkspaceBoundaryDebtV1[],
);
if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 2;
} else {
  process.stdout.write(`Workspace boundary floor passed (${violations.length} registered debt entries).\n`);
}
