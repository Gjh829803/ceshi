import type { BabylonNativeSceneBuildContextV1 } from
  "@whitebox-world/native-babylon";
import {
  commitBabylonNativeProfileSettlementV1,
} from "@whitebox-world/native-babylon/host";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import type {
  BabylonNativeBlockColliderCandidateInventoryEntryV1,
} from "./collider-contribution.js";
import {
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
} from "./profile.js";
import type { BabylonNativeBlockCheckedLayoutV1 } from "./session.js";

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: string, message: string): never {
  throw new TypeError(`${code}: ${message}`);
}

export function settleBabylonNativeBlockProfileV1(input: Readonly<{
  context: BabylonNativeSceneBuildContextV1;
  checkedLayout: BabylonNativeBlockCheckedLayoutV1;
  displayGapMeters: number;
  colliderInventory:
    readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[];
}>): `sha256:${string}` {
  const recordsById = new Map(input.checkedLayout.records.map((record) =>
    [record.input.id, record] as const));
  const collisionBindingByBlockId = new Map<string, Readonly<{
    kind: "static-collider";
    colliderId: string;
  }>>();
  const colliderJoins = [...input.colliderInventory]
    .sort((left, right) =>
      stableCompare(left.sourceBlockIds[0], right.sourceBlockIds[0]) ||
      stableCompare(left.colliderId, right.colliderId))
    .map((collider) => {
      const [blockId] = collider.sourceBlockIds;
      if (
        collisionBindingByBlockId.has(blockId) ||
        !recordsById.has(blockId)
      ) {
        return fail(
          "WORLDKIT_NATIVE_BLOCK_COLLIDER_INVENTORY_MISMATCH",
          "Collider inventory must join at most one Collider to a checked block.",
        );
      }
      collisionBindingByBlockId.set(blockId, Object.freeze({
        kind: "static-collider",
        colliderId: collider.colliderId,
      }));
      return Object.freeze({ blockId, colliderId: collider.colliderId });
    });
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
  const profileInventoryHash = sha256CanonicalJson({
    kind: "babylon-native-block-profile-inventory",
    schemaVersion: 1,
    profileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
    displayGapMeters: Object.is(input.displayGapMeters, -0)
      ? 0
      : input.displayGapMeters,
    blocks: blocks.map((block) => ({
      id: block.id,
      runtimeEntityId: `native-block:${block.id}`,
      semanticCaptureClassId:
        `worldkit.native-block.group.${block.visualGroupId ?? "ungrouped"}`,
      shape: block.shape,
      paletteRole: block.paletteRole,
      ...(isNil(block.visualGroupId)
        ? {}
        : { visualGroupId: block.visualGroupId }),
      centerMetersXYZ: block.centerMetersXYZ,
      rotationQuarterTurnsY: block.rotationQuarterTurnsY,
      sizeMetersXYZ: block.sizeMetersXYZ,
    })),
    colliderJoins,
  }) as `sha256:${string}`;
  commitBabylonNativeProfileSettlementV1(input.context, Object.freeze({
    kind: "babylon-native-profile-settlement-batch",
    schemaVersion: 1,
    profileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
    profileInventoryHash,
    targets: Object.freeze(blocks.map((block) => {
      const record = recordsById.get(block.id)!;
      const collisionBinding = collisionBindingByBlockId.get(block.id);
      return Object.freeze({
        elementId: block.id,
        mesh: record.mesh,
        collisionBinding: isNil(collisionBinding)
          ? Object.freeze({ kind: "none" as const })
          : collisionBinding,
      });
    })),
  }));
  collisionBindingByBlockId.clear();
  recordsById.clear();
  return profileInventoryHash;
}
