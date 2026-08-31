import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil, sortBy, uniq } from "lodash-es";

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
  parseProjectHealthExecutionDescriptorV1,
  runProjectHealthProcessV1,
  type ProjectHealthExecutionDescriptorV1,
} from "./process-runner";
import { CONTRACT_PARITY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/contract-parity";
import { DOCUMENTATION_TRUTH_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/documentation-truth";
import { INDEPENDENT_REVIEW_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/independent-review";
import { PERFORMANCE_SIZE_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/performance-size";
import { RUNTIME_HEALTH_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/runtime-health";
import { SUPPLEMENTAL_AUTHORITY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/supplemental-authority";
import { SUPPLY_CHAIN_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/supply-chain";
import { TEST_TOPOLOGY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/test-topology";
import { VISUAL_EVIDENCE_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/visual-evidence";
import { WORKSPACE_BOUNDARY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/workspace-boundary";

export const PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1 = Object.freeze({
  "workspace-boundary": WORKSPACE_BOUNDARY_SENSOR_IMPLEMENTATION_HASH_V1,
  "supplemental-authority": SUPPLEMENTAL_AUTHORITY_SENSOR_IMPLEMENTATION_HASH_V1,
  "contract-parity": CONTRACT_PARITY_SENSOR_IMPLEMENTATION_HASH_V1,
  "supply-chain": SUPPLY_CHAIN_SENSOR_IMPLEMENTATION_HASH_V1,
  "test-topology": TEST_TOPOLOGY_SENSOR_IMPLEMENTATION_HASH_V1,
  "runtime-health": RUNTIME_HEALTH_SENSOR_IMPLEMENTATION_HASH_V1,
  "performance-size": PERFORMANCE_SIZE_SENSOR_IMPLEMENTATION_HASH_V1,
  "visual-evidence": VISUAL_EVIDENCE_SENSOR_IMPLEMENTATION_HASH_V1,
  "documentation-truth": DOCUMENTATION_TRUTH_SENSOR_IMPLEMENTATION_HASH_V1,
  "independent-review": INDEPENDENT_REVIEW_SENSOR_IMPLEMENTATION_HASH_V1,
});

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
  "workspace-boundaries": descriptor("workspace-boundaries", ["pnpm", "verify:workspace-boundaries"]),
  "agent-self-check": descriptor("agent-self-check", ["pnpm", "check:agent-self-check"]),
  "playground-build": descriptor("playground-build", ["pnpm", "build"]),
  "tracked-tree-clean": descriptor("tracked-tree-clean", ["git", "diff", "--exit-code"]),
  "typecheck": descriptor("typecheck", ["pnpm", "typecheck"]),
  "test-census": descriptor("test-census", ["pnpm", "test:census"]),
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
  const visit = async (relativeDirectory: string): Promise<void> => {
    const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
    let entries;
    try {
      entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".project-health") continue;
      const relativePath = path.posix.join(relativeDirectory.split(path.sep).join("/"), entry.name);
      const couldMatch = selectors.some((selector) => selector.pathPrefixes.some((prefix) =>
        relativePath === prefix || relativePath.startsWith(`${prefix}/`) || prefix.startsWith(`${relativePath}/`)));
      if (!couldMatch) continue;
      if (entry.isSymbolicLink()) throw new TypeError(`Selected input must not be a symbolic link: ${relativePath}`);
      if (entry.isDirectory()) await visit(relativePath);
      else if (entry.isFile() && selectors.some((selector) => selectorMatchesPath(selector, relativePath))) {
        selected.add(relativePath);
      }
    }
  };
  await visit(".");
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

export async function recordRegisteredProjectHealthGateV1(input: Readonly<{
  repositoryRoot: string;
  profile: ProjectHealthProfileV1;
  gateId: string;
  commitSha: string;
  outputPath: string;
  baseSha?: string;
}>): Promise<ProjectHealthGateReceiptV1> {
  if (!/^[a-f0-9]{40}$/.test(input.commitSha)) {
    throw new TypeError("Gate recording requires an exact 40-character commit SHA.");
  }
  const actualHead = await readProjectHealthCheckoutHeadV1(input.repositoryRoot);
  if (actualHead !== input.commitSha) {
    throw new TypeError("Gate recording commit must equal the exact checkout HEAD.");
  }
  const outputPath = await assertProjectHealthOutputPathV1({
    repositoryRoot: input.repositoryRoot,
    outputPath: input.outputPath,
  });
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
    throw new TypeError("Gate recording checkout HEAD changed during owner execution.");
  }
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
  await writeProjectHealthJsonAtomicV1({
    outputPath,
    value: receipt,
    repositoryRoot: input.repositoryRoot,
  });
  return receipt;
}
