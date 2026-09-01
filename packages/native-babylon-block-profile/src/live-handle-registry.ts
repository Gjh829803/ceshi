import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface BabylonNativeBlockLiveHandleRegistryV1 {
  readonly kind: "babylon-native-block-live-handle-registry";
  readonly schemaVersion: 1;
  readonly blocks: readonly Readonly<{
    runtimeEntityId: string;
    semanticCaptureClassId: string;
    mesh: Mesh;
  }>[];
  readonly visualGroups: readonly Readonly<{
    visualGroupId: string;
    meshes: readonly Mesh[];
  }>[];
}

const REGISTRY_BY_SCENE = new WeakMap<
  Scene,
  BabylonNativeBlockLiveHandleRegistryV1[]
>();

export function registerBabylonNativeBlockLiveHandleRegistryV1(
  scene: Scene,
  registry: BabylonNativeBlockLiveHandleRegistryV1,
): void {
  const registries = REGISTRY_BY_SCENE.get(scene) ?? [];
  registries.push(registry);
  REGISTRY_BY_SCENE.set(scene, registries);
}

export function peekBabylonNativeBlockLiveHandleRegistryV1(
  scene: Scene,
): BabylonNativeBlockLiveHandleRegistryV1 | undefined {
  const registries = REGISTRY_BY_SCENE.get(scene) ?? [];
  if (registries.length > 1) {
    throw new TypeError(
      "WORLDKIT_NATIVE_BLOCK_LIVE_HANDLE_REGISTRY_AMBIGUOUS",
    );
  }
  return registries[0];
}

export function unregisterBabylonNativeBlockLiveHandleRegistryV1(
  scene: Scene,
  registry: BabylonNativeBlockLiveHandleRegistryV1,
): void {
  const registries = REGISTRY_BY_SCENE.get(scene);
  if (registries === undefined) return;
  const index = registries.indexOf(registry);
  if (index !== -1) registries.splice(index, 1);
  if (registries.length === 0) {
    REGISTRY_BY_SCENE.delete(scene);
  }
}
