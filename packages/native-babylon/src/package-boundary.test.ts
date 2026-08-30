import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1,
} from "./import-profile.js";

const PACKAGE_ROOT = new URL("../", import.meta.url);
const SOURCE_ROOT = new URL("./", import.meta.url);
const RUNTIME_CONTRACT_SOURCE_ROOT = new URL(
  "../../runtime-contracts/src/",
  import.meta.url,
);
const REPOSITORY_ROOT = new URL("../../../", import.meta.url);

const ALLOWED_BABYLON_IMPORTS: ReadonlySet<string> = new Set(
  BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1,
);

async function productionSources(): Promise<readonly Readonly<{
  path: string;
  source: string;
}>[]> {
  const names = (await readdir(SOURCE_ROOT))
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .sort();
  return Promise.all(names.map(async (name) => Object.freeze({
    path: fileURLToPath(new URL(name, SOURCE_ROOT)),
    source: await readFile(new URL(name, SOURCE_ROOT), "utf8"),
  })));
}

function importSpecifiers(source: string): readonly string[] {
  return [...source.matchAll(
    /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g,
  )].map((match) => match[1]!).sort();
}

async function repositorySourceTexts(root: URL): Promise<readonly string[]> {
  const output: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !["node_modules", "dist", ".codex-tmp"].includes(entry.name)
      ) {
        pending.push(new URL(`${entry.name}/`, directory));
      } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
        output.push(await readFile(new URL(entry.name, directory), "utf8"));
      }
    }
  }
  return output;
}

describe("@whitebox-world/native-babylon package boundary", () => {
  it("separates the AI-facing root from the trusted Host subpath", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("package.json", PACKAGE_ROOT), "utf8"),
    ) as Record<string, unknown>;

    expect(manifest.name).toBe("@whitebox-world/native-babylon");
    expect(manifest.exports).toEqual({
      ".": "./src/index.ts",
      "./host": "./src/host.ts",
    });
    expect(manifest.dependencies).toEqual({
      "@babylonjs/core": "9.23.0",
      "@whitebox-world/runtime-contracts": "workspace:*",
      "lodash-es": "^4.18.1",
    });
  });

  it("keeps persistent Native contracts Babylon-free and out of provider exports", async () => {
    const [rootSource, hostSource, nativeSourceNames, runtimeContractNames] =
      await Promise.all([
        readFile(new URL("index.ts", SOURCE_ROOT), "utf8"),
        readFile(new URL("host.ts", SOURCE_ROOT), "utf8"),
        readdir(SOURCE_ROOT),
        readdir(RUNTIME_CONTRACT_SOURCE_ROOT),
      ]);

    expect(nativeSourceNames).not.toEqual(expect.arrayContaining([
      "contribution.ts",
      "diagnostics.ts",
    ]));
    expect(`${rootSource}\n${hostSource}`).not.toMatch(
      /NativeScene(?:Diagnostic|CheckResult)|BabylonNativeSceneContribution/,
    );

    const persistentSources = runtimeContractNames
      .filter((name) =>
        (name.startsWith("native-scene-") || name === "strict-contract-data.ts") &&
        name.endsWith(".ts") && !name.endsWith(".test.ts")
      )
      .sort();
    expect(persistentSources).toEqual(expect.arrayContaining([
      "native-scene-asset-lock.ts",
      "native-scene-contribution.ts",
      "native-scene-dependency-lock.ts",
      "native-scene-diagnostics.ts",
      "native-scene-module-bundle.ts",
      "strict-contract-data.ts",
    ]));
    for (const name of persistentSources) {
      const source = await readFile(new URL(name, RUNTIME_CONTRACT_SOURCE_ROOT), "utf8");
      for (const specifier of importSpecifiers(source)) {
        expect(specifier, name).not.toMatch(/^@babylonjs\/|^node:|^(?:typescript|vite)$/);
      }
    }
  });

  it("keeps the current-only World Resource Lock and persistent-owner clean break", async () => {
    const retiredSymbols = [
      ["Canonical", "ResourceLockEntryV1"].join(""),
      ["Canonical", "ResourceKindV1"].join(""),
      ["canonical", "ResourceLockEntriesV1"].join(""),
      ["CANONICAL", "_RESOURCE_KINDS_V1"].join(""),
      ["canonical", "-resource-lock"].join(""),
      ["create", "WorldPackageV1"].join(""),
      ["Create", "WorldPackageV1Input"].join(""),
      ["WorldPackage", "BuildContextV1"].join(""),
      ["ResolvedWorldPackage", "ResourceArtifactV1"].join(""),
      ["WorldPackageGameplayBootstrap", "MembershipInputV1"].join(""),
      ["assertWorldPackageGameplayBootstrap", "MembershipV1"].join(""),
      ["canonicalWorldPackage", "ManifestV1"].join(""),
      ["canonicalWorldPackageFileIntegrity", "EntriesV1"].join(""),
      ["canonicalWorldPackageSignature", "EnvelopeV1"].join(""),
      ["canonicalWorldPackageDirectoryFor", "StoreV1"].join(""),
    ];
    const sources: string[] = [];
    for (const rootName of ["apps", "packages", "scripts"] as const) {
      sources.push(...await repositorySourceTexts(
        new URL(`${rootName}/`, REPOSITORY_ROOT),
      ));
    }
    const joined = sources.join("\n");
    for (const symbol of retiredSymbols) {
      expect(joined).not.toMatch(new RegExp(`\\b${symbol}\\b`));
    }
  });

  it("uses only the frozen Deep ESM profile and imports no Runtime owner", async () => {
    const sources = await productionSources();
    expect(sources.map(({ path }) => path)).not.toHaveLength(0);

    for (const { path, source } of sources) {
      const specifiers = importSpecifiers(source);
      expect(specifiers, path).not.toContain("@babylonjs/core");
      expect(source, path).not.toMatch(/import\s+\*\s+as/);
      for (const specifier of specifiers) {
        if (specifier.startsWith("@babylonjs/core/")) {
          expect(ALLOWED_BABYLON_IMPORTS.has(specifier), path).toBe(true);
        }
        expect(specifier, path).not.toMatch(
          /runtime-babylon|@babylonjs\/havok|@whitebox-world\/(?:authoring|camera|character-movement|compiler|terrain-compiler|world)(?:\/|$)|^babylonjs$|^node:|^(?:fs|path|http|https|net|tls|dgram|dns)$/,
        );
      }
      expect(source, path).not.toMatch(
        /\b(?:window|document|fetch|WebSocket|setTimeout|setInterval)\b|Date\.now\s*\(|performance\.now\s*\(|Math\.random\s*\(/,
      );
      expect(source, path).not.toMatch(
        /===\s*(?:null|undefined)|!==\s*(?:null|undefined)/,
      );
    }
  });
});
