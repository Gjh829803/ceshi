import type {
  BabylonNativeSceneBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import {
  parseBabylonNativeSceneBootstrapV1,
  parseWorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import { parseGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import type {
  BabylonNativeLockedAssetResolverV1,
  BabylonNativeSceneAdmissionBudgetV1,
} from "@whitebox-world/native-babylon/host";
import type {
  SubjectAssetResolverV1,
} from "@whitebox-world/runtime-babylon";

import cloudRidgeGameplayBootstrap from
  "./cloud-ridge-gameplay-bootstrap.json";
import cloudRidgeWorldRuntimeBootstrap from
  "./cloud-ridge-world-runtime-bootstrap.json";

export const CLOUD_RIDGE_GAMEPLAY_BOOTSTRAP_V1 = parseGameplayBootstrapV1(
  cloudRidgeGameplayBootstrap,
);
export const CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1 =
  parseWorldRuntimeBootstrapV1(cloudRidgeWorldRuntimeBootstrap);
const controlledSubject =
  CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.subjectRuntimeDescriptors.find(
    ({ entityId }) =>
      entityId ===
        CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.initialControlledEntityId,
);
if (controlledSubject === undefined) {
  throw new Error("WORLDKIT_NATIVE_SCENE_BOOTSTRAP_SUBJECT_MISSING");
}
if (
  CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.gameplayBootstrapRef !==
      CLOUD_RIDGE_GAMEPLAY_BOOTSTRAP_V1.resourceRef ||
  CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.gameplayBootstrapHash !==
      CLOUD_RIDGE_GAMEPLAY_BOOTSTRAP_V1.contentHash
) {
  throw new Error("WORLDKIT_NATIVE_SCENE_GAMEPLAY_BOOTSTRAP_MISMATCH");
}

export const CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1:
  BabylonNativeSceneBootstrapV1 = parseBabylonNativeSceneBootstrapV1({
    kind: "babylon-native-scene-bootstrap",
    schemaVersion: 1,
    id: "cloud-ridge-native",
    sceneModuleRef: "worldkit://native-scene/cloud-ridge@1",
    nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
    nativeSceneProfileRef:
      "worldkit://native-scene-profile/whitebox.standard@1",
    gameplayBootstrapRef: CLOUD_RIDGE_GAMEPLAY_BOOTSTRAP_V1.resourceRef,
    initialControlledEntityId:
      CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.initialControlledEntityId,
    gravityMetersPerSecondSquaredXYZ:
      CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1
        .gravityMetersPerSecondSquaredXYZ,
    initialCamera: {
      mode: "third-person",
      pitchRadians:
        CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.initialCamera.pitchRadians,
      distanceMeters:
        CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.initialCamera.distanceMeters,
      fovDegrees:
        CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.initialCamera.fovDegrees,
      targetHeightMeters:
        CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.initialCamera.targetHeightMeters,
    },
    seed: 0x5eed_c10d,
    spawnMarkerId: "player-spawn",
  });

export const CLOUD_RIDGE_NATIVE_ADMISSION_BUDGET_V1:
  BabylonNativeSceneAdmissionBudgetV1 = Object.freeze({
    maximumStaticColliderCount: 3,
    maximumStaticColliderVertexCount: 256,
    maximumStaticColliderTriangleCount: 1_000,
  });

export const cloudRidgeLockedAssetResolver:
  BabylonNativeLockedAssetResolverV1 = Object.freeze({
    async resolve() {
      throw new Error("WORLDKIT_NATIVE_SCENE_ASSET_NOT_SELECTED");
    },
  });

const SUBJECT_ASSET_URI_BY_REF: Readonly<Record<string, string>> = Object.freeze({
  "worldkit://subject-asset/actor.humanoid.g-bot@2":
    "/subject-assets/humanoid/g-bot/v2/g-bot.glb",
});

export const cloudRidgeSubjectAssetResolver: SubjectAssetResolverV1 =
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
