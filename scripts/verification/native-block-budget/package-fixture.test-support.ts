import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { parseGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import { admitBabylonNativeSceneCandidateV1 } from "@whitebox-world/native-babylon/host";
import { hashBabylonNativeBlockCheckedLayoutInventoryV1 } from
  "@whitebox-world/native-babylon-block-profile";
import {
  createBabylonNativeBlockMaterializerMetadataV1,
  takeBabylonNativeBlockCheckedEpochEvidenceV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import { sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  hashBabylonNativeSceneBootstrapV1, hashBabylonNativeSceneContributionV1,
  parseWorldRuntimeBootstrapV1, worldResourceLockEntriesV1,
} from "@whitebox-world/runtime-contracts";
import { hashSceneAuthoringAttemptV1 } from "@whitebox-world/scene-authoring-contracts";
import { createBabylonNativeWorldPackageV1, verifyWorldPackageDirectoryV1 } from
  "@whitebox-world/world-package";
import { createBabylonNativeBlockWorldPackageTestInputV1 } from
  "@whitebox-world/world-package/testing";

import { BNA2_WHITEBOX_ADMISSION_BUDGET_V1 } from "../../native-scene/admission-budget.js";
import { createBudgetWorkloadModule } from "./workload.js";

/** Same synthetic Package/real Runtime seam used by native-live-collider-registry.
 * NOT a paid-generation receipt, source-admission test, or formal Case evidence. */
export async function prepareBudgetRuntimeFixture(blockCount: number) {
  const started = performance.now();
  const module = createBudgetWorkloadModule(blockCount);
  const base = createBabylonNativeBlockWorldPackageTestInputV1();
  // Fixture JSON is an asset served by this verifier, not a sibling app's
  // private source import. Keep the exact existing cloud-ridge bytes.
  const readFixture = async (url: string): Promise<unknown> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Budget fixture asset unavailable: ${url}`);
    return response.json();
  };
  const gameplay = parseGameplayBootstrapV1(await readFixture("/budget-gameplay-bootstrap.json"));
  const wrt = parseWorldRuntimeBootstrapV1(await readFixture("/budget-runtime-bootstrap.json"));
  const bootstrap = {
    ...base.nativeSceneBootstrap, gameplayBootstrapRef: gameplay.resourceRef,
    initialControlledEntityId: wrt.initialControlledEntityId,
    initialCamera: {
      mode: wrt.initialCamera.mode, pitchRadians: wrt.initialCamera.pitchRadians,
      distanceMeters: wrt.initialCamera.distanceMeters,
      fovDegrees: wrt.initialCamera.fovDegrees,
      targetHeightMeters: wrt.initialCamera.targetHeightMeters,
    },
  };
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const admission = await admitBabylonNativeSceneCandidateV1({
      candidate: { engine, scene }, bootstrap, module,
      hostDerivedStaticColliders: [], budget: BNA2_WHITEBOX_ADMISSION_BUDGET_V1,
      assets: { async resolve(): Promise<never> { throw new Error("No visual assets"); } },
    });
    if (admission.outcome !== "passed") throw new Error(JSON.stringify(admission.diagnostics));
    const [evidence] = takeBabylonNativeBlockCheckedEpochEvidenceV1(scene);
    if (!evidence || evidence.checkedLayout.checkResult.outcome !== "passed") {
      throw new Error("Missing checked budget workload");
    }
    if (evidence.checkedLayout.checkResult.metrics.blockCount !== blockCount) {
      throw new Error("Budget workload did not create every requested Block");
    }
    const contribution = admission.contribution;
    const checkedLayoutInventoryHash = hashBabylonNativeBlockCheckedLayoutInventoryV1(evidence.checkedLayout);
    const fixtureIdentity = sha256CanonicalJson({ purpose: "synthetic-budget-workload", blockCount }) as Sha256HashV1;
    const metadata = createBabylonNativeBlockMaterializerMetadataV1({
      checkedLayout: evidence.checkedLayout, colliderInventory: evidence.colliderInventory,
      profileInventoryHash: evidence.profileInventoryHash, contribution,
      authoringLayoutBinding: {
        kind: "native-block-authoring-layout-binding", schemaVersion: 1,
        groundExploration: { mode: "case-defined" as const },
        openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
        caseHash: fixtureIdentity, authoringManifestHash: fixtureIdentity,
        checkedLayoutInventoryHash, contributionHash: hashBabylonNativeSceneContributionV1(contribution),
        visualGroups: evidence.checkedLayout.checkResult.visualGroups.map((group, index) => ({
          acceptanceTargetRef: `worldkit://acceptance-target/${group.id}@1`,
          frontDirectionWorldXZ: [0, -1] as const, visualGroupId: group.id, semanticClassId: `budget.${group.id}`,
          identityColorHex: ["#808080", "#F28E2B", "#D9A514", "#4E79A7", "#9C6ADE"][index]! as `#${string}`,
          blockIds: group.blockIds, paletteRoles: group.paletteRoles,
          minimumMetersXYZ: group.minimumMetersXYZ, maximumMetersXYZ: group.maximumMetersXYZ,
        })),
      },
    });
    const attempt = {
      ...base.sceneAuthoringAttempt, sourceInput: {
        ...base.sceneAuthoringAttempt.sourceInput,
        bootstrapInputHash: hashBabylonNativeSceneBootstrapV1(bootstrap),
      },
    };
    const registryLock = worldResourceLockEntriesV1([
      ...wrt.runtimeResourceLockEntries, {
        resourceKind: "world-runtime-bootstrap",
        resourceRef: "worldkit://world-runtime-bootstrap/cloud-ridge@1",
        resolvedVersion: "1", contentHash: wrt.contentHash,
      }, ...base.registryLock.filter(({ resourceKind }) =>
        ["native-scene", "native-scene-api", "native-scene-profile", "traversal-surface-profile"].includes(resourceKind)),
    ]);
    const directory = createBabylonNativeWorldPackageV1(createBabylonNativeBlockWorldPackageTestInputV1({
      nativeSceneBootstrap: bootstrap, sceneAuthoringAttempt: attempt,
      sceneAuthoringAttemptResult: {
        ...base.sceneAuthoringAttemptResult, sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(attempt),
      },
      gameplayBootstrap: gameplay, worldRuntimeBootstrap: wrt, registryLock,
      worldBounds: { centerMetersXZ: [0, -32], sizeMetersXZ: [128, 128], heightRangeMeters: [-16, 64] },
      resourceBudget: {
        maximumVertices: BNA2_WHITEBOX_ADMISSION_BUDGET_V1.maximumStaticColliderVertexCount,
        maximumTriangles: BNA2_WHITEBOX_ADMISSION_BUDGET_V1.maximumStaticColliderTriangleCount,
        maximumColliders: BNA2_WHITEBOX_ADMISSION_BUDGET_V1.maximumStaticColliderCount,
      },
      nativeSceneContribution: contribution, nativeBlockMaterializerMetadata: metadata,
    }));
    const verified = verifyWorldPackageDirectoryV1(directory);
    if (verified.kind !== "babylon-native-scene") throw new Error("Expected Native Package");
    return { module, verified, measurement: {
      blockCount, admissionAndPackageMilliseconds: performance.now() - started,
      metrics: evidence.checkedLayout.checkResult.metrics,
      colliderCount: contribution.staticColliders.length,
      colliderVertexCount: evidence.colliderInventory.reduce((sum, row) => sum + row.vertexCount, 0),
      colliderTriangleCount: evidence.colliderInventory.reduce((sum, row) => sum + row.triangleCount, 0),
      profileInventoryHash: evidence.profileInventoryHash,
      packageRootHash: verified.receipt.worldPackageRootHash,
    } };
  } finally { scene.dispose(); engine.dispose(); }
}
