import path from "node:path";
import { fileURLToPath } from "node:url";

import { TEST_GATE_MANIFEST_V1 } from "../lib/test-gate-manifest";
import {
  discoverVitestTestFilesV1,
  evaluateTestGateCensusV1,
  type TestGateCensusReportV1,
} from "../lib/test-gate-census";

export async function verifyTestGateCensusV1(
  repositoryRoot: string,
): Promise<TestGateCensusReportV1> {
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
  return report;
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const report = await verifyTestGateCensusV1(repositoryRoot);
  process.stdout.write(typeof process.env.PROJECT_HEALTH_OUTPUT_ROOT === "string"
    ? `${JSON.stringify(report)}\n`
    : `Test gate census passed: ${report.rootTestFiles.length} tests, ` +
      `${report.contractTestFiles.length} contract, ` +
      `${report.resourceHeavyTestFiles.length} resource-heavy.\n`);
}
