import { describe, expect, it } from "vitest";

import {
  BLOCK_PRESET_REFS_V1,
  type BlockInstanceV2,
  type BlockPositionMetersXYZV2,
} from "@whitebox-world/block-world";

import { deriveSafeStartViewCatalog } from
  "./build-exploration-navigation-evidence.js";

function obstacle(
  id: string,
  positionMetersXYZ: BlockPositionMetersXYZV2,
): BlockInstanceV2 {
  return {
    id,
    presetRef: BLOCK_PRESET_REFS_V1.obstacle,
    shape: "full",
    positionMetersXYZ,
    rotationQuarterTurnsY: 0,
  };
}

const camera = {
  distanceMeters: 3.5,
  pitchRadians: 0.16,
  targetHeightMeters: 1.5,
  collisionRadiusMeters: 0.12,
} as const;

describe("Episode camera-clear start catalog", () => {
  it("rejects only facings whose target-to-camera corridor crosses a wall", () => {
    const stand = [0, 0.5, 0] as const;
    const catalog = deriveSafeStartViewCatalog([
      obstacle("wall-1", [0, 2, 2]),
      obstacle("wall-2", [0, 3, 2]),
    ], [stand], camera);

    expect(catalog.some((row) => row.initialFacingYawRadians === 0)).toBe(false);
    expect(catalog.some((row) => row.initialFacingYawRadians === Math.PI)).toBe(true);
    expect(catalog.every((row) => row.initialPositionMetersXYZ === stand)).toBe(true);
  });

  it("admits all sampled facings when the third-person camera corridor is open", () => {
    const catalog = deriveSafeStartViewCatalog(
      [],
      [[4, 0.5, -2]],
      camera,
    );
    expect(catalog).toHaveLength(16);
  });
});
