import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

export interface BabylonNativeInitialCameraV1 {
  readonly mode: "third-person";
  readonly pitchRadians: number;
  readonly distanceMeters: number;
  readonly fovDegrees: number;
  readonly targetHeightMeters: number;
}

export interface BabylonNativeSceneBootstrapV1 {
  readonly kind: "babylon-native-scene-bootstrap";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sceneModuleRef: string;
  readonly nativeSceneApiRef: string;
  readonly nativeSceneProfileRef: string;
  readonly gameplayBootstrapRef: string;
  readonly initialControlledEntityId: string;
  readonly gravityMetersPerSecondSquaredXYZ:
    readonly [number, number, number];
  readonly initialCamera: BabylonNativeInitialCameraV1;
  readonly seed: number;
  readonly spawnMarkerId: string;
}

const BOOTSTRAP_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "id",
  "sceneModuleRef",
  "nativeSceneApiRef",
  "nativeSceneProfileRef",
  "gameplayBootstrapRef",
  "initialControlledEntityId",
  "gravityMetersPerSecondSquaredXYZ",
  "initialCamera",
  "seed",
  "spawnMarkerId",
] as const);

const INITIAL_CAMERA_FIELDS = Object.freeze([
  "mode",
  "pitchRadians",
  "distanceMeters",
  "fovDegrees",
  "targetHeightMeters",
] as const);

const RESOURCE_NAME_PATTERN = "[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?";

function resourceRefPattern(resourceKind: string): RegExp {
  return new RegExp(
    `^worldkit://${resourceKind}/${RESOURCE_NAME_PATTERN}@[1-9][0-9]*$`,
  );
}

const SCENE_MODULE_REF_PATTERN = resourceRefPattern("native-scene");
const NATIVE_SCENE_API_REF_PATTERN = resourceRefPattern("native-scene-api");
const NATIVE_SCENE_PROFILE_REF_PATTERN =
  resourceRefPattern("native-scene-profile");
const GAMEPLAY_BOOTSTRAP_REF_PATTERN =
  resourceRefPattern("gameplay-bootstrap");
const MAX_NATIVE_DETERMINISTIC_SEED = 0xffff_ffff;

function invalidBootstrap(): never {
  throw new TypeError(
    "Value must match the closed BabylonNativeSceneBootstrapV1 schema.",
  );
}

function snapshotCanonicalData(input: unknown): unknown {
  if (isNil(input) || typeof input === "boolean" || typeof input === "string") {
    return input;
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input) || Object.is(input, -0)) invalidBootstrap();
    return input;
  }
  if (Array.isArray(input)) {
    try {
      if (
        Reflect.getPrototypeOf(input) !== Array.prototype ||
        Reflect.ownKeys(input).some((key) => typeof key === "symbol") ||
        Object.getOwnPropertyNames(input).length !== input.length + 1
      ) invalidBootstrap();
      const snapshot: unknown[] = [];
      for (let index = 0; index < input.length; index += 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
        if (
          isNil(descriptor) ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) invalidBootstrap();
        snapshot.push(snapshotCanonicalData(descriptor.value));
      }
      return snapshot;
    } catch {
      return invalidBootstrap();
    }
  }
  if (typeof input !== "object" || isNil(input)) return invalidBootstrap();
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) invalidBootstrap();
    const snapshot: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) invalidBootstrap();
      snapshot[key] = snapshotCanonicalData(descriptor.value);
    }
    return snapshot;
  } catch {
    return invalidBootstrap();
  }
}

function exactRecord(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalidBootstrap();
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(record, field)) ||
    keys.some((field) => !fields.includes(field))
  ) return invalidBootstrap();
  return record;
}

function nonEmptyIdentity(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.normalize("NFC") !== input
  ) return invalidBootstrap();
  return input;
}

function resourceRef(input: unknown, pattern: RegExp): string {
  const value = nonEmptyIdentity(input);
  if (!pattern.test(value)) return invalidBootstrap();
  return value;
}

function finiteNumber(input: unknown): number {
  if (
    typeof input !== "number" ||
    !Number.isFinite(input) ||
    Object.is(input, -0)
  ) return invalidBootstrap();
  return input;
}

function positiveNumber(input: unknown): number {
  const value = finiteNumber(input);
  if (value <= 0) return invalidBootstrap();
  return value;
}

function unsigned32BitInteger(input: unknown): number {
  const value = finiteNumber(input);
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_NATIVE_DETERMINISTIC_SEED
  ) return invalidBootstrap();
  return value;
}

function gravityTuple(input: unknown): readonly [number, number, number] {
  if (!Array.isArray(input) || input.length !== 3) return invalidBootstrap();
  return Object.freeze([
    finiteNumber(input[0]),
    finiteNumber(input[1]),
    finiteNumber(input[2]),
  ] as const);
}

export function parseBabylonNativeInitialCameraV1(input: unknown): BabylonNativeInitialCameraV1 {
  const record = exactRecord(snapshotCanonicalData(input), INITIAL_CAMERA_FIELDS);
  if (record.mode !== "third-person") return invalidBootstrap();
  const fovDegrees = finiteNumber(record.fovDegrees);
  if (fovDegrees <= 0 || fovDegrees >= 180) return invalidBootstrap();
  return Object.freeze({
    mode: "third-person",
    pitchRadians: finiteNumber(record.pitchRadians),
    distanceMeters: positiveNumber(record.distanceMeters),
    fovDegrees,
    targetHeightMeters: finiteNumber(record.targetHeightMeters),
  });
}

export function parseBabylonNativeSceneBootstrapV1(
  input: unknown,
): BabylonNativeSceneBootstrapV1 {
  const record = exactRecord(
    snapshotCanonicalData(input),
    BOOTSTRAP_FIELDS,
  );
  if (
    record.kind !== "babylon-native-scene-bootstrap" ||
    record.schemaVersion !== 1
  ) return invalidBootstrap();
  return Object.freeze({
    kind: "babylon-native-scene-bootstrap",
    schemaVersion: 1,
    id: nonEmptyIdentity(record.id),
    sceneModuleRef: resourceRef(record.sceneModuleRef, SCENE_MODULE_REF_PATTERN),
    nativeSceneApiRef: resourceRef(
      record.nativeSceneApiRef,
      NATIVE_SCENE_API_REF_PATTERN,
    ),
    nativeSceneProfileRef: resourceRef(
      record.nativeSceneProfileRef,
      NATIVE_SCENE_PROFILE_REF_PATTERN,
    ),
    gameplayBootstrapRef: resourceRef(
      record.gameplayBootstrapRef,
      GAMEPLAY_BOOTSTRAP_REF_PATTERN,
    ),
    initialControlledEntityId: nonEmptyIdentity(
      record.initialControlledEntityId,
    ),
    gravityMetersPerSecondSquaredXYZ: gravityTuple(
      record.gravityMetersPerSecondSquaredXYZ,
    ),
    initialCamera: parseBabylonNativeInitialCameraV1(record.initialCamera),
    seed: unsigned32BitInteger(record.seed),
    spawnMarkerId: nonEmptyIdentity(record.spawnMarkerId),
  });
}

export function hashBabylonNativeSceneBootstrapV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseBabylonNativeSceneBootstrapV1(input),
  ) as Sha256HashV1;
}
