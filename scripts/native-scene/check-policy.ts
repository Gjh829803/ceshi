import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { BabylonNativeSceneBootstrapV1 } from
  "@whitebox-world/runtime-contracts";
import type { BabylonNativeLockedAssetRequestV1 } from
  "@whitebox-world/native-babylon";
import {
  createBabylonNativeLockedAssetResolutionFailureV1,
  type BabylonNativeLockedAssetResolverV1,
  type BabylonNativeSceneAdmissionBudgetV1,
  type BabylonNativeSceneCandidateFactoryV1,
} from "@whitebox-world/native-babylon/host";

import { createNativeWorkspaceDiagnosticV1 } from
  "./authoring-workspace.js";

export const BNA2_WHITEBOX_ADMISSION_BUDGET_V1 = Object.freeze({
  maximumStaticColliderCount: 256,
  maximumStaticColliderVertexCount: 65_536,
  maximumStaticColliderTriangleCount: 131_072,
} satisfies BabylonNativeSceneAdmissionBudgetV1);

const BNA2_NATIVE_PROFILE_POLICY_BY_REF_V1 = Object.freeze({
  "worldkit://native-scene-profile/whitebox.standard@1":
    BNA2_WHITEBOX_ADMISSION_BUDGET_V1,
  "worldkit://native-scene-profile/whitebox.blocks@1":
    BNA2_WHITEBOX_ADMISSION_BUDGET_V1,
} as const);

export type BabylonNativeCheckPolicyResultV1 =
  | Readonly<{
      outcome: "passed";
      budget: BabylonNativeSceneAdmissionBudgetV1;
    }>
  | Readonly<{
      outcome: "rejected";
      diagnostics: readonly ReturnType<
        typeof createNativeWorkspaceDiagnosticV1
      >[];
    }>;

export function resolveBabylonNativeCheckPolicyV1(
  bootstrap: Pick<BabylonNativeSceneBootstrapV1, "nativeSceneProfileRef">,
): BabylonNativeCheckPolicyResultV1 {
  const budget = BNA2_NATIVE_PROFILE_POLICY_BY_REF_V1[
    bootstrap.nativeSceneProfileRef as
      keyof typeof BNA2_NATIVE_PROFILE_POLICY_BY_REF_V1
  ];
  if (typeof budget !== "undefined") {
    return Object.freeze({ outcome: "passed", budget });
  }
  return Object.freeze({
    outcome: "rejected",
    diagnostics: Object.freeze([createNativeWorkspaceDiagnosticV1({
      code: "WORLDKIT_NATIVE_SCENE_PROFILE_UNSUPPORTED",
      stage: "capability",
      message: "The selected Native Scene Profile is not supported.",
      repairHint: "Select one Host-authorized whitebox Native Scene Profile.",
    })]),
  });
}

export function createBabylonNativeAssetFreeResolverV1():
BabylonNativeLockedAssetResolverV1 {
  return Object.freeze({
    async resolve(request: Readonly<BabylonNativeLockedAssetRequestV1>) {
      throw createBabylonNativeLockedAssetResolutionFailureV1(
        createNativeWorkspaceDiagnosticV1({
          code: "WORLDKIT_NATIVE_SCENE_ASSET_LOCK_UNAVAILABLE",
          stage: "capability",
          location: {
            kind: "asset-resource",
            assetResourceRef: request.assetResourceRef,
          },
          message: "No Package-locked asset is available to the local checker.",
          repairHint: "Remove the asset request or run through formal Package admission.",
        }),
      );
    },
  });
}

export function createBabylonNativeNullEngineCandidateFactoryV1():
BabylonNativeSceneCandidateFactoryV1 {
  return Object.freeze({
    createCandidate() {
      const engine = new NullEngine({
        renderWidth: 320,
        renderHeight: 180,
        textureSize: 128,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      });
      const scene = new Scene(engine);
      scene.useRightHandedSystem = true;
      return Object.freeze({
        engine,
        scene,
        dispose(): void {
          let firstFailure: unknown;
          let failed = false;
          try {
            scene.dispose();
          } catch (error) {
            failed = true;
            firstFailure = error;
          }
          try {
            engine.dispose();
          } catch (error) {
            if (!failed) firstFailure = error;
            failed = true;
          }
          if (failed) throw firstFailure;
        },
      });
    },
  });
}
