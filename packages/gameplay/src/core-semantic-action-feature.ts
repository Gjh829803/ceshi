import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  createGameplayFeatureManifestV1,
  parseGameplayActionDefinitionV1,
  type GameplayActionDefinitionV1,
  type GameplayActionStateV1,
} from "@whitebox-world/gameplay-contracts";
import { isNil } from "lodash-es";

import type { GameplayCommandHandlerV1 } from "./gameplay-command-dispatcher";
import type {
  GameplayFeatureFactoryContextV1,
  GameplayFeatureFactoryV1,
} from "./gameplay-feature-manager";
import type { GameplayActionEffectRegistryV1 } from "./gameplay-action-effect-registry";
import { CORE_CONTROL_FEATURE_REF } from "./core-control-feature";

export interface GameplayActionCatalogV1 {
  readonly definitions: readonly GameplayActionDefinitionV1[];
  get(semanticActionRef: string): GameplayActionDefinitionV1 | undefined;
}

export interface GameplayActionRequestResolutionV1 {
  readonly actionRequestSchemaRef: string;
  readonly actionRequestSchemaHash: Sha256HashV1;
  readonly actionRequestBytes: Uint8Array;
}

export type GameplayActionRequestResolverV1 = (
  actionRequestRef: string,
  actionRequestHash: Sha256HashV1,
) => GameplayActionRequestResolutionV1 | undefined;

function actionCatalogError(message: string): never {
  throw new Error(`ACTION_CATALOG_INVALID: ${message}`);
}

function snapshotArray(input: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(input)) return undefined;
  try {
    if (Reflect.getPrototypeOf(input) !== Array.prototype) return undefined;
    if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) {
      return undefined;
    }
    const ownNames = Object.getOwnPropertyNames(input);
    if (ownNames.length !== input.length + 1) return undefined;
    const result: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
      if (
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return undefined;
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseDefinition(input: unknown): GameplayActionDefinitionV1 {
  try {
    return parseGameplayActionDefinitionV1(input);
  } catch {
    return actionCatalogError(
      "definition is not canonical or does not match its content hash.",
    );
  }
}

export function createGameplayActionCatalogV1(
  input: readonly unknown[],
  maximumSemanticActionDefinitionCount: number,
): GameplayActionCatalogV1 {
  if (
    !Number.isSafeInteger(maximumSemanticActionDefinitionCount) ||
    Object.is(maximumSemanticActionDefinitionCount, -0) ||
    maximumSemanticActionDefinitionCount < 0
  ) actionCatalogError("definition capacity must be a non-negative safe integer.");
  const definitionsInput = snapshotArray(input) ?? actionCatalogError(
    "Action Definition catalog must be a plain data Array.",
  );
  if (definitionsInput.length > maximumSemanticActionDefinitionCount) {
    throw new Error(
      `GAMEPLAY_CAPACITY_EXCEEDED: ${definitionsInput.length} Action Definitions exceed capacity ${maximumSemanticActionDefinitionCount}.`,
    );
  }
  const definitions = definitionsInput.map(parseDefinition).sort((left, right) =>
    compareCodeUnits(left.resourceRef, right.resourceRef)
  );
  const definitionsByRef = new Map<string, GameplayActionDefinitionV1>();
  for (const definition of definitions) {
    if (definitionsByRef.has(definition.resourceRef)) {
      actionCatalogError(`duplicate semantic Action Ref '${definition.resourceRef}'.`);
    }
    definitionsByRef.set(definition.resourceRef, definition);
  }
  const frozenDefinitions = Object.freeze(definitions);
  return Object.freeze({
    definitions: frozenDefinitions,
    get: (semanticActionRef: string) => definitionsByRef.get(semanticActionRef),
  });
}

export interface InternalGameplayActionExecutionV1 {
  readonly state: GameplayActionStateV1;
  readonly isMovementInputBlocked: boolean;
  readonly scheduledEndSimulationTick?: number;
}

export const CORE_SEMANTIC_ACTION_FEATURE_REF =
  "worldkit://gameplay-feature/core-semantic-action@1" as const;
export const ACTION_PROJECTION_CAPABILITY_REF =
  "worldkit://runtime-capability/semantic-action-projection@1" as const;

const semanticActionManifest = createGameplayFeatureManifestV1({
  kind: "gameplay-feature",
  id: "core-semantic-action",
  version: 1,
  resourceRef: CORE_SEMANTIC_ACTION_FEATURE_REF,
  dependencyFeatureRefs: [CORE_CONTROL_FEATURE_REF],
  requiredCapabilityRefs: [ACTION_PROJECTION_CAPABILITY_REF],
  commandTypes: ["action.activate", "action.cancel"],
  resourceBudget: { stateSliceCount: 1, commandHandlerCount: 2 },
});

function actionHandlers(
  actionEffectRegistry: GameplayActionEffectRegistryV1 | undefined,
): readonly GameplayCommandHandlerV1[] {
  return [
    {
      type: "action.activate",
      plan: ({ command, state, simulationTick }) =>
        state.planAction(command, simulationTick, actionEffectRegistry),
    },
    {
      type: "action.cancel",
      plan: ({ command, state, simulationTick }) =>
        state.planAction(command, simulationTick),
    },
  ];
}

export function createCoreSemanticActionFeatureFactoryV1(): GameplayFeatureFactoryV1 {
  return Object.freeze({
    manifest: semanticActionManifest,
    create: (context: GameplayFeatureFactoryContextV1) => ({
      resourceRef: CORE_SEMANTIC_ACTION_FEATURE_REF,
      commandHandlers: actionHandlers(context.actionEffectRegistry),
      createStateSlice: () => Object.freeze({
        kind: "core-semantic-action-state",
        schemaVersion: 1,
      }),
      prepare: () => undefined,
      activate: () => undefined,
      deactivate: () => undefined,
      dispose: () => undefined,
    }),
  });
}
