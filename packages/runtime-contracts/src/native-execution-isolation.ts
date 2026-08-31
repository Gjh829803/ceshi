import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { isEmpty, isNil } from "lodash-es";

import {
  parseRuntimeSessionEventV1,
  parseRuntimeSessionReceiptV1,
  parseRuntimeSessionRequestV1,
  type RuntimeSessionEventV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
} from "./runtime-session-protocol";
import {
  contractHashV1,
  contractIdentityV1,
  contractResourceRefV1,
  contractSafeIntegerV1,
  exactContractRecordV1,
  invalidContractDataV1,
  snapshotContractDataV1,
} from "./strict-contract-data";

export type NativeExecutionTrustModeV1 =
  | "trusted-local"
  | "hosted-isolated";

export interface NativeExecutionTrustProfileBodyV1 {
  readonly kind: "native-execution-trust-profile";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly resourceRef: string;
  readonly trustMode: NativeExecutionTrustModeV1;
  readonly requiredIsolationCapabilityIds: readonly string[];
}

export interface NativeExecutionTrustProfileV1
  extends NativeExecutionTrustProfileBodyV1 {
  readonly contentHash: Sha256HashV1;
}

export interface NativeEffectiveExecutionBudgetV1 {
  readonly scene: Readonly<{
    maximumVertices: number;
    maximumTriangles: number;
    maximumColliders: number;
  }>;
  readonly assets: Readonly<{
    maximumAssetCount: number;
    maximumAssetBytes: number;
    maximumTextureCount: number;
    maximumTextureBytes: number;
  }>;
  readonly runtime: Readonly<{
    maximumSceneNodeCount: number;
    maximumMaterialCount: number;
    maximumShaderCount: number;
    maximumPhysicsBodyCount: number;
  }>;
  readonly process: Readonly<{
    maximumWallTimeMilliseconds: number;
    maximumCpuTimeMilliseconds: number;
    maximumMemoryBytes: number;
    maximumProcessCount: number;
  }>;
  readonly protocol: Readonly<{
    maximumInboundMessageBytes: number;
    maximumOutboundMessageBytes: number;
    maximumReceiptBytes: number;
    maximumDiagnosticCount: number;
    maximumLogBytes: number;
  }>;
}

export type NativeIsolatedExecutionOperationV1 =
  | Readonly<{ mode: "check" }>
  | Readonly<{
      mode: "capture";
      captureRequestHash: Sha256HashV1;
    }>
  | Readonly<{ mode: "interactive-session" }>;

export interface NativeIsolatedExecutionRequestV1 {
  readonly kind: "native-isolated-execution-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly worldPackageRef: `package://world-package/sha256/${string}`;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly worldBuildIdentityHash: Sha256HashV1;
  readonly sceneModuleBundleHash: Sha256HashV1;
  readonly nativeSceneContributionHash: Sha256HashV1;
  readonly nativeExecutionTrustProfileRef: string;
  readonly nativeExecutionTrustProfileHash: Sha256HashV1;
  readonly runnerIdentityRef: string;
  readonly runnerImageDigest: Sha256HashV1;
  readonly sandboxPolicyHash: Sha256HashV1;
  readonly effectiveBudget: NativeEffectiveExecutionBudgetV1;
  readonly effectiveBudgetHash: Sha256HashV1;
  readonly requestedOperation: NativeIsolatedExecutionOperationV1;
  readonly sessionNonce: string;
}

export type NativeIsolationDiagnosticStageV1 =
  | "policy"
  | "provisioning"
  | "package-verification"
  | "source-admission"
  | "authority-audit"
  | "runtime-replay"
  | "surface-admission"
  | "runtime"
  | "protocol"
  | "cleanup";

export interface NativeIsolationDiagnosticV1 {
  readonly code: string;
  readonly message: string;
}

interface NativeIsolatedExecutionResultBaseV1 {
  readonly kind: "native-isolated-execution-result";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly runtimeSessionId: string;
}

export type NativeIsolationTerminationReasonV1 =
  | "host-cancelled"
  | "timeout"
  | "cpu-limit"
  | "memory-limit"
  | "process-limit"
  | "output-limit"
  | "protocol-violation"
  | "provider-lost";

export type NativeIsolatedExecutionResultV1 =
  | (NativeIsolatedExecutionResultBaseV1 & Readonly<{
      status: "ready";
      runtimeSessionUri: `worldkit://runtime-session/${string}`;
      initialSnapshotHash: Sha256HashV1;
    }>)
  | (NativeIsolatedExecutionResultBaseV1 & Readonly<{
      status: "completed";
      outputHashes: readonly Sha256HashV1[];
      finalSnapshotHash: Sha256HashV1;
    }>)
  | (NativeIsolatedExecutionResultBaseV1 & Readonly<{
      status: "rejected";
      stage: NativeIsolationDiagnosticStageV1;
      diagnostics: readonly NativeIsolationDiagnosticV1[];
    }>)
  | (NativeIsolatedExecutionResultBaseV1 & Readonly<{
      status: "terminated";
      reason: NativeIsolationTerminationReasonV1;
    }>)
  | (NativeIsolatedExecutionResultBaseV1 & Readonly<{
      status: "cleanup-failed";
      quarantineId: string;
    }>);

export type NativeIsolatedExecutionTerminalStatusV1 = Exclude<
  NativeIsolatedExecutionResultV1["status"],
  "ready"
>;

export interface NativeExecutionUsageV1 {
  readonly scene: Readonly<{
    actualVertices: number;
    actualTriangles: number;
    actualColliders: number;
  }>;
  readonly assets: Readonly<{
    actualAssetCount: number;
    actualAssetBytes: number;
    actualTextureCount: number;
    actualTextureBytes: number;
  }>;
  readonly runtime: Readonly<{
    actualSceneNodeCount: number;
    actualMaterialCount: number;
    actualShaderCount: number;
    actualPhysicsBodyCount: number;
  }>;
  readonly process: Readonly<{
    actualWallTimeMilliseconds: number;
    actualCpuTimeMilliseconds: number;
    peakMemoryBytes: number;
    peakProcessCount: number;
  }>;
  readonly protocol: Readonly<{
    actualInboundMessageBytes: number;
    actualOutboundMessageBytes: number;
    actualReceiptBytes: number;
    actualDiagnosticCount: number;
    actualLogBytes: number;
  }>;
}

export type NativeIsolationCleanupV1 =
  | Readonly<{ status: "complete" }>
  | Readonly<{
      status: "quarantined";
      quarantineId: string;
    }>;

export interface NativeIsolatedExecutionReceiptV1 {
  readonly kind: "native-isolated-execution-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly requestId: string;
  readonly requestHash: Sha256HashV1;
  readonly runtimeSessionId: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly nativeExecutionTrustProfileRef: string;
  readonly nativeExecutionTrustProfileHash: Sha256HashV1;
  readonly runnerIdentityRef: string;
  readonly runnerImageDigest: Sha256HashV1;
  readonly sandboxPolicyHash: Sha256HashV1;
  readonly effectiveBudgetHash: Sha256HashV1;
  readonly usage: NativeExecutionUsageV1;
  readonly requestedOperation: NativeIsolatedExecutionOperationV1;
  readonly outcome: NativeIsolatedExecutionTerminalStatusV1;
  readonly resultHash: Sha256HashV1;
  readonly durationMilliseconds: number;
  readonly cleanup: NativeIsolationCleanupV1;
  readonly isolationAttestationRef: string;
  readonly isolationAttestationHash: Sha256HashV1;
}

export interface NativeIsolationTransportEnvelopeV1 {
  readonly kind: "native-isolation-transport-envelope";
  readonly schemaVersion: 1;
  readonly runtimeSessionId: string;
  readonly sessionNonce: string;
  readonly messageSequence: number;
  readonly payload:
    | RuntimeSessionRequestV1
    | RuntimeSessionReceiptV1
    | RuntimeSessionEventV1;
}

const TRUST_PROFILE_BODY_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "id",
  "resourceRef",
  "trustMode",
  "requiredIsolationCapabilityIds",
] as const);

const TRUST_PROFILE_FIELDS = Object.freeze([
  ...TRUST_PROFILE_BODY_FIELDS,
  "contentHash",
] as const);

const REQUEST_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "id",
  "runtimeSessionId",
  "worldPackageRef",
  "worldPackageRootHash",
  "worldBuildIdentityHash",
  "sceneModuleBundleHash",
  "nativeSceneContributionHash",
  "nativeExecutionTrustProfileRef",
  "nativeExecutionTrustProfileHash",
  "runnerIdentityRef",
  "runnerImageDigest",
  "sandboxPolicyHash",
  "effectiveBudget",
  "effectiveBudgetHash",
  "requestedOperation",
  "sessionNonce",
] as const);

const RESULT_BASE_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "id",
  "requestId",
  "runtimeSessionId",
] as const);

const RECEIPT_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "id",
  "requestId",
  "requestHash",
  "runtimeSessionId",
  "worldPackageRootHash",
  "nativeExecutionTrustProfileRef",
  "nativeExecutionTrustProfileHash",
  "runnerIdentityRef",
  "runnerImageDigest",
  "sandboxPolicyHash",
  "effectiveBudgetHash",
  "usage",
  "requestedOperation",
  "outcome",
  "resultHash",
  "durationMilliseconds",
  "cleanup",
  "isolationAttestationRef",
  "isolationAttestationHash",
] as const);

const TRUST_MODES = new Set<NativeExecutionTrustModeV1>([
  "trusted-local",
  "hosted-isolated",
]);

const RESULT_STATUSES = new Set<NativeIsolatedExecutionResultV1["status"]>([
  "ready",
  "completed",
  "rejected",
  "terminated",
  "cleanup-failed",
]);

const TERMINAL_RESULT_STATUSES =
  new Set<NativeIsolatedExecutionTerminalStatusV1>([
    "completed",
    "rejected",
    "terminated",
    "cleanup-failed",
  ]);

const DIAGNOSTIC_STAGES = new Set<NativeIsolationDiagnosticStageV1>([
  "policy",
  "provisioning",
  "package-verification",
  "source-admission",
  "authority-audit",
  "runtime-replay",
  "surface-admission",
  "runtime",
  "protocol",
  "cleanup",
]);

const TERMINATION_REASONS = new Set<NativeIsolationTerminationReasonV1>([
  "host-cancelled",
  "timeout",
  "cpu-limit",
  "memory-limit",
  "process-limit",
  "output-limit",
  "protocol-violation",
  "provider-lost",
]);

const WORLD_PACKAGE_REF_PATTERN =
  /^package:\/\/world-package\/sha256\/([a-f0-9]{64})$/;
const RUNTIME_SESSION_URI_PATTERN =
  /^worldkit:\/\/runtime-session\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CAPABILITY_ID_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;
const DIAGNOSTIC_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function invalid(schemaName: string): never {
  return invalidContractDataV1(
    `Value must match the closed ${schemaName} schema.`,
  );
}

function snapshot(input: unknown, schemaName: string): unknown {
  return snapshotContractDataV1(
    input,
    `Value must match the closed ${schemaName} schema.`,
  );
}

function positiveInteger(input: unknown, schemaName: string): number {
  try {
    return contractSafeIntegerV1(input, schemaName, 1);
  } catch {
    return invalid(schemaName);
  }
}

function nonNegativeInteger(input: unknown, schemaName: string): number {
  try {
    return contractSafeIntegerV1(input, schemaName, 0);
  } catch {
    return invalid(schemaName);
  }
}

function identity(input: unknown, schemaName: string): string {
  try {
    return contractIdentityV1(input, schemaName);
  } catch {
    return invalid(schemaName);
  }
}

function hash(input: unknown, schemaName: string): Sha256HashV1 {
  try {
    return contractHashV1(input, schemaName);
  } catch {
    return invalid(schemaName);
  }
}

function resourceRef(
  input: unknown,
  schemaName: string,
  expectedKind: string,
): string {
  try {
    return contractResourceRefV1(input, schemaName, expectedKind);
  } catch {
    return invalid(schemaName);
  }
}

function parseUniqueIdentities(
  input: unknown,
  schemaName: string,
): readonly string[] {
  if (!Array.isArray(input) || input.length > 64) return invalid(schemaName);
  const values = input.map((value) => identity(value, schemaName));
  if (
    values.some((value) => !CAPABILITY_ID_PATTERN.test(value)) ||
    new Set(values).size !== values.length
  ) return invalid(schemaName);
  return Object.freeze(values);
}

function parseTrustProfileBody(
  input: unknown,
): NativeExecutionTrustProfileBodyV1 {
  const schemaName = "NativeExecutionTrustProfileV1";
  const record = exactContractRecordV1(
    input,
    TRUST_PROFILE_BODY_FIELDS,
    schemaName,
  );
  if (
    record.kind !== "native-execution-trust-profile" ||
    record.schemaVersion !== 1 ||
    typeof record.trustMode !== "string" ||
    !TRUST_MODES.has(record.trustMode as NativeExecutionTrustModeV1)
  ) return invalid(schemaName);
  return Object.freeze({
    kind: "native-execution-trust-profile" as const,
    schemaVersion: 1 as const,
    id: identity(record.id, schemaName),
    resourceRef: resourceRef(
      record.resourceRef,
      schemaName,
      "native-execution-trust-profile",
    ),
    trustMode: record.trustMode as NativeExecutionTrustModeV1,
    requiredIsolationCapabilityIds: parseUniqueIdentities(
      record.requiredIsolationCapabilityIds,
      schemaName,
    ),
  });
}

export function hashNativeExecutionTrustProfileBodyV1(
  input: unknown,
): Sha256HashV1 {
  const cloned = snapshot(input, "NativeExecutionTrustProfileV1");
  return sha256CanonicalJson(parseTrustProfileBody(cloned)) as Sha256HashV1;
}

export function parseNativeExecutionTrustProfileV1(
  input: unknown,
): NativeExecutionTrustProfileV1 {
  const schemaName = "NativeExecutionTrustProfileV1";
  const cloned = snapshot(input, schemaName);
  const record = exactContractRecordV1(cloned, TRUST_PROFILE_FIELDS, schemaName);
  const body = parseTrustProfileBody(Object.fromEntries(
    TRUST_PROFILE_BODY_FIELDS.map((field) => [field, record[field]]),
  ));
  const contentHash = hash(record.contentHash, schemaName);
  if (contentHash !== hashNativeExecutionTrustProfileBodyV1(body)) {
    return invalid(schemaName);
  }
  return Object.freeze({ ...body, contentHash });
}

function parsePositiveGroup<T extends Record<string, number>>(
  input: unknown,
  fields: readonly (keyof T & string)[],
  schemaName: string,
): Readonly<T> {
  const record = exactContractRecordV1(input, fields, schemaName);
  return Object.freeze(Object.fromEntries(fields.map((field) => [
    field,
    positiveInteger(record[field], schemaName),
  ]))) as Readonly<T>;
}

function parseNonNegativeGroup<T extends Record<string, number>>(
  input: unknown,
  fields: readonly (keyof T & string)[],
  schemaName: string,
): Readonly<T> {
  const record = exactContractRecordV1(input, fields, schemaName);
  return Object.freeze(Object.fromEntries(fields.map((field) => [
    field,
    nonNegativeInteger(record[field], schemaName),
  ]))) as Readonly<T>;
}

export function parseNativeEffectiveExecutionBudgetV1(
  input: unknown,
): NativeEffectiveExecutionBudgetV1 {
  const schemaName = "NativeEffectiveExecutionBudgetV1";
  const record = exactContractRecordV1(
    snapshot(input, schemaName),
    ["scene", "assets", "runtime", "process", "protocol"],
    schemaName,
  );
  return Object.freeze({
    scene: parsePositiveGroup<NativeEffectiveExecutionBudgetV1["scene"]>(
      record.scene,
      ["maximumVertices", "maximumTriangles", "maximumColliders"],
      schemaName,
    ),
    assets: parsePositiveGroup<NativeEffectiveExecutionBudgetV1["assets"]>(
      record.assets,
      [
        "maximumAssetCount",
        "maximumAssetBytes",
        "maximumTextureCount",
        "maximumTextureBytes",
      ],
      schemaName,
    ),
    runtime: parsePositiveGroup<NativeEffectiveExecutionBudgetV1["runtime"]>(
      record.runtime,
      [
        "maximumSceneNodeCount",
        "maximumMaterialCount",
        "maximumShaderCount",
        "maximumPhysicsBodyCount",
      ],
      schemaName,
    ),
    process: parsePositiveGroup<NativeEffectiveExecutionBudgetV1["process"]>(
      record.process,
      [
        "maximumWallTimeMilliseconds",
        "maximumCpuTimeMilliseconds",
        "maximumMemoryBytes",
        "maximumProcessCount",
      ],
      schemaName,
    ),
    protocol: parsePositiveGroup<NativeEffectiveExecutionBudgetV1["protocol"]>(
      record.protocol,
      [
        "maximumInboundMessageBytes",
        "maximumOutboundMessageBytes",
        "maximumReceiptBytes",
        "maximumDiagnosticCount",
        "maximumLogBytes",
      ],
      schemaName,
    ),
  });
}

export function hashNativeEffectiveExecutionBudgetV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseNativeEffectiveExecutionBudgetV1(input),
  ) as Sha256HashV1;
}

function parseOperation(
  input: unknown,
  schemaName: string,
): NativeIsolatedExecutionOperationV1 {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalid(schemaName);
  }
  const mode = (input as Record<string, unknown>).mode;
  if (mode === "check" || mode === "interactive-session") {
    exactContractRecordV1(input, ["mode"], schemaName);
    return Object.freeze({ mode });
  }
  if (mode === "capture") {
    const record = exactContractRecordV1(
      input,
      ["mode", "captureRequestHash"],
      schemaName,
    );
    return Object.freeze({
      mode: "capture" as const,
      captureRequestHash: hash(record.captureRequestHash, schemaName),
    });
  }
  return invalid(schemaName);
}

export function parseNativeIsolatedExecutionRequestV1(
  input: unknown,
): NativeIsolatedExecutionRequestV1 {
  const schemaName = "NativeIsolatedExecutionRequestV1";
  const record = exactContractRecordV1(
    snapshot(input, schemaName),
    REQUEST_FIELDS,
    schemaName,
  );
  if (
    record.kind !== "native-isolated-execution-request" ||
    record.schemaVersion !== 1 ||
    typeof record.worldPackageRef !== "string"
  ) return invalid(schemaName);
  const packageMatch = WORLD_PACKAGE_REF_PATTERN.exec(record.worldPackageRef);
  const worldPackageRootHash = hash(record.worldPackageRootHash, schemaName);
  if (
    isNil(packageMatch) ||
    worldPackageRootHash !== `sha256:${packageMatch[1]}`
  ) return invalid(schemaName);
  const effectiveBudget = parseNativeEffectiveExecutionBudgetV1(
    record.effectiveBudget,
  );
  const effectiveBudgetHash = hash(record.effectiveBudgetHash, schemaName);
  if (
    effectiveBudgetHash !==
      hashNativeEffectiveExecutionBudgetV1(effectiveBudget)
  ) return invalid(schemaName);
  return Object.freeze({
    kind: "native-isolated-execution-request" as const,
    schemaVersion: 1 as const,
    id: identity(record.id, schemaName),
    runtimeSessionId: identity(record.runtimeSessionId, schemaName),
    worldPackageRef:
      record.worldPackageRef as `package://world-package/sha256/${string}`,
    worldPackageRootHash,
    worldBuildIdentityHash: hash(record.worldBuildIdentityHash, schemaName),
    sceneModuleBundleHash: hash(record.sceneModuleBundleHash, schemaName),
    nativeSceneContributionHash: hash(
      record.nativeSceneContributionHash,
      schemaName,
    ),
    nativeExecutionTrustProfileRef: resourceRef(
      record.nativeExecutionTrustProfileRef,
      schemaName,
      "native-execution-trust-profile",
    ),
    nativeExecutionTrustProfileHash: hash(
      record.nativeExecutionTrustProfileHash,
      schemaName,
    ),
    runnerIdentityRef: resourceRef(
      record.runnerIdentityRef,
      schemaName,
      "native-isolation-runner",
    ),
    runnerImageDigest: hash(record.runnerImageDigest, schemaName),
    sandboxPolicyHash: hash(record.sandboxPolicyHash, schemaName),
    effectiveBudget,
    effectiveBudgetHash,
    requestedOperation: parseOperation(record.requestedOperation, schemaName),
    sessionNonce: identity(record.sessionNonce, schemaName),
  });
}

export function hashNativeIsolatedExecutionRequestV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseNativeIsolatedExecutionRequestV1(input),
  ) as Sha256HashV1;
}

function parseDiagnostics(
  input: unknown,
  schemaName: string,
): readonly NativeIsolationDiagnosticV1[] {
  if (!Array.isArray(input) || isEmpty(input) || input.length > 64) {
    return invalid(schemaName);
  }
  return Object.freeze(input.map((value) => {
    const record = exactContractRecordV1(
      value,
      ["code", "message"],
      schemaName,
    );
    const code = identity(record.code, schemaName);
    if (!DIAGNOSTIC_CODE_PATTERN.test(code)) return invalid(schemaName);
    return Object.freeze({
      code,
      message: identity(record.message, schemaName),
    });
  }));
}

function parseUniqueHashes(
  input: unknown,
  schemaName: string,
): readonly Sha256HashV1[] {
  if (!Array.isArray(input) || input.length > 256) return invalid(schemaName);
  const values = input.map((value) => hash(value, schemaName));
  if (new Set(values).size !== values.length) return invalid(schemaName);
  return Object.freeze(values);
}

export function parseNativeIsolatedExecutionResultV1(
  input: unknown,
): NativeIsolatedExecutionResultV1 {
  const schemaName = "NativeIsolatedExecutionResultV1";
  const cloned = snapshot(input, schemaName);
  if (typeof cloned !== "object" || isNil(cloned) || Array.isArray(cloned)) {
    return invalid(schemaName);
  }
  const status = (cloned as Record<string, unknown>).status;
  if (
    typeof status !== "string" ||
    !RESULT_STATUSES.has(status as NativeIsolatedExecutionResultV1["status"])
  ) return invalid(schemaName);
  const extraFields = status === "ready"
    ? ["status", "runtimeSessionUri", "initialSnapshotHash"]
    : status === "completed"
      ? ["status", "outputHashes", "finalSnapshotHash"]
      : status === "rejected"
        ? ["status", "stage", "diagnostics"]
        : status === "terminated"
          ? ["status", "reason"]
          : ["status", "quarantineId"];
  const record = exactContractRecordV1(
    cloned,
    [...RESULT_BASE_FIELDS, ...extraFields],
    schemaName,
  );
  if (
    record.kind !== "native-isolated-execution-result" ||
    record.schemaVersion !== 1
  ) return invalid(schemaName);
  const base = {
    kind: "native-isolated-execution-result" as const,
    schemaVersion: 1 as const,
    id: identity(record.id, schemaName),
    requestId: identity(record.requestId, schemaName),
    runtimeSessionId: identity(record.runtimeSessionId, schemaName),
  };
  if (status === "ready") {
    const runtimeSessionUri = identity(record.runtimeSessionUri, schemaName);
    if (!RUNTIME_SESSION_URI_PATTERN.test(runtimeSessionUri)) {
      return invalid(schemaName);
    }
    return Object.freeze({
      ...base,
      status,
      runtimeSessionUri:
        runtimeSessionUri as `worldkit://runtime-session/${string}`,
      initialSnapshotHash: hash(record.initialSnapshotHash, schemaName),
    });
  }
  if (status === "completed") {
    return Object.freeze({
      ...base,
      status,
      outputHashes: parseUniqueHashes(record.outputHashes, schemaName),
      finalSnapshotHash: hash(record.finalSnapshotHash, schemaName),
    });
  }
  if (status === "rejected") {
    if (
      typeof record.stage !== "string" ||
      !DIAGNOSTIC_STAGES.has(record.stage as NativeIsolationDiagnosticStageV1)
    ) return invalid(schemaName);
    return Object.freeze({
      ...base,
      status,
      stage: record.stage as NativeIsolationDiagnosticStageV1,
      diagnostics: parseDiagnostics(record.diagnostics, schemaName),
    });
  }
  if (status === "terminated") {
    if (
      typeof record.reason !== "string" ||
      !TERMINATION_REASONS.has(record.reason as NativeIsolationTerminationReasonV1)
    ) return invalid(schemaName);
    return Object.freeze({
      ...base,
      status,
      reason: record.reason as NativeIsolationTerminationReasonV1,
    });
  }
  return Object.freeze({
    ...base,
    status: "cleanup-failed" as const,
    quarantineId: identity(record.quarantineId, schemaName),
  });
}

export function hashNativeIsolatedExecutionResultV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseNativeIsolatedExecutionResultV1(input),
  ) as Sha256HashV1;
}

function parseUsage(input: unknown): NativeExecutionUsageV1 {
  const schemaName = "NativeIsolatedExecutionReceiptV1";
  const record = exactContractRecordV1(
    input,
    ["scene", "assets", "runtime", "process", "protocol"],
    schemaName,
  );
  return Object.freeze({
    scene: parseNonNegativeGroup<NativeExecutionUsageV1["scene"]>(
      record.scene,
      ["actualVertices", "actualTriangles", "actualColliders"],
      schemaName,
    ),
    assets: parseNonNegativeGroup<NativeExecutionUsageV1["assets"]>(
      record.assets,
      [
        "actualAssetCount",
        "actualAssetBytes",
        "actualTextureCount",
        "actualTextureBytes",
      ],
      schemaName,
    ),
    runtime: parseNonNegativeGroup<NativeExecutionUsageV1["runtime"]>(
      record.runtime,
      [
        "actualSceneNodeCount",
        "actualMaterialCount",
        "actualShaderCount",
        "actualPhysicsBodyCount",
      ],
      schemaName,
    ),
    process: parseNonNegativeGroup<NativeExecutionUsageV1["process"]>(
      record.process,
      [
        "actualWallTimeMilliseconds",
        "actualCpuTimeMilliseconds",
        "peakMemoryBytes",
        "peakProcessCount",
      ],
      schemaName,
    ),
    protocol: parseNonNegativeGroup<NativeExecutionUsageV1["protocol"]>(
      record.protocol,
      [
        "actualInboundMessageBytes",
        "actualOutboundMessageBytes",
        "actualReceiptBytes",
        "actualDiagnosticCount",
        "actualLogBytes",
      ],
      schemaName,
    ),
  });
}

function parseCleanup(input: unknown): NativeIsolationCleanupV1 {
  const schemaName = "NativeIsolatedExecutionReceiptV1";
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalid(schemaName);
  }
  const status = (input as Record<string, unknown>).status;
  if (status === "complete") {
    exactContractRecordV1(input, ["status"], schemaName);
    return Object.freeze({ status });
  }
  if (status === "quarantined") {
    const record = exactContractRecordV1(
      input,
      ["status", "quarantineId"],
      schemaName,
    );
    return Object.freeze({
      status,
      quarantineId: identity(record.quarantineId, schemaName),
    });
  }
  return invalid(schemaName);
}

export function parseNativeIsolatedExecutionReceiptV1(
  input: unknown,
): NativeIsolatedExecutionReceiptV1 {
  const schemaName = "NativeIsolatedExecutionReceiptV1";
  const record = exactContractRecordV1(
    snapshot(input, schemaName),
    RECEIPT_FIELDS,
    schemaName,
  );
  if (
    record.kind !== "native-isolated-execution-receipt" ||
    record.schemaVersion !== 1 ||
    typeof record.outcome !== "string" ||
    !TERMINAL_RESULT_STATUSES.has(
      record.outcome as NativeIsolatedExecutionTerminalStatusV1,
    )
  ) return invalid(schemaName);
  return Object.freeze({
    kind: "native-isolated-execution-receipt" as const,
    schemaVersion: 1 as const,
    id: identity(record.id, schemaName),
    requestId: identity(record.requestId, schemaName),
    requestHash: hash(record.requestHash, schemaName),
    runtimeSessionId: identity(record.runtimeSessionId, schemaName),
    worldPackageRootHash: hash(record.worldPackageRootHash, schemaName),
    nativeExecutionTrustProfileRef: resourceRef(
      record.nativeExecutionTrustProfileRef,
      schemaName,
      "native-execution-trust-profile",
    ),
    nativeExecutionTrustProfileHash: hash(
      record.nativeExecutionTrustProfileHash,
      schemaName,
    ),
    runnerIdentityRef: resourceRef(
      record.runnerIdentityRef,
      schemaName,
      "native-isolation-runner",
    ),
    runnerImageDigest: hash(record.runnerImageDigest, schemaName),
    sandboxPolicyHash: hash(record.sandboxPolicyHash, schemaName),
    effectiveBudgetHash: hash(record.effectiveBudgetHash, schemaName),
    usage: parseUsage(record.usage),
    requestedOperation: parseOperation(record.requestedOperation, schemaName),
    outcome: record.outcome as NativeIsolatedExecutionTerminalStatusV1,
    resultHash: hash(record.resultHash, schemaName),
    durationMilliseconds: nonNegativeInteger(
      record.durationMilliseconds,
      schemaName,
    ),
    cleanup: parseCleanup(record.cleanup),
    isolationAttestationRef: resourceRef(
      record.isolationAttestationRef,
      schemaName,
      "native-isolation-attestation",
    ),
    isolationAttestationHash: hash(
      record.isolationAttestationHash,
      schemaName,
    ),
  });
}

export function hashNativeIsolatedExecutionReceiptV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseNativeIsolatedExecutionReceiptV1(input),
  ) as Sha256HashV1;
}

function isUsageConsistentWithTerminalResult(
  usage: NativeExecutionUsageV1,
  budget: NativeEffectiveExecutionBudgetV1,
  result: NativeIsolatedExecutionResultV1,
): boolean {
  const isTimeout = result.status === "terminated" &&
    result.reason === "timeout";
  return (
    usage.scene.actualVertices <= budget.scene.maximumVertices &&
    usage.scene.actualTriangles <= budget.scene.maximumTriangles &&
    usage.scene.actualColliders <= budget.scene.maximumColliders &&
    usage.assets.actualAssetCount <= budget.assets.maximumAssetCount &&
    usage.assets.actualAssetBytes <= budget.assets.maximumAssetBytes &&
    usage.assets.actualTextureCount <= budget.assets.maximumTextureCount &&
    usage.assets.actualTextureBytes <= budget.assets.maximumTextureBytes &&
    usage.runtime.actualSceneNodeCount <=
      budget.runtime.maximumSceneNodeCount &&
    usage.runtime.actualMaterialCount <= budget.runtime.maximumMaterialCount &&
    usage.runtime.actualShaderCount <= budget.runtime.maximumShaderCount &&
    usage.runtime.actualPhysicsBodyCount <=
      budget.runtime.maximumPhysicsBodyCount &&
    (usage.process.actualWallTimeMilliseconds <=
      budget.process.maximumWallTimeMilliseconds || isTimeout) &&
    usage.process.actualCpuTimeMilliseconds <=
      budget.process.maximumCpuTimeMilliseconds &&
    usage.process.peakMemoryBytes <= budget.process.maximumMemoryBytes &&
    usage.process.peakProcessCount <= budget.process.maximumProcessCount &&
    usage.protocol.actualInboundMessageBytes <=
      budget.protocol.maximumInboundMessageBytes &&
    usage.protocol.actualOutboundMessageBytes <=
      budget.protocol.maximumOutboundMessageBytes &&
    usage.protocol.actualReceiptBytes <=
      budget.protocol.maximumReceiptBytes &&
    usage.protocol.actualDiagnosticCount <=
      budget.protocol.maximumDiagnosticCount &&
    usage.protocol.actualLogBytes <= budget.protocol.maximumLogBytes
  );
}

export function verifyNativeIsolatedExecutionReceiptV1(input: Readonly<{
  request: unknown;
  result: unknown;
  receipt: unknown;
}>): NativeIsolatedExecutionReceiptV1 {
  const schemaName = "NativeIsolatedExecutionReceiptV1";
  const request = parseNativeIsolatedExecutionRequestV1(input.request);
  const result = parseNativeIsolatedExecutionResultV1(input.result);
  const receipt = parseNativeIsolatedExecutionReceiptV1(input.receipt);
  if (
    result.status === "ready" ||
    result.requestId !== request.id ||
    result.runtimeSessionId !== request.runtimeSessionId ||
    receipt.requestId !== request.id ||
    receipt.runtimeSessionId !== request.runtimeSessionId ||
    receipt.requestHash !== hashNativeIsolatedExecutionRequestV1(request) ||
    receipt.worldPackageRootHash !== request.worldPackageRootHash ||
    receipt.nativeExecutionTrustProfileRef !==
      request.nativeExecutionTrustProfileRef ||
    receipt.nativeExecutionTrustProfileHash !==
      request.nativeExecutionTrustProfileHash ||
    receipt.runnerIdentityRef !== request.runnerIdentityRef ||
    receipt.runnerImageDigest !== request.runnerImageDigest ||
    receipt.sandboxPolicyHash !== request.sandboxPolicyHash ||
    receipt.effectiveBudgetHash !==
      hashNativeEffectiveExecutionBudgetV1(request.effectiveBudget) ||
    !isUsageConsistentWithTerminalResult(
      receipt.usage,
      request.effectiveBudget,
      result,
    ) ||
    sha256CanonicalJson(receipt.requestedOperation) !==
      sha256CanonicalJson(request.requestedOperation) ||
    receipt.outcome !== result.status ||
    receipt.resultHash !== hashNativeIsolatedExecutionResultV1(result) ||
    (result.status === "cleanup-failed" &&
      (receipt.cleanup.status !== "quarantined" ||
        receipt.cleanup.quarantineId !== result.quarantineId)) ||
    (result.status !== "cleanup-failed" &&
      receipt.cleanup.status !== "complete")
  ) return invalid(schemaName);
  return receipt;
}

export function parseNativeIsolationTransportEnvelopeV1(
  input: unknown,
): NativeIsolationTransportEnvelopeV1 {
  const schemaName = "NativeIsolationTransportEnvelopeV1";
  const record = exactContractRecordV1(
    snapshot(input, schemaName),
    [
      "kind",
      "schemaVersion",
      "runtimeSessionId",
      "sessionNonce",
      "messageSequence",
      "payload",
    ],
    schemaName,
  );
  if (
    record.kind !== "native-isolation-transport-envelope" ||
    record.schemaVersion !== 1 ||
    typeof record.payload !== "object" ||
    isNil(record.payload) ||
    Array.isArray(record.payload)
  ) return invalid(schemaName);
  const payloadKind = (record.payload as Record<string, unknown>).kind;
  let payload:
    | RuntimeSessionRequestV1
    | RuntimeSessionReceiptV1
    | RuntimeSessionEventV1;
  try {
    payload = payloadKind === "worldkit-runtime-session-request"
      ? parseRuntimeSessionRequestV1(record.payload)
      : payloadKind === "worldkit-runtime-session-receipt"
        ? parseRuntimeSessionReceiptV1(record.payload)
        : payloadKind === "worldkit-runtime-session-event"
          ? parseRuntimeSessionEventV1(record.payload)
          : invalid(schemaName);
  } catch {
    return invalid(schemaName);
  }
  const runtimeSessionId = identity(record.runtimeSessionId, schemaName);
  if (payload.runtimeSessionId !== runtimeSessionId) return invalid(schemaName);
  return Object.freeze({
    kind: "native-isolation-transport-envelope" as const,
    schemaVersion: 1 as const,
    runtimeSessionId,
    sessionNonce: identity(record.sessionNonce, schemaName),
    messageSequence: positiveInteger(record.messageSequence, schemaName),
    payload,
  });
}
