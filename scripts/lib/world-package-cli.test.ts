import {
  chmodSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  BABYLON_WEB_WORLD_PACKAGE_HOST_POLICY_V1,
  type WorldPackageHostPolicyV1,
} from "@whitebox-world/world-package";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@whitebox-world/runtime-babylon", () => {
  throw new Error("Package admission must not construct a Babylon adapter");
});
vi.mock("@whitebox-world/runtime-host", () => {
  throw new Error("Package admission must not construct a RuntimeHost");
});

import {
  buildWorldPackageDirectoryV1,
  inspectWorldPackageDirectoryV1,
  loadRuntimeWorldConfigurationFromPackageDirectoryV1,
} from "./world-package-cli";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const BASIC_WORLD_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/basic-world.json",
);
const G_BOT_WORLD_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/g-bot-subject-world.json",
);
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await realpath(
    await mkdtemp(path.join(tmpdir(), "world-package-cli-")),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function expectSuccess<Result extends Readonly<{
  ok: boolean;
  diagnostics: readonly unknown[];
}>>(result: Result): asserts result is Extract<Result, { ok: true }> {
  expect(result.ok).toBe(true);
  expect(result.diagnostics).toEqual([]);
  if (!result.ok) throw new Error("expected successful Package command");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("WorldPackage command core", () => {
  it("builds and independently inspects one complete basic-world directory", async () => {
    const directory = await temporaryDirectory();
    const outputDirectoryPath = path.join(directory, "basic-world.package");
    const built = await buildWorldPackageDirectoryV1({
      inputPath: BASIC_WORLD_PATH,
      outputDirectoryPath,
    });
    expectSuccess(built);
    expect(built).toMatchObject({
      kind: "worldkit-package-command-result",
      schemaVersion: 1,
      protocolVersion: 1,
      sdkVersion: "0.0.0",
      specVersion: "2026-08-17",
      command: "build",
      ok: true,
      exitCode: 0,
      packageId: "basic-world.world-package",
      worldId: "basic-world",
      runtimeTarget: "babylon-web",
      packageFormatVersion: 1,
      manifestSchemaVersion: 1,
      distributionPolicy: "redistributable",
      signatureCount: 0,
    });
    expect(built.worldPackageRef).toMatch(
      /^package:\/\/world-package\/sha256\/[a-f0-9]{64}$/,
    );
    expect(built.worldPackageRootHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(built.fileCount).toBeGreaterThan(8);

    const inspected = await inspectWorldPackageDirectoryV1({
      packageDirectoryPath: outputDirectoryPath,
    });
    expectSuccess(inspected);
    expect(inspected).toEqual({ ...built, command: "inspect" });
  });

  it("builds deterministically and refuses to replace an existing destination", async () => {
    const directory = await temporaryDirectory();
    const firstPath = path.join(directory, "first.package");
    const secondPath = path.join(directory, "second.package");
    const first = await buildWorldPackageDirectoryV1({
      inputPath: BASIC_WORLD_PATH,
      outputDirectoryPath: firstPath,
    });
    const second = await buildWorldPackageDirectoryV1({
      inputPath: BASIC_WORLD_PATH,
      outputDirectoryPath: secondPath,
    });
    expectSuccess(first);
    expectSuccess(second);
    expect(second.worldPackageRootHash).toBe(first.worldPackageRootHash);
    expect(second.worldPackageRef).toBe(first.worldPackageRef);

    const repeated = await buildWorldPackageDirectoryV1({
      inputPath: BASIC_WORLD_PATH,
      outputDirectoryPath: firstPath,
    });
    expect(repeated).toMatchObject({
      command: "build",
      ok: false,
      exitCode: 1,
      diagnostics: [{ code: "WORLD_PACKAGE_OUTPUT_UNAVAILABLE" }],
    });
  }, 15_000);

  it("loads the exact G Bot Runtime configuration and package-owned resource bytes", async () => {
    const directory = await temporaryDirectory();
    const outputDirectoryPath = path.join(directory, "g-bot.package");
    const built = await buildWorldPackageDirectoryV1({
      inputPath: G_BOT_WORLD_PATH,
      outputDirectoryPath,
    });
    expectSuccess(built);
    expect(built.resourceCount).toBeGreaterThan(0);
    expect(built.distributionPolicy).toBe("internal-only");

    const loaded = await loadRuntimeWorldConfigurationFromPackageDirectoryV1({
      packageDirectoryPath: outputDirectoryPath,
    });
    expectSuccess(loaded.result);
    if (!("runtimeWorldConfiguration" in loaded)) {
      throw new Error("expected loaded Runtime configuration");
    }
    expect(loaded.result.command).toBe("load");
    expect(loaded.runtimeWorldConfiguration.worldBuildIdentity.worldPackageRef).toBe(
      built.worldPackageRef,
    );
    expect(
      loaded.runtimeWorldConfiguration.worldBuildIdentity.worldPackageRootHash,
    ).toBe(built.worldPackageRootHash);
    expect(loaded.result.worldBuildIdentityHash).toBe(
      built.worldBuildIdentityHash,
    );
    expect(
      loaded.runtimeWorldConfiguration.sceneSource.kind ===
          "canonical-execution-plan"
        ? loaded.runtimeWorldConfiguration.sceneSource.executionPlanHash
        : undefined,
    ).toBe(
      built.executionPlanHash,
    );
    expect(
      loaded.verifiedDirectory.resourceBytesByRef.get(
        "worldkit://subject-asset/actor.humanoid.g-bot@2",
      )?.byteLength,
    ).toBeGreaterThan(0);
  }, 30_000);

  it("fails closed on flipped Manifest and resource bytes", async () => {
    const directory = await temporaryDirectory();
    const basicPath = path.join(directory, "basic.package");
    expectSuccess(await buildWorldPackageDirectoryV1({
      inputPath: BASIC_WORLD_PATH,
      outputDirectoryPath: basicPath,
    }));
    const manifestPath = path.join(basicPath, "manifest.json");
    const manifestBytes = readFileSync(manifestPath);
    manifestBytes[0] = manifestBytes[0] === 0x7b ? 0x5b : 0x7b;
    writeFileSync(manifestPath, manifestBytes);
    const corruptManifest = await inspectWorldPackageDirectoryV1({
      packageDirectoryPath: basicPath,
    });
    expect(corruptManifest).toMatchObject({
      ok: false,
      exitCode: 2,
      diagnostics: [{ code: "WORLD_PACKAGE_INPUT_INVALID" }],
    });

    const gBotPath = path.join(directory, "g-bot.package");
    expectSuccess(await buildWorldPackageDirectoryV1({
      inputPath: G_BOT_WORLD_PATH,
      outputDirectoryPath: gBotPath,
    }));
    const assetPath = path.join(
      gBotPath,
      "resources/subject-assets/actor.humanoid.g-bot.glb",
    );
    const assetBytes = readFileSync(assetPath);
    assetBytes[32] = assetBytes[32]! ^ 0xff;
    writeFileSync(assetPath, assetBytes);
    const corruptAsset = await loadRuntimeWorldConfigurationFromPackageDirectoryV1({
      packageDirectoryPath: gBotPath,
    });
    expect(corruptAsset).toMatchObject({
      result: {
        ok: false,
        exitCode: 2,
        diagnostics: [{ code: "WORLD_PACKAGE_INPUT_INVALID" }],
      },
    });
  }, 30_000);

  it("fails closed when a Package closure file is missing", async () => {
    const directory = await temporaryDirectory();
    const packagePath = path.join(directory, "basic.package");
    expectSuccess(await buildWorldPackageDirectoryV1({
      inputPath: BASIC_WORLD_PATH,
      outputDirectoryPath: packagePath,
    }));
    unlinkSync(path.join(
      packagePath,
      "targets/babylon-web/canonical-scene-execution-plan.json",
    ));

    const inspected = await inspectWorldPackageDirectoryV1({
      packageDirectoryPath: packagePath,
    });
    expect(inspected).toMatchObject({
      command: "inspect",
      ok: false,
      exitCode: 2,
      diagnostics: [{ code: "WORLD_PACKAGE_INPUT_INVALID" }],
    });
  });

  it("rejects symlinked package files before returning an admitted result", async () => {
    const directory = await temporaryDirectory();
    const packagePath = path.join(directory, "basic.package");
    expectSuccess(await buildWorldPackageDirectoryV1({
      inputPath: BASIC_WORLD_PATH,
      outputDirectoryPath: packagePath,
    }));
    const manifestPath = path.join(packagePath, "manifest.json");
    const externalPath = path.join(directory, "external-manifest.json");
    writeFileSync(externalPath, readFileSync(manifestPath));
    chmodSync(externalPath, 0o600);
    unlinkSync(manifestPath);
    symlinkSync(externalPath, manifestPath);

    const inspected = await inspectWorldPackageDirectoryV1({
      packageDirectoryPath: packagePath,
    });
    expect(inspected).toMatchObject({
      ok: false,
      exitCode: 2,
      diagnostics: [{ code: "WORLD_PACKAGE_INPUT_INVALID" }],
    });
  });

  it("rejects a Package that the selected Host policy cannot run", async () => {
    const directory = await temporaryDirectory();
    const packagePath = path.join(directory, "basic.package");
    expectSuccess(await buildWorldPackageDirectoryV1({
      inputPath: BASIC_WORLD_PATH,
      outputDirectoryPath: packagePath,
    }));
    const incompatiblePolicy = {
      ...BABYLON_WEB_WORLD_PACKAGE_HOST_POLICY_V1,
      supportedFeatureIds: [],
    } as const satisfies WorldPackageHostPolicyV1;
    const inspected = await inspectWorldPackageDirectoryV1({
      packageDirectoryPath: packagePath,
      hostPolicy: incompatiblePolicy,
    });
    expect(inspected).toMatchObject({
      ok: false,
      exitCode: 6,
      diagnostics: [{ code: "WORLD_PACKAGE_HOST_INCOMPATIBLE" }],
    });
  });
});
