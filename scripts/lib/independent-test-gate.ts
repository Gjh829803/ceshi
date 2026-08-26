import { readdir } from "node:fs/promises";
import path from "node:path";

export type IndependentTestLaneV1 = "node" | "site";

export interface IndependentTestManifestEntryV1 {
  readonly path: string;
  readonly lane: IndependentTestLaneV1;
}

export interface IndependentTestDiscoveryV1 {
  readonly node: readonly string[];
  readonly site: readonly string[];
}

export interface IndependentTestGateReportV1 {
  readonly nodeTestFiles: readonly string[];
  readonly siteTestFiles: readonly string[];
}

export type IndependentTestSelectionV1 = IndependentTestLaneV1 | "all";

export interface IndependentTestCommandV1 {
  readonly lane: IndependentTestLaneV1;
  readonly command: string;
  readonly arguments: readonly string[];
}

export const INDEPENDENT_TEST_MANIFEST_V1: readonly IndependentTestManifestEntryV1[] =
  Object.freeze([
    { path: "scripts/image-delivery.test.mjs", lane: "node" },
    { path: "scripts/local-codex-task.test.mjs", lane: "node" },
    { path: "scripts/lwdp-codex-profile.test.mjs", lane: "node" },
    { path: "scripts/lwdp-generation-client.test.mjs", lane: "node" },
    { path: "scripts/seedance25-media-conformance.test.mjs", lane: "node" },
    { path: "scripts/write-lwdp-t2i-manifest.test.mjs", lane: "node" },
    {
      path: "sites/world-sdk-blueprint/tests/rendered-html.test.mjs",
      lane: "site",
    },
  ]);

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

function frozenPaths(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

export function evaluateIndependentTestGateV1(input: {
  readonly discoveredByLane: IndependentTestDiscoveryV1;
  readonly manifest: readonly IndependentTestManifestEntryV1[];
}): IndependentTestGateReportV1 {
  assertStrictlySorted("node discovery", input.discoveredByLane.node);
  assertStrictlySorted("site discovery", input.discoveredByLane.site);
  assertStrictlySorted(
    "independent manifest",
    input.manifest.map((entry) => entry.path),
  );

  const manifestByPath = new Map(
    input.manifest.map((entry) => [entry.path, entry] as const),
  );
  const discoveredLaneByPath = new Map<string, IndependentTestLaneV1>();
  for (const lane of ["node", "site"] as const) {
    for (const testPath of input.discoveredByLane[lane]) {
      const previousLane = discoveredLaneByPath.get(testPath);
      if (previousLane !== undefined) fail("DUPLICATE", testPath);
      discoveredLaneByPath.set(testPath, lane);
      const entry = manifestByPath.get(testPath);
      if (entry === undefined) fail("UNCLASSIFIED", testPath);
      if (entry.lane !== lane) fail("LANE_DRIFT", testPath);
    }
  }
  for (const entry of input.manifest) {
    const discoveredLane = discoveredLaneByPath.get(entry.path);
    if (discoveredLane === undefined) fail("STALE", entry.path);
    if (discoveredLane !== entry.lane) fail("LANE_DRIFT", entry.path);
  }

  return Object.freeze({
    nodeTestFiles: frozenPaths(input.discoveredByLane.node),
    siteTestFiles: frozenPaths(input.discoveredByLane.site),
  });
}

async function discoverMatchingFiles(input: {
  readonly repositoryRoot: string;
  readonly directory: string;
  readonly matches: (filename: string) => boolean;
}): Promise<readonly string[]> {
  const absoluteDirectory = path.join(input.repositoryRoot, input.directory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && input.matches(entry.name))
    .map((entry) => path.posix.join(input.directory, entry.name))
    .sort();
}

export async function discoverIndependentTestFilesV1(
  repositoryRoot: string,
): Promise<IndependentTestDiscoveryV1> {
  const [node, site] = await Promise.all([
    discoverMatchingFiles({
      repositoryRoot,
      directory: "scripts",
      matches: (filename) => filename.endsWith(".test.mjs"),
    }),
    discoverMatchingFiles({
      repositoryRoot,
      directory: "sites/world-sdk-blueprint/tests",
      matches: (filename) => filename.endsWith(".test.mjs"),
    }),
  ]);
  return Object.freeze({
    node: frozenPaths(node),
    site: frozenPaths(site),
  });
}

export function parseIndependentTestSelectionV1(
  arguments_: readonly string[],
): IndependentTestSelectionV1 {
  if (arguments_.length === 0) return "all";
  if (
    arguments_.length === 2 &&
    arguments_[0] === "--lane" &&
    (arguments_[1] === "node" || arguments_[1] === "site")
  ) {
    return arguments_[1];
  }
  throw new Error(
    "INDEPENDENT_TEST_ARGUMENT_INVALID: expected no arguments or '--lane node|site'.",
  );
}

export function createIndependentTestCommandsV1(
  report: IndependentTestGateReportV1,
  selection: IndependentTestSelectionV1,
): readonly IndependentTestCommandV1[] {
  const commands: readonly IndependentTestCommandV1[] = [
    {
      lane: "node",
      command: process.execPath,
      arguments: ["--test", ...report.nodeTestFiles],
    },
    {
      lane: "site",
      command: "npm",
      arguments: ["test", "--prefix", "sites/world-sdk-blueprint"],
    },
  ];
  return Object.freeze(
    commands.filter(
      (entry) => selection === "all" || entry.lane === selection,
    ),
  );
}
