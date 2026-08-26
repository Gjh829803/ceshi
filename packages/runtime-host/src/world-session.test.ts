import {
  createGameplayBootstrapV1,
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  deriveGameplaySemanticFactIdV1,
  type ControlBindGameplayCommandV1,
  type ControllerEntityStateV1,
  type GameplayParticipantStateV1,
  type GameplaySemanticFactV1,
  type SpatialEntityStateV1,
} from "@whitebox-world/gameplay-contracts";
import {
  CONTROL_TRANSITION_CAPABILITY_REF,
  createCoreControlFeatureFactoryV1,
  type GameplayModeV1,
} from "@whitebox-world/gameplay";
import { describe, expect, it } from "vitest";

import {
  createFakeGameplayWorldPortHarnessV1,
} from "./test/fake-gameplay-world-adapter";
import { WorldSession } from "./world-session";

const HASH = `sha256:${"a".repeat(64)}` as const;
const RUNTIME_SESSION_ID = "runtime.primary";
const WORLD_SESSION_ID = "world.primary";
const WORLD_PACKAGE_REF = "worldkit://world-package/test-world@1";

const participantState = Object.freeze({
  id: "participant.primary",
  mode: "active",
}) satisfies GameplayParticipantStateV1;

const controllerState = Object.freeze({
  id: "controller.primary",
  kind: "controller-entity-state",
  controllerDefinitionRef: "worldkit://controller-definition/local@1",
  controllerDefinitionHash: HASH,
  participantId: participantState.id,
  lifecycleMode: "active",
  inputMode: "human",
}) satisfies ControllerEntityStateV1;

const heroState = Object.freeze({
  id: "entity.hero",
  kind: "spatial-entity-state",
  entityDefinitionRef: "worldkit://entity-definition/hero@1",
  entityDefinitionHash: HASH,
  semanticClassId: "character.humanoid",
  lifecycleMode: "active",
  positionMetersXYZ: [0, 0, 0] as const,
  rotationQuaternionXYZW: [0, 0, 0, 1] as const,
  scaleRatioXYZ: [1, 1, 1] as const,
  linearVelocityMetersPerSecondXYZ: [0, 0, 0] as const,
}) satisfies SpatialEntityStateV1;

const wallState = Object.freeze({
  ...heroState,
  id: "entity.wall",
  entityDefinitionRef: "worldkit://entity-definition/wall@1",
  semanticClassId: "structure.wall",
}) satisfies SpatialEntityStateV1;

function touchingFact(startedSimulationTick: number): GameplaySemanticFactV1 {
  const body = {
    type: "touching" as const,
    schemaVersion: 1 as const,
    entityIds: [heroState.id, wallState.id] as const,
    startedSimulationTick,
    semanticFactProjectorProfileRef:
      "worldkit://semantic-fact-projector/default@1",
    semanticFactProjectorProfileHash: HASH,
  };
  return Object.freeze({ ...body, id: deriveGameplaySemanticFactIdV1(body) });
}

const controlFeatureFactory = createCoreControlFeatureFactoryV1();
const gameplayBootstrap = createGameplayBootstrapV1({
  kind: "gameplay-bootstrap",
  id: "gameplay.test",
  version: 1,
  resourceRef: "worldkit://gameplay-bootstrap/test@1",
  entityDescriptors: [{
    id: heroState.id,
    entityDefinitionRef: heroState.entityDefinitionRef,
    capabilityRefs: [CONTROL_TRANSITION_CAPABILITY_REF],
  }],
  featureResourceLocks: [{
    resourceRef: controlFeatureFactory.manifest.resourceRef,
    contentHash: controlFeatureFactory.manifest.contentHash,
  }],
  semanticActionDefinitions: [],
  availableCapabilityRefs: [CONTROL_TRANSITION_CAPABILITY_REF],
});

const gameplayMode = Object.freeze({
  gameplayModeRef: "worldkit://gameplay-mode/exploration@1",
  evaluateCommand: () => Object.freeze({ status: "accepted" as const }),
}) satisfies GameplayModeV1;

function projection(
  simulationTick = 0,
  semanticFactsById: Readonly<Record<string, GameplaySemanticFactV1>> = {},
) {
  return Object.freeze({
    simulationTick,
    spatialEntityStatesById: Object.freeze({
      [heroState.id]: heroState,
      [wallState.id]: wallState,
    }),
    capabilityStatesById: Object.freeze({}),
    semanticFactsById: Object.freeze({ ...semanticFactsById }),
  });
}

function createHarnessAndOptions() {
  const harness = createFakeGameplayWorldPortHarnessV1({
    initialWorldProjection: projection(),
    controllableEntityIds: [heroState.id],
  });
  return {
    harness,
    options: {
      runtimeSessionId: RUNTIME_SESSION_ID,
      worldSessionId: WORLD_SESSION_ID,
      worldPackageRef: WORLD_PACKAGE_REF,
      worldPackageRootHash: HASH,
      executionPlanHash: HASH,
      gameplayBootstrap,
      initialRelationships: [],
      participantStates: [participantState],
      controllerStates: [controllerState],
      fixedInputControllerEntityId: controllerState.id,
      gameplayModeFactory: () => gameplayMode,
      gameplayFeatureFactories: [controlFeatureFactory],
      gameplayCapacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
      worldPort: harness.port,
    },
  } as const;
}

function bindCommand(
  id = "command.bind.hero",
): ControlBindGameplayCommandV1 {
  return {
    schemaVersion: 1,
    id,
    type: "control.bind",
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId: WORLD_SESSION_ID,
    controllerEntityId: controllerState.id,
    controlledEntityId: heroState.id,
    expectedPossession: { mode: "unbound" },
  };
}

describe("WorldSession construction and publication", () => {
  it("initializes once and publishes one frozen epoch-zero bundle without rereading the port", async () => {
    const { harness, options } = createHarnessAndOptions();

    const session = await WorldSession.create(options);
    const first = session.snapshot();
    const replay = session.snapshot();

    expect(replay).toBe(first);
    expect(first.publicationEpoch).toBe(0);
    expect(first.worldState.simulationTick).toBe(0);
    expect(first.worldState.entityStatesById[controllerState.id]).toEqual(
      controllerState,
    );
    expect(first.gameplayInspection).toMatchObject({
      phase: "ready",
      simulationTick: 0,
      lastEventSequence: 0,
    });
    expect(first.viewState).toEqual({ viewStateRevision: 0 });
    expect(Object.isFrozen(first)).toBe(true);
    expect(harness.calls.map((call) => call.operation)).toEqual(["initialize"]);
  });

  it("rejects hostile create options before initializing the port", async () => {
    const { harness, options } = createHarnessAndOptions();
    let reads = 0;
    const hostile = { ...options } as Record<string, unknown>;
    Object.defineProperty(hostile, "worldSessionId", {
      enumerable: true,
      get: () => {
        reads += 1;
        return WORLD_SESSION_ID;
      },
    });

    await expect(WorldSession.create(hostile)).rejects.toThrow(
      /WorldSessionCreateOptionsV1/,
    );
    expect(reads).toBe(0);
    expect(harness.calls).toEqual([]);
  });

  it.each([
    ["missing", "controller.missing", "active"],
    ["suspended", controllerState.id, "suspended"],
    ["disabled", controllerState.id, "disabled"],
  ] as const)(
    "rejects a %s fixed-input Controller before initializing the port",
    async (_label, fixedInputControllerEntityId, lifecycleMode) => {
      const { harness, options } = createHarnessAndOptions();
      const controllerStates = lifecycleMode === "active"
        ? options.controllerStates
        : [{ ...controllerState, lifecycleMode }];

      await expect(WorldSession.create({
        ...options,
        controllerStates,
        fixedInputControllerEntityId,
      })).rejects.toThrow(/WorldSessionCreateOptionsV1/);
      expect(harness.calls).toEqual([]);
    },
  );
});

describe("WorldSession command transaction", () => {
  it("keeps staged state invisible and publishes one atomic committed bundle", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    harness.queuePreparedTransition({
      projectedWorldStateAfter: projection(),
      projectedViewStateAfter: {
        viewStateRevision: 1,
      },
    });
    const barrier = harness.deferNextOperation("prepare-gameplay-transition");

    const pending = session.executeGameplayCommand(bindCommand());
    await barrier.entered;
    expect(session.snapshot()).toMatchObject({
      publicationEpoch: 0,
      viewState: { viewStateRevision: 0 },
    });
    expect(session.snapshot().gameplayInspection.relationshipStatesById)
      .toEqual({});

    barrier.release();
    const receipt = await pending;
    const publication = session.snapshot();

    expect(receipt).toMatchObject({
      status: "committed",
      commandId: "command.bind.hero",
      eventIds: [`gameplay-event:${WORLD_SESSION_ID}:1`],
    });
    expect(publication.publicationEpoch).toBe(1);
    expect(publication.viewState).toEqual({
      viewStateRevision: 1,
    });
    expect(Object.values(
      publication.gameplayInspection.relationshipStatesById,
    )).toEqual([
      expect.objectContaining({
        controlledEntityId: heroState.id,
        controllerEntityId: controllerState.id,
      }),
    ]);
    expect(session.eventsAfter(0, 10)).toEqual([
      expect.objectContaining({ type: "relationship.committed", sequence: 1 }),
    ]);
    expect(session.getWorldStateSnapshot(receipt.status === "committed"
      ? receipt.worldStateAfterRef
      : "unreachable")).toBe(publication.worldState);
  });

  it("replays exact command bytes without a second Adapter prepare", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    harness.queuePreparedTransition({
      projectedWorldStateAfter: projection(),
      projectedViewStateAfter: { viewStateRevision: 1 },
    });
    const command = bindCommand("command.idempotent");

    const first = await session.executeGameplayCommand(command);
    const replay = await session.executeGameplayCommand({ ...command });

    expect(replay).toBe(first);
    expect(harness.calls.filter(
      (call) => call.operation === "prepare-gameplay-transition",
    )).toHaveLength(1);
    expect(session.snapshot().publicationEpoch).toBe(1);
  });

  it("aborts an invalid staged projection and retains the previous publication", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    harness.queuePreparedTransition({
      projectedWorldStateAfter: { simulationTick: -1 },
      projectedViewStateAfter: { viewStateRevision: 1 },
    });

    const receipt = await session.executeGameplayCommand(
      bindCommand("command.invalid-projection"),
    );

    expect(receipt).toMatchObject({
      status: "rejected",
      diagnostic: { code: "ADAPTER_PREPARE_FAILED" },
    });
    expect(harness.abortCount).toBe(1);
    expect(harness.commitCount).toBe(0);
    expect(session.phase).toBe("ready");
    expect(session.snapshot().publicationEpoch).toBe(0);
  });

  it("rejects a command transaction that changes Adapter-owned World projection", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    harness.queuePreparedTransition({
      projectedWorldStateAfter: {
        ...projection(),
        spatialEntityStatesById: {
          [heroState.id]: {
            ...heroState,
            positionMetersXYZ: [9, 0, 0],
          },
        },
      },
      projectedViewStateAfter: { viewStateRevision: 1 },
    });

    const receipt = await session.executeGameplayCommand(
      bindCommand("command.world-authority-violation"),
    );

    expect(receipt).toMatchObject({
      status: "rejected",
      diagnostic: { code: "ADAPTER_PREPARE_FAILED" },
    });
    expect(harness.abortCount).toBe(1);
    expect(harness.commitCount).toBe(0);
    expect(session.snapshot().worldState.entityStatesById[heroState.id])
      .toMatchObject({ positionMetersXYZ: [0, 0, 0] });
  });

  it("fails closed with one world.failed Event when invalid-state abort rejects", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    harness.queuePreparedTransition({
      projectedWorldStateAfter: { simulationTick: -1 },
      projectedViewStateAfter: { viewStateRevision: 1 },
    });
    harness.failNextOperation(
      "abort",
      "reject",
      new Error("private adapter abort cause"),
    );

    const receipt = await session.executeGameplayCommand(
      bindCommand("command.abort-failure"),
    );

    expect(receipt).toMatchObject({
      status: "failed",
      diagnostic: { code: "ADAPTER_ABORT_FAILED" },
    });
    expect(JSON.stringify(receipt)).not.toContain("private adapter abort cause");
    expect(session.phase).toBe("failed");
    expect(session.snapshot()).toMatchObject({
      publicationEpoch: 1,
      gameplayInspection: {
        phase: "failed",
        lastEventSequence: 1,
        diagnostic: { code: "ADAPTER_ABORT_FAILED" },
      },
      worldState: { lastEventSequence: 1 },
    });
    expect(session.eventsAfter(0, 10)).toEqual([
      expect.objectContaining({ type: "world.failed", sequence: 1 }),
    ]);
    expect(harness.disposeCount).toBe(1);
  });

  it("selects the prebuilt failure bundle when commitPrepared violates no-throw", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    harness.queuePreparedTransition({
      projectedWorldStateAfter: projection(),
      projectedViewStateAfter: {
        viewStateRevision: 1,
      },
    });
    harness.failNextOperation(
      "commit-prepared",
      "throw",
      new Error("private adapter commit cause"),
    );

    const receipt = await session.executeGameplayCommand(
      bindCommand("command.commit-failure"),
    );

    expect(receipt).toMatchObject({
      status: "failed",
      diagnostic: { code: "ADAPTER_COMMIT_CONTRACT_VIOLATED" },
    });
    expect(JSON.stringify(receipt)).not.toContain("private adapter commit cause");
    expect(harness.commitCount).toBe(1);
    expect(harness.abortCount).toBe(0);
    expect(session.phase).toBe("failed");
    expect(session.snapshot()).toMatchObject({
      publicationEpoch: 1,
      gameplayInspection: {
        phase: "failed",
        relationshipStatesById: {},
      },
      viewState: { viewStateRevision: 0 },
    });
    expect(session.eventsAfter(0, 10)).toEqual([
      expect.objectContaining({
        type: "world.failed",
        diagnostic: expect.objectContaining({
          code: "ADAPTER_COMMIT_CONTRACT_VIOLATED",
        }),
      }),
    ]);
    expect(harness.disposeCount).toBe(1);
  });

  it("freezes command-admission closure at one Tick before Adapter availability", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create({
      ...options,
      gameplayCapacityBudget: {
        ...options.gameplayCapacityBudget,
        maximumIdempotencyRecordCount: 1,
        maximumRetainedReceiptCount: 1,
      },
    });
    await session.executeGameplayCommand({
      ...bindCommand("command.fill-retention"),
      controllerEntityId: "controller.unknown",
    });
    harness.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 0,
        maximumSemanticFactTransitionEventCount: 0,
      },
      worldProjectionAfter: projection(1),
    });
    await session.runFixedInput({ actions: [], ticks: 1 });

    const command = bindCommand("command.after-admission-closed");
    const first = await session.executeGameplayCommand(command);
    expect(first).toMatchObject({
      status: "rejected",
      simulationTick: 1,
      diagnostic: { code: "GAMEPLAY_CAPACITY_EXCEEDED" },
    });
    expect(harness.calls.some(({ operation }) => operation === "has-entity"))
      .toBe(false);

    harness.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 0,
        maximumSemanticFactTransitionEventCount: 0,
      },
      worldProjectionAfter: projection(2),
    });
    await session.runFixedInput({ actions: [], ticks: 1 });
    const replay = await session.executeGameplayCommand({ ...command });

    expect(replay).toEqual(first);
    expect(replay.id).toBe(first.id);
    expect(replay.simulationTick).toBe(1);
  });
});

describe("WorldSession Camera View command transaction", () => {
  const cameraCommand = (id = "camera-command.set") => ({
    type: "view.camera-preference.set" as const,
    schemaVersion: 1 as const,
    id,
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId: WORLD_SESSION_ID,
    cameraEntityId: "camera.local-player",
    cameraViewPreference: { mode: "first-person" as const },
  });
  const selection = (profileRef: string) => Object.freeze({
    cameraEntityId: "camera.local-player",
    activeCameraRigProfileRef: profileRef,
    activeCameraModifierRefs: Object.freeze(["worldkit://camera-modifier/collision@1"]),
    targetEntityId: heroState.id,
    matchedCameraContextRuleIds: Object.freeze(["ground"]),
    fallbackActive: false,
  });

  it("commits one View revision and Camera Event, then replays idempotently", async () => {
    const { options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    let executionCount = 0;
    const executor = async () => {
      executionCount += 1;
      return {
        previous: selection("worldkit://camera-profile/orbit@1"),
        next: selection("worldkit://camera-profile/first-person@1"),
      };
    };

    const first = await session.executeCameraViewCommand(cameraCommand(), executor);
    const replay = await session.executeCameraViewCommand(cameraCommand(), executor);

    expect(replay).toBe(first);
    expect(executionCount).toBe(1);
    expect(first).toMatchObject({
      status: "committed",
      viewStateRevision: 1,
      eventIds: [`camera-view-event:${WORLD_SESSION_ID}:1`],
    });
    expect(session.snapshot()).toMatchObject({
      publicationEpoch: 1,
      viewState: { viewStateRevision: 1 },
      gameplayInspection: { lastEventSequence: 1 },
    });
    expect(session.eventsAfter(0, 10)).toMatchObject([{
      type: "camera.selection.changed",
      sequence: 1,
      reason: "preference-changed",
      previousCameraRigProfileRef: "worldkit://camera-profile/orbit@1",
      activeCameraRigProfileRef: "worldkit://camera-profile/first-person@1",
    }]);
  });

  it("rejects conflicts and runtime failures without publishing a View revision", async () => {
    const { options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    const rejected = await session.executeCameraViewCommand(
      cameraCommand("camera-command.rejected"),
      () => { throw new Error("CAMERA_FIRST_PERSON_UNAVAILABLE"); },
    );
    expect(rejected).toMatchObject({
      status: "rejected",
      diagnostic: { code: "CAMERA_FIRST_PERSON_UNAVAILABLE" },
    });
    const conflict = await session.executeCameraViewCommand({
      ...cameraCommand("camera-command.rejected"),
      cameraViewPreference: { mode: "auto" as const },
    }, async () => ({
      previous: selection("before"),
      next: selection("after"),
    }));
    expect(conflict).toMatchObject({
      status: "rejected",
      diagnostic: { code: "COMMAND_ID_CONFLICT" },
    });
    expect(session.snapshot()).toMatchObject({
      publicationEpoch: 0,
      viewState: { viewStateRevision: 0 },
      gameplayInspection: { lastEventSequence: 0 },
    });
    expect(session.eventsAfter(0, 10)).toEqual([]);
  });

  it("shares command and Receipt retention capacity with Gameplay commands", async () => {
    const firstSetup = createHarnessAndOptions();
    const cameraFirst = await WorldSession.create({
      ...firstSetup.options,
      gameplayCapacityBudget: {
        ...firstSetup.options.gameplayCapacityBudget,
        maximumIdempotencyRecordCount: 1,
        maximumRetainedReceiptCount: 1,
      },
    });
    await cameraFirst.executeCameraViewCommand(cameraCommand(), async () => ({
      previous: selection("before"),
      next: selection("after"),
    }));

    const gameplayAfterCamera = await cameraFirst.executeGameplayCommand({
      ...bindCommand("command.after-camera-capacity"),
      controllerEntityId: "controller.unknown",
    });
    expect(gameplayAfterCamera).toMatchObject({
      status: "rejected",
      diagnostic: { code: "GAMEPLAY_CAPACITY_EXCEEDED" },
    });

    const secondSetup = createHarnessAndOptions();
    const gameplayFirst = await WorldSession.create({
      ...secondSetup.options,
      gameplayCapacityBudget: {
        ...secondSetup.options.gameplayCapacityBudget,
        maximumIdempotencyRecordCount: 1,
        maximumRetainedReceiptCount: 1,
      },
    });
    await gameplayFirst.executeGameplayCommand({
      ...bindCommand("command.fill-shared-capacity"),
      controllerEntityId: "controller.unknown",
    });
    let cameraExecutionCount = 0;
    const cameraAfterGameplay = await gameplayFirst.executeCameraViewCommand(
      cameraCommand("camera-command.after-gameplay-capacity"),
      async () => {
        cameraExecutionCount += 1;
        return { previous: selection("before"), next: selection("after") };
      },
    );
    expect(cameraAfterGameplay).toMatchObject({
      status: "rejected",
      diagnostic: { code: "VIEW_EVENT_CAPACITY_EXCEEDED" },
    });
    expect(cameraExecutionCount).toBe(0);
  });

  it("shares the next Event sequence with following Gameplay commits", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    await session.executeCameraViewCommand(cameraCommand(), async () => ({
      previous: selection("before"),
      next: selection("after"),
    }));
    harness.queuePreparedTransition({
      projectedWorldStateAfter: projection(),
      projectedViewStateAfter: { viewStateRevision: 2 },
    });
    const gameplayReceipt = await session.executeGameplayCommand(bindCommand());
    expect(gameplayReceipt.eventIds).toEqual([
      `gameplay-event:${WORLD_SESSION_ID}:2`,
    ]);
    expect(session.eventsAfter(0, 10).map((event) => event.sequence)).toEqual([1, 2]);
  });

  it("publishes automatic Context changes and explicit target unbinds in sequence", async () => {
    const { options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    const before = selection("worldkit://camera-profile/orbit@1");
    const mounted = {
      ...selection("worldkit://camera-profile/orbit@1"),
      targetEntityId: "entity.skateboard",
      activeCameraModifierRefs: ["worldkit://camera-modifier/mounted@1"],
      matchedCameraContextRuleIds: ["mounted"],
    };
    await session.publishCameraSelectionObservation(before, mounted);
    await session.publishCameraTargetUnbound(mounted, "control-released");
    expect(session.eventsAfter(0, 10)).toMatchObject([
      { type: "camera.selection.changed", sequence: 1, reason: "target-rebound" },
      { type: "camera.target.unbound", sequence: 2, reason: "control-released" },
    ]);
    expect(session.snapshot()).toMatchObject({
      publicationEpoch: 2,
      viewState: { viewStateRevision: 2 },
      gameplayInspection: { lastEventSequence: 2 },
    });
  });
});

describe("WorldSession fixed input", () => {
  it("returns the same publication for zero Ticks without consulting the Adapter", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    const initial = session.snapshot();

    const result = await session.runFixedInput({ actions: [], ticks: 0 });

    expect(result).toBe(initial);
    expect(harness.calls.map(({ operation }) => operation)).toEqual([
      "initialize",
    ]);
  });

  it("publishes every Tick so a transient Fact produces started then ended Events", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    const fact = touchingFact(1);
    harness.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 1,
        maximumSemanticFactTransitionEventCount: 1,
      },
      worldProjectionAfter: projection(1, { [fact.id]: fact }),
    });
    harness.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 0,
        maximumSemanticFactTransitionEventCount: 1,
      },
      worldProjectionAfter: projection(2),
    });

    const result = await session.runFixedInput({
      actions: ["move-forward"],
      ticks: 2,
    });

    expect(result).toBe(session.snapshot());
    expect(result).toMatchObject({
      publicationEpoch: 2,
      worldState: { simulationTick: 2, semanticFactsById: {} },
      gameplayInspection: { lastEventSequence: 2 },
    });
    expect(session.eventsAfter(0, 10)).toMatchObject([
      { type: "semantic-fact.started", simulationTick: 1, semanticFact: fact },
      { type: "semantic-fact.ended", simulationTick: 2, semanticFact: fact },
    ]);
    expect(harness.calls.filter(({ operation }) =>
      operation === "run-fixed-input-tick"
    )).toHaveLength(2);
  });

  it("rejects an over-budget estimate before advancing physics", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    harness.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput:
          DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1.maximumSemanticFactCount + 1,
        maximumSemanticFactTransitionEventCount: 0,
      },
      worldProjectionAfter: projection(1),
    });

    await expect(session.runFixedInput({ actions: [], ticks: 1 })).rejects
      .toMatchObject({
        diagnostic: { code: "GAMEPLAY_CAPACITY_EXCEEDED" },
      });
    expect(harness.calls.some(({ operation }) =>
      operation === "run-fixed-input-tick"
    )).toBe(false);
    expect(session.phase).toBe("ready");
    expect(session.snapshot().publicationEpoch).toBe(0);
  });

  it("fails closed and preserves the last publication when the Adapter skips a Tick", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    harness.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 0,
        maximumSemanticFactTransitionEventCount: 0,
      },
      worldProjectionAfter: projection(2),
    });

    const result = await session.runFixedInput({ actions: [], ticks: 2 });

    expect(session.phase).toBe("failed");
    expect(result).toBe(session.snapshot());
    expect(result).toMatchObject({
      publicationEpoch: 1,
      worldState: { simulationTick: 0 },
      gameplayInspection: {
        phase: "failed",
        lastEventSequence: 1,
        diagnostic: { code: "ADAPTER_FIXED_INPUT_FAILED" },
      },
    });
    expect(session.eventsAfter(0, 10)).toMatchObject([
      { type: "world.failed", simulationTick: 0, sequence: 1 },
    ]);
    expect(harness.calls.filter(({ operation }) =>
      operation === "run-fixed-input-tick"
    )).toHaveLength(1);
    expect(harness.disposeCount).toBe(1);
  });

  it("fails closed and disposes owned runtime resources for a malformed estimate", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    harness.queueFixedInputTick({
      capacityEstimate: {},
      worldProjectionAfter: projection(1),
    });

    const result = await session.runFixedInput({ actions: [], ticks: 2 });

    expect(result.gameplayInspection).toMatchObject({
      phase: "failed",
      diagnostic: { code: "ADAPTER_FIXED_INPUT_FAILED" },
    });
    expect(harness.calls.some(({ operation }) =>
      operation === "run-fixed-input-tick"
    )).toBe(false);
    expect(harness.disposeCount).toBe(1);
  });

  it("snapshots caller-owned actions before entering the mutation queue", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    harness.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 0,
        maximumSemanticFactTransitionEventCount: 0,
      },
      worldProjectionAfter: projection(1),
    });
    const barrier = harness.deferNextOperation("run-fixed-input-tick");
    const actions: string[] = ["camera-recenter"];

    const pending = session.runFixedInput({ actions, ticks: 1 });
    actions[0] = "camera-look-back";
    await barrier.entered;
    barrier.release();
    await pending;

    expect(harness.calls.find(({ operation }) =>
      operation === "run-fixed-input-tick"
    )?.input?.actions).toEqual(["camera-recenter"]);
  });

  it("neutralizes Subject input while the fixed-input Controller is unbound", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    harness.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 0,
        maximumSemanticFactTransitionEventCount: 0,
      },
      worldProjectionAfter: projection(1),
    });

    await session.runFixedInput({
      actions: ["move-forward", "primary-action", "camera-recenter"],
      axes: { moveXRatio: 0.5, throttleRatio: 1 },
      ticks: 1,
    });

    expect(harness.calls.find(({ operation }) =>
      operation === "run-fixed-input-tick"
    )?.input).toEqual({ actions: ["camera-recenter"], ticks: 1 });
  });

  it("forwards Subject input only after the fixed-input Controller is bound", async () => {
    const { harness, options } = createHarnessAndOptions();
    const session = await WorldSession.create(options);
    harness.queuePreparedTransition({
      projectedWorldStateAfter: projection(),
      projectedViewStateAfter: { viewStateRevision: 1 },
    });
    await session.executeGameplayCommand(bindCommand("command.bind-before-input"));
    harness.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 0,
        maximumSemanticFactTransitionEventCount: 0,
      },
      worldProjectionAfter: projection(1),
    });
    const barrier = harness.deferNextOperation("run-fixed-input-tick");
    const actions = ["move-forward", "primary-action"];
    const axes = { moveXRatio: 0.5, throttleRatio: 1 };

    const pending = session.runFixedInput({
      actions,
      axes,
      ticks: 1,
    });
    actions[0] = "move-backward";
    axes.moveXRatio = -1;
    await barrier.entered;
    expect(session.snapshot()).toMatchObject({
      publicationEpoch: 1,
      worldState: { simulationTick: 0 },
      gameplayInspection: { lastEventSequence: 1 },
    });
    expect(session.eventsAfter(0, 10)).toHaveLength(1);
    barrier.release();
    await pending;

    expect(harness.calls.find(({ operation }) =>
      operation === "run-fixed-input-tick"
    )?.input).toEqual({
      actions: ["move-forward", "primary-action"],
      axes: { moveXRatio: 0.5, throttleRatio: 1 },
      ticks: 1,
    });
  });
});
