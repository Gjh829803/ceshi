import { describe, expect, it } from "vitest";

import type {
  BabylonCharacterBodyCommittedSupportEvidenceV1,
  BabylonCharacterBodyNativeContactV1,
} from "./babylon-character-body-port";
import {
  projectRuntimeSessionSubjectSupportV1,
  selectUniqueCommittedSupportContactV1,
} from "./runtime-session-subject-support";

const contact = Object.freeze({
  pointMetersXYZ: [0, 0, 0],
  normalXYZ: [0, 1, 0],
  distanceMeters: 0,
  motionType: "static",
  colliderId: "ground",
  colliderSubshapeId: "ground.shape",
  logicalSubshapeId: "ground.logical",
  traversalSurfaceId: "ground.surface",
  surfaceEntityId: "ground.entity",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
} as const satisfies BabylonCharacterBodyNativeContactV1);

function evidence(
  contacts: readonly BabylonCharacterBodyNativeContactV1[] = [contact],
): BabylonCharacterBodyCommittedSupportEvidenceV1 {
  return Object.freeze({
    schemaVersion: 1,
    tick: 4,
    sampledControllerCenterMetersXYZ: [0, 1, 0] as const,
    sampledFootPointMetersXYZ: [0, 0, 0] as const,
    support: {
      mode: "supported",
      pointMetersXYZ: [0, 0, 0] as const,
      normalXYZ: [0, 1, 0] as const,
      isDynamic: false,
    } as const,
    contacts: Object.freeze(contacts),
  });
}

describe("Runtime Session committed Subject support", () => {
  it("projects one committed, uniquely joined, registered support contact", () => {
    expect(projectRuntimeSessionSubjectSupportV1({
      evidence: evidence(),
      runtimeSessionId: "runtime",
      worldSessionId: "world",
      subjectEntityId: "player",
      expectedSimulationTick: 4,
      registeredColliderIds: new Set(["ground"]),
    })).toEqual({
      kind: "worldkit-runtime-session-subject-support",
      schemaVersion: 1,
      runtimeSessionId: "runtime",
      worldSessionId: "world",
      subjectEntityId: "player",
      simulationTick: 4,
      mode: "supported",
      sampledControllerCenterMetersXYZ: [0, 1, 0],
      sampledFootPointMetersXYZ: [0, 0, 0],
      pointMetersXYZ: [0, 0, 0],
      normalXYZ: [0, 1, 0],
      distanceMeters: 0,
      colliderId: "ground",
      colliderSubshapeId: "ground.shape",
      logicalSubshapeId: "ground.logical",
      traversalSurfaceId: "ground.surface",
      surfaceEntityId: "ground.entity",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
    });
  });

  it("fails closed for stale, unsupported, unjoinable, ambiguous, and unregistered evidence", () => {
    const { colliderId: _colliderId, ...unjoinedContact } = contact;
    expect(() => selectUniqueCommittedSupportContactV1({
      evidence: evidence(),
      committedTick: 5,
    })).toThrow("WORLDKIT_RUNTIME_COMMITTED_SUPPORT_STALE");
    expect(() => selectUniqueCommittedSupportContactV1({
      evidence: { ...evidence(), support: { mode: "unsupported" } },
      committedTick: 4,
    })).toThrow("WORLDKIT_RUNTIME_COMMITTED_SUPPORT_STALE");
    expect(() => selectUniqueCommittedSupportContactV1({
      evidence: evidence([unjoinedContact]),
      committedTick: 4,
    })).toThrow("WORLDKIT_RUNTIME_COMMITTED_SUPPORT_UNJOINABLE");
    expect(() => selectUniqueCommittedSupportContactV1({
      evidence: evidence([
        contact,
        { ...contact, colliderId: "other" },
      ]),
      committedTick: 4,
    })).toThrow("WORLDKIT_RUNTIME_COMMITTED_SUPPORT_AMBIGUOUS");
    expect(() => projectRuntimeSessionSubjectSupportV1({
      evidence: evidence(),
      runtimeSessionId: "runtime",
      worldSessionId: "world",
      subjectEntityId: "player",
      expectedSimulationTick: 4,
      registeredColliderIds: new Set(["other"]),
    })).toThrow("WORLDKIT_RUNTIME_COMMITTED_SUPPORT_UNREGISTERED_COLLIDER");
  });
});
