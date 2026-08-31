import {
  replayBabylonNativeSceneModuleV1,
  type BabylonNativeSceneCandidateFactoryV1,
} from "@whitebox-world/native-babylon/host";
import {
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
  hashBabylonNativeBlockCheckedLayoutInventoryV1,
} from "@whitebox-world/native-babylon-block-profile";
import {
  takeBabylonNativeBlockCheckedEpochEvidenceV1,
  type BabylonNativeBlockCheckedEpochEvidenceV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import {
  parseGameplayBootstrapV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import {
  sha256Bytes,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashBabylonNativeSceneBootstrapV1,
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeSceneBootstrapV1,
  parseBabylonNativeSceneContributionV1,
  parseNativeSceneCheckResultV1,
  parseWorldRuntimeBootstrapV1,
  worldResourceLockEntriesV1,
  type BabylonNativeSceneResolvedProfileV1,
  type WorldResourceLockEntryV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  parseSceneAuthoringAttemptResultV1,
  parseSceneAuthoringAttemptV1,
  parseSceneAuthoringRouteDecisionV1,
  type SceneAuthoringAttemptResultV1,
  type SceneAuthoringAttemptV1,
  type SceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
import type {
  FrozenBabylonNativeWorldPackageBuildInputV1,
  WorldPackageResourceBudgetV1,
  WorldPackageSharedBuildContextV1,
  WorldPackageWorldBoundsV1,
} from "@whitebox-world/world-package";
import { isEqual, isNil } from "lodash-es";

import {
  createBabylonNativeReplayAssetLedgerV1,
  resolveBabylonNativeAssetLockV1,
  type PublishedBabylonNativeStaticGeometryAssetV1,
} from "./asset-lock.js";
import { resolveBabylonNativeDependencyLockV1 } from "./dependency-lock.js";
import {
  buildAndLoadBabylonNativeSceneModuleV1,
  finalizeBabylonNativeSceneModuleBundleManifestV1,
} from "./module-bundle.js";
import { admitBabylonNativeSourceGraphV1 } from "./source-admission.js";

export interface PrepareFrozenBabylonNativeWorldPackageBuildInputV1 {
  readonly repositoryRoot: string;
  readonly worldDirectoryPath: string;
  readonly candidateFactory: BabylonNativeSceneCandidateFactoryV1;
  readonly shared: WorldPackageSharedBuildContextV1;
  readonly packageId: string;
  readonly worldId: string;
  readonly worldBounds: WorldPackageWorldBoundsV1;
  readonly resourceBudget: WorldPackageResourceBudgetV1;
  readonly nativeSceneBootstrap: unknown;
  readonly nativeSceneBootstrapInputRef: string;
  readonly generationRequestRef: string;
  readonly generationRequestHash: Sha256HashV1;
  readonly nativeSceneApi: BabylonNativeSceneResolvedProfileV1;
  readonly nativeSceneProfile: BabylonNativeSceneResolvedProfileV1;
  readonly publishedAssets:
    readonly PublishedBabylonNativeStaticGeometryAssetV1[];
  readonly sceneAuthoringRouteDecisionRef: string;
  readonly sceneAuthoringRouteDecision: SceneAuthoringRouteDecisionV1;
  readonly sceneAuthoringAttemptRef: string;
  readonly sceneAuthoringAttempt: SceneAuthoringAttemptV1;
  readonly sceneAuthoringAttemptResultRef: string;
  readonly sceneAuthoringAttemptResult: SceneAuthoringAttemptResultV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrapRef: string;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly registryLock: readonly WorldResourceLockEntryV1[];
}

export interface PreparedFrozenBabylonNativeWorldPackageBuildInputV1 {
  readonly frozenInput: FrozenBabylonNativeWorldPackageBuildInputV1;
  readonly assetReplayLedgers:
    readonly [readonly string[], readonly string[]];
  readonly sceneModuleBundleManifestHash: Sha256HashV1;
  readonly dependencyLockHash: Sha256HashV1;
  readonly assetLockHash: Sha256HashV1;
  readonly blockCheckedEpochEvidence?:
    BabylonNativeBlockCheckedEpochEvidenceV1;
}

export class BabylonNativePackageInputErrorV1 extends Error {
  readonly code = "WORLDKIT_NATIVE_PACKAGE_INPUT_INVALID";

  constructor() {
    super("WORLDKIT_NATIVE_PACKAGE_INPUT_INVALID");
  }
}

function fail(): never {
  throw new BabylonNativePackageInputErrorV1();
}

function identity(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.normalize("NFC") !== input
  ) return fail();
  return input;
}

function resourceVersion(resourceRef: string): string {
  const match = /@([1-9][0-9]*)$/.exec(resourceRef);
  if (match?.[1] === undefined) return fail();
  return match[1];
}

function parsedBounds(input: WorldPackageWorldBoundsV1): WorldPackageWorldBoundsV1 {
  const center = input.centerMetersXZ;
  const size = input.sizeMetersXZ;
  const height = input.heightRangeMeters;
  if (
    !Array.isArray(center) || center.length !== 2 ||
    !Array.isArray(size) || size.length !== 2 ||
    !Array.isArray(height) || height.length !== 2 ||
    [...center, ...size, ...height].some((value) =>
      typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) ||
    size[0] <= 0 || size[1] <= 0 || height[0] >= height[1]
  ) return fail();
  return Object.freeze({
    centerMetersXZ: Object.freeze([center[0], center[1]] as const),
    sizeMetersXZ: Object.freeze([size[0], size[1]] as const),
    heightRangeMeters: Object.freeze([height[0], height[1]] as const),
  });
}

function parsedBudget(
  input: WorldPackageResourceBudgetV1,
): WorldPackageResourceBudgetV1 {
  if ([
    input.maximumVertices,
    input.maximumTriangles,
    input.maximumColliders,
  ].some((value) => !Number.isSafeInteger(value) || value < 1)) return fail();
  return Object.freeze({
    maximumVertices: input.maximumVertices,
    maximumTriangles: input.maximumTriangles,
    maximumColliders: input.maximumColliders,
  });
}

function isInsideBounds(
  position: readonly number[],
  bounds: WorldPackageWorldBoundsV1,
): boolean {
  if (
    position.length !== 3 ||
    position.some((value) => !Number.isFinite(value))
  ) return false;
  const halfX = bounds.sizeMetersXZ[0] / 2;
  const halfZ = bounds.sizeMetersXZ[1] / 2;
  return position[0]! >= bounds.centerMetersXZ[0] - halfX &&
    position[0]! <= bounds.centerMetersXZ[0] + halfX &&
    position[2]! >= bounds.centerMetersXZ[1] - halfZ &&
    position[2]! <= bounds.centerMetersXZ[1] + halfZ &&
    position[1]! >= bounds.heightRangeMeters[0] &&
    position[1]! <= bounds.heightRangeMeters[1];
}

function assertContributionWorldFacts(
  contribution: ReturnType<typeof parseBabylonNativeSceneContributionV1>,
  bootstrap: ReturnType<typeof parseBabylonNativeSceneBootstrapV1>,
  bounds: WorldPackageWorldBoundsV1,
  budget: WorldPackageResourceBudgetV1,
): void {
  const vertexCount = contribution.staticColliders.reduce(
    (total, collider) => total + collider.vertexCount,
    0,
  );
  const triangleCount = contribution.staticColliders.reduce(
    (total, collider) => total + collider.triangleCount,
    0,
  );
  if (
    contribution.spawnMarker.id !== bootstrap.spawnMarkerId ||
    !isInsideBounds(contribution.spawnMarker.positionMetersXYZ, bounds) ||
    contribution.staticColliders.length > budget.maximumColliders ||
    vertexCount > budget.maximumVertices ||
    triangleCount > budget.maximumTriangles
  ) return fail();
  for (const collider of contribution.staticColliders) {
    for (let index = 0; index < collider.worldPositionsMetersXYZ.length; index += 3) {
      if (!isInsideBounds(
        collider.worldPositionsMetersXYZ.slice(index, index + 3),
        bounds,
      )) return fail();
    }
  }
}

function assertAuthoringClosure(
  input: PrepareFrozenBabylonNativeWorldPackageBuildInputV1,
  bootstrap: ReturnType<typeof parseBabylonNativeSceneBootstrapV1>,
  route: ReturnType<typeof parseSceneAuthoringRouteDecisionV1>,
  attempt: ReturnType<typeof parseSceneAuthoringAttemptV1>,
  result: ReturnType<typeof parseSceneAuthoringAttemptResultV1>,
  gameplay: ReturnType<typeof parseGameplayBootstrapV1>,
  runtime: ReturnType<typeof parseWorldRuntimeBootstrapV1>,
): void {
  if (
    route.decision.kind !== "babylon-native" ||
    attempt.sceneAuthoringRouteDecisionRef !==
      identity(input.sceneAuthoringRouteDecisionRef) ||
    attempt.sceneAuthoringRouteDecisionHash !==
      hashSceneAuthoringRouteDecisionV1(route) ||
    attempt.sceneBriefRef !== route.sceneBriefRef ||
    attempt.sceneBriefHash !== route.sceneBriefHash ||
    attempt.authoringProfileRef !== route.decision.authoringProfileRef ||
    attempt.sourceInput.kind !== "babylon-native" ||
    attempt.sourceInput.bootstrapInputRef !==
      identity(input.nativeSceneBootstrapInputRef) ||
    attempt.sourceInput.bootstrapInputHash !==
      hashBabylonNativeSceneBootstrapV1(bootstrap) ||
    attempt.sourceInput.generationRequestRef !==
      identity(input.generationRequestRef) ||
    attempt.sourceInput.generationRequestHash !== input.generationRequestHash ||
    attempt.seed !== bootstrap.seed ||
    result.outcome !== "completed" ||
    result.sceneAuthoringAttemptRef !== identity(input.sceneAuthoringAttemptRef) ||
    result.sceneAuthoringAttemptHash !== hashSceneAuthoringAttemptV1(attempt) ||
    bootstrap.gameplayBootstrapRef !== gameplay.resourceRef ||
    runtime.gameplayBootstrapRef !== gameplay.resourceRef ||
    runtime.gameplayBootstrapHash !== gameplay.contentHash ||
    runtime.initialControlledEntityId !== bootstrap.initialControlledEntityId ||
    !isEqual(
      runtime.gravityMetersPerSecondSquaredXYZ,
      bootstrap.gravityMetersPerSecondSquaredXYZ,
    ) ||
    runtime.initialCamera.mode !== bootstrap.initialCamera.mode ||
    runtime.initialCamera.pitchRadians !==
      bootstrap.initialCamera.pitchRadians ||
    runtime.initialCamera.distanceMeters !==
      bootstrap.initialCamera.distanceMeters ||
    runtime.initialCamera.fovDegrees !== bootstrap.initialCamera.fovDegrees ||
    runtime.initialCamera.targetHeightMeters !==
      bootstrap.initialCamera.targetHeightMeters
  ) return fail();
}

function assertSourceClosure(
  bootstrap: ReturnType<typeof parseBabylonNativeSceneBootstrapV1>,
  result: ReturnType<typeof parseSceneAuthoringAttemptResultV1>,
  sourceGraphHash: Sha256HashV1,
): void {
  if (
    result.outcome !== "completed" ||
    result.authoredSourceRef !== bootstrap.sceneModuleRef ||
    result.authoredSourceHash !== sourceGraphHash
  ) return fail();
}

function expectedRegistryLock(
  input: PrepareFrozenBabylonNativeWorldPackageBuildInputV1,
  runtime: ReturnType<typeof parseWorldRuntimeBootstrapV1>,
  bundleSourceGraphHash: Sha256HashV1,
  contribution: ReturnType<typeof parseBabylonNativeSceneContributionV1>,
  assetEntries: readonly Readonly<{
    assetResourceRef: string;
    resourceManifestHash: Sha256HashV1;
  }>[],
): readonly WorldResourceLockEntryV1[] {
  const bootstrap = parseBabylonNativeSceneBootstrapV1(
    input.nativeSceneBootstrap,
  );
  const supplied = worldResourceLockEntriesV1(input.registryLock);
  const traversalRefs = new Set(contribution.staticColliders.flatMap((collider) =>
    collider.traversalBinding.kind === "static-surface"
      ? [collider.traversalBinding.traversalSurfaceProfileRef]
      : []));
  const traversalEntries = [...traversalRefs].map((resourceRef) => {
    const rows = supplied.filter((entry) =>
      entry.resourceKind === "traversal-surface-profile" &&
      entry.resourceRef === resourceRef);
    if (rows.length !== 1) return fail();
    return rows[0]!;
  });
  return worldResourceLockEntriesV1([
    ...runtime.runtimeResourceLockEntries,
    {
      resourceKind: "world-runtime-bootstrap",
      resourceRef: identity(input.worldRuntimeBootstrapRef),
      resolvedVersion: resourceVersion(input.worldRuntimeBootstrapRef),
      contentHash: runtime.contentHash,
    },
    {
      resourceKind: "native-scene",
      resourceRef: bootstrap.sceneModuleRef,
      resolvedVersion: resourceVersion(bootstrap.sceneModuleRef),
      contentHash: bundleSourceGraphHash,
    },
    {
      resourceKind: "native-scene-api",
      resourceRef: input.nativeSceneApi.resourceRef,
      resolvedVersion: input.nativeSceneApi.resolvedVersion,
      contentHash: input.nativeSceneApi.contentHash,
    },
    {
      resourceKind: "native-scene-profile",
      resourceRef: input.nativeSceneProfile.resourceRef,
      resolvedVersion: input.nativeSceneProfile.resolvedVersion,
      contentHash: input.nativeSceneProfile.contentHash,
    },
    ...assetEntries.map((asset) => ({
      resourceKind: "static-geometry-asset" as const,
      resourceRef: asset.assetResourceRef,
      resolvedVersion: resourceVersion(asset.assetResourceRef),
      contentHash: asset.resourceManifestHash,
    })),
    ...traversalEntries,
  ]);
}

function deepFreezePlainData<T>(value: T): T {
  if (value instanceof Uint8Array) return new Uint8Array(value) as T;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => deepFreezePlainData(entry))) as T;
  }
  if (typeof value !== "object" || isNil(value)) return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return fail();
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (isNil(descriptor) || !("value" in descriptor) || !descriptor.enumerable) {
      return fail();
    }
    output[key] = deepFreezePlainData(descriptor.value);
  }
  return Object.freeze(output) as T;
}

export async function prepareFrozenBabylonNativeWorldPackageBuildInputV1(
  input: PrepareFrozenBabylonNativeWorldPackageBuildInputV1,
): Promise<PreparedFrozenBabylonNativeWorldPackageBuildInputV1> {
  try {
    const bootstrap = parseBabylonNativeSceneBootstrapV1(
      input.nativeSceneBootstrap,
    );
    const route = parseSceneAuthoringRouteDecisionV1(
      input.sceneAuthoringRouteDecision,
    );
    const attempt = parseSceneAuthoringAttemptV1(input.sceneAuthoringAttempt);
    const attemptResult = parseSceneAuthoringAttemptResultV1(
      input.sceneAuthoringAttemptResult,
    );
    const gameplay = parseGameplayBootstrapV1(input.gameplayBootstrap);
    const runtime = parseWorldRuntimeBootstrapV1(input.worldRuntimeBootstrap);
    assertAuthoringClosure(
      input,
      bootstrap,
      route,
      attempt,
      attemptResult,
      gameplay,
      runtime,
    );
    identity(input.sceneAuthoringAttemptResultRef);
    resourceVersion(input.sceneAuthoringAttemptResultRef);
    identity(input.packageId);
    identity(input.worldId);
    const worldBounds = parsedBounds(input.worldBounds);
    const resourceBudget = parsedBudget(input.resourceBudget);

    const admitted = await admitBabylonNativeSourceGraphV1(
      input.worldDirectoryPath,
    );
    if (admitted.outcome !== "passed") return fail();
    const bundled = await buildAndLoadBabylonNativeSceneModuleV1(
      admitted.sourceGraph,
    );
    if (bundled.outcome !== "passed") return fail();
    assertSourceClosure(
      bootstrap,
      attemptResult,
      bundled.bundleArtifact.sourceGraphHash,
    );

    const dependency = await resolveBabylonNativeDependencyLockV1({
      repositoryRoot: input.repositoryRoot,
      externalImportSpecifiers:
        bundled.bundleArtifact.externalImportSpecifiers,
    });
    const assets = resolveBabylonNativeAssetLockV1({
      selectedAssetResources: attempt.selectedAssetResources,
      publishedAssets: input.publishedAssets,
    });
    const finalizedBundle = finalizeBabylonNativeSceneModuleBundleManifestV1({
      bundleArtifact: bundled.bundleArtifact,
      id: `${bundled.module.id}.bundle`,
      sceneModuleRef: bootstrap.sceneModuleRef,
      nativeSceneApi: input.nativeSceneApi,
      nativeSceneProfile: input.nativeSceneProfile,
      seed: bootstrap.seed,
      dependencyLockHash: dependency.dependencyLockHash,
      assetLockHash: assets.assetLockHash,
    });
    if (
      finalizedBundle.manifest.sceneModuleRef !== bootstrap.sceneModuleRef ||
      finalizedBundle.manifest.nativeSceneApi.resourceRef !==
        bootstrap.nativeSceneApiRef ||
      finalizedBundle.manifest.nativeSceneProfile.resourceRef !==
        bootstrap.nativeSceneProfileRef
    ) return fail();

    const ledger = createBabylonNativeReplayAssetLedgerV1(assets.assetResolver);
    let replayIndex = 0;
    const evidenceByReplay:
      BabylonNativeBlockCheckedEpochEvidenceV1[][] = [];
    const candidateFactory: BabylonNativeSceneCandidateFactoryV1 = Object.freeze({
      async createCandidate() {
        if (replayIndex > 1) return fail();
        ledger.beginReplay(replayIndex as 0 | 1);
        replayIndex += 1;
        const lease = await input.candidateFactory.createCandidate();
        const evidence: BabylonNativeBlockCheckedEpochEvidenceV1[] = [];
        evidenceByReplay.push(evidence);
        return Object.freeze({
          engine: lease.engine,
          scene: lease.scene,
          async dispose() {
            evidence.push(
              ...takeBabylonNativeBlockCheckedEpochEvidenceV1(lease.scene),
            );
            await lease.dispose();
          },
        });
      },
    });
    const replay = await replayBabylonNativeSceneModuleV1({
      candidateFactory,
      bootstrap,
      module: bundled.module,
      assets: ledger.assetResolver,
      budget: {
        maximumStaticColliderCount: resourceBudget.maximumColliders,
        maximumStaticColliderVertexCount: resourceBudget.maximumVertices,
        maximumStaticColliderTriangleCount: resourceBudget.maximumTriangles,
      },
    });
    const requiresBlockEvidence = bootstrap.nativeSceneProfileRef ===
      BABYLON_NATIVE_BLOCK_PROFILE_REF_V1;
    if (
      replay.checkResult.outcome !== "passed" ||
      !("contribution" in replay) ||
      replayIndex !== 2 ||
      evidenceByReplay.length !== 2 ||
      evidenceByReplay[0]!.length !== (requiresBlockEvidence ? 1 : 0) ||
      evidenceByReplay[1]!.length !== (requiresBlockEvidence ? 1 : 0)
    ) return fail();
    const checkResult = parseNativeSceneCheckResultV1(replay.checkResult);
    const contribution = parseBabylonNativeSceneContributionV1(
      replay.contribution,
    );
    const firstBlockEvidence = evidenceByReplay[0]![0];
    const secondBlockEvidence = evidenceByReplay[1]![0];
    if (
      checkResult.checkedInput.kind !== "native-scene-module" ||
      checkResult.checkedInput.sceneModuleRef !== bootstrap.sceneModuleRef ||
      contribution.sceneModuleRef !== bootstrap.sceneModuleRef ||
      contribution.profileSettlement.profileRef !==
        bootstrap.nativeSceneProfileRef ||
      replay.contributionHash !==
        hashBabylonNativeSceneContributionV1(contribution) ||
      (requiresBlockEvidence && (
        isNil(firstBlockEvidence) ||
        isNil(secondBlockEvidence) ||
        !isEqual(firstBlockEvidence, secondBlockEvidence) ||
        hashBabylonNativeBlockCheckedLayoutInventoryV1(
          firstBlockEvidence.checkedLayout,
        ) !== hashBabylonNativeBlockCheckedLayoutInventoryV1(
          secondBlockEvidence.checkedLayout,
        ) ||
        contribution.profileSettlement.kind !== "host-snapshot" ||
        firstBlockEvidence.profileInventoryHash !==
          contribution.profileSettlement.profileInventoryHash
      ))
    ) return fail();
    const assetReplayLedgers = ledger.snapshot();
    const expectedAssetRefs = assets.assetLock.entries.map((entry) =>
      entry.assetResourceRef);
    if (
      !isEqual(assetReplayLedgers[0], assetReplayLedgers[1]) ||
      !isEqual(assetReplayLedgers[0], expectedAssetRefs)
    ) return fail();
    assertContributionWorldFacts(
      contribution,
      bootstrap,
      worldBounds,
      resourceBudget,
    );
    const registryLock = worldResourceLockEntriesV1(input.registryLock);
    const expectedLock = expectedRegistryLock(
      input,
      runtime,
      bundled.bundleArtifact.sourceGraphHash,
      contribution,
      assets.assetLock.entries,
    );
    if (!isEqual(registryLock, expectedLock)) return fail();

    const entryFile = bundled.bundleArtifact.files.find((file) =>
      file.path === bundled.bundleArtifact.entryPath);
    if (isNil(entryFile)) return fail();
    const frozenInput = deepFreezePlainData({
      shared: input.shared,
      packageId: input.packageId,
      worldId: input.worldId,
      worldBounds,
      resourceBudget,
      nativeSceneBootstrap: bootstrap,
      sceneModuleBundleManifest: finalizedBundle.manifest,
      sceneModuleBundleBytes: Uint8Array.from(entryFile.bytes),
      dependencyLock: dependency.dependencyLock,
      assetLock: assets.assetLock,
      sceneAuthoringRouteDecision: route,
      sceneAuthoringAttempt: attempt,
      sceneAuthoringAttemptResultRef: input.sceneAuthoringAttemptResultRef,
      sceneAuthoringAttemptResult: attemptResult,
      nativeSceneCheckResult: checkResult,
      nativeSceneContribution: contribution,
      gameplayBootstrap: gameplay,
      worldRuntimeBootstrap: runtime,
      registryLock,
      resourceArtifacts: assets.resourceArtifacts,
    }) as FrozenBabylonNativeWorldPackageBuildInputV1;
    return Object.freeze({
      frozenInput,
      assetReplayLedgers,
      sceneModuleBundleManifestHash: finalizedBundle.manifestHash,
      dependencyLockHash: dependency.dependencyLockHash,
      assetLockHash: assets.assetLockHash,
      ...(isNil(firstBlockEvidence)
        ? {}
        : { blockCheckedEpochEvidence: firstBlockEvidence }),
    });
  } catch (error) {
    if (error instanceof BabylonNativePackageInputErrorV1) throw error;
    return fail();
  }
}
