import { describe, expect, it } from "vitest";

import {
  BLOCK_LANDMARK_PRESET_BY_VISUAL_TARGET_INDEX_V1,
  BLOCK_PRESET_COLORS_V1,
  BLOCK_PRESET_REFS_V1,
  BLOCK_VISUAL_TARGET_COLORS_V1,
  BLOCK_WHITEBOX_SUBJECT_COLOR_V1,
  listBlockPresetsV1,
  resolveBlockPresetV1,
  resolveBlockPresetFromSemanticClassIdV1,
} from "./preset-registry.js";
import {
  BLOCK_SURFACE_PROFILE_REFS_V1,
  listBlockSurfaceProfilesV1,
  resolveBlockSurfaceProfileV1,
} from "./surface-profile-registry.js";

describe("Block World V1 preset registry", () => {
  it("freezes the ten functional presets and six reserved landmark colors", () => {
    const presets = listBlockPresetsV1();
    expect(presets).toHaveLength(16);
    expect(presets.map(({ resourceRef }) => resourceRef)).toEqual([
      BLOCK_PRESET_REFS_V1.walkable,
      BLOCK_PRESET_REFS_V1.walkableIce,
      BLOCK_PRESET_REFS_V1.walkableMud,
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
    expect(new Set(presets.map(({ render }) => render.colorHex)).size).toBe(16);
    expect(BLOCK_PRESET_COLORS_V1.landmarkOrange).toBe("#F28E2B");
    expect(Object.isFrozen(presets)).toBe(true);
    expect(presets.every((preset) =>
      Object.isFrozen(preset) && Object.isFrozen(preset.physics) &&
      Object.isFrozen(preset.render) && Object.isFrozen(preset.traversal))).toBe(true);
  });

  it("binds ordinary, ice, and mud walkable presets to immutable Surface Profiles", () => {
    const profiles = listBlockSurfaceProfilesV1();
    expect(profiles.map(({ resourceRef }) => resourceRef)).toEqual([
      BLOCK_SURFACE_PROFILE_REFS_V1.normal,
      BLOCK_SURFACE_PROFILE_REFS_V1.ice,
      BLOCK_SURFACE_PROFILE_REFS_V1.mud,
    ]);
    expect(resolveBlockPresetV1(BLOCK_PRESET_REFS_V1.walkable)?.surfaceProfileRef)
      .toBe(BLOCK_SURFACE_PROFILE_REFS_V1.normal);
    expect(resolveBlockPresetV1(BLOCK_PRESET_REFS_V1.walkableIce)?.surfaceProfileRef)
      .toBe(BLOCK_SURFACE_PROFILE_REFS_V1.ice);
    expect(resolveBlockPresetV1(BLOCK_PRESET_REFS_V1.walkableMud)?.surfaceProfileRef)
      .toBe(BLOCK_SURFACE_PROFILE_REFS_V1.mud);
    expect(resolveBlockSurfaceProfileV1(BLOCK_SURFACE_PROFILE_REFS_V1.ice))
      .toMatchObject({
        physics: { frictionRatio: 0.05, restitutionRatio: 0 },
        groundedMotion: {
          maximumSpeedRatio: 1,
          accelerationRatio: 0.35,
          decelerationRatio: 0.12,
        },
      });
    expect(profiles.every((profile) =>
      Object.isFrozen(profile) && Object.isFrozen(profile.physics) &&
      Object.isFrozen(profile.groundedMotion) &&
      Object.isFrozen(profile.aiMetadata) &&
      Object.isFrozen(profile.aiMetadata.semanticTags))).toBe(true);
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

  it("resolves the immutable preset from a compiled Block semantic class", () => {
    expect(resolveBlockPresetFromSemanticClassIdV1(
      "block.walkable-ice.shape.full.visual-group.frozen-lake",
    )?.resourceRef).toBe(BLOCK_PRESET_REFS_V1.walkableIce);
    expect(resolveBlockPresetFromSemanticClassIdV1("object.walkable-ice"))
      .toBeUndefined();
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
