import type {
  SpatialEntityStateV1,
} from "@whitebox-world/gameplay-contracts";
import type { GameplayTransitionPlanV1 } from "@whitebox-world/gameplay";
import { describe, expect, it } from "vitest";

import type {
  FixedInputOneTickV1,
  GameplayWorldStateProjectionV1,
} from "../gameplay-world-port";
import {
  createFakeGameplayWorldPortHarnessV1,
} from "./fake-gameplay-world-adapter";

const HASH = `sha256:${"a".repeat(64)}` as const;

function spatialEntity(id: string): SpatialEntityStateV1 {
  return {
    id,
    kind: "spatial-entity-state",
    entityDefinitionRef: `worldkit://entity-definition/${id}@1`,
    entityDefinitionHash: HASH,
    semanticClassId: "character.humanoid",
    lifecycleMode: "active",
    positionMetersXYZ: [0, 0, 0],
    rotationQuaternionXYZW: [0, 0, 0, 1],
    scaleRatioXYZ: [1, 1, 1],
    linearVelocityMetersPerSecondXYZ: [0, 0, 0],
  };
}

function projection(
  simulationTick: number,
  entityIds: readonly string[] = ["entity.hero", "entity.wall"],
): GameplayWorldStateProjectionV1 {
  return Object.freeze({
    simulationTick,
    spatialEntityStatesById: Object.freeze(Object.fromEntries(
      entityIds.map((entityId) => [entityId, Object.freeze(spatialEntity(entityId))]),
    )),
    capabilityStatesById: Object.freeze({}),
    semanticFactsById: Object.freeze({}),
  });
}

function transition(commandId = "command.bind"): GameplayTransitionPlanV1 {
  return Object.freeze({
    kind: "gameplay-transition-plan",
    schemaVersion: 1,
    type: "control.bind",
    commandId,
    expectedStateRevision: 0,
    relationshipChanges: Object.freeze([]),
    actionChanges: Object.freeze([]),
    newlyCommittedActionExecutionIds: Object.freeze([]),
    capacityDelta: Object.freeze({
      relationshipStateCountDelta: 0,
      activeActionStateCountDelta: 0,
      usedActionExecutionIdCountDelta: 0,
      immediateEventCount: 0,
      terminalEventReservationCountDelta: 0,
    }),
  });
}

const ONE_TICK_INPUT = Object.freeze({
  actions: Object.freeze(["move-forward"] as const),
  ticks: 1,
}) satisfies FixedInputOneTickV1;

describe("FakeGameplayWorldPort harness", () => {
  it("initializes, queries, and snapshots a provider-neutral world deterministically", async () => {
    const initialProjection = projection(0);
    const harness = createFakeGameplayWorldPortHarnessV1({
      initialWorldProjection: initialProjection,
      controllableEntityIds: ["entity.hero"],
      availableActions: [{
        actorEntityId: "entity.hero",
        semanticActionRef: "worldkit://semantic-action/jump@1",
      }],
    });

    await expect(harness.port.initialize()).resolves.toBe(initialProjection);
    expect(harness.port.snapshot()).toBe(initialProjection);
    expect(harness.port.hasEntity("entity.hero")).toBe(true);
    expect(harness.port.hasEntity("entity.missing")).toBe(false);
    expect(harness.port.isEntityControllable("entity.hero")).toBe(true);
    expect(harness.port.isEntityControllable("entity.wall")).toBe(false);
    expect(harness.port.isActionAvailable(
      "entity.hero",
      "worldkit://semantic-action/jump@1",
    )).toBe(true);
    expect(harness.port.isActionAvailable(
      "entity.wall",
      "worldkit://semantic-action/jump@1",
    )).toBe(false);
    expect(harness.calls.map((call) => call.operation)).toEqual([
      "initialize",
      "snapshot",
      "has-entity",
      "has-entity",
      "is-entity-controllable",
      "is-entity-controllable",
      "is-action-available",
      "is-action-available",
    ]);
    expect(Object.isFrozen(harness.calls)).toBe(true);
    expect(Object.isFrozen(harness.calls[0])).toBe(true);
  });

  it("keeps a prepared transition invisible until one synchronous commit", async () => {
    const initialProjection = projection(0);
    const stagedProjection = projection(0, ["entity.hero", "entity.gate"]);
    const harness = createFakeGameplayWorldPortHarnessV1({
      initialWorldProjection: initialProjection,
    });
    harness.queuePreparedTransition({
      projectedWorldStateAfter: stagedProjection,
      projectedViewStateAfter: {
        viewStateRevision: 1,
      },
    });

    const prepared = await harness.port.prepareGameplayTransition(transition());

    expect(prepared.projectedWorldStateAfter).toBe(stagedProjection);
    expect(harness.publishedWorldProjection).toBe(initialProjection);
    expect(harness.commitCount).toBe(0);
    expect(prepared.commitPrepared()).toBeUndefined();
    expect(harness.publishedWorldProjection).toBe(stagedProjection);
    expect(harness.commitCount).toBe(1);
    expect(() => prepared.commitPrepared()).toThrow(/already committed/);
    expect(harness.commitCount).toBe(1);
    expect(harness.calls.map((call) => call.operation)).toEqual([
      "prepare-gameplay-transition",
      "commit-prepared",
    ]);
  });

  it("aborts a staged transition once through one stable Promise", async () => {
    const initialProjection = projection(0);
    const harness = createFakeGameplayWorldPortHarnessV1({
      initialWorldProjection: initialProjection,
    });
    harness.queuePreparedTransition({
      projectedWorldStateAfter: projection(1),
      projectedViewStateAfter: { viewStateRevision: 1 },
    });
    const prepared = await harness.port.prepareGameplayTransition(transition());

    const firstAbort = prepared.abort();
    expect(prepared.abort()).toBe(firstAbort);
    await expect(firstAbort).resolves.toBeUndefined();
    expect(harness.abortCount).toBe(1);
    expect(harness.publishedWorldProjection).toBe(initialProjection);
    expect(() => prepared.commitPrepared()).toThrow(/already aborted/);
  });

  it("pairs one-tick estimates with one-tick runs and publishes only the run result", async () => {
    const nextProjection = projection(1);
    const harness = createFakeGameplayWorldPortHarnessV1({
      initialWorldProjection: projection(0),
    });
    harness.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 4,
        maximumSemanticFactTransitionEventCount: 2,
      },
      worldProjectionAfter: nextProjection,
    });

    expect(harness.port.estimateFixedInputTickCapacity(ONE_TICK_INPUT)).toEqual({
      maximumSemanticFactCountAfterInput: 4,
      maximumSemanticFactTransitionEventCount: 2,
    });
    expect(harness.publishedWorldProjection.simulationTick).toBe(0);
    await expect(harness.port.runFixedInputTick(ONE_TICK_INPUT)).resolves.toBe(
      nextProjection,
    );
    expect(harness.publishedWorldProjection).toBe(nextProjection);
    expect(harness.calls.map((call) => call.operation)).toEqual([
      "estimate-fixed-input-tick-capacity",
      "run-fixed-input-tick",
    ]);
  });

  it("provides an entered barrier that deterministically releases an async operation", async () => {
    const harness = createFakeGameplayWorldPortHarnessV1({
      initialWorldProjection: projection(0),
    });
    const barrier = harness.deferNextOperation("prepare-gameplay-transition");

    const pending = harness.port.prepareGameplayTransition(transition());
    await barrier.entered;
    let settled = false;
    void pending.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    barrier.release();
    await expect(pending).resolves.toBeDefined();
  });

  it("injects synchronous and asynchronous failures without leaking staged state", async () => {
    const initialProjection = projection(0);
    const harness = createFakeGameplayWorldPortHarnessV1({
      initialWorldProjection: initialProjection,
    });

    harness.failNextOperation("initialize", "throw", new Error("initialize throw"));
    expect(() => harness.port.initialize()).toThrow("initialize throw");

    harness.failNextOperation("prepare-gameplay-transition", "reject", new Error("prepare reject"));
    await expect(
      harness.port.prepareGameplayTransition(transition("command.rejected")),
    ).rejects.toThrow("prepare reject");

    harness.queuePreparedTransition({
      projectedWorldStateAfter: projection(1),
      projectedViewStateAfter: { viewStateRevision: 1 },
    });
    harness.failNextOperation("abort", "reject", new Error("abort reject"));
    const prepared = await harness.port.prepareGameplayTransition(
      transition("command.abort"),
    );
    const firstAbort = prepared.abort();
    expect(prepared.abort()).toBe(firstAbort);
    await expect(firstAbort).rejects.toThrow("abort reject");
    expect(harness.abortCount).toBe(1);
    expect(harness.publishedWorldProjection).toBe(initialProjection);
  });

  it("can make abort throw synchronously while keeping the failing call exactly once", async () => {
    const harness = createFakeGameplayWorldPortHarnessV1({
      initialWorldProjection: projection(0),
    });
    harness.failNextOperation("abort", "throw", new Error("abort throw"));
    const prepared = await harness.port.prepareGameplayTransition(transition());

    expect(() => prepared.abort()).toThrow("abort throw");
    expect(() => prepared.abort()).toThrow("abort throw");
    expect(harness.abortCount).toBe(1);
    expect(harness.calls.filter((call) => call.operation === "abort")).toHaveLength(1);
  });

  it("injects commit return violations, invalid projections, and estimate breaches", async () => {
    const invalidProjection = { simulationTick: -1 };
    const harness = createFakeGameplayWorldPortHarnessV1({
      initialWorldProjection: projection(0),
    });
    harness.queuePreparedTransition({
      projectedWorldStateAfter: invalidProjection,
      projectedViewStateAfter: { viewStateRevision: -1 },
    });
    harness.setNextCommitReturn("invalid-return");

    const prepared = await harness.port.prepareGameplayTransition(transition());
    expect(prepared.projectedWorldStateAfter).toBe(invalidProjection);
    expect(Reflect.apply(prepared.commitPrepared, prepared, [])).toBe(
      "invalid-return",
    );
    expect(harness.publishedWorldProjection).toBe(invalidProjection);

    harness.queueFixedInputTick({
      capacityEstimate: {
        maximumSemanticFactCountAfterInput: 0,
        maximumSemanticFactTransitionEventCount: 0,
      },
      worldProjectionAfter: projection(1),
    });
    expect(harness.port.estimateFixedInputTickCapacity(ONE_TICK_INPUT)).toEqual({
      maximumSemanticFactCountAfterInput: 0,
      maximumSemanticFactTransitionEventCount: 0,
    });
  });

  it("disposes exactly once and returns one Promise even when cleanup rejects", async () => {
    const harness = createFakeGameplayWorldPortHarnessV1({
      initialWorldProjection: projection(0),
    });
    harness.failNextOperation("dispose", "reject", new Error("dispose reject"));

    const firstDispose = harness.port.dispose();
    expect(harness.port.dispose()).toBe(firstDispose);
    await expect(firstDispose).rejects.toThrow("dispose reject");
    expect(harness.disposeCount).toBe(1);
    expect(harness.calls.filter((call) => call.operation === "dispose")).toHaveLength(1);
  });
});
