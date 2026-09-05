import {
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeBlockMaterializerMetadataV1,
  parseBabylonNativeSceneContributionV1,
  type BabylonNativeBlockMaterializerMetadataV1,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

import type {
  NativeBlockAuthoringLayoutBindingV1,
} from "./authoring-manifest.js";
import type {
  BabylonNativeBlockColliderCandidateInventoryEntryV1,
} from "./collider-contribution.js";
import type { BabylonNativeBlockCheckedLayoutV1 } from "./session.js";

export interface CreateBabylonNativeBlockMaterializerMetadataInputV1 {
  readonly authoringLayoutBinding: NativeBlockAuthoringLayoutBindingV1;
  readonly checkedLayout: Pick<
    BabylonNativeBlockCheckedLayoutV1,
    "kind" | "schemaVersion" | "layout" | "checkResult"
  >;
  readonly colliderInventory:
    readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[];
  readonly profileInventoryHash: `sha256:${string}`;
  readonly contribution: unknown;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message: string): never {
  throw new TypeError(
    `BABYLON_NATIVE_BLOCK_MATERIALIZER_METADATA_ASSEMBLY_INVALID: ${message}`,
  );
}

export function createBabylonNativeBlockMaterializerMetadataV1(
  input: CreateBabylonNativeBlockMaterializerMetadataInputV1,
): BabylonNativeBlockMaterializerMetadataV1 {
  const contribution = parseBabylonNativeSceneContributionV1(
    input.contribution,
  );
  if (
    contribution.profileSettlement.kind !== "host-snapshot" ||
    contribution.profileSettlement.profileInventoryHash !==
      input.profileInventoryHash
  ) fail("Profile settlement does not match the checked Block inventory");
  const contributionHash = hashBabylonNativeSceneContributionV1(contribution);
  if (input.authoringLayoutBinding.contributionHash !== contributionHash) {
    fail("Authoring binding does not match the frozen Contribution");
  }
  const groupById = new Map(input.authoringLayoutBinding.visualGroups.map(
    (group) => [group.visualGroupId, group] as const,
  ));
  const blocks = [...input.checkedLayout.layout.blocks]
    .sort((left, right) => stableCompare(left.id, right.id))
    .map((block) => {
      if (!isNil(block.visualGroupId) && !groupById.has(block.visualGroupId)) {
        return fail("Block visualGroupId is outside the frozen authoring binding");
      }
      return {
        blockId: block.id,
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
      };
    });
  const colliderJoins = [...input.colliderInventory]
    .map((entry) => ({
        colliderId: entry.colliderId,
        sourceBlockIds: [...entry.sourceBlockIds].sort(stableCompare),
        visualGroupIds: [...entry.visualGroupIds].sort(stableCompare),
        proxyKind: entry.proxyKind,
        minimumMetersXYZ: entry.minimumMetersXYZ,
        maximumMetersXYZ: entry.maximumMetersXYZ,
        vertexCount: entry.vertexCount,
        triangleCount: entry.triangleCount,
        topologyHash: entry.topologyHash,
      }))
    .sort((left, right) => stableCompare(left.colliderId, right.colliderId));
  return parseBabylonNativeBlockMaterializerMetadataV1({
    kind: "babylon-native-block-materializer-metadata",
    openingCamera: input.authoringLayoutBinding.openingCamera,
    groundExploration: input.authoringLayoutBinding.groundExploration,
    schemaVersion: 1,
    nativeSceneProfileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
    caseHash: input.authoringLayoutBinding.caseHash,
    authoringManifestHash:
      input.authoringLayoutBinding.authoringManifestHash,
    checkedLayoutInventoryHash:
      input.authoringLayoutBinding.checkedLayoutInventoryHash,
    contributionHash,
    profileInventoryHash: input.profileInventoryHash,
    settledVisualHash: contribution.profileSettlement.settledVisualHash,
    blocks,
    visualGroups: input.authoringLayoutBinding.visualGroups,
    colliderJoins,
  });
}
