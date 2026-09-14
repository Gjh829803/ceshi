import type { Vector3 } from 'three';

/** Animation state belongs to the simulation; mesh animation never moves its root. */
export interface CreatureState {
  gait: 'graze' | 'walk' | 'trot' | 'gallop' | 'rest' | 'flap' | 'glide';
  phase: number;
  flying: boolean;
  leadPosition?: Vector3|undefined;
  leadYaw?: number|undefined;
  leadVerticalSpeed?: number|undefined;
  /** 马的重力速度；不包含贴坡、台阶与去穿透产生的位置修正。 */
  mountFallSpeed?: number|undefined;
}
