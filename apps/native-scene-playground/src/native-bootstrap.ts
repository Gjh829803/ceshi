import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import { parseExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import type {
  BabylonNativeSceneAdmissionBudgetV1,
  SubjectAssetResolverV1,
} from "@whitebox-world/runtime-babylon";

import gBotWorldBuild from
  "../../../examples/evidence/g-bot-subject-world/world.build.json";

export interface BabylonNativeWorldBootstrapV1 {
  readonly kind: "babylon-native-world-bootstrap";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sceneModuleRef: string;
  readonly sceneModuleId: string;
  readonly gravityMetersPerSecondSquaredXYZ: readonly [number, number, number];
  readonly controlledSubjectDefinitionRef: string;
  readonly spawnMarkerId: string;
  readonly cameraRigRef: string;
  readonly actionOrPoseSetRef: string;
  readonly staticCollisionBudget: BabylonNativeSceneAdmissionBudgetV1;
}

export const CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1: BabylonNativeWorldBootstrapV1 =
  Object.freeze({
    kind: "babylon-native-world-bootstrap",
    schemaVersion: 1,
    id: "cloud-ridge-native-spike",
    sceneModuleRef: "app://native-scene/cloud-ridge",
    sceneModuleId: "cloud-ridge-native-spike",
    gravityMetersPerSecondSquaredXYZ: Object.freeze([
      0,
      -9.81,
      0,
    ]) as readonly [number, number, number],
    controlledSubjectDefinitionRef:
      "worldkit://subject-definition/humanoid.g-bot@2",
    spawnMarkerId: "player-spawn",
    cameraRigRef: "worldkit://camera/third-person.standard@1",
    actionOrPoseSetRef:
      "worldkit://animation-set/humanoid.ground.g-bot@2",
    staticCollisionBudget: Object.freeze({
      maximumStaticColliderCount: 3,
      maximumStaticColliderVertexCount: 256,
      maximumStaticColliderTriangleCount: 1_000,
    }),
  });

const frozenGbotPlan = parseExecutionPlanV5(
  (gBotWorldBuild as Readonly<{ executionPlan: unknown }>).executionPlan,
);
const controlledSubject = frozenGbotPlan.subjects.find(
  ({ entityId }) => entityId === frozenGbotPlan.initialControlledEntityId,
);
if (controlledSubject === undefined) {
  throw new Error("WORLDKIT_NATIVE_SCENE_BOOTSTRAP_SUBJECT_MISSING");
}
if (
  controlledSubject.subjectDefinitionRef !==
    CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.controlledSubjectDefinitionRef
) {
  throw new Error("WORLDKIT_NATIVE_SCENE_BOOTSTRAP_SUBJECT_REF_MISMATCH");
}
if (
  frozenGbotPlan.camera.rigRef !==
    CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.cameraRigRef
) {
  throw new Error("WORLDKIT_NATIVE_SCENE_BOOTSTRAP_CAMERA_RIG_REF_MISMATCH");
}
if (
  controlledSubject.capabilityAssembly.actionOrPoseSetRef !==
    CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.actionOrPoseSetRef
) {
  throw new Error("WORLDKIT_NATIVE_SCENE_BOOTSTRAP_ACTION_SET_REF_MISMATCH");
}

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
