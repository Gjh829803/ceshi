import {
  hashAuthoringDocumentV4,
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileCanonicalWorldV1 } from "@whitebox-world/compiler";
import { parseGameplayBootstrapV1, type GameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import { hashLayoutSolveReportV1, type LayoutSolveReportV1 } from "@whitebox-world/layout-solver";
import { canonicalJsonBytes, sha256Bytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  worldResourceLockEntriesV1,
  hashCanonicalSceneExecutionPlanV1,
  parseCanonicalSceneExecutionPlanV1,
  parseWorldRuntimeBootstrapV1,
  type WorldResourceLockEntryV1,
  type CanonicalSceneExecutionPlanV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import { getNodeValue, parseTree, type Node, type ParseError } from "jsonc-parser";
import { isEqual, isNil } from "lodash-es";

import {
  assertWorldPackageBuildReceiptV1,
  assertWorldPackageGameplayBootstrapMembershipV1,
  canonicalWorldPackageFileIntegrityEntriesV1,
  hashWorldPackageManifestV1,
  hashWorldPackageRootV1,
} from "./package-contract.js";
import type { WorldPackageBuildReceiptV1 } from "./package-types.js";

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

export interface VerifiedWorldPackageDirectoryV1 {
  readonly receipt: WorldPackageBuildReceiptV1;
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
  const normalizedWorldIr = parseCanonicalJson(requireFile(filesByPath, "world.normalized.json")) as NormalizedWorldIRV4;
  const registryLock = worldResourceLockEntriesV1(parseCanonicalJson(requireFile(filesByPath, "registry-lock.json")));
  const layoutSolveReport = parseCanonicalJson(requireFile(filesByPath, "layout-solve-report.json")) as LayoutSolveReportV1;
  const executionPlan = parseCanonicalSceneExecutionPlanV1(parseCanonicalJson(requireFile(filesByPath, manifest.entryPoint.canonicalSceneExecutionPlanPath)));
  const gameplayBootstrap = parseGameplayBootstrapV1(parseCanonicalJson(requireFile(filesByPath, manifest.entryPoint.gameplayBootstrapPath)));
  const worldRuntimeBootstrap = parseWorldRuntimeBootstrapV1(parseCanonicalJson(requireFile(filesByPath, manifest.entryPoint.worldRuntimeBootstrapPath)));
  assertWorldPackageGameplayBootstrapMembershipV1({ canonicalSceneExecutionPlan: executionPlan, gameplayBootstrap, worldRuntimeBootstrap, worldPackageBuildReceipt: receipt });
  if (sha256CanonicalJson(normalizedWorldIr) !== manifest.normalizedWorldIrHash || hashCanonicalSceneExecutionPlanV1(executionPlan) !== manifest.executionPlanHash ||
    gameplayBootstrap.contentHash !== manifest.gameplayBootstrapHash || worldRuntimeBootstrap.contentHash !== manifest.worldRuntimeBootstrapHash ||
    sha256CanonicalJson(registryLock) !== manifest.registryLockHash || hashLayoutSolveReportV1(layoutSolveReport) !== manifest.layoutSolveReportHash ||
    !isEqual(registryLock, worldResourceLockEntriesV1([...executionPlan.sceneResourceLockEntries, ...worldRuntimeBootstrap.runtimeResourceLockEntries]))) {
    invalid("manifest.json", "component hashes or locks do not match parsed files");
  }
  const compiled = compileCanonicalWorldV1({ normalizedWorldIr, normalizedWorldIrHash: manifest.normalizedWorldIrHash, gameplayBootstrap, worldRuntimeBootstrapRef: executionPlan.worldRuntimeBootstrapRef });
  if (!compiled.ok || !isEqual(compiled.canonicalSceneExecutionPlan, executionPlan) || !isEqual(compiled.worldRuntimeBootstrap, worldRuntimeBootstrap)) invalid("world.normalized.json", "compiler replay drifted");

  let authoringSpec: AuthoringSpecV4 | undefined;
  const authoringFile = filesByPath.get("authoring-spec.json");
  if (!isNil(authoringFile)) {
    authoringSpec = parseCanonicalJson(authoringFile) as AuthoringSpecV4;
    const normalized = normalizeAuthoringSpecV4(authoringSpec);
    if (!normalized.ok || !isEqual(normalized.value, normalizedWorldIr) || hashAuthoringDocumentV4(authoringSpec) !== manifest.authoringSpecHash) invalid("authoring-spec.json", "cannot replay Normalized IR");
  }
  const resourceBytes = new Map<string, Uint8Array>();
  for (const resource of manifest.resources) {
    const file = requireFile(filesByPath, resource.packagePath);
    if (file.mediaType !== resource.mediaType || file.bytes.byteLength !== resource.sizeBytes || sha256Bytes(file.bytes) !== resource.contentHash) invalid(resource.packagePath, "resource bytes mismatch");
    resourceBytes.set(resource.resourceRef, file.bytes);
  }
  return Object.freeze({ receipt, ...(isNil(authoringSpec) ? {} : { authoringSpec }), normalizedWorldIr: Object.freeze(normalizedWorldIr), registryLock,
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
  const entries = canonicalWorldPackageFileIntegrityEntriesV1(rootFiles.map((file) => ({ path: file.path, mediaType: file.mediaType, sizeBytes: file.bytes.byteLength, contentHash: sha256Bytes(file.bytes) as `sha256:${string}` })));
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
