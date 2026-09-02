import {
  createBabylonNativeBlockProfileBuildFailureV1,
} from "@whitebox-world/native-babylon/host";

const BLOCK_PROFILE_REPAIR_HINT =
  "Repair the Block occupancy, lattice, IDs, or Collider selection.";

export function failBabylonNativeBlockProfileBuildV1(
  code: string,
  detail: string,
): never {
  throw createBabylonNativeBlockProfileBuildFailureV1(
    code,
    detail,
    BLOCK_PROFILE_REPAIR_HINT,
  );
}
