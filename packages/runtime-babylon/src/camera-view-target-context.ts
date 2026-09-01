import type { CameraRelationshipContextV1 } from "@whitebox-world/camera";
import type { MountedOnRelationshipStateV1 } from "@whitebox-world/gameplay-contracts";

export interface CameraViewTargetContextV1 {
  readonly controlledEntityId: string;
  readonly targetEntityId: string;
  readonly relationshipContexts: readonly CameraRelationshipContextV1[];
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Projects committed Gameplay relationships into Camera Domain context without
 * changing the committed controlled Entity or physical ViewTarget. Unique
 * Rider resolution and shared-Mount ambiguity are Camera Rule concerns.
 */
export function resolveCameraViewTargetContextV1(
  input: Readonly<{
    controlledEntityId: string;
    targetEntityId: string;
    mountedRelationships: readonly MountedOnRelationshipStateV1[];
  }>,
): CameraViewTargetContextV1 {
  const relevantEntityIds = new Set([
    input.controlledEntityId,
    input.targetEntityId,
  ]);
  const relevantRelationships = input.mountedRelationships
    .filter((relationship) =>
      relevantEntityIds.has(relationship.riderEntityId) ||
      relevantEntityIds.has(relationship.mountEntityId)
    )
    .sort((left, right) => compareCodeUnits(left.id, right.id));
  return Object.freeze({
    controlledEntityId: input.controlledEntityId,
    targetEntityId: input.targetEntityId,
    relationshipContexts: Object.freeze(
      relevantRelationships.map((relationship) => Object.freeze({
        id: relationship.id,
        type: relationship.type,
        riderEntityId: relationship.riderEntityId,
        mountEntityId: relationship.mountEntityId,
        mountSlotId: relationship.mountSlotId,
      })),
    ),
  });
}
