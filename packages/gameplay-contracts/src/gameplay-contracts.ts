import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

export type Sha256HashV1 = `sha256:${string}`;

export type ExpectedPossessionV1 =
  | Readonly<{ mode: "unbound" }>
  | Readonly<{ mode: "possessed"; controlledEntityId: string }>;

interface GameplayCommandBaseV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly controllerEntityId: string;
}

export interface ControlBindGameplayCommandV1 extends GameplayCommandBaseV1 {
  readonly type: "control.bind";
  readonly controlledEntityId: string;
  readonly expectedPossession: ExpectedPossessionV1;
}

export interface ControlReleaseGameplayCommandV1 extends GameplayCommandBaseV1 {
  readonly type: "control.release";
  readonly expectedPossession: Extract<ExpectedPossessionV1, { mode: "possessed" }>;
}

interface ActionActivateGameplayCommandBaseV1 extends GameplayCommandBaseV1 {
  readonly type: "action.activate";
  readonly actionExecutionId: string;
  readonly semanticActionRef: string;
  readonly actorEntityId: string;
  readonly expectedPossession: Extract<ExpectedPossessionV1, { mode: "possessed" }>;
}

export type ActionActivateGameplayCommandV1 =
  | (ActionActivateGameplayCommandBaseV1 & Readonly<{
      actionRequestRef?: never;
      actionRequestHash?: never;
    }>)
  | (ActionActivateGameplayCommandBaseV1 & Readonly<{
      actionRequestRef: string;
      actionRequestHash: Sha256HashV1;
    }>);

export interface ActionCancelGameplayCommandV1 extends GameplayCommandBaseV1 {
  readonly type: "action.cancel";
  readonly actionExecutionId: string;
  readonly actorEntityId: string;
  readonly expectedPossession: Extract<ExpectedPossessionV1, { mode: "possessed" }>;
}

export type GameplayCommandV1 =
  | ControlBindGameplayCommandV1
  | ControlReleaseGameplayCommandV1
  | ActionActivateGameplayCommandV1
  | ActionCancelGameplayCommandV1;

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

function invalid(schemaName: string): never {
  throw new RangeError(`Value must match the closed ${schemaName} schema.`);
}

function snapshotDataRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || isNil(value)) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && !isNil(prototype)) return undefined;
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      snapshot[key] = descriptor.value;
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
    const ownNames = Object.getOwnPropertyNames(value);
    if (ownNames.length !== value.length + 1) return undefined;
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
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length &&
    ownKeys.every((key) => typeof key === "string" && keys.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    !Object.is(value, -0);
}

function isSha256(value: unknown): value is Sha256HashV1 {
  return typeof value === "string" && SHA256_PATTERN.test(value);
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

function parseExpectedPossession(
  input: unknown,
  possessedOnly: boolean,
): ExpectedPossessionV1 | undefined {
  const record = snapshotDataRecord(input);
  if (isNil(record)) return undefined;
  if (!possessedOnly && record.mode === "unbound" && hasExactKeys(record, ["mode"])) {
    return { mode: "unbound" };
  }
  if (
    record.mode === "possessed" &&
    hasExactKeys(record, ["mode", "controlledEntityId"]) &&
    isNonEmptyString(record.controlledEntityId)
  ) {
    return {
      mode: "possessed",
      controlledEntityId: record.controlledEntityId,
    };
  }
  return undefined;
}

function parseCommandBase(record: Readonly<Record<string, unknown>>): {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly controllerEntityId: string;
} | undefined {
  if (
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !isNonEmptyString(record.controllerEntityId)
  ) return undefined;
  return {
    schemaVersion: 1,
    id: record.id,
    runtimeSessionId: record.runtimeSessionId,
    worldSessionId: record.worldSessionId,
    controllerEntityId: record.controllerEntityId,
  };
}

export function parseGameplayCommandV1(input: unknown): GameplayCommandV1 {
  const schemaName = "GameplayCommandV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const base = parseCommandBase(record) ?? invalid(schemaName);

  if (record.type === "control.bind") {
    if (!hasExactKeys(record, [
      "schemaVersion",
      "id",
      "type",
      "runtimeSessionId",
      "worldSessionId",
      "controllerEntityId",
      "controlledEntityId",
      "expectedPossession",
    ]) || !isNonEmptyString(record.controlledEntityId)) invalid(schemaName);
    const expectedPossession = parseExpectedPossession(
      record.expectedPossession,
      false,
    ) ?? invalid(schemaName);
    return deepFreeze({
      ...base,
      type: "control.bind",
      controlledEntityId: record.controlledEntityId,
      expectedPossession,
    });
  }

  if (record.type === "control.release") {
    if (!hasExactKeys(record, [
      "schemaVersion",
      "id",
      "type",
      "runtimeSessionId",
      "worldSessionId",
      "controllerEntityId",
      "expectedPossession",
    ])) invalid(schemaName);
    const expectedPossession = parseExpectedPossession(
      record.expectedPossession,
      true,
    );
    if (expectedPossession?.mode !== "possessed") invalid(schemaName);
    return deepFreeze({
      ...base,
      type: "control.release",
      expectedPossession,
    });
  }

  if (record.type === "action.activate") {
    const baseKeys = [
      "schemaVersion",
      "id",
      "type",
      "runtimeSessionId",
      "worldSessionId",
      "controllerEntityId",
      "actionExecutionId",
      "semanticActionRef",
      "actorEntityId",
      "expectedPossession",
    ] as const;
    const hasRequest = hasExactKeys(record, [
      ...baseKeys,
      "actionRequestRef",
      "actionRequestHash",
    ]);
    if (
      (!hasExactKeys(record, baseKeys) && !hasRequest) ||
      !isNonEmptyString(record.actionExecutionId) ||
      !isNonEmptyString(record.semanticActionRef) ||
      !isNonEmptyString(record.actorEntityId) ||
      (hasRequest &&
        (!isNonEmptyString(record.actionRequestRef) ||
          !isSha256(record.actionRequestHash)))
    ) invalid(schemaName);
    const expectedPossession = parseExpectedPossession(
      record.expectedPossession,
      true,
    );
    if (expectedPossession?.mode !== "possessed") invalid(schemaName);
    return deepFreeze({
      ...base,
      type: "action.activate",
      actionExecutionId: record.actionExecutionId,
      semanticActionRef: record.semanticActionRef,
      actorEntityId: record.actorEntityId,
      expectedPossession,
      ...(hasRequest
        ? {
            actionRequestRef: record.actionRequestRef as string,
            actionRequestHash: record.actionRequestHash as Sha256HashV1,
          }
        : {}),
    });
  }

  if (record.type === "action.cancel") {
    if (!hasExactKeys(record, [
      "schemaVersion",
      "id",
      "type",
      "runtimeSessionId",
      "worldSessionId",
      "controllerEntityId",
      "actionExecutionId",
      "actorEntityId",
      "expectedPossession",
    ]) ||
      !isNonEmptyString(record.actionExecutionId) ||
      !isNonEmptyString(record.actorEntityId)
    ) invalid(schemaName);
    const expectedPossession = parseExpectedPossession(
      record.expectedPossession,
      true,
    );
    if (expectedPossession?.mode !== "possessed") invalid(schemaName);
    return deepFreeze({
      ...base,
      type: "action.cancel",
      actionExecutionId: record.actionExecutionId,
      actorEntityId: record.actorEntityId,
      expectedPossession,
    });
  }

  return invalid(schemaName);
}

export function canonicalizeGameplayCommandV1(input: unknown): string {
  return stringifyCanonicalJson(parseGameplayCommandV1(input));
}

export function gameplayCommandCanonicalBytesV1(input: unknown): Uint8Array {
  return canonicalJsonBytes(parseGameplayCommandV1(input));
}

export function deriveGameplayCommandHashV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(parseGameplayCommandV1(input)) as Sha256HashV1;
}

export type GameplayDiagnosticCodeV1 =
  | "INPUT_INVALID"
  | "RUNTIME_SESSION_NOT_FOUND"
  | "WORLD_SESSION_NOT_READY"
  | "WORLD_SESSION_ID_INVALID"
  | "WORLD_SESSION_STALE"
  | "WORLD_SESSION_FAILED"
  | "COMMAND_ID_CONFLICT"
  | "COMMAND_NOT_SUPPORTED"
  | "CONTROLLER_NOT_FOUND"
  | "CONTROLLED_ENTITY_NOT_FOUND"
  | "CONTROLLED_ENTITY_NOT_CONTROLLABLE"
  | "CONTROL_ALREADY_OWNED"
  | "CONTROL_POSSESSION_STALE"
  | "GAMEPLAY_RULE_REJECTED"
  | "GAMEPLAY_CAPACITY_EXCEEDED"
  | "FEATURE_NOT_LOCKED"
  | "ACTION_CATALOG_INVALID"
  | "ACTION_DEFINITION_NOT_FOUND"
  | "ACTION_NOT_AVAILABLE_FOR_ACTOR"
  | "ACTION_ALREADY_ACTIVE"
  | "ACTION_EXECUTION_ID_CONFLICT"
  | "ACTION_EXECUTION_NOT_ACTIVE"
  | "ACTION_EXECUTION_OWNERSHIP_MISMATCH"
  | "ACTION_REQUEST_INVALID"
  | "ADAPTER_FIXED_INPUT_FAILED"
  | "ADAPTER_PREPARE_FAILED"
  | "ADAPTER_ABORT_FAILED"
  | "ADAPTER_COMMIT_CONTRACT_VIOLATED"
  | "WORLD_REPLACEMENT_BLOCKED_BY_ACTIVE_ACTIVITY"
  | "WORLD_REPLACEMENT_CAPACITY_EXCEEDED"
  | "RUNTIME_ACTIVITY_ID_CONFLICT"
  | "RUNTIME_ACTIVITY_NOT_ACTIVE"
  | "RUNTIME_HOST_CAPACITY_EXCEEDED";

export interface GameplayDiagnosticV1 {
  readonly code: GameplayDiagnosticCodeV1;
  readonly message: string;
}

const GAMEPLAY_DIAGNOSTIC_CODES = new Set<GameplayDiagnosticCodeV1>([
  "INPUT_INVALID",
  "RUNTIME_SESSION_NOT_FOUND",
  "WORLD_SESSION_NOT_READY",
  "WORLD_SESSION_ID_INVALID",
  "WORLD_SESSION_STALE",
  "WORLD_SESSION_FAILED",
  "COMMAND_ID_CONFLICT",
  "COMMAND_NOT_SUPPORTED",
  "CONTROLLER_NOT_FOUND",
  "CONTROLLED_ENTITY_NOT_FOUND",
  "CONTROLLED_ENTITY_NOT_CONTROLLABLE",
  "CONTROL_ALREADY_OWNED",
  "CONTROL_POSSESSION_STALE",
  "GAMEPLAY_RULE_REJECTED",
  "GAMEPLAY_CAPACITY_EXCEEDED",
  "FEATURE_NOT_LOCKED",
  "ACTION_CATALOG_INVALID",
  "ACTION_DEFINITION_NOT_FOUND",
  "ACTION_NOT_AVAILABLE_FOR_ACTOR",
  "ACTION_ALREADY_ACTIVE",
  "ACTION_EXECUTION_ID_CONFLICT",
  "ACTION_EXECUTION_NOT_ACTIVE",
  "ACTION_EXECUTION_OWNERSHIP_MISMATCH",
  "ACTION_REQUEST_INVALID",
  "ADAPTER_FIXED_INPUT_FAILED",
  "ADAPTER_PREPARE_FAILED",
  "ADAPTER_ABORT_FAILED",
  "ADAPTER_COMMIT_CONTRACT_VIOLATED",
  "WORLD_REPLACEMENT_BLOCKED_BY_ACTIVE_ACTIVITY",
  "WORLD_REPLACEMENT_CAPACITY_EXCEEDED",
  "RUNTIME_ACTIVITY_ID_CONFLICT",
  "RUNTIME_ACTIVITY_NOT_ACTIVE",
  "RUNTIME_HOST_CAPACITY_EXCEEDED",
]);

export function parseGameplayDiagnosticV1(
  input: unknown,
): GameplayDiagnosticV1 | undefined {
  const record = snapshotDataRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, ["code", "message"]) ||
    typeof record.code !== "string" ||
    !GAMEPLAY_DIAGNOSTIC_CODES.has(record.code as GameplayDiagnosticCodeV1) ||
    !isNonEmptyString(record.message)
  ) return undefined;
  return Object.freeze({
    code: record.code as GameplayDiagnosticCodeV1,
    message: record.message,
  });
}

function parseStringArray(input: unknown): readonly string[] | undefined {
  const values = snapshotDataArray(input);
  if (isNil(values) || !values.every(isNonEmptyString)) return undefined;
  return [...values] as string[];
}

function parseReceiptEventIds(
  input: unknown,
  worldSessionId: string,
): readonly string[] | undefined {
  const eventIds = parseStringArray(input);
  if (isNil(eventIds)) return undefined;
  const eventIdPrefix = `gameplay-event:${worldSessionId}:`;
  let previousSequence = -1;
  for (const eventId of eventIds) {
    if (!eventId.startsWith(eventIdPrefix)) return undefined;
    const sequenceText = eventId.slice(eventIdPrefix.length);
    if (!/^(0|[1-9][0-9]*)$/.test(sequenceText)) return undefined;
    const sequence = Number(sequenceText);
    if (
      !isSafeNonNegativeInteger(sequence) ||
      sequence <= previousSequence ||
      eventId !== deriveGameplayEventIdV1(worldSessionId, sequence)
    ) return undefined;
    previousSequence = sequence;
  }
  return eventIds;
}

interface GameplayCommandReceiptBaseV1 {
  readonly kind: "worldkit-gameplay-command-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly commandId: string;
  readonly commandHash: Sha256HashV1;
  readonly commandType: GameplayCommandV1["type"];
  readonly simulationTick: number;
}

export type GameplayCommandReceiptV1 =
  | (GameplayCommandReceiptBaseV1 & Readonly<{
      status: "committed";
      eventIds: readonly string[];
      worldStateAfterRef: string;
      worldStateAfterHash: Sha256HashV1;
    }>)
  | (GameplayCommandReceiptBaseV1 & Readonly<{
      status: "rejected";
      eventIds: readonly [];
      diagnostic: GameplayDiagnosticV1;
    }>)
  | (GameplayCommandReceiptBaseV1 & Readonly<{
      status: "failed";
      eventIds: readonly string[];
      diagnostic: GameplayDiagnosticV1;
    }>);

const COMMAND_TYPES = new Set<GameplayCommandV1["type"]>([
  "control.bind",
  "control.release",
  "action.activate",
  "action.cancel",
]);

type GameplayCommandReceiptBodyV1 = GameplayCommandReceiptV1 extends infer Receipt
  ? Receipt extends GameplayCommandReceiptV1
    ? Omit<Receipt, "id">
    : never
  : never;

type GameplayCommandReceiptBaseBodyV1 = Omit<
  GameplayCommandReceiptBaseV1,
  "id"
>;

function parseReceiptBaseBody(record: Readonly<Record<string, unknown>>):
  | GameplayCommandReceiptBaseBodyV1
  | undefined {
  if (
    record.kind !== "worldkit-gameplay-command-receipt" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !isNonEmptyString(record.commandId) ||
    !isSha256(record.commandHash) ||
    typeof record.commandType !== "string" ||
    !COMMAND_TYPES.has(record.commandType as GameplayCommandV1["type"]) ||
    !isSafeNonNegativeInteger(record.simulationTick)
  ) return undefined;
  return {
    kind: "worldkit-gameplay-command-receipt",
    schemaVersion: 1,
    runtimeSessionId: record.runtimeSessionId,
    worldSessionId: record.worldSessionId,
    commandId: record.commandId,
    commandHash: record.commandHash,
    commandType: record.commandType as GameplayCommandV1["type"],
    simulationTick: record.simulationTick,
  };
}

function parseGameplayCommandReceiptBodyV1(
  input: unknown,
): GameplayCommandReceiptBodyV1 {
  const schemaName = "GameplayCommandReceiptV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const base = parseReceiptBaseBody(record) ?? invalid(schemaName);
  const commonKeys = [
    "kind",
    "schemaVersion",
    "runtimeSessionId",
    "worldSessionId",
    "commandId",
    "commandHash",
    "commandType",
    "status",
    "simulationTick",
    "eventIds",
  ] as const;
  const eventIds = parseReceiptEventIds(record.eventIds, base.worldSessionId) ??
    invalid(schemaName);

  if (record.status === "committed") {
    if (
      !hasExactKeys(record, [
        ...commonKeys,
        "worldStateAfterRef",
        "worldStateAfterHash",
      ]) ||
      !isNonEmptyString(record.worldStateAfterRef) ||
      !isSha256(record.worldStateAfterHash) ||
      record.worldStateAfterRef !== deriveWorldStateSnapshotRefV1({
        runtimeSessionId: base.runtimeSessionId,
        worldSessionId: base.worldSessionId,
        worldStateHash: record.worldStateAfterHash,
      })
    ) invalid(schemaName);
    return deepFreeze({
      ...base,
      status: "committed",
      eventIds,
      worldStateAfterRef: record.worldStateAfterRef,
      worldStateAfterHash: record.worldStateAfterHash,
    });
  }

  if (record.status === "rejected") {
    if (!hasExactKeys(record, [...commonKeys, "diagnostic"]) || eventIds.length !== 0) {
      invalid(schemaName);
    }
    const diagnostic = parseGameplayDiagnosticV1(record.diagnostic) ?? invalid(schemaName);
    return deepFreeze({
      ...base,
      status: "rejected",
      eventIds: [] as const,
      diagnostic,
    });
  }

  if (record.status === "failed") {
    if (!hasExactKeys(record, [...commonKeys, "diagnostic"])) invalid(schemaName);
    const diagnostic = parseGameplayDiagnosticV1(record.diagnostic) ?? invalid(schemaName);
    return deepFreeze({
      ...base,
      status: "failed",
      eventIds,
      diagnostic,
    });
  }

  return invalid(schemaName);
}

export function deriveGameplayCommandReceiptIdV1(input: unknown): string {
  const body = parseGameplayCommandReceiptBodyV1(input);
  const hash = sha256CanonicalJson(body);
  return `gameplay-receipt:${hash.slice("sha256:".length)}`;
}

export function parseGameplayCommandReceiptV1(
  input: unknown,
): GameplayCommandReceiptV1 {
  const schemaName = "GameplayCommandReceiptV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  if (!isNonEmptyString(record.id)) invalid(schemaName);
  const bodyInput = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== "id"),
  );
  const body = parseGameplayCommandReceiptBodyV1(bodyInput);
  if (record.id !== deriveGameplayCommandReceiptIdV1(body)) invalid(schemaName);
  return deepFreeze({ id: record.id, ...body } as GameplayCommandReceiptV1);
}

export function canonicalizeGameplayCommandReceiptV1(input: unknown): string {
  return stringifyCanonicalJson(parseGameplayCommandReceiptV1(input));
}

interface GameplayEventBaseV1 {
  readonly kind: "worldkit-gameplay-event";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly simulationTick: number;
  readonly sequence: number;
}

interface GameplayRelationshipEventBaseV1 extends GameplayEventBaseV1 {
  readonly commandId: string;
  readonly relationship: GameplayRelationshipStateV1;
}

export interface GameplayRelationshipCommittedEventV1
  extends GameplayRelationshipEventBaseV1 {
  readonly type: "relationship.committed";
}

export interface GameplayRelationshipRemovedEventV1
  extends GameplayRelationshipEventBaseV1 {
  readonly type: "relationship.removed";
}

interface GameplayActionEventBaseV1 extends GameplayEventBaseV1 {
  readonly semanticActionRef: string;
  readonly actionExecutionId: string;
  readonly actorEntityId: string;
}

export interface GameplayActionStartedEventV1 extends GameplayActionEventBaseV1 {
  readonly type: "action.started";
  readonly commandId: string;
}

export interface GameplayActionCompletedEventV1 extends GameplayActionEventBaseV1 {
  readonly type: "action.completed";
}

export interface GameplayActionCancelledEventV1 extends GameplayActionEventBaseV1 {
  readonly type: "action.cancelled";
  readonly commandId: string;
}

export type GameplayActionFailedEventV1 = GameplayActionEventBaseV1 &
  Readonly<{
    type: "action.failed";
    diagnostic: GameplayDiagnosticV1;
    commandId?: string;
  }>;

interface GameplaySemanticFactEventBaseV1 extends GameplayEventBaseV1 {
  readonly semanticFact: GameplaySemanticFactV1;
}

export interface GameplaySemanticFactStartedEventV1
  extends GameplaySemanticFactEventBaseV1 {
  readonly type: "semantic-fact.started";
}

export interface GameplaySemanticFactEndedEventV1
  extends GameplaySemanticFactEventBaseV1 {
  readonly type: "semantic-fact.ended";
}

export interface GameplayWorldFailedEventV1 extends GameplayEventBaseV1 {
  readonly type: "world.failed";
  readonly diagnostic: GameplayDiagnosticV1;
}

export type GameplayEventV1 =
  | GameplayRelationshipCommittedEventV1
  | GameplayRelationshipRemovedEventV1
  | GameplayActionStartedEventV1
  | GameplayActionCompletedEventV1
  | GameplayActionCancelledEventV1
  | GameplayActionFailedEventV1
  | GameplaySemanticFactStartedEventV1
  | GameplaySemanticFactEndedEventV1
  | GameplayWorldFailedEventV1;

export function deriveGameplayEventIdV1(
  worldSessionId: string,
  sequence: number,
): string {
  if (!isNonEmptyString(worldSessionId) || !isSafeNonNegativeInteger(sequence)) {
    return invalid("GameplayEventV1");
  }
  return `gameplay-event:${worldSessionId}:${sequence}`;
}

function parseEventBase(record: Readonly<Record<string, unknown>>):
  | GameplayEventBaseV1
  | undefined {
  if (
    record.kind !== "worldkit-gameplay-event" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !isSafeNonNegativeInteger(record.simulationTick) ||
    !isSafeNonNegativeInteger(record.sequence) ||
    record.id !== deriveGameplayEventIdV1(record.worldSessionId, record.sequence)
  ) return undefined;
  return {
    kind: "worldkit-gameplay-event",
    schemaVersion: 1,
    id: record.id,
    runtimeSessionId: record.runtimeSessionId,
    worldSessionId: record.worldSessionId,
    simulationTick: record.simulationTick,
    sequence: record.sequence,
  };
}

function parseRelationshipEvent(
  record: Readonly<Record<string, unknown>>,
  base: GameplayEventBaseV1,
  type: "relationship.committed" | "relationship.removed",
): GameplayRelationshipCommittedEventV1 | GameplayRelationshipRemovedEventV1 {
  const schemaName = "GameplayEventV1";
  if (!hasExactKeys(record, [
    "kind",
    "schemaVersion",
    "id",
    "type",
    "runtimeSessionId",
    "worldSessionId",
    "simulationTick",
    "sequence",
    "commandId",
    "relationship",
  ]) ||
    !isNonEmptyString(record.commandId)
  ) return invalid(schemaName);
  const relationship = parseGameplayRelationshipStateV1(record.relationship) ??
    invalid(schemaName);
  if (relationship.establishedSimulationTick > base.simulationTick) {
    return invalid(schemaName);
  }
  return {
    ...base,
    type,
    commandId: record.commandId,
    relationship,
  };
}

function parseActionEventFields(record: Readonly<Record<string, unknown>>): {
  readonly semanticActionRef: string;
  readonly actionExecutionId: string;
  readonly actorEntityId: string;
} | undefined {
  if (
    !isNonEmptyString(record.semanticActionRef) ||
    !isNonEmptyString(record.actionExecutionId) ||
    !isNonEmptyString(record.actorEntityId)
  ) return undefined;
  return {
    semanticActionRef: record.semanticActionRef,
    actionExecutionId: record.actionExecutionId,
    actorEntityId: record.actorEntityId,
  };
}

export function parseGameplayEventV1(input: unknown): GameplayEventV1 {
  const schemaName = "GameplayEventV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const base = parseEventBase(record) ?? invalid(schemaName);
  const baseKeys = [
    "kind",
    "schemaVersion",
    "id",
    "type",
    "runtimeSessionId",
    "worldSessionId",
    "simulationTick",
    "sequence",
  ] as const;
  const actionKeys = [
    ...baseKeys,
    "semanticActionRef",
    "actionExecutionId",
    "actorEntityId",
  ] as const;

  if (
    record.type === "relationship.committed" ||
    record.type === "relationship.removed"
  ) {
    return deepFreeze(parseRelationshipEvent(record, base, record.type));
  }

  if (record.type === "action.started") {
    if (!hasExactKeys(record, [...actionKeys, "commandId"]) ||
      !isNonEmptyString(record.commandId)) invalid(schemaName);
    const action = parseActionEventFields(record) ?? invalid(schemaName);
    return deepFreeze({ ...base, type: "action.started", ...action, commandId: record.commandId });
  }

  if (record.type === "action.completed") {
    if (!hasExactKeys(record, actionKeys)) invalid(schemaName);
    const action = parseActionEventFields(record) ?? invalid(schemaName);
    return deepFreeze({ ...base, type: "action.completed", ...action });
  }

  if (record.type === "action.cancelled") {
    if (!hasExactKeys(record, [...actionKeys, "commandId"]) ||
      !isNonEmptyString(record.commandId)) invalid(schemaName);
    const action = parseActionEventFields(record) ?? invalid(schemaName);
    return deepFreeze({ ...base, type: "action.cancelled", ...action, commandId: record.commandId });
  }

  if (record.type === "action.failed") {
    const hasCommand = hasExactKeys(record, [...actionKeys, "diagnostic", "commandId"]);
    if (!hasExactKeys(record, [...actionKeys, "diagnostic"]) && !hasCommand) {
      invalid(schemaName);
    }
    if (hasCommand && !isNonEmptyString(record.commandId)) invalid(schemaName);
    const action = parseActionEventFields(record) ?? invalid(schemaName);
    const diagnostic = parseGameplayDiagnosticV1(record.diagnostic) ?? invalid(schemaName);
    return deepFreeze({
      ...base,
      type: "action.failed",
      ...action,
      diagnostic,
      ...(hasCommand ? { commandId: record.commandId as string } : {}),
    });
  }

  if (
    record.type === "semantic-fact.started" ||
    record.type === "semantic-fact.ended"
  ) {
    if (!hasExactKeys(record, [...baseKeys, "semanticFact"])) invalid(schemaName);
    const semanticFact = tryParseGameplaySemanticFactV1(record.semanticFact) ??
      invalid(schemaName);
    if (
      (record.type === "semantic-fact.started" &&
        semanticFact.startedSimulationTick !== base.simulationTick) ||
      (record.type === "semantic-fact.ended" &&
        semanticFact.startedSimulationTick > base.simulationTick)
    ) invalid(schemaName);
    return deepFreeze({
      ...base,
      type: record.type,
      semanticFact,
    });
  }

  if (record.type === "world.failed") {
    if (!hasExactKeys(record, [...baseKeys, "diagnostic"])) invalid(schemaName);
    const diagnostic = parseGameplayDiagnosticV1(record.diagnostic) ?? invalid(schemaName);
    return deepFreeze({ ...base, type: "world.failed", diagnostic });
  }

  return invalid(schemaName);
}

export function canonicalizeGameplayEventV1(input: unknown): string {
  return stringifyCanonicalJson(parseGameplayEventV1(input));
}

export function gameplayEventCanonicalBytesV1(input: unknown): Uint8Array {
  return canonicalJsonBytes(parseGameplayEventV1(input));
}

export interface SpatialEntityStateV1 {
  readonly id: string;
  readonly kind: "spatial-entity-state";
  readonly entityDefinitionRef: string;
  readonly entityDefinitionHash: Sha256HashV1;
  readonly semanticClassId: string;
  readonly lifecycleMode: "active" | "disabled";
  readonly positionMetersXYZ: readonly [number, number, number];
  readonly rotationQuaternionXYZW: readonly [number, number, number, number];
  readonly scaleRatioXYZ: readonly [number, number, number];
  readonly linearVelocityMetersPerSecondXYZ?: readonly [number, number, number];
  readonly angularVelocityRadiansPerSecondXYZ?: readonly [number, number, number];
}

export interface ControllerEntityStateV1 {
  readonly id: string;
  readonly kind: "controller-entity-state";
  readonly controllerDefinitionRef: string;
  readonly controllerDefinitionHash: Sha256HashV1;
  readonly participantId: string;
  readonly lifecycleMode: "active" | "suspended" | "disabled";
  readonly inputMode: "human" | "agent" | "replay";
}

export type GameplayEntityStateV1 =
  | SpatialEntityStateV1
  | ControllerEntityStateV1;

interface LocomotionCapabilityStateBaseV1 {
  readonly id: string;
  readonly kind: "locomotion-capability-state";
  readonly ownerEntityId: string;
  readonly locomotionCapabilityRef: string;
  readonly locomotionCapabilityHash: Sha256HashV1;
}

export type LocomotionCapabilityStateV1 = LocomotionCapabilityStateBaseV1 &
  (
    | Readonly<{
        mode: "idle" | "walk" | "run" | "airborne";
        movementMedium: "ground" | "air";
        facingYawRadians: number;
        speedMetersPerSecond: number;
        suspendedByRelationshipId?: never;
      }>
    | Readonly<{
        mode: "suspended";
        suspendedByRelationshipId: string;
        movementMedium?: never;
        facingYawRadians?: never;
        speedMetersPerSecond?: never;
      }>
  );

export type GameplayCapabilityStateV1 = LocomotionCapabilityStateV1;

export interface PossessedByRelationshipStateV1 {
  readonly id: string;
  readonly type: "possessedBy";
  readonly schemaVersion: 1;
  readonly controlledEntityId: string;
  readonly controllerEntityId: string;
  readonly establishedSimulationTick: number;
}

export interface MountedOnRelationshipStateV1 {
  readonly id: string;
  readonly type: "mountedOn";
  readonly schemaVersion: 1;
  readonly riderEntityId: string;
  readonly mountEntityId: string;
  readonly mountSlotId: string;
  readonly establishedSimulationTick: number;
}

export type GameplayRelationshipStateV1 =
  | PossessedByRelationshipStateV1
  | MountedOnRelationshipStateV1;

export type GameplaySemanticFactIdV1 = `semantic-fact:${string}`;

export interface SupportedByFactV1 {
  readonly id: GameplaySemanticFactIdV1;
  readonly type: "supportedBy";
  readonly schemaVersion: 1;
  readonly supportedEntityId: string;
  readonly supportSurfaceEntityId: string;
  readonly supportColliderSubshapeId: string;
  readonly supportTraversalSurfaceId?: string;
  readonly supportPointMetersXYZ: readonly [number, number, number];
  readonly supportNormalXYZ: readonly [number, number, number];
  readonly startedSimulationTick: number;
  readonly semanticFactProjectorProfileRef: string;
  readonly semanticFactProjectorProfileHash: Sha256HashV1;
}

export interface TouchingFactV1 {
  readonly id: GameplaySemanticFactIdV1;
  readonly type: "touching";
  readonly schemaVersion: 1;
  readonly entityIds: readonly [string, string];
  readonly startedSimulationTick: number;
  readonly semanticFactProjectorProfileRef: string;
  readonly semanticFactProjectorProfileHash: Sha256HashV1;
}

export interface InsideVolumeFactV1 {
  readonly id: GameplaySemanticFactIdV1;
  readonly type: "insideVolume";
  readonly schemaVersion: 1;
  readonly containedEntityId: string;
  readonly volumeEntityId: string;
  readonly startedSimulationTick: number;
  readonly semanticFactProjectorProfileRef: string;
  readonly semanticFactProjectorProfileHash: Sha256HashV1;
}

export type GameplaySemanticFactV1 =
  | SupportedByFactV1
  | TouchingFactV1
  | InsideVolumeFactV1;

interface GameplayActionStateBaseV1 {
  readonly id: string;
  readonly kind: "action-state";
  readonly semanticActionRef: string;
  readonly semanticActionHash: Sha256HashV1;
  readonly actorEntityId: string;
  readonly mode: "starting" | "active" | "completing";
  readonly startedSimulationTick: number;
  readonly lastTransitionSimulationTick: number;
}

export type GameplayActionStateV1 =
  | (GameplayActionStateBaseV1 & Readonly<{
      actionRequestRef?: never;
      actionRequestHash?: never;
    }>)
  | (GameplayActionStateBaseV1 & Readonly<{
      actionRequestRef: string;
      actionRequestHash: Sha256HashV1;
    }>);

export interface WorldStateSnapshotV1 {
  readonly kind: "worldkit-world-state-snapshot";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly simulationTick: number;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly executionPlanHash: Sha256HashV1;
  readonly entityStatesById: Readonly<Record<string, GameplayEntityStateV1>>;
  readonly capabilityStatesById: Readonly<Record<string, GameplayCapabilityStateV1>>;
  readonly relationshipStatesById: Readonly<Record<string, GameplayRelationshipStateV1>>;
  readonly semanticFactsById: Readonly<Record<string, GameplaySemanticFactV1>>;
  readonly activeActionStatesById: Readonly<Record<string, GameplayActionStateV1>>;
  readonly lastEventSequence: number;
  readonly worldStateHash: Sha256HashV1;
}

function hasOnlyKnownKeys(
  value: Readonly<Record<string, unknown>>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
): boolean {
  const ownKeys = Reflect.ownKeys(value);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  return requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    ownKeys.every((key) => typeof key === "string" && allowed.has(key));
}

function parseFiniteTuple<const Length extends number>(
  input: unknown,
  length: Length,
): readonly number[] | undefined {
  const values = snapshotDataArray(input);
  if (
    isNil(values) ||
    values.length !== length ||
    !values.every(isFiniteNumber)
  ) return undefined;
  return [...values] as number[];
}

function parseSpatialEntityStateV1(
  record: Readonly<Record<string, unknown>>,
): SpatialEntityStateV1 | undefined {
  const requiredKeys = [
    "id",
    "kind",
    "entityDefinitionRef",
    "entityDefinitionHash",
    "semanticClassId",
    "lifecycleMode",
    "positionMetersXYZ",
    "rotationQuaternionXYZW",
    "scaleRatioXYZ",
  ] as const;
  if (!hasOnlyKnownKeys(record, requiredKeys, [
    "linearVelocityMetersPerSecondXYZ",
    "angularVelocityRadiansPerSecondXYZ",
  ]) ||
    record.kind !== "spatial-entity-state" ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.entityDefinitionRef) ||
    !isSha256(record.entityDefinitionHash) ||
    !isNonEmptyString(record.semanticClassId) ||
    (record.lifecycleMode !== "active" && record.lifecycleMode !== "disabled")
  ) return undefined;
  const positionMetersXYZ = parseFiniteTuple(record.positionMetersXYZ, 3);
  const rotationQuaternionXYZW = parseFiniteTuple(record.rotationQuaternionXYZW, 4);
  const scaleRatioXYZ = parseFiniteTuple(record.scaleRatioXYZ, 3);
  const linearVelocityMetersPerSecondXYZ =
    isNil(record.linearVelocityMetersPerSecondXYZ)
      ? undefined
      : parseFiniteTuple(record.linearVelocityMetersPerSecondXYZ, 3);
  const angularVelocityRadiansPerSecondXYZ =
    isNil(record.angularVelocityRadiansPerSecondXYZ)
      ? undefined
      : parseFiniteTuple(record.angularVelocityRadiansPerSecondXYZ, 3);
  if (
    isNil(positionMetersXYZ) ||
    isNil(rotationQuaternionXYZW) ||
    isNil(scaleRatioXYZ) ||
    (Object.hasOwn(record, "linearVelocityMetersPerSecondXYZ") &&
      isNil(linearVelocityMetersPerSecondXYZ)) ||
    (Object.hasOwn(record, "angularVelocityRadiansPerSecondXYZ") &&
      isNil(angularVelocityRadiansPerSecondXYZ))
  ) return undefined;
  return {
    id: record.id,
    kind: "spatial-entity-state",
    entityDefinitionRef: record.entityDefinitionRef,
    entityDefinitionHash: record.entityDefinitionHash,
    semanticClassId: record.semanticClassId,
    lifecycleMode: record.lifecycleMode,
    positionMetersXYZ: positionMetersXYZ as readonly [number, number, number],
    rotationQuaternionXYZW: rotationQuaternionXYZW as readonly [number, number, number, number],
    scaleRatioXYZ: scaleRatioXYZ as readonly [number, number, number],
    ...(isNil(linearVelocityMetersPerSecondXYZ)
      ? {}
      : {
          linearVelocityMetersPerSecondXYZ:
            linearVelocityMetersPerSecondXYZ as readonly [number, number, number],
        }),
    ...(isNil(angularVelocityRadiansPerSecondXYZ)
      ? {}
      : {
          angularVelocityRadiansPerSecondXYZ:
            angularVelocityRadiansPerSecondXYZ as readonly [number, number, number],
        }),
  };
}

function parseControllerEntityStateV1(
  record: Readonly<Record<string, unknown>>,
): ControllerEntityStateV1 | undefined {
  if (!hasExactKeys(record, [
    "id",
    "kind",
    "controllerDefinitionRef",
    "controllerDefinitionHash",
    "participantId",
    "lifecycleMode",
    "inputMode",
  ]) ||
    record.kind !== "controller-entity-state" ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.controllerDefinitionRef) ||
    !isSha256(record.controllerDefinitionHash) ||
    !isNonEmptyString(record.participantId) ||
    !["active", "suspended", "disabled"].includes(record.lifecycleMode as string) ||
    !["human", "agent", "replay"].includes(record.inputMode as string)
  ) return undefined;
  return {
    id: record.id,
    kind: "controller-entity-state",
    controllerDefinitionRef: record.controllerDefinitionRef,
    controllerDefinitionHash: record.controllerDefinitionHash,
    participantId: record.participantId,
    lifecycleMode: record.lifecycleMode as ControllerEntityStateV1["lifecycleMode"],
    inputMode: record.inputMode as ControllerEntityStateV1["inputMode"],
  };
}

function parseGameplayEntityStateV1(input: unknown): GameplayEntityStateV1 | undefined {
  const record = snapshotDataRecord(input);
  if (record?.kind === "spatial-entity-state") {
    return parseSpatialEntityStateV1(record);
  }
  if (record?.kind === "controller-entity-state") {
    return parseControllerEntityStateV1(record);
  }
  return undefined;
}

function parseLocomotionCapabilityStateV1(
  input: unknown,
): LocomotionCapabilityStateV1 | undefined {
  const record = snapshotDataRecord(input);
  const baseKeys = [
    "id",
    "kind",
    "ownerEntityId",
    "locomotionCapabilityRef",
    "locomotionCapabilityHash",
    "mode",
  ] as const;
  if (isNil(record) ||
    record.kind !== "locomotion-capability-state" ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.ownerEntityId) ||
    !isNonEmptyString(record.locomotionCapabilityRef) ||
    !isSha256(record.locomotionCapabilityHash)
  ) return undefined;
  const base = {
    id: record.id,
    kind: "locomotion-capability-state" as const,
    ownerEntityId: record.ownerEntityId,
    locomotionCapabilityRef: record.locomotionCapabilityRef,
    locomotionCapabilityHash: record.locomotionCapabilityHash,
  };
  if (record.mode === "suspended") {
    if (
      !hasExactKeys(record, [...baseKeys, "suspendedByRelationshipId"]) ||
      !isNonEmptyString(record.suspendedByRelationshipId)
    ) return undefined;
    return {
      ...base,
      mode: "suspended",
      suspendedByRelationshipId: record.suspendedByRelationshipId,
    };
  }
  if (!hasExactKeys(record, [
    ...baseKeys,
    "movementMedium",
    "facingYawRadians",
    "speedMetersPerSecond",
  ]) ||
    !["idle", "walk", "run", "airborne"].includes(record.mode as string) ||
    !["ground", "air"].includes(record.movementMedium as string) ||
    !isFiniteNumber(record.facingYawRadians) ||
    !isFiniteNumber(record.speedMetersPerSecond) ||
    record.speedMetersPerSecond < 0 ||
    ((record.mode === "airborne") !== (record.movementMedium === "air"))
  ) return undefined;
  return {
    ...base,
    mode: record.mode as "idle" | "walk" | "run" | "airborne",
    movementMedium: record.movementMedium as "ground" | "air",
    facingYawRadians: record.facingYawRadians,
    speedMetersPerSecond: record.speedMetersPerSecond,
  };
}

function parsePossessedByRelationshipStateV1(
  input: unknown,
): PossessedByRelationshipStateV1 | undefined {
  const record = snapshotDataRecord(input);
  if (isNil(record) || !hasExactKeys(record, [
    "id",
    "type",
    "schemaVersion",
    "controlledEntityId",
    "controllerEntityId",
    "establishedSimulationTick",
  ]) ||
    !isNonEmptyString(record.id) ||
    record.type !== "possessedBy" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.controlledEntityId) ||
    !isNonEmptyString(record.controllerEntityId) ||
    !isSafeNonNegativeInteger(record.establishedSimulationTick)
  ) return undefined;
  return {
    id: record.id,
    type: "possessedBy",
    schemaVersion: 1,
    controlledEntityId: record.controlledEntityId,
    controllerEntityId: record.controllerEntityId,
    establishedSimulationTick: record.establishedSimulationTick,
  };
}

function parseMountedOnRelationshipStateV1(
  input: unknown,
): MountedOnRelationshipStateV1 | undefined {
  const record = snapshotDataRecord(input);
  if (isNil(record) || !hasExactKeys(record, [
    "id",
    "type",
    "schemaVersion",
    "riderEntityId",
    "mountEntityId",
    "mountSlotId",
    "establishedSimulationTick",
  ]) ||
    !isNonEmptyString(record.id) ||
    record.type !== "mountedOn" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.riderEntityId) ||
    !isNonEmptyString(record.mountEntityId) ||
    record.riderEntityId === record.mountEntityId ||
    !isNonEmptyString(record.mountSlotId) ||
    !isSafeNonNegativeInteger(record.establishedSimulationTick)
  ) return undefined;
  return {
    id: record.id,
    type: "mountedOn",
    schemaVersion: 1,
    riderEntityId: record.riderEntityId,
    mountEntityId: record.mountEntityId,
    mountSlotId: record.mountSlotId,
    establishedSimulationTick: record.establishedSimulationTick,
  };
}

function parseGameplayRelationshipStateV1(
  input: unknown,
): GameplayRelationshipStateV1 | undefined {
  const record = snapshotDataRecord(input);
  if (record?.type === "possessedBy") {
    return parsePossessedByRelationshipStateV1(record);
  }
  if (record?.type === "mountedOn") {
    return parseMountedOnRelationshipStateV1(record);
  }
  return undefined;
}

function semanticFactIdentityDomainV1(input: unknown): unknown {
  const schemaName = "GameplaySemanticFactV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const commonKeys = [
    "type",
    "schemaVersion",
    "startedSimulationTick",
    "semanticFactProjectorProfileRef",
    "semanticFactProjectorProfileHash",
  ] as const;
  if (
    record.schemaVersion !== 1 ||
    !isSafeNonNegativeInteger(record.startedSimulationTick) ||
    !isNonEmptyString(record.semanticFactProjectorProfileRef) ||
    !isSha256(record.semanticFactProjectorProfileHash) ||
    (Object.hasOwn(record, "id") && !isNonEmptyString(record.id))
  ) return invalid(schemaName);

  if (record.type === "supportedBy") {
    const requiredKeys = [
      ...commonKeys,
      "supportedEntityId",
      "supportSurfaceEntityId",
      "supportColliderSubshapeId",
      "supportPointMetersXYZ",
      "supportNormalXYZ",
    ] as const;
    if (!hasOnlyKnownKeys(record, requiredKeys, [
      "id",
      "supportTraversalSurfaceId",
    ]) ||
      !isNonEmptyString(record.supportedEntityId) ||
      !isNonEmptyString(record.supportSurfaceEntityId) ||
      !isNonEmptyString(record.supportColliderSubshapeId) ||
      (Object.hasOwn(record, "supportTraversalSurfaceId") &&
        !isNonEmptyString(record.supportTraversalSurfaceId)) ||
      isNil(parseFiniteTuple(record.supportPointMetersXYZ, 3)) ||
      isNil(parseFiniteTuple(record.supportNormalXYZ, 3))
    ) return invalid(schemaName);
    return {
      type: "supportedBy",
      supportedEntityId: record.supportedEntityId,
      supportSurfaceEntityId: record.supportSurfaceEntityId,
      supportColliderSubshapeId: record.supportColliderSubshapeId,
      ...(Object.hasOwn(record, "supportTraversalSurfaceId")
        ? { supportTraversalSurfaceId: record.supportTraversalSurfaceId }
        : {}),
      startedSimulationTick: record.startedSimulationTick,
      semanticFactProjectorProfileRef: record.semanticFactProjectorProfileRef,
      semanticFactProjectorProfileHash: record.semanticFactProjectorProfileHash,
    };
  }

  if (record.type === "touching") {
    if (!hasOnlyKnownKeys(record, [...commonKeys, "entityIds"], ["id"])) {
      return invalid(schemaName);
    }
    const entityIds = snapshotDataArray(record.entityIds);
    if (
      isNil(entityIds) ||
      entityIds.length !== 2 ||
      !isNonEmptyString(entityIds[0]) ||
      !isNonEmptyString(entityIds[1]) ||
      entityIds[0] >= entityIds[1]
    ) return invalid(schemaName);
    return {
      type: "touching",
      entityIds: [entityIds[0], entityIds[1]],
      startedSimulationTick: record.startedSimulationTick,
      semanticFactProjectorProfileRef: record.semanticFactProjectorProfileRef,
      semanticFactProjectorProfileHash: record.semanticFactProjectorProfileHash,
    };
  }

  if (record.type === "insideVolume") {
    if (!hasOnlyKnownKeys(record, [
      ...commonKeys,
      "containedEntityId",
      "volumeEntityId",
    ], ["id"]) ||
      !isNonEmptyString(record.containedEntityId) ||
      !isNonEmptyString(record.volumeEntityId)
    ) return invalid(schemaName);
    return {
      type: "insideVolume",
      containedEntityId: record.containedEntityId,
      volumeEntityId: record.volumeEntityId,
      startedSimulationTick: record.startedSimulationTick,
      semanticFactProjectorProfileRef: record.semanticFactProjectorProfileRef,
      semanticFactProjectorProfileHash: record.semanticFactProjectorProfileHash,
    };
  }

  return invalid(schemaName);
}

export function deriveGameplaySemanticFactIdV1(
  input: unknown,
): GameplaySemanticFactIdV1 {
  const hash = sha256CanonicalJson(semanticFactIdentityDomainV1(input));
  return `semantic-fact:${hash.slice("sha256:".length)}`;
}

function parseSupportedByFactV1(
  record: Readonly<Record<string, unknown>>,
): SupportedByFactV1 | undefined {
  const baseKeys = [
    "id",
    "type",
    "schemaVersion",
    "supportedEntityId",
    "supportSurfaceEntityId",
    "supportColliderSubshapeId",
    "supportPointMetersXYZ",
    "supportNormalXYZ",
    "startedSimulationTick",
    "semanticFactProjectorProfileRef",
    "semanticFactProjectorProfileHash",
  ] as const;
  const hasTraversalSurface = hasExactKeys(record, [
    ...baseKeys,
    "supportTraversalSurfaceId",
  ]);
  if ((!hasExactKeys(record, baseKeys) && !hasTraversalSurface) ||
    record.type !== "supportedBy" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.supportedEntityId) ||
    !isNonEmptyString(record.supportSurfaceEntityId) ||
    !isNonEmptyString(record.supportColliderSubshapeId) ||
    (hasTraversalSurface && !isNonEmptyString(record.supportTraversalSurfaceId)) ||
    !isSafeNonNegativeInteger(record.startedSimulationTick) ||
    !isNonEmptyString(record.semanticFactProjectorProfileRef) ||
    !isSha256(record.semanticFactProjectorProfileHash)
  ) return undefined;
  const supportPointMetersXYZ = parseFiniteTuple(record.supportPointMetersXYZ, 3);
  const supportNormalXYZ = parseFiniteTuple(record.supportNormalXYZ, 3);
  if (isNil(supportPointMetersXYZ) || isNil(supportNormalXYZ)) {
    return undefined;
  }
  return {
    id: record.id as GameplaySemanticFactIdV1,
    type: "supportedBy",
    schemaVersion: 1,
    supportedEntityId: record.supportedEntityId,
    supportSurfaceEntityId: record.supportSurfaceEntityId,
    supportColliderSubshapeId: record.supportColliderSubshapeId,
    ...(hasTraversalSurface
      ? { supportTraversalSurfaceId: record.supportTraversalSurfaceId as string }
      : {}),
    supportPointMetersXYZ: supportPointMetersXYZ as readonly [number, number, number],
    supportNormalXYZ: supportNormalXYZ as readonly [number, number, number],
    startedSimulationTick: record.startedSimulationTick,
    semanticFactProjectorProfileRef: record.semanticFactProjectorProfileRef,
    semanticFactProjectorProfileHash: record.semanticFactProjectorProfileHash,
  };
}

function parseTouchingFactV1(
  record: Readonly<Record<string, unknown>>,
): TouchingFactV1 | undefined {
  if (!hasExactKeys(record, [
    "id",
    "type",
    "schemaVersion",
    "entityIds",
    "startedSimulationTick",
    "semanticFactProjectorProfileRef",
    "semanticFactProjectorProfileHash",
  ]) ||
    record.type !== "touching" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    !isSafeNonNegativeInteger(record.startedSimulationTick) ||
    !isNonEmptyString(record.semanticFactProjectorProfileRef) ||
    !isSha256(record.semanticFactProjectorProfileHash)
  ) return undefined;
  const entityIds = snapshotDataArray(record.entityIds);
  if (
    isNil(entityIds) ||
    entityIds.length !== 2 ||
    !isNonEmptyString(entityIds[0]) ||
    !isNonEmptyString(entityIds[1]) ||
    entityIds[0] >= entityIds[1]
  ) return undefined;
  return {
    id: record.id as GameplaySemanticFactIdV1,
    type: "touching",
    schemaVersion: 1,
    entityIds: [entityIds[0], entityIds[1]],
    startedSimulationTick: record.startedSimulationTick,
    semanticFactProjectorProfileRef: record.semanticFactProjectorProfileRef,
    semanticFactProjectorProfileHash: record.semanticFactProjectorProfileHash,
  };
}

function parseInsideVolumeFactV1(
  record: Readonly<Record<string, unknown>>,
): InsideVolumeFactV1 | undefined {
  if (!hasExactKeys(record, [
    "id",
    "type",
    "schemaVersion",
    "containedEntityId",
    "volumeEntityId",
    "startedSimulationTick",
    "semanticFactProjectorProfileRef",
    "semanticFactProjectorProfileHash",
  ]) ||
    record.type !== "insideVolume" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.containedEntityId) ||
    !isNonEmptyString(record.volumeEntityId) ||
    !isSafeNonNegativeInteger(record.startedSimulationTick) ||
    !isNonEmptyString(record.semanticFactProjectorProfileRef) ||
    !isSha256(record.semanticFactProjectorProfileHash)
  ) return undefined;
  return {
    id: record.id as GameplaySemanticFactIdV1,
    type: "insideVolume",
    schemaVersion: 1,
    containedEntityId: record.containedEntityId,
    volumeEntityId: record.volumeEntityId,
    startedSimulationTick: record.startedSimulationTick,
    semanticFactProjectorProfileRef: record.semanticFactProjectorProfileRef,
    semanticFactProjectorProfileHash: record.semanticFactProjectorProfileHash,
  };
}

function tryParseGameplaySemanticFactV1(
  input: unknown,
): GameplaySemanticFactV1 | undefined {
  const record = snapshotDataRecord(input);
  let parsed: GameplaySemanticFactV1 | undefined;
  if (record?.type === "supportedBy") parsed = parseSupportedByFactV1(record);
  if (record?.type === "touching") parsed = parseTouchingFactV1(record);
  if (record?.type === "insideVolume") parsed = parseInsideVolumeFactV1(record);
  if (isNil(parsed) || parsed.id !== deriveGameplaySemanticFactIdV1(parsed)) {
    return undefined;
  }
  return parsed;
}

export function parseGameplaySemanticFactV1(
  input: unknown,
): GameplaySemanticFactV1 {
  return deepFreeze(
    tryParseGameplaySemanticFactV1(input) ?? invalid("GameplaySemanticFactV1"),
  );
}

function parseGameplayActionStateV1(input: unknown): GameplayActionStateV1 | undefined {
  const record = snapshotDataRecord(input);
  if (isNil(record)) return undefined;
  const baseKeys = [
    "id",
    "kind",
    "semanticActionRef",
    "semanticActionHash",
    "actorEntityId",
    "mode",
    "startedSimulationTick",
    "lastTransitionSimulationTick",
  ] as const;
  const hasRequest = hasExactKeys(record, [
    ...baseKeys,
    "actionRequestRef",
    "actionRequestHash",
  ]);
  if ((!hasExactKeys(record, baseKeys) && !hasRequest) ||
    record.kind !== "action-state" ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.semanticActionRef) ||
    !isSha256(record.semanticActionHash) ||
    !isNonEmptyString(record.actorEntityId) ||
    !["starting", "active", "completing"].includes(record.mode as string) ||
    !isSafeNonNegativeInteger(record.startedSimulationTick) ||
    !isSafeNonNegativeInteger(record.lastTransitionSimulationTick) ||
    (hasRequest &&
      (!isNonEmptyString(record.actionRequestRef) || !isSha256(record.actionRequestHash)))
  ) return undefined;
  return {
    id: record.id,
    kind: "action-state",
    semanticActionRef: record.semanticActionRef,
    semanticActionHash: record.semanticActionHash,
    actorEntityId: record.actorEntityId,
    mode: record.mode as GameplayActionStateV1["mode"],
    startedSimulationTick: record.startedSimulationTick,
    lastTransitionSimulationTick: record.lastTransitionSimulationTick,
    ...(hasRequest
      ? {
          actionRequestRef: record.actionRequestRef as string,
          actionRequestHash: record.actionRequestHash as Sha256HashV1,
        }
      : {}),
  };
}

function parseIdMap<T extends Readonly<{ id: string }>>(
  input: unknown,
  parseValue: (value: unknown) => T | undefined,
): Readonly<Record<string, T>> | undefined {
  const record = snapshotDataRecord(input);
  if (isNil(record)) return undefined;
  const entries: [string, T][] = [];
  for (const key of Object.keys(record).sort()) {
    if (!isNonEmptyString(key)) return undefined;
    const parsed = parseValue(record[key]);
    if (isNil(parsed) || parsed.id !== key) return undefined;
    entries.push([key, parsed]);
  }
  return Object.fromEntries(entries);
}

export type WorldStateSnapshotBuildInputV1 = Omit<
  WorldStateSnapshotV1,
  "id" | "worldStateHash"
>;

function getOwnMapValue<T>(
  map: Readonly<Record<string, T>>,
  id: string,
): T | undefined {
  const descriptor = Reflect.getOwnPropertyDescriptor(map, id);
  return !isNil(descriptor) && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function parseWorldStateSnapshotBuildInputV1(
  input: unknown,
): WorldStateSnapshotBuildInputV1 {
  const schemaName = "WorldStateSnapshotV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const bodyKeys = [
    "kind",
    "schemaVersion",
    "runtimeSessionId",
    "worldSessionId",
    "simulationTick",
    "worldPackageRef",
    "worldPackageRootHash",
    "executionPlanHash",
    "entityStatesById",
    "capabilityStatesById",
    "relationshipStatesById",
    "semanticFactsById",
    "activeActionStatesById",
    "lastEventSequence",
  ] as const;
  if (!hasExactKeys(record, bodyKeys) ||
    record.kind !== "worldkit-world-state-snapshot" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !isSafeNonNegativeInteger(record.simulationTick) ||
    !isNonEmptyString(record.worldPackageRef) ||
    !isSha256(record.worldPackageRootHash) ||
    !isSha256(record.executionPlanHash) ||
    !isSafeNonNegativeInteger(record.lastEventSequence)
  ) invalid(schemaName);
  const simulationTick = record.simulationTick as number;

  const entityStatesById = parseIdMap(
    record.entityStatesById,
    parseGameplayEntityStateV1,
  ) ?? invalid(schemaName);
  const capabilityStatesById = parseIdMap(
    record.capabilityStatesById,
    parseLocomotionCapabilityStateV1,
  ) ?? invalid(schemaName);
  const relationshipStatesById = parseIdMap(
    record.relationshipStatesById,
    parseGameplayRelationshipStateV1,
  ) ?? invalid(schemaName);
  const semanticFactsById = parseIdMap(
    record.semanticFactsById,
    tryParseGameplaySemanticFactV1,
  ) ?? invalid(schemaName);
  const activeActionStatesById = parseIdMap(
    record.activeActionStatesById,
    parseGameplayActionStateV1,
  ) ?? invalid(schemaName);

  const controlledEntityIds = new Set<string>();
  const controllerEntityIds = new Set<string>();
  const mountedRiderEntityIds = new Set<string>();
  const occupiedMountSlotIds = new Set<string>();
  for (const relationship of Object.values(relationshipStatesById)) {
    if (relationship.establishedSimulationTick > simulationTick) {
      invalid(schemaName);
    }
    if (relationship.type === "mountedOn") {
      const slotIdentity = `${relationship.mountEntityId}\u0000${relationship.mountSlotId}`;
      if (
        mountedRiderEntityIds.has(relationship.riderEntityId) ||
        occupiedMountSlotIds.has(slotIdentity) ||
        getOwnMapValue(entityStatesById, relationship.riderEntityId)?.kind !==
          "spatial-entity-state" ||
        getOwnMapValue(entityStatesById, relationship.mountEntityId)?.kind !==
          "spatial-entity-state"
      ) invalid(schemaName);
      mountedRiderEntityIds.add(relationship.riderEntityId);
      occupiedMountSlotIds.add(slotIdentity);
      continue;
    }
    if (
      controlledEntityIds.has(relationship.controlledEntityId) ||
      controllerEntityIds.has(relationship.controllerEntityId) ||
      relationship.establishedSimulationTick > simulationTick
    ) invalid(schemaName);
    const controlledEntity = getOwnMapValue(
      entityStatesById,
      relationship.controlledEntityId,
    );
    const controllerEntity = getOwnMapValue(
      entityStatesById,
      relationship.controllerEntityId,
    );
    if (
      controlledEntity?.kind !== "spatial-entity-state" ||
      controllerEntity?.kind !== "controller-entity-state"
    ) invalid(schemaName);
    controlledEntityIds.add(relationship.controlledEntityId);
    controllerEntityIds.add(relationship.controllerEntityId);
  }

  for (const capability of Object.values(capabilityStatesById)) {
    if (
      getOwnMapValue(entityStatesById, capability.ownerEntityId)?.kind !==
        "spatial-entity-state"
    ) invalid(schemaName);
    if (capability.mode === "suspended") {
      const relationship = getOwnMapValue(
        relationshipStatesById,
        capability.suspendedByRelationshipId,
      );
      if (
        relationship?.type !== "mountedOn" ||
        relationship.riderEntityId !== capability.ownerEntityId
      ) invalid(schemaName);
    }
  }

  const isSpatialEntityEndpoint = (entityId: string): boolean => {
    const endpoint = getOwnMapValue(entityStatesById, entityId);
    return !isNil(endpoint) && endpoint.kind === "spatial-entity-state";
  };
  const isKnownNonSpatialEntityEndpoint = (entityId: string): boolean => {
    const endpoint = getOwnMapValue(entityStatesById, entityId);
    return !isNil(endpoint) && endpoint.kind !== "spatial-entity-state";
  };
  for (const semanticFact of Object.values(semanticFactsById)) {
    if (semanticFact.startedSimulationTick > simulationTick) invalid(schemaName);
    if (semanticFact.type === "supportedBy") {
      if (
        !isSpatialEntityEndpoint(semanticFact.supportedEntityId) ||
        isKnownNonSpatialEntityEndpoint(semanticFact.supportSurfaceEntityId)
      ) invalid(schemaName);
    } else if (semanticFact.type === "touching") {
      if (
        semanticFact.entityIds.some(isKnownNonSpatialEntityEndpoint) ||
        !semanticFact.entityIds.some(isSpatialEntityEndpoint)
      ) {
        invalid(schemaName);
      }
    } else if (
      !isSpatialEntityEndpoint(semanticFact.containedEntityId) ||
      isKnownNonSpatialEntityEndpoint(semanticFact.volumeEntityId)
    ) {
      invalid(schemaName);
    }
  }

  for (const action of Object.values(activeActionStatesById)) {
    if (
      getOwnMapValue(entityStatesById, action.actorEntityId)?.kind !==
        "spatial-entity-state" ||
      action.startedSimulationTick > action.lastTransitionSimulationTick ||
      action.lastTransitionSimulationTick > simulationTick
    ) invalid(schemaName);
  }

  return {
    kind: "worldkit-world-state-snapshot",
    schemaVersion: 1,
    runtimeSessionId: record.runtimeSessionId as string,
    worldSessionId: record.worldSessionId as string,
    simulationTick,
    worldPackageRef: record.worldPackageRef as string,
    worldPackageRootHash: record.worldPackageRootHash as Sha256HashV1,
    executionPlanHash: record.executionPlanHash as Sha256HashV1,
    entityStatesById,
    capabilityStatesById,
    relationshipStatesById,
    semanticFactsById,
    activeActionStatesById,
    lastEventSequence: record.lastEventSequence as number,
  };
}

function worldStateHashDomainV1(body: WorldStateSnapshotBuildInputV1): unknown {
  return {
    simulationTick: body.simulationTick,
    worldPackageRootHash: body.worldPackageRootHash,
    executionPlanHash: body.executionPlanHash,
    entityStatesById: body.entityStatesById,
    capabilityStatesById: body.capabilityStatesById,
    relationshipStatesById: body.relationshipStatesById,
    semanticFactsById: body.semanticFactsById,
    activeActionStatesById: body.activeActionStatesById,
    lastEventSequence: body.lastEventSequence,
  };
}

export function deriveWorldStateHashV1(input: unknown): Sha256HashV1 {
  const body = parseWorldStateSnapshotBuildInputV1(input);
  return sha256CanonicalJson(worldStateHashDomainV1(body)) as Sha256HashV1;
}

function parseWorldStateSnapshotIdentityDomainV1(input: unknown): Readonly<{
  runtimeSessionId: string;
  worldSessionId: string;
  worldStateHash: Sha256HashV1;
}> {
  const schemaName = "WorldStateSnapshotIdentityV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  if (
    !hasExactKeys(record, [
      "runtimeSessionId",
      "worldSessionId",
      "worldStateHash",
    ]) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !isSha256(record.worldStateHash)
  ) invalid(schemaName);
  return {
    runtimeSessionId: record.runtimeSessionId,
    worldSessionId: record.worldSessionId,
    worldStateHash: record.worldStateHash,
  };
}

export function deriveWorldStateSnapshotIdV1(input: unknown): string {
  const hash = sha256CanonicalJson(
    parseWorldStateSnapshotIdentityDomainV1(input),
  );
  return `world-state:${hash.slice("sha256:".length)}`;
}

export function deriveWorldStateSnapshotRefV1(input: unknown): string {
  return `worldkit://world-state/${deriveWorldStateSnapshotIdV1(input)}`;
}

export function buildWorldStateSnapshotV1(input: unknown): WorldStateSnapshotV1 {
  const body = parseWorldStateSnapshotBuildInputV1(input);
  const worldStateHash = sha256CanonicalJson(
    worldStateHashDomainV1(body),
  ) as Sha256HashV1;
  return deepFreeze({
    ...body,
    id: deriveWorldStateSnapshotIdV1({
      runtimeSessionId: body.runtimeSessionId,
      worldSessionId: body.worldSessionId,
      worldStateHash,
    }),
    worldStateHash,
  });
}

export function parseWorldStateSnapshotV1(input: unknown): WorldStateSnapshotV1 {
  const schemaName = "WorldStateSnapshotV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  if (
    !hasExactKeys(record, [
      "kind",
      "schemaVersion",
      "id",
      "runtimeSessionId",
      "worldSessionId",
      "simulationTick",
      "worldPackageRef",
      "worldPackageRootHash",
      "executionPlanHash",
      "entityStatesById",
      "capabilityStatesById",
      "relationshipStatesById",
      "semanticFactsById",
      "activeActionStatesById",
      "lastEventSequence",
      "worldStateHash",
    ]) ||
    !isNonEmptyString(record.id) ||
    !isSha256(record.worldStateHash)
  ) {
    return invalid(schemaName);
  }
  const bodyInput = Object.fromEntries(
    Object.entries(record).filter((entry) =>
      entry[0] !== "id" && entry[0] !== "worldStateHash"
    ),
  );
  const snapshot = buildWorldStateSnapshotV1(bodyInput);
  if (
    snapshot.id !== record.id ||
    snapshot.worldStateHash !== record.worldStateHash
  ) return invalid(schemaName);
  return snapshot;
}

export function canonicalizeWorldStateSnapshotV1(input: unknown): string {
  return stringifyCanonicalJson(parseWorldStateSnapshotV1(input));
}

export function worldStateSnapshotCanonicalBytesV1(input: unknown): Uint8Array {
  return canonicalJsonBytes(parseWorldStateSnapshotV1(input));
}

export function hashWorldStateSnapshotV1(input: unknown): Sha256HashV1 {
  return parseWorldStateSnapshotV1(input).worldStateHash;
}

export interface GameplayParticipantStateV1 {
  readonly id: string;
  readonly mode: "active";
}

export interface GameplayControllerStateV1 {
  readonly id: string;
  readonly participantId: string;
}

interface GameplayInspectionSnapshotBaseV1 {
  readonly kind: "worldkit-gameplay-inspection-snapshot";
  readonly schemaVersion: 1;
  readonly projection: "inspection";
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly gameplayModeRef: string;
  readonly simulationTick: number;
  readonly participantStatesById: Readonly<Record<string, GameplayParticipantStateV1>>;
  readonly controllerStatesById: Readonly<Record<string, GameplayControllerStateV1>>;
  readonly relationshipStatesById: Readonly<
    Record<string, GameplayRelationshipStateV1>
  >;
  readonly activeActionStatesById: Readonly<Record<string, GameplayActionStateV1>>;
  readonly activatedGameplayFeatureRefs: readonly string[];
  readonly lastEventSequence: number;
}

export type GameplayInspectionSnapshotV1 =
  | (GameplayInspectionSnapshotBaseV1 & Readonly<{
      phase: "constructing" | "ready" | "replacing" | "disposed";
    }>)
  | (GameplayInspectionSnapshotBaseV1 & Readonly<{
      phase: "failed";
      diagnostic: GameplayDiagnosticV1;
    }>);

function parseGameplayParticipantStateV1(
  input: unknown,
): GameplayParticipantStateV1 | undefined {
  const record = snapshotDataRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, ["id", "mode"]) ||
    !isNonEmptyString(record.id) ||
    record.mode !== "active"
  ) return undefined;
  return { id: record.id, mode: "active" };
}

function parseGameplayControllerStateV1(
  input: unknown,
): GameplayControllerStateV1 | undefined {
  const record = snapshotDataRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, ["id", "participantId"]) ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.participantId)
  ) return undefined;
  return { id: record.id, participantId: record.participantId };
}

export function parseGameplayInspectionSnapshotV1(
  input: unknown,
): GameplayInspectionSnapshotV1 {
  const schemaName = "GameplayInspectionSnapshotV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const commonKeys = [
    "kind",
    "schemaVersion",
    "projection",
    "id",
    "runtimeSessionId",
    "worldSessionId",
    "gameplayModeRef",
    "phase",
    "simulationTick",
    "participantStatesById",
    "controllerStatesById",
    "relationshipStatesById",
    "activeActionStatesById",
    "activatedGameplayFeatureRefs",
    "lastEventSequence",
  ] as const;
  const isFailed = record.phase === "failed";
  if ((!hasExactKeys(record, commonKeys) &&
      !(isFailed && hasExactKeys(record, [...commonKeys, "diagnostic"]))) ||
    record.kind !== "worldkit-gameplay-inspection-snapshot" ||
    record.schemaVersion !== 1 ||
    record.projection !== "inspection" ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !isNonEmptyString(record.gameplayModeRef) ||
    !["constructing", "ready", "replacing", "failed", "disposed"].includes(
      record.phase as string,
    ) ||
    !isSafeNonNegativeInteger(record.simulationTick) ||
    !isSafeNonNegativeInteger(record.lastEventSequence)
  ) invalid(schemaName);
  const participantStatesById = parseIdMap(
    record.participantStatesById,
    parseGameplayParticipantStateV1,
  ) ?? invalid(schemaName);
  const controllerStatesById = parseIdMap(
    record.controllerStatesById,
    parseGameplayControllerStateV1,
  ) ?? invalid(schemaName);
  const relationshipStatesById = parseIdMap(
    record.relationshipStatesById,
    parseGameplayRelationshipStateV1,
  ) ?? invalid(schemaName);
  const activeActionStatesById = parseIdMap(
    record.activeActionStatesById,
    parseGameplayActionStateV1,
  ) ?? invalid(schemaName);
  const activatedGameplayFeatureRefs = parseStringArray(
    record.activatedGameplayFeatureRefs,
  ) ?? invalid(schemaName);

  for (const controller of Object.values(controllerStatesById)) {
    if (isNil(getOwnMapValue(participantStatesById, controller.participantId))) {
      invalid(schemaName);
    }
  }

  const controlledEntityIds = new Set<string>();
  const controllerEntityIds = new Set<string>();
  const mountedRiderEntityIds = new Set<string>();
  const occupiedMountSlotIds = new Set<string>();
  for (const relationship of Object.values(relationshipStatesById)) {
    if (relationship.type === "mountedOn") {
      const slotIdentity = `${relationship.mountEntityId}\u0000${relationship.mountSlotId}`;
      if (
        mountedRiderEntityIds.has(relationship.riderEntityId) ||
        occupiedMountSlotIds.has(slotIdentity)
      ) invalid(schemaName);
      mountedRiderEntityIds.add(relationship.riderEntityId);
      occupiedMountSlotIds.add(slotIdentity);
      continue;
    }
    if (
      controlledEntityIds.has(relationship.controlledEntityId) ||
      controllerEntityIds.has(relationship.controllerEntityId) ||
      isNil(getOwnMapValue(
        controllerStatesById,
        relationship.controllerEntityId,
      ))
    ) invalid(schemaName);
    controlledEntityIds.add(relationship.controlledEntityId);
    controllerEntityIds.add(relationship.controllerEntityId);
  }

  const base = {
    kind: "worldkit-gameplay-inspection-snapshot" as const,
    schemaVersion: 1 as const,
    projection: "inspection" as const,
    id: record.id as string,
    runtimeSessionId: record.runtimeSessionId as string,
    worldSessionId: record.worldSessionId as string,
    gameplayModeRef: record.gameplayModeRef as string,
    simulationTick: record.simulationTick as number,
    participantStatesById,
    controllerStatesById,
    relationshipStatesById,
    activeActionStatesById,
    activatedGameplayFeatureRefs,
    lastEventSequence: record.lastEventSequence as number,
  };
  if (isFailed) {
    const diagnostic = parseGameplayDiagnosticV1(record.diagnostic) ?? invalid(schemaName);
    return deepFreeze({ ...base, phase: "failed", diagnostic });
  }
  return deepFreeze({
    ...base,
    phase: record.phase as "constructing" | "ready" | "replacing" | "disposed",
  });
}

export function canonicalizeGameplayInspectionSnapshotV1(input: unknown): string {
  return stringifyCanonicalJson(parseGameplayInspectionSnapshotV1(input));
}

export interface GameplayCapacityBudgetV1 {
  readonly maximumParticipantCount: number;
  readonly maximumControllerEntityCount: number;
  readonly maximumRelationshipStateCount: number;
  readonly maximumActiveActionStateCount: number;
  readonly maximumGameplayFeatureCount: number;
  readonly maximumSemanticActionDefinitionCount: number;
  readonly maximumSemanticFactCount: number;
  readonly maximumSemanticFactTransitionCountPerTick: number;
  readonly maximumIdempotencyRecordCount: number;
  readonly maximumUsedActionExecutionIdCount: number;
  readonly maximumRetainedReceiptCount: number;
  readonly maximumRetainedEventCount: number;
  readonly maximumRetainedWorldStateSnapshotCount: number;
}

const GAMEPLAY_CAPACITY_BUDGET_KEYS = [
  "maximumParticipantCount",
  "maximumControllerEntityCount",
  "maximumRelationshipStateCount",
  "maximumActiveActionStateCount",
  "maximumGameplayFeatureCount",
  "maximumSemanticActionDefinitionCount",
  "maximumSemanticFactCount",
  "maximumSemanticFactTransitionCountPerTick",
  "maximumIdempotencyRecordCount",
  "maximumUsedActionExecutionIdCount",
  "maximumRetainedReceiptCount",
  "maximumRetainedEventCount",
  "maximumRetainedWorldStateSnapshotCount",
] as const satisfies readonly (keyof GameplayCapacityBudgetV1)[];

export function parseGameplayCapacityBudgetV1(
  input: unknown,
): GameplayCapacityBudgetV1 {
  const schemaName = "GameplayCapacityBudgetV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  if (!hasExactKeys(record, GAMEPLAY_CAPACITY_BUDGET_KEYS) ||
    !GAMEPLAY_CAPACITY_BUDGET_KEYS.every((key) =>
      isSafeNonNegativeInteger(record[key])
    )
  ) invalid(schemaName);
  return deepFreeze(Object.fromEntries(
    GAMEPLAY_CAPACITY_BUDGET_KEYS.map((key) => [key, record[key] as number]),
  ) as unknown as GameplayCapacityBudgetV1);
}

export const DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1: GameplayCapacityBudgetV1 =
  parseGameplayCapacityBudgetV1({
    maximumParticipantCount: 1,
    maximumControllerEntityCount: 1,
    maximumRelationshipStateCount: 1,
    maximumActiveActionStateCount: 256,
    maximumGameplayFeatureCount: 16,
    maximumSemanticActionDefinitionCount: 256,
    maximumSemanticFactCount: 4096,
    maximumSemanticFactTransitionCountPerTick: 1024,
    maximumIdempotencyRecordCount: 4096,
    maximumUsedActionExecutionIdCount: 4096,
    maximumRetainedReceiptCount: 4096,
    maximumRetainedEventCount: 8192,
    maximumRetainedWorldStateSnapshotCount: 4096,
  });
