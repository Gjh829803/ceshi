import { describe, expect, it } from "vitest";
import type { BabylonNativeBlockCheckedLayoutV1 } from "@whitebox-world/native-babylon-block-profile";
import { createBabylonNativeBlockProfileCheckResultV1 } from "@whitebox-world/native-babylon-block-profile/testing";
import {
  hashNativeSceneWorldBoundsPolicyV1,
  parseNativeSceneWorldBoundsPolicyV1,
  resolveNativeSceneWorldBoundsV1,
} from "./world-bounds-policy.js";

function checkedBounds(centers: readonly (readonly [number, number, number])[]) {
  const layout: BabylonNativeBlockCheckedLayoutV1["layout"] = {
    blocks: centers.map((center, index) => ({
      id: `block-${index}`, shape: "full", paletteRole: "background-mass",
      centerMetersXYZ: center, rotationQuarterTurnsY: 0,
      sizeMetersXYZ: [1, 1, 1],
      minimumMetersXYZ: [center[0] - 0.5, center[1] - 0.5, center[2] - 0.5],
      maximumMetersXYZ: [center[0] + 0.5, center[1] + 0.5, center[2] + 0.5],
      occupiedMicroCellKeys: [],
    })),
    issues: [], exposedTopSurfaceCellKeys: [], boundarySegmentKeys: [],
    structuralStepTransitionKeys: [], unsupportedBlockIds: [],
  };
  return { kind: "babylon-native-block-checked-layout" as const, schemaVersion: 1 as const,
    layout, checkResult: createBabylonNativeBlockProfileCheckResultV1("bounds-test", [], layout) };
}

describe("Native Host world bounds policy", () => {
  const fixed = {
    mode: "fixed",
    worldBounds: {
      centerMetersXZ: [0, -15], sizeMetersXZ: [180, 180],
      heightRangeMeters: [-40, 100],
    },
  } as const;

  it("retains exact fixed bounds and hashes the frozen policy, not a later layout", () => {
    expect(resolveNativeSceneWorldBoundsV1(fixed)).toEqual(fixed.worldBounds);
    expect(hashNativeSceneWorldBoundsPolicyV1(fixed)).not.toBe(
      hashNativeSceneWorldBoundsPolicyV1({ mode: "checked-block-layout" }),
    );
    expect(Object.isFrozen(parseNativeSceneWorldBoundsPolicyV1(fixed))).toBe(true);
  });

  it.each([
    {}, fixed.worldBounds,
    { mode: "checked-block-layout", worldBounds: fixed.worldBounds },
    { mode: "fixed" }, { ...fixed, extra: true },
    { mode: "fixed", worldBounds: { ...fixed.worldBounds, sizeMetersXZ: [0, 1] } },
  ])("rejects malformed or retired inputs: %j", (input) => {
    expect(() => parseNativeSceneWorldBoundsPolicyV1(input)).toThrow();
  });

  it("does not invoke input accessors", () => {
    let reads = 0;
    const input = { get mode() { reads += 1; return "checked-block-layout"; } };
    expect(() => parseNativeSceneWorldBoundsPolicyV1(input)).toThrow();
    expect(reads).toBe(0);
  });

  it("requires checked Block evidence for layout-derived mode", () => {
    expect(() => resolveNativeSceneWorldBoundsV1({ mode: "checked-block-layout" }))
      .toThrow(/checked-block-layout-required/);
  });

  it("matches old asymmetric bounds beyond 128m including ungrouped visual-only scenery", () => {
    const layout = checkedBounds([[-5, 3, -40], [200, 25, 80]]);
    expect(resolveNativeSceneWorldBoundsV1({ mode: "checked-block-layout" }, layout)).toEqual({
      centerMetersXZ: [97.5, 20], sizeMetersXZ: [215, 130], heightRangeMeters: [-62.5, 41.5],
    });
    const translated = checkedBounds([[495, 13, -340], [700, 35, -220]]);
    expect(resolveNativeSceneWorldBoundsV1({ mode: "checked-block-layout" }, translated)).toEqual({
      centerMetersXZ: [597.5, -280], sizeMetersXZ: [215, 130], heightRangeMeters: [-52.5, 51.5],
    });
  });

  it("uses the old 16m container minimum without requiring extra ground or Blocks", () => {
    const layout = checkedBounds([[15, 1, -20]]);
    expect(resolveNativeSceneWorldBoundsV1({ mode: "checked-block-layout" }, layout)).toEqual({
      centerMetersXZ: [15, -20], sizeMetersXZ: [16, 16], heightRangeMeters: [-64.5, 17.5],
    });
    expect(layout.layout.blocks).toHaveLength(1);
  });

  it("rejects empty and failed layout evidence", () => {
    const empty = checkedBounds([]);
    expect(() => resolveNativeSceneWorldBoundsV1({ mode: "checked-block-layout" }, empty)).toThrow();
    const layout = checkedBounds([[0, 0, 0]]);
    expect(() => resolveNativeSceneWorldBoundsV1({ mode: "checked-block-layout" }, {
      ...layout, checkResult: { ...layout.checkResult, outcome: "rejected" },
    })).toThrow(/WORLDKIT_NATIVE_BLOCK_CHECKED_LAYOUT_INVENTORY_INVALID/);
  });
});
