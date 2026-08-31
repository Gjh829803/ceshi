import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { scanWorkspaceBoundaries } from "../../lib/workspace-boundary";
import { parseProjectHealthProfileV1 } from "../contracts";
import { observeWorkspaceBoundaryV1 } from "./workspace-boundary";

const REPOSITORY_ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const COMMIT_SHA = "a".repeat(40);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

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

async function fixture(source: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pho-workspace-boundary-"));
  roots.push(root);
  await Promise.all([
    mkdir(path.join(root, "packages/a/src"), { recursive: true }),
    mkdir(path.join(root, "packages/b/src"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture-root", private: true })),
    writeFile(path.join(root, "packages/a/package.json"), JSON.stringify({
      name: "@fixture/a",
      exports: { ".": "./src/index.ts" },
      dependencies: {},
    })),
    writeFile(path.join(root, "packages/b/package.json"), JSON.stringify({
      name: "@fixture/b",
      exports: { ".": "./src/index.ts" },
    })),
    writeFile(path.join(root, "packages/a/src/index.ts"), source),
    writeFile(path.join(root, "packages/b/src/index.ts"), "export const publicValue = 1;\n"),
  ]);
  return root;
}

describe("workspace-boundary sensor", { timeout: 30_000 }, () => {
  it("keeps reconciled debt as a count Metric and does not emit Findings for it", async () => {
    const evidence = await scanWorkspaceBoundaries({
      repositoryRoot: REPOSITORY_ROOT,
      commitSha: COMMIT_SHA,
    });
    const observation = observeWorkspaceBoundaryV1({ profile: parsedProfile(), evidence });
    expect(observation.status).toBe("passed");
    expect(observation.findings).toEqual([]);
    expect(observation.metricsById["workspace-boundary-debt-count"]).toEqual({
      id: "workspace-boundary-debt-count",
      kind: "count",
      valueCount: 49,
    });
  });

  it("emits a blocking Finding for an unregistered workspace edge", async () => {
    const root = await fixture('import "@fixture/b";\n');
    const evidence = await scanWorkspaceBoundaries({ repositoryRoot: root, commitSha: COMMIT_SHA });
    const observation = observeWorkspaceBoundaryV1({ profile: parsedProfile(), evidence });
    expect(observation.status).toBe("failed");
    expect(observation.findings[0]?.code).toBe("PROJECT_HEALTH_WORKSPACE_BOUNDARY_VIOLATION");
    expect(observation.findings[0]?.policy).toBe("blocking-p1");
    expect(observation.findings[0]?.evidenceClassIds).toEqual(["workspace-edge"]);
    expect(observation.findings[0]?.ownerId).toBe("workspace-boundary");
  });
});
