import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseProjectHealthProfileV1 } from "../contracts";
import {
  observePerformanceSizeV1,
  type PerformanceSizeMeasurementV1,
} from "./performance-size";

const REPOSITORY_ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const BUDGET = 12_582_912;

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

function measurement(
  overrides: Partial<PerformanceSizeMeasurementV1> = {},
): PerformanceSizeMeasurementV1 {
  return {
    runnerProfileId: "github-linux-x64",
    bundleBytes: 1_000_000,
    ...overrides,
  };
}

describe("performance-size sensor", () => {
  it("does not spawn or compare hardware metrics across runner profiles", async () => {
    const source = await readFileAsync(new URL("./performance-size.ts", import.meta.url), "utf8");
    expect(source).not.toMatch("child_process");
    expect(source).not.toMatch("durationMilliseconds");
    expect(source).not.toMatch("peakOwnerCount");
    const observation = observePerformanceSizeV1({
      profile: parsedProfile(),
      measurement: measurement(),
      baseline: measurement({
        runnerProfileId: "macos-arm64",
        bundleBytes: 4_000_000,
      }),
    });
    expect(observation.status).toBe("passed");
    expect(observation.findings).toEqual([]);
  });

  it("fails a static bundle that exceeds the frozen budget", () => {
    const observation = observePerformanceSizeV1({
      profile: parsedProfile(),
      measurement: measurement({ bundleBytes: BUDGET + 1 }),
      baseline: null,
    });
    expect(observation.status).toBe("failed");
    expect(observation.findings[0]?.code).toBe("PROJECT_HEALTH_PERFORMANCE_SIZE_BUDGET_EXCEEDED");
    expect(observation.findings[0]?.policy).toBe("advisory-p2");
    expect(observation.metricsById["bundle-bytes"]).toEqual({
      id: "bundle-bytes",
      kind: "bytes",
      valueBytes: BUDGET + 1,
    });
  });

  it("passes a bundle at or below the frozen budget", () => {
    const observation = observePerformanceSizeV1({
      profile: parsedProfile(),
      measurement: measurement({ bundleBytes: BUDGET }),
      baseline: null,
    });
    expect(observation.status).toBe("passed");
    expect(observation.findings).toEqual([]);
  });
});
