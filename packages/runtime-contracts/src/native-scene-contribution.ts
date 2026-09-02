import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

// Persistent, Babylon-free contributions are owned by Runtime Contracts.

const STANDARD_NATIVE_SCENE_PROFILE_REF =
  "worldkit://native-scene-profile/whitebox.standard@1" as const;
export const BABYLON_NATIVE_BLOCK_PROFILE_REF_V1 =
  "worldkit://native-scene-profile/whitebox.blocks@1" as const;

export type BabylonNativeTraversalBindingInputV1 =
  | Readonly<{ kind: "not-traversable" }>
  | Readonly<{
      kind: "static-surface";
      surfaceEntityId: string;
      logicalSubshapeId: string;
      traversalSurfaceProfileRef: string;
    }>;

export type BabylonNativeContributionTraversalBindingV1 =
  | Readonly<{ kind: "not-traversable" }>
  | Readonly<{
      kind: "static-surface";
      surfaceEntityId: string;
      logicalSubshapeId: string;
      traversalSurfaceProfileRef: string;
      traversalSurfaceId: string;
    }>;

export interface BabylonNativeSpawnMarkerContributionV1 {
  readonly id: string;
  readonly positionMetersXYZ: readonly [number, number, number];
  readonly facingRadians: number;
}

export type BabylonNativeStaticColliderRuntimeRoleV1 =
  | "scene-static-collider"
  | "ground-safety-boundary";

export interface BabylonNativeStaticColliderContributionV1 {
  readonly id: string;
  readonly runtimeRole: BabylonNativeStaticColliderRuntimeRoleV1;
  readonly colliderSubshapeId: string;
  readonly geometryHash: `sha256:${string}`;
  readonly worldPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly frictionRatio: number;
  readonly restitutionRatio: number;
  readonly traversalBinding: BabylonNativeContributionTraversalBindingV1;
}

export type BabylonNativeProfileSettlementReceiptV1 =
  | Readonly<{
      kind: "none";
      profileRef: typeof STANDARD_NATIVE_SCENE_PROFILE_REF;
    }>
  | Readonly<{
      kind: "host-snapshot";
      profileRef: typeof BABYLON_NATIVE_BLOCK_PROFILE_REF_V1;
      targetCount: number;
      profileInventoryHash: `sha256:${string}`;
      settledVisualHash: `sha256:${string}`;
    }>;

export interface BabylonNativeSceneContributionV1 {
  readonly kind: "babylon-native-scene-contribution";
  readonly schemaVersion: 1;
  readonly sceneModuleRef: string;
  readonly sceneModuleId: string;
  readonly profileSettlement: BabylonNativeProfileSettlementReceiptV1;
  readonly spawnMarker: BabylonNativeSpawnMarkerContributionV1;
  readonly staticColliders: readonly BabylonNativeStaticColliderContributionV1[];
}

export interface CreateBabylonNativeStaticColliderContributionInputV1 {
  readonly id: string;
  readonly runtimeRole: BabylonNativeStaticColliderRuntimeRoleV1;
  readonly worldPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
  readonly frictionRatio: number;
  readonly restitutionRatio: number;
  readonly traversalBinding: BabylonNativeTraversalBindingInputV1;
}

const CONTRIBUTION_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "sceneModuleRef",
  "sceneModuleId",
  "profileSettlement",
  "spawnMarker",
  "staticColliders",
] as const);

const SPAWN_FIELDS = Object.freeze([
  "id",
  "positionMetersXYZ",
  "facingRadians",
] as const);

const COLLIDER_FIELDS = Object.freeze([
  "id",
  "runtimeRole",
  "colliderSubshapeId",
  "geometryHash",
  "worldPositionsMetersXYZ",
  "triangleIndices",
  "vertexCount",
  "triangleCount",
  "frictionRatio",
  "restitutionRatio",
  "traversalBinding",
] as const);

const NATIVE_SCENE_REF_PATTERN =
  /^worldkit:\/\/native-scene\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?@[1-9][0-9]*$/;
const TRAVERSAL_PROFILE_REF_PATTERN =
  /^worldkit:\/\/traversal-surface-profile\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?@[1-9][0-9]*$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
function invalidContribution(): never {
  throw new TypeError(
    "Value must match the closed BabylonNativeSceneContributionV1 schema.",
  );
}

function canonicalNumber(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return invalidContribution();
  }
  return Object.is(input, -0) ? 0 : input;
}

function parsedCanonicalNumber(input: unknown): number {
  const value = canonicalNumber(input);
  if (Object.is(input, -0)) return invalidContribution();
  return value;
}

function identity(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.normalize("NFC") !== input
  ) return invalidContribution();
  return input;
}

function exactRecord(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalidContribution();
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(record, field)) ||
    keys.some((field) => !fields.includes(field))
  ) return invalidContribution();
  return record;
}

function snapshotCanonicalData(input: unknown): unknown {
  if (isNil(input) || typeof input === "boolean" || typeof input === "string") {
    return input;
  }
  if (typeof input === "number") return parsedCanonicalNumber(input);
  if (Array.isArray(input)) {
    try {
      if (
        Reflect.getPrototypeOf(input) !== Array.prototype ||
        Reflect.ownKeys(input).some((key) => typeof key === "symbol") ||
        Object.getOwnPropertyNames(input).length !== input.length + 1
      ) invalidContribution();
      const output: unknown[] = [];
      for (let index = 0; index < input.length; index += 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
        if (
          isNil(descriptor) ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) invalidContribution();
        output.push(snapshotCanonicalData(descriptor.value));
      }
      return output;
    } catch {
      return invalidContribution();
    }
  }
  if (typeof input !== "object" || isNil(input)) return invalidContribution();
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) invalidContribution();
    const output: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) invalidContribution();
      output[key] = snapshotCanonicalData(descriptor.value);
    }
    return output;
  } catch {
    return invalidContribution();
  }
}

function canonicalNumbers(
  input: unknown,
  minimumLength: number,
  parsed: boolean,
): readonly number[] {
  if (!Array.isArray(input) || input.length < minimumLength) {
    return invalidContribution();
  }
  return Object.freeze(
    input.map((value) => parsed
      ? parsedCanonicalNumber(value)
      : canonicalNumber(value)),
  );
}

function triangleIndices(
  input: unknown,
  vertexCount: number,
): readonly number[] {
  if (!Array.isArray(input) || input.length === 0 || input.length % 3 !== 0) {
    return invalidContribution();
  }
  const indices = input.map((value) => {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value >= vertexCount
    ) return invalidContribution();
    return value;
  });
  return Object.freeze(indices);
}

function ratio(input: unknown, parsed: boolean): number {
  const value = parsed ? parsedCanonicalNumber(input) : canonicalNumber(input);
  if (value < 0 || value > 1) return invalidContribution();
  return value;
}

export function parseBabylonNativeTraversalBindingInputV1(
  input: unknown,
): BabylonNativeTraversalBindingInputV1 {
  const snapshot = snapshotCanonicalData(input);
  const source = snapshot as Record<string, unknown>;
  if (source?.kind === "not-traversable") {
    exactRecord(snapshot, ["kind"]);
    return Object.freeze({ kind: "not-traversable" });
  }
  if (source?.kind === "static-surface") {
    const record = exactRecord(snapshot, [
      "kind",
      "surfaceEntityId",
      "logicalSubshapeId",
      "traversalSurfaceProfileRef",
    ]);
    const traversalSurfaceProfileRef = identity(
      record.traversalSurfaceProfileRef,
    );
    if (!TRAVERSAL_PROFILE_REF_PATTERN.test(traversalSurfaceProfileRef)) {
      return invalidContribution();
    }
    return Object.freeze({
      kind: "static-surface",
      surfaceEntityId: identity(record.surfaceEntityId),
      logicalSubshapeId: identity(record.logicalSubshapeId),
      traversalSurfaceProfileRef,
    });
  }
  return invalidContribution();
}

function geometryHash(
  worldPositionsMetersXYZ: readonly number[],
  triangleIndicesValue: readonly number[],
): `sha256:${string}` {
  return sha256CanonicalJson({
    kind: "babylon-native-collider-geometry",
    worldPositionsMetersXYZ,
    triangleIndices: triangleIndicesValue,
  }) as `sha256:${string}`;
}

function deriveColliderSubshapeId(
  id: string,
  runtimeRole: BabylonNativeStaticColliderRuntimeRoleV1,
  frozenGeometryHash: `sha256:${string}`,
  traversalBinding: BabylonNativeTraversalBindingInputV1,
): string {
  const hash = sha256CanonicalJson({
    kind: "babylon-native-collider-subshape-identity",
    colliderId: id,
    runtimeRole,
    geometryHash: frozenGeometryHash,
    traversalBinding,
  });
  return `collider-subshape:${hash.slice("sha256:".length)}`;
}

function contributionBinding(
  binding: BabylonNativeTraversalBindingInputV1,
  colliderSubshapeId: string,
): BabylonNativeContributionTraversalBindingV1 {
  if (binding.kind === "not-traversable") {
    return Object.freeze({ kind: "not-traversable" });
  }
  const traversalSurfaceIdHash = sha256CanonicalJson({
    kind: "babylon-native-traversal-surface-identity",
    colliderSubshapeId,
    surfaceEntityId: binding.surfaceEntityId,
    logicalSubshapeId: binding.logicalSubshapeId,
    traversalSurfaceProfileRef: binding.traversalSurfaceProfileRef,
  });
  return Object.freeze({
    ...binding,
    traversalSurfaceId:
      `traversal-surface:${traversalSurfaceIdHash.slice("sha256:".length)}`,
  });
}

export function createBabylonNativeStaticColliderContributionV1(
  input: CreateBabylonNativeStaticColliderContributionInputV1,
): BabylonNativeStaticColliderContributionV1 {
  const id = identity(input.id);
  const runtimeRole = input.runtimeRole;
  if (
    runtimeRole !== "scene-static-collider" &&
    runtimeRole !== "ground-safety-boundary"
  ) return invalidContribution();
  const worldPositionsMetersXYZ = canonicalNumbers(
    input.worldPositionsMetersXYZ,
    9,
    false,
  );
  if (worldPositionsMetersXYZ.length % 3 !== 0) return invalidContribution();
  const vertexCount = worldPositionsMetersXYZ.length / 3;
  const frozenTriangleIndices = triangleIndices(
    input.triangleIndices,
    vertexCount,
  );
  const frozenGeometryHash = geometryHash(
    worldPositionsMetersXYZ,
    frozenTriangleIndices,
  );
  const binding = parseBabylonNativeTraversalBindingInputV1(input.traversalBinding);
  if (
    runtimeRole === "ground-safety-boundary" &&
    binding.kind !== "not-traversable"
  ) return invalidContribution();
  const colliderSubshapeId = deriveColliderSubshapeId(
    id,
    runtimeRole,
    frozenGeometryHash,
    binding,
  );
  return Object.freeze({
    id,
    runtimeRole,
    colliderSubshapeId,
    geometryHash: frozenGeometryHash,
    worldPositionsMetersXYZ,
    triangleIndices: frozenTriangleIndices,
    vertexCount,
    triangleCount: frozenTriangleIndices.length / 3,
    frictionRatio: ratio(input.frictionRatio, false),
    restitutionRatio: ratio(input.restitutionRatio, false),
    traversalBinding: contributionBinding(binding, colliderSubshapeId),
  });
}

function parsedSpawnMarker(
  input: unknown,
): BabylonNativeSpawnMarkerContributionV1 {
  const record = exactRecord(input, SPAWN_FIELDS);
  const position = canonicalNumbers(record.positionMetersXYZ, 3, true);
  if (position.length !== 3) return invalidContribution();
  return Object.freeze({
    id: identity(record.id),
    positionMetersXYZ: Object.freeze([
      position[0]!,
      position[1]!,
      position[2]!,
    ] as const),
    facingRadians: parsedCanonicalNumber(record.facingRadians),
  });
}

function baseBindingFromContribution(
  input: unknown,
): BabylonNativeTraversalBindingInputV1 {
  const source = input as Record<string, unknown>;
  if (source?.kind === "not-traversable") {
    exactRecord(input, ["kind"]);
    return Object.freeze({ kind: "not-traversable" });
  }
  if (source?.kind === "static-surface") {
    const record = exactRecord(input, [
      "kind",
      "surfaceEntityId",
      "logicalSubshapeId",
      "traversalSurfaceProfileRef",
      "traversalSurfaceId",
    ]);
    return parseBabylonNativeTraversalBindingInputV1({
      kind: "static-surface",
      surfaceEntityId: record.surfaceEntityId,
      logicalSubshapeId: record.logicalSubshapeId,
      traversalSurfaceProfileRef: record.traversalSurfaceProfileRef,
    });
  }
  return invalidContribution();
}

function parsedCollider(
  input: unknown,
): BabylonNativeStaticColliderContributionV1 {
  const record = exactRecord(input, COLLIDER_FIELDS);
  const worldPositionsMetersXYZ = canonicalNumbers(
    record.worldPositionsMetersXYZ,
    9,
    true,
  );
  if (worldPositionsMetersXYZ.length % 3 !== 0) return invalidContribution();
  const vertexCount = worldPositionsMetersXYZ.length / 3;
  const frozenTriangleIndices = triangleIndices(
    record.triangleIndices,
    vertexCount,
  );
  const baseBinding = baseBindingFromContribution(record.traversalBinding);
  const recreated = createBabylonNativeStaticColliderContributionV1({
    id: identity(record.id),
    runtimeRole: record.runtimeRole as BabylonNativeStaticColliderRuntimeRoleV1,
    worldPositionsMetersXYZ,
    triangleIndices: frozenTriangleIndices,
    frictionRatio: ratio(record.frictionRatio, true),
    restitutionRatio: ratio(record.restitutionRatio, true),
    traversalBinding: baseBinding,
  });
  if (
    record.vertexCount !== recreated.vertexCount ||
    record.triangleCount !== recreated.triangleCount ||
    record.geometryHash !== recreated.geometryHash ||
    record.colliderSubshapeId !== recreated.colliderSubshapeId ||
    sha256CanonicalJson(record.traversalBinding) !==
      sha256CanonicalJson(recreated.traversalBinding)
  ) return invalidContribution();
  return recreated;
}

export function parseBabylonNativeProfileSettlementReceiptV1(
  input: unknown,
): BabylonNativeProfileSettlementReceiptV1 {
  const snapshot = snapshotCanonicalData(input);
  const source = snapshot as Record<string, unknown>;
  if (source?.kind === "none") {
    const record = exactRecord(snapshot, ["kind", "profileRef"]);
    if (record.profileRef !== STANDARD_NATIVE_SCENE_PROFILE_REF) {
      return invalidContribution();
    }
    return Object.freeze({
      kind: "none",
      profileRef: STANDARD_NATIVE_SCENE_PROFILE_REF,
    });
  }
  if (source?.kind === "host-snapshot") {
    const record = exactRecord(snapshot, [
      "kind",
      "profileRef",
      "targetCount",
      "profileInventoryHash",
      "settledVisualHash",
    ]);
    if (
      record.profileRef !== BABYLON_NATIVE_BLOCK_PROFILE_REF_V1 ||
      typeof record.targetCount !== "number" ||
      !Number.isSafeInteger(record.targetCount) ||
      record.targetCount < 0 ||
      typeof record.profileInventoryHash !== "string" ||
      !SHA256_PATTERN.test(record.profileInventoryHash) ||
      typeof record.settledVisualHash !== "string" ||
      !SHA256_PATTERN.test(record.settledVisualHash)
    ) return invalidContribution();
    return Object.freeze({
      kind: "host-snapshot",
      profileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
      targetCount: record.targetCount,
      profileInventoryHash: record.profileInventoryHash as `sha256:${string}`,
      settledVisualHash: record.settledVisualHash as `sha256:${string}`,
    });
  }
  return invalidContribution();
}

export function parseBabylonNativeSceneContributionV1(
  input: unknown,
): BabylonNativeSceneContributionV1 {
  const record = exactRecord(snapshotCanonicalData(input), CONTRIBUTION_FIELDS);
  if (
    record.kind !== "babylon-native-scene-contribution" ||
    record.schemaVersion !== 1 ||
    !Array.isArray(record.staticColliders)
  ) return invalidContribution();
  const sceneModuleRef = identity(record.sceneModuleRef);
  if (!NATIVE_SCENE_REF_PATTERN.test(sceneModuleRef)) return invalidContribution();
  const staticColliders = Object.freeze(
    record.staticColliders.map((collider) => parsedCollider(collider)),
  );
  const spawnMarker = parsedSpawnMarker(record.spawnMarker);
  const colliderIds = staticColliders.map(({ id }) => id);
  if (
    new Set(colliderIds).size !== colliderIds.length ||
    colliderIds.includes(spawnMarker.id) ||
    colliderIds.some((id, index) => index > 0 && id < colliderIds[index - 1]!)
  ) return invalidContribution();
  return Object.freeze({
    kind: "babylon-native-scene-contribution",
    schemaVersion: 1,
    sceneModuleRef,
    sceneModuleId: identity(record.sceneModuleId),
    profileSettlement: parseBabylonNativeProfileSettlementReceiptV1(
      record.profileSettlement,
    ),
    spawnMarker,
    staticColliders,
  });
}

export function hashBabylonNativeSceneContributionV1(
  input: unknown,
): `sha256:${string}` {
  return sha256Bytes(
    canonicalBabylonNativeSceneContributionBytesV1(input),
  ) as `sha256:${string}`;
}

export function canonicalBabylonNativeSceneContributionBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseBabylonNativeSceneContributionV1(input));
}
