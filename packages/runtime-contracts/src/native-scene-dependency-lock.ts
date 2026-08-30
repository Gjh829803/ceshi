import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";

import {
  exactContractRecordV1,
  invalidContractDataV1,
  contractHashV1,
  contractIdentityV1,
  snapshotContractDataV1,
} from "./strict-contract-data";

export interface BabylonNativeDependencyLockEntryV1 {
  readonly packageName: string;
  readonly resolvedVersion: string;
  readonly packageManifestHash: Sha256HashV1;
  readonly packageIntegrityHash: Sha256HashV1;
  readonly usage: "runtime-external" | "bundle-toolchain";
}

export interface BabylonNativeDependencyLockV1 {
  readonly kind: "babylon-native-dependency-lock";
  readonly schemaVersion: 1;
  readonly lockfileHash: Sha256HashV1;
  readonly entries: readonly BabylonNativeDependencyLockEntryV1[];
}

const INVALID = "BABYLON_NATIVE_DEPENDENCY_LOCK_INVALID";
const LOCK_FIELDS = Object.freeze(["kind", "schemaVersion", "lockfileHash", "entries"] as const);
const ENTRY_FIELDS = Object.freeze([
  "packageName", "resolvedVersion", "packageManifestHash", "packageIntegrityHash", "usage",
] as const);
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/;

export function parseBabylonNativeDependencyLockV1(
  input: unknown,
): BabylonNativeDependencyLockV1 {
  const record = exactContractRecordV1(
    snapshotContractDataV1(input, INVALID),
    LOCK_FIELDS,
    INVALID,
  );
  if (
    record.kind !== "babylon-native-dependency-lock" ||
    record.schemaVersion !== 1 ||
    !Array.isArray(record.entries) ||
    record.entries.length === 0
  ) return invalidContractDataV1(INVALID);
  const seen = new Set<string>();
  const entries = record.entries.map((candidate) => {
    const entry = exactContractRecordV1(candidate, ENTRY_FIELDS, INVALID);
    const packageName = contractIdentityV1(entry.packageName, INVALID);
    if (
      !PACKAGE_NAME_PATTERN.test(packageName) ||
      packageName === "@babylonjs/havok" ||
      seen.has(packageName) ||
      (entry.usage !== "runtime-external" && entry.usage !== "bundle-toolchain")
    ) return invalidContractDataV1(INVALID);
    seen.add(packageName);
    return Object.freeze({
      packageName,
      resolvedVersion: contractIdentityV1(entry.resolvedVersion, INVALID),
      packageManifestHash: contractHashV1(entry.packageManifestHash, INVALID),
      packageIntegrityHash: contractHashV1(entry.packageIntegrityHash, INVALID),
      usage: entry.usage,
    });
  });
  entries.sort((left, right) =>
    left.packageName < right.packageName ? -1 : left.packageName > right.packageName ? 1 : 0
  );
  return Object.freeze({
    kind: "babylon-native-dependency-lock",
    schemaVersion: 1,
    lockfileHash: contractHashV1(record.lockfileHash, INVALID),
    entries: Object.freeze(entries),
  });
}

export function canonicalBabylonNativeDependencyLockBytesV1(input: unknown): Uint8Array {
  return canonicalJsonBytes(parseBabylonNativeDependencyLockV1(input));
}

export function hashBabylonNativeDependencyLockV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(parseBabylonNativeDependencyLockV1(input)) as Sha256HashV1;
}
