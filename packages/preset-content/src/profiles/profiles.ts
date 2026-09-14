import { SPECS, type CollisionEnvelope } from '../config';
import { humanoid } from '@worldkit/three';

export const PROFILE_VERSION = 2 as const;
export type ControlTuning = humanoid.MovementSettings;
export type ProfileEnvelope = CollisionEnvelope | { kind: 'capsule'; radius: number; halfHeight: number; offset: [number, number, number] };
export interface AssetProfile { version: typeof PROFILE_VERSION; assetId: string; control: ControlTuning; envelope: ProfileEnvelope }
export interface ProfileStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

const person: AssetProfile = {
  version: PROFILE_VERSION,
  assetId: 'person',
  control: humanoid.defaultMovementSettings('character',humanoid.DEFAULT_CHARACTER_CONTROL_BASE),
  envelope: { kind: 'capsule', radius: .28, halfHeight: .56, offset: [0, .84, 0] },
};

const records: Record<string, AssetProfile> = { person };
for (const spec of SPECS) records[spec.id] = {
  version: PROFILE_VERSION,
  assetId: spec.id,
  control: humanoid.parseMovementSettings(
    Object.fromEntries(humanoid.controlKeys.filter(key=>Object.hasOwn(spec,key)).map(key=>[key,spec[key]])),
    humanoid.defaultMovementSettings(spec.mode,spec),
  ),
  envelope: structuredClone(spec.envelope),
};

function deepFreeze(profile: AssetProfile): Readonly<AssetProfile> {
  Object.freeze(profile.control); Object.freeze(profile.envelope.offset);
  if (profile.envelope.kind === 'box') Object.freeze(profile.envelope.halfExtents);
  Object.freeze(profile.envelope); return Object.freeze(profile);
}
for (const profile of Object.values(records)) deepFreeze(profile);
export const DEFAULT_PROFILES: Readonly<Record<string, Readonly<AssetProfile>>> = Object.freeze(records);

const clone = (profile: Readonly<AssetProfile>): AssetProfile => structuredClone(profile) as AssetProfile;
export function getDefaultProfile(assetId: string): AssetProfile | undefined {
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

export function parseAssetProfile(input: unknown, expectedAssetId?: string): AssetProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('profile must be an object');
  const value = input as Record<string, unknown>;
  if (value.version !== PROFILE_VERSION) throw new Error('unsupported profile version');
  if(Object.keys(value).some(key=>!['version','assetId','control','envelope'].includes(key)))throw new Error('unknown profile field');
  if (typeof value.assetId !== 'string' || !DEFAULT_PROFILES[value.assetId]) throw new Error('unknown assetId');
  if (expectedAssetId && value.assetId !== expectedAssetId) throw new Error('profile assetId mismatch');
  if (!value.control || typeof value.control !== 'object' || Array.isArray(value.control)) throw new Error('control must be an object');
  const control = value.control as Record<string, unknown>;
  if(Object.keys(humanoid.CONTROL_RANGES).some(key=>!Object.hasOwn(control,key)))throw new Error('complete control profile required');
  if (!value.envelope || typeof value.envelope !== 'object' || Array.isArray(value.envelope)) throw new Error('envelope must be an object');
  const envelope = value.envelope as Record<string, unknown>, offset = vector(envelope.offset, 'envelope.offset', -20, 20);
  let parsedEnvelope: ProfileEnvelope;
  // 大型飞行生物的动画翼展包络可超过 40 米；保持实际体积，不压缩模型尺寸。
  if (envelope.kind === 'box') parsedEnvelope = { kind: 'box', halfExtents: vector(envelope.halfExtents, 'envelope.halfExtents', .01, 50), offset };
  else if (envelope.kind === 'capsule') parsedEnvelope = { kind: 'capsule', radius: finite(envelope.radius, 'envelope.radius', .05, 5), halfHeight: finite(envelope.halfHeight, 'envelope.halfHeight', .05, 10), offset };
  else throw new Error('unknown envelope kind');
  return {
    version: PROFILE_VERSION,
    assetId: value.assetId,
    control: humanoid.parseMovementSettings(control,humanoid.defaultMovementSettings(value.assetId==='person'?'character':SPECS.find(s=>s.id===value.assetId)!.mode,{speed:finite(control.speed,'control.speed',0,200),accel:finite(control.accel,'control.accel',0,100),grip:finite(control.grip,'control.grip',0,100),steer:finite(control.steer,'control.steer',0,30)})),
    envelope: parsedEnvelope,
  };
}

// Browser storage is a developer convenience. Saved values use the current complete form.
const storageKey = (assetId: string) => `worldkit.asset-profile.v2.${assetId}`;
export function loadAssetProfile(storage: ProfileStorage, assetId: string): AssetProfile | undefined {
  if(!DEFAULT_PROFILES[assetId])throw new Error(`unknown assetId: ${assetId}`);
  const saved=storage.getItem(storageKey(assetId));
  if(saved===null)return undefined;
  try{return parseAssetProfile(JSON.parse(saved),assetId);}
  catch{return undefined;}
}
export function saveAssetProfile(storage: ProfileStorage, profile: unknown): AssetProfile {
  const parsed = parseAssetProfile(profile);
  storage.setItem(storageKey(parsed.assetId), JSON.stringify(parsed));
  return clone(parsed);
}
export function clearAssetProfile(storage: ProfileStorage, assetId: string) {
  if (!DEFAULT_PROFILES[assetId]) throw new Error(`unknown assetId: ${assetId}`);
  storage.removeItem(storageKey(assetId));
}
