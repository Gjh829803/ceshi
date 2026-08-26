import {
  createGameplayActionDefinitionV1,
  createGameplayBootstrapV1,
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  deriveGameplaySemanticFactIdV1,
  type ActionActivateGameplayCommandV1,
  type ControllerEntityStateV1,
  type GameplayActionDefinitionV1,
  type GameplayParticipantStateV1,
  type GameplaySemanticFactV1,
  type SpatialEntityStateV1,
} from "@whitebox-world/gameplay-contracts";
import {
  ACTION_PROJECTION_CAPABILITY_REF,
  CONTROL_TRANSITION_CAPABILITY_REF,
  createCoreControlFeatureFactoryV1,
  createCoreSemanticActionFeatureFactoryV1,
  type GameplayModeV1,
} from "@whitebox-world/gameplay";
import { describe, expect, it } from "vitest";

import {
  createFakeGameplayWorldPortHarnessV1,
} from "./test/fake-gameplay-world-adapter";
import { WorldSession } from "./world-session";

const HASH = `sha256:${"a".repeat(64)}` as const;
const RUNTIME_SESSION_ID = "runtime.fixed-actions";
const WORLD_SESSION_ID = "world.fixed-actions";
const WORLD_PACKAGE_REF = "worldkit://world-package/fixed-actions@1";
const HERO_DEFINITION_REF = "worldkit://entity-definition/humanoid@1";
const ACTION_REF = "worldkit://semantic-action/blocking-pose@1";

const participantState = Object.freeze({
  id: "participant.primary",
  mode: "active",
}) satisfies GameplayParticipantStateV1;

function controllerState(id: string): ControllerEntityStateV1 {
  return Object.freeze({
    id,
    kind: "controller-entity-state",
    controllerDefinitionRef: "worldkit://controller-definition/local@1",
    controllerDefinitionHash: HASH,
    participantId: participantState.id,
    lifecycleMode: "active",
    inputMode: "human",
  });
}

function spatialEntityState(
  id: string,
  semanticClassId = "character.humanoid",
): SpatialEntityStateV1 {
  return Object.freeze({
    id,
    kind: "spatial-entity-state",
    entityDefinitionRef: semanticClassId === "character.humanoid"
      ? HERO_DEFINITION_REF
      : "worldkit://entity-definition/wall@1",
    entityDefinitionHash: HASH,
    semanticClassId,
    lifecycleMode: "active",
    positionMetersXYZ: [0, 0, 0] as const,
    rotationQuaternionXYZW: [0, 0, 0, 1] as const,
    scaleRatioXYZ: [1, 1, 1] as const,
    linearVelocityMetersPerSecondXYZ: [0, 0, 0] as const,
  });
}

const heroA = spatialEntityState("entity.hero.a");
const heroB = spatialEntityState("entity.hero.b");
const wall = spatialEntityState("entity.wall", "structure.wall");

function touchingFact(
  firstEntityId: string,
  secondEntityId: string,
  startedSimulationTick: number,
): GameplaySemanticFactV1 {
  const body = {
    type: "touching" as const,
    schemaVersion: 1 as const,
    entityIds: [firstEntityId, secondEntityId] as const,
    startedSimulationTick,
    semanticFactProjectorProfileRef:
      "worldkit://semantic-fact-projector/default@1",
    semanticFactProjectorProfileHash: HASH,
  };
  return Object.freeze({ ...body, id: deriveGameplaySemanticFactIdV1(body) });
}

function actionDefinition(
  durationTicks: number,
): GameplayActionDefinitionV1 {
  return createGameplayActionDefinitionV1({
    kind: "semantic-action",
    id: "blocking-pose",
    version: 1,
    resourceRef: ACTION_REF,
    executionMode: "exclusive-per-subject",
    completion: { mode: "fixed-duration", durationTicks },
    effect: { mode: "state-only" },
    isMovementInputBlocked: true,
    allowedActorEntityDefinitionRefs: [HERO_DEFINITION_REF],
    requiredActorCapabilityRefs: [],
    request: { mode: "none" },
  });
}

function projection(
  simulationTick: number,
  semanticFactsById: Readonly<Record<string, GameplaySemanticFactV1>> = {},
) {
  return Object.freeze({
    simulationTick,
    spatialEntityStatesById: Object.freeze({
      [heroA.id]: heroA,
      [heroB.id]: heroB,
      [wall.id]: wall,
    }),
    capabilityStatesById: Object.freeze({}),
    semanticFactsById: Object.freeze({ ...semanticFactsById }),
  });
}

const controlFeatureFactory = createCoreControlFeatureFactoryV1();
const semanticActionFeatureFactory =
  createCoreSemanticActionFeatureFactoryV1();
const gameplayMode = Object.freeze({
  gameplayModeRef: "worldkit://gameplay-mode/exploration@1",
  evaluateCommand: () => Object.freeze({ status: "accepted" as const }),
}) satisfies GameplayModeV1;

function createHarnessAndOptions(input: Readonly<{
  durationTicks: number;
  controllerIds?: readonly string[];
  heroIds?: readonly string[];
  initialSemanticFactsById?: Readonly<Record<string, GameplaySemanticFactV1>>;
}>) {
  const controllerIds = input.controllerIds ?? ["controller.a"];
  const heroIds = input.heroIds ?? [heroA.id];
  const definition = actionDefinition(input.durationTicks);
  const controllers = controllerIds.map(controllerState);
  const gameplayBootstrap = createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: "gameplay.fixed-actions",
    version: 1,
    resourceRef: "worldkit://gameplay-bootstrap/fixed-actions@1",
    entityDescriptors: heroIds.map((id) => ({
      id,
      entityDefinitionRef: HERO_DEFINITION_REF,
      capabilityRefs: [CONTROL_TRANSITION_CAPABILITY_REF],
    })),
    featureResourceLocks: [
      {
        resourceRef: controlFeatureFactory.manifest.resourceRef,
        contentHash: controlFeatureFactory.manifest.contentHash,
      },
      {
        resourceRef: semanticActionFeatureFactory.manifest.resourceRef,
        contentHash: semanticActionFeatureFactory.manifest.contentHash,
      },
    ],
    semanticActionDefinitions: [definition],
    availableCapabilityRefs: [
      ACTION_PROJECTION_CAPABILITY_REF,
      CONTROL_TRANSITION_CAPABILITY_REF,
    ],
  });
  const harness = createFakeGameplayWorldPortHarnessV1({
    initialWorldProjection: projection(
      0,
      input.initialSemanticFactsById,
    ),
    controllableEntityIds: heroIds,
    availableActions: heroIds.map((actorEntityId) => ({
      actorEntityId,
      semanticActionRef: definition.resourceRef,
    })),
  });
  return {
    definition,
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
      controllerStates: controllers,
      fixedInputControllerEntityId: controllers[0]!.id,
      gameplayModeFactory: () => gameplayMode,
      gameplayFeatureFactories: [
        controlFeatureFactory,
        semanticActionFeatureFactory,
      ],
      gameplayCapacityBudget: {
        ...DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
        maximumControllerEntityCount: controllerIds.length,
        maximumRelationshipStateCount: controllerIds.length,
      },
      worldPort: harness.port,
    },
  } as const;
}

function bindCommand(
  controllerEntityId: string,
  controlledEntityId: string,
) {
  return {
    schemaVersion: 1 as const,
    id: `command.bind.${controllerEntityId}`,
    type: "control.bind" as const,
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId: WORLD_SESSION_ID,
    controllerEntityId,
    controlledEntityId,
    expectedPossession: { mode: "unbound" as const },
  };
}

function activateCommand(
  controllerEntityId: string,
  actorEntityId: string,
  actionExecutionId: string,
): ActionActivateGameplayCommandV1 {
  return {
    schemaVersion: 1,
    id: `command.activate.${actionExecutionId}`,
    type: "action.activate",
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId: WORLD_SESSION_ID,
    controllerEntityId,
    actionExecutionId,
    semanticActionRef: ACTION_REF,
    actorEntityId,
    expectedPossession: { mode: "possessed", controlledEntityId: actorEntityId },
  };
}

async function bindAndActivate(
  session: WorldSession,
  controllerEntityId: string,
  actorEntityId: string,
  actionExecutionId: string,
): Promise<void> {
  await expect(session.executeGameplayCommand(
    bindCommand(controllerEntityId, actorEntityId),
  )).resolves.toMatchObject({ status: "committed" });
  await expect(session.executeGameplayCommand(
    activateCommand(controllerEntityId, actorEntityId, actionExecutionId),
  )).resolves.toMatchObject({ status: "committed" });
}

function fixedInputCalls(
  harness: ReturnType<typeof createFakeGameplayWorldPortHarnessV1>,
) {
  return harness.calls.filter(({ operation }) =>
    operation === "run-fixed-input-tick"
  );
}

describe("WorldSession fixed-duration Action input arbitration", () => {
  it("blocks movement through the completion Tick and restores it on the following Tick", async () => {
    const { harness, options } = createHarnessAndOptions({ durationTicks: 2 });
    const session = await WorldSession.create(options);
    await bindAndActivate(session, "controller.a", heroA.id, "execution.blocking");
    for (const simulationTick of [1, 2, 3]) {
      harness.queueFixedInputTick({
        capacityEstimate: {
          maximumSemanticFactCountAfterInput: 0,
          maximumSemanticFactTransitionEventCount: 0,
        },
        worldProjectionAfter: projection(simulationTick),
      });
    }
    const input = {
      actions: ["move-forward", "primary-action", "camera-recenter"],
      axes: { moveXRatio: 0.75, throttleRatio: 1 },
      ticks: 1,
    } as const;

    await session.runFixedInput(input);
    expect(session.snapshot().gameplayInspection.activeActionStatesById)
      .toHaveProperty("execution.blocking");
    await session.runFixedInput(input);
    expect(session.snapshot().gameplayInspection.activeActionStatesById)
      .not.toHaveProperty("execution.blocking");
    await session.runFixedInput(input);

    expect(fixedInputCalls(harness).map(({ input: forwarded }) => forwarded))
      .toEqual([
        { actions: ["primary-action", "camera-recenter"], ticks: 1 },
        { actions: ["primary-action", "camera-recenter"], ticks: 1 },
        input,
      ]);
    const completion = session.eventsAfter(0, 20).find(({ type }) =>
      type === "action.completed"
    );
    expect(completion).toMatchObject({
      type: "action.completed",
      simulationTick: 2,
      actionExecutionId: "execution.blocking",
    });
    expect(completion).not.toHaveProperty("commandId");
  });
});

describe("WorldSession same-Tick fixed-input Event order", () => {
  it("publishes ended Facts, started Facts, then natural completions in canonical order", async () => {
    const endedFacts = [
      touchingFact(heroA.id, wall.id, 0),
      touchingFact(heroB.id, wall.id, 0),
    ];
    const startedFacts = [
      touchingFact(heroA.id, wall.id, 1),
      touchingFact(heroB.id, wall.id, 1),
    ];
    const { harness, options } = createHarnessAndOptions({
      durationTicks: 1,
      controllerIds: ["controller.a", "controller.b"],
      heroIds: [heroA.id, heroB.id],
      initialSemanticFactsById: Object.fromEntries(
        endedFacts.map((fact) => [fact.id, fact]),
      ),
    });
    const session = await WorldSession.create(options);
    await bindAndActivate(session, "controller.a", heroA.id, "z-execution");
    await bindAndActivate(session, "controller.b", heroB.id, "ä-execution");
    const afterEventSequence =
      session.snapshot().gameplayInspection.lastEventSequence;
    harness.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 2,
        maximumSemanticFactTransitionEventCount: 4,
      },
      worldProjectionAfter: projection(1, Object.fromEntries(
        startedFacts.map((fact) => [fact.id, fact]),
      )),
    });

    await session.runFixedInput({ actions: [], ticks: 1 });

    const events = session.eventsAfter(afterEventSequence, 20);
    expect(events.map(({ type }) => type)).toEqual([
      "semantic-fact.ended",
      "semantic-fact.ended",
      "semantic-fact.started",
      "semantic-fact.started",
      "action.completed",
      "action.completed",
    ]);
    expect(events.map(({ sequence }) => sequence)).toEqual([
      afterEventSequence + 1,
      afterEventSequence + 2,
      afterEventSequence + 3,
      afterEventSequence + 4,
      afterEventSequence + 5,
      afterEventSequence + 6,
    ]);
    expect(events.slice(0, 2).map((event) =>
      event.type === "semantic-fact.ended" ? event.semanticFact.id : ""
    )).toEqual(endedFacts.map(({ id }) => id).sort());
    expect(events.slice(2, 4).map((event) =>
      event.type === "semantic-fact.started" ? event.semanticFact.id : ""
    )).toEqual(startedFacts.map(({ id }) => id).sort());
    expect(events.slice(4).map((event) =>
      event.type === "action.completed" ? event.actionExecutionId : ""
    )).toEqual(["z-execution", "ä-execution"]);
    for (const event of events.slice(4)) {
      expect(event).not.toHaveProperty("commandId");
    }
  });
});

describe("WorldSession fixed-input estimate breaches with due Actions", () => {
  it.each([
    ["after-count", {
      maximumSemanticFactCountAfterInput: 0,
      maximumSemanticFactTransitionEventCount: 1,
    }],
    ["transition-count", {
      maximumSemanticFactCountAfterInput: 1,
      maximumSemanticFactTransitionEventCount: 0,
    }],
  ] as const)(
    "fails closed for an under-reported %s without consuming the natural completion",
    async (_dimension, capacityEstimate) => {
      const { harness, options } = createHarnessAndOptions({ durationTicks: 1 });
      const session = await WorldSession.create(options);
      await bindAndActivate(
        session,
        "controller.a",
        heroA.id,
        "execution.due-on-breach",
      );
      const before = session.snapshot();
      const fact = touchingFact(heroA.id, wall.id, 1);
      harness.queueFixedInputTick({
        capacityEstimate,
        worldProjectionAfter: projection(1, { [fact.id]: fact }),
      });

      const failed = await session.runFixedInput({ actions: [], ticks: 1 });

      expect(fixedInputCalls(harness)).toHaveLength(1);
      expect(session.phase).toBe("failed");
      expect(failed).toBe(session.snapshot());
      expect(failed).toMatchObject({
        publicationEpoch: before.publicationEpoch + 1,
        worldState: { simulationTick: 0 },
        gameplayInspection: {
          phase: "failed",
          activeActionStatesById: {
            "execution.due-on-breach": {
              mode: "active",
              lastTransitionSimulationTick: 0,
            },
          },
          diagnostic: { code: "ADAPTER_FIXED_INPUT_FAILED" },
        },
      });
      expect(session.eventsAfter(
        before.gameplayInspection.lastEventSequence,
        10,
      )).toMatchObject([{
        type: "world.failed",
        simulationTick: 0,
        sequence: before.gameplayInspection.lastEventSequence + 1,
      }]);
      expect(session.eventsAfter(0, 20).some(({ type }) =>
        type === "action.completed"
      )).toBe(false);
      expect(harness.disposeCount).toBe(1);
      const firstDispose = session.dispose();
      const secondDispose = session.dispose();
      expect(secondDispose).toBe(firstDispose);
      await firstDispose;
      expect(harness.disposeCount).toBe(1);
    },
  );
});
