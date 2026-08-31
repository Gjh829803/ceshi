import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  parseWorkspaceBoundaryEvidenceV1,
  type WorkspaceBoundaryEvidenceV1,
} from "../lib/workspace-boundary-contract";
import { createChangeImpactDiffDescriptorV1, planChangeImpactV1 } from "./change-impact";
import { parseProjectHealthProfileV1, type ProjectHealthModeV1 } from "./contracts";

const REPOSITORY_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const COMMIT_SHA = "a".repeat(40);
const BASE_SHA = "b".repeat(40);

function hostInputFingerprint(gateId: string): string {
  return sha256CanonicalJson({ authority: "host", gateId });
}

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
        pkg("@whitebox-world/contracts", "packages/contracts"),
        pkg("@whitebox-world/runtime-contracts", "packages/runtime-contracts"),
        pkg("@whitebox-world/runtime-host", "packages/runtime-host"),
        pkg("@whitebox-world/runtime-babylon", "packages/runtime-babylon"),
        pkg("@whitebox-world/protocol", "packages/protocol"),
        pkg("@whitebox-world/playground", "apps/playground"),
        pkg("@whitebox-world/studio", "apps/studio"),
      ],
      edges: [
        {
          importerPath: "apps/playground/src/index.ts",
          importerPackageId: "@whitebox-world/playground",
          specifier: "@whitebox-world/contracts",
          targetPackageId: "@whitebox-world/contracts",
          usage: "production",
        },
        {
          importerPath: "apps/playground/src/runtime.ts",
          importerPackageId: "@whitebox-world/playground",
          specifier: "@whitebox-world/runtime-contracts",
          targetPackageId: "@whitebox-world/runtime-contracts",
          usage: "production",
        },
        {
          importerPath: "apps/studio/src/index.ts",
          importerPackageId: "@whitebox-world/studio",
          specifier: "@whitebox-world/contracts",
          targetPackageId: "@whitebox-world/contracts",
          usage: "production",
        },
        {
          importerPath: "apps/playground/src/identity.ts",
          importerPackageId: "@whitebox-world/playground",
          specifier: "@whitebox-world/world-identity",
          targetPackageId: "@whitebox-world/world-identity",
          usage: "production",
        },
      ],
    },
    publicSymbols: [
      {
        packageId: "@whitebox-world/contracts",
        sourcePath: "packages/contracts/src/index.ts",
        exportSubpath: ".",
        symbolName: "publicContract",
        isTypeOnly: false,
        isReexport: false,
      },
      {
        packageId: "@whitebox-world/runtime-contracts",
        sourcePath: "packages/runtime-contracts/src/index.ts",
        exportSubpath: ".",
        symbolName: "browserProtocol",
        isTypeOnly: false,
        isReexport: false,
      },
    ],
    violations: [],
    reconciledDebtFingerprints: [],
  });
}

function hostInputFingerprints(profile: ReturnType<typeof parsedProfile>) {
  return Object.fromEntries([
    ...new Set(Object.values(profile.capabilityGateIdsById).flat()),
  ].map((gateId) => [gateId, hostInputFingerprint(gateId)]));
}

function planFor(
  changedPaths: readonly string[],
  mode: ProjectHealthModeV1 = "pr",
  inputFingerprintsByGateId?: Readonly<Record<string, string>>,
) {
  const profile = parsedProfile();
  return planChangeImpactV1({
    profile,
    mode,
    commitSha: COMMIT_SHA,
    baseSha: BASE_SHA,
    changedPaths,
    evidence: fixtureEvidence(),
    inputFingerprintsByGateId: inputFingerprintsByGateId ?? hostInputFingerprints(profile),
  });
}

describe("change impact planner", () => {
  it("registers a frozen git diff descriptor and does not spawn Git while planning", async () => {
    const source = await readFileAsync(new URL("./change-impact.ts", import.meta.url), "utf8");
    expect(source).not.toMatch("runProjectHealthProcessV1");
    expect(source).not.toMatch("execFile");
    expect(source).not.toMatch("spawn(");
    const descriptor = createChangeImpactDiffDescriptorV1({
      baseSha: BASE_SHA,
      headSha: COMMIT_SHA,
    });
    expect(descriptor.id).toBe("change-impact-diff");
    expect(descriptor.argv).toEqual([
      "git",
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      "--no-renames",
      BASE_SHA,
      COMMIT_SHA,
    ]);
  });

  it("keeps a package-local source edit on the TypeScript contract gates", () => {
    const result = planFor(["packages/world-identity/src/local-helper.ts"]);
    expect(result.unregisteredPaths).toEqual([]);
    expect(result.plan.requiredGateIds).toEqual(["test-contract", "typecheck"]);
    expect(result.plan.advisoryGateIds).toEqual(["unreleased-clean-break"]);
    expect(result.plan.requiredGateIds).not.toContain("playground-build");
    expect(result.plan.requiredGateIds).not.toContain("canonical");
    expect(result.plan.inputFingerprintsByGateId).toEqual({
      "test-contract": hostInputFingerprint("test-contract"),
      typecheck: hostInputFingerprint("typecheck"),
      "unreleased-clean-break": hostInputFingerprint("unreleased-clean-break"),
    });
  });

  it("fail-closes when the Host omits an affected Gate input fingerprint", () => {
    expect(() => planFor(
      ["packages/world-identity/src/local-helper.ts"],
      "pr",
      { typecheck: hostInputFingerprint("typecheck") },
    )).toThrow("Gate test-contract has no Host input fingerprint");
  });

  it("expands a public contract export through reverse workspace dependents", () => {
    const result = planFor(["packages/contracts/src/index.ts"]);
    expect(result.plan.requiredGateIds).toEqual([
      "playground-build",
      "test-contract",
      "test-studio",
      "typecheck",
    ]);
    expect(result.plan.advisoryGateIds).toEqual(["unreleased-clean-break"]);
    expect(result.plan.reasonsByGateId["playground-build"]).toContain("REVERSE_WORKSPACE_DEPENDENCY");
  });

  it("marks runtime-host authority edits for resource-heavy and Browser gates", () => {
    const result = planFor(["packages/runtime-host/src/host.ts"]);
    expect(result.plan.requiredGateIds).toEqual([
      "test-contract",
      "test-resource-heavy",
      "typecheck",
    ]);
    expect(result.plan.advisoryGateIds).toEqual([
      "canonical",
      "control-capture",
      "outdoor-gameplay",
      "unreleased-clean-break",
      "validation-capture",
    ]);
  });

  it("treats a Browser protocol public export as canonical plus reverse dependents", () => {
    const result = planFor(["packages/runtime-contracts/src/index.ts"]);
    expect(result.plan.requiredGateIds).toEqual([
      "playground-build",
      "test-contract",
      "typecheck",
    ]);
    expect(result.plan.advisoryGateIds).toEqual([
      "canonical",
      "control-capture",
      "outdoor-gameplay",
      "unreleased-clean-break",
      "validation-capture",
    ]);
  });

  it("schedules playground-build for a Vite config edit", () => {
    const result = planFor(["apps/playground/vite.config.mjs"]);
    expect(result.plan.requiredGateIds).toContain("playground-build");
    expect(result.plan.requiredGateIds).toEqual([
      "playground-build",
      "test-contract",
      "typecheck",
    ]);
    expect(result.plan.advisoryGateIds).toEqual([
      "canonical",
      "control-capture",
      "outdoor-gameplay",
      "unreleased-clean-break",
      "validation-capture",
    ]);
  });

  it("does not infer visual or Runtime replay from a visual verifier edit", () => {
    const result = planFor(["scripts/visual/entry-third-person.ts"]);
    expect(result.plan.requiredGateIds).toEqual(["test-contract", "typecheck"]);
    expect(result.plan.advisoryGateIds).toEqual(["unreleased-clean-break"]);
    expect(result.plan.advisoryGateIds.join(" ")).not.toMatch(/canonical|outdoor|visual/);
  });

  it("classifies a docs-only change without Runtime gates", () => {
    const result = planFor(["docs/reviews/note.md"]);
    expect(result.unregisteredPaths).toEqual([]);
    expect(result.matchedCapabilityIdsByPath["docs/reviews/note.md"]).toEqual(["documentation-only"]);
    expect(result.plan.requiredGateIds).toEqual([]);
    expect(result.plan.advisoryGateIds).toEqual([]);
  });

  it("registers a new test path as test-census work", () => {
    const result = planFor(["packages/world-identity/src/new-case.test.ts"]);
    expect(result.plan.requiredGateIds).toEqual(["test-census", "test-contract", "typecheck"]);
    expect(result.matchedCapabilityIdsByPath["packages/world-identity/src/new-case.test.ts"]).toEqual([
      "test-registration",
      "typescript-public-contract",
    ]);
  });

  it("fail-closes an unclassified path", () => {
    const result = planFor(["README.md"]);
    expect(result.unregisteredPaths).toEqual(["README.md"]);
    expect(result.plan.requiredGateIds).toEqual([]);
  });

  it("keeps Nightly/Release Browser gates advisory in PR and required later", () => {
    const pr = planFor(["packages/runtime-host/src/host.ts"], "pr");
    const nightly = planFor(["packages/runtime-host/src/host.ts"], "nightly");
    expect(pr.plan.requiredGateIds).not.toContain("canonical");
    expect(nightly.plan.requiredGateIds).toEqual([
      "canonical",
      "control-capture",
      "outdoor-gameplay",
      "test-contract",
      "test-resource-heavy",
      "typecheck",
      "unreleased-clean-break",
      "validation-capture",
    ]);
  });
});
