import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEqual, isNil, isPlainObject } from "lodash-es";

import {
  canonicalRoutePathReceiptV1,
  hashRoutePathReceiptV1,
  type RoutePathReceiptV1,
} from "./path-receipt.js";
import { resolveTraversalDriverProfileV1 } from "./profile-registry.js";
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

export interface RouteRuntimeProbeValidationProfileIdentityV1 {
  readonly resourceRef: string;
  readonly version: string;
  readonly contentHash: Sha256Hash;
}

export interface RouteRuntimeProbeRequestV1 {
  readonly kind: "route-runtime-probe-request";
  readonly schemaVersion: 1;
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
  readonly traversalSurfaceIdentity: TraversalSurfaceIdentityV1;
  readonly driverProfileRef: string;
  readonly driverResolvedVersion: string;
  readonly driverProfileHash: Sha256Hash;
  readonly validationProfileRef: string;
  readonly validationProfileVersion: string;
  readonly validationProfileHash: Sha256Hash;
  readonly runtimeImplementationIdentity: TraversalRuntimeImplementationIdentityV1;
}

export interface RouteRuntimeProbeTickV1 {
  readonly kind: "route-runtime-probe-tick";
  readonly schemaVersion: 1;
  readonly probeTick: number;
  readonly runtimeEvidence: TraversalRuntimeTickEvidenceV1;
  readonly walkDirectionWorldXZ: Vec2;
  readonly routeProgressMetersXZ: number;
  readonly remainingRouteDistanceMetersXZ: number;
  readonly routeDeviationMetersXZ: number;
  readonly stalledDurationTicks: number;
  readonly consecutiveUnexpectedUnsupportedTicks: number;
}

export interface RouteRuntimeProbeMetricsV1 {
  readonly processedTickCount: number;
  readonly maximumStalledDurationTicks: number;
  readonly maximumRouteDeviationMetersXZ: number;
  readonly maximumConsecutiveUnexpectedUnsupportedTicks: number;
  readonly slidingDurationTicks: number;
  readonly unexpectedSupportLossCount: number;
  readonly wrongSupportSurfaceCount: number;
  readonly invalidPhysicsValueCount: number;
}

interface RouteRuntimeProbeFailureBaseV1 {
  readonly failureProbeTick: number;
  readonly failurePositionMetersXYZ: Vec3;
}

export type RouteRuntimeProbeFailureV1 =
  | Readonly<RouteRuntimeProbeFailureBaseV1 & {
      kind: "start-support-invalid";
      supportState: "unsupported";
    }>
  | Readonly<RouteRuntimeProbeFailureBaseV1 & {
      kind: "support-surface-mismatch";
      supportState: "supported" | "sliding";
      surfaceResolutionMode: "unmatched" | "ambiguous" | "resolved";
    }>
  | Readonly<RouteRuntimeProbeFailureBaseV1 & {
      kind: "runtime-stalled";
      stalledDurationTicks: number;
    }>
  | Readonly<RouteRuntimeProbeFailureBaseV1 & {
      kind: "runtime-deviated";
      routeDeviationMetersXZ: number;
    }>
  | Readonly<RouteRuntimeProbeFailureBaseV1 & {
      kind: "runtime-support-lost";
      consecutiveUnexpectedUnsupportedTicks: number;
    }>
  | Readonly<RouteRuntimeProbeFailureBaseV1 & {
      kind: "maximum-probe-ticks-reached";
      processedTickCount: number;
    }>;

interface RouteRuntimeProbeReceiptBaseV1 {
  readonly kind: "route-runtime-probe-receipt";
  readonly schemaVersion: 1;
  readonly request: RouteRuntimeProbeRequestV1;
  readonly initialRuntimeEvidence: TraversalRuntimeTickEvidenceV1;
  readonly ticks: readonly RouteRuntimeProbeTickV1[];
  readonly metrics: RouteRuntimeProbeMetricsV1;
}

export type RouteRuntimeProbeReceiptV1 =
  | Readonly<RouteRuntimeProbeReceiptBaseV1 & {
      status: "complete";
      completionDurationTicks: number;
    }>
  | Readonly<RouteRuntimeProbeReceiptBaseV1 & {
      status: "failed";
      failure: RouteRuntimeProbeFailureV1;
    }>;

export interface CreateRouteRuntimeProbeRequestInputV1 {
  readonly routePathReceipt: RoutePathReceiptV1;
  readonly resolvedDriverProfile: ResolvedTraversalDriverProfileV1;
  readonly runtimePort: TraversalRuntimePortV1;
  readonly validationProfileIdentity: RouteRuntimeProbeValidationProfileIdentityV1;
}

export interface AssertRouteRuntimeProbeReceiptContextInputV1 {
  readonly receipt: RouteRuntimeProbeReceiptV1;
  readonly routePathReceipt: RoutePathReceiptV1;
  readonly resolvedDriverProfile: ResolvedTraversalDriverProfileV1;
  readonly validationProfileIdentity: RouteRuntimeProbeValidationProfileIdentityV1;
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DIRECTION_LENGTH_TOLERANCE = 1e-9;

const REQUEST_FIELDS = [
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
  "traversalSurfaceIdentity",
  "driverProfileRef",
  "driverResolvedVersion",
  "driverProfileHash",
  "validationProfileRef",
  "validationProfileVersion",
  "validationProfileHash",
  "runtimeImplementationIdentity",
] as const;

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
): RouteRuntimeProbeValidationProfileIdentityV1 {
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

export function canonicalRouteRuntimeProbeRequestV1(
  value: unknown,
): RouteRuntimeProbeRequestV1 {
  const prefix = "ROUTE_RUNTIME_PROBE_REQUEST_INVALID";
  const record = requireExactRecord(value, REQUEST_FIELDS, "", prefix);
  if (record.kind !== "route-runtime-probe-request") {
    fail(prefix, "kind", "must be 'route-runtime-probe-request'");
  }
  if (record.schemaVersion !== 1) fail(prefix, "schemaVersion", "must be 1");

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
    schemaVersion: 1,
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
    traversalSurfaceIdentity: canonicalSurfaceIdentity(
      record.traversalSurfaceIdentity,
      "traversalSurfaceIdentity",
      prefix,
    ),
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
  });
}

export function hashRouteRuntimeProbeRequestV1(value: unknown): Sha256Hash {
  return sha256CanonicalJson(
    canonicalRouteRuntimeProbeRequestV1(value),
  ) as Sha256Hash;
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

export function createRouteRuntimeProbeRequestV1(
  input: CreateRouteRuntimeProbeRequestInputV1,
): RouteRuntimeProbeRequestV1 {
  const prefix = "ROUTE_RUNTIME_PROBE_REQUEST_INVALID";
  let path: RoutePathReceiptV1;
  try {
    path = canonicalRoutePathReceiptV1(input.routePathReceipt);
  } catch {
    fail(prefix, "routePathReceipt", "must be a canonical Path Receipt");
  }
  const driver = assertResolvedDriverInput(input.resolvedDriverProfile, prefix);
  const validation = canonicalValidationIdentity(
    input.validationProfileIdentity,
    "validationProfileIdentity",
    prefix,
  );
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

  return canonicalRouteRuntimeProbeRequestV1({
    kind: "route-runtime-probe-request",
    schemaVersion: 1,
    routePathReceiptHash: hashRoutePathReceiptV1(path),
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
    traversalSurfaceIdentity: path.traversalSurfaceIdentity,
    driverProfileRef: driver.resourceRef,
    driverResolvedVersion: driver.resolvedVersion,
    driverProfileHash: driver.contentHash,
    validationProfileRef: validation.resourceRef,
    validationProfileVersion: validation.version,
    validationProfileHash: validation.contentHash,
    runtimeImplementationIdentity: runtimeIdentity,
  });
}

export function canonicalRouteRuntimeProbeTickV1(
  value: unknown,
): RouteRuntimeProbeTickV1 {
  const prefix = "ROUTE_RUNTIME_PROBE_TICK_INVALID";
  const record = requireExactRecord(value, TICK_FIELDS, "", prefix);
  if (record.kind !== "route-runtime-probe-tick") {
    fail(prefix, "kind", "must be 'route-runtime-probe-tick'");
  }
  if (record.schemaVersion !== 1) fail(prefix, "schemaVersion", "must be 1");
  return deepFreeze({
    kind: "route-runtime-probe-tick",
    schemaVersion: 1,
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
  });
}

export function hashRouteRuntimeProbeTickV1(value: unknown): Sha256Hash {
  return sha256CanonicalJson(canonicalRouteRuntimeProbeTickV1(value)) as Sha256Hash;
}

function canonicalMetrics(value: unknown): RouteRuntimeProbeMetricsV1 {
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

function isSurfaceMismatch(
  evidence: TraversalRuntimeTickEvidenceV1,
  expected: TraversalSurfaceIdentityV1,
): boolean {
  if (evidence.characterSupport.supportState === "unsupported") return false;
  const resolution = evidence.characterSupport.surfaceResolution;
  return resolution.mode !== "resolved" || !isEqual(resolution, {
    mode: "resolved",
    ...expected,
  });
}

function assertRuntimeEvidenceBindings(
  evidence: TraversalRuntimeTickEvidenceV1,
  request: RouteRuntimeProbeRequestV1,
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

function deriveMetrics(
  initial: TraversalRuntimeTickEvidenceV1,
  ticks: readonly RouteRuntimeProbeTickV1[],
  surface: TraversalSurfaceIdentityV1,
): RouteRuntimeProbeMetricsV1 {
  let maximumStalledDurationTicks = 0;
  let maximumRouteDeviationMetersXZ = 0;
  let maximumConsecutiveUnexpectedUnsupportedTicks = 0;
  let slidingDurationTicks = 0;
  let unexpectedSupportLossCount = 0;
  let previousUnsupported = initial.characterSupport.supportState === "unsupported";
  let wrongSupportSurfaceCount = isSurfaceMismatch(initial, surface) ? 1 : 0;

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
    if (isSurfaceMismatch(row.runtimeEvidence, surface)) {
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

function canonicalFailure(value: unknown): RouteRuntimeProbeFailureV1 {
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

function assertFailureConsistency(
  failure: RouteRuntimeProbeFailureV1,
  initial: TraversalRuntimeTickEvidenceV1,
  ticks: readonly RouteRuntimeProbeTickV1[],
  metrics: RouteRuntimeProbeMetricsV1,
  surface: TraversalSurfaceIdentityV1,
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
      const support = referencedEvidence.characterSupport;
      if (
        support.supportState !== failure.supportState ||
        support.surfaceResolution.mode !== failure.surfaceResolutionMode ||
        !isSurfaceMismatch(referencedEvidence, surface)
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
        fail(
          prefix,
          "failure/consecutiveUnexpectedUnsupportedTicks",
          "must match the final unsupported Tick row",
        );
      }
      return;
    case "maximum-probe-ticks-reached":
      if (
        failure.failureProbeTick === 0 ||
        failure.processedTickCount !== metrics.processedTickCount
      ) {
        fail(prefix, "failure/processedTickCount", "must match processed Tick count");
      }
  }
}

export function canonicalRouteRuntimeProbeReceiptV1(
  value: unknown,
): RouteRuntimeProbeReceiptV1 {
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
  if (record.schemaVersion !== 1) fail(prefix, "schemaVersion", "must be 1");

  let request: RouteRuntimeProbeRequestV1;
  try {
    request = canonicalRouteRuntimeProbeRequestV1(record.request);
  } catch {
    fail(prefix, "request", "must be a canonical Route Runtime Probe Request");
  }
  const initialRuntimeEvidence = canonicalRuntimeEvidence(
    record.initialRuntimeEvidence,
    "initialRuntimeEvidence",
    prefix,
  );
  if (initialRuntimeEvidence.tick !== 0) {
    fail(prefix, "initialRuntimeEvidence/tick", "must be 0");
  }
  assertRuntimeEvidenceBindings(
    initialRuntimeEvidence,
    request,
    initialRuntimeEvidence.fixedTimeStepSeconds,
    "initialRuntimeEvidence",
  );
  if (!Array.isArray(record.ticks)) fail(prefix, "ticks", "must be an array");
  const ticks = record.ticks.map((rawTick, index) => {
    let row: RouteRuntimeProbeTickV1;
    try {
      row = canonicalRouteRuntimeProbeTickV1(rawTick);
    } catch {
      fail(prefix, `ticks/${index}`, "must be a canonical Route Runtime Probe Tick");
    }
    const expectedProbeTick = index + 1;
    if (row.probeTick !== expectedProbeTick) {
      fail(prefix, `ticks/${index}/probeTick`, "must be consecutive from 1");
    }
    if (row.runtimeEvidence.tick !== row.probeTick) {
      fail(prefix, `ticks/${index}/runtimeEvidence/tick`, "must equal probeTick");
    }
    assertRuntimeEvidenceBindings(
      row.runtimeEvidence,
      request,
      initialRuntimeEvidence.fixedTimeStepSeconds,
      `ticks/${index}/runtimeEvidence`,
    );
    return row;
  });

  const firstMismatchIndex = ticks.findIndex((row) =>
    isSurfaceMismatch(row.runtimeEvidence, request.traversalSurfaceIdentity)
  );
  if (firstMismatchIndex >= 0 && firstMismatchIndex !== ticks.length - 1) {
    fail(prefix, "ticks", "must stop at the first support-surface mismatch");
  }
  const metrics = canonicalMetrics(record.metrics);
  requireEqual(
    metrics,
    deriveMetrics(
      initialRuntimeEvidence,
      ticks,
      request.traversalSurfaceIdentity,
    ),
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
      isSurfaceMismatch(initialRuntimeEvidence, request.traversalSurfaceIdentity) ||
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
      schemaVersion: 1,
      status: "complete",
      request,
      initialRuntimeEvidence,
      ticks,
      metrics,
      completionDurationTicks,
    });
  }

  const failure = canonicalFailure(record.failure);
  assertFailureConsistency(
    failure,
    initialRuntimeEvidence,
    ticks,
    metrics,
    request.traversalSurfaceIdentity,
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
    isSurfaceMismatch(initialRuntimeEvidence, request.traversalSurfaceIdentity) &&
    (failure.kind !== "support-surface-mismatch" || failure.failureProbeTick !== 0)
  ) {
    fail(prefix, "failure/kind", "must report initial support-surface mismatch");
  }
  if (
    isSurfaceMismatch(initialRuntimeEvidence, request.traversalSurfaceIdentity) &&
    ticks.length !== 0
  ) {
    fail(prefix, "ticks", "must be empty after initial support-surface mismatch");
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
    schemaVersion: 1,
    status: "failed",
    request,
    initialRuntimeEvidence,
    ticks,
    metrics,
    failure,
  });
}

export function hashRouteRuntimeProbeReceiptV1(value: unknown): Sha256Hash {
  return sha256CanonicalJson(
    canonicalRouteRuntimeProbeReceiptV1(value),
  ) as Sha256Hash;
}

export function assertRouteRuntimeProbeReceiptContextV1(
  input: AssertRouteRuntimeProbeReceiptContextInputV1,
): RouteRuntimeProbeReceiptV1 {
  const prefix = "ROUTE_RUNTIME_PROBE_CONTEXT_INVALID";
  let receipt: RouteRuntimeProbeReceiptV1;
  let path: RoutePathReceiptV1;
  try {
    receipt = canonicalRouteRuntimeProbeReceiptV1(input.receipt);
    path = canonicalRoutePathReceiptV1(input.routePathReceipt);
  } catch {
    fail(prefix, "", "requires canonical Receipt and Path evidence");
  }
  const driver = assertResolvedDriverInput(input.resolvedDriverProfile, prefix);
  const validation = canonicalValidationIdentity(
    input.validationProfileIdentity,
    "validationProfileIdentity",
    prefix,
  );
  const expected: Readonly<Record<string, unknown>> = {
    routePathReceiptHash: hashRoutePathReceiptV1(path),
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
    traversalSurfaceIdentity: path.traversalSurfaceIdentity,
    driverProfileRef: driver.resourceRef,
    driverResolvedVersion: driver.resolvedVersion,
    driverProfileHash: driver.contentHash,
    validationProfileRef: validation.resourceRef,
    validationProfileVersion: validation.version,
    validationProfileHash: validation.contentHash,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    requireEqual(
      (receipt.request as unknown as UnknownRecord)[field],
      expectedValue,
      `request/${field}`,
      prefix,
    );
  }
  return receipt;
}
