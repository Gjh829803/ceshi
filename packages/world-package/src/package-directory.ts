import {
  hashAuthoringDocumentV4,
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileCanonicalWorldV1 } from "@whitebox-world/compiler";
import { parseGameplayBootstrapV1, type GameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import { hashLayoutSolveReportV1, type LayoutSolveReportV1 } from "@whitebox-world/layout-solver";
import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashBabylonNativeAssetLockV1,
  hashBabylonNativeDependencyLockV1,
  hashBabylonNativeSceneContributionV1,
  hashBabylonNativeBlockMaterializerMetadataV1,
  hashBabylonNativeSceneBootstrapV1,
  hashNativeSceneCheckResultV1,
  nativeSceneModuleBundleRefFromHashV1,
  parseBabylonNativeAssetLockV1,
  parseBabylonNativeDependencyLockV1,
  parseBabylonNativeSceneBootstrapV1,
  parseBabylonNativeSceneContributionV1,
  parseBabylonNativeBlockMaterializerMetadataV1,
  parseBabylonNativeSceneModuleBundleManifestV1,
  parseNativeSceneCheckResultV1,
  worldResourceLockEntriesV1,
  hashCanonicalSceneExecutionPlanV1,
  parseCanonicalSceneExecutionPlanV1,
  parseWorldRuntimeBootstrapV1,
  type BabylonNativeAssetLockV1,
  type BabylonNativeDependencyLockV1,
  type BabylonNativeSceneBootstrapV1,
  type BabylonNativeSceneContributionV1,
  type BabylonNativeBlockMaterializerMetadataV1,
  type BabylonNativeSceneModuleBundleManifestV1,
  type NativeSceneCheckResultV1,
  type NativeSceneModuleBundleRefV1,
  type WorldResourceLockEntryV1,
  type CanonicalSceneExecutionPlanV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashSceneAuthoringAttemptResultV1,
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  parseSceneAuthoringAttemptResultV1,
  parseSceneAuthoringAttemptV1,
  parseSceneAuthoringRouteDecisionV1,
  type SceneAuthoringAttemptResultV1,
  type SceneAuthoringAttemptV1,
  type SceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
import { getNodeValue, parseTree, type Node, type ParseError } from "jsonc-parser";
import { isEqual, isNil } from "lodash-es";

import {
  assertBabylonNativeWorldPackageMembershipV1,
  assertWorldPackageBuildReceiptV1,
  assertCanonicalWorldPackageGameplayBootstrapMembershipV1,
  canonicalizeWorldPackageFileIntegrityEntriesV1,
  hashWorldPackageManifestV1,
  hashWorldPackageRootV1,
} from "./package-contract.js";
import type {
  BabylonNativeWorldPackageBuildReceiptV1,
  BabylonNativeWorldPackageManifestV1,
  CanonicalWorldPackageBuildReceiptV1,
  WorldPackageBuildReceiptV1,
} from "./package-types.js";

const INTEGRITY_PATH = "integrity.json";
const RECEIPT_PATH = "world-package-build-receipt.json";
const IDENTITY_PATH = "world-build-identity.json";
const TRANSPORT_PATHS = new Set([INTEGRITY_PATH, RECEIPT_PATH, IDENTITY_PATH]);
const JSON_MEDIA_TYPE = "application/json";

export interface WorldPackageDirectoryFileV1 {
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface WorldPackageDirectoryV1 {
  readonly receipt: WorldPackageBuildReceiptV1;
  readonly files: readonly WorldPackageDirectoryFileV1[];
  readonly signatureFiles: readonly WorldPackageDirectoryFileV1[];
}

export interface VerifiedCanonicalWorldPackageDirectoryV1 {
  readonly kind: "canonical-execution-plan";
  readonly receipt: CanonicalWorldPackageBuildReceiptV1;
  readonly authoringSpec?: AuthoringSpecV4;
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly registryLock: readonly WorldResourceLockEntryV1[];
  readonly layoutSolveReport: LayoutSolveReportV1;
  readonly executionPlan: CanonicalSceneExecutionPlanV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly resourceBytesByRef: ReadonlyMap<string, Uint8Array>;
  readonly signatureFiles: readonly WorldPackageDirectoryFileV1[];
}

export interface VerifiedBabylonNativeWorldPackageDirectoryV1 {
  readonly kind: "babylon-native-scene";
  readonly directory: WorldPackageDirectoryV1;
  readonly manifest: BabylonNativeWorldPackageManifestV1;
  readonly receipt: BabylonNativeWorldPackageBuildReceiptV1;
  readonly bootstrap: BabylonNativeSceneBootstrapV1;
  readonly sceneModuleBundleManifest:
    BabylonNativeSceneModuleBundleManifestV1;
  readonly sceneModuleBundleBytes: Uint8Array;
  readonly sceneModuleBundleHash: Sha256HashV1;
  readonly sceneModuleBundleRef: NativeSceneModuleBundleRefV1;
  readonly dependencyLock: BabylonNativeDependencyLockV1;
  readonly assetLock: BabylonNativeAssetLockV1;
  readonly sceneAuthoringRouteDecision: SceneAuthoringRouteDecisionV1;
  readonly sceneAuthoringAttempt: SceneAuthoringAttemptV1;
  readonly sceneAuthoringAttemptResult: Extract<
    SceneAuthoringAttemptResultV1,
    { readonly outcome: "completed" }
  >;
  readonly nativeSceneCheckResult: NativeSceneCheckResultV1 & {
    readonly outcome: "passed";
  };
  readonly nativeSceneContribution: BabylonNativeSceneContributionV1;
  readonly nativeBlockMaterializerMetadata?:
    BabylonNativeBlockMaterializerMetadataV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly registryLock: readonly WorldResourceLockEntryV1[];
  readonly immutableAssetBytesByResourceRef:
    ReadonlyMap<string, Uint8Array>;
  readonly signatureFiles: readonly WorldPackageDirectoryFileV1[];
}

export type VerifiedWorldPackageDirectoryV1 =
  | VerifiedCanonicalWorldPackageDirectoryV1
  | VerifiedBabylonNativeWorldPackageDirectoryV1;

export interface AssembleWorldPackageDirectoryV1Input {
  readonly receipt: WorldPackageBuildReceiptV1;
  readonly files: readonly WorldPackageDirectoryFileV1[];
  readonly signatureFiles?: readonly WorldPackageDirectoryFileV1[];
}

class ImmutableByteMap implements ReadonlyMap<string, Uint8Array> {
  readonly #source: ReadonlyMap<string, Uint8Array>;
  readonly size: number;
  constructor(source: ReadonlyMap<string, Uint8Array>) {
    this.#source = new Map([...source].map(([key, bytes]) => [key, new Uint8Array(bytes)]));
    this.size = this.#source.size;
    Object.freeze(this);
  }
  get(key: string): Uint8Array | undefined { const bytes = this.#source.get(key); return isNil(bytes) ? undefined : new Uint8Array(bytes); }
  has(key: string): boolean { return this.#source.has(key); }
  entries(): MapIterator<[string, Uint8Array]> { return new Map([...this.#source].map(([key, bytes]) => [key, new Uint8Array(bytes)])).entries(); }
  keys(): MapIterator<string> { return new Map(this.#source).keys(); }
  values(): MapIterator<Uint8Array> { return new Map([...this.#source].map(([key, bytes]) => [key, new Uint8Array(bytes)])).values(); }
  forEach(callback: (value: Uint8Array, key: string, map: ReadonlyMap<string, Uint8Array>) => void, thisArg?: unknown): void {
    for (const [key, bytes] of this.#source) callback.call(thisArg, new Uint8Array(bytes), key, this);
  }
  [Symbol.iterator](): MapIterator<[string, Uint8Array]> { return this.entries(); }
}

function invalid(path: string, message: string): never {
  throw new Error(`WORLD_PACKAGE_DIRECTORY_INVALID: ${path.length === 0 ? message : `${path}: ${message}`}`);
}

function requireSafePath(value: unknown, role: "root" | "directory" | "signature", path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || value.normalize("NFC") !== value) invalid(path, "path is invalid");
  const segments = value.split("/");
  if (value.startsWith("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value) || segments.some((segment) => segment.length === 0 || segment === "." || segment === ".." || segment.includes(":"))) invalid(path, "path is unsafe");
  const signature = value.startsWith("signatures/");
  if (role === "signature") {
    if (!signature || segments.length !== 2) invalid(path, "signature path is invalid");
  } else if (signature) invalid(path, "signature must use signatureFiles");
  if (role === "root" && TRANSPORT_PATHS.has(value)) invalid(path, "transport metadata cannot enter the Root inventory");
  return value;
}

function canonicalFiles(input: unknown, role: "root" | "directory" | "signature", path: string): readonly WorldPackageDirectoryFileV1[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) invalid(path, "must be an array");
  const rows = input.map((candidate, index) => {
    if (typeof candidate !== "object" || isNil(candidate) || Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype) invalid(`${path}/${index}`, "must be a plain object");
    const record = candidate as Record<string, unknown>;
    if (!isEqual(Object.keys(record).sort(), ["bytes", "mediaType", "path"])) invalid(`${path}/${index}`, "must have exact keys");
    if (typeof record.mediaType !== "string" || record.mediaType.length === 0) invalid(`${path}/${index}/mediaType`, "is invalid");
    if (!(record.bytes instanceof Uint8Array) || Object.getPrototypeOf(record.bytes) !== Uint8Array.prototype) invalid(`${path}/${index}/bytes`, "must be a plain Uint8Array");
    return Object.freeze({
      path: requireSafePath(record.path, role, `${path}/${index}/path`),
      mediaType: record.mediaType,
      bytes: new Uint8Array(record.bytes),
    });
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(rows.map((row) => row.path)).size !== rows.length) invalid(path, "paths must be unique");
  return Object.freeze(rows);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function findDuplicateKeys(node: Node): boolean {
  if (node.type === "object") {
    const keys = new Set<string>();
    for (const property of node.children ?? []) {
      const keyNode = property.children?.[0];
      const valueNode = property.children?.[1];
      if (isNil(keyNode) || isNil(valueNode)) return true;
      const key = String(getNodeValue(keyNode));
      if (keys.has(key) || findDuplicateKeys(valueNode)) return true;
      keys.add(key);
    }
  } else if (node.type === "array" && (node.children ?? []).some(findDuplicateKeys)) return true;
  return false;
}

function parseCanonicalJson(file: WorldPackageDirectoryFileV1): unknown {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes); } catch { invalid(file.path, "must be UTF-8"); }
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { allowEmptyContent: false, allowTrailingComma: false, disallowComments: true });
  if (isNil(root) || errors.length > 0 || findDuplicateKeys(root)) invalid(file.path, "must contain duplicate-free JSON");
  let value: unknown;
  try { value = JSON.parse(text); } catch { invalid(file.path, "must contain JSON"); }
  if (!equalBytes(file.bytes, canonicalJsonBytes(value))) invalid(file.path, "must equal canonical JSON bytes");
  return value;
}

function fileByPath(files: readonly WorldPackageDirectoryFileV1[]): ReadonlyMap<string, WorldPackageDirectoryFileV1> {
  return new Map(files.map((file) => [file.path, file]));
}

function requireFile(files: ReadonlyMap<string, WorldPackageDirectoryFileV1>, path: string): WorldPackageDirectoryFileV1 {
  const file = files.get(path);
  if (isNil(file)) invalid(path, "is missing");
  return file;
}

function assertExactRootPaths(
  receipt: WorldPackageBuildReceiptV1,
  allowedPaths: ReadonlySet<string>,
): void {
  const actualPaths = new Set(
    receipt.fileIntegrityEntries.map(({ path }) => path),
  );
  if (
    actualPaths.size !== allowedPaths.size ||
    [...actualPaths].some((path) => !allowedPaths.has(path))
  ) invalid("receipt/fileIntegrityEntries", "scene source Root path closure failed");
}

function resourceVersion(resourceRef: string): string {
  const match = /@([1-9][0-9]*)$/.exec(resourceRef);
  if (isNil(match?.[1])) invalid("registry-lock.json", "resource ref has no version");
  return match[1];
}

function positionInsideBounds(
  position: readonly number[],
  receipt: BabylonNativeWorldPackageBuildReceiptV1,
): boolean {
  const bounds = receipt.manifest.worldBounds;
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

function assertNativeWorldFacts(
  receipt: BabylonNativeWorldPackageBuildReceiptV1,
  bootstrap: BabylonNativeSceneBootstrapV1,
  contribution: BabylonNativeSceneContributionV1,
): void {
  const budget = receipt.manifest.resourceBudget;
  const vertexCount = contribution.staticColliders.reduce(
    (sum, collider) => sum + collider.vertexCount,
    0,
  );
  const triangleCount = contribution.staticColliders.reduce(
    (sum, collider) => sum + collider.triangleCount,
    0,
  );
  if (
    contribution.spawnMarker.id !== bootstrap.spawnMarkerId ||
    !positionInsideBounds(contribution.spawnMarker.positionMetersXYZ, receipt) ||
    contribution.staticColliders.length > budget.maximumColliders ||
    vertexCount > budget.maximumVertices ||
    triangleCount > budget.maximumTriangles ||
    contribution.staticColliders.some((collider) => {
      for (let index = 0; index < collider.worldPositionsMetersXYZ.length; index += 3) {
        if (!positionInsideBounds(
          collider.worldPositionsMetersXYZ.slice(index, index + 3),
          receipt,
        )) return true;
      }
      return false;
    })
  ) invalid("native/contribution.json", "world bounds or budget closure failed");
}

function verifyNativeDirectory(
  receipt: BabylonNativeWorldPackageBuildReceiptV1,
  files: readonly WorldPackageDirectoryFileV1[],
  filesByPath: ReadonlyMap<string, WorldPackageDirectoryFileV1>,
  signatureFiles: readonly WorldPackageDirectoryFileV1[],
): VerifiedBabylonNativeWorldPackageDirectoryV1 {
  const manifest = receipt.manifest;
  const source = manifest.sceneSource;
  const fixedPaths = new Set<string>([
    "manifest.json",
    "registry-lock.json",
    manifest.entryPoint.gameplayBootstrapPath,
    manifest.entryPoint.worldRuntimeBootstrapPath,
    source.nativeSceneBootstrapPath,
    source.sceneModuleBundleManifestPath,
    source.sceneModuleBundlePath,
    source.dependencyLockPath,
    source.assetLockPath,
    source.nativeSceneContributionPath,
    source.nativeSceneCheckResultPath,
    source.sceneAuthoringRouteDecisionPath,
    source.sceneAuthoringAttemptPath,
    source.sceneAuthoringAttemptResultPath,
    manifest.legal.noticePath,
    ...manifest.legal.licenseDocuments.map(({ path }) => path),
    ...manifest.resources.map(({ packagePath }) => packagePath),
    ...(source.nativeMaterializer.kind === "babylon-native-block"
      ? [source.nativeMaterializer.metadataPath]
      : []),
  ]);
  assertExactRootPaths(receipt, fixedPaths);

  const nativeSceneBootstrap = parseBabylonNativeSceneBootstrapV1(
    parseCanonicalJson(requireFile(filesByPath, source.nativeSceneBootstrapPath)),
  );
  const sceneModuleBundleManifest =
    parseBabylonNativeSceneModuleBundleManifestV1(
      parseCanonicalJson(requireFile(
        filesByPath,
        source.sceneModuleBundleManifestPath,
      )),
    );
  const sceneModuleBundleFile = requireFile(
    filesByPath,
    source.sceneModuleBundlePath,
  );
  const sceneModuleBundleBytes = new Uint8Array(sceneModuleBundleFile.bytes);
  const dependencyLock = parseBabylonNativeDependencyLockV1(
    parseCanonicalJson(requireFile(filesByPath, source.dependencyLockPath)),
  );
  const assetLock = parseBabylonNativeAssetLockV1(
    parseCanonicalJson(requireFile(filesByPath, source.assetLockPath)),
  );
  const sceneAuthoringRouteDecision = parseSceneAuthoringRouteDecisionV1(
    parseCanonicalJson(requireFile(
      filesByPath,
      source.sceneAuthoringRouteDecisionPath,
    )),
  );
  const sceneAuthoringAttempt = parseSceneAuthoringAttemptV1(
    parseCanonicalJson(requireFile(filesByPath, source.sceneAuthoringAttemptPath)),
  );
  const sceneAuthoringAttemptResult = parseSceneAuthoringAttemptResultV1(
    parseCanonicalJson(requireFile(
      filesByPath,
      source.sceneAuthoringAttemptResultPath,
    )),
  );
  const nativeSceneCheckResult = parseNativeSceneCheckResultV1(
    parseCanonicalJson(requireFile(filesByPath, source.nativeSceneCheckResultPath)),
  );
  const nativeSceneContribution = parseBabylonNativeSceneContributionV1(
    parseCanonicalJson(requireFile(filesByPath, source.nativeSceneContributionPath)),
  );
  const nativeBlockMaterializerMetadata =
    source.nativeMaterializer.kind === "babylon-native-block"
      ? parseBabylonNativeBlockMaterializerMetadataV1(
        parseCanonicalJson(requireFile(
          filesByPath,
          source.nativeMaterializer.metadataPath,
        )),
      )
      : undefined;
  const gameplayBootstrap = parseGameplayBootstrapV1(
    parseCanonicalJson(requireFile(
      filesByPath,
      manifest.entryPoint.gameplayBootstrapPath,
    )),
  );
  const worldRuntimeBootstrap = parseWorldRuntimeBootstrapV1(
    parseCanonicalJson(requireFile(
      filesByPath,
      manifest.entryPoint.worldRuntimeBootstrapPath,
    )),
  );
  const registryLock = worldResourceLockEntriesV1(
    parseCanonicalJson(requireFile(filesByPath, "registry-lock.json")),
  );

  if (
    sceneModuleBundleFile.mediaType !== sceneModuleBundleManifest.bundleMediaType ||
    sceneModuleBundleBytes.byteLength !== sceneModuleBundleManifest.bundleSizeBytes ||
    sha256Bytes(sceneModuleBundleBytes) !== source.sceneModuleBundleHash ||
    sceneModuleBundleManifest.bundleContentHash !== source.sceneModuleBundleHash ||
    sceneModuleBundleManifest.sceneModuleBundleRef !==
      nativeSceneModuleBundleRefFromHashV1(source.sceneModuleBundleHash) ||
    hashBabylonNativeSceneBootstrapV1(nativeSceneBootstrap) !==
      source.nativeSceneBootstrapHash ||
    hashBabylonNativeSceneContributionV1(nativeSceneContribution) !==
      source.nativeSceneContributionHash ||
    hashBabylonNativeDependencyLockV1(dependencyLock) !==
      source.dependencyLockHash ||
    hashBabylonNativeAssetLockV1(assetLock) !== source.assetLockHash ||
    hashNativeSceneCheckResultV1(nativeSceneCheckResult) !==
      source.nativeSceneCheckResultHash ||
    hashSceneAuthoringRouteDecisionV1(sceneAuthoringRouteDecision) !==
      source.sceneAuthoringRouteDecisionHash ||
    hashSceneAuthoringAttemptV1(sceneAuthoringAttempt) !==
      source.sceneAuthoringAttemptHash ||
    hashSceneAuthoringAttemptResultV1(sceneAuthoringAttemptResult) !==
      source.sceneAuthoringAttemptResultHash ||
    gameplayBootstrap.contentHash !== manifest.gameplayBootstrapHash ||
    worldRuntimeBootstrap.contentHash !== manifest.worldRuntimeBootstrapHash ||
    sha256CanonicalJson(registryLock) !== manifest.registryLockHash ||
    !isEqual(registryLock, manifest.lockedResources)
  ) invalid("manifest.json", "Native component hashes do not match parsed files");

  if (
    source.nativeMaterializer.kind === "babylon-native-block" &&
    (
      isNil(nativeBlockMaterializerMetadata) ||
      hashBabylonNativeBlockMaterializerMetadataV1(
        nativeBlockMaterializerMetadata,
      ) !== source.nativeMaterializer.metadataHash
    )
  ) invalid("manifest.json", "Native Block materializer metadata hash mismatch");

  assertBabylonNativeWorldPackageMembershipV1({
    nativeSceneBootstrap,
    sceneModuleBundleManifest,
    dependencyLock,
    assetLock,
    sceneAuthoringRouteDecision,
    sceneAuthoringAttempt,
    sceneAuthoringAttemptResult,
    nativeSceneCheckResult,
    nativeSceneContribution,
    ...(isNil(nativeBlockMaterializerMetadata)
      ? {}
      : { nativeBlockMaterializerMetadata }),
    gameplayBootstrap,
    worldRuntimeBootstrap,
    worldPackageBuildReceipt: receipt,
  });
  if (
    sceneAuthoringAttemptResult.outcome !== "completed" ||
    nativeSceneCheckResult.outcome !== "passed"
  ) invalid("manifest.json", "Native admission outcome is not accepted");
  const completedAttemptResult = sceneAuthoringAttemptResult as Extract<
    SceneAuthoringAttemptResultV1,
    { readonly outcome: "completed" }
  >;
  const passedCheckResult = nativeSceneCheckResult as NativeSceneCheckResultV1 & {
    readonly outcome: "passed";
  };
  assertNativeWorldFacts(receipt, nativeSceneBootstrap, nativeSceneContribution);

  const worldRuntimeRows = registryLock.filter((entry) =>
    entry.resourceKind === "world-runtime-bootstrap" &&
    entry.contentHash === worldRuntimeBootstrap.contentHash);
  if (worldRuntimeRows.length !== 1) {
    invalid("registry-lock.json", "must contain one World Runtime Bootstrap");
  }
  const traversalRefs = new Set(nativeSceneContribution.staticColliders.flatMap(
    (collider) => collider.traversalBinding.kind === "static-surface"
      ? [collider.traversalBinding.traversalSurfaceProfileRef]
      : [],
  ));
  const traversalRows = [...traversalRefs].map((resourceRef) => {
    const rows = registryLock.filter((entry) =>
      entry.resourceKind === "traversal-surface-profile" &&
      entry.resourceRef === resourceRef);
    if (rows.length !== 1) {
      invalid("registry-lock.json", "traversal profile closure mismatch");
    }
    return rows[0]!;
  });
  const expectedRegistryLock = worldResourceLockEntriesV1([
    ...worldRuntimeBootstrap.runtimeResourceLockEntries,
    worldRuntimeRows[0]!,
    {
      resourceKind: "native-scene",
      resourceRef: sceneModuleBundleManifest.sceneModuleRef,
      resolvedVersion: resourceVersion(sceneModuleBundleManifest.sceneModuleRef),
      contentHash: sceneModuleBundleManifest.sourceGraphHash,
    },
    {
      resourceKind: "native-scene-api",
      ...sceneModuleBundleManifest.nativeSceneApi,
    },
    {
      resourceKind: "native-scene-profile",
      ...sceneModuleBundleManifest.nativeSceneProfile,
    },
    ...assetLock.entries.map((asset) => ({
      resourceKind: "static-geometry-asset" as const,
      resourceRef: asset.assetResourceRef,
      resolvedVersion: resourceVersion(asset.assetResourceRef),
      contentHash: asset.resourceManifestHash,
    })),
    ...traversalRows,
  ]);
  if (!isEqual(registryLock, expectedRegistryLock)) {
    invalid("registry-lock.json", "must equal exact Native transitive closure");
  }

  const licenseByPath = new Map(manifest.legal.licenseDocuments.map((document) =>
    [document.path, document] as const));
  const expectedResources = assetLock.entries.map((asset) => {
    const license = licenseByPath.get(asset.license.licenseDocumentPath as `LICENSES/${string}`);
    if (isNil(license) || license.spdxLicenseExpression !== asset.license.spdxExpression) {
      invalid(asset.artifactPath, "asset legal closure mismatch");
    }
    return {
      resourceRef: asset.assetResourceRef,
      packagePath: asset.artifactPath,
      mediaType: asset.mediaType,
      sizeBytes: asset.artifactSizeBytes,
      contentHash: asset.artifactContentHash,
      licenseDocumentId: license.id,
      redistributionPolicy: asset.redistributionPolicy === "redistributable"
        ? "allowed" as const
        : "internal-only" as const,
      sourceUri: asset.provenance.sourceUri,
      author: asset.provenance.author,
    };
  });
  if (!isEqual(manifest.resources, expectedResources)) {
    invalid("manifest.json", "Asset Lock and resource membership differ");
  }
  const resourceBytes = new Map<string, Uint8Array>();
  for (const resource of manifest.resources) {
    const file = requireFile(filesByPath, resource.packagePath);
    if (
      file.mediaType !== resource.mediaType ||
      file.bytes.byteLength !== resource.sizeBytes ||
      sha256Bytes(file.bytes) !== resource.contentHash
    ) invalid(resource.packagePath, "resource bytes mismatch");
    resourceBytes.set(resource.resourceRef, file.bytes);
  }
  return Object.freeze({
    kind: "babylon-native-scene" as const,
    directory: Object.freeze({ receipt, files, signatureFiles }),
    manifest,
    receipt,
    bootstrap: nativeSceneBootstrap,
    sceneModuleBundleManifest,
    sceneModuleBundleBytes,
    sceneModuleBundleHash: source.sceneModuleBundleHash,
    sceneModuleBundleRef: sceneModuleBundleManifest.sceneModuleBundleRef,
    dependencyLock,
    assetLock,
    sceneAuthoringRouteDecision,
    sceneAuthoringAttempt,
    sceneAuthoringAttemptResult: completedAttemptResult,
    nativeSceneCheckResult: passedCheckResult,
    nativeSceneContribution,
    ...(isNil(nativeBlockMaterializerMetadata)
      ? {}
      : { nativeBlockMaterializerMetadata }),
    gameplayBootstrap,
    worldRuntimeBootstrap,
    registryLock,
    immutableAssetBytesByResourceRef: new ImmutableByteMap(resourceBytes),
    signatureFiles,
  });
}

function verifyInternal(input: unknown): VerifiedWorldPackageDirectoryV1 {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) invalid("", "directory must be a plain object");
  const source = input as Record<string, unknown>;
  if (!isEqual(Object.keys(source).sort(), ["files", "receipt", "signatureFiles"])) invalid("", "directory must have exact keys");
  const receipt = assertWorldPackageBuildReceiptV1(source.receipt);
  const files = canonicalFiles(source.files, "directory", "files");
  const signatureFiles = canonicalFiles(source.signatureFiles, "signature", "signatureFiles");
  const filesByPath = fileByPath(files);
  const expectedPaths = new Set([...receipt.fileIntegrityEntries.map((entry) => entry.path), ...TRANSPORT_PATHS]);
  if (expectedPaths.size !== files.length || [...expectedPaths].some((path) => !filesByPath.has(path))) invalid("files", "must contain exactly Root files and three transport files");
  for (const entry of receipt.fileIntegrityEntries) {
    if (TRANSPORT_PATHS.has(entry.path)) invalid("receipt/fileIntegrityEntries", "transport metadata is excluded from Root");
    const file = requireFile(filesByPath, entry.path);
    if (file.mediaType !== entry.mediaType || file.bytes.byteLength !== entry.sizeBytes || sha256Bytes(file.bytes) !== entry.contentHash) invalid(entry.path, "does not match Root inventory");
  }
  if (hashWorldPackageRootV1(receipt.fileIntegrityEntries) !== receipt.worldPackageRootHash) invalid("receipt", "Root hash mismatch");
  const expectedTransport = new Map<string, Uint8Array>([
    [INTEGRITY_PATH, canonicalJsonBytes(receipt.fileIntegrityEntries)],
    [RECEIPT_PATH, canonicalJsonBytes(receipt)],
    [IDENTITY_PATH, canonicalJsonBytes(receipt.worldBuildIdentity)],
  ]);
  for (const [path, bytes] of expectedTransport) {
    const file = requireFile(filesByPath, path);
    if (file.mediaType !== JSON_MEDIA_TYPE || !equalBytes(file.bytes, bytes)) invalid(path, "transport bytes drifted");
  }
  for (const file of [...files, ...signatureFiles]) {
    if (file.mediaType === JSON_MEDIA_TYPE || file.mediaType.endsWith("+json")) parseCanonicalJson(file);
  }

  const manifest = receipt.manifest;
  if (!isEqual(parseCanonicalJson(requireFile(filesByPath, "manifest.json")), manifest) || hashWorldPackageManifestV1(manifest) !== receipt.manifestHash) invalid("manifest.json", "manifest mismatch");
  if (manifest.sceneSource.kind === "babylon-native-scene") {
    return verifyNativeDirectory(
      receipt as BabylonNativeWorldPackageBuildReceiptV1,
      files,
      filesByPath,
      signatureFiles,
    );
  }
  const sceneSource = manifest.sceneSource;
  const canonicalReceipt = receipt as CanonicalWorldPackageBuildReceiptV1;
  const canonicalPaths = new Set<string>([
    "manifest.json",
    "world.normalized.json",
    "registry-lock.json",
    "layout-solve-report.json",
    sceneSource.canonicalSceneExecutionPlanPath,
    manifest.entryPoint.gameplayBootstrapPath,
    manifest.entryPoint.worldRuntimeBootstrapPath,
    manifest.legal.noticePath,
    ...manifest.legal.licenseDocuments.map(({ path }) => path),
    ...manifest.resources.map(({ packagePath }) => packagePath),
  ]);
  if (filesByPath.has("authoring-spec.json")) {
    canonicalPaths.add("authoring-spec.json");
  }
  assertExactRootPaths(receipt, canonicalPaths);
  const normalizedWorldIr = parseCanonicalJson(requireFile(filesByPath, "world.normalized.json")) as NormalizedWorldIRV4;
  const registryLock = worldResourceLockEntriesV1(parseCanonicalJson(requireFile(filesByPath, "registry-lock.json")));
  const layoutSolveReport = parseCanonicalJson(requireFile(filesByPath, "layout-solve-report.json")) as LayoutSolveReportV1;
  const executionPlan = parseCanonicalSceneExecutionPlanV1(parseCanonicalJson(requireFile(filesByPath, sceneSource.canonicalSceneExecutionPlanPath)));
  const gameplayBootstrap = parseGameplayBootstrapV1(parseCanonicalJson(requireFile(filesByPath, manifest.entryPoint.gameplayBootstrapPath)));
  const worldRuntimeBootstrap = parseWorldRuntimeBootstrapV1(parseCanonicalJson(requireFile(filesByPath, manifest.entryPoint.worldRuntimeBootstrapPath)));
  assertCanonicalWorldPackageGameplayBootstrapMembershipV1({ canonicalSceneExecutionPlan: executionPlan, gameplayBootstrap, worldRuntimeBootstrap, worldPackageBuildReceipt: receipt });
  if (sha256CanonicalJson(normalizedWorldIr) !== sceneSource.normalizedWorldIrHash || hashCanonicalSceneExecutionPlanV1(executionPlan) !== sceneSource.executionPlanHash ||
    executionPlan.authoringSpecHash !== sceneSource.authoringSpecHash ||
    gameplayBootstrap.contentHash !== manifest.gameplayBootstrapHash || worldRuntimeBootstrap.contentHash !== manifest.worldRuntimeBootstrapHash ||
    sha256CanonicalJson(registryLock) !== manifest.registryLockHash || hashLayoutSolveReportV1(layoutSolveReport) !== sceneSource.layoutSolveReportHash ||
    !isEqual(registryLock, worldResourceLockEntriesV1([
      ...executionPlan.sceneResourceLockEntries,
      ...worldRuntimeBootstrap.runtimeResourceLockEntries,
      {
        resourceKind: "world-runtime-bootstrap",
        resourceRef: executionPlan.worldRuntimeBootstrapRef,
        resolvedVersion: "1",
        contentHash: worldRuntimeBootstrap.contentHash,
      },
    ]))) {
    invalid("manifest.json", "component hashes or locks do not match parsed files");
  }
  const compiled = compileCanonicalWorldV1({ normalizedWorldIr, normalizedWorldIrHash: sceneSource.normalizedWorldIrHash, gameplayBootstrap, worldRuntimeBootstrapRef: executionPlan.worldRuntimeBootstrapRef });
  if (!compiled.ok || !isEqual(compiled.canonicalSceneExecutionPlan, executionPlan) || !isEqual(compiled.worldRuntimeBootstrap, worldRuntimeBootstrap)) invalid("world.normalized.json", "compiler replay drifted");

  let authoringSpec: AuthoringSpecV4 | undefined;
  const authoringFile = filesByPath.get("authoring-spec.json");
  if (!isNil(authoringFile)) {
    authoringSpec = parseCanonicalJson(authoringFile) as AuthoringSpecV4;
    const normalized = normalizeAuthoringSpecV4(authoringSpec);
    if (!normalized.ok || !isEqual(normalized.value, normalizedWorldIr) || hashAuthoringDocumentV4(authoringSpec) !== sceneSource.authoringSpecHash) invalid("authoring-spec.json", "cannot replay Normalized IR");
  }
  const resourceBytes = new Map<string, Uint8Array>();
  for (const resource of manifest.resources) {
    const file = requireFile(filesByPath, resource.packagePath);
    if (file.mediaType !== resource.mediaType || file.bytes.byteLength !== resource.sizeBytes || sha256Bytes(file.bytes) !== resource.contentHash) invalid(resource.packagePath, "resource bytes mismatch");
    resourceBytes.set(resource.resourceRef, file.bytes);
  }
  return Object.freeze({ kind: "canonical-execution-plan" as const, receipt: canonicalReceipt, ...(isNil(authoringSpec) ? {} : { authoringSpec }), normalizedWorldIr: Object.freeze(normalizedWorldIr), registryLock,
    layoutSolveReport: Object.freeze(layoutSolveReport), executionPlan, gameplayBootstrap, worldRuntimeBootstrap,
    resourceBytesByRef: new ImmutableByteMap(resourceBytes), signatureFiles });
}

export function verifyWorldPackageDirectoryV1(input: unknown): VerifiedWorldPackageDirectoryV1 {
  try { return verifyInternal(input); } catch (error) {
    if (error instanceof Error && error.message.startsWith("WORLD_PACKAGE_DIRECTORY_INVALID")) throw error;
    invalid("", `trusted owner validation failed: ${error instanceof Error ? error.message : "unknown failure"}`);
  }
}

export function assembleWorldPackageDirectoryV1(input: AssembleWorldPackageDirectoryV1Input): WorldPackageDirectoryV1 {
  const receipt = assertWorldPackageBuildReceiptV1(input.receipt);
  const rootFiles = canonicalFiles(input.files, "root", "files");
  const entries = canonicalizeWorldPackageFileIntegrityEntriesV1(rootFiles.map((file) => ({ path: file.path, mediaType: file.mediaType, sizeBytes: file.bytes.byteLength, contentHash: sha256Bytes(file.bytes) as `sha256:${string}` })));
  if (!isEqual(entries, receipt.fileIntegrityEntries)) invalid("files", "Root files do not match receipt inventory");
  const files = canonicalFiles([
    ...rootFiles,
    { path: INTEGRITY_PATH, mediaType: JSON_MEDIA_TYPE, bytes: canonicalJsonBytes(receipt.fileIntegrityEntries) },
    { path: RECEIPT_PATH, mediaType: JSON_MEDIA_TYPE, bytes: canonicalJsonBytes(receipt) },
    { path: IDENTITY_PATH, mediaType: JSON_MEDIA_TYPE, bytes: canonicalJsonBytes(receipt.worldBuildIdentity) },
  ], "directory", "files");
  const signatureFiles = canonicalFiles(input.signatureFiles ?? [], "signature", "signatureFiles");
  const directory = Object.freeze({ receipt, files, signatureFiles });
  verifyWorldPackageDirectoryV1(directory);
  return directory;
}
