import { humanoid } from '@worldkit/three';

/** Static handling baselines for controllable creatures and animal-drawn vehicles. */
export const CREATURE_CONTROL_DEFAULTS = {
  horse: humanoid.defaultMovementSettings('mount', { speed: 12, accel: 5, grip: 9, steer: 1.6 }),
  carriage: humanoid.defaultMovementSettings('carriage', { speed: 9, accel: 3.5, grip: 8, steer: 1.15 }),
  dragon: humanoid.defaultMovementSettings('dragon', { speed: 28, accel: 10, grip: 3, steer: 1.25 }),
} satisfies Record<string, humanoid.MovementSettings>;
