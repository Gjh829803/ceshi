import { normalizeAuthoringSpecV4, validateAuthoringSpecV4, type AuthoringSpecV4 } from "@whitebox-world/authoring";
import { compileCanonicalWorldV1 } from "@whitebox-world/compiler";
import {
  createGameplayBootstrapV1,
  RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
} from "@whitebox-world/gameplay-contracts";
import {
  sha256Bytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  createBabylonNativeStaticColliderContributionV1,
  hashBabylonNativeAssetLockV1,
  hashBabylonNativeDependencyLockV1,
  hashBabylonNativeSceneBootstrapV1,
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeBlockMaterializerMetadataV1,
  nativeSceneModuleBundleRefFromHashV1,
  worldResourceLockEntriesV1,
  type BabylonNativeAssetLockV1,
  type BabylonNativeDependencyLockV1,
  type BabylonNativeSceneModuleBundleManifestV1,
} from "@whitebox-world/runtime-contracts";
import {
  assertNativeBlockGenerationRequestMatchesAttemptV1,
  hashNativeBlockGenerationRequestV1,
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  type SceneAuthoringAttemptResultV1,
  type SceneAuthoringAttemptV1,
  type SceneAuthoringRouteDecisionV1,
  type NativeBlockGenerationRequestV1,
} from "@whitebox-world/scene-authoring-contracts";
import { isNil } from "lodash-es";
import { resolveTraversalSurfaceProfileV1 } from "@whitebox-world/traversal";

import basicWorldDocument from "../../../examples/authoring/basic-world.json";
import { BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1 } from "./babylon-web-host-profile.js";
import type {
  CreateCanonicalWorldPackageV1Input,
  FrozenBabylonNativeWorldPackageBuildInputV1,
} from "./package-build.js";

export function createWorldPackageTestInputV1(
  overrides: Partial<CreateCanonicalWorldPackageV1Input> = {},
): CreateCanonicalWorldPackageV1Input {
  const validated = validateAuthoringSpecV4(basicWorldDocument);
  if (!validated.ok || isNil(validated.value)) throw new Error("test AuthoringSpec invalid");
  const authoringSpec: AuthoringSpecV4 = validated.value;
  const normalized = normalizeAuthoringSpecV4(authoringSpec);
  if (!normalized.ok || isNil(normalized.value) || isNil(normalized.normalizedWorldIrHash) || isNil(normalized.layoutSolveReport) || isNil(normalized.layoutSolveReportHash)) {
    throw new Error("test normalization failed");
  }
  const gameplayBootstrap = createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: `${authoringSpec.id}.gameplay`,
    version: 1,
    resourceRef: `worldkit://gameplay-bootstrap/${authoringSpec.id}@1`,
    semanticFactProjectorProfileResource:
      RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
    entityDescriptors: normalized.value.nodes.filter((node) => node.kind === "subject").map((node) => {
      const definition = normalized.value!.resources.subjectDefinitions.find((candidate) => candidate.subjectDefinitionRef === node.subjectDefinitionRef);
      if (isNil(definition)) throw new Error("test Subject Definition missing");
      return { id: node.id, entityDefinitionRef: node.subjectDefinitionRef, capabilityRefs: definition.capabilityRefs };
    }),
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
    initialRelationshipStates: [],
  });
  const compiled = compileCanonicalWorldV1({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap,
    worldRuntimeBootstrapRef: `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  });
  if (!compiled.ok || isNil(compiled.canonicalSceneExecutionPlan) || isNil(compiled.worldRuntimeBootstrap)) {
    throw new Error("test compilation failed");
  }
  const base: CreateCanonicalWorldPackageV1Input = {
    packageId: `${authoringSpec.id}.package`,
    title: "Basic World",
    sdkVersion: "0.0.0",
    distributionPolicy: "redistributable",
    canonicalAuthoringSchemaHash: `sha256:${"a".repeat(64)}`,
    aiSchemaProjectionProfile: {
      resourceRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
      contentHash: `sha256:${"b".repeat(64)}`,
    },
    hostCompatibility: BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
    authoringSpec,
    normalizedWorldIr: normalized.value,
    layoutSolveResult: {
      status: normalized.layoutSolveReport.status,
      report: normalized.layoutSolveReport,
      layoutSolveReportHash: normalized.layoutSolveReportHash,
    },
    executionPlan: compiled.canonicalSceneExecutionPlan,
    gameplayBootstrap,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
    resourceArtifacts: [],
    generatedResourceProvenance: {
      licenseDocumentId: "project-owned",
      licenseSpdxExpression: "LicenseRef-Project-Owned",
      redistributionPolicy: "allowed",
      author: "Agent Whitebox World SDK Test Fixture",
    },
    licenseDocuments: [{
      id: "project-owned",
      spdxLicenseExpression: "LicenseRef-Project-Owned",
      path: "LICENSES/project-owned.txt",
      text: "Project-owned test fixture. Redistribution allowed.\n",
    }],
    noticeText: "Basic World\nSee LICENSES/project-owned.txt.\n",
    includeAuthoringSpec: true,
  };
  return { ...base, ...overrides };
}

function createBabylonNativeWorldPackageTestInputForProfileV1(
  profileKind: "standard" | "blocks",
  overrides: Partial<FrozenBabylonNativeWorldPackageBuildInputV1> = {},
): FrozenBabylonNativeWorldPackageBuildInputV1 {
  const canonical = createWorldPackageTestInputV1();
  const sceneModuleRef = "worldkit://native-scene/package-fixture@1";
  const authoringProfileRef =
    "worldkit://native-authoring-profile/whitebox.blocks@1";
  const nativeSceneApi = Object.freeze({
    resourceRef: "worldkit://native-scene-api/babylon-native@1",
    resolvedVersion: "1",
    contentHash: `sha256:${"a".repeat(64)}` as Sha256HashV1,
  });
  const nativeSceneProfile = Object.freeze({
    resourceRef: profileKind === "blocks"
      ? "worldkit://native-scene-profile/whitebox.blocks@1"
      : "worldkit://native-scene-profile/whitebox.standard@1",
    resolvedVersion: "1",
    contentHash: `sha256:${"b".repeat(64)}` as Sha256HashV1,
  });
  const nativeSceneBootstrap = Object.freeze({
    kind: "babylon-native-scene-bootstrap" as const,
    schemaVersion: 1 as const,
    id: "package-fixture-bootstrap",
    sceneModuleRef,
    nativeSceneApiRef: nativeSceneApi.resourceRef,
    nativeSceneProfileRef: nativeSceneProfile.resourceRef,
    gameplayBootstrapRef: canonical.gameplayBootstrap.resourceRef,
    initialControlledEntityId:
      canonical.worldRuntimeBootstrap.initialControlledEntityId,
    gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0] as const,
    initialCamera: Object.freeze({
      mode: "third-person" as const,
      pitchRadians:
        canonical.worldRuntimeBootstrap.initialCamera.pitchRadians,
      distanceMeters:
        canonical.worldRuntimeBootstrap.initialCamera.distanceMeters,
      fovDegrees: canonical.worldRuntimeBootstrap.initialCamera.fovDegrees,
      targetHeightMeters:
        canonical.worldRuntimeBootstrap.initialCamera.targetHeightMeters,
    }),
    seed: 20260830,
    spawnMarkerId: "player-spawn",
  });
  const sourceInventory = Object.freeze([Object.freeze({
    path: "scene.ts",
    contentHash: sha256Bytes(
      new TextEncoder().encode("export default packageFixture;\n"),
    ) as Sha256HashV1,
  })]);
  const sourceGraphHash = sha256CanonicalJson(
    sourceInventory,
  ) as Sha256HashV1;
  const bundleBytes = new TextEncoder().encode(
    "export default Object.freeze({kind:'fixture'});\n",
  );
  const bundleContentHash = sha256Bytes(bundleBytes) as Sha256HashV1;
  const dependencyLock: BabylonNativeDependencyLockV1 = Object.freeze({
    kind: "babylon-native-dependency-lock",
    schemaVersion: 1,
    lockfileHash: `sha256:${"c".repeat(64)}`,
    entries: Object.freeze([Object.freeze({
      packageName: "@babylonjs/core",
      resolvedVersion: "9.23.0",
      packageManifestHash: `sha256:${"d".repeat(64)}`,
      packageIntegrityHash: `sha256:${"e".repeat(64)}`,
      usage: "runtime-external" as const,
    })]),
  });
  const assetLock: BabylonNativeAssetLockV1 = Object.freeze({
    kind: "babylon-native-asset-lock",
    schemaVersion: 1,
    entries: Object.freeze([]),
  });
  const sceneModuleBundleManifest:
    BabylonNativeSceneModuleBundleManifestV1 = Object.freeze({
      kind: "babylon-native-scene-module-bundle",
      schemaVersion: 1,
      id: "package-fixture-bundle",
      sceneModuleRef,
      sceneModuleBundleRef:
        nativeSceneModuleBundleRefFromHashV1(bundleContentHash),
      entryPath: "native/scene.mjs",
      sourceInventory,
      fileInventory: Object.freeze([Object.freeze({
        path: "native/scene.mjs",
        mediaType: "text/javascript",
        sizeBytes: bundleBytes.byteLength,
        contentHash: bundleContentHash,
      })]),
      sourceGraphHash,
      bundleSizeBytes: bundleBytes.byteLength,
      bundleMediaType: "text/javascript",
      bundleContentHash,
      nativeSceneApi,
      nativeSceneProfile,
      importProfileHash: `sha256:${"f".repeat(64)}`,
      typescriptCompilerOptionsHash: `sha256:${"1".repeat(64)}`,
      bundlerProfileHash: `sha256:${"2".repeat(64)}`,
      seed: nativeSceneBootstrap.seed,
      dependencyLockHash: hashBabylonNativeDependencyLockV1(dependencyLock),
      assetLockHash: hashBabylonNativeAssetLockV1(assetLock),
    });
  const route: SceneAuthoringRouteDecisionV1 = Object.freeze({
    kind: "scene-authoring-route-decision",
    schemaVersion: 1,
    id: "package-fixture-route",
    sceneBriefRef: "worldkit://scene-brief/package-fixture@1",
    sceneBriefHash: `sha256:${"3".repeat(64)}`,
    trustProfileRef: "worldkit://trust-profile/trusted-local@1",
    trustProfileHash: `sha256:${"4".repeat(64)}`,
    requiredCapabilityRefs: Object.freeze([]),
    decision: Object.freeze({
      kind: "babylon-native" as const,
      authoringProfileRef,
      compositionStrategy: "ground-first" as const,
      reasonCodes: Object.freeze(["user-selected-supported-lane" as const]),
    }),
  });
  const routeDecisionHash = hashSceneAuthoringRouteDecisionV1(route);
  const bootstrapInputRef =
    "worldkit://native-bootstrap-input/package-fixture@1";
  const bootstrapInputHash =
    hashBabylonNativeSceneBootstrapV1(nativeSceneBootstrap);
  const generationRequest: NativeBlockGenerationRequestV1 = Object.freeze({
    kind: "native-block-generation-request",
    schemaVersion: 1,
    id: "package-fixture.initial",
    routeDecisionRef:
      "worldkit://scene-authoring-route-decision/package-fixture@1",
    routeDecisionHash,
    sceneBriefRef: route.sceneBriefRef,
    sceneBriefHash: route.sceneBriefHash,
    referenceInputs: Object.freeze([]),
    codexExecutionProfileRef:
      "worldkit://codex-execution-profile/formal@1",
    codexExecutionProfileHash: `sha256:${"5".repeat(64)}`,
    taskInstructionRef:
      "worldkit://task-instruction/native-block-reconstruction@1",
    taskInstructionHash: `sha256:${"6".repeat(64)}`,
    builderSkillRef: "worldkit://skill/worldkit-native-block-builder@1",
    builderSkillHash: `sha256:${"7".repeat(64)}`,
    workspaceContextManifestRef:
      "worldkit://workspace-context/native-block-builder@1",
    workspaceContextManifestHash: `sha256:${"8".repeat(64)}`,
    contextInputs: Object.freeze([Object.freeze({
      inputRef: "context/native-scene-api.json",
      contentHash: nativeSceneApi.contentHash,
    })]),
    nativeSceneApiRef: nativeSceneApi.resourceRef,
    nativeSceneApiHash: nativeSceneApi.contentHash,
    nativeSceneProfileRef: nativeSceneProfile.resourceRef,
    nativeSceneProfileHash: nativeSceneProfile.contentHash,
    blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
    blockProfileHash: `sha256:${"9".repeat(64)}`,
    bootstrapInputRef,
    bootstrapInputHash,
    seed: nativeSceneBootstrap.seed,
    budgets: Object.freeze({
      maximumBlockCount: 2_000,
      maximumStaticColliderCount: 500,
      maximumStaticColliderVertexCount: 200_000,
      maximumStaticColliderTriangleCount: 100_000,
      maximumOutputBytes: 4_000_000,
      timeoutSeconds: 900,
    }),
    declaredOutputPaths: Object.freeze([
      "scene.ts",
      "native-block-authoring.json",
      "native-resources.json",
    ] as const),
  });
  const attempt: SceneAuthoringAttemptV1 = Object.freeze({
    kind: "scene-authoring-attempt",
    schemaVersion: 1,
    id: "package-fixture-attempt",
    sceneAuthoringRouteDecisionRef:
      "worldkit://scene-authoring-route-decision/package-fixture@1",
    sceneAuthoringRouteDecisionHash: routeDecisionHash,
    sceneBriefRef: route.sceneBriefRef,
    sceneBriefHash: route.sceneBriefHash,
    sourceInput: Object.freeze({
      kind: "babylon-native" as const,
      bootstrapInputRef,
      bootstrapInputHash,
      generationRequestRef:
        "worldkit://native-generation-request/package-fixture.initial@1",
      generationRequestHash:
        hashNativeBlockGenerationRequestV1(generationRequest),
    }),
    selectedAssetResources: Object.freeze([]),
    seed: nativeSceneBootstrap.seed,
    authoringProfileRef,
    acceptanceTargetRefs: Object.freeze([
      "worldkit://acceptance-target/package-fixture-opening@1",
    ]),
    requiredEvidenceProfileRefs: Object.freeze([
      "worldkit://evidence-profile/native-block-runtime@1",
    ]),
  });
  assertNativeBlockGenerationRequestMatchesAttemptV1(
    "worldkit://native-generation-request/package-fixture.initial@1",
    generationRequest,
    attempt,
  );
  const attemptResult: SceneAuthoringAttemptResultV1 = Object.freeze({
    kind: "scene-authoring-attempt-result",
    schemaVersion: 1,
    id: "package-fixture-result",
    sceneAuthoringAttemptRef:
      "worldkit://scene-authoring-attempt/package-fixture@1",
    sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(attempt),
    outcome: "completed",
    authoredSourceRef: sceneModuleRef,
    authoredSourceHash: sourceGraphHash,
    evidenceRefs: Object.freeze([]),
  });
  const nativeSceneContribution = Object.freeze({
    kind: "babylon-native-scene-contribution" as const,
    schemaVersion: 1 as const,
    sceneModuleRef,
    sceneModuleId: "package-fixture-module",
    profileSettlement: profileKind === "blocks"
      ? Object.freeze({
        kind: "host-snapshot" as const,
        profileRef:
          "worldkit://native-scene-profile/whitebox.blocks@1" as const,
        targetCount: 2,
        profileInventoryHash: `sha256:${"1".repeat(64)}` as Sha256HashV1,
        settledVisualHash: `sha256:${"2".repeat(64)}` as Sha256HashV1,
      })
      : Object.freeze({
        kind: "none" as const,
        profileRef:
          "worldkit://native-scene-profile/whitebox.standard@1" as const,
      }),
    spawnMarker: Object.freeze({
      id: nativeSceneBootstrap.spawnMarkerId,
      positionMetersXYZ: [0, 0, 0] as const,
      facingRadians: 0,
    }),
    staticColliders: Object.freeze([
      createBabylonNativeStaticColliderContributionV1({
        id: "ground",
        runtimeRole: "scene-static-collider",
        worldPositionsMetersXYZ: [-5, 0, -5, 5, 0, -5, 0, 0, 5],
        triangleIndices: [0, 1, 2],
        frictionRatio: 0.8,
        restitutionRatio: 0,
        traversalBinding: {
          kind: "static-surface",
          surfaceEntityId: "ground-surface",
          logicalSubshapeId: "top",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        },
      }),
    ]),
  });
  const nativeBlockMaterializerMetadata = profileKind === "blocks"
    ? parseBabylonNativeBlockMaterializerMetadataV1({
      kind: "babylon-native-block-materializer-metadata",
      openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
      schemaVersion: 1,
      nativeSceneProfileRef:
        "worldkit://native-scene-profile/whitebox.blocks@1",
      caseHash: `sha256:${"5".repeat(64)}`,
      authoringManifestHash: `sha256:${"6".repeat(64)}`,
      checkedLayoutInventoryHash: `sha256:${"7".repeat(64)}`,
      contributionHash:
        hashBabylonNativeSceneContributionV1(nativeSceneContribution),
      profileInventoryHash:
        nativeSceneContribution.profileSettlement.kind === "host-snapshot"
          ? nativeSceneContribution.profileSettlement.profileInventoryHash
          : `sha256:${"8".repeat(64)}`,
      settledVisualHash:
        nativeSceneContribution.profileSettlement.kind === "host-snapshot"
          ? nativeSceneContribution.profileSettlement.settledVisualHash
          : `sha256:${"9".repeat(64)}`,
      blocks: [{
        blockId: "ground-block",
        runtimeEntityId: "native-block:ground-block",
        semanticCaptureClassId:
          "worldkit.native-block.group.ground-group",
        shape: "full",
        paletteRole: "ground",
        visualGroupId: "ground-group",
        centerMetersXYZ: [0, -0.5, 0],
        rotationQuarterTurnsY: 0,
        sizeMetersXYZ: [10, 1, 10],
      }],
      visualGroups: [{
        visualGroupId: "ground-group",
        acceptanceTargetRef:
          "worldkit://acceptance-target/package-fixture-opening@1",
        semanticClassId: "ground.fixture",
        identityColorHex: "#AA0001",
        blockIds: ["ground-block"],
        paletteRoles: ["ground"],
        minimumMetersXYZ: [-5, -1, -5],
        maximumMetersXYZ: [5, 0, 5],
      }],
      colliderJoins: [{
        colliderId: "ground",
        sourceBlockIds: ["ground-block"],
        visualGroupIds: ["ground-group"],
        proxyKind: "continuous-walkable-surface",
        minimumMetersXYZ: [-5, 0, -5],
        maximumMetersXYZ: [5, 0, 5],
        vertexCount: 3,
        triangleCount: 1,
        topologyHash: `sha256:${"a".repeat(64)}`,
      }],
    })
    : undefined;
  const worldRuntimeBootstrapRef =
    "worldkit://world-runtime-bootstrap/package-fixture@1";
  const traversalSurfaceProfile = resolveTraversalSurfaceProfileV1(
    "worldkit://traversal-surface-profile/ground.static@1",
  );
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
      resourceRef: sceneModuleRef,
      resolvedVersion: "1",
      contentHash: sourceGraphHash,
    },
    { resourceKind: "native-scene-api", ...nativeSceneApi },
    { resourceKind: "native-scene-profile", ...nativeSceneProfile },
    {
      resourceKind: "traversal-surface-profile",
      resourceRef: traversalSurfaceProfile.resourceRef,
      resolvedVersion: traversalSurfaceProfile.resolvedVersion,
      contentHash: traversalSurfaceProfile.contentHash,
    },
  ]);
  const base: FrozenBabylonNativeWorldPackageBuildInputV1 = {
    shared: {
      title: "Babylon Native Package Fixture",
      sdkVersion: canonical.sdkVersion,
      distributionPolicy: canonical.distributionPolicy,
      hostCompatibility: canonical.hostCompatibility,
      generatedResourceProvenance: canonical.generatedResourceProvenance,
      licenseDocuments: canonical.licenseDocuments,
      noticeText: canonical.noticeText,
    },
    packageId: "package-fixture.package",
    worldId: "package-fixture-world",
    worldBounds: {
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [20, 20],
      heightRangeMeters: [-5, 20],
    },
    resourceBudget: {
      maximumVertices: 100,
      maximumTriangles: 100,
      maximumColliders: 10,
    },
    nativeSceneBootstrap,
    sceneModuleBundleManifest,
    sceneModuleBundleBytes: bundleBytes,
    dependencyLock,
    assetLock,
    sceneAuthoringRouteDecision: route,
    sceneAuthoringAttempt: attempt,
    sceneAuthoringAttemptResultRef:
      "worldkit://scene-authoring-attempt-result/package-fixture@1",
    sceneAuthoringAttemptResult: attemptResult,
    nativeSceneCheckResult: {
      kind: "native-scene-check-result",
      schemaVersion: 1,
      id: "package-fixture-check",
      checkedInput: { kind: "native-scene-module", sceneModuleRef },
      outcome: "passed",
      diagnostics: [],
    },
    nativeSceneContribution,
    ...(isNil(nativeBlockMaterializerMetadata)
      ? {}
      : { nativeBlockMaterializerMetadata }),
    gameplayBootstrap: canonical.gameplayBootstrap,
    worldRuntimeBootstrap: canonical.worldRuntimeBootstrap,
    registryLock,
    resourceArtifacts: [],
  };
  return { ...base, ...overrides };
}

export function createBabylonNativeWorldPackageTestInputV1(
  overrides: Partial<FrozenBabylonNativeWorldPackageBuildInputV1> = {},
): FrozenBabylonNativeWorldPackageBuildInputV1 {
  return createBabylonNativeWorldPackageTestInputForProfileV1(
    "standard",
    overrides,
  );
}

export function createBabylonNativeBlockWorldPackageTestInputV1(
  overrides: Partial<FrozenBabylonNativeWorldPackageBuildInputV1> = {},
): FrozenBabylonNativeWorldPackageBuildInputV1 {
  return createBabylonNativeWorldPackageTestInputForProfileV1(
    "blocks",
    overrides,
  );
}
