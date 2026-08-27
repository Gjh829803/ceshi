import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isEmpty } from "lodash-es";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));

async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await stat(path.join(REPOSITORY_ROOT, relativePath));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

describe("repository layout", () => {
  it("keeps executable scripts in named responsibility directories", async () => {
    const entries = await readdir(path.join(REPOSITORY_ROOT, "scripts"), {
      withFileTypes: true,
    });
    const unexpectedRootFiles = entries
      .filter((entry) => entry.isFile() && entry.name !== "README.md")
      .map((entry) => entry.name)
      .sort();

    expect(isEmpty(unexpectedRootFiles)).toBe(true);
    for (const directory of [
      "agents",
      "assets",
      "cli",
      "examples",
      "fixtures",
      "lib",
      "scenes",
      "testing",
      "verification",
      "visual",
    ]) {
      expect(await pathExists(`scripts/${directory}`)).toBe(true);
    }
  });

  it("keeps examples and durable documentation under their single authorities", async () => {
    for (const retiredPath of [
      "artifacts/examples",
      "decisions",
      "docs/guides",
      "docs/plans",
      "docs/specs",
      "templates",
    ]) {
      expect(await pathExists(retiredPath)).toBe(false);
    }
    for (const currentPath of [
      "docs/decisions",
      "docs/superpowers/plans",
      "docs/superpowers/skills",
      "docs/superpowers/specs",
      "examples/evidence",
      "examples/templates",
    ]) {
      expect(await pathExists(currentPath)).toBe(true);
    }
  });

  it("keeps only active applications and the independently gated architecture site", async () => {
    expect(await pathExists("apps/architecture")).toBe(false);
    expect(await pathExists("apps/playground")).toBe(true);
    expect(await pathExists("apps/studio/src/server.mjs")).toBe(true);
    expect(await pathExists("sites/world-sdk-blueprint/app/page.tsx")).toBe(true);
  });
});
