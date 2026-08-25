import path from "node:path";

import { createVitest } from "vitest/node";

import type { TestGateManifestEntryV1 } from "./test-gate-manifest";

export type { TestGateManifestEntryV1 } from "./test-gate-manifest";

export interface TestGateCensusReportV1 {
  readonly rootTestFiles: readonly string[];
  readonly contractTestFiles: readonly string[];
  readonly resourceHeavyTestFiles: readonly string[];
}

type CensusInput = {
  readonly rootTestFiles: readonly string[];
  readonly contractConfigTestFiles: readonly string[];
  readonly resourceHeavyConfigTestFiles: readonly string[];
  readonly manifest: readonly TestGateManifestEntryV1[];
};

function fail(code: string, detail: string): never {
  throw new Error(`${code}: ${detail}`);
}

function assertCanonicalPath(value: string): void {
  const normalized = path.posix.normalize(value);
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    normalized !== value ||
    value === "." ||
    value.startsWith("../")
  ) {
    fail("OUTSIDE_ROOT", value);
  }
}

function assertStrictlySorted(label: string, values: readonly string[]): void {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) continue;
    assertCanonicalPath(value);
    const previous = values[index - 1];
    if (previous !== undefined && previous >= value) {
      if (previous === value) fail("DUPLICATE", value);
      fail("CONFIG_DRIFT", `${label} is not sorted`);
    }
  }
}

function assertManifest(manifest: readonly TestGateManifestEntryV1[]): void {
  const paths = manifest.map((entry) => entry.path);
  assertStrictlySorted("manifest", paths);
  for (const entry of manifest) {
    if (entry.lane === "resource-heavy" && (entry.reasonCodes === undefined || entry.reasonCodes.length === 0)) {
      fail("HEAVY_REASON_MISSING", entry.path);
    }
  }
}

function frozenPaths(paths: readonly string[]): readonly string[] {
  return Object.freeze([...paths]);
}

export function evaluateTestGateCensusV1(input: CensusInput): TestGateCensusReportV1 {
  assertStrictlySorted("rootTestFiles", input.rootTestFiles);
  assertStrictlySorted("contractConfigTestFiles", input.contractConfigTestFiles);
  assertStrictlySorted("resourceHeavyConfigTestFiles", input.resourceHeavyConfigTestFiles);
  assertManifest(input.manifest);

  const root = new Set(input.rootTestFiles);
  const contract = new Set(input.contractConfigTestFiles);
  const resourceHeavy = new Set(input.resourceHeavyConfigTestFiles);
  const manifestByPath = new Map(input.manifest.map((entry) => [entry.path, entry]));

  for (const file of input.rootTestFiles) {
    if (!manifestByPath.has(file)) fail("UNCLASSIFIED", file);
  }
  for (const entry of input.manifest) {
    if (!root.has(entry.path)) fail("STALE", entry.path);
  }
  for (const file of input.contractConfigTestFiles) {
    if (resourceHeavy.has(file)) fail("CONFIG_DRIFT", file);
  }
  for (const entry of input.manifest) {
    const inContract = contract.has(entry.path);
    const inResourceHeavy = resourceHeavy.has(entry.path);
    if ((entry.lane === "contract" && (!inContract || inResourceHeavy)) ||
      (entry.lane === "resource-heavy" && (!inResourceHeavy || inContract))) {
      fail("CONFIG_DRIFT", entry.path);
    }
  }
  for (const file of [...contract, ...resourceHeavy]) {
    if (!root.has(file)) fail("CONFIG_DRIFT", file);
  }

  return Object.freeze({
    rootTestFiles: frozenPaths(input.rootTestFiles),
    contractTestFiles: frozenPaths(input.contractConfigTestFiles),
    resourceHeavyTestFiles: frozenPaths(input.resourceHeavyConfigTestFiles),
  });
}

function canonicalRepositoryRelativePaths(
  paths: readonly string[],
  repositoryRoot: string,
): readonly string[] {
  const root = path.resolve(repositoryRoot);
  const relativePaths = paths.map((filePath) =>
    path.relative(root, path.resolve(filePath)).split(path.sep).join("/"),
  );
  assertStrictlySorted("discovered test files", [...relativePaths].sort());
  return frozenPaths([...relativePaths].sort());
}

export async function discoverVitestTestFilesV1(input: {
  readonly repositoryRoot: string;
  readonly configPath: string;
}): Promise<readonly string[]> {
  const vitest = await createVitest("test", {
    root: input.repositoryRoot,
    config: input.configPath,
    run: true,
    watch: false,
  });
  try {
    const specifications = await vitest.globTestSpecifications();
    return canonicalRepositoryRelativePaths(
      specifications.map((specification) => specification.moduleId),
      input.repositoryRoot,
    );
  } finally {
    await vitest.close();
  }
}
