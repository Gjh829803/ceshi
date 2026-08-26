import type { CameraViewPreferenceV1 } from "@whitebox-world/camera";
import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";

export interface SetCameraViewPreferenceCommandV1 {
  readonly type: "view.camera-preference.set";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly cameraEntityId: string;
  readonly cameraViewPreference: CameraViewPreferenceV1;
}

export interface ResetCameraViewPreferenceCommandV1 {
  readonly type: "view.camera-preference.reset";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly cameraEntityId: string;
}

export type CameraViewCommandV1 =
  | SetCameraViewPreferenceCommandV1
  | ResetCameraViewPreferenceCommandV1;

export type CameraSelectionChangedReasonV1 =
  | "context-changed"
  | "preference-changed"
  | "target-rebound"
  | "context-fallback-entered"
  | "context-fallback-recovered"
  | "preference-reset";

export interface CameraSelectionChangedEventV1 {
  readonly type: "camera.selection.changed";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly cameraEntityId: string;
  readonly sequence: number;
  readonly simulationTick: number;
  readonly previousCameraRigProfileRef: string;
  readonly activeCameraRigProfileRef: string;
  readonly activeCameraModifierRefs: readonly string[];
  readonly targetEntityId: string;
  readonly matchedCameraContextRuleIds: readonly string[];
  readonly fallbackActive: boolean;
  readonly reason: CameraSelectionChangedReasonV1;
}

export interface CameraTargetUnboundEventV1 {
  readonly type: "camera.target.unbound";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly cameraEntityId: string;
  readonly sequence: number;
  readonly simulationTick: number;
  readonly previousTargetEntityId: string;
  readonly reason: "control-released" | "target-disposed" | "world-replaced";
}

export type CameraViewEventV1 =
  | CameraSelectionChangedEventV1
  | CameraTargetUnboundEventV1;

const SELECTION_REASONS = new Set<CameraSelectionChangedReasonV1>([
  "context-changed",
  "preference-changed",
  "target-rebound",
  "context-fallback-entered",
  "context-fallback-recovered",
  "preference-reset",
]);

const UNBOUND_REASONS = new Set<CameraTargetUnboundEventV1["reason"]>([
  "control-released",
  "target-disposed",
  "world-replaced",
]);

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
    if (
      Reflect.ownKeys(value).some((key) => typeof key === "symbol") ||
      Object.getOwnPropertyNames(value).length !== value.length + 1
    ) return undefined;
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
    return snapshot;
  } catch {
    return undefined;
  }
}

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actualKeys = Reflect.ownKeys(record);
  return actualKeys.length === keys.length && actualKeys.every(
    (key) => typeof key === "string" && keys.includes(key),
  );
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

function parseCameraViewPreference(
  input: unknown,
): CameraViewPreferenceV1 | undefined {
  const record = snapshotDataRecord(input);
  if (record === undefined) return undefined;
  if (
    (record.mode === "auto" || record.mode === "first-person") &&
    hasExactKeys(record, ["mode"])
  ) return { mode: record.mode };
  if (
    record.mode === "camera-rig-profile" &&
    hasExactKeys(record, ["mode", "cameraRigProfileRef"]) &&
    isNonEmptyString(record.cameraRigProfileRef)
  ) {
    return {
      mode: "camera-rig-profile",
      cameraRigProfileRef: record.cameraRigProfileRef,
    };
  }
  return undefined;
}

function parseCommandBase(record: Readonly<Record<string, unknown>>): Readonly<{
  schemaVersion: 1;
  id: string;
  runtimeSessionId: string;
  worldSessionId: string;
  cameraEntityId: string;
}> | undefined {
  if (
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !isNonEmptyString(record.cameraEntityId)
  ) return undefined;
  return {
    schemaVersion: 1,
    id: record.id,
    runtimeSessionId: record.runtimeSessionId,
    worldSessionId: record.worldSessionId,
    cameraEntityId: record.cameraEntityId,
  };
}

export function parseCameraViewCommandV1(input: unknown): CameraViewCommandV1 {
  const schemaName = "CameraViewCommandV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const base = parseCommandBase(record) ?? invalid(schemaName);
  const baseKeys = [
    "type",
    "schemaVersion",
    "id",
    "runtimeSessionId",
    "worldSessionId",
    "cameraEntityId",
  ] as const;
  if (
    record.type === "view.camera-preference.reset" &&
    hasExactKeys(record, baseKeys)
  ) {
    return deepFreeze({
      ...base,
      type: "view.camera-preference.reset",
    });
  }
  if (
    record.type === "view.camera-preference.set" &&
    hasExactKeys(record, [...baseKeys, "cameraViewPreference"])
  ) {
    const cameraViewPreference = parseCameraViewPreference(
      record.cameraViewPreference,
    ) ?? invalid(schemaName);
    return deepFreeze({
      ...base,
      type: "view.camera-preference.set",
      cameraViewPreference,
    });
  }
  return invalid(schemaName);
}

export function canonicalizeCameraViewCommandV1(input: unknown): string {
  return stringifyCanonicalJson(parseCameraViewCommandV1(input));
}

export function cameraViewCommandCanonicalBytesV1(input: unknown): Uint8Array {
  return canonicalJsonBytes(parseCameraViewCommandV1(input));
}

export function deriveCameraViewCommandHashV1(input: unknown): `sha256:${string}` {
  return sha256CanonicalJson(
    parseCameraViewCommandV1(input),
  ) as `sha256:${string}`;
}

export function deriveCameraViewEventIdV1(
  worldSessionId: string,
  sequence: number,
): string {
  if (!isNonEmptyString(worldSessionId) || !isSafeNonNegativeInteger(sequence)) {
    return invalid("CameraViewEventV1");
  }
  return `camera-view-event:${worldSessionId}:${sequence}`;
}

function parseEventBase(record: Readonly<Record<string, unknown>>): Readonly<{
  schemaVersion: 1;
  id: string;
  runtimeSessionId: string;
  worldSessionId: string;
  cameraEntityId: string;
  sequence: number;
  simulationTick: number;
}> | undefined {
  if (
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !isNonEmptyString(record.cameraEntityId) ||
    !isSafeNonNegativeInteger(record.sequence) ||
    !isSafeNonNegativeInteger(record.simulationTick) ||
    record.id !== deriveCameraViewEventIdV1(
      record.worldSessionId,
      record.sequence,
    )
  ) return undefined;
  return {
    schemaVersion: 1,
    id: record.id,
    runtimeSessionId: record.runtimeSessionId,
    worldSessionId: record.worldSessionId,
    cameraEntityId: record.cameraEntityId,
    sequence: record.sequence,
    simulationTick: record.simulationTick,
  };
}

function parseStringList(input: unknown): readonly string[] | undefined {
  const snapshot = snapshotDataArray(input);
  if (
    snapshot === undefined ||
    !snapshot.every(isNonEmptyString) ||
    new Set(snapshot).size !== snapshot.length
  ) return undefined;
  return snapshot;
}

export function parseCameraViewEventV1(input: unknown): CameraViewEventV1 {
  const schemaName = "CameraViewEventV1";
  const record = snapshotDataRecord(input) ?? invalid(schemaName);
  const base = parseEventBase(record) ?? invalid(schemaName);
  const baseKeys = [
    "type",
    "schemaVersion",
    "id",
    "runtimeSessionId",
    "worldSessionId",
    "cameraEntityId",
    "sequence",
    "simulationTick",
  ] as const;
  if (
    record.type === "camera.target.unbound" &&
    hasExactKeys(record, [
      ...baseKeys,
      "previousTargetEntityId",
      "reason",
    ]) &&
    isNonEmptyString(record.previousTargetEntityId) &&
    typeof record.reason === "string" &&
    UNBOUND_REASONS.has(record.reason as CameraTargetUnboundEventV1["reason"])
  ) {
    return deepFreeze({
      ...base,
      type: "camera.target.unbound",
      previousTargetEntityId: record.previousTargetEntityId,
      reason: record.reason as CameraTargetUnboundEventV1["reason"],
    });
  }
  if (
    record.type === "camera.selection.changed" &&
    hasExactKeys(record, [
      ...baseKeys,
      "previousCameraRigProfileRef",
      "activeCameraRigProfileRef",
      "activeCameraModifierRefs",
      "targetEntityId",
      "matchedCameraContextRuleIds",
      "fallbackActive",
      "reason",
    ]) &&
    isNonEmptyString(record.previousCameraRigProfileRef) &&
    isNonEmptyString(record.activeCameraRigProfileRef) &&
    isNonEmptyString(record.targetEntityId) &&
    typeof record.fallbackActive === "boolean" &&
    typeof record.reason === "string" &&
    SELECTION_REASONS.has(record.reason as CameraSelectionChangedReasonV1)
  ) {
    const activeCameraModifierRefs = parseStringList(
      record.activeCameraModifierRefs,
    ) ?? invalid(schemaName);
    const matchedCameraContextRuleIds = parseStringList(
      record.matchedCameraContextRuleIds,
    ) ?? invalid(schemaName);
    return deepFreeze({
      ...base,
      type: "camera.selection.changed",
      previousCameraRigProfileRef: record.previousCameraRigProfileRef,
      activeCameraRigProfileRef: record.activeCameraRigProfileRef,
      activeCameraModifierRefs,
      targetEntityId: record.targetEntityId,
      matchedCameraContextRuleIds,
      fallbackActive: record.fallbackActive,
      reason: record.reason as CameraSelectionChangedReasonV1,
    });
  }
  return invalid(schemaName);
}

export function canonicalizeCameraViewEventV1(input: unknown): string {
  return stringifyCanonicalJson(parseCameraViewEventV1(input));
}

export function cameraViewEventCanonicalBytesV1(input: unknown): Uint8Array {
  return canonicalJsonBytes(parseCameraViewEventV1(input));
}
