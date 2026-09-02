import type { BabylonNativeSceneBuildContextV1 } from
  "@whitebox-world/native-babylon";
import {
  commitBabylonNativeProfileSettlementV1,
} from "@whitebox-world/native-babylon/host";
import { isNil } from "lodash-es";

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

export function settleBabylonNativeBlockProfileV1(input: Readonly<{
  context: BabylonNativeSceneBuildContextV1;
  checkedLayout: BabylonNativeBlockCheckedLayoutV1;
  displayGapMeters: number;
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
  const overlayByColliderId = new Map(input.walkableOverlays.map((overlay) =>
    [overlay.logicalColliderId, overlay] as const));
  if (overlayByColliderId.size !== input.walkableOverlays.length) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_COLLIDER_INVENTORY_MISMATCH",
      "Walkable overlays must contain one unique entry per logical Collider.",
    );
  }
  const joinedBlockIds = new Set<string>();
  const joinedColliderIds = new Set<string>();
  const colliderJoins = [...input.colliderInventory]
    .sort((left, right) =>
      stableCompare(left.colliderId, right.colliderId))
    .map((collider) => {
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
      const overlay = overlayByColliderId.get(collider.colliderId);
      if (collider.proxyKind === "continuous-walkable-surface") {
        if (
          isNil(overlay) ||
          overlay.mesh.isDisposed() ||
          overlay.mesh.getScene() !== input.context.scene ||
          overlay.mesh.isVisible !== true ||
          overlay.topologyHash !== collider.topologyHash ||
          overlay.sourceBlockIds.length !== sourceBlockIds.length ||
          overlay.sourceBlockIds.some((blockId, index) =>
            blockId !== sourceBlockIds[index]) ||
          overlay.visualGroupIds.length !== visualGroupIds.length ||
          overlay.visualGroupIds.some((groupId, index) =>
            groupId !== visualGroupIds[index])
        ) {
          return fail(
            "WORLDKIT_NATIVE_BLOCK_COLLIDER_INVENTORY_MISMATCH",
            `Walkable overlay '${collider.colliderId}' must match its topology Collider identity.`,
          );
        }
      } else if (!isNil(overlay)) {
        return fail(
          "WORLDKIT_NATIVE_BLOCK_COLLIDER_INVENTORY_MISMATCH",
          `Collider '${collider.colliderId}' cannot own a walkable overlay.`,
        );
      }
      const bindingElementId = collider.proxyKind ===
          "continuous-walkable-surface"
        ? `walkable-overlay:${collider.colliderId}`
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
      return Object.freeze({
        colliderId: collider.colliderId,
        proxyKind: collider.proxyKind,
        sourceBlockIds: Object.freeze(sourceBlockIds),
        visualGroupIds: Object.freeze(visualGroupIds),
        topologyHash: collider.topologyHash,
        bindingElementId,
      });
    });
  if ([...overlayByColliderId.keys()].some((colliderId) =>
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
      displayGapMeters: input.displayGapMeters,
      colliderInventory: input.colliderInventory,
    }).profileInventoryHash;
  if (profileInventoryHash !== input.expectedProfileInventoryHash) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_PROFILE_INVENTORY_MISMATCH",
      "Materialized Collider joins drifted from the frozen Profile inventory.",
    );
  }
  commitBabylonNativeProfileSettlementV1(input.context, Object.freeze({
    kind: "babylon-native-profile-settlement-batch",
    schemaVersion: 1,
    profileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
    profileInventoryHash,
    targets: Object.freeze([
      ...blocks.map((block) => {
        const record = recordsById.get(block.id)!;
        const collisionBinding = collisionBindingByElementId.get(block.id);
        return Object.freeze({
          elementId: block.id,
          mesh: record.mesh,
          collisionBinding: isNil(collisionBinding)
            ? Object.freeze({ kind: "none" as const })
            : collisionBinding,
        });
      }),
      ...[...input.walkableOverlays]
        .sort((left, right) =>
          stableCompare(left.logicalColliderId, right.logicalColliderId))
        .map((overlay) => {
          const elementId = `walkable-overlay:${overlay.logicalColliderId}`;
          const collisionBinding = collisionBindingByElementId.get(elementId);
          if (isNil(collisionBinding)) {
            return fail(
              "WORLDKIT_NATIVE_BLOCK_COLLIDER_INVENTORY_MISMATCH",
              `Walkable overlay '${overlay.logicalColliderId}' has no Collider settlement binding.`,
            );
          }
          return Object.freeze({
            elementId,
            mesh: overlay.mesh,
            collisionBinding,
          });
        }),
    ]),
  }));
  collisionBindingByElementId.clear();
  overlayByColliderId.clear();
  joinedBlockIds.clear();
  joinedColliderIds.clear();
  recordsById.clear();
  return profileInventoryHash;
}
