import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";

export type NativeBlockSubjectVisualReviewVec3V1 = readonly [
  x: number,
  y: number,
  z: number,
];

export interface NativeBlockSubjectVisualReviewProxyCuboidV1 {
  readonly id: string;
  readonly minimumMetersXYZ: NativeBlockSubjectVisualReviewVec3V1;
  readonly maximumMetersXYZ: NativeBlockSubjectVisualReviewVec3V1;
}

export interface NativeBlockSubjectVisualReviewProxyBodyV1 {
  readonly kind: "native-block-subject-visual-review-proxy";
  readonly schemaVersion: 1;
  readonly initialControlledEntityId: string;
  readonly subjectDefinitionRef: string;
  readonly subjectDefinitionHash: Sha256HashV1;
  readonly subjectRuntimeDescriptorHash: Sha256HashV1;
  readonly worldRuntimeBootstrapRef: string;
  readonly worldRuntimeBootstrapContentHash: Sha256HashV1;
  readonly worldRuntimeBootstrapBytesHash: Sha256HashV1;
  readonly cuboids: readonly NativeBlockSubjectVisualReviewProxyCuboidV1[];
}

export interface NativeBlockSubjectVisualReviewProxyV1 extends
  NativeBlockSubjectVisualReviewProxyBodyV1 {
  readonly contentHash: Sha256HashV1;
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const PROXY_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "initialControlledEntityId",
  "subjectDefinitionRef",
  "subjectDefinitionHash",
  "subjectRuntimeDescriptorHash",
  "worldRuntimeBootstrapRef",
  "worldRuntimeBootstrapContentHash",
  "worldRuntimeBootstrapBytesHash",
  "cuboids",
  "contentHash",
] as const);
const CUBOID_FIELDS = Object.freeze([
  "id",
  "minimumMetersXYZ",
  "maximumMetersXYZ",
] as const);

function fail(): never {
  throw new TypeError("Invalid Native Block Subject visual-review proxy.");
}

function exactPlainRecord(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  ) return fail();
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== fields.length ||
    keys.some((key) => !fields.includes(key))
  ) return fail();
  return record;
}

function nonEmptyText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return fail();
  return value;
}

function sha256(value: unknown): Sha256HashV1 {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) return fail();
  return value as Sha256HashV1;
}

function vec3(value: unknown): NativeBlockSubjectVisualReviewVec3V1 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) return fail();
  return Object.freeze([value[0], value[1], value[2]]) as
    NativeBlockSubjectVisualReviewVec3V1;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function hashNativeBlockSubjectVisualReviewProxyBodyV1(
  body: NativeBlockSubjectVisualReviewProxyBodyV1,
): Sha256HashV1 {
  return sha256CanonicalJson(body) as Sha256HashV1;
}

export function parseNativeBlockSubjectVisualReviewProxyV1(
  value: unknown,
): NativeBlockSubjectVisualReviewProxyV1 {
  const record = exactPlainRecord(value, PROXY_FIELDS);
  if (
    record.kind !== "native-block-subject-visual-review-proxy" ||
    record.schemaVersion !== 1 ||
    !Array.isArray(record.cuboids) ||
    record.cuboids.length === 0
  ) return fail();
  const cuboids = record.cuboids.map((input) => {
    const cuboid = exactPlainRecord(input, CUBOID_FIELDS);
    const minimumMetersXYZ = vec3(cuboid.minimumMetersXYZ);
    const maximumMetersXYZ = vec3(cuboid.maximumMetersXYZ);
    if (minimumMetersXYZ.some((minimum, axis) =>
      minimum >= maximumMetersXYZ[axis]!)) return fail();
    return Object.freeze({
      id: nonEmptyText(cuboid.id),
      minimumMetersXYZ,
      maximumMetersXYZ,
    });
  });
  const ids = cuboids.map(({ id }) => id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id, index) =>
      index > 0 && compareCodePoints(ids[index - 1]!, id) >= 0)
  ) return fail();
  const body = Object.freeze({
    kind: "native-block-subject-visual-review-proxy" as const,
    schemaVersion: 1 as const,
    initialControlledEntityId: nonEmptyText(record.initialControlledEntityId),
    subjectDefinitionRef: nonEmptyText(record.subjectDefinitionRef),
    subjectDefinitionHash: sha256(record.subjectDefinitionHash),
    subjectRuntimeDescriptorHash: sha256(record.subjectRuntimeDescriptorHash),
    worldRuntimeBootstrapRef: nonEmptyText(record.worldRuntimeBootstrapRef),
    worldRuntimeBootstrapContentHash: sha256(
      record.worldRuntimeBootstrapContentHash,
    ),
    worldRuntimeBootstrapBytesHash: sha256(record.worldRuntimeBootstrapBytesHash),
    cuboids: Object.freeze(cuboids),
  });
  const contentHash = sha256(record.contentHash);
  if (contentHash !== hashNativeBlockSubjectVisualReviewProxyBodyV1(body)) {
    return fail();
  }
  return Object.freeze({ ...body, contentHash });
}

export function createNativeBlockSubjectVisualReviewProxyV1(
  input: Omit<NativeBlockSubjectVisualReviewProxyBodyV1, "kind" | "schemaVersion">,
): NativeBlockSubjectVisualReviewProxyV1 {
  const body = Object.freeze({
    kind: "native-block-subject-visual-review-proxy" as const,
    schemaVersion: 1 as const,
    ...input,
  });
  return parseNativeBlockSubjectVisualReviewProxyV1({
    ...body,
    contentHash: hashNativeBlockSubjectVisualReviewProxyBodyV1(body),
  });
}
