import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  promoteArtifactsTransactionally,
  type ArtifactPromotionFaultPoint,
  type ArtifactPromotionRole,
} from "./transactional-artifact-promotion.js";

const roles = ["frame", "report", "manifest"] as const;
const phases = [
  "before-temp-write",
  "before-backup-rename",
  "before-publish-rename",
] as const;

describe("transactional artifact promotion", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "worldkit-artifact-transaction-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function targetPath(role: ArtifactPromotionRole): string {
    return path.join(root, role === "manifest" ? "artifacts" : "public", `${role}.data`);
  }

  async function prepareOldTargets(): Promise<void> {
    await mkdir(path.join(root, "public"), { recursive: true });
    await mkdir(path.join(root, "artifacts"), { recursive: true });
    for (const role of roles) await writeFile(targetPath(role), `old-${role}`);
    await writeFile(path.join(root, "public", "unrelated.data"), "keep-me");
  }

  function writes() {
    return roles.map((role) => ({
      role,
      targetPath: targetPath(role),
      contents: `new-${role}`,
    }));
  }

  async function expectNoResidue(): Promise<void> {
    const names = [
      ...await readdir(path.join(root, "public")),
      ...await readdir(path.join(root, "artifacts")),
    ];
    expect(names.filter((name) => name.includes(".worldkit-") || name.endsWith(".bak")))
      .toEqual([]);
    expect(await readFile(path.join(root, "public", "unrelated.data"), "utf8"))
      .toBe("keep-me");
  }

  it.each(phases.flatMap((phase) => roles.map((role) => ({ phase, role }))))(
    "restores every old target when $phase fails for $role",
    async ({ phase, role }) => {
      await prepareOldTargets();
      await expect(promoteArtifactsTransactionally({
        writes: writes(),
        injectFailure(point: ArtifactPromotionFaultPoint) {
          if (point.phase === phase && point.role === role) throw new Error("injected failure");
        },
      })).rejects.toThrow("injected failure");

      for (const currentRole of roles) {
        expect(await readFile(targetPath(currentRole), "utf8")).toBe(`old-${currentRole}`);
      }
      await expectNoResidue();
    },
  );

  it("publishes the manifest last and removes exact transaction siblings", async () => {
    await prepareOldTargets();
    const published: ArtifactPromotionRole[] = [];
    await promoteArtifactsTransactionally({
      writes: writes(),
      injectFailure(point) {
        if (point.phase === "before-publish-rename") published.push(point.role);
      },
    });

    expect(published).toEqual(["frame", "report", "manifest"]);
    for (const role of roles) {
      expect(await readFile(targetPath(role), "utf8")).toBe(`new-${role}`);
    }
    await expectNoResidue();
  });
});
