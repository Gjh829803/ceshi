import { humanoid } from '@worldkit/three';

/** Static handling baselines for watercraft. */
export const WATER_CONTROL_DEFAULTS = {
  boat: humanoid.defaultMovementSettings('boat', { speed: 24, accel: 7, grip: 3, steer: 1.05 }),
  'patrol-boat': humanoid.defaultMovementSettings('boat', { speed: 21, accel: 7.5, grip: 3.8, steer: 1.15 }),
  jetski: {
    ...humanoid.defaultMovementSettings('boat', { speed: 23, accel: 6.5, grip: 4, steer: 1.15 }),
    maxSpeed: 29, reverseSpeed: 5, coastDeceleration: .65, brakeDeceleration: 8,
    steeringResponse: 7, steeringReturn: 9, throttleResponse: 5, pitchResponse: 6, rollResponse: 6,
  },
  canoe: {
    ...humanoid.defaultMovementSettings('paddled_boat', { speed: 3.1, accel: 1.9, grip: 1.2, steer: 1.7 }),
    maxSpeed: 3.1, reverseSpeed: 1.2, coastDeceleration: .11, dragQuadratic: .11,
    brakeDamping: 1.8, steeringResponse: 2.8, steeringReturn: 3, pitchResponse: 3, rollResponse: 2.5,
  },
  kayak: {
    ...humanoid.defaultMovementSettings('paddled_boat', { speed: 4.6, accel: 2.7, grip: 1.8, steer: 3 }),
    maxSpeed: 4.6, reverseSpeed: 1.8, coastDeceleration: .16, dragQuadratic: .08,
    brakeDamping: 2.1, steeringResponse: 5, steeringReturn: 5, pitchResponse: 4, rollResponse: 4,
  },
  raft: {
    ...humanoid.defaultMovementSettings('paddled_boat', { speed: 25 / 3.6, accel: 7.5, grip: 1.4, steer: 1.8 }),
    maxSpeed: 25 / 3.6, reverseSpeed: 2, coastDeceleration: .08, dragQuadratic: .045,
    brakeDamping: 7, brakeDeceleration: 5, steeringResponse: 3.5, steeringReturn: 4, pitchResponse: 6, rollResponse: 6,
  },
  submarine: humanoid.defaultMovementSettings('submarine', { speed: 16, accel: 6.5, grip: 2.4, steer: 1.15 }),
  'observation-submarine': {
    ...humanoid.defaultMovementSettings('submarine', { speed: 5, accel: 2.1, grip: 1.4, steer: .75 }),
    maxSpeed: 5, reverseSpeed: 2.2, drag: .18, dragQuadratic: .08, linearDamping: .5,
    verticalAcceleration: 4.5, verticalDamping: 2.6, brakeDamping: 2.8, throttleResponse: 2.5,
    steeringResponse: 2.5, steeringReturn: 3, pitchResponse: 3, rollResponse: 3,
  },
} satisfies Record<string, humanoid.MovementSettings>;
