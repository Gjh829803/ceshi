import {
  formalWorldCaptureReceiptCanonicalBytesV1,
  hashFormalColliderOverlayObservationV1,
  hashFormalOpeningObservationV1,
  hashFormalScriptedTraversalObservationV1,
  hashFormalSpawnSupportObservationV1,
  hashFormalWorldCaptureRequestV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalSpawnSupportObservationV1,
  parseFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureRequestV1,
  type FormalColliderOverlayObservationV1,
  type FormalOpeningObservationV1,
  type FormalScriptedTraversalObservationV1,
  type FormalSpawnSupportObservationV1,
  type FormalWorldCaptureReceiptV1,
  type FormalWorldCaptureRequestV1,
} from "@whitebox-world/runtime-contracts";
import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import type {
  FormalHostedWorldCapturePayloadV1,
} from "@whitebox-world/runtime-babylon";
import {
  verifyWorldPackageDirectoryV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
  type WorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { isEqual, isNil } from "lodash-es";

import { readWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import {
  createCaptureOnlyHostedTransportStarterV1,
  runCaptureOnlyHostedSessionV1,
  type StartCaptureOnlyHostedTransportV1,
} from "./hosted-session-capture.js";

const MATERIALIZER_METADATA_REF =
  "world-package://native/block-materializer-metadata.json";
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const FORMAL_REQUEST_FILE_NAME = "formal-world-capture-request.json";
const MAXIMUM_PACKAGE_BYTES = 512_000_000;
const MAXIMUM_PACKAGE_FILE_COUNT = 4_096;

export interface JoinedFormalCapturePackageRequestV1 {
  readonly verifiedPackage: VerifiedBabylonNativeWorldPackageDirectoryV1;
  readonly request: FormalWorldCaptureRequestV1;
  readonly formalRequestHash: Sha256HashV1;
}

export interface FormalCaptureArtifactBytesV1 {
  readonly openingPng: Uint8Array;
  readonly worldSidePng: Uint8Array;
  readonly worldTopDownPng: Uint8Array;
  readonly colliderOverlayPng: Uint8Array;
  readonly openingObservationJson: Uint8Array;
  readonly spawnSupportObservationJson: Uint8Array;
  readonly colliderOverlayObservationJson: Uint8Array;
  readonly scriptedTraversalJson: Uint8Array;
}

export interface FormalCaptureArtifactBudgetV1 {
  readonly maximumPngBytesPerArtifact: number;
  readonly maximumJsonBytesPerArtifact: number;
}

export interface FormalCapturePublicationHooksV1 {
  readonly beforeWrite?: (relativePath: string) => Promise<void>;
}

export interface PublishFormalCaptureDirectoryInputV1 {
  readonly outputDirectoryPath: string;
  readonly artifacts: FormalCaptureArtifactBytesV1;
  readonly receiptJson: Uint8Array;
  readonly budget: FormalCaptureArtifactBudgetV1;
  readonly hooks?: FormalCapturePublicationHooksV1;
}

export type {
  FormalHostedWorldCapturePayloadV1,
} from "@whitebox-world/runtime-babylon";

export interface CaptureHostedWorldPackageInputV1 {
  readonly packageDirectoryPath: string;
  readonly outputPath: string;
  readonly triviewOutputPath: string;
  readonly port?: number;
  readonly budget?: FormalCaptureArtifactBudgetV1;
}

export interface CaptureHostedWorldPackagePortsV1 {
  readonly readPackage?: (
    packageDirectoryPath: string,
  ) => Promise<WorldPackageDirectoryV1>;
  readonly startTransport?: StartCaptureOnlyHostedTransportV1<
    FormalHostedWorldCapturePayloadV1,
    FormalWorldCaptureRequestV1
  >;
}

export interface FormalCaptureCommandResultV1 {
  readonly outcome: "completed";
  readonly outputDirectoryPath: string;
  readonly openingOutputPath: string;
  readonly formalRequestHash: Sha256HashV1;
  readonly formalCaptureReceiptHash: Sha256HashV1;
  readonly worldPackageRootHash: Sha256HashV1;
}

function mismatch(pathName: string): never {
  throw new Error(`FORMAL_CAPTURE_PACKAGE_REQUEST_MISMATCH: ${pathName}`);
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

export function assertFormalCaptureRequestMatchesVerifiedPackageV1(
  input: Readonly<{
    verifiedPackage: VerifiedBabylonNativeWorldPackageDirectoryV1;
    request: unknown;
  }>,
): JoinedFormalCapturePackageRequestV1 {
  let request: FormalWorldCaptureRequestV1;
  try {
    request = parseFormalWorldCaptureRequestV1(input.request);
  } catch {
    return mismatch("formalRequest");
  }
  const verifiedPackage = input.verifiedPackage;
  const receipt = verifiedPackage.receipt;
  const source = verifiedPackage.manifest.sceneSource;
  const metadata = verifiedPackage.nativeBlockMaterializerMetadata;
  if (
    isNil(metadata) ||
    source.nativeMaterializer.kind !== "babylon-native-block"
  ) return mismatch("nativeBlockMaterializerMetadata");

  const identityJoins = [
    [request.worldPackageRef, receipt.worldPackageRef, "worldPackageRef"],
    [request.worldPackageRootHash, receipt.worldPackageRootHash, "worldPackageRootHash"],
    [request.worldBuildIdentityHash, receipt.worldBuildIdentityHash, "worldBuildIdentityHash"],
    [request.worldPackageBuildReceiptHash, sha256CanonicalJson(receipt), "worldPackageBuildReceiptHash"],
    [request.sceneAuthoringRouteDecisionRef, verifiedPackage.sceneAuthoringAttempt.sceneAuthoringRouteDecisionRef, "sceneAuthoringRouteDecisionRef"],
    [request.sceneAuthoringRouteDecisionHash, source.sceneAuthoringRouteDecisionHash, "sceneAuthoringRouteDecisionHash"],
    [request.sceneAuthoringAttemptRef, verifiedPackage.sceneAuthoringAttemptResult.sceneAuthoringAttemptRef, "sceneAuthoringAttemptRef"],
    [request.sceneAuthoringAttemptHash, source.sceneAuthoringAttemptHash, "sceneAuthoringAttemptHash"],
    [request.sceneAuthoringAttemptResultRef, source.sceneAuthoringAttemptResultRef, "sceneAuthoringAttemptResultRef"],
    [request.sceneAuthoringAttemptResultHash, source.sceneAuthoringAttemptResultHash, "sceneAuthoringAttemptResultHash"],
    [request.caseHash, metadata.caseHash, "caseHash"],
    [request.semanticCaptureMap.authoringManifestHash, metadata.authoringManifestHash, "semanticCaptureMap/authoringManifestHash"],
    [request.semanticCaptureMap.layoutInventoryHash, metadata.checkedLayoutInventoryHash, "semanticCaptureMap/layoutInventoryHash"],
    [request.semanticCaptureMap.contributionHash, metadata.contributionHash, "semanticCaptureMap/contributionHash"],
    [request.nativeBlockMaterializerMetadataRef, MATERIALIZER_METADATA_REF, "nativeBlockMaterializerMetadataRef"],
    [request.nativeBlockMaterializerMetadataHash, source.nativeMaterializer.metadataHash, "nativeBlockMaterializerMetadataHash"],
  ] as const;
  for (const [actual, expected, pathName] of identityJoins) {
    if (actual !== expected) return mismatch(pathName);
  }

  const expectedBindings = metadata.visualGroups.map((group) => ({
    acceptanceTargetRef: group.acceptanceTargetRef,
    blockVisualGroupId: group.visualGroupId,
    semanticClassId: group.semanticClassId,
    identityColor: group.identityColorHex,
    authoringManifestHash: metadata.authoringManifestHash,
    layoutInventoryHash: metadata.checkedLayoutInventoryHash,
    contributionHash: metadata.contributionHash,
  })).sort((left, right) =>
    left.blockVisualGroupId.localeCompare(right.blockVisualGroupId));
  const requestBindings = request.semanticCaptureMap.bindings.map((binding) => ({
    acceptanceTargetRef: binding.acceptanceTargetRef,
    blockVisualGroupId: binding.blockVisualGroupId,
    semanticClassId: binding.semanticClassId,
    identityColor: binding.identityColor,
    authoringManifestHash: binding.authoringManifestHash,
    layoutInventoryHash: binding.layoutInventoryHash,
    contributionHash: binding.contributionHash,
  })).sort((left, right) =>
    left.blockVisualGroupId.localeCompare(right.blockVisualGroupId));
  if (!isEqual(requestBindings, expectedBindings)) {
    return mismatch("semanticCaptureMap/bindings");
  }

  const expectedWorldBounds = worldBounds(verifiedPackage);
  const [opening, worldSide, worldTopDown] = request.views;
  if (
    !isEqual(worldSide.worldBoundsMeters, expectedWorldBounds) ||
    !isEqual(worldTopDown.worldBoundsMeters, expectedWorldBounds)
  ) return mismatch("views/worldBoundsMeters");
  const viewports = request.views.map((view) => ({
    widthPixels: view.widthPixels,
    heightPixels: view.heightPixels,
    devicePixelRatio: view.devicePixelRatio,
  }));
  if (!viewports.every((viewport) => isEqual(viewport, viewports[0]))) {
    return mismatch("views/viewport");
  }
  if (
    opening.viewId !== "opening" ||
    worldSide.viewId !== "world-side" ||
    worldTopDown.viewId !== "world-top-down"
  ) return mismatch("views");

  return Object.freeze({
    verifiedPackage,
    request,
    formalRequestHash: hashFormalWorldCaptureRequestV1(request),
  });
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`FORMAL_CAPTURE_ARTIFACT_BUDGET_INVALID: ${name}`);
  }
}

function assertPng(bytes: Uint8Array, maximumBytes: number, name: string): void {
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`FORMAL_CAPTURE_PNG_BUDGET_EXCEEDED: ${name}`);
  }
  if (
    bytes.byteLength < PNG_SIGNATURE.byteLength ||
    PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
  ) throw new Error(`FORMAL_CAPTURE_PNG_INVALID: ${name}`);
}

function assertJson(bytes: Uint8Array, maximumBytes: number, name: string): void {
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    throw new Error(`FORMAL_CAPTURE_JSON_BUDGET_EXCEEDED: ${name}`);
  }
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

function defaultBudget(): FormalCaptureArtifactBudgetV1 {
  return Object.freeze({
    maximumPngBytesPerArtifact: 64_000_000,
    maximumJsonBytesPerArtifact: 16_000_000,
  });
}

function exactAbsolutePath(value: string, role: string): string {
  const resolved = path.resolve(value);
  if (
    !path.isAbsolute(value) ||
    value !== resolved ||
    path.parse(value).root === value
  ) throw new Error(`FORMAL_CAPTURE_PATH_INVALID: ${role}`);
  return value;
}

function assertPayloadArtifactHashes(
  payload: FormalHostedWorldCapturePayloadV1,
  receipt: FormalWorldCaptureReceiptV1,
): void {
  const pngHashes = new Map([
    ["opening", sha256Bytes(payload.openingPng)],
    ["world-side", sha256Bytes(payload.worldSidePng)],
    ["world-top-down", sha256Bytes(payload.worldTopDownPng)],
  ]);
  for (const view of receipt.views) {
    if (pngHashes.get(view.viewId) !== view.pngContentHash) {
      mismatch(`views/${view.viewId}/pngContentHash`);
    }
  }
  if (
    sha256Bytes(payload.colliderOverlayPng) !==
      receipt.colliderOverlayPngContentHash ||
    hashFormalOpeningObservationV1(payload.openingObservation) !==
      receipt.openingObservationContentHash ||
    hashFormalSpawnSupportObservationV1(payload.spawnSupportObservation) !==
      receipt.spawnSupportObservationContentHash ||
    hashFormalColliderOverlayObservationV1(payload.colliderOverlayObservation) !==
      receipt.colliderOverlayObservationContentHash ||
    hashFormalScriptedTraversalObservationV1(payload.scriptedTraversal) !==
      receipt.scriptedTraversalContentHash
  ) mismatch("artifactContentHash");
}

function validateHostedPayload(
  payload: FormalHostedWorldCapturePayloadV1,
  joined: JoinedFormalCapturePackageRequestV1,
): Readonly<{
  artifacts: FormalCaptureArtifactBytesV1;
  receipt: FormalWorldCaptureReceiptV1;
  receiptJson: Uint8Array;
}> {
  if (Object.hasOwn(payload.receiptWithoutCleanup, "cleanupOutcome")) {
    return mismatch("receiptWithoutCleanup/cleanupOutcome");
  }
  const openingObservation = parseFormalOpeningObservationV1(
    payload.openingObservation,
  );
  const spawnSupportObservation = parseFormalSpawnSupportObservationV1(
    payload.spawnSupportObservation,
  );
  const colliderOverlayObservation =
    parseFormalColliderOverlayObservationV1(payload.colliderOverlayObservation);
  const scriptedTraversal = parseFormalScriptedTraversalObservationV1(
    payload.scriptedTraversal,
  );
  const receipt = parseFormalWorldCaptureReceiptV1({
    ...payload.receiptWithoutCleanup,
    cleanupOutcome: "completed",
  });
  if (
    receipt.formalRequestHash !== joined.formalRequestHash ||
    !isEqual(receipt.formalRequest, joined.request) ||
    receipt.worldPackageRootHash !==
      joined.verifiedPackage.receipt.worldPackageRootHash
  ) mismatch("receipt/formalRequest");
  assertPayloadArtifactHashes(payload, receipt);
  return Object.freeze({
    artifacts: Object.freeze({
      openingPng: new Uint8Array(payload.openingPng),
      worldSidePng: new Uint8Array(payload.worldSidePng),
      worldTopDownPng: new Uint8Array(payload.worldTopDownPng),
      colliderOverlayPng: new Uint8Array(payload.colliderOverlayPng),
      openingObservationJson: canonicalJsonBytes(openingObservation),
      spawnSupportObservationJson: canonicalJsonBytes(spawnSupportObservation),
      colliderOverlayObservationJson:
        canonicalJsonBytes(colliderOverlayObservation),
      scriptedTraversalJson: canonicalJsonBytes(scriptedTraversal),
    }),
    receipt,
    receiptJson: formalWorldCaptureReceiptCanonicalBytesV1(receipt),
  });
}

async function readAndJoinPackageRequest(
  packageDirectoryPath: string,
  readPackage: NonNullable<CaptureHostedWorldPackagePortsV1["readPackage"]>,
): Promise<JoinedFormalCapturePackageRequestV1> {
  const directory = await readPackage(packageDirectoryPath);
  const verified = verifyWorldPackageDirectoryV1(directory);
  if (verified.kind !== "babylon-native-scene") {
    throw new Error("FORMAL_CAPTURE_NATIVE_PACKAGE_REQUIRED");
  }
  const formalRequestPath = path.join(
    path.dirname(packageDirectoryPath),
    FORMAL_REQUEST_FILE_NAME,
  );
  const requestBytes = new Uint8Array(await readFile(formalRequestPath));
  let requestValue: unknown;
  try {
    requestValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
      requestBytes,
    ));
  } catch {
    throw new Error("FORMAL_CAPTURE_REQUEST_FILE_INVALID");
  }
  return assertFormalCaptureRequestMatchesVerifiedPackageV1({
    verifiedPackage: verified,
    request: requestValue,
  });
}

export async function captureHostedWorldPackageV1(
  input: CaptureHostedWorldPackageInputV1,
  ports: CaptureHostedWorldPackagePortsV1 = {},
): Promise<FormalCaptureCommandResultV1> {
  const packageDirectoryPath = exactAbsolutePath(
    input.packageDirectoryPath,
    "packageDirectoryPath",
  );
  const outputPath = exactAbsolutePath(input.outputPath, "outputPath");
  const triviewOutputPath = exactAbsolutePath(
    input.triviewOutputPath,
    "triviewOutputPath",
  );
  if (outputPath !== path.join(triviewOutputPath, "opening.png")) {
    throw new Error("FORMAL_CAPTURE_OUTPUT_TOPOLOGY_INVALID");
  }
  if (!(await missing(triviewOutputPath))) {
    throw new Error("FORMAL_CAPTURE_OUTPUT_ALREADY_EXISTS");
  }

  // The verified Package + parsed formal Request join is complete before the
  // capture-only transport can allocate a server, Browser, or Runtime session.
  const joined = await readAndJoinPackageRequest(
    packageDirectoryPath,
    ports.readPackage ?? (async (directoryPath) =>
      readWorldPackageDirectoryV1({
        packageDirectoryPath: directoryPath,
        maximumTotalBytes: MAXIMUM_PACKAGE_BYTES,
        maximumFileCount: MAXIMUM_PACKAGE_FILE_COUNT,
      })),
  );
  const startTransport = ports.startTransport ??
    createCaptureOnlyHostedTransportStarterV1({
      packageDirectoryPath,
      ...(input.port === undefined ? {} : { port: input.port }),
    });
  const payload = await runCaptureOnlyHostedSessionV1({
    request: joined.request,
    startTransport,
  });
  // runCaptureOnlyHostedSessionV1 returns only after complete Host cleanup.
  const validated = validateHostedPayload(payload, joined);
  await publishFormalCaptureDirectoryV1({
    outputDirectoryPath: triviewOutputPath,
    artifacts: validated.artifacts,
    receiptJson: validated.receiptJson,
    budget: input.budget ?? defaultBudget(),
  });
  return Object.freeze({
    outcome: "completed",
    outputDirectoryPath: triviewOutputPath,
    openingOutputPath: outputPath,
    formalRequestHash: joined.formalRequestHash,
    formalCaptureReceiptHash:
      sha256CanonicalJson(validated.receipt) as Sha256HashV1,
    worldPackageRootHash: joined.verifiedPackage.receipt.worldPackageRootHash,
  });
}

export async function publishFormalCaptureDirectoryV1(
  input: PublishFormalCaptureDirectoryInputV1,
): Promise<void> {
  const outputDirectoryPath = path.resolve(input.outputDirectoryPath);
  if (
    !path.isAbsolute(input.outputDirectoryPath) ||
    outputDirectoryPath !== input.outputDirectoryPath ||
    path.parse(outputDirectoryPath).root === outputDirectoryPath
  ) throw new Error("FORMAL_CAPTURE_OUTPUT_DIRECTORY_INVALID");
  positiveInteger(
    input.budget.maximumPngBytesPerArtifact,
    "maximumPngBytesPerArtifact",
  );
  positiveInteger(
    input.budget.maximumJsonBytesPerArtifact,
    "maximumJsonBytesPerArtifact",
  );

  const rows = [
    ["opening.png", input.artifacts.openingPng, "png"],
    ["world-side.png", input.artifacts.worldSidePng, "png"],
    ["world-top-down.png", input.artifacts.worldTopDownPng, "png"],
    ["collider-overlay.png", input.artifacts.colliderOverlayPng, "png"],
    ["opening-observation.json", input.artifacts.openingObservationJson, "json"],
    ["spawn-support-observation.json", input.artifacts.spawnSupportObservationJson, "json"],
    ["collider-overlay-observation.json", input.artifacts.colliderOverlayObservationJson, "json"],
    ["scripted-traversal.json", input.artifacts.scriptedTraversalJson, "json"],
  ] as const;
  for (const [relativePath, bytes, kind] of rows) {
    if (kind === "png") {
      assertPng(
        bytes,
        input.budget.maximumPngBytesPerArtifact,
        relativePath,
      );
    } else {
      assertJson(
        bytes,
        input.budget.maximumJsonBytesPerArtifact,
        relativePath,
      );
    }
  }
  assertJson(
    input.receiptJson,
    input.budget.maximumJsonBytesPerArtifact,
    "formal-world-capture-receipt.json",
  );
  if (!(await missing(outputDirectoryPath))) {
    throw new Error("FORMAL_CAPTURE_OUTPUT_ALREADY_EXISTS");
  }

  const parentDirectoryPath = path.dirname(outputDirectoryPath);
  await mkdir(parentDirectoryPath, { recursive: true, mode: 0o700 });
  const stagingDirectoryPath = await mkdtemp(path.join(
    parentDirectoryPath,
    `.${path.basename(outputDirectoryPath)}.formal-capture-`,
  ));
  let published = false;
  try {
    for (const [relativePath, bytes] of rows) {
      await input.hooks?.beforeWrite?.(relativePath);
      await writeFile(path.join(stagingDirectoryPath, relativePath), bytes, {
        flag: "wx",
        mode: 0o600,
      });
    }
    const receiptPath = "formal-world-capture-receipt.json";
    await input.hooks?.beforeWrite?.(receiptPath);
    await writeFile(path.join(stagingDirectoryPath, receiptPath), input.receiptJson, {
      flag: "wx",
      mode: 0o600,
    });
    if (!(await missing(outputDirectoryPath))) {
      throw new Error("FORMAL_CAPTURE_OUTPUT_ALREADY_EXISTS");
    }
    await rename(stagingDirectoryPath, outputDirectoryPath);
    published = true;
  } finally {
    if (!published) {
      await rm(stagingDirectoryPath, { recursive: true, force: true });
    }
  }
}
