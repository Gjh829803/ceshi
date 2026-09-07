import { training } from '@worldkit/three';
type Runtime=training.TrainingRuntime;

import { parseAssetProfile, type AssetProfileV1 } from './profiles';

export function applyControlProfile(runtime: Runtime, profile: AssetProfileV1) {
  const parsed = parseAssetProfile(profile);
  runtime.applyProfile(parsed.assetId==='person'?{character:parsed.control}:{vehicles:{[parsed.assetId]:{...parsed.control,camera:parsed.camera.distance}}});
}
export function applyCameraProfile(runtime: Runtime, profile: AssetProfileV1) {
  const parsed = parseAssetProfile(profile);
  const { distance, ...camera } = parsed.camera;
  runtime.applyProfile({camera, cameraDistanceMeters:distance});
}
