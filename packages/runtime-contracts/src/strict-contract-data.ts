import type { Sha256HashV1 } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

// Internal defensive snapshot helpers shared by exact persisted contracts.

const SHA256_PATTERN_V1 = /^sha256:[a-f0-9]{64}$/;
const RESOURCE_REF_PATTERN_V1 =
  /^worldkit:\/\/[a-z0-9][a-z0-9.-]*\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?@[1-9][0-9]*$/;

export function invalidContractDataV1(code: string): never {
  throw new TypeError(code);
}

export function snapshotContractDataV1(
  input: unknown,
  code: string,
): unknown {
  if (isNil(input) || typeof input === "boolean" || typeof input === "string") {
    return input;
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input) || Object.is(input, -0)) {
      return invalidContractDataV1(code);
    }
    return input;
  }
  if (Array.isArray(input)) {
    try {
      if (
        Reflect.getPrototypeOf(input) !== Array.prototype ||
        Reflect.ownKeys(input).some((key) => typeof key === "symbol") ||
        Object.getOwnPropertyNames(input).length !== input.length + 1
      ) return invalidContractDataV1(code);
      const snapshot: unknown[] = [];
      for (let index = 0; index < input.length; index += 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
        if (
          isNil(descriptor) ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) return invalidContractDataV1(code);
        snapshot.push(snapshotContractDataV1(descriptor.value, code));
      }
      return snapshot;
    } catch {
      return invalidContractDataV1(code);
    }
  }
  if (typeof input !== "object" || isNil(input)) {
    return invalidContractDataV1(code);
  }
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) {
      return invalidContractDataV1(code);
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return invalidContractDataV1(code);
      snapshot[key] = snapshotContractDataV1(descriptor.value, code);
    }
    return snapshot;
  } catch {
    return invalidContractDataV1(code);
  }
}

export function exactContractRecordV1(
  input: unknown,
  fields: readonly string[],
  code: string,
): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalidContractDataV1(code);
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(record, field)) ||
    keys.some((field) => !fields.includes(field))
  ) return invalidContractDataV1(code);
  return record;
}

export function contractIdentityV1(
  input: unknown,
  code: string,
): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.normalize("NFC") !== input
  ) return invalidContractDataV1(code);
  return input;
}

export function contractHashV1(
  input: unknown,
  code: string,
): Sha256HashV1 {
  const value = contractIdentityV1(input, code);
  if (!SHA256_PATTERN_V1.test(value) || value === `sha256:${"0".repeat(64)}`) {
    return invalidContractDataV1(code);
  }
  return value as Sha256HashV1;
}

export function contractResourceRefV1(
  input: unknown,
  code: string,
  expectedKind?: string,
): string {
  const value = contractIdentityV1(input, code);
  if (
    !RESOURCE_REF_PATTERN_V1.test(value) ||
    (!isNil(expectedKind) && !value.startsWith(`worldkit://${expectedKind}/`))
  ) return invalidContractDataV1(code);
  return value;
}

export function contractSafePathV1(
  input: unknown,
  code: string,
): string {
  const value = contractIdentityV1(input, code);
  if (
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("//") ||
    value.split("/").some((segment) =>
      segment === "." ||
      segment === ".." ||
      !/^[A-Za-z0-9._-]+$/.test(segment)
    )
  ) return invalidContractDataV1(code);
  return value;
}

export function contractSafeIntegerV1(
  input: unknown,
  code: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof input !== "number" ||
    !Number.isSafeInteger(input) ||
    Object.is(input, -0) ||
    input < minimum ||
    input > maximum
  ) return invalidContractDataV1(code);
  return input;
}
