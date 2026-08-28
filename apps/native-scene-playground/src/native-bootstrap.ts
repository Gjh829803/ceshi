import type {
  BabylonNativeSceneBootstrapV1,
  ExecutionPlanV5,
} from "@whitebox-world/runtime-contracts";
import {
  parseBabylonNativeSceneBootstrapV1,
  parseExecutionPlanV5,
} from "@whitebox-world/runtime-contracts";
import type {
  BabylonNativeLockedAssetResolverV1,
  BabylonNativeSceneAdmissionBudgetV1,
} from "@whitebox-world/native-babylon/host";
import type {
  SubjectAssetResolverV1,
} from "@whitebox-world/runtime-babylon";

import gBotWorldBuild from
  "../../../examples/evidence/g-bot-subject-world/world.build.json";

const frozenGbotPlan = parseExecutionPlanV5(
  (gBotWorldBuild as Readonly<{ executionPlan: unknown }>).executionPlan,
);
const controlledSubject = frozenGbotPlan.subjects.find(
  ({ entityId }) => entityId === frozenGbotPlan.initialControlledEntityId,
);
if (controlledSubject === undefined) {
  throw new Error("WORLDKIT_NATIVE_SCENE_BOOTSTRAP_SUBJECT_MISSING");
}
const gameplayBootstrapRef = frozenGbotPlan.resourceLockEntries.find(
  ({ resourceKind }) => resourceKind === "gameplay-bootstrap",
)?.resourceRef;
if (gameplayBootstrapRef === undefined) {
  throw new Error("WORLDKIT_NATIVE_SCENE_GAMEPLAY_BOOTSTRAP_REF_MISSING");
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
    gameplayBootstrapRef,
    initialControlledEntityId: frozenGbotPlan.initialControlledEntityId,
    gravityMetersPerSecondSquaredXYZ:
      frozenGbotPlan.gravityMetersPerSecondSquaredXYZ,
    initialCamera: {
      mode: "third-person",
      pitchRadians: frozenGbotPlan.camera.pitchRadians,
      distanceMeters: frozenGbotPlan.camera.distanceMeters,
      fovDegrees: frozenGbotPlan.camera.fovDegrees,
      targetHeightMeters: frozenGbotPlan.camera.targetHeightMeters,
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

/**
 * Frozen gameplay/resource closure only. Native Runtime ignores its terrain,
 * water, object and static-collider geometry and replaces the initial spawn
 * from the registered marker without mutating this value.
 */
export const CLOUD_RIDGE_GAMEPLAY_EXECUTION_PLAN_V1: ExecutionPlanV5 =
  Object.freeze({
    ...frozenGbotPlan,
    id: "cloud-ridge-native-gameplay-bootstrap",
    gravityMetersPerSecondSquaredXYZ:
      CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.gravityMetersPerSecondSquaredXYZ,
    camera: Object.freeze({
      ...frozenGbotPlan.camera,
      pitchRadians: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.initialCamera.pitchRadians,
      distanceMeters: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.initialCamera.distanceMeters,
      fovDegrees: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.initialCamera.fovDegrees,
      targetHeightMeters:
        CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.initialCamera.targetHeightMeters,
    }),
    subjects: Object.freeze([controlledSubject]),
    initialRelationships: Object.freeze([]),
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
