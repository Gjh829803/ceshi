import { describe, expect, it } from "vitest";

import {
  TRUSTED_DEFAULT_CONTROLLER_ID,
  WORLDKIT_BROWSER_PROTOCOL_VERSION,
  type ExecutionSubjectV3,
  type WorldRuntimeSnapshotV3,
  type WorldkitBrowserApiV3,
} from "./index";

function createSnapshotFixtureV3(): WorldRuntimeSnapshotV3 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 3,
    runtimeBackend: "babylon-havok",
    tick: 30,
    ready: true,
    controlledEntityId: "player",
    controllersById: {
      "controller-primary": { id: "controller-primary", controlledEntityId: "player" },
    },
    subjectStatesByEntityId: {
      "pack-animal-a": {
        entityId: "pack-animal-a",
        subjectDefinitionRef:
          "package://subject-definition/coastal-pack-animal@1",
        subjectDefinitionHash: `sha256:${"a".repeat(64)}`,
        positionMetersXYZ: [6, 0, 28],
        velocityMetersPerSecondXYZ: [0, 0, 0],
        movementMedium: "ground",
      },
      player: {
        entityId: "player",
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.third-person@1",
        subjectDefinitionHash: `sha256:${"b".repeat(64)}`,
        positionMetersXYZ: [0, 0, 30],
        velocityMetersPerSecondXYZ: [0, 0, -4],
        movementMedium: "ground",
      },
    },
    camera: {
      entityId: "camera-main",
      targetEntityId: "player",
      positionMetersXYZ: [0, 4, 35],
    },
    physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
    resources: { meshes: 12, bodies: 4, terrainSamples: 65 * 65 },
  };
}

describe("runtime contracts V3", () => {
  it("separates Subject Origin from Collider center in ExecutionSubjectV3", () => {
    const subject = {
      entityId: "pack-animal-a",
      subjectDefinitionRef:
        "package://subject-definition/coastal-pack-animal@1",
      subjectDefinitionHash: `sha256:${"a".repeat(64)}`,
      bodyTopology: "quadruped",
      semanticClassId: "subject.animal.pack",
      spawnAnchorEntityId: "spawn-pack-animal-a",
      spawnSubjectOriginPositionMetersXYZ: [4, 0, 2],
      forwardDirection: "-z",
      visualParts: [],
      sockets: [],
      collider: {
        kind: "capsule",
        radiusMeters: 0.7,
        heightMeters: 1.4,
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
        massKilograms: 75,
        maxSlopeDegrees: 42,
        maxStepHeightMeters: 0.3,
      },
      locomotion: {
        mode: "ground",
        groundSpeedMetersPerSecond: 4,
        waterSpeedMetersPerSecond: 2.2,
        jumpSpeedMetersPerSecond: 5.5,
      },
    } satisfies ExecutionSubjectV3;

    expect(subject).toMatchObject({
      subjectDefinitionRef:
        "package://subject-definition/coastal-pack-animal@1",
      subjectDefinitionHash: expect.stringMatching(/^sha256:/),
      spawnSubjectOriginPositionMetersXYZ: [4, 0, 2],
      collider: {
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
      },
    });
    expect(subject).not.toHaveProperty(["kit", "Ref"].join(""));
    expect(subject).not.toHaveProperty("spawnPositionMeters");
  });

  it("defines every SnapshotV3 Subject position as Subject Origin", () => {
    const snapshot = createSnapshotFixtureV3();

    expect(snapshot.schemaVersion).toBe(3);
    expect(snapshot.subjectStatesByEntityId.player).toMatchObject({
      subjectDefinitionRef: expect.any(String),
      subjectDefinitionHash: expect.stringMatching(/^sha256:/),
      positionMetersXYZ: expect.any(Array),
      velocityMetersPerSecondXYZ: expect.any(Array),
    });
    expect(snapshot.subjectStatesByEntityId.player).not.toHaveProperty(
      "positionMeters",
    );
  });

  it("keeps the stable trusted default Controller ID", () => {
    expect(TRUSTED_DEFAULT_CONTROLLER_ID).toBe("controller-primary");
  });

  it("defines Browser Protocol V3 directly over SnapshotV3", async () => {
    const snapshot = createSnapshotFixtureV3();
    const api = {
      version: WORLDKIT_BROWSER_PROTOCOL_VERSION,
      ready: async () => snapshot,
      getSnapshot: () => snapshot,
      getDiagnostics: () => [],
      bindControl: () => ({
        kind: "worldkit-control-binding-receipt" as const,
        schemaVersion: 2 as const,
        status: "committed" as const,
        controllerId: "controller-primary",
        previousControlledEntityId: "player",
        controlledEntityId: "pack-animal-a",
      }),
      runFixedInput: async () => snapshot,
      captureScreenshot: () => "data:image/png;base64,",
      reset: () => snapshot,
      setPaused: () => snapshot,
    } satisfies WorldkitBrowserApiV3;

    expect(api.version).toBe(3);
    await expect(api.ready()).resolves.toBe(snapshot);
  });
});
