import {
  inspectProductAssetEvidence,
  type ProductAssetEvidenceV1,
  type ProductAssetSourceClipTimingV1,
  type ProductAssetSupportedActionBindingV1,
} from "./product-asset-evidence";

export type GBotSourceClipTimingV1 = ProductAssetSourceClipTimingV1;
export type GBotSupportedActionBindingV1 = ProductAssetSupportedActionBindingV1;
export type GBotProductAssetEvidenceV1 = ProductAssetEvidenceV1;

export function inspectGBotProductAssetEvidence(options: {
  readonly glbBytes: Uint8Array;
  readonly assetManifest: unknown;
  readonly actionManifest: unknown;
}): ProductAssetEvidenceV1 {
  return inspectProductAssetEvidence({
    ...options,
    requiredRuntimeActionIds: ["idle", "walk", "run", "jump"],
    expectedSubjectAssetRef: "worldkit://subject-asset/actor.humanoid.g-bot@2",
  });
}
