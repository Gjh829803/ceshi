import type { Sha256HashV1 } from "@whitebox-world/protocol";

import type {
  ActionActivateGameplayCommandV1,
  GameplayActionDefinitionV1,
  GameplayRelationshipStateV1,
} from "@whitebox-world/gameplay-contracts";
import { canonicalJsonBytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import type { GameplayActionRequestResolverV1 } from "./core-semantic-action-feature";

export type GameplayTrustedRelationshipChangeV1 =
  | Readonly<{
      operation: "add";
      before?: never;
      after: GameplayRelationshipStateV1;
    }>
  | Readonly<{
      operation: "remove";
      before: GameplayRelationshipStateV1;
      after?: never;
    }>;

export type GameplayTrustedActionEffectPlanV1 = Readonly<{
  kind: "mounted-relationship-effect-plan";
  schemaVersion: 1;
  operation: "mount" | "dismount";
  actorEntityId: string;
  requiredControlledEntityId: string;
  relationshipChanges: readonly GameplayTrustedRelationshipChangeV1[];
  runtimeProjectionWriteSet: Readonly<{
    spatialEntityIds: readonly string[];
    capabilityStateIds: readonly string[];
    semanticFactIds: readonly string[];
  }>;
}>;

export interface ResolvedGameplayActionRequestV1 {
  readonly actionRequestRef: string;
  readonly actionRequestHash: Sha256HashV1;
  readonly actionRequestSchemaRef: string;
  readonly actionRequestSchemaHash: Sha256HashV1;
  readonly request: unknown;
}

export interface GameplayActionEffectPlanningViewV1 {
  readonly simulationTick: number;
  readonly relationshipStatesById: Readonly<
    Record<string, GameplayRelationshipStateV1>
  >;
}

export interface GameplayActionEffectPlannerInputV1 {
  readonly command: ActionActivateGameplayCommandV1;
  readonly definition: GameplayActionDefinitionV1;
  readonly actionRequest: ResolvedGameplayActionRequestV1;
  readonly planningView: GameplayActionEffectPlanningViewV1;
}

export interface GameplayActionEffectPlannerRegistrationV1 {
  readonly gameplayActionEffectRef: string;
  readonly gameplayActionEffectHash: Sha256HashV1;
  plan(input: GameplayActionEffectPlannerInputV1): unknown;
}

export interface GameplayActionEffectPlannerV1 {
  readonly gameplayActionEffectRef: string;
  readonly gameplayActionEffectHash: Sha256HashV1;
  plan(input: GameplayActionEffectPlannerInputV1): GameplayTrustedActionEffectPlanV1;
}

export interface GameplayActionEffectRegistryV1 {
  resolve(
    gameplayActionEffectRef: string,
    gameplayActionEffectHash: Sha256HashV1,
  ): GameplayActionEffectPlannerV1 | undefined;
}

export interface GameplayActionEffectRegistrarV1 {
  register(registration: GameplayActionEffectPlannerRegistrationV1): void;
  seal(): void;
}

const SHA256 = /^sha256:[a-f0-9]{64}$/;

function invalid(message: string): never {
  throw new Error(`EFFECT_PLAN_INVALID: ${message}`);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function snapshotCanonicalData(input: unknown): unknown {
  if (
    typeof input === "string" ||
    typeof input === "boolean" ||
    input === null
  ) return input;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || Object.is(input, -0)) {
      return invalid("non-finite and negative-zero numbers are forbidden.");
    }
    return input;
  }
  if (Array.isArray(input)) {
    if (
      Reflect.getPrototypeOf(input) !== Array.prototype ||
      Reflect.ownKeys(input).some((key) => typeof key === "symbol") ||
      Object.getOwnPropertyNames(input).length !== input.length + 1
    ) return invalid("Array input is not canonical plain data.");
    return input.map((_, index) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
      if (
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return invalid("Array input contains an accessor or sparse entry.");
      return snapshotCanonicalData(descriptor.value);
    });
  }
  if (typeof input === "object" && !isNil(input)) {
    const prototype = Reflect.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalid("Object input is not canonical plain data.");
    }
    const result: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(input).sort((left, right) =>
      compareCodeUnits(String(left), String(right)))) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return invalid("Object input contains a symbol or accessor.");
      result[key] = snapshotCanonicalData(descriptor.value);
    }
    return result;
  }
  return invalid("unsupported data value.");
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || isNil(value) || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  return Object.freeze(value);
}

function exactRecord(
  input: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalid("expected a plain object.");
  }
  const record = input as Readonly<Record<string, unknown>>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    return invalid("object has an invalid closed shape.");
  }
  return record;
}

function stringValue(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) {
    return invalid("expected a non-empty string.");
  }
  return input;
}

function stringSet(input: unknown): readonly string[] {
  if (!Array.isArray(input)) return invalid("expected a string Array.");
  const values = input.map(stringValue);
  const sorted = [...values].sort(compareCodeUnits);
  if (
    new Set(values).size !== values.length ||
    values.some((value, index) => value !== sorted[index])
  ) return invalid("string set must be unique and canonically ordered.");
  return values;
}

function relationshipState(input: unknown): GameplayRelationshipStateV1 {
  const base = input as Readonly<Record<string, unknown>>;
  if (base?.type === "possessedBy") {
    const row = exactRecord(input, [
      "id", "type", "schemaVersion", "controlledEntityId",
      "controllerEntityId", "establishedSimulationTick",
    ]);
    stringValue(row.id);
    if (row.type !== "possessedBy" || row.schemaVersion !== 1) {
      return invalid("invalid possessedBy discriminator.");
    }
    stringValue(row.controlledEntityId);
    stringValue(row.controllerEntityId);
    if (!Number.isSafeInteger(row.establishedSimulationTick) ||
      (row.establishedSimulationTick as number) < 0) {
      return invalid("invalid Relationship Tick.");
    }
    return row as unknown as GameplayRelationshipStateV1;
  }
  const row = exactRecord(input, [
    "id", "type", "schemaVersion", "riderEntityId", "mountEntityId",
    "mountSlotId", "establishedSimulationTick",
  ]);
  stringValue(row.id);
  if (row.type !== "mountedOn" || row.schemaVersion !== 1) {
    return invalid("invalid mountedOn discriminator.");
  }
  stringValue(row.riderEntityId);
  stringValue(row.mountEntityId);
  stringValue(row.mountSlotId);
  if (!Number.isSafeInteger(row.establishedSimulationTick) ||
    (row.establishedSimulationTick as number) < 0) {
    return invalid("invalid Relationship Tick.");
  }
  return row as unknown as GameplayRelationshipStateV1;
}

function parsePlan(input: unknown): GameplayTrustedActionEffectPlanV1 {
  const snapshot = snapshotCanonicalData(input);
  const row = exactRecord(snapshot, [
    "kind",
    "schemaVersion",
    "operation",
    "actorEntityId",
    "requiredControlledEntityId",
    "relationshipChanges",
    "runtimeProjectionWriteSet",
  ]);
  if (
    row.kind !== "mounted-relationship-effect-plan" ||
    row.schemaVersion !== 1 ||
    (row.operation !== "mount" && row.operation !== "dismount")
  ) return invalid("invalid effect Plan discriminator.");
  stringValue(row.actorEntityId);
  stringValue(row.requiredControlledEntityId);
  if (!Array.isArray(row.relationshipChanges)) {
    return invalid("relationshipChanges must be an Array.");
  }
  row.relationshipChanges.forEach((change) => {
    const source = change as Readonly<Record<string, unknown>>;
    const parsed = source?.operation === "add"
      ? exactRecord(change, ["operation", "after"])
      : exactRecord(change, ["operation", "before"]);
    if (parsed.operation === "add") relationshipState(parsed.after);
    else if (parsed.operation === "remove") relationshipState(parsed.before);
    else invalid("invalid Relationship change operation.");
  });
  const writeSet = exactRecord(row.runtimeProjectionWriteSet, [
    "spatialEntityIds",
    "capabilityStateIds",
    "semanticFactIds",
  ]);
  stringSet(writeSet.spatialEntityIds);
  stringSet(writeSet.capabilityStateIds);
  stringSet(writeSet.semanticFactIds);
  return deepFreeze(snapshot) as GameplayTrustedActionEffectPlanV1;
}

function freezePlannerInput(
  input: GameplayActionEffectPlannerInputV1,
): GameplayActionEffectPlannerInputV1 {
  return deepFreeze(snapshotCanonicalData(input)) as GameplayActionEffectPlannerInputV1;
}

export function createGameplayActionEffectRegistryV1(): Readonly<{
  registry: GameplayActionEffectRegistryV1;
  registrar: GameplayActionEffectRegistrarV1;
}> {
  const plannersByRef = new Map<string, GameplayActionEffectPlannerV1>();
  let isSealed = false;
  const registry: GameplayActionEffectRegistryV1 = Object.freeze({
    resolve: (effectRef: string, effectHash: Sha256HashV1) => {
      const planner = plannersByRef.get(effectRef);
      return planner?.gameplayActionEffectHash === effectHash ? planner : undefined;
    },
  });
  const registrar: GameplayActionEffectRegistrarV1 = Object.freeze({
    register: (registration: GameplayActionEffectPlannerRegistrationV1) => {
      if (isSealed) throw new Error("ACTION_EFFECT_REGISTRY_INVALID: registry is sealed.");
      if (
        typeof registration !== "object" ||
        isNil(registration) ||
        typeof registration.gameplayActionEffectRef !== "string" ||
        registration.gameplayActionEffectRef.length === 0 ||
        !SHA256.test(registration.gameplayActionEffectHash) ||
        typeof registration.plan !== "function"
      ) throw new Error("ACTION_EFFECT_REGISTRY_INVALID: invalid planner registration.");
      if (plannersByRef.has(registration.gameplayActionEffectRef)) {
        throw new Error("ACTION_EFFECT_REGISTRY_INVALID: duplicate planner Ref.");
      }
      const planner: GameplayActionEffectPlannerV1 = Object.freeze({
        gameplayActionEffectRef: registration.gameplayActionEffectRef,
        gameplayActionEffectHash: registration.gameplayActionEffectHash,
        plan: (input: GameplayActionEffectPlannerInputV1) =>
          parsePlan(registration.plan(freezePlannerInput(input))),
      });
      plannersByRef.set(planner.gameplayActionEffectRef, planner);
    },
    seal: () => { isSealed = true; },
  });
  return Object.freeze({ registry, registrar });
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function resolveGameplayActionRequestV1(
  resolver: GameplayActionRequestResolverV1,
  actionRequestRef: string,
  actionRequestHash: Sha256HashV1,
  expectedSchemaRef: string,
  expectedSchemaHash: Sha256HashV1,
): ResolvedGameplayActionRequestV1 | undefined {
  try {
    const resolution = resolver(actionRequestRef, actionRequestHash);
    if (
      typeof resolution !== "object" ||
      isNil(resolution) ||
      resolution.actionRequestSchemaRef !== expectedSchemaRef ||
      resolution.actionRequestSchemaHash !== expectedSchemaHash ||
      !(resolution.actionRequestBytes instanceof Uint8Array) ||
      Reflect.getPrototypeOf(resolution.actionRequestBytes) !== Uint8Array.prototype
    ) return undefined;
    const bytes = new Uint8Array(resolution.actionRequestBytes);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const request = JSON.parse(decoded) as unknown;
    const canonicalBytes = canonicalJsonBytes(request);
    if (
      !equalBytes(bytes, canonicalBytes) ||
      sha256CanonicalJson(request) !== actionRequestHash
    ) return undefined;
    return deepFreeze({
      actionRequestRef,
      actionRequestHash,
      actionRequestSchemaRef: expectedSchemaRef,
      actionRequestSchemaHash: expectedSchemaHash,
      request: snapshotCanonicalData(request),
    });
  } catch {
    return undefined;
  }
}
