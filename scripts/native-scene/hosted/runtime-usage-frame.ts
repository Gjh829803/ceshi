import type { NativeExecutionUsageV1 } from
  "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

const FRAME_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "requestHash",
  "runtimeSessionId",
  "sessionNonce",
  "runtime",
] as const);
const RUNTIME_FIELDS = Object.freeze([
  "actualSceneNodeCount",
  "actualMaterialCount",
  "actualShaderCount",
  "actualPhysicsBodyCount",
] as const);

export interface HostedNativeRuntimeUsageFrameV1 {
  readonly kind: "worldkit-hosted-native-runtime-usage";
  readonly schemaVersion: 1;
  readonly requestHash: `sha256:${string}`;
  readonly runtimeSessionId: string;
  readonly sessionNonce: string;
  readonly runtime: NativeExecutionUsageV1["runtime"];
}

export type CreateHostedNativeRuntimeUsageFrameInputV1 = Omit<
  HostedNativeRuntimeUsageFrameV1,
  "kind" | "schemaVersion"
>;

function invalid(): never {
  throw new TypeError("HOSTED_NATIVE_RUNTIME_USAGE_FRAME_INVALID");
}

function exactRecord(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalid();
  }
  const record = input as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== "string" || !fields.includes(key))
  ) return invalid();
  return record;
}

function nonEmptyString(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) return invalid();
  return input;
}

function nonNegativeSafeInteger(input: unknown): number {
  if (!Number.isSafeInteger(input) || Number(input) < 0) return invalid();
  return Number(input);
}

export function parseHostedNativeRuntimeUsageFrameV1(
  input: unknown,
): HostedNativeRuntimeUsageFrameV1 {
  const frame = exactRecord(input, FRAME_FIELDS);
  const runtime = exactRecord(frame.runtime, RUNTIME_FIELDS);
  const requestHash = nonEmptyString(frame.requestHash);
  if (!/^sha256:[0-9a-f]{64}$/.test(requestHash)) return invalid();
  if (
    frame.kind !== "worldkit-hosted-native-runtime-usage" ||
    frame.schemaVersion !== 1
  ) return invalid();
  return Object.freeze({
    kind: "worldkit-hosted-native-runtime-usage",
    schemaVersion: 1,
    requestHash: requestHash as `sha256:${string}`,
    runtimeSessionId: nonEmptyString(frame.runtimeSessionId),
    sessionNonce: nonEmptyString(frame.sessionNonce),
    runtime: Object.freeze({
      actualSceneNodeCount: nonNegativeSafeInteger(
        runtime.actualSceneNodeCount,
      ),
      actualMaterialCount: nonNegativeSafeInteger(runtime.actualMaterialCount),
      actualShaderCount: nonNegativeSafeInteger(runtime.actualShaderCount),
      actualPhysicsBodyCount: nonNegativeSafeInteger(
        runtime.actualPhysicsBodyCount,
      ),
    }),
  });
}

export function createHostedNativeRuntimeUsageFrameV1(
  input: CreateHostedNativeRuntimeUsageFrameInputV1,
): HostedNativeRuntimeUsageFrameV1 {
  return parseHostedNativeRuntimeUsageFrameV1({
    kind: "worldkit-hosted-native-runtime-usage",
    schemaVersion: 1,
    ...input,
  });
}
