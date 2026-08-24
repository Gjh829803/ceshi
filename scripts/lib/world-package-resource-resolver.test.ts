import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  NormalizedSubjectAssetV1,
  NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { XIER120_SUBJECT_ASSET_MANIFESTS } from "@whitebox-world/subject-registry";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1,
  resolveWorldPackageResourceArtifactsV1,
  WorldPackageResourceResolveInfrastructureErrorV1,
  type WorldPackageResourceMappingV1,
} from "./world-package-resource-resolver.js";

const temporaryDirectories: string[] = [];

async function temporaryPublicRoot(): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "worldkit-package-resources-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function hashBytes(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function subjectAsset(
  subjectAssetRef: string,
  bytes: Uint8Array,
): NormalizedSubjectAssetV1 {
  return {
    subjectAssetRef,
    artifactContentHash: hashBytes(bytes),
    byteLength: bytes.byteLength,
    mediaType: "model/gltf-binary",
    format: "glb",
    inventory: {
      meshCount: 1,
      vertexCount: 3,
      triangleCount: 1,
      skeletonCount: 0,
      boneCount: 0,
      animationClipNames: [],
    },
  };
}

function normalizedWorldIr(
  subjectAssets: readonly NormalizedSubjectAssetV1[],
): NormalizedWorldIRV4 {
  return {
    resources: { subjectAssets },
  } as NormalizedWorldIRV4;
}

async function writePublicAsset(
  publicRoot: string,
  publicUri: string,
  bytes: Uint8Array,
): Promise<void> {
  const filePath = path.join(publicRoot, ...publicUri.slice(1).split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

function mapping(
  publicUri: string,
  packagePath = "resources/subject-assets/test.glb",
): WorldPackageResourceMappingV1 {
  return {
    publicUri,
    packagePath,
    mediaType: "model/gltf-binary",
  };
}

async function expectInfrastructureFailure(
  promise: Promise<unknown>,
  reason: WorldPackageResourceResolveInfrastructureErrorV1["reason"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: "WorldPackageResourceResolveInfrastructureErrorV1",
    code: "WORLDKIT_WORLD_PACKAGE_RESOURCE_RESOLVE_INFRASTRUCTURE_ERROR",
    reason,
  });
}

describe("resolveWorldPackageResourceArtifactsV1", () => {
  it("resolves built-in Subject Assets into deterministic WorldPackage artifacts", async () => {
    const publicRoot = await temporaryPublicRoot();
    const goldenBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x01]);
    const gBotBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02]);
    const goldenRef = "worldkit://subject-asset/humanoid.golden@1";
    const gBotRef = "worldkit://subject-asset/actor.humanoid.g-bot@1";
    await writePublicAsset(
      publicRoot,
      DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1[goldenRef]!.publicUri,
      goldenBytes,
    );
    await writePublicAsset(
      publicRoot,
      DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1[gBotRef]!.publicUri,
      gBotBytes,
    );

    const result = await resolveWorldPackageResourceArtifactsV1(
      normalizedWorldIr([
        subjectAsset(goldenRef, goldenBytes),
        subjectAsset(gBotRef, gBotBytes),
      ]),
      { publicRoot },
    );

    expect(result).toEqual([
      {
        resourceRef: gBotRef,
        packagePath: "resources/subject-assets/actor.humanoid.g-bot.glb",
        mediaType: "model/gltf-binary",
        bytes: gBotBytes,
      },
      {
        resourceRef: goldenRef,
        packagePath: "resources/subject-assets/humanoid.golden.glb",
        mediaType: "model/gltf-binary",
        bytes: goldenBytes,
      },
    ]);
  });

  it("resolves a real xier120 asset through the trusted default package mapping", async () => {
    const manifest = XIER120_SUBJECT_ASSET_MANIFESTS.find(
      (candidate) =>
        candidate.resourceRef ===
        "worldkit://subject-asset/xier120.biped-animal@1",
    )!;
    const diskBytes = await readFile(
      new URL(
        "../../apps/playground/public/subject-assets/xier120/biped-animal/v1/biped-animal.glb",
        import.meta.url,
      ),
    );

    const result = await resolveWorldPackageResourceArtifactsV1(
      normalizedWorldIr([subjectAsset(manifest.resourceRef, diskBytes)]),
    );

    expect(diskBytes.byteLength).toBe(manifest.artifact.byteLength);
    expect(hashBytes(diskBytes)).toBe(manifest.artifact.contentHash);
    expect(result).toEqual([{
      resourceRef: manifest.resourceRef,
      packagePath: "resources/subject-assets/xier120.biped-animal.glb",
      mediaType: "model/gltf-binary",
      bytes: Uint8Array.from(diskBytes),
    }]);
  });

  it("allows an asset-free Normalized World without inventing resource artifacts", async () => {
    const publicRoot = await temporaryPublicRoot();

    await expect(
      resolveWorldPackageResourceArtifactsV1(normalizedWorldIr([]), {
        publicRoot,
      }),
    ).resolves.toEqual([]);
  });

  it("rejects an unknown Subject Asset Ref through the infrastructure error boundary", async () => {
    const publicRoot = await temporaryPublicRoot();
    const bytes = new Uint8Array([1]);

    await expectInfrastructureFailure(
      resolveWorldPackageResourceArtifactsV1(
        normalizedWorldIr([
          subjectAsset("worldkit://subject-asset/unknown@1", bytes),
        ]),
        { publicRoot },
      ),
      "unknown-resource-ref",
    );
  });

  it("rejects duplicate Subject Asset Refs before reading any bytes", async () => {
    const publicRoot = await temporaryPublicRoot();
    const bytes = new Uint8Array([1]);
    const resourceRef = "worldkit://subject-asset/example@1";
    const asset = subjectAsset(resourceRef, bytes);

    await expectInfrastructureFailure(
      resolveWorldPackageResourceArtifactsV1(
        normalizedWorldIr([asset, structuredClone(asset)]),
        {
          publicRoot,
          resourceMappingByRef: {
            [resourceRef]: mapping("/example.glb"),
          },
        },
      ),
      "duplicate-resource-ref",
    );
  });

  it("rejects two resources mapped to the same WorldPackage path", async () => {
    const publicRoot = await temporaryPublicRoot();
    const firstBytes = new Uint8Array([1]);
    const secondBytes = new Uint8Array([2]);
    const firstRef = "worldkit://subject-asset/first@1";
    const secondRef = "worldkit://subject-asset/second@1";

    await expectInfrastructureFailure(
      resolveWorldPackageResourceArtifactsV1(
        normalizedWorldIr([
          subjectAsset(firstRef, firstBytes),
          subjectAsset(secondRef, secondBytes),
        ]),
        {
          publicRoot,
          resourceMappingByRef: {
            [firstRef]: mapping("/first.glb", "resources/subject-assets/shared.glb"),
            [secondRef]: mapping("/second.glb", "resources/subject-assets/shared.glb"),
          },
        },
      ),
      "duplicate-package-path",
    );
  });

  it.each([
    ["network URI", "https://example.com/asset.glb"],
    ["query-bearing URI", "/asset.glb?revision=1"],
    ["backslash path", "/folder\\asset.glb"],
    ["drive-like segment", "/C:/asset.glb"],
    ["control character", "/asset\u0001.glb"],
  ])("rejects a %s instead of fetching or reinterpreting it", async (_label, publicUri) => {
    const publicRoot = await temporaryPublicRoot();
    const bytes = new Uint8Array([1]);
    const resourceRef = "worldkit://subject-asset/example@1";

    await expectInfrastructureFailure(
      resolveWorldPackageResourceArtifactsV1(
        normalizedWorldIr([subjectAsset(resourceRef, bytes)]),
        {
          publicRoot,
          resourceMappingByRef: {
            [resourceRef]: mapping(publicUri),
          },
        },
      ),
      "invalid-resource-mapping",
    );
  });

  it("rejects lexical public-path traversal even when the escaped file exists", async () => {
    const publicRoot = await temporaryPublicRoot();
    const outsideRoot = await temporaryPublicRoot();
    const bytes = new Uint8Array([1, 2, 3]);
    const escapedFile = path.join(outsideRoot, "escaped.glb");
    await writeFile(escapedFile, bytes);
    const resourceRef = "worldkit://subject-asset/example@1";
    const publicUri = `/../${path.basename(outsideRoot)}/escaped.glb`;

    await expectInfrastructureFailure(
      resolveWorldPackageResourceArtifactsV1(
        normalizedWorldIr([subjectAsset(resourceRef, bytes)]),
        {
          publicRoot,
          resourceMappingByRef: {
            [resourceRef]: mapping(publicUri),
          },
        },
      ),
      "invalid-resource-mapping",
    );
  });

  it.each([
    "../example.glb",
    "resources/subject-assets/C:/example.glb",
    "resources/subject-assets/example\u0001.glb",
  ])("rejects unsafe WorldPackage path '%s'", async (packagePath) => {
    const publicRoot = await temporaryPublicRoot();
    const bytes = new Uint8Array([1]);
    const resourceRef = "worldkit://subject-asset/example@1";

    await expectInfrastructureFailure(
      resolveWorldPackageResourceArtifactsV1(
        normalizedWorldIr([subjectAsset(resourceRef, bytes)]),
        {
          publicRoot,
          resourceMappingByRef: {
            [resourceRef]: mapping("/example.glb", packagePath),
          },
        },
      ),
      "invalid-resource-mapping",
    );
  });

  it("rejects a Subject Asset symlink that escapes the public root", async () => {
    const publicRoot = await temporaryPublicRoot();
    const outsideRoot = await temporaryPublicRoot();
    const bytes = new Uint8Array([1, 2, 3]);
    const outsideFile = path.join(outsideRoot, "outside.glb");
    await writeFile(outsideFile, bytes);
    await symlink(outsideFile, path.join(publicRoot, "linked.glb"));
    const resourceRef = "worldkit://subject-asset/example@1";

    await expectInfrastructureFailure(
      resolveWorldPackageResourceArtifactsV1(
        normalizedWorldIr([subjectAsset(resourceRef, bytes)]),
        {
          publicRoot,
          resourceMappingByRef: {
            [resourceRef]: mapping("/linked.glb"),
          },
        },
      ),
      "asset-path-escape",
    );
  });

  it("normalizes an unreadable or missing Subject Asset into an infrastructure error", async () => {
    const publicRoot = await temporaryPublicRoot();
    const bytes = new Uint8Array([1]);
    const resourceRef = "worldkit://subject-asset/example@1";

    await expectInfrastructureFailure(
      resolveWorldPackageResourceArtifactsV1(
        normalizedWorldIr([subjectAsset(resourceRef, bytes)]),
        {
          publicRoot,
          resourceMappingByRef: {
            [resourceRef]: mapping("/missing.glb"),
          },
        },
      ),
      "asset-unreadable",
    );
  });

  it("rejects an empty mapped asset instead of returning silent empty bytes", async () => {
    const publicRoot = await temporaryPublicRoot();
    const bytes = new Uint8Array();
    const resourceRef = "worldkit://subject-asset/example@1";
    await writePublicAsset(publicRoot, "/empty.glb", bytes);

    await expectInfrastructureFailure(
      resolveWorldPackageResourceArtifactsV1(
        normalizedWorldIr([subjectAsset(resourceRef, bytes)]),
        {
          publicRoot,
          resourceMappingByRef: {
            [resourceRef]: mapping("/empty.glb"),
          },
        },
      ),
      "asset-empty",
    );
  });

  it("rejects bytes that drift from the Normalized World resource lock", async () => {
    const publicRoot = await temporaryPublicRoot();
    const lockedBytes = new Uint8Array([1, 2, 3]);
    const actualBytes = new Uint8Array([1, 2, 4]);
    const resourceRef = "worldkit://subject-asset/example@1";
    await writePublicAsset(publicRoot, "/example.glb", actualBytes);

    await expectInfrastructureFailure(
      resolveWorldPackageResourceArtifactsV1(
        normalizedWorldIr([subjectAsset(resourceRef, lockedBytes)]),
        {
          publicRoot,
          resourceMappingByRef: {
            [resourceRef]: mapping("/example.glb"),
          },
        },
      ),
      "asset-integrity-mismatch",
    );
  });

  it("rejects a mapping media type that differs from the normalized lock", async () => {
    const publicRoot = await temporaryPublicRoot();
    const bytes = new Uint8Array([1, 2, 3]);
    const resourceRef = "worldkit://subject-asset/example@1";
    await writePublicAsset(publicRoot, "/example.glb", bytes);

    await expectInfrastructureFailure(
      resolveWorldPackageResourceArtifactsV1(
        normalizedWorldIr([subjectAsset(resourceRef, bytes)]),
        {
          publicRoot,
          resourceMappingByRef: {
            [resourceRef]: {
              publicUri: "/example.glb",
              packagePath: "resources/subject-assets/example.glb",
              mediaType: "application/octet-stream" as "model/gltf-binary",
            },
          },
        },
      ),
      "invalid-resource-mapping",
    );
  });
});
