import { SPECS, type CollisionEnvelope } from '../config';
import { training } from '@worldkit/three';
const { DEFAULT_CAMERA_TUNING }=training;
const { parseCameraTuning }=training;
type CameraTuning=training.CameraTuning;

export const PROFILE_VERSION = 1 as const;
export const DEFAULTS_REVISION = 3 as const;
export type ControlTuning = training.TrainingControl;
export interface ProfileCameraTuning extends CameraTuning { distance: number }
export type ProfileEnvelope = CollisionEnvelope | { kind: 'capsule'; radius: number; halfHeight: number; offset: [number, number, number] };
export interface AssetProfileV1 { version: typeof PROFILE_VERSION; defaultsRevision: 1 | 2 | 3; assetId: string; control: ControlTuning; camera: ProfileCameraTuning; envelope: ProfileEnvelope }
export interface ProfileStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

const person: AssetProfileV1 = {
  version: PROFILE_VERSION,
  defaultsRevision: DEFAULTS_REVISION,
  assetId: 'person',
  control: training.defaultTrainingControl('character',{ speed: 3.1, accel: 14, grip: 5, steer: 8 }),
  camera: { ...DEFAULT_CAMERA_TUNING, baseFovDegrees:58, followResponsePerSecond:7, collisionRadiusMeters:.2, distance:8.8 },
  envelope: { kind: 'capsule', radius: .28, halfHeight: .56, offset: [0, .84, 0] },
};

const records: Record<string, AssetProfileV1> = { person };
for (const spec of SPECS) records[spec.id] = {
  version: PROFILE_VERSION,
  defaultsRevision: DEFAULTS_REVISION,
  assetId: spec.id,
  control: training.defaultTrainingControl(spec.mode,spec),
  camera: { ...DEFAULT_CAMERA_TUNING, distance: spec.camera },
  envelope: structuredClone(spec.envelope),
};

function deepFreeze(profile: AssetProfileV1): Readonly<AssetProfileV1> {
  Object.freeze(profile.control); Object.freeze(profile.camera); Object.freeze(profile.envelope.offset);
  if (profile.envelope.kind === 'box') Object.freeze(profile.envelope.halfExtents);
  Object.freeze(profile.envelope); return Object.freeze(profile);
}
for (const profile of Object.values(records)) deepFreeze(profile);
export const DEFAULT_PROFILES: Readonly<Record<string, Readonly<AssetProfileV1>>> = Object.freeze(records);

const clone = (profile: Readonly<AssetProfileV1>): AssetProfileV1 => structuredClone(profile) as AssetProfileV1;
export function getDefaultProfile(assetId: string): AssetProfileV1 | undefined {
  const profile = DEFAULT_PROFILES[assetId];
  return profile ? clone(profile) : undefined;
}

const finite = (value: unknown, name: string, min: number, max: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
};
const vector = (value: unknown, name: string, min: number, max: number): [number, number, number] => {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${name} must have three values`);
  return [finite(value[0], `${name}[0]`, min, max), finite(value[1], `${name}[1]`, min, max), finite(value[2], `${name}[2]`, min, max)];
};

export function parseAssetProfile(input: unknown, expectedAssetId?: string): AssetProfileV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('profile must be an object');
  const value = input as Record<string, unknown>;
  if (value.version !== PROFILE_VERSION) throw new Error('unsupported profile version');
  const revision = value.defaultsRevision ?? 1;
  if (revision !== 1 && revision !== 2 && revision !== DEFAULTS_REVISION) throw new Error('unsupported defaults revision');
  if (typeof value.assetId !== 'string' || !DEFAULT_PROFILES[value.assetId]) throw new Error('unknown assetId');
  if (expectedAssetId && value.assetId !== expectedAssetId) throw new Error('profile assetId mismatch');
  if (!value.control || typeof value.control !== 'object' || Array.isArray(value.control)) throw new Error('control must be an object');
  const control = value.control as Record<string, unknown>;
  if (!value.camera || typeof value.camera !== 'object' || Array.isArray(value.camera)) throw new Error('camera must be an object');
  const camera = value.camera as Record<string, unknown>;
  const parsedCamera = parseCameraTuning(camera,DEFAULT_PROFILES[value.assetId]!.camera);
  if (!value.envelope || typeof value.envelope !== 'object' || Array.isArray(value.envelope)) throw new Error('envelope must be an object');
  const envelope = value.envelope as Record<string, unknown>, offset = vector(envelope.offset, 'envelope.offset', -20, 20);
  let parsedEnvelope: ProfileEnvelope;
  if (envelope.kind === 'box') parsedEnvelope = { kind: 'box', halfExtents: vector(envelope.halfExtents, 'envelope.halfExtents', .01, 20), offset };
  else if (envelope.kind === 'capsule') parsedEnvelope = { kind: 'capsule', radius: finite(envelope.radius, 'envelope.radius', .05, 5), halfHeight: finite(envelope.halfHeight, 'envelope.halfHeight', .05, 10), offset };
  else throw new Error('unknown envelope kind');
  return {
    version: PROFILE_VERSION,
    defaultsRevision: revision,
    assetId: value.assetId,
    control: training.parseTrainingControl(control,training.defaultTrainingControl(value.assetId==='person'?'character':SPECS.find(s=>s.id===value.assetId)!.mode,{speed:finite(control.speed,'control.speed',0,200),accel:finite(control.accel,'control.accel',0,100),grip:finite(control.grip,'control.grip',0,100),steer:finite(control.steer,'control.steer',0,30)})),
    camera: { ...parsedCamera, distance: finite(camera.distance, 'camera.distance', 1, 40) },
    envelope: parsedEnvelope,
  };
}

// The replacement character has a different rig and controller contract. Do
// not silently apply settings saved for the discarded 65-bone character.
const storageKey = (assetId: string) => `vehicle-training-ground.profile.${assetId==='person'?'source101.':''}v${PROFILE_VERSION}.${assetId}`;
// Version 1 saved complete forms, without tracking edited fields. Only values
// equal to the old factory baseline can safely inherit the new recommendations.
const previousFactory: Record<string, readonly [number, number, number, number]> = {
  rover: [31, 11, 9, .64], racer: [48, 15, 13, .52], bike: [38, 14, 12, .85],
  slide: [28, 10, 1.2, 1.8], hover: [33, 12, 3, 1.4], boat: [28, 6, 2, .8],
  sub: [17, 5, 2.2, 1.1], glider: [32, 0, 1, .9], plane: [65, 11, 1, .85],
  space: [45, 15, 0, 1.4], 'trail-rover': [25, 8.5, 11, .7],
  'touring-bike': [34, 10, 14, .7], 'rescue-hover': [27, 9, 4.5, 1.15],
  'patrol-boat': [23, 7.5, 2.8, .95], 'trainer-plane': [52, 8, 1.4, .7],
  'survey-space': [36, 10, .35, 1.05],
};
export function loadAssetProfile(storage: ProfileStorage, assetId: string): AssetProfileV1 | undefined {
  const fallback = getDefaultProfile(assetId);
  if (!fallback) throw new Error(`unknown assetId: ${assetId}`);
  try {
    const saved = storage.getItem(storageKey(assetId));
    if (saved === null) return undefined;
    const source = JSON.parse(saved) as Record<string, unknown>;
    let parsed = parseAssetProfile(source, assetId);
    if (parsed.defaultsRevision === 1) {
      const previous = previousFactory[assetId];
      const control = { ...(source.control as Record<string, unknown>) };
      (['speed', 'accel', 'grip', 'steer'] as const).forEach((key, index) => {
        if (previous && parsed.control[key] === previous[index]) control[key] = fallback.control[key];
      });
      parsed = parseAssetProfile({ ...source, defaultsRevision: DEFAULTS_REVISION, control }, assetId);
    }
    else if (parsed.defaultsRevision < DEFAULTS_REVISION) parsed.defaultsRevision = DEFAULTS_REVISION;
    return parsed;
  } catch { return undefined; }
}
export function saveAssetProfile(storage: ProfileStorage, profile: unknown): AssetProfileV1 {
  const parsed = parseAssetProfile(profile);
  storage.setItem(storageKey(parsed.assetId), JSON.stringify(parsed));
  return clone(parsed);
}
export function clearAssetProfile(storage: ProfileStorage, assetId: string) {
  if (!DEFAULT_PROFILES[assetId]) throw new Error(`unknown assetId: ${assetId}`);
  storage.removeItem(storageKey(assetId));
}
