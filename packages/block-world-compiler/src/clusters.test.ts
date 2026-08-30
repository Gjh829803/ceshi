import { describe, expect, it } from "vitest";

import {
  BLOCK_PRESET_REFS_V1,
  type BlockInstanceV2,
} from "@whitebox-world/block-world";

import { createBlockWorldRuntimeClustersV2 } from "./clusters.js";

function block(
  id: string,
  x: number,
  y: number,
  z: number,
  overrides: Partial<BlockInstanceV2> = {},
): BlockInstanceV2 {
  return {
    id,
    presetRef: BLOCK_PRESET_REFS_V1.walkable,
    shape: "full",
    positionMetersXYZ: [x, y, z],
    rotationQuarterTurnsY: 0,
    ...overrides,
  };
}

describe("Block World runtime clusters", () => {
  it("coalesces complete cuboids but never crosses signed chunk boundaries", () => {
    const clusters = createBlockWorldRuntimeClustersV2([
      ...Array.from({ length: 4 }, (_, index) => block(`left-${index}`, 30 + index, 0, 0)),
      block("negative", -1, 0, 0),
    ]);
    expect(clusters).toHaveLength(3);
    expect(clusters.map(({ chunkCoordinateXZ, sizeMetersXYZ }) => ({
      chunkCoordinateXZ,
      sizeMetersXYZ,
    }))).toEqual([
      { chunkCoordinateXZ: [-1, 0], sizeMetersXYZ: [1, 1, 1] },
      { chunkCoordinateXZ: [0, 0], sizeMetersXYZ: [2, 1, 1] },
      { chunkCoordinateXZ: [1, 0], sizeMetersXYZ: [2, 1, 1] },
    ]);
  });

  it("keeps interactive blocks independently addressable and visual groups separate", () => {
    const clusters = createBlockWorldRuntimeClustersV2([
      block("trigger-a", 0, 0, 0, {
        presetRef: BLOCK_PRESET_REFS_V1.interactiveTrigger,
        interactionInstanceId: "trigger-a",
      }),
      block("trigger-b", 1, 0, 0, {
        presetRef: BLOCK_PRESET_REFS_V1.interactiveTrigger,
        interactionInstanceId: "trigger-b",
      }),
      block("landmark-a", 2, 0, 0, { visualGroupId: "visual-target-2" }),
      block("landmark-b", 3, 0, 0, { visualGroupId: "visual-target-3" }),
    ]);
    expect(clusters).toHaveLength(4);
    expect(clusters.flatMap(({ sourceBlockIds }) => sourceBlockIds)).toEqual([
      "trigger-a",
      "trigger-b",
      "landmark-a",
      "landmark-b",
    ]);
  });

  it("is byte-order deterministic for reversed Agent construction", () => {
    const blocks = [
      block("a", 0, 0, 0),
      block("b", 1, 0, 0),
      block("c", 0, 1, 0),
      block("d", 1, 1, 0),
    ];
    expect(createBlockWorldRuntimeClustersV2([...blocks].reverse())).toEqual(
      createBlockWorldRuntimeClustersV2(blocks),
    );
  });

  it("clusters half blocks independently from full blocks and preserves base size", () => {
    const clusters = createBlockWorldRuntimeClustersV2([
      block("half-a", 0, 0.25, 0, { shape: "half" }),
      block("half-b", 1, 0.25, 0, { shape: "half" }),
      block("full-a", 2, 0, 0),
    ]);
    expect(clusters.map(({ shape, baseSizeMetersXYZ, repeatCountXYZ }) => ({
      shape,
      baseSizeMetersXYZ,
      repeatCountXYZ,
    }))).toEqual([
      { shape: "full", baseSizeMetersXYZ: [1, 1, 1], repeatCountXYZ: [1, 1, 1] },
      { shape: "half", baseSizeMetersXYZ: [1, 0.5, 1], repeatCountXYZ: [2, 1, 1] },
    ]);
  });
});
