import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";

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
  if (typeof value !== "object" || value === null) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string" ||
        descriptor === undefined ||
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
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      snapshot.push(descriptor.value);
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
    if (lengthDescriptor?.enumerable !== false) return undefined;
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
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSha256(value: unknown): value is Sha256HashV1 {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
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
  if (record === undefined) return undefined;
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

export function hashGameplayCommandV1(input: unknown): Sha256HashV1 {
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
  | "ACTION_BLOCKS_CONTROL_CHANGE"
  | "ACTION_REQUEST_INVALID"
  | "ADAPTER_FIXED_INPUT_FAILED"
  | "ADAPTER_PREPARE_FAILED"
  | "ADAPTER_COMMIT_FAILED"
  | "ADAPTER_ROLLBACK_FAILED"
  | "WORLD_REPLACEMENT_BLOCKED_BY_ACTIVE_RUN";

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
  "ACTION_BLOCKS_CONTROL_CHANGE",
  "ACTION_REQUEST_INVALID",
  "ADAPTER_FIXED_INPUT_FAILED",
  "ADAPTER_PREPARE_FAILED",
  "ADAPTER_COMMIT_FAILED",
  "ADAPTER_ROLLBACK_FAILED",
  "WORLD_REPLACEMENT_BLOCKED_BY_ACTIVE_RUN",
]);

function parseGameplayDiagnosticV1(
  input: unknown,
): GameplayDiagnosticV1 | undefined {
  const record = snapshotDataRecord(input);
  if (
    record === undefined ||
    !hasExactKeys(record, ["code", "message"]) ||
    typeof record.code !== "string" ||
    !GAMEPLAY_DIAGNOSTIC_CODES.has(record.code as GameplayDiagnosticCodeV1) ||
    !isNonEmptyString(record.message)
  ) return undefined;
  return {
    code: record.code as GameplayDiagnosticCodeV1,
    message: record.message,
  };
}

function parseStringArray(input: unknown): readonly string[] | undefined {
  const values = snapshotDataArray(input);
  if (values === undefined || !values.every(isNonEmptyString)) return undefined;
  return [...values] as string[];
}

interface GameplayCommandReceiptBaseV1 {
  readonly kind: "worldkit-gameplay-command-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly commandId: string;
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

function parseReceiptBase(record: Readonly<Record<string, unknown>>):
  | GameplayCommandReceiptBaseV1
  | undefined {
  if (
    record.kind !== "worldkit-gameplay-command-receipt" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !isNonEmptyString(record.commandId) ||
    typeof record.commandType !== "string" ||
    !COMMAND_TYPES.has(record.commandType as GameplayCommandV1["type"]) ||
    !isSafeNonNegativeInteger(record.simulationTick)
  ) return undefined;
  return {
    kind: "worldkit-gameplay-command-receipt",
    schemaVersion: 1,
    id: record.id,
    runtimeSessionId: record.runtimeSessionId,
    worldSessionId: record.worldSessionId,
    commandId: record.commandId,
    commandType: record.commandType as GameplayCommandV1["type"],
    simulationTick: record.simulationTick,
  };
}

export function parseGameplayCommandReceiptV1(
  input: unknown,
): GameplayCommandReceiptV1 {
  const schemaName = "GameplayCommandReceiptV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const base = parseReceiptBase(record) ?? invalid(schemaName);
  const commonKeys = [
    "kind",
    "schemaVersion",
    "id",
    "runtimeSessionId",
    "worldSessionId",
    "commandId",
    "commandType",
    "status",
    "simulationTick",
    "eventIds",
  ] as const;
  const eventIds = parseStringArray(record.eventIds) ?? invalid(schemaName);

  if (record.status === "committed") {
    if (
      !hasExactKeys(record, [
        ...commonKeys,
        "worldStateAfterRef",
        "worldStateAfterHash",
      ]) ||
      !isNonEmptyString(record.worldStateAfterRef) ||
      !isSha256(record.worldStateAfterHash)
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
  readonly relationshipId: string;
  readonly controlledEntityId: string;
  readonly controllerEntityId: string;
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
    "relationshipId",
    "controlledEntityId",
    "controllerEntityId",
  ]) ||
    !isNonEmptyString(record.commandId) ||
    !isNonEmptyString(record.relationshipId) ||
    !isNonEmptyString(record.controlledEntityId) ||
    !isNonEmptyString(record.controllerEntityId)
  ) return invalid(schemaName);
  return {
    ...base,
    type,
    commandId: record.commandId,
    relationshipId: record.relationshipId,
    controlledEntityId: record.controlledEntityId,
    controllerEntityId: record.controllerEntityId,
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

export interface LocomotionCapabilityStateV1 {
  readonly id: string;
  readonly kind: "locomotion-capability-state";
  readonly ownerEntityId: string;
  readonly locomotionCapabilityRef: string;
  readonly locomotionCapabilityHash: Sha256HashV1;
  readonly mode: "idle" | "walk" | "run" | "airborne";
  readonly movementMedium: "ground" | "air";
  readonly facingYawRadians: number;
  readonly speedMetersPerSecond: number;
}

export type GameplayCapabilityStateV1 = LocomotionCapabilityStateV1;

export interface PossessedByRelationshipStateV1 {
  readonly id: string;
  readonly type: "possessedBy";
  readonly schemaVersion: 1;
  readonly controlledEntityId: string;
  readonly controllerEntityId: string;
  readonly establishedSimulationTick: number;
}

export type GameplayRelationshipStateV1 = PossessedByRelationshipStateV1;

export interface SupportedByFactV1 {
  readonly id: string;
  readonly type: "supportedBy";
  readonly schemaVersion: 1;
  readonly supportedEntityId: string;
  readonly supportSurfaceEntityId: string;
  readonly supportColliderSubshapeId: string;
  readonly supportTraversalSurfaceId?: string;
  readonly supportPointMetersXYZ: readonly [number, number, number];
  readonly supportNormalXYZ: readonly [number, number, number];
  readonly startedSimulationTick: number;
}

export interface TouchingFactV1 {
  readonly id: string;
  readonly type: "touching";
  readonly schemaVersion: 1;
  readonly entityIds: readonly [string, string];
  readonly startedSimulationTick: number;
}

export interface InsideVolumeFactV1 {
  readonly id: string;
  readonly type: "insideVolume";
  readonly schemaVersion: 1;
  readonly containedEntityId: string;
  readonly volumeEntityId: string;
  readonly startedSimulationTick: number;
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
    values === undefined ||
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
    record.linearVelocityMetersPerSecondXYZ === undefined
      ? undefined
      : parseFiniteTuple(record.linearVelocityMetersPerSecondXYZ, 3);
  const angularVelocityRadiansPerSecondXYZ =
    record.angularVelocityRadiansPerSecondXYZ === undefined
      ? undefined
      : parseFiniteTuple(record.angularVelocityRadiansPerSecondXYZ, 3);
  if (
    positionMetersXYZ === undefined ||
    rotationQuaternionXYZW === undefined ||
    scaleRatioXYZ === undefined ||
    (Object.hasOwn(record, "linearVelocityMetersPerSecondXYZ") &&
      linearVelocityMetersPerSecondXYZ === undefined) ||
    (Object.hasOwn(record, "angularVelocityRadiansPerSecondXYZ") &&
      angularVelocityRadiansPerSecondXYZ === undefined)
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
    ...(linearVelocityMetersPerSecondXYZ === undefined
      ? {}
      : {
          linearVelocityMetersPerSecondXYZ:
            linearVelocityMetersPerSecondXYZ as readonly [number, number, number],
        }),
    ...(angularVelocityRadiansPerSecondXYZ === undefined
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
  if (record === undefined || !hasExactKeys(record, [
    "id",
    "kind",
    "ownerEntityId",
    "locomotionCapabilityRef",
    "locomotionCapabilityHash",
    "mode",
    "movementMedium",
    "facingYawRadians",
    "speedMetersPerSecond",
  ]) ||
    record.kind !== "locomotion-capability-state" ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.ownerEntityId) ||
    !isNonEmptyString(record.locomotionCapabilityRef) ||
    !isSha256(record.locomotionCapabilityHash) ||
    !["idle", "walk", "run", "airborne"].includes(record.mode as string) ||
    !["ground", "air"].includes(record.movementMedium as string) ||
    !isFiniteNumber(record.facingYawRadians) ||
    !isFiniteNumber(record.speedMetersPerSecond)
  ) return undefined;
  return {
    id: record.id,
    kind: "locomotion-capability-state",
    ownerEntityId: record.ownerEntityId,
    locomotionCapabilityRef: record.locomotionCapabilityRef,
    locomotionCapabilityHash: record.locomotionCapabilityHash,
    mode: record.mode as LocomotionCapabilityStateV1["mode"],
    movementMedium: record.movementMedium as LocomotionCapabilityStateV1["movementMedium"],
    facingYawRadians: record.facingYawRadians,
    speedMetersPerSecond: record.speedMetersPerSecond,
  };
}

function parsePossessedByRelationshipStateV1(
  input: unknown,
): PossessedByRelationshipStateV1 | undefined {
  const record = snapshotDataRecord(input);
  if (record === undefined || !hasExactKeys(record, [
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
    !isSafeNonNegativeInteger(record.startedSimulationTick)
  ) return undefined;
  const supportPointMetersXYZ = parseFiniteTuple(record.supportPointMetersXYZ, 3);
  const supportNormalXYZ = parseFiniteTuple(record.supportNormalXYZ, 3);
  if (supportPointMetersXYZ === undefined || supportNormalXYZ === undefined) {
    return undefined;
  }
  return {
    id: record.id,
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
  ]) ||
    record.type !== "touching" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    !isSafeNonNegativeInteger(record.startedSimulationTick)
  ) return undefined;
  const entityIds = snapshotDataArray(record.entityIds);
  if (
    entityIds === undefined ||
    entityIds.length !== 2 ||
    !isNonEmptyString(entityIds[0]) ||
    !isNonEmptyString(entityIds[1]) ||
    entityIds[0] >= entityIds[1]
  ) return undefined;
  return {
    id: record.id,
    type: "touching",
    schemaVersion: 1,
    entityIds: [entityIds[0], entityIds[1]],
    startedSimulationTick: record.startedSimulationTick,
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
  ]) ||
    record.type !== "insideVolume" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.containedEntityId) ||
    !isNonEmptyString(record.volumeEntityId) ||
    !isSafeNonNegativeInteger(record.startedSimulationTick)
  ) return undefined;
  return {
    id: record.id,
    type: "insideVolume",
    schemaVersion: 1,
    containedEntityId: record.containedEntityId,
    volumeEntityId: record.volumeEntityId,
    startedSimulationTick: record.startedSimulationTick,
  };
}

function parseGameplaySemanticFactV1(
  input: unknown,
): GameplaySemanticFactV1 | undefined {
  const record = snapshotDataRecord(input);
  if (record?.type === "supportedBy") return parseSupportedByFactV1(record);
  if (record?.type === "touching") return parseTouchingFactV1(record);
  if (record?.type === "insideVolume") return parseInsideVolumeFactV1(record);
  return undefined;
}

function parseGameplayActionStateV1(input: unknown): GameplayActionStateV1 | undefined {
  const record = snapshotDataRecord(input);
  if (record === undefined) return undefined;
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
  if (record === undefined) return undefined;
  const entries: [string, T][] = [];
  for (const key of Object.keys(record).sort()) {
    if (!isNonEmptyString(key)) return undefined;
    const parsed = parseValue(record[key]);
    if (parsed === undefined || parsed.id !== key) return undefined;
    entries.push([key, parsed]);
  }
  return Object.fromEntries(entries);
}

type WorldStateSnapshotBodyV1 = Omit<WorldStateSnapshotV1, "worldStateHash">;

function getOwnMapValue<T>(
  map: Readonly<Record<string, T>>,
  id: string,
): T | undefined {
  const descriptor = Reflect.getOwnPropertyDescriptor(map, id);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function parseWorldStateSnapshotBodyV1(input: unknown): WorldStateSnapshotBodyV1 {
  const schemaName = "WorldStateSnapshotV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const bodyKeys = [
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
  ] as const;
  if ((!hasExactKeys(record, bodyKeys) &&
      !hasExactKeys(record, [...bodyKeys, "worldStateHash"])) ||
    record.kind !== "worldkit-world-state-snapshot" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !isSafeNonNegativeInteger(record.simulationTick) ||
    !isNonEmptyString(record.worldPackageRef) ||
    !isSha256(record.worldPackageRootHash) ||
    !isSha256(record.executionPlanHash) ||
    !isSafeNonNegativeInteger(record.lastEventSequence)
  ) invalid(schemaName);

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
    parsePossessedByRelationshipStateV1,
  ) ?? invalid(schemaName);
  const semanticFactsById = parseIdMap(
    record.semanticFactsById,
    parseGameplaySemanticFactV1,
  ) ?? invalid(schemaName);
  const activeActionStatesById = parseIdMap(
    record.activeActionStatesById,
    parseGameplayActionStateV1,
  ) ?? invalid(schemaName);

  const controlledEntityIds = new Set<string>();
  const controllerEntityIds = new Set<string>();
  for (const relationship of Object.values(relationshipStatesById)) {
    if (
      controlledEntityIds.has(relationship.controlledEntityId) ||
      controllerEntityIds.has(relationship.controllerEntityId)
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
  }

  for (const action of Object.values(activeActionStatesById)) {
    if (
      getOwnMapValue(entityStatesById, action.actorEntityId)?.kind !==
        "spatial-entity-state"
    ) invalid(schemaName);
  }

  return {
    kind: "worldkit-world-state-snapshot",
    schemaVersion: 1,
    id: record.id as string,
    runtimeSessionId: record.runtimeSessionId as string,
    worldSessionId: record.worldSessionId as string,
    simulationTick: record.simulationTick as number,
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

function worldStateHashDomainV1(body: WorldStateSnapshotBodyV1): unknown {
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
  const body = parseWorldStateSnapshotBodyV1(input);
  return sha256CanonicalJson(worldStateHashDomainV1(body)) as Sha256HashV1;
}

export function buildWorldStateSnapshotV1(input: unknown): WorldStateSnapshotV1 {
  const body = parseWorldStateSnapshotBodyV1(input);
  return deepFreeze({
    ...body,
    worldStateHash: sha256CanonicalJson(
      worldStateHashDomainV1(body),
    ) as Sha256HashV1,
  });
}

export function parseWorldStateSnapshotV1(input: unknown): WorldStateSnapshotV1 {
  const schemaName = "WorldStateSnapshotV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  if (!Object.hasOwn(record, "worldStateHash") || !isSha256(record.worldStateHash)) {
    return invalid(schemaName);
  }
  const snapshot = buildWorldStateSnapshotV1(record);
  if (snapshot.worldStateHash !== record.worldStateHash) return invalid(schemaName);
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
  readonly possessedByRelationshipsById: Readonly<
    Record<string, PossessedByRelationshipStateV1>
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
    record === undefined ||
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
    record === undefined ||
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
    "possessedByRelationshipsById",
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
  const possessedByRelationshipsById = parseIdMap(
    record.possessedByRelationshipsById,
    parsePossessedByRelationshipStateV1,
  ) ?? invalid(schemaName);
  const activeActionStatesById = parseIdMap(
    record.activeActionStatesById,
    parseGameplayActionStateV1,
  ) ?? invalid(schemaName);
  const activatedGameplayFeatureRefs = parseStringArray(
    record.activatedGameplayFeatureRefs,
  ) ?? invalid(schemaName);

  for (const controller of Object.values(controllerStatesById)) {
    if (getOwnMapValue(participantStatesById, controller.participantId) === undefined) {
      invalid(schemaName);
    }
  }

  const controlledEntityIds = new Set<string>();
  const controllerEntityIds = new Set<string>();
  for (const relationship of Object.values(possessedByRelationshipsById)) {
    if (
      controlledEntityIds.has(relationship.controlledEntityId) ||
      controllerEntityIds.has(relationship.controllerEntityId) ||
      getOwnMapValue(controllerStatesById, relationship.controllerEntityId) ===
        undefined
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
    possessedByRelationshipsById,
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
  readonly maximumPossessedByRelationshipCount: number;
  readonly maximumActiveActionStateCount: number;
  readonly maximumGameplayFeatureCount: number;
  readonly maximumSemanticActionDefinitionCount: number;
  readonly maximumIdempotencyRecordCount: number;
  readonly maximumRetainedReceiptCount: number;
  readonly maximumRetainedEventCount: number;
}

const GAMEPLAY_CAPACITY_BUDGET_KEYS = [
  "maximumParticipantCount",
  "maximumControllerEntityCount",
  "maximumPossessedByRelationshipCount",
  "maximumActiveActionStateCount",
  "maximumGameplayFeatureCount",
  "maximumSemanticActionDefinitionCount",
  "maximumIdempotencyRecordCount",
  "maximumRetainedReceiptCount",
  "maximumRetainedEventCount",
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
    maximumPossessedByRelationshipCount: 1,
    maximumActiveActionStateCount: 256,
    maximumGameplayFeatureCount: 16,
    maximumSemanticActionDefinitionCount: 256,
    maximumIdempotencyRecordCount: 4096,
    maximumRetainedReceiptCount: 4096,
    maximumRetainedEventCount: 8192,
  });
