import type { Vector3 } from 'three';

/** Animation state belongs to the simulation; mesh animation never moves its root. */
export interface CreatureState {
  gait: 'graze' | 'walk' | 'trot' | 'gallop' | 'rest' | 'flap' | 'glide';
  phase: number;
  flying: boolean;
  leadPosition?: Vector3|undefined;
  leadYaw?: number|undefined;
  leadVerticalSpeed?: number|undefined;
}
