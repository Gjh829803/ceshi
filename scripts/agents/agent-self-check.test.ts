import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const BUNDLES = [
  "worldkit-block-builder/scripts/subject-setup.mjs",
  "worldkit-spatial-planner/scripts/self-check.mjs",
  "worldkit-block-builder/scripts/self-check.mjs",
  "worldkit-block-builder/scripts/render-visual-review.mjs",
] as const;

describe("generated Agent self-check bundles", () => {
  it("builds into an explicit temporary root without changing tracked bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-planner-bundle-"));
    const tracked = new Map(await Promise.all(BUNDLES.map(async (relativePath) => [
      relativePath,
      await readFile(path.join(".codex/skills", relativePath)),
    ] as const)));
    try {
      const build = spawnSync(process.execPath, [
        "scripts/agents/build-agent-self-check.mjs",
        "--out-root",
        root,
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(build.status, build.stderr || build.stdout).toBe(0);
      for (const relativePath of BUNDLES) {
        expect(await readFile(path.join(root, relativePath))).toEqual(tracked.get(relativePath));
        expect(await readFile(path.join(".codex/skills", relativePath))).toEqual(
          tracked.get(relativePath),
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it.each(BUNDLES)("fails the read-only parity check for a mutated %s copy", async (mutatedBundle) => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-planner-copy-"));
    const trackedSkillsRoot = path.join(root, "skills");
    for (const relativePath of BUNDLES) {
      const copiedPath = path.join(trackedSkillsRoot, relativePath);
      await mkdir(path.dirname(copiedPath), { recursive: true });
      await copyFile(path.join(".codex/skills", relativePath), copiedPath);
    }
    const destination = path.join(trackedSkillsRoot, mutatedBundle);
    await writeFile(destination, Buffer.concat([
      await readFile(destination),
      Buffer.from("\n// parity mutation\n"),
    ]));
    const check = spawnSync("pnpm", [
      "exec",
      "tsx",
      "scripts/agents/check-agent-self-check.ts",
      "--tracked-skills-root",
      trackedSkillsRoot,
    ], { cwd: process.cwd(), encoding: "utf8" });
    expect(check.status).not.toBe(0);
    expect(check.stderr || check.stdout).toContain(destination);
  }, 30_000);
});
