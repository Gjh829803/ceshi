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
  readonly colliderId: string;
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

export interface BabylonNativeLiveColliderRegistryV1 {
  readonly kind: "babylon-native-live-collider-registry";
  readonly schemaVersion: 1;
  readonly colliders: readonly BabylonNativeLiveColliderHandleV1[];
}

const REGISTRY_BY_SCENE = new WeakMap<
  Scene,
  BabylonNativeLiveColliderRegistryV1[]
>();

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
): BabylonNativeLiveColliderRegistryV1 {
  const colliders = [...handles]
    .sort((left, right) => stableCompare(left.colliderId, right.colliderId))
    .map((handle) => {
      assertLiveHandle(handle);
      return Object.freeze({ ...handle });
    });
  for (const key of [
    "colliderId",
    "colliderSubshapeId",
    "physicsBodyId",
    "overlayRecordId",
  ] as const) {
    if (new Set(colliders.map((entry) => entry[key])).size !== colliders.length) {
      throw new TypeError(
        `WORLDKIT_NATIVE_LIVE_COLLIDER_REGISTRY_INVALID: duplicate ${key}`,
      );
    }
  }
  return Object.freeze({
    kind: "babylon-native-live-collider-registry" as const,
    schemaVersion: 1 as const,
    colliders: Object.freeze(colliders),
  });
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
