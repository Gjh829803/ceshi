import { expect, it } from "vitest";
import { getDefaultProfile } from "@worldkit/preset-content/platform/profiles";
import { profileForTarget, profileScopeKey, scopeProfile } from "./profile-scopes";

it("keeps same-asset instance profiles separately addressable and exportable", () => {
  const asset = getDefaultProfile("plane")!;
  const first = scopeProfile({ ...asset, aircraftFlight: { ...asset.aircraftFlight!, pitchGain: 12 } }, { assetId: "plane", instanceId: "plane-01" });
  const second = scopeProfile({ ...asset, aircraftFlight: { ...asset.aircraftFlight!, pitchGain: 16 } }, { assetId: "plane", instanceId: "plane-02" });
  const profiles = new Map([
    [profileScopeKey({ assetId: "plane" }), asset],
    [profileScopeKey(first), first],
    [profileScopeKey(second), second],
  ]);

  expect(profileForTarget(profiles, { assetId: "plane", instanceId: "plane-01" })?.aircraftFlight?.pitchGain).toBe(12);
  expect(profileForTarget(profiles, { assetId: "plane", instanceId: "plane-02" })?.aircraftFlight?.pitchGain).toBe(16);
  expect(profileForTarget(profiles, { assetId: "plane", instanceId: "plane-03" })).toEqual(asset);
  expect([...profiles.values()].map(profile => profile.instanceId)).toEqual([undefined, "plane-01", "plane-02"]);
});
