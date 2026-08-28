import type { Sha256HashV1 } from "@whitebox-world/protocol";
import {
  worldPackageRefFromRootHashV1,
  type WorldBuildIdentityV1,
} from "@whitebox-world/world-identity";

export function createTestWorldBuildIdentityV1(
  worldPackageRootHash: Sha256HashV1,
): WorldBuildIdentityV1 {
  return Object.freeze({
    kind: "world-build-identity",
    schemaVersion: 1,
    id: "world-build.test",
    worldPackageRef: worldPackageRefFromRootHashV1(worldPackageRootHash),
    worldPackageRootHash,
    gameplayBootstrapHash: worldPackageRootHash,
    worldRuntimeBootstrapHash: worldPackageRootHash,
    sceneSourceIdentity: Object.freeze({
      kind: "canonical-execution-plan",
      executionPlanHash: worldPackageRootHash,
    }),
  });
}
