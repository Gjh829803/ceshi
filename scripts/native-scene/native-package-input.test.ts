import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { sha256Bytes, sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import {
  hashBabylonNativeSceneBootstrapV1,
  worldResourceLockEntriesV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  type SceneAuthoringAttemptResultV1,
  type SceneAuthoringAttemptV1,
  type SceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
import { afterEach, describe, expect, it } from "vitest";

import { createWorldPackageTestInputV1 } from
  "../../packages/world-package/src/test-fixture.js";
import type { PublishedBabylonNativeStaticGeometryAssetV1 } from
  "./asset-lock.js";
import { prepareFrozenBabylonNativeWorldPackageBuildInputV1 } from
  "./native-package-input.js";
import {
  createNativeSceneWorkspaceFixtureV1,
  removeNativeSceneWorkspaceFixtureV1,
} from "./test-support.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const roots: string[] = [];
const SCENE_SOURCE = `
  import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
  import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
  export default defineBabylonNativeScene({
    kind: "babylon-native-scene-module",
    id: "package-input-module",
    async build(context) {
      await context.assets.resolve({
        assetResourceRef: "worldkit://static-geometry-asset/ridge@1",
      });
      const ground = MeshBuilder.CreateBox(
        "ground", { width: 20, height: 1, depth: 20 }, context.scene,
      );
      ground.position.y = -0.5;
      context.registration.registerStaticCollider({
        id: "ground",
        mesh: ground,
        traversalBinding: { kind: "not-traversable" },
      });
      context.registration.registerSpawnMarker({
        id: "player-spawn",
        positionMetersXYZ: [0, 1, 0],
        facingRadians: 0,
      });
    },
  });
`;

function publishedAsset(): PublishedBabylonNativeStaticGeometryAssetV1 {
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  return {
    kind: "static-geometry-asset",
    assetResourceRef: "worldkit://static-geometry-asset/ridge@1",
    resourceManifestHash: HASH_A,
    artifactPath: "resources/ridge.glb",
    artifactContentHash: sha256Bytes(bytes) as Sha256HashV1,
    bytes,
    mediaType: "model/gltf-binary",
    classBuildRecordRef: "worldkit://static-geometry-build-record/ridge@1",
    classBuildRecordHash: HASH_B,
    assetAdmissionReceiptRef: "worldkit://asset-admission-receipt/ridge@1",
    assetAdmissionReceiptHash: HASH_A,
    assetPublicationReceiptRef:
      "worldkit://asset-publication-receipt/ridge@1",
    assetPublicationReceiptHash: HASH_B,
    importMetadata: {
      kind: "static-geometry-glb",
      mediaType: "model/gltf-binary",
      format: "glb",
      gltfVersion: "2.0",
      localForwardAxis: "-Z",
      localUpAxis: "+Y",
      metersPerUnit: 1,
      pivot: "support-center",
    },
    license: {
      spdxExpression: "CC-BY-4.0",
      licenseDocumentPath: "LICENSES/CC-BY-4.0.txt",
    },
    provenance: {
      author: "WorldKit",
      sourceUri: "https://example.com/ridge.glb",
    },
    redistributionPolicy: "redistributable",
  };
}

async function makeInput() {
  const worldDirectoryPath = await createNativeSceneWorkspaceFixtureV1({
    files: { "scene.ts": SCENE_SOURCE },
  });
  roots.push(worldDirectoryPath);
  const canonical = createWorldPackageTestInputV1();
  const asset = publishedAsset();
  const sourceInventory = [{
    path: "scene.ts",
    contentHash: sha256Bytes(
      new TextEncoder().encode(SCENE_SOURCE),
    ) as Sha256HashV1,
  }];
  const sourceGraphHash = sha256CanonicalJson(sourceInventory) as Sha256HashV1;
  const nativeSceneBootstrap = {
    kind: "babylon-native-scene-bootstrap",
    schemaVersion: 1,
    id: "package-input-bootstrap",
    sceneModuleRef: "worldkit://native-scene/package-input@1",
    nativeSceneApiRef: "worldkit://native-scene-api/babylon-native@1",
    nativeSceneProfileRef: "worldkit://native-scene-profile/trusted-local@1",
    gameplayBootstrapRef: canonical.gameplayBootstrap.resourceRef,
    initialControlledEntityId:
      canonical.worldRuntimeBootstrap.initialControlledEntityId,
    gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
    initialCamera: {
      mode: "third-person",
      pitchRadians: 0.1,
      distanceMeters: 5,
      fovDegrees: 55,
      targetHeightMeters: 1.2,
    },
    seed: 20260830,
    spawnMarkerId: "player-spawn",
  } as const;
  const routeDecision: SceneAuthoringRouteDecisionV1 = {
    kind: "scene-authoring-route-decision",
    schemaVersion: 1,
    id: "package-input-route",
    sceneBriefRef: "worldkit://scene-brief/package-input@1",
    sceneBriefHash: HASH_A,
    trustProfileRef: "worldkit://trust-profile/trusted-local@1",
    trustProfileHash: HASH_B,
    requiredCapabilityRefs: [],
    decision: {
      kind: "babylon-native",
      authoringProfileRef: "worldkit://authoring-profile/native-local@1",
      compositionStrategy: "ground-first-with-locked-assets",
      reasonCodes: ["user-selected-supported-lane"],
    },
  };
  const routeHash = hashSceneAuthoringRouteDecisionV1(routeDecision);
  const nativeAuthoringProfileRef =
    "worldkit://authoring-profile/native-local@1";
  const nativeSceneBootstrapInputRef =
    "worldkit://native-bootstrap-input/package-input@1";
  const moduleGenerationInputRef =
    "worldkit://native-module-generation-input/package-input@1";
  const attempt: SceneAuthoringAttemptV1 = {
    kind: "scene-authoring-attempt",
    schemaVersion: 1,
    id: "package-input-attempt",
    sceneAuthoringRouteDecisionRef:
      "worldkit://scene-authoring-route-decision/package-input@1",
    sceneAuthoringRouteDecisionHash: routeHash,
    sceneBriefRef: routeDecision.sceneBriefRef,
    sceneBriefHash: routeDecision.sceneBriefHash,
    sourceInput: {
      kind: "babylon-native",
      bootstrapInputRef: nativeSceneBootstrapInputRef,
      bootstrapInputHash: hashBabylonNativeSceneBootstrapV1(nativeSceneBootstrap),
      moduleGenerationInputRef,
      moduleGenerationInputHash: sourceGraphHash,
    },
    selectedAssetResources: [{
      assetResourceRef: asset.assetResourceRef,
      assetPublicationReceiptRef: asset.assetPublicationReceiptRef,
      assetPublicationReceiptHash: asset.assetPublicationReceiptHash,
    }],
    seed: nativeSceneBootstrap.seed,
    authoringProfileRef: nativeAuthoringProfileRef,
    acceptanceTargetRefs: [],
    requiredEvidenceProfileRefs: [],
  };
  const attemptResult: SceneAuthoringAttemptResultV1 = {
    kind: "scene-authoring-attempt-result",
    schemaVersion: 1,
    id: "package-input-result",
    sceneAuthoringAttemptRef:
      "worldkit://scene-authoring-attempt/package-input@1",
    sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(attempt),
    outcome: "completed",
    authoredSourceRef: nativeSceneBootstrap.sceneModuleRef,
    authoredSourceHash: sourceGraphHash,
    evidenceRefs: [],
  };
  const nativeSceneApi = {
    resourceRef: nativeSceneBootstrap.nativeSceneApiRef,
    resolvedVersion: "1",
    contentHash: HASH_A,
  } as const;
  const nativeSceneProfile = {
    resourceRef: nativeSceneBootstrap.nativeSceneProfileRef,
    resolvedVersion: "1",
    contentHash: HASH_B,
  } as const;
  const worldRuntimeBootstrapRef =
    "worldkit://world-runtime-bootstrap/package-input@1";
  const registryLock = worldResourceLockEntriesV1([
    ...canonical.worldRuntimeBootstrap.runtimeResourceLockEntries,
    {
      resourceKind: "world-runtime-bootstrap",
      resourceRef: worldRuntimeBootstrapRef,
      resolvedVersion: "1",
      contentHash: canonical.worldRuntimeBootstrap.contentHash,
    },
    {
      resourceKind: "native-scene",
      resourceRef: nativeSceneBootstrap.sceneModuleRef,
      resolvedVersion: "1",
      contentHash: sourceGraphHash,
    },
    {
      resourceKind: "native-scene-api",
      resourceRef: nativeSceneApi.resourceRef,
      resolvedVersion: nativeSceneApi.resolvedVersion,
      contentHash: nativeSceneApi.contentHash,
    },
    {
      resourceKind: "native-scene-profile",
      resourceRef: nativeSceneProfile.resourceRef,
      resolvedVersion: nativeSceneProfile.resolvedVersion,
      contentHash: nativeSceneProfile.contentHash,
    },
    {
      resourceKind: "static-geometry-asset",
      resourceRef: asset.assetResourceRef,
      resolvedVersion: "1",
      contentHash: asset.resourceManifestHash,
    },
  ]);
  let createCount = 0;
  let disposeCount = 0;
  return {
    repositoryRoot: process.cwd(),
    worldDirectoryPath,
    candidateFactory: {
      createCandidate() {
        createCount += 1;
        const engine = new NullEngine({
          renderWidth: 64,
          renderHeight: 64,
          textureSize: 32,
          deterministicLockstep: true,
          lockstepMaxSteps: 4,
        });
        const scene = new Scene(engine);
        return {
          engine,
          scene,
          dispose() {
            disposeCount += 1;
            scene.dispose();
            engine.dispose();
          },
        };
      },
    },
    shared: {
      title: canonical.title,
      sdkVersion: canonical.sdkVersion,
      distributionPolicy: canonical.distributionPolicy,
      hostCompatibility: canonical.hostCompatibility,
      generatedResourceProvenance: canonical.generatedResourceProvenance,
      licenseDocuments: canonical.licenseDocuments,
      noticeText: canonical.noticeText,
    },
    packageId: "package-input.package",
    worldId: "package-input-world",
    worldBounds: {
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [100, 100],
      heightRangeMeters: [-20, 80],
    },
    resourceBudget: {
      maximumVertices: 1_000,
      maximumTriangles: 1_000,
      maximumColliders: 10,
    },
    nativeSceneBootstrap,
    nativeSceneBootstrapInputRef,
    moduleGenerationInputRef,
    nativeSceneApi,
    nativeSceneProfile,
    publishedAssets: [asset],
    sceneAuthoringRouteDecisionRef: attempt.sceneAuthoringRouteDecisionRef,
    sceneAuthoringRouteDecision: routeDecision,
    sceneAuthoringAttemptRef: attemptResult.sceneAuthoringAttemptRef,
    sceneAuthoringAttempt: attempt,
    sceneAuthoringAttemptResultRef:
      "worldkit://scene-authoring-attempt-result/package-input@1",
    sceneAuthoringAttemptResult: attemptResult,
    gameplayBootstrap: canonical.gameplayBootstrap,
    worldRuntimeBootstrapRef,
    worldRuntimeBootstrap: canonical.worldRuntimeBootstrap,
    registryLock,
    get createCount() { return createCount; },
    get disposeCount() { return disposeCount; },
  } as const;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeNativeSceneWorkspaceFixtureV1));
});

describe("prepareFrozenBabylonNativeWorldPackageBuildInputV1", () => {
  it("builds, locks, replays and freezes one exact Native Package input", async () => {
    const input = await makeInput();
    const prepared = await prepareFrozenBabylonNativeWorldPackageBuildInputV1(input);
    expect(input.createCount).toBe(2);
    expect(input.disposeCount).toBe(2);
    expect(prepared.assetReplayLedgers).toEqual([
      ["worldkit://static-geometry-asset/ridge@1"],
      ["worldkit://static-geometry-asset/ridge@1"],
    ]);
    expect(prepared.frozenInput.nativeSceneCheckResult.outcome).toBe("passed");
    expect(prepared.frozenInput.resourceArtifacts).toHaveLength(1);
    expect(prepared.frozenInput.registryLock).toEqual(input.registryLock);
    expect(Object.isFrozen(prepared.frozenInput)).toBe(true);
  }, 45_000);

  it("rejects route, result, and controlled-entity closure drift before replay", async () => {
    const routeInput = await makeInput();
    await expect(prepareFrozenBabylonNativeWorldPackageBuildInputV1({
      ...routeInput,
      sceneAuthoringRouteDecision: {
        ...routeInput.sceneAuthoringRouteDecision,
        decision: {
          kind: "canonical",
          authoringProfileRef:
            "worldkit://authoring-profile/canonical-outdoor@1",
          reasonCodes: ["canonical-default"],
        },
      },
    })).rejects.toThrow(/WORLDKIT_NATIVE_PACKAGE_INPUT_INVALID/);

    const resultInput = await makeInput();
    await expect(prepareFrozenBabylonNativeWorldPackageBuildInputV1({
      ...resultInput,
      sceneAuthoringAttemptResult: {
        kind: "scene-authoring-attempt-result",
        schemaVersion: 1,
        id: "package-input-result",
        sceneAuthoringAttemptRef: resultInput.sceneAuthoringAttemptRef,
        sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(
          resultInput.sceneAuthoringAttempt,
        ),
        outcome: "rejected",
        diagnosticRefs: ["worldkit://diagnostic/package-input@1"],
      },
    })).rejects.toThrow(/WORLDKIT_NATIVE_PACKAGE_INPUT_INVALID/);

    const entityInput = await makeInput();
    await expect(prepareFrozenBabylonNativeWorldPackageBuildInputV1({
      ...entityInput,
      nativeSceneBootstrap: {
        ...entityInput.nativeSceneBootstrap,
        initialControlledEntityId: "other-entity",
      },
    })).rejects.toThrow(/WORLDKIT_NATIVE_PACKAGE_INPUT_INVALID/);
    expect(routeInput.createCount + resultInput.createCount + entityInput.createCount)
      .toBe(0);
  });

  it("rejects an extra Registry lock row after successful replay", async () => {
    const input = await makeInput();
    await expect(prepareFrozenBabylonNativeWorldPackageBuildInputV1({
      ...input,
      registryLock: worldResourceLockEntriesV1([
        ...input.registryLock,
        {
          resourceKind: "native-scene-profile",
          resourceRef: "worldkit://native-scene-profile/extra@1",
          resolvedVersion: "1",
          contentHash: HASH_A,
        },
      ]),
    })).rejects.toThrow(/WORLDKIT_NATIVE_PACKAGE_INPUT_INVALID/);
    expect(input.createCount).toBe(2);
    expect(input.disposeCount).toBe(2);
  }, 45_000);

  it("rejects Contribution geometry outside Host-frozen world bounds", async () => {
    const input = await makeInput();
    await expect(prepareFrozenBabylonNativeWorldPackageBuildInputV1({
      ...input,
      worldBounds: {
        centerMetersXZ: [0, 0],
        sizeMetersXZ: [2, 2],
        heightRangeMeters: [-20, 80],
      },
    })).rejects.toThrow(/WORLDKIT_NATIVE_PACKAGE_INPUT_INVALID/);
    expect(input.createCount).toBe(2);
    expect(input.disposeCount).toBe(2);
  }, 45_000);

  it("fails before Package publication when the Attempt chain is broken", async () => {
    const input = await makeInput();
    await expect(prepareFrozenBabylonNativeWorldPackageBuildInputV1({
      ...input,
      sceneAuthoringAttempt: {
        ...input.sceneAuthoringAttempt,
        sceneAuthoringRouteDecisionHash: HASH_A,
      },
    })).rejects.toThrow(/WORLDKIT_NATIVE_PACKAGE_INPUT_INVALID/);
  }, 45_000);
});
