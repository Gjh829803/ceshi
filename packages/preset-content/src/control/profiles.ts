import { humanoid } from '@worldkit/three';
import { SPECS } from '../config';

/** Control profiles are deliberately separate from collision envelopes and other asset facts. */
export const CONTROL_PROFILE_VERSION = 3 as const;
export type ControlTuning = humanoid.MovementSettings;
export interface ControlProfile {
  version: typeof CONTROL_PROFILE_VERSION;
  /** Stable content identity referenced by VehicleSpec.controlProfileId. */
  profileId: string;
  assetId: string;
  /** Optional live-scene target; omitted means the profile applies to every instance of the asset. */
  instanceId?: string;
  control: ControlTuning;
  aircraftFlight?: humanoid.AircraftFlightTuning;
}
/** @deprecated Use ControlProfile. Kept for the existing public import path. */
export type AssetProfile = ControlProfile;
export interface ProfileStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

const person: ControlProfile = {
  version: CONTROL_PROFILE_VERSION,
  profileId: 'preset.person',
  assetId: 'person',
  control: humanoid.defaultMovementSettings('character', humanoid.DEFAULT_CHARACTER_CONTROL_BASE),
};

const records: Record<string, ControlProfile> = { person };
for (const spec of SPECS) {
  const resolved = humanoid.createVehicle(spec).spec;
  records[spec.id] = {
    version: CONTROL_PROFILE_VERSION,
    profileId: spec.controlProfileId!,
    assetId: spec.id,
    control: humanoid.readMovementSettings(resolved),
    ...(resolved.aircraftFlight ? { aircraftFlight: structuredClone(resolved.aircraftFlight) } : {}),
  };
}

function deepFreeze(profile: ControlProfile): Readonly<ControlProfile> {
  Object.freeze(profile.control);
  if (profile.aircraftFlight) Object.freeze(profile.aircraftFlight);
  return Object.freeze(profile);
}
for (const profile of Object.values(records)) deepFreeze(profile);
export const DEFAULT_CONTROL_PROFILES: Readonly<Record<string, Readonly<ControlProfile>>> = Object.freeze(records);
/** @deprecated Use DEFAULT_CONTROL_PROFILES. */
export const DEFAULT_PROFILES = DEFAULT_CONTROL_PROFILES;

const clone = (profile: Readonly<ControlProfile>): ControlProfile => structuredClone(profile) as ControlProfile;
export function getDefaultControlProfile(assetId: string): ControlProfile | undefined {
  const profile = DEFAULT_CONTROL_PROFILES[assetId];
  return profile ? clone(profile) : undefined;
}
/** @deprecated Use getDefaultControlProfile. */
export const getDefaultProfile = getDefaultControlProfile;

const finite = (value: unknown, name: string, min: number, max: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
};
const parseAircraftFlight = (value: unknown): humanoid.AircraftFlightTuning => {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('aircraftFlight must be an object');
  const source=value as Record<string,unknown>,keys=['pitchGain','rollGain','pitchRateDamping','rollRateDamping','yawRateDamping'] as const;
  if(Object.keys(source).some(key=>!keys.includes(key as typeof keys[number]))||keys.some(key=>!Object.hasOwn(source,key)))throw new Error('complete aircraftFlight profile required');
  return {pitchGain:finite(source.pitchGain,'aircraftFlight.pitchGain',0,100),rollGain:finite(source.rollGain,'aircraftFlight.rollGain',0,100),pitchRateDamping:finite(source.pitchRateDamping,'aircraftFlight.pitchRateDamping',0,100),rollRateDamping:finite(source.rollRateDamping,'aircraftFlight.rollRateDamping',0,100),yawRateDamping:finite(source.yawRateDamping,'aircraftFlight.yawRateDamping',0,100)};
};

export function parseControlProfile(input: unknown, expectedAssetId?: string): ControlProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('control profile must be an object');
  const value = input as Record<string, unknown>;
  if (value.version !== CONTROL_PROFILE_VERSION) throw new Error('unsupported control profile version');
  if(Object.keys(value).some(key=>!['version','profileId','assetId','instanceId','control','aircraftFlight'].includes(key)))throw new Error('unknown control profile field');
  if (typeof value.assetId !== 'string' || !DEFAULT_CONTROL_PROFILES[value.assetId]) throw new Error('unknown assetId');
  if (expectedAssetId && value.assetId !== expectedAssetId) throw new Error('profile assetId mismatch');
  const profileId=value.profileId===undefined?DEFAULT_CONTROL_PROFILES[value.assetId]!.profileId:value.profileId;
  if(typeof profileId!=='string'||!profileId.trim())throw new Error('invalid profileId');
  if(value.instanceId!==undefined&&(
    value.assetId==='person'||typeof value.instanceId!=='string'||!value.instanceId.trim()))throw new Error('invalid profile instanceId');
  if (!value.control || typeof value.control !== 'object' || Array.isArray(value.control)) throw new Error('control must be an object');
  const control = value.control as Record<string, unknown>;
  if(Object.keys(humanoid.CONTROL_RANGES).some(key=>!Object.hasOwn(control,key)))throw new Error('complete control profile required');
  const spec=SPECS.find(s=>s.id===value.assetId);
  const aircraftFlight=value.aircraftFlight===undefined?undefined:parseAircraftFlight(value.aircraftFlight);
  if(aircraftFlight&&(!spec?.mode||spec.mode!=='plane'||['glider','paraglider','wingsuit','balloon'].includes(spec.aircraftSubtype??'')))throw new Error('aircraftFlight unsupported for asset');
  return {
    version: CONTROL_PROFILE_VERSION,
    profileId,
    assetId: value.assetId,
    ...(value.instanceId!==undefined?{instanceId:value.instanceId}:{}),
    control: humanoid.parseMovementSettings(control, DEFAULT_CONTROL_PROFILES[value.assetId]!.control),
    ...(aircraftFlight?{aircraftFlight}:{}),
  };
}
/** @deprecated Use parseControlProfile. */
export const parseAssetProfile = parseControlProfile;

// Browser storage is a developer convenience. It is never read unless the host explicitly enables debug profiles.
const storageKey = (assetId: string, instanceId?: string) => instanceId!==undefined
  ? `worldkit.control-profile.v3.${encodeURIComponent(assetId)}.${encodeURIComponent(instanceId)}`
  : `worldkit.control-profile.v3.${assetId}`;
export function loadDebugControlProfile(storage: ProfileStorage, assetId: string, instanceId?: string): ControlProfile | undefined {
  if(!DEFAULT_CONTROL_PROFILES[assetId])throw new Error(`unknown assetId: ${assetId}`);
  if(instanceId!==undefined&&(!instanceId.trim()||assetId==='person'))throw new Error(`invalid profile instanceId: ${instanceId}`);
  const saved=storage.getItem(storageKey(assetId,instanceId));
  if(saved===null)return undefined;
  try{
    const parsed=parseControlProfile(JSON.parse(saved),assetId);
    return parsed.instanceId===instanceId?parsed:undefined;
  }
  catch{return undefined;}
}
export function saveDebugControlProfile(storage: ProfileStorage, profile: unknown): ControlProfile {
  const parsed = parseControlProfile(profile);
  storage.setItem(storageKey(parsed.assetId,parsed.instanceId), JSON.stringify(parsed));
  return clone(parsed);
}
export function clearDebugControlProfile(storage: ProfileStorage, assetId: string, instanceId?: string) {
  if (!DEFAULT_CONTROL_PROFILES[assetId]) throw new Error(`unknown assetId: ${assetId}`);
  storage.removeItem(storageKey(assetId,instanceId));
}
/** @deprecated Use loadDebugControlProfile. */
export const loadAssetProfile = loadDebugControlProfile;
/** @deprecated Use saveDebugControlProfile. */
export const saveAssetProfile = saveDebugControlProfile;
/** @deprecated Use clearDebugControlProfile. */
export const clearAssetProfile = clearDebugControlProfile;
