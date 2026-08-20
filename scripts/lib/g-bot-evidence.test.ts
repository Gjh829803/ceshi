import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { inspectGBotProductAssetEvidence } from "./g-bot-evidence";

const GLB_PATH = fileURLToPath(
  new URL(
    "../../apps/playground/public/subject-assets/humanoid/g-bot/v1/g-bot.glb",
    import.meta.url,
  ),
);
const ASSET_MANIFEST_PATH = fileURLToPath(
  new URL("../../assets/subjects/humanoid/g-bot/asset.manifest.json", import.meta.url),
);
const ACTION_MANIFEST_PATH = fileURLToPath(
  new URL("../../assets/subjects/humanoid/g-bot/action-manifest.json", import.meta.url),
);

describe("G Bot product asset evidence", () => {
  it("locks the product bytes, rig hierarchy, source clips, and semantic action mappings", async () => {
    const [glbBytes, assetManifestText, actionManifestText] = await Promise.all([
      readFile(GLB_PATH),
      readFile(ASSET_MANIFEST_PATH, "utf8"),
      readFile(ACTION_MANIFEST_PATH, "utf8"),
    ]);

    const evidence = inspectGBotProductAssetEvidence({
      glbBytes,
      assetManifest: JSON.parse(assetManifestText) as unknown,
      actionManifest: JSON.parse(actionManifestText) as unknown,
    });

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      subjectAssetRef: "worldkit://subject-asset/actor.humanoid.g-bot@1",
      artifactContentHash:
        "sha256:74bbf9426577caa1b7e808bf388bd9a6b8b48d50cc80ab7b0abef10c2693c286",
      byteLength: 3_362_888,
      formatVersion: "2.0",
      meshCount: 2,
      jointCount: 65,
      skeletonRootBoneName: "mixamorig:Hips",
      hasExternalUris: false,
      cameraCount: 0,
      lightCount: 0,
    });
    expect(evidence.sourceClipNames).toEqual([
      "idle",
      "walk",
      "run",
      "jump",
      "fall",
      "float",
      "swim.surface",
      "swim.tread",
      "sit",
      "sit.idle",
      "stand",
      "swim.exit",
    ]);
    expect(evidence.supportedActionBindings).toEqual([
      { actionId: "idle", sourceClip: "idle" },
      { actionId: "walk", sourceClip: "walk" },
      { actionId: "run", sourceClip: "run" },
      { actionId: "jump", sourceClip: "jump" },
    ]);
    expect(evidence.sourceClipTimings).toHaveLength(12);
    for (const timing of evidence.sourceClipTimings) {
      expect(timing.durationSeconds).toBeGreaterThan(0);
      expect(timing.minimumTimeSeconds).toBeGreaterThanOrEqual(0);
      expect(timing.maximumTimeSeconds).toBeGreaterThan(timing.minimumTimeSeconds);
    }
    expect(evidence.requiredVertexAttributes).toEqual([
      "JOINTS_0",
      "NORMAL",
      "POSITION",
      "TEXCOORD_0",
      "WEIGHTS_0",
    ]);
    expect(evidence.uniqueBoneNameCount).toBe(65);
  });

  it("rejects a manifest that drifts from the immutable GLB bytes", async () => {
    const [glbBytes, assetManifestText, actionManifestText] = await Promise.all([
      readFile(GLB_PATH),
      readFile(ASSET_MANIFEST_PATH, "utf8"),
      readFile(ACTION_MANIFEST_PATH, "utf8"),
    ]);
    const assetManifest = JSON.parse(assetManifestText) as {
      runtime: { contentHash: string };
    };
    assetManifest.runtime.contentHash = `sha256:${"0".repeat(64)}`;

    expect(() =>
      inspectGBotProductAssetEvidence({
        glbBytes,
        assetManifest,
        actionManifest: JSON.parse(actionManifestText) as unknown,
      }),
    ).toThrowError("G_BOT_ASSET_CONTENT_HASH_MISMATCH");
  });
});
