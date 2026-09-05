import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import {
  bindBlockMaterializerMetadataToSemanticCaptureTargetsV1,
} from "@whitebox-world/native-babylon-block-profile";
import {
  sha256Bytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  formalWorldCaptureRequestCanonicalBytesV1,
  hashBabylonNativeBlockMaterializerMetadataV1,
  hashBabylonNativeSceneContributionV1,
  hashFormalSemanticCaptureMapV1,
  hashFormalWorldCaptureIntentV1,
  hashFormalWorldCaptureRequestV1,
  parseFormalWorldCaptureIntentV1,
  parseFormalWorldCaptureRequestV1,
  type FormalWorldCaptureIntentV1,
  type FormalWorldCaptureRequestV1,
  type VisualCaptureGroupV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashSceneAuthoringAttemptV1,
  parseSceneAuthoringAttemptV1,
  type SceneAuthoringAttemptV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
  worldReconstructionEvidenceProfileClosureMatchesV1,
  type WorldReconstructionCaseV1,
  type WorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import {
  verifyWorldPackageDirectoryV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
  type WorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { isEqual, isNil } from "lodash-es";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { readWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import { deriveNativeFormalWorldCaptureBoundsV1 } from "./formal-capture-bounds.js";
import { deriveNativeVisualCaptureGroupsV1 } from "./native-visual-capture-groups.js";
import { parseVisualIdentityPaletteV1 } from "../scenes/visual-identity-palette.js";

export const FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1 =
  "formal-world-capture-request.json" as const;

const MATERIALIZER_METADATA_REF =
  "world-package://native/block-materializer-metadata.json";
const WORLD_BUILD_IDENTITY_REF = "world-package://world-build-identity.json";
const WORLD_PACKAGE_BUILD_RECEIPT_REF =
  "world-package://world-package-build-receipt.json";
const WORLD_VIEW_STANDOFF_METERS = 20;
const MAXIMUM_PACKAGE_BYTES = 512_000_000;
const MAXIMUM_PACKAGE_FILE_COUNT = 4_096;
const WRITE_INVALID = "FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID";
const IDENTITY_MISMATCH = "FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH";

const INPUT_FIELDS = [
  "visualCaptureScope",
  "outputMode",
  "casePath",
  "evaluationProfilePath",
  "sceneAuthoringAttemptPath",
  "packageDirectoryPath",
  "outputPath",
  "formalCaptureIntent",
] as const;

export interface MaterializeFormalWorldCaptureRequestInputV1 {
  readonly visualCaptureScope: "world-only" | "complete-targets";
  readonly outputMode: "create" | "verify-or-create";
  readonly casePath: string;
  readonly evaluationProfilePath: string;
  readonly sceneAuthoringAttemptPath: string;
  readonly packageDirectoryPath: string;
  readonly outputPath: string;
  readonly formalCaptureIntent: FormalWorldCaptureIntentV1;
}

export interface MaterializeFormalWorldCaptureRequestPortsV1 {
  readonly readPackage?: (
    packageDirectoryPath: string,
  ) => Promise<WorldPackageDirectoryV1>;
  readonly hooks?: {
    readonly beforeRename?: (
      stagingFilePath: string,
      outputPath: string,
    ) => Promise<void>;
  };
}

export interface MaterializedFormalWorldCaptureRequestV1 {
  readonly request: FormalWorldCaptureRequestV1;
  readonly formalRequestHash: Sha256HashV1;
  readonly outputPath: string;
  readonly requestBytes: Uint8Array;
}

interface CanonicalRootV1 {
  readonly requestedPath: string;
  readonly realPath: string;
}

interface JoinedPackageIdentityV1 {
  readonly caseHash: Sha256HashV1;
  readonly metadataHash: Sha256HashV1;
  readonly contributionHash: Sha256HashV1;
}

function writeInvalid(role: string): never {
  throw new Error(`${WRITE_INVALID}: ${role}`);
}

function identityMismatch(role: string): never {
  throw new Error(`${IDENTITY_MISMATCH}: ${role}`);
}

function assertAccessorFree(
  value: unknown,
  role: string,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) writeInvalid(`${role} must be acyclic plain data`);
  seen.add(value);
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) {
    writeInvalid(`${role} must use ordinary object and array prototypes`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") writeInvalid(`${role} symbol keys are forbidden`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!isNil(descriptor?.get) || !isNil(descriptor?.set)) {
      writeInvalid(`${role}/${key} accessors are forbidden`);
    }
    if (key !== "length" && descriptor?.enumerable !== true) {
      writeInvalid(`${role}/${key} data fields must be enumerable`);
    }
    assertAccessorFree(descriptor?.value, `${role}/${key}`, seen);
  }
  seen.delete(value);
}

function exactPlainRecord(
  value: unknown,
  fields: readonly string[],
  role: string,
): Readonly<Record<string, unknown>> {
  if (
    isNil(value) ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  ) writeInvalid(role);
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    writeInvalid(`${role} unknown or missing field`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactAbsolutePath(value: unknown, role: string): string {
  if (typeof value !== "string") writeInvalid(role);
  const resolved = path.resolve(value);
  if (
    !path.isAbsolute(value) ||
    value !== resolved ||
    path.parse(value).root === value
  ) writeInvalid(role);
  return value;
}

function relativeWithin(root: string, candidate: string, role: string): string {
  const relativePath = path.relative(root, candidate);
  if (
    relativePath.length === 0 ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) writeInvalid(role);
  return relativePath.split(path.sep).join("/");
}

async function missing(absolutePath: string): Promise<boolean> {
  try {
    await lstat(absolutePath);
    return false;
  } catch (error) {
    if (
      typeof error === "object" &&
      !isNil(error) &&
      "code" in error &&
      error.code === "ENOENT"
    ) return true;
    throw error;
  }
}

async function canonicalDirectory(
  requestedPath: string,
  role: string,
): Promise<CanonicalRootV1> {
  const resolved = exactAbsolutePath(requestedPath, role);
  if (await missing(resolved)) writeInvalid(`${role} missing`);
  const metadata = await lstat(resolved);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    writeInvalid(`${role} symlink`);
  }
  const realPath = await realpath(resolved);
  if (realPath !== resolved) writeInvalid(`${role} symlink`);
  return Object.freeze({ requestedPath: resolved, realPath });
}

async function assertCanonicalAncestors(
  root: CanonicalRootV1,
  candidate: string,
  role: string,
): Promise<void> {
  const relativePath = relativeWithin(root.requestedPath, candidate, role);
  let requestedCurrent = root.requestedPath;
  let realCurrent = root.realPath;
  for (const segment of relativePath.split("/").slice(0, -1)) {
    requestedCurrent = path.join(requestedCurrent, segment);
    realCurrent = path.join(realCurrent, segment);
    if (await missing(requestedCurrent)) writeInvalid(`${role} missing`);
    const metadata = await lstat(requestedCurrent);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      writeInvalid(`${role} symlink`);
    }
    if (await realpath(requestedCurrent) !== realCurrent) {
      writeInvalid(`${role} symlink`);
    }
  }
}

async function freezeRegularFile(
  root: CanonicalRootV1,
  candidate: string,
  role: string,
): Promise<Uint8Array> {
  const resolved = exactAbsolutePath(candidate, role);
  relativeWithin(root.requestedPath, resolved, role);
  if (await missing(resolved)) writeInvalid(`${role} missing`);
  const metadata = await lstat(resolved);
  if (metadata.isSymbolicLink()) writeInvalid(`${role} symlink`);
  if (!metadata.isFile()) writeInvalid(`${role} missing`);
  const canonicalCandidate = await realpath(resolved);
  relativeWithin(root.realPath, canonicalCandidate, role);
  if (canonicalCandidate !== resolved) writeInvalid(`${role} symlink`);
  const bytes = new Uint8Array(await readFile(resolved));
  const after = await lstat(resolved);
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    after.dev !== metadata.dev ||
    after.ino !== metadata.ino ||
    after.size !== metadata.size ||
    after.mtimeMs !== metadata.mtimeMs ||
    after.ctimeMs !== metadata.ctimeMs ||
    await realpath(resolved) !== canonicalCandidate
  ) writeInvalid(`${role} changed`);
  return bytes;
}

function parseCanonicalJson(bytes: Uint8Array, role: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    writeInvalid(`${role} invalid`);
  }
}

function joinCaseProfile(
  reconstructionCase: WorldReconstructionCaseV1,
  profile: WorldReconstructionEvaluationProfileV1,
  evaluationProfilePath: string,
): Sha256HashV1 {
  const evaluationProfileHash = hashWorldReconstructionEvaluationProfileV1(
    profile,
  );
  if (reconstructionCase.evaluationProfileHash !== evaluationProfileHash) {
    return identityMismatch("evaluationProfileHash");
  }
  if (!reconstructionCase.evaluationProfileRef.includes("://")) {
    if (path.basename(evaluationProfilePath) !==
      reconstructionCase.evaluationProfileRef) {
      return identityMismatch("evaluationProfileRef");
    }
  }
  if (!worldReconstructionEvidenceProfileClosureMatchesV1(
    reconstructionCase,
    profile,
  )) return identityMismatch("requiredEvidenceProfileRefs");
  return evaluationProfileHash;
}

function joinAttemptCase(
  attempt: SceneAuthoringAttemptV1,
  reconstructionCase: WorldReconstructionCaseV1,
): void {
  if (
    attempt.sceneBriefRef !== reconstructionCase.sceneBriefRef ||
    attempt.sceneBriefHash !== reconstructionCase.sceneBriefHash
  ) identityMismatch("sceneAuthoringAttempt/sceneBrief");
  if (!isEqual(
    attempt.acceptanceTargetRefs,
    reconstructionCase.acceptanceTargetRefs,
  )) identityMismatch("sceneAuthoringAttempt/acceptanceTargetRefs");
  if (!isEqual(
    attempt.requiredEvidenceProfileRefs,
    reconstructionCase.requiredEvidenceProfileRefs,
  )) identityMismatch("sceneAuthoringAttempt/requiredEvidenceProfileRefs");
}

function joinAttemptPackage(
  attempt: SceneAuthoringAttemptV1,
  verifiedPackage: VerifiedBabylonNativeWorldPackageDirectoryV1,
): Sha256HashV1 {
  const attemptHash = hashSceneAuthoringAttemptV1(attempt);
  const source = verifiedPackage.manifest.sceneSource;
  if (
    attemptHash !== hashSceneAuthoringAttemptV1(
      verifiedPackage.sceneAuthoringAttempt,
    ) ||
    attemptHash !== source.sceneAuthoringAttemptHash
  ) identityMismatch("sceneAuthoringAttemptHash");
  return attemptHash;
}

function joinCasePackage(
  reconstructionCase: WorldReconstructionCaseV1,
  verifiedPackage: VerifiedBabylonNativeWorldPackageDirectoryV1,
): JoinedPackageIdentityV1 {
  const metadata = verifiedPackage.nativeBlockMaterializerMetadata;
  const source = verifiedPackage.manifest.sceneSource;
  if (
    isNil(metadata) ||
    source.nativeMaterializer.kind !== "babylon-native-block"
  ) identityMismatch("worldPackage");
  const caseHash = hashWorldReconstructionCaseV1(reconstructionCase);
  if (caseHash !== metadata.caseHash) identityMismatch("caseHash");
  const metadataHash = hashBabylonNativeBlockMaterializerMetadataV1(metadata);
  if (metadataHash !== source.nativeMaterializer.metadataHash) {
    identityMismatch("nativeBlockMaterializerMetadataHash");
  }
  const contributionHash = hashBabylonNativeSceneContributionV1(
    verifiedPackage.nativeSceneContribution,
  );
  if (contributionHash !== metadata.contributionHash) {
    identityMismatch("worldPackage/contributionHash");
  }
  return Object.freeze({ caseHash, metadataHash, contributionHash });
}

function deriveViews(
  captureProfile: FormalWorldCaptureIntentV1["captureProfile"],
  verifiedPackage: VerifiedBabylonNativeWorldPackageDirectoryV1,
): FormalWorldCaptureRequestV1["views"] {
  const bounds = deriveNativeFormalWorldCaptureBoundsV1(verifiedPackage.nativeBlockMaterializerMetadata!);
  const [minX, minY, minZ] = bounds.minimumMetersXYZ;
  const [maxX, maxY, maxZ] = bounds.maximumMetersXYZ;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const viewport = {
    widthPixels: captureProfile.widthPixels,
    heightPixels: captureProfile.heightPixels,
    devicePixelRatio: captureProfile.devicePixelRatio,
  } as const;
  return Object.freeze([
    Object.freeze({
      kind: "formal-artifact-view-request" as const,
      schemaVersion: 1 as const,
      viewId: "opening" as const,
      projection: "perspective" as const,
      ...viewport,
    }),
    Object.freeze({
      kind: "formal-artifact-view-request" as const,
      schemaVersion: 1 as const,
      viewId: "world-side" as const,
      projection: "orthographic" as const,
      ...viewport,
      worldBoundsMeters: bounds,
      cameraPositionMetersXYZ: Object.freeze([
        maxX + WORLD_VIEW_STANDOFF_METERS,
        centerY,
        centerZ,
      ] as const),
      targetMetersXYZ: Object.freeze([centerX, centerY, centerZ] as const),
    }),
    Object.freeze({
      kind: "formal-artifact-view-request" as const,
      schemaVersion: 1 as const,
      viewId: "world-top-down" as const,
      projection: "orthographic" as const,
      ...viewport,
      worldBoundsMeters: bounds,
      cameraPositionMetersXYZ: Object.freeze([
        centerX,
        maxY + WORLD_VIEW_STANDOFF_METERS,
        centerZ,
      ] as const),
      targetMetersXYZ: Object.freeze([centerX, centerY, centerZ] as const),
    }),
  ]);
}

export async function materializeFormalWorldCaptureRequestV1(
  input: MaterializeFormalWorldCaptureRequestInputV1,
  ports: MaterializeFormalWorldCaptureRequestPortsV1 = {},
): Promise<MaterializedFormalWorldCaptureRequestV1> {
  assertAccessorFree(input, "input");
  const source = exactPlainRecord(input, INPUT_FIELDS, "input");
  if (source.visualCaptureScope !== "world-only" && source.visualCaptureScope !== "complete-targets") {
    writeInvalid("visualCaptureScope");
  }
  if (source.outputMode !== "create" && source.outputMode !== "verify-or-create") {
    writeInvalid("outputMode");
  }
  const formalCaptureIntent = parseFormalWorldCaptureIntentV1(
    source.formalCaptureIntent,
  );

  const casePath = exactAbsolutePath(source.casePath, "casePath");
  const evaluationProfilePath = exactAbsolutePath(
    source.evaluationProfilePath,
    "evaluationProfilePath",
  );
  const sceneAuthoringAttemptPath = exactAbsolutePath(
    source.sceneAuthoringAttemptPath,
    "sceneAuthoringAttemptPath",
  );
  const packageDirectoryPath = exactAbsolutePath(
    source.packageDirectoryPath,
    "packageDirectoryPath",
  );
  const outputPath = exactAbsolutePath(source.outputPath, "outputPath");
  const caseRoot = await canonicalDirectory(path.dirname(casePath), "caseRoot");
  relativeWithin(caseRoot.requestedPath, evaluationProfilePath, "evaluationProfilePath");
  relativeWithin(
    caseRoot.requestedPath,
    sceneAuthoringAttemptPath,
    "sceneAuthoringAttemptPath",
  );
  relativeWithin(caseRoot.requestedPath, packageDirectoryPath, "packageDirectoryPath");
  relativeWithin(caseRoot.requestedPath, outputPath, "outputPath");
  if (path.basename(outputPath) !== FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1) {
    writeInvalid("outputPath");
  }
  if (path.dirname(outputPath) !== path.dirname(packageDirectoryPath)) {
    writeInvalid("outputPath");
  }

  await assertCanonicalAncestors(caseRoot, evaluationProfilePath, "evaluationProfilePath");
  await assertCanonicalAncestors(
    caseRoot,
    sceneAuthoringAttemptPath,
    "sceneAuthoringAttemptPath",
  );
  await assertCanonicalAncestors(caseRoot, outputPath, "outputPath");
  const packageRoot = await canonicalDirectory(
    packageDirectoryPath,
    "packageDirectoryPath",
  );
  relativeWithin(caseRoot.realPath, packageRoot.realPath, "packageDirectoryPath");
  if (source.outputMode === "create" && !(await missing(outputPath))) writeInvalid("outputPath duplicate");

  const caseBytes = await freezeRegularFile(caseRoot, casePath, "casePath");
  const profileBytes = await freezeRegularFile(
    caseRoot,
    evaluationProfilePath,
    "evaluationProfilePath",
  );
  const attemptBytes = await freezeRegularFile(
    caseRoot,
    sceneAuthoringAttemptPath,
    "sceneAuthoringAttemptPath",
  );

  let reconstructionCase: WorldReconstructionCaseV1;
  let profile: WorldReconstructionEvaluationProfileV1;
  let attempt: SceneAuthoringAttemptV1;
  try {
    reconstructionCase = parseWorldReconstructionCaseV1(
      parseCanonicalJson(caseBytes, "casePath"),
    );
    profile = parseWorldReconstructionEvaluationProfileV1(
      parseCanonicalJson(profileBytes, "evaluationProfilePath"),
    );
    attempt = parseSceneAuthoringAttemptV1(
      parseCanonicalJson(attemptBytes, "sceneAuthoringAttemptPath"),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith(WRITE_INVALID) ||
        error.message.startsWith(IDENTITY_MISMATCH))
    ) throw error;
    writeInvalid("frozen identity");
  }

  const evaluationProfileHash = joinCaseProfile(
    reconstructionCase,
    profile,
    evaluationProfilePath,
  );
  if (
    reconstructionCase.formalCaptureIntentHash !==
      hashFormalWorldCaptureIntentV1(formalCaptureIntent) ||
    formalCaptureIntent.id !==
      `${reconstructionCase.id}.formal-world-capture-intent`
  ) identityMismatch("formalCaptureIntent");
  joinAttemptCase(attempt, reconstructionCase);

  const directory = await (ports.readPackage ?? (async (directoryPath) =>
    readWorldPackageDirectoryV1({
      packageDirectoryPath: directoryPath,
      maximumTotalBytes: MAXIMUM_PACKAGE_BYTES,
      maximumFileCount: MAXIMUM_PACKAGE_FILE_COUNT,
    })))(packageRoot.requestedPath);
  const verified = verifyWorldPackageDirectoryV1(directory);
  if (verified.kind !== "babylon-native-scene") {
    identityMismatch("worldPackage");
  }
  const packageIdentity = joinCasePackage(reconstructionCase, verified);
  joinAttemptPackage(attempt, verified);

  let visualCaptureGroups: readonly VisualCaptureGroupV1[] = [];
  if (source.visualCaptureScope === "complete-targets") {
    const paletteRef = reconstructionCase.referenceInputs.find(row => row.inputRef === "visual-identity-palette.json");
    if (paletteRef?.mediaType !== "application/json" || reconstructionCase.sceneBriefRef !== "scene-brief.md") {
      identityMismatch("visual capture planner inputs");
    }
    const inputRoot = await canonicalDirectory(path.join(caseRoot.requestedPath, "inputs"), "planner inputs");
    const briefBytes = await freezeRegularFile(inputRoot, path.join(inputRoot.requestedPath, "scene-brief.md"), "scene-brief.md");
    const paletteBytes = await freezeRegularFile(inputRoot, path.join(inputRoot.requestedPath, paletteRef.inputRef), paletteRef.inputRef);
    if (sha256Bytes(briefBytes) !== reconstructionCase.sceneBriefHash || sha256Bytes(paletteBytes) !== paletteRef.contentHash) {
      identityMismatch("visual capture planner input bytes");
    }
    const brief = parseSceneBriefV1(new TextDecoder("utf-8", { fatal: true }).decode(briefBytes));
    if (!brief.ok) identityMismatch("visual capture scene brief");
    const palette = parseVisualIdentityPaletteV1(parseCanonicalJson(paletteBytes, paletteRef.inputRef), {
      sceneSourceKind: "babylon-native", sceneId: reconstructionCase.id,
      sceneBriefHash: brief.sceneBriefHash as Sha256HashV1,
    });
    visualCaptureGroups = deriveNativeVisualCaptureGroupsV1({ palette,
      metadata: verified.nativeBlockMaterializerMetadata!, runtimeBootstrap: verified.worldRuntimeBootstrap,
      spawnMarker: verified.nativeSceneContribution.spawnMarker });
  }

  const semanticCaptureMap = bindBlockMaterializerMetadataToSemanticCaptureTargetsV1({
    case: reconstructionCase,
    materializerMetadata: verified.nativeBlockMaterializerMetadata,
    materializerMetadataHash: packageIdentity.metadataHash,
    contribution: verified.nativeSceneContribution,
    formalCaptureIntent,
  });
  const semanticCaptureMapHash = hashFormalSemanticCaptureMapV1(semanticCaptureMap);
  const relativeOutput = relativeWithin(caseRoot.requestedPath, outputPath, "outputPath");
  const artifactBase =
    `artifact://world-reconstruction-case/${reconstructionCase.id}`;
  const request = parseFormalWorldCaptureRequestV1({
    kind: "formal-world-capture-request",
    visualCaptureGroups,
    schemaVersion: 1,
    id: `${reconstructionCase.id}.formal-capture-request`,
    formalRequestRef: `${artifactBase}/${relativeOutput}`,
    caseRef: semanticCaptureMap.caseRef,
    caseHash: packageIdentity.caseHash,
    evaluationProfileRef: reconstructionCase.evaluationProfileRef,
    evaluationProfileHash,
    sceneAuthoringRouteDecisionRef:
      verified.sceneAuthoringAttempt.sceneAuthoringRouteDecisionRef,
    sceneAuthoringRouteDecisionHash:
      verified.manifest.sceneSource.sceneAuthoringRouteDecisionHash,
    sceneAuthoringAttemptRef:
      verified.sceneAuthoringAttemptResult.sceneAuthoringAttemptRef,
    sceneAuthoringAttemptHash:
      verified.manifest.sceneSource.sceneAuthoringAttemptHash,
    sceneAuthoringAttemptResultRef:
      verified.manifest.sceneSource.sceneAuthoringAttemptResultRef,
    sceneAuthoringAttemptResultHash:
      verified.manifest.sceneSource.sceneAuthoringAttemptResultHash,
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    worldBuildIdentityRef: WORLD_BUILD_IDENTITY_REF,
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    worldPackageBuildReceiptRef: WORLD_PACKAGE_BUILD_RECEIPT_REF,
    worldPackageBuildReceiptHash: sha256CanonicalJson(verified.receipt),
    semanticCaptureMapRef:
      `${artifactBase}/${path.posix.dirname(relativeOutput)}/semantic-capture-map.json`,
    semanticCaptureMap,
    semanticCaptureMapHash,
    nativeBlockMaterializerMetadataRef: MATERIALIZER_METADATA_REF,
    nativeBlockMaterializerMetadataHash: packageIdentity.metadataHash,
    views: deriveViews(formalCaptureIntent.captureProfile, verified),
    colliderOverlay: {
      kind: "formal-collider-overlay-request",
      schemaVersion: 1,
      isRequired: true,
      contributionHash: packageIdentity.contributionHash,
    },
    scriptedTraversal: {
      kind: "formal-scripted-traversal-request",
      schemaVersion: 1,
      checks: [...reconstructionCase.expected.criticalTraversalChecks]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((check) => {
          const binding = semanticCaptureMap.traversalCheckBindings.find(
            (entry) => entry.traversalCheckId === check.id,
          );
          if (isNil(binding)) identityMismatch("scriptedTraversal");
          return {
            id: check.id,
            acceptanceTargetRef: check.acceptanceTargetRef,
            checkExpectation: check.expectation,
            fixedInputSequence: check.fixedInputSequence,
            fixedInputSequenceHash: sha256CanonicalJson(check.fixedInputSequence),
            checkpointCriteria: binding.checkpointCriteria,
          };
        }),
    },
  });
  const requestBytes = formalWorldCaptureRequestCanonicalBytesV1(request);
  const formalRequestHash = hashFormalWorldCaptureRequestV1(request);
  if (sha256Bytes(requestBytes) !== formalRequestHash) {
    identityMismatch("formalRequestHash");
  }

  const parentDirectoryPath = path.dirname(outputPath);
  if (source.outputMode === "verify-or-create" && !(await missing(outputPath))) {
    const existing = await freezeRegularFile(caseRoot, outputPath, "outputPath");
    if (!Buffer.from(existing).equals(Buffer.from(requestBytes))) identityMismatch("existing request bytes");
    return Object.freeze({ request, formalRequestHash, outputPath, requestBytes });
  }
  await mkdir(parentDirectoryPath, { recursive: true, mode: 0o700 });
  if (!(await missing(outputPath))) writeInvalid("outputPath duplicate");
  const stagingDirectoryPath = await mkdtemp(path.join(
    parentDirectoryPath,
    `.${FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1}.`,
  ));
  const stagingFilePath = path.join(
    stagingDirectoryPath,
    FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
  );
  try {
    await writeFile(stagingFilePath, requestBytes, { flag: "wx", mode: 0o600 });
    await ports.hooks?.beforeRename?.(stagingFilePath, outputPath);
    if (!(await missing(outputPath))) writeInvalid("outputPath duplicate");
    await rename(stagingFilePath, outputPath);
  } finally {
    await rm(stagingDirectoryPath, { recursive: true, force: true });
  }
  return Object.freeze({
    request,
    formalRequestHash,
    outputPath,
    requestBytes,
  });
}
