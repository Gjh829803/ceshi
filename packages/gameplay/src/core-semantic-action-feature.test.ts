import { describe, expect, it, vi } from "vitest";

import {
  createGameplayActionCatalogV1,
  deriveGameplayActionDefinitionContentHashV1,
  type GameplayActionDefinitionV1,
} from "./core-semantic-action-feature";

const HASH = `sha256:${"a".repeat(64)}` as const;

function body(overrides: Partial<Omit<GameplayActionDefinitionV1, "contentHash">> = {}) {
  return {
    kind: "semantic-action" as const,
    id: "jump",
    version: 1,
    resourceRef: "worldkit://semantic-action/jump@1",
    executionMode: "exclusive-per-subject" as const,
    completion: { mode: "fixed-duration" as const, durationTicks: 12 },
    isMovementInputBlocked: false,
    allowedActorEntityDefinitionRefs: ["worldkit://entity/humanoid@1"],
    requiredActorCapabilityRefs: ["worldkit://capability/jump@1"],
    request: { mode: "none" as const },
    ...overrides,
  };
}

function valid(overrides: Partial<Omit<GameplayActionDefinitionV1, "contentHash">> = {}): GameplayActionDefinitionV1 {
  const value = body(overrides);
  return { ...value, contentHash: deriveGameplayActionDefinitionContentHashV1(value) };
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

  it("rejects invalid durations, request schemas, and duplicate availability refs", () => {
    expect(() => deriveGameplayActionDefinitionContentHashV1(body({
      completion: { mode: "fixed-duration", durationTicks: 0 },
    }))).toThrow(/ACTION_CATALOG_INVALID/);
    expect(() => deriveGameplayActionDefinitionContentHashV1(body({
      request: { mode: "required", actionRequestSchemaRef: "schema", actionRequestSchemaHash: "bad" as typeof HASH },
    }))).toThrow(/ACTION_CATALOG_INVALID/);
    expect(() => deriveGameplayActionDefinitionContentHashV1(body({
      requiredActorCapabilityRefs: ["cap-a", "cap-a"],
    }))).toThrow(/ACTION_CATALOG_INVALID/);
  });

  it("rejects accessor-backed arrays without invoking them", () => {
    const capabilityRefs: string[] = [];
    const getter = vi.fn(() => "capability:side-effect");
    Object.defineProperty(capabilityRefs, "0", {
      enumerable: true,
      configurable: true,
      get: getter,
    });
    capabilityRefs.length = 1;
    expect(() => deriveGameplayActionDefinitionContentHashV1(body({
      requiredActorCapabilityRefs: capabilityRefs,
    }))).toThrow(/ACTION_CATALOG_INVALID/);
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects negative zero catalog capacity", () => {
    expect(() => createGameplayActionCatalogV1([], -0)).toThrow(
      /ACTION_CATALOG_INVALID/,
    );
  });
});
