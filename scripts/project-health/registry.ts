import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil, sortBy, uniq } from "lodash-es";
import { preProcessFile } from "typescript";

import { createChangeImpactDiffDescriptorV1 } from "./change-impact";
import {
  parseProjectHealthGateReceiptV1,
  type ProjectHealthGateReceiptV1,
  type ProjectHealthInputSelectorV1,
  type ProjectHealthProfileV1,
  type ProjectHealthSensorIdV1,
} from "./contracts";
import { DEPENDENCY_INVENTORY_EXECUTION_DESCRIPTOR_V1 } from "./dependency-inventory";
import {
  assertProjectHealthOutputPathV1,
  putProjectHealthEvidenceJsonV1,
  writeProjectHealthJsonAtomicV1,
} from "./evidence-store";
import {
  assertProjectHealthExactCleanCheckoutV1,
  listProjectHealthTrackedPathsV1,
  parseProjectHealthExecutionDescriptorV1,
  runProjectHealthProcessV1,
  type ProjectHealthExecutionDescriptorV1,
  type ProjectHealthExecutionEvidenceV1,
} from "./process-runner";
import { observeContractParityV1 } from "./sensors/contract-parity";
import { observeDocumentationTruthV1 } from "./sensors/documentation-truth";
import { observeIndependentReviewV1 } from "./sensors/independent-review";
import { observePerformanceSizeV1 } from "./sensors/performance-size";
import { observeRuntimeHealthV1 } from "./sensors/runtime-health";
import { observeSupplementalAuthorityV1 } from "./sensors/supplemental-authority";
import { observeSupplyChainV1 } from "./sensors/supply-chain";
import { observeTestTopologyV1 } from "./sensors/test-topology";
import { observeVisualEvidenceV1 } from "./sensors/visual-evidence";
import { observeWorkspaceBoundaryV1 } from "./sensors/workspace-boundary";

type SensorInputWithoutImplementationHash<T extends (input: never) => unknown> =
  Omit<Parameters<T>[0], "sensorImplementationHash">;

export interface ProjectHealthSensorInputByIdV1 {
  readonly "workspace-boundary": SensorInputWithoutImplementationHash<typeof observeWorkspaceBoundaryV1>;
  readonly "supplemental-authority": SensorInputWithoutImplementationHash<typeof observeSupplementalAuthorityV1>;
  readonly "contract-parity": SensorInputWithoutImplementationHash<typeof observeContractParityV1>;
  readonly "supply-chain": SensorInputWithoutImplementationHash<typeof observeSupplyChainV1>;
  readonly "test-topology": SensorInputWithoutImplementationHash<typeof observeTestTopologyV1>;
  readonly "runtime-health": SensorInputWithoutImplementationHash<typeof observeRuntimeHealthV1>;
  readonly "performance-size": SensorInputWithoutImplementationHash<typeof observePerformanceSizeV1>;
  readonly "visual-evidence": SensorInputWithoutImplementationHash<typeof observeVisualEvidenceV1>;
  readonly "documentation-truth": SensorInputWithoutImplementationHash<typeof observeDocumentationTruthV1>;
  readonly "independent-review": SensorInputWithoutImplementationHash<typeof observeIndependentReviewV1>;
}

type RegisteredSensorImplementationV1 = Readonly<{
  id: ProjectHealthSensorIdV1;
  implementationEntryPath: string;
  observe: (input: never) => ReturnType<typeof observeWorkspaceBoundaryV1>;
}>;

export const PROJECT_HEALTH_SENSOR_REGISTRY_V1 = Object.freeze({
  "workspace-boundary": { id: "workspace-boundary", implementationEntryPath: "scripts/project-health/sensors/workspace-boundary.ts", observe: observeWorkspaceBoundaryV1 },
  "supplemental-authority": { id: "supplemental-authority", implementationEntryPath: "scripts/project-health/sensors/supplemental-authority.ts", observe: observeSupplementalAuthorityV1 },
  "contract-parity": { id: "contract-parity", implementationEntryPath: "scripts/project-health/sensors/contract-parity.ts", observe: observeContractParityV1 },
  "supply-chain": { id: "supply-chain", implementationEntryPath: "scripts/project-health/sensors/supply-chain.ts", observe: observeSupplyChainV1 },
  "test-topology": { id: "test-topology", implementationEntryPath: "scripts/project-health/sensors/test-topology.ts", observe: observeTestTopologyV1 },
  "runtime-health": { id: "runtime-health", implementationEntryPath: "scripts/project-health/sensors/runtime-health.ts", observe: observeRuntimeHealthV1 },
  "performance-size": { id: "performance-size", implementationEntryPath: "scripts/project-health/sensors/performance-size.ts", observe: observePerformanceSizeV1 },
  "visual-evidence": { id: "visual-evidence", implementationEntryPath: "scripts/project-health/sensors/visual-evidence.ts", observe: observeVisualEvidenceV1 },
  "documentation-truth": { id: "documentation-truth", implementationEntryPath: "scripts/project-health/sensors/documentation-truth.ts", observe: observeDocumentationTruthV1 },
  "independent-review": { id: "independent-review", implementationEntryPath: "scripts/project-health/sensors/independent-review.ts", observe: observeIndependentReviewV1 },
} satisfies Readonly<Record<ProjectHealthSensorIdV1, RegisteredSensorImplementationV1>>);

const CURRENT_REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

function canonicalSourceBytes(repositoryRoot: string, relativePath: string): Buffer {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  if (absolutePath === repositoryRoot || !absolutePath.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new TypeError(`Sensor implementation source escaped the repository: ${relativePath}`);
  }
  const stat = lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(absolutePath) !== absolutePath) {
    throw new TypeError(`Sensor implementation source is not a canonical regular file: ${relativePath}`);
  }
  return readFileSync(absolutePath);
}

function workspaceEntryPathByPackageId(repositoryRoot: string): ReadonlyMap<string, string> {
  const entries: Array<readonly [string, string]> = [];
  for (const parent of ["apps", "packages"] as const) {
    const parentPath = path.join(repositoryRoot, parent);
    let children;
    try {
      children = readdirSync(parentPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const child of children) {
      if (!child.isDirectory() || child.isSymbolicLink()) continue;
      const manifestPath = path.join(parentPath, child.name, "package.json");
      let manifest: { readonly name?: unknown; readonly exports?: unknown };
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as typeof manifest;
      } catch {
        continue;
      }
      if (typeof manifest.name !== "string") continue;
      const rootExport = typeof manifest.exports === "string"
        ? manifest.exports
        : typeof manifest.exports === "object" && !isNil(manifest.exports) && !Array.isArray(manifest.exports)
          ? (manifest.exports as Readonly<Record<string, unknown>>)["."]
          : null;
      if (typeof rootExport !== "string") continue;
      entries.push([manifest.name, path.posix.join(parent, child.name, rootExport.replace(/^\.\//, ""))]);
    }
  }
  return new Map(entries);
}

function resolveSourceImport(
  repositoryRoot: string,
  importerPath: string,
  specifier: string,
  workspaceEntries: ReadonlyMap<string, string>,
): string | null {
  let unresolved: string | null = null;
  if (specifier.startsWith(".")) {
    unresolved = path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), specifier));
  } else {
    const workspaceEntry = workspaceEntries.get(specifier);
    if (!isNil(workspaceEntry)) unresolved = workspaceEntry;
  }
  if (isNil(unresolved)) return null;
  for (const candidate of [unresolved, `${unresolved}.ts`, `${unresolved}.tsx`, path.posix.join(unresolved, "index.ts")]) {
    try {
      const stat = lstatSync(path.resolve(repositoryRoot, candidate));
      if (stat.isFile() && !stat.isSymbolicLink()) return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new TypeError(`Sensor implementation import cannot be resolved: ${importerPath} -> ${specifier}`);
}

function sensorImplementationSourceInventoryV1(input: Readonly<{
  repositoryRoot: string;
  entryPath: string;
}>): readonly Readonly<{ path: string; sizeBytes: number; contentHash: string }>[] {
  const repositoryRoot = realpathSync(path.resolve(input.repositoryRoot));
  const workspaceEntries = workspaceEntryPathByPackageId(repositoryRoot);
  const pending = [input.entryPath];
  const visited = new Set<string>();
  const entries: Array<Readonly<{ path: string; sizeBytes: number; contentHash: string }>> = [];
  while (!isEmpty(pending)) {
    const relativePath = pending.pop();
    if (isNil(relativePath) || visited.has(relativePath)) continue;
    visited.add(relativePath);
    const bytes = canonicalSourceBytes(repositoryRoot, relativePath);
    entries.push({
      path: relativePath,
      sizeBytes: bytes.byteLength,
      contentHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    });
    const sourceText = bytes.toString("utf8");
    for (const imported of preProcessFile(sourceText, true, true).importedFiles) {
      const resolved = resolveSourceImport(repositoryRoot, relativePath, imported.fileName, workspaceEntries);
      if (!isNil(resolved) && !visited.has(resolved)) pending.push(resolved);
    }
  }
  const lockBytes = canonicalSourceBytes(repositoryRoot, "pnpm-lock.yaml");
  entries.push({
    path: "pnpm-lock.yaml",
    sizeBytes: lockBytes.byteLength,
    contentHash: `sha256:${createHash("sha256").update(lockBytes).digest("hex")}`,
  });
  return sortBy(entries, ["path"]);
}

export function projectHealthSensorImplementationHashV1(input: Readonly<{
  repositoryRoot: string;
  sensorId: ProjectHealthSensorIdV1;
}>): string {
  const registered = PROJECT_HEALTH_SENSOR_REGISTRY_V1[input.sensorId];
  return sha256CanonicalJson({
    sensorId: input.sensorId,
    sourceInventory: sensorImplementationSourceInventoryV1({
      repositoryRoot: input.repositoryRoot,
      entryPath: registered.implementationEntryPath,
    }),
  });
}

export const PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1 = Object.freeze(Object.fromEntries(
  Object.keys(PROJECT_HEALTH_SENSOR_REGISTRY_V1).map((sensorId) => [
    sensorId,
    projectHealthSensorImplementationHashV1({
      repositoryRoot: CURRENT_REPOSITORY_ROOT,
      sensorId: sensorId as ProjectHealthSensorIdV1,
    }),
  ]),
) as Readonly<Record<ProjectHealthSensorIdV1, string>>);

export function observeRegisteredProjectHealthSensorV1<SensorId extends ProjectHealthSensorIdV1>(input: Readonly<{
  sensorId: SensorId;
  sensorInput: ProjectHealthSensorInputByIdV1[SensorId];
}>): ReturnType<typeof observeWorkspaceBoundaryV1> {
  const registered = PROJECT_HEALTH_SENSOR_REGISTRY_V1[input.sensorId];
  return registered.observe({
    ...input.sensorInput,
    sensorImplementationHash: PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1[input.sensorId],
  } as never);
}

function descriptor(id: string, argv: readonly [string, ...string[]]): ProjectHealthExecutionDescriptorV1 {
  return parseProjectHealthExecutionDescriptorV1({
    kind: "project-health-execution-descriptor",
    schemaVersion: 1,
    id,
    executionScope: "in-place-checkout",
    descendantOwnershipMode: "inherit-owner-token",
    argv,
    allowedEnvironmentVariableNames: ["COREPACK_HOME", "HOME", "PATH", "PNPM_HOME", "TMPDIR"],
    implementationHash: sha256CanonicalJson({ id, argv }),
    workingDirectory: ".",
    timeoutMilliseconds: 7_200_000,
    maximumOutputBytes: 16 * 1024 * 1024,
  });
}

export const PROJECT_HEALTH_GATE_REGISTRY_V1 = Object.freeze({
  "workspace-boundaries": descriptor("workspace-boundaries", [
    "pnpm",
    "exec",
    "tsx",
    "scripts/testing/verify-workspace-boundaries.ts",
  ]),
  "agent-self-check": descriptor("agent-self-check", ["pnpm", "check:agent-self-check"]),
  "playground-build": descriptor("playground-build", ["pnpm", "build"]),
  "tracked-tree-clean": descriptor("tracked-tree-clean", ["git", "diff", "--exit-code"]),
  "typecheck": descriptor("typecheck", ["pnpm", "typecheck"]),
  "test-census": descriptor("test-census", [
    "pnpm",
    "exec",
    "tsx",
    "scripts/testing/verify-test-gate-census.ts",
  ]),
  "test-contract": descriptor("test-contract", ["pnpm", "test:contract"]),
  "test-independent": descriptor("test-independent", ["pnpm", "test:independent"]),
  "test-resource-heavy": descriptor("test-resource-heavy", ["pnpm", "test:resource-heavy"]),
  "test-studio": descriptor("test-studio", ["pnpm", "test:studio"]),
  "unreleased-clean-break": descriptor("unreleased-clean-break", ["pnpm", "verify:unreleased-clean-break"]),
  "canonical": descriptor("canonical", ["pnpm", "verify:canonical"]),
  "control-capture": descriptor("control-capture", ["pnpm", "verify:control-capture"]),
  "g-bot-subject": descriptor("g-bot-subject", ["pnpm", "verify:g-bot-subject"]),
  "outdoor-gameplay": descriptor("outdoor-gameplay", ["pnpm", "verify:outdoor-gameplay"]),
  "placement-layout": descriptor("placement-layout", ["pnpm", "verify:placement-layout"]),
  "rigged-subject": descriptor("rigged-subject", ["pnpm", "verify:rigged-subject"]),
  "route-r0-contract": descriptor("route-r0-contract", ["pnpm", "verify:route-r0-contract"]),
  "route-r1-heightfield": descriptor("route-r1-heightfield", ["pnpm", "verify:route-r1-heightfield"]),
  "route-r1b-static-platform": descriptor("route-r1b-static-platform", ["pnpm", "verify:route-r1b-static-platform"]),
  "validation-capture": descriptor("validation-capture", ["pnpm", "verify:validation-capture"]),
  "dependency-inventory": DEPENDENCY_INVENTORY_EXECUTION_DESCRIPTOR_V1,
  "native-scene-playground": descriptor("native-scene-playground", ["pnpm", "verify:native-scene-playground"]),
  "bna1-clean-break": descriptor("bna1-clean-break", ["pnpm", "verify:bna1-clean-break"]),
  "3c-migration": descriptor("3c-migration", ["pnpm", "verify:3c-migration"]),
});

const PROJECT_HEALTH_GATE_SENSOR_IDS_V1: Readonly<Record<string, ProjectHealthSensorIdV1>> = Object.freeze({
  "workspace-boundaries": "workspace-boundary",
  "agent-self-check": "contract-parity",
  "playground-build": "contract-parity",
  "tracked-tree-clean": "contract-parity",
  typecheck: "contract-parity",
  "unreleased-clean-break": "contract-parity",
  "test-census": "test-topology",
  "test-contract": "test-topology",
  "test-independent": "test-topology",
  "test-resource-heavy": "test-topology",
  "test-studio": "test-topology",
  "change-impact-diff": "test-topology",
  "dependency-inventory": "supply-chain",
  canonical: "runtime-health",
  "control-capture": "runtime-health",
  "g-bot-subject": "runtime-health",
  "outdoor-gameplay": "runtime-health",
  "placement-layout": "runtime-health",
  "rigged-subject": "runtime-health",
  "route-r0-contract": "runtime-health",
  "route-r1-heightfield": "runtime-health",
  "route-r1b-static-platform": "runtime-health",
  "validation-capture": "runtime-health",
  "native-scene-playground": "runtime-health",
  "bna1-clean-break": "runtime-health",
  "3c-migration": "runtime-health",
});

function gateInputSelectorV1(
  profile: ProjectHealthProfileV1,
  gateId: string,
): ProjectHealthInputSelectorV1 {
  const sensorId = PROJECT_HEALTH_GATE_SENSOR_IDS_V1[gateId];
  if (isNil(sensorId)) throw new TypeError(`Gate ${gateId} has no registered Sensor input authority.`);
  return profile.inputSelectorsBySensorId[sensorId];
}

export function projectHealthGateSensorIdV1(gateId: string): ProjectHealthSensorIdV1 {
  const sensorId = PROJECT_HEALTH_GATE_SENSOR_IDS_V1[gateId];
  if (isNil(sensorId)) throw new TypeError(`Gate ${gateId} has no registered Sensor authority.`);
  return sensorId;
}

async function canonicalRepositoryRoot(repositoryRoot: string): Promise<string> {
  const requested = path.resolve(repositoryRoot);
  const stat = await lstat(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError("Repository root is not canonical.");
  return realpath(requested);
}

function selectorMatchesPath(selector: ProjectHealthInputSelectorV1, relativePath: string): boolean {
  return selector.exactPaths.includes(relativePath)
    || selector.configPaths.includes(relativePath)
    || selector.pathPrefixes.some((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`));
}

async function selectedInputPaths(
  repositoryRoot: string,
  selectors: readonly ProjectHealthInputSelectorV1[],
): Promise<readonly string[]> {
  const selected = new Set(selectors.flatMap((selector) => [...selector.exactPaths, ...selector.configPaths]));
  for (const relativePath of await listProjectHealthTrackedPathsV1(repositoryRoot)) {
    if (selectors.some((selector) => selectorMatchesPath(selector, relativePath))) {
      selected.add(relativePath);
    }
  }
  return sortBy(uniq([...selected]));
}

export async function projectHealthGateInputFingerprintsV1(input: Readonly<{
  repositoryRoot: string;
  profile: ProjectHealthProfileV1;
  gateIds: readonly string[];
}>): Promise<Readonly<Record<string, string>>> {
  const repositoryRoot = await canonicalRepositoryRoot(input.repositoryRoot);
  const selectorByGateId = Object.fromEntries(input.gateIds.map((gateId) => [
    gateId,
    gateInputSelectorV1(input.profile, gateId),
  ])) as Readonly<Record<string, ProjectHealthInputSelectorV1>>;
  const allPaths = await selectedInputPaths(repositoryRoot, Object.values(selectorByGateId));
  type SelectedInputEntryV1 = Readonly<{
    path: string;
    sha256: string | null;
    status: "present" | "missing";
  }>;
  const fileEntries = await Promise.all(allPaths.map(async (
    relativePath,
  ): Promise<readonly [string, SelectedInputEntryV1]> => {
    const absolutePath = path.resolve(repositoryRoot, relativePath);
    if (absolutePath !== repositoryRoot && !absolutePath.startsWith(`${repositoryRoot}${path.sep}`)) {
      throw new TypeError(`Selected input escaped the repository: ${relativePath}`);
    }
    try {
      const stat = await lstat(absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new TypeError(`Selected input is not a canonical regular file: ${relativePath}`);
      }
      const bytes = await readFile(absolutePath);
      return [relativePath, {
        path: relativePath,
        sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        status: "present" as const,
      }] as const;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return [relativePath, { path: relativePath, sha256: null, status: "missing" as const }] as const;
    }
  }));
  const fileByPath = new Map<string, SelectedInputEntryV1>(fileEntries);
  return Object.fromEntries(input.gateIds.map((gateId) => {
    const selector = selectorByGateId[gateId]!;
    const files = allPaths.filter((relativePath) => selectorMatchesPath(selector, relativePath)).map((relativePath) =>
      fileByPath.get(relativePath)!);
    return [gateId, sha256CanonicalJson({ gateId, selector, files })];
  }));
}

export async function projectHealthGateInputFingerprintV1(input: Readonly<{
  repositoryRoot: string;
  profile: ProjectHealthProfileV1;
  gateId: string;
}>): Promise<string> {
  const fingerprints = await projectHealthGateInputFingerprintsV1({
    repositoryRoot: input.repositoryRoot,
    profile: input.profile,
    gateIds: [input.gateId],
  });
  return fingerprints[input.gateId]!;
}

async function readExactRef(gitDirectory: string, ref: string): Promise<string | null> {
  try {
    const refPath = path.join(gitDirectory, ref);
    const stat = await lstat(refPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError("Git ref is not canonical.");
    const value = (await readFile(refPath, "utf8")).trim();
    return /^[a-f0-9]{40}$/.test(value) ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readProjectHealthCheckoutHeadV1(repositoryRoot: string): Promise<string> {
  const root = await canonicalRepositoryRoot(repositoryRoot);
  const dotGitPath = path.join(root, ".git");
  const dotGitStat = await lstat(dotGitPath);
  if (dotGitStat.isSymbolicLink() || (!dotGitStat.isDirectory() && !dotGitStat.isFile())) {
    throw new TypeError("Git directory pointer is not canonical.");
  }
  let gitDirectory: string;
  if (dotGitStat.isDirectory()) {
    gitDirectory = await realpath(dotGitPath);
  } else {
    const pointer = (await readFile(dotGitPath, "utf8")).trim();
    if (!pointer.startsWith("gitdir: ")) throw new TypeError("Unable to resolve the Git directory.");
    gitDirectory = path.resolve(root, pointer.slice("gitdir: ".length));
  }
  const headPath = path.join(gitDirectory, "HEAD");
  const headStat = await lstat(headPath);
  if (!headStat.isFile() || headStat.isSymbolicLink()) throw new TypeError("Git HEAD is not canonical.");
  const head = (await readFile(headPath, "utf8")).trim();
  if (/^[a-f0-9]{40}$/.test(head)) return head;
  if (!head.startsWith("ref: ")) throw new TypeError("Unable to resolve the exact checkout commit.");
  const ref = head.slice("ref: ".length);
  if (!/^refs\/[A-Za-z0-9._/-]+$/.test(ref) || ref.includes("..")) {
    throw new TypeError("Git HEAD ref is not canonical.");
  }
  const direct = await readExactRef(gitDirectory, ref);
  if (!isNil(direct)) return direct;
  let commonDirectory = gitDirectory;
  try {
    commonDirectory = path.resolve(gitDirectory, (await readFile(path.join(gitDirectory, "commondir"), "utf8")).trim());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const common = await readExactRef(commonDirectory, ref);
  if (!isNil(common)) return common;
  try {
    const packedRefs = await readFile(path.join(commonDirectory, "packed-refs"), "utf8");
    const match = packedRefs.split("\n").find((line) => line.endsWith(` ${ref}`));
    const value = match?.slice(0, 40) ?? "";
    if (/^[a-f0-9]{40}$/.test(value)) return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  throw new TypeError("Unable to resolve the exact checkout commit.");
}

export async function assertRegisteredProjectHealthPrIdentityV1(input: Readonly<{
  repositoryRoot: string;
  baseSha: string;
  headSha: string;
}>): Promise<Readonly<{
  checkoutSha: string;
  requestedHeadSha: string;
  isMergeCommit: false;
}>> {
  if (!/^[a-f0-9]{40}$/.test(input.baseSha) || !/^[a-f0-9]{40}$/.test(input.headSha)) {
    throw new TypeError("PR identity requires exact lowercase 40-character SHAs.");
  }
  if (input.baseSha === input.headSha) {
    throw new TypeError("PR base must precede the requested head commit.");
  }
  const checkoutSha = await readProjectHealthCheckoutHeadV1(input.repositoryRoot);
  if (checkoutSha !== input.headSha) {
    throw new TypeError("PR requested head must equal the exact checkout HEAD.");
  }
  await assertProjectHealthExactCleanCheckoutV1(input.repositoryRoot);
  const argv = ["git", "merge-base", "--is-ancestor", input.baseSha, input.headSha] as const;
  const descriptor = parseProjectHealthExecutionDescriptorV1({
    kind: "project-health-execution-descriptor",
    schemaVersion: 1,
    id: "pr-base-ancestry",
    executionScope: "in-place-checkout",
    descendantOwnershipMode: "inherit-owner-token",
    argv,
    allowedEnvironmentVariableNames: ["HOME", "PATH", "TMPDIR"],
    implementationHash: sha256CanonicalJson({
      id: "pr-base-ancestry",
      argvPrefix: ["git", "merge-base", "--is-ancestor"],
    }),
    workingDirectory: ".",
    timeoutMilliseconds: 30_000,
    maximumOutputBytes: 65_536,
  });
  const execution = await runProjectHealthProcessV1({
    repositoryRoot: input.repositoryRoot,
    descriptor,
  });
  if (execution.evidence.status === "failed" && execution.evidence.exitCode === 1) {
    throw new TypeError("PR base must be an ancestor of the exact requested head commit.");
  }
  if (execution.evidence.status !== "passed") {
    throw new TypeError("PR ancestry identity verification infrastructure failed.");
  }
  if (await readProjectHealthCheckoutHeadV1(input.repositoryRoot) !== input.headSha) {
    throw new TypeError("Checkout HEAD changed during PR ancestry verification.");
  }
  await assertProjectHealthExactCleanCheckoutV1(input.repositoryRoot);
  return { checkoutSha, requestedHeadSha: input.headSha, isMergeCommit: false };
}

export function isRegisteredProjectHealthGateIdV1(gateId: string): boolean {
  return Object.hasOwn(PROJECT_HEALTH_GATE_REGISTRY_V1, gateId) || gateId === "change-impact-diff";
}

export function admitRegisteredProjectHealthGateV1(input: Readonly<{
  gateId: string;
  baseSha?: string;
  headSha?: string;
}>): ProjectHealthExecutionDescriptorV1 {
  if (input.gateId === "change-impact-diff") {
    if (isNil(input.baseSha) || isNil(input.headSha)) {
      throw new TypeError("The registered change-impact Gate requires exact base and head SHAs.");
    }
    return createChangeImpactDiffDescriptorV1({ baseSha: input.baseSha, headSha: input.headSha });
  }
  const registered = PROJECT_HEALTH_GATE_REGISTRY_V1[input.gateId as keyof typeof PROJECT_HEALTH_GATE_REGISTRY_V1];
  if (isNil(registered)) throw new TypeError(`Gate ${input.gateId} is not registered.`);
  if (registered.descendantOwnershipMode !== "inherit-owner-token") {
    throw new TypeError("Registered Gate must inherit the Host owner token.");
  }
  return registered;
}

export function registeredProjectHealthGateArgvV1(gateId: string): readonly string[] {
  return [...admitRegisteredProjectHealthGateV1({ gateId }).argv];
}

export async function executeRegisteredProjectHealthGateV1(input: Readonly<{
  repositoryRoot: string;
  profile: ProjectHealthProfileV1;
  gateId: string;
  commitSha: string;
  baseSha?: string;
}>): Promise<Readonly<{
  receipt: ProjectHealthGateReceiptV1;
  evidence: ProjectHealthExecutionEvidenceV1;
}>> {
  if (!/^[a-f0-9]{40}$/.test(input.commitSha)) {
    throw new TypeError("Gate execution requires an exact 40-character commit SHA.");
  }
  const actualHead = await readProjectHealthCheckoutHeadV1(input.repositoryRoot);
  if (actualHead !== input.commitSha) {
    throw new TypeError("Gate execution commit must equal the exact checkout HEAD.");
  }
  await assertProjectHealthExactCleanCheckoutV1(input.repositoryRoot);
  const admitted = admitRegisteredProjectHealthGateV1({
    gateId: input.gateId,
    ...(!isNil(input.baseSha) ? { baseSha: input.baseSha } : {}),
    headSha: input.commitSha,
  });
  const inputFingerprint = await projectHealthGateInputFingerprintV1({
    repositoryRoot: input.repositoryRoot,
    profile: input.profile,
    gateId: input.gateId,
  });
  const execution = await runProjectHealthProcessV1({
    repositoryRoot: input.repositoryRoot,
    descriptor: admitted,
  });
  if (await readProjectHealthCheckoutHeadV1(input.repositoryRoot) !== input.commitSha) {
    throw new TypeError("Gate execution checkout HEAD changed during owner execution.");
  }
  await assertProjectHealthExactCleanCheckoutV1(input.repositoryRoot);
  const storedEvidence = await putProjectHealthEvidenceJsonV1({
    repositoryRoot: input.repositoryRoot,
    value: execution.evidence,
  });
  const receipt = parseProjectHealthGateReceiptV1({
    kind: "project-health-gate-receipt",
    schemaVersion: 1,
    gateId: input.gateId,
    commitSha: input.commitSha,
    inputFingerprint,
    commandHash: execution.evidence.commandHash,
    status: execution.evidence.status === "passed"
      ? "passed"
      : execution.evidence.status === "failed"
        ? "failed"
        : "incomplete",
    evidenceRef: storedEvidence.evidenceRef,
  });
  return { receipt, evidence: execution.evidence };
}

export async function recordRegisteredProjectHealthGateV1(input: Readonly<{
  repositoryRoot: string;
  profile: ProjectHealthProfileV1;
  gateId: string;
  commitSha: string;
  outputPath: string;
  baseSha?: string;
}>): Promise<ProjectHealthGateReceiptV1> {
  const outputPath = await assertProjectHealthOutputPathV1({
    repositoryRoot: input.repositoryRoot,
    outputPath: input.outputPath,
  });
  const { receipt } = await executeRegisteredProjectHealthGateV1({
    repositoryRoot: input.repositoryRoot,
    profile: input.profile,
    gateId: input.gateId,
    commitSha: input.commitSha,
    ...(!isNil(input.baseSha) ? { baseSha: input.baseSha } : {}),
  });
  await writeProjectHealthJsonAtomicV1({
    outputPath,
    value: receipt,
    repositoryRoot: input.repositoryRoot,
  });
  return receipt;
}
