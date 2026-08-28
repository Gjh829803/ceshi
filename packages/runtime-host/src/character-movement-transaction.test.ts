import {
  createGameplayBootstrapV1,
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  type ControllerEntityStateV1,
  type GameplayParticipantStateV1,
  type SpatialEntityStateV1,
} from "@whitebox-world/gameplay-contracts";
import type { GameplayModeV1 } from "@whitebox-world/gameplay";
import { describe, expect, it, vi } from "vitest";

import {
  parseGameplayWorldStateProjectionV1,
  type FixedInputOneTickV1,
  type GameplayFixedTickActionProjectionV1,
  type GameplayWorldPortV1,
  type GameplayWorldStateProjectionV1,
  type GameplayWorldTransactionV1,
} from "./gameplay-world-port.js";
import { WorldSession } from "./world-session.js";
import { createTestWorldBuildIdentityV1 } from "./test/world-build-identity-fixture.js";

const HASH = `sha256:${"a".repeat(64)}` as const;

const HERO: SpatialEntityStateV1 = Object.freeze({
  id: "entity.hero",
  kind: "spatial-entity-state",
  entityDefinitionRef: "worldkit://entity-definition/hero@1",
  entityDefinitionHash: HASH,
  semanticClassId: "character.humanoid",
  lifecycleMode: "active",
  positionMetersXYZ: Object.freeze([1, 2, 3] as const),
  rotationQuaternionXYZW: Object.freeze([0, 0, 0, 1] as const),
  scaleRatioXYZ: Object.freeze([1, 1, 1] as const),
  linearVelocityMetersPerSecondXYZ: Object.freeze([0, 0, 0] as const),
});

const PARTICIPANT = Object.freeze({
  id: "participant.primary",
  mode: "active",
}) satisfies GameplayParticipantStateV1;

const CONTROLLER = Object.freeze({
  id: "controller.primary",
  kind: "controller-entity-state",
  controllerDefinitionRef: "worldkit://controller-definition/local@1",
  controllerDefinitionHash: HASH,
  participantId: PARTICIPANT.id,
  lifecycleMode: "active",
  inputMode: "human",
}) satisfies ControllerEntityStateV1;

const GAMEPLAY_MODE = Object.freeze({
  gameplayModeRef: "worldkit://gameplay-mode/exploration@1",
  evaluateCommand: () => Object.freeze({ status: "accepted" as const }),
}) satisfies GameplayModeV1;

const GAMEPLAY_BOOTSTRAP = createGameplayBootstrapV1({
  kind: "gameplay-bootstrap",
  id: "gameplay.character-movement-transaction",
  version: 1,
  resourceRef: "worldkit://gameplay-bootstrap/character-movement-transaction@1",
  entityDescriptors: [{
    id: HERO.id,
    entityDefinitionRef: HERO.entityDefinitionRef,
    capabilityRefs: [],
  }],
  featureResourceLocks: [],
  semanticActionDefinitions: [],
  availableCapabilityRefs: [],
  initialRelationshipStates: [],
});

function locomotionCapability(simulationTick: number) {
  return Object.freeze({
    id: "capability-state:entity.hero:locomotion-v2",
    kind: "locomotion-capability-state-v2" as const,
    ownerEntityId: HERO.id,
    locomotionCapabilityRef: "worldkit://locomotion-profile/humanoid@1",
    locomotionCapabilityHash: HASH,
    locomotion: Object.freeze({
      schemaVersion: 2 as const,
      status: "active" as const,
      mobilityMode: "grounded" as const,
      gait: simulationTick === 0 ? "idle" as const : "walk" as const,
      verticalPhase: "none" as const,
      supportMode: "supported" as const,
      movementMedium: "ground" as const,
      facingYawRadians: 0,
      linearVelocity: Object.freeze({ x: 0, y: 0, z: simulationTick === 0 ? 0 : 2 }),
      horizontalSpeedMetersPerSecond: simulationTick === 0 ? 0 : 2,
      committedTick: simulationTick,
      phaseEnteredTick: 0,
      transitionSequence: simulationTick,
    }),
  });
}

function projection(simulationTick: number): GameplayWorldStateProjectionV1 {
  const capability = locomotionCapability(simulationTick);
  return Object.freeze({
    simulationTick,
    spatialEntityStatesById: Object.freeze({ [HERO.id]: HERO }),
    capabilityStatesById: Object.freeze({ [capability.id]: capability }),
    semanticFactsById: Object.freeze({}),
  });
}

function projectionWithMismatchedLocomotionTick(
  simulationTick: number,
  committedTick: number,
): GameplayWorldStateProjectionV1 {
  const capability = locomotionCapability(committedTick);
  return Object.freeze({
    simulationTick,
    spatialEntityStatesById: Object.freeze({ [HERO.id]: HERO }),
    capabilityStatesById: Object.freeze({ [capability.id]: capability }),
    semanticFactsById: Object.freeze({}),
  });
}

interface PreparedFixedInputWorldPortV1 extends GameplayWorldPortV1 {
  prepareFixedInputTick(
    input: FixedInputOneTickV1,
    actionProjection: GameplayFixedTickActionProjectionV1,
  ): Promise<GameplayWorldTransactionV1>;
}

function preparedPortHarness() {
  let committedProjection = projection(0);
  let prepares = 0;
  let commits = 0;
  let commitAttempts = 0;
  let aborts = 0;
  let legacyRuns = 0;
  let disposes = 0;
  let nextProjection: GameplayWorldStateProjectionV1 | undefined;
  let nextPrepareFailure: Error | undefined;
  let nextEstimateFailure: Error | undefined;
  let nextAbortFailure: Error | undefined;
  let nextCommitFailure: Error | undefined;
  let prepareBarrier: Promise<void> | undefined;
  const port: PreparedFixedInputWorldPortV1 = {
    initialize: async () => committedProjection,
    hasEntity: (entityId) => entityId === HERO.id,
    isEntityControllable: () => true,
    isActionAvailable: () => false,
    prepareGameplayTransition: async () => {
      throw new Error("unused command transaction");
    },
    estimateFixedInputTickCapacity: () => {
      if (nextEstimateFailure !== undefined) {
        const failure = nextEstimateFailure;
        nextEstimateFailure = undefined;
        throw failure;
      }
      return Object.freeze({
        maximumSemanticFactCountAfterInput: 0,
        maximumSemanticFactTransitionEventCount: 0,
      });
    },
    prepareFixedInputTick: async (input, _actionProjection) => {
      prepares += 1;
      if (prepareBarrier !== undefined) {
        const barrier = prepareBarrier;
        prepareBarrier = undefined;
        await barrier;
      }
      if (nextPrepareFailure !== undefined) {
        const failure = nextPrepareFailure;
        nextPrepareFailure = undefined;
        throw failure;
      }
      const staged = nextProjection ??
        projection(committedProjection.simulationTick + input.ticks);
      nextProjection = undefined;
      let lifecycle: "prepared" | "committed" | "aborted" = "prepared";
      let abortPromise: Promise<void> | undefined;
      return Object.freeze({
        projectedWorldStateAfter: staged,
        projectedViewStateAfter: Object.freeze({ viewStateRevision: 0 }),
        commitPrepared: () => {
          if (lifecycle !== "prepared") throw new Error("transaction replay");
          lifecycle = "committed";
          commitAttempts += 1;
          if (nextCommitFailure !== undefined) {
            const failure = nextCommitFailure;
            nextCommitFailure = undefined;
            throw failure;
          }
          commits += 1;
          committedProjection = staged;
        },
        abort: () => {
          if (abortPromise !== undefined) return abortPromise;
          if (lifecycle !== "prepared") {
            return Promise.reject(new Error("transaction replay"));
          }
          lifecycle = "aborted";
          aborts += 1;
          if (nextAbortFailure !== undefined) {
            const failure = nextAbortFailure;
            nextAbortFailure = undefined;
            abortPromise = Promise.reject(failure);
          } else {
            abortPromise = Promise.resolve();
          }
          return abortPromise;
        },
      });
    },
    runFixedInputTick: async () => {
      legacyRuns += 1;
      throw new Error("legacy fixed-input path must not run");
    },
    snapshot: () => committedProjection,
    dispose: async () => {
      disposes += 1;
    },
  };
  return {
    port,
    committedProjection: () => committedProjection,
    prepares: () => prepares,
    commits: () => commits,
    commitAttempts: () => commitAttempts,
    aborts: () => aborts,
    legacyRuns: () => legacyRuns,
    disposes: () => disposes,
    stageProjection: (value: GameplayWorldStateProjectionV1) => {
      nextProjection = value;
    },
    failNextPrepare: (failure: Error) => {
      nextPrepareFailure = failure;
    },
    failNextEstimate: (failure: Error) => {
      nextEstimateFailure = failure;
    },
    failNextAbort: (failure: Error) => {
      nextAbortFailure = failure;
    },
    failNextCommit: (failure: Error) => {
      nextCommitFailure = failure;
    },
    delayNextPrepare: () => {
      let release = (): void => undefined;
      prepareBarrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => release();
    },
  };
}

function sessionOptions(worldPort: GameplayWorldPortV1) {
  return {
    runtimeSessionId: "runtime.character-movement-transaction",
    worldSessionId: "world.character-movement-transaction",
    worldBuildIdentity: createTestWorldBuildIdentityV1(HASH),
    gameplayBootstrap: GAMEPLAY_BOOTSTRAP,
    initialRelationships: [],
    participantStates: [PARTICIPANT],
    controllerStates: [CONTROLLER],
    fixedInputControllerEntityId: CONTROLLER.id,
    gameplayModeFactory: () => GAMEPLAY_MODE,
    gameplayFeatureFactories: [],
    gameplayCapacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
    worldPort,
  } as const;
}

describe("RuntimeHost Character Movement publication transaction", () => {
  it("publishes the exact authoritative Locomotion V2 envelope at its committed Tick", () => {
    const locomotion = {
      schemaVersion: 2 as const,
      status: "active" as const,
      mobilityMode: "grounded" as const,
      gait: "walk" as const,
      verticalPhase: "none" as const,
      supportMode: "supported" as const,
      movementMedium: "ground" as const,
      facingYawRadians: 0,
      linearVelocity: { x: 0, y: 0, z: 2 },
      horizontalSpeedMetersPerSecond: 2,
      committedTick: 7,
      phaseEnteredTick: 0,
      transitionSequence: 0,
    };
    const capability = {
      id: "capability-state:entity.hero:locomotion-v2",
      kind: "locomotion-capability-state-v2" as const,
      ownerEntityId: HERO.id,
      locomotionCapabilityRef: "worldkit://locomotion-profile/humanoid@1",
      locomotionCapabilityHash: HASH,
      locomotion,
    };

    const parsed = parseGameplayWorldStateProjectionV1({
      simulationTick: 7,
      spatialEntityStatesById: { [HERO.id]: HERO },
      capabilityStatesById: { [capability.id]: capability },
      semanticFactsById: {},
    }, {
      controllerEntityIds: ["controller.primary"],
      relationshipStatesById: {},
    });

    expect(parsed.capabilityStatesById[capability.id]).toEqual(capability);
    expect(parsed.capabilityStatesById[capability.id]).not.toBe(capability);
    expect(Object.isFrozen(parsed.capabilityStatesById[capability.id])).toBe(true);
  });

  it("prepares and commits one fixed Tick without invoking the legacy mutating path", async () => {
    const harness = preparedPortHarness();
    const session = await WorldSession.create(sessionOptions(harness.port));
    const before = session.snapshot();

    const after = await session.runFixedInput({ actions: [], ticks: 1 });

    expect(harness.prepares()).toBe(1);
    expect(harness.commits()).toBe(1);
    expect(harness.aborts()).toBe(0);
    expect(harness.legacyRuns()).toBe(0);
    expect(before.worldState.simulationTick).toBe(0);
    expect(after.worldState.simulationTick).toBe(1);
    const publishedCapability = after.worldState.capabilityStatesById[
      "capability-state:entity.hero:locomotion-v2"
    ];
    expect(publishedCapability).toMatchObject({
      kind: "locomotion-capability-state-v2",
      locomotion: { schemaVersion: 2, committedTick: 1, gait: "walk" },
    });
    expect(after.worldState.simulationTick).toBe(
      publishedCapability?.kind === "locomotion-capability-state-v2"
        ? publishedCapability.locomotion.committedTick
        : -1,
    );
    expect(Object.isFrozen(publishedCapability)).toBe(true);
    expect(harness.committedProjection().simulationTick).toBe(1);
  });

  it("keeps publication and Event journal byte-identical when prepared capacity estimation fails", async () => {
    const harness = preparedPortHarness();
    const session = await WorldSession.create(sessionOptions(harness.port));
    const before = session.snapshot();
    const beforeBytes = JSON.stringify(before);
    const eventsBefore = session.eventsAfter(0, 100);
    harness.failNextEstimate(new Error("hostile estimate"));

    await expect(session.runFixedInput({ actions: [], ticks: 1 }))
      .rejects.toThrow(/ADAPTER_FIXED_INPUT_FAILED/);

    expect(session.snapshot()).toBe(before);
    expect(JSON.stringify(session.snapshot())).toBe(beforeBytes);
    expect(session.eventsAfter(0, 100)).toEqual(eventsBefore);
    expect(session.phase).toBe("ready");
    expect(harness.prepares()).toBe(0);
    expect(harness.commits()).toBe(0);
    expect(harness.committedProjection().simulationTick).toBe(0);
  });

  it("does not expose a staged Tick while Runtime prepare is unresolved", async () => {
    const harness = preparedPortHarness();
    const session = await WorldSession.create(sessionOptions(harness.port));
    const before = session.snapshot();
    const releasePrepare = harness.delayNextPrepare();

    const pending = session.runFixedInput({ actions: ["move-forward"], ticks: 1 });
    await vi.waitFor(() => expect(harness.prepares()).toBe(1));

    expect(session.snapshot()).toBe(before);
    expect(session.eventsAfter(0, 100)).toEqual([]);
    expect(harness.committedProjection().simulationTick).toBe(0);
    expect(harness.commits()).toBe(0);

    releasePrepare();
    await expect(pending).resolves.toMatchObject({
      publicationEpoch: 1,
      worldState: { simulationTick: 1 },
    });
    expect(harness.commits()).toBe(1);
  });

  it("keeps exact committed bytes when Runtime prepare rejects and remains retryable", async () => {
    const harness = preparedPortHarness();
    const session = await WorldSession.create(sessionOptions(harness.port));
    const before = session.snapshot();
    harness.failNextPrepare(new Error("native resolve rejected"));

    await expect(session.runFixedInput({ actions: [], ticks: 1 }))
      .rejects.toThrow(/ADAPTER_FIXED_INPUT_FAILED/);

    expect(session.snapshot()).toBe(before);
    expect(session.eventsAfter(0, 100)).toEqual([]);
    expect(session.phase).toBe("ready");
    expect(harness.commits()).toBe(0);
    expect(harness.aborts()).toBe(0);

    await expect(session.runFixedInput({ actions: [], ticks: 1 }))
      .resolves.toMatchObject({ worldState: { simulationTick: 1 } });
    expect(harness.prepares()).toBe(2);
    expect(harness.commits()).toBe(1);
  });

  it("aborts an incoherent Locomotion V2 envelope once without advancing publication", async () => {
    const harness = preparedPortHarness();
    const session = await WorldSession.create(sessionOptions(harness.port));
    const before = session.snapshot();
    const beforeBytes = JSON.stringify(before);
    harness.stageProjection(projectionWithMismatchedLocomotionTick(1, 0));

    await expect(session.runFixedInput({ actions: [], ticks: 1 }))
      .rejects.toThrow(/ADAPTER_FIXED_INPUT_FAILED/);

    expect(session.snapshot()).toBe(before);
    expect(JSON.stringify(session.snapshot())).toBe(beforeBytes);
    expect(session.eventsAfter(0, 100)).toEqual([]);
    expect(session.phase).toBe("ready");
    expect(harness.aborts()).toBe(1);
    expect(harness.commits()).toBe(0);
    expect(harness.committedProjection().simulationTick).toBe(0);

    await expect(session.runFixedInput({ actions: [], ticks: 1 }))
      .resolves.toMatchObject({ worldState: { simulationTick: 1 } });
    expect(harness.commits()).toBe(1);
  });

  it("rejects older and same-Tick replay, then accepts exactly the next fresh Tick", async () => {
    const harness = preparedPortHarness();
    const session = await WorldSession.create(sessionOptions(harness.port));
    await session.runFixedInput({ actions: [], ticks: 1 });
    const beforeReplay = session.snapshot();

    for (const replayTick of [0, 1]) {
      harness.stageProjection(projection(replayTick));
      await expect(session.runFixedInput({ actions: [], ticks: 1 }))
        .rejects.toThrow(/ADAPTER_FIXED_INPUT_FAILED/);
      expect(session.snapshot()).toBe(beforeReplay);
      expect(session.eventsAfter(0, 100)).toEqual([]);
    }

    expect(harness.aborts()).toBe(2);
    expect(harness.commits()).toBe(1);
    await expect(session.runFixedInput({ actions: [], ticks: 1 }))
      .resolves.toMatchObject({ worldState: { simulationTick: 2 } });
  });

  it("fails closed on abort failure without changing publication or journal", async () => {
    const harness = preparedPortHarness();
    const session = await WorldSession.create(sessionOptions(harness.port));
    const before = session.snapshot();
    harness.stageProjection(projection(0));
    harness.failNextAbort(new Error("native checkpoint restore failed"));

    await expect(session.runFixedInput({ actions: [], ticks: 1 }))
      .rejects.toThrow(/ADAPTER_ABORT_FAILED/);

    expect(session.snapshot()).toBe(before);
    expect(session.eventsAfter(0, 100)).toEqual([]);
    expect(session.phase).toBe("failed");
    expect(harness.aborts()).toBe(1);
    expect(harness.commits()).toBe(0);
    expect(harness.disposes()).toBe(1);
  });

  it("keeps Host publication atomic when the provider violates the no-throw commit contract", async () => {
    const harness = preparedPortHarness();
    const session = await WorldSession.create(sessionOptions(harness.port));
    const before = session.snapshot();
    harness.failNextCommit(new Error("commit contract violation"));

    await expect(session.runFixedInput({ actions: [], ticks: 1 }))
      .rejects.toThrow(/ADAPTER_COMMIT_CONTRACT_VIOLATED/);

    expect(session.snapshot()).toBe(before);
    expect(session.eventsAfter(0, 100)).toEqual([]);
    expect(session.phase).toBe("failed");
    expect(harness.commitAttempts()).toBe(1);
    expect(harness.commits()).toBe(0);
    expect(harness.aborts()).toBe(0);
    expect(harness.disposes()).toBe(1);
  });

  it("produces the same canonical World hash under 30/60/120-like read schedules", async () => {
    const schedules = [[1, 1, 1], [2, 1], [3]] as const;
    const hashes: string[] = [];

    for (const schedule of schedules) {
      const harness = preparedPortHarness();
      const session = await WorldSession.create(sessionOptions(harness.port));
      for (const ticks of schedule) {
        await session.runFixedInput({ actions: ["move-forward"], ticks });
        // Render cadence is a read-only consumer of the committed pointer.
        expect(session.snapshot()).toBe(session.snapshot());
      }
      hashes.push(session.snapshot().worldState.worldStateHash);
      expect(session.snapshot().worldState.simulationTick).toBe(3);
      expect(harness.commits()).toBe(3);
    }

    expect(new Set(hashes).size).toBe(1);
  });

  it("isolates two Sessions and disposes each prepared port exactly once", async () => {
    const firstHarness = preparedPortHarness();
    const secondHarness = preparedPortHarness();
    const first = await WorldSession.create(sessionOptions(firstHarness.port));
    const second = await WorldSession.create(sessionOptions(secondHarness.port));

    firstHarness.failNextPrepare(new Error("first session only"));
    await expect(first.runFixedInput({ actions: [], ticks: 1 })).rejects.toThrow();
    await expect(second.runFixedInput({ actions: [], ticks: 1 }))
      .resolves.toMatchObject({ worldState: { simulationTick: 1 } });
    expect(first.snapshot().worldState.simulationTick).toBe(0);
    expect(second.snapshot().worldState.simulationTick).toBe(1);

    const firstDispose = first.dispose();
    expect(first.dispose()).toBe(firstDispose);
    await firstDispose;
    const secondDispose = second.dispose();
    expect(second.dispose()).toBe(secondDispose);
    await secondDispose;
    expect(firstHarness.disposes()).toBe(1);
    expect(secondHarness.disposes()).toBe(1);
    expect(first.phase).toBe("disposed");
    expect(second.phase).toBe("disposed");
  });
});
