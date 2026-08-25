import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  builtInSubjectResourceRegistry,
  sourceFbxContributorAssetInventory,
  sourceFbxVehicleAssetInventory,
} from "./index";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SOURCE_FBX_ROOT = resolve(
  REPOSITORY_ROOT,
  "assets/subjects/source-fbx/vehicles",
);
const CONTRIBUTOR_SOURCE_FBX_ROOT = resolve(
  REPOSITORY_ROOT,
  "assets/subjects/source-fbx/contributors/xier120",
);

const EXPECTED_SOURCE_PATH_BY_ID = {
  "aerial-cockpit": "飞行载具/飞行载具坐里面驾驶.fbx",
  "aerial-cockpit-variant": "飞行载具/飞行载具坐里面驾驶1.fbx",
  "aerial-hanging": "飞行载具/飞行挂下面1.fbx",
  "aerial-seated": "飞行载具/飞行坐上面.fbx",
  "aerial-seated-variant": "飞行载具/飞行坐上面1.fbx",
  "aerial-standing": "飞行载具/飞行站上面.fbx",
  "flat-seated-glider": "飞行载具/平面飞行坐上面1.fbx",
  "four-wheel": "四轮载具/四轮载具.fbx",
  "hoverboard-standing": "飞行载具/滑板类上面.fbx",
  "prone-glider": "飞行载具/平面飞行趴.fbx",
  "quadruped-ridable": "四足动物/四足骑行1.fbx",
  "two-wheel": "二轮载具/二轮载具.fbx",
} as const;

async function listFbxFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directoryPath, entry.name);
      if (entry.isDirectory()) return listFbxFiles(entryPath);
      return entry.isFile() && entry.name.toLowerCase().endsWith(".fbx")
        ? [entryPath]
        : [];
    }),
  );
  return nestedFiles.flat().sort();
}

describe("source-only FBX vehicle inventory", () => {
  it("catalogs the twelve approved source files with stable traceability", () => {
    expect(sourceFbxVehicleAssetInventory).toHaveLength(12);
    expect(
      Object.fromEntries(
        sourceFbxVehicleAssetInventory.map((entry) => [
          entry.sourceId,
          entry.originalRelativePath,
        ]),
      ),
    ).toEqual(EXPECTED_SOURCE_PATH_BY_ID);
    expect(new Set(sourceFbxVehicleAssetInventory.map((entry) => entry.sourceId)).size).toBe(
      12,
    );

    for (const entry of sourceFbxVehicleAssetInventory) {
      expect(entry).toMatchObject({
        format: "fbx",
        runtimeStatus: "source-only",
        conversionRequired: true,
      });
      expect(entry.repositoryRelativePath).toBe(
        `assets/subjects/source-fbx/vehicles/${entry.sourceId}/source.fbx`,
      );
      expect(entry.byteLength).toBeGreaterThan(0);
      expect(entry.byteLength).toBeLessThan(100 * 1024 * 1024);
      expect(entry.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it("matches every catalog row to the copied file bytes and sha256", async () => {
    const expectedRepositoryPaths = sourceFbxVehicleAssetInventory
      .map((entry) => resolve(REPOSITORY_ROOT, ...entry.repositoryRelativePath.split("/")))
      .sort();
    const actualFbxPaths = await listFbxFiles(SOURCE_FBX_ROOT);
    expect(actualFbxPaths).toEqual(expectedRepositoryPaths);

    for (const entry of sourceFbxVehicleAssetInventory) {
      const absolutePath = resolve(
        REPOSITORY_ROOT,
        ...entry.repositoryRelativePath.split("/"),
      );
      const relativePath = relative(SOURCE_FBX_ROOT, absolutePath);
      expect(relativePath).not.toBe("");
      expect(relativePath.startsWith(`..${sep}`) || relativePath === "..").toBe(false);

      const [fileBytes, fileStat] = await Promise.all([
        readFile(absolutePath),
        stat(absolutePath),
      ]);
      expect(fileStat.isFile()).toBe(true);
      expect(fileStat.size).toBe(entry.byteLength);
      expect(`sha256:${createHash("sha256").update(fileBytes).digest("hex")}`).toBe(
        entry.contentHash,
      );
    }
  });

  it("keeps source-only FBX files out of runnable subject discovery", () => {
    const runnableRegistryPayload = JSON.stringify([
      ...builtInSubjectResourceRegistry.listSubjectDefinitions(),
      ...builtInSubjectResourceRegistry.listCapabilitySubjectDefinitions(),
      ...builtInSubjectResourceRegistry.listResources(),
      ...builtInSubjectResourceRegistry.listCapabilityResources(),
    ]);

    expect(runnableRegistryPayload).not.toContain("source-fbx/vehicles");
    expect(runnableRegistryPayload).not.toContain("source-fbx/contributors");
    expect(runnableRegistryPayload).not.toContain(".fbx");
  });
});

describe("source-only FBX contributor inventory", () => {
  it("catalogs the nineteen xier120 source files with generic contributor IDs", () => {
    expect(sourceFbxContributorAssetInventory).toHaveLength(19);
    expect(
      sourceFbxContributorAssetInventory.every((entry) =>
        /^xier120\.[a-z0-9-]+$/.test(entry.sourceId),
      ),
    ).toBe(true);
    expect(
      new Set(sourceFbxContributorAssetInventory.map((entry) => entry.sourceId)).size,
    ).toBe(19);
    expect(
      new Set(
        sourceFbxContributorAssetInventory.map(
          (entry) => entry.repositoryRelativePath,
        ),
      ).size,
    ).toBe(19);

    for (const entry of sourceFbxContributorAssetInventory) {
      expect(entry).toMatchObject({
        creatorId: "xier120",
        authorship: "independent-original-model",
        format: "fbx",
        runtimeStatus: "source-only",
        conversionRequired: true,
      });
      expect(entry.sourceId).toMatch(/^\S+\.\S+$/);
      expect(entry.repositoryRelativePath).toMatch(
        /^assets\/subjects\/source-fbx\/contributors\/xier120\/.+\/source\.fbx$/,
      );
      expect(entry.byteLength).toBeGreaterThan(0);
      expect(entry.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it("matches every contributor catalog row to the copied file bytes and sha256", async () => {
    const expectedRepositoryPaths = sourceFbxContributorAssetInventory
      .map((entry) => resolve(REPOSITORY_ROOT, ...entry.repositoryRelativePath.split("/")))
      .sort();
    const actualFbxPaths = await listFbxFiles(CONTRIBUTOR_SOURCE_FBX_ROOT);
    expect(actualFbxPaths).toEqual(expectedRepositoryPaths);

    for (const entry of sourceFbxContributorAssetInventory) {
      const absolutePath = resolve(
        REPOSITORY_ROOT,
        ...entry.repositoryRelativePath.split("/"),
      );
      const relativePath = relative(CONTRIBUTOR_SOURCE_FBX_ROOT, absolutePath);
      expect(relativePath).not.toBe("");
      expect(relativePath.startsWith(`..${sep}`) || relativePath === "..").toBe(false);

      const [fileBytes, fileStat] = await Promise.all([
        readFile(absolutePath),
        stat(absolutePath),
      ]);
      expect(fileStat.isFile()).toBe(true);
      expect(fileStat.size).toBe(entry.byteLength);
      expect(`sha256:${createHash("sha256").update(fileBytes).digest("hex")}`).toBe(
        entry.contentHash,
      );
    }
  });
});
