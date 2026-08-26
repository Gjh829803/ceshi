import type {
  CameraRelationshipContextV1,
  CameraRelationshipRoleV1,
} from "@whitebox-world/camera";
import type { MountedOnRelationshipStateV1 } from "@whitebox-world/gameplay-contracts";

export interface CameraViewTargetContextV1 {
  readonly controlledEntityId: string;
  readonly relationshipContexts: readonly CameraRelationshipContextV1[];
  readonly relationshipRole: CameraRelationshipRoleV1;
}

/**
 * Projects committed Gameplay relationships into Camera Domain context without
 * changing the physical ViewTarget. A unique mounted relationship identifies
 * the local Rider context; an ambiguous shared Mount fails closed.
 */
export function resolveCameraViewTargetContextV1(
  targetEntityId: string,
  mountedRelationships: readonly MountedOnRelationshipStateV1[],
): CameraViewTargetContextV1 {
  const relevantRelationships = mountedRelationships
    .filter((relationship) =>
      relationship.riderEntityId === targetEntityId ||
      relationship.mountEntityId === targetEntityId
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const unambiguousRelationship = relevantRelationships.length === 1
    ? relevantRelationships[0]
    : undefined;
  return Object.freeze({
    controlledEntityId:
      unambiguousRelationship?.riderEntityId ?? targetEntityId,
    relationshipContexts: Object.freeze(
      relevantRelationships.map((relationship) => Object.freeze({
        id: relationship.id,
        type: relationship.type,
        riderEntityId: relationship.riderEntityId,
        mountEntityId: relationship.mountEntityId,
        mountSlotId: relationship.mountSlotId,
      })),
    ),
    relationshipRole:
      unambiguousRelationship === undefined ? "none" : "rider",
  });
}
