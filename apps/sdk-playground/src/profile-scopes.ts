import type { AssetProfile } from "@worldkit/preset-content/platform/profiles";

export interface ProfileTarget {
  assetId: string;
  instanceId?: string;
}

/** Asset defaults and instance overrides must never share an in-memory key. */
export function profileScopeKey({ assetId, instanceId }: ProfileTarget): string {
  return instanceId && instanceId !== assetId ? `${assetId}\u0000${instanceId}` : assetId;
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
    ...(target.instanceId && target.instanceId !== target.assetId ? { instanceId: target.instanceId } : {}),
  };
}
