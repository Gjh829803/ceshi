import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseProjectHealthProfileV1 } from "../contracts";
import {
  observeContractParityV1,
  type ContractParityOwnerEvidenceV1,
} from "./contract-parity";

const REPOSITORY_ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const COMMIT_SHA = "a".repeat(40);
const SENSOR_IMPLEMENTATION_HASH = `sha256:${"b".repeat(64)}`;
const STALE_SHA = "b".repeat(40);
const EVIDENCE_BY_GATE: Readonly<Record<string, string>> = {
  "agent-self-check": `sha256:${"1".repeat(64)}`,
  "playground-build": `sha256:${"2".repeat(64)}`,
  "tracked-tree-clean": `sha256:${"3".repeat(64)}`,
  typecheck: `sha256:${"4".repeat(64)}`,
  "dependency-lock": `sha256:${"5".repeat(64)}`,
};

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

function owner(
  gateId: string,
  ownerKind: ContractParityOwnerEvidenceV1["ownerKind"],
  overrides: Partial<ContractParityOwnerEvidenceV1> = {},
): ContractParityOwnerEvidenceV1 {
  return {
    gateId,
    ownerKind,
    commitSha: COMMIT_SHA,
    evidenceRef: EVIDENCE_BY_GATE[gateId] ?? `sha256:${"6".repeat(64)}`,
    executionStatus: "passed",
    ...overrides,
  };
}

function prOwners(
  overridesByGateId: Partial<Record<string, Partial<ContractParityOwnerEvidenceV1>>> = {},
): ContractParityOwnerEvidenceV1[] {
  return [
    owner("agent-self-check", "read-only-verifier", overridesByGateId["agent-self-check"]),
    owner("playground-build", "generated-bytes", overridesByGateId["playground-build"]),
    owner("tracked-tree-clean", "read-only-verifier", overridesByGateId["tracked-tree-clean"]),
    owner("typecheck", "read-only-verifier", overridesByGateId["typecheck"]),
  ];
}

function runContractParitySensorV1(
  owners: readonly ContractParityOwnerEvidenceV1[] | null,
) {
  return observeContractParityV1({
    profile: parsedProfile(),
    sensorImplementationHash: SENSOR_IMPLEMENTATION_HASH,
    mode: "pr",
    expectedCommitSha: COMMIT_SHA,
    owners,
  });
}

describe("contract-parity sensor", () => {
  it("does not spawn, parse lockfiles, or implement its own timeout", async () => {
    const source = await readFileAsync(new URL("./contract-parity.ts", import.meta.url), "utf8");
    expect(source).not.toMatch("child_process");
    expect(source).not.toMatch("runProjectHealthProcessV1");
    expect(source).not.toMatch("pnpm-lock.yaml");
    expect(source).not.toMatch("timeoutMilliseconds");
  });

  it("reports incomplete when owner evidence records a tracked-tree mutation", () => {
    const observation = runContractParitySensorV1(prOwners({
      "playground-build": { executionStatus: "repository-state-mutated" },
    }));
    expect(observation.status).toBe("incomplete");
    expect(observation.findings[0]?.code).toBe("PROJECT_HEALTH_OWNER_COMMAND_DIRTY_TREE");
    expect(observation.metricsById["generated-bytes-current"]).toEqual({
      id: "generated-bytes-current",
      kind: "boolean",
      status: "not-evaluated",
      reasonCode: "OWNER_COMMAND_DIRTY_TREE",
    });
  });

  it("reports incomplete when an owner times out", () => {
    const observation = runContractParitySensorV1(prOwners({
      typecheck: { executionStatus: "timed-out" },
    }));
    expect(observation.status).toBe("incomplete");
    expect(observation.findings[0]?.code).toBe("PROJECT_HEALTH_OWNER_COMMAND_TIMEOUT");
    expect(observation.metricsById["generated-bytes-current"]).toMatchObject({
      status: "not-evaluated",
      reasonCode: "OWNER_COMMAND_TIMEOUT",
    });
  });

  it("reports incomplete when owner evidence binds a stale commit", () => {
    const observation = runContractParitySensorV1(prOwners({
      typecheck: { commitSha: STALE_SHA },
    }));
    expect(observation.status).toBe("incomplete");
    expect(observation.metricsById["generated-bytes-current"]).toMatchObject({
      status: "not-evaluated",
      reasonCode: "OWNER_COMMAND_STALE_TREE",
    });
  });

  it("reports incomplete when a required owner is missing", () => {
    const observation = runContractParitySensorV1([
      owner("agent-self-check", "read-only-verifier"),
      owner("playground-build", "generated-bytes"),
      owner("tracked-tree-clean", "read-only-verifier"),
    ]);
    expect(observation.status).toBe("incomplete");
    expect(observation.metricsById["generated-bytes-current"]).toMatchObject({
      status: "not-evaluated",
      reasonCode: "OWNER_COMMAND_NOT_RUN",
    });
  });

  it("maps generated-byte owner failure to drift", () => {
    const observation = runContractParitySensorV1(prOwners({
      "playground-build": { executionStatus: "failed" },
    }));
    expect(observation.status).toBe("failed");
    expect(observation.findings[0]?.code).toBe("PROJECT_HEALTH_GENERATED_DRIFT");
    expect(observation.metricsById["generated-bytes-current"]).toEqual({
      id: "generated-bytes-current",
      kind: "boolean",
      value: false,
    });
  });

  it("maps dependency-lock owner failure to lock drift", () => {
    const observation = runContractParitySensorV1([
      ...prOwners(),
      owner("dependency-lock", "dependency-lock", { executionStatus: "failed" }),
    ]);
    expect(observation.status).toBe("failed");
    expect(observation.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_DEPENDENCY_LOCK_DRIFT")).toBe(true);
  });

  it("maps a failed read-only verifier to a failed observation", () => {
    const observation = runContractParitySensorV1(prOwners({
      typecheck: { executionStatus: "failed" },
    }));
    expect(observation.status).toBe("failed");
    expect(observation.metricsById["generated-bytes-current"]).toEqual({
      id: "generated-bytes-current",
      kind: "boolean",
      value: false,
    });
  });

  it("passes when required owners including a read-only verifier succeed", () => {
    const observation = runContractParitySensorV1(prOwners());
    expect(observation.status).toBe("passed");
    expect(observation.findings).toEqual([]);
    expect(observation.metricsById["generated-bytes-current"]).toEqual({
      id: "generated-bytes-current",
      kind: "boolean",
      value: true,
    });
  });
});
