import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildHostedNativeRunnerDistributionV1,
} from "./runner/build.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

async function listFiles(
  root: string,
  directory: string = root,
): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, absolutePath));
    } else if (entry.isFile()) {
      files.push(path.relative(root, absolutePath).split(path.sep).join("/"));
    }
  }
  return files.sort((left, right) => left.localeCompare(right, "en-US"));
}

describe("Hosted Native runner distribution", () => {
  it("builds the runner without the Canonical compiler or TypeScript runtime", async () => {
    const outputRoot = await mkdtemp(
      path.join(tmpdir(), "worldkit-hosted-runner-dist-"),
    );
    temporaryRoots.push(outputRoot);

    const report = await buildHostedNativeRunnerDistributionV1({
      repositoryRoot: path.resolve(import.meta.dirname, "../../.."),
      outputRoot,
    });

    expect(report.runnerSourceModulePaths).not.toEqual(expect.arrayContaining([
      expect.stringContaining("/packages/compiler/"),
      expect.stringContaining("/packages/authoring/"),
      expect.stringContaining("/packages/world-package/src/package-directory.ts"),
      expect.stringContaining("/node_modules/tsx/"),
    ]));
    expect(report.runnerExternalImportSpecifiers).toEqual([
      "@babylonjs/core",
      "@babylonjs/havok",
      "@babylonjs/loaders",
      "@whitebox-world/native-babylon",
      "earcut",
    ]);
    expect(report.runnerExternalImportSpecifiersExact).toEqual(
      expect.arrayContaining([
        "@whitebox-world/native-babylon",
        "@whitebox-world/native-babylon/host",
      ]),
    );
    expect(report.runnerSourceModulePaths).not.toEqual(expect.arrayContaining([
      expect.stringContaining("/packages/native-babylon/src/"),
    ]));
    expect(report.blockProfileSourceModulePaths).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("/packages/native-babylon/src/"),
      ]),
    );
    expect(report.nativeRootSourceModulePaths).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "/packages/native-babylon/src/profile-settlement.ts",
        ),
      ]),
    );
    expect(report.nativeHostSourceModulePaths.filter((sourcePath) =>
      sourcePath.endsWith(
        "/packages/native-babylon/src/profile-settlement.ts",
      )
    )).toHaveLength(1);
    expect(await stat(path.join(outputRoot, "runner.mjs"))).toMatchObject({
      size: expect.any(Number),
    });
    expect(await readFile(path.join(outputRoot, "runner.mjs"), "utf8"))
      .not.toContain("@whitebox-world/compiler");
  }, 30_000);

  it("stages the precompiled runner with its locked runtime and verifier fixtures", async () => {
    const outputRoot = await mkdtemp(
      path.join(tmpdir(), "worldkit-hosted-runner-dist-"),
    );
    temporaryRoots.push(outputRoot);

    await buildHostedNativeRunnerDistributionV1({
      repositoryRoot: path.resolve(import.meta.dirname, "../../.."),
      outputRoot,
    });
    const files = await listFiles(outputRoot);

    expect(files).toEqual(expect.arrayContaining([
      "assets/g-bot.glb",
      "hostile-fixtures/network.mjs",
      "node_modules/@babylonjs/core/package.json",
      "node_modules/@babylonjs/havok/package.json",
      "node_modules/@babylonjs/loaders/package.json",
      "node_modules/@whitebox-world/native-babylon/host.mjs",
      "node_modules/@whitebox-world/native-babylon/index.mjs",
      "node_modules/@whitebox-world/native-babylon/package.json",
      "node_modules/@whitebox-world/native-babylon-block-profile/index.mjs",
      "node_modules/@whitebox-world/native-babylon-block-profile/package.json",
      "node_modules/babylonjs-gltf2interface/package.json",
      "node_modules/earcut/package.json",
      "runner.mjs",
    ]));
    expect(files.some((file) =>
      file === "runner-entry.ts" ||
      file.startsWith("packages/") ||
      file.includes("/tsx/") ||
      file.includes("@whitebox-world/compiler") ||
      file.includes("@whitebox-world/authoring")
    )).toBe(false);

    const nativePackageRoot = path.join(
      outputRoot,
      "node_modules/@whitebox-world/native-babylon",
    );
    const nativePackageManifest = JSON.parse(await readFile(
      path.join(nativePackageRoot, "package.json"),
      "utf8",
    )) as Readonly<Record<string, unknown>>;
    expect(nativePackageManifest.exports).toEqual({
      ".": "./index.mjs",
      "./host": "./host.mjs",
    });
    expect(files.filter((file) =>
      file === "node_modules/@whitebox-world/native-babylon/host.mjs"
    )).toHaveLength(1);

  }, 30_000);
});
