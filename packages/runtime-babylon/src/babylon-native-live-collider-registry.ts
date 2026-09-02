import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { PhysicsAggregate } from
  "@babylonjs/core/Physics/v2/physicsAggregate.js";
import type { PhysicsBody } from
  "@babylonjs/core/Physics/v2/physicsBody.js";
import type { PhysicsShape } from
  "@babylonjs/core/Physics/v2/physicsShape.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type {
  BabylonNativeStaticColliderRuntimeRoleV1,
} from "@whitebox-world/runtime-contracts";
import { isEmpty } from "lodash-es";

export interface BabylonNativeColliderChunkPartInventoryV1 {
  readonly colliderId: string;
  readonly chunkPartId: string;
  readonly chunkResidencyGroupId: string;
  readonly runtimeRole: BabylonNativeStaticColliderRuntimeRoleV1;
  readonly colliderSubshapeId: string;
  readonly sourceBlockIds: readonly string[];
  readonly overlayRecordId: string;
  readonly worldPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
  readonly partHash: `sha256:${string}`;
}

export interface BabylonNativeLiveColliderHandleV1 {
  /** Stable logical Collider identity, preserved across every Chunk part. */
  readonly colliderId: string;
  /** Host-derived realization identity of one deterministic Chunk part. */
  readonly chunkPartId: string;
  readonly chunkResidencyGroupId: string;
  readonly runtimeRole: BabylonNativeStaticColliderRuntimeRoleV1;
  readonly colliderSubshapeId: string;
  readonly sourceBlockIds: readonly string[];
  readonly physicsBodyId: string;
  readonly overlayRecordId: string;
  readonly mesh: Mesh;
  readonly aggregate: PhysicsAggregate;
  readonly body: PhysicsBody;
  readonly shape: PhysicsShape;
}

export interface BabylonNativeLiveColliderResidencyEvidenceV1 {
  readonly chunkPolicyHash: `sha256:${string}`;
  readonly partitionHash: `sha256:${string}`;
  readonly logicalColliderCount: number;
  readonly partCount: number;
  readonly activePartCount: number;
  readonly peakActivePartCount: number;
}

export interface BabylonNativeLiveColliderRegistryV1 {
  readonly kind: "babylon-native-live-collider-registry";
  readonly schemaVersion: 1;
  readonly residency: BabylonNativeLiveColliderResidencyEvidenceV1;
  /** Frozen all-Chunk inventory; it is geometry evidence, not live Havok state. */
  readonly parts: readonly BabylonNativeColliderChunkPartInventoryV1[];
  /** Currently resident Chunk parts, one row per live Havok body. */
  readonly colliders: readonly BabylonNativeLiveColliderHandleV1[];
}

const REGISTRY_BY_SCENE = new WeakMap<
  Scene,
  BabylonNativeLiveColliderRegistryV1[]
>();

const SHA256 = /^sha256:[0-9a-f]{64}$/;

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertLiveHandle(
  handle: BabylonNativeLiveColliderHandleV1,
): void {
  if (
    handle.mesh.isDisposed() ||
    handle.body.isDisposed ||
    handle.body.transformNode !== handle.mesh ||
    handle.body.shape !== handle.shape ||
    handle.aggregate.transformNode !== handle.mesh ||
    handle.aggregate.body !== handle.body ||
    handle.aggregate.shape !== handle.shape
  ) {
    throw new TypeError("WORLDKIT_NATIVE_LIVE_COLLIDER_HANDLE_INVALID");
  }
}

function hasCanonicalSourceBlockIds(
  sourceBlockIds: readonly string[],
  runtimeRole: BabylonNativeStaticColliderRuntimeRoleV1,
): boolean {
  if (
    (runtimeRole === "scene-static-collider" && isEmpty(sourceBlockIds)) ||
    (runtimeRole === "ground-safety-boundary" && !isEmpty(sourceBlockIds))
  ) return false;
  return sourceBlockIds.every((sourceBlockId, index) =>
    sourceBlockId.length > 0 &&
    (index === 0 || stableCompare(sourceBlockIds[index - 1]!, sourceBlockId) < 0)
  );
}

export function createBabylonNativeLiveColliderRegistryV1(
  input: Readonly<{
    handles: readonly BabylonNativeLiveColliderHandleV1[];
    residency: BabylonNativeLiveColliderResidencyEvidenceV1;
    parts: readonly BabylonNativeColliderChunkPartInventoryV1[];
  }>,
): BabylonNativeLiveColliderRegistryV1 {
  const colliders = [...input.handles]
    .sort((left, right) => stableCompare(left.chunkPartId, right.chunkPartId))
    .map((handle) => {
      assertLiveHandle(handle);
      if (!hasCanonicalSourceBlockIds(
        handle.sourceBlockIds,
        handle.runtimeRole,
      )) {
        throw new TypeError(
          "WORLDKIT_NATIVE_LIVE_COLLIDER_REGISTRY_INVALID: sourceBlockIds must be sorted and unique",
        );
      }
      return Object.freeze({
        ...handle,
        sourceBlockIds: Object.freeze([...handle.sourceBlockIds]),
      });
    });
  for (const key of [
    "chunkPartId",
    "physicsBodyId",
    "overlayRecordId",
  ] as const) {
    if (new Set(colliders.map((entry) => entry[key])).size !== colliders.length) {
      throw new TypeError(
        `WORLDKIT_NATIVE_LIVE_COLLIDER_REGISTRY_INVALID: duplicate ${key}`,
      );
    }
  }
  const parts = [...input.parts]
    .sort((left, right) => stableCompare(left.chunkPartId, right.chunkPartId))
    .map((part) => Object.freeze({
      ...part,
      sourceBlockIds: Object.freeze([...part.sourceBlockIds]),
      worldPositionsMetersXYZ: Object.freeze([
        ...part.worldPositionsMetersXYZ,
      ]),
      triangleIndices: Object.freeze([...part.triangleIndices]),
    }));
  if (
    parts.length !== input.residency.partCount ||
    new Set(parts.map(({ chunkPartId }) => chunkPartId)).size !== parts.length ||
    new Set(parts.map(({ overlayRecordId }) => overlayRecordId)).size !==
      parts.length ||
    parts.some((part) =>
      !SHA256.test(part.partHash) ||
      !hasCanonicalSourceBlockIds(part.sourceBlockIds, part.runtimeRole) ||
      part.worldPositionsMetersXYZ.length < 9 ||
      part.worldPositionsMetersXYZ.length % 3 !== 0 ||
      part.triangleIndices.length === 0 ||
      part.triangleIndices.length % 3 !== 0 ||
      part.worldPositionsMetersXYZ.some((value) => !Number.isFinite(value)) ||
      part.triangleIndices.some((index) => !Number.isSafeInteger(index) ||
        index < 0 || index >= part.worldPositionsMetersXYZ.length / 3)
    )
  ) {
    throw new TypeError(
      "WORLDKIT_NATIVE_LIVE_COLLIDER_REGISTRY_INVALID: Part inventory does not describe the frozen partition",
    );
  }
  const partById = new Map(parts.map((part) =>
    [part.chunkPartId, part] as const));
  if (colliders.some((handle) => {
    const part = partById.get(handle.chunkPartId);
    return part === undefined ||
      part.colliderId !== handle.colliderId ||
      part.chunkResidencyGroupId !== handle.chunkResidencyGroupId ||
      part.runtimeRole !== handle.runtimeRole ||
      part.colliderSubshapeId !== handle.colliderSubshapeId ||
      part.sourceBlockIds.length !== handle.sourceBlockIds.length ||
      part.sourceBlockIds.some((sourceBlockId, index) =>
        sourceBlockId !== handle.sourceBlockIds[index]) ||
      part.overlayRecordId !== handle.overlayRecordId;
  })) {
    throw new TypeError(
      "WORLDKIT_NATIVE_LIVE_COLLIDER_REGISTRY_INVALID: Live handle does not match its frozen Chunk Part",
    );
  }
  const residentLogicalColliderCount =
    new Set(colliders.map(({ colliderId }) => colliderId)).size;
  if (
    !SHA256.test(input.residency.chunkPolicyHash) ||
    !SHA256.test(input.residency.partitionHash) ||
    input.residency.activePartCount !== colliders.length ||
    input.residency.activePartCount > input.residency.partCount ||
    input.residency.peakActivePartCount < input.residency.activePartCount ||
    input.residency.logicalColliderCount < residentLogicalColliderCount ||
    input.residency.partCount < input.residency.logicalColliderCount ||
    new Set(parts.map(({ colliderId }) => colliderId)).size !==
      input.residency.logicalColliderCount
  ) {
    throw new TypeError(
      "WORLDKIT_NATIVE_LIVE_COLLIDER_REGISTRY_INVALID: residency evidence does not describe the live rows",
    );
  }
  return Object.freeze({
    kind: "babylon-native-live-collider-registry" as const,
    schemaVersion: 1 as const,
    residency: Object.freeze({ ...input.residency }),
    parts: Object.freeze(parts),
    colliders: Object.freeze(colliders),
  });
}

export function replaceBabylonNativeLiveColliderRegistryV1(
  scene: Scene,
  expected: BabylonNativeLiveColliderRegistryV1,
  replacement: BabylonNativeLiveColliderRegistryV1,
): void {
  const registries = REGISTRY_BY_SCENE.get(scene);
  const expectedIndex = registries?.indexOf(expected) ?? -1;
  if (
    registries === undefined ||
    expectedIndex < 0 ||
    registries.lastIndexOf(expected) !== expectedIndex ||
    registries.includes(replacement)
  ) {
    throw new TypeError(
      "WORLDKIT_NATIVE_LIVE_COLLIDER_REGISTRY_REPLACEMENT_INVALID",
    );
  }
  registries[expectedIndex] = replacement;
}

export function registerBabylonNativeLiveColliderRegistryV1(
  scene: Scene,
  registry: BabylonNativeLiveColliderRegistryV1,
): void {
  const registries = REGISTRY_BY_SCENE.get(scene) ?? [];
  registries.push(registry);
  REGISTRY_BY_SCENE.set(scene, registries);
}

export function peekBabylonNativeLiveColliderRegistryV1(
  scene: Scene,
): BabylonNativeLiveColliderRegistryV1 | undefined {
  const registries = REGISTRY_BY_SCENE.get(scene) ?? [];
  if (registries.length > 1) {
    throw new TypeError(
      "WORLDKIT_NATIVE_LIVE_COLLIDER_REGISTRY_AMBIGUOUS",
    );
  }
  const registry = registries[0];
  registry?.colliders.forEach(assertLiveHandle);
  return registry;
}

export function unregisterBabylonNativeLiveColliderRegistryV1(
  scene: Scene,
  registry: BabylonNativeLiveColliderRegistryV1,
): void {
  const registries = REGISTRY_BY_SCENE.get(scene);
  if (registries === undefined) return;
  const index = registries.indexOf(registry);
  if (index !== -1) registries.splice(index, 1);
  if (registries.length === 0) REGISTRY_BY_SCENE.delete(scene);
}
