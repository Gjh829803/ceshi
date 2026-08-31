import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseProjectHealthProfileV1 } from "../contracts";
import { observeVisualEvidenceV1, type VisualEvidenceRecordV1 } from "./visual-evidence";

const REPOSITORY_ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const COMMIT_SHA = "a".repeat(40);
const STALE_SHA = "b".repeat(40);
const IDENTITY = `sha256:${"c".repeat(64)}`;

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

function evidence(overrides: Partial<VisualEvidenceRecordV1> = {}): VisualEvidenceRecordV1 {
  return {
    expectedCommitSha: COMMIT_SHA,
    evidenceCommitSha: COMMIT_SHA,
    rendererProfileId: "playwright-chromium-swiftshader",
    goldenSelected: true,
    diffRatio: 0.01,
    identityHash: IDENTITY,
    ...overrides,
  };
}

describe("visual-evidence sensor", () => {
  it("does not embed screenshots or spawn capture", async () => {
    const source = await readFileAsync(new URL("./visual-evidence.ts", import.meta.url), "utf8");
    expect(source).not.toMatch("child_process");
    expect(source).not.toMatch(".png");
    expect(source).not.toMatch("worldkit capture");
  });

  it("reports incomplete for a stale visual tree identity", () => {
    const observation = observeVisualEvidenceV1({
      profile: parsedProfile(),
      evidence: evidence({ evidenceCommitSha: STALE_SHA }),
    });
    expect(observation.status).toBe("incomplete");
    expect(observation.metricsById["visual-golden-diff-ratio"]).toMatchObject({
      status: "not-evaluated",
      reasonCode: "OWNER_COMMAND_STALE_TREE",
    });
  });

  it("reports incomplete when a selected Golden is missing a renderer profile", () => {
    const observation = observeVisualEvidenceV1({
      profile: parsedProfile(),
      evidence: evidence({ rendererProfileId: null }),
    });
    expect(observation.status).toBe("incomplete");
  });

  it("marks an unselected Golden as not-applicable", () => {
    const observation = observeVisualEvidenceV1({
      profile: parsedProfile(),
      evidence: evidence({ goldenSelected: false, diffRatio: null }),
    });
    expect(observation.status).toBe("not-applicable");
    expect(observation.metricsById["visual-golden-diff-ratio"]).toEqual({
      id: "visual-golden-diff-ratio",
      kind: "ratio",
      status: "not-applicable",
      reasonCode: "VISUAL_GOLDEN_NOT_SELECTED",
    });
  });

  it("fails a frozen pixel metric above the Profile ratio", () => {
    const observation = observeVisualEvidenceV1({
      profile: parsedProfile(),
      evidence: evidence({ diffRatio: 0.03 }),
    });
    expect(observation.status).toBe("failed");
    expect(observation.findings[0]?.code).toBe("PROJECT_HEALTH_VISUAL_GOLDEN_DRIFT");
    expect(observation.findings[0]?.policy).toBe("advisory-p2");
    expect(observation.metricsById["visual-golden-diff-ratio"]).toEqual({
      id: "visual-golden-diff-ratio",
      kind: "ratio",
      valueRatio: 0.03,
    });
  });

  it("passes a frozen Golden at or below the threshold", () => {
    const observation = observeVisualEvidenceV1({
      profile: parsedProfile(),
      evidence: evidence({ diffRatio: 0.02 }),
    });
    expect(observation.status).toBe("passed");
    expect(observation.findings).toEqual([]);
  });
});
