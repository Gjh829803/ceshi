import { sha256Bytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  canonicalWorldPackageFileIntegrityEntriesV1,
  canonicalWorldPackageManifestV1,
  hashWorldPackageManifestV1,
  hashWorldPackageRootV1,
  type WorldPackageManifestV1,
} from "./index.js";
import { deepFreeze } from "./manifest.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const HASH_D = `sha256:${"d".repeat(64)}` as const;
const HASH_E = `sha256:${"e".repeat(64)}` as const;

function validManifest(
  overrides: Partial<WorldPackageManifestV1> = {},
): WorldPackageManifestV1 {
  return {
    kind: "worldkit-world-package-manifest",
    schemaVersion: 1,
    id: "coastal-world.package",
    packageFormatVersion: 1,
    worldId: "coastal-world",
    seed: 1024,
    runtimeTarget: "babylon-web",
    canonicalizationProfile: "canonical-json-jcs@1",
    hashAlgorithm: "sha256",
    authoringSchemaVersion: 4,
    normalizedWorldIrSchemaVersion: 4,
    executionPlanSchemaVersion: 5,
    authoringSpecHash: HASH_A,
    normalizedWorldIrHash: HASH_B,
    executionPlanHash: HASH_C,
    resourceLockHash: HASH_D,
    layoutSolveReportHash: HASH_E,
    initialControlledEntityId: "player",
    entryPoint: {
      executionPlanPath: "targets/babylon-web/execution-plan.json",
    },
    resources: [
      {
        resourceRef: "worldkit://subject-asset/humanoid.golden@2",
        packagePath: "resources/subject-assets/humanoid.golden.glb",
        mediaType: "model/gltf-binary",
        sizeBytes: 3,
        contentHash: sha256Bytes(new Uint8Array([1, 2, 3])) as `sha256:${string}`,
      },
    ],
    ...overrides,
  };
}

describe("WorldPackageManifestV1", () => {
  it("canonicalizes a closed, provider-neutral Manifest and deep freezes it", () => {
    const source = validManifest();
    const manifest = canonicalWorldPackageManifestV1(source);

    expect(manifest).toEqual(source);
    expect(manifest).not.toBe(source);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.entryPoint)).toBe(true);
    expect(Object.isFrozen(manifest.resources)).toBe(true);
    expect(Object.isFrozen(manifest.resources[0])).toBe(true);
    expect(manifest).not.toHaveProperty("worldPackageRootHash");
    expect(hashWorldPackageManifestV1(manifest)).toBe(
      sha256CanonicalJson(manifest),
    );
    expect(JSON.stringify(manifest).toLowerCase()).not.toMatch(
      /babylonmesh|havok|recast|providerhandle|\/users\//,
    );
  });

  it("requires the clean-break initial control candidate and rejects the old alias", () => {
    const manifest = canonicalWorldPackageManifestV1(validManifest());

    expect(manifest.initialControlledEntityId).toBe("player");
    expect(manifest).not.toHaveProperty("controlledEntityId");
    expect(() => canonicalWorldPackageManifestV1({
      ...validManifest(),
      controlledEntityId: "player",
    })).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");
  });

  it("sorts resources by resourceRef then packagePath and rejects ambiguity", () => {
    const first = validManifest().resources[0]!;
    const second = {
      ...first,
      resourceRef: "worldkit://subject-asset/actor.g-bot@1",
      packagePath: "resources/subject-assets/actor.g-bot.glb",
    };
    const manifest = canonicalWorldPackageManifestV1(validManifest({
      resources: [first, second],
    }));

    expect(manifest.resources.map((row) => row.resourceRef)).toEqual([
      second.resourceRef,
      first.resourceRef,
    ]);
    expect(() => canonicalWorldPackageManifestV1(validManifest({
      resources: [first, { ...first }],
    }))).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");
    expect(() => canonicalWorldPackageManifestV1(validManifest({
      resources: [first, { ...second, packagePath: first.packagePath }],
    }))).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");
  });

  it("uses locale-independent code-unit ordering for non-ASCII resource and file paths", () => {
    const source = validManifest().resources[0]!;
    const z = {
      ...source,
      resourceRef: "worldkit://subject-asset/z@1",
      packagePath: "resources/z.glb",
    };
    const umlaut = {
      ...source,
      resourceRef: "worldkit://subject-asset/ä@1",
      packagePath: "resources/ä.glb",
    };

    expect(canonicalWorldPackageManifestV1(validManifest({
      resources: [umlaut, z],
    })).resources.map((row) => row.resourceRef)).toEqual([
      z.resourceRef,
      umlaut.resourceRef,
    ]);
    expect(canonicalWorldPackageFileIntegrityEntriesV1([
      {
        path: umlaut.packagePath,
        mediaType: umlaut.mediaType,
        sizeBytes: umlaut.sizeBytes,
        sha256: umlaut.contentHash,
      },
      {
        path: z.packagePath,
        mediaType: z.mediaType,
        sizeBytes: z.sizeBytes,
        sha256: z.contentHash,
      },
    ]).map((row) => row.path)).toEqual([z.packagePath, umlaut.packagePath]);
  });

  it.each([
    "/absolute.glb",
    "../escape.glb",
    "resources/../escape.glb",
    "resources\\asset.glb",
    "integrity.json",
    "signatures/key.json",
    "package-root.json",
    "world-package-root.json",
    "receipt.json",
    "receipts/build.json",
    "world-package-build-receipt.json",
    "resources/e\u0301.glb",
    "resources/line\nbreak.glb",
  ])("rejects unsafe or root-excluded package path %s", (packagePath) => {
    expect(() => canonicalWorldPackageManifestV1(validManifest({
      resources: [{ ...validManifest().resources[0]!, packagePath }],
    }))).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");
  });

  it("rejects unknown fields, accessors, and all-zero hashes before canonicalization", () => {
    expect(() => canonicalWorldPackageManifestV1({
      ...validManifest(),
      runtimeBackend: "babylon-havok",
    })).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");
    expect(() => canonicalWorldPackageManifestV1({
      ...validManifest(),
      authoringSpecHash: `sha256:${"0".repeat(64)}`,
    })).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");
    expect(() => canonicalWorldPackageManifestV1(validManifest({
      resources: [{
        ...validManifest().resources[0]!,
        resourceRef: "/Users/developer/private/asset.glb",
      }],
    }))).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");

    const accessor = validManifest() as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "seed", {
      enumerable: true,
      get: () => 1024,
    });
    expect(() => canonicalWorldPackageManifestV1(accessor)).toThrow(
      "WORLD_PACKAGE_MANIFEST_ACCESSOR_FORBIDDEN",
    );

    const symbolKeyed = validManifest() as WorldPackageManifestV1 & {
      [key: symbol]: string;
    };
    symbolKeyed[Symbol("hidden")] = "provider-state";
    expect(() => canonicalWorldPackageManifestV1(symbolKeyed)).toThrow(
      "WORLD_PACKAGE_MANIFEST_SYMBOL_KEY_FORBIDDEN",
    );
  });

  it("derives the Package Root independently from literal sorted integrity entries", () => {
    const files = [
      {
        path: "manifest.json",
        mediaType: "application/json",
        sizeBytes: 19,
        sha256: HASH_A,
      },
      {
        path: "targets/babylon-web/execution-plan.json",
        mediaType: "application/json",
        sizeBytes: 23,
        sha256: HASH_B,
      },
    ] as const;

    expect(hashWorldPackageRootV1([...files].reverse())).toBe(
      "sha256:55e57fe19f2db3320571af480c0cfbb5f471a5165e469705c647b8f9a0c9e5a0",
    );
    expect(() => hashWorldPackageRootV1([])).toThrow(
      "WORLD_PACKAGE_ROOT_INVALID",
    );
  });

  it("deep-freezes mutable descendants below an already frozen parent", () => {
    const child = { mutable: true };
    const shallowFrozen = Object.freeze({ child });

    deepFreeze(shallowFrozen);

    expect(Object.isFrozen(child)).toBe(true);
  });
});
