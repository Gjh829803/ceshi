import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const SUBJECT_DEFINITION_REF =
  "worldkit://subject-definition/xier120.biped-animal@1";
const SUBJECT_ASSET_REF = "worldkit://subject-asset/xier120.biped-animal@1";
const COLLIDER_PROFILE_REF =
  "worldkit://collider-profile/xier120.biped-animal@1";
const REPOSITORY_ROOT_PATH = fileURLToPath(new URL("../", import.meta.url));
const ASSET_URL = new URL(
  "../apps/playground/public/subject-assets/xier120/biped-animal/v1/biped-animal.glb",
  import.meta.url,
);
const AUTHORING_SOURCE_URL = new URL(
  "../examples/authoring/xier120-subject-gallery.json",
  import.meta.url,
);

interface VerifierModule {
  verifyXier120Subjects(input: {
    repositoryRootPath: string;
  }): Promise<unknown>;
  verifyXier120SubjectActualUse(input: {
    authoringSourceText: string;
    subjectDefinitionRef: string;
    assetBytes: Uint8Array;
  }): Promise<unknown>;
}

async function loadVerifier(): Promise<VerifierModule> {
  const moduleUrl = pathToFileURL(
    fileURLToPath(new URL("./verify-xier120-subjects.ts", import.meta.url)),
  ).href;
  return import(/* @vite-ignore */ moduleUrl) as Promise<VerifierModule>;
}

describe("xier120 actual-use verifier", () => {
  it("admits all 19 committed GLBs without relying on a repository bake step", async () => {
    const { verifyXier120Subjects } = await loadVerifier();

    await expect(
      verifyXier120Subjects({ repositoryRootPath: REPOSITORY_ROOT_PATH }),
    ).resolves.toMatchObject({
      sourceHashMatchCount: 19,
      committedGlbHashMatchCount: 19,
      admittedGlbCount: 19,
      subjectCount: 19,
      results: expect.arrayContaining([
        expect.objectContaining({
          subjectDefinitionRef: SUBJECT_DEFINITION_REF,
          subjectAssetRef: SUBJECT_ASSET_REF,
          cacheResolveCount: 1,
          instanceCount: 2,
          disposedInstanceCount: 2,
          cacheDisposed: true,
        }),
      ]),
    });
  }, 30_000);

  it("reports the real Registry, Compiler, and two-instance lifecycle closure", async () => {
    const [{ verifyXier120SubjectActualUse }, authoringSourceText, assetBytes] =
      await Promise.all([
        loadVerifier(),
        readFile(AUTHORING_SOURCE_URL, "utf8"),
        readFile(ASSET_URL),
      ]);

    await expect(
      verifyXier120SubjectActualUse({
        authoringSourceText,
        subjectDefinitionRef: SUBJECT_DEFINITION_REF,
        assetBytes,
      }),
    ).resolves.toMatchObject({
      subjectDefinitionRef: SUBJECT_DEFINITION_REF,
      subjectAssetRef: SUBJECT_ASSET_REF,
      colliderProfileRef: COLLIDER_PROFILE_REF,
      normalized: true,
      compiled: true,
      capabilityCatalogDiscoverable: true,
      cacheResolveCount: 1,
      leaseCount: 2,
      instanceCount: 2,
      mutationIsolationVerified: true,
      crossLeaseReleaseIsolationVerified: true,
      disposedInstanceCount: 2,
      releasedLeaseCount: 2,
      cacheDisposed: true,
    });
  }, 30_000);

  it("rejects in-memory hash corruption with stable asset context without changing disk", async () => {
    const [{ verifyXier120SubjectActualUse }, authoringSourceText, committedBytes] =
      await Promise.all([
        loadVerifier(),
        readFile(AUTHORING_SOURCE_URL, "utf8"),
        readFile(ASSET_URL),
      ]);
    const corruptedBytes = Uint8Array.from(committedBytes);
    corruptedBytes[corruptedBytes.byteLength - 1] =
      corruptedBytes[corruptedBytes.byteLength - 1]! ^ 0xff;

    await expect(
      verifyXier120SubjectActualUse({
        authoringSourceText,
        subjectDefinitionRef: SUBJECT_DEFINITION_REF,
        assetBytes: corruptedBytes,
      }),
    ).rejects.toMatchObject({
      code: "XIER120_SUBJECT_ACTUAL_USE_FAILED",
      stage: "asset-cache-acquire",
      subjectDefinitionRef: SUBJECT_DEFINITION_REF,
      subjectAssetRef: SUBJECT_ASSET_REF,
      colliderProfileRef: COLLIDER_PROFILE_REF,
      causeCode: "SUBJECT_ASSET_HASH_MISMATCH",
    });
    expect(await readFile(ASSET_URL)).toEqual(committedBytes);
  }, 30_000);

  it("attributes post-normalization compile failures to the compiler stage", async () => {
    const [{ verifyXier120SubjectActualUse }, authoringSourceText, assetBytes] =
      await Promise.all([
        loadVerifier(),
        readFile(AUTHORING_SOURCE_URL, "utf8"),
        readFile(ASSET_URL),
      ]);
    const source = JSON.parse(authoringSourceText) as {
      nodes: unknown[];
    };
    source.nodes.push({
      id: "blocked-water",
      kind: "water",
      components: {
        water: {
          terrainEntityId: "terrain-main",
          boundary: {
            kind: "ellipse",
            centerMetersXZ: [0, 18],
            radiusMetersXZ: [4, 4],
          },
          depthMeters: 2,
          shoreWidthMeters: 1,
          waterLevelMeters: 1,
          traversalMode: "blocked",
          semantic: { classId: "water.blocked-verifier-fixture" },
        },
      },
    });

    await expect(
      verifyXier120SubjectActualUse({
        authoringSourceText: JSON.stringify(source),
        subjectDefinitionRef: SUBJECT_DEFINITION_REF,
        assetBytes,
      }),
    ).rejects.toMatchObject({
      code: "XIER120_SUBJECT_ACTUAL_USE_FAILED",
      stage: "compiler",
      subjectDefinitionRef: SUBJECT_DEFINITION_REF,
      subjectAssetRef: SUBJECT_ASSET_REF,
      colliderProfileRef: COLLIDER_PROFILE_REF,
      causeCode: "COMPILER_SPAWN_IN_BLOCKED_WATER",
    });
  }, 30_000);
});
