import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseProjectHealthDependencyInventoryV1,
  parseProjectHealthProfileV1,
  parseProjectHealthSupplyChainPolicyV1,
  type ProjectHealthDependencyInventoryV1,
  type ProjectHealthModeV1,
} from "../contracts";
import {
  observeSupplyChainV1,
  type SupplyChainAdvisorySnapshotV1,
  type SupplyChainLockReceiptV1,
} from "./supply-chain";

const REPOSITORY_ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const COMMIT_SHA = "a".repeat(40);
const STALE_SHA = "b".repeat(40);
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const HASH_C = `sha256:${"c".repeat(64)}`;
const SENSOR_IMPLEMENTATION_HASH = `sha256:${"d".repeat(64)}`;

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8"));
}

function parsedProfile() {
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

function parsedPolicy() {
  return parseProjectHealthSupplyChainPolicyV1(readJson("config/project-health/supply-chain-policy.json"));
}

function inventory(
  overrides: Partial<ProjectHealthDependencyInventoryV1> = {},
): ProjectHealthDependencyInventoryV1 {
  return parseProjectHealthDependencyInventoryV1({
    kind: "project-health-dependency-inventory",
    schemaVersion: 1,
    commitSha: COMMIT_SHA,
    packageManagerId: "pnpm@10.14.0",
    commandHash: HASH_A,
    inputFingerprint: HASH_B,
    entries: [
      {
        id: "lodash-es@4.17.21",
        packageName: "lodash-es",
        version: "4.17.21",
        licenseSpdxExpression: "MIT",
      },
    ],
    ...overrides,
  });
}

function lockReceipt(overrides: Partial<SupplyChainLockReceiptV1> = {}): SupplyChainLockReceiptV1 {
  return {
    commitSha: COMMIT_SHA,
    evidenceRef: HASH_C,
    passed: true,
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<SupplyChainAdvisorySnapshotV1> = {},
): SupplyChainAdvisorySnapshotV1 {
  return {
    providerId: "osv",
    snapshotDate: "2026-08-30",
    snapshotHash: HASH_A,
    advisories: [],
    ...overrides,
  };
}

function observe(
  mode: ProjectHealthModeV1,
  overrides: Partial<Parameters<typeof observeSupplyChainV1>[0]> = {},
) {
  return observeSupplyChainV1({
    profile: parsedProfile(),
    sensorImplementationHash: SENSOR_IMPLEMENTATION_HASH,
    mode,
    evaluatedOn: "2026-08-31",
    expectedCommitSha: COMMIT_SHA,
    policy: parsedPolicy(),
    inventory: inventory(),
    lockReceipt: lockReceipt(),
    advisorySnapshot: snapshot(),
    ...overrides,
  });
}

describe("supply-chain sensor", () => {
  it("does not spawn, parse lockfiles, or implement its own timeout", async () => {
    const source = await readFileAsync(new URL("./supply-chain.ts", import.meta.url), "utf8");
    expect(source).not.toMatch("child_process");
    expect(source).not.toMatch("runProjectHealthProcessV1");
    expect(source).not.toMatch("pnpm-lock.yaml");
    expect(source).not.toMatch("licenses list");
  });

  it("reports incomplete for a missing or malformed inventory", () => {
    const missing = observe("pr", { inventory: null });
    expect(missing.status).toBe("incomplete");
    expect(missing.metricsById["dependency-inventory-complete"]).toMatchObject({
      status: "not-evaluated",
      reasonCode: "OWNER_COMMAND_NOT_RUN",
    });

    const malformed = observe("pr", {
      inventory: { kind: "project-health-dependency-inventory" } as never,
    });
    expect(malformed.status).toBe("incomplete");
    expect(malformed.metricsById["dependency-inventory-complete"]).toMatchObject({
      status: "not-evaluated",
      reasonCode: "OWNER_COMMAND_NOT_RUN",
    });
  });

  it("reports incomplete for a stale inventory commit", () => {
    const observation = observe("pr", {
      inventory: inventory({ commitSha: STALE_SHA }),
    });
    expect(observation.status).toBe("incomplete");
    expect(observation.metricsById["dependency-inventory-complete"]).toMatchObject({
      status: "not-evaluated",
      reasonCode: "OWNER_COMMAND_STALE_TREE",
    });
  });

  it("fails when lock or patch provenance is missing", () => {
    const observation = observe("pr", { lockReceipt: null, advisorySnapshot: snapshot() });
    expect(observation.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_DEPENDENCY_PROVENANCE_MISSING")).toBe(true);
    expect(observation.status).toBe("failed");
  });

  it("fails a forbidden license against the frozen policy", () => {
    const observation = observe("pr", {
      inventory: inventory({
        entries: [{
          id: "evil@1.0.0",
          packageName: "evil",
          version: "1.0.0",
          licenseSpdxExpression: "GPL-3.0",
        }],
      }),
    });
    expect(observation.status).toBe("failed");
    expect(observation.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_LICENSE_FORBIDDEN" &&
      finding.subjectRefs.includes("package:evil"))).toBe(true);
    expect(observation.metricsById["dependency-inventory-complete"]).toEqual({
      id: "dependency-inventory-complete",
      kind: "boolean",
      value: false,
    });
  });

  it("keeps PR and Nightly incomplete when the advisory provider is unavailable", () => {
    const pr = observe("pr", { advisorySnapshot: null });
    expect(pr.status).toBe("incomplete");
    expect(pr.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_SUPPLY_CHAIN_PROVIDER_UNAVAILABLE")).toBe(true);
    expect(pr.metricsById["dependency-inventory-complete"]).toMatchObject({
      status: "not-evaluated",
      reasonCode: "SUPPLY_CHAIN_ONLINE_PROVIDER_UNAVAILABLE",
    });

    const nightly = observe("nightly", { advisorySnapshot: null });
    expect(nightly.status).toBe("incomplete");
  });

  it("marks Release not-applicable for an unavailable provider and retains the advisory finding", () => {
    const observation = observe("release", { advisorySnapshot: null });
    expect(observation.status).toBe("not-applicable");
    expect(observation.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_SUPPLY_CHAIN_PROVIDER_UNAVAILABLE" &&
      finding.policy === "advisory-p3")).toBe(true);
    expect(observation.metricsById["dependency-inventory-complete"]).toEqual({
      id: "dependency-inventory-complete",
      kind: "boolean",
      status: "not-applicable",
      reasonCode: "SUPPLY_CHAIN_ONLINE_PROVIDER_UNAVAILABLE",
    });
  });

  it("treats a stale advisory snapshot as an unavailable provider", () => {
    const observation = observe("pr", {
      advisorySnapshot: snapshot({ snapshotDate: "2026-08-20" }),
    });
    expect(observation.status).toBe("incomplete");
    expect(observation.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_SUPPLY_CHAIN_PROVIDER_UNAVAILABLE")).toBe(true);
  });

  it("keeps a version-bound advisory visible without failing a complete inventory", () => {
    const observation = observe("pr", {
      advisorySnapshot: snapshot({
        advisories: [{
          packageName: "lodash-es",
          version: "4.17.21",
          advisoryId: "osv-lodash-es-1",
        }],
      }),
    });
    expect(observation.status).toBe("passed");
    expect(observation.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_VULNERABILITY_ADVISORY" &&
      finding.policy === "advisory-p2")).toBe(true);
    expect(observation.metricsById["dependency-inventory-complete"]).toEqual({
      id: "dependency-inventory-complete",
      kind: "boolean",
      value: true,
    });
  });
});
