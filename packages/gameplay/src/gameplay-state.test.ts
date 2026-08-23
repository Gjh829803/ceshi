import { describe, expect, it } from "vitest";

import {
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  type ActionActivateGameplayCommandV1,
  type ActionCancelGameplayCommandV1,
  type ControlBindGameplayCommandV1,
  type ControlReleaseGameplayCommandV1,
  type ControllerEntityStateV1,
  type GameplayCapacityBudgetV1,
  type GameplayCommandV1,
  type GameplayParticipantStateV1,
} from "@whitebox-world/gameplay-contracts";

import {
  createGameplayActionCatalogV1,
  deriveGameplayActionDefinitionContentHashV1,
  type GameplayActionDefinitionV1,
} from "./core-semantic-action-feature";
import {
  GameplayState,
  derivePossessedByRelationshipIdV1,
  type GameplayStateOptionsV1,
} from "./gameplay-state";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;

function definition(
  overrides: Partial<Omit<GameplayActionDefinitionV1, "contentHash">> = {},
): GameplayActionDefinitionV1 {
  const body = {
    kind: "semantic-action" as const,
    id: "wave",
    version: 1,
    resourceRef: "worldkit://semantic-action/wave@1",
    executionMode: "exclusive-per-subject" as const,
    completion: { mode: "explicit-cancel" as const },
    isMovementInputBlocked: false,
    allowedActorEntityDefinitionRefs: ["worldkit://entity/humanoid@1"],
    requiredActorCapabilityRefs: ["worldkit://capability/arms@1"],
    request: { mode: "none" as const },
    ...overrides,
  };
  return {
    ...body,
    contentHash: deriveGameplayActionDefinitionContentHashV1(body),
  };
}

function options(
  overrides: Partial<GameplayStateOptionsV1> = {},
): GameplayStateOptionsV1 {
  const participantStates: readonly GameplayParticipantStateV1[] = [
    { id: "participant-a", mode: "active" },
  ];
  const controllerStates: readonly ControllerEntityStateV1[] = [
    controller("controller-a"),
    controller("controller-b"),
  ];
  return {
    runtimeSessionId: "runtime-a",
    worldSessionId: "world-a",
    participantStates,
    controllerStates,
    entityDescriptors: [
      {
        id: "subject-a",
        entityDefinitionRef: "worldkit://entity/humanoid@1",
        capabilityRefs: ["worldkit://capability/arms@1"],
      },
      {
        id: "subject-b",
        entityDefinitionRef: "worldkit://entity/humanoid@1",
        capabilityRefs: ["worldkit://capability/arms@1"],
      },
    ],
    actionCatalog: createGameplayActionCatalogV1([definition()], 8),
    capacityBudget: {
      ...DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
      maximumControllerEntityCount: 2,
      maximumPossessedByRelationshipCount: 2,
    },
    ...overrides,
  };
}

function controller(id: string): ControllerEntityStateV1 {
  return {
    id,
    kind: "controller-entity-state",
    controllerDefinitionRef: "worldkit://controller/local@1",
    controllerDefinitionHash: HASH_A,
    participantId: "participant-a",
    lifecycleMode: "active",
    inputMode: "human",
  };
}

type WithoutSession<T extends GameplayCommandV1> = Omit<
  T,
  "schemaVersion" | "runtimeSessionId" | "worldSessionId"
>;

function command(input: WithoutSession<ControlBindGameplayCommandV1>): ControlBindGameplayCommandV1;
function command(input: WithoutSession<ControlReleaseGameplayCommandV1>): ControlReleaseGameplayCommandV1;
function command(input: WithoutSession<ActionActivateGameplayCommandV1>): ActionActivateGameplayCommandV1;
function command(input: WithoutSession<ActionCancelGameplayCommandV1>): ActionCancelGameplayCommandV1;
function command(
  input: object,
): GameplayCommandV1 {
  return {
    schemaVersion: 1,
    runtimeSessionId: "runtime-a",
    worldSessionId: "world-a",
    ...input,
  } as GameplayCommandV1;
}

function bind(
  state: GameplayState,
  controllerEntityId = "controller-a",
  controlledEntityId = "subject-a",
  id = `bind-${controllerEntityId}-${controlledEntityId}`,
  tick = 1,
): void {
  const result = state.planControl(command({
    id,
    type: "control.bind",
    controllerEntityId,
    controlledEntityId,
    expectedPossession: { mode: "unbound" },
  }), tick);
  if (result.status !== "planned") throw new Error(result.diagnostic.code);
  state.commit(result.transitionPlan);
}

describe("GameplayState possession", () => {
  it("plans without mutation and derives a deterministic relationship ID from the command", () => {
    const state = new GameplayState(options());
    const result = state.planControl(command({
      id: "bind:with/special chars",
      type: "control.bind",
      controllerEntityId: "controller-a",
      controlledEntityId: "subject-a",
      expectedPossession: { mode: "unbound" },
    }), 3);
    expect(result.status).toBe("planned");
    expect(state.possessionForController("controller-a")).toBeUndefined();
    if (result.status !== "planned") return;
    expect(result.transitionPlan.relationshipChanges[0]?.after?.id).toBe(
      derivePossessedByRelationshipIdV1("bind:with/special chars"),
    );
    expect(Object.isFrozen(result.transitionPlan)).toBe(true);
    expect(result.transitionPlan.capacityDelta).toEqual({
      relationshipStateCountDelta: 1,
      activeActionStateCountDelta: 0,
      retiredActionExecutionIdCountDelta: 0,
      requiredEventCount: 1,
    });
    state.commit(result.transitionPlan);
    expect(state.revision).toBe(1);
    expect(state.possessionForController("controller-a")).toMatchObject({
      controlledEntityId: "subject-a",
      controllerEntityId: "controller-a",
      establishedSimulationTick: 3,
    });
  });

  it("rebinds atomically with one revision and two event slots", () => {
    const state = new GameplayState(options());
    bind(state);
    const result = state.planControl(command({
      id: "rebind-b",
      type: "control.bind",
      controllerEntityId: "controller-a",
      controlledEntityId: "subject-b",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 5);
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.transitionPlan.relationshipChanges.map((change) => change.operation))
      .toEqual(["remove", "add"]);
    expect(result.transitionPlan.capacityDelta.requiredEventCount).toBe(2);
    state.commit(result.transitionPlan);
    expect(state.revision).toBe(2);
    expect(state.possessionForController("controller-a")?.controlledEntityId)
      .toBe("subject-b");
    expect(state.possessionForControlledEntity("subject-a")).toBeUndefined();
  });

  it("rejects stale, same-target, and both directions of double ownership", () => {
    const state = new GameplayState(options());
    bind(state);
    expect(state.planControl(command({
      id: "same",
      type: "control.bind",
      controllerEntityId: "controller-a",
      controlledEntityId: "subject-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 2)).toMatchObject({
      status: "rejected",
      diagnostic: { code: "CONTROL_ALREADY_OWNED" },
    });
    expect(state.planControl(command({
      id: "stale",
      type: "control.bind",
      controllerEntityId: "controller-a",
      controlledEntityId: "subject-b",
      expectedPossession: { mode: "unbound" },
    }), 2)).toMatchObject({
      status: "rejected",
      diagnostic: { code: "CONTROL_POSSESSION_STALE" },
    });
    expect(state.planControl(command({
      id: "other-controller",
      type: "control.bind",
      controllerEntityId: "controller-b",
      controlledEntityId: "subject-a",
      expectedPossession: { mode: "unbound" },
    }), 2)).toMatchObject({
      status: "rejected",
      diagnostic: { code: "CONTROL_ALREADY_OWNED" },
    });
    const secondTarget = state.planControl(command({
      id: "controller-a-b",
      type: "control.bind",
      controllerEntityId: "controller-a",
      controlledEntityId: "subject-b",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 2);
    expect(secondTarget.status).toBe("planned");
  });

  it("release validates before-images and a stale commit cannot partially mutate", () => {
    const state = new GameplayState(options());
    bind(state);
    const release = state.planControl(command({
      id: "release-a",
      type: "control.release",
      controllerEntityId: "controller-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 4);
    const rebind = state.planControl(command({
      id: "rebind-first",
      type: "control.bind",
      controllerEntityId: "controller-a",
      controlledEntityId: "subject-b",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 4);
    if (release.status !== "planned" || rebind.status !== "planned") return;
    state.commit(rebind.transitionPlan);
    expect(() => state.commit(release.transitionPlan)).toThrow(/GAMEPLAY_STATE_STALE/);
    expect(state.possessionForController("controller-a")?.controlledEntityId)
      .toBe("subject-b");
  });

  it("enforces relationship capacity at N and N+1", () => {
    const budget: GameplayCapacityBudgetV1 = {
      ...DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
      maximumControllerEntityCount: 2,
      maximumPossessedByRelationshipCount: 1,
    };
    const state = new GameplayState(options({ capacityBudget: budget }));
    bind(state, "controller-a", "subject-a");
    expect(state.planControl(command({
      id: "bind-second",
      type: "control.bind",
      controllerEntityId: "controller-b",
      controlledEntityId: "subject-b",
      expectedPossession: { mode: "unbound" },
    }), 2)).toMatchObject({
      status: "rejected",
      diagnostic: { code: "GAMEPLAY_CAPACITY_EXCEEDED" },
    });
  });

  it("projects only gameplay-owned maps through the canonical snapshot builder", () => {
    const state = new GameplayState(options());
    bind(state);
    const snapshot = state.projectWorldState({
      id: "snapshot-a",
      simulationTick: 4,
      worldPackageRef: "worldkit://world/a@1",
      worldPackageRootHash: HASH_A,
      executionPlanHash: HASH_B,
      spatialEntityStatesById: {
        "subject-a": {
          id: "subject-a",
          kind: "spatial-entity-state",
          entityDefinitionRef: "worldkit://entity/humanoid@1",
          entityDefinitionHash: HASH_B,
          semanticClassId: "humanoid",
          lifecycleMode: "active",
          positionMetersXYZ: [0, 0, 0],
          rotationQuaternionXYZW: [0, 0, 0, 1],
          scaleRatioXYZ: [1, 1, 1],
        },
      },
      capabilityStatesById: {},
      semanticFactsById: {},
      lastEventSequence: 1,
    });
    expect(snapshot.relationshipStatesById).toEqual({
      [derivePossessedByRelationshipIdV1("bind-controller-a-subject-a")]:
        expect.objectContaining({ type: "possessedBy" }),
    });
    expect(snapshot.entityStatesById["controller-a"]).toEqual(
      controller("controller-a"),
    );
    expect(snapshot.worldStateHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("prebuilds a complete post-transition projection without mutation, then commits the staged pointers", () => {
    const state = new GameplayState(options());
    const result = state.planControl(command({
      id: "bind-preview",
      type: "control.bind",
      controllerEntityId: "controller-a",
      controlledEntityId: "subject-a",
      expectedPossession: { mode: "unbound" },
    }), 2);
    if (result.status !== "planned") throw new Error("bind rejected");
    const projected = state.projectWorldStateAfter(result.transitionPlan, {
      id: "snapshot-after-bind",
      simulationTick: 2,
      worldPackageRef: "worldkit://world/a@1",
      worldPackageRootHash: HASH_A,
      executionPlanHash: HASH_B,
      spatialEntityStatesById: {
        "subject-a": {
          id: "subject-a",
          kind: "spatial-entity-state",
          entityDefinitionRef: "worldkit://entity/humanoid@1",
          entityDefinitionHash: HASH_B,
          semanticClassId: "humanoid",
          lifecycleMode: "active",
          positionMetersXYZ: [0, 0, 0],
          rotationQuaternionXYZW: [0, 0, 0, 1],
          scaleRatioXYZ: [1, 1, 1],
        },
      },
      capabilityStatesById: {},
      semanticFactsById: {},
      lastEventSequence: 1,
    });
    expect(projected.relationshipStatesById[
      derivePossessedByRelationshipIdV1("bind-preview")
    ]).toBeDefined();
    expect(state.revision).toBe(0);
    expect(state.possessionForController("controller-a")).toBeUndefined();
    state.commit(result.transitionPlan);
    expect(state.revision).toBe(1);
    expect(state.possessionForController("controller-a")?.controlledEntityId)
      .toBe("subject-a");
  });

  it("rejects Adapter projection attempts that overlap Gameplay-owned Controllers", () => {
    const state = new GameplayState(options());
    expect(() => state.projectWorldState({
      id: "overlap",
      simulationTick: 0,
      worldPackageRef: "worldkit://world/a@1",
      worldPackageRootHash: HASH_A,
      executionPlanHash: HASH_B,
      spatialEntityStatesById: {
        "controller-a": controller("controller-a") as never,
      },
      capabilityStatesById: {},
      semanticFactsById: {},
      lastEventSequence: 0,
    })).toThrow(/Spatial Entity State 'controller-a' is invalid|overlaps/);
  });

  it("projects inspection identity without a duplicate Controller target field", () => {
    const state = new GameplayState(options());
    bind(state);
    const inspection = state.projectGameplayInspection({
      id: "inspection-a",
      gameplayModeRef: "worldkit://gameplay-mode/test@1",
      phase: "ready",
      simulationTick: 1,
      activatedGameplayFeatureRefs: ["feature:b", "feature:a"],
      lastEventSequence: 1,
    });
    expect(inspection.activatedGameplayFeatureRefs).toEqual(["feature:a", "feature:b"]);
    expect(inspection.controllerStatesById["controller-a"]).toEqual({
      id: "controller-a",
      participantId: "participant-a",
    });
    expect(inspection.possessedByRelationshipsById).toHaveProperty(
      derivePossessedByRelationshipIdV1("bind-controller-a-subject-a"),
    );
  });

  it("produces the same semantic hash across Session identities", () => {
    const first = new GameplayState(options());
    const second = new GameplayState(options({
      runtimeSessionId: "runtime-b",
      worldSessionId: "world-b",
    }));
    bind(first, "controller-a", "subject-a", "shared-bind", 1);
    const secondBind = second.planControl({
      schemaVersion: 1,
      id: "shared-bind",
      type: "control.bind",
      runtimeSessionId: "runtime-b",
      worldSessionId: "world-b",
      controllerEntityId: "controller-a",
      controlledEntityId: "subject-a",
      expectedPossession: { mode: "unbound" },
    }, 1);
    if (secondBind.status !== "planned") throw new Error("bind rejected");
    second.commit(secondBind.transitionPlan);
    const context = {
      id: "snapshot-a",
      simulationTick: 1,
      worldPackageRef: "worldkit://world/a@1",
      worldPackageRootHash: HASH_A,
      executionPlanHash: HASH_B,
      spatialEntityStatesById: {
        "subject-a": {
          id: "subject-a",
          kind: "spatial-entity-state" as const,
          entityDefinitionRef: "worldkit://entity/humanoid@1",
          entityDefinitionHash: HASH_B,
          semanticClassId: "humanoid",
          lifecycleMode: "active" as const,
          positionMetersXYZ: [0, 0, 0] as const,
          rotationQuaternionXYZW: [0, 0, 0, 1] as const,
          scaleRatioXYZ: [1, 1, 1] as const,
        },
      },
      capabilityStatesById: {},
      semanticFactsById: {},
      lastEventSequence: 1,
    };
    expect(first.projectWorldState(context).worldStateHash).toBe(
      second.projectWorldState({ ...context, id: "snapshot-b" }).worldStateHash,
    );
  });
});

describe("GameplayState actions", () => {
  it("activates only for the expected possessed actor and enforces availability", () => {
    const state = new GameplayState(options());
    bind(state);
    const planned = state.planAction(command({
      id: "activate-wave",
      type: "action.activate",
      controllerEntityId: "controller-a",
      actionExecutionId: "execution-wave",
      semanticActionRef: "worldkit://semantic-action/wave@1",
      actorEntityId: "subject-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 10);
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    state.commit(planned.transitionPlan);
    expect(state.activeActionState("execution-wave")).toMatchObject({
      mode: "active",
      semanticActionRef: "worldkit://semantic-action/wave@1",
      actorEntityId: "subject-a",
    });
    expect(state.planAction(command({
      id: "wrong-actor",
      type: "action.activate",
      controllerEntityId: "controller-a",
      actionExecutionId: "execution-wrong",
      semanticActionRef: "worldkit://semantic-action/wave@1",
      actorEntityId: "subject-b",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 11)).toMatchObject({
      status: "rejected",
      diagnostic: { code: "ACTION_NOT_AVAILABLE_FOR_ACTOR" },
    });
  });

  it("enforces exclusive actions and permanent retired execution IDs", () => {
    const state = new GameplayState(options());
    bind(state);
    const activate = state.planAction(command({
      id: "activate-wave",
      type: "action.activate",
      controllerEntityId: "controller-a",
      actionExecutionId: "execution-wave",
      semanticActionRef: "worldkit://semantic-action/wave@1",
      actorEntityId: "subject-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 10);
    if (activate.status !== "planned") return;
    state.commit(activate.transitionPlan);
    expect(state.planAction(command({
      id: "activate-second",
      type: "action.activate",
      controllerEntityId: "controller-a",
      actionExecutionId: "execution-second",
      semanticActionRef: "worldkit://semantic-action/wave@1",
      actorEntityId: "subject-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 11)).toMatchObject({ status: "rejected", diagnostic: { code: "ACTION_ALREADY_ACTIVE" } });
    const cancel = state.planAction(command({
      id: "cancel-wave",
      type: "action.cancel",
      controllerEntityId: "controller-a",
      actionExecutionId: "execution-wave",
      actorEntityId: "subject-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 12);
    if (cancel.status !== "planned") return;
    state.commit(cancel.transitionPlan);
    expect(state.retiredActionExecutionIds()).toEqual(["execution-wave"]);
    expect(state.planAction(command({
      id: "reuse-wave",
      type: "action.activate",
      controllerEntityId: "controller-a",
      actionExecutionId: "execution-wave",
      semanticActionRef: "worldkit://semantic-action/wave@1",
      actorEntityId: "subject-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 13)).toMatchObject({
      status: "rejected",
      diagnostic: { code: "ACTION_EXECUTION_ID_CONFLICT" },
    });
  });

  it("completes fixed-duration actions in stable scheduled-tick then ID order", () => {
    const fixedA = definition({
      id: "fixed",
      resourceRef: "worldkit://semantic-action/fixed@1",
      completion: { mode: "fixed-duration", durationTicks: 5 },
    });
    const state = new GameplayState(options({
      controllerStates: [
        controller("controller-a"),
        controller("controller-b"),
      ],
      actionCatalog: createGameplayActionCatalogV1([fixedA], 8),
    }));
    bind(state, "controller-a", "subject-a", "bind-a", 1);
    bind(state, "controller-b", "subject-b", "bind-b", 1);
    for (const [controllerEntityId, actorEntityId, actionExecutionId] of [
      ["controller-b", "subject-b", "z-execution"],
      ["controller-a", "subject-a", "a-execution"],
    ] as const) {
      const activation = state.planAction(command({
        id: `activate-${actionExecutionId}`,
        type: "action.activate",
        controllerEntityId,
        actionExecutionId,
        semanticActionRef: fixedA.resourceRef,
        actorEntityId,
        expectedPossession: { mode: "possessed", controlledEntityId: actorEntityId },
      }), 10);
      if (activation.status !== "planned") throw new Error("activation rejected");
      state.commit(activation.transitionPlan);
    }
    const completion = state.planDueActionCompletions(15);
    expect(completion?.completedActionExecutionIds).toEqual([
      "a-execution",
      "z-execution",
    ]);
    if (completion === undefined) return;
    expect(completion.commandId).toBeUndefined();
    state.commit(completion);
    expect(state.retiredActionExecutionIds()).toEqual(["a-execution", "z-execution"]);
  });

  it("enforces independent active and retired capacities", () => {
    const budget = {
      ...DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
      maximumControllerEntityCount: 2,
      maximumPossessedByRelationshipCount: 2,
      maximumActiveActionStateCount: 1,
      maximumRetiredActionExecutionIdCount: 1,
    };
    const state = new GameplayState(options({ capacityBudget: budget }));
    bind(state);
    const activation = state.planAction(command({
      id: "activate-1",
      type: "action.activate",
      controllerEntityId: "controller-a",
      actionExecutionId: "execution-1",
      semanticActionRef: "worldkit://semantic-action/wave@1",
      actorEntityId: "subject-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 2);
    if (activation.status !== "planned") return;
    state.commit(activation.transitionPlan);
    const cancel = state.planAction(command({
      id: "cancel-1",
      type: "action.cancel",
      controllerEntityId: "controller-a",
      actionExecutionId: "execution-1",
      actorEntityId: "subject-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 3);
    if (cancel.status !== "planned") return;
    state.commit(cancel.transitionPlan);
    expect(state.planAction(command({
      id: "activate-2",
      type: "action.activate",
      controllerEntityId: "controller-a",
      actionExecutionId: "execution-2",
      semanticActionRef: "worldkit://semantic-action/wave@1",
      actorEntityId: "subject-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 4)).toMatchObject({
      status: "rejected",
      diagnostic: { code: "GAMEPLAY_CAPACITY_EXCEEDED" },
    });
  });

  it("enforces active capacity independently across actors", () => {
    const fixed = definition({
      id: "fixed",
      resourceRef: "worldkit://semantic-action/fixed@1",
      completion: { mode: "fixed-duration", durationTicks: 10 },
    });
    const state = new GameplayState(options({
      capacityBudget: {
        ...DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
        maximumControllerEntityCount: 2,
        maximumPossessedByRelationshipCount: 2,
        maximumActiveActionStateCount: 1,
      },
      actionCatalog: createGameplayActionCatalogV1([fixed], 1),
    }));
    bind(state, "controller-a", "subject-a", "bind-a");
    bind(state, "controller-b", "subject-b", "bind-b");
    const first = state.planAction(command({
      id: "activate-a",
      type: "action.activate",
      controllerEntityId: "controller-a",
      actionExecutionId: "execution-a",
      semanticActionRef: fixed.resourceRef,
      actorEntityId: "subject-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 2);
    if (first.status !== "planned") throw new Error("activation rejected");
    state.commit(first.transitionPlan);
    expect(state.planAction(command({
      id: "activate-b",
      type: "action.activate",
      controllerEntityId: "controller-b",
      actionExecutionId: "execution-b",
      semanticActionRef: fixed.resourceRef,
      actorEntityId: "subject-b",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-b" },
    }), 2)).toMatchObject({
      status: "rejected",
      diagnostic: { code: "GAMEPLAY_CAPACITY_EXCEEDED" },
    });
  });

  it("validates required Action Request schema locks", () => {
    const requested = definition({
      id: "equip",
      resourceRef: "worldkit://semantic-action/equip@1",
      request: {
        mode: "required",
        actionRequestSchemaRef: "worldkit://schema/equip-request@1",
        actionRequestSchemaHash: HASH_A,
      },
    });
    const state = new GameplayState(options({
      actionCatalog: createGameplayActionCatalogV1([requested], 1),
      actionRequestResolver: (ref, hash) =>
        ref === "worldkit://request/equip-a@1" && hash === HASH_B
          ? {
              actionRequestSchemaRef: "worldkit://schema/equip-request@1",
              actionRequestSchemaHash: HASH_A,
            }
          : undefined,
    }));
    bind(state);
    const base = {
      id: "activate-equip",
      type: "action.activate" as const,
      controllerEntityId: "controller-a",
      actionExecutionId: "execution-equip",
      semanticActionRef: requested.resourceRef,
      actorEntityId: "subject-a",
      expectedPossession: {
        mode: "possessed" as const,
        controlledEntityId: "subject-a",
      },
    };
    expect(state.planAction(command(base), 2)).toMatchObject({
      status: "rejected",
      diagnostic: { code: "ACTION_REQUEST_INVALID" },
    });
    expect(state.planAction(command({
      ...base,
      actionRequestRef: "worldkit://request/equip-a@1",
      actionRequestHash: HASH_A,
    }), 2)).toMatchObject({
      status: "rejected",
      diagnostic: { code: "ACTION_REQUEST_INVALID" },
    });
    expect(state.planAction(command({
      ...base,
      actionRequestRef: "worldkit://request/equip-a@1",
      actionRequestHash: HASH_B,
    }), 2).status).toBe("planned");
  });

  it("supports special execution IDs without prototype mutation and blocks control changes when declared", () => {
    const blocking = definition({ isMovementInputBlocked: true });
    const state = new GameplayState(options({
      actionCatalog: createGameplayActionCatalogV1([blocking], 1),
    }));
    bind(state);
    const activation = state.planAction(command({
      id: "activate-special",
      type: "action.activate",
      controllerEntityId: "controller-a",
      actionExecutionId: "__proto__",
      semanticActionRef: blocking.resourceRef,
      actorEntityId: "subject-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 2);
    if (activation.status !== "planned") throw new Error("activation rejected");
    state.commit(activation.transitionPlan);
    expect(state.activeActionState("__proto__")?.id).toBe("__proto__");
    expect(state.isMovementInputBlocked("controller-a")).toBe(true);
    expect(state.planControl(command({
      id: "release-blocked",
      type: "control.release",
      controllerEntityId: "controller-a",
      expectedPossession: { mode: "possessed", controlledEntityId: "subject-a" },
    }), 3)).toMatchObject({
      status: "rejected",
      diagnostic: { code: "ACTION_BLOCKS_CONTROL_CHANGE" },
    });
  });
});
