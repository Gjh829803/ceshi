import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type {
  BabylonNativeSceneBuildContextV1,
  BabylonNativeTraversalBindingV1,
} from "@whitebox-world/native-babylon";
import { isNil } from "lodash-es";

import {
  failBabylonNativeBlockProfileBuildV1 as fail,
} from "./build-failure.js";
import type { BabylonNativeBlockCheckedLayoutV1 } from "./session.js";

export type BabylonNativeBlockColliderGeometrySourceV1 =
  | Readonly<{ kind: "block"; blockId: string }>
  | Readonly<{ kind: "block-group"; colliderGroupId: string }>;

export type BabylonNativeBlockExposedEdgePolicyV1 =
  | "none"
  | "protect-ground-subject";

export interface BabylonNativeBlockStaticColliderSelectionV1 {
  readonly id: string;
  readonly colliderGeometrySource: BabylonNativeBlockColliderGeometrySourceV1;
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly exposedEdgePolicy: BabylonNativeBlockExposedEdgePolicyV1;
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
}

interface BabylonNativeBlockColliderCandidateInventoryCommonV1 {
  readonly colliderId: string;
  readonly sourceBlockIds: readonly [string, ...string[]];
  readonly visualGroupIds: readonly string[];
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly exposedEdgePolicy: BabylonNativeBlockExposedEdgePolicyV1;
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
}

export type BabylonNativeBlockColliderCandidateInventoryEntryV1 =
  | Readonly<BabylonNativeBlockColliderCandidateInventoryCommonV1 & {
      readonly proxyKind: "layout-block-volume";
    }>
  | Readonly<BabylonNativeBlockColliderCandidateInventoryCommonV1 & {
      readonly proxyKind:
        | "continuous-walkable-surface"
        | "exact-solid-union";
      readonly minimumMetersXYZ: readonly [number, number, number];
      readonly maximumMetersXYZ: readonly [number, number, number];
      readonly vertexCount: number;
      readonly triangleCount: number;
      readonly topologyHash: `sha256:${string}`;
    }>;

export interface MaterializedBabylonNativeBlockColliderCandidatesV1 {
  readonly inventory:
    readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[];
  dispose(): void;
}

const STABLE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;

function isCanonicalStableId(value: unknown): value is string {
  return typeof value === "string" &&
    STABLE_ID.test(value) &&
    value.normalize("NFC") === value;
}

function isClosedFrozenSelection(
  selection: BabylonNativeBlockStaticColliderSelectionV1,
): boolean {
  if (
    typeof selection !== "object" ||
    isNil(selection) ||
    Array.isArray(selection)
  ) return false;
  if (
    !Object.isFrozen(selection) ||
    Reflect.getPrototypeOf(selection) !== Object.prototype
  ) return false;
  const descriptors = Object.getOwnPropertyDescriptors(selection);
  const keys = Object.keys(descriptors);
  if (
    ![
      "id",
      "colliderGeometrySource",
      "traversalBinding",
      "exposedEdgePolicy",
    ].every((key) => Object.hasOwn(descriptors, key)) ||
    keys.some((key) => ![
      "id",
      "colliderGeometrySource",
      "traversalBinding",
      "exposedEdgePolicy",
      "frictionRatio",
      "restitutionRatio",
    ].includes(key)) ||
    Object.values(descriptors).some((descriptor) =>
      !descriptor.enumerable || !("value" in descriptor))
  ) return false;
  const source = descriptors.colliderGeometrySource!.value as unknown;
  const traversalBinding = descriptors.traversalBinding!.value as unknown;
  if (
    typeof source !== "object" ||
    isNil(source) ||
    Array.isArray(source) ||
    !Object.isFrozen(source) ||
    Reflect.getPrototypeOf(source) !== Object.prototype ||
    typeof traversalBinding !== "object" ||
    isNil(traversalBinding) ||
    !Object.isFrozen(traversalBinding)
  ) return false;
  const sourceDescriptors = Object.getOwnPropertyDescriptors(source);
  if (Object.values(sourceDescriptors).some((descriptor) =>
    !descriptor.enumerable || !("value" in descriptor)
  )) return false;
  const validRatio = (key: "frictionRatio" | "restitutionRatio"): boolean => {
    if (!Object.hasOwn(descriptors, key)) return true;
    const value = descriptors[key]!.value as unknown;
    return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1 &&
      !Object.is(value, -0);
  };
  const kind = sourceDescriptors.kind?.value as unknown;
  const sourceIsClosed = kind === "block"
    ? Object.keys(source).length === 2 &&
      isCanonicalStableId(sourceDescriptors.blockId?.value)
    : kind === "block-group" && Object.keys(source).length === 2 &&
      isCanonicalStableId(sourceDescriptors.colliderGroupId?.value);
  const id = descriptors.id!.value as unknown;
  const exposedEdgePolicy = descriptors.exposedEdgePolicy!.value as unknown;
  return isCanonicalStableId(id) && sourceIsClosed &&
    (exposedEdgePolicy === "none" ||
      exposedEdgePolicy === "protect-ground-subject") &&
    validRatio("frictionRatio") &&
    validRatio("restitutionRatio");
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createExactBoxProxy(
  name: string,
  sizeMetersXYZ: readonly [number, number, number],
  scene: Scene,
): Mesh {
  const halfX = sizeMetersXYZ[0] / 2;
  const halfY = sizeMetersXYZ[1] / 2;
  const halfZ = sizeMetersXYZ[2] / 2;
  const mesh = new Mesh(name, scene);
  mesh.setVerticesData(VertexBuffer.PositionKind, [
    -halfX, -halfY, -halfZ,
    halfX, -halfY, -halfZ,
    halfX, halfY, -halfZ,
    -halfX, halfY, -halfZ,
    -halfX, -halfY, halfZ,
    halfX, -halfY, halfZ,
    halfX, halfY, halfZ,
    -halfX, halfY, halfZ,
  ]);
  // Babylon 9.23 ComputeNormals and Runtime Surface admission both use
  // (p3 - p2) x (p1 - p2), equivalent to edgeB x edgeA. Keep every face
  // outward under that installed-engine convention.
  mesh.setIndices([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 7, 4, 0, 3, 7,
    1, 6, 2, 1, 5, 6,
    0, 5, 1, 0, 4, 5,
    3, 6, 7, 3, 2, 6,
  ]);
  return mesh;
}

/**
 * Package-private Build-Epoch adapter. `selections` must already be canonical
 * frozen values from the Session-owned canonical snapshot boundary; this layer never
 * reparses traversal bindings or derives core Contribution identity.
 */
function disposeProxies(
  proxies: readonly Mesh[],
): Readonly<{ didFail: boolean; error: unknown }> {
  let didFail = false;
  let firstFailure: unknown;
  for (let index = proxies.length - 1; index >= 0; index -= 1) {
    try {
      proxies[index]!.dispose();
    } catch (error) {
      if (!didFail) {
        didFail = true;
        firstFailure = error;
      }
    }
  }
  return Object.freeze({ didFail, error: firstFailure });
}

export function materializeBabylonNativeBlockColliderCandidatesV1(
  input: Readonly<{
    context: BabylonNativeSceneBuildContextV1;
    checkedLayout: BabylonNativeBlockCheckedLayoutV1;
    selections: readonly BabylonNativeBlockStaticColliderSelectionV1[];
  }>,
): MaterializedBabylonNativeBlockColliderCandidatesV1 {
  const { checkedLayout } = input;
  const { scene } = input.context;
  if (
    !isCanonicalStableId(input.context.bootstrap.id) ||
    scene.isDisposed
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_COLLIDER_SELECTION_INVALID",
      "Collider candidates require one live Scene and stable Build Epoch ID.",
    );
  }
  if (checkedLayout.checkResult.outcome !== "passed") {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_COLLIDER_CHECK_REJECTED",
      "Collider candidates require one passed Block Profile check.",
    );
  }
  const layoutById = new Map(checkedLayout.layout.blocks.map((block) =>
    [block.id, block] as const));
  const recordsById = new Map(checkedLayout.records.map((record) =>
    [record.input.id, record] as const));
  if (checkedLayout.records.some((record) => record.mesh.getScene() !== scene)) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_SCENE_MISMATCH",
      "One checked Block belongs to another Candidate Scene.",
    );
  }
  if (
    checkedLayout.layout.issues.length !== 0 ||
    layoutById.size !== checkedLayout.layout.blocks.length ||
    recordsById.size !== checkedLayout.records.length ||
    checkedLayout.layout.blocks.length !== checkedLayout.records.length ||
    checkedLayout.records.some((record) => {
      const block = layoutById.get(record.input.id);
      return isNil(block) ||
        record.mesh.isDisposed() ||
        record.input.shape !== block.shape ||
        record.input.paletteRole !== block.paletteRole ||
        record.input.visualGroupId !== block.visualGroupId ||
        record.input.colliderGroupId !== block.colliderGroupId;
    })
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_COLLIDER_RECORD_MISMATCH",
      "Records must exactly match the live blocks in the checked Layout.",
    );
  }
  const selections = [...input.selections]
    .sort((left, right) => stableCompare(left.id, right.id));
  const colliderIds = new Set<string>();
  const blockIds = new Set<string>();
  for (const selection of selections) {
    if (!isClosedFrozenSelection(selection)) {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_COLLIDER_SELECTION_INVALID",
        "Selections must be canonical frozen values from the Session-owned snapshot boundary.",
      );
    }
    if (colliderIds.has(selection.id)) {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_COLLIDER_ID_DUPLICATE",
        `Collider id '${selection.id}' appears more than once.`,
      );
    }
    colliderIds.add(selection.id);
    if (selection.colliderGeometrySource.kind === "block-group") {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_COLLIDER_GROUP_MATERIALIZATION_UNAVAILABLE",
        `Collider Group '${selection.colliderGeometrySource.colliderGroupId}' requires the NBR-65 logical-ground materializer.`,
      );
    }
    const blockId = selection.colliderGeometrySource.blockId;
    if (blockIds.has(blockId)) {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_COLLIDER_BLOCK_DUPLICATE",
        `Block '${blockId}' has more than one Collider selection.`,
      );
    }
    blockIds.add(blockId);
    if (
      !layoutById.has(blockId) ||
      !recordsById.has(blockId)
    ) {
      return fail(
        "WORLDKIT_NATIVE_BLOCK_COLLIDER_BLOCK_MISSING",
        `Block '${blockId}' is absent from this checked Build Epoch.`,
      );
    }
  }
  const proxies: Mesh[] = [];
  const inventory: BabylonNativeBlockColliderCandidateInventoryEntryV1[] = [];
  try {
    for (const selection of selections) {
      if (selection.colliderGeometrySource.kind !== "block") {
        return fail(
          "WORLDKIT_NATIVE_BLOCK_COLLIDER_GROUP_MATERIALIZATION_UNAVAILABLE",
          "Collider Group materialization is unavailable in this checkpoint.",
        );
      }
      const blockId = selection.colliderGeometrySource.blockId;
      const block = layoutById.get(blockId)!;
      const record = recordsById.get(blockId)!;
      const proxy = createExactBoxProxy(
        `worldkit-block-collider-${input.context.bootstrap.id}-${selection.id}`,
        block.sizeMetersXYZ,
        scene,
      );
      proxies.push(proxy);
      proxy.position.set(
        block.centerMetersXYZ[0],
        block.centerMetersXYZ[1],
        block.centerMetersXYZ[2],
      );
      proxy.isVisible = false;
      proxy.isPickable = false;
      proxy.computeWorldMatrix(true);
      input.context.registration.registerStaticCollider(Object.freeze({
        id: selection.id,
        mesh: proxy,
        traversalBinding: selection.traversalBinding,
        ...(!Object.hasOwn(selection, "frictionRatio")
          ? {}
          : { frictionRatio: selection.frictionRatio }),
        ...(!Object.hasOwn(selection, "restitutionRatio")
          ? {}
          : { restitutionRatio: selection.restitutionRatio }),
      }));
      inventory.push(Object.freeze({
        colliderId: selection.id,
        sourceBlockIds: Object.freeze([blockId] as [string]),
        visualGroupIds: Object.freeze(
          isNil(record.input.visualGroupId)
            ? []
            : [record.input.visualGroupId],
        ),
        proxyKind: "layout-block-volume" as const,
        traversalBinding: selection.traversalBinding,
        exposedEdgePolicy: selection.exposedEdgePolicy,
        ...(!Object.hasOwn(selection, "frictionRatio")
          ? {}
          : { frictionRatio: selection.frictionRatio }),
        ...(!Object.hasOwn(selection, "restitutionRatio")
          ? {}
          : { restitutionRatio: selection.restitutionRatio }),
      }));
    }
  } catch (error) {
    disposeProxies(proxies);
    throw error;
  }
  layoutById.clear();
  recordsById.clear();
  let isDisposed = false;
  return Object.freeze({
    inventory: Object.freeze(inventory),
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      const cleanup = disposeProxies(proxies);
      if (cleanup.didFail) throw cleanup.error;
    },
  });
}
