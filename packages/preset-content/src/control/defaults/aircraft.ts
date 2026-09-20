import { humanoid } from '@worldkit/three';

/** Static handling baselines for aircraft and spacecraft. */
export const AIRCRAFT_CONTROL_DEFAULTS = {
  plane: humanoid.defaultMovementSettings('plane', { speed: 58, accel: 12, grip: 1, steer: 1.05 }),
  'trainer-plane': humanoid.defaultMovementSettings('plane', { speed: 46, accel: 10, grip: 1.4, steer: .9 }),
  'pusher-plane': humanoid.defaultMovementSettings('plane', { speed: 58, accel: 12, grip: 1, steer: 1.05 }),
  helicopter: humanoid.defaultMovementSettings('plane', { speed: 58, accel: 12, grip: 1, steer: 1.05 }),
  multirotor: humanoid.defaultMovementSettings('plane', { speed: 58, accel: 12, grip: 1, steer: 1.05 }),
  tiltrotor: humanoid.defaultMovementSettings('plane', { speed: 58, accel: 12, grip: 1, steer: 1.05 }),
  glider: humanoid.defaultMovementSettings('plane', { speed: 58, accel: 12, grip: 1, steer: 1.05 }),
  paraglider: humanoid.defaultMovementSettings('plane', { speed: 58, accel: 12, grip: 1, steer: 1.05 }),
  wingsuit: humanoid.defaultMovementSettings('plane', { speed: 58, accel: 12, grip: 1, steer: 1.05 }),
  balloon: humanoid.defaultMovementSettings('plane', { speed: 58, accel: 12, grip: 1, steer: 1.05 }),
  spacecraft: humanoid.defaultMovementSettings('spacecraft', { speed: 36, accel: 14, grip: 2.4, steer: 1.45 }),
  'survey-spacecraft': humanoid.defaultMovementSettings('spacecraft', { speed: 28, accel: 7, grip: 2, steer: 1 }),
} satisfies Record<string, humanoid.MovementSettings>;

export const AIRCRAFT_FLIGHT_DEFAULTS = {
  plane: humanoid.DEFAULT_AIRCRAFT_FLIGHT,
  'trainer-plane': humanoid.DEFAULT_AIRCRAFT_FLIGHT,
  'pusher-plane': humanoid.DEFAULT_AIRCRAFT_FLIGHT,
  helicopter: humanoid.DEFAULT_AIRCRAFT_FLIGHT,
  multirotor: humanoid.DEFAULT_AIRCRAFT_FLIGHT,
  tiltrotor: humanoid.DEFAULT_AIRCRAFT_FLIGHT,
} satisfies Record<string, humanoid.AircraftFlightTuning>;
