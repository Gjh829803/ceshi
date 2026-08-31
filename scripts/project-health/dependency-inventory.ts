import path from "node:path";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil, sortBy, uniq } from "lodash-es";

import {
  parseProjectHealthDependencyInventoryV1,
  type ProjectHealthDependencyInventoryV1,
} from "./contracts";
import { parseProjectHealthExecutionDescriptorV1 } from "./process-runner";

export const DEPENDENCY_INVENTORY_EXECUTION_DESCRIPTOR_V1 = parseProjectHealthExecutionDescriptorV1({
  kind: "project-health-execution-descriptor",
  schemaVersion: 1,
  id: "dependency-inventory",
  executionScope: "in-place-checkout",
  descendantOwnershipMode: "inherit-owner-token",
  argv: ["pnpm", "licenses", "list", "--json"],
  allowedEnvironmentVariableNames: ["COREPACK_HOME", "HOME", "PATH", "PNPM_HOME", "TMPDIR"],
  implementationHash: sha256CanonicalJson({
    id: "dependency-inventory",
    argv: ["pnpm", "licenses", "list", "--json"],
  }),
  workingDirectory: ".",
  timeoutMilliseconds: 120_000,
  maximumOutputBytes: 8 * 1024 * 1024,
});

export function projectPnpmLicenseInventoryV1(input: Readonly<{
  readonly installRoot: string;
  readonly commitSha: string;
  readonly commandHash: string;
  readonly inputFingerprint: string;
  readonly pnpmLicensesJson: unknown;
}>): ProjectHealthDependencyInventoryV1 {
  if (!path.isAbsolute(input.installRoot)) {
    throw new TypeError("installRoot must be an absolute path.");
  }
  if (
    typeof input.pnpmLicensesJson !== "object" ||
    isNil(input.pnpmLicensesJson) ||
    Array.isArray(input.pnpmLicensesJson)
  ) {
    throw new TypeError("pnpm licenses JSON must be a license-grouped object.");
  }
  const entries: Array<{
    id: string;
    packageName: string;
    version: string;
    licenseSpdxExpression: string;
  }> = [];
  for (const [licenseSpdxExpression, packages] of Object.entries(input.pnpmLicensesJson)) {
    if (!Array.isArray(packages) || isEmpty(licenseSpdxExpression.trim())) {
      throw new TypeError("pnpm licenses JSON must group packages by a SPDX license expression.");
    }
    for (const item of packages) {
      if (typeof item !== "object" || isNil(item) || Array.isArray(item)) {
        throw new TypeError("pnpm licenses JSON package rows must be objects.");
      }
      const row = item as Record<string, unknown>;
      if (typeof row.name !== "string" || isEmpty(row.name) || typeof row.version !== "string" || isEmpty(row.version)) {
        throw new TypeError("pnpm licenses JSON package rows require name and version.");
      }
      entries.push({
        id: `${row.name}@${row.version}`,
        packageName: row.name,
        version: row.version,
        licenseSpdxExpression,
      });
    }
  }
  return parseProjectHealthDependencyInventoryV1({
    kind: "project-health-dependency-inventory",
    schemaVersion: 1,
    commitSha: input.commitSha,
    packageManagerId: "pnpm@10.14.0",
    commandHash: input.commandHash,
    inputFingerprint: input.inputFingerprint,
    entries: sortBy(
      uniq(entries.map((entry) => JSON.stringify(entry))).map((entry) => JSON.parse(entry) as typeof entries[number]),
      ["packageName", "version", "licenseSpdxExpression"],
    ),
  });
}
