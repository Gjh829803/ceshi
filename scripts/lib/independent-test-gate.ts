import { readdir } from "node:fs/promises";
import path from "node:path";

export type IndependentTestLaneV1 = "node";

export interface IndependentTestManifestEntryV1 {
  readonly path: string;
  readonly lane: IndependentTestLaneV1;
}

export interface IndependentTestDiscoveryV1 {
  readonly node: readonly string[];
}

export interface IndependentTestGateReportV1 {
  readonly nodeTestFiles: readonly string[];
}

export type IndependentTestSelectionV1 = IndependentTestLaneV1 | "all";

export interface IndependentTestCommandV1 {
  readonly lane: IndependentTestLaneV1;
  readonly command: string;
  readonly arguments: readonly string[];
}

export const INDEPENDENT_TEST_MANIFEST_V1: readonly IndependentTestManifestEntryV1[] =
  Object.freeze([
    { path: "apps/creator-cloud/creator-eval-diagnostics.test.mjs", lane: "node" },
    { path: "apps/creator-cloud/prepare-three-evaluation-site.test.mjs", lane: "node" },
    { path: "apps/creator-cloud/three-eval-asset-policy.test.mjs", lane: "node" },
    { path: "apps/creator-cloud/three-eval-effort.test.mjs", lane: "node" },
    { path: "apps/creator-cloud/three-eval-progress.test.mjs", lane: "node" },
    { path: "apps/creator-cloud/three-eval.test.mjs", lane: "node" },
    { path: "apps/creator-cloud/three-host-reliability.test.mjs", lane: "node" },
    { path: "apps/creator-cloud/three-ray-cleanup.test.mjs", lane: "node" },
    { path: "deploy/creator-evaluation/gateway.test.mjs", lane: "node" },
    { path: "deploy/three-creator-runtime/capsule.test.mjs", lane: "node" },
    { path: "packages/cloud-generation-client/lwdp-generation-client.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/batch/batch-resources.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/batch/cloud-production-run.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/batch/gpu-capture-batch.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/batch/outbox.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/cloud/cloud-scheduling.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/cloud/cloud.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/cloud/cpu-routing.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/cloud/frozen-entrypoints.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/cloud/streaming-overlay.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/integration/batch-integration.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/integration/batch.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/review/human-review-store.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/seedance/seedance-admission-service.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/seedance/seedance-preflight.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/seedance/seedance-production-budget.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/seedance/seedance-python.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/seedance/seedance-slot.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/serialization/canonical-json.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/visuals/episode-style-variants.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/visuals/vertex-event-director.test.mjs", lane: "node" },
    { path: "packages/episode-pipeline/tests/visuals/visuals.test.mjs", lane: "node" },
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
  assertStrictlySorted(
    "independent manifest",
    input.manifest.map((entry) => entry.path),
  );

  const manifestByPath = new Map(
    input.manifest.map((entry) => [entry.path, entry] as const),
  );
  const discoveredLaneByPath = new Map<string, IndependentTestLaneV1>();
  for (const lane of ["node"] as const) {
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
  });
}

async function discoverMatchingFiles(input: {
  readonly repositoryRoot: string;
  readonly directory: string;
  readonly matches: (filename: string) => boolean;
}): Promise<readonly string[]> {
  const matchedPaths: string[] = [];
  async function visit(relativeDirectory: string): Promise<void> {
    const absoluteDirectory = path.join(input.repositoryRoot, relativeDirectory);
    let entries;
    try { entries = await readdir(absoluteDirectory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    await Promise.all(entries.map(async (entry) => {
      if (["node_modules", "dist", ".git", "coverage"].includes(entry.name)) return;
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(relativePath);
      } else if (entry.isFile() && input.matches(entry.name)) {
        matchedPaths.push(relativePath);
      }
    }));
  }
  await visit(input.directory);
  return matchedPaths.sort();
}

export async function discoverIndependentTestFilesV1(
  repositoryRoot: string,
): Promise<IndependentTestDiscoveryV1> {
  const suites = await Promise.all(["deploy", "scripts", "packages", "apps"].map(directory =>
    discoverMatchingFiles({repositoryRoot, directory, matches: filename => filename.endsWith(".test.mjs")}),
  ));
  return Object.freeze({node: frozenPaths(suites.flat().sort())});
}

export function parseIndependentTestSelectionV1(
  arguments_: readonly string[],
): IndependentTestSelectionV1 {
  if (arguments_.length === 0) return "all";
  if (
    arguments_.length === 2 &&
    arguments_[0] === "--lane" &&
    arguments_[1] === "node"
  ) {
    return arguments_[1];
  }
  throw new Error(
    "INDEPENDENT_TEST_ARGUMENT_INVALID: expected no arguments or '--lane node'.",
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
  ];
  return Object.freeze(
    commands.filter(
      (entry) => selection === "all" || entry.lane === selection,
    ),
  );
}
