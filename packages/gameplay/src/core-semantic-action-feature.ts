import type { GameplayActionStateV1, Sha256HashV1 } from "@whitebox-world/gameplay-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type { GameplayCommandHandlerV1 } from "./gameplay-command-dispatcher";
import {
  createGameplayFeatureManifestV1,
  type GameplayFeatureFactoryV1,
} from "./gameplay-feature-manager";
import { CORE_CONTROL_FEATURE_REF } from "./core-control-feature";

export interface GameplayActionDefinitionV1 {
  readonly kind: "semantic-action";
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly contentHash: Sha256HashV1;
  readonly executionMode: "exclusive-per-subject";
  readonly completion:
    | Readonly<{ mode: "explicit-cancel" }>
    | Readonly<{ mode: "fixed-duration"; durationTicks: number }>;
  readonly isMovementInputBlocked: boolean;
  readonly allowedActorEntityDefinitionRefs: readonly string[];
  readonly requiredActorCapabilityRefs: readonly string[];
  readonly request:
    | Readonly<{ mode: "none" }>
    | Readonly<{
        mode: "required";
        actionRequestSchemaRef: string;
        actionRequestSchemaHash: Sha256HashV1;
      }>;
}

export type GameplayActionDefinitionBodyV1 = Omit<
  GameplayActionDefinitionV1,
  "contentHash"
>;

export interface GameplayActionCatalogV1 {
  readonly definitions: readonly GameplayActionDefinitionV1[];
  get(semanticActionRef: string): GameplayActionDefinitionV1 | undefined;
}

export interface GameplayActionRequestResolutionV1 {
  readonly actionRequestSchemaRef: string;
  readonly actionRequestSchemaHash: Sha256HashV1;
}

export type GameplayActionRequestResolverV1 = (
  actionRequestRef: string,
  actionRequestHash: Sha256HashV1,
) => GameplayActionRequestResolutionV1 | undefined;

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

function actionCatalogError(message: string): never {
  throw new Error(`ACTION_CATALOG_INVALID: ${message}`);
}

function snapshotRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string" ||
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return undefined;
  }
}

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const ownKeys = Reflect.ownKeys(record);
  return ownKeys.length === keys.length && ownKeys.every((key) =>
    typeof key === "string" && keys.includes(key)
  );
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
        descriptor === undefined ||
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSha256(value: unknown): value is Sha256HashV1 {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function parseStringSet(input: unknown, field: string): readonly string[] {
  const snapshot = snapshotArray(input);
  if (snapshot === undefined) {
    return actionCatalogError(`${field} must be an Array.`);
  }
  const values = [...snapshot];
  if (!values.every(isNonEmptyString) || new Set(values).size !== values.length) {
    return actionCatalogError(`${field} must contain unique non-empty strings.`);
  }
  return Object.freeze(values.sort((left, right) => left.localeCompare(right)));
}

function deepFreeze<T>(input: T): Readonly<T> {
  if (typeof input !== "object" || input === null || Object.isFrozen(input)) {
    return input;
  }
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value);
    }
  }
  return Object.freeze(input);
}

function parseDefinitionBody(input: unknown): GameplayActionDefinitionBodyV1 {
  const record = snapshotRecord(input) ?? actionCatalogError(
    "definition must be a plain data object.",
  );
  if (!hasExactKeys(record, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "executionMode",
    "completion",
    "isMovementInputBlocked",
    "allowedActorEntityDefinitionRefs",
    "requiredActorCapabilityRefs",
    "request",
  ])) actionCatalogError("definition has unknown or missing fields.");
  if (
    record.kind !== "semantic-action" ||
    !isNonEmptyString(record.id) ||
    !Number.isSafeInteger(record.version) ||
    (record.version as number) <= 0 ||
    !isNonEmptyString(record.resourceRef) ||
    record.executionMode !== "exclusive-per-subject" ||
    typeof record.isMovementInputBlocked !== "boolean"
  ) actionCatalogError("definition identity or execution fields are invalid.");

  const completionRecord = snapshotRecord(record.completion) ?? actionCatalogError(
    "completion must be a plain data object.",
  );
  let completion: GameplayActionDefinitionV1["completion"];
  if (
    completionRecord.mode === "explicit-cancel" &&
    hasExactKeys(completionRecord, ["mode"])
  ) {
    completion = { mode: "explicit-cancel" };
  } else if (
    completionRecord.mode === "fixed-duration" &&
    hasExactKeys(completionRecord, ["mode", "durationTicks"]) &&
    Number.isSafeInteger(completionRecord.durationTicks) &&
    (completionRecord.durationTicks as number) > 0
  ) {
    completion = {
      mode: "fixed-duration",
      durationTicks: completionRecord.durationTicks as number,
    };
  } else {
    actionCatalogError("completion is invalid.");
  }

  const requestRecord = snapshotRecord(record.request) ?? actionCatalogError(
    "request must be a plain data object.",
  );
  let request: GameplayActionDefinitionV1["request"];
  if (requestRecord.mode === "none" && hasExactKeys(requestRecord, ["mode"])) {
    request = { mode: "none" };
  } else if (
    requestRecord.mode === "required" &&
    hasExactKeys(requestRecord, [
      "mode",
      "actionRequestSchemaRef",
      "actionRequestSchemaHash",
    ]) &&
    isNonEmptyString(requestRecord.actionRequestSchemaRef) &&
    isSha256(requestRecord.actionRequestSchemaHash)
  ) {
    request = {
      mode: "required",
      actionRequestSchemaRef: requestRecord.actionRequestSchemaRef,
      actionRequestSchemaHash: requestRecord.actionRequestSchemaHash,
    };
  } else {
    actionCatalogError("request schema lock is invalid.");
  }

  return deepFreeze({
    kind: "semantic-action",
    id: record.id,
    version: record.version as number,
    resourceRef: record.resourceRef,
    executionMode: "exclusive-per-subject",
    completion,
    isMovementInputBlocked: record.isMovementInputBlocked,
    allowedActorEntityDefinitionRefs: parseStringSet(
      record.allowedActorEntityDefinitionRefs,
      "allowedActorEntityDefinitionRefs",
    ),
    requiredActorCapabilityRefs: parseStringSet(
      record.requiredActorCapabilityRefs,
      "requiredActorCapabilityRefs",
    ),
    request,
  });
}

export function deriveGameplayActionDefinitionContentHashV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(parseDefinitionBody(input)) as Sha256HashV1;
}

function parseDefinition(input: unknown): GameplayActionDefinitionV1 {
  const record = snapshotRecord(input) ?? actionCatalogError(
    "definition must be a plain data object.",
  );
  if (!hasExactKeys(record, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "contentHash",
    "executionMode",
    "completion",
    "isMovementInputBlocked",
    "allowedActorEntityDefinitionRefs",
    "requiredActorCapabilityRefs",
    "request",
  ]) || !isSha256(record.contentHash)) {
    actionCatalogError("definition has an invalid closed shape.");
  }
  const { contentHash: _contentHash, ...bodyInput } = record;
  const body = parseDefinitionBody(bodyInput);
  const expected = sha256CanonicalJson(body) as Sha256HashV1;
  if (expected !== record.contentHash) {
    actionCatalogError(`content hash mismatch for '${body.resourceRef}'.`);
  }
  return deepFreeze({ ...body, contentHash: expected });
}

export function createGameplayActionCatalogV1(
  input: readonly unknown[],
  maximumSemanticActionDefinitionCount: number,
): GameplayActionCatalogV1 {
  if (
    !Number.isSafeInteger(maximumSemanticActionDefinitionCount) ||
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
    left.resourceRef.localeCompare(right.resourceRef)
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
  readonly controllerEntityId: string;
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

function actionHandlers(): readonly GameplayCommandHandlerV1[] {
  return [
    {
      type: "action.activate",
      plan: ({ command, state, simulationTick }) =>
        state.planAction(command, simulationTick),
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
    create: () => ({
      resourceRef: CORE_SEMANTIC_ACTION_FEATURE_REF,
      commandHandlers: actionHandlers(),
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
