import { describe, expect, it } from "vitest";

import {
  TRUSTED_DEFAULT_CONTROLLER_ID,
  WORLDKIT_BROWSER_PROTOCOL_VERSION,
  type ExecutionAnimationSetV1,
  type ExecutionColliderProfileV1,
  type ExecutionRigProfileV1,
  type ExecutionSubjectAssetV1,
  type ExecutionSubjectV3,
  type ExecutionLayoutAssertionV1,
  type ExecutionStaticColliderV1,
  type ExecutionTraversalSurfaceV1,
  type FixedInputV1,
  type WorldRuntimeSnapshotV3,
  type WorldkitBrowserApiV3,
  type WorldkitBrowserDiagnosticV1,
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
        activeActionId: "idle",
      },
      player: {
        entityId: "player",
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.third-person@1",
        subjectDefinitionHash: `sha256:${"b".repeat(64)}`,
        positionMetersXYZ: [0, 0, 30],
        velocityMetersPerSecondXYZ: [0, 0, -4],
        movementMedium: "ground",
        activeActionId: "run",
        activeControlFeelProfileRef:
          "worldkit://control-feel-profile/humanoid.medium-ground@1",
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
  it("keeps V5 traversal surfaces closed and static Collider Subshape identity explicit", () => {
    const surface = {
      kind: "heightfield",
      traversalSurfaceId: `traversal-surface:sha256:${"1".repeat(64)}`,
      surfaceEntityId: "terrain-main",
      colliderSubshapeId: `collider-subshape:sha256:${"2".repeat(64)}`,
      resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
      resolvedVersion: "1",
      resourceHash: `sha256:${"3".repeat(64)}`,
    } satisfies ExecutionTraversalSurfaceV1;
    const collider = {
      entityId: "wall-east",
      logicalSubshapeId: "primary",
      colliderSubshapeId: `collider-subshape:sha256:${"4".repeat(64)}`,
      transform: {
        positionMetersXYZ: [12, 2, 10],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
      shape: { kind: "box", sizeMetersXYZ: [2, 4, 14] },
      colliderHash: `sha256:${"5".repeat(64)}`,
    } satisfies ExecutionStaticColliderV1;

    expect(Object.keys(surface).sort()).toEqual([
      "colliderSubshapeId",
      "kind",
      "resolvedVersion",
      "resourceHash",
      "resourceRef",
      "surfaceEntityId",
      "traversalSurfaceId",
    ]);
    expect(collider).toMatchObject({
      entityId: "wall-east",
      logicalSubshapeId: "primary",
      shape: { kind: "box" },
    });
    expect(JSON.stringify({ surface, collider })).not.toMatch(
      /Babylon|Havok|Recast|Detour|provider|handle|polyRef/,
    );
  });

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
      spawnSubjectFacingRadians: Math.PI / 2,
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
        allowWalk: true,
        allowRun: true,
        allowJump: true,
      },
      physicsBodyProfileRef: "worldkit://physics-body-profile/character.medium@1",
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      controlFeel: {
        resourceRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
        contentHash: `sha256:${"1".repeat(64)}`,
        walkSpeedMetersPerSecond: 2.4,
        runSpeedMetersPerSecond: 4,
        jumpSpeedMetersPerSecond: 5.5,
        accelerationMetersPerSecondSquared: 16,
        decelerationMetersPerSecondSquared: 22,
        turnRateRadiansPerSecond: 9,
        moveResponseExponent: 1.4,
        airControlRatio: 0.3,
        coyoteTimeSeconds: 0.1,
        jumpBufferSeconds: 0.12,
        variableJumpHoldSeconds: 0.18,
        jumpHoldGravityRatio: 0.45,
        jumpReleaseGravityRatio: 2,
      },
      availableControlFeels: [
        {
          resourceRef: "worldkit://control-feel-profile/humanoid.heavy-ground@1",
          contentHash: `sha256:${"2".repeat(64)}`,
          walkSpeedMetersPerSecond: 1.8,
          runSpeedMetersPerSecond: 3.2,
          jumpSpeedMetersPerSecond: 5,
          accelerationMetersPerSecondSquared: 9,
          decelerationMetersPerSecondSquared: 14,
          turnRateRadiansPerSecond: 6,
          moveResponseExponent: 1.6,
          airControlRatio: 0.2,
          coyoteTimeSeconds: 0.08,
          jumpBufferSeconds: 0.1,
          variableJumpHoldSeconds: 0.14,
          jumpHoldGravityRatio: 0.55,
          jumpReleaseGravityRatio: 2.2,
        },
      ],
    } satisfies ExecutionSubjectV3;

    expect(subject).toMatchObject({
      subjectDefinitionRef:
        "package://subject-definition/coastal-pack-animal@1",
      subjectDefinitionHash: expect.stringMatching(/^sha256:/),
      spawnSubjectOriginPositionMetersXYZ: [4, 0, 2],
      spawnSubjectFacingRadians: Math.PI / 2,
      collider: {
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
      },
    });
    expect(subject).not.toHaveProperty(["kit", "Ref"].join(""));
    expect(subject).not.toHaveProperty("spawnPositionMeters");
    expect(Object.keys(subject.availableControlFeels[0]!).sort()).toEqual(
      Object.keys(subject.controlFeel).sort(),
    );
  });

  it("publishes first-slice movement medium and feel refs on SnapshotV3", () => {
    const snapshot = createSnapshotFixtureV3();
    const player = snapshot.subjectStatesByEntityId.player!;

    expect(player.movementMedium).toBe("ground");
    expect(player.activeControlFeelProfileRef).toBe(
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
    );
    expect(player).not.toHaveProperty("motionParameterTuning");
    expect(["ground", "air"]).toContain(player.movementMedium);
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
      skeletonRootBoneName: "root",
      requiredBoneIds: ["hips", "hand.right"],
      sourceNodeNameByBoneId: {
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
      "skeletonRootBoneName",
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
      activeActionId: "run",
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
    const diagnostic = {
      severity: "error",
      code: "SUBJECT_ASSET_HASH_MISMATCH",
      instancePath: "",
      message: "Subject Asset bytes do not match the locked content hash.",
    } satisfies WorldkitBrowserDiagnosticV1;
    const api = {
      version: WORLDKIT_BROWSER_PROTOCOL_VERSION,
      ready: async () => snapshot,
      getSnapshot: () => snapshot,
      getDiagnostics: () => [diagnostic],
      bindControl: () => ({
        kind: "worldkit-control-binding-receipt" as const,
        schemaVersion: 2 as const,
        status: "committed" as const,
        controllerId: "controller-primary",
        previousControlledEntityId: "player",
        controlledEntityId: "pack-animal-a",
      }),
      runFixedInput: async () => snapshot,
      getControlCaptureCapabilities: () => ({
        kind: "worldkit-control-capture-capabilities" as const,
        schemaVersion: 1 as const,
        available: false,
        captureProfileRef: "worldkit://capture/profile/control-video@1" as const,
        captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1" as const,
        requiredPassIds: [],
        maximumWidthPixels: 0,
        maximumHeightPixels: 0,
        diagnostics: [],
      }),
      waitForSimulationTick: async () => snapshot,
      waitForRenderReady: async () => ({
        kind: "worldkit-render-ready-receipt" as const,
        schemaVersion: 1 as const,
        id: "render-ready:test:0",
        runtimeSessionId: "runtime-session-test",
        simulationTick: 0,
        renderFrameIndex: 0,
      }),
      captureControlFrame: async () => {
        throw new Error("not exercised");
      },
      captureScreenshot: () => "data:image/png;base64,",
      reset: () => snapshot,
      setPaused: () => snapshot,
    } satisfies WorldkitBrowserApiV3;

    expect(api.version).toBe(3);
    await expect(api.ready()).resolves.toBe(snapshot);
    expect(api.getDiagnostics()).toEqual([diagnostic]);
  });

  it("defines closed V4 layout assertions with role-qualified endpoints and units", () => {
    const assertion = {
      constraintId: "spawn-supported",
      kind: "supported-by",
      supportedEntityId: "spawn-main",
      supportingEntityId: "terrain-main",
      maximumSupportGapMeters: 0.02,
      minimumSupportRatio: 1,
      evidenceEntityIds: ["spawn-main", "terrain-main"],
      measurements: { maximumSupportGapMeters: 0, supportRatio: 1 },
      tolerances: { supportGapMeters: 0.02 },
    } satisfies ExecutionLayoutAssertionV1;

    expect(assertion).toMatchObject({
      kind: "supported-by",
      supportedEntityId: "spawn-main",
      supportingEntityId: "terrain-main",
    });
    expect(assertion).not.toHaveProperty("params");
  });
});
