import { describe, expect, it } from "vitest";

import {
  hashBabylonNativeBlockMaterializerMetadataV1,
  parseBabylonNativeBlockMaterializerMetadataV1,
} from "./native-block-materializer-metadata.js";

const H = (digit: string) => `sha256:${digit.repeat(64)}` as const;

function metadataValue() {
  return {
    kind: "babylon-native-block-materializer-metadata",
    schemaVersion: 1,
    nativeSceneProfileRef:
      "worldkit://native-scene-profile/whitebox.blocks@1",
    caseHash: H("a"),
    authoringManifestHash: H("b"),
    checkedLayoutInventoryHash: H("c"),
    contributionHash: H("d"),
    profileInventoryHash: H("1"),
    settledVisualHash: H("2"),
    blocks: [
      {
        blockId: "bridge",
        runtimeEntityId: "native-block:bridge",
        semanticCaptureClassId: "worldkit.native-block.group.route-group",
        shape: "full",
        paletteRole: "route",
        visualGroupId: "route-group",
        centerMetersXYZ: [0, 0, 0],
        rotationQuarterTurnsY: 0,
        sizeMetersXYZ: [2, 1, 2],
      },
      {
        blockId: "wall",
        runtimeEntityId: "native-block:wall",
        semanticCaptureClassId: "worldkit.native-block.group.wall-group",
        shape: "half",
        paletteRole: "structure",
        visualGroupId: "wall-group",
        centerMetersXYZ: [2, 0.5, 0],
        rotationQuarterTurnsY: 1,
        sizeMetersXYZ: [1, 2, 2],
      },
    ],
    visualGroups: [
      {
        visualGroupId: "route-group",
        acceptanceTargetRef: "worldkit://acceptance-target/route@1",
        semanticClassId: "route.primary",
        identityColorHex: "#AA0001",
        blockIds: ["bridge"],
        paletteRoles: ["route"],
        minimumMetersXYZ: [-1, -0.5, -1],
        maximumMetersXYZ: [1, 0.5, 1],
      },
      {
        visualGroupId: "wall-group",
        acceptanceTargetRef: "worldkit://acceptance-target/wall@1",
        semanticClassId: "structure.wall",
        identityColorHex: "#AA0002",
        blockIds: ["wall"],
        paletteRoles: ["structure"],
        minimumMetersXYZ: [1.5, -0.5, -1],
        maximumMetersXYZ: [2.5, 1.5, 1],
      },
    ],
    colliderJoins: [
      {
        colliderId: "bridge-collider",
        sourceBlockIds: ["bridge"],
        visualGroupIds: ["route-group"],
        proxyKind: "continuous-walkable-surface",
        minimumMetersXYZ: [-1, 0.5, -1],
        maximumMetersXYZ: [1, 0.5, 1],
        vertexCount: 4,
        triangleCount: 2,
        topologyHash: H("3"),
      },
      {
        colliderId: "wall-collider",
        sourceBlockIds: ["wall"],
        visualGroupIds: ["wall-group"],
        proxyKind: "exact-solid-union",
        minimumMetersXYZ: [1.5, -0.5, -1],
        maximumMetersXYZ: [2.5, 1.5, 1],
        vertexCount: 8,
        triangleCount: 12,
        topologyHash: H("3"),
      },
    ],
  };
}

describe("BabylonNativeBlockMaterializerMetadataV1", () => {
  it("parses, freezes and hashes the complete trusted materializer inventory", () => {
    const parsed = parseBabylonNativeBlockMaterializerMetadataV1(
      metadataValue(),
    );
    expect(hashBabylonNativeBlockMaterializerMetadataV1(parsed)).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.blocks)).toBe(true);
    expect(Object.isFrozen(parsed.visualGroups[0]?.blockIds)).toBe(true);
  });

  it.each([
    ["unsorted blocks", () => ({
      ...metadataValue(),
      blocks: [...metadataValue().blocks].reverse(),
    })],
    ["missing block row", () => ({
      ...metadataValue(),
      blocks: metadataValue().blocks.slice(0, 1),
    })],
    ["identity color collision", () => ({
      ...metadataValue(),
      visualGroups: metadataValue().visualGroups.map((group) => ({
        ...group,
        identityColorHex: "#AA0001",
      })),
    })],
    ["unknown collider block", () => ({
      ...metadataValue(),
      colliderJoins: [{
        ...metadataValue().colliderJoins[1],
        sourceBlockIds: ["missing"],
      }],
    })],
    ["derived mesh identity drift", () => ({
      ...metadataValue(),
      blocks: metadataValue().blocks.map((block, index) => index === 0
        ? { ...block, runtimeEntityId: "native-block:other" }
        : block),
    })],
  ])("rejects %s", (_label, mutate) => {
    expect(() => parseBabylonNativeBlockMaterializerMetadataV1(mutate()))
      .toThrow("BABYLON_NATIVE_BLOCK_MATERIALIZER_METADATA_INVALID");
  });

  it("rejects accessor-bearing input before evaluating it", () => {
    const value = metadataValue();
    const accessor = Object.defineProperty({ ...value }, "blocks", {
      enumerable: true,
      get: () => value.blocks,
    });
    expect(() => parseBabylonNativeBlockMaterializerMetadataV1(accessor))
      .toThrow("BABYLON_NATIVE_BLOCK_MATERIALIZER_METADATA_INVALID");
  });

  it("rejects the replaced blockProfileRef field", () => {
    const value = metadataValue();
    const { nativeSceneProfileRef: _removed, ...withoutCurrentField } = value;
    expect(() => parseBabylonNativeBlockMaterializerMetadataV1({
      ...withoutCurrentField,
      blockProfileRef:
        "worldkit://native-scene-profile/whitebox.blocks@1",
    })).toThrow("BABYLON_NATIVE_BLOCK_MATERIALIZER_METADATA_INVALID");
  });
});
