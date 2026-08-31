import { readFileSync, readdirSync, statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isEqual, isNil, sortBy, uniq } from "lodash-es";

import {
  parseAcceptedProjectDebtListV1,
  parseIndependentReviewReceiptV1,
  parseProjectHealthGateReceiptV1,
  parseProjectHealthProfileV1,
  parseProjectHealthReportV1,
  type ProjectHealthModeV1,
  type ProjectHealthProfileV1,
} from "./contracts";
import { writeProjectHealthJsonAtomicV1 } from "./evidence-store";
import {
  admitRegisteredProjectHealthGateV1,
  PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1,
  recordRegisteredProjectHealthGateV1,
  registeredProjectHealthGateArgvV1,
} from "./registry";
import { aggregateProjectHealthReportV1, type ProjectHealthClockV1 } from "./report";

interface ProjectHealthCliInputV1 {
  readonly argv: readonly string[];
  readonly repositoryRoot: string;
  readonly clock?: ProjectHealthClockV1;
  readonly stdout?: (chunk: string) => void;
  readonly stderr?: (chunk: string) => void;
}

interface ParsedArgumentsV1 {
  readonly positionals: readonly string[];
  readonly options: Readonly<Record<string, string>>;
  readonly flags: ReadonlySet<string>;
}

const COMMIT_SHA = /^[a-f0-9]{40}$/;

function parseArguments(
  argv: readonly string[],
  valueOptionNames: readonly string[],
  flagNames: readonly string[],
): ParsedArgumentsV1 {
  const values = new Set(valueOptionNames);
  const flags = new Set(flagNames);
  const options: Record<string, string> = {};
  const presentFlags = new Set<string>();
  const positionals: string[] = [];
  const normalized = argv.filter((entry) => entry !== "--");
  for (let index = 0; index < normalized.length; index += 1) {
    const entry = normalized[index]!;
    if (!entry.startsWith("--")) {
      positionals.push(entry);
      continue;
    }
    if (flags.has(entry)) {
      if (presentFlags.has(entry)) throw new TypeError(`Duplicate flag ${entry}.`);
      presentFlags.add(entry);
      continue;
    }
    if (!values.has(entry)) throw new TypeError(`Unknown option ${entry}.`);
    const value = normalized[index + 1];
    if (isNil(value) || value.startsWith("--") || !isNil(options[entry])) {
      throw new TypeError(`Option ${entry} requires exactly one value.`);
    }
    options[entry] = value;
    index += 1;
  }
  return { positionals, options, flags: presentFlags };
}

function option(argumentsValue: ParsedArgumentsV1, name: string): string | undefined {
  return argumentsValue.options[`--${name}`];
}

function requiredOption(argumentsValue: ParsedArgumentsV1, name: string): string {
  const value = option(argumentsValue, name);
  if (isNil(value) || isEmpty(value)) throw new TypeError(`--${name} is required.`);
  return value;
}

function repositoryPaths(repositoryRoot: string): readonly string[] {
  const ignored = new Set([".git", ".project-health", "node_modules"]);
  const paths: string[] = [];
  const visit = (relativeRoot: string): void => {
    const absoluteRoot = relativeRoot === "." ? repositoryRoot : path.join(repositoryRoot, relativeRoot);
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const relativePath = relativeRoot === "." ? entry.name : `${relativeRoot}/${entry.name}`;
      if (entry.isDirectory()) visit(relativePath);
      else if (entry.isFile()) paths.push(relativePath);
    }
  };
  visit(".");
  return sortBy(uniq(paths));
}

function workspacePackageIds(repositoryRoot: string): readonly string[] {
  const manifests = ["package.json"];
  for (const parent of ["apps", "packages"]) {
    const parentPath = path.join(repositoryRoot, parent);
    if (!statSync(parentPath).isDirectory()) continue;
    for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(`${parent}/${entry.name}/package.json`);
    }
  }
  return sortBy(uniq(manifests.flatMap((manifestPath) => {
    try {
      const manifest = JSON.parse(readFileSync(path.join(repositoryRoot, manifestPath), "utf8")) as {
        readonly name?: unknown;
      };
      return typeof manifest.name === "string" ? [manifest.name] : [];
    } catch {
      return [];
    }
  })));
}

function loadProfile(repositoryRoot: string): ProjectHealthProfileV1 {
  const input = JSON.parse(readFileSync(path.join(repositoryRoot, "config/project-health/profile.json"), "utf8"));
  return parseProjectHealthProfileV1(input, {
    repositoryPaths: repositoryPaths(repositoryRoot),
    workspacePackageIds: workspacePackageIds(repositoryRoot),
  });
}

function readCurrentCommitSha(repositoryRoot: string): string {
  const dotGitPath = path.join(repositoryRoot, ".git");
  const dotGitStat = statSync(dotGitPath);
  const gitDirectory = dotGitStat.isDirectory()
    ? dotGitPath
    : (() => {
        const dotGit = readFileSync(dotGitPath, "utf8").trim();
        if (!dotGit.startsWith("gitdir:")) throw new TypeError("Unable to resolve the Git directory.");
        return path.resolve(repositoryRoot, dotGit.slice("gitdir:".length).trim());
      })();
  const head = readFileSync(path.join(gitDirectory, "HEAD"), "utf8").trim();
  if (COMMIT_SHA.test(head)) return head;
  if (!head.startsWith("ref: ")) throw new TypeError("Unable to resolve the exact checkout commit.");
  const ref = head.slice("ref: ".length);
  const directRef = path.join(gitDirectory, ref);
  try {
    const value = readFileSync(directRef, "utf8").trim();
    if (COMMIT_SHA.test(value)) return value;
  } catch {
    // Worktrees normally keep branch refs in the common Git directory.
  }
  const commonDirectory = dotGitStat.isDirectory()
    ? gitDirectory
    : path.resolve(gitDirectory, readFileSync(path.join(gitDirectory, "commondir"), "utf8").trim());
  try {
    const value = readFileSync(path.join(commonDirectory, ref), "utf8").trim();
    if (COMMIT_SHA.test(value)) return value;
  } catch {
    const packedRefs = readFileSync(path.join(commonDirectory, "packed-refs"), "utf8");
    const match = packedRefs.split("\n").find((line) => line.endsWith(` ${ref}`));
    const value = match?.slice(0, 40) ?? "";
    if (COMMIT_SHA.test(value)) return value;
  }
  throw new TypeError("Unable to resolve the exact checkout commit.");
}

async function readReceiptDirectory(input: Readonly<{
  directoryPath: string | undefined;
  commitSha: string;
  baseSha: string | null;
  profile: ProjectHealthProfileV1;
}>): Promise<Readonly<{
  observations: readonly unknown[];
  hasInvalidExactHeadEvidence: boolean;
}>> {
  if (isNil(input.directoryPath)) return { observations: [], hasInvalidExactHeadEvidence: false };
  let names: readonly string[];
  try {
    names = sortBy((await readdir(input.directoryPath)).filter((entry) => entry.endsWith(".json")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { observations: [], hasInvalidExactHeadEvidence: false };
    }
    throw error;
  }
  const observations: unknown[] = [];
  let hasInvalidExactHeadEvidence = false;
  for (const name of names) {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(path.join(input.directoryPath, name), "utf8"));
    } catch {
      hasInvalidExactHeadEvidence = true;
      continue;
    }
    const kind = typeof value === "object" && !isNil(value) && !Array.isArray(value)
      ? (value as { kind?: unknown }).kind
      : null;
    if (kind === "project-health-observation") {
      observations.push(value);
      continue;
    }
    if (kind === "project-health-gate-receipt") {
      try {
        const receipt = parseProjectHealthGateReceiptV1(value);
        const descriptor = admitRegisteredProjectHealthGateV1({
          gateId: receipt.gateId,
          ...(receipt.gateId === "change-impact-diff" && !isNil(input.baseSha)
            ? { baseSha: input.baseSha, headSha: input.commitSha }
            : {}),
        });
        if (receipt.commitSha !== input.commitSha || receipt.commandHash !== sha256CanonicalJson(descriptor)) {
          hasInvalidExactHeadEvidence = true;
        }
      } catch {
        hasInvalidExactHeadEvidence = true;
      }
      continue;
    }
    if (kind === "independent-review-receipt") {
      try {
        const receipt = parseIndependentReviewReceiptV1(value, input.profile);
        if (receipt.commitSha !== input.commitSha || receipt.status === "incomplete" ||
          Object.values(receipt.dispositionsByFingerprint).includes("pending-host-review")) {
          observations.push({ kind: "project-health-observation", sensorId: "independent-review" });
        }
      } catch {
        observations.push({ kind: "project-health-observation", sensorId: "independent-review" });
      }
      continue;
    }
  }
  return { observations, hasInvalidExactHeadEvidence };
}

function statusExitCode(status: "passed" | "failed" | "incomplete"): 0 | 2 | 3 {
  if (status === "passed") return 0;
  if (status === "failed") return 2;
  return 3;
}

async function runCheck(input: Readonly<{
  argv: readonly string[];
  repositoryRoot: string;
  clock: ProjectHealthClockV1;
}>): Promise<number> {
  const args = parseArguments(
    input.argv,
    ["--mode", "--commit", "--base", "--receipts", "--output", "--baseline"],
    [],
  );
  if (!isEmpty(args.positionals)) throw new TypeError("check does not accept positional arguments.");
  const mode = requiredOption(args, "mode");
  if (mode !== "pr" && mode !== "nightly" && mode !== "release") {
    throw new TypeError("--mode must be pr, nightly, or release.");
  }
  if (mode === "release" && isNil(option(args, "commit"))) {
    throw new TypeError("Release checks require an explicit --commit exact SHA.");
  }
  const commitSha = option(args, "commit") ?? readCurrentCommitSha(input.repositoryRoot);
  if (!COMMIT_SHA.test(commitSha)) throw new TypeError("--commit must be an exact 40-character SHA.");
  const baseSha = option(args, "base") ?? null;
  if (!isNil(baseSha) && !COMMIT_SHA.test(baseSha)) throw new TypeError("--base must be an exact 40-character SHA.");
  const outputPath = path.resolve(input.repositoryRoot, requiredOption(args, "output"));
  const profile = loadProfile(input.repositoryRoot);
  const loaded = await readReceiptDirectory({
    directoryPath: isNil(option(args, "receipts"))
      ? undefined
      : path.resolve(input.repositoryRoot, option(args, "receipts")!),
    commitSha,
    baseSha,
    profile,
  });
  const observations = [...loaded.observations];
  if (loaded.hasInvalidExactHeadEvidence) {
    observations.push({ kind: "project-health-observation", sensorId: "test-topology" });
  }
  const acceptedDebt = parseAcceptedProjectDebtListV1(
    JSON.parse(await readFile(path.join(input.repositoryRoot, "config/project-health/accepted-debt.json"), "utf8")),
    profile,
  );
  const baselinePath = option(args, "baseline");
  const baseline = isNil(baselinePath)
    ? null
    : parseProjectHealthReportV1(
        JSON.parse(await readFile(path.resolve(input.repositoryRoot, baselinePath), "utf8")),
        profile,
      );
  const report = aggregateProjectHealthReportV1({
    profile,
    mode: mode as ProjectHealthModeV1,
    commitSha,
    baseSha,
    clock: input.clock,
    observations,
    acceptedDebt,
    baseline,
  });
  await writeProjectHealthJsonAtomicV1({ outputPath, value: report });
  return statusExitCode(report.status);
}

async function runRecord(input: Readonly<{
  argv: readonly string[];
  repositoryRoot: string;
}>): Promise<number> {
  const args = parseArguments(input.argv, ["--gate", "--commit", "--output", "--base"], []);
  if (!isEmpty(args.positionals)) throw new TypeError("record does not accept positional arguments.");
  const commitSha = requiredOption(args, "commit");
  if (!COMMIT_SHA.test(commitSha)) throw new TypeError("--commit must be an exact 40-character SHA.");
  const receipt = await recordRegisteredProjectHealthGateV1({
    repositoryRoot: input.repositoryRoot,
    gateId: requiredOption(args, "gate"),
    commitSha,
    outputPath: path.resolve(input.repositoryRoot, requiredOption(args, "output")),
    ...(!isNil(option(args, "base")) ? { baseSha: option(args, "base")! } : {}),
  });
  return statusExitCode(receipt.status);
}

async function runExplain(input: Readonly<{
  argv: readonly string[];
  repositoryRoot: string;
  stdout: (chunk: string) => void;
}>): Promise<number> {
  const args = parseArguments(input.argv, ["--fingerprint"], ["--json"]);
  if (args.positionals.length !== 1) throw new TypeError("explain requires exactly one Report path.");
  const profile = loadProfile(input.repositoryRoot);
  const report = parseProjectHealthReportV1(
    JSON.parse(await readFile(path.resolve(input.repositoryRoot, args.positionals[0]!), "utf8")),
    profile,
  );
  const fingerprint = option(args, "fingerprint");
  const findings = isNil(fingerprint)
    ? report.findings
    : report.findings.filter((finding) => finding.fingerprint === fingerprint);
  if (isEmpty(findings)) throw new TypeError("No Finding matches the requested fingerprint.");
  const payloads = findings.map((finding) => ({
    ...finding,
    debtState: report.debtStatesByFingerprint[finding.fingerprint],
    suggestedCommand: isNil(finding.suggestedGateId)
      ? null
      : registeredProjectHealthGateArgvV1(finding.suggestedGateId),
  }));
  const payload = payloads.length === 1 ? payloads[0] : payloads;
  input.stdout(args.flags.has("--json")
    ? `${JSON.stringify(payload)}\n`
    : `${JSON.stringify(payload, null, 2)}\n`);
  return 0;
}

async function runUpdateBaseline(input: Readonly<{
  argv: readonly string[];
  repositoryRoot: string;
}>): Promise<number> {
  const args = parseArguments(input.argv, ["--commit", "--report", "--output"], []);
  if (!isEmpty(args.positionals)) throw new TypeError("update-baseline does not accept positional arguments.");
  const profile = loadProfile(input.repositoryRoot);
  const report = parseProjectHealthReportV1(
    JSON.parse(await readFile(path.resolve(input.repositoryRoot, requiredOption(args, "report")), "utf8")),
    profile,
  );
  const commitSha = requiredOption(args, "commit");
  if (!COMMIT_SHA.test(commitSha)) throw new TypeError("--commit must be an exact 40-character SHA.");
  const selectedSensorIds = sortBy([
    ...profile.modesById[report.mode].requiredSensorIds,
    ...profile.modesById[report.mode].advisorySensorIds,
  ]);
  const expectedImplementationHashes = Object.fromEntries(selectedSensorIds.map((sensorId) => [
    sensorId,
    PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1[sensorId],
  ]));
  if (
    report.commitSha !== commitSha ||
    report.profileHash !== sha256CanonicalJson(profile) ||
    !isEqual(report.sensorImplementationHashesBySensorId, expectedImplementationHashes)
  ) {
    throw new TypeError("Report identity does not match the requested baseline identity.");
  }
  await writeProjectHealthJsonAtomicV1({
    outputPath: path.resolve(input.repositoryRoot, requiredOption(args, "output")),
    value: report,
  });
  return 0;
}

export async function runProjectHealthCliV1(input: ProjectHealthCliInputV1): Promise<number> {
  const stderr = input.stderr ?? ((chunk: string) => process.stderr.write(chunk));
  const stdout = input.stdout ?? ((chunk: string) => process.stdout.write(chunk));
  const repositoryRoot = path.resolve(input.repositoryRoot);
  const clock = input.clock ?? { utcDate: () => new Date().toISOString().slice(0, 10) };
  const [command, ...argv] = input.argv;
  try {
    if (command === "check") return await runCheck({ argv, repositoryRoot, clock });
    if (command === "record") return await runRecord({ argv, repositoryRoot });
    if (command === "explain") return await runExplain({ argv, repositoryRoot, stdout });
    if (command === "update-baseline") return await runUpdateBaseline({ argv, repositoryRoot });
    throw new TypeError("Expected check, record, explain, or update-baseline command.");
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (!isNil(invokedPath) && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) {
  const repositoryRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  process.exitCode = await runProjectHealthCliV1({ argv: process.argv.slice(2), repositoryRoot });
}
