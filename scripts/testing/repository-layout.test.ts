import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { scanThreeWorkspace } from "../lib/three-workspace-boundary";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));

async function packageManifests(): Promise<string[]> {
  const entries = await readdir(path.join(REPOSITORY_ROOT, "packages"), { withFileTypes: true });
  const manifests: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      if ((await stat(path.join(REPOSITORY_ROOT, "packages", entry.name, "package.json"))).isFile()) manifests.push(entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return manifests.sort();
}

describe("Three repository layout", () => {
  it("keeps exactly the runtime packages and current Creator applications", async () => {
    expect(await packageManifests()).toEqual(["camera-collision", "three-world"]);
    for (const application of ["apps/creator-evaluation-site", "apps/three-creator-playground"]) {
      expect((await stat(path.join(REPOSITORY_ROOT, application))).isDirectory()).toBe(true);
    }
  });

  it("keeps executable scripts under their responsibilities and current documentation authorities", async () => {
    const entries = await readdir(path.join(REPOSITORY_ROOT, "scripts"), { withFileTypes: true });
    expect(entries.filter((entry) => entry.isFile() && entry.name !== "README.md").map((entry) => entry.name)).toEqual([]);
    for (const currentPath of [
      "scripts/three-creator", "scripts/three-episode", "scripts/cloud", "scripts/testing",
      "docs/three-sdk-architecture.md", "docs/three-sdk-data-production.md", "packages/three-world/README.md",
      "deploy/creator-evaluation/gateway.mjs",
    ]) {
      expect(await stat(path.join(REPOSITORY_ROOT, currentPath))).toBeDefined();
    }
  });

  it("resolves all workspace dependencies", async () => {
    expect(await scanThreeWorkspace(REPOSITORY_ROOT)).toEqual([]);
  });
});
