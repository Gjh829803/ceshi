import type {
  BlockColorHexV1,
  BlockPresetDefinitionV1,
  BlockPresetRefV1,
} from "./types.js";
import { BLOCK_SURFACE_PROFILE_REFS_V1 } from "./surface-profile-registry.js";

export const BLOCK_PRESET_REFS_V1 = Object.freeze({
  walkable: "worldkit://block-preset/walkable@1",
  walkableIce: "worldkit://block-preset/walkable-ice@1",
  walkableMud: "worldkit://block-preset/walkable-mud@1",
  obstacle: "worldkit://block-preset/obstacle@1",
  interactiveSolid: "worldkit://block-preset/interactive-solid@1",
  interactiveTrigger: "worldkit://block-preset/interactive-trigger@1",
  water: "worldkit://block-preset/water@1",
  cloudWalkable: "worldkit://block-preset/cloud-walkable@1",
  cloudPassable: "worldkit://block-preset/cloud-passable@1",
  visualOnly: "worldkit://block-preset/visual-only@1",
  landmarkRed: "worldkit://block-preset/landmark-red@1",
  landmarkOrange: "worldkit://block-preset/landmark-orange@1",
  landmarkYellow: "worldkit://block-preset/landmark-yellow@1",
  landmarkBlue: "worldkit://block-preset/landmark-blue@1",
  landmarkPurple: "worldkit://block-preset/landmark-purple@1",
  landmarkPink: "worldkit://block-preset/landmark-pink@1",
} satisfies Readonly<Record<string, BlockPresetRefV1>>);

export const BLOCK_PRESET_COLORS_V1 = Object.freeze({
  walkable: "#B7E4C7",
  walkableIce: "#BDEBFF",
  walkableMud: "#9C7653",
  obstacle: "#5F6368",
  interactiveSolid: "#00B8A9",
  interactiveTrigger: "#B8DE6F",
  water: "#8ECDF4",
  cloudWalkable: "#D8D4F2",
  cloudPassable: "#EEF6FF",
  visualOnly: "#D6D3D1",
  landmarkRed: "#E15759",
  landmarkOrange: "#F28E2B",
  landmarkYellow: "#D9A514",
  landmarkBlue: "#4E79A7",
  landmarkPurple: "#9C6ADE",
  landmarkPink: "#E66AA5",
} satisfies Readonly<Record<keyof typeof BLOCK_PRESET_REFS_V1, BlockColorHexV1>>);

/**
 * The controlled Subject is not a world block. This fixed red is reserved for
 * its Planner spawn marker, entry silhouette, and Runtime capture mask.
 */
export const BLOCK_WHITEBOX_SUBJECT_COLOR_V1 = "#E85D5D" as const;

/**
 * Visual targets are ordered by the Scene Brief. Target 1 is always the
 * controlled Subject; targets 2-5 use the same landmark colors in planning,
 * authored blocks, capture metadata, tri-views, and Studio presentation.
 */
export const BLOCK_VISUAL_TARGET_COLORS_V1 = Object.freeze([
  BLOCK_WHITEBOX_SUBJECT_COLOR_V1,
  BLOCK_PRESET_COLORS_V1.landmarkOrange,
  BLOCK_PRESET_COLORS_V1.landmarkYellow,
  BLOCK_PRESET_COLORS_V1.landmarkBlue,
  BLOCK_PRESET_COLORS_V1.landmarkPurple,
] as const);

export const BLOCK_LANDMARK_PRESET_BY_VISUAL_TARGET_INDEX_V1 = Object.freeze([
  null,
  BLOCK_PRESET_REFS_V1.landmarkOrange,
  BLOCK_PRESET_REFS_V1.landmarkYellow,
  BLOCK_PRESET_REFS_V1.landmarkBlue,
  BLOCK_PRESET_REFS_V1.landmarkPurple,
] as const);

function freezePreset(
  input: BlockPresetDefinitionV1,
): BlockPresetDefinitionV1 {
  return Object.freeze({
    ...input,
    render: Object.freeze({ ...input.render }),
    physics: Object.freeze({ ...input.physics }),
    traversal: Object.freeze({ ...input.traversal }),
  });
}

const STATIC_SOLID_PHYSICS = Object.freeze({
  bodyMode: "static" as const,
  collisionMode: "solid" as const,
});

const BLOCK_PRESETS_V1: readonly BlockPresetDefinitionV1[] = Object.freeze([
  freezePreset({
    resourceRef: BLOCK_PRESET_REFS_V1.walkable,
    family: "functional",
    render: { colorHex: BLOCK_PRESET_COLORS_V1.walkable, opacityRatio: 1 },
    physics: STATIC_SOLID_PHYSICS,
    surfaceProfileRef: BLOCK_SURFACE_PROFILE_REFS_V1.normal,
    traversal: { supportSurfaceMode: "ground", mediumMode: "solid" },
    interactionMode: "none",
  }),
  freezePreset({
    resourceRef: BLOCK_PRESET_REFS_V1.walkableIce,
    family: "functional",
    render: { colorHex: BLOCK_PRESET_COLORS_V1.walkableIce, opacityRatio: 1 },
    physics: STATIC_SOLID_PHYSICS,
    surfaceProfileRef: BLOCK_SURFACE_PROFILE_REFS_V1.ice,
    traversal: { supportSurfaceMode: "ground", mediumMode: "solid" },
    interactionMode: "none",
  }),
  freezePreset({
    resourceRef: BLOCK_PRESET_REFS_V1.walkableMud,
    family: "functional",
    render: { colorHex: BLOCK_PRESET_COLORS_V1.walkableMud, opacityRatio: 1 },
    physics: STATIC_SOLID_PHYSICS,
    surfaceProfileRef: BLOCK_SURFACE_PROFILE_REFS_V1.mud,
    traversal: { supportSurfaceMode: "ground", mediumMode: "solid" },
    interactionMode: "none",
  }),
  freezePreset({
    resourceRef: BLOCK_PRESET_REFS_V1.obstacle,
    family: "functional",
    render: { colorHex: BLOCK_PRESET_COLORS_V1.obstacle, opacityRatio: 1 },
    physics: STATIC_SOLID_PHYSICS,
    surfaceProfileRef: BLOCK_SURFACE_PROFILE_REFS_V1.normal,
    traversal: { supportSurfaceMode: "none", mediumMode: "solid" },
    interactionMode: "none",
  }),
  freezePreset({
    resourceRef: BLOCK_PRESET_REFS_V1.interactiveSolid,
    family: "functional",
    render: { colorHex: BLOCK_PRESET_COLORS_V1.interactiveSolid, opacityRatio: 1 },
    physics: {
      bodyMode: "kinematic",
      collisionMode: "solid",
    },
    surfaceProfileRef: BLOCK_SURFACE_PROFILE_REFS_V1.normal,
    traversal: { supportSurfaceMode: "none", mediumMode: "solid" },
    interactionMode: "solid",
  }),
  freezePreset({
    resourceRef: BLOCK_PRESET_REFS_V1.interactiveTrigger,
    family: "functional",
    render: { colorHex: BLOCK_PRESET_COLORS_V1.interactiveTrigger, opacityRatio: 0.45 },
    physics: {
      bodyMode: "kinematic",
      collisionMode: "trigger",
    },
    surfaceProfileRef: null,
    traversal: { supportSurfaceMode: "none", mediumMode: "none" },
    interactionMode: "trigger",
  }),
  freezePreset({
    resourceRef: BLOCK_PRESET_REFS_V1.water,
    family: "functional",
    render: { colorHex: BLOCK_PRESET_COLORS_V1.water, opacityRatio: 0.55 },
    physics: {
      bodyMode: "none",
      collisionMode: "trigger",
    },
    surfaceProfileRef: null,
    traversal: { supportSurfaceMode: "none", mediumMode: "water" },
    interactionMode: "none",
  }),
  freezePreset({
    resourceRef: BLOCK_PRESET_REFS_V1.cloudWalkable,
    family: "functional",
    render: { colorHex: BLOCK_PRESET_COLORS_V1.cloudWalkable, opacityRatio: 0.8 },
    physics: STATIC_SOLID_PHYSICS,
    surfaceProfileRef: BLOCK_SURFACE_PROFILE_REFS_V1.normal,
    traversal: { supportSurfaceMode: "cloud", mediumMode: "cloud" },
    interactionMode: "none",
  }),
  freezePreset({
    resourceRef: BLOCK_PRESET_REFS_V1.cloudPassable,
    family: "functional",
    render: { colorHex: BLOCK_PRESET_COLORS_V1.cloudPassable, opacityRatio: 0.45 },
    physics: {
      bodyMode: "none",
      collisionMode: "none",
    },
    surfaceProfileRef: null,
    traversal: { supportSurfaceMode: "none", mediumMode: "cloud" },
    interactionMode: "none",
  }),
  freezePreset({
    resourceRef: BLOCK_PRESET_REFS_V1.visualOnly,
    family: "functional",
    render: { colorHex: BLOCK_PRESET_COLORS_V1.visualOnly, opacityRatio: 0.7 },
    physics: {
      bodyMode: "none",
      collisionMode: "none",
    },
    surfaceProfileRef: null,
    traversal: { supportSurfaceMode: "none", mediumMode: "none" },
    interactionMode: "none",
  }),
  ...([
    [BLOCK_PRESET_REFS_V1.landmarkRed, BLOCK_PRESET_COLORS_V1.landmarkRed],
    [BLOCK_PRESET_REFS_V1.landmarkOrange, BLOCK_PRESET_COLORS_V1.landmarkOrange],
    [BLOCK_PRESET_REFS_V1.landmarkYellow, BLOCK_PRESET_COLORS_V1.landmarkYellow],
    [BLOCK_PRESET_REFS_V1.landmarkBlue, BLOCK_PRESET_COLORS_V1.landmarkBlue],
    [BLOCK_PRESET_REFS_V1.landmarkPurple, BLOCK_PRESET_COLORS_V1.landmarkPurple],
    [BLOCK_PRESET_REFS_V1.landmarkPink, BLOCK_PRESET_COLORS_V1.landmarkPink],
  ] as const).map(([resourceRef, colorHex]) => freezePreset({
    resourceRef,
    family: "landmark",
    render: { colorHex, opacityRatio: 1 },
    physics: STATIC_SOLID_PHYSICS,
    surfaceProfileRef: BLOCK_SURFACE_PROFILE_REFS_V1.normal,
    traversal: { supportSurfaceMode: "none", mediumMode: "solid" },
    interactionMode: "none",
  })),
]);

const BLOCK_PRESET_BY_REF_V1 = new Map(
  BLOCK_PRESETS_V1.map((preset) => [preset.resourceRef, preset]),
);

export function listBlockPresetsV1(): readonly BlockPresetDefinitionV1[] {
  return BLOCK_PRESETS_V1;
}

export function resolveBlockPresetV1(
  resourceRef: string,
): BlockPresetDefinitionV1 | undefined {
  return BLOCK_PRESET_BY_REF_V1.get(resourceRef as BlockPresetRefV1);
}

export function resolveBlockPresetFromSemanticClassIdV1(
  semanticClassId: string,
): BlockPresetDefinitionV1 | undefined {
  return BLOCK_PRESETS_V1.find((preset) => {
    const presetName = preset.resourceRef
      .slice("worldkit://block-preset/".length)
      .replace(/@1$/, "");
    const prefix = `block.${presetName}`;
    return semanticClassId === prefix || semanticClassId.startsWith(`${prefix}.`);
  });
}
