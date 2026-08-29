import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

export type WorldPackageRefV1 =
  `package://world-package/sha256/${string}`;

export interface WorldBuildIdentityV1 {
  readonly kind: "world-build-identity";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly worldPackageRef: WorldPackageRefV1;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly gameplayBootstrapHash: Sha256HashV1;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly sceneSourceIdentity:
    | Readonly<{
        kind: "canonical-execution-plan";
        executionPlanHash: Sha256HashV1;
      }>
    | Readonly<{
        kind: "babylon-native-scene";
        nativeSceneBootstrapHash: Sha256HashV1;
        sceneModuleBundleHash: Sha256HashV1;
        nativeSceneContributionHash: Sha256HashV1;
      }>;
}

const IDENTITY_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "id",
  "worldPackageRef",
  "worldPackageRootHash",
  "gameplayBootstrapHash",
  "worldRuntimeBootstrapHash",
  "sceneSourceIdentity",
] as const);
const CANONICAL_SOURCE_FIELDS = Object.freeze([
  "kind",
  "executionPlanHash",
] as const);
const NATIVE_SOURCE_FIELDS = Object.freeze([
  "kind",
  "nativeSceneBootstrapHash",
  "sceneModuleBundleHash",
  "nativeSceneContributionHash",
] as const);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const WORLD_PACKAGE_REF_PATTERN =
  /^package:\/\/world-package\/sha256\/([a-f0-9]{64})$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;

function invalidIdentity(): never {
  throw new TypeError(
    "WORLD_BUILD_IDENTITY_INVALID: value must match the closed WorldBuildIdentityV1 schema",
  );
}

function invalidPackageRef(): never {
  throw new TypeError(
    "WORLD_PACKAGE_REF_INVALID: value must bind one non-zero lowercase sha256 Package Root",
  );
}

function snapshotDataRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalidIdentity();
  }
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) {
      return invalidIdentity();
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return invalidIdentity();
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return invalidIdentity();
  }
}

function exactRecord(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  const record = snapshotDataRecord(input);
  const keys = Object.keys(record);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(record, field)) ||
    keys.some((field) => !fields.includes(field))
  ) {
    return invalidIdentity();
  }
  return record;
}

function canonicalId(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.normalize("NFC") !== input
  ) {
    return invalidIdentity();
  }
  return input;
}

function sha256Hash(input: unknown): Sha256HashV1 {
  if (
    typeof input !== "string" ||
    !HASH_PATTERN.test(input) ||
    input === ZERO_HASH
  ) {
    return invalidIdentity();
  }
  return input as Sha256HashV1;
}

function parseSceneSourceIdentity(
  input: unknown,
): WorldBuildIdentityV1["sceneSourceIdentity"] {
  const snapshot = snapshotDataRecord(input);
  if (snapshot.kind === "canonical-execution-plan") {
    const record = exactRecord(snapshot, CANONICAL_SOURCE_FIELDS);
    return Object.freeze({
      kind: "canonical-execution-plan",
      executionPlanHash: sha256Hash(record.executionPlanHash),
    });
  }
  if (snapshot.kind === "babylon-native-scene") {
    const record = exactRecord(snapshot, NATIVE_SOURCE_FIELDS);
    return Object.freeze({
      kind: "babylon-native-scene",
      nativeSceneBootstrapHash: sha256Hash(
        record.nativeSceneBootstrapHash,
      ),
      sceneModuleBundleHash: sha256Hash(record.sceneModuleBundleHash),
      nativeSceneContributionHash: sha256Hash(
        record.nativeSceneContributionHash,
      ),
    });
  }
  return invalidIdentity();
}

export function worldPackageRefFromRootHashV1(
  hash: Sha256HashV1,
): WorldPackageRefV1 {
  if (
    typeof hash !== "string" ||
    !HASH_PATTERN.test(hash) ||
    hash === ZERO_HASH
  ) {
    return invalidPackageRef();
  }
  return `package://world-package/sha256/${hash.slice(7)}`;
}

export function worldPackageRootHashFromRefV1(
  ref: unknown,
): Sha256HashV1 {
  if (typeof ref !== "string") return invalidPackageRef();
  const match = WORLD_PACKAGE_REF_PATTERN.exec(ref);
  if (isNil(match) || match[1] === "0".repeat(64)) {
    return invalidPackageRef();
  }
  return `sha256:${match[1]}` as Sha256HashV1;
}

export function parseWorldBuildIdentityV1(
  input: unknown,
): WorldBuildIdentityV1 {
  const record = exactRecord(input, IDENTITY_FIELDS);
  if (
    record.kind !== "world-build-identity" ||
    record.schemaVersion !== 1
  ) {
    return invalidIdentity();
  }
  const worldPackageRootHash = sha256Hash(record.worldPackageRootHash);
  const worldPackageRef = record.worldPackageRef;
  if (
    typeof worldPackageRef !== "string" ||
    worldPackageRootHashFromRefV1(worldPackageRef) !== worldPackageRootHash
  ) {
    return invalidIdentity();
  }
  return Object.freeze({
    kind: "world-build-identity",
    schemaVersion: 1,
    id: canonicalId(record.id),
    worldPackageRef: worldPackageRef as WorldPackageRefV1,
    worldPackageRootHash,
    gameplayBootstrapHash: sha256Hash(record.gameplayBootstrapHash),
    worldRuntimeBootstrapHash: sha256Hash(
      record.worldRuntimeBootstrapHash,
    ),
    sceneSourceIdentity: parseSceneSourceIdentity(
      record.sceneSourceIdentity,
    ),
  });
}

export function worldBuildIdentityCanonicalBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseWorldBuildIdentityV1(input));
}

export function hashWorldBuildIdentityV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseWorldBuildIdentityV1(input),
  ) as Sha256HashV1;
}
