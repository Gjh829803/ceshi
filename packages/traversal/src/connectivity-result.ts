import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil, isPlainObject } from "lodash-es";

import {
  assertHeightfieldRouteBuildInputReceiptV1,
  type HeightfieldRouteBuildInputReceiptV1,
} from "./build-input.js";
import {
  canonicalTraversalGraphV1,
  hashTraversalGraphV1,
  type TraversalGraphV1,
} from "./graph-contract.js";
import {
  canonicalRoutePathReceiptV1,
  hashRoutePathReceiptV1,
  type RoutePathReceiptV1,
} from "./path-receipt.js";
import { resolveTraversalGraphBuilderProfile } from "./profile-registry.js";

type Sha256Hash = `sha256:${string}`;
type Vec3 = readonly [number, number, number];
type UnknownRecord = Record<string, unknown>;

export const ROUTE_CONNECTIVITY_FAILURE_CODES_V1 = [
  "ROUTE_START_SURFACE_NOT_FOUND",
  "ROUTE_DESTINATION_SURFACE_NOT_FOUND",
  "ROUTE_REQUIRED_PATH_UNREACHABLE",
  "ROUTE_STEP_HEIGHT_EXCEEDED",
  "ROUTE_SLOPE_EXCEEDED",
  "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT",
  "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT",
  "ROUTE_SURFACE_GAP_EXCEEDED",
  "ROUTE_GRAPH_BUDGET_EXCEEDED",
] as const;

export type RouteConnectivityFailureCodeV1 =
  (typeof ROUTE_CONNECTIVITY_FAILURE_CODES_V1)[number];

export interface RouteThresholdRejectionProofV1 {
  readonly proofKind: "unique-single-reason-cut";
  readonly proofCandidateIds: readonly string[];
  readonly failurePositionMetersXYZ: Vec3;
}

export type RouteThresholdRejectionReasonV1 =
  | Readonly<RouteThresholdRejectionProofV1 & {
      kind: "slope-threshold-exceeded";
      code: "ROUTE_SLOPE_EXCEEDED";
      terrainEntityId: string;
      maximumObservedSlopeDegrees: number;
      maximumAllowedSlopeDegrees: number;
    }>
  | Readonly<RouteThresholdRejectionProofV1 & {
      kind: "step-height-threshold-exceeded";
      code: "ROUTE_STEP_HEIGHT_EXCEEDED";
      terrainEntityId: string;
      maximumObservedStepHeightMeters: number;
      maximumAllowedStepHeightMeters: number;
    }>
  | Readonly<RouteThresholdRejectionProofV1 & {
      kind: "clearance-width-insufficient";
      code: "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT";
      terrainEntityId: string;
      relevantColliderSubshapeIds: readonly string[];
      minimumObservedClearanceWidthMeters: number;
      minimumRequiredClearanceWidthMeters: number;
    }>
  | Readonly<RouteThresholdRejectionProofV1 & {
      kind: "overhead-clearance-insufficient";
      code: "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT";
      terrainEntityId: string;
      relevantColliderSubshapeIds: readonly string[];
      minimumObservedClearanceHeightMeters: number;
      minimumRequiredClearanceHeightMeters: number;
    }>
  | Readonly<RouteThresholdRejectionProofV1 & {
      kind: "surface-gap-exceeded";
      code: "ROUTE_SURFACE_GAP_EXCEEDED";
      terrainEntityId: string;
      maximumObservedSurfaceGapMeters: number;
      maximumAllowedSurfaceGapMeters: 0;
    }>;

export type RouteConnectivityFailureReasonV1 =
  | Readonly<{
      kind: "empty-heightfield-source";
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE";
      terrainEntityId: string;
    }>
  | Readonly<{
      kind: "no-queryable-ground-surface";
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE";
      terrainEntityId: string;
      traversalSurfaceId: string;
    }>
  | Readonly<{
      kind: "start-surface-not-found";
      code: "ROUTE_START_SURFACE_NOT_FOUND";
      anchorEntityId: string;
      positionMetersXYZ: Vec3;
      traversalSurfaceId: string;
    }>
  | Readonly<{
      kind: "destination-surface-not-found";
      code: "ROUTE_DESTINATION_SURFACE_NOT_FOUND";
      anchorEntityId: string;
      positionMetersXYZ: Vec3;
      traversalSurfaceId: string;
    }>
  | Readonly<{
      kind: "required-path-unreachable";
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE";
      traversalSurfaceId: string;
      relevantBlockingColliderEntityIds: readonly string[];
      blockedWaterEntityIds: readonly string[];
    }>
  | Readonly<{
      kind: "node-budget-exceeded";
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>
  | Readonly<{
      kind: "edge-budget-exceeded";
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>
  | Readonly<{
      kind: "search-budget-exceeded";
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>
  | Readonly<{
      kind: "straight-path-capacity-exceeded";
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>
  | RouteThresholdRejectionReasonV1;

export interface RouteConnectivityFailureCommonV1 {
  readonly kind: "route-connectivity-failure";
  readonly schemaVersion: 1;
  readonly constraintId: string;
  readonly routeId: string;
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly startAnchorPositionMetersXYZ: Vec3;
  readonly destinationAnchorPositionMetersXYZ: Vec3;
  readonly traversalSurfaceId: string;
  readonly surfaceEntityId: string;
  readonly colliderSubshapeId: string;
  readonly routeBuildInputHash: Sha256Hash;
  readonly resolvedTraversalLockHash: Sha256Hash;
  readonly graphBuilderProfileRef: string;
  readonly graphBuilderResolvedVersion: string;
  readonly graphBuilderProfileHash: Sha256Hash;
}

type ReasonOfKind<K extends RouteConnectivityFailureReasonV1["kind"]> =
  Extract<RouteConnectivityFailureReasonV1, { kind: K }>;

export type RouteConnectivityUnavailableUnreachableReasonV1 =
  | ReasonOfKind<"empty-heightfield-source">
  | ReasonOfKind<"no-queryable-ground-surface">
  | RouteThresholdRejectionReasonV1;

export type RouteConnectivityUnavailableIncompleteReasonV1 =
  | ReasonOfKind<"node-budget-exceeded">
  | ReasonOfKind<"edge-budget-exceeded">;

export type RouteConnectivityCompleteUnreachableReasonV1 =
  | ReasonOfKind<"start-surface-not-found">
  | ReasonOfKind<"destination-surface-not-found">
  | ReasonOfKind<"required-path-unreachable">
  | RouteThresholdRejectionReasonV1;

export type RouteConnectivityCompleteIncompleteReasonV1 =
  | ReasonOfKind<"search-budget-exceeded">
  | ReasonOfKind<"straight-path-capacity-exceeded">;

export type RouteConnectivityFailureCompleteUnreachableV1 =
  & RouteConnectivityFailureCommonV1
  & Readonly<{
      status: "unreachable";
      graphStatus: "complete";
      traversalGraphHash: Sha256Hash;
      reason: RouteConnectivityCompleteUnreachableReasonV1;
    }>;

export type RouteConnectivityFailureCompleteIncompleteV1 =
  & RouteConnectivityFailureCommonV1
  & Readonly<{
      status: "incomplete";
      graphStatus: "complete";
      traversalGraphHash: Sha256Hash;
      reason: RouteConnectivityCompleteIncompleteReasonV1;
    }>;

export type RouteConnectivityFailureUnavailableUnreachableV1 =
  & RouteConnectivityFailureCommonV1
  & Readonly<{
      status: "unreachable";
      graphStatus: "unavailable";
      reason: RouteConnectivityUnavailableUnreachableReasonV1;
    }>;

export type RouteConnectivityFailureUnavailableIncompleteV1 =
  & RouteConnectivityFailureCommonV1
  & Readonly<{
      status: "incomplete";
      graphStatus: "unavailable";
      reason: RouteConnectivityUnavailableIncompleteReasonV1;
    }>;

export type RouteConnectivityFailureV1 =
  | RouteConnectivityFailureCompleteUnreachableV1
  | RouteConnectivityFailureCompleteIncompleteV1
  | RouteConnectivityFailureUnavailableUnreachableV1
  | RouteConnectivityFailureUnavailableIncompleteV1;

export type HeightfieldRouteConnectivityResultV1 =
  | Readonly<{
      kind: "heightfield-route-connectivity-result";
      schemaVersion: 1;
      status: "complete";
      traversalGraph: TraversalGraphV1;
      traversalGraphHash: Sha256Hash;
      routePathReceipt: RoutePathReceiptV1;
      routePathReceiptHash: Sha256Hash;
    }>
  | Readonly<{
      kind: "heightfield-route-connectivity-result";
      schemaVersion: 1;
      status: "unreachable";
      graphStatus: "complete";
      traversalGraph: TraversalGraphV1;
      traversalGraphHash: Sha256Hash;
      connectivityFailure: RouteConnectivityFailureCompleteUnreachableV1;
      connectivityFailureHash: Sha256Hash;
    }>
  | Readonly<{
      kind: "heightfield-route-connectivity-result";
      schemaVersion: 1;
      status: "incomplete";
      graphStatus: "complete";
      traversalGraph: TraversalGraphV1;
      traversalGraphHash: Sha256Hash;
      connectivityFailure: RouteConnectivityFailureCompleteIncompleteV1;
      connectivityFailureHash: Sha256Hash;
    }>
  | Readonly<{
      kind: "heightfield-route-connectivity-result";
      schemaVersion: 1;
      status: "unreachable";
      graphStatus: "unavailable";
      connectivityFailure: RouteConnectivityFailureUnavailableUnreachableV1;
      connectivityFailureHash: Sha256Hash;
    }>
  | Readonly<{
      kind: "heightfield-route-connectivity-result";
      schemaVersion: 1;
      status: "incomplete";
      graphStatus: "unavailable";
      connectivityFailure: RouteConnectivityFailureUnavailableIncompleteV1;
      connectivityFailureHash: Sha256Hash;
    }>;

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const COMMON_FIELDS = [
  "kind",
  "schemaVersion",
  "constraintId",
  "routeId",
  "traversingEntityId",
  "startAnchorEntityId",
  "destinationAnchorEntityId",
  "startAnchorPositionMetersXYZ",
  "destinationAnchorPositionMetersXYZ",
  "traversalSurfaceId",
  "surfaceEntityId",
  "colliderSubshapeId",
  "routeBuildInputHash",
  "resolvedTraversalLockHash",
  "graphBuilderProfileRef",
  "graphBuilderResolvedVersion",
  "graphBuilderProfileHash",
] as const;
const FAILURE_BASE_FIELDS = [...COMMON_FIELDS, "status", "graphStatus", "reason"] as const;
const THRESHOLD_KINDS = new Set<RouteConnectivityFailureReasonV1["kind"]>([
  "slope-threshold-exceeded",
  "step-height-threshold-exceeded",
  "clearance-width-insufficient",
  "overhead-clearance-insufficient",
  "surface-gap-exceeded",
]);
const REASON_FIELDS: Readonly<Record<RouteConnectivityFailureReasonV1["kind"], readonly string[]>> = {
  "empty-heightfield-source": ["kind", "code", "terrainEntityId"],
  "no-queryable-ground-surface": [
    "kind",
    "code",
    "terrainEntityId",
    "traversalSurfaceId",
  ],
  "start-surface-not-found": [
    "kind",
    "code",
    "anchorEntityId",
    "positionMetersXYZ",
    "traversalSurfaceId",
  ],
  "destination-surface-not-found": [
    "kind",
    "code",
    "anchorEntityId",
    "positionMetersXYZ",
    "traversalSurfaceId",
  ],
  "required-path-unreachable": [
    "kind",
    "code",
    "traversalSurfaceId",
    "relevantBlockingColliderEntityIds",
    "blockedWaterEntityIds",
  ],
  "node-budget-exceeded": [
    "kind",
    "code",
    "maximumAllowedCount",
    "minimumRequiredCount",
  ],
  "edge-budget-exceeded": [
    "kind",
    "code",
    "maximumAllowedCount",
    "minimumRequiredCount",
  ],
  "search-budget-exceeded": [
    "kind",
    "code",
    "maximumAllowedCount",
    "minimumRequiredCount",
  ],
  "straight-path-capacity-exceeded": [
    "kind",
    "code",
    "maximumAllowedCount",
    "minimumRequiredCount",
  ],
  "slope-threshold-exceeded": [
    "kind",
    "code",
    "proofKind",
    "proofCandidateIds",
    "failurePositionMetersXYZ",
    "terrainEntityId",
    "maximumObservedSlopeDegrees",
    "maximumAllowedSlopeDegrees",
  ],
  "step-height-threshold-exceeded": [
    "kind",
    "code",
    "proofKind",
    "proofCandidateIds",
    "failurePositionMetersXYZ",
    "terrainEntityId",
    "maximumObservedStepHeightMeters",
    "maximumAllowedStepHeightMeters",
  ],
  "clearance-width-insufficient": [
    "kind",
    "code",
    "proofKind",
    "proofCandidateIds",
    "failurePositionMetersXYZ",
    "terrainEntityId",
    "relevantColliderSubshapeIds",
    "minimumObservedClearanceWidthMeters",
    "minimumRequiredClearanceWidthMeters",
  ],
  "overhead-clearance-insufficient": [
    "kind",
    "code",
    "proofKind",
    "proofCandidateIds",
    "failurePositionMetersXYZ",
    "terrainEntityId",
    "relevantColliderSubshapeIds",
    "minimumObservedClearanceHeightMeters",
    "minimumRequiredClearanceHeightMeters",
  ],
  "surface-gap-exceeded": [
    "kind",
    "code",
    "proofKind",
    "proofCandidateIds",
    "failurePositionMetersXYZ",
    "terrainEntityId",
    "maximumObservedSurfaceGapMeters",
    "maximumAllowedSurfaceGapMeters",
  ],
};

function failFailure(path: string, message: string): never {
  throw new Error(
    `ROUTE_CONNECTIVITY_FAILURE_INVALID: ${path.length > 0 ? `${path}: ` : ""}${message}`,
  );
}

function failResult(path: string, message: string): never {
  throw new Error(
    `HEIGHTFIELD_ROUTE_CONNECTIVITY_RESULT_INVALID: ${path.length > 0 ? `${path}: ` : ""}${message}`,
  );
}

function requireRecord(
  value: unknown,
  path: string,
  fail: (path: string, message: string) => never,
): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) fail(path, "expected a plain object");
  return value as UnknownRecord;
}

function requireExactRecord(
  value: unknown,
  fields: readonly string[],
  path: string,
  fail: (path: string, message: string) => never,
): UnknownRecord {
  const record = requireRecord(value, path, fail);
  const allowed = new Set(fields);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) fail(path, `unknown field '${unknown}'`);
  for (const field of fields) {
    if (isNil(record[field])) fail(path, `missing field '${field}'`);
  }
  return record;
}

function requireString(
  value: unknown,
  path: string,
  fail: (path: string, message: string) => never,
): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(path, "must be a non-empty string");
  }
  return value;
}

function requireHash(
  value: unknown,
  path: string,
  fail: (path: string, message: string) => never,
): Sha256Hash {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(path, "must be a lowercase sha256 hash");
  }
  return value as Sha256Hash;
}

function requireFinite(
  value: unknown,
  path: string,
  fail: (path: string, message: string) => never,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "must be finite");
  }
  return Object.is(value, -0) ? 0 : value;
}

function requireNonNegative(
  value: unknown,
  path: string,
  fail: (path: string, message: string) => never,
): number {
  const number = requireFinite(value, path, fail);
  if (number < 0) fail(path, "must be >= 0");
  return number;
}

function requirePositive(
  value: unknown,
  path: string,
  fail: (path: string, message: string) => never,
): number {
  const number = requireFinite(value, path, fail);
  if (!(number > 0)) fail(path, "must be > 0");
  return number;
}

function requireVec3(
  value: unknown,
  path: string,
  fail: (path: string, message: string) => never,
): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) fail(path, "must be a 3-tuple");
  return [
    requireFinite(value[0], `${path}/0`, fail),
    requireFinite(value[1], `${path}/1`, fail),
    requireFinite(value[2], `${path}/2`, fail),
  ];
}

function requireSortedUniqueStrings(
  value: unknown,
  path: string,
): readonly string[] {
  if (!Array.isArray(value)) failFailure(path, "must be an array");
  const strings = value.map((entry, index) =>
    requireString(entry, `${path}/${index}`, failFailure)
  );
  const expected = [...new Set(strings)].sort();
  if (
    strings.length !== expected.length ||
    strings.some((entry, index) => entry !== expected[index])
  ) {
    failFailure(path, "must be sorted and unique");
  }
  return strings;
}

function requireCapacity(record: UnknownRecord): void {
  const maximum = record.maximumAllowedCount;
  const minimum = record.minimumRequiredCount;
  if (!Number.isSafeInteger(maximum) || (maximum as number) <= 0) {
    failFailure("reason/maximumAllowedCount", "must be a positive safe integer");
  }
  if (
    !Number.isSafeInteger(minimum) ||
    (minimum as number) <= (maximum as number)
  ) {
    failFailure(
      "reason/minimumRequiredCount",
      "must be a safe integer greater than maximumAllowedCount",
    );
  }
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

function canonicalPlainCopy(value: unknown): unknown {
  if (typeof value === "number") return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value)) return value.map((entry) => canonicalPlainCopy(entry));
  if (isNil(value) || !isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, canonicalPlainCopy(entry)]),
  );
}

function canonicalReason(value: unknown): RouteConnectivityFailureReasonV1 {
  const base = requireRecord(value, "reason", failFailure);
  if (typeof base.kind !== "string" || !(base.kind in REASON_FIELDS)) {
    failFailure("reason/kind", "is not a supported failure reason");
  }
  const kind = base.kind as RouteConnectivityFailureReasonV1["kind"];
  const record = requireExactRecord(
    value,
    REASON_FIELDS[kind],
    "reason",
    failFailure,
  );
  const expectedCodes: Readonly<Record<RouteConnectivityFailureReasonV1["kind"], RouteConnectivityFailureCodeV1>> = {
    "empty-heightfield-source": "ROUTE_REQUIRED_PATH_UNREACHABLE",
    "no-queryable-ground-surface": "ROUTE_REQUIRED_PATH_UNREACHABLE",
    "start-surface-not-found": "ROUTE_START_SURFACE_NOT_FOUND",
    "destination-surface-not-found": "ROUTE_DESTINATION_SURFACE_NOT_FOUND",
    "required-path-unreachable": "ROUTE_REQUIRED_PATH_UNREACHABLE",
    "node-budget-exceeded": "ROUTE_GRAPH_BUDGET_EXCEEDED",
    "edge-budget-exceeded": "ROUTE_GRAPH_BUDGET_EXCEEDED",
    "search-budget-exceeded": "ROUTE_GRAPH_BUDGET_EXCEEDED",
    "straight-path-capacity-exceeded": "ROUTE_GRAPH_BUDGET_EXCEEDED",
    "slope-threshold-exceeded": "ROUTE_SLOPE_EXCEEDED",
    "step-height-threshold-exceeded": "ROUTE_STEP_HEIGHT_EXCEEDED",
    "clearance-width-insufficient": "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT",
    "overhead-clearance-insufficient": "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT",
    "surface-gap-exceeded": "ROUTE_SURFACE_GAP_EXCEEDED",
  };
  if (record.code !== expectedCodes[kind]) {
    failFailure("reason/code", `must be '${expectedCodes[kind]}'`);
  }
  for (const field of [
    "terrainEntityId",
    "traversalSurfaceId",
    "anchorEntityId",
  ]) {
    if (!isNil(record[field])) requireString(record[field], `reason/${field}`, failFailure);
  }
  if (
    kind === "node-budget-exceeded" ||
    kind === "edge-budget-exceeded" ||
    kind === "search-budget-exceeded" ||
    kind === "straight-path-capacity-exceeded"
  ) {
    requireCapacity(record);
  }
  if (kind === "start-surface-not-found" || kind === "destination-surface-not-found") {
    requireVec3(record.positionMetersXYZ, "reason/positionMetersXYZ", failFailure);
  }
  if (kind === "required-path-unreachable") {
    requireSortedUniqueStrings(
      record.relevantBlockingColliderEntityIds,
      "reason/relevantBlockingColliderEntityIds",
    );
    requireSortedUniqueStrings(record.blockedWaterEntityIds, "reason/blockedWaterEntityIds");
  }
  if (THRESHOLD_KINDS.has(kind)) {
    if (record.proofKind !== "unique-single-reason-cut") {
      failFailure("reason/proofKind", "must be 'unique-single-reason-cut'");
    }
    const proofIds = requireSortedUniqueStrings(
      record.proofCandidateIds,
      "reason/proofCandidateIds",
    );
    if (proofIds.length === 0) failFailure("reason/proofCandidateIds", "must not be empty");
    requireVec3(
      record.failurePositionMetersXYZ,
      "reason/failurePositionMetersXYZ",
      failFailure,
    );
    if (
      kind === "clearance-width-insufficient" ||
      kind === "overhead-clearance-insufficient"
    ) {
      requireSortedUniqueStrings(
        record.relevantColliderSubshapeIds,
        "reason/relevantColliderSubshapeIds",
      );
    }
  }
  if (kind === "slope-threshold-exceeded") {
    const observed = requireNonNegative(
      record.maximumObservedSlopeDegrees,
      "reason/maximumObservedSlopeDegrees",
      failFailure,
    );
    const allowed = requireNonNegative(
      record.maximumAllowedSlopeDegrees,
      "reason/maximumAllowedSlopeDegrees",
      failFailure,
    );
    if (observed > 90 || allowed > 90 || !(observed > allowed)) {
      failFailure("reason", "slope observation must exceed the allowed value in [0, 90]");
    }
  } else if (kind === "step-height-threshold-exceeded") {
    const observed = requireNonNegative(
      record.maximumObservedStepHeightMeters,
      "reason/maximumObservedStepHeightMeters",
      failFailure,
    );
    const allowed = requireNonNegative(
      record.maximumAllowedStepHeightMeters,
      "reason/maximumAllowedStepHeightMeters",
      failFailure,
    );
    if (!(observed > allowed)) failFailure("reason", "step observation must exceed allowed");
  } else if (kind === "clearance-width-insufficient") {
    const observed = requireNonNegative(
      record.minimumObservedClearanceWidthMeters,
      "reason/minimumObservedClearanceWidthMeters",
      failFailure,
    );
    const required = requirePositive(
      record.minimumRequiredClearanceWidthMeters,
      "reason/minimumRequiredClearanceWidthMeters",
      failFailure,
    );
    if (!(observed < required)) failFailure("reason", "width observation must be insufficient");
  } else if (kind === "overhead-clearance-insufficient") {
    const observed = requireNonNegative(
      record.minimumObservedClearanceHeightMeters,
      "reason/minimumObservedClearanceHeightMeters",
      failFailure,
    );
    const required = requirePositive(
      record.minimumRequiredClearanceHeightMeters,
      "reason/minimumRequiredClearanceHeightMeters",
      failFailure,
    );
    if (!(observed < required)) failFailure("reason", "height observation must be insufficient");
  } else if (kind === "surface-gap-exceeded") {
    const observed = requirePositive(
      record.maximumObservedSurfaceGapMeters,
      "reason/maximumObservedSurfaceGapMeters",
      failFailure,
    );
    if (record.maximumAllowedSurfaceGapMeters !== 0 || !(observed > 0)) {
      failFailure("reason", "R1 allowed gap must be exactly zero");
    }
  }
  return canonicalPlainCopy(record) as RouteConnectivityFailureReasonV1;
}

export function canonicalRouteConnectivityFailureV1(
  value: unknown,
): RouteConnectivityFailureV1 {
  const base = requireRecord(value, "", failFailure);
  const complete = base.graphStatus === "complete";
  const fields = complete
    ? [...FAILURE_BASE_FIELDS, "traversalGraphHash"]
    : FAILURE_BASE_FIELDS;
  const record = requireExactRecord(value, fields, "", failFailure);
  if (record.kind !== "route-connectivity-failure") {
    failFailure("kind", "must be 'route-connectivity-failure'");
  }
  if (record.schemaVersion !== 1) failFailure("schemaVersion", "must be 1");
  const reason = canonicalReason(record.reason);
  const unavailableUnreachable = new Set<RouteConnectivityFailureReasonV1["kind"]>([
    "empty-heightfield-source",
    "no-queryable-ground-surface",
    ...THRESHOLD_KINDS,
  ]);
  const unavailableIncomplete = new Set<RouteConnectivityFailureReasonV1["kind"]>([
    "node-budget-exceeded",
    "edge-budget-exceeded",
  ]);
  const completeUnreachable = new Set<RouteConnectivityFailureReasonV1["kind"]>([
    "start-surface-not-found",
    "destination-surface-not-found",
    "required-path-unreachable",
    ...THRESHOLD_KINDS,
  ]);
  const completeIncomplete = new Set<RouteConnectivityFailureReasonV1["kind"]>([
    "search-budget-exceeded",
    "straight-path-capacity-exceeded",
  ]);
  const reasonKind = reason.kind;
  const correlationValid =
    (record.status === "unreachable" &&
      record.graphStatus === "unavailable" &&
      unavailableUnreachable.has(reasonKind)) ||
    (record.status === "incomplete" &&
      record.graphStatus === "unavailable" &&
      unavailableIncomplete.has(reasonKind)) ||
    (record.status === "unreachable" &&
      record.graphStatus === "complete" &&
      completeUnreachable.has(reasonKind)) ||
    (record.status === "incomplete" &&
      record.graphStatus === "complete" &&
      completeIncomplete.has(reasonKind));
  if (!correlationValid) {
    failFailure("reason", "does not match the closed status/graphStatus variant");
  }

  const commonStrings: Record<string, string> = {};
  for (const field of [
    "constraintId",
    "routeId",
    "traversingEntityId",
    "startAnchorEntityId",
    "destinationAnchorEntityId",
    "traversalSurfaceId",
    "surfaceEntityId",
    "colliderSubshapeId",
    "graphBuilderProfileRef",
    "graphBuilderResolvedVersion",
  ]) {
    commonStrings[field] = requireString(record[field], field, failFailure);
  }
  if (commonStrings.startAnchorEntityId === commonStrings.destinationAnchorEntityId) {
    failFailure("startAnchorEntityId", "must differ from destinationAnchorEntityId");
  }
  if (
    commonStrings.traversalSurfaceId === commonStrings.surfaceEntityId ||
    commonStrings.traversalSurfaceId === commonStrings.colliderSubshapeId ||
    commonStrings.surfaceEntityId === commonStrings.colliderSubshapeId
  ) {
    failFailure("traversalSurfaceId", "Surface role ids must remain distinct");
  }
  const commonHashes = {
    routeBuildInputHash: requireHash(record.routeBuildInputHash, "routeBuildInputHash", failFailure),
    resolvedTraversalLockHash: requireHash(
      record.resolvedTraversalLockHash,
      "resolvedTraversalLockHash",
      failFailure,
    ),
    graphBuilderProfileHash: requireHash(
      record.graphBuilderProfileHash,
      "graphBuilderProfileHash",
      failFailure,
    ),
  } as const;
  let resolved;
  try {
    resolved = resolveTraversalGraphBuilderProfile(commonStrings.graphBuilderProfileRef!);
  } catch (cause) {
    failFailure(
      "graphBuilderProfileRef",
      cause instanceof Error ? cause.message : "Profile resolution failed",
    );
  }
  if (
    resolved.resolvedVersion !== commonStrings.graphBuilderResolvedVersion ||
    resolved.contentHash !== commonHashes.graphBuilderProfileHash
  ) {
    failFailure("graphBuilderProfileRef", "must match the Registry Profile identity");
  }
  const traversalGraphHash = complete
    ? requireHash(record.traversalGraphHash, "traversalGraphHash", failFailure)
    : undefined;
  return deepFreeze({
    kind: "route-connectivity-failure",
    schemaVersion: 1,
    constraintId: commonStrings.constraintId!,
    routeId: commonStrings.routeId!,
    traversingEntityId: commonStrings.traversingEntityId!,
    startAnchorEntityId: commonStrings.startAnchorEntityId!,
    destinationAnchorEntityId: commonStrings.destinationAnchorEntityId!,
    startAnchorPositionMetersXYZ: requireVec3(
      record.startAnchorPositionMetersXYZ,
      "startAnchorPositionMetersXYZ",
      failFailure,
    ),
    destinationAnchorPositionMetersXYZ: requireVec3(
      record.destinationAnchorPositionMetersXYZ,
      "destinationAnchorPositionMetersXYZ",
      failFailure,
    ),
    traversalSurfaceId: commonStrings.traversalSurfaceId!,
    surfaceEntityId: commonStrings.surfaceEntityId!,
    colliderSubshapeId: commonStrings.colliderSubshapeId!,
    ...commonHashes,
    graphBuilderProfileRef: commonStrings.graphBuilderProfileRef!,
    graphBuilderResolvedVersion: commonStrings.graphBuilderResolvedVersion!,
    status: record.status,
    graphStatus: record.graphStatus,
    ...(isNil(traversalGraphHash) ? {} : { traversalGraphHash }),
    reason,
  }) as RouteConnectivityFailureV1;
}

export function hashRouteConnectivityFailureV1(value: unknown): Sha256Hash {
  return sha256CanonicalJson(
    canonicalRouteConnectivityFailureV1(value),
  ) as Sha256Hash;
}

function requireEqual(
  actual: unknown,
  expected: unknown,
  path: string,
): void {
  if (actual !== expected) failResult(path, "does not match related canonical evidence");
}

function ceilToQuantum(value: number, quantum: number): number {
  const units = Math.ceil(value / quantum - Number.EPSILON);
  if (!Number.isSafeInteger(units)) failResult("routePathReceipt", "metric exceeds safe range");
  return units * quantum;
}

function validatePathAgainstGraph(
  path: RoutePathReceiptV1,
  graph: TraversalGraphV1,
): void {
  const bindingFields = [
    "routeId",
    "startAnchorEntityId",
    "destinationAnchorEntityId",
    "routeBuildInputHash",
    "resolvedTraversalLockHash",
    "graphBuilderProfileRef",
    "graphBuilderResolvedVersion",
    "graphBuilderProfileHash",
  ] as const;
  for (const field of bindingFields) requireEqual(path[field], graph[field], `routePathReceipt/${field}`);

  const selectedNodes = path.orderedTraversalNodeIds.map((id) => {
    const node = graph.traversalNodesById[id];
    if (isNil(node)) failResult("routePathReceipt/orderedTraversalNodeIds", `unknown Node '${id}'`);
    return node;
  });
  const selectedEdges = path.orderedTraversalEdgeIds.map((id, index) => {
    const edge = graph.traversalEdgesById[id];
    if (isNil(edge)) failResult("routePathReceipt/orderedTraversalEdgeIds", `unknown Edge '${id}'`);
    if (
      edge.fromTraversalNodeId !== path.orderedTraversalNodeIds[index] ||
      edge.toTraversalNodeId !== path.orderedTraversalNodeIds[index + 1]
    ) {
      failResult("routePathReceipt/orderedTraversalEdgeIds", `Edge '${id}' breaks ordered adjacency`);
    }
    return edge;
  });
  const profile = resolveTraversalGraphBuilderProfile(path.graphBuilderProfileRef).profile;
  let distanceMeters = 0;
  let segmentSlopeDegrees = 0;
  for (let index = 1; index < path.orderedPathPositionsMetersXYZ.length; index += 1) {
    const previous = path.orderedPathPositionsMetersXYZ[index - 1]!;
    const current = path.orderedPathPositionsMetersXYZ[index]!;
    const dx = current[0] - previous[0];
    const dy = current[1] - previous[1];
    const dz = current[2] - previous[2];
    distanceMeters += ceilToQuantum(
      Math.hypot(dx, dy, dz),
      profile.positionQuantizationMeters,
    );
    const horizontal = Math.hypot(dx, dz);
    const rawSlope = horizontal === 0 ? 90 : Math.atan2(Math.abs(dy), horizontal) * 180 / Math.PI;
    segmentSlopeDegrees = Math.max(segmentSlopeDegrees, ceilToQuantum(rawSlope, 0.000001));
  }
  const costUnits = selectedEdges.reduce((sum, edge) => {
    const units = Math.round(edge.routePathCost / 0.000001);
    if (!Number.isSafeInteger(units) || !Number.isSafeInteger(sum + units)) {
      failResult("routePathReceipt/routePathCost", "cost exceeds safe range");
    }
    return sum + units;
  }, 0);
  const nodeWidths = selectedNodes.map((node) => node.clearanceWidthMeters);
  const nodeHeights = selectedNodes.map((node) => node.clearanceHeightMeters);
  const edgeWidths = selectedEdges.map((edge) => edge.minimumClearanceWidthMeters);
  const edgeHeights = selectedEdges.map((edge) => edge.minimumClearanceHeightMeters);
  const edgeSlopes = selectedEdges.map((edge) => edge.slopeDegrees);
  const edgeSteps = selectedEdges.map((edge) => edge.stepHeightMeters);
  requireEqual(path.routePathDistanceMeters, distanceMeters, "routePathReceipt/routePathDistanceMeters");
  requireEqual(path.routePathCost, costUnits * 0.000001, "routePathReceipt/routePathCost");
  requireEqual(
    path.maximumObservedSlopeDegrees,
    Math.max(segmentSlopeDegrees, ...edgeSlopes, 0),
    "routePathReceipt/maximumObservedSlopeDegrees",
  );
  requireEqual(
    path.maximumObservedStepHeightMeters,
    Math.max(...edgeSteps, 0),
    "routePathReceipt/maximumObservedStepHeightMeters",
  );
  requireEqual(
    path.minimumObservedClearanceWidthMeters,
    Math.min(...nodeWidths, ...edgeWidths),
    "routePathReceipt/minimumObservedClearanceWidthMeters",
  );
  requireEqual(
    path.minimumObservedClearanceHeightMeters,
    Math.min(...nodeHeights, ...edgeHeights),
    "routePathReceipt/minimumObservedClearanceHeightMeters",
  );
  requireEqual(path.maximumObservedSurfaceGapMeters, 0, "routePathReceipt/maximumObservedSurfaceGapMeters");
}

export function canonicalHeightfieldRouteConnectivityResultV1(
  value: unknown,
): HeightfieldRouteConnectivityResultV1 {
  const base = requireRecord(value, "", failResult);
  if (base.kind !== "heightfield-route-connectivity-result") {
    failResult("kind", "must be 'heightfield-route-connectivity-result'");
  }
  if (base.schemaVersion !== 1) failResult("schemaVersion", "must be 1");
  if (base.status === "complete") {
    const record = requireExactRecord(
      value,
      [
        "kind",
        "schemaVersion",
        "status",
        "traversalGraph",
        "traversalGraphHash",
        "routePathReceipt",
        "routePathReceiptHash",
      ],
      "",
      failResult,
    );
    const traversalGraph = canonicalTraversalGraphV1(record.traversalGraph);
    const traversalGraphHash = requireHash(record.traversalGraphHash, "traversalGraphHash", failResult);
    requireEqual(traversalGraphHash, hashTraversalGraphV1(traversalGraph), "traversalGraphHash");
    const routePathReceipt = canonicalRoutePathReceiptV1(record.routePathReceipt);
    const routePathReceiptHash = requireHash(
      record.routePathReceiptHash,
      "routePathReceiptHash",
      failResult,
    );
    requireEqual(routePathReceiptHash, hashRoutePathReceiptV1(routePathReceipt), "routePathReceiptHash");
    requireEqual(routePathReceipt.traversalGraphHash, traversalGraphHash, "routePathReceipt/traversalGraphHash");
    validatePathAgainstGraph(routePathReceipt, traversalGraph);
    return deepFreeze({
      kind: "heightfield-route-connectivity-result",
      schemaVersion: 1,
      status: "complete",
      traversalGraph,
      traversalGraphHash,
      routePathReceipt,
      routePathReceiptHash,
    });
  }

  const completeGraph = base.graphStatus === "complete";
  const record = requireExactRecord(
    value,
    completeGraph
      ? [
          "kind",
          "schemaVersion",
          "status",
          "graphStatus",
          "traversalGraph",
          "traversalGraphHash",
          "connectivityFailure",
          "connectivityFailureHash",
        ]
      : [
          "kind",
          "schemaVersion",
          "status",
          "graphStatus",
          "connectivityFailure",
          "connectivityFailureHash",
        ],
    "",
    failResult,
  );
  const connectivityFailure = canonicalRouteConnectivityFailureV1(
    record.connectivityFailure,
  );
  if (
    connectivityFailure.status !== record.status ||
    connectivityFailure.graphStatus !== record.graphStatus
  ) {
    failResult("connectivityFailure", "status and graphStatus must match the outer variant");
  }
  const connectivityFailureHash = requireHash(
    record.connectivityFailureHash,
    "connectivityFailureHash",
    failResult,
  );
  requireEqual(
    connectivityFailureHash,
    hashRouteConnectivityFailureV1(connectivityFailure),
    "connectivityFailureHash",
  );
  if (!completeGraph) {
    return deepFreeze({
      kind: "heightfield-route-connectivity-result",
      schemaVersion: 1,
      status: connectivityFailure.status,
      graphStatus: "unavailable",
      connectivityFailure,
      connectivityFailureHash,
    }) as HeightfieldRouteConnectivityResultV1;
  }
  const traversalGraph = canonicalTraversalGraphV1(record.traversalGraph);
  const traversalGraphHash = requireHash(record.traversalGraphHash, "traversalGraphHash", failResult);
  requireEqual(traversalGraphHash, hashTraversalGraphV1(traversalGraph), "traversalGraphHash");
  if (connectivityFailure.graphStatus !== "complete") {
    failResult("connectivityFailure/graphStatus", "must be 'complete'");
  }
  requireEqual(connectivityFailure.traversalGraphHash, traversalGraphHash, "connectivityFailure/traversalGraphHash");
  for (const field of [
    "routeId",
    "startAnchorEntityId",
    "destinationAnchorEntityId",
    "routeBuildInputHash",
    "resolvedTraversalLockHash",
    "graphBuilderProfileRef",
    "graphBuilderResolvedVersion",
    "graphBuilderProfileHash",
  ] as const) {
    requireEqual(connectivityFailure[field], traversalGraph[field], `connectivityFailure/${field}`);
  }
  return deepFreeze({
    kind: "heightfield-route-connectivity-result",
    schemaVersion: 1,
    status: connectivityFailure.status,
    graphStatus: "complete",
    traversalGraph,
    traversalGraphHash,
    connectivityFailure,
    connectivityFailureHash,
  }) as HeightfieldRouteConnectivityResultV1;
}

function quantizeRoundHalfAwayFromZero(value: number, quantum: number): number {
  const units = Math.sign(value) * Math.floor(Math.abs(value / quantum) + 0.5);
  const quantized = units * quantum;
  return Object.is(quantized, -0) ? 0 : quantized;
}

function assertContextualGraph(
  graph: TraversalGraphV1,
  receipt: HeightfieldRouteBuildInputReceiptV1,
): void {
  const input = receipt.input;
  const expected: Readonly<Record<string, unknown>> = {
    authoringSpecHash: input.authoringSpecHash,
    layoutSolveReportHash: input.layoutSolveReportHash,
    resourceLockHash: input.resourceLockHash,
    terrainArtifactHash: input.terrainSource.terrainArtifactHash,
    colliderArtifactHash: input.colliderArtifactHash,
    surfaceArtifactHash: input.traversalSurface.resourceHash,
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: input.capabilityEnvelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: input.capabilityEnvelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: input.capabilityEnvelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: input.capabilityEnvelope.graphBuilderProfileHash,
    routeId: input.connectivityRequirement.routeId,
    startAnchorEntityId: input.startAnchor.entityId,
    destinationAnchorEntityId: input.destinationAnchor.entityId,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    requireEqual((graph as unknown as UnknownRecord)[field], expectedValue, `traversalGraph/${field}`);
  }
  for (const node of Object.values(graph.traversalNodesById)) {
    requireEqual(node.traversalSurfaceId, input.traversalSurface.traversalSurfaceId, `traversalGraph/traversalNodesById/${node.id}/traversalSurfaceId`);
    requireEqual(node.surfaceEntityId, input.traversalSurface.surfaceEntityId, `traversalGraph/traversalNodesById/${node.id}/surfaceEntityId`);
    requireEqual(node.colliderSubshapeId, input.traversalSurface.colliderSubshapeId, `traversalGraph/traversalNodesById/${node.id}/colliderSubshapeId`);
  }
}

function assertContextualFailure(
  failure: RouteConnectivityFailureV1,
  receipt: HeightfieldRouteBuildInputReceiptV1,
): void {
  const input = receipt.input;
  const expected: Readonly<Record<string, unknown>> = {
    constraintId: input.connectivityRequirement.constraintId,
    routeId: input.connectivityRequirement.routeId,
    traversingEntityId: input.connectivityRequirement.traversingEntityId,
    startAnchorEntityId: input.startAnchor.entityId,
    destinationAnchorEntityId: input.destinationAnchor.entityId,
    traversalSurfaceId: input.traversalSurface.traversalSurfaceId,
    surfaceEntityId: input.traversalSurface.surfaceEntityId,
    colliderSubshapeId: input.traversalSurface.colliderSubshapeId,
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: input.capabilityEnvelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: input.capabilityEnvelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: input.capabilityEnvelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: input.capabilityEnvelope.graphBuilderProfileHash,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    requireEqual((failure as unknown as UnknownRecord)[field], expectedValue, `connectivityFailure/${field}`);
  }
  const quantum = input.capabilityEnvelope.positionQuantizationMeters;
  const expectedStart = input.startAnchor.positionMetersXYZ.map((component) =>
    quantizeRoundHalfAwayFromZero(component, quantum)
  );
  const expectedDestination = input.destinationAnchor.positionMetersXYZ.map((component) =>
    quantizeRoundHalfAwayFromZero(component, quantum)
  );
  failure.startAnchorPositionMetersXYZ.forEach((component, index) =>
    requireEqual(component, expectedStart[index], `connectivityFailure/startAnchorPositionMetersXYZ/${index}`)
  );
  failure.destinationAnchorPositionMetersXYZ.forEach((component, index) =>
    requireEqual(component, expectedDestination[index], `connectivityFailure/destinationAnchorPositionMetersXYZ/${index}`)
  );
}

export function assertHeightfieldRouteConnectivityResultForBuildInputV1(
  value: unknown,
  buildInputReceipt: unknown,
): HeightfieldRouteConnectivityResultV1 {
  const receipt = assertHeightfieldRouteBuildInputReceiptV1(buildInputReceipt);
  const result = canonicalHeightfieldRouteConnectivityResultV1(value);
  if (result.status === "complete") {
    assertContextualGraph(result.traversalGraph, receipt);
    const input = receipt.input;
    requireEqual(result.routePathReceipt.constraintId, input.connectivityRequirement.constraintId, "routePathReceipt/constraintId");
    requireEqual(result.routePathReceipt.traversingEntityId, input.connectivityRequirement.traversingEntityId, "routePathReceipt/traversingEntityId");
  } else {
    assertContextualFailure(result.connectivityFailure, receipt);
    if (result.graphStatus === "complete") assertContextualGraph(result.traversalGraph, receipt);
  }
  return result;
}
