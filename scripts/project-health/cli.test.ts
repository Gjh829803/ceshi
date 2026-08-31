import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sortBy, uniq } from "lodash-es";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseAcceptedProjectDebtListV1,
  parseProjectHealthObservationV1,
  parseProjectHealthProfileV1,
  type ProjectHealthMetricV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
  type ProjectHealthSensorIdV1,
} from "./contracts";
import { runProjectHealthCliV1 } from "./cli";
import { aggregateProjectHealthReportV1 } from "./report";
import { PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1 } from "./registry";

const cliAdmissionState = vi.hoisted(() => ({
  active: false,
  checkoutSha: "",
  observations: null as readonly unknown[] | null,
  prIdentityFailure: null as string | null,
  gateExecutionCount: 0,
}));

vi.mock("./process-runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./process-runner")>();
  return {
    ...actual,
    assertProjectHealthExactCleanCheckoutV1: async (repositoryRoot: string) =>
      cliAdmissionState.active
        ? `sha256:${"f".repeat(64)}`
        : actual.assertProjectHealthExactCleanCheckoutV1(repositoryRoot),
  };
});

vi.mock("./registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./registry")>();
  return {
    ...actual,
    readProjectHealthCheckoutHeadV1: async (repositoryRoot: string) =>
      cliAdmissionState.active
        ? cliAdmissionState.checkoutSha
        : actual.readProjectHealthCheckoutHeadV1(repositoryRoot),
    assertRegisteredProjectHealthPrIdentityV1: async (input: Parameters<
      typeof actual.assertRegisteredProjectHealthPrIdentityV1
    >[0]) => {
      if (!cliAdmissionState.active) return actual.assertRegisteredProjectHealthPrIdentityV1(input);
      if (cliAdmissionState.prIdentityFailure !== null) {
        throw new TypeError(cliAdmissionState.prIdentityFailure);
      }
      return { checkoutSha: input.headSha, requestedHeadSha: input.headSha, isMergeCommit: false } as const;
    },
    executeRegisteredProjectHealthGateV1: async (input: Parameters<
      typeof actual.executeRegisteredProjectHealthGateV1
    >[0]) => {
      if (!cliAdmissionState.active) return actual.executeRegisteredProjectHealthGateV1(input);
      cliAdmissionState.gateExecutionCount += 1;
      return { receipt: {}, evidence: {} } as never;
    },
  };
});

vi.mock("./mode-observer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mode-observer")>();
  return {
    ...actual,
    observeProjectHealthModeV1: async (input: Parameters<typeof actual.observeProjectHealthModeV1>[0]) =>
      cliAdmissionState.active && cliAdmissionState.observations !== null
        ? cliAdmissionState.observations as readonly ProjectHealthObservationV1[]
        : actual.observeProjectHealthModeV1(input),
  };
});

const REPOSITORY_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const TEST_BASE_SHA = "1".repeat(40);
const temporaryRoots: string[] = [];
const baselinePath = path.join(REPOSITORY_ROOT, "config/project-health/baseline.json");
let baselineRestore: string | null | undefined;

afterEach(async () => {
  cliAdmissionState.active = false;
  cliAdmissionState.checkoutSha = "";
  cliAdmissionState.observations = null;
  cliAdmissionState.prIdentityFailure = null;
  cliAdmissionState.gateExecutionCount = 0;
  if (baselineRestore !== undefined && baselineRestore !== null) {
    await writeFile(baselinePath, baselineRestore, "utf8");
  }
  else if (baselineRestore === null) await rm(baselinePath, { force: true });
  baselineRestore = undefined;
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repositoryPaths(repositoryRoot: string): Promise<readonly string[]> {
  const ignored = new Set([".git", ".project-health", "node_modules"]);
  const paths: string[] = [];
  const visit = async (relativeRoot: string): Promise<void> => {
    const absoluteRoot = relativeRoot === "." ? repositoryRoot : path.join(repositoryRoot, relativeRoot);
    for (const entry of await readdir(absoluteRoot, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const relativePath = relativeRoot === "." ? entry.name : `${relativeRoot}/${entry.name}`;
      if (entry.isDirectory()) await visit(relativePath);
      else if (entry.isFile()) paths.push(relativePath);
    }
  };
  await visit(".");
  return sortBy(uniq(paths));
}

async function currentProfile(): Promise<ProjectHealthProfileV1> {
  const manifests = ["package.json"];
  for (const parent of ["apps", "packages"]) {
    for (const entry of await readdir(path.join(REPOSITORY_ROOT, parent), { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(`${parent}/${entry.name}/package.json`);
    }
  }
  const workspacePackageIds = manifests.flatMap((manifestPath) => {
    try {
      const manifest = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, manifestPath), "utf8")) as {
        readonly name?: unknown;
      };
      return typeof manifest.name === "string" ? [manifest.name] : [];
    } catch {
      return [];
    }
  });
  return parseProjectHealthProfileV1(
    JSON.parse(await readFile(path.join(REPOSITORY_ROOT, "config/project-health/profile.json"), "utf8")),
    { repositoryPaths: await repositoryPaths(REPOSITORY_ROOT), workspacePackageIds },
  );
}

function passingMetric(metricId: string, profile: ProjectHealthProfileV1): ProjectHealthMetricV1 {
  const policy = profile.metricPoliciesById[metricId]!;
  if (policy.kind === "boolean") return { id: metricId, kind: "boolean", value: true };
  if (policy.kind === "count") {
    return { id: metricId, kind: "count", valueCount: metricId === "workspace-boundary-debt-count" ? 49 : 0 };
  }
  if (policy.kind === "bytes") return { id: metricId, kind: "bytes", valueBytes: 0 };
  if (policy.kind === "duration") return { id: metricId, kind: "duration", valueMilliseconds: 0 };
  return { id: metricId, kind: "ratio", valueRatio: 0 };
}

function passingObservations(
  profile: ProjectHealthProfileV1,
  mode: "pr" | "nightly" | "release" = "pr",
): readonly ProjectHealthObservationV1[] {
  const sensorIds = [
    ...profile.modesById[mode].requiredSensorIds,
    ...profile.modesById[mode].advisorySensorIds,
  ];
  return sensorIds.map((sensorId: ProjectHealthSensorIdV1) => {
    const metricIds = Object.entries(profile.metricPoliciesById)
      .filter(([, policy]) => policy.sensorId === sensorId)
      .map(([metricId]) => metricId);
    return parseProjectHealthObservationV1({
      kind: "project-health-observation",
      schemaVersion: 1,
      sensorId,
      sensorImplementationHash: PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1[sensorId],
      inputFingerprint: `sha256:${"a".repeat(64)}`,
      status: "passed",
      metricsById: Object.fromEntries(metricIds.map((metricId) => [metricId, passingMetric(metricId, profile)])),
      findings: [],
      evidenceRefs: [`sha256:${"b".repeat(64)}`],
    }, profile);
  });
}

function observationsWithAdvisoryGaps(profile: ProjectHealthProfileV1): readonly ProjectHealthObservationV1[] {
  const advisorySensorIds = new Set(profile.modesById.pr.advisorySensorIds);
  return passingObservations(profile).map((observation) => {
    if (!advisorySensorIds.has(observation.sensorId)) return observation;
    return parseProjectHealthObservationV1({
      ...observation,
      status: "incomplete",
      metricsById: Object.fromEntries(Object.values(observation.metricsById).map((metric) => [
        metric.id,
        {
          id: metric.id,
          kind: metric.kind,
          status: "not-evaluated",
          reasonCode: "OWNER_COMMAND_NOT_RUN",
        },
      ])),
      findings: [],
      evidenceRefs: [],
    }, profile);
  });
}

async function runCli(repositoryRoot: string, argv: readonly string[]): Promise<Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runProjectHealthCliV1({
    argv,
    repositoryRoot,
    clock: { utcDate: () => "2026-08-31" },
    stdout: (chunk) => stdout.push(chunk),
    stderr: (chunk) => stderr.push(chunk),
  });
  return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

function git(repositoryRoot: string, argv: readonly string[]): string {
  return execFileSync("git", ["-C", repositoryRoot, ...argv], { encoding: "utf8" }).trim();
}

describe("project health cli", () => {
  it("exposes the frozen command family without a Gate injection or Receipt admission seam", async () => {
    const packageJson = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, "package.json"), "utf8")) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    expect(packageJson.scripts["health:pr"]).toBe("tsx scripts/project-health/cli.ts check --mode pr");
    expect(packageJson.scripts["health:nightly"]).toBe("tsx scripts/project-health/cli.ts check --mode nightly");
    expect(packageJson.scripts["health:release"]).toBe("tsx scripts/project-health/cli.ts check --mode release");
    expect(packageJson.scripts["health:record"]).toBe("tsx scripts/project-health/cli.ts record");
    expect(packageJson.scripts["health:explain"]).toBe("tsx scripts/project-health/cli.ts explain");
    expect(packageJson.scripts["health:update-baseline"]).toBe("tsx scripts/project-health/cli.ts update-baseline");
    const source = await readFile(new URL("./cli.ts", import.meta.url), "utf8");
    expect(source).toMatch("executeRegisteredProjectHealthGateV1");
    expect(source).not.toMatch("readReceiptDirectory");
    expect(source).not.toMatch("executeGate?:");
    expect(source).not.toMatch("--receipts");
  });

  it("rejects external Receipt and Observation admission before any Gate can run", async () => {
    const result = await runCli(REPOSITORY_ROOT, [
      "check", "--mode", "pr", "--commit", "a".repeat(40),
      "--receipts", ".project-health/forged", "--output", ".project-health/report.json",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/unknown option --receipts/i);
  });

  it("rejects a different checkout before it can mix Gate and Sensor implementations", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-other-checkout-"));
    temporaryRoots.push(root);
    const result = await runCli(root, ["check", "--mode", "pr", "--output", ".project-health/report.json"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/checkout that owns its loaded implementation/i);
  });

  it("routes PR checks through the Registry-owned ancestry admission", async () => {
    const profile = await currentProfile();
    const commitSha = git(REPOSITORY_ROOT, ["rev-parse", "HEAD"]);
    const baseSha = TEST_BASE_SHA;
    const outputRoot = path.join(REPOSITORY_ROOT, ".project-health", `cli-test-${randomUUID()}`);
    temporaryRoots.push(outputRoot);
    cliAdmissionState.active = true;
    cliAdmissionState.checkoutSha = commitSha;
    cliAdmissionState.observations = passingObservations(profile);
    cliAdmissionState.prIdentityFailure = "registered PR identity sentinel";

    const result = await runCli(REPOSITORY_ROOT, [
      "check", "--mode", "pr", "--commit", commitSha, "--base", baseSha,
      "--output", path.relative(REPOSITORY_ROOT, path.join(outputRoot, "report.json")),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/registered PR identity sentinel/i);
  });

  it.each(["nightly", "release"] as const)(
    "publishes canonical incomplete %s evidence without running Gates when Required adapters are unavailable",
    async (mode) => {
      const profile = await currentProfile();
      const commitSha = git(REPOSITORY_ROOT, ["rev-parse", "HEAD"]);
      const outputRoot = path.join(REPOSITORY_ROOT, ".project-health", `cli-test-${randomUUID()}`);
      const outputPath = path.join(outputRoot, "report.json");
      temporaryRoots.push(outputRoot);
      cliAdmissionState.active = true;
      cliAdmissionState.checkoutSha = commitSha;

      const result = await runCli(REPOSITORY_ROOT, [
        "check", "--mode", mode,
        ...(mode === "release" ? ["--commit", commitSha] : []),
        "--output", path.relative(REPOSITORY_ROOT, outputPath),
      ]);

      expect(result).toEqual({ exitCode: 3, stdout: "", stderr: "" });
      expect(cliAdmissionState.gateExecutionCount).toBe(0);
      const report = JSON.parse(await readFile(outputPath, "utf8")) as {
        readonly status: string;
        readonly metricsBySensorId: Readonly<Record<string, Readonly<Record<string, { readonly status?: string }>>>>;
      };
      expect(report.status).toBe("incomplete");
      expect(sortBy(Object.keys(report.metricsBySensorId))).toEqual(sortBy([
        ...profile.modesById[mode].requiredSensorIds,
        ...profile.modesById[mode].advisorySensorIds,
      ]));
      const requiredNotEvaluated = profile.modesById[mode].requiredSensorIds.some((sensorId) =>
        Object.values(report.metricsBySensorId[sensorId] ?? {}).some((metric) => metric.status === "not-evaluated"));
      expect(requiredNotEvaluated).toBe(true);
    },
  );

  it("admits only a disk Report that matches the fresh same-process Host Report", async () => {
    const profile = await currentProfile();
    const commitSha = git(REPOSITORY_ROOT, ["rev-parse", "HEAD"]);
    const baseSha = TEST_BASE_SHA;
    const observations = passingObservations(profile);
    const trustedReport = aggregateProjectHealthReportV1({
      profile,
      mode: "pr",
      commitSha,
      baseSha,
      clock: { utcDate: () => "2026-08-31" },
      observations,
      acceptedDebt: parseAcceptedProjectDebtListV1(
        JSON.parse(await readFile(
          path.join(REPOSITORY_ROOT, "config/project-health/accepted-debt.json"),
          "utf8",
        )),
        profile,
      ),
      baseline: null,
    });
    expect(trustedReport.status).toBe("passed");

    const outputRoot = path.join(REPOSITORY_ROOT, ".project-health", `cli-test-${randomUUID()}`);
    temporaryRoots.push(outputRoot);
    await mkdir(outputRoot, { recursive: true });
    await writeFile(
      path.join(outputRoot, "forged-report.json"),
      `${JSON.stringify({ ...trustedReport, evaluatedOn: "2026-08-30" }, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    cliAdmissionState.active = true;
    cliAdmissionState.checkoutSha = commitSha;
    cliAdmissionState.observations = observations;
    try {
      baselineRestore = await readFile(baselinePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      baselineRestore = null;
    }

    cliAdmissionState.prIdentityFailure = "registered baseline identity sentinel";
    const rejectedByRegisteredIdentity = await runCli(REPOSITORY_ROOT, [
      "update-baseline",
      "--commit", commitSha,
      "--report", path.relative(REPOSITORY_ROOT, path.join(outputRoot, "forged-report.json")),
      "--output", "config/project-health/baseline.json",
    ]);
    expect(rejectedByRegisteredIdentity.exitCode).toBe(1);
    expect(rejectedByRegisteredIdentity.stderr).toMatch(/registered baseline identity sentinel/i);
    cliAdmissionState.prIdentityFailure = null;

    const result = await runCli(REPOSITORY_ROOT, [
      "update-baseline",
      "--commit", commitSha,
      "--report", path.relative(REPOSITORY_ROOT, path.join(outputRoot, "forged-report.json")),
      "--output", "config/project-health/baseline.json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/fresh same-process Host Report/i);
    if (baselineRestore === null) {
      await expect(readFile(baselinePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } else {
      await expect(readFile(baselinePath, "utf8")).resolves.toBe(baselineRestore);
    }

    await writeFile(
      path.join(outputRoot, "trusted-report.json"),
      `${JSON.stringify(trustedReport, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    const accepted = await runCli(REPOSITORY_ROOT, [
      "update-baseline",
      "--commit", commitSha,
      "--report", path.relative(REPOSITORY_ROOT, path.join(outputRoot, "trusted-report.json")),
      "--output", "config/project-health/baseline.json",
    ]);
    expect(accepted).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    await expect(readFile(baselinePath, "utf8")).resolves.toBe(`${JSON.stringify(trustedReport, null, 2)}\n`);
  });

  it("publishes a passed baseline with explicit Advisory gaps", async () => {
    const profile = await currentProfile();
    const commitSha = git(REPOSITORY_ROOT, ["rev-parse", "HEAD"]);
    const baseSha = TEST_BASE_SHA;
    const observations = observationsWithAdvisoryGaps(profile);
    const report = aggregateProjectHealthReportV1({
      profile,
      mode: "pr",
      commitSha,
      baseSha,
      clock: { utcDate: () => "2026-08-31" },
      observations,
      acceptedDebt: parseAcceptedProjectDebtListV1(
        JSON.parse(await readFile(path.join(REPOSITORY_ROOT, "config/project-health/accepted-debt.json"), "utf8")),
        profile,
      ),
      baseline: null,
    });
    expect(report.status).toBe("passed");

    const outputRoot = path.join(REPOSITORY_ROOT, ".project-health", `cli-test-${randomUUID()}`);
    temporaryRoots.push(outputRoot);
    await mkdir(outputRoot, { recursive: true });
    const reportPath = path.join(outputRoot, "advisory-gap-report.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    cliAdmissionState.active = true;
    cliAdmissionState.checkoutSha = commitSha;
    cliAdmissionState.observations = observations;
    try {
      baselineRestore = await readFile(baselinePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      baselineRestore = null;
    }

    const result = await runCli(REPOSITORY_ROOT, [
      "update-baseline",
      "--commit", commitSha,
      "--report", path.relative(REPOSITORY_ROOT, reportPath),
      "--output", "config/project-health/baseline.json",
    ]);

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as typeof report;
    for (const sensorId of profile.modesById.pr.advisorySensorIds) {
      expect(Object.values(baseline.metricsBySensorId[sensorId] ?? {}).every((metric) =>
        "status" in metric && metric.status === "not-evaluated")).toBe(true);
    }
  });

  it.each(["nightly", "release"] as const)(
    "rejects a %s Report from the single PR-mode baseline writer",
    async (mode) => {
      const profile = await currentProfile();
      const commitSha = git(REPOSITORY_ROOT, ["rev-parse", "HEAD"]);
      const observations = passingObservations(profile, mode);
      const report = aggregateProjectHealthReportV1({
        profile,
        mode,
        commitSha,
        baseSha: null,
        clock: { utcDate: () => "2026-08-31" },
        observations,
        acceptedDebt: parseAcceptedProjectDebtListV1(
          JSON.parse(await readFile(path.join(REPOSITORY_ROOT, "config/project-health/accepted-debt.json"), "utf8")),
          profile,
        ),
        baseline: null,
      });
      expect(report.status).toBe("passed");
      const outputRoot = path.join(REPOSITORY_ROOT, ".project-health", `cli-test-${randomUUID()}`);
      temporaryRoots.push(outputRoot);
      await mkdir(outputRoot, { recursive: true });
      const reportPath = path.join(outputRoot, `${mode}-report.json`);
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      cliAdmissionState.active = true;
      cliAdmissionState.checkoutSha = commitSha;
      cliAdmissionState.observations = observations;
      try {
        baselineRestore = await readFile(baselinePath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        baselineRestore = null;
      }

      const result = await runCli(REPOSITORY_ROOT, [
        "update-baseline",
        "--commit", commitSha,
        "--report", path.relative(REPOSITORY_ROOT, reportPath),
        "--output", "config/project-health/baseline.json",
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/single baseline accepts only PR-mode Reports/i);
    },
  );
});
