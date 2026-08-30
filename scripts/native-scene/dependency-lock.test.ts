import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertBabylonNativeDependencyLockMatchesInstalledTreeV1,
  resolveBabylonNativeDependencyLockV1,
} from "./dependency-lock.js";

const roots: string[] = [];
const REGISTRY_PACKAGES = Object.freeze({
  "@babylonjs/core": "9.23.0",
  rollup: "4.62.4",
  typescript: "5.9.3",
  vite: "7.3.6",
  "unused-package": "1.0.0",
} as const);
const WORKSPACE_PACKAGES = Object.freeze({
  "@whitebox-world/native-babylon": "packages/native-babylon",
  "@whitebox-world/native-babylon-block-profile":
    "packages/native-babylon-block-profile",
} as const);

function packagePath(root: string, packageName: string): string {
  return path.join(root, "node_modules", ...packageName.split("/"));
}

async function writePackage(
  root: string,
  packageName: string,
  version: string,
  directoryPath: string,
): Promise<void> {
  await mkdir(path.join(root, directoryPath, "src"), { recursive: true });
  await writeFile(path.join(root, directoryPath, "package.json"), JSON.stringify({
    name: packageName,
    version,
    type: "module",
  }, null, 2));
  await writeFile(
    path.join(root, directoryPath, "src/index.js"),
    `export const packageName = ${JSON.stringify(packageName)};\n`,
  );
}

async function fixture(options: Readonly<{
  includeBlockProfile?: boolean;
  integrityOverride?: string;
}> = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "worldkit-dependency-lock-"));
  roots.push(root);
  const includeBlockProfile = options.includeBlockProfile !== false;
  const workspaceRows = Object.entries(WORKSPACE_PACKAGES).filter(([packageName]) =>
    includeBlockProfile || packageName !== "@whitebox-world/native-babylon-block-profile");
  for (const [packageName, directoryPath] of workspaceRows) {
    await writePackage(root, packageName, "0.0.0", directoryPath);
  }
  for (const [packageName, version] of Object.entries(REGISTRY_PACKAGES)) {
    await writePackage(
      root,
      packageName,
      version,
      path.relative(root, packagePath(root, packageName)),
    );
  }

  const workspaceDependencies = workspaceRows.map(([packageName, directoryPath]) =>
    `      '${packageName}':\n        specifier: workspace:*\n        version: link:${directoryPath}`)
    .join("\n");
  const registryDependencies = (["@babylonjs/core"] as const).map((packageName) => {
    const version = REGISTRY_PACKAGES[packageName];
    return `      '${packageName}':\n        specifier: ${version}\n        version: ${version}`;
  }).join("\n");
  const devDependencies = (["typescript", "vite"] as const).map((packageName) => {
    const version = REGISTRY_PACKAGES[packageName];
    return `      '${packageName}':\n        specifier: ${version}\n        version: ${version}`;
  }).join("\n");
  const registryEntries = Object.entries(REGISTRY_PACKAGES).map(
    ([packageName, version]) =>
      `  '${packageName}@${version}':\n    resolution: {integrity: ${
        options.integrityOverride ?? "sha512-dGVzdA=="
      }}`,
  ).join("\n");
  await writeFile(path.join(root, "pnpm-lock.yaml"), `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
${registryDependencies}
${workspaceDependencies}
    devDependencies:
${devDependencies}
packages:
${registryEntries}
snapshots:
  'rollup@4.62.4': {}
`);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { force: true, recursive: true })));
});

describe("Babylon Native installed-tree Dependency Lock", () => {
  it("resolves deterministic actual-use closure across independent roots", async () => {
    const externalImportSpecifiers = [
      "@babylonjs/core/Maths/math.vector.js",
      "@whitebox-world/native-babylon",
      "@whitebox-world/native-babylon-block-profile",
    ] as const;
    const resolved = await Promise.all([await fixture(), await fixture()].map(
      (repositoryRoot) => resolveBabylonNativeDependencyLockV1({
        repositoryRoot,
        externalImportSpecifiers,
      }),
    ));
    expect(resolved[0]).toEqual(resolved[1]);
    expect(resolved[0]?.dependencyLock.entries.map((entry) => entry.packageName))
      .toEqual([
        "@babylonjs/core",
        "@whitebox-world/native-babylon",
        "@whitebox-world/native-babylon-block-profile",
        "rollup",
        "typescript",
        "vite",
      ]);
    expect(resolved[0]?.dependencyLock.entries.map((entry) => entry.usage))
      .toEqual([
        "runtime-external",
        "runtime-external",
        "runtime-external",
        "bundle-toolchain",
        "bundle-toolchain",
        "bundle-toolchain",
      ]);
    expect(resolved[0]?.dependencyLock.lockfileHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(resolved[0]?.dependencyLock.entries.every((entry) =>
      /^sha256:[a-f0-9]{64}$/.test(entry.packageManifestHash) &&
      /^sha256:[a-f0-9]{64}$/.test(entry.packageIntegrityHash)
    )).toBe(true);
    expect(JSON.stringify(resolved[0])).not.toContain("@babylonjs/havok");
    expect(JSON.stringify(resolved[0])).not.toContain("unused-package");
  });

  it("detects an installed file changed after the lock was frozen", async () => {
    const repositoryRoot = await fixture();
    const input = {
      repositoryRoot,
      externalImportSpecifiers: ["@whitebox-world/native-babylon"],
    } as const;
    const resolved = await resolveBabylonNativeDependencyLockV1(input);
    await writeFile(
      path.join(repositoryRoot, "packages/native-babylon/src/index.js"),
      "export const tampered = true;\n",
    );
    await expect(assertBabylonNativeDependencyLockMatchesInstalledTreeV1(
      input,
      resolved.dependencyLock,
    )).rejects.toThrow(/WORLDKIT_NATIVE_DEPENDENCY_LOCK_MISMATCH/);
  });

  it("rejects missing imports, manifest/version drift, and malformed lock integrity", async () => {
    const missing = await fixture({ includeBlockProfile: false });
    await expect(resolveBabylonNativeDependencyLockV1({
      repositoryRoot: missing,
      externalImportSpecifiers: [
        "@whitebox-world/native-babylon",
        "@whitebox-world/native-babylon-block-profile",
      ],
    })).rejects.toThrow(/WORLDKIT_NATIVE_DEPENDENCY_LOCK_RESOLUTION_FAILED/);

    const missingManifest = await fixture();
    await rm(path.join(missingManifest, "node_modules/vite/package.json"));
    await expect(resolveBabylonNativeDependencyLockV1({
      repositoryRoot: missingManifest,
      externalImportSpecifiers: ["@whitebox-world/native-babylon"],
    })).rejects.toThrow(/WORLDKIT_NATIVE_DEPENDENCY_LOCK_RESOLUTION_FAILED/);

    const wrongVersion = await fixture();
    await writeFile(
      path.join(wrongVersion, "node_modules/typescript/package.json"),
      JSON.stringify({ name: "typescript", version: "0.0.1" }),
    );
    await expect(resolveBabylonNativeDependencyLockV1({
      repositoryRoot: wrongVersion,
      externalImportSpecifiers: ["@whitebox-world/native-babylon"],
    })).rejects.toThrow(/WORLDKIT_NATIVE_DEPENDENCY_LOCK_RESOLUTION_FAILED/);

    const wrongIntegrity = await fixture({ integrityOverride: "wrong" });
    await expect(resolveBabylonNativeDependencyLockV1({
      repositoryRoot: wrongIntegrity,
      externalImportSpecifiers: ["@whitebox-world/native-babylon"],
    })).rejects.toThrow(/WORLDKIT_NATIVE_DEPENDENCY_LOCK_RESOLUTION_FAILED/);
  });

  it("rejects symlinks inside one installed package tree", async () => {
    const repositoryRoot = await fixture();
    const outside = path.join(repositoryRoot, "outside.js");
    await writeFile(outside, "export const escaped = true;\n");
    await symlink(
      outside,
      path.join(repositoryRoot, "packages/native-babylon/src/escaped.js"),
    );
    await expect(resolveBabylonNativeDependencyLockV1({
      repositoryRoot,
      externalImportSpecifiers: ["@whitebox-world/native-babylon"],
    })).rejects.toThrow(/WORLDKIT_NATIVE_DEPENDENCY_LOCK_RESOLUTION_FAILED/);
  });
});
