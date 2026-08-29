export const BABYLON_NATIVE_BLOCK_PROFILE_REF_V1 =
  "worldkit://native-scene-profile/whitebox.blocks@1" as const;

export const BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1 = Object.freeze([
  "ground",
  "route",
  "structure",
  "hazard",
  "water-like-visual",
  "background-mass",
] as const);

export type BabylonNativeBlockPaletteRoleV1 =
  (typeof BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1)[number];
