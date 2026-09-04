import type {
  BlockSurfaceProfileDefinitionV1,
  BlockSurfaceProfileRefV1,
} from "./types.js";

export const BLOCK_SURFACE_PROFILE_REFS_V1 = Object.freeze({
  normal: "worldkit://block-surface-profile/normal@1",
  ice: "worldkit://block-surface-profile/ice@1",
  mud: "worldkit://block-surface-profile/mud@1",
} satisfies Readonly<Record<string, BlockSurfaceProfileRefV1>>);

function freezeProfile(
  input: BlockSurfaceProfileDefinitionV1,
): BlockSurfaceProfileDefinitionV1 {
  return Object.freeze({
    ...input,
    physics: Object.freeze({ ...input.physics }),
    groundedMotion: Object.freeze({ ...input.groundedMotion }),
    aiMetadata: Object.freeze({
      ...input.aiMetadata,
      semanticTags: Object.freeze([...input.aiMetadata.semanticTags]),
    }),
  });
}

const BLOCK_SURFACE_PROFILES_V1: readonly BlockSurfaceProfileDefinitionV1[] =
  Object.freeze([
    freezeProfile({
      resourceRef: BLOCK_SURFACE_PROFILE_REFS_V1.normal,
      physics: { frictionRatio: 0.75, restitutionRatio: 0 },
      groundedMotion: {
        maximumSpeedRatio: 1,
        accelerationRatio: 1,
        decelerationRatio: 1,
      },
      aiMetadata: {
        displayName: "Normal Ground",
        description: "Predictable traction for ordinary walkable ground.",
        semanticTags: ["ground", "normal", "traction"],
      },
    }),
    freezeProfile({
      resourceRef: BLOCK_SURFACE_PROFILE_REFS_V1.ice,
      physics: { frictionRatio: 0.05, restitutionRatio: 0 },
      groundedMotion: {
        maximumSpeedRatio: 1,
        accelerationRatio: 0.35,
        decelerationRatio: 0.12,
      },
      aiMetadata: {
        displayName: "Slippery Ice",
        description: "Low traction with slow acceleration and long stopping distance.",
        semanticTags: ["ground", "ice", "slippery", "low-friction"],
      },
    }),
    freezeProfile({
      resourceRef: BLOCK_SURFACE_PROFILE_REFS_V1.mud,
      physics: { frictionRatio: 1, restitutionRatio: 0 },
      groundedMotion: {
        maximumSpeedRatio: 0.55,
        accelerationRatio: 0.6,
        decelerationRatio: 1.25,
      },
      aiMetadata: {
        displayName: "Heavy Mud",
        description: "Sticky ground with reduced travel speed and strong stopping drag.",
        semanticTags: ["ground", "mud", "sticky", "high-drag"],
      },
    }),
  ]);

const BLOCK_SURFACE_PROFILE_BY_REF_V1 = new Map(
  BLOCK_SURFACE_PROFILES_V1.map((profile) => [profile.resourceRef, profile]),
);

export function listBlockSurfaceProfilesV1():
  readonly BlockSurfaceProfileDefinitionV1[] {
  return BLOCK_SURFACE_PROFILES_V1;
}

export function resolveBlockSurfaceProfileV1(
  resourceRef: string,
): BlockSurfaceProfileDefinitionV1 | undefined {
  return BLOCK_SURFACE_PROFILE_BY_REF_V1.get(
    resourceRef as BlockSurfaceProfileRefV1,
  );
}
