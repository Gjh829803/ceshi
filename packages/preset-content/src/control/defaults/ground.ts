import { humanoid } from '@worldkit/three';

/** Static handling baselines for wheeled, tracked and ground vehicles. */
export const GROUND_CONTROL_DEFAULTS = {
  atv: {
    ...humanoid.defaultMovementSettings('wheeled', { speed: 110 / 3.6, accel: 7.5, grip: 8, steer: .42 }),
    maxSpeed: 125 / 3.6, reverseSpeed: 6, coastDeceleration: 1.25, brakeDeceleration: 6,
    steeringResponse: 7, steeringReturn: 9, throttleResponse: 5, pitchResponse: 8, rollResponse: 7,
  },
  unicycle: {
    ...humanoid.defaultMovementSettings('unicycle', { speed: 4.2, accel: 2.2, grip: 12, steer: 1.3 }),
    maxSpeed: 5.5, reverseSpeed: 1.8, coastDeceleration: 2.8, brakeDeceleration: 4.5,
    steeringResponse: 5, steeringReturn: 7, throttleResponse: 5, pitchResponse: 8, rollResponse: 7,
  },
  ski: {
    ...humanoid.defaultMovementSettings('ski', { speed: 24, accel: 5, grip: 4.5, steer: 1.1 }),
    groundSpeed: 3, coastDeceleration: .18, brakeDeceleration: 7, dragQuadratic: .004,
    steeringResponse: 3.5, steeringReturn: 5, pitchResponse: 12, rollResponse: 10,
  },
  sled: humanoid.defaultMovementSettings('sled', { speed: 24, accel: 4, grip: 2.2, steer: .9 }),
  tank: {
    ...humanoid.defaultMovementSettings('tank', { speed: 12, accel: 3, grip: 10, steer: .75 }),
    maxSpeed: 18, reverseSpeed: 4, coastDeceleration: 1.4, brakeDeceleration: 7,
    steeringResponse: 3, steeringReturn: 5, throttleResponse: 2, pitchResponse: 5, rollResponse: 5,
  },
  bus: {
    ...humanoid.defaultMovementSettings('bus', { speed: 22, accel: 2.1, grip: 12, steer: .52 }),
    maxSpeed: 22, reverseSpeed: 2.5, coastDeceleration: .55, brakeDeceleration: 3.8, brakeDamping: 3.8,
    steeringResponse: 2.5, steeringReturn: 3.2, throttleResponse: 1.6, pitchResponse: 3, rollResponse: 2.5,
  },
  rover: {
    ...humanoid.defaultMovementSettings('wheeled', { speed: 160 / 3.6, accel: 10, grip: 11, steer: 1 }),
    maxSpeed: 200 / 3.6, reverseSpeed: 28 * .3,
  },
  racer: {
    ...humanoid.defaultMovementSettings('wheeled', { speed: 180 / 3.6, accel: 12, grip: 14, steer: 1.08 }),
    maxSpeed: 220 / 3.6, reverseSpeed: 36 * .3,
  },
  'trail-rover': {
    ...humanoid.defaultMovementSettings('wheeled', { speed: 160 / 3.6, accel: 8, grip: 12, steer: .95 }),
    maxSpeed: 200 / 3.6, reverseSpeed: 24 * .3,
  },
  supercar: {
    ...humanoid.defaultMovementSettings('wheeled', { speed: 65, accel: 17, grip: 18, steer: .88 }),
    maxSpeed: 65 * 1.15, reverseSpeed: 65 * .3,
  },
  kart: {
    ...humanoid.defaultMovementSettings('wheeled', { speed: 24, accel: 10, grip: 19, steer: 1.65 }),
    maxSpeed: 24 * 1.15, reverseSpeed: 24 * .3,
  },
  motorcycle: {
    ...humanoid.defaultMovementSettings('motorcycle', { speed: 150 / 3.6, accel: 12, grip: 13, steer: 1.12 }),
    maxSpeed: 180 / 3.6, reverseSpeed: 2,
  },
  'touring-motorcycle': {
    ...humanoid.defaultMovementSettings('motorcycle', { speed: 150 / 3.6, accel: 9, grip: 14, steer: 1.05 }),
    maxSpeed: 180 / 3.6, reverseSpeed: 2,
  },
  skateboard: humanoid.defaultMovementSettings('skateboard', { speed: 22, accel: 8, grip: 2.8, steer: 1.65 }),
  hovercraft: humanoid.defaultMovementSettings('hover', { speed: 28, accel: 11, grip: 4.8, steer: 1.5 }),
  'rescue-hovercraft': humanoid.defaultMovementSettings('hover', { speed: 24, accel: 9, grip: 6, steer: 1.3 }),
} satisfies Record<string, humanoid.MovementSettings>;
