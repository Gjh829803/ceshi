import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isEqual, isNil, isPlainObject } from "lodash-es";

import {
  assertRouteBuildInputReceiptV2,
  type RouteBuildInputReceiptV2,
} from "./build-input.js";
import {
  assertTraversalGraphForBuildInputV2,
  assertTraversalSurfaceIdentityV1,
  canonicalTraversalGraphV2,
  hashTraversalGraphV2,
  type TraversalGraphV2,
} from "./graph-contract.js";
import {
  assertRoutePathReceiptForGraphV2,
  canonicalRoutePathReceiptV2,
  hashRoutePathReceiptV2,
  type RoutePathReceiptV2,
} from "./path-receipt.js";
import {
  resolveTraversalGraphBuilderProfile,
  resolveTraversalGraphBuilderProfileV2,
} from "./profile-registry.js";
import type { TraversalSurfaceIdentityV1 } from "./types.js";

type Sha256Hash = `sha256:${string}`;
type Vec3 = readonly [number, number, number];
type UnknownRecord = Record<string, unknown>;


export interface RouteThresholdRejectionProofV2 {
  readonly proofKind: "unique-single-reason-cut";
  readonly proofCandidateIds: readonly string[];
  readonly failurePositionMetersXYZ: Vec3;
}

export type RouteThresholdRejectionReasonV2 =
  | Readonly<RouteThresholdRejectionProofV2 & {
      kind: "slope-threshold-exceeded";
      code: "ROUTE_SLOPE_EXCEEDED";
      maximumObservedSlopeDegrees: number;
      maximumAllowedSlopeDegrees: number;
    }>
  | Readonly<RouteThresholdRejectionProofV2 & {
      kind: "step-height-threshold-exceeded";
      code: "ROUTE_STEP_HEIGHT_EXCEEDED";
      maximumObservedStepHeightMeters: number;
      maximumAllowedStepHeightMeters: number;
    }>
  | Readonly<RouteThresholdRejectionProofV2 & {
      kind: "clearance-width-insufficient";
      code: "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT";
      relevantColliderSubshapeIds: readonly string[];
      minimumObservedClearanceWidthMeters: number;
      minimumRequiredClearanceWidthMeters: number;
    }>
  | Readonly<RouteThresholdRejectionProofV2 & {
      kind: "overhead-clearance-insufficient";
      code: "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT";
      relevantColliderSubshapeIds: readonly string[];
      minimumObservedClearanceHeightMeters: number;
      minimumRequiredClearanceHeightMeters: number;
    }>
  | Readonly<RouteThresholdRejectionProofV2 & {
      kind: "surface-gap-exceeded";
      code: "ROUTE_SURFACE_GAP_EXCEEDED";
      maximumObservedSurfaceGapMeters: number;
      maximumAllowedSurfaceGapMeters: 0;
    }>;

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

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

function quantizeRoundHalfAwayFromZero(value: number, quantum: number): number {
  const units = Math.sign(value) * Math.floor(Math.abs(value / quantum) + 0.5);
  const quantized = units * quantum;
  return Object.is(quantized, -0) ? 0 : quantized;
}

export const ROUTE_CONNECTIVITY_FAILURE_CODES_V2 = [
  "ROUTE_START_SURFACE_NOT_FOUND",
  "ROUTE_DESTINATION_SURFACE_NOT_FOUND",
  "ROUTE_REQUIRED_PATH_UNREACHABLE",
  "ROUTE_STEP_HEIGHT_EXCEEDED",
  "ROUTE_SLOPE_EXCEEDED",
  "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT",
  "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT",
  "ROUTE_SURFACE_GAP_EXCEEDED",
  "ROUTE_GRAPH_BUDGET_EXCEEDED",
  "ROUTE_SURFACE_PROFILE_MISSING",
  "ROUTE_SURFACE_CORRELATION_MISSING",
  "ROUTE_SURFACE_CORRELATION_AMBIGUOUS",
] as const;

export type RouteConnectivityFailureCodeV2 =
  (typeof ROUTE_CONNECTIVITY_FAILURE_CODES_V2)[number];

const COMMON_FIELDS_V2 = [
  "kind",
  "schemaVersion",
  "constraintId",
  "routeId",
  "traversingEntityId",
  "startAnchorEntityId",
  "destinationAnchorEntityId",
  "startAnchorPositionMetersXYZ",
  "destinationAnchorPositionMetersXYZ",
  "relatedTraversalSurfaceIdentities",
  "routeBuildInputHash",
  "resolvedTraversalLockHash",
  "graphBuilderProfileRef",
  "graphBuilderResolvedVersion",
  "graphBuilderProfileHash",
] as const;

const FAILURE_BASE_FIELDS_V2 = [
  ...COMMON_FIELDS_V2,
  "status",
  "graphStatus",
  "reason",
] as const;

const REASON_FIELDS_V2: Readonly<
  Record<RouteConnectivityFailureReasonV2["kind"], readonly string[]>
> = {
  "empty-heightfield-source": ["kind", "code", "terrainEntityId"],
  "no-queryable-ground-surface": ["kind", "code"],
  "start-surface-not-found": ["kind", "code", "anchorEntityId", "positionMetersXYZ"],
  "destination-surface-not-found": [
    "kind",
    "code",
    "anchorEntityId",
    "positionMetersXYZ",
  ],
  "required-path-unreachable": [
    "kind",
    "code",
    "relevantBlockingColliderEntityIds",
    "blockedWaterEntityIds",
  ],
  "node-budget-exceeded": ["kind", "code", "maximumAllowedCount", "minimumRequiredCount"],
  "edge-budget-exceeded": ["kind", "code", "maximumAllowedCount", "minimumRequiredCount"],
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
    "maximumObservedSlopeDegrees",
    "maximumAllowedSlopeDegrees",
  ],
  "step-height-threshold-exceeded": [
    "kind",
    "code",
    "proofKind",
    "proofCandidateIds",
    "failurePositionMetersXYZ",
    "maximumObservedStepHeightMeters",
    "maximumAllowedStepHeightMeters",
  ],
  "clearance-width-insufficient": [
    "kind",
    "code",
    "proofKind",
    "proofCandidateIds",
    "failurePositionMetersXYZ",
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
    "maximumObservedSurfaceGapMeters",
    "maximumAllowedSurfaceGapMeters",
  ],
  "surface-profile-missing": [
    "kind",
    "code",
    "relevantColliderSubshapeIds",
    "failurePositionMetersXYZ",
  ],
  "surface-correlation-missing": ["kind", "code", "failurePositionMetersXYZ"],
  "surface-correlation-ambiguous": ["kind", "code", "failurePositionMetersXYZ"],
  "traversal-surface-count-budget-exceeded": [
    "kind",
    "code",
    "maximumAllowedCount",
    "minimumRequiredCount",
  ],
  "traversal-surface-triangle-pair-test-budget-exceeded": [
    "kind",
    "code",
    "maximumAllowedCount",
    "minimumRequiredCount",
  ],
};

type OmitTerrainEntityId<T> = T extends unknown
  ? Omit<T, "terrainEntityId">
  : never;

type RouteThresholdRejectionReasonV2SansTerrain =
  OmitTerrainEntityId<RouteThresholdRejectionReasonV2>;

export type RouteConnectivityFailureReasonV2 =
  | Readonly<{
      kind: "empty-heightfield-source";
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE";
      terrainEntityId: string;
    }>
  | Readonly<{
      kind: "no-queryable-ground-surface";
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE";
    }>
  | Readonly<{
      kind: "start-surface-not-found";
      code: "ROUTE_START_SURFACE_NOT_FOUND";
      anchorEntityId: string;
      positionMetersXYZ: Vec3;
    }>
  | Readonly<{
      kind: "destination-surface-not-found";
      code: "ROUTE_DESTINATION_SURFACE_NOT_FOUND";
      anchorEntityId: string;
      positionMetersXYZ: Vec3;
    }>
  | Readonly<{
      kind: "required-path-unreachable";
      code: "ROUTE_REQUIRED_PATH_UNREACHABLE";
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
  | RouteThresholdRejectionReasonV2
  | Readonly<{
      kind: "surface-profile-missing";
      code: "ROUTE_SURFACE_PROFILE_MISSING";
      relevantColliderSubshapeIds: readonly string[];
      failurePositionMetersXYZ: Vec3;
    }>
  | Readonly<{
      kind: "surface-correlation-missing";
      code: "ROUTE_SURFACE_CORRELATION_MISSING";
      failurePositionMetersXYZ: Vec3;
    }>
  | Readonly<{
      kind: "surface-correlation-ambiguous";
      code: "ROUTE_SURFACE_CORRELATION_AMBIGUOUS";
      failurePositionMetersXYZ: Vec3;
    }>
  | Readonly<{
      kind: "traversal-surface-count-budget-exceeded";
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>
  | Readonly<{
      kind: "traversal-surface-triangle-pair-test-budget-exceeded";
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>;

interface RouteConnectivityFailureCommonV2 {
  readonly kind: "route-connectivity-failure";
  readonly schemaVersion: 2;
  readonly constraintId: string;
  readonly routeId: string;
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly startAnchorPositionMetersXYZ: Vec3;
  readonly destinationAnchorPositionMetersXYZ: Vec3;
  readonly relatedTraversalSurfaceIdentities: readonly TraversalSurfaceIdentityV1[];
  readonly routeBuildInputHash: Sha256Hash;
  readonly resolvedTraversalLockHash: Sha256Hash;
  readonly graphBuilderProfileRef: string;
  readonly graphBuilderResolvedVersion: string;
  readonly graphBuilderProfileHash: Sha256Hash;
}

type ReasonKindV2 = RouteConnectivityFailureReasonV2["kind"];

type RouteConnectivityUnavailableUnreachableReasonV2 =
  | Extract<RouteConnectivityFailureReasonV2, { kind: "empty-heightfield-source" }>
  | Extract<RouteConnectivityFailureReasonV2, { kind: "no-queryable-ground-surface" }>
  | RouteThresholdRejectionReasonV2;

type RouteConnectivityUnavailableIncompleteReasonV2 = Extract<
  RouteConnectivityFailureReasonV2,
  {
    kind:
      | "node-budget-exceeded"
      | "edge-budget-exceeded"
      | "surface-profile-missing"
      | "surface-correlation-missing"
      | "surface-correlation-ambiguous"
      | "traversal-surface-count-budget-exceeded"
      | "traversal-surface-triangle-pair-test-budget-exceeded";
  }
>;

type RouteConnectivityCompleteUnreachableReasonV2 =
  | Extract<RouteConnectivityFailureReasonV2, { kind: "start-surface-not-found" }>
  | Extract<RouteConnectivityFailureReasonV2, { kind: "destination-surface-not-found" }>
  | Extract<RouteConnectivityFailureReasonV2, { kind: "required-path-unreachable" }>
  | RouteThresholdRejectionReasonV2;

type RouteConnectivityCompleteIncompleteReasonV2 = Extract<
  RouteConnectivityFailureReasonV2,
  { kind: "search-budget-exceeded" | "straight-path-capacity-exceeded" }
>;

export type RouteConnectivityFailureV2 =
  | (RouteConnectivityFailureCommonV2 &
      Readonly<{
        status: "unreachable";
        graphStatus: "complete";
        traversalGraphHash: Sha256Hash;
        reason: RouteConnectivityCompleteUnreachableReasonV2;
      }>)
  | (RouteConnectivityFailureCommonV2 &
      Readonly<{
        status: "incomplete";
        graphStatus: "complete";
        traversalGraphHash: Sha256Hash;
        reason: RouteConnectivityCompleteIncompleteReasonV2;
      }>)
  | (RouteConnectivityFailureCommonV2 &
      Readonly<{
        status: "unreachable";
        graphStatus: "unavailable";
        reason: RouteConnectivityUnavailableUnreachableReasonV2;
      }>)
  | (RouteConnectivityFailureCommonV2 &
      Readonly<{
        status: "incomplete";
        graphStatus: "unavailable";
        reason: RouteConnectivityUnavailableIncompleteReasonV2;
      }>);

export type RouteConnectivityResultV2 =
  | Readonly<{
      kind: "route-connectivity-result";
      schemaVersion: 2;
      status: "complete";
      traversalGraph: TraversalGraphV2;
      traversalGraphHash: Sha256Hash;
      routePathReceipt: RoutePathReceiptV2;
      routePathReceiptHash: Sha256Hash;
    }>
  | Readonly<{
      kind: "route-connectivity-result";
      schemaVersion: 2;
      status: "unreachable";
      graphStatus: "complete";
      traversalGraph: TraversalGraphV2;
      traversalGraphHash: Sha256Hash;
      connectivityFailure: Extract<
        RouteConnectivityFailureV2,
        { status: "unreachable"; graphStatus: "complete" }
      >;
      connectivityFailureHash: Sha256Hash;
    }>
  | Readonly<{
      kind: "route-connectivity-result";
      schemaVersion: 2;
      status: "incomplete";
      graphStatus: "complete";
      traversalGraph: TraversalGraphV2;
      traversalGraphHash: Sha256Hash;
      connectivityFailure: Extract<
        RouteConnectivityFailureV2,
        { status: "incomplete"; graphStatus: "complete" }
      >;
      connectivityFailureHash: Sha256Hash;
    }>
  | Readonly<{
      kind: "route-connectivity-result";
      schemaVersion: 2;
      status: "unreachable";
      graphStatus: "unavailable";
      connectivityFailure: Extract<
        RouteConnectivityFailureV2,
        { status: "unreachable"; graphStatus: "unavailable" }
      >;
      connectivityFailureHash: Sha256Hash;
    }>
  | Readonly<{
      kind: "route-connectivity-result";
      schemaVersion: 2;
      status: "incomplete";
      graphStatus: "unavailable";
      connectivityFailure: Extract<
        RouteConnectivityFailureV2,
        { status: "incomplete"; graphStatus: "unavailable" }
      >;
      connectivityFailureHash: Sha256Hash;
    }>;

const ZERO_RELATED_REASON_KINDS = new Set<ReasonKindV2>([
  "empty-heightfield-source",
  "no-queryable-ground-surface",
  "start-surface-not-found",
  "destination-surface-not-found",
  "required-path-unreachable",
  "node-budget-exceeded",
  "edge-budget-exceeded",
  "search-budget-exceeded",
  "straight-path-capacity-exceeded",
  "surface-profile-missing",
  "traversal-surface-count-budget-exceeded",
  "traversal-surface-triangle-pair-test-budget-exceeded",
]);

const THRESHOLD_KINDS_V2 = new Set<ReasonKindV2>([
  "slope-threshold-exceeded",
  "step-height-threshold-exceeded",
  "clearance-width-insufficient",
  "overhead-clearance-insufficient",
  "surface-gap-exceeded",
]);

function failResultV2(path: string, message: string): never {
  throw new Error(
    `ROUTE_CONNECTIVITY_RESULT_INVALID: ${path.length > 0 ? `${path}: ` : ""}${message}`,
  );
}

function requireEqualV2(actual: unknown, expected: unknown, path: string): void {
  if (actual !== expected) {
    failResultV2(path, "does not match related canonical evidence");
  }
}

function canonicalRelatedIdentities(
  value: unknown,
  reasonKind: ReasonKindV2,
): readonly TraversalSurfaceIdentityV1[] {
  if (!Array.isArray(value)) {
    failFailure("relatedTraversalSurfaceIdentities", "must be an array");
  }
  const identities = value.map((candidate, index) => {
    try {
      return assertTraversalSurfaceIdentityV1(candidate);
    } catch {
      failFailure(
        `relatedTraversalSurfaceIdentities/${index}`,
        "must be a canonical Traversal Surface identity",
      );
    }
  });
  let previousId: string | undefined;
  for (const identity of identities) {
    if (!isNil(previousId) && identity.traversalSurfaceId <= previousId) {
      failFailure(
        "relatedTraversalSurfaceIdentities",
        "must be strictly sorted by unique traversalSurfaceId",
      );
    }
    previousId = identity.traversalSurfaceId;
  }
  if (ZERO_RELATED_REASON_KINDS.has(reasonKind) && !isEmpty(identities)) {
    failFailure(
      "relatedTraversalSurfaceIdentities",
      "must be empty for this reason",
    );
  }
  if (reasonKind === "surface-correlation-missing" && identities.length > 1) {
    failFailure(
      "relatedTraversalSurfaceIdentities",
      "must contain at most one identity",
    );
  }
  if (reasonKind === "surface-correlation-ambiguous" && identities.length < 2) {
    failFailure(
      "relatedTraversalSurfaceIdentities",
      "must contain at least two identities",
    );
  }
  if (THRESHOLD_KINDS_V2.has(reasonKind) && isEmpty(identities)) {
    failFailure(
      "relatedTraversalSurfaceIdentities",
      "must contain at least one identity",
    );
  }
  return identities;
}

function canonicalReasonV2(value: unknown): RouteConnectivityFailureReasonV2 {
  const base = requireRecord(value, "reason", failFailure);
  if (typeof base.kind !== "string" || !(base.kind in REASON_FIELDS_V2)) {
    failFailure("reason/kind", "is not a supported failure reason");
  }
  const kind = base.kind as ReasonKindV2;
  const record = requireExactRecord(
    value,
    REASON_FIELDS_V2[kind],
    "reason",
    failFailure,
  );
  const expectedCodes: Readonly<Record<ReasonKindV2, RouteConnectivityFailureCodeV2>> = {
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
    "surface-profile-missing": "ROUTE_SURFACE_PROFILE_MISSING",
    "surface-correlation-missing": "ROUTE_SURFACE_CORRELATION_MISSING",
    "surface-correlation-ambiguous": "ROUTE_SURFACE_CORRELATION_AMBIGUOUS",
    "traversal-surface-count-budget-exceeded": "ROUTE_GRAPH_BUDGET_EXCEEDED",
    "traversal-surface-triangle-pair-test-budget-exceeded": "ROUTE_GRAPH_BUDGET_EXCEEDED",
  };
  if (record.code !== expectedCodes[kind]) {
    failFailure("reason/code", `must be '${expectedCodes[kind]}'`);
  }
  if (!isNil(record.terrainEntityId)) {
    requireString(record.terrainEntityId, "reason/terrainEntityId", failFailure);
  }
  if (!isNil(record.anchorEntityId)) {
    requireString(record.anchorEntityId, "reason/anchorEntityId", failFailure);
  }
  if (
    kind === "node-budget-exceeded" ||
    kind === "edge-budget-exceeded" ||
    kind === "search-budget-exceeded" ||
    kind === "straight-path-capacity-exceeded" ||
    kind === "traversal-surface-count-budget-exceeded" ||
    kind === "traversal-surface-triangle-pair-test-budget-exceeded"
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
    requireSortedUniqueStrings(
      record.blockedWaterEntityIds,
      "reason/blockedWaterEntityIds",
    );
  }
  if (THRESHOLD_KINDS_V2.has(kind)) {
    if (record.proofKind !== "unique-single-reason-cut") {
      failFailure("reason/proofKind", "must be 'unique-single-reason-cut'");
    }
    const proofIds = requireSortedUniqueStrings(
      record.proofCandidateIds,
      "reason/proofCandidateIds",
    );
    if (isEmpty(proofIds)) {
      failFailure("reason/proofCandidateIds", "must not be empty");
    }
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
    if (!(observed > allowed)) {
      failFailure("reason", "step observation must exceed allowed");
    }
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
    if (!(observed < required)) {
      failFailure("reason", "width observation must be insufficient");
    }
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
    if (!(observed < required)) {
      failFailure("reason", "height observation must be insufficient");
    }
  } else if (kind === "surface-gap-exceeded") {
    const observed = requirePositive(
      record.maximumObservedSurfaceGapMeters,
      "reason/maximumObservedSurfaceGapMeters",
      failFailure,
    );
    if (record.maximumAllowedSurfaceGapMeters !== 0 || !(observed > 0)) {
      failFailure("reason", "allowed gap must be exactly zero");
    }
  } else if (kind === "surface-profile-missing") {
    const ids = requireSortedUniqueStrings(
      record.relevantColliderSubshapeIds,
      "reason/relevantColliderSubshapeIds",
    );
    if (isEmpty(ids)) {
      failFailure("reason/relevantColliderSubshapeIds", "must not be empty");
    }
    requireVec3(
      record.failurePositionMetersXYZ,
      "reason/failurePositionMetersXYZ",
      failFailure,
    );
  } else if (
    kind === "surface-correlation-missing" ||
    kind === "surface-correlation-ambiguous"
  ) {
    requireVec3(
      record.failurePositionMetersXYZ,
      "reason/failurePositionMetersXYZ",
      failFailure,
    );
  }
  return canonicalPlainCopy(record) as RouteConnectivityFailureReasonV2;
}

export function canonicalRouteConnectivityFailureV2(
  value: unknown,
): RouteConnectivityFailureV2 {
  const base = requireRecord(value, "", failFailure);
  const complete = base.graphStatus === "complete";
  const fields = complete
    ? [...FAILURE_BASE_FIELDS_V2, "traversalGraphHash"]
    : FAILURE_BASE_FIELDS_V2;
  const record = requireExactRecord(value, fields, "", failFailure);
  if (record.kind !== "route-connectivity-failure") {
    failFailure("kind", "must be 'route-connectivity-failure'");
  }
  if (record.schemaVersion !== 2) failFailure("schemaVersion", "must be 2");
  const reason = canonicalReasonV2(record.reason);
  const unavailableUnreachable = new Set<ReasonKindV2>([
    "empty-heightfield-source",
    "no-queryable-ground-surface",
    "surface-profile-missing",
    "surface-correlation-missing",
    "surface-correlation-ambiguous",
    ...THRESHOLD_KINDS_V2,
  ]);
  const unavailableIncomplete = new Set<ReasonKindV2>([
    "node-budget-exceeded",
    "edge-budget-exceeded",
    "traversal-surface-count-budget-exceeded",
    "traversal-surface-triangle-pair-test-budget-exceeded",
  ]);
  const completeUnreachable = new Set<ReasonKindV2>([
    "start-surface-not-found",
    "destination-surface-not-found",
    "required-path-unreachable",
    ...THRESHOLD_KINDS_V2,
  ]);
  const completeIncomplete = new Set<ReasonKindV2>([
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
    "graphBuilderProfileRef",
    "graphBuilderResolvedVersion",
  ]) {
    commonStrings[field] = requireString(record[field], field, failFailure);
  }
  if (commonStrings.startAnchorEntityId === commonStrings.destinationAnchorEntityId) {
    failFailure("startAnchorEntityId", "must differ from destinationAnchorEntityId");
  }
  const commonHashes = {
    routeBuildInputHash: requireHash(
      record.routeBuildInputHash,
      "routeBuildInputHash",
      failFailure,
    ),
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
    resolved = resolveTraversalGraphBuilderProfileV2(
      commonStrings.graphBuilderProfileRef!,
    );
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
  const relatedTraversalSurfaceIdentities = canonicalRelatedIdentities(
    record.relatedTraversalSurfaceIdentities,
    reasonKind,
  );
  const traversalGraphHash = complete
    ? requireHash(record.traversalGraphHash, "traversalGraphHash", failFailure)
    : undefined;
  return deepFreeze({
    kind: "route-connectivity-failure",
    schemaVersion: 2,
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
    relatedTraversalSurfaceIdentities,
    ...commonHashes,
    graphBuilderProfileRef: commonStrings.graphBuilderProfileRef!,
    graphBuilderResolvedVersion: commonStrings.graphBuilderResolvedVersion!,
    status: record.status,
    graphStatus: record.graphStatus,
    ...(isNil(traversalGraphHash) ? {} : { traversalGraphHash }),
    reason,
  }) as RouteConnectivityFailureV2;
}

export function hashRouteConnectivityFailureV2(value: unknown): Sha256Hash {
  return sha256CanonicalJson(canonicalRouteConnectivityFailureV2(value)) as Sha256Hash;
}

export function canonicalRouteConnectivityResultV2(
  value: unknown,
): RouteConnectivityResultV2 {
  const base = requireRecord(value, "", failResultV2);
  if (base.kind !== "route-connectivity-result") {
    failResultV2("kind", "must be 'route-connectivity-result'");
  }
  if (base.schemaVersion !== 2) failResultV2("schemaVersion", "must be 2");
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
      failResultV2,
    );
    const traversalGraph = canonicalTraversalGraphV2(record.traversalGraph);
    const traversalGraphHash = requireHash(
      record.traversalGraphHash,
      "traversalGraphHash",
      failResultV2,
    );
    requireEqualV2(
      traversalGraphHash,
      hashTraversalGraphV2(traversalGraph),
      "traversalGraphHash",
    );
    const routePathReceipt = assertRoutePathReceiptForGraphV2(
      record.routePathReceipt,
      traversalGraph,
    );
    const routePathReceiptHash = requireHash(
      record.routePathReceiptHash,
      "routePathReceiptHash",
      failResultV2,
    );
    requireEqualV2(
      routePathReceiptHash,
      hashRoutePathReceiptV2(routePathReceipt),
      "routePathReceiptHash",
    );
    return deepFreeze({
      kind: "route-connectivity-result",
      schemaVersion: 2,
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
    failResultV2,
  );
  const connectivityFailure = canonicalRouteConnectivityFailureV2(
    record.connectivityFailure,
  );
  if (
    connectivityFailure.status !== record.status ||
    connectivityFailure.graphStatus !== record.graphStatus
  ) {
    failResultV2("connectivityFailure", "status and graphStatus must match the outer variant");
  }
  const connectivityFailureHash = requireHash(
    record.connectivityFailureHash,
    "connectivityFailureHash",
    failResultV2,
  );
  requireEqualV2(
    connectivityFailureHash,
    hashRouteConnectivityFailureV2(connectivityFailure),
    "connectivityFailureHash",
  );
  if (!completeGraph) {
    return deepFreeze({
      kind: "route-connectivity-result",
      schemaVersion: 2,
      status: connectivityFailure.status,
      graphStatus: "unavailable",
      connectivityFailure,
      connectivityFailureHash,
    }) as RouteConnectivityResultV2;
  }
  const traversalGraph = canonicalTraversalGraphV2(record.traversalGraph);
  const traversalGraphHash = requireHash(
    record.traversalGraphHash,
    "traversalGraphHash",
    failResultV2,
  );
  requireEqualV2(
    traversalGraphHash,
    hashTraversalGraphV2(traversalGraph),
    "traversalGraphHash",
  );
  if (connectivityFailure.graphStatus !== "complete") {
    failResultV2("connectivityFailure/graphStatus", "must be 'complete'");
  }
  requireEqualV2(
    connectivityFailure.traversalGraphHash,
    traversalGraphHash,
    "connectivityFailure/traversalGraphHash",
  );
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
    requireEqualV2(
      connectivityFailure[field],
      traversalGraph[field],
      `connectivityFailure/${field}`,
    );
  }
  return deepFreeze({
    kind: "route-connectivity-result",
    schemaVersion: 2,
    status: connectivityFailure.status,
    graphStatus: "complete",
    traversalGraph,
    traversalGraphHash,
    connectivityFailure,
    connectivityFailureHash,
  }) as RouteConnectivityResultV2;
}

function assertContextualFailureV2(
  failure: RouteConnectivityFailureV2,
  receipt: RouteBuildInputReceiptV2,
): void {
  const input = receipt.input;
  const expected: Readonly<Record<string, unknown>> = {
    constraintId: input.connectivityRequirement.constraintId,
    routeId: input.connectivityRequirement.routeId,
    traversingEntityId: input.connectivityRequirement.traversingEntityId,
    startAnchorEntityId: input.startAnchor.entityId,
    destinationAnchorEntityId: input.destinationAnchor.entityId,
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: input.capabilityEnvelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: input.capabilityEnvelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: input.capabilityEnvelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: input.capabilityEnvelope.graphBuilderProfileHash,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    requireEqualV2(
      (failure as unknown as UnknownRecord)[field],
      expectedValue,
      `connectivityFailure/${field}`,
    );
  }
  const inventory = new Map(
    input.traversalSurfaces.map((surface) => [surface.traversalSurfaceId, surface]),
  );
  failure.relatedTraversalSurfaceIdentities.forEach((identity, index) => {
    const expectedIdentity = inventory.get(identity.traversalSurfaceId);
    if (isNil(expectedIdentity) || !isEqual(identity, expectedIdentity)) {
      failResultV2(
        `connectivityFailure/relatedTraversalSurfaceIdentities/${index}`,
        "must equal a Build Input Traversal Surface identity",
      );
    }
  });
  if (failure.reason.kind === "empty-heightfield-source") {
    if (input.terrainSource.kind !== "empty" || !isEmpty(input.staticColliders)) {
      failResultV2(
        "connectivityFailure/reason",
        "empty-heightfield-source requires empty terrainSource and empty staticColliders",
      );
    }
    requireEqualV2(
      failure.reason.terrainEntityId,
      input.terrainSource.terrainEntityId,
      "connectivityFailure/reason/terrainEntityId",
    );
  }
  const quantum = input.capabilityEnvelope.positionQuantizationMeters;
  const expectedStart = input.startAnchor.positionMetersXYZ.map((component) =>
    quantizeRoundHalfAwayFromZero(component, quantum),
  );
  const expectedDestination = input.destinationAnchor.positionMetersXYZ.map((component) =>
    quantizeRoundHalfAwayFromZero(component, quantum),
  );
  failure.startAnchorPositionMetersXYZ.forEach((component, index) =>
    requireEqualV2(
      component,
      expectedStart[index],
      `connectivityFailure/startAnchorPositionMetersXYZ/${index}`,
    ),
  );
  failure.destinationAnchorPositionMetersXYZ.forEach((component, index) =>
    requireEqualV2(
      component,
      expectedDestination[index],
      `connectivityFailure/destinationAnchorPositionMetersXYZ/${index}`,
    ),
  );
  if (failure.reason.kind === "start-surface-not-found") {
    requireEqualV2(
      failure.reason.anchorEntityId,
      input.startAnchor.entityId,
      "connectivityFailure/reason/anchorEntityId",
    );
    failure.reason.positionMetersXYZ.forEach((component, index) =>
      requireEqualV2(
        component,
        expectedStart[index],
        `connectivityFailure/reason/positionMetersXYZ/${index}`,
      ),
    );
  } else if (failure.reason.kind === "destination-surface-not-found") {
    requireEqualV2(
      failure.reason.anchorEntityId,
      input.destinationAnchor.entityId,
      "connectivityFailure/reason/anchorEntityId",
    );
    failure.reason.positionMetersXYZ.forEach((component, index) =>
      requireEqualV2(
        component,
        expectedDestination[index],
        `connectivityFailure/reason/positionMetersXYZ/${index}`,
      ),
    );
  }
  let actualMaximumAllowedCount: number | undefined;
  let expectedMaximumAllowedCount: number | undefined;
  if (failure.reason.kind === "node-budget-exceeded") {
    actualMaximumAllowedCount = failure.reason.maximumAllowedCount;
    expectedMaximumAllowedCount = input.capabilityEnvelope.maximumNodes;
  } else if (failure.reason.kind === "edge-budget-exceeded") {
    actualMaximumAllowedCount = failure.reason.maximumAllowedCount;
    expectedMaximumAllowedCount = input.capabilityEnvelope.maximumEdges;
  } else if (failure.reason.kind === "search-budget-exceeded") {
    actualMaximumAllowedCount = failure.reason.maximumAllowedCount;
    expectedMaximumAllowedCount = input.capabilityEnvelope.maximumSearchSteps;
  } else if (
    failure.reason.kind === "traversal-surface-count-budget-exceeded"
  ) {
    actualMaximumAllowedCount = failure.reason.maximumAllowedCount;
    expectedMaximumAllowedCount =
      input.capabilityEnvelope.maximumTraversalSurfaceCount;
  } else if (
    failure.reason.kind ===
    "traversal-surface-triangle-pair-test-budget-exceeded"
  ) {
    actualMaximumAllowedCount = failure.reason.maximumAllowedCount;
    expectedMaximumAllowedCount =
      input.capabilityEnvelope.maximumTraversalSurfaceTrianglePairTestCount;
  }
  if (!isNil(expectedMaximumAllowedCount)) {
    requireEqualV2(
      actualMaximumAllowedCount,
      expectedMaximumAllowedCount,
      "connectivityFailure/reason/maximumAllowedCount",
    );
  }
  if (
    failure.reason.kind ===
    "traversal-surface-triangle-pair-test-budget-exceeded"
  ) {
    requireEqualV2(
      failure.reason.minimumRequiredCount,
      input.capabilityEnvelope.maximumTraversalSurfaceTrianglePairTestCount +
        1,
      "connectivityFailure/reason/minimumRequiredCount",
    );
  }
  if (failure.reason.kind === "slope-threshold-exceeded") {
    requireEqualV2(
      "maximumAllowedSlopeDegrees" in failure.reason
        ? failure.reason.maximumAllowedSlopeDegrees
        : undefined,
      input.capabilityEnvelope.maxSlopeDegrees,
      "connectivityFailure/reason/maximumAllowedSlopeDegrees",
    );
  } else if (failure.reason.kind === "step-height-threshold-exceeded") {
    requireEqualV2(
      "maximumAllowedStepHeightMeters" in failure.reason
        ? failure.reason.maximumAllowedStepHeightMeters
        : undefined,
      input.capabilityEnvelope.maxStepHeightMeters,
      "connectivityFailure/reason/maximumAllowedStepHeightMeters",
    );
  } else if (failure.reason.kind === "clearance-width-insufficient") {
    requireEqualV2(
      failure.reason.minimumRequiredClearanceWidthMeters,
      2 * (
        input.capabilityEnvelope.capsuleRadiusMeters +
        input.capabilityEnvelope.clearanceMarginMeters
      ),
      "connectivityFailure/reason/minimumRequiredClearanceWidthMeters",
    );
  } else if (failure.reason.kind === "overhead-clearance-insufficient") {
    requireEqualV2(
      failure.reason.minimumRequiredClearanceHeightMeters,
      input.capabilityEnvelope.capsuleHeightMeters,
      "connectivityFailure/reason/minimumRequiredClearanceHeightMeters",
    );
  }
  if (
    failure.reason.kind === "clearance-width-insufficient" ||
    failure.reason.kind === "overhead-clearance-insufficient" ||
    failure.reason.kind === "surface-profile-missing"
  ) {
    const colliderSubshapeIds = new Set(
      input.staticColliders.map((collider) => collider.colliderSubshapeId),
    );
    failure.reason.relevantColliderSubshapeIds.forEach(
      (colliderSubshapeId, index) => {
        if (!colliderSubshapeIds.has(colliderSubshapeId)) {
          failResultV2(
            `connectivityFailure/reason/relevantColliderSubshapeIds/${index}`,
            "must reference a Build Input static Collider",
          );
        }
      },
    );
  }
}

export function assertRouteConnectivityResultForBuildInputV2(
  value: unknown,
  buildInputReceipt: unknown,
): RouteConnectivityResultV2 {
  const receipt = assertRouteBuildInputReceiptV2(buildInputReceipt);
  const result = canonicalRouteConnectivityResultV2(value);
  if (result.status === "complete") {
    assertTraversalGraphForBuildInputV2(result.traversalGraph, receipt);
    requireEqualV2(
      result.routePathReceipt.constraintId,
      receipt.input.connectivityRequirement.constraintId,
      "routePathReceipt/constraintId",
    );
    requireEqualV2(
      result.routePathReceipt.traversingEntityId,
      receipt.input.connectivityRequirement.traversingEntityId,
      "routePathReceipt/traversingEntityId",
    );
  } else {
    assertContextualFailureV2(result.connectivityFailure, receipt);
    if (result.graphStatus === "complete") {
      assertTraversalGraphForBuildInputV2(result.traversalGraph, receipt);
    }
  }
  return result;
}
