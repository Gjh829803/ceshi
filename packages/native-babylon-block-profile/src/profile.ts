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

export const BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1 = Object.freeze({
  ground: "#7F956E",
  route: "#C9A96B",
  structure: "#AEB8C4",
  hazard: "#C74F45",
  "water-like-visual": "#4E91B5",
  "background-mass": "#626B78",
} as const satisfies Readonly<
  Record<BabylonNativeBlockPaletteRoleV1, `#${string}`>
>);
