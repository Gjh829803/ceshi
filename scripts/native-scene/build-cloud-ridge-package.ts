import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import {
  sha256Bytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
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
import {
  BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
  assembleWorldPackageDirectoryV1,
  assertWorldPackageBuildReceiptV1,
  equalWorldPackageDirectoryBytesV1,
  type WorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { resolveTraversalSurfaceProfileV1 } from "@whitebox-world/traversal";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLOUD_RIDGE_GAMEPLAY_BOOTSTRAP_V1,
  CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1,
  CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1,
} from "../../apps/native-scene-playground/src/native-bootstrap.js";
import { buildTrustedBabylonNativeWorldPackageV1 } from
  "./build-trusted-world-package.js";
import { admitBabylonNativeSourceGraphV1 } from "./source-admission.js";
import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const WORLD_DIRECTORY_PATH = path.join(
  REPOSITORY_ROOT,
  "apps/native-scene-playground/src",
);
const OUTPUT_DIRECTORY_PATH = path.join(
  REPOSITORY_ROOT,
  "apps/playground/public/world-packages/cloud-ridge",
);
const HASH_A = sha256CanonicalJson({ id: "cloud-ridge.native-api", version: 1 }) as
  Sha256HashV1;
const HASH_B = sha256CanonicalJson({ id: "cloud-ridge.native-profile", version: 1 }) as
  Sha256HashV1;
const SCENE_BRIEF_HASH = sha256CanonicalJson({
  id: "cloud-ridge",
  composition: "foreground ridge to mountain gate",
}) as Sha256HashV1;
const TRUST_PROFILE_HASH = sha256CanonicalJson({
  id: "trusted-local",
  version: 1,
}) as Sha256HashV1;
const AUTHORING_PROFILE_REF =
  "worldkit://authoring-profile/native-local@1";

async function sourceGraphHash(): Promise<Sha256HashV1> {
  const admitted = await admitBabylonNativeSourceGraphV1(
    WORLD_DIRECTORY_PATH,
  );
  if (admitted.outcome !== "passed") {
    throw new Error(admitted.diagnostics.map(({ code }) => code).join(","));
  }
  const sourceInventory = await Promise.all(
    admitted.sourceGraph.workspace.sourcePaths.map(async (sourcePath) => ({
      path: sourcePath,
      contentHash: sha256Bytes(new TextEncoder().encode(
        await readFile(path.join(WORLD_DIRECTORY_PATH, sourcePath), "utf8"),
      )) as Sha256HashV1,
    })),
  );
  return sha256CanonicalJson(sourceInventory) as Sha256HashV1;
}

async function buildCloudRidgePackage(): Promise<WorldPackageDirectoryV1> {
  const authoredSourceHash = await sourceGraphHash();
  const routeDecision: SceneAuthoringRouteDecisionV1 = {
    kind: "scene-authoring-route-decision",
    schemaVersion: 1,
    id: "cloud-ridge-route",
    sceneBriefRef: "worldkit://scene-brief/cloud-ridge@1",
    sceneBriefHash: SCENE_BRIEF_HASH,
    trustProfileRef: "worldkit://trust-profile/trusted-local@1",
    trustProfileHash: TRUST_PROFILE_HASH,
    requiredCapabilityRefs: [],
    decision: {
      kind: "babylon-native",
      authoringProfileRef: AUTHORING_PROFILE_REF,
      compositionStrategy: "ground-first-with-locked-assets",
      reasonCodes: ["user-selected-supported-lane"],
    },
  };
  const nativeSceneBootstrapInputRef =
    "worldkit://native-bootstrap-input/cloud-ridge@1";
  const moduleGenerationInputRef =
    "worldkit://native-module-generation-input/cloud-ridge@1";
  const sceneAuthoringAttemptRef =
    "worldkit://scene-authoring-attempt/cloud-ridge@1";
  const attempt: SceneAuthoringAttemptV1 = {
    kind: "scene-authoring-attempt",
    schemaVersion: 1,
    id: "cloud-ridge-attempt",
    sceneAuthoringRouteDecisionRef:
      "worldkit://scene-authoring-route-decision/cloud-ridge@1",
    sceneAuthoringRouteDecisionHash:
      hashSceneAuthoringRouteDecisionV1(routeDecision),
    sceneBriefRef: routeDecision.sceneBriefRef,
    sceneBriefHash: routeDecision.sceneBriefHash,
    sourceInput: {
      kind: "babylon-native",
      bootstrapInputRef: nativeSceneBootstrapInputRef,
      bootstrapInputHash:
        hashBabylonNativeSceneBootstrapV1(CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1),
      moduleGenerationInputRef,
      moduleGenerationInputHash: authoredSourceHash,
    },
    selectedAssetResources: [],
    seed: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.seed,
    authoringProfileRef: AUTHORING_PROFILE_REF,
    acceptanceTargetRefs: [],
    requiredEvidenceProfileRefs: [],
  };
  const attemptResult: SceneAuthoringAttemptResultV1 = {
    kind: "scene-authoring-attempt-result",
    schemaVersion: 1,
    id: "cloud-ridge-result",
    sceneAuthoringAttemptRef,
    sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(attempt),
    outcome: "completed",
    authoredSourceRef: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.sceneModuleRef,
    authoredSourceHash,
    evidenceRefs: [],
  };
  const nativeSceneApi = {
    resourceRef: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.nativeSceneApiRef,
    resolvedVersion: "1",
    contentHash: HASH_A,
  } as const;
  const nativeSceneProfile = {
    resourceRef: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.nativeSceneProfileRef,
    resolvedVersion: "1",
    contentHash: HASH_B,
  } as const;
  const worldRuntimeBootstrapRef =
    "worldkit://world-runtime-bootstrap/cloud-ridge@1";
  const traversalSurface = resolveTraversalSurfaceProfileV1(
    "worldkit://traversal-surface-profile/ground.static@1",
  );
  const registryLock = worldResourceLockEntriesV1([
    ...CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.runtimeResourceLockEntries,
    {
      resourceKind: "world-runtime-bootstrap",
      resourceRef: worldRuntimeBootstrapRef,
      resolvedVersion: "1",
      contentHash: CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.contentHash,
    },
    {
      resourceKind: "native-scene",
      resourceRef: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.sceneModuleRef,
      resolvedVersion: "1",
      contentHash: authoredSourceHash,
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
      resourceKind: "traversal-surface-profile",
      resourceRef: traversalSurface.resourceRef,
      resolvedVersion: traversalSurface.resolvedVersion,
      contentHash: traversalSurface.contentHash,
    },
  ]);
  return buildTrustedBabylonNativeWorldPackageV1({
    repositoryRoot: REPOSITORY_ROOT,
    worldDirectoryPath: WORLD_DIRECTORY_PATH,
    candidateFactory: {
      createCandidate() {
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
            scene.dispose();
            engine.dispose();
          },
        };
      },
    },
    shared: {
      title: "Cloud Ridge Native Whitebox",
      sdkVersion: "0.0.0",
      distributionPolicy: "internal-only",
      hostCompatibility: BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
      generatedResourceProvenance: {
        licenseDocumentId: "project-owned",
        licenseSpdxExpression: "LicenseRef-Project-Owned",
        redistributionPolicy: "allowed",
        author: "Agent Whitebox World SDK",
      },
      licenseDocuments: [{
        id: "project-owned",
        spdxLicenseExpression: "LicenseRef-Project-Owned",
        path: "LICENSES/project-owned.txt",
        text: "Project-owned Cloud Ridge whitebox source. Redistribution allowed.\n",
      }],
      noticeText: "Cloud Ridge Native Whitebox\nSee LICENSES/project-owned.txt.\n",
    },
    packageId: "cloud-ridge.native.package",
    worldId: "cloud-ridge",
    worldBounds: {
      centerMetersXZ: [0, -15],
      sizeMetersXZ: [180, 180],
      heightRangeMeters: [-40, 100],
    },
    resourceBudget: {
      maximumVertices: 256,
      maximumTriangles: 1_000,
      maximumColliders: 3,
    },
    nativeSceneBootstrap: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1,
    nativeSceneBootstrapInputRef,
    moduleGenerationInputRef,
    nativeSceneApi,
    nativeSceneProfile,
    publishedAssets: [],
    sceneAuthoringRouteDecisionRef:
      attempt.sceneAuthoringRouteDecisionRef,
    sceneAuthoringRouteDecision: routeDecision,
    sceneAuthoringAttemptRef,
    sceneAuthoringAttempt: attempt,
    sceneAuthoringAttemptResultRef:
      "worldkit://scene-authoring-attempt-result/cloud-ridge@1",
    sceneAuthoringAttemptResult: attemptResult,
    gameplayBootstrap: CLOUD_RIDGE_GAMEPLAY_BOOTSTRAP_V1,
    worldRuntimeBootstrapRef,
    worldRuntimeBootstrap: CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1,
    registryLock,
  });
}

async function readCheckedInPackage(): Promise<WorldPackageDirectoryV1> {
  const receipt = assertWorldPackageBuildReceiptV1(JSON.parse(await readFile(
    path.join(OUTPUT_DIRECTORY_PATH, "world-package-build-receipt.json"),
    "utf8",
  )));
  const files = await Promise.all(receipt.fileIntegrityEntries.map(
    async ({ path: packagePath, mediaType }) => ({
      path: packagePath,
      mediaType,
      bytes: new Uint8Array(await readFile(
        path.join(OUTPUT_DIRECTORY_PATH, ...packagePath.split("/")),
      )),
    }),
  ));
  return assembleWorldPackageDirectoryV1({ receipt, files });
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "--write" && mode !== "--check") {
    throw new Error("Usage: build-cloud-ridge-package.ts --write|--check");
  }
  const expected = await buildCloudRidgePackage();
  if (mode === "--check") {
    const actual = await readCheckedInPackage();
    if (!equalWorldPackageDirectoryBytesV1(actual, expected)) {
      throw new Error("CLOUD_RIDGE_WORLD_PACKAGE_STALE");
    }
  } else {
    await mkdir(path.dirname(OUTPUT_DIRECTORY_PATH), { recursive: true });
    await rm(OUTPUT_DIRECTORY_PATH, { recursive: true, force: true });
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath: OUTPUT_DIRECTORY_PATH,
      directory: expected,
    });
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode,
    worldPackageRef: expected.receipt.worldBuildIdentity.worldPackageRef,
  })}\n`);
}

await main();
