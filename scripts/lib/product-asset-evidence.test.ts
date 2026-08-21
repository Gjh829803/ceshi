import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { inspectProductAssetEvidence } from "./product-asset-evidence";
import { parseProductAssetIntakeFixtureV1 } from "./product-asset-intake";

const G_BOT_FIXTURE_PATH = fileURLToPath(
  new URL("../../examples/product-asset-intakes/humanoid.g-bot@1.json", import.meta.url),
);
const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

describe("product asset evidence", () => {
  it("locks G Bot bytes, rig hierarchy, source clips, and runtime action mappings from the intake fixture", async () => {
    const fixture = parseProductAssetIntakeFixtureV1(
      JSON.parse(await readFile(G_BOT_FIXTURE_PATH, "utf8")) as unknown,
    );
    const [glbBytes, assetManifestText, actionManifestText] = await Promise.all([
      readFile(path.join(REPOSITORY_ROOT, fixture.glbRepositoryPath)),
      readFile(path.join(REPOSITORY_ROOT, fixture.productAssetManifestPath), "utf8"),
      readFile(path.join(REPOSITORY_ROOT, fixture.productActionManifestPath), "utf8"),
    ]);

    const evidence = inspectProductAssetEvidence({
      glbBytes,
      assetManifest: JSON.parse(assetManifestText) as unknown,
      actionManifest: JSON.parse(actionManifestText) as unknown,
      requiredRuntimeActionIds: fixture.requiredRuntimeActionIds,
    });

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      subjectAssetRef: fixture.subjectAssetRef,
      artifactContentHash:
        "sha256:41833210e735788da0777fc37badcec03f90ccf17ab5a7d89103f0727abeeb1b",
      byteLength: 5_302_160,
      formatVersion: "2.0",
      meshCount: 2,
      jointCount: 65,
      skeletonRootBoneName: "mixamorig:Hips",
      hasExternalUris: false,
      cameraCount: 0,
      lightCount: 0,
    });
    expect(evidence.supportedActionBindings).toEqual([
      { actionId: "idle", sourceClip: "idle" },
      { actionId: "walk", sourceClip: "walk" },
      { actionId: "run", sourceClip: "run" },
      { actionId: "jump", sourceClip: "jump" },
    ]);
    expect(evidence.sourceClipNames).toHaveLength(25);
    expect(evidence.sourceClipTimings).toHaveLength(25);
    expect(evidence.uniqueBoneNameCount).toBe(65);
  });

  it("rejects a product manifest that drifts from the immutable GLB bytes", async () => {
    const fixture = parseProductAssetIntakeFixtureV1(
      JSON.parse(await readFile(G_BOT_FIXTURE_PATH, "utf8")) as unknown,
    );
    const [glbBytes, assetManifestText, actionManifestText] = await Promise.all([
      readFile(path.join(REPOSITORY_ROOT, fixture.glbRepositoryPath)),
      readFile(path.join(REPOSITORY_ROOT, fixture.productAssetManifestPath), "utf8"),
      readFile(path.join(REPOSITORY_ROOT, fixture.productActionManifestPath), "utf8"),
    ]);
    const assetManifest = JSON.parse(assetManifestText) as {
      runtime: { contentHash: string };
    };
    assetManifest.runtime.contentHash = `sha256:${"0".repeat(64)}`;

    expect(() =>
      inspectProductAssetEvidence({
        glbBytes,
        assetManifest,
        actionManifest: JSON.parse(actionManifestText) as unknown,
        requiredRuntimeActionIds: fixture.requiredRuntimeActionIds,
      }),
    ).toThrowError("PRODUCT_ASSET_CONTENT_HASH_MISMATCH");
  });
});
