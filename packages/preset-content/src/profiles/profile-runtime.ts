import { humanoid } from '@worldkit/three';
type Runtime=humanoid.HumanoidRuntime;

import { parseAssetProfile, type AssetProfile } from './profiles';

export function applyControlProfile(runtime: Runtime, profile: AssetProfile) {
  const parsed = parseAssetProfile(profile);
  runtime.applyProfile(parsed.assetId==='person'?{character:parsed.control}:{vehicles:{[parsed.assetId]:{...parsed.control}}});
}
/** Read controls from their SDK owner; cameras belong to CameraDocument. */
export function readEditableProfile(runtime: Runtime, profile: AssetProfile): AssetProfile {
  const parsed = parseAssetProfile(profile),effective=runtime.exportProfile();
  if(parsed.assetId==='person')parsed.control=humanoid.parseMovementSettings(effective.character??{},parsed.control);
  else {
    const control=effective.vehicles?.[parsed.assetId]??{};
    parsed.control=humanoid.parseMovementSettings(control,parsed.control);
  }
  return parsed;
}
