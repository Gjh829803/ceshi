import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inspectModularSubjectGlb } from "./modular-subject-source";
import {
  assembleModularSubjectRuntimeBundle,
  validateModularSubjectRuntimeBundle,
} from "./modular-subject-runtime-bundle";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const GOLDEN_PACKAGE_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  "assets/subjects/packages/seedleap/golden-humanoid/v1",
);
const G_BOT_PACKAGE_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  "assets/subjects/packages/seedleap/g-bot/v1",
);

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "worldkit-runtime-bundle-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("modular Subject Runtime Bundle assembly", { timeout: 30_000 }, () => {
  it("assembles the Golden model and independent clips into one deterministic Runtime GLB", async () => {
    const first = await assembleModularSubjectRuntimeBundle({
      packageDirectory: GOLDEN_PACKAGE_DIRECTORY,
    });
    const second = await assembleModularSubjectRuntimeBundle({
      packageDirectory: GOLDEN_PACKAGE_DIRECTORY,
    });

    expect(first.glbBytes).toEqual(second.glbBytes);
    expect(first.manifestBytes).toEqual(second.manifestBytes);
    expect(first.manifest.source.animationClips.map((clip) => clip.actionId)).toEqual([
      "idle",
      "jump",
      "run",
      "walk",
    ]);
    expect(first.manifest.source.sourceArchiveIncluded).toBe(false);

    const inventory = await inspectModularSubjectGlb(first.glbBytes);
    expect(inventory).toMatchObject({
      meshCount: 1,
      skeletonCount: 1,
      animationClipCount: 4,
      externalUris: [],
    });
    expect(inventory.animationClips.map((clip) => clip.name)).toEqual([
      "idle",
      "jump",
      "run",
      "walk",
    ]);
    await expect(validateModularSubjectRuntimeBundle(first)).resolves.toBeUndefined();
  });

  it("assembles every declared G Bot action without reading the Source Archive", async () => {
    const bundle = await assembleModularSubjectRuntimeBundle({
      packageDirectory: G_BOT_PACKAGE_DIRECTORY,
    });
    const packageManifest = JSON.parse(
      await readFile(path.join(G_BOT_PACKAGE_DIRECTORY, "package.manifest.json"), "utf8"),
    ) as { animationClips: Array<{ actionId: string }> };

    expect(bundle.manifest.source.animationClips.map((clip) => clip.actionId)).toEqual(
      packageManifest.animationClips.map((clip) => clip.actionId),
    );
    expect(bundle.manifest.inventory.animationClipCount).toBe(25);
    expect(bundle.manifest.source.sourceArchiveIncluded).toBe(false);
  });

  it("keeps Runtime Bundle bytes stable when source manifest line endings differ", async () => {
    const root = await temporaryDirectory();
    const packageDirectory = path.join(root, "golden-humanoid");
    await cp(GOLDEN_PACKAGE_DIRECTORY, packageDirectory, { recursive: true });
    for (const relativePath of [
      "package.manifest.json",
      "materials/default/material-set.manifest.json",
    ]) {
      const sourcePath = path.join(packageDirectory, relativePath);
      const sourceText = await readFile(sourcePath, "utf8");
      const newline = sourceText.includes("\r\n") ? "\n" : "\r\n";
      await writeFile(sourcePath, sourceText.replace(/\r?\n/g, newline));
    }

    const baseline = await assembleModularSubjectRuntimeBundle({
      packageDirectory: GOLDEN_PACKAGE_DIRECTORY,
    });
    const alternateLineEndings = await assembleModularSubjectRuntimeBundle({
      packageDirectory,
    });

    expect(alternateLineEndings.glbBytes).toEqual(baseline.glbBytes);
    expect(alternateLineEndings.manifestBytes).toEqual(baseline.manifestBytes);
  });

  it("rejects a Clip whose bytes no longer match its manifest lock", async () => {
    const root = await temporaryDirectory();
    const packageDirectory = path.join(root, "golden-humanoid");
    await cp(GOLDEN_PACKAGE_DIRECTORY, packageDirectory, { recursive: true });
    const clipPath = path.join(packageDirectory, "animations/idle/clip.glb");
    const bytes = await readFile(clipPath);
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
    await writeFile(clipPath, bytes);

    await expect(
      assembleModularSubjectRuntimeBundle({ packageDirectory }),
    ).rejects.toThrow("MODULAR_SUBJECT_RUNTIME_INPUT_HASH_MISMATCH");
  });
});
