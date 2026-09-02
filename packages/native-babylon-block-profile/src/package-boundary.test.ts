import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type {
  BabylonNativeBlockReconstructionCorpusCaseIdV1 as TestingCorpusCaseIdV1,
  BabylonNativeBlockReconstructionCorpusCaseV1 as TestingCorpusCaseV1,
  BabylonNativeBlockReconstructionCorpusEvidenceIndexV1 as TestingCorpusEvidenceIndexV1,
  BabylonNativeBlockReconstructionCorpusMaterializationV1 as TestingCorpusMaterializationV1,
} from "./testing.js";
// @ts-expect-error Reconstruction Corpus types are testing-subpath-only.
import type { BabylonNativeBlockReconstructionCorpusCaseIdV1 as ProductionCorpusCaseIdV1 } from "./index.js";
// @ts-expect-error Reconstruction Corpus types are testing-subpath-only.
import type { BabylonNativeBlockReconstructionCorpusCaseV1 as ProductionCorpusCaseV1 } from "./index.js";
// @ts-expect-error Reconstruction Corpus types are testing-subpath-only.
import type { BabylonNativeBlockReconstructionCorpusEvidenceIndexV1 as ProductionCorpusEvidenceIndexV1 } from "./index.js";
// @ts-expect-error Reconstruction Corpus types are testing-subpath-only.
import type { BabylonNativeBlockReconstructionCorpusMaterializationV1 as ProductionCorpusMaterializationV1 } from "./index.js";

type TestingCorpusTypesMustRemainAvailable = readonly [
  TestingCorpusCaseIdV1,
  TestingCorpusCaseV1,
  TestingCorpusEvidenceIndexV1,
  TestingCorpusMaterializationV1,
];
type ProductionCorpusTypesMustRemainAbsent = readonly [
  ProductionCorpusCaseIdV1,
  ProductionCorpusCaseV1,
  ProductionCorpusEvidenceIndexV1,
  ProductionCorpusMaterializationV1,
];

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

function createBlockObjectLiteralCalls(source: string): readonly string[] {
  return [...source.matchAll(
    /\bcreateBlock\s*\(\s*(\{[^;]*?\})\s*\)/gs,
  )].map((match) => match[1]!);
}

describe("@whitebox-world/native-babylon-block-profile package boundary", () => {
  it("has one optional root with only its declared direct dependencies", async () => {
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
        "@whitebox-world/runtime-contracts": "workspace:*",
        "@whitebox-world/traversal": "workspace:*",
        "@whitebox-world/validation": "workspace:*",
        "@whitebox-world/world-identity": "workspace:*",
        "lodash-es": "^4.18.1",
      },
    });
    expect(Object.keys(manifest.dependencies as object).sort()).toEqual([
      "@babylonjs/core",
      "@whitebox-world/native-babylon",
      "@whitebox-world/protocol",
      "@whitebox-world/runtime-contracts",
      "@whitebox-world/traversal",
      "@whitebox-world/validation",
      "@whitebox-world/world-identity",
      "lodash-es",
    ]);
    expect(Object.keys(manifest.exports as object)).toEqual([
      ".",
      "./host",
      "./testing",
    ]);
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
      const isHostBoundary = ["build-failure.ts", "profile-settlement.ts"]
        .some((name) => path.endsWith(`/${name}`));
      expect(specifiers, path).not.toContain("@babylonjs/core");
      expect(source, path).not.toMatch(/import\s+\*\s+as/);
      expect(source, path).not.toMatch(
        /BlockWorldManifest|BabylonNativeBlockDefinitionV1|WORLDKIT_NATIVE_BLOCK_DEFINITION|\bCompiler\b|\bPreset\b|\bserialize\b|createMountain|createBuilding|createLevel/,
      );
      for (const specifier of specifiers) {
        if (specifier === "@whitebox-world/native-babylon/host") {
          expect(isHostBoundary, path).toBe(true);
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
      ).toBe(isHostBoundary ? 1 : 0);
      expect(source, path).not.toMatch(
        /\b(?:window|document|fetch|WebSocket|setTimeout|setInterval)\b|Date\.now\s*\(|performance\.now\s*\(|Math\.random\s*\(/,
      );
      expect(specifiers, path).not.toContain("@whitebox-world/validation");
    }
  });

  it("uses the browser-safe reconstruction contract entry without loading Host validators", async () => {
    const validationManifest = JSON.parse(await readFile(
      new URL("../validation/package.json", PACKAGE_ROOT),
      "utf8",
    )) as Readonly<{ exports?: Readonly<Record<string, string>> }>;

    expect(validationManifest.exports?.["./reconstruction-contracts"]).toBe(
      "./src/reconstruction-contracts.ts",
    );
    const sources = await productionSources();
    expect(sources.flatMap(({ source }) => importSpecifiers(source))).toContain(
      "@whitebox-world/validation/reconstruction-contracts",
    );
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
      "BABYLON_NATIVE_BLOCK_AUTHORING_PROFILE_REF_V1",
      "BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_XYZ_V1",
      "BABYLON_NATIVE_BLOCK_FULL_SIZE_METERS_V1",
      "BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1",
      "BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1",
      "BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1",
      "BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1",
      "BABYLON_NATIVE_BLOCK_PROFILE_REF_V1",
      "BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1",
      "bindBlockMaterializerMetadataToSemanticCaptureTargetsV1",
      "bindNativeBlockAuthoringManifestToCheckedLayoutV1",
      "createBabylonNativeBlockAuthoringCaptureV1",
      "createBabylonNativeBlockProfileSessionV1",
      "hashBabylonNativeBlockCheckedLayoutInventoryV1",
      "hashNativeBlockAuthoringManifestV1",
      "hashNativeBlockVisualResourceListV1",
      "parseNativeBlockAuthoringManifestV1",
      "parseNativeBlockVisualResourceListV1",
    ]);
    expect(Object.keys(profile).some((name) =>
      /host|runtime|collider|traversal|compiler/i.test(name))).toBe(false);
  });

  it("keeps one current Block placement dialect across the package", async () => {
    const sources = await productionSources();
    expect(sources).not.toHaveLength(0);
    expect(createBlockObjectLiteralCalls([
      "session.",
      "createBlock({ id: 'inline-block', centerMetersXYZ: [0, 0.5, 0] })",
    ].join(""))).toEqual([
      "{ id: 'inline-block', centerMetersXYZ: [0, 0.5, 0] }",
    ]);

    for (const { path, source } of sources) {
      for (const call of createBlockObjectLiteralCalls(source)) {
        expect(call, path).toContain("centerMetersXYZ");
      }
      expect(source, path).not.toMatch(
        /createBlock\([^)]*\)\s*\.\s*position/,
      );
      expect(source, path).not.toMatch(/\bplaceBlock\b|\baddBlock\b|createBlocks\(/);
    }
  });

  it("keeps checked-epoch transport behind the exact Host-only export", async () => {
    const host = await import("./host.js") as Record<string, unknown>;
    expect(Object.keys(host)).toEqual([
      "takeBabylonNativeBlockCheckedEpochEvidenceV1",
      "createBabylonNativeBlockMaterializerMetadataV1",
      "babylonNativeBlockLiveVisualHandleMeshV1",
      "peekBabylonNativeBlockLiveHandleRegistryV1",
      "babylonNativeBlockLiveVisualHandleWorldMatrixV1",
      "babylonNativeBlockLiveVisualRenderedMeshesV1",
      "materializeBabylonNativeBlockVisualBatchesV1",
      "partitionBabylonNativeBlockCollisionIntoChunksV1",
      "applyBabylonNativeBlockCaptureIsolationV1",
      "freezeBabylonNativeBlockLogicalGroundModelV1",
      "buildBabylonNativeBlockWalkableTopologyV1",
      "buildBabylonNativeBlockGroundBoundaryV1",
      "createBabylonNativeBlockGroundBoundaryContributionV1",
      "materializeBabylonNativeBlockWalkableTopologyV1",
      "analyzeBabylonNativeBlockGroundV1",
      "assessBabylonNativeBlockOptimizationV1",
      "BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1",
      "BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1",
      "BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1",
      "hashBabylonNativeBlockChunkPolicyV1",
      "parseBabylonNativeBlockChunkPolicyV1",
      "BABYLON_NATIVE_BLOCK_CHUNK_POLICY_PENDING_CASE_SLOTS_V1",
      "BABYLON_NATIVE_BLOCK_CHUNK_POLICY_SELECTION_RULE_V1",
      "measureBabylonNativeBlockChunkPolicyBenchmarkV1",
    ]);
  });

  it("keeps Reconstruction Corpus and real-runtime fixtures behind the exact testing-only export", async () => {
    const modulePath = ["./", "testing.js"].join("");
    const testing = await import(modulePath) as Record<string, unknown>;

    const testingCaseId: TestingCorpusCaseIdV1 = "mountain-cliff";
    expect(testingCaseId).toBe("mountain-cliff");

    expect(Object.keys(testing).sort()).toEqual([
      "BABYLON_NATIVE_BLOCK_RECONSTRUCTION_CORPUS_CASE_IDS_V1",
      "babylonNativeBlockCenterAlignsToGridV1",
      "babylonNativeBlockOccupiedMicroCellKeysV1",
      "createBabylonNativeBlockColliderRuntimeFixtureModuleV1",
      "createBabylonNativeBlockReconstructionCorpusEvidenceIndexV1",
      "createBabylonNativeBlockReconstructionCorpusModuleV1",
      "inspectBabylonNativeBlockReconstructionCorpusCaseV1",
      "materializeBabylonNativeBlockReconstructionCorpusCaseV1",
    ].sort());
  });

  it("routes build-path failures through the Host-issued channel", async () => {
    const buildPathFiles = new Set([
      "babylon-visual-adapter.ts",
      "collider-contribution.ts",
      "logical-ground-model.ts",
      "ground-analysis.ts",
      "ground-boundary.ts",
      "walkable-topology.ts",
      "walkable-topology-materializer.ts",
      "profile-settlement.ts",
      "session.ts",
    ]);
    const sources = await productionSources();
    const matched = sources.filter((entry) =>
      buildPathFiles.has(entry.path.split("/").at(-1)!));
    expect(matched.map((entry) => entry.path.split("/").at(-1)!).sort())
      .toEqual([...buildPathFiles].sort());
    for (const { path, source } of matched) {
      expect(source, path).toContain(
        "failBabylonNativeBlockProfileBuildV1 as fail",
      );
      expect(source, path).not.toMatch(/function fail\(|throw new TypeError/);
    }
    const failureBoundary = sources.find(({ path }) =>
      path.endsWith("/build-failure.ts"));
    expect(failureBoundary?.source).toContain(
      "createBabylonNativeBlockProfileBuildFailureV1",
    );
  });
});
