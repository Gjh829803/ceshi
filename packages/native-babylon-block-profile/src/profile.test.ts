import { describe, expect, it } from "vitest";

interface ProfileModule {
  readonly BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1: Readonly<{
    ground: "#7F956E";
    route: "#C9A96B";
    structure: "#AEB8C4";
    hazard: "#C74F45";
    "water-like-visual": "#4E91B5";
    "background-mass": "#626B78";
  }>;
}

async function loadProfile(): Promise<ProfileModule> {
  const modulePath = ["./", "profile.js"].join("");
  return import(modulePath) as Promise<ProfileModule>;
}

describe("Babylon Native block semantic palette", () => {
  it("maps every closed role to one stable sRGB hex color", async () => {
    const profile = await loadProfile();

    expect(profile.BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1)
      .toEqual({
        ground: "#7F956E",
        route: "#C9A96B",
        structure: "#AEB8C4",
        hazard: "#C74F45",
        "water-like-visual": "#4E91B5",
        "background-mass": "#626B78",
      });
    expect(Object.isFrozen(
      profile.BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1,
    )).toBe(true);
  });
});
