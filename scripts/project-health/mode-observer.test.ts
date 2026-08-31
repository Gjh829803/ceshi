import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { sortBy } from "lodash-es";
import { describe, expect, it } from "vitest";

import { evaluateTestGateCensusV1 } from "../lib/test-gate-census";
import { TEST_GATE_MANIFEST_V1 } from "../lib/test-gate-manifest";
import { parseWorkspaceBoundaryEvidenceV1 } from "../lib/workspace-boundary-contract";
import {
  parseProjectHealthGateReceiptV1,
  parseProjectHealthProfileV1,
  type ProjectHealthModeV1,
} from "./contracts";
import {
  projectHealthRequiredInputReadinessV1,
  observeProjectHealthModeV1,
  type ProjectHealthValidatedGateV1,
} from "./mode-observer";
import { parseProjectHealthExecutionEvidenceV1, runProjectHealthProcessV1 } from "./process-runner";
import { PROJECT_HEALTH_GATE_REGISTRY_V1 } from "./registry";

const REPOSITORY_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const COMMIT_SHA = "a".repeat(40);
const BASE_SHA = "b".repeat(40);
const HASH = `sha256:${"c".repeat(64)}`;

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8"));
}

function parsedProfile() {
  const repositoryPaths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);
  const packageParents = ["apps", "packages"] as const;
  const workspacePackageIds = ["package.json", ...packageParents.flatMap((parent) =>
    readdirSync(path.join(REPOSITORY_ROOT, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${parent}/${entry.name}/package.json`),
  )].flatMap((manifestPath) => {
    const manifest = readJson(manifestPath) as { readonly name?: unknown };
    return typeof manifest.name === "string" ? [manifest.name] : [];
  });
  return parseProjectHealthProfileV1(readJson("config/project-health/profile.json"), {
    repositoryPaths,
    workspacePackageIds,
  });
}

function workspaceEvidence() {
  return parseWorkspaceBoundaryEvidenceV1({
    kind: "workspace-boundary-evidence",
    schemaVersion: 1,
    graph: {
      kind: "workspace-dependency-graph",
      schemaVersion: 1,
      commitSha: COMMIT_SHA,
      packages: [{
        id: "fixture-root",
        rootPath: ".",
        manifestPath: "package.json",
        exportedSubpaths: [{ subpath: ".", targetPath: "index.ts" }],
        productionDependencyIds: [],
        developmentDependencyIds: [],
      }],
      edges: [],
    },
    publicSymbols: [],
    violations: [],
    reconciledDebtFingerprints: [],
  });
}

function censusJson(): string {
  return JSON.stringify({
    rootTestFiles: TEST_GATE_MANIFEST_V1.map((entry) => entry.path),
    contractTestFiles: TEST_GATE_MANIFEST_V1.filter((entry) => entry.lane === "contract").map((entry) => entry.path),
    resourceHeavyTestFiles: TEST_GATE_MANIFEST_V1.filter((entry) => entry.lane === "resource-heavy")
      .map((entry) => entry.path),
  });
}

function validatedGate(gateId: string, stdout = ""): ProjectHealthValidatedGateV1 {
  const receipt = parseProjectHealthGateReceiptV1({
    kind: "project-health-gate-receipt",
    schemaVersion: 1,
    gateId,
    commitSha: COMMIT_SHA,
    inputFingerprint: sha256CanonicalJson({ gateId, input: "fixture" }),
    commandHash: HASH,
    status: "passed",
    evidenceRef: sha256CanonicalJson({ gateId, evidence: "fixture" }),
  });
  return {
    receipt,
    evidence: parseProjectHealthExecutionEvidenceV1({
      kind: "project-health-execution-evidence",
      schemaVersion: 1,
      descriptorId: gateId,
      executionScope: "in-place-checkout",
      commandHash: HASH,
      environmentHash: HASH,
      status: "passed",
      exitCode: 0,
      signal: null,
      stdout,
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      repositoryStateBeforeHash: HASH,
      repositoryStateAfterHash: HASH,
      temporaryWorktreeRemoved: null,
      temporaryOutputRemoved: true,
      failureCodes: [],
    }),
  };
}

function gatesFor(mode: ProjectHealthModeV1) {
  const profile = parsedProfile();
  const gateIds = new Set(Object.values(profile.modesById[mode].requiredGateIdsBySensorId).flat());
  if (mode === "pr") gateIds.add("change-impact-diff");
  return new Map([...gateIds].map((gateId) => [gateId, validatedGate(
    gateId,
    gateId === "workspace-boundaries"
      ? JSON.stringify(workspaceEvidence())
      : gateId === "test-census"
        ? censusJson()
        : gateId === "dependency-inventory"
          ? JSON.stringify({ MIT: [{ name: "fixture", version: "1.0.0" }] })
          : "",
  )]));
}

describe("project health mode observer", () => {
  it("derives Required-input readiness from the current adapter closure", () => {
    const profile = parsedProfile();

    expect(projectHealthRequiredInputReadinessV1({ profile, mode: "pr" })).toEqual({
      isReady: true,
      missingRequiredSensorIds: [],
    });
    expect(projectHealthRequiredInputReadinessV1({ profile, mode: "nightly" })).toEqual({
      isReady: false,
      missingRequiredSensorIds: ["runtime-health"],
    });
    expect(projectHealthRequiredInputReadinessV1({ profile, mode: "release" })).toEqual({
      isReady: false,
      missingRequiredSensorIds: [
        "documentation-truth",
        "runtime-health",
        "supply-chain",
        "visual-evidence",
      ],
    });
  });

  it("preserves the actual workspace and census semantic JSON through the process runner", async () => {
    for (const gateId of ["workspace-boundaries", "test-census"] as const) {
      const result = await runProjectHealthProcessV1({
        repositoryRoot: REPOSITORY_ROOT,
        descriptor: PROJECT_HEALTH_GATE_REGISTRY_V1[gateId],
      });
      expect(result.evidence.status).toBe("passed");
      const raw = JSON.parse(result.evidence.stdout) as Record<string, unknown>;
      if (gateId === "workspace-boundaries") {
        expect(() => parseWorkspaceBoundaryEvidenceV1(raw)).not.toThrow();
      } else {
        expect(() => evaluateTestGateCensusV1({
          rootTestFiles: raw.rootTestFiles as string[],
          contractConfigTestFiles: raw.contractTestFiles as string[],
          resourceHeavyConfigTestFiles: raw.resourceHeavyTestFiles as string[],
          manifest: TEST_GATE_MANIFEST_V1,
        })).not.toThrow();
      }
      expect(result.evidence.stdout).not.toContain("[REDACTED_PATH]");
    }
  }, 60_000);

  it.each(["pr", "nightly", "release"] as const)(
    "produces exactly one explicit Observation for every %s Sensor",
    async (mode) => {
      const profile = parsedProfile();
      const observations = await observeProjectHealthModeV1({
        repositoryRoot: REPOSITORY_ROOT,
        profile,
        mode,
        commitSha: COMMIT_SHA,
        baseSha: mode === "pr" ? BASE_SHA : null,
        evaluatedOn: "2026-08-31",
        requestedHeadSha: COMMIT_SHA,
        checkoutSha: COMMIT_SHA,
        isMergeCommit: false,
        validatedGatesById: gatesFor(mode),
      });
      const selectedSensorIds = sortBy([
        ...profile.modesById[mode].requiredSensorIds,
        ...profile.modesById[mode].advisorySensorIds,
      ]);

      expect(sortBy(observations.map((entry) => entry.sensorId))).toEqual(selectedSensorIds);
      expect(new Set(observations.map((entry) => entry.sensorId)).size).toBe(selectedSensorIds.length);
      if (mode !== "pr") {
        expect(observations.find((entry) => entry.sensorId === "test-topology")?.status).toBe("passed");
      }
      for (const sensorId of ["runtime-health", "performance-size", "visual-evidence", "documentation-truth", "independent-review"]) {
        const observation = observations.find((entry) => entry.sensorId === sensorId);
        if (selectedSensorIds.includes(sensorId as never)) expect(observation?.status).toBe("incomplete");
      }
    },
  );

  it("keeps every PR Sensor explicit when the shared workspace evidence is malformed", async () => {
    const profile = parsedProfile();
    const validatedGatesById = gatesFor("pr");
    validatedGatesById.set("workspace-boundaries", validatedGate("workspace-boundaries", "not-json"));
    const observations = await observeProjectHealthModeV1({
      repositoryRoot: REPOSITORY_ROOT,
      profile,
      mode: "pr",
      commitSha: COMMIT_SHA,
      baseSha: BASE_SHA,
      evaluatedOn: "2026-08-31",
      requestedHeadSha: COMMIT_SHA,
      checkoutSha: COMMIT_SHA,
      isMergeCommit: false,
      validatedGatesById,
    });
    const bySensorId = new Map(observations.map((entry) => [entry.sensorId, entry]));

    expect(sortBy([...bySensorId.keys()])).toEqual(sortBy([
      ...profile.modesById.pr.requiredSensorIds,
      ...profile.modesById.pr.advisorySensorIds,
    ]));
    expect(bySensorId.get("workspace-boundary")?.status).toBe("incomplete");
    expect(bySensorId.get("supplemental-authority")?.status).toBe("incomplete");
    expect(bySensorId.get("test-topology")?.status).toBe("incomplete");
  });

  it("keeps independent Sensors observable when the Supply Chain Policy is malformed", async () => {
    const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-mode-observer-"));
    try {
      await mkdir(path.join(repositoryRoot, "config/project-health"), { recursive: true });
      await writeFile(
        path.join(repositoryRoot, "config/project-health/authority-policy.json"),
        readFileSync(path.join(REPOSITORY_ROOT, "config/project-health/authority-policy.json"), "utf8"),
      );
      await writeFile(
        path.join(repositoryRoot, "config/project-health/supply-chain-policy.json"),
        "{ malformed",
      );
      const profile = parsedProfile();
      const observations = await observeProjectHealthModeV1({
        repositoryRoot,
        profile,
        mode: "pr",
        commitSha: COMMIT_SHA,
        baseSha: BASE_SHA,
        evaluatedOn: "2026-08-31",
        requestedHeadSha: COMMIT_SHA,
        checkoutSha: COMMIT_SHA,
        isMergeCommit: false,
        validatedGatesById: gatesFor("pr"),
      });
      const bySensorId = new Map(observations.map((entry) => [entry.sensorId, entry]));

      expect(bySensorId.get("supply-chain")?.status).toBe("incomplete");
      expect(bySensorId.get("workspace-boundary")?.status).toBe("passed");
      expect(sortBy([...bySensorId.keys()])).toEqual(sortBy([
        ...profile.modesById.pr.requiredSensorIds,
        ...profile.modesById.pr.advisorySensorIds,
      ]));
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });
});
