import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { BABYLON_NATIVE_BLOCK_DISPLAY_SCALE_RATIO_V1 } from
  "@whitebox-world/native-babylon-block-profile/shapes";
import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import {
  BABYLON_NATIVE_BLOCK_AUTHORING_PROFILE_REF_V1,
  BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1,
  parseNativeBlockAuthoringManifestV1,
  parseNativeBlockVisualResourceListV1,
} from "@whitebox-world/native-babylon-block-profile";
import type { BabylonNativeBlockGroundAnalysisReportV1 } from
  "@whitebox-world/native-babylon-block-profile/host";
import {
  createBabylonNativeBlockProfileInventoryIdentityFromMaterializedV1,
  type BabylonNativeBlockCheckedEpochEvidenceV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import {
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashBabylonNativeSceneBootstrapV1,
  admitBabylonNativeOpeningCameraV1,
  admitNativeBlockGroundExplorationV1,
  parseBabylonNativeSceneBootstrapV1,
  parseWorldRuntimeBootstrapV1,
  worldResourceLockEntriesV1,
  type BabylonNativeSpawnMarkerContributionV1,
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
  verifyWorldPackageDirectoryV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { hashWorldBuildIdentityV1 } from "@whitebox-world/world-identity";
import { parseNativeSceneWorldBoundsPolicyV1 } from "../native-scene/world-bounds-policy.js";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod,
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
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { isEqual, isNil } from "lodash-es";
import sharp from "sharp";

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
  parseResolvedNativeBlockGenerationResourceV1,
} from "./generation-request.js";
import { checkNativeSubjectHostedSelectionV1, parseNativeSubjectHostContextV1, resolveNativeSubjectAuthoringClosureV1 } from "./native-subject-host-context.js";
import {
  parseNativeBlockSubjectVisualReviewProxyV1,
} from "./native-block-subject-visual-review-proxy.js";
import { analyzeProductionNativeBlockGroundV1 } from
  "./native-ground-analysis-admission.js";
import {
  admitNativeBlockVisualIdentityBindingsV1,
  NATIVE_BLOCK_VISUAL_IDENTITY_BINDING_DIAGNOSTIC_CODE_V1,
  type NativeBlockVisualIdentityAdmissionRejectionV1,
} from "./native-block-visual-identity-admission.js";

const SOURCE_FILES = Object.freeze([
  "native-block-authoring.json",
  "native-resources.json",
  "scene.ts",
] as const);
const BUILDER_VISUAL_REVIEW_RENDERER_INPUT_REF =
  "inputs/builder-skill/scripts/render-visual-review.mjs";
const BUILDER_VISUAL_REVIEW_INPUTS = Object.freeze([
  Object.freeze({
    inputRef: "entry-whitebox-target.png",
    durablePath: "inputs/entry-whitebox-target.png",
  }),
  Object.freeze({
    inputRef: "world-plan.png",
    durablePath: "inputs/world-plan.png",
  }),
] as const);
const BUILDER_VISUAL_REVIEW_OUTPUTS = Object.freeze([
  Object.freeze({
    fileName: "builder-top-down-comparison.png",
    widthPixels: 1_544,
    heightPixels: 768,
  }),
  Object.freeze({
    fileName: "builder-entry-comparison.png",
    widthPixels: 1_928,
    heightPixels: 540,
  }),
] as const);
const execFileAsync = promisify(execFile);
const MAXIMUM_CAPTURED_LAYOUT_REPORT_BYTES = 64 * 1024 * 1024;

const NATIVE_BLOCK_PRODUCTION_IMPORT_SPECIFIERS_V1 = Object.freeze([
  "@whitebox-world/native-babylon",
  "@whitebox-world/native-babylon-block-profile",
] as const);
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
  const actual = [...externalImportSpecifiers].sort();
  const expected = [...NATIVE_BLOCK_PRODUCTION_IMPORT_SPECIFIERS_V1].sort();
  if (!isEqual(actual, expected)) {
    return fail(
      `production-native-import-set-invalid:${actual.join(",")}`,
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
  readonly visualIdentityAdmissionRejection?:
    NativeBlockVisualIdentityAdmissionRejectionV1;

  constructor(
    diagnostics: readonly string[],
    cause?: unknown,
    groundAnalysisRejection?: NativeBlockGroundAnalysisRejectionV1,
    nativeCheckRejection?: NativeBlockCheckRejectionV1,
    visualIdentityAdmissionRejection?:
      NativeBlockVisualIdentityAdmissionRejectionV1,
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
    if (!isNil(visualIdentityAdmissionRejection)) {
      this.visualIdentityAdmissionRejection = visualIdentityAdmissionRejection;
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

async function readVisualReviewFileNoFollow(
  root: string,
  relativePath: string,
  diagnostic: string,
  maximumBytes = Number.MAX_SAFE_INTEGER,
  maximumBytesDiagnostic = diagnostic,
): Promise<Uint8Array> {
  try {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const info = await lstat(absolutePath);
    if (info.isSymbolicLink() || !info.isFile()) return fail(diagnostic);
    if (info.size > maximumBytes) return fail(maximumBytesDiagnostic);
    const resolved = await realpath(absolutePath);
    if (
      resolved !== absolutePath ||
      path.relative(root, resolved).startsWith("..")
    ) {
      return fail(diagnostic);
    }
    const bytes = new Uint8Array(await readFile(absolutePath));
    if (bytes.byteLength > maximumBytes) return fail(maximumBytesDiagnostic);
    return bytes;
  } catch (error) {
    if (error instanceof NativeBlockPackageErrorV1) throw error;
    return fail(diagnostic, error);
  }
}

async function visualReviewFileSizeNoFollow(
  root: string,
  relativePath: string,
  diagnostic: string,
): Promise<number> {
  try {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const info = await lstat(absolutePath);
    if (info.isSymbolicLink() || !info.isFile()) return fail(diagnostic);
    const resolved = await realpath(absolutePath);
    if (
      resolved !== absolutePath ||
      path.relative(root, resolved).startsWith("..")
    ) return fail(diagnostic);
    return info.size;
  } catch (error) {
    if (error instanceof NativeBlockPackageErrorV1) throw error;
    return fail(diagnostic, error);
  }
}

interface DecodedVisualReviewPngV1 {
  readonly width: number;
  readonly height: number;
  readonly rgba: Buffer;
}

async function decodeVisualReviewPngV1(
  bytes: Uint8Array,
  expected: Readonly<{ widthPixels: number; heightPixels: number }>,
): Promise<DecodedVisualReviewPngV1> {
  try {
    const options = Object.freeze({
      failOn: "error" as const,
      limitInputPixels: expected.widthPixels * expected.heightPixels,
    });
    const metadata = await sharp(Buffer.from(bytes), options)
      .metadata();
    if (
      metadata.format !== "png" ||
      metadata.width !== expected.widthPixels ||
      metadata.height !== expected.heightPixels ||
      (metadata.pages ?? 1) !== 1
    ) {
      return fail("native-block-visual-review-png-invalid");
    }
    const rgbaResult = await sharp(Buffer.from(bytes), options)
        .toColourspace("srgb")
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    if (
      rgbaResult.info.width !== expected.widthPixels ||
      rgbaResult.info.height !== expected.heightPixels ||
      rgbaResult.info.channels !== 4 ||
      rgbaResult.data.byteLength !==
        expected.widthPixels * expected.heightPixels * 4
    ) {
      return fail("native-block-visual-review-png-invalid");
    }
    return Object.freeze({
      width: rgbaResult.info.width,
      height: rgbaResult.info.height,
      rgba: rgbaResult.data,
    });
  } catch (error) {
    if (error instanceof NativeBlockPackageErrorV1) throw error;
    return fail("native-block-visual-review-png-invalid", error);
  }
}

function decodedVisualReviewPngMatchesV1(
  taskOutput: DecodedVisualReviewPngV1,
  hostReplay: DecodedVisualReviewPngV1,
): boolean {
  return taskOutput.width === hostReplay.width &&
    taskOutput.height === hostReplay.height &&
    taskOutput.rgba.equals(hostReplay.rgba);
}

interface NativeBlockBuilderCapturedLayoutIdentityV1 {
  readonly kind: "native-block-builder-captured-layout-identity";
  readonly schemaVersion: 1;
  readonly blocks: readonly Readonly<{
    readonly id: string;
    readonly shape: string;
    readonly paletteRole: string;
    readonly visualGroupId?: string;
    readonly colliderGroupId?: string;
    readonly centerMetersXYZ: readonly [number, number, number];
    readonly rotationQuarterTurnsY: number;
  }>[];
  readonly displayScaleRatio: number;
  readonly spawn: Readonly<{
    readonly id: string;
    readonly positionMetersXYZ: readonly [number, number, number];
    readonly facingRadians: number;
  }>;
}

function parseCapturedLayoutIdentityV1(
  bytes: Uint8Array,
): NativeBlockBuilderCapturedLayoutIdentityV1 {
  const value = json(bytes, "native-block-visual-review-layout-mismatch");
  if (
    typeof value !== "object" ||
    isNil(value) ||
    Array.isArray(value)
  ) return fail("native-block-visual-review-layout-mismatch");
  const report = value as Record<string, unknown>;
  if (
    report.kind !== "native-block-builder-captured-layout-report" ||
    report.schemaVersion !== 1 ||
    typeof report.identity !== "object" ||
    isNil(report.identity) ||
    Array.isArray(report.identity) ||
    typeof report.identityHash !== "string" ||
    report.identityHash !== sha256CanonicalJson(report.identity)
  ) return fail("native-block-visual-review-layout-mismatch");
  const identity = report.identity as Record<string, unknown>;
  if (
    identity.kind !== "native-block-builder-captured-layout-identity" ||
    identity.schemaVersion !== 1 ||
    !Array.isArray(identity.blocks) ||
    identity.displayScaleRatio !== BABYLON_NATIVE_BLOCK_DISPLAY_SCALE_RATIO_V1 ||
    typeof identity.spawn !== "object" ||
    isNil(identity.spawn) ||
    Array.isArray(identity.spawn)
  ) return fail("native-block-visual-review-layout-mismatch");
  return identity as unknown as NativeBlockBuilderCapturedLayoutIdentityV1;
}

function checkedCapturedLayoutIdentityV1(input: Readonly<{
  checkedEpochEvidence: BabylonNativeBlockCheckedEpochEvidenceV1;
  spawnMarker: BabylonNativeSpawnMarkerContributionV1;
  captured: NativeBlockBuilderCapturedLayoutIdentityV1;
}>): void {
  const actualBlocks = input.checkedEpochEvidence.checkedLayout.layout.blocks.map(
    (block) => Object.freeze({
      id: block.id,
      shape: block.shape,
      paletteRole: block.paletteRole,
      ...(isNil(block.visualGroupId)
        ? {}
        : { visualGroupId: block.visualGroupId }),
      ...(isNil(block.colliderGroupId)
        ? {}
        : { colliderGroupId: block.colliderGroupId }),
      centerMetersXYZ: block.centerMetersXYZ,
      rotationQuarterTurnsY: block.rotationQuarterTurnsY,
    }),
  );
  if (
    !isEqual(input.captured.blocks, actualBlocks) ||
    !isEqual(input.captured.spawn, input.spawnMarker)
  ) return fail("native-block-visual-review-layout-mismatch");
  let actualProfileInventoryHash: Sha256HashV1;
  try {
    actualProfileInventoryHash =
      createBabylonNativeBlockProfileInventoryIdentityFromMaterializedV1({
        checkedLayout: input.checkedEpochEvidence.checkedLayout as unknown as
          Parameters<
            typeof createBabylonNativeBlockProfileInventoryIdentityFromMaterializedV1
          >[0]["checkedLayout"],
        colliderInventory: input.checkedEpochEvidence.colliderInventory,
      }).profileInventoryHash;
  } catch (error) {
    return fail("native-block-visual-review-layout-mismatch", error);
  }
  if (actualProfileInventoryHash !== input.checkedEpochEvidence.profileInventoryHash) {
    return fail("native-block-visual-review-layout-mismatch");
  }
}

async function replayAndVerifyNativeBlockVisualReviewV1(input: Readonly<{
  attemptDirectoryPath: string;
  generationRequest: ReturnType<typeof parseNativeBlockGenerationRequestV1>;
  reconstructionCase: ReturnType<typeof parseWorldReconstructionCaseV1>;
  worldRuntimeBootstrap: ReturnType<typeof parseWorldRuntimeBootstrapV1>;
  worldRuntimeBootstrapRef: string;
  worldRuntimeBootstrapBytesHash: Sha256HashV1;
  subjectHostContextBytes: Uint8Array;
  subjectProxyBytes: Uint8Array;
  sourceOutputByteLength: number;
  rendererSourceBytes: Uint8Array;
  authoringManifestBytes: Uint8Array;
  bootstrapBytes: Uint8Array;
  checkedEpochEvidence: BabylonNativeBlockCheckedEpochEvidenceV1;
  spawnMarker: BabylonNativeSpawnMarkerContributionV1;
}>): Promise<void> {
  const rendererBytes = await readVisualReviewFileNoFollow(
    input.attemptDirectoryPath,
    BUILDER_VISUAL_REVIEW_RENDERER_INPUT_REF,
    "native-block-visual-review-renderer-stale",
  );
  const rendererRows = input.generationRequest.contextInputs.filter(
    ({ inputRef }) => inputRef === BUILDER_VISUAL_REVIEW_RENDERER_INPUT_REF,
  );
  if (
    rendererRows.length !== 1 ||
    rendererRows[0]!.contentHash !== contentHash(rendererBytes)
  ) {
    return fail("native-block-visual-review-renderer-stale");
  }

  const subjectProxyBytes = input.subjectProxyBytes;
  let subjectProxy: ReturnType<
    typeof parseNativeBlockSubjectVisualReviewProxyV1
  >;
  try {
    subjectProxy = parseNativeBlockSubjectVisualReviewProxyV1(
      json(subjectProxyBytes, "native-block-subject-visual-review-proxy-stale"),
    );
  } catch (error) {
    return fail("native-block-subject-visual-review-proxy-stale", error);
  }
  const controlledSubjects = input.worldRuntimeBootstrap
    .subjectRuntimeDescriptors.filter(({ entityId }) =>
      entityId === input.worldRuntimeBootstrap.initialControlledEntityId
    );
  const controlledSubject = controlledSubjects[0];
  if (
    controlledSubjects.length !== 1 ||
    controlledSubject === undefined ||
    subjectProxy.initialControlledEntityId !==
      input.worldRuntimeBootstrap.initialControlledEntityId ||
    subjectProxy.subjectDefinitionRef !== controlledSubject.subjectDefinitionRef ||
    subjectProxy.subjectDefinitionHash !== controlledSubject.subjectDefinitionHash ||
    subjectProxy.subjectRuntimeDescriptorHash !==
      sha256CanonicalJson(controlledSubject) ||
    subjectProxy.worldRuntimeBootstrapRef !== input.worldRuntimeBootstrapRef ||
    subjectProxy.worldRuntimeBootstrapContentHash !==
      input.worldRuntimeBootstrap.contentHash ||
    subjectProxy.worldRuntimeBootstrapBytesHash !==
      input.worldRuntimeBootstrapBytesHash
  ) {
    return fail("native-block-subject-visual-review-proxy-stale");
  }

  const visualInputBytes: Uint8Array[] = [];
  for (const visualInput of BUILDER_VISUAL_REVIEW_INPUTS) {
    const bytes = await readVisualReviewFileNoFollow(
      input.attemptDirectoryPath,
      visualInput.durablePath,
      "native-block-visual-review-input-stale",
    );
    const requestRows = input.generationRequest.referenceInputs.filter(
      ({ inputRef }) => inputRef === visualInput.inputRef,
    );
    const caseRows = input.reconstructionCase.referenceInputs.filter(
      ({ inputRef }) => inputRef === visualInput.inputRef,
    );
    if (
      requestRows.length !== 1 ||
      caseRows.length !== 1 ||
      requestRows[0]!.mediaType !== "image/png" ||
      caseRows[0]!.mediaType !== "image/png" ||
      requestRows[0]!.contentHash !== caseRows[0]!.contentHash ||
      requestRows[0]!.contentHash !== contentHash(bytes)
    ) {
      return fail("native-block-visual-review-input-stale");
    }
    visualInputBytes.push(bytes);
  }

  const taskOutputSizes = await Promise.all(
    BUILDER_VISUAL_REVIEW_OUTPUTS.map(({ fileName }) =>
      visualReviewFileSizeNoFollow(
        input.attemptDirectoryPath,
        `advisory/${fileName}`,
        "native-block-visual-review-output-missing",
      )
    ),
  );
  const advisoryOutputByteLength = taskOutputSizes.reduce(
    (sum, size) => sum + size,
    0,
  );
  if (
    input.sourceOutputByteLength + advisoryOutputByteLength >
      input.generationRequest.budgets.maximumOutputBytes
  ) {
    return fail("native-block-visual-review-output-budget-exceeded");
  }
  const taskOutputBytes = await Promise.all(
    BUILDER_VISUAL_REVIEW_OUTPUTS.map(({ fileName }, index) =>
      readVisualReviewFileNoFollow(
        input.attemptDirectoryPath,
        `advisory/${fileName}`,
        "native-block-visual-review-output-missing",
        taskOutputSizes[index]!,
        "native-block-visual-review-output-budget-exceeded",
      )
    ),
  );
  const replayDirectoryPath = await realpath(await mkdtemp(path.join(
    os.tmpdir(),
    "worldkit-native-block-visual-replay-",
  )));
  try {
    const replayInputDirectoryPath = path.join(replayDirectoryPath, "inputs");
    const replayOutputDirectoryPath = path.join(replayDirectoryPath, "outputs");
    await Promise.all([
      mkdir(replayInputDirectoryPath, { mode: 0o700 }),
      mkdir(replayOutputDirectoryPath, { mode: 0o700 }),
    ]);
    const snapshotFiles = Object.freeze([
      Object.freeze({ path: "renderer.mjs", bytes: rendererBytes }),
      Object.freeze({ path: "scene.ts", bytes: input.rendererSourceBytes }),
      Object.freeze({ path: "native-block-authoring.json", bytes: input.authoringManifestBytes }),
      Object.freeze({ path: "native-scene.bootstrap.json", bytes: input.bootstrapBytes }),
      Object.freeze({ path: "subject-host-context.json", bytes: input.subjectHostContextBytes }),
      Object.freeze({ path: "world-plan.png", bytes: visualInputBytes[1]! }),
      Object.freeze({ path: "entry-whitebox-target.png", bytes: visualInputBytes[0]! }),
    ] as const);
    await Promise.all(snapshotFiles.map((file) => writeFile(
      path.join(replayInputDirectoryPath, file.path),
      file.bytes,
      { flag: "wx", mode: 0o400 },
    )));
    await chmod(replayInputDirectoryPath, 0o500);
    const replayOutputPaths = BUILDER_VISUAL_REVIEW_OUTPUTS.map(({ fileName }) =>
      path.join(replayOutputDirectoryPath, fileName)
    );
    const capturedLayoutReportPath = path.join(
      replayOutputDirectoryPath,
      "captured-layout-report.json",
    );
    try {
      await execFileAsync(process.execPath, [
        path.join(replayInputDirectoryPath, "renderer.mjs"),
        "--workspace",
        replayInputDirectoryPath,
        "--source",
        path.join(replayInputDirectoryPath, "scene.ts"),
        "--authoring",
        path.join(replayInputDirectoryPath, "native-block-authoring.json"),
        "--bootstrap",
        path.join(replayInputDirectoryPath, "native-scene.bootstrap.json"),
        "--subject-host-context",
        path.join(replayInputDirectoryPath, "subject-host-context.json"),
        "--world-plan",
        path.join(replayInputDirectoryPath, "world-plan.png"),
        "--entry-target",
        path.join(replayInputDirectoryPath, "entry-whitebox-target.png"),
        "--top-down-output",
        replayOutputPaths[0]!,
        "--entry-output",
        replayOutputPaths[1]!,
        "--captured-layout-output",
        capturedLayoutReportPath,
      ], {
        cwd: replayDirectoryPath,
        encoding: "utf8",
        maxBuffer: 1_000_000,
        shell: false,
        timeout: 30_000,
      });
    } catch (error) {
      return fail("native-block-visual-review-replay-failed", error);
    }
    const stableSnapshotBytes = await Promise.all(snapshotFiles.map((file) =>
      readVisualReviewFileNoFollow(
        replayInputDirectoryPath,
        file.path,
        "native-block-visual-review-replay-failed",
        file.bytes.byteLength,
        "native-block-visual-review-replay-failed",
      )
    ));
    if (stableSnapshotBytes.some((bytes, index) =>
      !Buffer.from(bytes).equals(Buffer.from(snapshotFiles[index]!.bytes)))) {
      return fail("native-block-visual-review-replay-failed");
    }
    const replayOutputBytes = await Promise.all(
      BUILDER_VISUAL_REVIEW_OUTPUTS.map(({ fileName, widthPixels, heightPixels }) =>
        readVisualReviewFileNoFollow(
          replayOutputDirectoryPath,
          fileName,
          "native-block-visual-review-replay-failed",
          widthPixels * heightPixels * 4,
          "native-block-visual-review-replay-failed",
        )
      ),
    );
    const capturedLayoutReportBytes = await readVisualReviewFileNoFollow(
      replayOutputDirectoryPath,
      "captured-layout-report.json",
      "native-block-visual-review-replay-failed",
      MAXIMUM_CAPTURED_LAYOUT_REPORT_BYTES,
      "native-block-visual-review-replay-failed",
    );
    checkedCapturedLayoutIdentityV1({
      checkedEpochEvidence: input.checkedEpochEvidence,
      spawnMarker: input.spawnMarker,
      captured: parseCapturedLayoutIdentityV1(capturedLayoutReportBytes),
    });
    for (let index = 0; index < BUILDER_VISUAL_REVIEW_OUTPUTS.length; index += 1) {
      const [taskOutput, hostReplay] = await Promise.all([
        decodeVisualReviewPngV1(
          taskOutputBytes[index]!,
          BUILDER_VISUAL_REVIEW_OUTPUTS[index]!,
        ),
        decodeVisualReviewPngV1(
          replayOutputBytes[index]!,
          BUILDER_VISUAL_REVIEW_OUTPUTS[index]!,
        ),
      ]);
      if (!decodedVisualReviewPngMatchesV1(taskOutput, hostReplay)) {
        return fail("native-block-visual-review-rgba-mismatch");
      }
    }
  } finally {
    await chmod(path.join(replayDirectoryPath, "inputs"), 0o700).catch(() => {});
    await rm(replayDirectoryPath, { recursive: true, force: true });
  }
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
  const hostOutputDirectoryPath = path.dirname(outputDirectoryPath);
  const hostRelative = path.relative(attemptDirectoryPath, hostOutputDirectoryPath).split(path.sep).join("/");
  if (path.basename(outputDirectoryPath) !== "world-package" ||
    (hostRelative !== "" && !/^host-recoveries\/[1-9][0-9]*$/.test(hostRelative))) {
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
    subjectHostContextBytes,
    worldBoundsPolicyBytes,
    nativeSceneApiBytes,
    nativeSceneProfileBytes,
    blockProfileBytes,
    authoringManifestBytes,
    resourcesBytes,
    sceneBytes,
    visualIdentityPaletteBytes,
  ] = await Promise.all([
    readAbsoluteFileNoFollow(casePath, "case-path-invalid"),
    readFileNoFollow(attemptDirectoryPath, "scene-authoring-route-decision.json"),
    readFileNoFollow(attemptDirectoryPath, "generation-request.json"),
    readFileNoFollow(attemptDirectoryPath, "attempt.json"),
    readFileNoFollow(attemptDirectoryPath, "generation-receipt.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/native-scene.bootstrap.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/subject-host-context.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/world-bounds-policy.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/native-scene-api.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/native-scene-profile.json"),
    readFileNoFollow(attemptDirectoryPath, "inputs/block-profile.json"),
    readFileNoFollow(sourceDirectoryPath, "native-block-authoring.json"),
    readFileNoFollow(sourceDirectoryPath, "native-resources.json"),
    readFileNoFollow(sourceDirectoryPath, "scene.ts"),
    readFileNoFollow(
      attemptDirectoryPath,
      "inputs/visual-identity-palette.json",
    ).catch((error: unknown) => fail(
      "native-block-visual-identity-palette-input-invalid",
      error,
    )),
  ]);

  const reconstructionCase = parseWorldReconstructionCaseV1(
    json(caseBytes, "case-invalid"),
  );
  const sceneBriefBytes = await readFileNoFollow(
    path.join(path.dirname(casePath), "inputs"),
    reconstructionCase.sceneBriefRef,
  ).catch((error: unknown) => fail("scene-brief-input-invalid", error));
  if (contentHash(sceneBriefBytes) !== reconstructionCase.sceneBriefHash) {
    return fail("scene-brief-input-invalid");
  }
  const sceneBrief = parseSceneBriefV1(
    new TextDecoder().decode(sceneBriefBytes),
  );
  if (!sceneBrief.ok) return fail("scene-brief-input-invalid");
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
  const subjectHostContext = parseNativeSubjectHostContextV1(json(subjectHostContextBytes, "host-closure-invalid"));
  const worldBoundsPolicy = parseNativeSceneWorldBoundsPolicyV1(
    json(worldBoundsPolicyBytes, "world-bounds-policy-invalid"),
  );
  const authoringManifestValue = json(
    authoringManifestBytes,
    "authoring-manifest-invalid",
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
  const paletteCaseReferences = reconstructionCase.referenceInputs.filter(
    ({ inputRef }) => inputRef === "visual-identity-palette.json",
  );
  const paletteGenerationInputs = generationRequest.contextInputs.filter(
    ({ inputRef }) => inputRef === "inputs/visual-identity-palette.json",
  );
  const visualIdentityPaletteHash = contentHash(visualIdentityPaletteBytes);
  if (
    paletteCaseReferences.length !== 1 ||
    paletteCaseReferences[0]!.mediaType !== "application/json" ||
    paletteGenerationInputs.length !== 1 ||
    paletteCaseReferences[0]!.contentHash !== visualIdentityPaletteHash ||
    paletteGenerationInputs[0]!.contentHash !== visualIdentityPaletteHash
  ) return fail("native-block-visual-identity-palette-input-invalid");
  const visualIdentityAdmission = admitNativeBlockVisualIdentityBindingsV1({
    sceneId: reconstructionCase.id,
    sceneBriefSemanticHash: sceneBrief.sceneBriefHash as Sha256HashV1,
    semanticSilhouetteTargets:
      reconstructionCase.expected.semanticSilhouetteTargets,
    visualIdentityPalette: json(
      visualIdentityPaletteBytes,
      "native-block-visual-identity-palette-input-invalid",
    ),
    authoringManifest: authoringManifestValue,
  });
  if (visualIdentityAdmission.outcome === "rejected") {
    throw new NativeBlockPackageErrorV1(
      [NATIVE_BLOCK_VISUAL_IDENTITY_BINDING_DIAGNOSTIC_CODE_V1],
      visualIdentityAdmission,
      undefined,
      undefined,
      visualIdentityAdmission,
    );
  }
  const authoringManifest = parseNativeBlockAuthoringManifestV1(
    authoringManifestValue,
  );
  const subjectContextRows = generationRequest.contextInputs.filter(({ inputRef }) =>
    inputRef === "inputs/subject-host-context.json");
  const boundsRows = generationRequest.contextInputs.filter(({ inputRef }) =>
    inputRef === "inputs/world-bounds-policy.json");
  if (subjectContextRows.length !== 1 || subjectContextRows[0]!.contentHash !== contentHash(subjectHostContextBytes) ||
    boundsRows.length !== 1 || boundsRows[0]!.contentHash !== contentHash(worldBoundsPolicyBytes) ||
    subjectHostContext.worldId !== reconstructionCase.id) return fail("host-identity-closure-mismatch");
  const subjectClosure = resolveNativeSubjectAuthoringClosureV1({
    context: subjectHostContext, bootstrap, authoring: authoringManifest,
  });
  const selectionDiagnostics = checkNativeSubjectHostedSelectionV1(subjectClosure, sceneBrief.value.movementModes.map(({ mode }) => mode));
  if (selectionDiagnostics.length > 0) throw new NativeBlockPackageErrorV1(selectionDiagnostics.map(({ code }) => code), selectionDiagnostics);
  const gameplay = subjectClosure.gameplayBootstrap;
  const runtime = subjectClosure.worldRuntimeBootstrap;
  const runtimeBytes = subjectClosure.worldRuntimeBootstrapBytes;
  const worldRuntimeBootstrapRef = subjectClosure.worldRuntimeBootstrapRef;
  try {
    admitBabylonNativeOpeningCameraV1(authoringManifest.openingCamera, runtime);
  } catch (error) {
    return fail("native-block-opening-camera-invalid", error);
  }
  try {
    const spawn = reconstructionCase.expected.spawnSupport.expectedPositionXYZMeters;
    admitNativeBlockGroundExplorationV1(authoringManifest.groundExploration,
      reconstructionCase.expected.groundConnectivity.mode,
      [spawn.xMeters, spawn.yMeters, spawn.zMeters],
      reconstructionCase.expected.groundConnectivity.requireSingleReachableComponent);
  } catch (error) {
    return fail("native-block-ground-exploration-invalid", error);
  }
  if (
    blockProfile.resourceRef !== BABYLON_NATIVE_BLOCK_AUTHORING_PROFILE_REF_V1 ||
    authoringManifest.blockProfileRef !== blockProfile.resourceRef ||
    generationRequest.bootstrapInputHash !==
      hashBabylonNativeSceneBootstrapV1(bootstrap)
  ) return fail("host-identity-closure-mismatch");

  const parentDirectoryPath = path.dirname(outputDirectoryPath);
  await mkdir(parentDirectoryPath, { recursive: true });
  if (await realpath(parentDirectoryPath) !== parentDirectoryPath) return fail("output-location-invalid");
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
      hostOutputDirectoryPath,
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
      const repairDiagnostics: readonly WorldReconstructionDiagnosticV1[] =
        Object.freeze([]);
      await Promise.all([
        writeTextFresh(
          path.join(hostOutputDirectoryPath, "native-explain.txt"),
          explainNativeSceneCheckResultV1(formalCheck),
        ),
        writeCanonicalJsonFresh(
          path.join(hostOutputDirectoryPath, "attempt-result.json"),
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
      !subjectClosure.registryLock.some((ownerEntry) => isEqual(ownerEntry, entry)))) {
      return fail("registry-runtime-closure-mismatch");
    }
    const registryLock = worldResourceLockEntriesV1([
      ...runtimeOwnerEntries,
      {
        resourceKind: "world-runtime-bootstrap",
        resourceRef: worldRuntimeBootstrapRef,
        resolvedVersion: worldRuntimeBootstrapRef.split("@").at(-1)!,
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
      subjectHostContext.traversalSurfaceProfileLock,
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
      worldBoundsPolicy,
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
      worldRuntimeBootstrapRef,
      worldRuntimeBootstrap: runtime,
      registryLock,
      nativeBlockAuthoring: {
        reconstructionCase,
        authoringManifest,
      },
    });
    const checkedEpochEvidence = prepared.nativeBlockCheckedEpochEvidence;
    if (isNil(checkedEpochEvidence)) {
      return fail("native-block-ground-evidence-missing");
    }
    await replayAndVerifyNativeBlockVisualReviewV1({
      attemptDirectoryPath,
      generationRequest,
      reconstructionCase,
      worldRuntimeBootstrap: runtime,
      worldRuntimeBootstrapRef,
      worldRuntimeBootstrapBytesHash: contentHash(runtimeBytes),
      subjectHostContextBytes,
      subjectProxyBytes: subjectClosure.subjectVisualReviewProxyBytes,
      sourceOutputByteLength: [...sourceBytesByPath.values()].reduce(
        (sum, bytes) => sum + bytes.byteLength,
        0,
      ),
      rendererSourceBytes: sceneBytes,
      authoringManifestBytes,
      bootstrapBytes,
      checkedEpochEvidence,
      spawnMarker: prepared.frozenInput.nativeSceneContribution.spawnMarker,
    });
    const directory = buildTrustedBabylonNativeWorldPackageFromPreparedV1(
      prepared,
    );
    const verified = verifyWorldPackageDirectoryV1(directory);
    if (verified.kind !== "babylon-native-scene") {
      return fail("world-package-kind-mismatch");
    }
    const materializerMetadata = verified.nativeBlockMaterializerMetadata;
    if (isNil(materializerMetadata)) {
      return fail("native-block-ground-evidence-missing");
    }
    const groundModelEvidenceRef =
      `artifact://world-reconstruction-case/${reconstructionCase.id}/${attempt.id}/logical-ground-model.json`;
    const analyzedGround = analyzeProductionNativeBlockGroundV1({
      groundExploration: materializerMetadata.groundExploration,
      openingCamera: verified.nativeBlockMaterializerMetadata!.openingCamera,
      reconstructionCase,
      worldRuntimeBootstrap: verified.worldRuntimeBootstrap,
      subjectResources: subjectClosure.normalizedSubjectResources,
      registryLock: verified.registryLock,
      contribution: verified.nativeSceneContribution,
      worldBounds: verified.manifest.worldBounds,
      checkedEpochEvidence,
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      groundModelEvidenceRef,
    });
    const groundAnalysisReportPath = path.join(
      hostOutputDirectoryPath,
      "ground-analysis-report.json",
    );
    await Promise.all([
      writeCanonicalJsonFresh(
        path.join(hostOutputDirectoryPath, "logical-ground-model.json"),
        checkedEpochEvidence.logicalGroundModel,
      ),
      writeCanonicalJsonFresh(
        groundAnalysisReportPath,
        analyzedGround.report,
      ),
      writeCanonicalJsonFresh(
        path.join(hostOutputDirectoryPath, "ground-analysis-diagnostics.json"),
        analyzedGround.repairDiagnostics,
      ),
    ]);
    if (analyzedGround.report.admissionOutcome !== "passed") {
      await Promise.all([
        writeTextFresh(
          path.join(hostOutputDirectoryPath, "native-explain.txt"),
          explainNativeSceneCheckResultV1(formalCheck),
        ),
        writeCanonicalJsonFresh(
          path.join(hostOutputDirectoryPath, "attempt-result.json"),
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
      path.join(hostOutputDirectoryPath, "native-explain.txt"),
      explainNativeSceneCheckResultV1(formalCheck),
    );
    await writeCanonicalJsonFresh(
      path.join(hostOutputDirectoryPath, "attempt-result.json"),
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
