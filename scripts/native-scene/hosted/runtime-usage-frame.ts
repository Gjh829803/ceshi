import type { NativeExecutionUsageV1 } from
  "@whitebox-world/runtime-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

const CHALLENGE_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "requestHash",
  "runtimeSessionId",
  "sessionNonce",
  "challengeNonce",
] as const);
const FRAME_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "requestHash",
  "runtimeSessionId",
  "sessionNonce",
  "challengeNonce",
  "runtime",
  "observationProofHash",
] as const);
const RUNTIME_FIELDS = Object.freeze([
  "actualSceneNodeCount",
  "actualMaterialCount",
  "actualShaderCount",
  "actualPhysicsBodyCount",
] as const);

export interface HostedNativeRuntimeUsageChallengeV1 {
  readonly kind: "worldkit-hosted-native-runtime-usage-challenge";
  readonly schemaVersion: 1;
  readonly requestHash: `sha256:${string}`;
  readonly runtimeSessionId: string;
  readonly sessionNonce: string;
  readonly challengeNonce: string;
}

export interface HostedNativeRuntimeUsageFrameV1 {
  readonly kind: "worldkit-hosted-native-runtime-usage";
  readonly schemaVersion: 1;
  readonly requestHash: `sha256:${string}`;
  readonly runtimeSessionId: string;
  readonly sessionNonce: string;
  readonly challengeNonce: string;
  readonly runtime: NativeExecutionUsageV1["runtime"];
  readonly observationProofHash: `sha256:${string}`;
}

export interface CreateHostedNativeRuntimeUsageFrameInputV1 {
  readonly challenge: HostedNativeRuntimeUsageChallengeV1;
  readonly runtime: NativeExecutionUsageV1["runtime"];
}

function invalid(): never {
  throw new TypeError("HOSTED_NATIVE_RUNTIME_USAGE_FRAME_INVALID");
}

function invalidProof(): never {
  throw new TypeError("HOSTED_NATIVE_RUNTIME_USAGE_PROOF_INVALID");
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

function sha256(input: unknown): `sha256:${string}` {
  const value = nonEmptyString(input);
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) return invalid();
  return value as `sha256:${string}`;
}

export function parseHostedNativeRuntimeUsageChallengeV1(
  input: unknown,
): HostedNativeRuntimeUsageChallengeV1 {
  const challenge = exactRecord(input, CHALLENGE_FIELDS);
  if (
    challenge.kind !== "worldkit-hosted-native-runtime-usage-challenge" ||
    challenge.schemaVersion !== 1
  ) return invalid();
  return Object.freeze({
    kind: "worldkit-hosted-native-runtime-usage-challenge",
    schemaVersion: 1,
    requestHash: sha256(challenge.requestHash),
    runtimeSessionId: nonEmptyString(challenge.runtimeSessionId),
    sessionNonce: nonEmptyString(challenge.sessionNonce),
    challengeNonce: nonEmptyString(challenge.challengeNonce),
  });
}

export function createHostedNativeRuntimeUsageChallengeV1(
  input: Omit<HostedNativeRuntimeUsageChallengeV1, "kind" | "schemaVersion">,
): HostedNativeRuntimeUsageChallengeV1 {
  return parseHostedNativeRuntimeUsageChallengeV1({
    kind: "worldkit-hosted-native-runtime-usage-challenge",
    schemaVersion: 1,
    ...input,
  });
}

function observationProofHash(
  challenge: HostedNativeRuntimeUsageChallengeV1,
  runtime: NativeExecutionUsageV1["runtime"],
): `sha256:${string}` {
  return sha256CanonicalJson({
    kind: "worldkit-hosted-native-runtime-usage-proof",
    schemaVersion: 1,
    requestHash: challenge.requestHash,
    runtimeSessionId: challenge.runtimeSessionId,
    sessionNonce: challenge.sessionNonce,
    challengeNonce: challenge.challengeNonce,
    runtime,
  });
}

export function parseHostedNativeRuntimeUsageFrameV1(
  input: unknown,
): HostedNativeRuntimeUsageFrameV1 {
  const frame = exactRecord(input, FRAME_FIELDS);
  const runtime = exactRecord(frame.runtime, RUNTIME_FIELDS);
  if (
    frame.kind !== "worldkit-hosted-native-runtime-usage" ||
    frame.schemaVersion !== 1
  ) return invalid();
  return Object.freeze({
    kind: "worldkit-hosted-native-runtime-usage",
    schemaVersion: 1,
    requestHash: sha256(frame.requestHash),
    runtimeSessionId: nonEmptyString(frame.runtimeSessionId),
    sessionNonce: nonEmptyString(frame.sessionNonce),
    challengeNonce: nonEmptyString(frame.challengeNonce),
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
    observationProofHash: sha256(frame.observationProofHash),
  });
}

export function createHostedNativeRuntimeUsageFrameV1(
  input: CreateHostedNativeRuntimeUsageFrameInputV1,
): HostedNativeRuntimeUsageFrameV1 {
  const challenge = parseHostedNativeRuntimeUsageChallengeV1(input.challenge);
  const runtime = Object.freeze({
    actualSceneNodeCount: nonNegativeSafeInteger(
      input.runtime.actualSceneNodeCount,
    ),
    actualMaterialCount: nonNegativeSafeInteger(
      input.runtime.actualMaterialCount,
    ),
    actualShaderCount: nonNegativeSafeInteger(
      input.runtime.actualShaderCount,
    ),
    actualPhysicsBodyCount: nonNegativeSafeInteger(
      input.runtime.actualPhysicsBodyCount,
    ),
  });
  return parseHostedNativeRuntimeUsageFrameV1({
    kind: "worldkit-hosted-native-runtime-usage",
    schemaVersion: 1,
    requestHash: challenge.requestHash,
    runtimeSessionId: challenge.runtimeSessionId,
    sessionNonce: challenge.sessionNonce,
    challengeNonce: challenge.challengeNonce,
    runtime,
    observationProofHash: observationProofHash(challenge, runtime),
  });
}

export function verifyHostedNativeRuntimeUsageFrameV1(
  input: Readonly<{
    challenge: HostedNativeRuntimeUsageChallengeV1;
    frame: HostedNativeRuntimeUsageFrameV1;
  }>,
): NativeExecutionUsageV1["runtime"] {
  const challenge = parseHostedNativeRuntimeUsageChallengeV1(input.challenge);
  const frame = parseHostedNativeRuntimeUsageFrameV1(input.frame);
  if (
    frame.requestHash !== challenge.requestHash ||
    frame.runtimeSessionId !== challenge.runtimeSessionId ||
    frame.sessionNonce !== challenge.sessionNonce ||
    frame.challengeNonce !== challenge.challengeNonce ||
    frame.observationProofHash !== observationProofHash(challenge, frame.runtime)
  ) return invalidProof();
  return frame.runtime;
}
