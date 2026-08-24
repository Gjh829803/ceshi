import { describe, expect, it, vi } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  createGameplayBootstrapV1 as createGameplayBootstrapV1FromPackage,
} from "@whitebox-world/gameplay-contracts";

import {
  canonicalizeGameplayActionDefinitionV1,
  canonicalizeGameplayBootstrapV1,
  canonicalizeGameplayFeatureManifestV1,
  createGameplayActionDefinitionV1,
  createGameplayBootstrapV1,
  createGameplayEntityDescriptorV1,
  createGameplayFeatureManifestV1,
  deriveGameplayActionDefinitionContentHashV1,
  deriveGameplayBootstrapContentHashV1,
  deriveGameplayFeatureManifestContentHashV1,
  gameplayActionDefinitionCanonicalBytesV1,
  gameplayBootstrapCanonicalBytesV1,
  gameplayFeatureManifestCanonicalBytesV1,
  parseGameplayActionDefinitionV1,
  parseGameplayBootstrapV1,
  parseGameplayEntityDescriptorV1,
  parseGameplayFeatureManifestV1,
  parseGameplayFeatureResourceLockV1,
  type GameplayActionDefinitionBodyV1,
  type GameplayBootstrapBodyV1,
  type GameplayFeatureManifestBodyV1,
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
    isMovementInputBlocked: false,
    allowedActorEntityDefinitionRefs: ["entity:z", "entity:a"],
    requiredActorCapabilityRefs: ["capability:z", "capability:a"],
    request: { mode: "none" },
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
    ...overrides,
  };
}

function accessorArray<T>(value: T, getter: ReturnType<typeof vi.fn>): T[] {
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
});

describe("GameplayBootstrapV1", () => {
  it("is exported from the gameplay-contracts package boundary", () => {
    expect(createGameplayBootstrapV1FromPackage(bootstrapBody()).kind).toBe(
      "gameplay-bootstrap",
    );
  });

  it("canonicalizes all four collections independent of input permutation", () => {
    const body = bootstrapBody();
    const first = createGameplayBootstrapV1(body);
    const second = createGameplayBootstrapV1({
      ...body,
      entityDescriptors: [...body.entityDescriptors].reverse(),
      featureResourceLocks: [...body.featureResourceLocks].reverse(),
      semanticActionDefinitions: [...body.semanticActionDefinitions].reverse(),
      availableCapabilityRefs: [...body.availableCapabilityRefs].reverse(),
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
    expect(first.contentHash).toBe(deriveGameplayBootstrapContentHashV1(body));
    expect(new TextDecoder().decode(gameplayBootstrapCanonicalBytesV1(first)))
      .toBe(canonicalizeGameplayBootstrapV1(first));
    expect(Object.isFrozen(first.semanticActionDefinitions)).toBe(true);
    expect(Object.isFrozen(first.semanticActionDefinitions[0])).toBe(true);
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

    const bootstrap = createGameplayBootstrapV1(body);
    expect(() => parseGameplayBootstrapV1({
      ...bootstrap,
      id: "changed-id",
    })).toThrow(/GameplayBootstrapV1/);
  });

  it("rejects hostile root/nested accessors, prototypes, Symbols, and unknown fields without side effects", () => {
    const body = bootstrapBody();
    const getter = vi.fn(() => body.entityDescriptors[0]);
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
