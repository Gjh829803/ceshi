import { execFile, execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { afterEach, describe, expect, it } from "vitest";

import { runProjectHealthCliV1 } from "./cli";
import {
  parseProjectHealthFindingV1,
  parseProjectHealthObservationV1,
  parseProjectHealthProfileV1,
  parseProjectHealthReportV1,
  projectHealthFindingFingerprintV1,
  type ProjectHealthFindingV1,
  type ProjectHealthMetricV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
  type ProjectHealthSensorIdV1,
} from "./contracts";
import { CONTRACT_PARITY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/contract-parity";
import { DOCUMENTATION_TRUTH_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/documentation-truth";
import { SUPPLEMENTAL_AUTHORITY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/supplemental-authority";
import { SUPPLY_CHAIN_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/supply-chain";
import { TEST_TOPOLOGY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/test-topology";
import { WORKSPACE_BOUNDARY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/workspace-boundary";

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const COMMIT_SHA = "c".repeat(40);
const EVIDENCE_A = `sha256:${"a".repeat(64)}`;
const IMPLEMENTATION_HASHES = {
  "workspace-boundary": WORKSPACE_BOUNDARY_SENSOR_IMPLEMENTATION_HASH_V1,
  "supplemental-authority": SUPPLEMENTAL_AUTHORITY_SENSOR_IMPLEMENTATION_HASH_V1,
  "contract-parity": CONTRACT_PARITY_SENSOR_IMPLEMENTATION_HASH_V1,
  "supply-chain": SUPPLY_CHAIN_SENSOR_IMPLEMENTATION_HASH_V1,
  "test-topology": TEST_TOPOLOGY_SENSOR_IMPLEMENTATION_HASH_V1,
  "documentation-truth": DOCUMENTATION_TRUTH_SENSOR_IMPLEMENTATION_HASH_V1,
} as const;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8"));
}

function parsedProfile(): ProjectHealthProfileV1 {
  const repositoryPaths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);
  const workspacePackageIds = ["package.json", ...[
    ...readdirSync(path.join(REPOSITORY_ROOT, "packages"), { withFileTypes: true }),
    ...readdirSync(path.join(REPOSITORY_ROOT, "apps"), { withFileTypes: true }),
  ].filter((entry) => entry.isDirectory()).map((entry) => {
    const parent = readdirSync(path.join(REPOSITORY_ROOT, "packages"), { withFileTypes: true })
      .some((candidate) => candidate.name === entry.name)
      ? "packages"
      : "apps";
    return `${parent}/${entry.name}/package.json`;
  })].flatMap((manifestPath) => {
    try {
      const manifest = readJson(manifestPath) as { readonly name?: unknown };
      return typeof manifest.name === "string" ? [manifest.name] : [];
    } catch {
      return [];
    }
  });
  return parseProjectHealthProfileV1(readJson("config/project-health/profile.json"), {
    repositoryPaths,
    workspacePackageIds,
  });
}

function passingMetric(sensorId: ProjectHealthSensorIdV1, metricId: string): ProjectHealthMetricV1 {
  if (metricId === "workspace-boundary-debt-count") {
    return { id: metricId, kind: "count", valueCount: 49 };
  }
  if (sensorId === "performance-size") return { id: metricId, kind: "bytes", valueBytes: 1_000 };
  return { id: metricId, kind: "boolean", value: true };
}

function observation(
  profile: ProjectHealthProfileV1,
  sensorId: keyof typeof IMPLEMENTATION_HASHES,
  findings: readonly ProjectHealthFindingV1[] = [],
): ProjectHealthObservationV1 {
  const metricIds = Object.entries(profile.metricPoliciesById)
    .filter(([, policy]) => policy.sensorId === sensorId)
    .map(([metricId]) => metricId);
  const metricsById = Object.fromEntries(metricIds.map((metricId) => [metricId, passingMetric(sensorId, metricId)]));
  const status = findings.some((finding) => finding.policy === "blocking-p0" || finding.policy === "blocking-p1")
    ? "failed"
    : "passed";
  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId,
    sensorImplementationHash: IMPLEMENTATION_HASHES[sensorId],
    inputFingerprint: EVIDENCE_A,
    status,
    metricsById,
    findings,
    evidenceRefs: [EVIDENCE_A],
  }, profile);
}

function generatedDrift(profile: ProjectHealthProfileV1): ProjectHealthFindingV1 {
  return parseProjectHealthFindingV1({
    kind: "project-health-finding",
    schemaVersion: 1,
    fingerprint: projectHealthFindingFingerprintV1({
      sensorId: "contract-parity",
      code: "PROJECT_HEALTH_GENERATED_DRIFT",
      subjectRefs: ["package:builder"],
      evidenceClassIds: ["generated-byte-parity"],
    }),
    sensorId: "contract-parity",
    policy: "blocking-p1",
    dimension: "D2",
    code: "PROJECT_HEALTH_GENERATED_DRIFT",
    ownerId: "builder-self-check",
    subjectRefs: ["package:builder"],
    evidenceClassIds: ["generated-byte-parity"],
    metricIds: ["generated-bytes-current"],
    evidenceRefs: [EVIDENCE_A],
    expected: "Tracked generated bytes equal the canonical Builder output.",
    impact: "A stale generated bundle can execute behavior different from source.",
    suggestedGateId: "agent-self-check",
  }, profile);
}

async function writeObservations(
  directory: string,
  observations: readonly ProjectHealthObservationV1[],
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await Promise.all(observations.map((entry) => writeFile(
    path.join(directory, `${entry.sensorId}.json`),
    `${JSON.stringify(entry, null, 2)}\n`,
    "utf8",
  )));
}

async function runCli(argv: readonly string[], clockDate = "2026-08-31"): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runProjectHealthCliV1({
    argv,
    repositoryRoot: REPOSITORY_ROOT,
    clock: { utcDate: () => clockDate },
    stdout: (chunk) => {
      stdout.push(chunk);
    },
    stderr: (chunk) => {
      stderr.push(chunk);
    },
  });
  return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

describe("project health cli", () => {
  it("exposes the frozen health command family and rejects check baseline writes", async () => {
    const packageJson = readJson("package.json") as { readonly scripts: Readonly<Record<string, string>> };
    expect(packageJson.scripts["health:pr"]).toBe("tsx scripts/project-health/cli.ts check --mode pr");
    expect(packageJson.scripts["health:nightly"]).toBe("tsx scripts/project-health/cli.ts check --mode nightly");
    expect(packageJson.scripts["health:release"]).toBe("tsx scripts/project-health/cli.ts check --mode release");
    expect(packageJson.scripts["health:record"]).toBe("tsx scripts/project-health/cli.ts record");
    expect(packageJson.scripts["health:explain"]).toBe("tsx scripts/project-health/cli.ts explain");
    expect(packageJson.scripts["health:update-baseline"]).toBe("tsx scripts/project-health/cli.ts update-baseline");
    const source = await readFile(new URL("./cli.ts", import.meta.url), "utf8");
    expect(source).toMatch("recordRegisteredProjectHealthGateV1");
    expect(source).not.toMatch("runProjectHealthProcessV1");
    expect(source).not.toMatch("--evaluated-on");
    const rejected = await runCli([
      "check",
      "--mode",
      "pr",
      "--commit",
      COMMIT_SHA,
      "--output",
      ".project-health/report.json",
      "--update-baseline",
    ]);
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stderr).toMatch(/update-baseline/i);
  });

  it("maps passed, failed, incomplete, and usage exits", async () => {
    const profile = parsedProfile();
    const receipts = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-receipts-"));
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-output-"));
    roots.push(receipts, outputRoot);
    const passing = [
      observation(profile, "workspace-boundary"),
      observation(profile, "supplemental-authority"),
      observation(profile, "contract-parity"),
      observation(profile, "test-topology"),
      observation(profile, "supply-chain"),
      observation(profile, "documentation-truth"),
    ];
    await writeObservations(receipts, passing);
    const passed = await runCli([
      "check",
      "--mode",
      "pr",
      "--commit",
      COMMIT_SHA,
      "--receipts",
      receipts,
      "--output",
      path.join(outputRoot, "passed.json"),
    ]);
    expect(passed.exitCode).toBe(0);
    const passedReport = parseProjectHealthReportV1(
      JSON.parse(await readFile(path.join(outputRoot, "passed.json"), "utf8")),
      profile,
    );
    expect(passedReport.status).toBe("passed");
    expect(passedReport.evaluatedOn).toBe("2026-08-31");

    await writeObservations(receipts, passing.map((entry) => (
      entry.sensorId === "contract-parity" ? observation(profile, "contract-parity", [generatedDrift(profile)]) : entry
    )));
    const failed = await runCli([
      "check",
      "--mode",
      "pr",
      "--commit",
      COMMIT_SHA,
      "--receipts",
      receipts,
      "--output",
      path.join(outputRoot, "failed.json"),
    ]);
    expect(failed.exitCode).toBe(2);

    const incomplete = await runCli([
      "check",
      "--mode",
      "pr",
      "--commit",
      COMMIT_SHA,
      "--output",
      path.join(outputRoot, "incomplete.json"),
    ]);
    expect(incomplete.exitCode).toBe(3);

    const usage = await runCli(["check", "--mode", "release", "--output", path.join(outputRoot, "release.json")]);
    expect(usage.exitCode).toBe(1);
    expect(usage.stderr).toMatch(/--commit/i);
  });

  it("rejects a stale exact-head Receipt and pending-review incomplete input", async () => {
    const profile = parsedProfile();
    const receipts = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-stale-"));
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-output-"));
    roots.push(receipts, outputRoot);
    await writeObservations(receipts, [
      observation(profile, "workspace-boundary"),
      observation(profile, "supplemental-authority"),
      observation(profile, "contract-parity"),
      observation(profile, "test-topology"),
      observation(profile, "supply-chain"),
      observation(profile, "documentation-truth"),
    ]);
    await writeFile(path.join(receipts, "typecheck.json"), `${JSON.stringify({
      kind: "project-health-gate-receipt",
      schemaVersion: 1,
      gateId: "typecheck",
      commitSha: "e".repeat(40),
      inputFingerprint: EVIDENCE_A,
      commandHash: EVIDENCE_A,
      status: "passed",
      evidenceRef: EVIDENCE_A,
    }, null, 2)}\n`, "utf8");
    const stale = await runCli([
      "check",
      "--mode",
      "pr",
      "--commit",
      COMMIT_SHA,
      "--receipts",
      receipts,
      "--output",
      path.join(outputRoot, "stale.json"),
    ]);
    expect(stale.exitCode).toBe(3);
    const report = parseProjectHealthReportV1(
      JSON.parse(await readFile(path.join(outputRoot, "stale.json"), "utf8")),
      profile,
    );
    expect(report.status).toBe("incomplete");
  });

  it("explains a Finding from the Registry command and rejects a stale baseline identity", async () => {
    const profile = parsedProfile();
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-explain-"));
    roots.push(outputRoot);
    const receipts = path.join(outputRoot, "receipts");
    await writeObservations(receipts, [
      observation(profile, "workspace-boundary"),
      observation(profile, "supplemental-authority"),
      observation(profile, "contract-parity", [generatedDrift(profile)]),
      observation(profile, "test-topology"),
      observation(profile, "supply-chain"),
      observation(profile, "documentation-truth"),
    ]);
    const reportPath = path.join(outputRoot, "report.json");
    const failed = await runCli([
      "check",
      "--mode",
      "pr",
      "--commit",
      COMMIT_SHA,
      "--receipts",
      receipts,
      "--output",
      reportPath,
    ]);
    expect(failed.exitCode).toBe(2);
    const fingerprint = generatedDrift(profile).fingerprint;
    const explained = await runCli(["explain", reportPath, "--fingerprint", fingerprint, "--json"]);
    expect(explained.exitCode).toBe(0);
    const payload = JSON.parse(explained.stdout) as {
      readonly fingerprint: string;
      readonly ownerId: string;
      readonly suggestedGateId: string;
      readonly suggestedCommand: readonly string[];
      readonly debtState: string;
    };
    expect(payload.fingerprint).toBe(fingerprint);
    expect(payload.ownerId).toBe("builder-self-check");
    expect(payload.suggestedGateId).toBe("agent-self-check");
    expect(payload.suggestedCommand).toEqual(["pnpm", "check:agent-self-check"]);
    expect(payload.debtState).toBe("not-applicable");

    const missing = await runCli(["explain", reportPath, "--fingerprint", `sha256:${"f".repeat(64)}`]);
    expect(missing.exitCode).toBe(1);

    const staleBaseline = await runCli([
      "update-baseline",
      "--commit",
      "f".repeat(40),
      "--report",
      reportPath,
      "--output",
      path.join(outputRoot, "baseline.json"),
    ]);
    expect(staleBaseline.exitCode).toBe(1);
    expect(staleBaseline.stderr).toMatch(/identity/i);
  });

  it("records through the Registry and keeps check mode off the tracked tree", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-cli-record-"));
    roots.push(outputRoot);
    const recorded = await runCli([
      "record",
      "--gate",
      "tracked-tree-clean",
      "--commit",
      COMMIT_SHA,
      "--output",
      path.join(outputRoot, "receipt.json"),
    ]);
    expect([0, 2, 3]).toContain(recorded.exitCode);
    const receipt = JSON.parse(await readFile(path.join(outputRoot, "receipt.json"), "utf8")) as {
      readonly kind: string;
      readonly gateId: string;
    };
    expect(receipt.kind).toBe("project-health-gate-receipt");
    expect(receipt.gateId).toBe("tracked-tree-clean");

    const unknown = await runCli([
      "record",
      "--gate",
      "not-a-registered-gate",
      "--commit",
      COMMIT_SHA,
      "--output",
      path.join(outputRoot, "missing.json"),
    ]);
    expect(unknown.exitCode).toBe(1);

    const before = execFileSync("git", ["status", "--porcelain"], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
    });
    const check = await runCli([
      "check",
      "--mode",
      "pr",
      "--commit",
      COMMIT_SHA,
      "--output",
      path.join(REPOSITORY_ROOT, ".project-health/report.json"),
    ]);
    expect(check.exitCode).toBe(3);
    const after = execFileSync("git", ["status", "--porcelain"], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
    });
    expect(after).toBe(before);
  });

  it("can be invoked through the frozen package scripts", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-script-"));
    roots.push(outputRoot);
    const reportPath = path.join(outputRoot, "report.json");
    const result = await execFileAsync(
      "pnpm",
      ["health:pr", "--", "--commit", COMMIT_SHA, "--output", reportPath],
      { cwd: REPOSITORY_ROOT, encoding: "utf8" },
    ).then((entry) => ({ exitCode: 0, stdout: entry.stdout, stderr: entry.stderr }))
      .catch((error: { readonly code?: number; readonly stdout?: string; readonly stderr?: string }) => ({
        exitCode: error.code ?? 1,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
      }));
    expect(result.exitCode).toBe(3);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as { readonly status: string };
    expect(report.status).toBe("incomplete");
    expect(sha256CanonicalJson(report)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
