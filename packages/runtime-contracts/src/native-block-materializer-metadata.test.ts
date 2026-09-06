import { describe, expect, it, vi } from "vitest";

import {
  hashBabylonNativeBlockMaterializerMetadataV1,
  parseBabylonNativeBlockMaterializerMetadataV1,
  parseNativeBlockGroundExplorationV1,
  admitNativeBlockGroundExplorationV1,
} from "./native-block-materializer-metadata.js";

function explorationValue() {
  return {
    mode: "source-authored" as const,
    requiredTargets: [
      { id: "middle-court", region: "middle", standPositionMetersXYZ: [4, 0, -3] },
      { id: "remote-garden", region: "remote", standPositionMetersXYZ: [8, 1, -5] },
    ],
    requiredTraversalBands: [{ id: "entry-court", halfWidthMeters: 1, isBidirectional: true,
      centerlineStandPositionsMetersXYZ: [[0, 0, 0], [4, 0, 0], [4, 0, -3]] }],
  };
}

describe("Native ground exploration intent", () => {
  it.each(["requiredTargets", "requiredTraversalBands"] as const)("preserves authored %s order instead of imposing an alphabetical gate", (list) => {
    const original = explorationValue();
    original.requiredTraversalBands.push({
      id: "middle-garden", halfWidthMeters: 1, isBidirectional: false,
      centerlineStandPositionsMetersXYZ: [[4, 0, -3], [8, 1, -5]],
    });
    const value = structuredClone(original);
    value[list].reverse();
    const before = structuredClone(value);
    const parsed = admitNativeBlockGroundExplorationV1(value, "source-authored", [0, 0, 0], true);
    expect(parsed).toEqual(before);
    expect(value).toEqual(before);
    if (parsed.mode !== "source-authored") throw new Error("expected source-authored intent");
    expect(Object.isFrozen(parsed[list])).toBe(true);
    const metadata = { ...metadataValue(), groundExploration: parsed };
    expect(parseBabylonNativeBlockMaterializerMetadataV1(metadata).groundExploration).toEqual(before);
    expect(hashBabylonNativeBlockMaterializerMetadataV1(metadata)).not.toBe(
      hashBabylonNativeBlockMaterializerMetadataV1({ ...metadataValue(), groundExploration: original }),
    );
    value[list].reverse();
    expect(parsed).toEqual(before);
  });
  it.each(["requiredTargets", "requiredTraversalBands"] as const)("rejects duplicate %s IDs without requiring sorted order", (list) => {
    const value = explorationValue();
    value.requiredTraversalBands.push({
      id: "middle-garden", halfWidthMeters: 1, isBidirectional: false,
      centerlineStandPositionsMetersXYZ: [[4, 0, -3], [8, 1, -5]],
    });
    value[list][1]!.id = value[list][0]!.id;
    expect(() => parseNativeBlockGroundExplorationV1(value)).toThrow();
  });
  it.each([true, false])("preserves the old authored band direction requirement=%s", (isBidirectional) => {
    const original = explorationValue();
    const value = { ...original, requiredTraversalBands: original.requiredTraversalBands.map(band => ({ ...band, isBidirectional })) };
    const parsed = admitNativeBlockGroundExplorationV1(value, "source-authored", [0, 0, 0], true);
    expect(parsed).toEqual(value);
    expect(hashBabylonNativeBlockMaterializerMetadataV1({ ...metadataValue(), groundExploration: parsed }))
      .not.toBe(hashBabylonNativeBlockMaterializerMetadataV1({ ...metadataValue(), groundExploration: {
        ...value, requiredTraversalBands: value.requiredTraversalBands.map(band => ({ ...band, isBidirectional: !isBidirectional })),
      } }));
  });
  it("rejects a missing, nonboolean or accessor band direction without coercion", () => {
    for (const isBidirectional of [undefined, null, 0, 1, "false"]) {
      const value = explorationValue();
      Object.assign(value.requiredTraversalBands[0]!, { isBidirectional });
      expect(() => parseNativeBlockGroundExplorationV1(value)).toThrow();
    }
    const missing = explorationValue();
    Reflect.deleteProperty(missing.requiredTraversalBands[0]!, "isBidirectional");
    expect(() => parseNativeBlockGroundExplorationV1(missing)).toThrow();
    const getter = vi.fn(() => false);
    const accessor = explorationValue();
    Object.defineProperty(accessor.requiredTraversalBands[0]!, "isBidirectional", { get: getter });
    expect(() => parseNativeBlockGroundExplorationV1(accessor)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it("does not confuse the old per-band waypoint limit with the number of exploration anchors", () => {
    const requiredTargets = Array.from({ length: 257 }, (_, index) => ({
      id: `target-${String(index).padStart(3, "0")}`,
      region: index === 0 ? "middle" as const : "remote" as const,
      standPositionMetersXYZ: [index + 1, 0, 0],
    }));
    const value = { mode: "source-authored", requiredTargets, requiredTraversalBands: [{
      id: "entry", halfWidthMeters: 1, isBidirectional: true, centerlineStandPositionsMetersXYZ: [[0, 0, 0], [1, 0, 0]],
    }] };
    expect(admitNativeBlockGroundExplorationV1(value, "source-authored", [0, 0, 0], true)).toEqual(value);
    const tooManyWaypoints = { ...value, requiredTraversalBands: [{
      ...value.requiredTraversalBands[0]!,
      centerlineStandPositionsMetersXYZ: Array.from({ length: 257 }, (_, index) => [index, 0, 0]),
    }] };
    expect(() => parseNativeBlockGroundExplorationV1(tooManyWaypoints)).toThrow("2-256");
  });
  it("parses optional ground evidence without inventing a connected-ground policy", () => {
    const empty = { mode: "source-authored", requiredTargets: [], requiredTraversalBands: [] };
    expect(parseNativeBlockGroundExplorationV1(empty)).toEqual(empty);
  });
  it("does not require ground-only anchors and entry bands under the frozen mixed-motion policy", () => {
    const empty = { mode: "source-authored", requiredTargets: [], requiredTraversalBands: [] };
    expect(admitNativeBlockGroundExplorationV1(empty, "source-authored", [0, 0, 0], false)).toEqual(empty);
    const optional = explorationValue();
    optional.requiredTargets.pop();
    optional.requiredTraversalBands[0]!.centerlineStandPositionsMetersXYZ = [[2, 0, -3], [4, 0, -3]];
    expect(admitNativeBlockGroundExplorationV1(optional, "source-authored", [0, 0, 0], false)).toEqual(optional);
  });
  it("preserves curved coordinates and joins the exact spawn-to-middle course", () => {
    const value = explorationValue();
    const parsed = admitNativeBlockGroundExplorationV1(value, "source-authored", [0, 0, 0], true);
    expect(parsed).toEqual(value);
    expect(Object.isFrozen(parsed)).toBe(true);
    const baseline = metadataValue();
    const authored = { ...baseline, groundExploration: parsed };
    expect(parseBabylonNativeBlockMaterializerMetadataV1(authored).groundExploration).toEqual(value);
    const moved = explorationValue(); moved.requiredTargets[1]!.standPositionMetersXYZ[0] = 9;
    expect(hashBabylonNativeBlockMaterializerMetadataV1({ ...baseline, groundExploration: moved }))
      .not.toBe(hashBabylonNativeBlockMaterializerMetadataV1(authored));
    expect(() => admitNativeBlockGroundExplorationV1(value, "case-defined", [0, 0, 0], true)).toThrow();
    expect(() => admitNativeBlockGroundExplorationV1({ mode: "case-defined" }, "source-authored", [0, 0, 0], true)).toThrow();
  });
  it("rejects missing, duplicate, or spawn anchors and an entry band to the wrong endpoint", () => {
    const missing = explorationValue(); missing.requiredTargets.pop();
    expect(() => admitNativeBlockGroundExplorationV1(missing, "source-authored", [0, 0, 0], true)).toThrow();
    const duplicate = explorationValue();
    duplicate.requiredTargets[1]!.standPositionMetersXYZ = [4, 0, -3];
    expect(() => parseNativeBlockGroundExplorationV1(duplicate)).toThrow();
    const spawn = explorationValue(); spawn.requiredTargets[1]!.standPositionMetersXYZ = [0, 0, 0];
    expect(() => admitNativeBlockGroundExplorationV1(spawn, "source-authored", [0, 0, 0], true)).toThrow();
    expect(() => admitNativeBlockGroundExplorationV1(explorationValue(), "source-authored", [1, 0, 0], true)).toThrow();
    const endpoint = explorationValue(); endpoint.requiredTraversalBands[0]!.centerlineStandPositionsMetersXYZ[2] = [8, 1, -5];
    expect(() => admitNativeBlockGroundExplorationV1(endpoint, "source-authored", [0, 0, 0], true)).toThrow();
    const empty = { mode: "source-authored", requiredTargets: [], requiredTraversalBands: [] };
    expect(() => admitNativeBlockGroundExplorationV1(empty, "source-authored", [0, 0, 0], true)).toThrow();
    const noBand = { ...explorationValue(), requiredTraversalBands: [] };
    expect(() => admitNativeBlockGroundExplorationV1(noBand, "source-authored", [0, 0, 0], true)).toThrow();
  });
  it("has no missing-mode fallback, authority extras, accessor reads or geometric minima", () => {
    expect(() => parseNativeBlockGroundExplorationV1(undefined)).toThrow();
    expect(() => parseNativeBlockGroundExplorationV1({ mode: "case-defined", requiredTargets: [] })).toThrow();
    const value = explorationValue();
    const getter = vi.fn(() => "source-authored");
    Object.defineProperty(value, "mode", { get: getter });
    expect(() => parseNativeBlockGroundExplorationV1(value)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const small = explorationValue();
    small.requiredTargets[0]!.standPositionMetersXYZ = [0.5, 0, 0];
    small.requiredTargets[1]!.standPositionMetersXYZ = [1, 0, 0];
    small.requiredTraversalBands[0]!.centerlineStandPositionsMetersXYZ = [[0, 0, 0], [0.5, 0, 0]];
    expect(() => admitNativeBlockGroundExplorationV1(small, "source-authored", [0, 0, 0], true)).not.toThrow();
    small.requiredTraversalBands[0]!.id = small.requiredTargets[0]!.id;
    expect(() => admitNativeBlockGroundExplorationV1(small, "source-authored", [0, 0, 0], true)).not.toThrow();
    expect(() => admitNativeBlockGroundExplorationV1(small, "source-authored", [0, 0, 0], undefined as never)).toThrow();
  });
  it.each([true, false])("retains declared-row validity with connected-ground=%s", (policy) => {
    const duplicate = explorationValue();
    duplicate.requiredTargets[1]!.standPositionMetersXYZ = [4, 0, -3];
    const atSpawn = explorationValue();
    atSpawn.requiredTargets[1]!.standPositionMetersXYZ = [0, 0, 0];
    const badBand = explorationValue();
    badBand.requiredTraversalBands[0]!.centerlineStandPositionsMetersXYZ = [[0, 0, 0], [0, 0, 0]];
    const badWidth = explorationValue(); badWidth.requiredTraversalBands[0]!.halfWidthMeters = 0;
    for (const invalid of [duplicate, atSpawn, badBand, badWidth]) {
      expect(() => admitNativeBlockGroundExplorationV1(invalid, "source-authored", [0, 0, 0], policy)).toThrow();
    }
  });
});

const H = (digit: string) => `sha256:${digit.repeat(64)}` as const;

function metadataValue() {
  return {
    kind: "babylon-native-block-materializer-metadata",
    settledVisualTargetCount: 2,
    groundExploration: { mode: "case-defined" as const },
    openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
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
        frontDirectionWorldXZ: [1, 0] as const,
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
        frontDirectionWorldXZ: [0, -1] as const,
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
  it.each([undefined, -1, -0, 1.5, Infinity, "2"])("rejects invalid Host visual target count %s", value => {
    expect(() => parseBabylonNativeBlockMaterializerMetadataV1({
      ...metadataValue(), settledVisualTargetCount: value,
    })).toThrow();
  });

  it("preserves declared semantic front in immutable Package identity", () => {
    const value = metadataValue();
    const parsed = parseBabylonNativeBlockMaterializerMetadataV1(value);
    expect(parsed.visualGroups[0]).toMatchObject({ frontDirectionWorldXZ: [1, 0] });
    expect(Object.isFrozen(Reflect.get(parsed.visualGroups[0]!, "frontDirectionWorldXZ"))).toBe(true);
    const turned = { ...value, visualGroups: value.visualGroups.map((group) => ({ ...group, frontDirectionWorldXZ: [-1, 0] })) };
    expect(hashBabylonNativeBlockMaterializerMetadataV1(turned)).not.toBe(hashBabylonNativeBlockMaterializerMetadataV1(value));
  });
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
    ["removed quarter-meter step shape", () => ({
      ...metadataValue(),
      blocks: metadataValue().blocks.map((block, index) => index === 0
        ? { ...block, shape: "step" }
        : block),
    })],
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
