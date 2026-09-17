import type { AssetProfile } from "@worldkit/preset-content/platform/profiles";

export interface ProfileTarget {
  assetId: string;
  instanceId?: string;
}

/** Asset defaults and instance overrides must never share an in-memory key. */
export function profileScopeKey({ assetId, instanceId }: ProfileTarget): string {
  return instanceId !== undefined ? `${assetId}\u0000${instanceId}` : assetId;
}

export function profileForTarget(
  profiles: ReadonlyMap<string, AssetProfile>,
  target: ProfileTarget,
): AssetProfile | undefined {
  return profiles.get(profileScopeKey(target)) ?? profiles.get(target.assetId);
}

export function scopeProfile(profile: AssetProfile, target: ProfileTarget): AssetProfile {
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
  defaults: Iterable<AssetProfile>,
  projectProfiles: Iterable<AssetProfile>,
): Map<string, AssetProfile> {
  const restored = new Map<string, AssetProfile>();
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
