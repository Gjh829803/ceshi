import {
  deriveGameplaySemanticFactIdV1,
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
  const fact = touchingFact();
  return {
    simulationTick: 7,
    spatialEntityStatesById: { [hero.id]: hero },
    capabilityStatesById: {
      "capability.hero.locomotion": {
        id: "capability.hero.locomotion",
        kind: "locomotion-capability-state" as const,
        ownerEntityId: hero.id,
        locomotionCapabilityRef: "worldkit://locomotion-capability/humanoid@1",
        locomotionCapabilityHash: HASH,
        mode: "idle" as const,
        movementMedium: "ground" as const,
        facingYawRadians: 0,
        speedMetersPerSecond: 0,
      },
    },
    semanticFactsById: { [fact.id]: fact },
  };
}

function projectionValidationOptions() {
  return { controllerEntityIds: ["controller.primary"] } as const;
}

describe("GameplayWorldPortV1 projection boundary", () => {
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

  it("uses only an opaque provider-neutral view revision and controlled entity", () => {
    expect(parseGameplayViewStateProjectionV1({ viewStateRevision: 3 })).toEqual({
      viewStateRevision: 3,
    });
    expect(parseGameplayViewStateProjectionV1({
      viewStateRevision: 4,
      controlledEntityId: "entity.hero",
    })).toEqual({
      viewStateRevision: 4,
      controlledEntityId: "entity.hero",
    });

    for (const input of [
      { viewStateRevision: -1 },
      { viewStateRevision: 1, controlledEntityId: "" },
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
    const abortPromise = Promise.resolve();
    const commitPrepared = () => {
      commitCount += 1;
    };
    const abort = () => {
      abortCount += 1;
      return abortPromise;
    };
    const input = {
      projectedWorldStateAfter: worldProjectionInput(),
      projectedViewStateAfter: {
        viewStateRevision: 8,
        controlledEntityId: "entity.hero",
      },
      commitPrepared,
      abort,
    };

    const transaction = parseGameplayWorldTransactionV1(
      input,
      projectionValidationOptions(),
    );

    expect(commitCount).toBe(0);
    expect(abortCount).toBe(0);
    expect(transaction.commitPrepared).toBe(commitPrepared);
    expect(transaction.abort).toBe(abort);
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.projectedWorldStateAfter)).toBe(true);
    expect(Object.isFrozen(transaction.projectedViewStateAfter)).toBe(true);

    input.projectedViewStateAfter.viewStateRevision = 99;
    expect(transaction.projectedViewStateAfter.viewStateRevision).toBe(8);
    expect(transaction.abort()).toBe(transaction.abort());
    await transaction.abort();
    expect(abortCount).toBe(3);
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
      runFixedInputTick: async () => parseGameplayWorldStateProjectionV1(
        worldProjectionInput(),
        projectionValidationOptions(),
      ),
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
