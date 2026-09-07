/** Technical-art contract. Sources/license hashes are recorded in public/assets/creatures. */
export type CreatureModelKind = 'horse' | 'dragon';
export interface CreatureAssetDefinition {
  url: string;
  author: string;
  license: 'CC0-1.0';
  sourceUp: '+Y';
  sourceForward: '+Z';
  yaw: number;
  /** Maximum union of all enabled animation poses, in metres (X, Y, Z). */
  targetSize: readonly [number, number, number];
  uniformScale: boolean;
  /** Art-only translation after bounds normalization; the physics root is unchanged. */
  offset: readonly [number, number, number];
  rootMotionBone: string;
  saddle: readonly [number, number, number];
  clips: Readonly<Record<string, string>>;
}

export const CREATURE_ASSETS: Record<CreatureModelKind, CreatureAssetDefinition> = {
  horse: {
    url: '/assets/creatures/horse.glb', author: 'Quaternius', license: 'CC0-1.0',
    sourceUp: '+Y', sourceForward: '+Z', yaw: 0,
    targetSize: [1.4, 2.3, 3.55], uniformScale: true, offset: [0, 0, 0], rootMotionBone: 'Body',
    saddle: [0, 1.65, 0],
    // The source has no trot. A quicker walk is intentional, not a missing-clip fallback.
    clips: { graze: 'Idle', walk: 'Walk', trot: 'Walk', gallop: 'Gallop' },
  },
  dragon: {
    url: '/assets/creatures/dragon.glb', author: 'Quaternius', license: 'CC0-1.0',
    sourceUp: '+Y', sourceForward: '+Z', yaw: 0,
    // Authored monster is upright. A wider/longer art transform gives this mount
    // its ten-metre wingspan while leaving headroom inside the physical hull.
    // The head sits ahead of the fixed saddle, rather than surrounding the rider.
    targetSize: [10.15, 2.6, 5.85], uniformScale: false, offset: [0, 0, 1.25], rootMotionBone: 'Root',
    saddle: [0, 2.1, .4],
    // This serpentine source has no legs or grounded locomotion clip: rest/walk
    // hold its flight pose. The visible flight clips remain genuine bone animation.
    clips: { rest: 'Flying_Idle', walk: 'Flying_Idle', flap: 'Fast_Flying', glide: 'Flying_Idle' },
  },
};
