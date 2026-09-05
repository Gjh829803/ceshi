import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  FORMAL_WORLD_CAPTURE_MINIMUM_SPAN_METERS_XYZ_V1,
  type BabylonNativeBlockMaterializerMetadataV1,
  type FormalWorldBoundsMetersV1,
} from "@whitebox-world/runtime-contracts";

/** Inspection only: verified effective Block sizes, never Package container margins. */
export function deriveNativeFormalWorldCaptureBoundsV1(
  metadata: Pick<BabylonNativeBlockMaterializerMetadataV1, "blocks">,
): FormalWorldBoundsMetersV1 {
  if (metadata.blocks.length === 0) throw new TypeError("FORMAL_CAPTURE_VISUAL_BOUNDS_INVALID");
  const minimum = new Vector3(Infinity, Infinity, Infinity);
  const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const block of metadata.blocks) {
    const center = Vector3.FromArray(block.centerMetersXYZ);
    // Checked metadata already publishes the Y-quarter-turn's effective XYZ size.
    const halfSize = Vector3.FromArray(block.sizeMetersXYZ).scale(0.5);
    minimum.minimizeInPlace(center.subtract(halfSize));
    maximum.maximizeInPlace(center.add(halfSize));
  }
  const center = minimum.add(maximum).scale(0.5);
  const halfSize = maximum.subtract(minimum)
    .maximizeInPlace(Vector3.FromArray(FORMAL_WORLD_CAPTURE_MINIMUM_SPAN_METERS_XYZ_V1))
    .scale(0.5);
  const low = center.subtract(halfSize);
  const high = center.add(halfSize);
  return Object.freeze({
    minimumMetersXYZ: Object.freeze([low.x, low.y, low.z] as const),
    maximumMetersXYZ: Object.freeze([high.x, high.y, high.z] as const),
  });
}
