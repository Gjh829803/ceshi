import { describe, expect, it, vi, type Mock } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  createGameplayBootstrapV1 as createGameplayBootstrapV1FromPackage,
} from "@whitebox-world/gameplay-contracts";

import {
  canonicalizeGameplayActionDefinitionV1,
  canonicalizeGameplayBootstrapV1,
  canonicalizeGameplayFeatureManifestV1,
  createGameplayActionDefinitionV1,
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
  createGameplayEntityDescriptorV1,
  createGameplayFeatureManifestV1,
  createSemanticFactProjectorProfileResourceV1,
  deriveGameplayActionDefinitionContentHashV1,
  deriveGameplayBootstrapContentHashV1,
  deriveGameplayFeatureManifestContentHashV1,
  deriveSemanticFactProjectorProfileResourceContentHashV1,
  gameplayActionDefinitionCanonicalBytesV1,
  gameplayBootstrapCanonicalBytesV1,
  gameplayFeatureManifestCanonicalBytesV1,
  parseGameplayActionDefinitionV1,
  parseGameplayBootstrapV1,
  parseGameplayEntityDescriptorV1,
  parseGameplayFeatureManifestV1,
  parseGameplayFeatureResourceLockV1,
  parseSemanticFactProjectorProfileResourceV1,
  type GameplayActionDefinitionBodyV1,
  type GameplayBootstrapBodyV1,
  type GameplayFeatureManifestBodyV1,
  type SemanticFactProjectorProfileResourceBodyV1,
} from "./gameplay-artifacts";

const HASH_A = `sha256:${"a".repeat(64)}` as const;

function featureBody(
  overrides: Partial<GameplayFeatureManifestBodyV1> = {},
): GameplayFeatureManifestBodyV1 {
  return {
    kind: "gameplay-feature",
    id: "feature-a",
    version: 1,
    resourceRef: "worldkit://gameplay-feature/feature-a@1",
    dependencyFeatureRefs: ["feature:z", "feature:a"],
    requiredCapabilityRefs: ["capability:z", "capability:a"],
    commandTypes: ["control.release", "control.bind"],
    resourceBudget: { stateSliceCount: 1, commandHandlerCount: 2 },
    ...overrides,
  };
}

function actionBody(
  overrides: Partial<GameplayActionDefinitionBodyV1> = {},
): GameplayActionDefinitionBodyV1 {
  return {
    kind: "semantic-action",
    id: "wave",
    version: 1,
    resourceRef: "worldkit://semantic-action/wave@1",
    executionMode: "exclusive-per-subject",
    completion: { mode: "fixed-duration", durationTicks: 12 },
    effect: { mode: "state-only" },
    isMovementInputBlocked: false,
    allowedActorEntityDefinitionRefs: ["entity:z", "entity:a"],
    requiredActorCapabilityRefs: ["capability:z", "capability:a"],
    request: { mode: "none" },
    ...overrides,
  };
}

function semanticFactProjectorProfileBody(
  overrides: Partial<SemanticFactProjectorProfileResourceBodyV1> = {},
): SemanticFactProjectorProfileResourceBodyV1 {
  return {
    kind: "semantic-fact-projector-profile",
    schemaVersion: 1,
    id: "physics-retained-support",
    version: 1,
    resourceRef:
      "worldkit://semantic-fact-projector-profile/physics.retained-support@1",
    supportedByProjection: {
      supportSampleSource: "retained-character-support",
      acceptedSupportStates: ["sliding", "supported"],
      supportSurfaceMotionMode: "static",
      supportPointHeightToleranceMode: "character-body-contact-band",
      minimumContactToAggregateSupportNormalCosine: 0.95,
      ambiguousSurfaceMode: "omit",
      endDelayTicks: 0,
    },
    ...overrides,
  };
}

function bootstrapBody(
  overrides: Partial<GameplayBootstrapBodyV1> = {},
): GameplayBootstrapBodyV1 {
  const featureA = createGameplayFeatureManifestV1(featureBody());
  const featureZ = createGameplayFeatureManifestV1(featureBody({
    id: "feature-z",
    resourceRef: "worldkit://gameplay-feature/feature-z@1",
  }));
  const actionA = createGameplayActionDefinitionV1(actionBody());
  const actionZ = createGameplayActionDefinitionV1(actionBody({
    id: "salute",
    resourceRef: "worldkit://semantic-action/salute@1",
  }));
  return {
    kind: "gameplay-bootstrap",
    id: "world-a-gameplay",
    version: 1,
    resourceRef: "worldkit://gameplay-bootstrap/world-a@1",
    semanticFactProjectorProfileResource:
      createSemanticFactProjectorProfileResourceV1(
        semanticFactProjectorProfileBody(),
      ),
    entityDescriptors: [
      {
        id: "subject-z",
        entityDefinitionRef: "worldkit://entity/humanoid@1",
        capabilityRefs: ["capability:z", "capability:a"],
      },
      {
        id: "subject-a",
        entityDefinitionRef: "worldkit://entity/humanoid@1",
        capabilityRefs: ["capability:a"],
      },
    ],
    featureResourceLocks: [
      { resourceRef: featureZ.resourceRef, contentHash: featureZ.contentHash },
      { resourceRef: featureA.resourceRef, contentHash: featureA.contentHash },
    ],
    semanticActionDefinitions: [actionZ, actionA],
    availableCapabilityRefs: ["capability:z", "capability:a"],
    initialRelationshipStates: [
      {
        id: "relationship:z",
        type: "mountedOn",
        schemaVersion: 1,
        riderEntityId: "subject-z",
        mountEntityId: "subject-a",
        mountSlotId: "standing",
        establishedSimulationTick: 0,
      },
      {
        id: "relationship:a",
        type: "possessedBy",
        schemaVersion: 1,
        controlledEntityId: "subject-a",
        controllerEntityId: "controller-a",
        establishedSimulationTick: 0,
      },
    ],
    ...overrides,
  };
}

function accessorArray<T>(value: T, getter: Mock<() => T>): T[] {
  const array: T[] = [];
  Object.defineProperty(array, "0", {
    configurable: true,
    enumerable: true,
    get: getter,
  });
  array.length = 1;
  return array;
}

describe("GameplayEntityDescriptorV1", () => {
  it("canonicalizes capability refs while the serialized parser requires canonical order", () => {
    const descriptor = createGameplayEntityDescriptorV1({
      id: "subject-a",
      entityDefinitionRef: "worldkit://entity/humanoid@1",
      capabilityRefs: ["capability:z", "capability:a"],
    });

    expect(descriptor.capabilityRefs).toEqual(["capability:a", "capability:z"]);
    expect(Object.isFrozen(descriptor.capabilityRefs)).toBe(true);
    expect(() => parseGameplayEntityDescriptorV1({
      ...descriptor,
      capabilityRefs: ["capability:z", "capability:a"],
    })).toThrow(/GameplayEntityDescriptorV1/);
  });

  it("rejects duplicates, unknown fields, hostile prototypes, Symbols, and accessors", () => {
    const valid = {
      id: "subject-a",
      entityDefinitionRef: "worldkit://entity/humanoid@1",
      capabilityRefs: ["capability:a"],
    };
    expect(() => createGameplayEntityDescriptorV1({
      ...valid,
      capabilityRefs: ["capability:a", "capability:a"],
    })).toThrow(/GameplayEntityDescriptorV1/);
    expect(() => parseGameplayEntityDescriptorV1({ ...valid, mystery: true }))
      .toThrow(/GameplayEntityDescriptorV1/);
    expect(() => parseGameplayEntityDescriptorV1(
      Object.assign(Object.create({ inherited: true }), valid),
    )).toThrow(/GameplayEntityDescriptorV1/);
    expect(() => parseGameplayEntityDescriptorV1({
      ...valid,
      [Symbol("hidden")]: true,
    })).toThrow(/GameplayEntityDescriptorV1/);

    const getter = vi.fn(() => "capability:side-effect");
    expect(() => createGameplayEntityDescriptorV1({
      ...valid,
      capabilityRefs: accessorArray("capability:side-effect", getter),
    })).toThrow(/GameplayEntityDescriptorV1/);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("GameplayFeatureManifestV1", () => {
  it("builds a canonical self-hashed manifest and stable wire bytes", () => {
    const manifest = createGameplayFeatureManifestV1(featureBody());
    const expectedBody = {
      ...featureBody(),
      dependencyFeatureRefs: ["feature:a", "feature:z"],
      requiredCapabilityRefs: ["capability:a", "capability:z"],
      commandTypes: ["control.bind", "control.release"],
    };

    expect(manifest.contentHash).toBe(sha256CanonicalJson(expectedBody));
    expect(deriveGameplayFeatureManifestContentHashV1(featureBody()))
      .toBe(manifest.contentHash);
    expect(new TextDecoder().decode(gameplayFeatureManifestCanonicalBytesV1(manifest)))
      .toBe(canonicalizeGameplayFeatureManifestV1(manifest));
    expect(parseGameplayFeatureManifestV1(manifest)).toEqual(manifest);
  });

  it("rejects noncanonical serialized sets, stale hashes, and invalid budgets", () => {
    const manifest = createGameplayFeatureManifestV1(featureBody());
    expect(() => parseGameplayFeatureManifestV1({
      ...manifest,
      dependencyFeatureRefs: ["feature:z", "feature:a"],
    })).toThrow(/GameplayFeatureManifestV1/);
    expect(() => parseGameplayFeatureManifestV1({
      ...manifest,
      contentHash: HASH_A,
    })).toThrow(/GameplayFeatureManifestV1/);
    expect(() => createGameplayFeatureManifestV1(featureBody({
      resourceBudget: { stateSliceCount: 1, commandHandlerCount: 1 },
    }))).toThrow(/GameplayFeatureManifestBodyV1/);
    expect(() => createGameplayFeatureManifestV1(featureBody({
      commandTypes: ["control.bind", "control.bind"],
    }))).toThrow(/GameplayFeatureManifestBodyV1/);
  });

  it("parses only exact feature resource locks", () => {
    expect(parseGameplayFeatureResourceLockV1({
      resourceRef: "worldkit://gameplay-feature/a@1",
      contentHash: HASH_A,
    })).toEqual({
      resourceRef: "worldkit://gameplay-feature/a@1",
      contentHash: HASH_A,
    });
    expect(() => parseGameplayFeatureResourceLockV1({
      resourceRef: "worldkit://gameplay-feature/a@1",
      contentHash: "sha256:bad",
    })).toThrow(/GameplayFeatureResourceLockV1/);
  });
});

describe("GameplayActionDefinitionV1", () => {
  it("builds canonical availability sets and validates its content hash", () => {
    const definition = createGameplayActionDefinitionV1(actionBody());
    const expectedBody = {
      ...actionBody(),
      allowedActorEntityDefinitionRefs: ["entity:a", "entity:z"],
      requiredActorCapabilityRefs: ["capability:a", "capability:z"],
    };

    expect(definition.contentHash).toBe(sha256CanonicalJson(expectedBody));
    expect(deriveGameplayActionDefinitionContentHashV1(actionBody()))
      .toBe(definition.contentHash);
    expect(new TextDecoder().decode(gameplayActionDefinitionCanonicalBytesV1(definition)))
      .toBe(canonicalizeGameplayActionDefinitionV1(definition));
    expect(parseGameplayActionDefinitionV1(definition)).toEqual(definition);
  });

  it("rejects noncanonical serialized sets, malformed completion/request unions, and stale hashes", () => {
    const definition = createGameplayActionDefinitionV1(actionBody());
    expect(() => parseGameplayActionDefinitionV1({
      ...definition,
      requiredActorCapabilityRefs: ["capability:z", "capability:a"],
    })).toThrow(/GameplayActionDefinitionV1/);
    expect(() => createGameplayActionDefinitionV1(actionBody({
      completion: { mode: "fixed-duration", durationTicks: 0 },
    }))).toThrow(/GameplayActionDefinitionBodyV1/);
    expect(() => createGameplayActionDefinitionV1(actionBody({
      request: {
        mode: "required",
        actionRequestSchemaRef: "schema:a",
        actionRequestSchemaHash: "sha256:bad" as typeof HASH_A,
      },
    }))).toThrow(/GameplayActionDefinitionBodyV1/);
    expect(() => parseGameplayActionDefinitionV1({
      ...definition,
      contentHash: HASH_A,
    })).toThrow(/GameplayActionDefinitionV1/);
  });

  it("supports immediate trusted effects only with a paired Ref and Hash", () => {
    const definition = createGameplayActionDefinitionV1(actionBody({
      completion: { mode: "immediate" },
      effect: {
        mode: "trusted",
        gameplayActionEffectRef:
          "worldkit://gameplay-action-effect/mounted-relationship@1",
        gameplayActionEffectHash: HASH_A,
      },
      request: {
        mode: "required",
        actionRequestSchemaRef: "worldkit://schema/mount-action-request@1",
        actionRequestSchemaHash: HASH_A,
      },
    }));

    expect(definition.completion).toEqual({ mode: "immediate" });
    expect(definition.effect).toEqual({
      mode: "trusted",
      gameplayActionEffectRef:
        "worldkit://gameplay-action-effect/mounted-relationship@1",
      gameplayActionEffectHash: HASH_A,
    });
    expect(() => createGameplayActionDefinitionV1(actionBody({
      effect: {
        mode: "trusted",
        gameplayActionEffectRef:
          "worldkit://gameplay-action-effect/mounted-relationship@1",
        gameplayActionEffectHash: "sha256:bad" as typeof HASH_A,
      },
    }))).toThrow(/GameplayActionDefinitionBodyV1/);
  });
});

describe("SemanticFactProjectorProfileResourceV1", () => {
  it("creates one closed hash-bound retained-support resource", () => {
    const body = semanticFactProjectorProfileBody();
    const resource = createSemanticFactProjectorProfileResourceV1(body);

    expect(resource.contentHash).toBe(
      deriveSemanticFactProjectorProfileResourceContentHashV1(body),
    );
    expect(parseSemanticFactProjectorProfileResourceV1(resource)).toEqual(
      resource,
    );
    expect(Object.isFrozen(resource.supportedByProjection)).toBe(true);
    expect(resource.supportedByProjection.acceptedSupportStates).toEqual([
      "sliding",
      "supported",
    ]);
  });

  it("rejects stale hashes, unknown fields, and unsupported projector policy", () => {
    const resource = createSemanticFactProjectorProfileResourceV1(
      semanticFactProjectorProfileBody(),
    );
    expect(() => parseSemanticFactProjectorProfileResourceV1({
      ...resource,
      contentHash: HASH_A,
    })).toThrow(/SemanticFactProjectorProfileResourceV1/);
    expect(() => parseSemanticFactProjectorProfileResourceV1({
      ...resource,
      unknownField: true,
    })).toThrow(/SemanticFactProjectorProfileResourceV1/);
    expect(() => createSemanticFactProjectorProfileResourceV1({
      ...semanticFactProjectorProfileBody(),
      supportedByProjection: {
        ...semanticFactProjectorProfileBody().supportedByProjection,
        acceptedSupportStates: ["supported"],
      },
    } as unknown as SemanticFactProjectorProfileResourceBodyV1)).toThrow(
      /SemanticFactProjectorProfileResourceBodyV1/,
    );
  });
});

describe("GameplayBootstrapV1", () => {
  it("is exported from the gameplay-contracts package boundary", () => {
    expect(createGameplayBootstrapV1FromPackage(bootstrapBody()).kind).toBe(
      "gameplay-bootstrap",
    );
  });

  it("canonicalizes every collection independent of input permutation", () => {
    const body = bootstrapBody();
    const first = createGameplayBootstrapV1(body);
    const second = createGameplayBootstrapV1({
      ...body,
      entityDescriptors: [...body.entityDescriptors].reverse(),
      featureResourceLocks: [...body.featureResourceLocks].reverse(),
      semanticActionDefinitions: [...body.semanticActionDefinitions].reverse(),
      availableCapabilityRefs: [...body.availableCapabilityRefs].reverse(),
      initialRelationshipStates: [...body.initialRelationshipStates].reverse(),
    });

    expect(first).toEqual(second);
    expect(first.entityDescriptors.map(({ id }) => id)).toEqual([
      "subject-a",
      "subject-z",
    ]);
    expect(first.featureResourceLocks.map(({ resourceRef }) => resourceRef)).toEqual([
      "worldkit://gameplay-feature/feature-a@1",
      "worldkit://gameplay-feature/feature-z@1",
    ]);
    expect(first.semanticActionDefinitions.map(({ resourceRef }) => resourceRef)).toEqual([
      "worldkit://semantic-action/salute@1",
      "worldkit://semantic-action/wave@1",
    ]);
    expect(first.availableCapabilityRefs).toEqual(["capability:a", "capability:z"]);
    expect(first.initialRelationshipStates.map(({ id }) => id)).toEqual([
      "relationship:a",
      "relationship:z",
    ]);
    expect(first.contentHash).toBe(deriveGameplayBootstrapContentHashV1(body));
    expect(new TextDecoder().decode(gameplayBootstrapCanonicalBytesV1(first)))
      .toBe(canonicalizeGameplayBootstrapV1(first));
    expect(Object.isFrozen(first.semanticActionDefinitions)).toBe(true);
    expect(Object.isFrozen(first.semanticActionDefinitions[0])).toBe(true);
  });

  it("derives one canonical semantic Resource Lock entry from a parsed Bootstrap", () => {
    const body = bootstrapBody();
    const first = createGameplayBootstrapResourceLockEntryV1(
      createGameplayBootstrapV1(body),
    );
    const second = createGameplayBootstrapResourceLockEntryV1(
      createGameplayBootstrapV1({
        ...body,
        entityDescriptors: [...body.entityDescriptors].reverse(),
        featureResourceLocks: [...body.featureResourceLocks].reverse(),
        semanticActionDefinitions: [...body.semanticActionDefinitions].reverse(),
        availableCapabilityRefs: [...body.availableCapabilityRefs].reverse(),
        initialRelationshipStates: [...body.initialRelationshipStates].reverse(),
      }),
    );

    expect(first).toEqual(second);
    expect(Object.keys(first)).toEqual([
      "resourceRef",
      "resourceKind",
      "resolvedVersion",
      "contentHash",
    ]);
    expect(first).toEqual({
      resourceRef: "worldkit://gameplay-bootstrap/world-a@1",
      resourceKind: "gameplay-bootstrap",
      resolvedVersion: "1",
      contentHash: createGameplayBootstrapV1(body).contentHash,
    });
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("rejects an invalid Bootstrap instead of deriving a partial Resource Lock", () => {
    const bootstrap = createGameplayBootstrapV1(bootstrapBody());

    expect(() => createGameplayBootstrapResourceLockEntryV1({
      ...bootstrap,
      contentHash: HASH_A,
    })).toThrow(/GameplayBootstrapV1/);
    expect(() => createGameplayBootstrapResourceLockEntryV1({
      ...bootstrap,
      version: 0,
    })).toThrow(/GameplayBootstrapV1/);
    expect(() => createGameplayBootstrapResourceLockEntryV1({
      ...bootstrap,
      unknownField: true,
    })).toThrow(/GameplayBootstrapV1/);
  });

  it.each([
    ["entityDescriptors", (body: GameplayBootstrapBodyV1) => ({
      ...body,
      entityDescriptors: [...body.entityDescriptors].reverse(),
    })],
    ["featureResourceLocks", (body: GameplayBootstrapBodyV1) => ({
      ...body,
      featureResourceLocks: [...body.featureResourceLocks].reverse(),
    })],
    ["semanticActionDefinitions", (body: GameplayBootstrapBodyV1) => ({
      ...body,
      semanticActionDefinitions: [...body.semanticActionDefinitions].reverse(),
    })],
    ["availableCapabilityRefs", (body: GameplayBootstrapBodyV1) => ({
      ...body,
      availableCapabilityRefs: [...body.availableCapabilityRefs].reverse(),
    })],
    ["initialRelationshipStates", (body: GameplayBootstrapBodyV1) => ({
      ...body,
      initialRelationshipStates: [...body.initialRelationshipStates].reverse(),
    })],
  ] as const)("rejects noncanonical serialized %s", (_field, mutate) => {
    const canonical = createGameplayBootstrapV1(bootstrapBody());
    expect(() => parseGameplayBootstrapV1(mutate(canonical))).toThrow(
      /GameplayBootstrapV1/,
    );
  });

  it("rejects duplicate collection identities and changed payloads with stale hashes", () => {
    const body = bootstrapBody();
    expect(() => createGameplayBootstrapV1({
      ...body,
      entityDescriptors: [body.entityDescriptors[0]!, body.entityDescriptors[0]!],
    })).toThrow(/GameplayBootstrapBodyV1/);
    expect(() => createGameplayBootstrapV1({
      ...body,
      featureResourceLocks: [
        body.featureResourceLocks[0]!,
        body.featureResourceLocks[0]!,
      ],
    })).toThrow(/GameplayBootstrapBodyV1/);
    expect(() => createGameplayBootstrapV1({
      ...body,
      semanticActionDefinitions: [
        body.semanticActionDefinitions[0]!,
        body.semanticActionDefinitions[0]!,
      ],
    })).toThrow(/GameplayBootstrapBodyV1/);
    expect(() => createGameplayBootstrapV1({
      ...body,
      availableCapabilityRefs: ["capability:a", "capability:a"],
    })).toThrow(/GameplayBootstrapBodyV1/);
    expect(() => createGameplayBootstrapV1({
      ...body,
      initialRelationshipStates: [
        body.initialRelationshipStates[0]!,
        body.initialRelationshipStates[0]!,
      ],
    })).toThrow(/GameplayBootstrapBodyV1/);

    const bootstrap = createGameplayBootstrapV1(body);
    expect(() => parseGameplayBootstrapV1({
      ...bootstrap,
      id: "changed-id",
    })).toThrow(/GameplayBootstrapV1/);
  });

  it("rejects hostile root/nested accessors, prototypes, Symbols, and unknown fields without side effects", () => {
    const body = bootstrapBody();
    const getter = vi.fn(() => body.entityDescriptors[0]!);
    expect(() => createGameplayBootstrapV1({
      ...body,
      entityDescriptors: accessorArray(body.entityDescriptors[0]!, getter),
    })).toThrow(/GameplayBootstrapBodyV1/);
    expect(getter).not.toHaveBeenCalled();

    expect(() => parseGameplayBootstrapV1(
      Object.assign(Object.create({ inherited: true }), createGameplayBootstrapV1(body)),
    )).toThrow(/GameplayBootstrapV1/);
    expect(() => parseGameplayBootstrapV1({
      ...createGameplayBootstrapV1(body),
      [Symbol("hidden")]: true,
    })).toThrow(/GameplayBootstrapV1/);
    expect(() => parseGameplayBootstrapV1({
      ...createGameplayBootstrapV1(body),
      mystery: true,
    })).toThrow(/GameplayBootstrapV1/);

    const relationshipGetter = vi.fn(() => "subject-a");
    const relationship = {
      ...body.initialRelationshipStates[0]!,
    } as Record<string, unknown>;
    Object.defineProperty(relationship, "riderEntityId", {
      configurable: true,
      enumerable: true,
      get: relationshipGetter,
    });
    expect(() => createGameplayBootstrapV1({
      ...body,
      initialRelationshipStates: [relationship],
    } as unknown as GameplayBootstrapBodyV1)).toThrow(
      /GameplayBootstrapBodyV1/,
    );
    expect(relationshipGetter).not.toHaveBeenCalled();
  });

  it("requires the closed initialRelationshipStates field and binds it into the body hash", () => {
    const body = bootstrapBody();
    const { initialRelationshipStates: _missing, ...missing } = body;
    expect(() => createGameplayBootstrapV1(
      missing as GameplayBootstrapBodyV1,
    )).toThrow(/GameplayBootstrapBodyV1/);
    expect(() => createGameplayBootstrapV1({
      ...body,
      initialRelationshipStates: [{
        ...body.initialRelationshipStates[0]!,
        unknownField: true,
      }],
    } as unknown as GameplayBootstrapBodyV1)).toThrow(
      /GameplayBootstrapBodyV1/,
    );

    const canonical = createGameplayBootstrapV1(body);
    expect(() => parseGameplayBootstrapV1({
      ...canonical,
      initialRelationshipStates: [],
    })).toThrow(/GameplayBootstrapV1/);
    expect(createGameplayBootstrapV1({
      ...body,
      initialRelationshipStates: [],
    }).contentHash).not.toBe(canonical.contentHash);
  });

  it("requires the full projector resource and binds its policy into the Bootstrap hash", () => {
    const body = bootstrapBody();
    const { semanticFactProjectorProfileResource: _missing, ...missing } = body;
    expect(() => createGameplayBootstrapV1(
      missing as GameplayBootstrapBodyV1,
    )).toThrow(/GameplayBootstrapBodyV1/);

    const canonical = createGameplayBootstrapV1(body);
    const canonicalProjection =
      body.semanticFactProjectorProfileResource.supportedByProjection;
    const {
      minimumContactToAggregateSupportNormalCosine: _removedCanonicalField,
      ...projectionWithoutCanonicalField
    } = canonicalProjection;
    expect(() => createSemanticFactProjectorProfileResourceV1({
      ...semanticFactProjectorProfileBody(),
      supportedByProjection: {
        ...projectionWithoutCanonicalField,
        minimumContactToAggregateSupportNormalDotRatio: 0.95,
      },
    } as unknown as SemanticFactProjectorProfileResourceBodyV1)).toThrow(
      /SemanticFactProjectorProfileResourceBodyV1/,
    );
    expect(() => createSemanticFactProjectorProfileResourceV1({
      ...semanticFactProjectorProfileBody(),
      supportedByProjection: {
        ...projectionWithoutCanonicalField,
        minimumSupportNormalDotRatio: 0.95,
      },
    } as unknown as SemanticFactProjectorProfileResourceBodyV1)).toThrow(
      /SemanticFactProjectorProfileResourceBodyV1/,
    );
    expect(() => parseGameplayBootstrapV1({
      ...canonical,
      semanticFactProjectorProfileResource: {
        resourceRef:
          body.semanticFactProjectorProfileResource.resourceRef,
        contentHash:
          body.semanticFactProjectorProfileResource.contentHash,
      },
    })).toThrow(/GameplayBootstrapV1/);

    const changedResource = createSemanticFactProjectorProfileResourceV1({
      ...semanticFactProjectorProfileBody(),
      supportedByProjection: {
        ...semanticFactProjectorProfileBody().supportedByProjection,
        minimumContactToAggregateSupportNormalCosine: 0.9,
      },
    });
    expect(createGameplayBootstrapV1({
      ...body,
      semanticFactProjectorProfileResource: changedResource,
    }).contentHash).not.toBe(canonical.contentHash);
  });

  it("uses code-unit lexical ordering rather than locale-sensitive ordering", () => {
    const bootstrap = createGameplayBootstrapV1(bootstrapBody({
      availableCapabilityRefs: ["capability:ä", "capability:z"],
    }));
    expect(bootstrap.availableCapabilityRefs).toEqual([
      "capability:z",
      "capability:ä",
    ]);
  });
});
