import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import { failBabylonNativeBlockProfileBuildV1 as fail } from
  "./build-failure.js";
import type {
  BabylonNativeBlockColliderCandidateInventoryEntryV1,
  BabylonNativeBlockStaticColliderSelectionV1,
} from "./collider-contribution.js";
import { BABYLON_NATIVE_BLOCK_PROFILE_REF_V1 } from "./profile.js";
import type { BabylonNativeBlockCheckedLayoutV1 } from "./session.js";

export interface BabylonNativeBlockProfileColliderJoinV1 {
  readonly colliderId: string;
  readonly sourceBlockIds: readonly [string, ...string[]];
}

export interface BabylonNativeBlockProfileInventoryIdentityV1 {
  readonly profileInventoryHash: Sha256HashV1;
  readonly colliderJoins: readonly BabylonNativeBlockProfileColliderJoinV1[];
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sourceBlockIdsForSelection(
  checkedLayout: BabylonNativeBlockCheckedLayoutV1,
  selection: BabylonNativeBlockStaticColliderSelectionV1,
): readonly [string, ...string[]] {
  const source = selection.colliderGeometrySource;
  const sourceBlockIds = checkedLayout.layout.blocks
    .filter((block) => source.kind === "block"
      ? block.id === source.blockId
      : block.colliderGroupId === source.colliderGroupId)
    .map(({ id }) => id)
    .sort(stableCompare);
  if (sourceBlockIds.length === 0) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_COLLIDER_SOURCE_MISSING",
      `Collider '${selection.id}' has no checked source Blocks.`,
    );
  }
  return Object.freeze(sourceBlockIds) as readonly [string, ...string[]];
}

function canonicalBlocks(checkedLayout: BabylonNativeBlockCheckedLayoutV1) {
  return [...checkedLayout.layout.blocks]
    .sort((left, right) => stableCompare(left.id, right.id))
    .map((block) => Object.freeze({
      id: block.id,
      runtimeEntityId: `native-block:${block.id}`,
      semanticCaptureClassId:
        `worldkit.native-block.group.${block.visualGroupId ?? "ungrouped"}`,
      shape: block.shape,
      paletteRole: block.paletteRole,
      ...(isNil(block.visualGroupId)
        ? {}
        : { visualGroupId: block.visualGroupId }),
      ...(isNil(block.colliderGroupId)
        ? {}
        : { colliderGroupId: block.colliderGroupId }),
      centerMetersXYZ: block.centerMetersXYZ,
      rotationQuarterTurnsY: block.rotationQuarterTurnsY,
      sizeMetersXYZ: block.sizeMetersXYZ,
    }));
}

function identity(
  checkedLayout: BabylonNativeBlockCheckedLayoutV1,
  displayGapMeters: number,
  colliderJoins: readonly BabylonNativeBlockProfileColliderJoinV1[],
): BabylonNativeBlockProfileInventoryIdentityV1 {
  const canonicalJoins = Object.freeze([...colliderJoins]
    .map((join) => Object.freeze({
      colliderId: join.colliderId,
      sourceBlockIds: Object.freeze([...join.sourceBlockIds].sort(stableCompare)) as
        readonly [string, ...string[]],
    }))
    .sort((left, right) => stableCompare(left.colliderId, right.colliderId)));
  const duplicateBlockIds = new Set<string>();
  const seenBlockIds = new Set<string>();
  for (const join of canonicalJoins) {
    for (const blockId of join.sourceBlockIds) {
      if (seenBlockIds.has(blockId)) duplicateBlockIds.add(blockId);
      seenBlockIds.add(blockId);
    }
  }
  if (
    new Set(canonicalJoins.map(({ colliderId }) => colliderId)).size !==
      canonicalJoins.length ||
    duplicateBlockIds.size !== 0
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_PROFILE_INVENTORY_MISMATCH",
      "Each logical Collider and source Block must join exactly once.",
    );
  }
  const body = Object.freeze({
    kind: "babylon-native-block-profile-inventory" as const,
    schemaVersion: 1 as const,
    profileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
    displayGapMeters: Object.is(displayGapMeters, -0) ? 0 : displayGapMeters,
    blocks: Object.freeze(canonicalBlocks(checkedLayout)),
    colliderJoins: canonicalJoins,
  });
  return Object.freeze({
    profileInventoryHash: sha256CanonicalJson(body) as Sha256HashV1,
    colliderJoins: canonicalJoins,
  });
}

export function createBabylonNativeBlockProfileInventoryIdentityFromSelectionsV1(
  input: Readonly<{
    checkedLayout: BabylonNativeBlockCheckedLayoutV1;
    displayGapMeters: number;
    selections: readonly BabylonNativeBlockStaticColliderSelectionV1[];
  }>,
): BabylonNativeBlockProfileInventoryIdentityV1 {
  return identity(
    input.checkedLayout,
    input.displayGapMeters,
    input.selections.map((selection) => Object.freeze({
      colliderId: selection.id,
      sourceBlockIds: sourceBlockIdsForSelection(
        input.checkedLayout,
        selection,
      ),
    })),
  );
}

export function createBabylonNativeBlockProfileInventoryIdentityFromMaterializedV1(
  input: Readonly<{
    checkedLayout: BabylonNativeBlockCheckedLayoutV1;
    displayGapMeters: number;
    colliderInventory:
      readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[];
  }>,
): BabylonNativeBlockProfileInventoryIdentityV1 {
  return identity(
    input.checkedLayout,
    input.displayGapMeters,
    input.colliderInventory.map((entry) => Object.freeze({
      colliderId: entry.colliderId,
      sourceBlockIds: entry.sourceBlockIds,
    })),
  );
}
