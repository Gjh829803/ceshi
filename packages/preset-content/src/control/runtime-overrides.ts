import { humanoid } from '@worldkit/three';
import type { ResolvedControlProfile } from './resolve';

export type RuntimeControlOverrideSource = 'runtime-override';
export interface RuntimeControlOverride {
  id: string;
  reason: string;
  assetId: string;
  instanceId?: string;
  control?: Partial<humanoid.MovementSettings>;
  aircraftFlight?: Partial<humanoid.AircraftFlightTuning>;
}

const flightKeys = ['pitchGain', 'rollGain', 'pitchRateDamping', 'rollRateDamping', 'yawRateDamping'] as const;
const isName = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Validate a transient limit; no speed, throttle, pose or other simulation state is accepted. */
export function parseRuntimeControlOverride(value: unknown): RuntimeControlOverride {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('runtime control override must be an object');
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some(key => !['id', 'reason', 'assetId', 'instanceId', 'control', 'aircraftFlight'].includes(key))) throw new Error('unknown runtime control override field');
  if (!isName(source.id) || !isName(source.reason) || !isName(source.assetId)) throw new Error('runtime control override identity required');
  if (source.instanceId !== undefined && !isName(source.instanceId)) throw new Error('invalid runtime control override instance');
  const control: Partial<humanoid.MovementSettings> = {};
  if (source.control !== undefined) {
    if (!source.control || typeof source.control !== 'object' || Array.isArray(source.control)) throw new Error('runtime control override control must be an object');
    for (const [key, value] of Object.entries(source.control as Record<string, unknown>)) {
      if (!humanoid.controlKeys.includes(key as humanoid.ControlKey)) throw new Error(`unknown runtime control key: ${key}`);
      const [minimum, maximum] = humanoid.CONTROL_RANGES[key as humanoid.ControlKey];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`invalid runtime control value: ${key}`);
      control[key as humanoid.ControlKey] = value;
    }
  }
  const aircraftFlight: Partial<humanoid.AircraftFlightTuning> = {};
  if (source.aircraftFlight !== undefined) {
    if (!source.aircraftFlight || typeof source.aircraftFlight !== 'object' || Array.isArray(source.aircraftFlight)) throw new Error('runtime aircraft override must be an object');
    for (const [key, value] of Object.entries(source.aircraftFlight as Record<string, unknown>)) {
      if (!flightKeys.includes(key as typeof flightKeys[number]) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error(`invalid runtime aircraft value: ${key}`);
      aircraftFlight[key as keyof humanoid.AircraftFlightTuning] = value;
    }
  }
  if (!Object.keys(control).length && !Object.keys(aircraftFlight).length) throw new Error('runtime control override requires values');
  return { id: source.id.trim(), reason: source.reason.trim(), assetId: source.assetId.trim(), ...(source.instanceId === undefined ? {} : { instanceId: source.instanceId.trim() }), ...(Object.keys(control).length ? { control } : {}), ...(Object.keys(aircraftFlight).length ? { aircraftFlight } : {}) };
}

/** Apply matching overrides after shared/project/debug resolution and retain their field provenance. */
export function applyRuntimeControlOverrides(resolved: ResolvedControlProfile, overrides: readonly RuntimeControlOverride[]): ResolvedControlProfile {
  const profile = structuredClone(resolved.profile);
  const sources = { ...resolved.sources } as Record<string, ResolvedControlProfile['sources'][string] | RuntimeControlOverrideSource>;
  for (const overrideInput of overrides) {
    const override = parseRuntimeControlOverride(overrideInput);
    if (override.assetId !== profile.assetId || (override.instanceId !== undefined && override.instanceId !== profile.instanceId)) continue;
    Object.assign(profile.control, override.control);
    for (const key of Object.keys(override.control ?? {})) sources[`control.${key}`] = 'runtime-override';
    if (override.aircraftFlight) {
      profile.aircraftFlight = { ...profile.aircraftFlight, ...override.aircraftFlight } as humanoid.AircraftFlightTuning;
      for (const key of Object.keys(override.aircraftFlight)) sources[`aircraftFlight.${key}`] = 'runtime-override';
    }
  }
  return { profile, sources: Object.freeze(sources) as ResolvedControlProfile['sources'] };
}

/** Owner-managed transient overrides. Clear these on target switch, reset and disposal. */
export class RuntimeControlOverrideStore {
  private readonly records = new Map<string, RuntimeControlOverride>();
  set(value: RuntimeControlOverride): void { const parsed = parseRuntimeControlOverride(value); this.records.set(parsed.id, parsed); }
  remove(id: string): void { this.records.delete(id); }
  clearTarget(assetId: string, instanceId?: string): void {
    for (const [id, value] of this.records) if (value.assetId === assetId && (instanceId === undefined || value.instanceId === instanceId)) this.records.delete(id);
  }
  clear(): void { this.records.clear(); }
  values(): readonly RuntimeControlOverride[] { return [...this.records.values()].map(value => structuredClone(value)); }
  apply(resolved: ResolvedControlProfile): ResolvedControlProfile { return applyRuntimeControlOverrides(resolved, this.values()); }
}
