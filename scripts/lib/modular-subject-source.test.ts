import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Document, Logger, NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import {
  inspectModularSubjectGlb,
  recoverModularSubjectSourcePackage,
  validateRecoveredSubjectSourcePackage,
  type ModularSubjectPackageDefinitionV1,
  type RecoveredSubjectSourcePackageV1,
} from "./modular-subject-source";

const TEST_IO = new NodeIO().setLogger(new Logger(Logger.Verbosity.SILENT));

const GOLDEN_GLB_PATH = fileURLToPath(
  new URL("../../apps/playground/public/worldkit-assets/golden-humanoid.glb", import.meta.url),
);
const G_BOT_GLB_PATH = fileURLToPath(
  new URL(
    "../../apps/playground/public/subject-assets/humanoid/g-bot/v1/g-bot.glb",
    import.meta.url,
  ),
);

const goldenPackageDefinition: ModularSubjectPackageDefinitionV1 = {
  id: "golden-humanoid",
  version: 1,
  creatorId: "seedleap",
  displayName: "Golden Humanoid",
  sourceGlbRelativePath: "apps/playground/public/worldkit-assets/golden-humanoid.glb",
  expectedSourceContentHash:
    "sha256:1095fd65c754d53e6db3757ab5e1c9e5e9dcea2581f85d40f37ea4890ee8c2c2",
  rigProfileRef: "worldkit://rig-profile/humanoid.golden-biped@1",
  provenanceMode: "generated-fixture",
  actions: [
    {
      actionId: "idle",
      sourceClipName: "idle",
      loopMode: "repeat",
      playbackSpeedRatio: 1,
      blendDurationSeconds: 0.2,
      rootMotionMode: "in-place",
    },
    {
      actionId: "jump",
      sourceClipName: "jump",
      loopMode: "once",
      playbackSpeedRatio: 1,
      blendDurationSeconds: 0.1,
      rootMotionMode: "in-place",
    },
    {
      actionId: "run",
      sourceClipName: "run",
      loopMode: "repeat",
      playbackSpeedRatio: 1,
      blendDurationSeconds: 0.15,
      rootMotionMode: "in-place",
    },
    {
      actionId: "walk",
      sourceClipName: "walk",
      loopMode: "repeat",
      playbackSpeedRatio: 1,
      blendDurationSeconds: 0.2,
      rootMotionMode: "in-place",
    },
  ],
};

function sourceHash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function definitionFor(
  sourceGlbBytes: Uint8Array,
  actions: readonly ModularSubjectPackageDefinitionV1["actions"][number][] =
    goldenPackageDefinition.actions,
): ModularSubjectPackageDefinitionV1 {
  return {
    ...goldenPackageDefinition,
    expectedSourceContentHash: sourceHash(sourceGlbBytes),
    actions,
  };
}

describe("modular Subject source recovery", () => {
  it("accepts the tracked G Bot Skin whose unique joint root is implicit", async () => {
    const inventory = await inspectModularSubjectGlb(await readFile(G_BOT_GLB_PATH));

    expect(inventory).toMatchObject({
      meshCount: 2,
      skeletonCount: 1,
      jointCount: 65,
      animationClipCount: 25,
    });
  });

  it("recovers one animation-free Model and one render-free Clip per configured Golden action", async () => {
    const sourceGlbBytes = await readFile(GOLDEN_GLB_PATH);

    const recovered = await recoverModularSubjectSourcePackage({
      definition: goldenPackageDefinition,
      sourceGlbBytes,
    });

    expect(recovered.model.inventory).toMatchObject({
      meshCount: 1,
      skeletonCount: 1,
      animationClipCount: 0,
    });
    expect(recovered.animationClips.map((row) => row.actionId)).toEqual([
      "idle",
      "jump",
      "run",
      "walk",
    ]);
    expect(recovered.sourceArchive.glbBytes).toEqual(sourceGlbBytes);
    expect(recovered.sourceArchive.manifest).toMatchObject({
      kind: "subject-source-archive",
      runtimeConsumption: "forbidden",
      residueInventory: {
        cameraCount: 0,
        lightCount: 0,
        extensionsUsed: [],
        extensionsRequired: [],
        extensionNames: [],
        extrasPropertyCount: 4,
        unknownTopLevelKeys: [],
      },
    });
    for (const clip of recovered.animationClips) {
      const clipInventory = await inspectModularSubjectGlb(clip.glbBytes);
      expect(clipInventory).toMatchObject({
        meshCount: 0,
        materialCount: 0,
        textureCount: 0,
        imageCount: 0,
        animationClipCount: 1,
      });
      expect(clip.manifest.rigSignatureHash).toBe(
        recovered.model.manifest.rigSignatureHash,
      );
    }

    await expect(validateRecoveredSubjectSourcePackage(recovered)).resolves.toBeUndefined();
  });

  it("rejects a configured source Clip that does not exist", async () => {
    const sourceGlbBytes = await readFile(GOLDEN_GLB_PATH);
    const actions = goldenPackageDefinition.actions.map((action) =>
      action.actionId === "walk" ? { ...action, sourceClipName: "missing.walk" } : action,
    );

    await expect(recoverModularSubjectSourcePackage({
      definition: definitionFor(sourceGlbBytes, actions),
      sourceGlbBytes,
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_CONFIGURED_CLIP_MISSING: missing.walk");
  });

  it("rejects duplicate semantic action IDs", async () => {
    const sourceGlbBytes = await readFile(GOLDEN_GLB_PATH);
    const actions = goldenPackageDefinition.actions.map((action) =>
      action.actionId === "jump" ? { ...action, actionId: "idle" } : action,
    );

    await expect(recoverModularSubjectSourcePackage({
      definition: definitionFor(sourceGlbBytes, actions),
      sourceGlbBytes,
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_ACTION_ID_DUPLICATE: idle");
  });

  it("rejects an extra unmapped source Clip", async () => {
    const sourceGlbBytes = await readFile(GOLDEN_GLB_PATH);
    const document = await TEST_IO.readBinary(sourceGlbBytes);
    document.getRoot().listAnimations()[0]!.clone().setName("surprise");
    const sourceWithExtraClip = await TEST_IO.writeBinary(document);

    await expect(recoverModularSubjectSourcePackage({
      definition: definitionFor(sourceWithExtraClip),
      sourceGlbBytes: sourceWithExtraClip,
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_UNMAPPED_SOURCE_CLIP: surprise");
  });

  it("rejects a static GLB supplied with actions", async () => {
    const document = new Document();
    document.createScene("StaticScene");
    const staticGlbBytes = await TEST_IO.writeBinary(document);

    await expect(recoverModularSubjectSourcePackage({
      definition: definitionFor(staticGlbBytes),
      sourceGlbBytes: staticGlbBytes,
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_STATIC_ACTIONS_UNSUPPORTED");
  });

  it("rejects a Clip whose joint Bind Pose drifts from the recovered Model", async () => {
    const sourceGlbBytes = await readFile(GOLDEN_GLB_PATH);
    const recovered = await recoverModularSubjectSourcePackage({
      definition: goldenPackageDefinition,
      sourceGlbBytes,
    });
    const originalClip = recovered.animationClips[0]!;
    const clipDocument = await TEST_IO.readBinary(originalClip.glbBytes);
    const hips = clipDocument.getRoot().listNodes().find((node) => node.getName() === "hips")!;
    const translation = hips.getTranslation();
    hips.setTranslation([translation[0] + 0.01, translation[1], translation[2]]);
    const mutatedClipBytes = await TEST_IO.writeBinary(clipDocument);
    const mutatedPackage: RecoveredSubjectSourcePackageV1 = {
      ...recovered,
      animationClips: [
        { ...originalClip, glbBytes: mutatedClipBytes },
        ...recovered.animationClips.slice(1),
      ],
    };

    await expect(validateRecoveredSubjectSourcePackage(mutatedPackage)).rejects.toThrowError(
      "MODULAR_SUBJECT_SOURCE_RIG_SIGNATURE_MISMATCH: idle",
    );
  });

  it("produces byte-identical GLBs and manifests across independent recoveries", async () => {
    const sourceGlbBytes = await readFile(GOLDEN_GLB_PATH);
    const [first, second] = await Promise.all([
      recoverModularSubjectSourcePackage({
        definition: goldenPackageDefinition,
        sourceGlbBytes,
      }),
      recoverModularSubjectSourcePackage({
        definition: goldenPackageDefinition,
        sourceGlbBytes,
      }),
    ]);

    expect(first.packageManifestBytes).toEqual(second.packageManifestBytes);
    expect(first.model.glbBytes).toEqual(second.model.glbBytes);
    expect(first.model.manifestBytes).toEqual(second.model.manifestBytes);
    expect(first.materialSet.manifestBytes).toEqual(second.materialSet.manifestBytes);
    expect(first.sourceArchive.glbBytes).toEqual(second.sourceArchive.glbBytes);
    expect(first.sourceArchive.manifestBytes).toEqual(second.sourceArchive.manifestBytes);
    expect(first.animationClips.map((clip) => clip.glbBytes)).toEqual(
      second.animationClips.map((clip) => clip.glbBytes),
    );
    expect(first.animationClips.map((clip) => clip.manifestBytes)).toEqual(
      second.animationClips.map((clip) => clip.manifestBytes),
    );
  });
});
