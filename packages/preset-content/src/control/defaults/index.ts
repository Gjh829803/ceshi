import { humanoid } from '@worldkit/three';

import { AIRCRAFT_CONTROL_DEFAULTS, AIRCRAFT_FLIGHT_DEFAULTS } from './aircraft';
import { CREATURE_CONTROL_DEFAULTS } from './creatures';
import { GROUND_CONTROL_DEFAULTS } from './ground';
import { WATER_CONTROL_DEFAULTS } from './water';

/**
 * Shared, asset-level handling baselines. These are static authoring values,
 * not throttle, speed or other state produced by a running controller.
 *
 * Keep geometry, seats, collision envelopes and body physics with the vehicle
 * specification. Project and instance changes are resolved by `../resolve`.
 */
const records = {
  ...GROUND_CONTROL_DEFAULTS,
  ...WATER_CONTROL_DEFAULTS,
  ...AIRCRAFT_CONTROL_DEFAULTS,
  ...CREATURE_CONTROL_DEFAULTS,
} satisfies Record<string, humanoid.MovementSettings>;

for (const tuning of Object.values(AIRCRAFT_FLIGHT_DEFAULTS)) Object.freeze(tuning);
export const SHARED_AIRCRAFT_FLIGHT_DEFAULTS: Readonly<Record<string, Readonly<humanoid.AircraftFlightTuning>>> = Object.freeze(AIRCRAFT_FLIGHT_DEFAULTS);

for (const settings of Object.values(records)) Object.freeze(settings);
export const SHARED_CONTROL_DEFAULTS: Readonly<Record<string, Readonly<humanoid.MovementSettings>>> = Object.freeze(records);

/** Return mutable data because vehicle setup may add unrelated spec fields. */
export function getSharedControlDefaults(assetId: string): humanoid.MovementSettings | undefined {
  const settings = SHARED_CONTROL_DEFAULTS[assetId];
  return settings ? structuredClone(settings) : undefined;
}

export function getSharedAircraftFlightDefaults(assetId: string): humanoid.AircraftFlightTuning | undefined {
  const tuning = SHARED_AIRCRAFT_FLIGHT_DEFAULTS[assetId];
  return tuning ? structuredClone(tuning) : undefined;
}
