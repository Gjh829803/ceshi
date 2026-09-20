import { expect, it } from "vitest";
import { getDefaultProfile } from "@worldkit/preset-content/platform/profiles";
import {
  profileForTarget,
  profileScopeKey,
  resolveProfileViews,
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

it("keeps runtime limits out of editable project profiles and later exports", () => {
  const shared = getDefaultProfile("plane")!;
  const project = {
    ...shared,
    control: { ...shared.control, grip: shared.control.grip + 1 },
  };
  const runtimeOverride = {
    id: "landing-limit",
    reason: "landing mode",
    assetId: "plane",
    control: { maxSpeed: 20 },
    aircraftFlight: { pitchGain: 4 },
  };
  const views = resolveProfileViews({ shared, projectAsset: project }, [runtimeOverride]);

  expect(views.editable.profile.control.maxSpeed).toBe(project.control.maxSpeed);
  expect(views.editable.profile.aircraftFlight?.pitchGain).toBe(project.aircraftFlight?.pitchGain);
  expect(views.effective.profile.control.maxSpeed).toBe(20);
  expect(views.effective.profile.aircraftFlight?.pitchGain).toBe(4);

  // This models changing an unrelated Inspector/Workbench field, then saving
  // the complete editable profile into projectProfiles / profiles.json.
  const persisted = {
    ...views.editable.profile,
    control: { ...views.editable.profile.control, grip: views.editable.profile.control.grip + 1 },
  };
  const afterClear = resolveProfileViews({ shared, projectAsset: persisted }, []);
  expect(afterClear.effective.profile.control.grip).toBe(persisted.control.grip);
  expect(afterClear.effective.profile.control.maxSpeed).toBe(project.control.maxSpeed);
  expect(afterClear.effective.profile.aircraftFlight?.pitchGain).toBe(project.aircraftFlight?.pitchGain);
});
