import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = new URL("../../../", import.meta.url);
const execFileAsync = promisify(execFile);
const IMPORT_OR_EXPORT_FROM_PATTERN = /\b(?:import|export)\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT_PATTERN = /\bimport\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT_PATTERN = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

async function source(path: string): Promise<string> {
  return readFile(new URL(path, REPOSITORY_ROOT), "utf8");
}

async function trackedTypeScriptSourcePaths(): Promise<readonly string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--", "*.ts", "*.tsx", "*.mts", "*.cts"],
    { cwd: new URL("../../../", import.meta.url).pathname },
  );
  const indexedPaths = stdout.trim().split("\n").filter(Boolean);
  const workingPaths = await Promise.all(indexedPaths.map(async (path) => {
    try {
      await access(new URL(path, REPOSITORY_ROOT));
      return path;
    } catch {
      return undefined;
    }
  }));
  return workingPaths.filter((path): path is string => path !== undefined);
}

function importsLegacyRuntimeNativeSceneModule(source: string): boolean {
  const specifiers = [
    ...source.matchAll(IMPORT_OR_EXPORT_FROM_PATTERN),
    ...source.matchAll(SIDE_EFFECT_IMPORT_PATTERN),
    ...source.matchAll(DYNAMIC_IMPORT_PATTERN),
  ].map((match) => match[1]!);
  for (const specifier of specifiers) {
    const withoutExtension = specifier.replace(/\.js$/, "");
    const pathSegments = withoutExtension.split("/");
    if (
      withoutExtension.startsWith("@whitebox-world/runtime-babylon/") &&
      pathSegments.includes("native-scene-module")
    ) return true;
    if (
      (withoutExtension.startsWith("./") || withoutExtension.startsWith("../")) &&
      pathSegments.includes("native-scene-module")
    ) return true;
  }
  return false;
}

describe("Babylon Native package migration", () => {
  it("routes the Playground through a verified Package and RuntimeHost", async () => {
    const [main, adapter, loader, runtime] = await Promise.all([
      source("apps/native-scene-playground/src/main.ts"),
      source("apps/native-scene-playground/src/native-runtime-host.ts"),
      source("apps/native-scene-playground/src/world-package-loader.ts"),
      source("packages/runtime-babylon/src/babylon-world-runtime.ts"),
    ]);

    expect(main).not.toMatch(/BabylonWorldRuntime\.create\s*\(/);
    expect(main).not.toMatch(/\b(?:module|assets|budget)\s*:/);
    expect(main).not.toContain("createBabylonGameplayWorldPortV1");
    expect(main).toContain("loadVerifiedNativeWorldPackageV1");
    expect(adapter).toContain("RuntimeHost");
    expect(adapter).toContain(
      "runtimeWorldConfigurationFromVerifiedWorldPackageV1",
    );
    expect(loader).toContain("verifyWorldPackageDirectoryV1");
    expect(runtime).not.toContain(
      "WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED",
    );
  });

  it("recognizes optional-extension, parent-relative, and package-subpath legacy imports", () => {
    for (const [declaration, specifier] of [
      ["import { module } from", "./native-scene-module"],
      ["export { module } from", "./native-scene-module.js"],
      ["import type { Module } from", "../../runtime/native-scene-module"],
      ["export type { Module } from", "../runtime/native-scene-module.js"],
      ["import { module } from", "@whitebox-world/runtime-babylon/native-scene-module"],
      ["export { module } from", "@whitebox-world/runtime-babylon/legacy/native-scene-module.js"],
    ] as const) {
      expect(importsLegacyRuntimeNativeSceneModule(
        `${declaration} "${specifier}";`,
      )).toBe(true);
    }
    for (const specifier of [
      "./native-scene-module.js",
      "../../runtime/native-scene-module",
      "@whitebox-world/runtime-babylon/legacy/native-scene-module.js",
    ]) {
      expect(importsLegacyRuntimeNativeSceneModule(
        `${"import"} "${specifier}";`,
      )).toBe(true);
      expect(importsLegacyRuntimeNativeSceneModule(
        `${"import"}("${specifier}");`,
      )).toBe(true);
    }
    expect(importsLegacyRuntimeNativeSceneModule(
      `${"export { BabylonWorldRuntime } from"} "@whitebox-world/runtime-babylon";`,
    )).toBe(false);
  });

  it("keeps authoring at the root and Host ownership on the host subpath", async () => {
    const [cloudRidge, runtime] = await Promise.all([
      source("apps/native-scene-playground/src/scene.ts"),
      source("packages/runtime-babylon/src/babylon-world-runtime.ts"),
    ]);

    expect(cloudRidge).toContain(
      'from "@whitebox-world/native-babylon"',
    );
    expect(cloudRidge).not.toContain(
      'from "@whitebox-world/runtime-babylon"',
    );
    expect(runtime).toContain(
      'from "@whitebox-world/native-babylon/host"',
    );
    expect(runtime).not.toMatch(
      /from\s+["']@whitebox-world\/native-babylon["']/,
    );
  });

  it("deletes the old owner instead of retaining aliases", async () => {
    const [runtimeIndex, bootstrap, runtimeManifest, appManifest] =
      await Promise.all([
        source("packages/runtime-babylon/src/index.ts"),
        source("apps/native-scene-playground/src/native-bootstrap.ts"),
        source("packages/runtime-babylon/package.json"),
        source("apps/native-scene-playground/package.json"),
      ]);

    await expect(access(new URL(
      "packages/runtime-babylon/src/native-scene-module.ts",
      REPOSITORY_ROOT,
    ))).rejects.toThrow();
    await expect(access(new URL(
      "packages/runtime-babylon/src/native-scene-module.test.ts",
      REPOSITORY_ROOT,
    ))).rejects.toThrow();
    expect(runtimeIndex).not.toMatch(
      /BabylonNativeSceneModule(?:V1)?\b|buildBabylonNativeSceneContribution/,
    );
    expect(bootstrap).toContain("parseBabylonNativeSceneBootstrapV1");
    expect(bootstrap).not.toContain("BabylonNativeWorldBootstrapV1");
    expect(JSON.parse(runtimeManifest).dependencies).toHaveProperty(
      "@whitebox-world/native-babylon",
      "workspace:*",
    );
    expect(JSON.parse(appManifest).dependencies).toHaveProperty(
      "@whitebox-world/native-babylon",
      "workspace:*",
    );

    const legacyImports = await Promise.all(
      (await trackedTypeScriptSourcePaths()).map(async (path) => ({
        path,
        contents: await source(path),
      })),
    );
    expect(legacyImports.filter(({ contents }) =>
      importsLegacyRuntimeNativeSceneModule(contents)
    ).map(({ path }) => path)).toEqual([]);
  });
});
