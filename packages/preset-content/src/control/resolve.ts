import { humanoid } from '@worldkit/three';
import { parseControlProfile, type ControlProfile } from './profiles';

export type ControlProfileSource = 'shared-asset' | 'project-asset' | 'project-instance' | 'debug-asset' | 'debug-instance';
export interface ControlProfileLayers {
  shared: ControlProfile;
  projectAsset?: ControlProfile | undefined;
  projectInstance?: ControlProfile | undefined;
  debugAsset?: ControlProfile | undefined;
  debugInstance?: ControlProfile | undefined;
}
export interface ResolvedControlProfile {
  profile: ControlProfile;
  sources: Readonly<Record<string, ControlProfileSource>>;
}

function applyLayer(target: ControlProfile, sources: Record<string, ControlProfileSource>, layer: ControlProfile | undefined, source: ControlProfileSource) {
  if (!layer) return;
  if (layer.assetId !== target.assetId) throw new Error('control profile layer asset mismatch');
  if (layer.profileId !== target.profileId) throw new Error('control profile layer mismatch');
  Object.assign(target.control, layer.control);
  for (const key of humanoid.controlKeys) sources[`control.${key}`] = source;
  if (layer.aircraftFlight) {
    target.aircraftFlight = { ...target.aircraftFlight, ...layer.aircraftFlight };
    for (const key of Object.keys(layer.aircraftFlight)) sources[`aircraftFlight.${key}`] = source;
  }
}

/** Resolve only static control configuration. Live speed, throttle and flight state stay in the runtime. */
export function resolveControlProfile(layers: ControlProfileLayers): ResolvedControlProfile {
  const shared = parseControlProfile(layers.shared);
  if (shared.instanceId !== undefined) throw new Error('shared control profile cannot target an instance');
  const profile = structuredClone(shared);
  const sources: Record<string, ControlProfileSource> = {};
  for (const key of humanoid.controlKeys) sources[`control.${key}`] = 'shared-asset';
  for (const key of Object.keys(profile.aircraftFlight ?? {})) sources[`aircraftFlight.${key}`] = 'shared-asset';
  applyLayer(profile, sources, layers.projectAsset, 'project-asset');
  applyLayer(profile, sources, layers.projectInstance, 'project-instance');
  applyLayer(profile, sources, layers.debugAsset, 'debug-asset');
  applyLayer(profile, sources, layers.debugInstance, 'debug-instance');
  const instance = layers.debugInstance ?? layers.projectInstance;
  if (instance?.instanceId !== undefined) profile.instanceId = instance.instanceId;
  return { profile: parseControlProfile(profile), sources: Object.freeze(sources) };
}
