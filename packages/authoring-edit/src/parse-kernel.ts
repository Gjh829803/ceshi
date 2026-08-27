import { isNil } from "lodash-es";

export type Sha256HashV1 = `sha256:${string}`;

export const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
export const ZERO_HASH = `sha256:${"0".repeat(64)}` as const;
export const ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;
export const OVERRIDE_PATH_PATTERN =
  /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/;

export function invalid(schemaName: string): never {
  throw new RangeError(`Value must match the closed ${schemaName} schema.`);
}

export function snapshotDataRecord(
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

export function snapshotDataArray(value: unknown): readonly unknown[] | undefined {
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

export function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length &&
    ownKeys.every((key) => typeof key === "string" && keys.includes(key));
}

export function hasRequiredAndOptionalKeys(
  value: Readonly<Record<string, unknown>>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
): boolean {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) return false;
  const names = ownKeys as string[];
  if (!requiredKeys.every((key) => names.includes(key))) return false;
  return names.every(
    (key) => requiredKeys.includes(key) || optionalKeys.includes(key),
  );
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

export function isCanonicalId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function isSha256(value: unknown): value is Sha256HashV1 {
  return typeof value === "string" &&
    SHA256_PATTERN.test(value) &&
    value !== ZERO_HASH;
}

export function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0);
}

export function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    !Object.is(value, -0);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    !Object.is(value, -0);
}

export function isOverridePath(value: unknown): value is string {
  return typeof value === "string" && OVERRIDE_PATH_PATTERN.test(value);
}

export function deepFreeze<const T>(value: T): Readonly<T> {
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

export function parseStringArray(
  input: unknown,
  options: { unique?: boolean } = {},
): readonly string[] | undefined {
  const values = snapshotDataArray(input);
  if (isNil(values) || !values.every(isNonEmptyString)) return undefined;
  const copied = [...values] as string[];
  if (options.unique === true && new Set(copied).size !== copied.length) {
    return undefined;
  }
  return copied;
}

export function parseIdArray(
  input: unknown,
  options: { unique?: boolean } = {},
): readonly string[] | undefined {
  const values = snapshotDataArray(input);
  if (isNil(values) || !values.every(isCanonicalId)) return undefined;
  const copied = [...values] as string[];
  if (options.unique === true && new Set(copied).size !== copied.length) {
    return undefined;
  }
  return copied;
}

export function parseSha256Array(
  input: unknown,
  options: { unique?: boolean } = {},
): readonly Sha256HashV1[] | undefined {
  const values = snapshotDataArray(input);
  if (isNil(values) || !values.every(isSha256)) return undefined;
  const copied = values as Sha256HashV1[];
  if (options.unique === true && new Set(copied).size !== copied.length) {
    return undefined;
  }
  return [...copied];
}

export function closedMember<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): T | undefined {
  if (typeof value !== "string" || !allowed.has(value as T)) return undefined;
  return value as T;
}
