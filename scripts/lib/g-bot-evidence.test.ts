import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { inspectGBotProductAssetEvidence } from "./g-bot-evidence";

const GLB_PATH = fileURLToPath(
  new URL(
    "../../apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
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
      subjectAssetRef: "worldkit://subject-asset/actor.humanoid.g-bot@2",
      artifactContentHash:
        "sha256:4bcf3fabdba1e083ef54bf172fd962ca740e0f2fabdb9cddaae45d5ea208718f",
      byteLength: 6_743_072,
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
      "idle.gaming",
      "walk",
      "walk.step",
      "run",
      "jump",
      "fall",
      "land.hard",
      "land.hard.alt",
      "fly",
      "float",
      "swim.surface",
      "swim.tread",
      "swim.exit",
      "sit",
      "sit.idle",
      "sit.ground.idle",
      "sit.toStand",
      "stand",
      "lay.idle",
      "roll.toRun",
      "fight.enter",
      "emote.salute",
      "emote.angry",
      "dance.rumba",
    ].sort());
    expect(evidence.supportedActionBindings).toEqual([
      { actionId: "idle", sourceClip: "idle" },
      { actionId: "walk", sourceClip: "walk" },
      { actionId: "run", sourceClip: "run" },
      { actionId: "jump", sourceClip: "jump" },
    ]);
    expect(evidence.sourceClipTimings).toHaveLength(25);
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
    ).toThrowError("PRODUCT_ASSET_CONTENT_HASH_MISMATCH");
  });
});
