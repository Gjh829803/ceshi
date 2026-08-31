import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseWorkspaceBoundaryEvidenceV1,
  type WorkspaceBoundaryEvidenceV1,
} from "../../lib/workspace-boundary-contract";
import { planChangeImpactV1 } from "../change-impact";
import {
  parseProjectHealthGateReceiptV1,
  parseProjectHealthProfileV1,
  type ProjectHealthGateReceiptV1,
} from "../contracts";
import { observeTestTopologyV1 } from "./test-topology";

const REPOSITORY_ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const COMMIT_SHA = "a".repeat(40);
const BASE_SHA = "b".repeat(40);
const MERGE_SHA = "c".repeat(40);
const HASH_A = `sha256:${"a".repeat(64)}`;

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

function pkg(id: string, rootPath: string) {
  return {
    id,
    rootPath,
    manifestPath: rootPath === "." ? "package.json" : `${rootPath}/package.json`,
    exportedSubpaths: [{
      subpath: ".",
      targetPath: rootPath === "." ? "index.ts" : `${rootPath}/src/index.ts`,
    }],
    productionDependencyIds: [] as string[],
    developmentDependencyIds: [] as string[],
  };
}

function fixtureEvidence(): WorkspaceBoundaryEvidenceV1 {
  return parseWorkspaceBoundaryEvidenceV1({
    kind: "workspace-boundary-evidence",
    schemaVersion: 1,
    graph: {
      kind: "workspace-dependency-graph",
      schemaVersion: 1,
      commitSha: COMMIT_SHA,
      packages: [
        pkg("fixture-root", "."),
        pkg("@whitebox-world/world-identity", "packages/world-identity"),
      ],
      edges: [],
    },
    publicSymbols: [],
    violations: [],
    reconciledDebtFingerprints: [],
  });
}

function impactFor(changedPaths: readonly string[]) {
  return planChangeImpactV1({
    profile: parsedProfile(),
    mode: "pr",
    commitSha: COMMIT_SHA,
    baseSha: BASE_SHA,
    changedPaths,
    evidence: fixtureEvidence(),
  });
}

function receiptsFor(impact: ReturnType<typeof impactFor>): ProjectHealthGateReceiptV1[] {
  return impact.plan.requiredGateIds.map((gateId, index) => parseProjectHealthGateReceiptV1({
    kind: "project-health-gate-receipt",
    schemaVersion: 1,
    gateId,
    commitSha: COMMIT_SHA,
    inputFingerprint: impact.plan.inputFingerprintsByGateId[gateId],
    commandHash: HASH_A,
    status: "passed",
    evidenceRef: `sha256:${String(index + 1).repeat(64)}`,
  }));
}

function observe(input: {
  readonly changedPaths: readonly string[];
  readonly receipts?: readonly ProjectHealthGateReceiptV1[];
  readonly censusRootTestFiles?: readonly string[];
  readonly checkoutSha?: string;
  readonly requestedHeadSha?: string;
  readonly isMergeCommit?: boolean;
}) {
  const impact = impactFor(input.changedPaths);
  return observeTestTopologyV1({
    profile: parsedProfile(),
    mode: "pr",
    impact,
    census: { rootTestFiles: input.censusRootTestFiles ?? [] },
    receipts: input.receipts ?? receiptsFor(impact),
    expectedCommitSha: COMMIT_SHA,
    requestedHeadSha: input.requestedHeadSha ?? COMMIT_SHA,
    checkoutSha: input.checkoutSha ?? COMMIT_SHA,
    isMergeCommit: input.isMergeCommit ?? false,
  });
}

describe("test-topology sensor", () => {
  it("does not spawn Git or rediscover tests", async () => {
    const source = await readFileAsync(new URL("./test-topology.ts", import.meta.url), "utf8");
    expect(source).not.toMatch("child_process");
    expect(source).not.toMatch("discoverVitestTestFilesV1");
    expect(source).not.toMatch("runProjectHealthProcessV1");
  });

  it("passes a docs-only plan without scheduling Runtime receipts", () => {
    const observation = observe({ changedPaths: ["docs/reviews/note.md"], receipts: [] });
    expect(observation.status).toBe("passed");
    expect(observation.findings).toEqual([]);
    expect(observation.metricsById["test-census-current"]).toEqual({
      id: "test-census-current",
      kind: "boolean",
      value: true,
    });
  });

  it("reports an unregistered test file", () => {
    const observation = observe({
      changedPaths: ["packages/world-identity/src/new-case.test.ts"],
    });
    expect(observation.status).toBe("failed");
    expect(observation.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_TEST_UNREGISTERED" &&
      finding.subjectRefs.includes("path:packages/world-identity/src/new-case.test.ts"))).toBe(true);
    expect(observation.metricsById["test-census-current"]).toEqual({
      id: "test-census-current",
      kind: "boolean",
      value: false,
    });
  });

  it("reports an unclassified capability path", () => {
    const observation = observe({ changedPaths: ["README.md"], receipts: [] });
    expect(observation.status).toBe("failed");
    expect(observation.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_CAPABILITY_UNREGISTERED")).toBe(true);
  });

  it("rejects evidence recorded against an older tree", () => {
    const impact = impactFor(["packages/world-identity/src/local-helper.ts"]);
    const stale = receiptsFor(impact).map((receipt) => ({
      ...receipt,
      commitSha: BASE_SHA,
    }));
    const observation = observeTestTopologyV1({
      profile: parsedProfile(),
      mode: "pr",
      impact,
      census: { rootTestFiles: [] },
      receipts: stale,
      expectedCommitSha: COMMIT_SHA,
      requestedHeadSha: COMMIT_SHA,
      checkoutSha: COMMIT_SHA,
      isMergeCommit: false,
    });
    expect(observation.status).toBe("failed");
    expect(observation.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_GATE_RECEIPT_STALE")).toBe(true);
  });

  it("reports incomplete when checkout is a merge SHA instead of pull_request.head.sha", () => {
    const observation = observe({
      changedPaths: ["packages/world-identity/src/local-helper.ts"],
      checkoutSha: MERGE_SHA,
      requestedHeadSha: COMMIT_SHA,
      isMergeCommit: true,
    });
    expect(observation.status).toBe("incomplete");
    expect(observation.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_GATE_RECEIPT_STALE")).toBe(true);
    expect(observation.metricsById["test-census-current"]).toEqual({
      id: "test-census-current",
      kind: "boolean",
      status: "not-evaluated",
      reasonCode: "GATE_RECEIPT_STALE",
    });
  });

  it("accepts exact-head receipts for a package-local TypeScript edit", () => {
    const observation = observe({
      changedPaths: ["packages/world-identity/src/local-helper.ts"],
    });
    expect(observation.status).toBe("passed");
    expect(observation.findings).toEqual([]);
  });
});
