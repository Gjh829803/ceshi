import {
  blockWorldSpaceTransitionDestinationAnchorEntityIdV2,
  BLOCK_WORLD_SPACE_TRANSITION_REACH_METERS_V2,
  parseBlockWorldSpaceTransitionSemanticClassIdV2,
} from "@whitebox-world/block-world";
import type {
  CanonicalSceneExecutionPlanV1,
  CanonicalSceneObjectV1,
  CanonicalSceneVec3V1,
} from "@whitebox-world/runtime-contracts";

export interface BlockWorldRuntimeSpaceTransitionV1 {
  readonly id: string;
  readonly triggerEntityId: string;
  readonly triggerCenterMetersXYZ: CanonicalSceneVec3V1;
  readonly triggerHalfSizeMetersXYZ: CanonicalSceneVec3V1;
  readonly destinationStandPositionMetersXYZ: CanonicalSceneVec3V1;
  readonly destinationYawRadians: number;
}

function triggerHalfSize(object: CanonicalSceneObjectV1): CanonicalSceneVec3V1 {
  if (object.primitive.kind !== "box") {
    throw new Error(
      `BLOCK_WORLD_SPACE_TRANSITION_TRIGGER_SHAPE_INVALID: ${object.entityId}`,
    );
  }
  return Object.freeze(object.primitive.sizeMetersXYZ.map((value, axis) =>
    value * object.transform.scaleXYZ[axis]! / 2,
  )) as CanonicalSceneVec3V1;
}

export function deriveBlockWorldRuntimeSpaceTransitionsV1(
  executionPlan: CanonicalSceneExecutionPlanV1,
): readonly BlockWorldRuntimeSpaceTransitionV1[] {
  const ids = new Set<string>();
  const rows = executionPlan.objects.flatMap((object) => {
    const id = parseBlockWorldSpaceTransitionSemanticClassIdV2(
      object.semanticClassId,
    );
    if (id === undefined) return [];
    if (ids.has(id)) {
      throw new Error(`BLOCK_WORLD_SPACE_TRANSITION_DUPLICATE: ${id}`);
    }
    ids.add(id);
    const anchorId = blockWorldSpaceTransitionDestinationAnchorEntityIdV2(id);
    const destination = executionPlan.layout.placementsByEntityId[anchorId];
    if (destination === undefined ||
        !executionPlan.traversal.anchorEntityIds.includes(anchorId)) {
      throw new Error(
        `BLOCK_WORLD_SPACE_TRANSITION_DESTINATION_MISSING: ${id}`,
      );
    }
    return [Object.freeze({
      id,
      triggerEntityId: object.entityId,
      triggerCenterMetersXYZ: Object.freeze([
        ...object.transform.positionMetersXYZ,
      ]) as CanonicalSceneVec3V1,
      triggerHalfSizeMetersXYZ: triggerHalfSize(object),
      destinationStandPositionMetersXYZ: Object.freeze([
        ...destination.transform.positionMetersXYZ,
      ]) as CanonicalSceneVec3V1,
      destinationYawRadians: destination.transform.rotationEulerRadiansXYZ[1],
    })];
  });
  return Object.freeze(rows.sort((left, right) => left.id.localeCompare(right.id)));
}

function distanceSquaredToTrigger(
  positionMetersXYZ: CanonicalSceneVec3V1,
  transition: BlockWorldRuntimeSpaceTransitionV1,
): number {
  let distanceSquared = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const distanceFromCenter = Math.abs(
      positionMetersXYZ[axis]! - transition.triggerCenterMetersXYZ[axis]!,
    );
    const distanceOutside = Math.max(
      0,
      distanceFromCenter - transition.triggerHalfSizeMetersXYZ[axis]!,
    );
    distanceSquared += distanceOutside ** 2;
  }
  return distanceSquared;
}

export function selectBlockWorldSpaceTransitionV1(
  transitions: readonly BlockWorldRuntimeSpaceTransitionV1[],
  subjectOriginMetersXYZ: CanonicalSceneVec3V1,
): BlockWorldRuntimeSpaceTransitionV1 | undefined {
  const maximumDistanceSquared =
    BLOCK_WORLD_SPACE_TRANSITION_REACH_METERS_V2 ** 2;
  return transitions
    .map((transition) => ({
      transition,
      distanceSquared: distanceSquaredToTrigger(
        subjectOriginMetersXYZ,
        transition,
      ),
    }))
    .filter(({ distanceSquared }) => distanceSquared <= maximumDistanceSquared)
    .sort((left, right) => left.distanceSquared - right.distanceSquared ||
      left.transition.id.localeCompare(right.transition.id))[0]?.transition;
}
