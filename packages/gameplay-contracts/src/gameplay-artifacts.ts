import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import type { GameplayCommandV1, Sha256HashV1 } from "./gameplay-contracts";

export interface GameplayEntityDescriptorV1 {
  readonly id: string;
  readonly entityDefinitionRef: string;
  readonly capabilityRefs: readonly string[];
}

export type GameplayCommandTypeV1 = GameplayCommandV1["type"];

export interface GameplayFeatureResourceBudgetV1 {
  readonly stateSliceCount: 1;
  readonly commandHandlerCount: number;
}

export interface GameplayFeatureManifestBodyV1 {
  readonly kind: "gameplay-feature";
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly dependencyFeatureRefs: readonly string[];
  readonly requiredCapabilityRefs: readonly string[];
  readonly commandTypes: readonly GameplayCommandTypeV1[];
  readonly resourceBudget: GameplayFeatureResourceBudgetV1;
}

export interface GameplayFeatureManifestV1
  extends GameplayFeatureManifestBodyV1 {
  readonly contentHash: Sha256HashV1;
}

export interface GameplayFeatureResourceLockV1 {
  readonly resourceRef: string;
  readonly contentHash: Sha256HashV1;
}

export interface GameplayActionDefinitionV1 {
  readonly kind: "semantic-action";
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly contentHash: Sha256HashV1;
  readonly executionMode: "exclusive-per-subject";
  readonly completion:
    | Readonly<{ mode: "immediate" }>
    | Readonly<{ mode: "explicit-cancel" }>
    | Readonly<{ mode: "fixed-duration"; durationTicks: number }>;
  readonly effect:
    | Readonly<{ mode: "state-only" }>
    | Readonly<{
        mode: "trusted";
        gameplayActionEffectRef: string;
        gameplayActionEffectHash: Sha256HashV1;
      }>;
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

export interface GameplayBootstrapV1 {
  readonly kind: "gameplay-bootstrap";
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly contentHash: Sha256HashV1;
  readonly entityDescriptors: readonly GameplayEntityDescriptorV1[];
  readonly featureResourceLocks: readonly GameplayFeatureResourceLockV1[];
  readonly semanticActionDefinitions: readonly GameplayActionDefinitionV1[];
  readonly availableCapabilityRefs: readonly string[];
}

export type GameplayBootstrapBodyV1 = Omit<GameplayBootstrapV1, "contentHash">;

/**
 * Semantic lock for one canonical Gameplay Bootstrap declaration.
 * `contentHash` is the Bootstrap body hash, not the serialized artifact bytes
 * hash used by WorldPackage file-integrity records.
 */
export interface GameplayBootstrapResourceLockEntryV1 {
  readonly resourceRef: string;
  readonly resourceKind: "gameplay-bootstrap";
  readonly resolvedVersion: string;
  readonly contentHash: Sha256HashV1;
}

type ParseMode = "canonicalize" | "strict";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const GAMEPLAY_COMMAND_TYPES = new Set<GameplayCommandTypeV1>([
  "control.bind",
  "control.release",
  "action.activate",
  "action.cancel",
]);

function invalid(schemaName: string): never {
  throw new RangeError(`Value must match the closed ${schemaName} schema.`);
}

function snapshotDataRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || isNil(value)) return undefined;
  try {
    if (Reflect.getPrototypeOf(value) !== Object.prototype) return undefined;
    const snapshot: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      Object.defineProperty(snapshot, key, {
        configurable: true,
        enumerable: true,
        value: descriptor.value,
        writable: true,
      });
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function snapshotDataArray(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  try {
    if (Reflect.getPrototypeOf(value) !== Array.prototype) return undefined;
    if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) {
      return undefined;
    }
    if (Object.getOwnPropertyNames(value).length !== value.length + 1) {
      return undefined;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      snapshot.push(descriptor.value);
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
    if (isNil(lengthDescriptor) || lengthDescriptor.enumerable !== false) {
      return undefined;
    }
    return snapshot;
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSha256(value: unknown): value is Sha256HashV1 {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0);
}

function isSafePositiveInteger(value: unknown): value is number {
  return isSafeNonNegativeInteger(value) && value > 0;
}

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameOrder(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length && actual.every(
    (value, index) => value === expected[index],
  );
}

function canonicalStringSet(
  input: unknown,
  schemaName: string,
  mode: ParseMode,
): readonly string[] {
  const values = snapshotDataArray(input);
  if (isNil(values)) invalid(schemaName);
  if (!values.every(isNonEmptyString)) invalid(schemaName);
  const typedValues = values as readonly string[];
  if (new Set(typedValues).size !== typedValues.length) invalid(schemaName);
  const canonical = [...typedValues].sort(compareCanonicalStrings);
  if (mode === "strict" && !sameOrder(typedValues, canonical)) invalid(schemaName);
  return Object.freeze(canonical);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || isNil(value) || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!isNil(descriptor) && "value" in descriptor) {
      deepFreeze(descriptor.value);
    }
  }
  return Object.freeze(value);
}

function parseGameplayEntityDescriptor(
  input: unknown,
  mode: ParseMode,
  schemaName: string,
): GameplayEntityDescriptorV1 {
  const record = snapshotDataRecord(input);
  if (isNil(record)) invalid(schemaName);
  if (
    !hasExactKeys(record, ["id", "entityDefinitionRef", "capabilityRefs"]) ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.entityDefinitionRef)
  ) invalid(schemaName);
  return deepFreeze({
    id: record.id,
    entityDefinitionRef: record.entityDefinitionRef,
    capabilityRefs: canonicalStringSet(record.capabilityRefs, schemaName, mode),
  });
}

export function createGameplayEntityDescriptorV1(
  input: GameplayEntityDescriptorV1,
): GameplayEntityDescriptorV1 {
  return parseGameplayEntityDescriptor(
    input,
    "canonicalize",
    "GameplayEntityDescriptorV1",
  );
}

export function parseGameplayEntityDescriptorV1(
  input: unknown,
): GameplayEntityDescriptorV1 {
  return parseGameplayEntityDescriptor(input, "strict", "GameplayEntityDescriptorV1");
}

function parseGameplayFeatureManifestBody(
  input: unknown,
  mode: ParseMode,
): GameplayFeatureManifestBodyV1 {
  const schemaName = "GameplayFeatureManifestBodyV1";
  const record = snapshotDataRecord(input);
  if (isNil(record)) invalid(schemaName);
  if (!hasExactKeys(record, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "dependencyFeatureRefs",
    "requiredCapabilityRefs",
    "commandTypes",
    "resourceBudget",
  ]) ||
    record.kind !== "gameplay-feature" ||
    !isNonEmptyString(record.id) ||
    !isSafePositiveInteger(record.version) ||
    !isNonEmptyString(record.resourceRef)
  ) invalid(schemaName);

  const commandTypes = canonicalStringSet(record.commandTypes, schemaName, mode);
  if (!commandTypes.every((type) =>
    GAMEPLAY_COMMAND_TYPES.has(type as GameplayCommandTypeV1)
  )) invalid(schemaName);
  const resourceBudget = snapshotDataRecord(record.resourceBudget);
  if (isNil(resourceBudget)) invalid(schemaName);
  if (
    !hasExactKeys(resourceBudget, ["stateSliceCount", "commandHandlerCount"]) ||
    resourceBudget.stateSliceCount !== 1 ||
    !isSafeNonNegativeInteger(resourceBudget.commandHandlerCount) ||
    resourceBudget.commandHandlerCount !== commandTypes.length
  ) invalid(schemaName);

  return deepFreeze({
    kind: "gameplay-feature",
    id: record.id,
    version: record.version,
    resourceRef: record.resourceRef,
    dependencyFeatureRefs: canonicalStringSet(
      record.dependencyFeatureRefs,
      schemaName,
      mode,
    ),
    requiredCapabilityRefs: canonicalStringSet(
      record.requiredCapabilityRefs,
      schemaName,
      mode,
    ),
    commandTypes: commandTypes as readonly GameplayCommandTypeV1[],
    resourceBudget: {
      stateSliceCount: 1,
      commandHandlerCount: resourceBudget.commandHandlerCount,
    },
  });
}

export function deriveGameplayFeatureManifestContentHashV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseGameplayFeatureManifestBody(input, "canonicalize"),
  ) as Sha256HashV1;
}

export function createGameplayFeatureManifestV1(
  input: GameplayFeatureManifestBodyV1,
): GameplayFeatureManifestV1 {
  const body = parseGameplayFeatureManifestBody(input, "canonicalize");
  return deepFreeze({
    ...body,
    contentHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}

export function parseGameplayFeatureManifestV1(
  input: unknown,
): GameplayFeatureManifestV1 {
  const schemaName = "GameplayFeatureManifestV1";
  const record = snapshotDataRecord(input);
  if (isNil(record)) invalid(schemaName);
  if (!hasExactKeys(record, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "contentHash",
    "dependencyFeatureRefs",
    "requiredCapabilityRefs",
    "commandTypes",
    "resourceBudget",
  ]) || !isSha256(record.contentHash)) invalid(schemaName);
  const { contentHash, ...bodyInput } = record;
  let body: GameplayFeatureManifestBodyV1;
  try {
    body = parseGameplayFeatureManifestBody(bodyInput, "strict");
  } catch {
    return invalid(schemaName);
  }
  const expectedHash = sha256CanonicalJson(body) as Sha256HashV1;
  if (contentHash !== expectedHash) invalid(schemaName);
  return deepFreeze({ ...body, contentHash: expectedHash });
}

export function canonicalizeGameplayFeatureManifestV1(input: unknown): string {
  return stringifyCanonicalJson(parseGameplayFeatureManifestV1(input));
}

export function gameplayFeatureManifestCanonicalBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseGameplayFeatureManifestV1(input));
}

export function parseGameplayFeatureResourceLockV1(
  input: unknown,
): GameplayFeatureResourceLockV1 {
  const schemaName = "GameplayFeatureResourceLockV1";
  const record = snapshotDataRecord(input);
  if (isNil(record)) invalid(schemaName);
  if (
    !hasExactKeys(record, ["resourceRef", "contentHash"]) ||
    !isNonEmptyString(record.resourceRef) ||
    !isSha256(record.contentHash)
  ) invalid(schemaName);
  return deepFreeze({
    resourceRef: record.resourceRef,
    contentHash: record.contentHash,
  });
}

function parseGameplayActionDefinitionBody(
  input: unknown,
  mode: ParseMode,
): GameplayActionDefinitionBodyV1 {
  const schemaName = "GameplayActionDefinitionBodyV1";
  const record = snapshotDataRecord(input);
  if (isNil(record)) invalid(schemaName);
  if (!hasExactKeys(record, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "executionMode",
    "completion",
    "effect",
    "isMovementInputBlocked",
    "allowedActorEntityDefinitionRefs",
    "requiredActorCapabilityRefs",
    "request",
  ]) ||
    record.kind !== "semantic-action" ||
    !isNonEmptyString(record.id) ||
    !isSafePositiveInteger(record.version) ||
    !isNonEmptyString(record.resourceRef) ||
    record.executionMode !== "exclusive-per-subject" ||
    typeof record.isMovementInputBlocked !== "boolean"
  ) invalid(schemaName);

  const completionRecord = snapshotDataRecord(record.completion);
  if (isNil(completionRecord)) invalid(schemaName);
  let completion: GameplayActionDefinitionV1["completion"];
  if (
    completionRecord.mode === "immediate" &&
    hasExactKeys(completionRecord, ["mode"])
  ) {
    completion = { mode: "immediate" };
  } else if (
    completionRecord.mode === "explicit-cancel" &&
    hasExactKeys(completionRecord, ["mode"])
  ) {
    completion = { mode: "explicit-cancel" };
  } else if (
    completionRecord.mode === "fixed-duration" &&
    hasExactKeys(completionRecord, ["mode", "durationTicks"]) &&
    isSafePositiveInteger(completionRecord.durationTicks)
  ) {
    completion = {
      mode: "fixed-duration",
      durationTicks: completionRecord.durationTicks,
    };
  } else {
    return invalid(schemaName);
  }

  const effectRecord = snapshotDataRecord(record.effect);
  if (isNil(effectRecord)) invalid(schemaName);
  let effect: GameplayActionDefinitionV1["effect"];
  if (
    effectRecord.mode === "state-only" &&
    hasExactKeys(effectRecord, ["mode"])
  ) {
    effect = { mode: "state-only" };
  } else if (
    effectRecord.mode === "trusted" &&
    hasExactKeys(effectRecord, [
      "mode",
      "gameplayActionEffectRef",
      "gameplayActionEffectHash",
    ]) &&
    isNonEmptyString(effectRecord.gameplayActionEffectRef) &&
    isSha256(effectRecord.gameplayActionEffectHash)
  ) {
    effect = {
      mode: "trusted",
      gameplayActionEffectRef: effectRecord.gameplayActionEffectRef,
      gameplayActionEffectHash: effectRecord.gameplayActionEffectHash,
    };
  } else {
    return invalid(schemaName);
  }

  const requestRecord = snapshotDataRecord(record.request);
  if (isNil(requestRecord)) invalid(schemaName);
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
    return invalid(schemaName);
  }

  return deepFreeze({
    kind: "semantic-action",
    id: record.id,
    version: record.version,
    resourceRef: record.resourceRef,
    executionMode: "exclusive-per-subject",
    completion,
    effect,
    isMovementInputBlocked: record.isMovementInputBlocked,
    allowedActorEntityDefinitionRefs: canonicalStringSet(
      record.allowedActorEntityDefinitionRefs,
      schemaName,
      mode,
    ),
    requiredActorCapabilityRefs: canonicalStringSet(
      record.requiredActorCapabilityRefs,
      schemaName,
      mode,
    ),
    request,
  });
}

export function deriveGameplayActionDefinitionContentHashV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseGameplayActionDefinitionBody(input, "canonicalize"),
  ) as Sha256HashV1;
}

export function createGameplayActionDefinitionV1(
  input: GameplayActionDefinitionBodyV1,
): GameplayActionDefinitionV1 {
  const body = parseGameplayActionDefinitionBody(input, "canonicalize");
  return deepFreeze({
    ...body,
    contentHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}

export function parseGameplayActionDefinitionV1(
  input: unknown,
): GameplayActionDefinitionV1 {
  const schemaName = "GameplayActionDefinitionV1";
  const record = snapshotDataRecord(input);
  if (isNil(record)) invalid(schemaName);
  if (!hasExactKeys(record, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "contentHash",
    "executionMode",
    "completion",
    "effect",
    "isMovementInputBlocked",
    "allowedActorEntityDefinitionRefs",
    "requiredActorCapabilityRefs",
    "request",
  ]) || !isSha256(record.contentHash)) invalid(schemaName);
  const { contentHash, ...bodyInput } = record;
  let body: GameplayActionDefinitionBodyV1;
  try {
    body = parseGameplayActionDefinitionBody(bodyInput, "strict");
  } catch {
    return invalid(schemaName);
  }
  const expectedHash = sha256CanonicalJson(body) as Sha256HashV1;
  if (contentHash !== expectedHash) invalid(schemaName);
  return deepFreeze({ ...body, contentHash: expectedHash });
}

export function canonicalizeGameplayActionDefinitionV1(input: unknown): string {
  return stringifyCanonicalJson(parseGameplayActionDefinitionV1(input));
}

export function gameplayActionDefinitionCanonicalBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseGameplayActionDefinitionV1(input));
}

function canonicalObjectCollection<T>(
  input: unknown,
  schemaName: string,
  mode: ParseMode,
  parse: (value: unknown) => T,
  identity: (value: T) => string,
): readonly T[] {
  const source = snapshotDataArray(input);
  if (isNil(source)) invalid(schemaName);
  let parsed: T[];
  try {
    parsed = source.map(parse);
  } catch {
    return invalid(schemaName);
  }
  const identities = parsed.map(identity);
  if (identities.some((value) => value.length === 0)) invalid(schemaName);
  if (new Set(identities).size !== identities.length) invalid(schemaName);
  const canonical = [...parsed].sort((left, right) =>
    compareCanonicalStrings(identity(left), identity(right))
  );
  if (
    mode === "strict" &&
    !sameOrder(identities, canonical.map(identity))
  ) invalid(schemaName);
  return Object.freeze(canonical);
}

function parseGameplayBootstrapBody(
  input: unknown,
  mode: ParseMode,
): GameplayBootstrapBodyV1 {
  const schemaName = "GameplayBootstrapBodyV1";
  const record = snapshotDataRecord(input);
  if (isNil(record)) invalid(schemaName);
  if (!hasExactKeys(record, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "entityDescriptors",
    "featureResourceLocks",
    "semanticActionDefinitions",
    "availableCapabilityRefs",
  ]) ||
    record.kind !== "gameplay-bootstrap" ||
    !isNonEmptyString(record.id) ||
    !isSafePositiveInteger(record.version) ||
    !isNonEmptyString(record.resourceRef)
  ) invalid(schemaName);

  const parseEntity = mode === "strict"
    ? parseGameplayEntityDescriptorV1
    : (value: unknown) => createGameplayEntityDescriptorV1(
        value as GameplayEntityDescriptorV1,
      );

  return deepFreeze({
    kind: "gameplay-bootstrap",
    id: record.id,
    version: record.version,
    resourceRef: record.resourceRef,
    entityDescriptors: canonicalObjectCollection(
      record.entityDescriptors,
      schemaName,
      mode,
      parseEntity,
      (value) => value.id,
    ),
    featureResourceLocks: canonicalObjectCollection(
      record.featureResourceLocks,
      schemaName,
      mode,
      parseGameplayFeatureResourceLockV1,
      (value) => value.resourceRef,
    ),
    semanticActionDefinitions: canonicalObjectCollection(
      record.semanticActionDefinitions,
      schemaName,
      mode,
      parseGameplayActionDefinitionV1,
      (value) => value.resourceRef,
    ),
    availableCapabilityRefs: canonicalStringSet(
      record.availableCapabilityRefs,
      schemaName,
      mode,
    ),
  });
}

export function deriveGameplayBootstrapContentHashV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseGameplayBootstrapBody(input, "canonicalize"),
  ) as Sha256HashV1;
}

export function createGameplayBootstrapV1(
  input: GameplayBootstrapBodyV1,
): GameplayBootstrapV1 {
  const body = parseGameplayBootstrapBody(input, "canonicalize");
  return deepFreeze({
    ...body,
    contentHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}

export function parseGameplayBootstrapV1(input: unknown): GameplayBootstrapV1 {
  const schemaName = "GameplayBootstrapV1";
  const record = snapshotDataRecord(input);
  if (isNil(record)) invalid(schemaName);
  if (!hasExactKeys(record, [
    "kind",
    "id",
    "version",
    "resourceRef",
    "contentHash",
    "entityDescriptors",
    "featureResourceLocks",
    "semanticActionDefinitions",
    "availableCapabilityRefs",
  ]) || !isSha256(record.contentHash)) invalid(schemaName);
  const { contentHash, ...bodyInput } = record;
  let body: GameplayBootstrapBodyV1;
  try {
    body = parseGameplayBootstrapBody(bodyInput, "strict");
  } catch {
    return invalid(schemaName);
  }
  const expectedHash = sha256CanonicalJson(body) as Sha256HashV1;
  if (contentHash !== expectedHash) invalid(schemaName);
  return deepFreeze({ ...body, contentHash: expectedHash });
}

export function createGameplayBootstrapResourceLockEntryV1(
  input: unknown,
): GameplayBootstrapResourceLockEntryV1 {
  const bootstrap = parseGameplayBootstrapV1(input);
  return deepFreeze({
    resourceRef: bootstrap.resourceRef,
    resourceKind: "gameplay-bootstrap",
    resolvedVersion: String(bootstrap.version),
    contentHash: bootstrap.contentHash,
  });
}

export function canonicalizeGameplayBootstrapV1(input: unknown): string {
  return stringifyCanonicalJson(parseGameplayBootstrapV1(input));
}

export function gameplayBootstrapCanonicalBytesV1(input: unknown): Uint8Array {
  return canonicalJsonBytes(parseGameplayBootstrapV1(input));
}
