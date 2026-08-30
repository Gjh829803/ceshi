import {
  parseWorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import { parseGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";

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
