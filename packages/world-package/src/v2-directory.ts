import {
  hashAuthoringDocumentV4,
  normalizeAuthoringSpecV4,
  validateAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import {
  createGameplayBootstrapResourceLockEntryV1,
  parseGameplayBootstrapV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import {
  hashLayoutSolveReportV1,
  type LayoutSolveReportV1,
} from "@whitebox-world/layout-solver";
import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import {
  canonicalExecutionResourceLockEntriesV1,
  hashExecutionPlanV5,
  parseExecutionPlanV5,
  type ExecutionPlanV5,
  type ExecutionResourceLockEntryV1,
} from "@whitebox-world/runtime-contracts";
import {
  getNodeValue,
  parseTree,
  type Node,
  type ParseError,
} from "jsonc-parser";
import { isEmpty, isEqual, isNil, isPlainObject } from "lodash-es";

import {
  assertWorldPackageAccessorFreeDataGraphV1,
  deepFreeze,
} from "./manifest.js";
import { assertWorldPackageBuildReceiptV2 } from "./v2-contract.js";
import type { WorldPackageBuildReceiptV2 } from "./v2-types.js";

const DIRECTORY_FIELDS = ["receipt", "files", "signatureFiles"] as const;
const ASSEMBLE_REQUIRED_FIELDS = ["receipt", "files"] as const;
const ASSEMBLE_ALLOWED_FIELDS = [
  ...ASSEMBLE_REQUIRED_FIELDS,
  "signatureFiles",
] as const;
const FILE_FIELDS = ["path", "mediaType", "bytes"] as const;
const INTEGRITY_PATH = "integrity.json";
const RECEIPT_PATH = "world-package-build-receipt.json";
const CORE_JSON_PATHS = [
  "manifest.json",
  "world.normalized.json",
  "registry-lock.json",
  "layout-solve-report.json",
  "targets/babylon-web/execution-plan.json",
] as const;
const TEXT_MEDIA_TYPE = "text/plain; charset=utf-8";
const JSON_MEDIA_TYPE = "application/json";
const BOOTSTRAP_MEDIA_TYPE =
  "application/vnd.worldkit.gameplay-bootstrap+json";
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

type UnknownRecord = Record<string, unknown>;

class ImmutableByteMap implements ReadonlyMap<string, Uint8Array> {
  readonly #bytesByKey: ReadonlyMap<string, Uint8Array>;
  readonly size: number;

  constructor(source: ReadonlyMap<string, Uint8Array>) {
    this.#bytesByKey = new Map(
      [...source].map(([key, bytes]) => [key, new Uint8Array(bytes)]),
    );
    this.size = this.#bytesByKey.size;
    Object.freeze(this);
  }

  get(key: string): Uint8Array | undefined {
    const bytes = this.#bytesByKey.get(key);
    return isNil(bytes) ? undefined : new Uint8Array(bytes);
  }

  has(key: string): boolean {
    return this.#bytesByKey.has(key);
  }

  entries(): MapIterator<[string, Uint8Array]> {
    return new Map(
      [...this.#bytesByKey].map(([key, bytes]) => [key, new Uint8Array(bytes)]),
    ).entries();
  }

  keys(): MapIterator<string> {
    return new Map(this.#bytesByKey).keys();
  }

  values(): MapIterator<Uint8Array> {
    return new Map(
      [...this.#bytesByKey].map(([key, bytes]) => [key, new Uint8Array(bytes)]),
    ).values();
  }

  forEach(
    callbackfn: (value: Uint8Array, key: string, map: ReadonlyMap<string, Uint8Array>) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, bytes] of this.#bytesByKey) {
      callbackfn.call(thisArg, new Uint8Array(bytes), key, this);
    }
  }

  [Symbol.iterator](): MapIterator<[string, Uint8Array]> {
    return this.entries();
  }
}

export interface WorldPackageDirectoryFileV2 {
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface WorldPackageDirectoryV2 {
  readonly receipt: WorldPackageBuildReceiptV2;
  readonly files: readonly WorldPackageDirectoryFileV2[];
  readonly signatureFiles: readonly WorldPackageDirectoryFileV2[];
}

export interface VerifiedWorldPackageDirectoryV2 {
  readonly receipt: WorldPackageBuildReceiptV2;
  readonly authoringSpec?: AuthoringSpecV4;
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly registryLock: readonly ExecutionResourceLockEntryV1[];
  readonly layoutSolveReport: LayoutSolveReportV1;
  readonly executionPlan: ExecutionPlanV5;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly resourceBytesByRef: ReadonlyMap<string, Uint8Array>;
  readonly signatureFiles: readonly WorldPackageDirectoryFileV2[];
}

export interface AssembleWorldPackageDirectoryV2Input {
  readonly receipt: WorldPackageBuildReceiptV2;
  readonly files: readonly WorldPackageDirectoryFileV2[];
  readonly signatureFiles?: readonly WorldPackageDirectoryFileV2[];
}

function directoryFail(path: string, message: string): never {
  throw new Error(
    `WORLD_PACKAGE_DIRECTORY_V2_INVALID: ${isEmpty(path) ? message : `${path}: ${message}`}`,
  );
}

function exactRecord(
  value: unknown,
  requiredFields: readonly string[],
  allowedFields: readonly string[],
  path: string,
): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    directoryFail(path, "expected a plain object");
  }
  const record = value as UnknownRecord;
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) directoryFail(path, `unknown field '${unknown}'`);
  for (const field of requiredFields) {
    if (!Object.hasOwn(record, field) || isNil(record[field])) {
      directoryFail(path, `missing field '${field}'`);
    }
  }
  return record;
}

function isPlainDenseArray(value: unknown): value is readonly unknown[] {
  return (
    Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    Object.getOwnPropertyNames(value).length === value.length + 1
  );
}

function requirePlainDenseArray(value: unknown, path: string): readonly unknown[] {
  if (!isPlainDenseArray(value)) {
    directoryFail(path, "must be a plain dense array");
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || isEmpty(value) || value.trim() !== value) {
    directoryFail(path, "must be a non-empty canonical string");
  }
  return value;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireSafePath(
  value: unknown,
  path: string,
  role: "root-input" | "directory" | "signature",
): string {
  const packagePath = requireString(value, path);
  const segments = packagePath.split("/");
  if (
    packagePath.startsWith("/") ||
    packagePath.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(packagePath) ||
    packagePath.normalize("NFC") !== packagePath ||
    segments.some((segment) =>
      isEmpty(segment) || segment === "." || segment === ".." || segment.includes(":"))
  ) {
    directoryFail(path, "must be a safe package-local path");
  }
  const isSignaturePath = packagePath.startsWith("signatures/");
  if (role === "signature") {
    if (!isSignaturePath || segments.length !== 2) {
      directoryFail(path, "must be one file directly inside signatures/");
    }
    return packagePath;
  }
  if (isSignaturePath || packagePath === "signatures") {
    directoryFail(path, "signatures must use signatureFiles");
  }
  if (
    role === "root-input" &&
    (packagePath === INTEGRITY_PATH || packagePath === RECEIPT_PATH)
  ) {
    directoryFail(path, "transport metadata is assembled by the package owner");
  }
  return packagePath;
}

function cloneBytes(value: unknown, path: string): Uint8Array {
  if (
    !(value instanceof Uint8Array) ||
    Object.getPrototypeOf(value) !== Uint8Array.prototype
  ) {
    directoryFail(path, "must be a plain Uint8Array");
  }
  return new Uint8Array(value);
}

function canonicalFiles(
  value: unknown,
  role: "root-input" | "directory" | "signature",
  path: string,
): readonly WorldPackageDirectoryFileV2[] {
  const values = requirePlainDenseArray(value, path);
  const rows = values.map((candidate, index) => {
    const rowPath = `${path}/${index}`;
    const record = exactRecord(candidate, FILE_FIELDS, FILE_FIELDS, rowPath);
    return Object.freeze({
      path: requireSafePath(record.path, `${rowPath}/path`, role),
      mediaType: requireString(record.mediaType, `${rowPath}/mediaType`),
      bytes: cloneBytes(record.bytes, `${rowPath}/bytes`),
    });
  }).sort((left, right) => compareStrings(left.path, right.path));
  if (new Set(rows.map((row) => row.path)).size !== rows.length) {
    directoryFail(path, "paths must be unique");
  }
  return Object.freeze(rows);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index])
  );
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return UTF8_BOM.every((byte, index) => bytes[index] === byte);
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
  if (hasUtf8Bom(bytes)) directoryFail(path, "UTF-8 BOM is forbidden");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    directoryFail(path, "must contain valid UTF-8 bytes");
  }
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
  } else if (node.type === "array") {
    return (node.children ?? []).some((child) => findDuplicateKeys(child));
  }
  return false;
}

function parseCanonicalJsonFile(
  file: WorldPackageDirectoryFileV2,
): unknown {
  const sourceText = decodeUtf8(file.bytes, file.path);
  const errors: ParseError[] = [];
  const root = parseTree(sourceText, errors, {
    allowEmptyContent: false,
    allowTrailingComma: false,
    disallowComments: true,
  });
  if (isNil(root) || !isEmpty(errors) || findDuplicateKeys(root)) {
    directoryFail(file.path, "must contain duplicate-free strict JSON");
  }
  let value: unknown;
  try {
    value = JSON.parse(sourceText) as unknown;
  } catch {
    directoryFail(file.path, "must contain valid JSON");
  }
  let canonicalBytes: Uint8Array;
  try {
    canonicalBytes = canonicalJsonBytes(value);
  } catch {
    directoryFail(file.path, "must contain canonical JSON data");
  }
  if (!equalBytes(file.bytes, canonicalBytes)) {
    directoryFail(file.path, "bytes must equal canonical-json-jcs@1 output");
  }
  return value;
}

function assertCanonicalTextFile(file: WorldPackageDirectoryFileV2): void {
  const text = decodeUtf8(file.bytes, file.path);
  if (isEmpty(text) || text.includes("\u0000")) {
    directoryFail(file.path, "legal text must be non-empty UTF-8 without NUL");
  }
}

function canonicalDirectoryInput(value: unknown): WorldPackageDirectoryV2 {
  try {
    assertWorldPackageAccessorFreeDataGraphV1(
      value,
      "WORLD_PACKAGE_DIRECTORY_V2_ACCESSOR_FORBIDDEN",
    );
  } catch {
    directoryFail("", "accessors, symbol keys, and invalid byte views are forbidden");
  }
  const record = exactRecord(value, DIRECTORY_FIELDS, DIRECTORY_FIELDS, "");
  let receipt: WorldPackageBuildReceiptV2;
  try {
    receipt = assertWorldPackageBuildReceiptV2(record.receipt);
  } catch {
    directoryFail("receipt", "must be a canonical WorldPackageBuildReceiptV2");
  }
  return Object.freeze({
    receipt,
    files: canonicalFiles(record.files, "directory", "files"),
    signatureFiles: canonicalFiles(
      record.signatureFiles,
      "signature",
      "signatureFiles",
    ),
  });
}

function expectedInventoryMediaTypes(
  receipt: WorldPackageBuildReceiptV2,
): ReadonlyMap<string, string> {
  const expected = new Map<string, string>();
  const add = (path: string, mediaType: string): void => {
    const existing = expected.get(path);
    if (!isNil(existing) && existing !== mediaType) {
      directoryFail("receipt/manifest", `path '${path}' has conflicting owners`);
    }
    expected.set(path, mediaType);
  };
  for (const path of CORE_JSON_PATHS) add(path, JSON_MEDIA_TYPE);
  if (receipt.fileIntegrityEntries.some((entry) => entry.path === "authoring-spec.json")) {
    add("authoring-spec.json", JSON_MEDIA_TYPE);
  }
  add(receipt.manifest.entryPoint.gameplayBootstrapPath, BOOTSTRAP_MEDIA_TYPE);
  add(receipt.manifest.legal.noticePath, TEXT_MEDIA_TYPE);
  for (const license of receipt.manifest.legal.licenseDocuments) {
    add(license.path, license.mediaType);
  }
  for (const resource of receipt.manifest.resources) {
    add(resource.packagePath, resource.mediaType);
  }
  return expected;
}

function assertInventory(
  directory: WorldPackageDirectoryV2,
): ReadonlyMap<string, WorldPackageDirectoryFileV2> {
  const expectedMedia = expectedInventoryMediaTypes(directory.receipt);
  const entries = directory.receipt.fileIntegrityEntries;
  if (
    expectedMedia.size !== entries.length ||
    entries.some((entry) =>
      expectedMedia.get(entry.path) !== entry.mediaType ||
      entry.path === INTEGRITY_PATH ||
      entry.path === RECEIPT_PATH ||
      entry.path.startsWith("signatures/"))
  ) {
    directoryFail(
      "receipt/fileIntegrityEntries",
      "must contain exactly the root-bound package inventory",
    );
  }
  const expectedDirectoryPaths = new Set([
    ...expectedMedia.keys(),
    INTEGRITY_PATH,
    RECEIPT_PATH,
  ]);
  const filesByPath = new Map(directory.files.map((file) => [file.path, file]));
  if (
    expectedDirectoryPaths.size !== filesByPath.size ||
    [...expectedDirectoryPaths].some((path) => !filesByPath.has(path))
  ) {
    directoryFail("files", "must contain exactly root files plus transport metadata");
  }
  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const [path, entry] of entriesByPath) {
    const file = filesByPath.get(path);
    if (
      isNil(file) ||
      file.mediaType !== entry.mediaType ||
      file.bytes.byteLength !== entry.sizeBytes ||
      sha256Bytes(file.bytes) !== entry.sha256
    ) {
      directoryFail(`files/${path}`, "bytes do not match the Root inventory row");
    }
  }
  for (const license of directory.receipt.manifest.legal.licenseDocuments) {
    const entry = entriesByPath.get(license.path);
    if (
      isNil(entry) ||
      entry.mediaType !== license.mediaType ||
      entry.sizeBytes !== license.sizeBytes ||
      entry.sha256 !== license.contentHash
    ) {
      directoryFail(
        `receipt/manifest/legal/licenseDocuments/${license.id}`,
        "does not match its Root inventory row",
      );
    }
  }
  for (const resource of directory.receipt.manifest.resources) {
    const entry = entriesByPath.get(resource.packagePath);
    if (
      isNil(entry) ||
      entry.mediaType !== resource.mediaType ||
      entry.sizeBytes !== resource.sizeBytes ||
      entry.sha256 !== resource.contentHash
    ) {
      directoryFail(
        `receipt/manifest/resources/${resource.resourceRef}`,
        "does not match its Root inventory row",
      );
    }
  }
  const integrityFile = filesByPath.get(INTEGRITY_PATH);
  const receiptFile = filesByPath.get(RECEIPT_PATH);
  if (
    isNil(integrityFile) ||
    integrityFile.mediaType !== JSON_MEDIA_TYPE ||
    !equalBytes(integrityFile.bytes, canonicalJsonBytes(entries)) ||
    isNil(receiptFile) ||
    receiptFile.mediaType !== JSON_MEDIA_TYPE ||
    !equalBytes(receiptFile.bytes, canonicalJsonBytes(directory.receipt))
  ) {
    directoryFail("files", "transport metadata must equal the admitted receipt");
  }
  return filesByPath;
}

function requireJson(
  filesByPath: ReadonlyMap<string, WorldPackageDirectoryFileV2>,
  path: string,
): unknown {
  const file = filesByPath.get(path);
  if (isNil(file)) directoryFail(path, "file is missing");
  return parseCanonicalJsonFile(file);
}

function requireCoreBindings(
  directory: WorldPackageDirectoryV2,
  filesByPath: ReadonlyMap<string, WorldPackageDirectoryFileV2>,
): Omit<VerifiedWorldPackageDirectoryV2, "signatureFiles"> {
  const manifest = directory.receipt.manifest;
  const parsedManifest = requireJson(filesByPath, "manifest.json");
  const parsedIntegrity = requireJson(filesByPath, INTEGRITY_PATH);
  const parsedReceipt = requireJson(filesByPath, RECEIPT_PATH);
  if (
    !isEqual(parsedManifest, manifest) ||
    !isEqual(parsedIntegrity, directory.receipt.fileIntegrityEntries) ||
    !isEqual(parsedReceipt, directory.receipt)
  ) {
    directoryFail("files", "Manifest or transport metadata content drifted");
  }

  const normalizedCandidate = requireJson(filesByPath, "world.normalized.json");
  if (
    isNil(normalizedCandidate) ||
    !isPlainObject(normalizedCandidate)
  ) {
    directoryFail("world.normalized.json", "must be NormalizedWorldIRV4");
  }
  const normalizedRecord = normalizedCandidate as UnknownRecord;
  if (
    normalizedRecord.kind !== "worldkit-normalized-world" ||
    normalizedRecord.schemaVersion !== 4
  ) {
    directoryFail("world.normalized.json", "must be NormalizedWorldIRV4");
  }
  const normalizedWorldIr = normalizedCandidate as unknown as NormalizedWorldIRV4;

  let registryLock: readonly ExecutionResourceLockEntryV1[];
  try {
    const candidate = requireJson(filesByPath, "registry-lock.json");
    registryLock = canonicalExecutionResourceLockEntriesV1(candidate);
    if (!isEqual(candidate, registryLock)) {
      directoryFail("registry-lock.json", "must use canonical lock order");
    }
  } catch {
    directoryFail("registry-lock.json", "must be an Execution Resource Lock");
  }

  const layoutCandidate = requireJson(filesByPath, "layout-solve-report.json");
  if (
    isNil(layoutCandidate) ||
    !isPlainObject(layoutCandidate)
  ) {
    directoryFail("layout-solve-report.json", "must be a solved LayoutSolveReportV1");
  }
  const layoutRecord = layoutCandidate as UnknownRecord;
  if (
    layoutRecord.kind !== "worldkit-layout-solve-report" ||
    layoutRecord.schemaVersion !== 1 ||
    layoutRecord.status !== "solved"
  ) {
    directoryFail("layout-solve-report.json", "must be a solved LayoutSolveReportV1");
  }
  const layoutSolveReport = layoutCandidate as unknown as LayoutSolveReportV1;

  let executionPlan: ExecutionPlanV5;
  try {
    executionPlan = parseExecutionPlanV5(
      requireJson(filesByPath, manifest.entryPoint.executionPlanPath),
    );
  } catch {
    directoryFail(manifest.entryPoint.executionPlanPath, "must be ExecutionPlanV5");
  }

  let gameplayBootstrap: GameplayBootstrapV1;
  try {
    gameplayBootstrap = parseGameplayBootstrapV1(
      requireJson(filesByPath, manifest.entryPoint.gameplayBootstrapPath),
    );
  } catch {
    directoryFail(
      manifest.entryPoint.gameplayBootstrapPath,
      "must be GameplayBootstrapV1",
    );
  }

  let authoringSpec: AuthoringSpecV4 | undefined;
  const authoringFile = filesByPath.get("authoring-spec.json");
  if (!isNil(authoringFile)) {
    const validated = validateAuthoringSpecV4(parseCanonicalJsonFile(authoringFile));
    if (!validated.ok || isNil(validated.value)) {
      directoryFail("authoring-spec.json", "must be AuthoringSpecV4");
    }
    authoringSpec = validated.value;
  }

  const normalizedWorldIrHash = sha256CanonicalJson(normalizedWorldIr);
  if (
    normalizedWorldIrHash !== manifest.normalizedWorldIrHash ||
    hashExecutionPlanV5(executionPlan) !== manifest.executionPlanHash ||
    sha256CanonicalJson(registryLock) !== manifest.registryLockHash ||
    hashLayoutSolveReportV1(layoutSolveReport) !== manifest.layoutSolveReportHash ||
    !isEqual(registryLock, manifest.lockedResources) ||
    !isEqual(executionPlan.resourceLockEntries, registryLock) ||
    executionPlan.resourceLockHash !== manifest.registryLockHash ||
    normalizedWorldIr.authoringSpecHash !== manifest.authoringSpecHash ||
    executionPlan.authoringSpecHash !== manifest.authoringSpecHash ||
    executionPlan.normalizedWorldIrHash !== manifest.normalizedWorldIrHash ||
    normalizedWorldIr.id !== manifest.worldId ||
    executionPlan.id !== manifest.worldId ||
    normalizedWorldIr.seed !== manifest.seed ||
    executionPlan.seed !== manifest.seed ||
    executionPlan.initialControlledEntityId !== manifest.initialControlledEntityId ||
    normalizedWorldIr.layout.layoutSolveReportHash !== manifest.layoutSolveReportHash ||
    executionPlan.layout.layoutSolveReportHash !== manifest.layoutSolveReportHash
  ) {
    directoryFail("receipt/manifest", "core identity closure does not match package bytes");
  }

  const worldBounds = normalizedWorldIr.world.bounds;
  const budget = normalizedWorldIr.world.resourceBudget;
  if (
    !isEqual(manifest.worldBounds, worldBounds) ||
    !isEqual(manifest.resourceBudget, {
      maximumVertices: budget.maxVertices,
      maximumTriangles: budget.maxTriangles,
      maximumColliders: budget.maxColliders,
    })
  ) {
    directoryFail("receipt/manifest", "world bounds or resource budget drifted");
  }

  const bootstrapLock = createGameplayBootstrapResourceLockEntryV1(
    gameplayBootstrap,
  );
  let normalizedResourceLock: readonly ExecutionResourceLockEntryV1[];
  let expectedRegistryLock: readonly ExecutionResourceLockEntryV1[];
  try {
    normalizedResourceLock = canonicalExecutionResourceLockEntriesV1(
      normalizedWorldIr.resources.resourceLock,
    );
    expectedRegistryLock = canonicalExecutionResourceLockEntriesV1([
      ...normalizedResourceLock,
      bootstrapLock,
    ]);
  } catch {
    directoryFail("world.normalized.json", "contains an invalid Resource Lock");
  }
  if (
    !isEqual(normalizedWorldIr.resources.resourceLock, normalizedResourceLock) ||
    normalizedWorldIr.resources.resourceLockHash !==
      sha256CanonicalJson(normalizedResourceLock) ||
    !isEqual(registryLock, expectedRegistryLock)
  ) {
    directoryFail("registry-lock.json", "does not close the exact IR plus Bootstrap lock");
  }
  const matchingBootstrapLocks = registryLock.filter((entry) =>
    entry.resourceKind === "gameplay-bootstrap"
  );
  if (
    matchingBootstrapLocks.length !== 1 ||
    !isEqual(matchingBootstrapLocks[0], bootstrapLock)
  ) {
    directoryFail("registry-lock.json", "Gameplay Bootstrap semantic lock drifted");
  }

  if (
    layoutSolveReport.authoringSpecHash !== manifest.authoringSpecHash ||
    layoutSolveReport.registryLockHash !== normalizedWorldIr.resources.resourceLockHash ||
    layoutSolveReport.seed !== manifest.seed ||
    layoutSolveReport.solverProfileRef !== normalizedWorldIr.layout.solverProfileRef ||
    layoutSolveReport.resolvedVersion !== normalizedWorldIr.layout.resolvedVersion ||
    layoutSolveReport.solverProfileHash !== normalizedWorldIr.layout.solverProfileHash ||
    layoutSolveReport.solverProfileRef !== executionPlan.layout.solverProfileRef ||
    layoutSolveReport.resolvedVersion !== executionPlan.layout.resolvedVersion ||
    layoutSolveReport.solverProfileHash !== executionPlan.layout.solverProfileHash
  ) {
    directoryFail("layout-solve-report.json", "does not match IR and Plan layout identity");
  }

  let compiled;
  try {
    compiled = compileWorldV5({
      normalizedWorldIr,
      normalizedWorldIrHash,
      gameplayBootstrapResourceLock: bootstrapLock,
    });
  } catch {
    directoryFail("world.normalized.json", "could not be compiled");
  }
  if (
    !compiled.ok ||
    isNil(compiled.executionPlan) ||
    isNil(compiled.executionPlanHash) ||
    !isEqual(compiled.executionPlan, executionPlan) ||
    compiled.executionPlanHash !== manifest.executionPlanHash
  ) {
    directoryFail("targets/babylon-web/execution-plan.json", "cannot be replayed from IR");
  }

  if (!isNil(authoringSpec)) {
    const normalized = normalizeAuthoringSpecV4(authoringSpec);
    if (
      !normalized.ok ||
      isNil(normalized.value) ||
      isNil(normalized.layoutSolveReport) ||
      hashAuthoringDocumentV4(authoringSpec) !== manifest.authoringSpecHash ||
      !isEqual(normalized.value, normalizedWorldIr) ||
      !isEqual(normalized.layoutSolveReport, layoutSolveReport)
    ) {
      directoryFail("authoring-spec.json", "cannot replay the exact IR and Layout Report");
    }
  }

  const lockRefs = new Set(registryLock.map((entry) => entry.resourceRef));
  const resourcesByRef = new Map(
    manifest.resources.map((resource) => [resource.resourceRef, resource]),
  );
  for (const asset of normalizedWorldIr.resources.subjectAssets) {
    const resource = resourcesByRef.get(asset.subjectAssetRef);
    if (
      isNil(resource) ||
      resource.mediaType !== asset.mediaType ||
      resource.sizeBytes !== asset.byteLength ||
      resource.contentHash !== asset.artifactContentHash
    ) {
      directoryFail(
        `receipt/manifest/resources/${asset.subjectAssetRef}`,
        "does not match the Normalized IR Subject Asset",
      );
    }
  }
  const resourceBytesByRef = new Map<string, Uint8Array>();
  for (const resource of manifest.resources) {
    const file = filesByPath.get(resource.packagePath);
    if (isNil(file) || !lockRefs.has(resource.resourceRef)) {
      directoryFail(
        `receipt/manifest/resources/${resource.resourceRef}`,
        "must bind one locked package file",
      );
    }
    resourceBytesByRef.set(resource.resourceRef, new Uint8Array(file.bytes));
  }
  const bootstrapResource = manifest.resources.find((resource) =>
    resource.packagePath === manifest.entryPoint.gameplayBootstrapPath
  );
  if (
    isNil(bootstrapResource) ||
    bootstrapResource.resourceRef !== gameplayBootstrap.resourceRef
  ) {
    directoryFail("receipt/manifest/resources", "Gameplay Bootstrap artifact is missing");
  }

  return {
    receipt: directory.receipt,
    ...(isNil(authoringSpec) ? {} : { authoringSpec }),
    normalizedWorldIr: deepFreeze(normalizedWorldIr),
    registryLock,
    layoutSolveReport: deepFreeze(layoutSolveReport),
    executionPlan,
    gameplayBootstrap,
    resourceBytesByRef: new ImmutableByteMap(resourceBytesByRef),
  };
}

export function assembleWorldPackageDirectoryV2(
  input: AssembleWorldPackageDirectoryV2Input,
): WorldPackageDirectoryV2 {
  try {
    assertWorldPackageAccessorFreeDataGraphV1(
      input,
      "WORLD_PACKAGE_DIRECTORY_V2_ACCESSOR_FORBIDDEN",
    );
  } catch {
    directoryFail("", "accessors, symbol keys, and invalid byte views are forbidden");
  }
  const record = exactRecord(
    input,
    ASSEMBLE_REQUIRED_FIELDS,
    ASSEMBLE_ALLOWED_FIELDS,
    "",
  );
  let receipt: WorldPackageBuildReceiptV2;
  try {
    receipt = assertWorldPackageBuildReceiptV2(record.receipt);
  } catch {
    directoryFail("receipt", "must be a canonical WorldPackageBuildReceiptV2");
  }
  const rootFiles = canonicalFiles(record.files, "root-input", "files");
  const files = canonicalFiles([
    ...rootFiles,
    {
      path: INTEGRITY_PATH,
      mediaType: JSON_MEDIA_TYPE,
      bytes: canonicalJsonBytes(receipt.fileIntegrityEntries),
    },
    {
      path: RECEIPT_PATH,
      mediaType: JSON_MEDIA_TYPE,
      bytes: canonicalJsonBytes(receipt),
    },
  ], "directory", "files");
  const signatureFiles = canonicalFiles(
    isNil(record.signatureFiles) ? [] : record.signatureFiles,
    "signature",
    "signatureFiles",
  );
  const directory = Object.freeze({ receipt, files, signatureFiles });
  verifyWorldPackageDirectoryV2(directory);
  return directory;
}

function verifyWorldPackageDirectoryV2Internal(
  input: unknown,
): VerifiedWorldPackageDirectoryV2 {
  const directory = canonicalDirectoryInput(input);
  const filesByPath = assertInventory(directory);
  for (const file of directory.files) {
    if (
      file.mediaType === JSON_MEDIA_TYPE ||
      file.mediaType.endsWith("+json")
    ) {
      parseCanonicalJsonFile(file);
    }
  }
  assertCanonicalTextFile(filesByPath.get(directory.receipt.manifest.legal.noticePath)!);
  for (const license of directory.receipt.manifest.legal.licenseDocuments) {
    assertCanonicalTextFile(filesByPath.get(license.path)!);
  }
  for (const signatureFile of directory.signatureFiles) {
    if (signatureFile.mediaType !== JSON_MEDIA_TYPE) {
      directoryFail(signatureFile.path, "signature files must use application/json");
    }
    parseCanonicalJsonFile(signatureFile);
  }
  const verified = requireCoreBindings(directory, filesByPath);
  return Object.freeze({
    ...verified,
    signatureFiles: directory.signatureFiles,
  });
}

export function verifyWorldPackageDirectoryV2(
  input: unknown,
): VerifiedWorldPackageDirectoryV2 {
  try {
    return verifyWorldPackageDirectoryV2Internal(input);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("WORLD_PACKAGE_DIRECTORY_V2_INVALID")
    ) {
      throw error;
    }
    directoryFail("", "trusted owner validation failed");
  }
}
