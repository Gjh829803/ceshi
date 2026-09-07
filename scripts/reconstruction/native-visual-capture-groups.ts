import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  validateVisualCaptureGroupsV1,
  type BabylonNativeBlockMaterializerMetadataV1,
  type BabylonNativeSceneContributionV1,
  type VisualCaptureGroupV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import type { VisualIdentityPaletteV1 } from "../scenes/visual-identity-palette.js";

/** Host projection of checked identities and placement, not Builder/Runtime state. */
export function deriveNativeVisualCaptureGroupsV1(input: Readonly<{
  palette: VisualIdentityPaletteV1;
  metadata: BabylonNativeBlockMaterializerMetadataV1;
  runtimeBootstrap: WorldRuntimeBootstrapV1;
  spawnMarker: BabylonNativeSceneContributionV1["spawnMarker"];
}>): readonly VisualCaptureGroupV1[] {
  const subjectId = input.runtimeBootstrap.initialControlledEntityId;
  const subject = input.runtimeBootstrap.subjectRuntimeDescriptors.find(row => row.entityId === subjectId);
  if (subject === undefined || subject.forwardDirection !== "-z") {
    throw new Error("NATIVE_VISUAL_CAPTURE_SUBJECT_INVALID");
  }
  const subjectFront = new Vector3(0, 0, -1);
  subjectFront.applyRotationQuaternionInPlace(Quaternion.FromEulerAngles(0, input.spawnMarker.facingRadians, 0)).normalize();
  const groups = input.palette.targets.map((target): VisualCaptureGroupV1 => {
    let runtimeEntityIds: readonly string[];
    let frontDirectionWorldXZ: readonly [number, number];
    if (target.role === "primary-subject") {
      runtimeEntityIds = [subjectId];
      frontDirectionWorldXZ = [subjectFront.x === 0 ? 0 : subjectFront.x, subjectFront.z === 0 ? 0 : subjectFront.z];
    } else {
      const metadataGroup = input.metadata.visualGroups.find(group =>
        group.acceptanceTargetRef === `worldkit://acceptance-target/${target.visualTargetId}@1`);
      if (metadataGroup === undefined || metadataGroup.semanticClassId !== target.semanticClassId ||
        metadataGroup.identityColorHex !== target.identityColor) {
        throw new Error(`NATIVE_VISUAL_CAPTURE_TARGET_MISMATCH: ${target.visualTargetId}`);
      }
      runtimeEntityIds = input.metadata.blocks.filter(block => block.visualGroupId === metadataGroup.visualGroupId)
        .map(block => block.runtimeEntityId).sort();
      frontDirectionWorldXZ = [...metadataGroup.frontDirectionWorldXZ];
    }
    return Object.freeze({ visualTargetId: target.visualTargetId, role: target.role,
      semanticClassId: target.semanticClassId, identityColor: target.identityColor,
      runtimeEntityIds: Object.freeze(runtimeEntityIds), frontDirectionWorldXZ: Object.freeze(frontDirectionWorldXZ) });
  });
  if (validateVisualCaptureGroupsV1(groups).length > 0) throw new Error("NATIVE_VISUAL_CAPTURE_GROUPS_INVALID");
  return Object.freeze(groups);
}
