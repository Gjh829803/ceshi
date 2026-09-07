import type { BabylonNativeBlockVisualNodeV1 } from "./babylon-visual-adapter.js";
import type { BabylonNativeSceneBuildContextV1 } from
  "@whitebox-world/native-babylon";
import {
  commitBabylonNativeProfileSettlementV1,
} from "@whitebox-world/native-babylon/host";
import { groupBy, isNil } from "lodash-es";

import {
  failBabylonNativeBlockProfileBuildV1 as fail,
} from "./build-failure.js";
import type {
  BabylonNativeBlockColliderCandidateInventoryEntryV1,
} from "./collider-contribution.js";
import {
  createBabylonNativeBlockProfileInventoryIdentityFromMaterializedV1,
} from "./profile-inventory.js";
import { BABYLON_NATIVE_BLOCK_PROFILE_REF_V1 } from "./profile.js";
import type { BabylonNativeBlockCheckedLayoutV1 } from "./session.js";
import type {
  BabylonNativeBlockWalkableOverlayHandleV1,
} from "./live-handle-registry.js";

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function overlayElementId(overlay: BabylonNativeBlockWalkableOverlayHandleV1): string {
  const group = overlay.visualGroupIds[0];
  return `walkable-overlay:${overlay.logicalColliderId}:${group === undefined ? "ungrouped" : `group:${group}`}`;
}

export function settleBabylonNativeBlockProfileV1(input: Readonly<{
  context: BabylonNativeSceneBuildContextV1;
  checkedLayout: BabylonNativeBlockCheckedLayoutV1;
  visualNodes: readonly BabylonNativeBlockVisualNodeV1[];
  colliderInventory:
    readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[];
  walkableOverlays: readonly BabylonNativeBlockWalkableOverlayHandleV1[];
  expectedProfileInventoryHash: `sha256:${string}`;
}>): `sha256:${string}` {
  const recordsById = new Map(input.checkedLayout.records.map((record) =>
    [record.input.id, record] as const));
  const collisionBindingByElementId = new Map<string, Readonly<{
    kind: "static-collider";
    colliderId: string;
  }>>();
  const overlaysByColliderId = new Map(Object.entries(groupBy(input.walkableOverlays, "logicalColliderId")));
  if (new Set(input.walkableOverlays.map(overlayElementId)).size !== input.walkableOverlays.length ||
    new Set(input.walkableOverlays.map(({ mesh }) => mesh)).size !== input.walkableOverlays.length) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_COLLIDER_INVENTORY_MISMATCH",
      "Walkable overlays must contain unique identity partitions and Mesh handles.",
    );
  }
  const joinedBlockIds = new Set<string>();
  const joinedColliderIds = new Set<string>();
  [...input.colliderInventory]
    .sort((left, right) =>
      stableCompare(left.colliderId, right.colliderId))
    .forEach((collider) => {
      const sourceBlockIds = [...collider.sourceBlockIds].sort(stableCompare);
      const visualGroupIds = [...collider.visualGroupIds].sort(stableCompare);
      if (
        joinedColliderIds.has(collider.colliderId) ||
        new Set(sourceBlockIds).size !== sourceBlockIds.length ||
        sourceBlockIds.some((blockId) =>
          joinedBlockIds.has(blockId) || !recordsById.has(blockId))
      ) {
        return fail(
          "WORLDKIT_NATIVE_BLOCK_COLLIDER_INVENTORY_MISMATCH",
          "Collider inventory must join each checked Block and logical Collider at most once.",
        );
      }
      joinedColliderIds.add(collider.colliderId);
      sourceBlockIds.forEach((blockId) => joinedBlockIds.add(blockId));
      const overlays = [...(overlaysByColliderId.get(collider.colliderId) ?? [])]
        .sort((left, right) => stableCompare(overlayElementId(left), overlayElementId(right)));
      if (collider.proxyKind === "continuous-walkable-surface") {
        const partitionSourceBlockIds = new Set<string>();
        if (
          overlays.length === 0 ||
          overlays.reduce((sum, { mesh }) => sum + mesh.getTotalIndices() / 3, 0) !== collider.triangleCount ||
          overlays.some((overlay) => {
            const groupId = overlay.visualGroupIds[0];
            return overlay.mesh.isDisposed() ||
              overlay.mesh.getScene() !== input.context.scene ||
              overlay.mesh.isVisible !== true ||
              overlay.topologyHash !== collider.topologyHash ||
              overlay.sourceBlockIds.length === 0 || overlay.visualGroupIds.length > 1 ||
              (groupId !== undefined && !visualGroupIds.includes(groupId)) ||
              overlay.sourceBlockIds.some((blockId) => {
                if (!sourceBlockIds.includes(blockId) || partitionSourceBlockIds.has(blockId) ||
                  recordsById.get(blockId)?.input.visualGroupId !== groupId) return true;
                partitionSourceBlockIds.add(blockId);
                return false;
              });
          })
        ) {
          return fail(
            "WORLDKIT_NATIVE_BLOCK_COLLIDER_INVENTORY_MISMATCH",
            `Walkable overlay '${collider.colliderId}' must match its topology Collider identity.`,
          );
        }
      } else if (overlays.length > 0) {
        return fail(
          "WORLDKIT_NATIVE_BLOCK_COLLIDER_INVENTORY_MISMATCH",
          `Collider '${collider.colliderId}' cannot own a walkable overlay.`,
        );
      }
      const bindingElementId = collider.proxyKind ===
          "continuous-walkable-surface"
        ? overlayElementId(overlays[0]!)
        : sourceBlockIds[0]!;
      if (collisionBindingByElementId.has(bindingElementId)) {
        return fail(
          "WORLDKIT_NATIVE_BLOCK_COLLIDER_INVENTORY_MISMATCH",
          "Each settled visual target may join at most one logical Collider.",
        );
      }
      collisionBindingByElementId.set(bindingElementId, Object.freeze({
        kind: "static-collider",
        colliderId: collider.colliderId,
      }));
    });
  if ([...overlaysByColliderId.keys()].some((colliderId) =>
    !joinedColliderIds.has(colliderId))) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_COLLIDER_INVENTORY_MISMATCH",
      "Every walkable overlay must join one Collider in the frozen inventory.",
    );
  }
  const blocks = [...input.checkedLayout.layout.blocks]
    .sort((left, right) => stableCompare(left.id, right.id));
  if (
    recordsById.size !== input.checkedLayout.records.length ||
    blocks.length !== recordsById.size ||
    blocks.some((block) => !recordsById.has(block.id))
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_PROFILE_INVENTORY_MISMATCH",
      "Checked Layout and Session records must contain the same unique blocks.",
    );
  }
  const profileInventoryHash =
    createBabylonNativeBlockProfileInventoryIdentityFromMaterializedV1({
      checkedLayout: input.checkedLayout,
      colliderInventory: input.colliderInventory,
    }).profileInventoryHash;
  if (profileInventoryHash !== input.expectedProfileInventoryHash) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_PROFILE_INVENTORY_MISMATCH",
      "Materialized Collider joins drifted from the frozen Profile inventory.",
    );
  }
  const visualBlockIds = input.visualNodes.flatMap(node => node.sourceBlockIds);
  if (visualBlockIds.length !== blocks.length ||
      new Set(visualBlockIds).size !== blocks.length ||
      visualBlockIds.some(id => !recordsById.has(id))) {
    return fail("WORLDKIT_NATIVE_BLOCK_PROFILE_INVENTORY_MISMATCH",
      "Cluster visual membership must cover every logical Block exactly once.");
  }
  commitBabylonNativeProfileSettlementV1(input.context, Object.freeze({
    kind: "babylon-native-profile-settlement-batch",
    schemaVersion: 1,
    profileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
    profileInventoryHash,
    targets: Object.freeze([
      ...input.visualNodes.map((node) => {
        const colliderIds = node.sourceBlockIds.flatMap(blockId => {
          const binding = collisionBindingByElementId.get(blockId);
          return isNil(binding) ? [] : [binding.colliderId];
        }).sort(stableCompare);
        return Object.freeze({
          elementId: node.id,
          mesh: node.mesh,
          collisionBinding: colliderIds.length === 0
            ? Object.freeze({ kind: "none" as const })
            : Object.freeze({ kind: "static-colliders" as const,
                colliderIds: Object.freeze(colliderIds) as readonly [string, ...string[]] }),
        });
      }),
      ...[...input.walkableOverlays]
        .sort((left, right) =>
          stableCompare(overlayElementId(left), overlayElementId(right)))
        .map((overlay) => {
          const elementId = overlayElementId(overlay);
          const collisionBinding = collisionBindingByElementId.get(elementId);
          return Object.freeze({
            elementId,
            mesh: overlay.mesh,
            collisionBinding: isNil(collisionBinding)
              ? Object.freeze({ kind: "none" as const })
              : Object.freeze({ kind: "static-colliders" as const,
                  colliderIds: Object.freeze([collisionBinding.colliderId] as [string]) }),
          });
        }),
    ]),
  }));
  collisionBindingByElementId.clear();
  overlaysByColliderId.clear();
  joinedBlockIds.clear();
  joinedColliderIds.clear();
  recordsById.clear();
  return profileInventoryHash;
}
