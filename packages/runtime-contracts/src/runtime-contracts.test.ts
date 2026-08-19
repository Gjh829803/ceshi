import { describe, expect, it } from "vitest";

import {
  TRUSTED_DEFAULT_CONTROLLER_ID,
  WORLDKIT_BROWSER_PROTOCOL_VERSION,
  type ExecutionAnimationSetV1,
  type ExecutionColliderProfileV1,
  type ExecutionRigProfileV1,
  type ExecutionSubjectAssetV1,
  type ExecutionSubjectV3,
  type FixedInputV1,
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
      visualBinding: { mode: "static" },
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
        walkSpeedMetersPerSecond: 2.4,
        runSpeedMetersPerSecond: 4,
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

  it("defines minimal engine-neutral execution resource descriptors", () => {
    const subjectAsset = {
      subjectAssetRef: "worldkit://subject-asset/humanoid.golden@1",
      artifactContentHash: `sha256:${"1".repeat(64)}`,
      byteLength: 43_656,
      mediaType: "model/gltf-binary",
      format: "glb",
      inventory: {
        meshCount: 1,
        vertexCount: 360,
        triangleCount: 180,
        skeletonCount: 1,
        boneCount: 18,
        animationClipNames: ["idle", "jump", "run", "walk"],
      },
    } satisfies ExecutionSubjectAssetV1;
    const rigProfile = {
      rigProfileRef: "worldkit://rig-profile/biped.golden@1",
      bodyTopology: "biped",
      skeletonRootNodeName: "root",
      requiredBoneIds: ["root", "hand.right"],
      sourceNodeNameByBoneId: {
        root: "root",
        hips: "hips",
        spine: "spine",
        chest: "chest",
        neck: "neck",
        head: "head",
        "upper-arm.left": "upper-arm.left",
        "lower-arm.left": "lower-arm.left",
        "hand.left": "hand.left",
        "upper-arm.right": "upper-arm.right",
        "lower-arm.right": "lower-arm.right",
        "hand.right": "hand.right",
        "upper-leg.left": "upper-leg.left",
        "lower-leg.left": "lower-leg.left",
        "foot.left": "foot.left",
        "upper-leg.right": "upper-leg.right",
        "lower-leg.right": "lower-leg.right",
        "foot.right": "foot.right",
      },
    } satisfies ExecutionRigProfileV1;
    const animationSet = {
      animationSetRef: "worldkit://animation-set/humanoid.ground.golden@1",
      subjectAssetRef: subjectAsset.subjectAssetRef,
      rigProfileRef: rigProfile.rigProfileRef,
      defaultActionId: "idle",
      requiredActionIds: ["idle", "walk", "run", "jump"],
      animationBindings: [
        {
          actionId: "run",
          sourceClipName: "run",
          loopMode: "repeat",
          playbackSpeedRatio: 1,
          blendDurationSeconds: 0.15,
          rootMotionMode: "in-place",
        },
      ],
    } satisfies ExecutionAnimationSetV1;
    const colliderProfile = {
      colliderProfileRef: "worldkit://collider-profile/humanoid.medium-capsule@1",
      supportedBodyTopologies: ["biped"],
      collider: {
        kind: "capsule",
        radiusMeters: 0.32,
        heightMeters: 1.92,
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.96, 0],
      },
    } satisfies ExecutionColliderProfileV1;

    expect(Object.keys(subjectAsset).sort()).toEqual([
      "artifactContentHash",
      "byteLength",
      "format",
      "inventory",
      "mediaType",
      "subjectAssetRef",
    ]);
    expect(Object.keys(rigProfile).sort()).toEqual([
      "bodyTopology",
      "requiredBoneIds",
      "rigProfileRef",
      "skeletonRootNodeName",
      "sourceNodeNameByBoneId",
    ]);
    expect(Object.keys(animationSet).sort()).toEqual([
      "animationBindings",
      "animationSetRef",
      "defaultActionId",
      "requiredActionIds",
      "rigProfileRef",
      "subjectAssetRef",
    ]);
    expect(Object.keys(colliderProfile).sort()).toEqual([
      "collider",
      "colliderProfileRef",
      "supportedBodyTopologies",
    ]);
  });

  it("accepts run as a semantic fixed input modifier", () => {
    const input = {
      actions: ["move-forward", "run"],
      ticks: 60,
    } satisfies FixedInputV1;

    expect(input.actions).toEqual(["move-forward", "run"]);
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
