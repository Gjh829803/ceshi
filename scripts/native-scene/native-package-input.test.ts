import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { sha256Bytes, sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import {
  hashBabylonNativeSceneBootstrapV1,
  worldResourceLockEntriesV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashNativeBlockGenerationRequestV1,
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  parseNativeBlockGenerationRequestV1,
  type SceneAuthoringAttemptResultV1,
  type SceneAuthoringAttemptV1,
  type SceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";

import { createWorldPackageTestInputV1 } from
  "@whitebox-world/world-package/testing";
import type { PublishedBabylonNativeStaticGeometryAssetV1 } from
  "./asset-lock.js";
import { buildTrustedBabylonNativeWorldPackageV1 } from
  "./build-trusted-world-package.js";
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
    nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox.standard@1",
    gameplayBootstrapRef: canonical.gameplayBootstrap.resourceRef,
    initialControlledEntityId:
      canonical.worldRuntimeBootstrap.initialControlledEntityId,
    gravityMetersPerSecondSquaredXYZ:
      canonical.worldRuntimeBootstrap.gravityMetersPerSecondSquaredXYZ,
    initialCamera: {
      mode: canonical.worldRuntimeBootstrap.initialCamera.mode,
      pitchRadians:
        canonical.worldRuntimeBootstrap.initialCamera.pitchRadians,
      distanceMeters:
        canonical.worldRuntimeBootstrap.initialCamera.distanceMeters,
      fovDegrees: canonical.worldRuntimeBootstrap.initialCamera.fovDegrees,
      targetHeightMeters:
        canonical.worldRuntimeBootstrap.initialCamera.targetHeightMeters,
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
      authoringProfileRef:
        "worldkit://native-authoring-profile/whitebox.blocks@1",
      compositionStrategy: "ground-first-with-locked-assets",
      reasonCodes: ["user-selected-supported-lane"],
    },
  };
  const routeHash = hashSceneAuthoringRouteDecisionV1(routeDecision);
  const nativeAuthoringProfileRef =
    "worldkit://native-authoring-profile/whitebox.blocks@1";
  const nativeSceneBootstrapInputRef =
    "worldkit://native-bootstrap-input/package-input@1";
  const generationRequestRef =
    "worldkit://native-generation-request/package-input.initial@1";
  const generationRequest = parseNativeBlockGenerationRequestV1({
    kind: "native-block-generation-request",
    schemaVersion: 1,
    id: "package-input.initial",
    routeDecisionRef: "worldkit://scene-authoring-route-decision/package-input@1",
    routeDecisionHash: routeHash,
    sceneBriefRef: routeDecision.sceneBriefRef,
    sceneBriefHash: routeDecision.sceneBriefHash,
    referenceInputs: [{
      inputRef: "worldkit://reconstruction-input/package-input@1",
      contentHash: HASH_A,
      mediaType: "image/png",
    }],
    codexExecutionProfileRef: "worldkit://codex-execution-profile/formal@1",
    codexExecutionProfileHash: HASH_B,
    taskInstructionRef: "worldkit://task-instruction/native-block-reconstruction@1",
    taskInstructionHash: HASH_A,
    builderSkillRef: "worldkit://skill/worldkit-native-block-builder@1",
    builderSkillHash: HASH_B,
    workspaceContextManifestRef: "worldkit://workspace-context/native-block-builder@1",
    workspaceContextManifestHash: HASH_A,
    contextInputs: [{ inputRef: "context/native-scene-api.json", contentHash: HASH_B }],
    nativeSceneApiRef: nativeSceneBootstrap.nativeSceneApiRef,
    nativeSceneApiHash: HASH_A,
    nativeSceneProfileRef: nativeSceneBootstrap.nativeSceneProfileRef,
    nativeSceneProfileHash: HASH_B,
    blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
    blockProfileHash: HASH_A,
    bootstrapInputRef: nativeSceneBootstrapInputRef,
    bootstrapInputHash: hashBabylonNativeSceneBootstrapV1(nativeSceneBootstrap),
    seed: nativeSceneBootstrap.seed,
    budgets: {
      maximumBlockCount: 2_000,
      maximumStaticColliderCount: 500,
      maximumStaticColliderVertexCount: 200_000,
      maximumStaticColliderTriangleCount: 100_000,
      maximumOutputBytes: 4_000_000,
      timeoutSeconds: 900,
    },
    declaredOutputPaths: ["scene.ts", "native-block-authoring.json", "native-resources.json"],
  });
  const generationRequestHash = hashNativeBlockGenerationRequestV1(generationRequest);
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
      generationRequestRef,
      generationRequestHash,
    },
    selectedAssetResources: [{
      assetResourceRef: asset.assetResourceRef,
      assetPublicationReceiptRef: asset.assetPublicationReceiptRef,
      assetPublicationReceiptHash: asset.assetPublicationReceiptHash,
    }],
    seed: nativeSceneBootstrap.seed,
    authoringProfileRef: nativeAuthoringProfileRef,
    acceptanceTargetRefs: [
      "worldkit://acceptance-target/native-block-package-input@1",
    ],
    requiredEvidenceProfileRefs: [
      "worldkit://evidence-profile/native-block-package-input@1",
    ],
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
      licenseDocuments: [
        ...canonical.licenseDocuments,
        {
          id: "cc-by-4.0",
          spdxLicenseExpression: "CC-BY-4.0",
          path: "LICENSES/CC-BY-4.0.txt",
          text: "Creative Commons Attribution 4.0 International.\n",
        },
      ],
      noticeText: `${canonical.noticeText}See LICENSES/CC-BY-4.0.txt.\n`,
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
    generationRequestRef,
    generationRequestHash,
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

function withSynchronizedNativeBootstrap(
  input: Awaited<ReturnType<typeof makeInput>>,
  nativeSceneBootstrap: Parameters<
    typeof hashBabylonNativeSceneBootstrapV1
  >[0],
) {
  if (input.sceneAuthoringAttempt.sourceInput.kind !== "babylon-native") {
    throw new Error("Native fixture must use the Native source member");
  }
  const sceneAuthoringAttempt: SceneAuthoringAttemptV1 = {
    ...input.sceneAuthoringAttempt,
    sourceInput: {
      ...input.sceneAuthoringAttempt.sourceInput,
      bootstrapInputHash:
        hashBabylonNativeSceneBootstrapV1(nativeSceneBootstrap),
    },
  };
  const sceneAuthoringAttemptResult: SceneAuthoringAttemptResultV1 = {
    ...input.sceneAuthoringAttemptResult,
    sceneAuthoringAttemptHash:
      hashSceneAuthoringAttemptV1(sceneAuthoringAttempt),
  };
  return {
    ...input,
    nativeSceneBootstrap,
    sceneAuthoringAttempt,
    sceneAuthoringAttemptResult,
  };
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
    expect(input.generationRequestHash).not.toBe(
      prepared.frozenInput.sceneModuleBundleManifest.sourceGraphHash,
    );

    const first = createBabylonNativeWorldPackageV1(prepared.frozenInput);
    const repeated = createBabylonNativeWorldPackageV1(prepared.frozenInput);
    const verified = verifyWorldPackageDirectoryV1(first);
    expect(verified.kind).toBe("babylon-native-scene");
    if (verified.kind !== "babylon-native-scene") throw new Error("unreachable");
    expect(repeated.receipt.worldPackageRootHash).toBe(
      first.receipt.worldPackageRootHash,
    );
    expect(verified.receipt.worldBuildIdentity.sceneSourceIdentity).toEqual({
      kind: "babylon-native-scene",
      nativeSceneBootstrapHash:
        first.receipt.manifest.sceneSource.kind === "babylon-native-scene"
          ? first.receipt.manifest.sceneSource.nativeSceneBootstrapHash
          : undefined,
      sceneModuleBundleHash:
        prepared.frozenInput.sceneModuleBundleManifest.bundleContentHash,
      nativeSceneContributionHash:
        first.receipt.manifest.sceneSource.kind === "babylon-native-scene"
          ? first.receipt.manifest.sceneSource.nativeSceneContributionHash
          : undefined,
    });
    expect(first.receipt.fileIntegrityEntries.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "native/bootstrap.json",
        "native/module-bundle.json",
        "native/scene.mjs",
        "native/dependency-lock.json",
        "native/asset-lock.json",
        "native/contribution.json",
        "native/check-result.json",
        "authoring/scene-authoring-route-decision.json",
        "authoring/scene-authoring-attempt.json",
        "authoring/scene-authoring-attempt-result.json",
      ]),
    );
    expect(first.receipt.fileIntegrityEntries.map(({ path }) => path)).not.toEqual(
      expect.arrayContaining([
        "integrity.json",
        "world-package-build-receipt.json",
        "world-build-identity.json",
        "world.normalized.json",
      ]),
    );
    expect(() => createBabylonNativeWorldPackageV1({
      ...prepared.frozenInput,
      sceneModuleBundleBytes: Uint8Array.from([1, 2, 3]),
    })).toThrow("WORLD_PACKAGE_BUILD_INVALID");
    expect(() => createBabylonNativeWorldPackageV1({
      ...prepared.frozenInput,
      nativeSceneCheckResult: {
        ...prepared.frozenInput.nativeSceneCheckResult,
        checkedInput: {
          kind: "native-scene-module",
          sceneModuleRef: "worldkit://native-scene/other@1",
        },
      },
    })).toThrow("WORLD_PACKAGE_BUILD_INVALID");
    expect(() => createBabylonNativeWorldPackageV1({
      ...prepared.frozenInput,
      resourceBudget: {
        maximumVertices: 1,
        maximumTriangles: 1,
        maximumColliders: 1,
      },
    })).toThrow("WORLD_PACKAGE_BUILD_INVALID");
  }, 45_000);

  it("owns the only trusted workspace-to-verified-Package Host pipeline", async () => {
    const input = await makeInput();
    const directory = await buildTrustedBabylonNativeWorldPackageV1(input);
    expect(input.createCount).toBe(2);
    expect(input.disposeCount).toBe(2);
    expect(directory.receipt.manifest.sceneSource.kind).toBe(
      "babylon-native-scene",
    );
  }, 45_000);

  it("rejects route, result, Profile, and controlled-entity closure drift before replay", async () => {
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
    const profileInput = await makeInput();
    await expect(prepareFrozenBabylonNativeWorldPackageBuildInputV1({
      ...profileInput,
      nativeSceneProfile: {
        ...profileInput.nativeSceneProfile,
        resourceRef:
          "worldkit://native-scene-profile/whitebox.blocks@1",
      },
    })).rejects.toThrow(/WORLDKIT_NATIVE_PACKAGE_INPUT_INVALID/);
    const requestRefInput = await makeInput();
    if (requestRefInput.sceneAuthoringAttempt.sourceInput.kind !==
      "babylon-native") {
      throw new Error("Native fixture must use the Native source member");
    }
    await expect(prepareFrozenBabylonNativeWorldPackageBuildInputV1({
      ...requestRefInput,
      sceneAuthoringAttempt: {
        ...requestRefInput.sceneAuthoringAttempt,
        sourceInput: {
          ...requestRefInput.sceneAuthoringAttempt.sourceInput,
          generationRequestRef:
            "worldkit://native-generation-request/other@1",
        },
      },
    })).rejects.toThrow(/WORLDKIT_NATIVE_PACKAGE_INPUT_INVALID/);
    const requestHashInput = await makeInput();
    if (requestHashInput.sceneAuthoringAttempt.sourceInput.kind !==
      "babylon-native") {
      throw new Error("Native fixture must use the Native source member");
    }
    await expect(prepareFrozenBabylonNativeWorldPackageBuildInputV1({
      ...requestHashInput,
      sceneAuthoringAttempt: {
        ...requestHashInput.sceneAuthoringAttempt,
        sourceInput: {
          ...requestHashInput.sceneAuthoringAttempt.sourceInput,
          generationRequestHash: HASH_A,
        },
      },
    })).rejects.toThrow(/WORLDKIT_NATIVE_PACKAGE_INPUT_INVALID/);
    expect(
      routeInput.createCount + resultInput.createCount +
      entityInput.createCount + profileInput.createCount +
      requestRefInput.createCount + requestHashInput.createCount,
    )
      .toBe(0);
  }, 45_000);

  it.each([
    ["gravity", (input: Awaited<ReturnType<typeof makeInput>>) => ({
      ...input.nativeSceneBootstrap,
      gravityMetersPerSecondSquaredXYZ: [
        input.nativeSceneBootstrap.gravityMetersPerSecondSquaredXYZ[0],
        input.nativeSceneBootstrap.gravityMetersPerSecondSquaredXYZ[1] + 1,
        input.nativeSceneBootstrap.gravityMetersPerSecondSquaredXYZ[2],
      ] as const,
    })],
    ["camera pitch", (input: Awaited<ReturnType<typeof makeInput>>) => ({
      ...input.nativeSceneBootstrap,
      initialCamera: {
        ...input.nativeSceneBootstrap.initialCamera,
        pitchRadians:
          input.nativeSceneBootstrap.initialCamera.pitchRadians + 0.1,
      },
    })],
    ["camera distance", (input: Awaited<ReturnType<typeof makeInput>>) => ({
      ...input.nativeSceneBootstrap,
      initialCamera: {
        ...input.nativeSceneBootstrap.initialCamera,
        distanceMeters:
          input.nativeSceneBootstrap.initialCamera.distanceMeters + 1,
      },
    })],
    ["camera field of view", (input: Awaited<ReturnType<typeof makeInput>>) => ({
      ...input.nativeSceneBootstrap,
      initialCamera: {
        ...input.nativeSceneBootstrap.initialCamera,
        fovDegrees: input.nativeSceneBootstrap.initialCamera.fovDegrees + 1,
      },
    })],
    ["camera target height", (input: Awaited<ReturnType<typeof makeInput>>) => ({
      ...input.nativeSceneBootstrap,
      initialCamera: {
        ...input.nativeSceneBootstrap.initialCamera,
        targetHeightMeters:
          input.nativeSceneBootstrap.initialCamera.targetHeightMeters + 0.1,
      },
    })],
  ] as const)(
    "rejects synchronized %s projection drift before Candidate replay",
    async (_label, mutateBootstrap) => {
      const input = await makeInput();
      await expect(prepareFrozenBabylonNativeWorldPackageBuildInputV1(
        withSynchronizedNativeBootstrap(input, mutateBootstrap(input)),
      )).rejects.toThrow(/WORLDKIT_NATIVE_PACKAGE_INPUT_INVALID/);
      expect(input.createCount).toBe(0);
      expect(input.disposeCount).toBe(0);
    },
    45_000,
  );

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
