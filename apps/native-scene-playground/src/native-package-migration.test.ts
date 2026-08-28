import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = new URL("../../../", import.meta.url);
const execFileAsync = promisify(execFile);

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

describe("Babylon Native package migration", () => {
  it("keeps authoring at the root and Host ownership on the host subpath", async () => {
    const [cloudRidge, runtime] = await Promise.all([
      source("apps/native-scene-playground/src/cloud-ridge-scene.ts"),
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
      /BabylonNativeSceneModule|buildBabylonNativeSceneContribution/,
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

    const legacyModuleSpecifier = "./native-scene-module";
    const legacyImports = await Promise.all(
      (await trackedTypeScriptSourcePaths()).map(async (path) => ({
        path,
        contents: await source(path),
      })),
    );
    expect(legacyImports.filter(({ contents }) =>
      contents.includes(`from "${legacyModuleSpecifier}"`) ||
      contents.includes(`from '${legacyModuleSpecifier}'`)
    ).map(({ path }) => path)).toEqual([]);
  });
});
