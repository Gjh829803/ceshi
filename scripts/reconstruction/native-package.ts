import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { parseGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import {
  BABYLON_NATIVE_BLOCK_AUTHORING_PROFILE_REF_V1,
  BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1,
  parseNativeBlockAuthoringManifestV1,
  parseNativeBlockVisualResourceListV1,
} from "@whitebox-world/native-babylon-block-profile";
import type { BabylonNativeBlockGroundAnalysisReportV1 } from
  "@whitebox-world/native-babylon-block-profile/host";
import {
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashBabylonNativeSceneBootstrapV1,
  parseBabylonNativeSceneBootstrapV1,
  parseWorldRuntimeBootstrapV1,
  worldResourceLockEntriesV1,
  type BabylonNativeSceneResolvedProfileV1,
} from "@whitebox-world/runtime-contracts";
import {
  assertNativeBlockGenerationRequestMatchesAttemptV1,
  hashNativeBlockGenerationRequestV1,
  hashSceneAuthoringAttemptV1,
  parseNativeBlockGenerationReceiptV1,
  parseNativeBlockGenerationRequestV1,
  parseSceneAuthoringAttemptResultV1,
  parseSceneAuthoringAttemptV1,
  parseSceneAuthoringRouteDecisionV1,
  type SceneAuthoringAttemptResultV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  hashWorldReconstructionCaseV1,
  parseWorldReconstructionCaseV1,
  type WorldReconstructionDiagnosticV1,
} from "@whitebox-world/validation";
import {
  BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
  hashWorldPackageWorldBoundsV1,
  parseWorldPackageWorldBoundsV1,
  verifyWorldPackageDirectoryV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { hashWorldBuildIdentityV1 } from "@whitebox-world/world-identity";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { isEqual, isNil } from "lodash-es";

import {
  buildTrustedBabylonNativeWorldPackageFromPreparedV1,
} from "../native-scene/build-trusted-world-package.js";
import {
  buildAndLoadBabylonNativeSceneModuleV1,
  hashAdmittedBabylonNativeSceneSourceGraphV1,
} from "../native-scene/module-bundle.js";
import {
  BabylonNativePackageInputErrorV1,
  prepareFrozenBabylonNativeWorldPackageBuildInputV1,
} from "../native-scene/native-package-input.js";
import {
  checkBabylonNativeSceneWorldDirectoryV1,
} from "../native-scene/native-scene-check.js";
import { explainNativeSceneCheckResultV1 } from "../native-scene/explain.js";
import { admitBabylonNativeSourceGraphV1 } from
  "../native-scene/source-admission.js";
import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import {
  parseNativeBlockGenerationHostClosureV1,
  parseResolvedNativeBlockGenerationResourceV1,
} from "./generation-request.js";
import { analyzeProductionNativeBlockGroundV1 } from
  "./native-ground-analysis-admission.js";
import { createNativeCheckRepairDiagnosticsV1 } from
  "./native-check-diagnostics.js";

const SOURCE_FILES = Object.freeze([
  "native-block-authoring.json",
  "native-resources.json",
  "scene.ts",
] as const);

const NATIVE_BLOCK_PRODUCTION_FORBIDDEN_LIGHT_IMPORTS_V1 = new Set([
  "@babylonjs/core/Lights/directionalLight.js",
  "@babylonjs/core/Lights/hemisphericLight.js",
  "@babylonjs/core/Lights/pointLight.js",
]);
const STABLE_NATIVE_BLOCK_CHECK_DIAGNOSTIC_CODES_V1 = new Set<string>(
  BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1,
);
const NATIVE_BLOCK_PROFILE_CHECK_REJECTED_CODE =
  "WORLDKIT_NATIVE_BLOCK_PROFILE_CHECK_REJECTED";

function trustedNativeBlockCheckDiagnosticCodes(
  checkResult: Awaited<ReturnType<
    typeof checkBabylonNativeSceneWorldDirectoryV1
  >>,
): readonly string[] {
  const codes = checkResult.diagnostics.flatMap((diagnostic) => {
    if (STABLE_NATIVE_BLOCK_CHECK_DIAGNOSTIC_CODES_V1.has(diagnostic.code)) {
      return [diagnostic.code];
    }
    if (diagnostic.code !== NATIVE_BLOCK_PROFILE_CHECK_REJECTED_CODE) {
      return [];
    }
    return [
      diagnostic.code,
      ...BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1.filter((code) =>
        diagnostic.message.includes(code)
      ),
    ];
  });
  return Object.freeze([...new Set(codes)].sort());
}

export function assertNativeBlockProductionSourceImportsV1(
  externalImportSpecifiers: readonly string[],
): void {
  const forbidden = externalImportSpecifiers.filter((specifier) =>
    NATIVE_BLOCK_PRODUCTION_FORBIDDEN_LIGHT_IMPORTS_V1.has(specifier));
  if (forbidden.length > 0) {
    return fail(
      `production-native-light-import-forbidden:${forbidden.sort().join(",")}`,
    );
  }
}

export interface PackageNativeBlockAttemptInputV1 {
  readonly repositoryRoot: string;
  readonly attemptDirectoryPath: string;
  readonly casePath: string;
  readonly outputDirectoryPath: string;
}

export interface PackagedNativeBlockAttemptV1 {
  readonly outcome: "completed";
  readonly checkResult:
    VerifiedBabylonNativeWorldPackageDirectoryV1["nativeSceneCheckResult"];
  readonly sceneAuthoringAttemptResult: Extract<
    SceneAuthoringAttemptResultV1,
    { readonly outcome: "completed" }
  >;
  readonly verifiedWorldPackage: VerifiedBabylonNativeWorldPackageDirectoryV1;
  readonly worldPackageRef:
    VerifiedBabylonNativeWorldPackageDirectoryV1["receipt"]["worldPackageRef"];
  readonly worldPackageRootHash: Sha256HashV1;
  readonly worldBuildIdentityHash: Sha256HashV1;
  readonly buildReceiptHash: Sha256HashV1;
  readonly groundAnalysisReport: BabylonNativeBlockGroundAnalysisReportV1;
  readonly groundAnalysisReportHash: Sha256HashV1;
  readonly groundAnalysisReportPath: string;
  readonly outputDirectoryPath: string;
  readonly diagnostics: readonly string[];
}

export interface NativeBlockGroundAnalysisRejectionV1 {
  readonly kind: "ground-analysis-rejected";
  readonly sceneAuthoringAttemptResult: Extract<
    SceneAuthoringAttemptResultV1,
    { readonly outcome: "completed" }
  >;
  readonly groundAnalysisReport: BabylonNativeBlockGroundAnalysisReportV1;
  readonly groundAnalysisReportHash: Sha256HashV1;
  readonly groundAnalysisReportPath: string;
  readonly repairDiagnostics: readonly WorldReconstructionDiagnosticV1[];
}

export interface NativeBlockCheckRejectionV1 {
  readonly kind: "native-check-rejected";
  readonly sceneAuthoringAttemptResult: Extract<
    SceneAuthoringAttemptResultV1,
    { readonly outcome: "completed" }
  >;
  readonly nativeCheckResultHash: Sha256HashV1;
  readonly nativeCheckResultPath: string;
  readonly repairDiagnostics: readonly WorldReconstructionDiagnosticV1[];
}

export class NativeBlockPackageErrorV1 extends Error {
  readonly code = "WORLDKIT_NATIVE_BLOCK_PACKAGE_FAILED";
  readonly diagnostics: readonly string[];
  readonly groundAnalysisRejection?: NativeBlockGroundAnalysisRejectionV1;
  readonly nativeCheckRejection?: NativeBlockCheckRejectionV1;

  constructor(
    diagnostics: readonly string[],
    cause?: unknown,
    groundAnalysisRejection?: NativeBlockGroundAnalysisRejectionV1,
    nativeCheckRejection?: NativeBlockCheckRejectionV1,
  ) {
    super("WORLDKIT_NATIVE_BLOCK_PACKAGE_FAILED", { cause });
    this.diagnostics = Object.freeze([...diagnostics].sort());
    if (!isNil(groundAnalysisRejection)) {
      this.groundAnalysisRejection = Object.freeze({
        ...groundAnalysisRejection,
        repairDiagnostics: Object.freeze([
          ...groundAnalysisRejection.repairDiagnostics,
        ]),
      });
    }
    if (!isNil(nativeCheckRejection)) {
      this.nativeCheckRejection = Object.freeze({
        ...nativeCheckRejection,
        repairDiagnostics: Object.freeze([
          ...nativeCheckRejection.repairDiagnostics,
        ]),
      });
    }
  }
}

function fail(diagnostic: string, cause?: unknown): never {
  throw new NativeBlockPackageErrorV1([diagnostic], cause);
}

function canonicalAbsolute(value: string, name: string): string {
  if (!path.isAbsolute(value) || path.normalize(value) !== value) {
    return fail(`${name}-invalid`);
  }
  return value;
}

async function readFileNoFollow(root: string, relativePath: string): Promise<Uint8Array> {
  const absolutePath = path.join(root, ...relativePath.split("/"));
  const info = await lstat(absolutePath);
  if (info.isSymbolicLink() || !info.isFile()) return fail("input-file-invalid");
  const resolved = await realpath(absolutePath);
  if (resolved !== absolutePath || path.relative(root, resolved).startsWith("..")) {
    return fail("input-path-escaped");
  }
  return new Uint8Array(await readFile(absolutePath));
}

async function readAbsoluteFileNoFollow(
  absolutePath: string,
  diagnostic: string,
): Promise<Uint8Array> {
  const info = await lstat(absolutePath);
  if (info.isSymbolicLink() || !info.isFile()) return fail(diagnostic);
  if (await realpath(absolutePath) !== absolutePath) return fail(diagnostic);
  return new Uint8Array(await readFile(absolutePath));
}

function json(bytes: Uint8Array, diagnostic: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    return fail(diagnostic, error);
  }
}

function contentHash(bytes: Uint8Array): Sha256HashV1 {
  return sha256Bytes(bytes) as Sha256HashV1;
}

function candidateFactory() {
  return Object.freeze({
    createCandidate() {
      const engine = new NullEngine({
        renderWidth: 64,
        renderHeight: 64,
        textureSize: 32,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      });
      const scene = new Scene(engine);
      return Object.freeze({
        engine,
        scene,
        dispose() {
          scene.dispose();
          engine.dispose();
        },
      });
    },
  });
}

async function writeCanonicalJsonFresh(
  outputPath: string,
  value: unknown,
): Promise<void> {
  const stagingPath = `${outputPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(
      stagingPath,
      `${stringifyCanonicalJson(value)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    await rename(stagingPath, outputPath);
  } finally {
    await rm(stagingPath, { force: true });
  }
}

async function writeTextFresh(outputPath: string, value: string): Promise<void> {
  const stagingPath = `${outputPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(stagingPath, value, { flag: "wx", mode: 0o600 });
    await rename(stagingPath, outputPath);
  } finally {
    await rm(stagingPath, { force: true });
  }
}

export async function packageNativeBlockAttemptV1(
  input: PackageNativeBlockAttemptInputV1,
): Promise<PackagedNativeBlockAttemptV1> {
  const repositoryRoot = canonicalAbsolute(input.repositoryRoot, "repository-root");
  const attemptDirectoryPath = canonicalAbsolute(
    input.attemptDirectoryPath,
    "attempt-directory",
  );
  const casePath = canonicalAbsolute(input.casePath, "case-path");
  const outputDirectoryPath = canonicalAbsolute(
    input.outputDirectoryPath,
    "output-directory",
  );
  if (outputDirectoryPath !== path.join(attemptDirectoryPath, "world-package")) {
    return fail("output-location-invalid");
  }
  if (await realpath(attemptDirectoryPath) !== attemptDirectoryPath) {
    return fail("attempt-directory-invalid");
  }
  const sourceDirectoryPath = path.join(attemptDirectoryPath, "source");
  if (await realpath(sourceDirectoryPath) !== sourceDirectoryPath) {
    return fail("source-directory-invalid");
  }
  const sourceEntries = (await readdir(sourceDirectoryPath)).sort();
  if (!isEqual(sourceEntries, SOURCE_FILES)) return fail("source-inventory-invalid");

  const [
    caseBytes,
    routeBytes,
    requestBytes,
    attemptBytes,
    generationReceiptBytes,
    bootstrapBytes,
    gameplayBytes,
    runtimeBytes,
    boundsBytes,
    hostClosureBytes,
    registryLockBytes,
    nativeSceneApiBytes,
    nativeSceneProfileBytes,
    blockProfileBytes,
    authoringManifestBytes,
    resourcesBytes,
    sceneBytes,
  ] = await Promise.all([
    readAbsoluteFileNoFollow(casePath, "case-path-invalid"),
    readFileNoFollow(attemptDirectoryPath, "scene-authoring-route-decision.json"),
    readFileNoFollow(attemptDirectoryPath, "generation-request.json"),
    readFileNoFollow(attemptDirectoryPath, "attempt.json"),
    readFileNoFollow(attemptDirectoryPath, "generation-receipt.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/native-scene.bootstrap.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/gameplay-bootstrap.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/world-runtime-bootstrap.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/world-bounds.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/host-closure.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/registry-lock.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/native-scene-api.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/native-scene-profile.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/block-profile.json"),
    readFileNoFollow(sourceDirectoryPath, "native-block-authoring.json"),
    readFileNoFollow(sourceDirectoryPath, "native-resources.json"),
    readFileNoFollow(sourceDirectoryPath, "scene.ts"),
  ]);

  const reconstructionCase = parseWorldReconstructionCaseV1(
    json(caseBytes, "case-invalid"),
  );
  const route = parseSceneAuthoringRouteDecisionV1(
    json(routeBytes, "route-invalid"),
  );
  const generationRequest = parseNativeBlockGenerationRequestV1(
    json(requestBytes, "generation-request-invalid"),
  );
  const attempt = parseSceneAuthoringAttemptV1(
    json(attemptBytes, "attempt-invalid"),
  );
  const generationReceipt = parseNativeBlockGenerationReceiptV1(
    json(generationReceiptBytes, "generation-receipt-invalid"),
  );
  const bootstrap = parseBabylonNativeSceneBootstrapV1(
    json(bootstrapBytes, "bootstrap-invalid"),
  );
  const gameplay = parseGameplayBootstrapV1(
    json(gameplayBytes, "gameplay-invalid"),
  );
  const runtime = parseWorldRuntimeBootstrapV1(
    json(runtimeBytes, "runtime-invalid"),
  );
  const bounds = parseWorldPackageWorldBoundsV1(
    json(boundsBytes, "world-bounds-invalid"),
  );
  const hostClosure = parseNativeBlockGenerationHostClosureV1(
    json(hostClosureBytes, "host-closure-invalid"),
  );
  const registryOwner = worldResourceLockEntriesV1(
    json(registryLockBytes, "registry-lock-invalid") as never,
  );
  const authoringManifest = parseNativeBlockAuthoringManifestV1(
    json(authoringManifestBytes, "authoring-manifest-invalid"),
  );
  const visualResources = parseNativeBlockVisualResourceListV1(
    json(resourcesBytes, "native-resources-invalid"),
  );
  if (visualResources.resourceRefs.length !== 0) {
    return fail("native-visual-resource-unresolved");
  }
  if (
    generationReceipt.outcome !== "completed" ||
    generationReceipt.generationRequestRef !== "generation-request.json" ||
    generationReceipt.generationRequestHash !==
      hashNativeBlockGenerationRequestV1(generationRequest)
  ) return fail("generation-receipt-stale");
  assertNativeBlockGenerationRequestMatchesAttemptV1(
    "generation-request.json",
    generationRequest,
    attempt,
  );
  const sourceBytesByPath = new Map([
    ["native-block-authoring.json", authoringManifestBytes],
    ["native-resources.json", resourcesBytes],
    ["scene.ts", sceneBytes],
  ] as const);
  if (
    generationReceipt.outputs.length !== SOURCE_FILES.length ||
    generationReceipt.outputs.some((output) => {
      const bytes = sourceBytesByPath.get(output.path as typeof SOURCE_FILES[number]);
      return isNil(bytes) ||
        output.contentHash !== contentHash(bytes) ||
        output.sizeBytes !== bytes.byteLength;
    })
  ) return fail("generation-output-stale");
  const nativeSceneApi = parseResolvedNativeBlockGenerationResourceV1(
    nativeSceneApiBytes,
    "native-scene-api",
    generationRequest.nativeSceneApiRef,
  );
  const nativeSceneProfile = parseResolvedNativeBlockGenerationResourceV1(
    nativeSceneProfileBytes,
    "native-scene-profile",
    generationRequest.nativeSceneProfileRef,
  );
  const blockProfile = parseResolvedNativeBlockGenerationResourceV1(
    blockProfileBytes,
    "native-block-profile",
    generationRequest.blockProfileRef,
  );
  if (
    blockProfile.resourceRef !== BABYLON_NATIVE_BLOCK_AUTHORING_PROFILE_REF_V1 ||
    authoringManifest.blockProfileRef !== blockProfile.resourceRef ||
    generationRequest.bootstrapInputHash !==
      hashBabylonNativeSceneBootstrapV1(bootstrap) ||
    hostClosure.gameplayBootstrapRef !== gameplay.resourceRef ||
    hostClosure.gameplayBootstrapHash !== gameplay.contentHash ||
    hostClosure.worldRuntimeBootstrapHash !== runtime.contentHash ||
    hostClosure.worldBoundsHash !== hashWorldPackageWorldBoundsV1(bounds) ||
    hostClosure.initialControlledEntityId !== runtime.initialControlledEntityId
  ) return fail("host-identity-closure-mismatch");

  const parentDirectoryPath = path.dirname(outputDirectoryPath);
  await mkdir(parentDirectoryPath, { recursive: true });
  const checkDirectoryPath = await mkdtemp(
    path.join(parentDirectoryPath, ".native-block-check-"),
  );
  try {
    await Promise.all([
      writeFile(path.join(checkDirectoryPath, "native-scene.bootstrap.json"), bootstrapBytes, { flag: "wx" }),
      ...SOURCE_FILES.map((name) => writeFile(
        path.join(checkDirectoryPath, name),
        sourceBytesByPath.get(name)!,
        { flag: "wx" },
      )),
    ]);
    // The Block production profile is stricter than generic Native authoring:
    // reject Module-owned lights before Candidate allocation so Runtime remains
    // the sole neutral inspection-light owner.
    const admitted = await admitBabylonNativeSourceGraphV1(checkDirectoryPath);
    if (admitted.outcome !== "passed") return fail("source-admission-stale");
    assertNativeBlockProductionSourceImportsV1(
      admitted.sourceGraph.externalImportSpecifiers,
    );
    const formalCheck = await checkBabylonNativeSceneWorldDirectoryV1(
      checkDirectoryPath,
    );
    const nativeCheckResultPath = path.join(
      attemptDirectoryPath,
      "native-check-result.json",
    );
    await writeCanonicalJsonFresh(nativeCheckResultPath, formalCheck);
    const authoredSourceHash =
      await hashAdmittedBabylonNativeSceneSourceGraphV1(admitted.sourceGraph);
    const sceneAuthoringAttemptRef =
      `worldkit://scene-authoring-attempt/${attempt.id}@1`;
    const sceneAuthoringAttemptResultRef =
      `worldkit://scene-authoring-attempt-result/${attempt.id}@1`;
    const attemptResult = parseSceneAuthoringAttemptResultV1({
      kind: "scene-authoring-attempt-result",
      schemaVersion: 1,
      id: `${attempt.id}.result`,
      sceneAuthoringAttemptRef,
      sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(attempt),
      outcome: "completed",
      authoredSourceRef: bootstrap.sceneModuleRef,
      authoredSourceHash,
      evidenceRefs: [
        `worldkit://native-scene-check-result/${bootstrap.id}@1`,
      ],
    });
    if (attemptResult.outcome !== "completed") {
      return fail("attempt-result-invalid");
    }
    if (formalCheck.outcome !== "passed") {
      const repairDiagnostics = createNativeCheckRepairDiagnosticsV1({
        reconstructionCase,
        checkResult: formalCheck,
        evidenceRef: `worldkit://native-scene-check-result/${formalCheck.id}@1`,
      });
      await Promise.all([
        writeTextFresh(
          path.join(attemptDirectoryPath, "native-explain.txt"),
          explainNativeSceneCheckResultV1(formalCheck),
        ),
        writeCanonicalJsonFresh(
          path.join(attemptDirectoryPath, "attempt-result.json"),
          attemptResult,
        ),
      ]);
      throw new NativeBlockPackageErrorV1(
        [
          "native-check-rejected",
          ...trustedNativeBlockCheckDiagnosticCodes(formalCheck),
        ],
        undefined,
        undefined,
        Object.freeze({
          kind: "native-check-rejected" as const,
          sceneAuthoringAttemptResult: attemptResult,
          nativeCheckResultHash:
            sha256CanonicalJson(formalCheck) as Sha256HashV1,
          nativeCheckResultPath,
          repairDiagnostics,
        }),
      );
    }
    const bundled = await buildAndLoadBabylonNativeSceneModuleV1(
      admitted.sourceGraph,
    );
    if (
      bundled.outcome !== "passed" ||
      bundled.bundleArtifact.sourceGraphHash !== authoredSourceHash
    ) return fail("source-bundle-stale");
    const runtimeOwnerEntries = runtime.runtimeResourceLockEntries;
    if (runtimeOwnerEntries.some((entry) =>
      !registryOwner.some((ownerEntry) => isEqual(ownerEntry, entry)))) {
      return fail("registry-runtime-closure-mismatch");
    }
    const registryLock = worldResourceLockEntriesV1([
      ...runtimeOwnerEntries,
      {
        resourceKind: "world-runtime-bootstrap",
        resourceRef: hostClosure.worldRuntimeBootstrapRef,
        resolvedVersion: hostClosure.worldRuntimeBootstrapResolvedVersion,
        contentHash: runtime.contentHash,
      },
      {
        resourceKind: "native-scene",
        resourceRef: bootstrap.sceneModuleRef,
        resolvedVersion: bootstrap.sceneModuleRef.split("@").at(-1)!,
        contentHash: bundled.bundleArtifact.sourceGraphHash,
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
      ...registryOwner.filter(({ resourceKind }) =>
        resourceKind === "traversal-surface-profile"),
    ]);
    const profile = (resolution: typeof nativeSceneApi): BabylonNativeSceneResolvedProfileV1 =>
      Object.freeze({
        resourceRef: resolution.resourceRef,
        resolvedVersion: resolution.resolvedVersion,
        contentHash: resolution.contentHash,
      });
    const prepared = await prepareFrozenBabylonNativeWorldPackageBuildInputV1({
      repositoryRoot,
      worldDirectoryPath: checkDirectoryPath,
      candidateFactory: candidateFactory(),
      shared: {
        title: reconstructionCase.id,
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
          text: `Project-owned ${reconstructionCase.id} Native whitebox source. Redistribution allowed.\n`,
        }],
        noticeText: `${reconstructionCase.id}\nSee LICENSES/project-owned.txt.\n`,
      },
      packageId: `${reconstructionCase.id}.native.package`,
      worldId: reconstructionCase.id,
      worldBounds: bounds,
      resourceBudget: {
        maximumVertices: generationRequest.budgets.maximumStaticColliderVertexCount,
        maximumTriangles: generationRequest.budgets.maximumStaticColliderTriangleCount,
        maximumColliders: generationRequest.budgets.maximumStaticColliderCount,
      },
      nativeSceneBootstrap: bootstrap,
      nativeSceneBootstrapInputRef: generationRequest.bootstrapInputRef,
      generationRequestRef: "generation-request.json",
      generationRequestHash: hashNativeBlockGenerationRequestV1(generationRequest),
      nativeSceneApi: profile(nativeSceneApi),
      nativeSceneProfile: profile(nativeSceneProfile),
      publishedAssets: [],
      sceneAuthoringRouteDecisionRef: attempt.sceneAuthoringRouteDecisionRef,
      sceneAuthoringRouteDecision: route,
      sceneAuthoringAttemptRef,
      sceneAuthoringAttempt: attempt,
      sceneAuthoringAttemptResultRef,
      sceneAuthoringAttemptResult: attemptResult,
      gameplayBootstrap: gameplay,
      worldRuntimeBootstrapRef: hostClosure.worldRuntimeBootstrapRef,
      worldRuntimeBootstrap: runtime,
      registryLock,
      nativeBlockAuthoring: {
        reconstructionCase,
        authoringManifest,
      },
    });
    const directory = buildTrustedBabylonNativeWorldPackageFromPreparedV1(
      prepared,
    );
    const verified = verifyWorldPackageDirectoryV1(directory);
    if (verified.kind !== "babylon-native-scene") {
      return fail("world-package-kind-mismatch");
    }
    const checkedEpochEvidence = prepared.nativeBlockCheckedEpochEvidence;
    const materializerMetadata = verified.nativeBlockMaterializerMetadata;
    if (isNil(checkedEpochEvidence) || isNil(materializerMetadata)) {
      return fail("native-block-ground-evidence-missing");
    }
    const groundModelEvidenceRef =
      `artifact://world-reconstruction-case/${reconstructionCase.id}/${attempt.id}/logical-ground-model.json`;
    const analyzedGround = analyzeProductionNativeBlockGroundV1({
      reconstructionCase,
      worldRuntimeBootstrap: verified.worldRuntimeBootstrap,
      registryLock: verified.registryLock,
      contribution: verified.nativeSceneContribution,
      worldBounds: verified.manifest.worldBounds,
      checkedEpochEvidence,
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      maximumBlockCount: generationRequest.budgets.maximumBlockCount,
      groundModelEvidenceRef,
    });
    const groundAnalysisReportPath = path.join(
      attemptDirectoryPath,
      "ground-analysis-report.json",
    );
    await Promise.all([
      writeCanonicalJsonFresh(
        path.join(attemptDirectoryPath, "logical-ground-model.json"),
        checkedEpochEvidence.logicalGroundModel,
      ),
      writeCanonicalJsonFresh(
        groundAnalysisReportPath,
        analyzedGround.report,
      ),
      writeCanonicalJsonFresh(
        path.join(attemptDirectoryPath, "ground-analysis-diagnostics.json"),
        analyzedGround.repairDiagnostics,
      ),
    ]);
    if (analyzedGround.report.admissionOutcome !== "passed") {
      await Promise.all([
        writeTextFresh(
          path.join(attemptDirectoryPath, "native-explain.txt"),
          explainNativeSceneCheckResultV1(formalCheck),
        ),
        writeCanonicalJsonFresh(
          path.join(attemptDirectoryPath, "attempt-result.json"),
          attemptResult,
        ),
      ]);
      throw new NativeBlockPackageErrorV1(
        [
          "native-ground-analysis-rejected",
          ...new Set(analyzedGround.repairDiagnostics.map(({ code }) => code)),
        ],
        undefined,
        Object.freeze({
          kind: "ground-analysis-rejected" as const,
          sceneAuthoringAttemptResult: attemptResult,
          groundAnalysisReport: analyzedGround.report,
          groundAnalysisReportHash:
            sha256CanonicalJson(analyzedGround.report) as Sha256HashV1,
          groundAnalysisReportPath,
          repairDiagnostics: analyzedGround.repairDiagnostics,
        }),
      );
    }
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath,
      directory,
    });
    // attempt-result.json is the commit marker for the complete verifier-owned
    // Attempt output pair, so publish the deterministic explanation first.
    await writeTextFresh(
      path.join(attemptDirectoryPath, "native-explain.txt"),
      explainNativeSceneCheckResultV1(formalCheck),
    );
    await writeCanonicalJsonFresh(
      path.join(attemptDirectoryPath, "attempt-result.json"),
      attemptResult,
    );
    const receipt = verified.receipt;
    return Object.freeze({
      outcome: "completed",
      checkResult: verified.nativeSceneCheckResult,
      sceneAuthoringAttemptResult: attemptResult,
      verifiedWorldPackage: verified,
      worldPackageRef: receipt.worldPackageRef,
      worldPackageRootHash: receipt.worldPackageRootHash,
      worldBuildIdentityHash: hashWorldBuildIdentityV1(
        receipt.worldBuildIdentity,
      ),
      buildReceiptHash: sha256CanonicalJson(receipt) as Sha256HashV1,
      groundAnalysisReport: analyzedGround.report,
      groundAnalysisReportHash:
        sha256CanonicalJson(analyzedGround.report) as Sha256HashV1,
      groundAnalysisReportPath,
      outputDirectoryPath,
      diagnostics: Object.freeze([]),
    });
  } catch (error) {
    if (error instanceof NativeBlockPackageErrorV1) throw error;
    if (error instanceof BabylonNativePackageInputErrorV1) {
      return fail(error.diagnostic, error);
    }
    return fail("native-package-internal-failed", error);
  } finally {
    await rm(checkDirectoryPath, { recursive: true, force: true });
  }
}
