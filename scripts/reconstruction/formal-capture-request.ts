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
  hashFormalWorldCaptureRequestV1,
  parseFormalTraversalCheckpointSpatialCriteriaV1,
  parseFormalWorldCaptureRequestV1,
  type FormalSemanticTopologyRelationBindingV1,
  type FormalTraversalCheckpointSpatialCriterionV1,
  type FormalWorldCaptureRequestV1,
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
  "casePath",
  "evaluationProfilePath",
  "sceneAuthoringAttemptPath",
  "packageDirectoryPath",
  "outputPath",
  "captureProfile",
  "semanticCaptureTargetBindings",
  "topologyRelations",
  "checkpointSpatialCriteria",
] as const;

const CAPTURE_PROFILE_FIELDS = [
  "widthPixels",
  "heightPixels",
  "devicePixelRatio",
] as const;

const TARGET_BINDING_FIELDS = [
  "acceptanceTargetRef",
  "compositionTargetRef",
  "topologyNodeId",
  "semanticLayerId",
  "blockVisualGroupId",
] as const;

export interface FormalWorldCaptureRequestCaptureProfileV1 {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly devicePixelRatio: number;
}

export interface FormalWorldCaptureRequestTargetBindingV1 {
  readonly acceptanceTargetRef: string;
  readonly compositionTargetRef: string;
  readonly topologyNodeId: string;
  readonly semanticLayerId: string;
  readonly blockVisualGroupId: string;
}

export interface MaterializeFormalWorldCaptureRequestInputV1 {
  readonly casePath: string;
  readonly evaluationProfilePath: string;
  readonly sceneAuthoringAttemptPath: string;
  readonly packageDirectoryPath: string;
  readonly outputPath: string;
  readonly captureProfile: FormalWorldCaptureRequestCaptureProfileV1;
  readonly semanticCaptureTargetBindings: readonly FormalWorldCaptureRequestTargetBindingV1[];
  readonly topologyRelations: readonly FormalSemanticTopologyRelationBindingV1[];
  readonly checkpointSpatialCriteria: readonly FormalTraversalCheckpointSpatialCriterionV1[];
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

function worldBounds(
  verifiedPackage: VerifiedBabylonNativeWorldPackageDirectoryV1,
): Readonly<{
  minimumMetersXYZ: readonly [number, number, number];
  maximumMetersXYZ: readonly [number, number, number];
}> {
  const bounds = verifiedPackage.manifest.worldBounds;
  return Object.freeze({
    minimumMetersXYZ: Object.freeze([
      bounds.centerMetersXZ[0] - bounds.sizeMetersXZ[0] / 2,
      bounds.heightRangeMeters[0],
      bounds.centerMetersXZ[1] - bounds.sizeMetersXZ[1] / 2,
    ] as const),
    maximumMetersXYZ: Object.freeze([
      bounds.centerMetersXZ[0] + bounds.sizeMetersXZ[0] / 2,
      bounds.heightRangeMeters[1],
      bounds.centerMetersXZ[1] + bounds.sizeMetersXZ[1] / 2,
    ] as const),
  });
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

function requiredNumber(value: unknown, role: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) writeInvalid(role);
  return value;
}

function requiredString(value: unknown, role: string): string {
  if (typeof value !== "string" || value.length === 0) writeInvalid(role);
  return value;
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
  captureProfile: FormalWorldCaptureRequestCaptureProfileV1,
  verifiedPackage: VerifiedBabylonNativeWorldPackageDirectoryV1,
): FormalWorldCaptureRequestV1["views"] {
  const bounds = worldBounds(verifiedPackage);
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
  const captureProfileSource = exactPlainRecord(
    source.captureProfile,
    CAPTURE_PROFILE_FIELDS,
    "captureProfile",
  );
  const captureProfile: FormalWorldCaptureRequestCaptureProfileV1 = Object.freeze({
    widthPixels: requiredNumber(
      captureProfileSource.widthPixels,
      "captureProfile/widthPixels",
    ),
    heightPixels: requiredNumber(
      captureProfileSource.heightPixels,
      "captureProfile/heightPixels",
    ),
    devicePixelRatio: requiredNumber(
      captureProfileSource.devicePixelRatio,
      "captureProfile/devicePixelRatio",
    ),
  });

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
  if (!(await missing(outputPath))) writeInvalid("outputPath duplicate");

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

  const semanticCaptureTargetBindings = (
    Array.isArray(source.semanticCaptureTargetBindings)
      ? source.semanticCaptureTargetBindings
      : writeInvalid("semanticCaptureTargetBindings")
  ).map((entry, index) => {
    const pathName = `semanticCaptureTargetBindings/${index}`;
    const row = exactPlainRecord(entry, TARGET_BINDING_FIELDS, pathName);
    return Object.freeze({
      acceptanceTargetRef: requiredString(
        row.acceptanceTargetRef,
        `${pathName}/acceptanceTargetRef`,
      ),
      compositionTargetRef: requiredString(
        row.compositionTargetRef,
        `${pathName}/compositionTargetRef`,
      ),
      topologyNodeId: requiredString(row.topologyNodeId, `${pathName}/topologyNodeId`),
      semanticLayerId: requiredString(
        row.semanticLayerId,
        `${pathName}/semanticLayerId`,
      ),
      blockVisualGroupId: requiredString(
        row.blockVisualGroupId,
        `${pathName}/blockVisualGroupId`,
      ),
    });
  });
  const semanticCaptureMap = bindBlockMaterializerMetadataToSemanticCaptureTargetsV1({
    case: reconstructionCase,
    materializerMetadata: verified.nativeBlockMaterializerMetadata,
    materializerMetadataHash: packageIdentity.metadataHash,
    contribution: verified.nativeSceneContribution,
    semanticCaptureTargetBindings,
    topologyRelations: source.topologyRelations as
      MaterializeFormalWorldCaptureRequestInputV1["topologyRelations"],
    checkpointSpatialCriteria: parseFormalTraversalCheckpointSpatialCriteriaV1(
      source.checkpointSpatialCriteria,
    ),
  });
  const semanticCaptureMapHash = hashFormalSemanticCaptureMapV1(semanticCaptureMap);
  const relativeOutput = relativeWithin(caseRoot.requestedPath, outputPath, "outputPath");
  const artifactBase =
    `artifact://world-reconstruction-case/${reconstructionCase.id}`;
  const request = parseFormalWorldCaptureRequestV1({
    kind: "formal-world-capture-request",
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
    views: deriveViews(captureProfile, verified),
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
