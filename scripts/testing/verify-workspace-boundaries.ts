import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  reconcileWorkspaceBoundaryDebt,
  scanWorkspaceBoundaries,
  type WorkspaceBoundaryDebtV1,
} from "../lib/workspace-boundary";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const debt = JSON.parse(
  await readFile(new URL("../../config/workspace-boundary-debt.json", import.meta.url), "utf8"),
) as { schemaVersion?: unknown; entries?: unknown };
if (debt.schemaVersion !== 1 || !Array.isArray(debt.entries)) {
  throw new Error("WORKSPACE_BOUNDARY_DEBT_FILE_INVALID");
}
const commitShaFromEnv = process.env.WORLDKIT_COMMIT_SHA;
const commitSha = typeof commitShaFromEnv === "string" && /^[a-f0-9]{40}$/.test(commitShaFromEnv)
  ? commitShaFromEnv
  : execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
  }).trim();
const evidence = await scanWorkspaceBoundaries({ repositoryRoot, commitSha });
const errors = reconcileWorkspaceBoundaryDebt(
  evidence.violations,
  debt.entries as readonly WorkspaceBoundaryDebtV1[],
);
if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 2;
} else {
  process.stdout.write(
    `Workspace boundary floor passed (${evidence.violations.length} registered debt entries; ${evidence.publicSymbols.length} public symbols).\n`,
  );
}
