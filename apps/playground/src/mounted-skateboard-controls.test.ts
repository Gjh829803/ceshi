import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type { WorldRuntimeSnapshotV4 } from "@whitebox-world/runtime-contracts";

import {
  createMountedSkateboardGameplayCommandV1,
  deriveMountedSkateboardControlStateV1,
} from "./mounted-skateboard-controls.js";
import {
  MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST,
  MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST,
  MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID,
} from "./scenes/mounted-skateboard-s1.js";

function snapshot(mode: "on-foot" | "mounted"): WorldRuntimeSnapshotV4 {
  const controlledEntityId = mode === "mounted" ? "skateboard" : "player";
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: "runtime.fixture",
    worldSessionId: "world.fixture",
    world: {
      publicationEpoch: 3,
      simulationTick: 12,
      worldStateRef: "world-state:fixture",
      worldStateHash: `sha256:${"a".repeat(64)}`,
      subjectStatesByEntityId: {},
      gameplayInspection: {
        kind: "worldkit-gameplay-inspection-snapshot",
        schemaVersion: 1,
        projection: "inspection",
        id: "inspection.fixture",
        runtimeSessionId: "runtime.fixture",
        worldSessionId: "world.fixture",
        gameplayModeRef: "worldkit://gameplay-mode/outdoor.default@1",
        phase: "ready",
        simulationTick: 12,
        participantStatesById: {},
        controllerStatesById: {},
        relationshipStatesById: {
          possession: {
            id: "possession",
            schemaVersion: 1,
            type: "possessedBy",
            controllerEntityId: "controller-primary",
            controlledEntityId,
            establishedSimulationTick: 3,
          },
          ...(mode === "mounted"
            ? {
                [MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID]: {
                  id: MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID,
                  schemaVersion: 1 as const,
                  type: "mountedOn" as const,
                  riderEntityId: "player",
                  mountEntityId: "skateboard",
                  mountSlotId: "stand",
                  establishedSimulationTick: 3,
                },
              }
            : {}),
        },
        activeActionStatesById: {},
        activatedGameplayFeatureRefs: [],
        lastEventSequence: 0,
      },
    },
    view: {
      viewStateRevision: 4,
      camera: {
        mode: "tracking",
        id: "camera-primary",
        targetEntityId: controlledEntityId,
        positionMetersXYZ: [0, 3, 6],
        activeCameraProfileRef: "worldkit://camera-profile/orbit.medium@1",
        activeCameraRigRef: "worldkit://camera-rig/orbit.medium@1",
        activeCameraModifierRefs: mode === "mounted"
          ? ["worldkit://camera-modifier/mounted-framing@1"]
          : [],
        safeFallbackActive: false,
        viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0,
        viewDistanceOffsetMeters: 0,
        requestedArmLengthMeters: mode === "mounted" ? 7 : 5,
        effectiveArmLengthMeters: mode === "mounted" ? 6.8 : 5,
        fixedStepDeltaSeconds: 1 / 60,
      },
    },
    runtime: {
      phase: "ready",
      isPaused: false,
      fixedTimeStepSeconds: 1 / 60,
    },
    resources: {
      phase: "ready",
      meshCount: 3,
      physicsBodyCount: 2,
      terrainSampleCount: 64,
    },
  };
}

describe("mounted skateboard visual acceptance controls", () => {
  it("derives mounted camera evidence only from committed snapshot state", () => {
    expect(deriveMountedSkateboardControlStateV1(snapshot("on-foot"))).toMatchObject({
      mode: "on-foot",
      controlledEntityId: "player",
      cameraTargetEntityId: "player",
      activeCameraModifierRefs: [],
      mountedCameraModifierActive: false,
      requestedArmLengthMeters: 5,
    });
    expect(deriveMountedSkateboardControlStateV1(snapshot("mounted"))).toMatchObject({
      mode: "mounted",
      controlledEntityId: "skateboard",
      cameraTargetEntityId: "skateboard",
      activeCameraModifierRefs: [
        "worldkit://camera-modifier/mounted-framing@1",
      ],
      mountedCameraModifierActive: true,
      requestedArmLengthMeters: 7,
      effectiveArmLengthMeters: 6.8,
    });
  });

  it("builds closed Mount and Dismount commands against the current sessions", () => {
    const mount = createMountedSkateboardGameplayCommandV1(
      "mount",
      snapshot("on-foot"),
    );
    const dismount = createMountedSkateboardGameplayCommandV1(
      "dismount",
      snapshot("mounted"),
    );

    expect(mount).toMatchObject({
      type: "action.activate",
      runtimeSessionId: "runtime.fixture",
      worldSessionId: "world.fixture",
      expectedPossession: { mode: "possessed", controlledEntityId: "player" },
      actionRequestHash: sha256CanonicalJson(
        MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST,
      ),
    });
    expect(dismount).toMatchObject({
      type: "action.activate",
      expectedPossession: {
        mode: "possessed",
        controlledEntityId: "skateboard",
      },
      actionRequestHash: sha256CanonicalJson(
        MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST,
      ),
    });
  });
});
