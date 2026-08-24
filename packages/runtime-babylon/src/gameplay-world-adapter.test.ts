import type {
  GameplayWorldStateProjectionV1,
  GameplayWorldTransitionV1,
} from "@whitebox-world/runtime-host";
import { describe, expect, it, vi } from "vitest";

import {
  BABYLON_GAMEPLAY_RUNTIME_INTERNAL,
  type BabylonGameplayPossessionTargetV1,
  type BabylonGameplayRuntimeInternalV1,
} from "./gameplay-runtime-internal";
import { createBabylonGameplayWorldPortV1 } from "./gameplay-world-adapter";

const HASH = `sha256:${"a".repeat(64)}` as const;
const FIXED_INPUT_CONTROLLER_ENTITY_ID = "controller-primary";

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
  readonly commitCount: () => number;
  readonly abortCount: () => number;
  readonly target: () => BabylonGameplayPossessionTargetV1;
  readonly setSemanticFactCount: (count: number) => void;
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
  const internal: BabylonGameplayRuntimeInternalV1 = {
    readExecutionPlan: () => undefined as never,
    readPossessionTarget: () => target,
    readWorldProjection: () => projection,
    readViewProjection: () => Object.freeze({ viewStateRevision }),
    hasEntity: (entityId) =>
      Object.hasOwn(projection.spatialEntityStatesById, entityId),
    isEntityControllable: (entityId) =>
      Object.hasOwn(projection.spatialEntityStatesById, entityId),
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
    runFixedInputTick: async (input) => {
      if (input.ticks !== 1) throw new RangeError("single tick required");
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
  };
}

describe("Babylon Gameplay World Port V1", () => {
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
      "worldkit://semantic-action/emote.salute@1",
    )).toBe(false);
    expect(hasEntitySpy).not.toHaveBeenCalled();
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
    await expect(port.runFixedInputTick({ actions: [], ticks: 1 }))
      .resolves.toMatchObject({ simulationTick: 1 });
    expect(() => port.estimateFixedInputTickCapacity({
      actions: [],
      ticks: 2,
    } as never)).toThrow("Gameplay World Port accepts exactly one fixed tick.");
    await expect(port.runFixedInputTick({
      actions: [],
      ticks: 2,
    } as never)).rejects.toThrow(
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
    await expect(port.runFixedInputTick({ actions: [], ticks: 1 }))
      .rejects.toThrow(
        "ADAPTER_FIXED_INPUT_FAILED: Gameplay World Port could not run fixed input.",
      );
  });
});
