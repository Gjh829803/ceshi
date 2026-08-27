import path from "node:path";
import { fileURLToPath } from "node:url";

import { TEST_GATE_MANIFEST_V1 } from "../lib/test-gate-manifest";
import {
  discoverVitestTestFilesV1,
  evaluateTestGateCensusV1,
} from "../lib/test-gate-census";

export async function verifyTestGateCensusV1(
  repositoryRoot: string,
): Promise<void> {
  const [rootTestFiles, contractConfigTestFiles, resourceHeavyConfigTestFiles] = await Promise.all([
    discoverVitestTestFilesV1({ repositoryRoot, configPath: "vitest.config.ts" }),
    discoverVitestTestFilesV1({ repositoryRoot, configPath: "vitest.contract.config.ts" }),
    discoverVitestTestFilesV1({ repositoryRoot, configPath: "vitest.resource-heavy.config.ts" }),
  ]);
  const report = evaluateTestGateCensusV1({
    rootTestFiles,
    contractConfigTestFiles,
    resourceHeavyConfigTestFiles,
    manifest: TEST_GATE_MANIFEST_V1,
  });
  process.stdout.write(
    `Test gate census passed: ${report.rootTestFiles.length} tests, ` +
    `${report.contractTestFiles.length} contract, ` +
    `${report.resourceHeavyTestFiles.length} resource-heavy.\n`,
  );
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  await verifyTestGateCensusV1(repositoryRoot);
}
