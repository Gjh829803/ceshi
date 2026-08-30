import { describe, expect, it } from "vitest";

import {
  BLOCK_LANDMARK_PRESET_BY_VISUAL_TARGET_INDEX_V1,
  BLOCK_PRESET_COLORS_V1,
  BLOCK_PRESET_REFS_V1,
  BLOCK_VISUAL_TARGET_COLORS_V1,
  BLOCK_WHITEBOX_SUBJECT_COLOR_V1,
  listBlockPresetsV1,
  resolveBlockPresetV1,
} from "./preset-registry.js";

describe("Block World V1 preset registry", () => {
  it("freezes the eight functional presets and six reserved landmark colors", () => {
    const presets = listBlockPresetsV1();
    expect(presets).toHaveLength(14);
    expect(presets.map(({ resourceRef }) => resourceRef)).toEqual([
      BLOCK_PRESET_REFS_V1.walkable,
      BLOCK_PRESET_REFS_V1.obstacle,
      BLOCK_PRESET_REFS_V1.interactiveSolid,
      BLOCK_PRESET_REFS_V1.interactiveTrigger,
      BLOCK_PRESET_REFS_V1.water,
      BLOCK_PRESET_REFS_V1.cloudWalkable,
      BLOCK_PRESET_REFS_V1.cloudPassable,
      BLOCK_PRESET_REFS_V1.visualOnly,
      BLOCK_PRESET_REFS_V1.landmarkRed,
      BLOCK_PRESET_REFS_V1.landmarkOrange,
      BLOCK_PRESET_REFS_V1.landmarkYellow,
      BLOCK_PRESET_REFS_V1.landmarkBlue,
      BLOCK_PRESET_REFS_V1.landmarkPurple,
      BLOCK_PRESET_REFS_V1.landmarkPink,
    ]);
    expect(new Set(presets.map(({ render }) => render.colorHex)).size).toBe(14);
    expect(BLOCK_PRESET_COLORS_V1.landmarkOrange).toBe("#F28E2B");
    expect(Object.isFrozen(presets)).toBe(true);
    expect(presets.every((preset) =>
      Object.isFrozen(preset) && Object.isFrozen(preset.physics) &&
      Object.isFrozen(preset.render) && Object.isFrozen(preset.traversal))).toBe(true);
  });

  it("gives every landmark color exact obstacle physics and no support", () => {
    const obstacle = resolveBlockPresetV1(BLOCK_PRESET_REFS_V1.obstacle)!;
    const landmarks = listBlockPresetsV1().filter(({ family }) => family === "landmark");
    for (const landmark of landmarks) {
      expect(landmark.physics).toEqual(obstacle.physics);
      expect(landmark.traversal).toEqual(obstacle.traversal);
      expect(landmark.interactionMode).toBe("none");
    }
    expect(resolveBlockPresetV1("worldkit://block-preset/invented@1")).toBeUndefined();
  });

  it("shares one exact visual-target palette across planning and Block Builder", () => {
    expect(BLOCK_WHITEBOX_SUBJECT_COLOR_V1).toBe("#E85D5D");
    expect(BLOCK_VISUAL_TARGET_COLORS_V1).toEqual([
      "#E85D5D",
      "#F28E2B",
      "#D9A514",
      "#4E79A7",
      "#9C6ADE",
    ]);
    expect(BLOCK_LANDMARK_PRESET_BY_VISUAL_TARGET_INDEX_V1).toEqual([
      null,
      BLOCK_PRESET_REFS_V1.landmarkOrange,
      BLOCK_PRESET_REFS_V1.landmarkYellow,
      BLOCK_PRESET_REFS_V1.landmarkBlue,
      BLOCK_PRESET_REFS_V1.landmarkPurple,
    ]);
  });
});
