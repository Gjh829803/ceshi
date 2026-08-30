import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = new URL("../", import.meta.url);
const SOURCE_ROOT = new URL("./", import.meta.url);

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
    /(?:from\s+|import\s*(?:\(\s*)?)["']([^"']+)["']/g,
  )].map((match) => match[1]!).sort();
}

describe("@whitebox-world/native-babylon-block-profile package boundary", () => {
  it("has one optional root with only its two direct dependencies", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("package.json", PACKAGE_ROOT), "utf8"),
    ) as Record<string, unknown>;

    expect(manifest).toMatchObject({
      name: "@whitebox-world/native-babylon-block-profile",
      version: "0.0.0",
      private: true,
      type: "module",
      exports: {
        ".": "./src/index.ts",
        "./testing": "./src/testing.ts",
      },
      dependencies: {
        "@babylonjs/core": "9.23.0",
        "@whitebox-world/native-babylon": "workspace:*",
        "@whitebox-world/protocol": "workspace:*",
        "lodash-es": "^4.18.1",
      },
    });
    expect(Object.keys(manifest.dependencies as object).sort()).toEqual([
      "@babylonjs/core",
      "@whitebox-world/native-babylon",
      "@whitebox-world/protocol",
      "lodash-es",
    ]);
    expect(Object.keys(manifest.exports as object)).toEqual([".", "./testing"]);
  });

  it("uses the frozen Babylon dialect and contains no second world protocol", async () => {
    expect(importSpecifiers([
      'import "@babylonjs/havok";',
      'import("runtime-babylon")',
      'export { value } from "three";',
    ].join("\n"))).toEqual([
      "@babylonjs/havok",
      "runtime-babylon",
      "three",
    ]);
    const sources = await productionSources();
    expect(sources).not.toHaveLength(0);

    for (const { path, source } of sources) {
      const specifiers = importSpecifiers(source);
      const isSettlementBoundary = path.endsWith("/profile-settlement.ts");
      expect(specifiers, path).not.toContain("@babylonjs/core");
      expect(source, path).not.toMatch(/import\s+\*\s+as/);
      expect(source, path).not.toMatch(
        /BlockWorldManifest|BabylonNativeBlockDefinitionV1|WORLDKIT_NATIVE_BLOCK_DEFINITION|\bCompiler\b|\bPreset\b|\bserialize\b|createMountain|createBuilding|createLevel/,
      );
      for (const specifier of specifiers) {
        if (specifier === "@whitebox-world/native-babylon/host") {
          expect(isSettlementBoundary, path).toBe(true);
        } else {
          expect(specifier, path).not.toMatch(
            /native-babylon\/host|runtime-babylon|@babylonjs\/havok|three|@whitebox-world\/(?:authoring|compiler|runtime-host|world)(?:\/|$)|^babylonjs$|^node:|^(?:fs|path|http|https|net|tls|dgram|dns)$/,
          );
        }
      }
      expect(
        specifiers.filter((specifier) =>
          specifier === "@whitebox-world/native-babylon/host").length,
        path,
      ).toBe(isSettlementBoundary ? 1 : 0);
      expect(source, path).not.toMatch(
        /\b(?:window|document|fetch|WebSocket|setTimeout|setInterval)\b|Date\.now\s*\(|performance\.now\s*\(|Math\.random\s*\(/,
      );
    }
  });

  it("exports profile facts without a host or runtime surface", async () => {
    const modulePath = ["./", "index.js"].join("");
    const profile = await import(modulePath) as Record<string, unknown>;

    expect(profile.BABYLON_NATIVE_BLOCK_PROFILE_REF_V1).toBe(
      "worldkit://native-scene-profile/whitebox.blocks@1",
    );
    expect(profile.BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1).toEqual([
      "ground",
      "route",
      "structure",
      "hazard",
      "water-like-visual",
      "background-mass",
    ]);
    expect(Object.keys(profile).sort()).toEqual([
      "BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_V1",
      "BABYLON_NATIVE_BLOCK_FULL_SIZE_METERS_V1",
      "BABYLON_NATIVE_BLOCK_MICRO_GRID_METERS_V1",
      "BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1",
      "BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1",
      "BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1",
      "BABYLON_NATIVE_BLOCK_PROFILE_REF_V1",
      "BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1",
      "createBabylonNativeBlockAuthoringCaptureV1",
      "createBabylonNativeBlockProfileSessionV1",
    ]);
    expect(Object.keys(profile).some((name) =>
      /host|runtime|collider|traversal|manifest|compiler/i.test(name))).toBe(false);
  });

  it("keeps the real-runtime fixture behind one exact testing-only export", async () => {
    const modulePath = ["./", "testing.js"].join("");
    const testing = await import(modulePath) as Record<string, unknown>;

    expect(Object.keys(testing)).toEqual([
      "createBabylonNativeBlockColliderRuntimeFixtureModuleV1",
    ]);
  });
});
