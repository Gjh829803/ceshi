import { humanoid } from '@worldkit/three';
type Runtime=humanoid.HumanoidRuntime;

import { parseAssetProfile, type AssetProfile } from './profiles';

export function applyControlProfile(runtime: Runtime, profile: AssetProfile) {
  const parsed = parseAssetProfile(profile);
  runtime.applyProfile(parsed.assetId==='person'?{character:parsed.control}:{vehicles:{[parsed.assetId]:{...parsed.control,camera:parsed.camera.distance}}});
}
export function applyCameraProfile(runtime: Runtime, profile: AssetProfile) {
  const parsed = parseAssetProfile(profile);
  const { distance, ...camera } = parsed.camera;
  runtime.applyProfile({camera, cameraDistanceMeters:distance});
}

export function readEffectiveProfile(runtime: Runtime, profile: AssetProfile): AssetProfile {
  const parsed = parseAssetProfile(profile),effective=runtime.exportProfile();
  if(parsed.assetId==='person')parsed.control=humanoid.parseMovementSettings(effective.character??{},parsed.control);
  else {
    const {camera: _camera,...control}=effective.vehicles?.[parsed.assetId]??{};
    parsed.control=humanoid.parseMovementSettings(control,parsed.control);
  }
  const current=runtime.inspectConfiguration().effective;
  if(current.subjectId===parsed.assetId){
    parsed.camera={...current.camera.settings,distance:effective.cameraDistanceMeters??effective.vehicles?.[parsed.assetId]?.camera??parsed.camera.distance};
  }
  return parsed;
}
