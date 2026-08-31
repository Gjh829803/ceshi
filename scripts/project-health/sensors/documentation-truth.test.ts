import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseProjectHealthProfileV1 } from "../contracts";
import { observeDocumentationTruthV1 } from "./documentation-truth";

const REPOSITORY_ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);

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

describe("documentation-truth sensor", () => {
  it("does not spawn or treat prose as a second product validator", async () => {
    const source = await readFileAsync(new URL("./documentation-truth.ts", import.meta.url), "utf8");
    expect(source).not.toMatch("child_process");
    expect(source).not.toMatch("ValidationReportV1");
  });

  it("fails a broken repo-relative documentation link", () => {
    const observation = observeDocumentationTruthV1({
      profile: parsedProfile(),
      documents: [{
        path: "docs/guide.md",
        markdown: "See the [missing contract](./no-such-spec.md).",
      }],
      repositoryPaths: ["docs/guide.md"],
      declaredStatusesByTaskId: {},
    });
    expect(observation.status).toBe("failed");
    expect(observation.findings[0]?.code).toBe("PROJECT_HEALTH_DOCUMENTATION_TRUTH_CONFLICT");
    expect(observation.findings[0]?.subjectRefs).toEqual(["path:docs/guide.md"]);
    expect(observation.metricsById["documentation-claims-current"]).toEqual({
      id: "documentation-claims-current",
      kind: "boolean",
      value: false,
    });
  });

  it("fails a Proposed/Implemented status conflict", () => {
    const observation = observeDocumentationTruthV1({
      profile: parsedProfile(),
      documents: [{
        path: "docs/18-refactor-progress-and-backlog.md",
        markdown: "PHO-5 is Implemented and ready for production use.",
      }],
      repositoryPaths: ["docs/18-refactor-progress-and-backlog.md"],
      declaredStatusesByTaskId: { "PHO-5": "Proposed" },
    });
    expect(observation.status).toBe("failed");
    expect(observation.findings[0]?.code).toBe("PROJECT_HEALTH_DOCUMENTATION_TRUTH_CONFLICT");
  });

  it("passes resolved links and matching status claims", () => {
    const observation = observeDocumentationTruthV1({
      profile: parsedProfile(),
      documents: [{
        path: "docs/guide.md",
        markdown: "PHO-5 is Proposed. See the [spec](./spec.md) and https://example.invalid/out.",
      }],
      repositoryPaths: ["docs/guide.md", "docs/spec.md"],
      declaredStatusesByTaskId: { "PHO-5": "Proposed" },
    });
    expect(observation.status).toBe("passed");
    expect(observation.findings).toEqual([]);
  });
});
