import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil, isPlainObject } from "lodash-es";

import {
  assertTraversalSurfaceIdentityV1,
  hashTraversalGraphV2,
  type TraversalGraphV2,
} from "./graph-contract.js";
import { resolveTraversalGraphBuilderProfile } from "./profile-registry.js";
import type { TraversalSurfaceIdentityV1 } from "./types.js";

type Sha256Hash = `sha256:${string}`;
type Vec3 = readonly [number, number, number];
type UnknownRecord = Record<string, unknown>;

export interface RoutePathReceiptV1 {
  readonly kind: "route-path-receipt";
  readonly schemaVersion: 1;
  readonly status: "complete";
  readonly constraintId: string;
  readonly routeId: string;
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly authoringSpecHash: Sha256Hash;
  readonly layoutSolveReportHash: Sha256Hash;
  readonly resourceLockHash: Sha256Hash;
  readonly traversalGraphHash: Sha256Hash;
  readonly routeBuildInputHash: Sha256Hash;
  readonly resolvedTraversalLockHash: Sha256Hash;
  readonly traversalSurfaceIdentity: TraversalSurfaceIdentityV1;
  readonly graphBuilderProfileRef: string;
  readonly graphBuilderResolvedVersion: string;
  readonly graphBuilderProfileHash: Sha256Hash;
  readonly orderedTraversalNodeIds: readonly string[];
  readonly orderedTraversalEdgeIds: readonly string[];
  readonly orderedPathPositionsMetersXYZ: readonly Vec3[];
  readonly routePathDistanceMeters: number;
  readonly routePathDistanceMetersXZ: number;
  readonly routePathCost: number;
  readonly maximumObservedSlopeDegrees: number;
  readonly maximumObservedStepHeightMeters: number;
  readonly minimumObservedClearanceWidthMeters: number;
  readonly minimumObservedClearanceHeightMeters: number;
  readonly maximumObservedSurfaceGapMeters: number;
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RECEIPT_FIELDS = [
  "kind",
  "schemaVersion",
  "status",
  "constraintId",
  "routeId",
  "traversingEntityId",
  "startAnchorEntityId",
  "destinationAnchorEntityId",
  "authoringSpecHash",
  "layoutSolveReportHash",
  "resourceLockHash",
  "traversalGraphHash",
  "routeBuildInputHash",
  "resolvedTraversalLockHash",
  "traversalSurfaceIdentity",
  "graphBuilderProfileRef",
  "graphBuilderResolvedVersion",
  "graphBuilderProfileHash",
  "orderedTraversalNodeIds",
  "orderedTraversalEdgeIds",
  "orderedPathPositionsMetersXYZ",
  "routePathDistanceMeters",
  "routePathDistanceMetersXZ",
  "routePathCost",
  "maximumObservedSlopeDegrees",
  "maximumObservedStepHeightMeters",
  "minimumObservedClearanceWidthMeters",
  "minimumObservedClearanceHeightMeters",
  "maximumObservedSurfaceGapMeters",
] as const;

function fail(path: string, message: string): never {
  throw new Error(
    `ROUTE_PATH_RECEIPT_INVALID: ${path.length > 0 ? `${path}: ` : ""}${message}`,
  );
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    fail(path, "expected a plain object");
  }
  return value as UnknownRecord;
}

function requireExactRecord(
  value: unknown,
  fields: readonly string[],
  path: string,
): UnknownRecord {
  const record = requireRecord(value, path);
  const allowed = new Set(fields);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) fail(path, `unknown field '${unknown}'`);
  for (const field of fields) {
    if (isNil(record[field])) fail(path, `missing field '${field}'`);
  }
  return record;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(path, "must be a non-empty string");
  }
  return value;
}

function requireHash(value: unknown, path: string): Sha256Hash {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(path, "must be a lowercase sha256 hash");
  }
  return value as Sha256Hash;
}

function requireFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "must be finite");
  }
  return value === 0 ? 0 : value;
}

function requireNonNegative(value: unknown, path: string): number {
  const number = requireFinite(value, path);
  if (number < 0) fail(path, "must be >= 0");
  return number;
}

function requirePositive(value: unknown, path: string): number {
  const number = requireFinite(value, path);
  if (!(number > 0)) fail(path, "must be > 0");
  return number;
}

function requireSlope(value: unknown, path: string): number {
  const degrees = requireFinite(value, path);
  if (degrees < 0 || degrees > 90) fail(path, "must be in [0, 90]");
  return degrees;
}

function requireUniqueStringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  const values = value.map((entry, index) =>
    requireString(entry, `${path}/${index}`)
  );
  if (new Set(values).size !== values.length) {
    fail(path, "must not contain duplicate ids");
  }
  return values;
}

function requireVec3(value: unknown, path: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) {
    fail(path, "must be a 3-tuple");
  }
  return [
    requireFinite(value[0], `${path}/0`),
    requireFinite(value[1], `${path}/1`),
    requireFinite(value[2], `${path}/2`),
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

export function canonicalRoutePathReceiptV1(
  value: unknown,
): RoutePathReceiptV1 {
  const record = requireExactRecord(value, RECEIPT_FIELDS, "");
  if (record.kind !== "route-path-receipt") {
    fail("kind", "must be 'route-path-receipt'");
  }
  if (record.schemaVersion !== 1) fail("schemaVersion", "must be 1");
  if (record.status !== "complete") fail("status", "must be 'complete'");

  const strings = {
    constraintId: requireString(record.constraintId, "constraintId"),
    routeId: requireString(record.routeId, "routeId"),
    traversingEntityId: requireString(
      record.traversingEntityId,
      "traversingEntityId",
    ),
    startAnchorEntityId: requireString(
      record.startAnchorEntityId,
      "startAnchorEntityId",
    ),
    destinationAnchorEntityId: requireString(
      record.destinationAnchorEntityId,
      "destinationAnchorEntityId",
    ),
    graphBuilderProfileRef: requireString(
      record.graphBuilderProfileRef,
      "graphBuilderProfileRef",
    ),
    graphBuilderResolvedVersion: requireString(
      record.graphBuilderResolvedVersion,
      "graphBuilderResolvedVersion",
    ),
  } as const;
  if (strings.startAnchorEntityId === strings.destinationAnchorEntityId) {
    fail("startAnchorEntityId", "must differ from destinationAnchorEntityId");
  }
  const hashes = {
    authoringSpecHash: requireHash(record.authoringSpecHash, "authoringSpecHash"),
    layoutSolveReportHash: requireHash(
      record.layoutSolveReportHash,
      "layoutSolveReportHash",
    ),
    resourceLockHash: requireHash(record.resourceLockHash, "resourceLockHash"),
    traversalGraphHash: requireHash(record.traversalGraphHash, "traversalGraphHash"),
    routeBuildInputHash: requireHash(record.routeBuildInputHash, "routeBuildInputHash"),
    resolvedTraversalLockHash: requireHash(
      record.resolvedTraversalLockHash,
      "resolvedTraversalLockHash",
    ),
    graphBuilderProfileHash: requireHash(
      record.graphBuilderProfileHash,
      "graphBuilderProfileHash",
    ),
  } as const;
  let traversalSurfaceIdentity: TraversalSurfaceIdentityV1;
  try {
    traversalSurfaceIdentity = assertTraversalSurfaceIdentityV1(
      record.traversalSurfaceIdentity,
    );
  } catch {
    fail("traversalSurfaceIdentity", "must be a canonical Traversal Surface identity");
  }
  let resolved;
  try {
    resolved = resolveTraversalGraphBuilderProfile(strings.graphBuilderProfileRef);
  } catch (cause) {
    fail(
      "graphBuilderProfileRef",
      cause instanceof Error ? cause.message : "Profile resolution failed",
    );
  }
  if (
    resolved.resolvedVersion !== strings.graphBuilderResolvedVersion ||
    resolved.contentHash !== hashes.graphBuilderProfileHash
  ) {
    fail("graphBuilderProfileRef", "must match the Registry Profile identity");
  }

  const orderedTraversalNodeIds = requireUniqueStringArray(
    record.orderedTraversalNodeIds,
    "orderedTraversalNodeIds",
  );
  if (orderedTraversalNodeIds.length === 0) {
    fail("orderedTraversalNodeIds", "must contain at least one Node id");
  }
  const orderedTraversalEdgeIds = requireUniqueStringArray(
    record.orderedTraversalEdgeIds,
    "orderedTraversalEdgeIds",
  );
  if (orderedTraversalEdgeIds.length !== orderedTraversalNodeIds.length - 1) {
    fail(
      "orderedTraversalEdgeIds",
      "length must equal orderedTraversalNodeIds.length - 1",
    );
  }
  if (!Array.isArray(record.orderedPathPositionsMetersXYZ)) {
    fail("orderedPathPositionsMetersXYZ", "must be an array");
  }
  const orderedPathPositionsMetersXYZ = record.orderedPathPositionsMetersXYZ.map(
    (position, index) =>
      requireVec3(position, `orderedPathPositionsMetersXYZ/${index}`),
  );
  if (orderedPathPositionsMetersXYZ.length === 0) {
    fail("orderedPathPositionsMetersXYZ", "must contain at least one position");
  }
  for (let index = 1; index < orderedPathPositionsMetersXYZ.length; index += 1) {
    const previous = orderedPathPositionsMetersXYZ[index - 1]!;
    const current = orderedPathPositionsMetersXYZ[index]!;
    if (
      previous[0] === current[0] &&
      previous[1] === current[1] &&
      previous[2] === current[2]
    ) {
      fail("orderedPathPositionsMetersXYZ", "adjacent positions must be distinct");
    }
  }

  return deepFreeze({
    kind: "route-path-receipt",
    schemaVersion: 1,
    status: "complete",
    ...strings,
    ...hashes,
    traversalSurfaceIdentity,
    orderedTraversalNodeIds,
    orderedTraversalEdgeIds,
    orderedPathPositionsMetersXYZ,
    routePathDistanceMeters: requireNonNegative(
      record.routePathDistanceMeters,
      "routePathDistanceMeters",
    ),
    routePathDistanceMetersXZ: requireNonNegative(
      record.routePathDistanceMetersXZ,
      "routePathDistanceMetersXZ",
    ),
    routePathCost: requireNonNegative(record.routePathCost, "routePathCost"),
    maximumObservedSlopeDegrees: requireSlope(
      record.maximumObservedSlopeDegrees,
      "maximumObservedSlopeDegrees",
    ),
    maximumObservedStepHeightMeters: requireNonNegative(
      record.maximumObservedStepHeightMeters,
      "maximumObservedStepHeightMeters",
    ),
    minimumObservedClearanceWidthMeters: requirePositive(
      record.minimumObservedClearanceWidthMeters,
      "minimumObservedClearanceWidthMeters",
    ),
    minimumObservedClearanceHeightMeters: requirePositive(
      record.minimumObservedClearanceHeightMeters,
      "minimumObservedClearanceHeightMeters",
    ),
    maximumObservedSurfaceGapMeters: requireNonNegative(
      record.maximumObservedSurfaceGapMeters,
      "maximumObservedSurfaceGapMeters",
    ),
  });
}

export function hashRoutePathReceiptV1(value: unknown): Sha256Hash {
  return sha256CanonicalJson(canonicalRoutePathReceiptV1(value)) as Sha256Hash;
}

const RECEIPT_FIELDS_V2 = RECEIPT_FIELDS.map((field) =>
  field === "traversalSurfaceIdentity" ? "orderedTraversalSurfaceIdentities" : field,
);

export interface RoutePathReceiptV2 extends Omit<
  RoutePathReceiptV1,
  "schemaVersion" | "traversalSurfaceIdentity"
> {
  readonly schemaVersion: 2;
  readonly orderedTraversalSurfaceIdentities: readonly TraversalSurfaceIdentityV1[];
}

function canonicalOrderedIdentities(
  value: unknown,
  expectedLength: number,
): readonly TraversalSurfaceIdentityV1[] {
  if (!Array.isArray(value)) {
    fail("orderedTraversalSurfaceIdentities", "must be an array");
  }
  if (value.length !== expectedLength) {
    fail(
      "orderedTraversalSurfaceIdentities",
      "length must equal orderedTraversalNodeIds.length",
    );
  }
  return value.map((candidate, index) => {
    try {
      return assertTraversalSurfaceIdentityV1(candidate);
    } catch {
      fail(
        `orderedTraversalSurfaceIdentities/${index}`,
        "must be a canonical Traversal Surface identity",
      );
    }
  });
}

export function canonicalRoutePathReceiptV2(value: unknown): RoutePathReceiptV2 {
  const record = requireExactRecord(value, RECEIPT_FIELDS_V2, "");
  if (record.kind !== "route-path-receipt") {
    fail("kind", "must be 'route-path-receipt'");
  }
  if (record.schemaVersion !== 2) fail("schemaVersion", "must be 2");
  if (record.status !== "complete") fail("status", "must be 'complete'");

  const strings = {
    constraintId: requireString(record.constraintId, "constraintId"),
    routeId: requireString(record.routeId, "routeId"),
    traversingEntityId: requireString(
      record.traversingEntityId,
      "traversingEntityId",
    ),
    startAnchorEntityId: requireString(
      record.startAnchorEntityId,
      "startAnchorEntityId",
    ),
    destinationAnchorEntityId: requireString(
      record.destinationAnchorEntityId,
      "destinationAnchorEntityId",
    ),
    graphBuilderProfileRef: requireString(
      record.graphBuilderProfileRef,
      "graphBuilderProfileRef",
    ),
    graphBuilderResolvedVersion: requireString(
      record.graphBuilderResolvedVersion,
      "graphBuilderResolvedVersion",
    ),
  } as const;
  if (strings.startAnchorEntityId === strings.destinationAnchorEntityId) {
    fail("startAnchorEntityId", "must differ from destinationAnchorEntityId");
  }
  const hashes = {
    authoringSpecHash: requireHash(record.authoringSpecHash, "authoringSpecHash"),
    layoutSolveReportHash: requireHash(
      record.layoutSolveReportHash,
      "layoutSolveReportHash",
    ),
    resourceLockHash: requireHash(record.resourceLockHash, "resourceLockHash"),
    traversalGraphHash: requireHash(record.traversalGraphHash, "traversalGraphHash"),
    routeBuildInputHash: requireHash(record.routeBuildInputHash, "routeBuildInputHash"),
    resolvedTraversalLockHash: requireHash(
      record.resolvedTraversalLockHash,
      "resolvedTraversalLockHash",
    ),
    graphBuilderProfileHash: requireHash(
      record.graphBuilderProfileHash,
      "graphBuilderProfileHash",
    ),
  } as const;
  let resolved;
  try {
    resolved = resolveTraversalGraphBuilderProfile(strings.graphBuilderProfileRef);
  } catch (cause) {
    fail(
      "graphBuilderProfileRef",
      cause instanceof Error ? cause.message : "Profile resolution failed",
    );
  }
  if (
    resolved.resolvedVersion !== strings.graphBuilderResolvedVersion ||
    resolved.contentHash !== hashes.graphBuilderProfileHash
  ) {
    fail("graphBuilderProfileRef", "must match the Registry Profile identity");
  }

  const orderedTraversalNodeIds = requireUniqueStringArray(
    record.orderedTraversalNodeIds,
    "orderedTraversalNodeIds",
  );
  if (orderedTraversalNodeIds.length === 0) {
    fail("orderedTraversalNodeIds", "must contain at least one Node id");
  }
  const orderedTraversalEdgeIds = requireUniqueStringArray(
    record.orderedTraversalEdgeIds,
    "orderedTraversalEdgeIds",
  );
  if (orderedTraversalEdgeIds.length !== orderedTraversalNodeIds.length - 1) {
    fail(
      "orderedTraversalEdgeIds",
      "length must equal orderedTraversalNodeIds.length - 1",
    );
  }
  if (!Array.isArray(record.orderedPathPositionsMetersXYZ)) {
    fail("orderedPathPositionsMetersXYZ", "must be an array");
  }
  const orderedPathPositionsMetersXYZ = record.orderedPathPositionsMetersXYZ.map(
    (position, index) =>
      requireVec3(position, `orderedPathPositionsMetersXYZ/${index}`),
  );
  if (orderedPathPositionsMetersXYZ.length === 0) {
    fail("orderedPathPositionsMetersXYZ", "must contain at least one position");
  }
  for (let index = 1; index < orderedPathPositionsMetersXYZ.length; index += 1) {
    const previous = orderedPathPositionsMetersXYZ[index - 1]!;
    const current = orderedPathPositionsMetersXYZ[index]!;
    if (
      previous[0] === current[0] &&
      previous[1] === current[1] &&
      previous[2] === current[2]
    ) {
      fail("orderedPathPositionsMetersXYZ", "adjacent positions must be distinct");
    }
  }
  const orderedTraversalSurfaceIdentities = canonicalOrderedIdentities(
    record.orderedTraversalSurfaceIdentities,
    orderedTraversalNodeIds.length,
  );

  return deepFreeze({
    kind: "route-path-receipt",
    schemaVersion: 2,
    status: "complete",
    ...strings,
    ...hashes,
    orderedTraversalNodeIds,
    orderedTraversalEdgeIds,
    orderedPathPositionsMetersXYZ,
    orderedTraversalSurfaceIdentities,
    routePathDistanceMeters: requireNonNegative(
      record.routePathDistanceMeters,
      "routePathDistanceMeters",
    ),
    routePathDistanceMetersXZ: requireNonNegative(
      record.routePathDistanceMetersXZ,
      "routePathDistanceMetersXZ",
    ),
    routePathCost: requireNonNegative(record.routePathCost, "routePathCost"),
    maximumObservedSlopeDegrees: requireSlope(
      record.maximumObservedSlopeDegrees,
      "maximumObservedSlopeDegrees",
    ),
    maximumObservedStepHeightMeters: requireNonNegative(
      record.maximumObservedStepHeightMeters,
      "maximumObservedStepHeightMeters",
    ),
    minimumObservedClearanceWidthMeters: requirePositive(
      record.minimumObservedClearanceWidthMeters,
      "minimumObservedClearanceWidthMeters",
    ),
    minimumObservedClearanceHeightMeters: requirePositive(
      record.minimumObservedClearanceHeightMeters,
      "minimumObservedClearanceHeightMeters",
    ),
    maximumObservedSurfaceGapMeters: requireNonNegative(
      record.maximumObservedSurfaceGapMeters,
      "maximumObservedSurfaceGapMeters",
    ),
  });
}

export function hashRoutePathReceiptV2(value: unknown): Sha256Hash {
  return sha256CanonicalJson(canonicalRoutePathReceiptV2(value)) as Sha256Hash;
}

function ceilToQuantum(
  value: number,
  quantum: number,
  field: string,
): number {
  const units = Math.ceil(value / quantum - Number.EPSILON);
  if (!Number.isSafeInteger(units)) {
    fail(field, "metric exceeds safe range");
  }
  return units * quantum;
}

export function assertRoutePathReceiptForGraphV2(
  value: unknown,
  graph: TraversalGraphV2,
): RoutePathReceiptV2 {
  const path = canonicalRoutePathReceiptV2(value);
  if (path.traversalGraphHash !== hashTraversalGraphV2(graph)) {
    fail("traversalGraphHash", "must hash the provided Traversal Graph V2");
  }
  const bindingFields = [
    "authoringSpecHash",
    "layoutSolveReportHash",
    "resourceLockHash",
    "routeId",
    "startAnchorEntityId",
    "destinationAnchorEntityId",
    "routeBuildInputHash",
    "resolvedTraversalLockHash",
    "graphBuilderProfileRef",
    "graphBuilderResolvedVersion",
    "graphBuilderProfileHash",
  ] as const;
  for (const field of bindingFields) {
    if (path[field] !== graph[field]) {
      fail(field, "must match the Traversal Graph V2");
    }
  }
  const selectedNodes = path.orderedTraversalNodeIds.map((nodeId, index) => {
    const node = graph.traversalNodesById[nodeId];
    if (isNil(node)) {
      fail(`orderedTraversalNodeIds/${index}`, `unknown Node '${nodeId}'`);
    }
    const identity = path.orderedTraversalSurfaceIdentities[index]!;
    const inventory = graph.traversalSurfaceIdentitiesById[node.traversalSurfaceId];
    if (isNil(inventory)) {
      fail(
        `orderedTraversalSurfaceIdentities/${index}`,
        "must match Graph inventory",
      );
    }
    if (sha256CanonicalJson(identity) !== sha256CanonicalJson(inventory)) {
      fail(
        `orderedTraversalSurfaceIdentities/${index}`,
        "must equal the Graph inventory row for the Node",
      );
    }
    if (
      identity.traversalSurfaceId !== node.traversalSurfaceId ||
      identity.surfaceEntityId !== node.surfaceEntityId ||
      identity.colliderSubshapeId !== node.colliderSubshapeId
    ) {
      fail(
        `orderedTraversalSurfaceIdentities/${index}`,
        "must match the Node Surface triple",
      );
    }
    return node;
  });
  const selectedEdges = path.orderedTraversalEdgeIds.map((edgeId, index) => {
    const edge = graph.traversalEdgesById[edgeId];
    if (isNil(edge)) {
      fail(`orderedTraversalEdgeIds/${index}`, `unknown Edge '${edgeId}'`);
    }
    if (
      edge.fromTraversalNodeId !== path.orderedTraversalNodeIds[index] ||
      edge.toTraversalNodeId !== path.orderedTraversalNodeIds[index + 1]
    ) {
      fail(
        `orderedTraversalEdgeIds/${index}`,
        `Edge '${edgeId}' breaks ordered adjacency`,
      );
    }
    return edge;
  });
  const profile = resolveTraversalGraphBuilderProfile(
    path.graphBuilderProfileRef,
  ).profile;
  let distanceMeters = 0;
  let distanceMetersXZ = 0;
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
      "routePathDistanceMeters",
    );
    const horizontal = Math.hypot(dx, dz);
    distanceMetersXZ += ceilToQuantum(
      horizontal,
      profile.positionQuantizationMeters,
      "routePathDistanceMetersXZ",
    );
    const rawSlope = horizontal === 0
      ? 90
      : Math.atan2(Math.abs(dy), horizontal) * 180 / Math.PI;
    segmentSlopeDegrees = Math.max(
      segmentSlopeDegrees,
      ceilToQuantum(rawSlope, 0.000001, "maximumObservedSlopeDegrees"),
    );
  }
  const costUnits = selectedEdges.reduce((sum, edge) => {
    const units = Math.round(edge.routePathCost / 0.000001);
    if (!Number.isSafeInteger(units) || !Number.isSafeInteger(sum + units)) {
      fail("routePathCost", "cost exceeds safe range");
    }
    return sum + units;
  }, 0);
  const expectedMetrics = {
    routePathDistanceMeters: distanceMeters,
    routePathDistanceMetersXZ: distanceMetersXZ,
    routePathCost: costUnits * 0.000001,
    maximumObservedSlopeDegrees: Math.max(
      segmentSlopeDegrees,
      ...selectedEdges.map((edge) => edge.slopeDegrees),
      0,
    ),
    maximumObservedStepHeightMeters: Math.max(
      ...selectedEdges.map((edge) => edge.stepHeightMeters),
      0,
    ),
    minimumObservedClearanceWidthMeters: Math.min(
      ...selectedNodes.map((node) => node.clearanceWidthMeters),
      ...selectedEdges.map((edge) => edge.minimumClearanceWidthMeters),
    ),
    minimumObservedClearanceHeightMeters: Math.min(
      ...selectedNodes.map((node) => node.clearanceHeightMeters),
      ...selectedEdges.map((edge) => edge.minimumClearanceHeightMeters),
    ),
    maximumObservedSurfaceGapMeters: 0,
  } as const;
  for (const [field, expected] of Object.entries(expectedMetrics)) {
    if (path[field as keyof typeof expectedMetrics] !== expected) {
      fail(field, `must equal ${expected}`);
    }
  }
  return path;
}
