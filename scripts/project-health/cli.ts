import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { sha256CanonicalJson, stringifyCanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isEqual, isNil, sortBy, uniq } from "lodash-es";

import {
  parseAcceptedProjectDebtListV1,
  parseProjectHealthProfileV1,
  parseProjectHealthReportV1,
  type ProjectHealthModeV1,
  type ProjectHealthProfileV1,
  type ProjectHealthReportV1,
} from "./contracts";
import {
  assertProjectHealthOutputPathV1,
  writeProjectHealthJsonAtomicV1,
} from "./evidence-store";
import {
  assertRegisteredProjectHealthPrIdentityV1,
  executeRegisteredProjectHealthGateV1,
  PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1,
  readProjectHealthCheckoutHeadV1,
  recordRegisteredProjectHealthGateV1,
  registeredProjectHealthGateArgvV1,
} from "./registry";
import {
  observeProjectHealthModeV1,
  projectHealthRequiredInputReadinessV1,
  type ProjectHealthValidatedGateV1,
} from "./mode-observer";
import {
  assertProjectHealthExactCleanCheckoutV1,
} from "./process-runner";
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
const PROJECT_HEALTH_REPOSITORY_ROOT = realpathSync(path.resolve(new URL("../..", import.meta.url).pathname));

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

function statusExitCode(status: "passed" | "failed" | "incomplete"): 0 | 2 | 3 {
  if (status === "passed") return 0;
  if (status === "failed") return 2;
  return 3;
}

function projectHealthOutputPath(repositoryRoot: string, requestedPath: string): string {
  const outputPath = path.resolve(repositoryRoot, requestedPath);
  const relativePath = path.relative(path.resolve(repositoryRoot), outputPath);
  if (relativePath === ".project-health" || !relativePath.startsWith(`.project-health${path.sep}`)) {
    throw new TypeError("Project Health output must stay under .project-health/.");
  }
  return outputPath;
}

async function buildCurrentProjectHealthReportV1(input: Readonly<{
  repositoryRoot: string;
  profile: ProjectHealthProfileV1;
  mode: ProjectHealthModeV1;
  commitSha: string;
  baseSha: string | null;
  checkoutSha: string;
  requestedHeadSha: string;
  isMergeCommit: boolean;
  clock: ProjectHealthClockV1;
  baseline: ProjectHealthReportV1 | null;
}>): Promise<ProjectHealthReportV1> {
  const evaluatedOn = input.clock.utcDate();
  const readiness = projectHealthRequiredInputReadinessV1({ profile: input.profile, mode: input.mode });
  const requiredGateIds = readiness.isReady
    ? sortBy(uniq([
        ...Object.values(input.profile.modesById[input.mode].requiredGateIdsBySensorId)
          .flatMap((ids) => ids ?? []),
        ...(input.mode === "pr" && !isNil(input.baseSha) ? ["change-impact-diff"] : []),
      ]))
    : [];
  const validatedGatesById = new Map<string, ProjectHealthValidatedGateV1>();
  for (const gateId of requiredGateIds) {
    const result = await executeRegisteredProjectHealthGateV1({
      repositoryRoot: input.repositoryRoot,
      profile: input.profile,
      gateId,
      commitSha: input.commitSha,
      ...(!isNil(input.baseSha) ? { baseSha: input.baseSha } : {}),
    });
    validatedGatesById.set(gateId, result);
  }
  const observations = await observeProjectHealthModeV1({
    repositoryRoot: input.repositoryRoot,
    profile: input.profile,
    mode: input.mode,
    commitSha: input.commitSha,
    baseSha: input.baseSha,
    validatedGatesById,
    checkoutSha: input.checkoutSha,
    requestedHeadSha: input.requestedHeadSha,
    isMergeCommit: input.isMergeCommit,
    evaluatedOn,
  });
  const acceptedDebt = parseAcceptedProjectDebtListV1(
    JSON.parse(await readFile(
      path.join(input.repositoryRoot, "config/project-health/accepted-debt.json"),
      "utf8",
    )),
    input.profile,
  );
  return aggregateProjectHealthReportV1({
    profile: input.profile,
    mode: input.mode,
    commitSha: input.commitSha,
    baseSha: input.baseSha,
    clock: { utcDate: () => evaluatedOn },
    observations,
    acceptedDebt,
    baseline: input.baseline,
  });
}

async function runCheck(input: Readonly<{
  argv: readonly string[];
  repositoryRoot: string;
  clock: ProjectHealthClockV1;
}>): Promise<number> {
  const args = parseArguments(
    input.argv,
    ["--mode", "--commit", "--base", "--output", "--baseline"],
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
  const actualHead = await readProjectHealthCheckoutHeadV1(input.repositoryRoot);
  const commitSha = option(args, "commit") ?? actualHead;
  if (!COMMIT_SHA.test(commitSha)) throw new TypeError("--commit must be an exact 40-character SHA.");
  if (commitSha !== actualHead) throw new TypeError("--commit must equal the exact checkout HEAD.");
  await assertProjectHealthExactCleanCheckoutV1(input.repositoryRoot);
  const baseSha = option(args, "base") ?? null;
  if (!isNil(baseSha) && !COMMIT_SHA.test(baseSha)) throw new TypeError("--base must be an exact 40-character SHA.");
  if (mode === "pr" && isNil(baseSha)) throw new TypeError("PR checks require an explicit --base exact SHA.");
  const prIdentity = mode === "pr"
    ? await assertRegisteredProjectHealthPrIdentityV1({
        repositoryRoot: input.repositoryRoot,
        baseSha: requiredOption(args, "base"),
        headSha: commitSha,
      })
    : { checkoutSha: actualHead, requestedHeadSha: commitSha, isMergeCommit: false };
  const outputPath = await assertProjectHealthOutputPathV1({
    repositoryRoot: input.repositoryRoot,
    outputPath: projectHealthOutputPath(input.repositoryRoot, requiredOption(args, "output")),
  });
  const profile = loadProfile(input.repositoryRoot);
  const modeValue = mode as ProjectHealthModeV1;
  const baselinePath = option(args, "baseline");
  const baseline = isNil(baselinePath)
    ? null
    : parseProjectHealthReportV1(
        JSON.parse(await readFile(path.resolve(input.repositoryRoot, baselinePath), "utf8")),
        profile,
      );
  const report = await buildCurrentProjectHealthReportV1({
    repositoryRoot: input.repositoryRoot,
    profile,
    mode: modeValue,
    commitSha,
    baseSha,
    checkoutSha: prIdentity.checkoutSha,
    requestedHeadSha: prIdentity.requestedHeadSha,
    isMergeCommit: prIdentity.isMergeCommit,
    clock: input.clock,
    baseline,
  });
  if (await readProjectHealthCheckoutHeadV1(input.repositoryRoot) !== commitSha) {
    throw new TypeError("Checkout HEAD changed during Project Health check.");
  }
  await assertProjectHealthExactCleanCheckoutV1(input.repositoryRoot);
  await writeProjectHealthJsonAtomicV1({ outputPath, value: report, repositoryRoot: input.repositoryRoot });
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
  const actualHead = await readProjectHealthCheckoutHeadV1(input.repositoryRoot);
  if (commitSha !== actualHead) throw new TypeError("--commit must equal the exact checkout HEAD.");
  await assertProjectHealthExactCleanCheckoutV1(input.repositoryRoot);
  const profile = loadProfile(input.repositoryRoot);
  const receipt = await recordRegisteredProjectHealthGateV1({
    repositoryRoot: input.repositoryRoot,
    profile,
    gateId: requiredOption(args, "gate"),
    commitSha,
    outputPath: projectHealthOutputPath(input.repositoryRoot, requiredOption(args, "output")),
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
  clock: ProjectHealthClockV1;
}>): Promise<number> {
  const args = parseArguments(input.argv, ["--commit", "--report", "--output"], []);
  if (!isEmpty(args.positionals)) throw new TypeError("update-baseline does not accept positional arguments.");
  const profile = loadProfile(input.repositoryRoot);
  const report = parseProjectHealthReportV1(
    JSON.parse(await readFile(path.resolve(input.repositoryRoot, requiredOption(args, "report")), "utf8")),
    profile,
  );
  if (report.mode !== "pr") {
    throw new TypeError("The single baseline accepts only PR-mode Reports.");
  }
  const commitSha = requiredOption(args, "commit");
  if (!COMMIT_SHA.test(commitSha)) throw new TypeError("--commit must be an exact 40-character SHA.");
  const actualHead = await readProjectHealthCheckoutHeadV1(input.repositoryRoot);
  if (commitSha !== actualHead) throw new TypeError("--commit must equal the exact checkout HEAD.");
  await assertProjectHealthExactCleanCheckoutV1(input.repositoryRoot);
  const selectedSensorIds = sortBy([
    ...profile.modesById[report.mode].requiredSensorIds,
    ...profile.modesById[report.mode].advisorySensorIds,
  ]);
  const expectedImplementationHashes = Object.fromEntries(selectedSensorIds.map((sensorId) => [
    sensorId,
    PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1[sensorId],
  ]));
  if (
    report.status !== "passed" ||
    report.commitSha !== commitSha ||
    report.profileHash !== sha256CanonicalJson(profile) ||
    !isEqual(report.sensorImplementationHashesBySensorId, expectedImplementationHashes)
  ) {
    throw new TypeError("Report is not an exact-tree accepted baseline identity.");
  }
  if (profile.modesById[report.mode].requiredSensorIds.some((sensorId) =>
    Object.values(report.metricsBySensorId[sensorId] ?? {}).some((metric) =>
      "status" in metric && metric.status === "not-evaluated"))) {
    throw new TypeError("Report Required evidence is not complete for baseline publication.");
  }
  const requiredBaselinePath = path.join(input.repositoryRoot, "config/project-health/baseline.json");
  const requestedBaselinePath = path.resolve(input.repositoryRoot, requiredOption(args, "output"));
  if (requestedBaselinePath !== requiredBaselinePath) {
    throw new TypeError("Baseline output must be exactly config/project-health/baseline.json.");
  }
  if (!isNil(report.baseSha) && !COMMIT_SHA.test(report.baseSha)) {
    throw new TypeError("Report baseSha must be an exact 40-character SHA.");
  }
  let reportIdentity = { checkoutSha: actualHead, requestedHeadSha: commitSha, isMergeCommit: false };
  if (report.mode === "pr") {
    if (isNil(report.baseSha)) {
      throw new TypeError("PR baseline publication requires an explicit Report baseSha.");
    }
    reportIdentity = await assertRegisteredProjectHealthPrIdentityV1({
      repositoryRoot: input.repositoryRoot,
      baseSha: report.baseSha,
      headSha: commitSha,
    });
  }
  const freshReport = await buildCurrentProjectHealthReportV1({
    repositoryRoot: input.repositoryRoot,
    profile,
    mode: report.mode,
    commitSha,
    baseSha: report.baseSha,
    checkoutSha: reportIdentity.checkoutSha,
    requestedHeadSha: reportIdentity.requestedHeadSha,
    isMergeCommit: reportIdentity.isMergeCommit,
    clock: input.clock,
    baseline: null,
  });
  if (stringifyCanonicalJson(report) !== stringifyCanonicalJson(freshReport)) {
    throw new TypeError("Disk Report does not match the fresh same-process Host Report.");
  }
  if (await readProjectHealthCheckoutHeadV1(input.repositoryRoot) !== commitSha) {
    throw new TypeError("Checkout HEAD changed before baseline publication.");
  }
  await assertProjectHealthExactCleanCheckoutV1(input.repositoryRoot);
  await writeProjectHealthJsonAtomicV1({
    outputPath: requiredBaselinePath,
    value: freshReport,
    repositoryRoot: input.repositoryRoot,
  });
  return 0;
}

export async function runProjectHealthCliV1(input: ProjectHealthCliInputV1): Promise<number> {
  const stderr = input.stderr ?? ((chunk: string) => process.stderr.write(chunk));
  const stdout = input.stdout ?? ((chunk: string) => process.stdout.write(chunk));
  try {
    const repositoryRoot = realpathSync(path.resolve(input.repositoryRoot));
    if (repositoryRoot !== PROJECT_HEALTH_REPOSITORY_ROOT) {
      throw new TypeError("Project Health CLI must execute against the checkout that owns its loaded implementation.");
    }
    const clock = input.clock ?? { utcDate: () => new Date().toISOString().slice(0, 10) };
    const [command, ...argv] = input.argv;
    if (command === "check") return await runCheck({
      argv,
      repositoryRoot,
      clock,
    });
    if (command === "record") return await runRecord({ argv, repositoryRoot });
    if (command === "explain") return await runExplain({ argv, repositoryRoot, stdout });
    if (command === "update-baseline") return await runUpdateBaseline({ argv, repositoryRoot, clock });
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
