import type {
  ColliderSourcePartV1,
  DeriveVerticalCharacterCapsuleResultV1,
} from "./types";
import { deriveCompositionBounds, isValidColliderSourcePart } from "./primitive-bounds";

const SUPPORT_ORIGIN_TOLERANCE_METERS = 0.01;

export function deriveVerticalCharacterCapsule(
  parts: readonly ColliderSourcePartV1[],
): DeriveVerticalCharacterCapsuleResultV1 {
  const part = parts[0];
  if (part === undefined) {
    return {
      ok: false,
      issues: [
        {
          code: "SUBJECT_COMPOSITION_EMPTY",
          message: "At least one primitive must contribute to collider derivation.",
          partIds: [],
        },
      ],
    };
  }
  const invalidPartIds = parts
    .filter((candidate) => !isValidColliderSourcePart(candidate))
    .map(({ id }) => id);
  if (invalidPartIds.length > 0) {
    return {
      ok: false,
      issues: [
        {
          code: "SUBJECT_PRIMITIVE_INVALID",
          message: "Primitive dimensions and transforms must be finite and geometrically valid.",
          partIds: invalidPartIds,
        },
      ],
    };
  }
  const { minimumMetersXYZ, maximumMetersXYZ } = deriveCompositionBounds(parts);
  if (Math.abs(minimumMetersXYZ[1]) > SUPPORT_ORIGIN_TOLERANCE_METERS) {
    return {
      ok: false,
      issues: [
        {
          code: "SUBJECT_SUPPORT_ORIGIN_INVALID",
          message: "Included primitive bounds must meet the support-center origin plane.",
          partIds: parts.map(({ id }) => id),
          details: {
            minimumYMeters: minimumMetersXYZ[1],
            toleranceMeters: SUPPORT_ORIGIN_TOLERANCE_METERS,
          },
        },
      ],
    };
  }
  const radiusMeters = Math.max(
    maximumMetersXYZ[0] - minimumMetersXYZ[0],
    maximumMetersXYZ[2] - minimumMetersXYZ[2],
  ) / 2;
  const heightMeters = Math.max(maximumMetersXYZ[1], radiusMeters * 2);
  return {
    ok: true,
    bounds: { minimumMetersXYZ, maximumMetersXYZ },
    collider: {
      kind: "capsule",
      radiusMeters,
      heightMeters,
      centerOffsetFromSubjectOriginMetersXYZ: [
        (minimumMetersXYZ[0] + maximumMetersXYZ[0]) / 2,
        heightMeters / 2,
        (minimumMetersXYZ[2] + maximumMetersXYZ[2]) / 2,
      ],
    },
  };
}
