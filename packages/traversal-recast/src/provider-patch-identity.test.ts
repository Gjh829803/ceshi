import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, posix, relative, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256Bytes } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1 } from "./adapter-identity.js";

const REPOSITORY_ROOT_URL = new URL("../../../", import.meta.url);
const REPOSITORY_ROOT_PATH = fileURLToPath(REPOSITORY_ROOT_URL);

const EXPECTED_PROVIDER_PACKAGES = Object.freeze({
  recastNavigation: Object.freeze({
    packageName: "recast-navigation",
    version: "0.43.1",
    lockfileIntegritySha512:
      "sha512-BVBQEHE6uqD36opJomVkI5TxMVZ8bBLdDn90mYtBUYJnNlqEuNFOL8DH8lLOksfVVaC+kjykYuS57P6MrxVB7A==",
  }),
  core: Object.freeze({
    packageName: "@recast-navigation/core",
    version: "0.43.1",
    lockfileIntegritySha512:
      "sha512-4igfPgnoV90O92sDSIA0xHa6tanh3z/udlgGmD0SqGQ6PKV4JS2l9jWO8YnxfZuXP/NV52H4c5FU6pSdZc9WDA==",
  }),
  generators: Object.freeze({
    packageName: "@recast-navigation/generators",
    version: "0.43.1",
    lockfileIntegritySha512:
      "sha512-w7r6k/A93wWxuSN+Lg+PmlsUVXq06r5bqXmBglolxqDt2O/Y776BIhYtb6P2P6pbYqDWORu9NCZZJzfY4FNpaA==",
  }),
  wasm: Object.freeze({
    packageName: "@recast-navigation/wasm",
    version: "0.43.1",
    lockfileIntegritySha512:
      "sha512-XFL6PhO8JodwXUHBSAkfaLUdUEweIkJsdP3HTmtJvMs5fkqEWxWJmBskZlACHJepv55NAriqWxOtuLlG3t7+Hg==",
  }),
});

const EXPECTED_PATCH_DECLARATIONS = Object.freeze({
  "@recast-navigation/core@0.43.1":
    "patches/@recast-navigation__core@0.43.1.patch",
  "@recast-navigation/generators@0.43.1":
    "patches/@recast-navigation__generators@0.43.1.patch",
});

const EXPECTED_PNPM_PATCH_HASHES = Object.freeze({
  "@recast-navigation/core@0.43.1":
    "7a330d1418a92699943cf161cdcb47c6e144a6858bb0cfbcb33aa91dd1de33dd",
  "@recast-navigation/generators@0.43.1":
    "6c5bd3e917bd258087cb1a62fcd821c8730cd3d5fe62a253ddb241ffd84d26b6",
});

interface LifecyclePatchIdentity {
  readonly revision: string;
  readonly patchedDependencyKey: string;
  readonly repositoryRelativePatchPath: string;
  readonly patchBytesSha256: string;
}

interface InstalledFileIdentity {
  readonly packageRole: "core" | "generators";
  readonly packageRelativeFilePath: string;
  readonly fileBytesSha256: string;
}

interface PatchedAdapterManifest {
  readonly graphProviderAdapterResolvedVersion: string;
  readonly providerPackages: typeof EXPECTED_PROVIDER_PACKAGES;
  readonly lifecyclePatches: {
    readonly core: LifecyclePatchIdentity;
    readonly generators: LifecyclePatchIdentity;
  };
  readonly installedFiles: readonly InstalledFileIdentity[];
}

interface PnpmPatchEntry {
  readonly hash: string;
  readonly path: string;
}

interface PnpmLockfileV9 {
  readonly patchedDependencies: Record<string, PnpmPatchEntry>;
  readonly packages: Record<
    string,
    { readonly resolution?: { readonly integrity?: string } }
  >;
  readonly snapshots: Record<
    string,
    { readonly dependencies?: Record<string, string> }
  >;
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringValues);
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(collectStringValues);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function sha256CanonicalTextBytes(bytes: Uint8Array): string {
  return sha256Bytes(Buffer.from(bytes.toString().replaceAll("\r\n", "\n")));
}

function findPackageJsonPath(entryPath: string): string {
  let directory = dirname(entryPath);
  for (;;) {
    const candidate = join(directory, "package.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(`Package root not found for '${entryPath}'.`);
    }
    directory = parent;
  }
}

describe("Recast provider lifecycle patch identity", () => {
  const manifest = RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1 as unknown as
    PatchedAdapterManifest;

  it("uses portable, version-qualified lifecycle patch identity", () => {
    expect(manifest.graphProviderAdapterResolvedVersion).toBe(
      "0.43.1+lifecycle.1+source-areas.3+mapping.6",
    );
    expect(manifest.providerPackages).toEqual(EXPECTED_PROVIDER_PACKAGES);
    expect(manifest.lifecyclePatches).toMatchObject({
      core: {
        revision: "lifecycle.1",
        patchedDependencyKey: "@recast-navigation/core@0.43.1",
        repositoryRelativePatchPath:
          EXPECTED_PATCH_DECLARATIONS["@recast-navigation/core@0.43.1"],
      },
      generators: {
        revision: "lifecycle.1+source-areas.3",
        patchedDependencyKey: "@recast-navigation/generators@0.43.1",
        repositoryRelativePatchPath:
          EXPECTED_PATCH_DECLARATIONS[
            "@recast-navigation/generators@0.43.1"
          ],
      },
    });
    expect(manifest.installedFiles.map((file) =>
      `${file.packageRole}/${file.packageRelativeFilePath}`,
    )).toEqual([
      "core/dist/index.mjs",
      "generators/dist/generators/generate-tiled-nav-mesh.d.ts",
      "generators/dist/index.mjs",
    ]);
    for (const value of collectStringValues(manifest)) {
      expect(posix.isAbsolute(value)).toBe(false);
      expect(win32.isAbsolute(value)).toBe(false);
      expect(value.replaceAll("\\", "/")).not.toContain(
        "node_modules/.pnpm",
      );
    }
  });

  it("binds root patch declarations, patch bytes, and lockfile evidence", () => {
    const workspaceConfig = parse(readFileSync(
      join(REPOSITORY_ROOT_PATH, "pnpm-workspace.yaml"),
      "utf8",
    )) as { readonly patchedDependencies: Record<string, string> };
    expect(workspaceConfig.patchedDependencies).toEqual(
      EXPECTED_PATCH_DECLARATIONS,
    );

    for (const patch of [
      manifest.lifecyclePatches.core,
      manifest.lifecyclePatches.generators,
    ]) {
      const patchBytes = readFileSync(join(
        REPOSITORY_ROOT_PATH,
        patch.repositoryRelativePatchPath,
      ));
      expect(sha256CanonicalTextBytes(patchBytes)).toBe(patch.patchBytesSha256);
    }

    const lockfile = parse(readFileSync(
      join(REPOSITORY_ROOT_PATH, "pnpm-lock.yaml"),
      "utf8",
    )) as PnpmLockfileV9;
    expect(lockfile.patchedDependencies).toEqual(Object.fromEntries(
      Object.entries(EXPECTED_PATCH_DECLARATIONS).map(([key, path]) => [
        key,
        {
          hash:
            EXPECTED_PNPM_PATCH_HASHES[
              key as keyof typeof EXPECTED_PNPM_PATCH_HASHES
            ],
          path,
        },
      ]),
    ));
    for (const providerPackage of Object.values(EXPECTED_PROVIDER_PACKAGES)) {
      const packageKey =
        `${providerPackage.packageName}@${providerPackage.version}`;
      expect(lockfile.packages[packageKey]?.resolution?.integrity).toBe(
        providerPackage.lockfileIntegritySha512,
      );
    }
    const coreSnapshotRef =
      `0.43.1(patch_hash=${EXPECTED_PNPM_PATCH_HASHES["@recast-navigation/core@0.43.1"]})`;
    const generatorsSnapshotRef =
      `0.43.1(patch_hash=${EXPECTED_PNPM_PATCH_HASHES["@recast-navigation/generators@0.43.1"]})`;
    expect(lockfile.snapshots[
      `@recast-navigation/core@${coreSnapshotRef}`
    ]).toBeDefined();
    expect(lockfile.snapshots[
      `@recast-navigation/generators@${generatorsSnapshotRef}`
    ]?.dependencies?.["@recast-navigation/core"]).toBe(coreSnapshotRef);
    expect(lockfile.snapshots["recast-navigation@0.43.1"]?.dependencies)
      .toMatchObject({
        "@recast-navigation/core": coreSnapshotRef,
        "@recast-navigation/generators": generatorsSnapshotRef,
      });
    expect(lockfile.snapshots["@recast-navigation/core@0.43.1"])
      .toBeUndefined();
    expect(lockfile.snapshots["@recast-navigation/generators@0.43.1"])
      .toBeUndefined();
  });

  it("resolves transitive packages through the declared umbrella package", () => {
    const localRequire = createRequire(import.meta.url);
    const umbrellaEntry = localRequire.resolve("recast-navigation");
    const umbrellaRequire = createRequire(umbrellaEntry);
    const installedEntries = {
      recastNavigation: umbrellaEntry,
      core: umbrellaRequire.resolve("@recast-navigation/core"),
      generators: umbrellaRequire.resolve("@recast-navigation/generators"),
      wasm: umbrellaRequire.resolve("@recast-navigation/wasm"),
    };

    for (const [role, entryPath] of Object.entries(installedEntries)) {
      const packageJson = readJson(findPackageJsonPath(entryPath)) as {
        version: string;
      };
      expect(packageJson.version).toBe(
        EXPECTED_PROVIDER_PACKAGES[
          role as keyof typeof EXPECTED_PROVIDER_PACKAGES
        ].version,
      );
    }

    for (const installedFile of manifest.installedFiles) {
      const installedEntryPath = installedEntries[installedFile.packageRole];
      const installedPackageRoot = dirname(findPackageJsonPath(installedEntryPath));
      const installedFilePath = join(
        installedPackageRoot,
        installedFile.packageRelativeFilePath,
      );
      expect(relative(installedPackageRoot, installedFilePath).split(sep).join("/"))
        .toBe(installedFile.packageRelativeFilePath);
      expect(sha256CanonicalTextBytes(readFileSync(installedFilePath))).toBe(
        installedFile.fileBytesSha256,
      );
    }
  });
});
