import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil, isPlainObject } from "lodash-es";

import type {
  WorldPackageFileIntegrityEntryV1,
  WorldPackageManifestV1,
  WorldPackageResourceArtifactV1,
  WorldPackageSha256HashV1,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const MANIFEST_FIELDS = [
  "kind",
  "schemaVersion",
  "id",
  "packageFormatVersion",
  "worldId",
  "seed",
  "runtimeTarget",
  "canonicalizationProfile",
  "hashAlgorithm",
  "authoringSchemaVersion",
  "normalizedWorldIrSchemaVersion",
  "executionPlanSchemaVersion",
  "authoringSpecHash",
  "normalizedWorldIrHash",
  "executionPlanHash",
  "resourceLockHash",
  "layoutSolveReportHash",
  "initialControlledEntityId",
  "entryPoint",
  "resources",
] as const;
const ENTRY_POINT_FIELDS = ["executionPlanPath"] as const;
const RESOURCE_FIELDS = [
  "resourceRef",
  "packagePath",
  "mediaType",
  "sizeBytes",
  "contentHash",
] as const;
const INTEGRITY_FIELDS = ["path", "mediaType", "sizeBytes", "sha256"] as const;
const CORE_PACKAGE_PATHS = new Set([
  "manifest.json",
  "authoring-spec.json",
  "world.normalized.json",
  "registry-lock.json",
  "layout-solve-report.json",
  "targets/babylon-web/execution-plan.json",
]);
const ADMITTED_WORLD_PACKAGE_BYTE_VIEWS = new WeakSet<Uint8Array>();

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: string, path: string, message: string): never {
  throw new Error(`${code}: ${path.length === 0 ? message : `${path}: ${message}`}`);
}

export function assertWorldPackageAccessorFreeDataGraphV1(
  value: unknown,
  errorCode: string,
  visited: WeakSet<object> = new WeakSet<object>(),
): void {
  if (isNil(value) || typeof value !== "object") return;
  if (visited.has(value)) return;
  visited.add(value);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(errorCode.replace("ACCESSOR_FORBIDDEN", "SYMBOL_KEY_FORBIDDEN"));
  }
  if (value instanceof Uint8Array) {
    if (ADMITTED_WORLD_PACKAGE_BYTE_VIEWS.has(value)) return;
    const ownPropertyNames = Object.getOwnPropertyNames(value);
    // TypedArray own keys list every in-bounds integer index before ordinary
    // string keys, so only the suffix can contain attached mutable state.
    for (let index = value.length; index < ownPropertyNames.length; index += 1) {
      const key = ownPropertyNames[index]!;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!isNil(descriptor?.get) || !isNil(descriptor?.set)) {
        throw new Error(errorCode);
      }
      if (descriptor !== undefined && Object.hasOwn(descriptor, "value")) {
        assertWorldPackageAccessorFreeDataGraphV1(descriptor.value, errorCode, visited);
      }
    }
    const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
    const bufferGetter = Object.getOwnPropertyDescriptor(
      typedArrayPrototype,
      "buffer",
    )?.get;
    if (isNil(bufferGetter)) {
      throw new Error(
        errorCode.replace("ACCESSOR_FORBIDDEN", "BYTE_VIEW_INVALID"),
      );
    }
    let buffer: ArrayBufferLike;
    try {
      buffer = Reflect.apply(bufferGetter, value, []) as ArrayBufferLike;
    } catch {
      throw new Error(
        errorCode.replace("ACCESSOR_FORBIDDEN", "DETACHED_BUFFER_FORBIDDEN"),
      );
    }
    if (
      typeof SharedArrayBuffer !== "undefined" &&
      buffer instanceof SharedArrayBuffer
    ) {
      throw new Error(
        errorCode.replace("ACCESSOR_FORBIDDEN", "SHARED_MEMORY_FORBIDDEN"),
      );
    }
    try {
      new Uint8Array(buffer, 0, 0);
    } catch {
      throw new Error(
        errorCode.replace("ACCESSOR_FORBIDDEN", "DETACHED_BUFFER_FORBIDDEN"),
      );
    }
    return;
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!isNil(descriptor.get) || !isNil(descriptor.set)) {
      throw new Error(errorCode);
    }
    if (Object.hasOwn(descriptor, "value")) {
      assertWorldPackageAccessorFreeDataGraphV1(descriptor.value, errorCode, visited);
    }
  }
}

export function copyAdmittedWorldPackageBytesV1(
  value: Uint8Array,
): Uint8Array {
  const copy = new Uint8Array(value);
  Object.preventExtensions(copy);
  ADMITTED_WORLD_PACKAGE_BYTE_VIEWS.add(copy);
  return copy;
}

function requireExactRecord(
  value: unknown,
  fields: readonly string[],
  path: string,
  code: string,
): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    fail(code, path, "expected a plain object");
  }
  const record = value as UnknownRecord;
  const allowed = new Set(fields);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) fail(code, path, `unknown field '${unknown}'`);
  for (const field of fields) {
    if (!Object.hasOwn(record, field) || isNil(record[field])) {
      fail(code, path, `missing field '${field}'`);
    }
  }
  return record;
}

function requireString(value: unknown, path: string, code: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    fail(code, path, "must be a non-empty canonical string");
  }
  return value;
}

function requireHash(
  value: unknown,
  path: string,
  code: string,
): WorldPackageSha256HashV1 {
  if (typeof value !== "string" || !HASH_PATTERN.test(value) || value === ZERO_HASH) {
    fail(code, path, "must be a non-zero lowercase sha256 hash");
  }
  return value as WorldPackageSha256HashV1;
}

function requireResourceRef(value: unknown, path: string, code: string): string {
  const resourceRef = requireString(value, path, code);
  if (!resourceRef.startsWith("worldkit://") && !resourceRef.startsWith("package://")) {
    fail(code, path, "must be a Registry or WorldPackage resource Ref");
  }
  return resourceRef;
}

function requireNonNegativeSafeInteger(
  value: unknown,
  path: string,
  code: string,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(code, path, "must be a non-negative safe integer");
  }
  return value;
}

export function assertSafeWorldPackagePathV1(
  value: unknown,
  path: string,
  code: string,
  allowCorePath = false,
): string {
  const packagePath = requireString(value, path, code);
  if (
    packagePath.startsWith("/") ||
    packagePath.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(packagePath) ||
    packagePath.normalize("NFC") !== packagePath ||
    packagePath.split("/").some((segment) =>
      segment.length === 0 || segment === "." || segment === ".." || segment.includes(":")) ||
    packagePath === "integrity.json" ||
    packagePath === "signatures" ||
    packagePath.startsWith("signatures/") ||
    packagePath === "package-root.json" ||
    packagePath === "world-package-root.json" ||
    packagePath === "receipt.json" ||
    packagePath === "receipts" ||
    packagePath.startsWith("receipts/") ||
    packagePath === "world-package-build-receipt.json" ||
    (!allowCorePath && CORE_PACKAGE_PATHS.has(packagePath))
  ) {
    fail(code, path, "must be a safe package-local non-reserved path");
  }
  return packagePath;
}

function canonicalResource(
  value: unknown,
  path: string,
  code: string,
): WorldPackageResourceArtifactV1 {
  const row = requireExactRecord(value, RESOURCE_FIELDS, path, code);
  return {
    resourceRef: requireResourceRef(row.resourceRef, `${path}/resourceRef`, code),
    packagePath: assertSafeWorldPackagePathV1(
      row.packagePath,
      `${path}/packagePath`,
      code,
    ),
    mediaType: requireString(row.mediaType, `${path}/mediaType`, code),
    sizeBytes: requireNonNegativeSafeInteger(row.sizeBytes, `${path}/sizeBytes`, code),
    contentHash: requireHash(row.contentHash, `${path}/contentHash`, code),
  };
}

export function canonicalWorldPackageManifestV1(
  value: unknown,
): WorldPackageManifestV1 {
  const code = "WORLD_PACKAGE_MANIFEST_INVALID";
  assertWorldPackageAccessorFreeDataGraphV1(
    value,
    "WORLD_PACKAGE_MANIFEST_ACCESSOR_FORBIDDEN",
  );
  const record = requireExactRecord(value, MANIFEST_FIELDS, "", code);
  if (record.kind !== "worldkit-world-package-manifest") fail(code, "kind", "invalid kind");
  if (record.schemaVersion !== 1) fail(code, "schemaVersion", "must be 1");
  if (record.packageFormatVersion !== 1) fail(code, "packageFormatVersion", "must be 1");
  if (record.runtimeTarget !== "babylon-web") fail(code, "runtimeTarget", "must be babylon-web");
  if (record.canonicalizationProfile !== "canonical-json-jcs@1") {
    fail(code, "canonicalizationProfile", "must be canonical-json-jcs@1");
  }
  if (record.hashAlgorithm !== "sha256") fail(code, "hashAlgorithm", "must be sha256");
  if (record.authoringSchemaVersion !== 4) fail(code, "authoringSchemaVersion", "must be 4");
  if (record.normalizedWorldIrSchemaVersion !== 4) {
    fail(code, "normalizedWorldIrSchemaVersion", "must be 4");
  }
  if (record.executionPlanSchemaVersion !== 5) {
    fail(code, "executionPlanSchemaVersion", "must be 5");
  }
  const entryPoint = requireExactRecord(record.entryPoint, ENTRY_POINT_FIELDS, "entryPoint", code);
  if (entryPoint.executionPlanPath !== "targets/babylon-web/execution-plan.json") {
    fail(code, "entryPoint/executionPlanPath", "invalid execution plan path");
  }
  if (!Array.isArray(record.resources)) fail(code, "resources", "must be an array");
  const resources = record.resources.map((row, index) =>
    canonicalResource(row, `resources/${index}`, code)
  ).sort((left, right) =>
    compareCanonicalStrings(left.resourceRef, right.resourceRef) ||
    compareCanonicalStrings(left.packagePath, right.packagePath)
  );
  if (new Set(resources.map((row) => row.resourceRef)).size !== resources.length) {
    fail(code, "resources", "resourceRef values must be unique");
  }
  if (new Set(resources.map((row) => row.packagePath)).size !== resources.length) {
    fail(code, "resources", "packagePath values must be unique");
  }
  return deepFreeze({
    kind: "worldkit-world-package-manifest",
    schemaVersion: 1,
    id: requireString(record.id, "id", code),
    packageFormatVersion: 1,
    worldId: requireString(record.worldId, "worldId", code),
    seed: requireNonNegativeSafeInteger(record.seed, "seed", code),
    runtimeTarget: "babylon-web",
    canonicalizationProfile: "canonical-json-jcs@1",
    hashAlgorithm: "sha256",
    authoringSchemaVersion: 4,
    normalizedWorldIrSchemaVersion: 4,
    executionPlanSchemaVersion: 5,
    authoringSpecHash: requireHash(record.authoringSpecHash, "authoringSpecHash", code),
    normalizedWorldIrHash: requireHash(record.normalizedWorldIrHash, "normalizedWorldIrHash", code),
    executionPlanHash: requireHash(record.executionPlanHash, "executionPlanHash", code),
    resourceLockHash: requireHash(record.resourceLockHash, "resourceLockHash", code),
    layoutSolveReportHash: requireHash(
      record.layoutSolveReportHash,
      "layoutSolveReportHash",
      code,
    ),
    initialControlledEntityId: requireString(
      record.initialControlledEntityId,
      "initialControlledEntityId",
      code,
    ),
    entryPoint: { executionPlanPath: "targets/babylon-web/execution-plan.json" },
    resources,
  });
}

export function hashWorldPackageManifestV1(
  value: unknown,
): WorldPackageSha256HashV1 {
  return sha256CanonicalJson(canonicalWorldPackageManifestV1(value)) as WorldPackageSha256HashV1;
}

function canonicalIntegrityEntry(
  value: unknown,
  path: string,
  code: string,
): WorldPackageFileIntegrityEntryV1 {
  const row = requireExactRecord(value, INTEGRITY_FIELDS, path, code);
  return {
    path: assertSafeWorldPackagePathV1(row.path, `${path}/path`, code, true),
    mediaType: requireString(row.mediaType, `${path}/mediaType`, code),
    sizeBytes: requireNonNegativeSafeInteger(row.sizeBytes, `${path}/sizeBytes`, code),
    sha256: requireHash(row.sha256, `${path}/sha256`, code),
  };
}

export function canonicalWorldPackageFileIntegrityEntriesV1(
  value: unknown,
): readonly WorldPackageFileIntegrityEntryV1[] {
  const code = "WORLD_PACKAGE_FILE_INTEGRITY_INVALID";
  assertWorldPackageAccessorFreeDataGraphV1(
    value,
    "WORLD_PACKAGE_FILE_INTEGRITY_ACCESSOR_FORBIDDEN",
  );
  if (!Array.isArray(value)) fail(code, "", "must be an array");
  const rows = value.map((row, index) =>
    canonicalIntegrityEntry(row, String(index), code)
  ).sort((left, right) => compareCanonicalStrings(left.path, right.path));
  if (new Set(rows.map((row) => row.path)).size !== rows.length) {
    fail(code, "", "paths must be unique");
  }
  return deepFreeze(rows);
}

export function hashWorldPackageRootV1(
  value: unknown,
): WorldPackageSha256HashV1 {
  const files = canonicalWorldPackageFileIntegrityEntriesV1(value);
  if (files.length === 0) {
    fail("WORLD_PACKAGE_ROOT_INVALID", "files", "must contain at least one file");
  }
  return sha256CanonicalJson({
    packageFormatVersion: 1,
    canonicalizationProfile: "canonical-json-jcs@1",
    hashAlgorithm: "sha256",
    files,
  }) as WorldPackageSha256HashV1;
}

export function deepFreeze<T>(
  value: T,
  visited: WeakSet<object> = new WeakSet<object>(),
): T {
  if (isNil(value) || typeof value !== "object") return value;
  const objectValue = value as object;
  if (visited.has(objectValue)) return value;
  visited.add(objectValue);
  for (const child of Object.values(objectValue as Record<string, unknown>)) {
    deepFreeze(child, visited);
  }
  return Object.isFrozen(objectValue) ? value : Object.freeze(value);
}
