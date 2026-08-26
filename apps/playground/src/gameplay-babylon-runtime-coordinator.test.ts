import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";

import { createValidAuthoringSpec } from "../../../packages/authoring/src/test-fixture";
import type {
  GameplayWorldPortV1,
  GameplayWorldStateProjectionV1,
  RuntimeWorldConfigurationV1,
} from "@whitebox-world/runtime-host";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  BabylonWorldRuntime,
  createBabylonGameplayWorldPortV1,
  type BabylonRuntimeProjectionV1,
} from "@whitebox-world/runtime-babylon";
import { createFakeGameplayWorldPortHarnessV1 } from
  "../../../packages/runtime-host/src/test/fake-gameplay-world-adapter";
import { isNil } from "lodash-es";

import { loadAuthoringScene } from "./authoring-loader";
import { loadOutdoorGameplaySceneV1 } from "./outdoor-scene-gameplay-loader";
import {
  MOUNTED_SKATEBOARD_S1_MOUNT_ACTION_REF,
  MOUNTED_SKATEBOARD_S1_MOUNT_COMMAND_ID,
  MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST_REF,
  MOUNTED_SKATEBOARD_S1_DISMOUNT_ACTION_REF,
  MOUNTED_SKATEBOARD_S1_DISMOUNT_COMMAND_ID,
  MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST_REF,
  MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID,
  mountedSkateboardS1Scene,
} from "./scenes/mounted-skateboard-s1";
import {
  PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
  createGameplayBabylonRuntimeCoordinatorV1,
  type GameplayBabylonRuntimeBundleV1,
} from "./gameplay-babylon-runtime-coordinator";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function worldConfiguration() {
  const base = createValidAuthoringSpec();
  const source = {
    ...base,
    schemaVersion: 4 as const,
    spatial: {
      ...base.spatial,
      traversalAreas: [],
      routes: [],
    },
    constraints: {
      placements: base.constraints.placements,
      connectivity: [],
    },
  };
  const loaded = await loadAuthoringScene(
    async () => new Response(JSON.stringify(source)),
  );
  if (!loaded.ok || isNil(loaded.runtimeWorldConfiguration)) {
    throw new Error(
      `test world configuration was not produced: ${JSON.stringify(loaded.diagnostics)}`,
    );
  }
  return loaded.runtimeWorldConfiguration;
}

function worldProjection(
  configuration: RuntimeWorldConfigurationV1,
): GameplayWorldStateProjectionV1 {
  return Object.freeze({
    simulationTick: 0,
    spatialEntityStatesById: Object.freeze(Object.fromEntries(
      configuration.executionPlan.subjects.map((subject) => [
        subject.entityId,
        Object.freeze({
          id: subject.entityId,
          kind: "spatial-entity-state" as const,
          entityDefinitionRef: subject.subjectDefinitionRef,
          entityDefinitionHash:
            subject.subjectDefinitionHash as `sha256:${string}`,
          semanticClassId: subject.semanticClassId,
          lifecycleMode: "active" as const,
          positionMetersXYZ: subject.spawnSubjectOriginPositionMetersXYZ,
          rotationQuaternionXYZW: [0, 0, 0, 1] as const,
          scaleRatioXYZ: [1, 1, 1] as const,
          linearVelocityMetersPerSecondXYZ: [0, 0, 0] as const,
        }),
      ]),
    )),
    capabilityStatesById: Object.freeze({}),
    semanticFactsById: Object.freeze({}),
  });
}

interface FakeRuntimeV1 {
  readonly canvas: HTMLCanvasElement;
  readonly renderFrame: ReturnType<typeof vi.fn>;
  readonly renderFrameWhenReady: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
  snapshot(): BabylonRuntimeProjectionV1;
}

function fakeRuntimeFactory(
  configuration: RuntimeWorldConfigurationV1,
  options: Readonly<{ rejectCandidateRender?: boolean }> = {},
) {
  const runtimes: FakeRuntimeV1[] = [];
  const factory = vi.fn(async ({
    canvas,
  }: Readonly<{ canvas: HTMLCanvasElement }>): Promise<GameplayBabylonRuntimeBundleV1> => {
    const harness = createFakeGameplayWorldPortHarnessV1({
      initialWorldProjection: worldProjection(configuration),
      controllableEntityIds: configuration.executionPlan.subjects.map(
        ({ entityId }) => entityId,
      ),
    });
    let renderFrameIndex = 0;
    const dispose = vi.fn(async () => undefined);
    const renderFrame = vi.fn(() => {
      if (options.rejectCandidateRender === true && runtimes.length === 2) {
        throw new Error("candidate render rejected");
      }
      const receipt = {
        kind: "worldkit-render-ready-receipt" as const,
        schemaVersion: 1 as const,
        id: `render-ready:${runtimes.length}:${renderFrameIndex}`,
        runtimeSessionId: "runtime.test",
        simulationTick: harness.publishedWorldProjection.simulationTick,
        renderFrameIndex,
      };
      renderFrameIndex += 1;
      return receipt;
    });
    const runtime: FakeRuntimeV1 = {
      canvas,
      renderFrame,
      renderFrameWhenReady: vi.fn(async () => renderFrame()),
      dispose,
      snapshot: (): BabylonRuntimeProjectionV1 => ({
        runtimeBackend: "babylon-havok",
        tick: harness.publishedWorldProjection.simulationTick,
        ready: true,
        possessionTarget: {
          mode: "possessed",
          controlledEntityId:
            configuration.executionPlan.initialControlledEntityId,
        },
        subjectStatesByEntityId: {},
        camera: {
          entityId: "camera.main",
          targetEntityId: configuration.executionPlan.initialControlledEntityId,
          positionMetersXYZ: [1, 2, 3],
          activeCameraProfileRef: "worldkit://camera-profile/third-person@1",
          activeCameraRigRef: "worldkit://camera-rig/third-person@1",
          activeCameraModifierRefs: [],
          safeFallbackActive: false,
          viewYawOffsetRadians: 0,
          viewPitchOffsetRadians: 0,
          viewDistanceOffsetMeters: 0,
          selectionDecision: {
            schemaVersion: 1,
            simulationTick: 0,
            targetEntityId: configuration.executionPlan.initialControlledEntityId,
            activeCameraRigProfileRef: "worldkit://camera-rig/third-person@1",
            activeCameraModifierRefs: [],
            matchedCameraContextRuleIds: [],
            cameraViewPreference: { mode: "auto" },
            fallbackActive: false,
            diagnostics: [],
            explain: {
              cameraViewPreference: { mode: "auto" },
              cameraContextRules: [],
              selectedCameraRigProfileRef: "worldkit://camera-rig/third-person@1",
              appliedCameraModifierRefs: [],
              fallbackActive: false,
            },
          },
          selectedTargetSocketId: "ThirdPersonView",
          targetSocketPositionMetersXYZ: [0, 1, 0],
          isTargetSocketFallback: false,
          desiredTargetPositionMetersXYZ: [0, 1, 0],
          desiredPositionMetersXYZ: [1, 2, 3],
          actualPositionMetersXYZ: [1, 2, 3],
          finalFovDegrees: 60,
          requestedArmLengthMeters: 6,
          safeArmLengthMeters: 3,
          effectiveArmLengthMeters: 3,
          isCollisionRetracted: true,
          positionLagXYZ: [0, 0, 0],
          rotationLagRadiansXYZ: [0.1, 0.2, 0],
          recenterRemainingSeconds: 0.8,
          fixedStepDeltaSeconds: 1 / 60,
          resolvedParameters: {} as never,
          previewParameterOverrides: { distanceMeters: 4 },
          profileTransitionProgressRatio: 1,
          controlForwardXYZ: [0, 0, -1],
          subjectForwardXYZ: [0, 0, -1],
          subjectVelocityMetersPerSecondXYZ: [0, 0, 0],
        },
        physics: {
          backend: "havok",
          ready: true,
          fixedTimeStepSeconds: 1 / 60,
        },
        resources: { meshes: 3, bodies: 2, terrainSamples: 4 },
      }),
    };
    runtimes.push(runtime);
    const gameplayWorldPort: GameplayWorldPortV1 = Object.freeze({
      initialize: () => harness.port.initialize(),
      hasEntity: (entityId: string) => harness.port.hasEntity(entityId),
      isEntityControllable: (entityId: string) =>
        harness.port.isEntityControllable(entityId),
      isActionAvailable: (
        actorEntityId: string,
        semanticActionRef: string,
        transition: Parameters<GameplayWorldPortV1["isActionAvailable"]>[2],
      ) =>
        harness.port.isActionAvailable(
          actorEntityId,
          semanticActionRef,
          transition,
        ),
      prepareGameplayTransition: (
        transition: Parameters<GameplayWorldPortV1["prepareGameplayTransition"]>[0],
      ) =>
        harness.port.prepareGameplayTransition(transition),
      estimateFixedInputTickCapacity: (
        input: Parameters<GameplayWorldPortV1["estimateFixedInputTickCapacity"]>[0],
      ) =>
        harness.port.estimateFixedInputTickCapacity(input),
      runFixedInputTick: (
        input: Parameters<GameplayWorldPortV1["runFixedInputTick"]>[0],
      ) => harness.port.runFixedInputTick(input),
      snapshot: () => harness.port.snapshot(),
      dispose: async () => {
        await harness.port.dispose();
        await runtime.dispose();
      },
    });
    return Object.freeze({
      runtime: runtime as unknown as GameplayBabylonRuntimeBundleV1["runtime"],
      gameplayWorldPort,
    });
  });
  return { factory, runtimes };
}

function fakeDocument(): Pick<Document, "createElement"> {
  return {
    createElement: vi.fn(() => ({}) as HTMLCanvasElement),
  };
}

async function createHarness(
  options: Readonly<{ rejectCandidateRender?: boolean }> = {},
) {
  const configuration = await worldConfiguration();
  const runtimeFactory = fakeRuntimeFactory(configuration, options);
  const coordinator = await createGameplayBabylonRuntimeCoordinatorV1({
    runtimeSessionId: "runtime.test",
    initialWorldConfiguration: configuration,
    document: fakeDocument(),
    runtimeBundleFactory: runtimeFactory.factory,
    worldSessionIdFactory: (() => {
      let index = 0;
      return () => `world-session.${index += 1}`;
    })(),
  });
  return { configuration, coordinator, ...runtimeFactory };
}

describe("Gameplay Babylon Runtime coordinator", () => {
  it("runs Mount, board movement, Dismount, and Rider movement through real Havok", async () => {
    vi.stubGlobal("location", { origin: "https://playground.test" });
    const gBotBytes = new Uint8Array(await readFile(fileURLToPath(new URL(
      "../public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
      import.meta.url,
    ))));
    const havokWasmBytes = await readFile(
      createRequire(import.meta.url).resolve(
        "@babylonjs/havok/lib/esm/HavokPhysics.wasm",
      ),
    );
    const loaded = await loadOutdoorGameplaySceneV1(
      mountedSkateboardS1Scene,
      {
        sceneCatalogId: "mounted-skateboard-s1",
        fetchSubjectAsset: (async (input: URL | RequestInfo) => ({
          ok: true,
          redirected: false,
          url: String(input),
          arrayBuffer: async () => gBotBytes.buffer.slice(
            gBotBytes.byteOffset,
            gBotBytes.byteOffset + gBotBytes.byteLength,
          ),
        })) as typeof fetch,
      },
    );
    if (
      !loaded.ok ||
      loaded.runtimeWorldConfiguration === undefined ||
      loaded.gameplayActionRequestResolver === undefined
    ) throw new Error(JSON.stringify(loaded.diagnostics));
    const runtimeBundleFactory = async (
      input: Parameters<NonNullable<Parameters<
        typeof createGameplayBabylonRuntimeCoordinatorV1
      >[0]["runtimeBundleFactory"]>>[0],
    ): Promise<GameplayBabylonRuntimeBundleV1> => {
      const runtime = await BabylonWorldRuntime.create({
        executionPlan: input.descriptor.executionPlan,
        runtimeSessionId: input.descriptor.runtimeSessionId,
        autoStartRenderLoop: false,
        engineFactory: () => new NullEngine({
          renderWidth: 640,
          renderHeight: 360,
          textureSize: 512,
          deterministicLockstep: true,
          lockstepMaxSteps: 4,
        }),
        havokWasmBinary: havokWasmBytes.buffer.slice(
          havokWasmBytes.byteOffset,
          havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
        ) as ArrayBuffer,
        subjectAssetResolver: {
          resolveSubjectAsset: async () => ({
            bytes: new Uint8Array(gBotBytes),
            sourceLabel: "memory://g-bot.glb",
          }),
        },
      });
      return Object.freeze({
        runtime,
        gameplayWorldPort: createBabylonGameplayWorldPortV1(
          runtime,
          PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
        ),
      });
    };
    const coordinator = await createGameplayBabylonRuntimeCoordinatorV1({
      runtimeSessionId: "runtime.mounted-havok",
      initialWorldConfiguration: loaded.runtimeWorldConfiguration,
      gameplayActionRequestResolver: loaded.gameplayActionRequestResolver,
      document: fakeDocument(),
      runtimeBundleFactory,
      worldSessionIdFactory: () => "world-session.mounted-havok",
    });
    const initial = coordinator.snapshot();
    if (initial.view.camera.mode !== "tracking") {
      throw new Error("Expected the mounted fixture Camera to be tracking.");
    }
    const cameraReceipt = await coordinator.executeCameraViewCommand({
      type: "view.camera-preference.set",
      schemaVersion: 1,
      id: "camera-command.mounted-havok",
      runtimeSessionId: initial.runtimeSessionId,
      worldSessionId: initial.worldSessionId,
      cameraEntityId: initial.view.camera.id,
      cameraViewPreference: {
        mode: "camera-rig-profile",
        cameraRigProfileRef: initial.view.camera.activeCameraProfileRef,
      },
    });
    expect(cameraReceipt).toMatchObject({
      status: "committed",
      viewStateRevision: initial.view.viewStateRevision + 1,
    });
    expect(coordinator.eventsAfter(0, 10).some((event) =>
      event.type === "camera.selection.changed"
    )).toBe(true);
    const mountRequest = {
      id: "mount-skateboard-s1",
      kind: "mount-action-request",
      mountEntityId: "skateboard",
      mountSlotId: "stand",
      riderEntityId: "player",
      schemaVersion: 1,
    } as const;
    const mounted = await coordinator.executeGameplayCommand({
      schemaVersion: 1,
      id: MOUNTED_SKATEBOARD_S1_MOUNT_COMMAND_ID,
      type: "action.activate",
      runtimeSessionId: initial.runtimeSessionId,
      worldSessionId: initial.worldSessionId,
      controllerEntityId: PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
      expectedPossession: { mode: "possessed", controlledEntityId: "player" },
      actionExecutionId: "action-execution.mounted-havok.mount",
      semanticActionRef: MOUNTED_SKATEBOARD_S1_MOUNT_ACTION_REF,
      actorEntityId: "player",
      actionRequestRef: MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST_REF,
      actionRequestHash:
        sha256CanonicalJson(mountRequest) as `sha256:${string}`,
    });
    expect(mounted).toMatchObject({ status: "committed" });
    expect(
      coordinator.getGameplayInspectionSnapshot()
        .relationshipStatesById[MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID],
    ).toMatchObject({
      type: "mountedOn",
      riderEntityId: "player",
      mountEntityId: "skateboard",
    });

    const beforeBoardMove = coordinator.snapshot().world
      .subjectStatesByEntityId.skateboard!.entityState.positionMetersXYZ;
    const afterBoardMove = await coordinator.runFixedInput({
      actions: ["move-forward"],
      ticks: 30,
    });
    const boardAfter = afterBoardMove.world.subjectStatesByEntityId.skateboard!
      .entityState.positionMetersXYZ;
    const riderAfter = afterBoardMove.world.subjectStatesByEntityId.player!;
    expect(boardAfter[2]).toBeLessThan(beforeBoardMove[2]);
    expect(riderAfter.entityState.positionMetersXYZ[2]).toBeCloseTo(boardAfter[2], 4);
    expect(Object.values(riderAfter.capabilityStatesById)).toContainEqual(
      expect.objectContaining({
        mode: "suspended",
        suspendedByRelationshipId: MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID,
      }),
    );
    expect(afterBoardMove.view.camera).toMatchObject({
      mode: "tracking",
      targetEntityId: "skateboard",
      activeCameraModifierRefs: [
        "worldkit://camera-modifier/mounted-framing@1",
      ],
      requestedArmLengthMeters: 7,
    });
    expect(afterBoardMove.view.camera.mode).toBe("tracking");
    if (afterBoardMove.view.camera.mode === "tracking") {
      expect(afterBoardMove.view.camera.effectiveArmLengthMeters).toBeGreaterThan(6);
    }

    const dismountRequest = {
      id: "dismount-skateboard-s1",
      kind: "dismount-action-request",
      mountedOnRelationshipId: MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID,
      riderEntityId: "player",
      schemaVersion: 1,
    } as const;
    const dismounted = await coordinator.executeGameplayCommand({
      schemaVersion: 1,
      id: MOUNTED_SKATEBOARD_S1_DISMOUNT_COMMAND_ID,
      type: "action.activate",
      runtimeSessionId: initial.runtimeSessionId,
      worldSessionId: initial.worldSessionId,
      controllerEntityId: PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
      expectedPossession: {
        mode: "possessed",
        controlledEntityId: "skateboard",
      },
      actionExecutionId: "action-execution.mounted-havok.dismount",
      semanticActionRef: MOUNTED_SKATEBOARD_S1_DISMOUNT_ACTION_REF,
      actorEntityId: "player",
      actionRequestRef: MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST_REF,
      actionRequestHash:
        sha256CanonicalJson(dismountRequest) as `sha256:${string}`,
    });
    expect(dismounted).toMatchObject({ status: "committed" });
    expect(
      coordinator.getGameplayInspectionSnapshot()
        .relationshipStatesById[MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID],
    ).toBeUndefined();
    const riderBeforeIndependentMove = coordinator.snapshot().world
      .subjectStatesByEntityId.player!.entityState.positionMetersXYZ;
    const independentlyMoved = await coordinator.runFixedInput({
      actions: ["move-forward"],
      ticks: 30,
    });
    expect(
      independentlyMoved.world.subjectStatesByEntityId.player!
        .entityState.positionMetersXYZ[2],
    ).toBeLessThan(riderBeforeIndependentMove[2]);
    expect(independentlyMoved.view.camera).toMatchObject({
      mode: "tracking",
      targetEntityId: "player",
      activeCameraModifierRefs: [],
    });

    await coordinator.dispose();
  }, 30_000);

  it("activates the locked mounted feature closure and resolves trusted fixture Requests", async () => {
    vi.stubGlobal("location", { origin: "https://playground.test" });
    const bytes = new Uint8Array(await readFile(fileURLToPath(new URL(
      "../public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
      import.meta.url,
    ))));
    const loaded = await loadOutdoorGameplaySceneV1(
      mountedSkateboardS1Scene,
      {
        sceneCatalogId: "mounted-skateboard-s1",
        fetchSubjectAsset: (async (input: URL | RequestInfo) => ({
          ok: true,
          redirected: false,
          url: String(input),
          arrayBuffer: async () => bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        })) as typeof fetch,
      },
    );
    if (
      !loaded.ok ||
      loaded.runtimeWorldConfiguration === undefined ||
      loaded.gameplayActionRequestResolver === undefined
    ) throw new Error(JSON.stringify(loaded.diagnostics));
    const runtimeFactory = fakeRuntimeFactory(loaded.runtimeWorldConfiguration);
    const coordinator = await createGameplayBabylonRuntimeCoordinatorV1({
      runtimeSessionId: "runtime.mounted-test",
      initialWorldConfiguration: loaded.runtimeWorldConfiguration,
      gameplayActionRequestResolver: loaded.gameplayActionRequestResolver,
      document: fakeDocument(),
      runtimeBundleFactory: runtimeFactory.factory,
      worldSessionIdFactory: () => "world-session.mounted-test",
    });
    const request = {
      id: "mount-skateboard-s1",
      kind: "mount-action-request",
      mountEntityId: "skateboard",
      mountSlotId: "stand",
      riderEntityId: "player",
      schemaVersion: 1,
    } as const;
    const snapshot = coordinator.snapshot();

    await expect(coordinator.executeGameplayCommand({
      schemaVersion: 1,
      id: MOUNTED_SKATEBOARD_S1_MOUNT_COMMAND_ID,
      type: "action.activate",
      runtimeSessionId: snapshot.runtimeSessionId,
      worldSessionId: snapshot.worldSessionId,
      controllerEntityId: PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
      expectedPossession: { mode: "possessed", controlledEntityId: "player" },
      actionExecutionId: "action-execution.mounted-skateboard-s1.mount",
      semanticActionRef: MOUNTED_SKATEBOARD_S1_MOUNT_ACTION_REF,
      actorEntityId: "player",
      actionRequestRef: MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST_REF,
      actionRequestHash: sha256CanonicalJson(request) as `sha256:${string}`,
    })).resolves.toMatchObject({
      status: "rejected",
      diagnostic: { code: "ACTION_NOT_AVAILABLE_FOR_ACTOR" },
    });

    await coordinator.dispose();
  }, 30_000);

  it("commits the canonical initial possession and renders before create resolves", async () => {
    const { configuration, coordinator, runtimes } = await createHarness();
    const publication = coordinator.hostPublication();

    expect(Object.values(
      publication.gameplayInspection.relationshipStatesById,
    )).toEqual([
      expect.objectContaining({
          controlledEntityId:
            configuration.executionPlan.initialControlledEntityId,
          controllerEntityId: PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
      }),
    ]);
    expect(runtimes).toHaveLength(1);
    expect(runtimes[0]?.renderFrame).toHaveBeenCalledOnce();
    expect(coordinator.activeRuntime()).toBe(runtimes[0]);
    expect(coordinator.activeCanvas()).toBe(runtimes[0]?.canvas);

    await coordinator.dispose();
  });

  it("publishes provider-neutral V4 state using canonical possession as control truth", async () => {
    const { coordinator } = await createHarness();
    const snapshot = coordinator.snapshot();
    const serialized = JSON.stringify(snapshot);

    expect(snapshot).toMatchObject({
      kind: "worldkit-runtime-snapshot",
      schemaVersion: 4,
      runtimeSessionId: "runtime.test",
      world: {
        simulationTick: 0,
        gameplayInspection: {
          relationshipStatesById: expect.any(Object),
        },
      },
      view: {
        camera: {
          mode: "tracking",
          rotationLagRadiansXYZ: [0.1, 0.2, 0],
          recenterRemainingSeconds: 0.8,
          fixedStepDeltaSeconds: 1 / 60,
        },
      },
      runtime: { phase: "ready", fixedTimeStepSeconds: 1 / 60 },
      resources: { meshCount: 3, physicsBodyCount: 2, terrainSampleCount: 4 },
    });
    expect(serialized).not.toContain("babylon");
    expect(serialized).not.toContain("havok");
    expect(Object.keys(snapshot)).not.toContain("controlledEntityId");
    expect(Object.keys(snapshot.runtime)).not.toContain("backend");

    await coordinator.dispose();
  });

  it("hides provider target, socket, and Follow Arm telemetry after canonical control release", async () => {
    const { configuration, coordinator } = await createHarness();
    const current = coordinator.snapshot();
    await expect(coordinator.executeGameplayCommand({
      schemaVersion: 1,
      id: "command.release.for-unbound-camera",
      type: "control.release",
      runtimeSessionId: current.runtimeSessionId,
      worldSessionId: current.worldSessionId,
      controllerEntityId: PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
      expectedPossession: {
        mode: "possessed",
        controlledEntityId:
          configuration.executionPlan.initialControlledEntityId,
      },
    })).resolves.toMatchObject({ status: "committed" });

    expect(coordinator.snapshot().view.camera).toEqual({ mode: "unbound" });

    const released = coordinator.snapshot();
    await expect(coordinator.executeGameplayCommand({
      schemaVersion: 1,
      id: "command.rebind.after-unbound-camera",
      type: "control.bind",
      runtimeSessionId: released.runtimeSessionId,
      worldSessionId: released.worldSessionId,
      controllerEntityId: PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
      controlledEntityId: configuration.executionPlan.initialControlledEntityId,
      expectedPossession: { mode: "unbound" },
    })).resolves.toMatchObject({ status: "committed" });
    expect(coordinator.snapshot().view.camera).toMatchObject({
      mode: "tracking",
      targetEntityId: configuration.executionPlan.initialControlledEntityId,
      selectedTargetSocketId: "ThirdPersonView",
      requestedArmLengthMeters: 6,
      safeArmLengthMeters: 3,
      effectiveArmLengthMeters: 3,
      previewParameterOverrides: { distanceMeters: 4 },
    });

    await coordinator.dispose();
  });

  it("renders a bound candidate before reset publication and keeps the current runtime on gate failure", async () => {
    const { coordinator, runtimes } = await createHarness({
      rejectCandidateRender: true,
    });
    const originalWorldSessionId = coordinator.snapshot().worldSessionId;

    await expect(coordinator.resetWithInitialControlBinding()).rejects.toThrow(
      /WORLD_SESSION_FAILED/,
    );
    expect(runtimes).toHaveLength(2);
    expect(runtimes[1]?.renderFrame).toHaveBeenCalledOnce();
    expect(runtimes[1]?.dispose).toHaveBeenCalledOnce();
    expect(coordinator.snapshot().worldSessionId).toBe(originalWorldSessionId);
    expect(coordinator.activeRuntime()).toBe(runtimes[0]);

    await coordinator.dispose();
  });

  it("publishes the rendered bound reset candidate and disposes the replaced owner once", async () => {
    const { configuration, coordinator, runtimes } = await createHarness();
    const previousRuntime = runtimes[0];
    const previousWorldSessionId = coordinator.snapshot().worldSessionId;

    const reset = await coordinator.resetWithInitialControlBinding();

    expect(reset.worldSessionId).not.toBe(previousWorldSessionId);
    expect(reset.world.simulationTick).toBe(0);
    expect(Object.values(
      reset.world.gameplayInspection.relationshipStatesById,
    )).toEqual([
      expect.objectContaining({
        controlledEntityId:
          configuration.executionPlan.initialControlledEntityId,
        controllerEntityId: PLAYGROUND_CONTROLLER_ENTITY_ID_V1,
      }),
    ]);
    expect(runtimes).toHaveLength(2);
    expect(runtimes[1]?.renderFrame).toHaveBeenCalledOnce();
    expect(coordinator.activeRuntime()).toBe(runtimes[1]);
    expect(coordinator.activeCanvas()).toBe(runtimes[1]?.canvas);
    expect(previousRuntime?.dispose).toHaveBeenCalledOnce();

    await coordinator.dispose();
    expect(previousRuntime?.dispose).toHaveBeenCalledOnce();
    expect(runtimes[1]?.dispose).toHaveBeenCalledOnce();
  });

  it("keeps public Activity acquire/release idempotent and rejects changed payloads", async () => {
    const { coordinator } = await createHarness();
    const request = {
      schemaVersion: 1 as const,
      id: "activity.take.1",
      activityKind: "simulation-take" as const,
      expectedWorldSessionId: coordinator.snapshot().worldSessionId,
    };

    const first = coordinator.acquireRuntimeActivity(request);
    expect(coordinator.acquireRuntimeActivity(request)).toEqual(first);
    expect(first).toMatchObject({ status: "active", requestId: request.id });
    expect(coordinator.acquireRuntimeActivity({
      ...request,
      activityKind: "control-capture",
    })).toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_ACTIVITY_ID_CONFLICT" },
    });
    const released = coordinator.releaseRuntimeActivity(request);
    expect(released).toMatchObject({ status: "released" });
    expect(coordinator.releaseRuntimeActivity(request)).toEqual(released);
    expect(coordinator.releaseRuntimeActivity({
      ...request,
      id: "activity.unknown",
    })).toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_ACTIVITY_NOT_ACTIVE" },
    });

    await coordinator.dispose();
  });

  it("disposes each owned runtime exactly once and makes disposal idempotent", async () => {
    const { coordinator, runtimes } = await createHarness();

    await coordinator.dispose();
    await coordinator.dispose();

    expect(runtimes[0]?.dispose).toHaveBeenCalledOnce();
    expect(() => coordinator.activeRuntime()).toThrow(/disposed/i);
  });

  it("terminates an active Activity on dispose and keeps late release idempotent", async () => {
    const { coordinator } = await createHarness();
    const request = {
      schemaVersion: 1 as const,
      id: "activity.pending-capture",
      activityKind: "control-capture" as const,
      expectedWorldSessionId: coordinator.snapshot().worldSessionId,
    };
    expect(coordinator.acquireRuntimeActivity(request)).toMatchObject({
      status: "active",
    });

    await coordinator.dispose();

    const late = coordinator.releaseRuntimeActivity(request);
    expect(late).toMatchObject({ status: "terminated-by-host" });
    expect(coordinator.releaseRuntimeActivity(request)).toEqual(late);
  });
});
