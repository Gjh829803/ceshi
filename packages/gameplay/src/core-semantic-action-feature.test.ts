import { describe, expect, it, vi } from "vitest";

import {
  createGameplayActionDefinitionV1,
  type GameplayActionDefinitionV1,
} from "@whitebox-world/gameplay-contracts";

import {
  createGameplayActionCatalogV1,
  createCoreSemanticActionFeatureFactoryV1,
} from "./core-semantic-action-feature";
import { createGameplayActionEffectRegistryV1 } from "./gameplay-action-effect-registry";

const HASH = `sha256:${"a".repeat(64)}` as const;

function body(overrides: Partial<Omit<GameplayActionDefinitionV1, "contentHash">> = {}) {
  return {
    kind: "semantic-action" as const,
    id: "jump",
    version: 1,
    resourceRef: "worldkit://semantic-action/jump@1",
    executionMode: "exclusive-per-subject" as const,
    completion: { mode: "fixed-duration" as const, durationTicks: 12 },
    effect: { mode: "state-only" as const },
    isMovementInputBlocked: false,
    allowedActorEntityDefinitionRefs: ["worldkit://entity/humanoid@1"],
    requiredActorCapabilityRefs: ["worldkit://capability/jump@1"],
    request: { mode: "none" as const },
    ...overrides,
  };
}

function valid(overrides: Partial<Omit<GameplayActionDefinitionV1, "contentHash">> = {}): GameplayActionDefinitionV1 {
  return createGameplayActionDefinitionV1(body(overrides));
}

describe("GameplayActionCatalogV1", () => {
  it("sorts, snapshots, and deeply freezes canonical definitions", () => {
    const second = valid({ id: "z", resourceRef: "worldkit://semantic-action/z@1" });
    const first = valid({ id: "a", resourceRef: "worldkit://semantic-action/a@1" });
    const source = [second, first];
    const catalog = createGameplayActionCatalogV1(source, 2);
    source.reverse();
    expect(catalog.definitions.map((entry) => entry.resourceRef)).toEqual([
      first.resourceRef,
      second.resourceRef,
    ]);
    expect(Object.isFrozen(catalog.definitions)).toBe(true);
    expect(Object.isFrozen(catalog.definitions[0]?.completion)).toBe(true);
  });

  it("rejects hash mismatches, duplicate refs, unknown fields, and count overflow", () => {
    expect(() => createGameplayActionCatalogV1([
      { ...valid(), contentHash: HASH },
    ], 1)).toThrow(/ACTION_CATALOG_INVALID/);
    const duplicate = valid();
    expect(() => createGameplayActionCatalogV1([duplicate, duplicate], 2))
      .toThrow(/ACTION_CATALOG_INVALID/);
    expect(() => createGameplayActionCatalogV1([
      { ...valid(), mystery: true } as GameplayActionDefinitionV1,
    ], 1)).toThrow(/ACTION_CATALOG_INVALID/);
    expect(() => createGameplayActionCatalogV1([valid()], 0))
      .toThrow(/GAMEPLAY_CAPACITY_EXCEEDED/);
  });

  it("rejects negative zero catalog capacity", () => {
    expect(() => createGameplayActionCatalogV1([], -0)).toThrow(
      /ACTION_CATALOG_INVALID/,
    );
  });

  it("rejects non-canonical serialized definitions instead of normalizing them", () => {
    const canonical = valid({
      requiredActorCapabilityRefs: ["capability:a", "capability:z"],
    });
    expect(() => createGameplayActionCatalogV1([{
      ...canonical,
      requiredActorCapabilityRefs: [...canonical.requiredActorCapabilityRefs].reverse(),
    }], 1)).toThrow(/ACTION_CATALOG_INVALID/);
  });

  it("uses code-unit order for the public catalog list", () => {
    const z = valid({ id: "z", resourceRef: "action:z" });
    const umlaut = valid({ id: "umlaut", resourceRef: "action:ä" });
    expect(createGameplayActionCatalogV1([umlaut, z], 2).definitions.map(
      ({ resourceRef }) => resourceRef,
    )).toEqual(["action:z", "action:ä"]);
  });
});

describe("core-semantic-action Feature", () => {
  it("keeps sole action.activate ownership and passes the shared effect registry to GameplayState", () => {
    const effects = createGameplayActionEffectRegistryV1();
    const factory = createCoreSemanticActionFeatureFactoryV1();
    const feature = factory.create({
      worldSessionId: "world-a",
      actionEffectRegistry: effects.registry,
      actionEffectRegistrar: effects.registrar,
    });
    const planAction = vi.fn(() => ({
      status: "rejected" as const,
      diagnostic: { code: "ACTION_REQUEST_INVALID" as const, message: "test" },
    }));
    const handler = feature.commandHandlers.find(({ type }) =>
      type === "action.activate") as Extract<
        (typeof feature.commandHandlers)[number],
        { type: "action.activate" }
      >;
    const command = {
      schemaVersion: 1 as const,
      id: "activate-a",
      type: "action.activate" as const,
      runtimeSessionId: "runtime-a",
      worldSessionId: "world-a",
      controllerEntityId: "controller-a",
      expectedPossession: { mode: "possessed" as const, controlledEntityId: "rider" },
      actionExecutionId: "execution-a",
      semanticActionRef: "action:a",
      actorEntityId: "rider",
    };
    handler.plan({
      command,
      simulationTick: 1,
      state: { planControl: vi.fn(), planAction },
    });
    expect(planAction).toHaveBeenCalledWith(command, 1, effects.registry);
    expect(factory.manifest.commandTypes).toEqual([
      "action.activate",
      "action.cancel",
    ]);
  });
});
