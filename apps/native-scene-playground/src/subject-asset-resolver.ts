import type { SubjectAssetResolverV1 } from
  "@whitebox-world/runtime-babylon";

const SUBJECT_ASSET_URI_BY_REF: Readonly<Record<string, string>> = Object.freeze({
  "worldkit://subject-asset/actor.humanoid.g-bot@2":
    "/subject-assets/humanoid/g-bot/v2/g-bot.glb",
});

export const nativeSceneSubjectAssetResolver: SubjectAssetResolverV1 =
  Object.freeze({
    async resolveSubjectAsset(
      request: Parameters<SubjectAssetResolverV1["resolveSubjectAsset"]>[0],
    ) {
      const assetPath = SUBJECT_ASSET_URI_BY_REF[request.subjectAssetRef];
      if (assetPath === undefined) {
        throw new Error("WORLDKIT_NATIVE_SCENE_SUBJECT_ASSET_UNAVAILABLE");
      }
      const assetUrl = new URL(assetPath, globalThis.location.origin);
      assetUrl.searchParams.set(
        "worldkit-content-hash",
        request.artifactContentHash,
      );
      const response = await fetch(assetUrl, {
        mode: "same-origin",
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok || response.redirected) {
        throw new Error("WORLDKIT_NATIVE_SCENE_SUBJECT_ASSET_UNAVAILABLE");
      }
      return Object.freeze({
        bytes: new Uint8Array(await response.arrayBuffer()),
        sourceLabel: assetPath,
      });
    },
  });
