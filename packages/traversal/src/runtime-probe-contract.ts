import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isEqual, isNil, isPlainObject } from "lodash-es";

import {
  canonicalRoutePathReceiptV2,
  hashRoutePathReceiptV2,
  type RoutePathReceiptV2,
} from "./path-receipt.js";
import {
  resolveTraversalDriverProfileV1,
  resolveTraversalGraphBuilderProfileV2,
} from "./profile-registry.js";
import {
  canonicalTraversalRuntimeTickEvidenceV1,
  type CharacterSupportStateV1,
  type CharacterSupportSurfaceResolutionV1,
  type TraversalRuntimePortV1,
  type TraversalRuntimeTickEvidenceV1,
} from "./runtime-evidence.js";
import {
  assertTraversalSurfaceIdentityV1,
} from "./graph-contract.js";
import type {
  ResolvedTraversalDriverProfileV1,
  TraversalRuntimeImplementationIdentityV1,
  TraversalSurfaceIdentityV1,
} from "./types.js";

type Sha256Hash = `sha256:${string}`;
type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];
type UnknownRecord = Record<string, unknown>;

export interface RouteRuntimeProbeValidationProfileIdentityV2 {
  readonly resourceRef: string;
  readonly version: string;
  readonly contentHash: Sha256Hash;
}

export interface RouteRuntimeProbeMetricsV2 {
  readonly processedTickCount: number;
  readonly maximumStalledDurationTicks: number;
  readonly maximumRouteDeviationMetersXZ: number;
  readonly maximumConsecutiveUnexpectedUnsupportedTicks: number;
  readonly slidingDurationTicks: number;
  readonly unexpectedSupportLossCount: number;
  readonly wrongSupportSurfaceCount: number;
  readonly invalidPhysicsValueCount: number;
}

interface RouteRuntimeProbeFailureBaseV2 {
  readonly failureProbeTick: number;
  readonly failurePositionMetersXYZ: Vec3;
}

export type RouteRuntimeProbeFailureV2 =
  | Readonly<RouteRuntimeProbeFailureBaseV2 & {
      kind: "start-support-invalid";
      supportState: "unsupported";
    }>
  | Readonly<RouteRuntimeProbeFailureBaseV2 & {
      kind: "support-surface-mismatch";
      supportState: "supported" | "sliding";
      surfaceResolutionMode: "unmatched" | "ambiguous" | "resolved";
    }>
  | Readonly<RouteRuntimeProbeFailureBaseV2 & {
      kind: "runtime-stalled";
      stalledDurationTicks: number;
    }>
  | Readonly<RouteRuntimeProbeFailureBaseV2 & {
      kind: "runtime-deviated";
      routeDeviationMetersXZ: number;
    }>
  | Readonly<RouteRuntimeProbeFailureBaseV2 & {
      kind: "runtime-support-lost";
      consecutiveUnexpectedUnsupportedTicks: number;
    }>
  | Readonly<RouteRuntimeProbeFailureBaseV2 & {
      kind: "maximum-probe-ticks-reached";
      processedTickCount: number;
    }>;

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DIRECTION_LENGTH_TOLERANCE = 1e-9;


const RUNTIME_IDENTITY_FIELDS = [
  "runtimeBackendRef",
  "runtimeBackendResolvedVersion",
  "runtimeBackendHash",
  "runtimeAdapterRef",
  "runtimeAdapterResolvedVersion",
  "runtimeAdapterHash",
] as const;

const VALIDATION_IDENTITY_FIELDS = [
  "resourceRef",
  "version",
  "contentHash",
] as const;

const TICK_FIELDS = [
  "kind",
  "schemaVersion",
  "probeTick",
  "runtimeEvidence",
  "walkDirectionWorldXZ",
  "routeProgressMetersXZ",
  "remainingRouteDistanceMetersXZ",
  "routeDeviationMetersXZ",
  "stalledDurationTicks",
  "consecutiveUnexpectedUnsupportedTicks",
] as const;

const METRICS_FIELDS = [
  "processedTickCount",
  "maximumStalledDurationTicks",
  "maximumRouteDeviationMetersXZ",
  "maximumConsecutiveUnexpectedUnsupportedTicks",
  "slidingDurationTicks",
  "unexpectedSupportLossCount",
  "wrongSupportSurfaceCount",
  "invalidPhysicsValueCount",
] as const;

const COMPLETE_RECEIPT_FIELDS = [
  "kind",
  "schemaVersion",
  "status",
  "request",
  "initialRuntimeEvidence",
  "ticks",
  "metrics",
  "completionDurationTicks",
] as const;

const FAILED_RECEIPT_FIELDS = [
  "kind",
  "schemaVersion",
  "status",
  "request",
  "initialRuntimeEvidence",
  "ticks",
  "metrics",
  "failure",
] as const;

const FAILURE_FIELDS_BY_KIND = {
  "start-support-invalid": [
    "kind",
    "failureProbeTick",
    "failurePositionMetersXYZ",
    "supportState",
  ],
  "support-surface-mismatch": [
    "kind",
    "failureProbeTick",
    "failurePositionMetersXYZ",
    "supportState",
    "surfaceResolutionMode",
  ],
  "runtime-stalled": [
    "kind",
    "failureProbeTick",
    "failurePositionMetersXYZ",
    "stalledDurationTicks",
  ],
  "runtime-deviated": [
    "kind",
    "failureProbeTick",
    "failurePositionMetersXYZ",
    "routeDeviationMetersXZ",
  ],
  "runtime-support-lost": [
    "kind",
    "failureProbeTick",
    "failurePositionMetersXYZ",
    "consecutiveUnexpectedUnsupportedTicks",
  ],
  "maximum-probe-ticks-reached": [
    "kind",
    "failureProbeTick",
    "failurePositionMetersXYZ",
    "processedTickCount",
  ],
} as const;

type FailurePrefix =
  | "ROUTE_RUNTIME_PROBE_REQUEST_INVALID"
  | "ROUTE_RUNTIME_PROBE_TICK_INVALID"
  | "ROUTE_RUNTIME_PROBE_RECEIPT_INVALID"
  | "ROUTE_RUNTIME_PROBE_CONTEXT_INVALID";

function fail(prefix: FailurePrefix, path: string, message: string): never {
  throw new Error(`${prefix}: ${path.length === 0 ? message : `${path}: ${message}`}`);
}

function requireRecord(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    fail(prefix, path, "expected a plain object");
  }
  return value as UnknownRecord;
}

function requireObject(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): UnknownRecord {
  if (isNil(value) || typeof value !== "object") {
    fail(prefix, path, "expected an object");
  }
  return value as UnknownRecord;
}

function requireExactRecord(
  value: unknown,
  fields: readonly string[],
  path: string,
  prefix: FailurePrefix,
): UnknownRecord {
  const record = requireRecord(value, path, prefix);
  const allowed = new Set(fields);
  const unknownField = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknownField)) {
    fail(prefix, path, `unknown field '${unknownField}'`);
  }
  for (const field of fields) {
    if (isNil(record[field])) {
      fail(prefix, path, `missing field '${field}'`);
    }
  }
  return record;
}

function requireString(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(prefix, path, "must be a non-empty string");
  }
  return value;
}

function requireHash(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): Sha256Hash {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(prefix, path, "must be a lowercase sha256 hash");
  }
  return value as Sha256Hash;
}

function requireFinite(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(prefix, path, "must be finite");
  }
  return value === 0 ? 0 : value;
}

function requireNonNegative(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): number {
  const result = requireFinite(value, path, prefix);
  if (result < 0) fail(prefix, path, "must be >= 0");
  return result;
}

function requireNonNegativeInteger(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(prefix, path, "must be a non-negative safe integer");
  }
  return value === 0 ? 0 : value;
}

function requirePositiveInteger(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): number {
  const result = requireNonNegativeInteger(value, path, prefix);
  if (result === 0) fail(prefix, path, "must be a positive safe integer");
  return result;
}

function requireVec2(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): Vec2 {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(prefix, path, "must be a 2-tuple");
  }
  const result: Vec2 = [
    requireFinite(value[0], `${path}/0`, prefix),
    requireFinite(value[1], `${path}/1`, prefix),
  ];
  const length = Math.hypot(result[0], result[1]);
  if (length !== 0 && Math.abs(length - 1) > DIRECTION_LENGTH_TOLERANCE) {
    fail(prefix, path, "must be zero length or normalized");
  }
  return result;
}

function requireVec3(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) {
    fail(prefix, path, "must be a 3-tuple");
  }
  return [
    requireFinite(value[0], `${path}/0`, prefix),
    requireFinite(value[1], `${path}/1`, prefix),
    requireFinite(value[2], `${path}/2`, prefix),
  ];
}

function deepFreeze<T>(value: T): T {
  if (isNil(value) || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function canonicalRuntimeIdentity(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): TraversalRuntimeImplementationIdentityV1 {
  const record = requireExactRecord(value, RUNTIME_IDENTITY_FIELDS, path, prefix);
  return {
    runtimeBackendRef: requireString(
      record.runtimeBackendRef,
      `${path}/runtimeBackendRef`,
      prefix,
    ),
    runtimeBackendResolvedVersion: requireString(
      record.runtimeBackendResolvedVersion,
      `${path}/runtimeBackendResolvedVersion`,
      prefix,
    ),
    runtimeBackendHash: requireHash(
      record.runtimeBackendHash,
      `${path}/runtimeBackendHash`,
      prefix,
    ),
    runtimeAdapterRef: requireString(
      record.runtimeAdapterRef,
      `${path}/runtimeAdapterRef`,
      prefix,
    ),
    runtimeAdapterResolvedVersion: requireString(
      record.runtimeAdapterResolvedVersion,
      `${path}/runtimeAdapterResolvedVersion`,
      prefix,
    ),
    runtimeAdapterHash: requireHash(
      record.runtimeAdapterHash,
      `${path}/runtimeAdapterHash`,
      prefix,
    ),
  };
}

function canonicalValidationIdentity(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): RouteRuntimeProbeValidationProfileIdentityV2 {
  const record = requireExactRecord(
    value,
    VALIDATION_IDENTITY_FIELDS,
    path,
    prefix,
  );
  return {
    resourceRef: requireString(record.resourceRef, `${path}/resourceRef`, prefix),
    version: requireString(record.version, `${path}/version`, prefix),
    contentHash: requireHash(record.contentHash, `${path}/contentHash`, prefix),
  };
}

function canonicalSurfaceIdentity(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): TraversalSurfaceIdentityV1 {
  try {
    return assertTraversalSurfaceIdentityV1(value);
  } catch {
    fail(prefix, path, "must be a canonical Traversal Surface identity");
  }
}

function canonicalRuntimeEvidence(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): TraversalRuntimeTickEvidenceV1 {
  try {
    return canonicalTraversalRuntimeTickEvidenceV1(value);
  } catch {
    fail(prefix, path, "must be canonical Runtime evidence");
  }
}

function requireEqual(
  actual: unknown,
  expected: unknown,
  path: string,
  prefix: FailurePrefix,
): void {
  if (!isEqual(actual, expected)) {
    fail(prefix, path, "does not match related canonical evidence");
  }
}

function assertResolvedDriverIdentity(
  resourceRef: string,
  resolvedVersion: string,
  contentHash: Sha256Hash,
  prefix: FailurePrefix,
): ResolvedTraversalDriverProfileV1 {
  let resolved: ResolvedTraversalDriverProfileV1;
  try {
    resolved = resolveTraversalDriverProfileV1(resourceRef);
  } catch {
    fail(prefix, "driverProfileRef", "must resolve to a Registry Driver Profile");
  }
  if (
    resolved.resolvedVersion !== resolvedVersion ||
    resolved.contentHash !== contentHash
  ) {
    fail(prefix, "driverProfileRef", "must match the Registry Driver Profile identity");
  }
  return resolved;
}

function assertResolvedDriverInput(
  value: ResolvedTraversalDriverProfileV1,
  prefix: FailurePrefix,
): ResolvedTraversalDriverProfileV1 {
  const record = requireRecord(value, "resolvedDriverProfile", prefix);
  const resourceRef = requireString(
    record.resourceRef,
    "resolvedDriverProfile/resourceRef",
    prefix,
  );
  const resolvedVersion = requireString(
    record.resolvedVersion,
    "resolvedDriverProfile/resolvedVersion",
    prefix,
  );
  const contentHash = requireHash(
    record.contentHash,
    "resolvedDriverProfile/contentHash",
    prefix,
  );
  const resolved = assertResolvedDriverIdentity(
    resourceRef,
    resolvedVersion,
    contentHash,
    prefix,
  );
  if (!isEqual(record.profile, resolved.profile)) {
    fail(prefix, "resolvedDriverProfile/profile", "must match the Registry Driver Profile");
  }
  return resolved;
}

function canonicalMetrics(value: unknown): RouteRuntimeProbeMetricsV2 {
  const prefix = "ROUTE_RUNTIME_PROBE_RECEIPT_INVALID";
  const record = requireExactRecord(value, METRICS_FIELDS, "metrics", prefix);
  return {
    processedTickCount: requireNonNegativeInteger(
      record.processedTickCount,
      "metrics/processedTickCount",
      prefix,
    ),
    maximumStalledDurationTicks: requireNonNegativeInteger(
      record.maximumStalledDurationTicks,
      "metrics/maximumStalledDurationTicks",
      prefix,
    ),
    maximumRouteDeviationMetersXZ: requireNonNegative(
      record.maximumRouteDeviationMetersXZ,
      "metrics/maximumRouteDeviationMetersXZ",
      prefix,
    ),
    maximumConsecutiveUnexpectedUnsupportedTicks: requireNonNegativeInteger(
      record.maximumConsecutiveUnexpectedUnsupportedTicks,
      "metrics/maximumConsecutiveUnexpectedUnsupportedTicks",
      prefix,
    ),
    slidingDurationTicks: requireNonNegativeInteger(
      record.slidingDurationTicks,
      "metrics/slidingDurationTicks",
      prefix,
    ),
    unexpectedSupportLossCount: requireNonNegativeInteger(
      record.unexpectedSupportLossCount,
      "metrics/unexpectedSupportLossCount",
      prefix,
    ),
    wrongSupportSurfaceCount: requireNonNegativeInteger(
      record.wrongSupportSurfaceCount,
      "metrics/wrongSupportSurfaceCount",
      prefix,
    ),
    invalidPhysicsValueCount: requireNonNegativeInteger(
      record.invalidPhysicsValueCount,
      "metrics/invalidPhysicsValueCount",
      prefix,
    ),
  };
}

function canonicalFailure(value: unknown): RouteRuntimeProbeFailureV2 {
  const prefix = "ROUTE_RUNTIME_PROBE_RECEIPT_INVALID";
  const base = requireRecord(value, "failure", prefix);
  if (
    typeof base.kind !== "string" ||
    !Object.hasOwn(FAILURE_FIELDS_BY_KIND, base.kind)
  ) {
    fail(prefix, "failure/kind", "must be a supported closed failure kind");
  }
  const kind = base.kind as keyof typeof FAILURE_FIELDS_BY_KIND;
  const record = requireExactRecord(
    value,
    FAILURE_FIELDS_BY_KIND[kind],
    "failure",
    prefix,
  );
  const common = {
    failureProbeTick: requireNonNegativeInteger(
      record.failureProbeTick,
      "failure/failureProbeTick",
      prefix,
    ),
    failurePositionMetersXYZ: requireVec3(
      record.failurePositionMetersXYZ,
      "failure/failurePositionMetersXYZ",
      prefix,
    ),
  } as const;

  switch (kind) {
    case "start-support-invalid":
      if (record.supportState !== "unsupported") {
        fail(prefix, "failure/supportState", "must be 'unsupported'");
      }
      return { kind, ...common, supportState: "unsupported" };
    case "support-surface-mismatch":
      if (record.supportState !== "supported" && record.supportState !== "sliding") {
        fail(prefix, "failure/supportState", "must be 'supported' or 'sliding'");
      }
      if (
        record.surfaceResolutionMode !== "unmatched" &&
        record.surfaceResolutionMode !== "ambiguous" &&
        record.surfaceResolutionMode !== "resolved"
      ) {
        fail(prefix, "failure/surfaceResolutionMode", "must be a mismatch mode");
      }
      return {
        kind,
        ...common,
        supportState: record.supportState,
        surfaceResolutionMode: record.surfaceResolutionMode,
      };
    case "runtime-stalled":
      return {
        kind,
        ...common,
        stalledDurationTicks: requireNonNegativeInteger(
          record.stalledDurationTicks,
          "failure/stalledDurationTicks",
          prefix,
        ),
      };
    case "runtime-deviated":
      return {
        kind,
        ...common,
        routeDeviationMetersXZ: requireNonNegative(
          record.routeDeviationMetersXZ,
          "failure/routeDeviationMetersXZ",
          prefix,
        ),
      };
    case "runtime-support-lost":
      return {
        kind,
        ...common,
        consecutiveUnexpectedUnsupportedTicks: requireNonNegativeInteger(
          record.consecutiveUnexpectedUnsupportedTicks,
          "failure/consecutiveUnexpectedUnsupportedTicks",
          prefix,
        ),
      };
    case "maximum-probe-ticks-reached":
      return {
        kind,
        ...common,
        processedTickCount: requireNonNegativeInteger(
          record.processedTickCount,
          "failure/processedTickCount",
          prefix,
        ),
      };
  }
}

const REQUEST_FIELDS_V2 = [
  "kind",
  "schemaVersion",
  "routePathReceiptHash",
  "constraintId",
  "routeId",
  "traversingEntityId",
  "startAnchorEntityId",
  "destinationAnchorEntityId",
  "authoringSpecHash",
  "layoutSolveReportHash",
  "resourceLockHash",
  "executionPlanHash",
  "routeBuildInputHash",
  "traversalGraphHash",
  "resolvedTraversalLockHash",
  "driverProfileRef",
  "driverResolvedVersion",
  "driverProfileHash",
  "validationProfileRef",
  "validationProfileVersion",
  "validationProfileHash",
  "runtimeImplementationIdentity",
  "walkSpeedMetersPerSecond",
  "positionQuantizationMeters",
] as const;

const TICK_FIELDS_V2 = [
  ...TICK_FIELDS,
  "expectedTraversalSurfaceIds",
] as const;

export interface RouteRuntimeProbeRequestV2 {
  readonly kind: "route-runtime-probe-request";
  readonly schemaVersion: 2;
  readonly routePathReceiptHash: Sha256Hash;
  readonly constraintId: string;
  readonly routeId: string;
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly authoringSpecHash: Sha256Hash;
  readonly layoutSolveReportHash: Sha256Hash;
  readonly resourceLockHash: Sha256Hash;
  readonly executionPlanHash: Sha256Hash;
  readonly routeBuildInputHash: Sha256Hash;
  readonly traversalGraphHash: Sha256Hash;
  readonly resolvedTraversalLockHash: Sha256Hash;
  readonly driverProfileRef: string;
  readonly driverResolvedVersion: string;
  readonly driverProfileHash: Sha256Hash;
  readonly validationProfileRef: string;
  readonly validationProfileVersion: string;
  readonly validationProfileHash: Sha256Hash;
  readonly runtimeImplementationIdentity: TraversalRuntimeImplementationIdentityV1;
  readonly walkSpeedMetersPerSecond: number;
  readonly positionQuantizationMeters: number;
}

export interface RouteRuntimeProbeTickV2 {
  readonly kind: "route-runtime-probe-tick";
  readonly schemaVersion: 2;
  readonly probeTick: number;
  readonly runtimeEvidence: TraversalRuntimeTickEvidenceV1;
  readonly walkDirectionWorldXZ: Vec2;
  readonly routeProgressMetersXZ: number;
  readonly remainingRouteDistanceMetersXZ: number;
  readonly routeDeviationMetersXZ: number;
  readonly stalledDurationTicks: number;
  readonly consecutiveUnexpectedUnsupportedTicks: number;
  readonly expectedTraversalSurfaceIds: readonly string[];
}

interface RouteRuntimeProbeReceiptBaseV2 {
  readonly kind: "route-runtime-probe-receipt";
  readonly schemaVersion: 2;
  readonly request: RouteRuntimeProbeRequestV2;
  readonly initialRuntimeEvidence: TraversalRuntimeTickEvidenceV1;
  readonly ticks: readonly RouteRuntimeProbeTickV2[];
  readonly metrics: RouteRuntimeProbeMetricsV2;
}

export type RouteRuntimeProbeReceiptV2 =
  | Readonly<RouteRuntimeProbeReceiptBaseV2 & {
      status: "complete";
      completionDurationTicks: number;
    }>
  | Readonly<RouteRuntimeProbeReceiptBaseV2 & {
      status: "failed";
      failure: RouteRuntimeProbeFailureV2;
    }>;

export interface CreateRouteRuntimeProbeRequestInputV2 {
  readonly routePathReceipt: RoutePathReceiptV2;
  readonly resolvedDriverProfile: ResolvedTraversalDriverProfileV1;
  readonly runtimePort: TraversalRuntimePortV1;
  readonly validationProfileIdentity: RouteRuntimeProbeValidationProfileIdentityV2;
  readonly resolvedControlFeelProfile: Readonly<{
    readonly walkSpeedMetersPerSecond: number;
  }>;
  readonly positionQuantizationMeters: number;
}

export interface AssertRouteRuntimeProbeReceiptContextInputV2 {
  readonly receipt: RouteRuntimeProbeReceiptV2;
  readonly routePathReceipt: RoutePathReceiptV2;
  readonly resolvedDriverProfile: ResolvedTraversalDriverProfileV1;
  readonly validationProfileIdentity: RouteRuntimeProbeValidationProfileIdentityV2;
}

function requirePositiveFinite(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): number {
  const result = requireFinite(value, path, prefix);
  if (!(result > 0)) fail(prefix, path, "must be > 0");
  return result;
}

function canonicalExpectedTraversalSurfaceIds(
  value: unknown,
  path: string,
  prefix: FailurePrefix,
): readonly string[] {
  if (!Array.isArray(value) || isEmpty(value)) {
    fail(prefix, path, "must be a non-empty array");
  }
  const ids = value.map((entry, index) =>
    requireString(entry, `${path}/${index}`, prefix),
  );
  const unique = [...new Set(ids)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  if (unique.length !== ids.length) {
    fail(prefix, path, "must not contain duplicate traversalSurfaceId values");
  }
  return unique;
}

function isSurfaceMismatchV2(
  evidence: TraversalRuntimeTickEvidenceV1,
  expectedTraversalSurfaceIds: readonly string[],
): boolean {
  if (evidence.characterSupport.supportState === "unsupported") return false;
  const resolution = evidence.characterSupport.surfaceResolution;
  return resolution.mode !== "resolved" ||
    !expectedTraversalSurfaceIds.includes(resolution.traversalSurfaceId);
}

function assertRuntimeEvidenceBindingsV2(
  evidence: TraversalRuntimeTickEvidenceV1,
  request: RouteRuntimeProbeRequestV2,
  fixedTimeStepSeconds: number,
  path: string,
): void {
  const prefix = "ROUTE_RUNTIME_PROBE_RECEIPT_INVALID";
  const expected: Readonly<Record<string, unknown>> = {
    traversingEntityId: request.traversingEntityId,
    authoringSpecHash: request.authoringSpecHash,
    layoutSolveReportHash: request.layoutSolveReportHash,
    resourceLockHash: request.resourceLockHash,
    executionPlanHash: request.executionPlanHash,
    resolvedTraversalLockHash: request.resolvedTraversalLockHash,
    runtimeImplementationIdentity: request.runtimeImplementationIdentity,
    fixedTimeStepSeconds,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    requireEqual(
      (evidence as unknown as UnknownRecord)[field],
      expectedValue,
      `${path}/${field}`,
      prefix,
    );
  }
}

function deriveMetricsV2(
  initial: TraversalRuntimeTickEvidenceV1,
  ticks: readonly RouteRuntimeProbeTickV2[],
  initialExpectedTraversalSurfaceIds: readonly string[],
): RouteRuntimeProbeMetricsV2 {
  let maximumStalledDurationTicks = 0;
  let maximumRouteDeviationMetersXZ = 0;
  let maximumConsecutiveUnexpectedUnsupportedTicks = 0;
  let slidingDurationTicks = 0;
  let unexpectedSupportLossCount = 0;
  let previousUnsupported = initial.characterSupport.supportState === "unsupported";
  let wrongSupportSurfaceCount = isSurfaceMismatchV2(
    initial,
    initialExpectedTraversalSurfaceIds,
  ) ? 1 : 0;

  for (const row of ticks) {
    maximumStalledDurationTicks = Math.max(
      maximumStalledDurationTicks,
      row.stalledDurationTicks,
    );
    maximumRouteDeviationMetersXZ = Math.max(
      maximumRouteDeviationMetersXZ,
      row.routeDeviationMetersXZ,
    );
    maximumConsecutiveUnexpectedUnsupportedTicks = Math.max(
      maximumConsecutiveUnexpectedUnsupportedTicks,
      row.consecutiveUnexpectedUnsupportedTicks,
    );
    if (row.runtimeEvidence.characterSupport.supportState === "sliding") {
      slidingDurationTicks += 1;
    }
    const unsupported =
      row.runtimeEvidence.characterSupport.supportState === "unsupported";
    if (unsupported && !previousUnsupported) unexpectedSupportLossCount += 1;
    previousUnsupported = unsupported;
    if (isSurfaceMismatchV2(row.runtimeEvidence, row.expectedTraversalSurfaceIds)) {
      wrongSupportSurfaceCount = 1;
    }
  }

  return {
    processedTickCount: ticks.length,
    maximumStalledDurationTicks,
    maximumRouteDeviationMetersXZ,
    maximumConsecutiveUnexpectedUnsupportedTicks,
    slidingDurationTicks,
    unexpectedSupportLossCount,
    wrongSupportSurfaceCount,
    invalidPhysicsValueCount: 0,
  };
}

function distancePointToSegment3d(
  point: Vec3,
  start: Vec3,
  end: Vec3,
): Readonly<{ distance: number; parameter: number }> {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  if (lengthSquared === 0) {
    return {
      distance: Math.hypot(point[0] - start[0], point[1] - start[1], point[2] - start[2]),
      parameter: 0,
    };
  }
  const rawParameter = (
    (point[0] - start[0]) * dx +
    (point[1] - start[1]) * dy +
    (point[2] - start[2]) * dz
  ) / lengthSquared;
  const parameter = Math.max(0, Math.min(1, rawParameter));
  const closest: Vec3 = [
    start[0] + dx * parameter,
    start[1] + dy * parameter,
    start[2] + dz * parameter,
  ];
  return {
    distance: Math.hypot(
      point[0] - closest[0],
      point[1] - closest[1],
      point[2] - closest[2],
    ),
    parameter,
  };
}

function polylineArcLengths(
  points: readonly Vec3[],
): Readonly<{
  readonly segmentLengths: readonly number[];
  readonly prefix: readonly number[];
  readonly total: number;
}> {
  const segmentLengths: number[] = [];
  const prefix: number[] = [0];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const length = Math.hypot(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2],
    );
    segmentLengths.push(length);
    prefix.push(prefix[index]! + length);
  }
  return {
    segmentLengths,
    prefix,
    total: prefix[prefix.length - 1]!,
  };
}

export function advanceRouteRuntimeProbeSupportStationV2(
  path: RoutePathReceiptV2,
  sampledFootPositionMetersXYZ: Vec3,
  previousArcLengthMeters: number,
  walkSpeedMetersPerSecond: number,
  positionQuantizationMeters: number,
  fixedTimeStepSeconds: number,
): Readonly<{
  readonly arcLengthMeters: number;
  readonly totalArcLengthMeters: number;
  readonly remainingArcLengthMeters: number;
  readonly expectedTraversalSurfaceIds: readonly string[];
  readonly retainedSegmentIndexes: readonly number[];
}> {
  const points = path.orderedPathPositionsMetersXYZ;
  const identities = path.orderedTraversalSurfaceIdentities;
  const polyline = polylineArcLengths(points);
  if (points.length === 1) {
    return {
      arcLengthMeters: 0,
      totalArcLengthMeters: 0,
      remainingArcLengthMeters: 0,
      expectedTraversalSurfaceIds: [identities[0]!.traversalSurfaceId],
      retainedSegmentIndexes: [],
    };
  }
  const maxForwardMeters =
    walkSpeedMetersPerSecond * fixedTimeStepSeconds + positionQuantizationMeters;
  const windowStart = Math.max(0, previousArcLengthMeters - positionQuantizationMeters);
  const windowEnd = Math.min(
    polyline.total,
    previousArcLengthMeters + maxForwardMeters,
  );
  const distances: number[] = [];
  let minimumDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polyline.segmentLengths.length; index += 1) {
    const segmentStartArc = polyline.prefix[index]!;
    const segmentLength = polyline.segmentLengths[index]!;
    const segmentEndArc = segmentStartArc + segmentLength;
    const clippedStart = Math.max(segmentStartArc, windowStart);
    const clippedEnd = Math.min(segmentEndArc, windowEnd);
    if (clippedStart > clippedEnd || segmentLength === 0) {
      distances.push(Number.POSITIVE_INFINITY);
      continue;
    }
    const startParameter = (clippedStart - segmentStartArc) / segmentLength;
    const endParameter = (clippedEnd - segmentStartArc) / segmentLength;
    const start = points[index]!;
    const end = points[index + 1]!;
    const clippedStartPoint: Vec3 = [
      start[0] + (end[0] - start[0]) * startParameter,
      start[1] + (end[1] - start[1]) * startParameter,
      start[2] + (end[2] - start[2]) * startParameter,
    ];
    const clippedEndPoint: Vec3 = [
      start[0] + (end[0] - start[0]) * endParameter,
      start[1] + (end[1] - start[1]) * endParameter,
      start[2] + (end[2] - start[2]) * endParameter,
    ];
    const projection = distancePointToSegment3d(
      sampledFootPositionMetersXYZ,
      clippedStartPoint,
      clippedEndPoint,
    );
    distances.push(projection.distance);
    if (projection.distance < minimumDistance) {
      minimumDistance = projection.distance;
    }
  }
  const tieThreshold = positionQuantizationMeters / 2;
  const candidateIndexes: number[] = [];
  for (let index = 0; index < distances.length; index += 1) {
    if (distances[index]! <= minimumDistance + tieThreshold) {
      candidateIndexes.push(index);
    }
  }
  const primaryIndex = candidateIndexes.reduce((best, index) => {
    const bestDistance = distances[best]!;
    const candidateDistance = distances[index]!;
    if (candidateDistance < bestDistance) return index;
    if (candidateDistance > bestDistance) return best;
    const bestArc = polyline.prefix[best]!;
    const candidateArc = polyline.prefix[index]!;
    const bestDelta = Math.abs(bestArc - previousArcLengthMeters);
    const candidateDelta = Math.abs(candidateArc - previousArcLengthMeters);
    if (candidateDelta < bestDelta) return index;
    if (candidateDelta > bestDelta) return best;
    return index < best ? index : best;
  }, candidateIndexes[0] ?? 0);
  const candidateSet = new Set(candidateIndexes);
  let low = primaryIndex;
  let high = primaryIndex;
  while (candidateSet.has(low - 1)) low -= 1;
  while (candidateSet.has(high + 1)) high += 1;
  const retainedSegmentIndexes: number[] = [];
  for (let index = low; index <= high; index += 1) {
    retainedSegmentIndexes.push(index);
  }
  const expectedIds = new Set<string>();
  for (const index of retainedSegmentIndexes) {
    expectedIds.add(identities[index]!.traversalSurfaceId);
    expectedIds.add(identities[index + 1]!.traversalSurfaceId);
  }
  const primaryStart = points[primaryIndex]!;
  const primaryEnd = points[primaryIndex + 1]!;
  const primaryProjection = distancePointToSegment3d(
    sampledFootPositionMetersXYZ,
    primaryStart,
    primaryEnd,
  );
  const nextArc = Math.max(
    windowStart,
    Math.min(
      windowEnd,
      polyline.prefix[primaryIndex]! +
        primaryProjection.parameter * polyline.segmentLengths[primaryIndex]!,
    ),
  );
  return {
    arcLengthMeters: nextArc,
    totalArcLengthMeters: polyline.total,
    remainingArcLengthMeters: Math.max(0, polyline.total - nextArc),
    expectedTraversalSurfaceIds: [...expectedIds].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
    retainedSegmentIndexes,
  };
}

export function canonicalRouteRuntimeProbeRequestV2(
  value: unknown,
): RouteRuntimeProbeRequestV2 {
  const prefix = "ROUTE_RUNTIME_PROBE_REQUEST_INVALID";
  const record = requireExactRecord(value, REQUEST_FIELDS_V2, "", prefix);
  if (record.kind !== "route-runtime-probe-request") {
    fail(prefix, "kind", "must be 'route-runtime-probe-request'");
  }
  if (record.schemaVersion !== 2) fail(prefix, "schemaVersion", "must be 2");
  const strings = {
    constraintId: requireString(record.constraintId, "constraintId", prefix),
    routeId: requireString(record.routeId, "routeId", prefix),
    traversingEntityId: requireString(
      record.traversingEntityId,
      "traversingEntityId",
      prefix,
    ),
    startAnchorEntityId: requireString(
      record.startAnchorEntityId,
      "startAnchorEntityId",
      prefix,
    ),
    destinationAnchorEntityId: requireString(
      record.destinationAnchorEntityId,
      "destinationAnchorEntityId",
      prefix,
    ),
    driverProfileRef: requireString(
      record.driverProfileRef,
      "driverProfileRef",
      prefix,
    ),
    driverResolvedVersion: requireString(
      record.driverResolvedVersion,
      "driverResolvedVersion",
      prefix,
    ),
    validationProfileRef: requireString(
      record.validationProfileRef,
      "validationProfileRef",
      prefix,
    ),
    validationProfileVersion: requireString(
      record.validationProfileVersion,
      "validationProfileVersion",
      prefix,
    ),
  } as const;
  if (strings.startAnchorEntityId === strings.destinationAnchorEntityId) {
    fail(prefix, "startAnchorEntityId", "must differ from destinationAnchorEntityId");
  }
  const hashes = {
    routePathReceiptHash: requireHash(
      record.routePathReceiptHash,
      "routePathReceiptHash",
      prefix,
    ),
    authoringSpecHash: requireHash(record.authoringSpecHash, "authoringSpecHash", prefix),
    layoutSolveReportHash: requireHash(
      record.layoutSolveReportHash,
      "layoutSolveReportHash",
      prefix,
    ),
    resourceLockHash: requireHash(record.resourceLockHash, "resourceLockHash", prefix),
    executionPlanHash: requireHash(record.executionPlanHash, "executionPlanHash", prefix),
    routeBuildInputHash: requireHash(
      record.routeBuildInputHash,
      "routeBuildInputHash",
      prefix,
    ),
    traversalGraphHash: requireHash(record.traversalGraphHash, "traversalGraphHash", prefix),
    resolvedTraversalLockHash: requireHash(
      record.resolvedTraversalLockHash,
      "resolvedTraversalLockHash",
      prefix,
    ),
    driverProfileHash: requireHash(record.driverProfileHash, "driverProfileHash", prefix),
    validationProfileHash: requireHash(
      record.validationProfileHash,
      "validationProfileHash",
      prefix,
    ),
  } as const;
  assertResolvedDriverIdentity(
    strings.driverProfileRef,
    strings.driverResolvedVersion,
    hashes.driverProfileHash,
    prefix,
  );
  return deepFreeze({
    kind: "route-runtime-probe-request",
    schemaVersion: 2,
    routePathReceiptHash: hashes.routePathReceiptHash,
    constraintId: strings.constraintId,
    routeId: strings.routeId,
    traversingEntityId: strings.traversingEntityId,
    startAnchorEntityId: strings.startAnchorEntityId,
    destinationAnchorEntityId: strings.destinationAnchorEntityId,
    authoringSpecHash: hashes.authoringSpecHash,
    layoutSolveReportHash: hashes.layoutSolveReportHash,
    resourceLockHash: hashes.resourceLockHash,
    executionPlanHash: hashes.executionPlanHash,
    routeBuildInputHash: hashes.routeBuildInputHash,
    traversalGraphHash: hashes.traversalGraphHash,
    resolvedTraversalLockHash: hashes.resolvedTraversalLockHash,
    driverProfileRef: strings.driverProfileRef,
    driverResolvedVersion: strings.driverResolvedVersion,
    driverProfileHash: hashes.driverProfileHash,
    validationProfileRef: strings.validationProfileRef,
    validationProfileVersion: strings.validationProfileVersion,
    validationProfileHash: hashes.validationProfileHash,
    runtimeImplementationIdentity: canonicalRuntimeIdentity(
      record.runtimeImplementationIdentity,
      "runtimeImplementationIdentity",
      prefix,
    ),
    walkSpeedMetersPerSecond: requirePositiveFinite(
      record.walkSpeedMetersPerSecond,
      "walkSpeedMetersPerSecond",
      prefix,
    ),
    positionQuantizationMeters: requirePositiveFinite(
      record.positionQuantizationMeters,
      "positionQuantizationMeters",
      prefix,
    ),
  });
}

export function hashRouteRuntimeProbeRequestV2(value: unknown): Sha256Hash {
  return sha256CanonicalJson(
    canonicalRouteRuntimeProbeRequestV2(value),
  ) as Sha256Hash;
}

export function createRouteRuntimeProbeRequestV2(
  input: CreateRouteRuntimeProbeRequestInputV2,
): RouteRuntimeProbeRequestV2 {
  const prefix = "ROUTE_RUNTIME_PROBE_REQUEST_INVALID";
  let path: RoutePathReceiptV2;
  try {
    path = canonicalRoutePathReceiptV2(input.routePathReceipt);
  } catch {
    fail(prefix, "routePathReceipt", "must be a canonical Path Receipt V2");
  }
  const driver = assertResolvedDriverInput(input.resolvedDriverProfile, prefix);
  const validation = canonicalValidationIdentity(
    input.validationProfileIdentity,
    "validationProfileIdentity",
    prefix,
  );
  let builder;
  try {
    builder = resolveTraversalGraphBuilderProfileV2(path.graphBuilderProfileRef);
  } catch {
    fail(prefix, "routePathReceipt", "must bind a Registry Graph Builder Profile V2");
  }
  if (
    builder.resolvedVersion !== path.graphBuilderResolvedVersion ||
    builder.contentHash !== path.graphBuilderProfileHash
  ) {
    fail(prefix, "routePathReceipt", "must match the Registry Graph Builder Profile identity");
  }
  if (isNil(input.resolvedControlFeelProfile) || isEmpty(input.resolvedControlFeelProfile)) {
    fail(prefix, "resolvedControlFeelProfile", "must be a resolved control-feel profile");
  }
  const walkSpeedMetersPerSecond = requirePositiveFinite(
    input.resolvedControlFeelProfile.walkSpeedMetersPerSecond,
    "resolvedControlFeelProfile/walkSpeedMetersPerSecond",
    prefix,
  );
  const positionQuantizationMeters = requirePositiveFinite(
    input.positionQuantizationMeters,
    "positionQuantizationMeters",
    prefix,
  );
  if (positionQuantizationMeters !== builder.profile.positionQuantizationMeters) {
    fail(
      prefix,
      "positionQuantizationMeters",
      "must equal the Graph Builder Profile positionQuantizationMeters",
    );
  }
  const port = requireObject(input.runtimePort, "runtimePort", prefix);
  let portSnapshot: UnknownRecord;
  try {
    portSnapshot = {
      kind: port.kind,
      schemaVersion: port.schemaVersion,
      traversingEntityId: port.traversingEntityId,
      authoringSpecHash: port.authoringSpecHash,
      layoutSolveReportHash: port.layoutSolveReportHash,
      resourceLockHash: port.resourceLockHash,
      executionPlanHash: port.executionPlanHash,
      resolvedTraversalLockHash: port.resolvedTraversalLockHash,
      runtimeImplementationIdentity: port.runtimeImplementationIdentity,
      readLatestTickEvidence: port.readLatestTickEvidence,
      resetToStartAnchor: port.resetToStartAnchor,
      runFixedTick: port.runFixedTick,
    };
  } catch {
    fail(prefix, "runtimePort", "provider-neutral identity unavailable");
  }
  if (
    portSnapshot.kind !== "traversal-runtime-port" ||
    portSnapshot.schemaVersion !== 1
  ) {
    fail(prefix, "runtimePort", "must be a Traversal Runtime Port V1");
  }
  if (
    typeof portSnapshot.readLatestTickEvidence !== "function" ||
    typeof portSnapshot.resetToStartAnchor !== "function" ||
    typeof portSnapshot.runFixedTick !== "function"
  ) {
    fail(prefix, "runtimePort", "must expose the closed Runtime Port operations");
  }
  const runtimeIdentity = canonicalRuntimeIdentity(
    portSnapshot.runtimeImplementationIdentity,
    "runtimePort/runtimeImplementationIdentity",
    prefix,
  );
  const portBindings: Readonly<Record<string, unknown>> = {
    traversingEntityId: portSnapshot.traversingEntityId,
    authoringSpecHash: portSnapshot.authoringSpecHash,
    layoutSolveReportHash: portSnapshot.layoutSolveReportHash,
    resourceLockHash: portSnapshot.resourceLockHash,
    resolvedTraversalLockHash: portSnapshot.resolvedTraversalLockHash,
  };
  const pathBindings: Readonly<Record<string, unknown>> = {
    traversingEntityId: path.traversingEntityId,
    authoringSpecHash: path.authoringSpecHash,
    layoutSolveReportHash: path.layoutSolveReportHash,
    resourceLockHash: path.resourceLockHash,
    resolvedTraversalLockHash: path.resolvedTraversalLockHash,
  };
  for (const field of Object.keys(pathBindings)) {
    requireEqual(
      portBindings[field],
      pathBindings[field],
      `runtimePort/${field}`,
      prefix,
    );
  }
  return canonicalRouteRuntimeProbeRequestV2({
    kind: "route-runtime-probe-request",
    schemaVersion: 2,
    routePathReceiptHash: hashRoutePathReceiptV2(path),
    constraintId: path.constraintId,
    routeId: path.routeId,
    traversingEntityId: path.traversingEntityId,
    startAnchorEntityId: path.startAnchorEntityId,
    destinationAnchorEntityId: path.destinationAnchorEntityId,
    authoringSpecHash: path.authoringSpecHash,
    layoutSolveReportHash: path.layoutSolveReportHash,
    resourceLockHash: path.resourceLockHash,
    executionPlanHash: requireHash(
      portSnapshot.executionPlanHash,
      "runtimePort/executionPlanHash",
      prefix,
    ),
    routeBuildInputHash: path.routeBuildInputHash,
    traversalGraphHash: path.traversalGraphHash,
    resolvedTraversalLockHash: path.resolvedTraversalLockHash,
    driverProfileRef: driver.resourceRef,
    driverResolvedVersion: driver.resolvedVersion,
    driverProfileHash: driver.contentHash,
    validationProfileRef: validation.resourceRef,
    validationProfileVersion: validation.version,
    validationProfileHash: validation.contentHash,
    runtimeImplementationIdentity: runtimeIdentity,
    walkSpeedMetersPerSecond,
    positionQuantizationMeters,
  });
}

export function canonicalRouteRuntimeProbeTickV2(
  value: unknown,
): RouteRuntimeProbeTickV2 {
  const prefix = "ROUTE_RUNTIME_PROBE_TICK_INVALID";
  const record = requireExactRecord(value, TICK_FIELDS_V2, "", prefix);
  if (record.kind !== "route-runtime-probe-tick") {
    fail(prefix, "kind", "must be 'route-runtime-probe-tick'");
  }
  if (record.schemaVersion !== 2) fail(prefix, "schemaVersion", "must be 2");
  return deepFreeze({
    kind: "route-runtime-probe-tick",
    schemaVersion: 2,
    probeTick: requirePositiveInteger(record.probeTick, "probeTick", prefix),
    runtimeEvidence: canonicalRuntimeEvidence(
      record.runtimeEvidence,
      "runtimeEvidence",
      prefix,
    ),
    walkDirectionWorldXZ: requireVec2(
      record.walkDirectionWorldXZ,
      "walkDirectionWorldXZ",
      prefix,
    ),
    routeProgressMetersXZ: requireNonNegative(
      record.routeProgressMetersXZ,
      "routeProgressMetersXZ",
      prefix,
    ),
    remainingRouteDistanceMetersXZ: requireNonNegative(
      record.remainingRouteDistanceMetersXZ,
      "remainingRouteDistanceMetersXZ",
      prefix,
    ),
    routeDeviationMetersXZ: requireNonNegative(
      record.routeDeviationMetersXZ,
      "routeDeviationMetersXZ",
      prefix,
    ),
    stalledDurationTicks: requireNonNegativeInteger(
      record.stalledDurationTicks,
      "stalledDurationTicks",
      prefix,
    ),
    consecutiveUnexpectedUnsupportedTicks: requireNonNegativeInteger(
      record.consecutiveUnexpectedUnsupportedTicks,
      "consecutiveUnexpectedUnsupportedTicks",
      prefix,
    ),
    expectedTraversalSurfaceIds: canonicalExpectedTraversalSurfaceIds(
      record.expectedTraversalSurfaceIds,
      "expectedTraversalSurfaceIds",
      prefix,
    ),
  });
}

export function hashRouteRuntimeProbeTickV2(value: unknown): Sha256Hash {
  return sha256CanonicalJson(canonicalRouteRuntimeProbeTickV2(value)) as Sha256Hash;
}

function assertFailureConsistencyV2(
  failure: RouteRuntimeProbeFailureV2,
  initial: TraversalRuntimeTickEvidenceV1,
  ticks: readonly RouteRuntimeProbeTickV2[],
  initialExpectedTraversalSurfaceIds: readonly string[],
): void {
  const prefix = "ROUTE_RUNTIME_PROBE_RECEIPT_INVALID";
  const finalRow = ticks.at(-1);
  const referencedEvidence = failure.failureProbeTick === 0
    ? initial
    : finalRow?.runtimeEvidence;
  if (isNil(referencedEvidence)) {
    fail(prefix, "failure/failureProbeTick", "must reference initial or final evidence");
  }
  if (
    failure.failureProbeTick !== 0 &&
    (isNil(finalRow) || failure.failureProbeTick !== finalRow.probeTick)
  ) {
    fail(prefix, "failure/failureProbeTick", "must reference the final Tick row");
  }
  requireEqual(
    failure.failurePositionMetersXYZ,
    referencedEvidence.subjectPositionMetersXYZ,
    "failure/failurePositionMetersXYZ",
    prefix,
  );
  switch (failure.kind) {
    case "start-support-invalid":
      if (
        failure.failureProbeTick !== 0 ||
        initial.characterSupport.supportState !== failure.supportState
      ) {
        fail(prefix, "failure", "must match unsupported initial Runtime evidence");
      }
      return;
    case "support-surface-mismatch": {
      const expectedIds = failure.failureProbeTick === 0
        ? initialExpectedTraversalSurfaceIds
        : finalRow!.expectedTraversalSurfaceIds;
      const support = referencedEvidence.characterSupport;
      if (
        support.supportState !== failure.supportState ||
        support.surfaceResolution.mode !== failure.surfaceResolutionMode ||
        !isSurfaceMismatchV2(referencedEvidence, expectedIds)
      ) {
        fail(prefix, "failure", "must match surface-mismatched Runtime evidence");
      }
      return;
    }
    case "runtime-stalled":
      if (
        failure.failureProbeTick === 0 ||
        finalRow?.stalledDurationTicks !== failure.stalledDurationTicks
      ) {
        fail(prefix, "failure/stalledDurationTicks", "must match the final Tick row");
      }
      return;
    case "runtime-deviated":
      if (
        failure.failureProbeTick === 0 ||
        finalRow?.routeDeviationMetersXZ !== failure.routeDeviationMetersXZ
      ) {
        fail(prefix, "failure/routeDeviationMetersXZ", "must match the final Tick row");
      }
      return;
    case "runtime-support-lost":
      if (
        failure.failureProbeTick === 0 ||
        finalRow?.runtimeEvidence.characterSupport.supportState !== "unsupported" ||
        finalRow.consecutiveUnexpectedUnsupportedTicks !==
          failure.consecutiveUnexpectedUnsupportedTicks
      ) {
        fail(prefix, "failure", "must match unsupported final Tick evidence");
      }
      return;
    case "maximum-probe-ticks-reached":
      if (
        failure.failureProbeTick === 0 ||
        failure.processedTickCount !== ticks.length
      ) {
        fail(prefix, "failure/processedTickCount", "must equal ticks.length");
      }
      return;
    default:
      fail(prefix, "failure/kind", "must be a closed Probe failure kind");
  }
}

export function canonicalRouteRuntimeProbeReceiptV2(
  value: unknown,
): RouteRuntimeProbeReceiptV2 {
  const prefix = "ROUTE_RUNTIME_PROBE_RECEIPT_INVALID";
  const base = requireRecord(value, "", prefix);
  const fields = base.status === "complete"
    ? COMPLETE_RECEIPT_FIELDS
    : base.status === "failed"
      ? FAILED_RECEIPT_FIELDS
      : undefined;
  if (isNil(fields)) fail(prefix, "status", "must be 'complete' or 'failed'");
  const record = requireExactRecord(value, fields, "", prefix);
  if (record.kind !== "route-runtime-probe-receipt") {
    fail(prefix, "kind", "must be 'route-runtime-probe-receipt'");
  }
  if (record.schemaVersion !== 2) fail(prefix, "schemaVersion", "must be 2");
  let request: RouteRuntimeProbeRequestV2;
  try {
    request = canonicalRouteRuntimeProbeRequestV2(record.request);
  } catch {
    fail(prefix, "request", "must be a canonical Route Runtime Probe Request V2");
  }
  const initialRuntimeEvidence = canonicalRuntimeEvidence(
    record.initialRuntimeEvidence,
    "initialRuntimeEvidence",
    prefix,
  );
  if (initialRuntimeEvidence.tick !== 0) {
    fail(prefix, "initialRuntimeEvidence/tick", "must be 0");
  }
  assertRuntimeEvidenceBindingsV2(
    initialRuntimeEvidence,
    request,
    initialRuntimeEvidence.fixedTimeStepSeconds,
    "initialRuntimeEvidence",
  );
  if (!Array.isArray(record.ticks)) fail(prefix, "ticks", "must be an array");
  const ticks = record.ticks.map((rawTick, index) => {
    let row: RouteRuntimeProbeTickV2;
    try {
      row = canonicalRouteRuntimeProbeTickV2(rawTick);
    } catch {
      fail(prefix, `ticks/${index}`, "must be a canonical Route Runtime Probe Tick V2");
    }
    const expectedProbeTick = index + 1;
    if (row.probeTick !== expectedProbeTick) {
      fail(prefix, `ticks/${index}/probeTick`, "must be consecutive from 1");
    }
    if (row.runtimeEvidence.tick !== row.probeTick) {
      fail(prefix, `ticks/${index}/runtimeEvidence/tick`, "must equal probeTick");
    }
    assertRuntimeEvidenceBindingsV2(
      row.runtimeEvidence,
      request,
      initialRuntimeEvidence.fixedTimeStepSeconds,
      `ticks/${index}/runtimeEvidence`,
    );
    return row;
  });
  const firstMismatchIndex = ticks.findIndex((row) =>
    isSurfaceMismatchV2(row.runtimeEvidence, row.expectedTraversalSurfaceIds)
  );
  const initialSurfaceResolution =
    initialRuntimeEvidence.characterSupport.surfaceResolution;
  const hasInitialUnresolvedSurface =
    initialRuntimeEvidence.characterSupport.supportState !== "unsupported" &&
    initialSurfaceResolution.mode !== "resolved";
  if (ticks.length > 0 && hasInitialUnresolvedSurface) {
    fail(prefix, "ticks", "must be empty after initial support-surface mismatch");
  }
  if (firstMismatchIndex >= 0 && firstMismatchIndex !== ticks.length - 1) {
    fail(prefix, "ticks", "must stop at the first support-surface mismatch");
  }
  const metrics = canonicalMetrics(record.metrics);
  const derivedMetrics = ticks.length === 0
    ? {
        processedTickCount: 0,
        maximumStalledDurationTicks: 0,
        maximumRouteDeviationMetersXZ: 0,
        maximumConsecutiveUnexpectedUnsupportedTicks: 0,
        slidingDurationTicks: 0,
        unexpectedSupportLossCount: 0,
        wrongSupportSurfaceCount:
          record.status === "failed" &&
          canonicalFailure(record.failure).kind === "support-surface-mismatch"
            ? 1
            : 0,
        invalidPhysicsValueCount: 0,
      }
    : deriveMetricsV2(
        initialRuntimeEvidence,
        ticks,
        initialSurfaceResolution.mode === "resolved"
          ? [initialSurfaceResolution.traversalSurfaceId]
          : [],
      );
  requireEqual(
    metrics,
    derivedMetrics,
    "metrics",
    prefix,
  );
  if (metrics.invalidPhysicsValueCount !== 0) {
    fail(prefix, "metrics/invalidPhysicsValueCount", "must be 0");
  }
  if (record.status === "complete") {
    const finalTick = ticks.at(-1);
    if (
      initialRuntimeEvidence.characterSupport.supportState === "unsupported" ||
      hasInitialUnresolvedSurface ||
      firstMismatchIndex >= 0 ||
      finalTick?.runtimeEvidence.characterSupport.supportState === "unsupported"
    ) {
      fail(prefix, "status", "complete cannot contain invalid initial or surface evidence");
    }
    const completionDurationTicks = requireNonNegativeInteger(
      record.completionDurationTicks,
      "completionDurationTicks",
      prefix,
    );
    if (completionDurationTicks !== metrics.processedTickCount) {
      fail(prefix, "completionDurationTicks", "must equal processedTickCount");
    }
    if (
      !isNil(finalTick) &&
      finalTick.remainingRouteDistanceMetersXZ !== 0
    ) {
      fail(
        prefix,
        "ticks",
        "complete final Tick must have zero remainingRouteDistanceMetersXZ",
      );
    }
    return deepFreeze({
      kind: "route-runtime-probe-receipt",
      schemaVersion: 2,
      status: "complete",
      request,
      initialRuntimeEvidence,
      ticks,
      metrics,
      completionDurationTicks,
    });
  }
  const failure = canonicalFailure(record.failure);
  assertFailureConsistencyV2(
    failure,
    initialRuntimeEvidence,
    ticks,
    ticks[0]?.expectedTraversalSurfaceIds ?? [],
  );
  if (
    initialRuntimeEvidence.characterSupport.supportState === "unsupported" &&
    failure.kind !== "start-support-invalid"
  ) {
    fail(prefix, "failure/kind", "must report invalid initial support");
  }
  if (
    initialRuntimeEvidence.characterSupport.supportState === "unsupported" &&
    ticks.length !== 0
  ) {
    fail(prefix, "ticks", "must be empty after invalid initial support");
  }
  if (
    firstMismatchIndex >= 0 &&
    (failure.kind !== "support-surface-mismatch" ||
      failure.failureProbeTick !== ticks[firstMismatchIndex]?.probeTick)
  ) {
    fail(prefix, "failure/kind", "must report the first Tick support-surface mismatch");
  }
  return deepFreeze({
    kind: "route-runtime-probe-receipt",
    schemaVersion: 2,
    status: "failed",
    request,
    initialRuntimeEvidence,
    ticks,
    metrics,
    failure,
  });
}

export function hashRouteRuntimeProbeReceiptV2(value: unknown): Sha256Hash {
  return sha256CanonicalJson(
    canonicalRouteRuntimeProbeReceiptV2(value),
  ) as Sha256Hash;
}

export function assertRouteRuntimeProbeReceiptContextV2(
  input: AssertRouteRuntimeProbeReceiptContextInputV2,
): RouteRuntimeProbeReceiptV2 {
  const prefix = "ROUTE_RUNTIME_PROBE_CONTEXT_INVALID";
  let receipt: RouteRuntimeProbeReceiptV2;
  let path: RoutePathReceiptV2;
  try {
    receipt = canonicalRouteRuntimeProbeReceiptV2(input.receipt);
    path = canonicalRoutePathReceiptV2(input.routePathReceipt);
  } catch {
    fail(prefix, "", "requires canonical Receipt and Path evidence");
  }
  const driver = assertResolvedDriverInput(input.resolvedDriverProfile, prefix);
  const validation = canonicalValidationIdentity(
    input.validationProfileIdentity,
    "validationProfileIdentity",
    prefix,
  );
  let builder;
  try {
    builder = resolveTraversalGraphBuilderProfileV2(path.graphBuilderProfileRef);
  } catch {
    fail(prefix, "routePathReceipt", "must bind a Registry Graph Builder Profile V2");
  }
  const expected: Readonly<Record<string, unknown>> = {
    routePathReceiptHash: hashRoutePathReceiptV2(path),
    constraintId: path.constraintId,
    routeId: path.routeId,
    traversingEntityId: path.traversingEntityId,
    startAnchorEntityId: path.startAnchorEntityId,
    destinationAnchorEntityId: path.destinationAnchorEntityId,
    authoringSpecHash: path.authoringSpecHash,
    layoutSolveReportHash: path.layoutSolveReportHash,
    resourceLockHash: path.resourceLockHash,
    routeBuildInputHash: path.routeBuildInputHash,
    traversalGraphHash: path.traversalGraphHash,
    resolvedTraversalLockHash: path.resolvedTraversalLockHash,
    driverProfileRef: driver.resourceRef,
    driverResolvedVersion: driver.resolvedVersion,
    driverProfileHash: driver.contentHash,
    validationProfileRef: validation.resourceRef,
    validationProfileVersion: validation.version,
    validationProfileHash: validation.contentHash,
    positionQuantizationMeters: builder.profile.positionQuantizationMeters,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    requireEqual(
      (receipt.request as unknown as UnknownRecord)[field],
      expectedValue,
      `request/${field}`,
      prefix,
    );
  }
  let stationArc = 0;
  const initialStation = advanceRouteRuntimeProbeSupportStationV2(
    path,
    receipt.initialRuntimeEvidence.characterSupport.sampledFootPositionMetersXYZ,
    0,
    receipt.request.walkSpeedMetersPerSecond,
    receipt.request.positionQuantizationMeters,
    receipt.initialRuntimeEvidence.fixedTimeStepSeconds,
  );
  stationArc = initialStation.arcLengthMeters;
  if (isSurfaceMismatchV2(
    receipt.initialRuntimeEvidence,
    initialStation.expectedTraversalSurfaceIds,
  )) {
    if (
      receipt.ticks.length !== 0 ||
      receipt.status !== "failed" ||
      receipt.failure.kind !== "support-surface-mismatch" ||
      receipt.failure.failureProbeTick !== 0
    ) {
      fail(prefix, "failure", "must report initial support-surface mismatch");
    }
  }
  for (const [index, row] of receipt.ticks.entries()) {
    const station = advanceRouteRuntimeProbeSupportStationV2(
      path,
      row.runtimeEvidence.characterSupport.sampledFootPositionMetersXYZ,
      stationArc,
      receipt.request.walkSpeedMetersPerSecond,
      receipt.request.positionQuantizationMeters,
      row.runtimeEvidence.fixedTimeStepSeconds,
    );
    requireEqual(
      row.expectedTraversalSurfaceIds,
      station.expectedTraversalSurfaceIds,
      `ticks/${index}/expectedTraversalSurfaceIds`,
      prefix,
    );
    stationArc = station.arcLengthMeters;
  }
  return receipt;
}
