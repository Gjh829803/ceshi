import {
  BLOCK_SURFACE_PROFILE_REFS_V1,
  resolveBlockSurfaceProfileV1,
  type BlockSurfaceProfileDefinitionV1,
} from "@whitebox-world/block-world";
import type {
  GroundSurfaceMotionResponseV1,
} from "@whitebox-world/character-movement";

export const NORMAL_BLOCK_SURFACE_PROFILE_V1 =
  resolveBlockSurfaceProfileV1(BLOCK_SURFACE_PROFILE_REFS_V1.normal)!;

export function blockGroundSurfaceMotionResponseV1(
  profile: BlockSurfaceProfileDefinitionV1 = NORMAL_BLOCK_SURFACE_PROFILE_V1,
): GroundSurfaceMotionResponseV1 {
  return Object.freeze({
    schemaVersion: 1,
    maximumSpeedRatio: profile.groundedMotion.maximumSpeedRatio,
    accelerationRatio: profile.groundedMotion.accelerationRatio,
    decelerationRatio: profile.groundedMotion.decelerationRatio,
  });
}
