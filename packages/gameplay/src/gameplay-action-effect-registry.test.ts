import { describe, expect, it, vi } from "vitest";

import {
  createGameplayActionDefinitionV1,
  type ActionActivateGameplayCommandV1,
} from "@whitebox-world/gameplay-contracts";
import { canonicalJsonBytes, sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  createGameplayActionEffectRegistryV1,
  resolveGameplayActionRequestV1,
  type GameplayTrustedActionEffectPlanV1,
} from "./gameplay-action-effect-registry";

const EFFECT_REF =
  "worldkit://gameplay-action-effect/mounted-relationship@1";
const EFFECT_HASH = `sha256:${"a".repeat(64)}` as const;
const SCHEMA_REF = "worldkit://schema/mount-action-request@1";
const SCHEMA_HASH = `sha256:${"b".repeat(64)}` as const;

const definition = createGameplayActionDefinitionV1({
  kind: "semantic-action",
  id: "mount",
  version: 1,
  resourceRef: "worldkit://semantic-action/mount@1",
  executionMode: "exclusive-per-subject",
  completion: { mode: "immediate" },
  effect: {
    mode: "trusted",
    gameplayActionEffectRef: EFFECT_REF,
    gameplayActionEffectHash: EFFECT_HASH,
  },
  isMovementInputBlocked: true,
  allowedActorEntityDefinitionRefs: ["worldkit://entity/human@1"],
  requiredActorCapabilityRefs: [],
  request: {
    mode: "required",
    actionRequestSchemaRef: SCHEMA_REF,
    actionRequestSchemaHash: SCHEMA_HASH,
  },
});

const command: ActionActivateGameplayCommandV1 = {
  schemaVersion: 1,
  id: "mount-command",
  type: "action.activate",
  runtimeSessionId: "runtime-a",
  worldSessionId: "world-a",
  controllerEntityId: "controller-a",
  expectedPossession: { mode: "possessed", controlledEntityId: "rider" },
  actionExecutionId: "mount-execution",
  semanticActionRef: definition.resourceRef,
  actorEntityId: "rider",
  actionRequestRef: "worldkit://action-request/mount-a@1",
  actionRequestHash: `sha256:${"c".repeat(64)}`,
};

const validPlan: GameplayTrustedActionEffectPlanV1 = {
  kind: "mounted-relationship-effect-plan",
  schemaVersion: 1,
  operation: "mount",
  actorEntityId: "rider",
  requiredControlledEntityId: "rider",
  relationshipChanges: [],
  runtimeProjectionWriteSet: {
    spatialEntityIds: ["rider"],
    capabilityStateIds: ["locomotion:rider"],
    semanticFactIds: [],
  },
};

describe("GameplayActionEffectRegistryV1", () => {
  it("resolves one exact Ref/Hash and rejects missing, wrong-hash, and duplicate planners", () => {
    const { registry, registrar } = createGameplayActionEffectRegistryV1();
    const planner = vi.fn(() => validPlan);
    registrar.register({
      gameplayActionEffectRef: EFFECT_REF,
      gameplayActionEffectHash: EFFECT_HASH,
      plan: planner,
    });
    expect(registry.resolve(EFFECT_REF, EFFECT_HASH)).toBeDefined();
    expect(registry.resolve("effect:missing", EFFECT_HASH)).toBeUndefined();
    expect(registry.resolve(EFFECT_REF, SCHEMA_HASH)).toBeUndefined();
    expect(() => registrar.register({
      gameplayActionEffectRef: EFFECT_REF,
      gameplayActionEffectHash: EFFECT_HASH,
      plan: planner,
    })).toThrow(/duplicate/i);
    registrar.seal();
    expect(() => registrar.register({
      gameplayActionEffectRef: "effect:late",
      gameplayActionEffectHash: EFFECT_HASH,
      plan: planner,
    })).toThrow(/sealed/i);
  });

  it("freezes Planner inputs, snapshots a canonical result, and rejects a non-canonical result", () => {
    const { registry, registrar } = createGameplayActionEffectRegistryV1();
    registrar.register({
      gameplayActionEffectRef: EFFECT_REF,
      gameplayActionEffectHash: EFFECT_HASH,
      plan: (input) => {
        expect(Object.isFrozen(input)).toBe(true);
        expect(Object.isFrozen(input.actionRequest.request)).toBe(true);
        expect(Object.isFrozen(input.planningView.relationshipStatesById)).toBe(true);
        expect(() => {
          (input.actionRequest.request as { riderEntityId: string }).riderEntityId =
            "forged";
        }).toThrow();
        return validPlan;
      },
    });
    registrar.seal();
    const resolved = registry.resolve(EFFECT_REF, EFFECT_HASH)!;
    const output = resolved.plan({
      command,
      definition,
      actionRequest: {
        actionRequestRef: command.actionRequestRef!,
        actionRequestHash: command.actionRequestHash!,
        actionRequestSchemaRef: SCHEMA_REF,
        actionRequestSchemaHash: SCHEMA_HASH,
        request: { kind: "mount-action-request", riderEntityId: "rider" },
      },
      planningView: { simulationTick: 4, relationshipStatesById: {} },
    });
    expect(output).toEqual(validPlan);
    expect(output).not.toBe(validPlan);
    expect(Object.isFrozen(output)).toBe(true);

    const invalid = createGameplayActionEffectRegistryV1();
    invalid.registrar.register({
      gameplayActionEffectRef: EFFECT_REF,
      gameplayActionEffectHash: EFFECT_HASH,
      plan: () => ({ ...validPlan, unknown: true } as GameplayTrustedActionEffectPlanV1),
    });
    expect(() => invalid.registry.resolve(EFFECT_REF, EFFECT_HASH)!.plan({
      command,
      definition,
      actionRequest: {
        actionRequestRef: command.actionRequestRef!,
        actionRequestHash: command.actionRequestHash!,
        actionRequestSchemaRef: SCHEMA_REF,
        actionRequestSchemaHash: SCHEMA_HASH,
        request: {},
      },
      planningView: { simulationTick: 4, relationshipStatesById: {} },
    })).toThrow(/EFFECT_PLAN_INVALID/);
  });
});

describe("resolveGameplayActionRequestV1", () => {
  it("accepts exact canonical bytes and rejects forged hash, schema, or non-canonical bytes", () => {
    const request = {
      kind: "mount-action-request",
      schemaVersion: 1,
      id: "mount-a",
      riderEntityId: "rider",
      mountEntityId: "board",
      mountSlotId: "stand",
    };
    const requestHash = sha256CanonicalJson(request) as `sha256:${string}`;
    const resolver = vi.fn(() => ({
      actionRequestSchemaRef: SCHEMA_REF,
      actionRequestSchemaHash: SCHEMA_HASH,
      actionRequestBytes: canonicalJsonBytes(request),
    }));
    expect(resolveGameplayActionRequestV1(
      resolver,
      "request:a",
      requestHash,
      SCHEMA_REF,
      SCHEMA_HASH,
    )?.request).toEqual(request);
    expect(resolveGameplayActionRequestV1(
      resolver,
      "request:a",
      EFFECT_HASH,
      SCHEMA_REF,
      SCHEMA_HASH,
    )).toBeUndefined();
    expect(resolveGameplayActionRequestV1(
      () => ({
        actionRequestSchemaRef: "schema:wrong",
        actionRequestSchemaHash: SCHEMA_HASH,
        actionRequestBytes: canonicalJsonBytes(request),
      }),
      "request:a",
      requestHash,
      SCHEMA_REF,
      SCHEMA_HASH,
    )).toBeUndefined();
    expect(resolveGameplayActionRequestV1(
      () => ({
        actionRequestSchemaRef: SCHEMA_REF,
        actionRequestSchemaHash: SCHEMA_HASH,
        actionRequestBytes: new TextEncoder().encode(JSON.stringify(request, null, 2)),
      }),
      "request:a",
      requestHash,
      SCHEMA_REF,
      SCHEMA_HASH,
    )).toBeUndefined();
  });
});
