import type { Matrix } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Sha256HashV1 } from "@whitebox-world/protocol";

import type { BabylonNativeBlockPaletteRoleV1 } from "./profile.js";
import type { BabylonNativeBlockShapeKindV1 } from "./shapes.js";

export interface BabylonNativeBlockWalkableOverlayHandleV1 {
  readonly logicalColliderId: string;
  readonly sourceBlockIds: readonly [string, ...string[]];
  readonly visualGroupIds: readonly string[];
  readonly topologyHash: `sha256:${string}`;
  readonly mesh: Mesh;
}

/**
 * One closed row per logical Block. A Block is realized either as its own Mesh
 * or as a member of one visual-cluster Thin Instance; both branches
 * keep the logical Block ID, runtime Entity ID and semantic Capture class, so
 * Capture selection, tinting, hiding and diagnostics never lose identity.
 */
export type BabylonNativeBlockLiveVisualHandleV1 =
  | Readonly<{
      kind: "independent-mesh";
      blockId: string;
      runtimeEntityId: string;
      semanticCaptureClassId: string;
      mesh: Mesh;
    }>
  | Readonly<{
      kind: "thin-instance";
      blockId: string;
      runtimeEntityId: string;
      semanticCaptureClassId: string;
      batchId: string;
      batchMesh: Mesh;
      instanceIndex: number;
      /** Exact displayed portion of the cluster owned by this logical Block. */
      sourceWorldMatrix: Matrix;
    }>;

export interface BabylonNativeBlockLiveVisualBatchV1 {
  readonly batchId: string;
  readonly visualChunkIndexXZ: readonly [number, number];
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly semanticCaptureClassId: string;
  /** Complete logical inventory, independent of instance count. */
  readonly blockIds: readonly string[];
  /** Ordered by normal Thin Instance index; each row is a merged cuboid. */
  readonly instances: readonly Readonly<{ sourceBlockIds: readonly string[] }>[];
  readonly mesh: Mesh;
}

export interface BabylonNativeBlockLiveVisualGroupHandleV1 {
  readonly visualGroupId: string;
  readonly blockHandles: readonly BabylonNativeBlockLiveVisualHandleV1[];
}

/**
 * Authoring materialization publishes one Mesh per Block. The trusted Host
 * Chunk realization replaces that registry after Candidate admission, so the
 * discriminator names which realization the live rows describe.
 */
export type BabylonNativeBlockLiveVisualRealizationV1 =
  | Readonly<{ kind: "authoring-unbatched" }>
  | Readonly<{
      kind: "host-chunk-batched";
      chunkPolicyHash: Sha256HashV1;
      batchPlanHash: Sha256HashV1;
    }>;

export interface BabylonNativeBlockLiveHandleRegistryV1 {
  readonly kind: "babylon-native-block-live-handle-registry";
  readonly schemaVersion: 1;
  readonly realization: BabylonNativeBlockLiveVisualRealizationV1;
  readonly blocks: readonly BabylonNativeBlockLiveVisualHandleV1[];
  readonly visualBatches: readonly BabylonNativeBlockLiveVisualBatchV1[];
  readonly visualGroups: readonly BabylonNativeBlockLiveVisualGroupHandleV1[];
  readonly walkableOverlays:
    readonly BabylonNativeBlockWalkableOverlayHandleV1[];
}

export function babylonNativeBlockLiveVisualHandleMeshV1(
  handle: BabylonNativeBlockLiveVisualHandleV1,
): Mesh {
  return handle.kind === "independent-mesh" ? handle.mesh : handle.batchMesh;
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

export function replaceBabylonNativeBlockLiveHandleRegistryV1(
  scene: Scene,
  expected: BabylonNativeBlockLiveHandleRegistryV1,
  replacement: BabylonNativeBlockLiveHandleRegistryV1,
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
      "WORLDKIT_NATIVE_BLOCK_LIVE_HANDLE_REGISTRY_REPLACEMENT_INVALID",
    );
  }
  registries[expectedIndex] = replacement;
}
