import { describe, expect, it } from "vitest";

import {
  TRUSTED_DEFAULT_CONTROLLER_ID,
  type ExecutionPlanV2,
  type WorldRuntimeSnapshotV2,
} from "./index";

function createSnapshotFixtureV2(): WorldRuntimeSnapshotV2 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 2,
    runtimeBackend: "babylon-havok",
    tick: 30,
    ready: true,
    controlledEntityId: "player",
    controllersById: {
      "controller-primary": { id: "controller-primary", controlledEntityId: "player" },
    },
    subjectStatesByEntityId: {
      animal: {
        entityId: "animal",
        positionMeters: [6, 1, 28],
        velocityMetersPerSecond: [0, 0, 0],
        movementMedium: "ground",
      },
      player: {
        entityId: "player",
        positionMeters: [0, 1, 30],
        velocityMetersPerSecond: [0, 0, -4],
        movementMedium: "ground",
      },
    },
    camera: { entityId: "camera-main", targetEntityId: "player", positionMeters: [0, 4, 35] },
    physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
    resources: { meshes: 12, bodies: 4, terrainSamples: 65 * 65 },
  };
}

describe("runtime contracts V2", () => {
  it("uses plural subject and ID-indexed runtime state", () => {
    const snapshot = createSnapshotFixtureV2();

    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.controlledEntityId).toBe("player");
    expect(Object.keys(snapshot.subjectStatesByEntityId).sort()).toEqual(["animal", "player"]);
    expect("subject" in snapshot).toBe(false);
  });

  it("uses the stable trusted default Controller ID", () => {
    expect(TRUSTED_DEFAULT_CONTROLLER_ID).toBe("controller-primary");
  });

  it("keeps the V2 execution shape plural without a singular alias", () => {
    const plan = {
      kind: "worldkit-execution-plan",
      schemaVersion: 2,
      controlledEntityId: "player",
      subjects: [],
    } as unknown as ExecutionPlanV2;

    expect(plan.subjects).toEqual([]);
    expect("subject" in plan).toBe(false);
  });
});
