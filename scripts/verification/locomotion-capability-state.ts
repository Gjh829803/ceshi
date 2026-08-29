import { isNil } from "lodash-es";

import type { GameplayCapabilityStateV1 } from "@whitebox-world/gameplay-contracts";
import type { WorldRuntimeSnapshotV4 } from "@whitebox-world/runtime-contracts";

export type PublishedLocomotionModeV1 = "idle" | "walk" | "run" | "airborne";
export type PublishedMovementMediumV1 = "ground" | "air";

export interface ActivePublishedLocomotionV1 {
  readonly mode: PublishedLocomotionModeV1;
  readonly movementMedium: PublishedMovementMediumV1;
}

export function findLocomotionCapabilityState(
  snapshot: WorldRuntimeSnapshotV4,
  entityId: string,
): GameplayCapabilityStateV1 | undefined {
  const subject = snapshot.world.subjectStatesByEntityId[entityId];
  if (isNil(subject)) return undefined;
  const candidates = Object.values(subject.capabilityStatesById).filter((candidate) =>
    candidate.kind === "locomotion-capability-state" ||
    candidate.kind === "locomotion-capability-state-v2"
  );
  if (candidates.length > 1) {
    throw new Error(`Ambiguous locomotion capability state for '${entityId}'.`);
  }
  return candidates[0];
}

export function requireActivePublishedLocomotionV1(
  snapshot: WorldRuntimeSnapshotV4,
  entityId: string,
): ActivePublishedLocomotionV1 {
  const capability = findLocomotionCapabilityState(snapshot, entityId);
  if (isNil(capability)) {
    throw new Error(`Missing locomotion capability state for '${entityId}'.`);
  }
  if (capability.kind === "locomotion-capability-state-v2") {
    if (capability.locomotion.status === "suspended") {
      throw new Error(`Unexpected suspended locomotion capability for '${entityId}'.`);
    }
    return {
      mode: capability.locomotion.mobilityMode === "airborne"
        ? "airborne"
        : capability.locomotion.gait === "none"
          ? "idle"
          : capability.locomotion.gait,
      movementMedium: capability.locomotion.movementMedium,
    };
  }
  if (capability.mode === "suspended") {
    throw new Error(`Unexpected suspended locomotion capability for '${entityId}'.`);
  }
  return {
    mode: capability.mode,
    movementMedium: capability.movementMedium,
  };
}
