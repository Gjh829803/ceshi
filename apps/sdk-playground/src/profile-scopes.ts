import type { ControlProfile } from "@worldkit/preset-content/platform/profiles";
import {
  resolveControlProfile,
  type ControlProfileLayers,
  type ResolvedControlProfile,
} from "@worldkit/preset-content/platform/control-resolution";
import {
  applyRuntimeControlOverrides,
  type RuntimeControlOverride,
} from "@worldkit/preset-content/platform/runtime-control-overrides";

export interface ProfileTarget {
  assetId: string;
  instanceId?: string;
}

/**
 * Keep the profile that editors save separate from the profile a running world
 * executes. Runtime overrides are diagnostic/transient inputs only and must
 * never become part of a project profile or profiles.json export.
 */
export function resolveProfileViews(
  layers: ControlProfileLayers,
  runtimeOverrides: readonly RuntimeControlOverride[],
): { editable: ResolvedControlProfile; effective: ResolvedControlProfile } {
  const editable = resolveControlProfile(layers);
  return { editable, effective: applyRuntimeControlOverrides(editable, runtimeOverrides) };
}

/** Asset defaults and instance overrides must never share an in-memory key. */
export function profileScopeKey({ assetId, instanceId }: ProfileTarget): string {
  return instanceId !== undefined ? `${assetId}\u0000${instanceId}` : assetId;
}

export function profileForTarget(
  profiles: ReadonlyMap<string, ControlProfile>,
  target: ProfileTarget,
): ControlProfile | undefined {
  return profiles.get(profileScopeKey(target)) ?? profiles.get(target.assetId);
}

export function scopeProfile(profile: ControlProfile, target: ProfileTarget): ControlProfile {
  if (profile.assetId !== target.assetId) throw new Error("profile target asset mismatch");
  const unscoped = { ...profile };
  delete unscoped.instanceId;
  return {
    ...unscoped,
    ...(target.instanceId !== undefined ? { instanceId: target.instanceId } : {}),
  };
}

/**
 * Rehydrate all entries from a delivered profiles.json. Asset defaults are applied
 * first, then every instance override gets its own scope, regardless of file order.
 */
export function restoreProjectProfiles(
  defaults: Iterable<ControlProfile>,
  projectProfiles: Iterable<ControlProfile>,
): Map<string, ControlProfile> {
  const restored = new Map<string, ControlProfile>();
  for (const profile of defaults) restored.set(profileScopeKey(profile), profile);
  const imported = [...projectProfiles];
  for (const profile of imported) {
    if (profile.instanceId === undefined) restored.set(profileScopeKey(profile), profile);
  }
  for (const profile of imported) {
    if (profile.instanceId !== undefined) restored.set(profileScopeKey(profile), profile);
  }
  return restored;
}
