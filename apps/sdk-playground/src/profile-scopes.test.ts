import { expect, it } from "vitest";
import { getDefaultProfile } from "@worldkit/preset-content/platform/profiles";
import {
  profileForTarget,
  profileScopeKey,
  restoreProjectProfiles,
  scopeProfile,
} from "./profile-scopes";

it("keeps same-asset instance profiles separately addressable and exportable", () => {
  const asset = getDefaultProfile("plane")!;
  // The current preset has an instance whose ID is also "plane". It must still
  // remain separate from the asset default and from other plane instances.
  const first = scopeProfile({ ...asset, aircraftFlight: { ...asset.aircraftFlight!, pitchGain: 12 } }, { assetId: "plane", instanceId: "plane" });
  const second = scopeProfile({ ...asset, aircraftFlight: { ...asset.aircraftFlight!, pitchGain: 16 } }, { assetId: "plane", instanceId: "plane-02" });
  const profiles = new Map([
    [profileScopeKey({ assetId: "plane" }), asset],
    [profileScopeKey(first), first],
    [profileScopeKey(second), second],
  ]);

  expect(profileForTarget(profiles, { assetId: "plane", instanceId: "plane" })?.aircraftFlight?.pitchGain).toBe(12);
  expect(profileForTarget(profiles, { assetId: "plane", instanceId: "plane-02" })?.aircraftFlight?.pitchGain).toBe(16);
  expect(profileForTarget(profiles, { assetId: "plane", instanceId: "plane-03" })).toEqual(asset);
  const exported = [...profiles.values()];
  expect(exported.map(profile => profile.instanceId)).toEqual([undefined, "plane", "plane-02"]);

  const reloaded = restoreProjectProfiles([asset], exported);
  expect(profileForTarget(reloaded, { assetId: "plane", instanceId: "plane" })?.aircraftFlight?.pitchGain).toBe(12);
  expect(profileForTarget(reloaded, { assetId: "plane", instanceId: "plane-02" })?.aircraftFlight?.pitchGain).toBe(16);
  expect(profileForTarget(reloaded, { assetId: "plane", instanceId: "plane-03" })).toEqual(asset);
  expect([...reloaded.values()].map(profile => profile.instanceId)).toEqual([undefined, "plane", "plane-02"]);
});
