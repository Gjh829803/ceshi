export { BABYLON_NATIVE_BLOCK_PROFILE_REF_V1 } from
  "@whitebox-world/runtime-contracts";

/** The existing Profile identifier contract, shared by Host and authoring feedback. */
export function isBabylonNativeBlockIdV1(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{2,79}$/.test(value) &&
    value.normalize("NFC") === value;
}

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
