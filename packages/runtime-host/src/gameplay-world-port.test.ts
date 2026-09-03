import {
  deriveGameplaySemanticFactIdV1,
  type GameplayRelationshipStateV1,
  type GameplaySemanticFactV1,
  type SpatialEntityStateV1,
} from "@whitebox-world/gameplay-contracts";
import { describe, expect, it } from "vitest";

import {
  parseGameplayFixedInputCapacityEstimateV1,
  parseGameplayViewStateProjectionV1,
  parseGameplayWorldStateProjectionV1,
  parseGameplayWorldTransactionV1,
  type FixedInputOneTickV1,
  type GameplayWorldPortV1,
} from "./gameplay-world-port";

const HASH = `sha256:${"a".repeat(64)}` as const;

function spatialEntity(
  id = "entity.hero",
): SpatialEntityStateV1 {
  return {
    id,
    kind: "spatial-entity-state",
    entityDefinitionRef: `worldkit://entity-definition/${id}@1`,
    entityDefinitionHash: HASH,
    semanticClassId: "character.humanoid",
    lifecycleMode: "active",
    positionMetersXYZ: [1, 2, 3],
    rotationQuaternionXYZW: [0, 0, 0, 1],
    scaleRatioXYZ: [1, 1, 1],
    linearVelocityMetersPerSecondXYZ: [0, 0, 0],
  };
}

function touchingFact(): GameplaySemanticFactV1 {
  const body = {
    type: "touching" as const,
    schemaVersion: 1 as const,
    entityIds: ["entity.hero", "entity.wall"] as const,
    startedSimulationTick: 7,
    semanticFactProjectorProfileRef:
      "worldkit://semantic-fact-projector/default@1",
    semanticFactProjectorProfileHash: HASH,
  };
  return { ...body, id: deriveGameplaySemanticFactIdV1(body) };
}

function worldProjectionInput() {
  const hero = spatialEntity();
  const wall = spatialEntity("entity.wall");
  const fact = touchingFact();
  return {
    simulationTick: 7,
    spatialEntityStatesById: { [hero.id]: hero, [wall.id]: wall },
    capabilityStatesById: {
      "capability.hero.locomotion": {
        id: "capability.hero.locomotion",
        kind: "locomotion-capability-state-v2" as const,
        ownerEntityId: hero.id,
        locomotionCapabilityRef: "worldkit://locomotion-capability/humanoid@1",
        locomotionCapabilityHash: HASH,
        locomotion: {
          schemaVersion: 2 as const,
          status: "active" as const,
          mobilityMode: "grounded" as const,
          gait: "idle" as const,
          verticalPhase: "none" as const,
          supportMode: "supported" as const,
          movementMedium: "ground" as const,
          facingYawRadians: 0,
          linearVelocity: { x: 0, y: 0, z: 0 },
          horizontalSpeedMetersPerSecond: 0,
          committedTick: 7,
          phaseEnteredTick: 7,
          transitionSequence: 0,
        },
      },
    },
    semanticFactsById: { [fact.id]: fact },
  };
}

function projectionValidationOptions(
  relationshipStatesById: Readonly<
    Record<string, GameplayRelationshipStateV1>
  > = {},
) {
  return {
    controllerEntityIds: ["controller.primary"],
    relationshipStatesById,
  } as const;
}

describe("GameplayWorldPortV1 projection boundary", () => {
  it("validates a suspended Rider capability against the staged mountedOn Relationship", () => {
    const relationship = {
      id: "mounted-on:primary",
      type: "mountedOn" as const,
      schemaVersion: 1 as const,
      riderEntityId: "entity.hero",
      mountEntityId: "entity.wall",
      mountSlotId: "stand",
      establishedSimulationTick: 7,
    };
    const input = {
      ...worldProjectionInput(),
      capabilityStatesById: {
        "capability-state:entity.hero:locomotion": {
          id: "capability-state:entity.hero:locomotion",
          kind: "locomotion-capability-state-v2" as const,
          ownerEntityId: "entity.hero",
          locomotionCapabilityRef: "worldkit://locomotion-profile/humanoid@1",
          locomotionCapabilityHash: HASH,
          locomotion: {
            schemaVersion: 2 as const,
            status: "suspended" as const,
            suspendedByRelationshipId: relationship.id,
            committedTick: 7,
            transitionSequence: 1,
          },
        },
      },
    };

    expect(parseGameplayWorldStateProjectionV1(
      input,
      projectionValidationOptions({ [relationship.id]: relationship }),
    ).capabilityStatesById).toEqual(input.capabilityStatesById);
  });

  it("snapshots and deeply freezes an exact canonical world projection", () => {
    const input = worldProjectionInput();

    const parsed = parseGameplayWorldStateProjectionV1(
      input,
      projectionValidationOptions(),
    );

    expect(parsed).not.toBe(input);
    expect(parsed).toEqual(input);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.spatialEntityStatesById)).toBe(true);
    expect(Object.isFrozen(parsed.spatialEntityStatesById["entity.hero"])).toBe(
      true,
    );
    expect(Object.isFrozen(
      parsed.spatialEntityStatesById["entity.hero"]?.positionMetersXYZ,
    )).toBe(true);

    (
      input.spatialEntityStatesById["entity.hero"]!.positionMetersXYZ as
        unknown as number[]
    )[0] = 99;
    expect(
      parsed.spatialEntityStatesById["entity.hero"]?.positionMetersXYZ,
    ).toEqual([1, 2, 3]);
  });

  it.each([
    ["an unknown root key", { ...worldProjectionInput(), providerHandle: 17 }],
    [
      "a provider key in a spatial entity",
      {
        ...worldProjectionInput(),
        spatialEntityStatesById: {
          "entity.hero": { ...spatialEntity(), meshHandle: "opaque" },
        },
      },
    ],
    [
      "a controller identity projected as a spatial entity",
      {
        ...worldProjectionInput(),
        spatialEntityStatesById: {
          "controller.primary": spatialEntity("controller.primary"),
        },
        capabilityStatesById: {},
      },
    ],
  ])("rejects %s", (_label, input) => {
    expect(() => parseGameplayWorldStateProjectionV1(
      input,
      projectionValidationOptions(),
    )).toThrow(/GameplayWorldStateProjectionV1/);
  });

  it("rejects accessors, symbols, non-plain prototypes, and malformed map identity", () => {
    const accessor = worldProjectionInput() as Record<string, unknown>;
    Object.defineProperty(accessor, "simulationTick", {
      enumerable: true,
      get: () => 7,
    });

    const symbol = worldProjectionInput() as Record<PropertyKey, unknown>;
    symbol[Symbol("hidden")] = "opaque";

    const inherited = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      worldProjectionInput(),
    );

    const mismatchedId = {
      ...worldProjectionInput(),
      spatialEntityStatesById: { "entity.other": spatialEntity() },
      capabilityStatesById: {},
    };

    for (const input of [accessor, symbol, inherited, mismatchedId]) {
      expect(() => parseGameplayWorldStateProjectionV1(
        input,
        projectionValidationOptions(),
      )).toThrow(/GameplayWorldStateProjectionV1/);
    }
  });

  it("rejects a Controller Fact endpoint", () => {
    const invalidEndpointEntityId = "controller.primary";
    const body = {
      type: "touching" as const,
      schemaVersion: 1 as const,
      entityIds: [invalidEndpointEntityId, "entity.hero"].sort() as [string, string],
      startedSimulationTick: 7,
      semanticFactProjectorProfileRef:
        "worldkit://semantic-fact-projector/default@1",
      semanticFactProjectorProfileHash: HASH,
    };
    const fact = { ...body, id: deriveGameplaySemanticFactIdV1(body) };
    const input = {
      ...worldProjectionInput(),
      semanticFactsById: { [fact.id]: fact },
    };

    expect(() => parseGameplayWorldStateProjectionV1(
      input,
      projectionValidationOptions(),
    )).toThrow(/GameplayWorldStateProjectionV1/);
  });

  it("accepts a Package-only static Fact endpoint", () => {
    const body = {
      type: "touching" as const,
      schemaVersion: 1 as const,
      entityIds: ["entity.hero", "entity.package-static"] as const,
      startedSimulationTick: 7,
      semanticFactProjectorProfileRef:
        "worldkit://semantic-fact-projector/default@1",
      semanticFactProjectorProfileHash: HASH,
    };
    const fact = { ...body, id: deriveGameplaySemanticFactIdV1(body) };
    expect(parseGameplayWorldStateProjectionV1({
      ...worldProjectionInput(),
      semanticFactsById: { [fact.id]: fact },
    }, projectionValidationOptions()).semanticFactsById).toEqual({
      [fact.id]: fact,
    });
  });

  it("uses only an opaque provider-neutral view revision", () => {
    expect(parseGameplayViewStateProjectionV1({ viewStateRevision: 3 })).toEqual({
      viewStateRevision: 3,
    });
    for (const input of [
      { viewStateRevision: -1 },
      { viewStateRevision: 1, controlledEntityId: "entity.hero" },
      { viewStateRevision: 1, cameraHandle: "opaque" },
      Object.assign(Object.create({ inherited: true }), { viewStateRevision: 1 }),
    ]) {
      expect(() => parseGameplayViewStateProjectionV1(input)).toThrow(
        /GameplayViewStateProjectionV1/,
      );
    }

    const accessor = {} as Record<string, unknown>;
    Object.defineProperty(accessor, "viewStateRevision", {
      enumerable: true,
      get: () => 1,
    });
    expect(() => parseGameplayViewStateProjectionV1(accessor)).toThrow(
      /GameplayViewStateProjectionV1/,
    );
  });

  it("validates and freezes the exact fixed-input capacity estimate", () => {
    const parsed = parseGameplayFixedInputCapacityEstimateV1({
      maximumSemanticFactCountAfterInput: 12,
      maximumSemanticFactTransitionEventCount: 4,
    });
    expect(parsed).toEqual({
      maximumSemanticFactCountAfterInput: 12,
      maximumSemanticFactTransitionEventCount: 4,
    });
    expect(Object.isFrozen(parsed)).toBe(true);

    for (const input of [
      {
        maximumSemanticFactCountAfterInput: 12,
        maximumSemanticFactTransitionEventCount: -1,
      },
      {
        maximumSemanticFactCountAfterInput: 12,
        maximumSemanticFactTransitionEventCount: 4,
        providerBudget: 1,
      },
    ]) {
      expect(() => parseGameplayFixedInputCapacityEstimateV1(input)).toThrow(
        /GameplayFixedInputCapacityEstimateV1/,
      );
    }
  });
});

describe("GameplayWorldPortV1 transaction boundary", () => {
  it("snapshots projections and fixes lifecycle function identity without executing them", async () => {
    let commitCount = 0;
    let abortCount = 0;
    let commitReceiverMatches = false;
    let abortReceiverMatches = false;
    const input = {
      projectedWorldStateAfter: worldProjectionInput(),
      projectedViewStateAfter: {
        viewStateRevision: 8,
      },
      commitPrepared(this: unknown) {
        commitReceiverMatches = this === input;
        commitCount += 1;
      },
      abort(this: unknown) {
        abortReceiverMatches = this === input;
        abortCount += 1;
        return Promise.resolve();
      },
    };
    const originalCommitPrepared = input.commitPrepared;
    const originalAbort = input.abort;

    const transaction = parseGameplayWorldTransactionV1(
      input,
      projectionValidationOptions(),
    );

    expect(commitCount).toBe(0);
    expect(abortCount).toBe(0);
    expect(transaction.commitPrepared).not.toBe(originalCommitPrepared);
    expect(transaction.abort).not.toBe(originalAbort);
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.projectedWorldStateAfter)).toBe(true);
    expect(Object.isFrozen(transaction.projectedViewStateAfter)).toBe(true);

    input.projectedViewStateAfter.viewStateRevision = 99;
    expect(transaction.projectedViewStateAfter.viewStateRevision).toBe(8);
    const firstAbort = transaction.abort();
    expect(transaction.abort()).toBe(firstAbort);
    await firstAbort;
    expect(abortCount).toBe(1);
    expect(abortReceiverMatches).toBe(true);
    expect(() => transaction.commitPrepared()).toThrow(/already aborted/);
    expect(commitCount).toBe(0);
  });

  it("commits exactly once with the accepted transaction as receiver", () => {
    let commitCount = 0;
    let commitReceiverMatches = false;
    const input = {
      projectedWorldStateAfter: worldProjectionInput(),
      projectedViewStateAfter: { viewStateRevision: 8 },
      commitPrepared(this: unknown) {
        commitReceiverMatches = this === input;
        commitCount += 1;
      },
      abort: () => Promise.resolve(),
    };
    const transaction = parseGameplayWorldTransactionV1(
      input,
      projectionValidationOptions(),
    );

    transaction.commitPrepared();
    expect(commitCount).toBe(1);
    expect(commitReceiverMatches).toBe(true);
    expect(() => transaction.commitPrepared()).toThrow(/already committed/);
    expect(commitCount).toBe(1);
  });

  it("rejects an asynchronous provider commit contract violation synchronously", () => {
    let providerState = "prepared";
    const input = {
      projectedWorldStateAfter: worldProjectionInput(),
      projectedViewStateAfter: { viewStateRevision: 8 },
      commitPrepared() {
        return Promise.resolve().then(() => {
          providerState = "committed-late";
        });
      },
      abort: () => Promise.resolve(),
    };
    const transaction = parseGameplayWorldTransactionV1(
      input,
      projectionValidationOptions(),
    );

    expect(() => transaction.commitPrepared()).toThrow(
      /commitPrepared.*undefined/,
    );
    expect(providerState).toBe("prepared");
  });

  it("consumes a rejected asynchronous commit result after the synchronous violation", async () => {
    const unhandledReasons: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledReasons.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      const input = {
        projectedWorldStateAfter: worldProjectionInput(),
        projectedViewStateAfter: { viewStateRevision: 8 },
        commitPrepared() {
          return Promise.reject(new Error("provider async rejection"));
        },
        abort: () => Promise.resolve(),
      };
      const transaction = parseGameplayWorldTransactionV1(
        input,
        projectionValidationOptions(),
      );

      expect(() => transaction.commitPrepared()).toThrow(
        /commitPrepared.*undefined/,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(unhandledReasons).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("returns one rejected abort Promise when the provider abort throws", async () => {
    let abortCount = 0;
    const input = {
      projectedWorldStateAfter: worldProjectionInput(),
      projectedViewStateAfter: { viewStateRevision: 8 },
      commitPrepared: () => {},
      abort() {
        abortCount += 1;
        throw new Error("provider abort failed");
      },
    };
    const transaction = parseGameplayWorldTransactionV1(
      input,
      projectionValidationOptions(),
    );

    const firstAbort = transaction.abort();
    expect(transaction.abort()).toBe(firstAbort);
    await expect(firstAbort).rejects.toThrow("provider abort failed");
    expect(abortCount).toBe(1);
  });

  it("rejects hostile transaction containers and invalid staged projections", () => {
    const valid = {
      projectedWorldStateAfter: worldProjectionInput(),
      projectedViewStateAfter: { viewStateRevision: 8 },
      commitPrepared: () => {},
      abort: () => Promise.resolve(),
    };
    const accessor = { ...valid } as Record<string, unknown>;
    Object.defineProperty(accessor, "commitPrepared", {
      enumerable: true,
      get: () => () => {},
    });
    const symbol = { ...valid } as Record<PropertyKey, unknown>;
    symbol[Symbol("hidden")] = "opaque";

    for (const input of [
      accessor,
      symbol,
      { ...valid, physicsBodyHandle: 12 },
      { ...valid, commitPrepared: "not-a-function" },
      {
        ...valid,
        projectedViewStateAfter: { viewStateRevision: 8, providerState: true },
      },
      {
        ...valid,
        projectedWorldStateAfter: {
          ...worldProjectionInput(),
          spatialEntityStatesById: {
            "controller.primary": spatialEntity("controller.primary"),
          },
          capabilityStatesById: {},
        },
      },
    ]) {
      expect(() => parseGameplayWorldTransactionV1(
        input,
        projectionValidationOptions(),
      )).toThrow(/GameplayWorldTransactionV1/);
    }
  });

  it("defines a single-tick, provider-neutral port surface", () => {
    const oneTickInput = {
      actions: [],
      ticks: 1,
    } satisfies FixedInputOneTickV1;

    const port = {
      initialize: async () => parseGameplayWorldStateProjectionV1(
        worldProjectionInput(),
        projectionValidationOptions(),
      ),
      hasEntity: (entityId: string) => entityId === "entity.hero",
      isEntityControllable: (entityId: string) => entityId === "entity.hero",
      isActionAvailable: () => true,
      prepareGameplayTransition: async () => {
        throw new Error("not used in this contract test");
      },
      estimateFixedInputTickCapacity: () => ({
        maximumSemanticFactCountAfterInput: 1,
        maximumSemanticFactTransitionEventCount: 0,
      }),
      prepareFixedInputTick: async () => {
        throw new Error("not used in this contract test");
      },
      snapshot: () => parseGameplayWorldStateProjectionV1(
        worldProjectionInput(),
        projectionValidationOptions(),
      ),
      dispose: async () => {},
    } satisfies GameplayWorldPortV1;

    expect(oneTickInput.ticks).toBe(1);
    expect(port.hasEntity("entity.hero")).toBe(true);
  });
});
