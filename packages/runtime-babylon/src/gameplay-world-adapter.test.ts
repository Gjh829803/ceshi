import type {
  FixedInputOneTickV1,
  GameplayFixedTickActionProjectionV1,
  GameplayWorldPortV1,
  GameplayWorldStateProjectionV1,
  GameplayWorldTransactionV1,
  GameplayWorldTransitionV1,
} from "@whitebox-world/runtime-host";
import type { GameplayActionStateV1 } from "@whitebox-world/gameplay-contracts";
import { describe, expect, it, vi } from "vitest";

import {
  BABYLON_GAMEPLAY_RUNTIME_INTERNAL,
  type BabylonGameplayPossessionTargetV1,
  type BabylonGameplayMountedTransitionV1,
  type BabylonGameplayRuntimeInternalV1,
} from "./gameplay-runtime-internal";
import { createBabylonGameplayWorldPortV1 } from "./gameplay-world-adapter";

const HASH = `sha256:${"a".repeat(64)}` as const;
const FIXED_INPUT_CONTROLLER_ENTITY_ID = "controller-primary";
const ACTION_REF = "worldkit://semantic-action/emote.salute@1";

function actionState(
  id = "action-execution:salute",
): GameplayActionStateV1 {
  return Object.freeze({
    id,
    kind: "action-state" as const,
    semanticActionRef: ACTION_REF,
    semanticActionHash: HASH,
    actorEntityId: "subject-a",
    mode: "active" as const,
    startedSimulationTick: 0,
    lastTransitionSimulationTick: 0,
  });
}

function fixedTickActionProjection(
  simulationTick = 1,
): GameplayFixedTickActionProjectionV1 {
  const state = actionState();
  return Object.freeze({
    simulationTick,
    activeActionStatesById: Object.freeze({ [state.id]: state }),
  });
}

function stateOnlyActionTransition(): GameplayWorldTransitionV1 {
  const state = actionState();
  return Object.freeze({
    kind: "gameplay-transition-plan" as const,
    schemaVersion: 1 as const,
    type: "action.activate" as const,
    commandId: "command:salute",
    expectedStateRevision: 0,
    relationshipChanges: Object.freeze([]),
    actionChanges: Object.freeze([Object.freeze({
      operation: "add" as const,
      after: Object.freeze({
        state,
        isMovementInputBlocked: false,
      }),
    })]),
    newlyCommittedActionExecutionIds: Object.freeze([state.id]),
    capacityDelta: Object.freeze({
      relationshipStateCountDelta: 0,
      activeActionStateCountDelta: 1,
      usedActionExecutionIdCountDelta: 1,
      immediateEventCount: 1,
      terminalEventReservationCountDelta: 0,
    }),
  });
}

function worldProjection(
  simulationTick = 0,
): GameplayWorldStateProjectionV1 {
  return Object.freeze({
    simulationTick,
    spatialEntityStatesById: Object.freeze({
      "subject-a": Object.freeze({
        id: "subject-a",
        kind: "spatial-entity-state" as const,
        entityDefinitionRef: "worldkit://subject-definition/a@1",
        entityDefinitionHash: HASH,
        semanticClassId: "subject.a",
        lifecycleMode: "active" as const,
        positionMetersXYZ: [0, 0, 0] as const,
        rotationQuaternionXYZW: [0, 0, 0, 1] as const,
        scaleRatioXYZ: [1, 1, 1] as const,
      }),
      "subject-b": Object.freeze({
        id: "subject-b",
        kind: "spatial-entity-state" as const,
        entityDefinitionRef: "worldkit://subject-definition/b@1",
        entityDefinitionHash: HASH,
        semanticClassId: "subject.b",
        lifecycleMode: "active" as const,
        positionMetersXYZ: [2, 0, 0] as const,
        rotationQuaternionXYZW: [0, 0, 0, 1] as const,
        scaleRatioXYZ: [1, 1, 1] as const,
      }),
    }),
    capabilityStatesById: Object.freeze({}),
    semanticFactsById: Object.freeze({}),
  });
}

function relationship(
  controlledEntityId: string,
  establishedSimulationTick: number,
  controllerEntityId = FIXED_INPUT_CONTROLLER_ENTITY_ID,
) {
  return Object.freeze({
    id: `possession:${controlledEntityId}:${establishedSimulationTick}`,
    type: "possessedBy" as const,
    schemaVersion: 1 as const,
    controlledEntityId,
    controllerEntityId,
    establishedSimulationTick,
  });
}

function transition(
  type: "control.bind" | "control.release",
  relationshipChanges: GameplayWorldTransitionV1["relationshipChanges"],
): GameplayWorldTransitionV1 {
  return Object.freeze({
    kind: "gameplay-transition-plan" as const,
    schemaVersion: 1 as const,
    type,
    commandId: `command:${type}`,
    expectedStateRevision: 0,
    relationshipChanges: Object.freeze([...relationshipChanges]),
    actionChanges: Object.freeze([]),
    newlyCommittedActionExecutionIds: Object.freeze([]),
    capacityDelta: Object.freeze({
      relationshipStateCountDelta: 0,
      activeActionStateCountDelta: 0,
      usedActionExecutionIdCountDelta: 0,
      immediateEventCount: 1,
      terminalEventReservationCountDelta: 0,
    }),
  });
}

interface RuntimeHarness {
  readonly runtime: Readonly<{
    [BABYLON_GAMEPLAY_RUNTIME_INTERNAL](): BabylonGameplayRuntimeInternalV1;
  }>;
  readonly prepareTargets: BabylonGameplayPossessionTargetV1[];
  readonly mountedPrepareInputs: BabylonGameplayMountedTransitionV1[];
  readonly fixedInputActionProjections: GameplayFixedTickActionProjectionV1[];
  readonly commitCount: () => number;
  readonly abortCount: () => number;
  readonly target: () => BabylonGameplayPossessionTargetV1;
  readonly setSemanticFactCount: (count: number) => void;
  readonly lockActionPresentation: (
    actorEntityId: string,
    semanticActionRef: string,
  ) => void;
}

function runtimeHarness(
  initialTarget: BabylonGameplayPossessionTargetV1 = Object.freeze({
    mode: "unbound",
  }),
): RuntimeHarness {
  let target = initialTarget;
  let projection = worldProjection();
  let viewStateRevision = 0;
  let commits = 0;
  let aborts = 0;
  const prepareTargets: BabylonGameplayPossessionTargetV1[] = [];
  const mountedPrepareInputs: BabylonGameplayMountedTransitionV1[] = [];
  const fixedInputActionProjections: GameplayFixedTickActionProjectionV1[] = [];
  const lockedActionPresentationKeys = new Set<string>();
  const internal: BabylonGameplayRuntimeInternalV1 & Readonly<{
    hasLockedActionPresentation(
      actorEntityId: string,
      semanticActionRef: string,
    ): boolean;
  }> = {
    readPossessionTarget: () => target,
    readWorldProjection: () => projection,
    readViewProjection: () => Object.freeze({ viewStateRevision }),
    hasEntity: (entityId) =>
      Object.hasOwn(projection.spatialEntityStatesById, entityId),
    isEntityControllable: (entityId) =>
      Object.hasOwn(projection.spatialEntityStatesById, entityId),
    hasLockedActionPresentation: (actorEntityId, semanticActionRef) =>
      lockedActionPresentationKeys.has(`${actorEntityId}\u0000${semanticActionRef}`),
    preparePossessionTarget: async (nextTarget) => {
      prepareTargets.push(nextTarget);
      const nextRevision = nextTarget.mode === target.mode &&
          (nextTarget.mode === "unbound" ||
            (target.mode === "possessed" &&
              nextTarget.controlledEntityId === target.controlledEntityId))
        ? viewStateRevision
        : viewStateRevision + 1;
      let lifecycle: "prepared" | "committed" | "aborted" = "prepared";
      let abortPromise: Promise<void> | undefined;
      return Object.freeze({
        projectedWorldStateAfter: projection,
        projectedViewStateAfter: Object.freeze({
          viewStateRevision: nextRevision,
        }),
        commitPrepared: (): void => {
          if (lifecycle !== "prepared") return;
          lifecycle = "committed";
          target = nextTarget;
          viewStateRevision = nextRevision;
          commits += 1;
        },
        abort: (): Promise<void> => {
          if (abortPromise !== undefined) return abortPromise;
          lifecycle = "aborted";
          aborts += 1;
          abortPromise = Promise.resolve();
          return abortPromise;
        },
      });
    },
    prepareMountedRelationshipTransition: async (input) => {
      mountedPrepareInputs.push(input);
      return internal.preparePossessionTarget(input.possessionTarget);
    },
    runFixedInputTick: async (input, actionProjection) => {
      if (input.ticks !== 1) throw new RangeError("single tick required");
      fixedInputActionProjections.push(actionProjection);
      projection = worldProjection(projection.simulationTick + 1);
      return projection;
    },
    dispose: async () => undefined,
  };
  return {
    runtime: Object.freeze({
      [BABYLON_GAMEPLAY_RUNTIME_INTERNAL]: () => internal,
    }),
    prepareTargets,
    mountedPrepareInputs,
    fixedInputActionProjections,
    commitCount: () => commits,
    abortCount: () => aborts,
    target: () => target,
    setSemanticFactCount: (count) => {
      projection = Object.freeze({
        ...projection,
        semanticFactsById: Object.freeze(Object.fromEntries(
          Array.from({ length: count }, (_, index) => [
            `fact:${index}`,
            Object.freeze({
              id: `semantic-fact:${index}`,
              type: "touching" as const,
              schemaVersion: 1 as const,
              entityIds: ["subject-a", "subject-b"] as const,
              startedSimulationTick: 0,
              semanticFactProjectorProfileRef:
                "worldkit://semantic-fact-projector/test@1",
              semanticFactProjectorProfileHash: HASH,
            }),
          ]),
        )),
      });
    },
    lockActionPresentation: (actorEntityId, semanticActionRef) => {
      lockedActionPresentationKeys.add(`${actorEntityId}\u0000${semanticActionRef}`);
    },
  };
}

describe("Babylon Gameplay World Port V1", () => {
  it("exposes one provider-neutral prepared fixed Tick only when Runtime supports the seam", async () => {
    const harness = runtimeHarness();
    const internal = harness.runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]() as
      BabylonGameplayRuntimeInternalV1 & {
        prepareFixedInputTick(
          input: FixedInputOneTickV1,
          actionProjection: GameplayFixedTickActionProjectionV1,
        ): Promise<GameplayWorldTransactionV1>;
      };
    let commits = 0;
    let aborts = 0;
    let preparedActionProjection: unknown;
    internal.prepareFixedInputTick = vi.fn(async (_input, actionProjection) => {
      preparedActionProjection = actionProjection;
      return Object.freeze({
      projectedWorldStateAfter: worldProjection(1),
      projectedViewStateAfter: Object.freeze({ viewStateRevision: 0 }),
      commitPrepared: () => {
        commits += 1;
      },
      abort: async () => {
        aborts += 1;
      },
      });
    });
    const runLegacy = vi.spyOn(internal, "runFixedInputTick");
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    ) as GameplayWorldPortV1 & {
      prepareFixedInputTick(
        input: FixedInputOneTickV1,
        actionProjection: GameplayFixedTickActionProjectionV1,
      ): Promise<GameplayWorldTransactionV1>;
    };

    expect(typeof port.prepareFixedInputTick).toBe("function");
    const actionProjection = fixedTickActionProjection();
    const prepared = await port.prepareFixedInputTick(
      { actions: [], ticks: 1 },
      actionProjection,
    );
    expect(internal.prepareFixedInputTick).toHaveBeenCalledOnce();
    expect(preparedActionProjection).toBe(actionProjection);
    expect(runLegacy).not.toHaveBeenCalled();
    expect(commits).toBe(0);
    prepared.commitPrepared();
    expect(commits).toBe(1);
    expect(aborts).toBe(0);

    await expect(port.prepareFixedInputTick({
      actions: [],
      ticks: 2,
    } as never, actionProjection)).rejects.toThrow(
      "Gameplay World Port accepts exactly one fixed tick.",
    );
    expect(internal.prepareFixedInputTick).toHaveBeenCalledOnce();
  });

  it("delegates prepared fixed-Tick abort once and keeps it idempotent", async () => {
    const harness = runtimeHarness();
    const internal = harness.runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]() as
      BabylonGameplayRuntimeInternalV1 & {
        prepareFixedInputTick(
          input: FixedInputOneTickV1,
          actionProjection: GameplayFixedTickActionProjectionV1,
        ): Promise<GameplayWorldTransactionV1>;
      };
    let providerAborts = 0;
    internal.prepareFixedInputTick = async () => Object.freeze({
      projectedWorldStateAfter: worldProjection(1),
      projectedViewStateAfter: Object.freeze({ viewStateRevision: 0 }),
      commitPrepared: () => undefined,
      abort: async () => {
        providerAborts += 1;
      },
    });
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    ) as GameplayWorldPortV1 & {
      prepareFixedInputTick(
        input: FixedInputOneTickV1,
        actionProjection: GameplayFixedTickActionProjectionV1,
      ): Promise<GameplayWorldTransactionV1>;
    };
    const prepared = await port.prepareFixedInputTick(
      { actions: [], ticks: 1 },
      fixedTickActionProjection(),
    );

    const firstAbort = prepared.abort();
    expect(prepared.abort()).toBe(firstAbort);
    await firstAbort;
    expect(providerAborts).toBe(1);
  });

  it("redacts prepared fixed-Tick provider failure without invoking the legacy path", async () => {
    const harness = runtimeHarness();
    const internal = harness.runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]() as
      BabylonGameplayRuntimeInternalV1 & {
        prepareFixedInputTick(
          input: FixedInputOneTickV1,
          actionProjection: GameplayFixedTickActionProjectionV1,
        ): Promise<GameplayWorldTransactionV1>;
      };
    internal.prepareFixedInputTick = vi.fn(async () => {
      throw new Error("Havok checkpoint detail");
    });
    const legacy = vi.spyOn(internal, "runFixedInputTick");
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    ) as GameplayWorldPortV1 & {
      prepareFixedInputTick(
        input: FixedInputOneTickV1,
        actionProjection: GameplayFixedTickActionProjectionV1,
      ): Promise<GameplayWorldTransactionV1>;
    };

    await expect(port.prepareFixedInputTick(
      { actions: [], ticks: 1 },
      fixedTickActionProjection(),
    ))
      .rejects.toThrow(
        "ADAPTER_FIXED_INPUT_FAILED: Gameplay World Port could not prepare fixed input.",
      );
    expect(legacy).not.toHaveBeenCalled();
  });

  it("does not advertise a staged fixed Tick on a legacy Runtime", () => {
    const harness = runtimeHarness();
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    ) as GameplayWorldPortV1 & Partial<{
      prepareFixedInputTick(
        input: FixedInputOneTickV1,
        actionProjection: GameplayFixedTickActionProjectionV1,
      ): Promise<unknown>;
    }>;

    expect(Object.hasOwn(port, "prepareFixedInputTick")).toBe(false);
    expect(port.prepareFixedInputTick).toBeUndefined();
  });

  it("routes a trusted mountedOn Action to one staged mounted Runtime transaction", async () => {
    const harness = runtimeHarness(Object.freeze({
      mode: "possessed",
      controlledEntityId: "subject-a",
    }));
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    );
    const possessionBefore = relationship("subject-a", 0);
    const mountedOn = Object.freeze({
      id: "mounted-on:subject-a:subject-b",
      type: "mountedOn" as const,
      schemaVersion: 1 as const,
      riderEntityId: "subject-a",
      mountEntityId: "subject-b",
      mountSlotId: "stand",
      establishedSimulationTick: 1,
    });
    const possessionAfter = relationship("subject-b", 1);
    const mountedTransition = Object.freeze({
      kind: "gameplay-transition-plan" as const,
      schemaVersion: 1 as const,
      type: "action.activate" as const,
      commandId: "command:mount",
      expectedStateRevision: 1,
      relationshipChanges: Object.freeze([
        { operation: "remove" as const, before: possessionBefore },
        { operation: "add" as const, after: mountedOn },
        { operation: "add" as const, after: possessionAfter },
      ]),
      actionChanges: Object.freeze([]),
      newlyCommittedActionExecutionIds: Object.freeze(["execution:mount"]),
      capacityDelta: Object.freeze({
        relationshipStateCountDelta: 1,
        activeActionStateCountDelta: 0,
        usedActionExecutionIdCountDelta: 1,
        immediateEventCount: 5,
        terminalEventReservationCountDelta: 0,
      }),
      trustedActionEffectPlan: Object.freeze({
        kind: "mounted-relationship-effect-plan" as const,
        schemaVersion: 1 as const,
        operation: "mount" as const,
        actorEntityId: "subject-a",
        requiredControlledEntityId: "subject-a",
        relationshipChanges: Object.freeze([
          { operation: "remove" as const, before: possessionBefore },
          { operation: "add" as const, after: mountedOn },
          { operation: "add" as const, after: possessionAfter },
        ]),
        runtimeProjectionWriteSet: Object.freeze({
          spatialEntityIds: Object.freeze(["subject-a"]),
          capabilityStateIds: Object.freeze([
            "capability-state:subject-a:locomotion",
          ]),
          semanticFactIds: Object.freeze([]),
        }),
      }),
    }) as GameplayWorldTransitionV1;

    expect(port.isActionAvailable(
      "subject-a",
      "worldkit://semantic-action/mount@1",
      mountedTransition,
    )).toBe(true);
    const prepared = await port.prepareGameplayTransition(mountedTransition);

    expect(harness.mountedPrepareInputs).toEqual([{
      operation: "mount",
      relationship: mountedOn,
      possessionTarget: { mode: "possessed", controlledEntityId: "subject-b" },
    }]);
    expect(harness.target()).toEqual({
      mode: "possessed",
      controlledEntityId: "subject-a",
    });
    prepared.commitPrepared();
    expect(harness.target()).toEqual({
      mode: "possessed",
      controlledEntityId: "subject-b",
    });
  });

  it("stages bind, rebind and release without publishing before commit", async () => {
    const harness = runtimeHarness();
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    );

    const first = relationship("subject-a", 0);
    const bind = await port.prepareGameplayTransition(transition(
      "control.bind",
      [{ operation: "add", after: first }],
    ));
    expect(harness.target()).toEqual({ mode: "unbound" });
    expect(bind.projectedViewStateAfter.viewStateRevision).toBe(1);
    bind.commitPrepared();
    expect(harness.target()).toEqual({
      mode: "possessed",
      controlledEntityId: "subject-a",
    });

    const second = relationship("subject-b", 1);
    const rebind = await port.prepareGameplayTransition(transition(
      "control.bind",
      [
        { operation: "remove", before: first },
        { operation: "add", after: second },
      ],
    ));
    expect(harness.target()).toEqual({
      mode: "possessed",
      controlledEntityId: "subject-a",
    });
    rebind.commitPrepared();
    expect(harness.target()).toEqual({
      mode: "possessed",
      controlledEntityId: "subject-b",
    });

    const release = await port.prepareGameplayTransition(transition(
      "control.release",
      [{ operation: "remove", before: second }],
    ));
    expect(harness.target()).toEqual({
      mode: "possessed",
      controlledEntityId: "subject-b",
    });
    release.commitPrepared();
    expect(harness.target()).toEqual({ mode: "unbound" });
    expect(harness.commitCount()).toBe(3);
    expect(harness.prepareTargets).toEqual([
      { mode: "possessed", controlledEntityId: "subject-a" },
      { mode: "possessed", controlledEntityId: "subject-b" },
      { mode: "unbound" },
    ]);
  });

  it("delegates abort without publishing and keeps abort idempotent", async () => {
    const harness = runtimeHarness();
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    );
    const prepared = await port.prepareGameplayTransition(transition(
      "control.bind",
      [{ operation: "add", after: relationship("subject-a", 0) }],
    ));

    const firstAbort = prepared.abort();
    const secondAbort = prepared.abort();
    expect(secondAbort).toBe(firstAbort);
    await firstAbort;
    expect(harness.target()).toEqual({ mode: "unbound" });
    expect(harness.abortCount()).toBe(1);
    expect(harness.commitCount()).toBe(0);
  });

  it("rejects stale, ambiguous and unsupported relationship deltas before Runtime prepare", async () => {
    const harness = runtimeHarness(Object.freeze({
      mode: "possessed",
      controlledEntityId: "subject-a",
    }));
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    );
    const stale = relationship("subject-b", 0);

    await expect(port.prepareGameplayTransition(transition(
      "control.release",
      [{ operation: "remove", before: stale }],
    ))).rejects.toThrow(/GAMEPLAY_POSSESSION_TRANSITION_STALE/);
    await expect(port.prepareGameplayTransition(transition(
      "control.bind",
      [
        { operation: "add", after: relationship("subject-b", 1) },
        { operation: "add", after: relationship("subject-a", 1) },
      ],
    ))).rejects.toThrow(/GAMEPLAY_POSSESSION_TRANSITION_INVALID/);
    await expect(port.prepareGameplayTransition(Object.freeze({
      ...transition("control.bind", []),
      type: "action.activate",
    }) as GameplayWorldTransitionV1)).rejects.toThrow(
      "GAMEPLAY_ACTION_PRESENTATION_UNAVAILABLE: Gameplay World Port rejected the transition.",
    );
    expect(harness.prepareTargets).toEqual([]);
  });

  it("fails Action availability closed without a locked presentation mapping", () => {
    const harness = runtimeHarness();
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    );
    const hasEntitySpy = vi.spyOn(
      harness.runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL](),
      "hasEntity",
    );

    expect(port.isActionAvailable(
      "subject-a",
      ACTION_REF,
      stateOnlyActionTransition(),
    )).toBe(false);
    expect(hasEntitySpy).not.toHaveBeenCalled();
  });

  it("admits a locked state-only Action as a provider no-op transaction", async () => {
    const harness = runtimeHarness();
    harness.lockActionPresentation("subject-a", ACTION_REF);
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    );
    const actionTransition = stateOnlyActionTransition();

    expect(port.isActionAvailable(
      "subject-a",
      ACTION_REF,
      actionTransition,
    )).toBe(true);
    const prepared = await port.prepareGameplayTransition(actionTransition);

    expect(prepared.projectedWorldStateAfter).toBe(port.snapshot());
    expect(harness.prepareTargets).toEqual([]);
    expect(harness.mountedPrepareInputs).toEqual([]);
    expect(() => prepared.commitPrepared()).not.toThrow();
    expect(harness.commitCount()).toBe(0);
  });

  it("returns exact current capacity and delegates exactly one fixed tick", async () => {
    const harness = runtimeHarness();
    harness.setSemanticFactCount(2);
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    );

    expect(port.estimateFixedInputTickCapacity({ actions: [], ticks: 1 }))
      .toEqual({
        maximumSemanticFactCountAfterInput: 2,
        maximumSemanticFactTransitionEventCount: 0,
      });
    const actionProjection = fixedTickActionProjection();
    await expect(port.runFixedInputTick(
      { actions: [], ticks: 1 },
      actionProjection,
    ))
      .resolves.toMatchObject({ simulationTick: 1 });
    expect(harness.fixedInputActionProjections).toEqual([actionProjection]);
    expect(() => port.estimateFixedInputTickCapacity({
      actions: [],
      ticks: 2,
    } as never)).toThrow("Gameplay World Port accepts exactly one fixed tick.");
    await expect(port.runFixedInputTick({
      actions: [],
      ticks: 2,
    } as never, fixedTickActionProjection())).rejects.toThrow(
      "Gameplay World Port accepts exactly one fixed tick.",
    );
  });

  it("delegates entity queries, projection lifecycle and disposal", async () => {
    const harness = runtimeHarness();
    const internal = harness.runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]();
    const dispose = vi.spyOn(internal, "dispose");
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    );

    await expect(port.initialize()).resolves.toBe(internal.readWorldProjection());
    expect(port.snapshot()).toBe(internal.readWorldProjection());
    expect(port.hasEntity("subject-a")).toBe(true);
    expect(port.hasEntity("missing")).toBe(false);
    expect(port.isEntityControllable("subject-b")).toBe(true);
    await expect(port.dispose()).resolves.toBeUndefined();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("keeps another Controller's bind and release local-state neutral", async () => {
    const harness = runtimeHarness(Object.freeze({
      mode: "possessed",
      controlledEntityId: "subject-a",
    }));
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    );
    const otherControllerRelationship = relationship(
      "subject-b",
      1,
      "controller-secondary",
    );

    const prepared = await port.prepareGameplayTransition(transition(
      "control.bind",
      [{ operation: "add", after: otherControllerRelationship }],
    ));
    expect(prepared.projectedViewStateAfter.viewStateRevision).toBe(0);
    expect(harness.prepareTargets).toEqual([]);
    prepared.commitPrepared();
    expect(harness.target()).toEqual({
      mode: "possessed",
      controlledEntityId: "subject-a",
    });

    const preparedRelease = await port.prepareGameplayTransition(transition(
      "control.release",
      [{ operation: "remove", before: otherControllerRelationship }],
    ));
    expect(preparedRelease.projectedViewStateAfter.viewStateRevision).toBe(0);
    expect(harness.prepareTargets).toEqual([]);
    preparedRelease.commitPrepared();
    expect(harness.target()).toEqual({
      mode: "possessed",
      controlledEntityId: "subject-a",
    });
  });

  it("redacts provider failures at the Gameplay World Port boundary", async () => {
    const harness = runtimeHarness();
    const internal = harness.runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]();
    vi.spyOn(internal, "preparePossessionTarget").mockRejectedValueOnce(
      new Error("Babylon Havok provider failure"),
    );
    vi.spyOn(internal, "runFixedInputTick").mockRejectedValueOnce(
      new Error("Babylon Havok provider failure"),
    );
    const port = createBabylonGameplayWorldPortV1(
      harness.runtime,
      FIXED_INPUT_CONTROLLER_ENTITY_ID,
    );

    await expect(port.prepareGameplayTransition(transition(
      "control.bind",
      [{ operation: "add", after: relationship("subject-a", 0) }],
    ))).rejects.toThrow(
      "ADAPTER_PREPARE_FAILED: Gameplay World Port could not prepare the transition.",
    );
    await expect(port.runFixedInputTick(
      { actions: [], ticks: 1 },
      fixedTickActionProjection(),
    ))
      .rejects.toThrow(
        "ADAPTER_FIXED_INPUT_FAILED: Gameplay World Port could not run fixed input.",
      );
  });
});
