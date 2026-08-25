import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INDEPENDENT_TEST_MANIFEST_V1,
  createIndependentTestCommandsV1,
  discoverIndependentTestFilesV1,
  evaluateIndependentTestGateV1,
  parseIndependentTestSelectionV1,
} from "./lib/independent-test-gate";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const selection = parseIndependentTestSelectionV1(process.argv.slice(2));
const discoveredByLane = await discoverIndependentTestFilesV1(repositoryRoot);
const report = evaluateIndependentTestGateV1({
  discoveredByLane,
  manifest: INDEPENDENT_TEST_MANIFEST_V1,
});

process.stdout.write(
  `Independent test census passed: ${report.nodeTestFiles.length} Node, ` +
    `${report.pythonTestFiles.length} Python, ${report.siteTestFiles.length} Site.\n`,
);

for (const testCommand of createIndependentTestCommandsV1(report, selection)) {
  process.stdout.write(`Running independent ${testCommand.lane} lane.\n`);
  const result = spawnSync(testCommand.command, [...testCommand.arguments], {
    cwd: path.resolve(repositoryRoot),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `INDEPENDENT_TEST_LANE_FAILED: ${testCommand.lane} exited with ${result.status ?? "no status"}.`,
    );
  }
}
