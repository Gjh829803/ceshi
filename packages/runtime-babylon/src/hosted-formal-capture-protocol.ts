import {
  hashFormalWorldCaptureRequestV1,
  parseFormalWorldCaptureRequestV1,
  type FormalWorldCaptureRequestV1,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

import type {
  FormalHostedWorldCapturePayloadV1,
} from "./formal-world-capture-provider.js";

export interface HostedFormalCaptureProtocolBudgetV1 {
  readonly maximumInboundMessageBytes: number;
  readonly maximumOutboundMessageBytes: number;
  readonly maximumPngBytesPerArtifact: number;
}

export const HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1 = Object.freeze({
  maximumInboundMessageBytes: 16_000_000,
  maximumOutboundMessageBytes: 320_000_000,
  maximumPngBytesPerArtifact: 64_000_000,
});

export const HOSTED_FORMAL_CAPTURE_BOOTSTRAP_FIELDS_V1 = Object.freeze([
  "kind",
  "schemaVersion",
  "runtimeSessionId",
  "sessionNonce",
  "formalRequestId",
  "formalRequestHash",
  "messageSequence",
] as const);

export const HOSTED_FORMAL_CAPTURE_RESULT_FIELDS_V1 = Object.freeze([
  ...HOSTED_FORMAL_CAPTURE_BOOTSTRAP_FIELDS_V1,
  "payload",
] as const);

export const HOSTED_FORMAL_CAPTURE_FAILURE_FIELDS_V1 = Object.freeze([
  ...HOSTED_FORMAL_CAPTURE_BOOTSTRAP_FIELDS_V1,
  "diagnosticCode",
] as const);

const PAYLOAD_FIELDS = Object.freeze([
  "openingPng",
  "worldSidePng",
  "worldTopDownPng",
  "colliderOverlayPng",
  "openingObservation",
  "spawnSupportObservation",
  "colliderOverlayObservation",
  "scriptedTraversal",
  "receiptWithoutCleanup",
] as const);

const PNG_FIELDS = Object.freeze([
  "openingPng",
  "worldSidePng",
  "worldTopDownPng",
  "colliderOverlayPng",
] as const);

const textEncoder = new TextEncoder();

export function hostedFormalCaptureErrorV1(reason: string): Error {
  return new Error(`WORLDKIT_HOSTED_FORMAL_CAPTURE_${reason}`);
}

export function exactPlainRecordV1(
  value: unknown,
  fields: readonly string[],
  reason: string,
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    isNil(value) ||
    Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  ) throw hostedFormalCaptureErrorV1(reason);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== "string" || !fields.includes(key)) ||
    fields.some((field) => !Object.hasOwn(value, field))
  ) throw hostedFormalCaptureErrorV1(reason);
  return value as Readonly<Record<string, unknown>>;
}

function wireByteLength(
  value: unknown,
  seen: Set<object>,
): number {
  if (value instanceof Uint8Array) return value.byteLength;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) return textEncoder.encode(JSON.stringify(value)).byteLength;
  if (typeof value !== "object" || isNil(value) || seen.has(value)) {
    throw hostedFormalCaptureErrorV1("WIRE_VALUE_INVALID");
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) {
    throw hostedFormalCaptureErrorV1("WIRE_VALUE_INVALID");
  }
  seen.add(value);
  let bytes = 2;
  if (Array.isArray(value)) {
    for (const item of value) bytes += wireByteLength(item, seen) + 1;
  } else {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        throw hostedFormalCaptureErrorV1("WIRE_VALUE_INVALID");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        isNil(descriptor) ||
        descriptor.enumerable !== true ||
        !Object.hasOwn(descriptor, "value")
      ) throw hostedFormalCaptureErrorV1("WIRE_VALUE_INVALID");
      bytes += textEncoder.encode(JSON.stringify(key)).byteLength + 1;
      bytes += wireByteLength(descriptor.value, seen) + 1;
    }
  }
  seen.delete(value);
  return bytes;
}

export function hostedFormalCaptureWireByteLengthV1(value: unknown): number {
  return wireByteLength(value, new Set());
}

export function assertHostedFormalCaptureWireBudgetV1(
  value: unknown,
  maximumBytes: number,
  reason: string,
): void {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes <= 0 ||
    hostedFormalCaptureWireByteLengthV1(value) > maximumBytes
  ) throw hostedFormalCaptureErrorV1(reason);
}

export function parseHostedFormalCaptureRequestV1(input: Readonly<{
  value: unknown;
  formalRequestId: string;
  formalRequestHash: `sha256:${string}`;
}>): FormalWorldCaptureRequestV1 {
  let request: FormalWorldCaptureRequestV1;
  try {
    request = parseFormalWorldCaptureRequestV1(input.value);
  } catch {
    throw hostedFormalCaptureErrorV1("REQUEST_INVALID");
  }
  if (
    request.id !== input.formalRequestId ||
    hashFormalWorldCaptureRequestV1(request) !== input.formalRequestHash
  ) throw hostedFormalCaptureErrorV1("REQUEST_IDENTITY_MISMATCH");
  return request;
}

function assertPayloadIdentity(
  value: unknown,
  runtimeSessionId: string,
  request: FormalWorldCaptureRequestV1,
  formalRequestHash: `sha256:${string}`,
): void {
  if (
    typeof value !== "object" ||
    isNil(value) ||
    Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  ) throw hostedFormalCaptureErrorV1("PAYLOAD_IDENTITY_INVALID");
  const record = value as Readonly<Record<string, unknown>>;
  if (
    record.runtimeSessionId !== runtimeSessionId ||
    record.formalRequestHash !== formalRequestHash
  ) throw hostedFormalCaptureErrorV1("PAYLOAD_IDENTITY_MISMATCH");
  parseHostedFormalCaptureRequestV1({
    value: record.formalRequest,
    formalRequestId: request.id,
    formalRequestHash,
  });
}

export function parseHostedFormalCapturePayloadV1(input: Readonly<{
  value: unknown;
  runtimeSessionId: string;
  request: FormalWorldCaptureRequestV1;
  formalRequestHash: `sha256:${string}`;
  protocolBudget: HostedFormalCaptureProtocolBudgetV1;
}>): FormalHostedWorldCapturePayloadV1 {
  const payload = exactPlainRecordV1(
    input.value,
    PAYLOAD_FIELDS,
    "PAYLOAD_SHAPE_INVALID",
  );
  for (const field of PNG_FIELDS) {
    const png = payload[field];
    if (!(png instanceof Uint8Array)) {
      throw hostedFormalCaptureErrorV1("PNG_BYTES_INVALID");
    }
    if (png.byteLength > input.protocolBudget.maximumPngBytesPerArtifact) {
      throw hostedFormalCaptureErrorV1("PNG_BUDGET_EXCEEDED");
    }
  }
  for (const field of [
    "openingObservation",
    "spawnSupportObservation",
    "colliderOverlayObservation",
    "scriptedTraversal",
    "receiptWithoutCleanup",
  ] as const) {
    assertPayloadIdentity(
      payload[field],
      input.runtimeSessionId,
      input.request,
      input.formalRequestHash,
    );
  }
  const receipt = payload.receiptWithoutCleanup as Readonly<
    Record<string, unknown>
  >;
  if (Object.hasOwn(receipt, "cleanupOutcome")) {
    throw hostedFormalCaptureErrorV1("BROWSER_CLEANUP_CLAIM_FORBIDDEN");
  }
  assertHostedFormalCaptureWireBudgetV1(
    payload,
    input.protocolBudget.maximumOutboundMessageBytes,
    "OUTBOUND_BUDGET_EXCEEDED",
  );
  return payload as unknown as FormalHostedWorldCapturePayloadV1;
}
