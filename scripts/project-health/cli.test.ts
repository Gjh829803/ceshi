import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";
import { afterEach, describe, expect, it } from "vitest";

import { runProjectHealthCliV1 } from "./cli";
import {
  parseProjectHealthFindingV1,
  parseProjectHealthGateReceiptV1,
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
import { putProjectHealthEvidenceJsonV1 } from "./evidence-store";
import {
  admitRegisteredProjectHealthGateV1,
  projectHealthGateInputFingerprintsV1,
} from "./registry";
import { CONTRACT_PARITY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/contract-parity";
import { DOCUMENTATION_TRUTH_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/documentation-truth";
import { SUPPLEMENTAL_AUTHORITY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/supplemental-authority";
import { SUPPLY_CHAIN_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/supply-chain";
import { TEST_TOPOLOGY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/test-topology";
import { WORKSPACE_BOUNDARY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/workspace-boundary";

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const COMMIT_SHA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPOSITORY_ROOT, encoding: "utf8" }).trim();
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
let fingerprintsPromise: Promise<Readonly<Record<string, string>>> | null = null;

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

function outputRoot(): string {
  const root = path.join(REPOSITORY_ROOT, ".project-health", `cli-test-${randomUUID()}`);
  roots.push(root);
  return root;
}

async function writeRequiredGateReceipts(
  directory: string,
  profile: ProjectHealthProfileV1,
  statusByGateId: Readonly<Record<string, "passed" | "failed" | "incomplete">> = {},
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const requiredGateIds = Object.values(profile.modesById.pr.requiredGateIdsBySensorId).flatMap((ids) => ids ?? []);
  if (isNil(fingerprintsPromise)) {
    fingerprintsPromise = projectHealthGateInputFingerprintsV1({
      repositoryRoot: REPOSITORY_ROOT,
      profile,
      gateIds: requiredGateIds,
    });
  }
  const fingerprints = await fingerprintsPromise;
  await Promise.all(requiredGateIds.map(async (gateId) => {
    const descriptor = admitRegisteredProjectHealthGateV1({ gateId });
    const status = statusByGateId[gateId] ?? "passed";
    const commandHash = sha256CanonicalJson(descriptor);
    const evidenceStatus = status === "passed" ? "passed" : status === "failed" ? "failed" : "infrastructure-failed";
    const evidence = {
      kind: "project-health-execution-evidence",
      schemaVersion: 1,
      descriptorId: descriptor.id,
      executionScope: descriptor.executionScope,
      commandHash,
      environmentHash: EVIDENCE_A,
      status: evidenceStatus,
      exitCode: status === "passed" ? 0 : status === "failed" ? 1 : null,
      signal: null,
      stdout: "",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      repositoryStateBeforeHash: null,
      repositoryStateAfterHash: null,
      temporaryWorktreeRemoved: null,
      temporaryOutputRemoved: null,
      failureCodes: status === "incomplete" ? ["EXECUTION_ENVELOPE_FAILED"] : [],
    };
    const stored = await putProjectHealthEvidenceJsonV1({ repositoryRoot: REPOSITORY_ROOT, value: evidence });
    const receipt = parseProjectHealthGateReceiptV1({
      kind: "project-health-gate-receipt",
      schemaVersion: 1,
      gateId,
      commitSha: COMMIT_SHA,
      inputFingerprint: fingerprints[gateId],
      commandHash,
      status,
      evidenceRef: stored.evidenceRef,
    });
    await writeFile(path.join(directory, `gate-${gateId}.json`), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  }));
}

async function writePassingInputs(directory: string, profile: ProjectHealthProfileV1): Promise<void> {
  await writeObservations(directory, [
    observation(profile, "workspace-boundary"),
    observation(profile, "supplemental-authority"),
    observation(profile, "contract-parity"),
    observation(profile, "test-topology"),
    observation(profile, "supply-chain"),
    observation(profile, "documentation-truth"),
  ]);
  await writeRequiredGateReceipts(directory, profile);
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
    const root = outputRoot();
    const receipts = path.join(root, "receipts");
    const passing = [
      observation(profile, "workspace-boundary"),
      observation(profile, "supplemental-authority"),
      observation(profile, "contract-parity"),
      observation(profile, "test-topology"),
      observation(profile, "supply-chain"),
      observation(profile, "documentation-truth"),
    ];
    await writeObservations(receipts, passing);
    await writeRequiredGateReceipts(receipts, profile);
    const passed = await runCli([
      "check",
      "--mode",
      "pr",
      "--commit",
      COMMIT_SHA,
      "--receipts",
      receipts,
      "--output",
      path.join(root, "passed.json"),
    ]);
    expect(passed.exitCode).toBe(0);
    const passedReport = parseProjectHealthReportV1(
      JSON.parse(await readFile(path.join(root, "passed.json"), "utf8")),
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
      path.join(root, "failed.json"),
    ]);
    expect(failed.exitCode).toBe(2);

    const incomplete = await runCli([
      "check",
      "--mode",
      "pr",
      "--commit",
      COMMIT_SHA,
      "--output",
      path.join(root, "incomplete.json"),
    ]);
    expect(incomplete.exitCode).toBe(3);

    const usage = await runCli(["check", "--mode", "release", "--output", path.join(root, "release.json")]);
    expect(usage.exitCode).toBe(1);
    expect(usage.stderr).toMatch(/--commit/i);
  });

  it("requires exactly one current canonical evidence-backed Receipt per Required Gate", async () => {
    const profile = parsedProfile();
    const runFixture = async (
      name: string,
      mutate: (directory: string) => Promise<void>,
      expectedExitCode: number,
    ): Promise<void> => {
      const root = outputRoot();
      const receipts = path.join(root, "receipts");
      await writePassingInputs(receipts, profile);
      await mutate(receipts);
      const result = await runCli([
        "check", "--mode", "pr", "--commit", COMMIT_SHA,
        "--receipts", receipts, "--output", path.join(root, `${name}.json`),
      ]);
      expect(result.exitCode).toBe(expectedExitCode);
      if (expectedExitCode === 2 || expectedExitCode === 3) {
        const report = parseProjectHealthReportV1(
          JSON.parse(await readFile(path.join(root, `${name}.json`), "utf8")),
          profile,
        );
        expect(report.status).toBe(expectedExitCode === 2 ? "failed" : "incomplete");
      }
    };

    await runFixture("missing", async (directory) => {
      await rm(path.join(directory, "gate-typecheck.json"));
    }, 3);
    await runFixture("duplicate", async (directory) => {
      const receipt = await readFile(path.join(directory, "gate-typecheck.json"), "utf8");
      await writeFile(path.join(directory, "gate-typecheck-copy.json"), receipt, "utf8");
    }, 3);
    await runFixture("failed", async (directory) => {
      await writeRequiredGateReceipts(directory, profile, { typecheck: "failed" });
    }, 2);
    await runFixture("stale", async (directory) => {
      const receiptPath = path.join(directory, "gate-typecheck.json");
      const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as Record<string, unknown>;
      await writeFile(receiptPath, `${JSON.stringify({ ...receipt, commitSha: "e".repeat(40) })}\n`, "utf8");
    }, 3);
    await runFixture("wrong-input", async (directory) => {
      const receiptPath = path.join(directory, "gate-typecheck.json");
      const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as Record<string, unknown>;
      await writeFile(receiptPath, `${JSON.stringify({ ...receipt, inputFingerprint: EVIDENCE_A })}\n`, "utf8");
    }, 3);
    await runFixture("wrong-command", async (directory) => {
      const receiptPath = path.join(directory, "gate-typecheck.json");
      const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as Record<string, unknown>;
      await writeFile(receiptPath, `${JSON.stringify({ ...receipt, commandHash: EVIDENCE_A })}\n`, "utf8");
    }, 3);
    await runFixture("missing-evidence", async (directory) => {
      const receiptPath = path.join(directory, "gate-typecheck.json");
      const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as Record<string, unknown>;
      await writeFile(receiptPath, `${JSON.stringify({ ...receipt, evidenceRef: `sha256:${"f".repeat(64)}` })}\n`, "utf8");
    }, 3);
    await runFixture("mismatched-evidence", async (directory) => {
      const receiptPath = path.join(directory, "gate-typecheck.json");
      const otherReceipt = JSON.parse(await readFile(
        path.join(directory, "gate-agent-self-check.json"),
        "utf8",
      )) as { readonly evidenceRef: string };
      const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as Record<string, unknown>;
      await writeFile(receiptPath, `${JSON.stringify({ ...receipt, evidenceRef: otherReceipt.evidenceRef })}\n`, "utf8");
    }, 3);
    await runFixture("incomplete", async (directory) => {
      await writeRequiredGateReceipts(directory, profile, { typecheck: "incomplete" });
    }, 3);
    await runFixture("unregistered", async (directory) => {
      await writeFile(path.join(directory, "illegal.json"), `${JSON.stringify({
        kind: "project-health-gate-receipt",
        schemaVersion: 1,
        gateId: "unregistered-gate",
        commitSha: COMMIT_SHA,
        inputFingerprint: EVIDENCE_A,
        commandHash: EVIDENCE_A,
        status: "passed",
        evidenceRef: EVIDENCE_A,
      })}\n`, "utf8");
    }, 1);
  }, 15_000);

  it("explains a Finding from the Registry command and rejects a stale baseline identity", async () => {
    const profile = parsedProfile();
    const root = outputRoot();
    const receipts = path.join(root, "receipts");
    await writeObservations(receipts, [
      observation(profile, "workspace-boundary"),
      observation(profile, "supplemental-authority"),
      observation(profile, "contract-parity", [generatedDrift(profile)]),
      observation(profile, "test-topology"),
      observation(profile, "supply-chain"),
      observation(profile, "documentation-truth"),
    ]);
    await writeRequiredGateReceipts(receipts, profile);
    const reportPath = path.join(root, "report.json");
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
      path.join(root, "baseline.json"),
    ]);
    expect(staleBaseline.exitCode).toBe(1);
    expect(staleBaseline.stderr).toMatch(/HEAD|identity/i);
  });

  it("updates only the canonical baseline from an exact-tree evidence-complete accepted Report", async () => {
    const profile = parsedProfile();
    const root = outputRoot();
    const receipts = path.join(root, "receipts");
    await writePassingInputs(receipts, profile);
    const reportPath = path.join(root, "passed.json");
    expect((await runCli([
      "check", "--mode", "pr", "--commit", COMMIT_SHA,
      "--receipts", receipts, "--output", reportPath,
    ])).exitCode).toBe(0);

    const wrongOutput = await runCli([
      "update-baseline", "--commit", COMMIT_SHA, "--report", reportPath,
      "--output", path.join(root, "baseline.json"),
    ]);
    expect(wrongOutput.exitCode).toBe(1);
    expect(wrongOutput.stderr).toMatch(/exactly/i);

    const baselinePath = path.join(REPOSITORY_ROOT, "config/project-health/baseline.json");
    roots.push(baselinePath);
    const updated = await runCli([
      "update-baseline", "--commit", COMMIT_SHA, "--report", reportPath,
      "--output", baselinePath,
    ]);
    expect(updated.exitCode).toBe(0);
    expect(JSON.parse(await readFile(baselinePath, "utf8"))).toEqual(JSON.parse(await readFile(reportPath, "utf8")));

    const incompletePath = path.join(root, "incomplete.json");
    expect((await runCli([
      "check", "--mode", "pr", "--commit", COMMIT_SHA, "--output", incompletePath,
    ])).exitCode).toBe(3);
    const rejected = await runCli([
      "update-baseline", "--commit", COMMIT_SHA, "--report", incompletePath,
      "--output", baselinePath,
    ]);
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stderr).toMatch(/accepted|evidence-complete/i);
  });

  it("records through the Registry and keeps check mode off the tracked tree", async () => {
    const root = outputRoot();
    await mkdir(root, { recursive: true });
    const recorded = await runCli([
      "record",
      "--gate",
      "tracked-tree-clean",
      "--commit",
      COMMIT_SHA,
      "--output",
      path.join(root, "receipt.json"),
    ]);
    expect([0, 2, 3]).toContain(recorded.exitCode);
    const receipt = JSON.parse(await readFile(path.join(root, "receipt.json"), "utf8")) as {
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
      path.join(root, "missing.json"),
    ]);
    expect(unknown.exitCode).toBe(1);

    const stale = await runCli([
      "record", "--gate", "tracked-tree-clean", "--commit", "c".repeat(40),
      "--output", path.join(root, "stale.json"),
    ]);
    expect(stale.exitCode).toBe(1);
    expect(stale.stderr).toMatch(/HEAD/i);

    const outside = await runCli([
      "check", "--mode", "pr", "--commit", COMMIT_SHA,
      "--output", path.join(REPOSITORY_ROOT, "outside-report.json"),
    ]);
    expect(outside.exitCode).toBe(1);
    expect(outside.stderr).toMatch(/\.project-health/i);

    const symlinkTarget = outputRoot();
    const symlinkParent = outputRoot();
    await mkdir(symlinkTarget, { recursive: true });
    await mkdir(symlinkParent, { recursive: true });
    await symlink(symlinkTarget, path.join(symlinkParent, "linked"), "dir");
    const symlinked = await runCli([
      "check", "--mode", "pr", "--commit", COMMIT_SHA,
      "--output", path.join(symlinkParent, "linked", "report.json"),
    ]);
    expect(symlinked.exitCode).toBe(1);
    expect(symlinked.stderr).toMatch(/canonical|symbolic/i);
    await expect(readFile(path.join(symlinkTarget, "report.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

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
      path.join(root, "incomplete.json"),
    ]);
    expect(check.exitCode).toBe(3);
    const after = execFileSync("git", ["status", "--porcelain"], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
    });
    expect(after).toBe(before);
  });

  it("can be invoked through the frozen package scripts", async () => {
    const root = outputRoot();
    const reportPath = path.join(root, "report.json");
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
