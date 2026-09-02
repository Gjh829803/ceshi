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

export interface BabylonNativeLiveColliderHandleV1 {
  /** Stable logical Collider identity, preserved across every Chunk part. */
  readonly colliderId: string;
  /** Host-derived realization identity of one deterministic Chunk part. */
  readonly chunkPartId: string;
  readonly chunkResidencyGroupId: string;
  readonly runtimeRole: BabylonNativeStaticColliderRuntimeRoleV1;
  readonly colliderSubshapeId: string;
  readonly sourceBlockId?: string;
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

export function createBabylonNativeLiveColliderRegistryV1(
  handles: readonly BabylonNativeLiveColliderHandleV1[],
  residency: BabylonNativeLiveColliderResidencyEvidenceV1,
): BabylonNativeLiveColliderRegistryV1 {
  const colliders = [...handles]
    .sort((left, right) => stableCompare(left.chunkPartId, right.chunkPartId))
    .map((handle) => {
      assertLiveHandle(handle);
      return Object.freeze({ ...handle });
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
  const residentLogicalColliderCount =
    new Set(colliders.map(({ colliderId }) => colliderId)).size;
  if (
    !SHA256.test(residency.chunkPolicyHash) ||
    !SHA256.test(residency.partitionHash) ||
    residency.activePartCount !== colliders.length ||
    residency.activePartCount > residency.partCount ||
    residency.peakActivePartCount < residency.activePartCount ||
    residency.logicalColliderCount < residentLogicalColliderCount ||
    residency.partCount < residency.logicalColliderCount
  ) {
    throw new TypeError(
      "WORLDKIT_NATIVE_LIVE_COLLIDER_REGISTRY_INVALID: residency evidence does not describe the live rows",
    );
  }
  return Object.freeze({
    kind: "babylon-native-live-collider-registry" as const,
    schemaVersion: 1 as const,
    residency: Object.freeze({ ...residency }),
    colliders: Object.freeze(colliders),
  });
}

export function replaceBabylonNativeLiveColliderRegistryV1(
  scene: Scene,
  expected: BabylonNativeLiveColliderRegistryV1,
  replacement: BabylonNativeLiveColliderRegistryV1,
): void {
  const registries = REGISTRY_BY_SCENE.get(scene);
  if (
    registries === undefined ||
    registries.length !== 1 ||
    registries[0] !== expected
  ) {
    throw new TypeError(
      "WORLDKIT_NATIVE_LIVE_COLLIDER_REGISTRY_REPLACEMENT_INVALID",
    );
  }
  registries[0] = replacement;
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
