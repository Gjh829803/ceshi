import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import { isNil } from "lodash-es";

/**
 * Single Host owner of Native Block Chunk partitioning. Visual batching,
 * Collider partitioning and Runtime physics residency must all resolve Chunk
 * identity through this module so one Build Epoch cannot hold two competing
 * spatial partitions. The Chunk profile is never Agent-authored; `scene.ts`
 * and Canonical JSON expose no Chunk DSL.
 */
export interface BabylonNativeBlockChunkPolicyV1 {
  readonly kind: "babylon-native-block-chunk-policy";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly partitionKind: "fixed-xz-grid";
  readonly sizeMetersXZ: readonly [number, number];
  readonly originMetersXZ: readonly [number, number];
  readonly boundaryMode: "half-open-lower-owned";
}

export type BabylonNativeBlockChunkAssignmentV1 =
  | Readonly<{
      kind: "grid-chunk";
      id: string;
      chunkIndexXZ: readonly [number, number];
      minimumMetersXZ: readonly [number, number];
      maximumMetersXZ: readonly [number, number];
    }>
  | Readonly<{ kind: "chunk-straddling"; id: string }>;

const POLICY_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const GEOMETRY_EPSILON = 1e-8;
const CODE = "WORLDKIT_NATIVE_BLOCK_CHUNK_POLICY_INVALID";

function fail(message: string): never {
  throw new TypeError(`${CODE}: ${message}`);
}

function policy(
  id: string,
  edgeMeters: number,
): BabylonNativeBlockChunkPolicyV1 {
  return Object.freeze({
    kind: "babylon-native-block-chunk-policy" as const,
    schemaVersion: 1 as const,
    id,
    partitionKind: "fixed-xz-grid" as const,
    sizeMetersXZ: Object.freeze([edgeMeters, edgeMeters]) as
      readonly [number, number],
    // The fixed Block occupancy lattice places one-meter Block faces on the
    // half-meter plane, so the Chunk origin keeps every Chunk boundary on a
    // Block face instead of cutting one Block in half.
    originMetersXZ: Object.freeze([-0.5, -0.5]) as readonly [number, number],
    boundaryMode: "half-open-lower-owned" as const,
  });
}

/**
 * Closed set of Host-selectable Chunk profiles. `NBR-65F` measures every
 * candidate against the positive reconstruction Corpus before one becomes the
 * frozen current policy; the Builder cannot add a candidate.
 */
export const BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1 = Object.freeze([
  policy("chunk-xz-2m", 2),
  policy("chunk-xz-4m", 4),
  policy("chunk-xz-8m", 8),
  policy("chunk-xz-16m", 16),
  // CF-20: measure the pinned old edge size with Native extent ownership.
  // This is not the old center-based/greedy cluster partition or a new default.
  policy("chunk-xz-32m", 32),
] as const);

export type BabylonNativeBlockChunkPolicyIdV1 =
  (typeof BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1)[number]["id"];

/**
 * Frozen current policy. `chunk-policy-benchmark.test.ts` re-derives this
 * selection from the five positive Corpus Cases on every run, so changing the
 * constant without new benchmark evidence fails the focused gate.
 */
export const BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1:
  BabylonNativeBlockChunkPolicyV1 =
    BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1[1];

export function hashBabylonNativeBlockChunkPolicyV1(
  input: BabylonNativeBlockChunkPolicyV1,
): Sha256HashV1 {
  return sha256CanonicalJson(parseBabylonNativeBlockChunkPolicyV1(input)) as
    Sha256HashV1;
}

export const BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1:
  Sha256HashV1 = hashBabylonNativeBlockChunkPolicyV1(
    BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
  );

function finitePairXZ(input: unknown, field: string): readonly [number, number] {
  if (
    !Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Array.prototype ||
    input.length !== 2 ||
    Object.getOwnPropertyNames(input).length !== 3 ||
    input.some((value) => typeof value !== "number" ||
      !Number.isFinite(value) || Object.is(value, -0))
  ) return fail(`${field} must be one ordinary dense finite XZ pair`);
  return Object.freeze([input[0] as number, input[1] as number]) as
    readonly [number, number];
}

export function parseBabylonNativeBlockChunkPolicyV1(
  input: unknown,
): BabylonNativeBlockChunkPolicyV1 {
  const keys = [
    "kind",
    "schemaVersion",
    "id",
    "partitionKind",
    "sizeMetersXZ",
    "originMetersXZ",
    "boundaryMode",
  ] as const;
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype
  ) return fail("Chunk policy must be one plain record");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(input).some((key) => typeof key !== "string") ||
    Object.keys(descriptors).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(descriptors, key)) ||
    Object.values(descriptors).some((descriptor) =>
      !descriptor.enumerable || !("value" in descriptor))
  ) return fail("Chunk policy must use the closed field set");
  const record = Object.fromEntries(keys.map((key) =>
    [key, descriptors[key]!.value])) as Record<string, unknown>;
  if (
    record.kind !== "babylon-native-block-chunk-policy" ||
    record.schemaVersion !== 1 ||
    record.partitionKind !== "fixed-xz-grid" ||
    record.boundaryMode !== "half-open-lower-owned" ||
    typeof record.id !== "string" ||
    !POLICY_ID.test(record.id) ||
    record.id.normalize("NFC") !== record.id
  ) return fail("Chunk policy uses an unsupported contract");
  const sizeMetersXZ = finitePairXZ(record.sizeMetersXZ, "sizeMetersXZ");
  const originMetersXZ = finitePairXZ(record.originMetersXZ, "originMetersXZ");
  if (sizeMetersXZ.some((value) => value <= 0)) {
    return fail("sizeMetersXZ must hold two positive edge lengths");
  }
  return Object.freeze({
    kind: "babylon-native-block-chunk-policy",
    schemaVersion: 1,
    id: record.id,
    partitionKind: "fixed-xz-grid",
    sizeMetersXZ,
    originMetersXZ,
    boundaryMode: "half-open-lower-owned",
  });
}

export function babylonNativeBlockChunkAxisIndexV1(
  policyInput: BabylonNativeBlockChunkPolicyV1,
  axis: 0 | 1,
  meters: number,
): number {
  if (!Number.isFinite(meters)) {
    return fail("Chunk assignment requires one finite metric coordinate");
  }
  return Math.floor(
    (meters - policyInput.originMetersXZ[axis]!) /
      policyInput.sizeMetersXZ[axis]!,
  );
}

function signedIndex(index: number): string {
  return index < 0 ? `n${Math.abs(index)}` : `p${index}`;
}

export function babylonNativeBlockChunkIdV1(
  chunkIndexXZ: readonly [number, number],
): string {
  return `grid-chunk-x${signedIndex(chunkIndexXZ[0])}-z${
    signedIndex(chunkIndexXZ[1])}`;
}

export function babylonNativeBlockChunkBoundsMetersXZV1(
  policyInput: BabylonNativeBlockChunkPolicyV1,
  chunkIndexXZ: readonly [number, number],
): Readonly<{
  minimumMetersXZ: readonly [number, number];
  maximumMetersXZ: readonly [number, number];
}> {
  const minimumMetersXZ = Object.freeze([
    policyInput.originMetersXZ[0]! + chunkIndexXZ[0] *
      policyInput.sizeMetersXZ[0]!,
    policyInput.originMetersXZ[1]! + chunkIndexXZ[1] *
      policyInput.sizeMetersXZ[1]!,
  ]) as readonly [number, number];
  return Object.freeze({
    minimumMetersXZ,
    maximumMetersXZ: Object.freeze([
      minimumMetersXZ[0] + policyInput.sizeMetersXZ[0]!,
      minimumMetersXZ[1] + policyInput.sizeMetersXZ[1]!,
    ]) as readonly [number, number],
  });
}

/**
 * Resolve one axis-aligned extent to its owning Chunk. An extent that crosses a
 * Chunk boundary stays `chunk-straddling` so batching and Collider partitioning
 * never silently move geometry into a Chunk that does not contain it.
 */
export function resolveBabylonNativeBlockChunkAssignmentV1(
  policyInput: BabylonNativeBlockChunkPolicyV1,
  extent: Readonly<{
    minimumMetersXYZ: readonly number[];
    maximumMetersXYZ: readonly number[];
    straddlingId: string;
  }>,
): BabylonNativeBlockChunkAssignmentV1 {
  const chunkIndexXZ = Object.freeze([
    babylonNativeBlockChunkAxisIndexV1(
      policyInput,
      0,
      (extent.minimumMetersXYZ[0]! + extent.maximumMetersXYZ[0]!) / 2,
    ),
    babylonNativeBlockChunkAxisIndexV1(
      policyInput,
      1,
      (extent.minimumMetersXYZ[2]! + extent.maximumMetersXYZ[2]!) / 2,
    ),
  ]) as readonly [number, number];
  const bounds = babylonNativeBlockChunkBoundsMetersXZV1(
    policyInput,
    chunkIndexXZ,
  );
  const fits = extent.minimumMetersXYZ[0]! >=
      bounds.minimumMetersXZ[0]! - GEOMETRY_EPSILON &&
    extent.maximumMetersXYZ[0]! <=
      bounds.maximumMetersXZ[0]! + GEOMETRY_EPSILON &&
    extent.minimumMetersXYZ[2]! >=
      bounds.minimumMetersXZ[1]! - GEOMETRY_EPSILON &&
    extent.maximumMetersXYZ[2]! <=
      bounds.maximumMetersXZ[1]! + GEOMETRY_EPSILON;
  return fits
    ? Object.freeze({
        kind: "grid-chunk" as const,
        id: babylonNativeBlockChunkIdV1(chunkIndexXZ),
        chunkIndexXZ,
        minimumMetersXZ: bounds.minimumMetersXZ,
        maximumMetersXZ: bounds.maximumMetersXZ,
      })
    : Object.freeze({
        kind: "chunk-straddling" as const,
        id: extent.straddlingId,
      });
}
