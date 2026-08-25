import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Document, Logger, NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import {
  canonicalSubjectManifestBytes,
  inspectModularSubjectGlb,
  recoverModularSubjectSourcePackage,
  validateRecoveredSubjectSourcePackage,
  type ModularSubjectPackageDefinitionV1,
  type RecoveredSubjectSourcePackageV1,
} from "./modular-subject-source";

const TEST_IO = new NodeIO().setLogger(new Logger(Logger.Verbosity.SILENT));
const TINY_PNG_BYTES = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8p8WQAAAABJRU5ErkJggg==",
  "base64",
));

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
  spatialConvention: {
    units: "meters",
    upAxis: "+Y",
    forwardAxis: "-Z",
    pivot: "support-center",
  },
  spatialReview: {
    spatialReviewStatus: "verified",
    evidence: {
      kind: "generated-fixture-contract",
      evidenceRef: "scripts/fixtures/generate-golden-humanoid-glb.ts",
    },
  },
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
    expect(recovered.model.manifest.spatialConvention).toEqual(
      goldenPackageDefinition.spatialConvention,
    );
    expect(recovered.model.manifest.spatialReview).toEqual(
      goldenPackageDefinition.spatialReview,
    );
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

  it("rejects canonical but false inventories, paths, metadata, provenance, refs, and identities", async () => {
    const recovered = await recoverModularSubjectSourcePackage({
      definition: goldenPackageDefinition,
      sourceGlbBytes: await readFile(GOLDEN_GLB_PATH),
    });

    await expect(validateRecoveredSubjectSourcePackage({
      ...recovered,
      model: {
        ...recovered.model,
        inventory: {
          ...recovered.model.inventory,
          meshCount: recovered.model.inventory.meshCount + 1,
        },
      },
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_INVENTORY_MISMATCH: model.result");

    const staleInventoryManifest = {
      ...recovered.model.manifest,
      inventory: {
        ...recovered.model.manifest.inventory,
        jointCount: recovered.model.manifest.inventory.jointCount + 1,
      },
    };
    await expect(validateRecoveredSubjectSourcePackage({
      ...recovered,
      model: {
        ...recovered.model,
        manifest: staleInventoryManifest,
        manifestBytes: canonicalSubjectManifestBytes(staleInventoryManifest),
      },
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_INVENTORY_MISMATCH: model.manifest");

    await expect(validateRecoveredSubjectSourcePackage({
      ...recovered,
      model: {
        ...recovered.model,
        glbRelativePath: "wrong/model.glb" as "model/model.glb",
      },
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_PATH_MISMATCH: model");

    const firstClip = recovered.animationClips[0]!;
    const staleClipManifest = {
      ...firstClip.manifest,
      durationSeconds: firstClip.manifest.durationSeconds + 1,
    };
    await expect(validateRecoveredSubjectSourcePackage({
      ...recovered,
      animationClips: [{
        ...firstClip,
        manifest: staleClipManifest,
        manifestBytes: canonicalSubjectManifestBytes(staleClipManifest),
      }, ...recovered.animationClips.slice(1)],
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_CLIP_METADATA_MISMATCH: idle");

    const staleMaterialManifest = {
      ...recovered.materialSet.manifest,
      provenance: {
        ...recovered.materialSet.manifest.provenance,
        sourceGlbRelativePath: "wrong/source.glb",
      },
    };
    await expect(validateRecoveredSubjectSourcePackage({
      ...recovered,
      materialSet: {
        ...recovered.materialSet,
        manifest: staleMaterialManifest,
        manifestBytes: canonicalSubjectManifestBytes(staleMaterialManifest),
      },
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_PROVENANCE_MISMATCH: material-set");

    const stalePackageManifest = {
      ...recovered.packageManifest,
      modelRef: "worldkit://subject-model-asset/wrong@1",
    };
    await expect(validateRecoveredSubjectSourcePackage({
      ...recovered,
      packageManifest: stalePackageManifest,
      packageManifestBytes: canonicalSubjectManifestBytes(stalePackageManifest),
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_PACKAGE_REF_MISMATCH: model");

    const staleIdentityManifest = {
      ...recovered.model.manifest,
      id: "wrong-model",
    };
    await expect(validateRecoveredSubjectSourcePackage({
      ...recovered,
      model: {
        ...recovered.model,
        manifest: staleIdentityManifest,
        manifestBytes: canonicalSubjectManifestBytes(staleIdentityManifest),
      },
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_IDENTITY_MISMATCH: model");
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

  it("rejects an untrusted forward-axis or pivot claim instead of fabricating Model truth", async () => {
    const sourceGlbBytes = await readFile(GOLDEN_GLB_PATH);
    const invalidDefinition = {
      ...goldenPackageDefinition,
      spatialConvention: {
        ...goldenPackageDefinition.spatialConvention,
        forwardAxis: "+Z",
        pivot: "provider-origin",
      },
    } as unknown as ModularSubjectPackageDefinitionV1;

    await expect(recoverModularSubjectSourcePackage({
      definition: invalidDefinition,
      sourceGlbBytes,
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_SPATIAL_CONVENTION_INVALID");

    const invalidReview = {
      ...goldenPackageDefinition,
      spatialReview: {
        spatialReviewStatus: "claimed-without-review",
        evidence: {
          kind: "product-sidecar-declaration",
          evidenceRef: "sidecars/golden-humanoid.json",
        },
      },
    } as unknown as ModularSubjectPackageDefinitionV1;
    await expect(recoverModularSubjectSourcePackage({
      definition: invalidReview,
      sourceGlbBytes,
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_SPATIAL_REVIEW_INVALID");
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

  it("rejects a zero-action empty GLB because recovery is rigged-package-only", async () => {
    const document = new Document();
    document.createScene("EmptyScene");
    const emptyGlbBytes = await TEST_IO.writeBinary(document);

    await expect(recoverModularSubjectSourcePackage({
      definition: definitionFor(emptyGlbBytes, []),
      sourceGlbBytes: emptyGlbBytes,
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_MODEL_RIG_REQUIRED");
  });

  it("recovers duplicate embedded image bytes as one independently addressable texture artifact", async () => {
    const document = await TEST_IO.readBinary(await readFile(GOLDEN_GLB_PATH));
    const material = document.getRoot().listMaterials()[0]!;
    const baseColorTexture = document.createTexture("duplicate-base-color")
      .setMimeType("image/png")
      .setImage(TINY_PNG_BYTES);
    const emissiveTexture = document.createTexture("duplicate-emissive")
      .setMimeType("image/png")
      .setImage(TINY_PNG_BYTES);
    material.setBaseColorTexture(baseColorTexture);
    material.setEmissiveTexture(emissiveTexture);
    const texturedGlbBytes = await TEST_IO.writeBinary(document);

    const recovered = await recoverModularSubjectSourcePackage({
      definition: definitionFor(texturedGlbBytes),
      sourceGlbBytes: texturedGlbBytes,
    });
    const textureHash = sourceHash(TINY_PNG_BYTES);
    const expectedRelativePath =
      `materials/default/textures/${textureHash.slice("sha256:".length)}.png`;

    expect(recovered.materialSet.textureArtifacts).toHaveLength(1);
    expect(recovered.materialSet.textureArtifacts[0]).toMatchObject({
      relativePath: expectedRelativePath,
      mediaType: "image/png",
      byteLengthBytes: TINY_PNG_BYTES.byteLength,
      contentHash: textureHash,
    });
    expect(recovered.materialSet.textureArtifacts[0]!.bytes).toEqual(TINY_PNG_BYTES);
    const textureBindings = recovered.materialSet.manifest.materials.flatMap(
      (row) => row.textures,
    );
    expect(textureBindings.map((row) => row.textureArtifactRelativePath)).toEqual([
      expectedRelativePath,
      expectedRelativePath,
    ]);
    expect(new Set(textureBindings.map((row) => row.textureArtifactRef)).size).toBe(1);
    expect(await inspectModularSubjectGlb(recovered.model.glbBytes)).toMatchObject({
      textureCount: 0,
      imageCount: 0,
    });
    await expect(validateRecoveredSubjectSourcePackage(recovered)).resolves.toBeUndefined();

    const tamperedTextureBytes = Uint8Array.from(TINY_PNG_BYTES);
    tamperedTextureBytes[0] = tamperedTextureBytes[0]! ^ 0xff;
    await expect(validateRecoveredSubjectSourcePackage({
      ...recovered,
      materialSet: {
        ...recovered.materialSet,
        textureArtifacts: [{
          ...recovered.materialSet.textureArtifacts[0]!,
          bytes: tamperedTextureBytes,
        }],
      },
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_TEXTURE_ARTIFACT_HASH_MISMATCH");

    await expect(validateRecoveredSubjectSourcePackage({
      ...recovered,
      materialSet: {
        ...recovered.materialSet,
        textureArtifacts: [{
          ...recovered.materialSet.textureArtifacts[0]!,
          relativePath: "materials/default/textures/wrong.png",
        }],
      },
    })).rejects.toThrowError("MODULAR_SUBJECT_SOURCE_TEXTURE_ARTIFACT_METADATA_MISMATCH");
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
