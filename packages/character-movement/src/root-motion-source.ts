import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  parseRootMotionResourceRefV1,
  type MovementVec3V1,
  type RootMotionResourceRefV1,
} from "./character-movement-contracts.js";

export interface RootMotionSampleV1 {
  readonly translationDeltaMetersXYZ: MovementVec3V1;
  readonly facingYawDeltaRadians: number;
}

export interface RootMotionSourceBodyV1 {
  readonly schemaVersion: 1;
  readonly resourceRef: RootMotionResourceRefV1;
  readonly fixedDeltaSeconds: number;
  readonly samples: readonly RootMotionSampleV1[];
}

export interface LockedRootMotionSourceV1 extends RootMotionSourceBodyV1 {
  readonly contentHash: `sha256:${string}`;
}

function failSample(detail: string): never {
  throw new RangeError(`3C_ROOT_MOTION_SAMPLE_INVALID: ${detail}`);
}

function failHash(): never {
  throw new RangeError("3C_ROOT_MOTION_HASH_MISMATCH: locked Root Motion hash does not match canonical samples.");
}

function dataRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null) failSample("expected a plain data object.");
  const prototype = Reflect.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) failSample("expected a plain data object.");
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      failSample("accessors, symbols and non-enumerable fields are forbidden.");
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) =>
    typeof key === "string" && keys.includes(key)
  );
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0);
}

function strictArray(input: unknown): readonly unknown[] {
  if (!Array.isArray(input) || Reflect.getPrototypeOf(input) !== Array.prototype) {
    return failSample("expected a canonical dense array.");
  }
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.some((key) => typeof key === "symbol") || ownKeys.length !== input.length + 1) {
    return failSample("expected a canonical dense array.");
  }
  const values: unknown[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      return failSample("expected a canonical dense array.");
    }
    values.push(descriptor.value);
  }
  return values;
}

function vec3(input: unknown): MovementVec3V1 {
  const values = strictArray(input);
  if (values.length !== 3 || !values.every(finite)) failSample("translation must be a finite XYZ vector.");
  return Object.freeze([values[0], values[1], values[2]]) as MovementVec3V1;
}

function parseSample(input: unknown): RootMotionSampleV1 {
  const value = dataRecord(input);
  if (!exact(value, ["translationDeltaMetersXYZ", "facingYawDeltaRadians"]) ||
    !finite(value.facingYawDeltaRadians)) failSample("sample shape is invalid.");
  return Object.freeze({
    translationDeltaMetersXYZ: vec3(value.translationDeltaMetersXYZ),
    facingYawDeltaRadians: value.facingYawDeltaRadians,
  });
}

function parseBody(input: unknown): RootMotionSourceBodyV1 {
  const value = dataRecord(input);
  if (!exact(value, ["schemaVersion", "resourceRef", "fixedDeltaSeconds", "samples"]) ||
    value.schemaVersion !== 1 ||
    !finite(value.fixedDeltaSeconds) || value.fixedDeltaSeconds <= 0) {
    failSample("source header is invalid.");
  }
  let resourceRef: RootMotionResourceRefV1;
  try {
    resourceRef = parseRootMotionResourceRefV1(value.resourceRef);
  } catch {
    return failSample("source ResourceRef is invalid.");
  }
  const samples = strictArray(value.samples).map(parseSample);
  if (samples.length === 0) failSample("at least one fixed-Tick sample is required.");
  return Object.freeze({
    schemaVersion: 1,
    resourceRef,
    fixedDeltaSeconds: value.fixedDeltaSeconds,
    samples: Object.freeze(samples),
  });
}

function hashBody(body: RootMotionSourceBodyV1): `sha256:${string}` {
  return sha256CanonicalJson({
    schemaVersion: body.schemaVersion,
    resourceRef: body.resourceRef,
    fixedDeltaSeconds: body.fixedDeltaSeconds,
    samples: body.samples.map((sample) => ({
      translationDeltaMetersXYZ: [...sample.translationDeltaMetersXYZ],
      facingYawDeltaRadians: sample.facingYawDeltaRadians,
    })),
  }) as `sha256:${string}`;
}

export function hashRootMotionSourceV1(input: unknown): `sha256:${string}` {
  return hashBody(parseBody(input));
}

export function parseLockedRootMotionSourceV1(input: unknown): LockedRootMotionSourceV1 {
  const value = dataRecord(input);
  if (!exact(value, ["schemaVersion", "resourceRef", "contentHash", "fixedDeltaSeconds", "samples"])) {
    failSample("locked source shape is invalid.");
  }
  const body = parseBody({
    schemaVersion: value.schemaVersion,
    resourceRef: value.resourceRef,
    fixedDeltaSeconds: value.fixedDeltaSeconds,
    samples: value.samples,
  });
  if (typeof value.contentHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.contentHash) ||
    value.contentHash !== hashBody(body)) failHash();
  return Object.freeze({ ...body, contentHash: value.contentHash as `sha256:${string}` });
}

export function sampleLockedRootMotionSourceV1(
  input: LockedRootMotionSourceV1,
  expectedRef: RootMotionResourceRefV1,
  expectedHash: `sha256:${string}`,
  sampleIndex: number,
  fixedDeltaSeconds: number,
): RootMotionSampleV1 {
  const source = parseLockedRootMotionSourceV1(input);
  let parsedExpectedRef: RootMotionResourceRefV1;
  try {
    parsedExpectedRef = parseRootMotionResourceRefV1(expectedRef);
  } catch {
    throw new RangeError("3C_LAYERED_MOVE_SOURCE_UNRESOLVED: expected Root Motion ResourceRef is invalid.");
  }
  if (source.resourceRef !== parsedExpectedRef) {
    throw new RangeError("3C_LAYERED_MOVE_SOURCE_UNRESOLVED: locked Root Motion ResourceRef does not match.");
  }
  if (source.contentHash !== expectedHash) failHash();
  if (!Number.isSafeInteger(sampleIndex) || sampleIndex < 0 || sampleIndex >= source.samples.length ||
    !finite(fixedDeltaSeconds) || fixedDeltaSeconds !== source.fixedDeltaSeconds) {
    failSample("sample index or fixed Tick rate is invalid.");
  }
  return source.samples[sampleIndex]!;
}
