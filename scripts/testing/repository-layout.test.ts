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
  it("keeps organized package roots for metadata and separates runtime from maintenance", async () => {
    for (const name of ["browser-capture", "preset-content", "creator-host", "episode-pipeline"]) {
      const root = path.join(REPOSITORY_ROOT, "packages", name);
      const entries = await readdir(root, { withFileTypes: true });
      expect(entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort()).toEqual([
        "AGENTS.md", "README.md", "package.json", "tsconfig.json",
      ]);
      expect((await stat(path.join(root, "src"))).isDirectory()).toBe(true);
    }
  });

  it("keeps exactly the runtime packages and current Creator applications", async () => {
    expect(await packageManifests()).toEqual(["asset-client", "asset-contracts", "browser-capture", "camera-collision", "cloud-generation-client", "creator-host", "episode-pipeline", "preset-content", "stream-host", "stream-player", "stream-protocol", "three-world", "world-ui"]);
    for (const application of ["apps/creator-evaluation-site", "apps/stream-web", "packages/creator-host/src/browser"]) {
      expect((await stat(path.join(REPOSITORY_ROOT, application))).isDirectory()).toBe(true);
    }
  });

  it("keeps executable scripts under their responsibilities and current documentation authorities", async () => {
    const entries = await readdir(path.join(REPOSITORY_ROOT, "scripts"), { withFileTypes: true });
    expect(entries.filter((entry) => entry.isFile() && !["README.md", "AGENTS.md"].includes(entry.name)).map((entry) => entry.name)).toEqual([]);
    for (const currentPath of [
      "packages/creator-host", "packages/episode-pipeline", "apps/creator-cloud", "scripts/testing",
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
