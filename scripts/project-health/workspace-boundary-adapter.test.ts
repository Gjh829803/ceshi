import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseProjectHealthAuthorityPolicyV1, parseProjectHealthProfileV1 } from "./contracts";
import {
  parseWorkspaceBoundaryEvidenceInputV1,
  workspaceBoundaryEvidenceRefV1,
} from "./workspace-boundary-adapter";

const REPOSITORY_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8"));
}

function profileContext() {
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
  return { repositoryPaths, workspacePackageIds };
}

const VALID_EVIDENCE = {
  kind: "workspace-boundary-evidence",
  schemaVersion: 1,
  graph: {
    kind: "workspace-dependency-graph",
    schemaVersion: 1,
    commitSha: "a".repeat(40),
    packages: [
      {
        id: "@whitebox-world/root",
        rootPath: ".",
        manifestPath: "package.json",
        exportedSubpaths: [],
        productionDependencyIds: [],
        developmentDependencyIds: [],
      },
    ],
    edges: [],
  },
  publicSymbols: [],
  violations: [],
  reconciledDebtFingerprints: [],
} as const;

describe("workspace boundary adapter", () => {
  it("validates closed evidence and never imports the scanner", async () => {
    const evidence = parseWorkspaceBoundaryEvidenceInputV1(VALID_EVIDENCE);
    expect(workspaceBoundaryEvidenceRefV1(evidence).startsWith("sha256:")).toBe(true);
    expect(() => parseWorkspaceBoundaryEvidenceInputV1({
      ...VALID_EVIDENCE,
      scannerCommand: "rg",
    })).toThrow(/closed WorkspaceBoundaryEvidenceV1/i);
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./workspace-boundary-adapter.ts", import.meta.url), "utf8"));
    expect(source).not.toMatch("scanWorkspaceBoundaries");
    expect(source).not.toMatch("from \"node:child_process\"");
  });

  it("parses the frozen Authority Policy against the exact Profile", () => {
    const profile = parseProjectHealthProfileV1(readJson("config/project-health/profile.json"), profileContext());
    expect(parseProjectHealthAuthorityPolicyV1(
      readJson("config/project-health/authority-policy.json"),
      profile,
    ).id).toBe("worldkit-supplemental-authority");
  });
});
