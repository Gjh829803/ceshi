import { describe, expect, it } from "vitest";

import {
  TRUSTED_DEFAULT_CONTROLLER_ID,
  WORLDKIT_BROWSER_PROTOCOL_VERSION,
  WORLDKIT_GAMEPLAY_EVENT_PAGE_MAXIMUM_COUNT,
  EXECUTION_RESOURCE_KINDS_V1,
  canonicalExecutionResourceLockEntriesV1,
  canonicalWorldkitBrowserRouteEvidencePublicationV2,
  type ExecutionAnimationSetV1,
  type ExecutionColliderProfileV1,
  type ExecutionRigProfileV1,
  type ExecutionSubjectAssetV1,
  type ExecutionSubjectV3,
  type ExecutionLayoutAssertionV1,
  type ExecutionStaticColliderV1,
  type ExecutionStaticColliderTraversalSurfaceV1,
  type ExecutionTraversalAreaV1,
  type ExecutionPlanV5,
  type ExecutionTraversalSurfaceV1,
  type FixedInputV1,
  type GameplayEventsQueryV1,
  type GameplayEventsQueryResultV1,
  type RuntimeActivityRequestV1,
  type RuntimeActivityReceiptV1,
  type WorldStateSnapshotRequestV1,
  type WorldRuntimeSnapshotV3,
  type WorldRuntimeSnapshotV4,
  type WorldkitBrowserApiV5,
  type WorldkitBrowserRouteEvidencePublicationV2,
  type WorldkitBrowserDiagnosticV1,
} from "./index";
import type {
  GameplayInspectionSnapshotV1,
  WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";

const ROUTE_PUBLICATION_HASH = `sha256:${"a".repeat(64)}` as const;

function emptyRouteEvidencePublicationFixture(): WorldkitBrowserRouteEvidencePublicationV2 {
  return {
    kind: "worldkit-browser-route-evidence-publication",
    schemaVersion: 2,
    worldPackageRootHash: ROUTE_PUBLICATION_HASH,
    authoringSpecHash: ROUTE_PUBLICATION_HASH,
    normalizedWorldIrHash: ROUTE_PUBLICATION_HASH,
    executionPlanHash: ROUTE_PUBLICATION_HASH,
    resourceLockHash: ROUTE_PUBLICATION_HASH,
    layoutSolveReportHash: ROUTE_PUBLICATION_HASH,
    validationReportHash: ROUTE_PUBLICATION_HASH,
    routeValidationSetReceiptHash: ROUTE_PUBLICATION_HASH,
    validationProfileRef:
      "worldkit://validation-profile/outdoor-world-package-dev@1",
    validationProfileResolvedVersion: "1.0.0",
    validationProfileHash: ROUTE_PUBLICATION_HASH,
    routes: [],
  };
}

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

function createGameplayInspectionFixtureV1(): GameplayInspectionSnapshotV1 {
  return {
    kind: "worldkit-gameplay-inspection-snapshot",
    schemaVersion: 1,
    projection: "inspection",
    id: "gameplay-inspection:world-session-test:30",
    runtimeSessionId: "runtime-session-test",
    worldSessionId: "world-session-test",
    gameplayModeRef: "worldkit://gameplay-mode/outdoor.default@1",
    phase: "ready",
    simulationTick: 30,
    participantStatesById: {
      "participant-primary": { id: "participant-primary", mode: "active" },
    },
    controllerStatesById: {
      "controller-primary": {
        id: "controller-primary",
        participantId: "participant-primary",
      },
    },
    possessedByRelationshipsById: {},
    activeActionStatesById: {},
    activatedGameplayFeatureRefs: [],
    lastEventSequence: 0,
  };
}

function createSnapshotFixtureV4(): WorldRuntimeSnapshotV4 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: "runtime-session-test",
    worldSessionId: "world-session-test",
    world: {
      publicationEpoch: 4,
      simulationTick: 30,
      worldStateRef: "world-state:test:30",
      worldStateHash: `sha256:${"c".repeat(64)}`,
      subjectStatesByEntityId: {
        player: {
          entityState: {
            id: "player",
            kind: "spatial-entity-state",
            entityDefinitionRef:
              "worldkit://subject-definition/humanoid.third-person@1",
            entityDefinitionHash: `sha256:${"b".repeat(64)}`,
            semanticClassId: "subject.humanoid.player",
            lifecycleMode: "active",
            positionMetersXYZ: [0, 0, 30],
            rotationQuaternionXYZW: [0, 0, 0, 1],
            scaleRatioXYZ: [1, 1, 1],
            linearVelocityMetersPerSecondXYZ: [0, 0, -4],
          },
          capabilityStatesById: {
            "locomotion:player": {
              id: "locomotion:player",
              kind: "locomotion-capability-state",
              ownerEntityId: "player",
              locomotionCapabilityRef:
                "worldkit://locomotion-capability/ground.standard@1",
              locomotionCapabilityHash: `sha256:${"d".repeat(64)}`,
              mode: "run",
              movementMedium: "ground",
              facingYawRadians: 0,
              speedMetersPerSecond: 4,
            },
          },
        },
      },
      gameplayInspection: createGameplayInspectionFixtureV1(),
    },
    view: {
      viewStateRevision: 7,
      camera: {
        mode: "tracking",
        id: "camera-main",
        targetEntityId: "player",
        positionMetersXYZ: [0, 4, 35],
        activeCameraProfileRef:
          "worldkit://camera-profile/humanoid.third-person@1",
        activeCameraRigRef:
          "worldkit://camera-rig-profile/humanoid.third-person@1",
        activeCameraModifierRefs: [],
        safeFallbackActive: false,
        viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0,
        viewDistanceOffsetMeters: 0,
      },
    },
    runtime: {
      phase: "ready",
      isPaused: false,
      fixedTimeStepSeconds: 1 / 60,
    },
    resources: {
      phase: "ready",
      meshCount: 12,
      physicsBodyCount: 4,
      terrainSampleCount: 65 * 65,
    },
  };
}

describe("runtime contracts V3", () => {
  it("requires V5 Authoring provenance and explicit sorted Anchor identities", () => {
    const traversal = {
      surfaces: [],
      traversalAreas: [],
      connectivityRequirements: [],
      anchorEntityIds: ["goal", "spawn-main"],
    } satisfies ExecutionPlanV5["traversal"];
    const provenance = {
      schemaVersion: 5,
      authoringSpecHash: `sha256:${"6".repeat(64)}`,
      traversal,
    } satisfies Pick<
      ExecutionPlanV5,
      "schemaVersion" | "authoringSpecHash" | "traversal"
    >;

    expect(provenance).toEqual({
      schemaVersion: 5,
      authoringSpecHash: `sha256:${"6".repeat(64)}`,
      traversal: {
        surfaces: [],
        traversalAreas: [],
        connectivityRequirements: [],
        anchorEntityIds: ["goal", "spawn-main"],
      },
    });
  });

  it("keeps V5 traversal surfaces and areas closed and Collider Subshape identity explicit", () => {
    const surface = {
      kind: "heightfield",
      traversalSurfaceId: `traversal-surface:sha256:${"1".repeat(64)}`,
      surfaceEntityId: "terrain-main",
      colliderSubshapeId: `collider-subshape:sha256:${"2".repeat(64)}`,
      resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
      resolvedVersion: "1",
      resourceHash: `sha256:${"3".repeat(64)}`,
    } satisfies ExecutionTraversalSurfaceV1;
    const traversalArea = {
      id: "dry-trench",
      kind: "polygon-xz",
      pointsMetersXZ: [[-1, -2], [1, -2], [1, 2], [-1, 2]],
      surfaceEntityId: "terrain-main",
      mode: "blocked",
    } satisfies ExecutionTraversalAreaV1;
    const staticSurface = {
      kind: "static-collider",
      traversalSurfaceId: `traversal-surface:sha256:${"6".repeat(64)}`,
      surfaceEntityId: "platform-main",
      colliderSubshapeId: `collider-subshape:sha256:${"7".repeat(64)}`,
      resourceRef: "package://traversal-surface/platform-main.deck@1",
      resolvedVersion: "1",
      resourceHash: `sha256:${"8".repeat(64)}`,
      logicalSurfaceId: "deck",
      logicalSubshapeId: "primary",
      colliderHash: `sha256:${"9".repeat(64)}`,
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
      traversalSurfaceProfileResolvedVersion: "1",
      traversalSurfaceProfileHash: `sha256:${"a".repeat(64)}`,
    } satisfies ExecutionStaticColliderTraversalSurfaceV1;
    const surfaceUnion: readonly ExecutionTraversalSurfaceV1[] = [
      surface,
      staticSurface,
    ];
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
    expect(Object.keys(staticSurface).sort()).toEqual([
      "colliderHash",
      "colliderSubshapeId",
      "kind",
      "logicalSubshapeId",
      "logicalSurfaceId",
      "resolvedVersion",
      "resourceHash",
      "resourceRef",
      "surfaceEntityId",
      "traversalSurfaceId",
      "traversalSurfaceProfileHash",
      "traversalSurfaceProfileRef",
      "traversalSurfaceProfileResolvedVersion",
    ]);
    expect(surfaceUnion.map((row) => row.kind)).toEqual([
      "heightfield",
      "static-collider",
    ]);
    expect(collider).toMatchObject({
      entityId: "wall-east",
      logicalSubshapeId: "primary",
      shape: { kind: "box" },
    });
    expect(Object.keys(traversalArea).sort()).toEqual([
      "id",
      "kind",
      "mode",
      "pointsMetersXZ",
      "surfaceEntityId",
    ]);
    expect(JSON.stringify({ surfaceUnion, traversalArea, collider })).not.toMatch(
      /Babylon|Havok|Recast|Detour|provider|handle|polyRef/,
    );
  });

  it("admits the locked Traversal Surface Profile resource kind and rejects unknown kinds", () => {
    const profileRow = {
      resourceRef: "worldkit://traversal-surface-profile/ground.static@1",
      resourceKind: "traversal-surface-profile",
      resolvedVersion: "1",
      contentHash: `sha256:${"a".repeat(64)}`,
    } as const;

    expect(EXECUTION_RESOURCE_KINDS_V1).toContain("traversal-surface-profile");
    expect(canonicalExecutionResourceLockEntriesV1([profileRow])).toEqual([
      profileRow,
    ]);
    expect(() => canonicalExecutionResourceLockEntriesV1([{
      ...profileRow,
      resourceKind: "provider-traversal-surface-profile",
    }])).toThrowError("EXECUTION_RESOURCE_LOCK_INVALID");
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
      locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
      locomotionCapabilityHash: `sha256:${"3".repeat(64)}`,
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

  it("defines Browser Protocol V5 directly over provider-neutral SnapshotV4", async () => {
    const snapshot = createSnapshotFixtureV4();
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
      executeGameplayCommand: async () => ({}) as never,
      runFixedInput: async () => snapshot,
      getGameplayEvents: ({ afterEventSequence }) => ({
        events: [],
        nextAfterEventSequence: afterEventSequence,
        hasMore: false,
      }),
      getGameplayInspectionSnapshot: () => snapshot.world.gameplayInspection,
      getWorldStateSnapshot: () => ({}) as WorldStateSnapshotV1,
      acquireRuntimeActivity: (request) => ({
        kind: "worldkit-runtime-activity-receipt",
        schemaVersion: 1,
        requestId: request.id,
        activityKind: request.activityKind,
        worldSessionId: request.expectedWorldSessionId,
        runtimeActivityEpoch: 1,
        status: "active",
      }),
      releaseRuntimeActivity: (request) => ({
        kind: "worldkit-runtime-activity-receipt",
        schemaVersion: 1,
        requestId: request.id,
        activityKind: request.activityKind,
        worldSessionId: request.expectedWorldSessionId,
        runtimeActivityEpoch: 2,
        status: "released",
      }),
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
      reset: async () => snapshot,
      setPaused: () => snapshot,
      listSubjectDefinitions: () => [],
      listMotionKernels: () => [],
      listCompatibleProfiles: () => [],
      getSubjectPresetBaseline: () => ({}) as never,
      validateSubjectPackage: () => ({}) as never,
      setIntent: async () => snapshot,
      requestCameraProfile: () => snapshot,
      resetCameraProfile: () => snapshot,
      adjustCameraView: () => snapshot,
      resetCameraView: () => snapshot,
      getCameraPreviewState: () => ({}) as never,
      applyCameraPreview: () => ({}) as never,
      applySubjectPresetTuning: () => ({}) as never,
      setMotionProfile: async () => snapshot,
      runHarness: async () => ({}) as never,
      getSubjectSnapshot: () => snapshot.world.subjectStatesByEntityId.player,
      getCameraSnapshot: () => snapshot.view.camera,
      getRouteSummary: () => ({
        kind: "worldkit-route-evidence-query-result",
        schemaVersion: 1,
        availability: "unavailable",
        selector: { constraintId: "player-to-goal", routeId: "main-route" },
        reason: "route-evidence-not-loaded",
      }),
      getRoutePathReceipt: () => ({
        kind: "worldkit-route-evidence-query-result",
        schemaVersion: 1,
        availability: "unavailable",
        selector: { constraintId: "player-to-goal", routeId: "main-route" },
        reason: "route-evidence-not-loaded",
      }),
      getRouteRuntimeProbeReceipt: () => ({
        kind: "worldkit-route-evidence-query-result",
        schemaVersion: 1,
        availability: "unavailable",
        selector: { constraintId: "player-to-goal", routeId: "main-route" },
        reason: "route-evidence-not-loaded",
      }),
      getRouteOverlay: () => ({
        kind: "worldkit-route-evidence-query-result",
        schemaVersion: 1,
        availability: "unavailable",
        selector: { constraintId: "player-to-goal", routeId: "main-route" },
        reason: "route-evidence-not-loaded",
      }),
    } satisfies WorldkitBrowserApiV5;

    expect(api.version).toBe(5);
    await expect(api.ready()).resolves.toBe(snapshot);
    await expect(api.reset()).resolves.toBe(snapshot);
    expect(api.getDiagnostics()).toEqual([diagnostic]);
    expect(Object.keys(api).sort()).toHaveLength(39);
    expect(api).not.toHaveProperty("bindControl");
    expect(snapshot).not.toHaveProperty("controlledEntityId");
    expect(snapshot.world).not.toHaveProperty("controlledEntityId");
    expect(snapshot.view).not.toHaveProperty("controlledEntityId");
    expect(snapshot.runtime).not.toHaveProperty("controlledEntityId");
    expect(snapshot.resources).not.toHaveProperty("controlledEntityId");
    expect(Object.keys(snapshot).sort()).toEqual([
      "kind",
      "resources",
      "runtime",
      "runtimeSessionId",
      "schemaVersion",
      "view",
      "world",
      "worldSessionId",
    ]);
    expect(Object.keys(snapshot.world).sort()).toEqual([
      "gameplayInspection",
      "publicationEpoch",
      "simulationTick",
      "subjectStatesByEntityId",
      "worldStateHash",
      "worldStateRef",
    ]);
    expect(Object.keys(snapshot.view).sort()).toEqual([
      "camera",
      "viewStateRevision",
    ]);
    expect(Object.keys(snapshot.runtime).sort()).toEqual([
      "fixedTimeStepSeconds",
      "isPaused",
      "phase",
    ]);
    expect(Object.keys(snapshot.resources).sort()).toEqual([
      "meshCount",
      "phase",
      "physicsBodyCount",
      "terrainSampleCount",
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /babylon|havok|recast|provider|backend/i,
    );
  });

  it("canonicalizes the closed Browser Route publication as a detached deep-frozen DTO", () => {
    const input = emptyRouteEvidencePublicationFixture();
    const canonical = canonicalWorldkitBrowserRouteEvidencePublicationV2(input);

    expect(canonical).toEqual(input);
    expect(canonical).not.toBe(input);
    expect(canonical.routes).not.toBe(input.routes);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.routes)).toBe(true);
  });

  it("rejects zero hashes, unknown fields, accessors, symbols, and opaque buffers", () => {
    const valid = emptyRouteEvidencePublicationFixture();
    const invalidInputs: unknown[] = [
      { ...valid, worldPackageRootHash: `sha256:${"0".repeat(64)}` },
      { ...valid, providerHandle: "opaque" },
      { ...valid, [Symbol("providerHandle")]: "opaque" },
      { ...valid, validationReportHash: new ArrayBuffer(8) },
    ];
    if (typeof SharedArrayBuffer !== "undefined") {
      invalidInputs.push({
        ...valid,
        validationReportHash: new SharedArrayBuffer(8),
      });
    }
    const detached = new ArrayBuffer(8);
    structuredClone(detached, { transfer: [detached] });
    invalidInputs.push({ ...valid, validationReportHash: detached });

    let getterCalls = 0;
    invalidInputs.push(Object.defineProperty({ ...valid }, "routes", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return [];
      },
    }));

    for (const input of invalidInputs) {
      expect(() => canonicalWorldkitBrowserRouteEvidencePublicationV2(input))
        .toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
    }
    expect(getterCalls).toBe(0);
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

describe("runtime contracts V5 Route Evidence", () => {
  function emptyRouteEvidencePublicationFixtureV2(): WorldkitBrowserRouteEvidencePublicationV2 {
    return {
      ...emptyRouteEvidencePublicationFixture(),
      schemaVersion: 2,
      routes: [],
    };
  }

  it("canonicalizes V2 Browser Route publication and rejects the removed V1 version", () => {
    const input = emptyRouteEvidencePublicationFixtureV2();
    const canonical = canonicalWorldkitBrowserRouteEvidencePublicationV2(input);
    expect(canonical.schemaVersion).toBe(2);
    expect(canonical.routes).toEqual([]);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(() => canonicalWorldkitBrowserRouteEvidencePublicationV2({
      ...emptyRouteEvidencePublicationFixture(),
      schemaVersion: 1,
    })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
  });

  it("rejects leftover V1 Path/Overlay fields on a V2 publication", () => {
    const valid = emptyRouteEvidencePublicationFixtureV2();
    expect(() => canonicalWorldkitBrowserRouteEvidencePublicationV2({
      ...valid,
      routes: [{
        selector: { constraintId: "player-to-goal", routeId: "main-route" },
        summary: {
          kind: "route-evidence-summary",
          schemaVersion: 1,
          constraintId: "player-to-goal",
          routeId: "main-route",
          traversingEntityId: "player",
          startAnchorEntityId: "spawn",
          destinationAnchorEntityId: "goal",
          connectivityStatus: "complete",
          routePathStatus: "complete",
          routeRuntimeProbeStatus: "unavailable",
          routeOverlayStatus: "unavailable",
        },
        routePathReceipt: {
          orderedTraversalSurfaceIdentities: [{ traversalSurfaceId: "surface-main" }],
        },
        routePathReceiptHash: ROUTE_PUBLICATION_HASH,
      }],
    })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
    expect(() => canonicalWorldkitBrowserRouteEvidencePublicationV2({
      ...valid,
      routes: [{
        selector: { constraintId: "player-to-goal", routeId: "main-route" },
        summary: {
          kind: "route-evidence-summary",
          schemaVersion: 1,
          constraintId: "player-to-goal",
          routeId: "main-route",
          traversingEntityId: "player",
          startAnchorEntityId: "spawn",
          destinationAnchorEntityId: "goal",
          connectivityStatus: "complete",
          routePathStatus: "complete",
          routeRuntimeProbeStatus: "unavailable",
          routeOverlayStatus: "available",
        },
        routeOverlay: {
          staticColliderIdentities: [],
        },
        routeOverlayHash: ROUTE_PUBLICATION_HASH,
      }],
    })).toThrow("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
  });

  it("installs WorldkitBrowserApiV5 as the public Browser protocol", () => {
    expect(WORLDKIT_BROWSER_PROTOCOL_VERSION).toBe(5);
    const snapshot = createSnapshotFixtureV4();
    const api = {
      version: 5 as const,
      ready: async () => snapshot,
      getSnapshot: () => snapshot,
      getDiagnostics: () => [],
      executeGameplayCommand: async () => ({}) as never,
      runFixedInput: async () => snapshot,
      getGameplayEvents: ({ afterEventSequence }) => ({
        events: [],
        nextAfterEventSequence: afterEventSequence,
        hasMore: false,
      }),
      getGameplayInspectionSnapshot: () => snapshot.world.gameplayInspection,
      getWorldStateSnapshot: () => ({}) as WorldStateSnapshotV1,
      acquireRuntimeActivity: () => ({}) as RuntimeActivityReceiptV1,
      releaseRuntimeActivity: () => ({}) as RuntimeActivityReceiptV1,
      getControlCaptureCapabilities: () => ({}) as never,
      waitForSimulationTick: async () => snapshot,
      waitForRenderReady: async () => ({}) as never,
      captureControlFrame: async () => ({}) as never,
      captureScreenshot: () => "",
      reset: async () => snapshot,
      setPaused: () => snapshot,
      listSubjectDefinitions: () => [],
      listMotionKernels: () => [],
      listCompatibleProfiles: () => [],
      getSubjectPresetBaseline: () => ({}) as never,
      validateSubjectPackage: () => ({}) as never,
      setIntent: async () => snapshot,
      requestCameraProfile: () => snapshot,
      resetCameraProfile: () => snapshot,
      adjustCameraView: () => snapshot,
      resetCameraView: () => snapshot,
      getCameraPreviewState: () => ({}) as never,
      applyCameraPreview: () => ({}) as never,
      applySubjectPresetTuning: () => ({}) as never,
      setMotionProfile: async () => snapshot,
      runHarness: async () => ({}) as never,
      getSubjectSnapshot: () => snapshot.world.subjectStatesByEntityId.player,
      getCameraSnapshot: () => snapshot.view.camera,
      getRouteSummary: () => ({
        kind: "worldkit-route-evidence-query-result",
        schemaVersion: 1,
        availability: "unavailable",
        selector: { constraintId: "player-to-goal", routeId: "main-route" },
        reason: "route-evidence-not-loaded",
      }),
      getRoutePathReceipt: () => ({
        kind: "worldkit-route-evidence-query-result",
        schemaVersion: 1,
        availability: "unavailable",
        selector: { constraintId: "player-to-goal", routeId: "main-route" },
        reason: "route-evidence-not-loaded",
      }),
      getRouteRuntimeProbeReceipt: () => ({
        kind: "worldkit-route-evidence-query-result",
        schemaVersion: 1,
        availability: "unavailable",
        selector: { constraintId: "player-to-goal", routeId: "main-route" },
        reason: "route-evidence-not-loaded",
      }),
      getRouteOverlay: () => ({
        kind: "worldkit-route-evidence-query-result",
        schemaVersion: 1,
        availability: "unavailable",
        selector: { constraintId: "player-to-goal", routeId: "main-route" },
        reason: "route-evidence-not-loaded",
      }),
    } satisfies WorldkitBrowserApiV5;
    expect(Object.keys(api).sort()).toEqual([
      "acquireRuntimeActivity",
      "adjustCameraView",
      "applyCameraPreview",
      "applySubjectPresetTuning",
      "captureControlFrame",
      "captureScreenshot",
      "executeGameplayCommand",
      "getCameraPreviewState",
      "getCameraSnapshot",
      "getControlCaptureCapabilities",
      "getDiagnostics",
      "getGameplayEvents",
      "getGameplayInspectionSnapshot",
      "getRouteOverlay",
      "getRoutePathReceipt",
      "getRouteRuntimeProbeReceipt",
      "getRouteSummary",
      "getSnapshot",
      "getSubjectPresetBaseline",
      "getSubjectSnapshot",
      "getWorldStateSnapshot",
      "listCompatibleProfiles",
      "listMotionKernels",
      "listSubjectDefinitions",
      "ready",
      "releaseRuntimeActivity",
      "requestCameraProfile",
      "reset",
      "resetCameraProfile",
      "resetCameraView",
      "runFixedInput",
      "runHarness",
      "setIntent",
      "setMotionProfile",
      "setPaused",
      "validateSubjectPackage",
      "version",
      "waitForRenderReady",
      "waitForSimulationTick",
    ]);
    expect(api).not.toHaveProperty("bindControl");
  });

  it("publishes exact gameplay query, world-state lookup, and Activity wire DTOs", () => {
    const query = {
      afterEventSequence: 17,
      maximumEventCount: WORLDKIT_GAMEPLAY_EVENT_PAGE_MAXIMUM_COUNT,
    } satisfies GameplayEventsQueryV1;
    const queryResult = {
      events: [],
      nextAfterEventSequence: 17,
      hasMore: false,
    } satisfies GameplayEventsQueryResultV1;
    const worldStateRequest = {
      worldStateRef: "world-state:test:17",
    } satisfies WorldStateSnapshotRequestV1;
    const activityRequest = {
      schemaVersion: 1,
      id: "activity:simulation-take:17",
      activityKind: "simulation-take",
      expectedWorldSessionId: "world-session-test",
    } satisfies RuntimeActivityRequestV1;
    const rejectedActivity = {
      kind: "worldkit-runtime-activity-receipt",
      schemaVersion: 1,
      requestId: activityRequest.id,
      activityKind: activityRequest.activityKind,
      worldSessionId: activityRequest.expectedWorldSessionId,
      runtimeActivityEpoch: 9,
      status: "rejected",
      diagnostic: {
        code: "RUNTIME_ACTIVITY_ID_CONFLICT",
        message: "The retained Activity request has different payload bytes.",
      },
    } satisfies RuntimeActivityReceiptV1;

    expect(WORLDKIT_GAMEPLAY_EVENT_PAGE_MAXIMUM_COUNT).toBe(256);
    expect(Object.keys(query).sort()).toEqual([
      "afterEventSequence",
      "maximumEventCount",
    ]);
    expect(Object.keys(queryResult).sort()).toEqual([
      "events",
      "hasMore",
      "nextAfterEventSequence",
    ]);
    expect(Object.keys(worldStateRequest)).toEqual(["worldStateRef"]);
    expect(Object.keys(activityRequest).sort()).toEqual([
      "activityKind",
      "expectedWorldSessionId",
      "id",
      "schemaVersion",
    ]);
    expect(Object.keys(rejectedActivity).sort()).toEqual([
      "activityKind",
      "diagnostic",
      "kind",
      "requestId",
      "runtimeActivityEpoch",
      "schemaVersion",
      "status",
      "worldSessionId",
    ]);
  });
});
