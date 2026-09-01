import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  parseGameplayCommandReceiptV1,
  parseGameplayCommandV1,
  parseGameplayCapabilityStateV1,
  parseGameplayEventV1,
  parseGameplayInspectionSnapshotV1,
  type GameplayCapabilityStateV1,
  type GameplayCommandReceiptV1,
  type GameplayCommandV1,
  type GameplayEventV1,
  type SpatialEntityStateV1,
} from "@whitebox-world/gameplay-contracts";
import {
  CAMERA_RIG_PARAMETER_NAMES_V1,
  cameraRigParametersViolateInvariantsV1,
  type CameraDiagnosticV1,
  type CameraRigParametersV1,
  type CameraSelectionDecisionV2,
  type CameraSelectionExplainV1,
  type CameraViewPreferenceV1,
} from "@whitebox-world/camera";
import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import { isEmpty, isNil } from "lodash-es";

import type {
  FixedInputV1,
  GameplayEventsQueryResultV1,
  GameplayEventsQueryV1,
  WorldRuntimeCameraStateV4,
  WorldRuntimeSnapshotV4,
  WorldRuntimeSubjectStateV4,
} from "./runtime-session";
import { parseFixedInputV1 } from "./runtime-session";

export const WORLDKIT_RUNTIME_SESSION_PROTOCOL_VERSION = 1 as const;

export const WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1 = Object.freeze([
  "gameplay-command.execute",
  "fixed-input.run",
  "snapshot.get",
  "events.get",
  "session.close",
] as const);

export type RuntimeSessionRequestTypeV1 =
  typeof WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1[number];

interface RuntimeSessionRequestBaseV1 {
  readonly kind: "worldkit-runtime-session-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly type: RuntimeSessionRequestTypeV1;
}

export type RuntimeSessionRequestV1 =
  | (RuntimeSessionRequestBaseV1 & Readonly<{
      type: "gameplay-command.execute";
      command: GameplayCommandV1;
    }>)
  | (RuntimeSessionRequestBaseV1 & Readonly<{
      type: "fixed-input.run";
      input: FixedInputV1;
    }>)
  | (RuntimeSessionRequestBaseV1 & Readonly<{
      type: "snapshot.get";
    }>)
  | (RuntimeSessionRequestBaseV1 & Readonly<{
      type: "events.get";
      query: GameplayEventsQueryV1;
    }>)
  | (RuntimeSessionRequestBaseV1 & Readonly<{
      type: "session.close";
    }>);

export type RuntimeSessionDiagnosticCodeV1 =
  | "RUNTIME_SESSION_REQUEST_ID_CONFLICT"
  | "RUNTIME_SESSION_REQUEST_REJECTED"
  | "RUNTIME_SESSION_NOT_ACTIVE"
  | "RUNTIME_SESSION_RECOVERY_DIVERGED"
  | "RUNTIME_SESSION_INTERNAL_FAILURE";

export interface RuntimeSessionDiagnosticV1 {
  readonly code: RuntimeSessionDiagnosticCodeV1;
  readonly message: string;
}

interface RuntimeSessionReceiptBaseV1 {
  readonly kind: "worldkit-runtime-session-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly requestHash: Sha256HashV1;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly requestType: RuntimeSessionRequestTypeV1;
  readonly status: "succeeded" | "rejected";
}

export type RuntimeSessionReceiptV1 =
  | (RuntimeSessionReceiptBaseV1 & Readonly<{
      requestType: "gameplay-command.execute";
      status: "succeeded";
      gameplayCommandReceipt: GameplayCommandReceiptV1;
    }>)
  | (RuntimeSessionReceiptBaseV1 & Readonly<{
      requestType: "fixed-input.run" | "snapshot.get";
      status: "succeeded";
      snapshot: WorldRuntimeSnapshotV4;
    }>)
  | (RuntimeSessionReceiptBaseV1 & Readonly<{
      requestType: "events.get";
      status: "succeeded";
      gameplayEvents: GameplayEventsQueryResultV1;
    }>)
  | (RuntimeSessionReceiptBaseV1 & Readonly<{
      requestType: "session.close";
      status: "succeeded";
      closeResult: Readonly<{ readonly mode: "closed" }>;
    }>)
  | (RuntimeSessionReceiptBaseV1 & Readonly<{
      status: "rejected";
      diagnostic: RuntimeSessionDiagnosticV1;
    }>);

interface RuntimeSessionEventBaseV1 {
  readonly kind: "worldkit-runtime-session-event";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly protocolVersion: typeof WORLDKIT_RUNTIME_SESSION_PROTOCOL_VERSION;
  readonly sequence: number;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly type: "ready" | "completed" | "failed";
}

export type RuntimeSessionEventV1 =
  | (RuntimeSessionEventBaseV1 & Readonly<{
      type: "ready";
      runtimeSessionUri: `worldkit://runtime-session/${string}`;
      worldPackageRef: `package://world-package/sha256/${string}`;
      worldPackageRootHash: Sha256HashV1;
      worldBuildIdentityHash: Sha256HashV1;
      fixedInputControllerEntityId: string;
      supportedRequestTypes:
        typeof WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1;
    }>)
  | (RuntimeSessionEventBaseV1 & Readonly<{
      type: "completed";
    }>)
  | (RuntimeSessionEventBaseV1 & Readonly<{
      type: "failed";
      diagnostic: RuntimeSessionDiagnosticV1;
    }>);

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const WORLD_PACKAGE_REF_PATTERN =
  /^package:\/\/world-package\/sha256\/([a-f0-9]{64})$/;
const MAXIMUM_GAMEPLAY_EVENT_PAGE_COUNT = 256;
const RUNTIME_SESSION_REQUEST_TYPES = new Set<RuntimeSessionRequestTypeV1>(
  WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
);
const RUNTIME_SESSION_DIAGNOSTIC_CODES =
  new Set<RuntimeSessionDiagnosticCodeV1>([
    "RUNTIME_SESSION_REQUEST_ID_CONFLICT",
    "RUNTIME_SESSION_REQUEST_REJECTED",
    "RUNTIME_SESSION_NOT_ACTIVE",
    "RUNTIME_SESSION_RECOVERY_DIVERGED",
    "RUNTIME_SESSION_INTERNAL_FAILURE",
  ]);
const CAMERA_DIAGNOSTIC_CODES = new Set<CameraDiagnosticV1["code"]>([
  "CAMERA_RESOURCE_NOT_LOCKED",
  "CAMERA_PROFILE_INVALID",
  "CAMERA_CONTEXT_RULE_AMBIGUOUS",
  "CAMERA_CONTEXT_RULE_INVALID",
  "CAMERA_PREFERENCE_INVALID",
  "CAMERA_PREFERENCE_NOT_ALLOWED",
  "CAMERA_FIRST_PERSON_UNAVAILABLE",
  "CAMERA_REQUIRED_SOCKET_MISSING",
  "CAMERA_PREFERENCE_CONTEXT_INCOMPATIBLE",
]);
const CAMERA_PARAMETER_NAMES = new Set<string>(CAMERA_RIG_PARAMETER_NAMES_V1);

function invalid(schemaName: string): never {
  throw new RangeError(`Value must match the closed ${schemaName} schema.`);
}

function snapshotDataRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || isNil(value)) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (!isNil(prototype) && prototype !== Object.prototype) return undefined;
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
    return snapshot;
  } catch {
    return undefined;
  }
}

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actual = Reflect.ownKeys(record);
  return actual.length === keys.length && actual.every(
    (key) => typeof key === "string" && keys.includes(key),
  );
}

function hasOnlyKnownKeys(
  record: Readonly<Record<string, unknown>>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
): boolean {
  const actual = Reflect.ownKeys(record);
  return requiredKeys.every((key) => Object.hasOwn(record, key)) &&
    actual.every((key) =>
      typeof key === "string" &&
      (requiredKeys.includes(key) || optionalKeys.includes(key))
    );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && !isEmpty(value);
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    !Object.is(value, -0);
}

function isFiniteNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return isFiniteNumber(value) && value >= minimum && value <= maximum;
}

function isSha256(value: unknown): value is Sha256HashV1 {
  return typeof value === "string" && SHA256_PATTERN.test(value) &&
    value !== `sha256:${"0".repeat(64)}`;
}

function finiteTuple(
  value: unknown,
  length: number,
): readonly number[] | undefined {
  const values = snapshotDataArray(value);
  if (
    isNil(values) ||
    values.length !== length ||
    values.some((item) => !isFiniteNumber(item))
  ) return undefined;
  return values as readonly number[];
}

function stringArray(
  value: unknown,
  options: Readonly<{
    maximumCount?: number;
    requireUnique?: boolean;
  }> = {},
): readonly string[] | undefined {
  const values = snapshotDataArray(value);
  if (
    isNil(values) ||
    (!isNil(options.maximumCount) && values.length > options.maximumCount) ||
    values.some((item) => !isNonEmptyString(item)) ||
    (options.requireUnique === true &&
      new Set(values as readonly string[]).size !== values.length)
  ) return undefined;
  return values as readonly string[];
}

function canonicalClone<T>(value: T, schemaName: string): T {
  function clone(input: unknown): unknown {
    if (
      typeof input === "string" ||
      typeof input === "boolean" ||
      input === null
    ) return input;
    if (isFiniteNumber(input)) return input;
    const values = snapshotDataArray(input);
    if (!isNil(values)) return Object.freeze(values.map(clone));
    const record = snapshotDataRecord(input);
    if (!isNil(record)) {
      return Object.freeze(Object.fromEntries(
        Object.keys(record).sort().map((key) => [key, clone(record[key])]),
      ));
    }
    return invalid(schemaName);
  }
  return clone(value) as T;
}

function parseRuntimeSessionDiagnosticV1(
  value: unknown,
): RuntimeSessionDiagnosticV1 | undefined {
  const record = snapshotDataRecord(value);
  if (
    isNil(record) ||
    !hasExactKeys(record, ["code", "message"]) ||
    typeof record.code !== "string" ||
    !RUNTIME_SESSION_DIAGNOSTIC_CODES.has(
      record.code as RuntimeSessionDiagnosticCodeV1,
    ) ||
    !isNonEmptyString(record.message)
  ) return undefined;
  return Object.freeze({
    code: record.code as RuntimeSessionDiagnosticCodeV1,
    message: record.message,
  });
}

function validateSpatialEntityStateV1(value: unknown): SpatialEntityStateV1 {
  const schemaName = "WorldRuntimeSnapshotV4";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  const required = [
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
  if (
    !hasOnlyKnownKeys(record, required, [
      "linearVelocityMetersPerSecondXYZ",
      "angularVelocityRadiansPerSecondXYZ",
    ]) ||
    !isNonEmptyString(record.id) ||
    record.kind !== "spatial-entity-state" ||
    !isNonEmptyString(record.entityDefinitionRef) ||
    !isSha256(record.entityDefinitionHash) ||
    !isNonEmptyString(record.semanticClassId) ||
    !["active", "disabled"].includes(record.lifecycleMode as string) ||
    isNil(finiteTuple(record.positionMetersXYZ, 3)) ||
    isNil(finiteTuple(record.rotationQuaternionXYZW, 4)) ||
    isNil(finiteTuple(record.scaleRatioXYZ, 3)) ||
    (Object.hasOwn(record, "linearVelocityMetersPerSecondXYZ") &&
      isNil(finiteTuple(record.linearVelocityMetersPerSecondXYZ, 3))) ||
    (Object.hasOwn(record, "angularVelocityRadiansPerSecondXYZ") &&
      isNil(finiteTuple(record.angularVelocityRadiansPerSecondXYZ, 3)))
  ) return invalid(schemaName);
  return canonicalClone(record, schemaName) as unknown as SpatialEntityStateV1;
}

function validateSubjectStateV4(value: unknown): WorldRuntimeSubjectStateV4 {
  const schemaName = "WorldRuntimeSnapshotV4";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  if (!hasExactKeys(record, ["entityState", "capabilityStatesById"])) {
    return invalid(schemaName);
  }
  const entityState = validateSpatialEntityStateV1(record.entityState);
  const capabilityRecords = snapshotDataRecord(record.capabilityStatesById) ??
    invalid(schemaName);
  const capabilities: Record<string, GameplayCapabilityStateV1> = {};
  for (const [id, capabilityValue] of Object.entries(capabilityRecords)) {
    const capability = parseGameplayCapabilityStateV1(capabilityValue) ??
      invalid(schemaName);
    if (id !== capability.id || capability.ownerEntityId !== entityState.id) {
      return invalid(schemaName);
    }
    capabilities[id] = capability;
  }
  return Object.freeze({
    entityState,
    capabilityStatesById: Object.freeze(capabilities),
  });
}

function validateCameraViewPreferenceV1(value: unknown): CameraViewPreferenceV1 {
  const schemaName = "WorldRuntimeSnapshotV4";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  if (
    ["auto", "first-person"].includes(record.mode as string) &&
    hasExactKeys(record, ["mode"])
  ) return canonicalClone(record, schemaName) as CameraViewPreferenceV1;
  if (
    record.mode === "camera-rig-profile" &&
    hasExactKeys(record, ["mode", "cameraRigProfileRef"]) &&
    isNonEmptyString(record.cameraRigProfileRef)
  ) return canonicalClone(record, schemaName) as CameraViewPreferenceV1;
  return invalid(schemaName);
}

function validateCameraDiagnosticV1(value: unknown): CameraDiagnosticV1 {
  const schemaName = "WorldRuntimeSnapshotV4";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  if (
    !hasOnlyKnownKeys(record, [
      "severity",
      "code",
      "message",
      "cameraContextProfileRef",
    ], ["cameraContextRuleId", "resourceRef"]) ||
    !["error", "warning"].includes(record.severity as string) ||
    typeof record.code !== "string" ||
    !CAMERA_DIAGNOSTIC_CODES.has(record.code as CameraDiagnosticV1["code"]) ||
    !isNonEmptyString(record.message) ||
    !isNonEmptyString(record.cameraContextProfileRef) ||
    (Object.hasOwn(record, "cameraContextRuleId") &&
      !isNonEmptyString(record.cameraContextRuleId)) ||
    (Object.hasOwn(record, "resourceRef") &&
      !isNonEmptyString(record.resourceRef))
  ) return invalid(schemaName);
  return canonicalClone(record, schemaName) as unknown as CameraDiagnosticV1;
}

function validateCameraSelectionExplainV1(
  value: unknown,
): CameraSelectionExplainV1 {
  const schemaName = "WorldRuntimeSnapshotV4";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  if (!hasExactKeys(record, [
    "cameraViewPreference",
    "cameraContextRules",
    "selectedCameraRigProfileRef",
    "appliedCameraModifierRefs",
    "fallbackActive",
  ]) ||
    !isNonEmptyString(record.selectedCameraRigProfileRef) ||
    isNil(stringArray(record.appliedCameraModifierRefs, { requireUnique: true })) ||
    typeof record.fallbackActive !== "boolean"
  ) return invalid(schemaName);
  validateCameraViewPreferenceV1(record.cameraViewPreference);
  const ruleInputs = snapshotDataArray(record.cameraContextRules) ??
    invalid(schemaName);
  for (const ruleInput of ruleInputs) {
    const rule = snapshotDataRecord(ruleInput) ?? invalid(schemaName);
    if (!hasExactKeys(rule, [
      "cameraContextRuleId",
      "priority",
      "matched",
      "unmatchedReasons",
    ]) ||
      !isNonEmptyString(rule.cameraContextRuleId) ||
      !Number.isSafeInteger(rule.priority) ||
      Object.is(rule.priority, -0) ||
      typeof rule.matched !== "boolean" ||
      isNil(stringArray(rule.unmatchedReasons))
    ) return invalid(schemaName);
  }
  return canonicalClone(record, schemaName) as unknown as CameraSelectionExplainV1;
}

function validateCameraSelectionDecisionV2(
  value: unknown,
): CameraSelectionDecisionV2 {
  const schemaName = "WorldRuntimeSnapshotV4";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  if (!hasExactKeys(record, [
    "schemaVersion",
    "committedTick",
    "targetEntityId",
    "activeCameraRigProfileRef",
    "activeCameraModifierRefs",
    "matchedCameraContextRuleIds",
    "cameraViewPreference",
    "fallbackActive",
    "diagnostics",
    "explain",
  ]) ||
    record.schemaVersion !== 2 ||
    !isSafeNonNegativeInteger(record.committedTick) ||
    !isNonEmptyString(record.targetEntityId) ||
    !isNonEmptyString(record.activeCameraRigProfileRef) ||
    isNil(stringArray(record.activeCameraModifierRefs, { requireUnique: true })) ||
    isNil(stringArray(record.matchedCameraContextRuleIds, { requireUnique: true })) ||
    typeof record.fallbackActive !== "boolean"
  ) return invalid(schemaName);
  validateCameraViewPreferenceV1(record.cameraViewPreference);
  validateCameraSelectionExplainV1(record.explain);
  const diagnostics = snapshotDataArray(record.diagnostics) ?? invalid(schemaName);
  diagnostics.forEach(validateCameraDiagnosticV1);
  return canonicalClone(record, schemaName) as unknown as CameraSelectionDecisionV2;
}

function validateCameraParametersV1(
  value: unknown,
  complete: boolean,
): Readonly<Partial<CameraRigParametersV1>> {
  const schemaName = "WorldRuntimeSnapshotV4";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  const keys = Reflect.ownKeys(record);
  if (
    keys.some((key) =>
      typeof key !== "string" || !CAMERA_PARAMETER_NAMES.has(key)
    ) ||
    (complete && keys.length !== CAMERA_RIG_PARAMETER_NAMES_V1.length) ||
    Object.values(record).some((parameter) => !isFiniteNumber(parameter)) ||
    cameraRigParametersViolateInvariantsV1(
      record as Readonly<Partial<CameraRigParametersV1>>,
    )
  ) return invalid(schemaName);
  return canonicalClone(record, schemaName) as Readonly<Partial<CameraRigParametersV1>>;
}

function validateRuntimeCameraStateV4(
  value: unknown,
): WorldRuntimeCameraStateV4 {
  const schemaName = "WorldRuntimeSnapshotV4";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  if (record.mode === "unbound") {
    if (!hasExactKeys(record, ["mode"])) return invalid(schemaName);
    return Object.freeze({ mode: "unbound" });
  }
  const required = [
    "mode",
    "id",
    "targetEntityId",
    "positionMetersXYZ",
    "activeCameraProfileRef",
    "activeCameraRigRef",
    "activeCameraModifierRefs",
    "safeFallbackActive",
    "viewYawOffsetRadians",
    "viewPitchOffsetRadians",
    "viewDistanceOffsetMeters",
    "fixedStepDeltaSeconds",
  ] as const;
  const optional = [
    "selectionDecision",
    "selectedTargetSocketId",
    "targetSocketPositionMetersXYZ",
    "isTargetSocketFallback",
    "desiredTargetPositionMetersXYZ",
    "desiredPositionMetersXYZ",
    "actualPositionMetersXYZ",
    "finalFovDegrees",
    "requestedArmLengthMeters",
    "safeArmLengthMeters",
    "effectiveArmLengthMeters",
    "isCollisionRetracted",
    "collisionHitEntityId",
    "collisionHitPositionXYZ",
    "positionLagXYZ",
    "rotationLagRadiansXYZ",
    "recenterRemainingSeconds",
    "resolvedParameters",
    "previewParameterOverrides",
    "profileTransitionProgressRatio",
    "controlForwardXYZ",
    "subjectForwardXYZ",
    "subjectVelocityMetersPerSecondXYZ",
  ] as const;
  if (
    record.mode !== "tracking" ||
    !hasOnlyKnownKeys(record, required, optional) ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.targetEntityId) ||
    isNil(finiteTuple(record.positionMetersXYZ, 3)) ||
    !isNonEmptyString(record.activeCameraProfileRef) ||
    !isNonEmptyString(record.activeCameraRigRef) ||
    isNil(stringArray(record.activeCameraModifierRefs, { requireUnique: true })) ||
    typeof record.safeFallbackActive !== "boolean" ||
    !isFiniteNumber(record.viewYawOffsetRadians) ||
    !isFiniteNumber(record.viewPitchOffsetRadians) ||
    !isFiniteNumber(record.viewDistanceOffsetMeters) ||
    !isFiniteNumber(record.fixedStepDeltaSeconds) ||
    record.fixedStepDeltaSeconds <= 0
  ) return invalid(schemaName);
  const optionalStrings = ["selectedTargetSocketId", "collisionHitEntityId"];
  const optionalBooleans = ["isTargetSocketFallback", "isCollisionRetracted"];
  const optionalTuples = [
    "targetSocketPositionMetersXYZ",
    "desiredTargetPositionMetersXYZ",
    "desiredPositionMetersXYZ",
    "actualPositionMetersXYZ",
    "collisionHitPositionXYZ",
    "positionLagXYZ",
    "rotationLagRadiansXYZ",
    "controlForwardXYZ",
    "subjectForwardXYZ",
    "subjectVelocityMetersPerSecondXYZ",
  ];
  const optionalNonNegativeNumbers = [
    "requestedArmLengthMeters",
    "safeArmLengthMeters",
    "effectiveArmLengthMeters",
    "recenterRemainingSeconds",
  ];
  if (
    optionalStrings.some((key) =>
      Object.hasOwn(record, key) && !isNonEmptyString(record[key])
    ) ||
    optionalBooleans.some((key) =>
      Object.hasOwn(record, key) && typeof record[key] !== "boolean"
    ) ||
    optionalTuples.some((key) =>
      Object.hasOwn(record, key) && isNil(finiteTuple(record[key], 3))
    ) ||
    optionalNonNegativeNumbers.some((key) =>
      Object.hasOwn(record, key) &&
      (!isFiniteNumber(record[key]) || (record[key] as number) < 0)
    ) ||
    (Object.hasOwn(record, "finalFovDegrees") &&
      (!isFiniteNumber(record.finalFovDegrees) ||
        record.finalFovDegrees <= 0 || record.finalFovDegrees >= 180)) ||
    (Object.hasOwn(record, "profileTransitionProgressRatio") &&
      !isFiniteNumberInRange(record.profileTransitionProgressRatio, 0, 1))
  ) return invalid(schemaName);
  if (Object.hasOwn(record, "selectionDecision")) {
    validateCameraSelectionDecisionV2(record.selectionDecision);
  }
  if (Object.hasOwn(record, "resolvedParameters")) {
    validateCameraParametersV1(record.resolvedParameters, true);
  }
  if (Object.hasOwn(record, "previewParameterOverrides")) {
    validateCameraParametersV1(record.previewParameterOverrides, false);
  }
  return canonicalClone(record, schemaName) as unknown as WorldRuntimeCameraStateV4;
}

export function parseWorldRuntimeSnapshotV4(
  value: unknown,
): WorldRuntimeSnapshotV4 {
  const schemaName = "WorldRuntimeSnapshotV4";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  if (!hasExactKeys(record, [
    "kind",
    "schemaVersion",
    "runtimeSessionId",
    "worldSessionId",
    "world",
    "view",
    "runtime",
    "resources",
  ]) ||
    record.kind !== "worldkit-runtime-snapshot" ||
    record.schemaVersion !== 4 ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId)
  ) return invalid(schemaName);
  const world = snapshotDataRecord(record.world) ?? invalid(schemaName);
  if (!hasExactKeys(world, [
    "publicationEpoch",
    "simulationTick",
    "worldStateRef",
    "worldStateHash",
    "subjectStatesByEntityId",
    "gameplayInspection",
  ]) ||
    !isSafeNonNegativeInteger(world.publicationEpoch) ||
    !isSafeNonNegativeInteger(world.simulationTick) ||
    !isNonEmptyString(world.worldStateRef) ||
    !isSha256(world.worldStateHash)
  ) return invalid(schemaName);
  const subjectInputs = snapshotDataRecord(world.subjectStatesByEntityId) ??
    invalid(schemaName);
  for (const [entityId, subjectInput] of Object.entries(subjectInputs)) {
    const subject = validateSubjectStateV4(subjectInput);
    if (entityId !== subject.entityState.id) return invalid(schemaName);
  }
  const gameplayInspection = parseGameplayInspectionSnapshotV1(
    world.gameplayInspection,
  );
  if (
    gameplayInspection.runtimeSessionId !== record.runtimeSessionId ||
    gameplayInspection.worldSessionId !== record.worldSessionId ||
    gameplayInspection.simulationTick !== world.simulationTick
  ) return invalid(schemaName);
  const view = snapshotDataRecord(record.view) ?? invalid(schemaName);
  if (!hasExactKeys(view, ["viewStateRevision", "camera"]) ||
    !isSafeNonNegativeInteger(view.viewStateRevision)
  ) return invalid(schemaName);
  validateRuntimeCameraStateV4(view.camera);
  const runtime = snapshotDataRecord(record.runtime) ?? invalid(schemaName);
  if (!hasExactKeys(runtime, [
    "phase",
    "isPaused",
    "fixedTimeStepSeconds",
  ]) ||
    !["ready", "failed", "disposed"].includes(runtime.phase as string) ||
    typeof runtime.isPaused !== "boolean" ||
    !isFiniteNumber(runtime.fixedTimeStepSeconds) ||
    runtime.fixedTimeStepSeconds <= 0
  ) return invalid(schemaName);
  const resources = snapshotDataRecord(record.resources) ?? invalid(schemaName);
  if (!hasExactKeys(resources, [
    "phase",
    "meshCount",
    "physicsBodyCount",
    "terrainSampleCount",
  ]) ||
    !["ready", "degraded", "failed"].includes(resources.phase as string) ||
    !isSafeNonNegativeInteger(resources.meshCount) ||
    !isSafeNonNegativeInteger(resources.physicsBodyCount) ||
    !isSafeNonNegativeInteger(resources.terrainSampleCount)
  ) return invalid(schemaName);
  return canonicalClone(record, schemaName) as unknown as WorldRuntimeSnapshotV4;
}

function parseGameplayEventsQueryV1(value: unknown): GameplayEventsQueryV1 {
  const schemaName = "RuntimeSessionRequestV1";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  if (!hasExactKeys(record, ["afterEventSequence", "maximumEventCount"]) ||
    !isSafeNonNegativeInteger(record.afterEventSequence) ||
    !isSafePositiveInteger(record.maximumEventCount) ||
    record.maximumEventCount > MAXIMUM_GAMEPLAY_EVENT_PAGE_COUNT
  ) return invalid(schemaName);
  return Object.freeze({
    afterEventSequence: record.afterEventSequence,
    maximumEventCount: record.maximumEventCount,
  });
}

export function parseRuntimeSessionRequestV1(
  value: unknown,
): RuntimeSessionRequestV1 {
  const schemaName = "RuntimeSessionRequestV1";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  const common = ["kind", "schemaVersion", "id", "runtimeSessionId", "type"];
  if (
    record.kind !== "worldkit-runtime-session-request" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    typeof record.type !== "string" ||
    !RUNTIME_SESSION_REQUEST_TYPES.has(record.type as RuntimeSessionRequestTypeV1)
  ) return invalid(schemaName);
  if (record.type === "gameplay-command.execute") {
    if (!hasExactKeys(record, [...common, "command"])) return invalid(schemaName);
    const command = parseGameplayCommandV1(record.command);
    if (command.runtimeSessionId !== record.runtimeSessionId) {
      return invalid(schemaName);
    }
  } else if (record.type === "fixed-input.run") {
    if (!hasExactKeys(record, [...common, "input"])) return invalid(schemaName);
    parseFixedInputV1(record.input);
  } else if (record.type === "events.get") {
    if (!hasExactKeys(record, [...common, "query"])) return invalid(schemaName);
    parseGameplayEventsQueryV1(record.query);
  } else if (!hasExactKeys(record, common)) {
    return invalid(schemaName);
  }
  return canonicalClone(record, schemaName) as unknown as RuntimeSessionRequestV1;
}

export function hashRuntimeSessionRequestV1(
  value: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(parseRuntimeSessionRequestV1(value)) as Sha256HashV1;
}

function parseGameplayEventsResultV1(
  value: unknown,
  runtimeSessionId: string,
  worldSessionId: string,
): GameplayEventsQueryResultV1 {
  const schemaName = "RuntimeSessionReceiptV1";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  if (!hasExactKeys(record, ["events", "nextAfterEventSequence", "hasMore"]) ||
    !isSafeNonNegativeInteger(record.nextAfterEventSequence) ||
    typeof record.hasMore !== "boolean"
  ) return invalid(schemaName);
  const eventInputs = snapshotDataArray(record.events) ?? invalid(schemaName);
  if (eventInputs.length > MAXIMUM_GAMEPLAY_EVENT_PAGE_COUNT) {
    return invalid(schemaName);
  }
  let previousSequence = -1;
  const events = eventInputs.map((eventInput) => {
    const event = parseGameplayEventV1(eventInput);
    if (
      event.runtimeSessionId !== runtimeSessionId ||
      event.worldSessionId !== worldSessionId ||
      event.sequence <= previousSequence
    ) return invalid(schemaName);
    previousSequence = event.sequence;
    return event;
  });
  if (
    !isEmpty(events) &&
    record.nextAfterEventSequence !== events[events.length - 1]!.sequence
  ) return invalid(schemaName);
  return Object.freeze({
    events: Object.freeze(events),
    nextAfterEventSequence: record.nextAfterEventSequence,
    hasMore: record.hasMore,
  });
}

function parseRuntimeSessionReceiptBodyV1(
  value: unknown,
): Omit<RuntimeSessionReceiptV1, "id"> {
  const schemaName = "RuntimeSessionReceiptV1";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  const common = [
    "kind",
    "schemaVersion",
    "requestId",
    "requestHash",
    "runtimeSessionId",
    "worldSessionId",
    "requestType",
    "status",
  ];
  if (
    record.kind !== "worldkit-runtime-session-receipt" ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.requestId) ||
    !isSha256(record.requestHash) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    typeof record.requestType !== "string" ||
    !RUNTIME_SESSION_REQUEST_TYPES.has(
      record.requestType as RuntimeSessionRequestTypeV1,
    ) ||
    !["succeeded", "rejected"].includes(record.status as string)
  ) return invalid(schemaName);
  if (record.status === "rejected") {
    if (!hasExactKeys(record, [...common, "diagnostic"]) ||
      isNil(parseRuntimeSessionDiagnosticV1(record.diagnostic))
    ) return invalid(schemaName);
    return canonicalClone(record, schemaName) as unknown as Omit<
      RuntimeSessionReceiptV1,
      "id"
    >;
  }
  if (record.requestType === "gameplay-command.execute") {
    if (!hasExactKeys(record, [...common, "gameplayCommandReceipt"])) {
      return invalid(schemaName);
    }
    const receipt = parseGameplayCommandReceiptV1(record.gameplayCommandReceipt);
    if (
      receipt.runtimeSessionId !== record.runtimeSessionId ||
      receipt.worldSessionId !== record.worldSessionId
    ) return invalid(schemaName);
  } else if (
    record.requestType === "fixed-input.run" ||
    record.requestType === "snapshot.get"
  ) {
    if (!hasExactKeys(record, [...common, "snapshot"])) return invalid(schemaName);
    const snapshot = parseWorldRuntimeSnapshotV4(record.snapshot);
    if (
      snapshot.runtimeSessionId !== record.runtimeSessionId ||
      snapshot.worldSessionId !== record.worldSessionId
    ) return invalid(schemaName);
  } else if (record.requestType === "events.get") {
    if (!hasExactKeys(record, [...common, "gameplayEvents"])) {
      return invalid(schemaName);
    }
    parseGameplayEventsResultV1(
      record.gameplayEvents,
      record.runtimeSessionId,
      record.worldSessionId,
    );
  } else {
    if (!hasExactKeys(record, [...common, "closeResult"])) {
      return invalid(schemaName);
    }
    const closeResult = snapshotDataRecord(record.closeResult);
    if (
      isNil(closeResult) ||
      !hasExactKeys(closeResult, ["mode"]) ||
      closeResult.mode !== "closed"
    ) return invalid(schemaName);
  }
  return canonicalClone(record, schemaName) as unknown as Omit<
    RuntimeSessionReceiptV1,
    "id"
  >;
}

export function deriveRuntimeSessionReceiptIdV1(value: unknown): string {
  const body = parseRuntimeSessionReceiptBodyV1(value);
  const hash = sha256CanonicalJson(body);
  return `runtime-session-receipt:${hash.slice("sha256:".length)}`;
}

export function parseRuntimeSessionReceiptV1(
  value: unknown,
): RuntimeSessionReceiptV1 {
  const schemaName = "RuntimeSessionReceiptV1";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  if (!isNonEmptyString(record.id)) return invalid(schemaName);
  const body = parseRuntimeSessionReceiptBodyV1(Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== "id"),
  ));
  if (record.id !== deriveRuntimeSessionReceiptIdV1(body)) {
    return invalid(schemaName);
  }
  return canonicalClone({ id: record.id, ...body }, schemaName) as
    RuntimeSessionReceiptV1;
}

export function canonicalRuntimeSessionReceiptV1(value: unknown): string {
  return stringifyCanonicalJson(parseRuntimeSessionReceiptV1(value));
}

function parseRuntimeSessionEventBodyV1(
  value: unknown,
): Omit<RuntimeSessionEventV1, "id"> {
  const schemaName = "RuntimeSessionEventV1";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  const common = [
    "kind",
    "schemaVersion",
    "protocolVersion",
    "sequence",
    "runtimeSessionId",
    "worldSessionId",
    "type",
  ];
  if (
    record.kind !== "worldkit-runtime-session-event" ||
    record.schemaVersion !== 1 ||
    record.protocolVersion !== WORLDKIT_RUNTIME_SESSION_PROTOCOL_VERSION ||
    !isSafePositiveInteger(record.sequence) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !["ready", "completed", "failed"].includes(record.type as string)
  ) return invalid(schemaName);
  if (record.type === "ready") {
    if (!hasExactKeys(record, [
      ...common,
      "runtimeSessionUri",
      "worldPackageRef",
      "worldPackageRootHash",
      "worldBuildIdentityHash",
      "fixedInputControllerEntityId",
      "supportedRequestTypes",
    ]) ||
      record.runtimeSessionUri !==
        `worldkit://runtime-session/${encodeURIComponent(record.runtimeSessionId)}` ||
      !isSha256(record.worldPackageRootHash) ||
      !isSha256(record.worldBuildIdentityHash) ||
      !isNonEmptyString(record.fixedInputControllerEntityId)
    ) return invalid(schemaName);
    const refMatch = typeof record.worldPackageRef === "string"
      ? WORLD_PACKAGE_REF_PATTERN.exec(record.worldPackageRef)
      : null;
    if (
      isNil(refMatch) ||
      `sha256:${refMatch[1]}` !== record.worldPackageRootHash
    ) return invalid(schemaName);
    const supported = snapshotDataArray(record.supportedRequestTypes);
    if (
      isNil(supported) ||
      supported.length !== WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1.length ||
      supported.some((type, index) =>
        type !== WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1[index]
      )
    ) return invalid(schemaName);
  } else if (record.type === "completed") {
    if (!hasExactKeys(record, common)) return invalid(schemaName);
  } else {
    if (!hasExactKeys(record, [...common, "diagnostic"]) ||
      isNil(parseRuntimeSessionDiagnosticV1(record.diagnostic))
    ) return invalid(schemaName);
  }
  return canonicalClone(record, schemaName) as unknown as Omit<
    RuntimeSessionEventV1,
    "id"
  >;
}

export function deriveRuntimeSessionEventIdV1(value: unknown): string {
  const body = parseRuntimeSessionEventBodyV1(value);
  const hash = sha256CanonicalJson(body);
  return `runtime-session-event:${hash.slice("sha256:".length)}`;
}

export function parseRuntimeSessionEventV1(
  value: unknown,
): RuntimeSessionEventV1 {
  const schemaName = "RuntimeSessionEventV1";
  const record = snapshotDataRecord(value) ?? invalid(schemaName);
  if (!isNonEmptyString(record.id)) return invalid(schemaName);
  const body = parseRuntimeSessionEventBodyV1(Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== "id"),
  ));
  if (record.id !== deriveRuntimeSessionEventIdV1(body)) {
    return invalid(schemaName);
  }
  return canonicalClone({ id: record.id, ...body }, schemaName) as
    RuntimeSessionEventV1;
}

export function canonicalRuntimeSessionEventV1(value: unknown): string {
  return stringifyCanonicalJson(parseRuntimeSessionEventV1(value));
}
