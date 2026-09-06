import { parseTraversalColliderSourceV1 } from "./lock.js";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  TRAVERSAL_AREA_COMPLEXITY_LIMITS_V1,
  validateSimplePolygonXZV1,
  validateTraversalAreaComplexityV1,
} from "@whitebox-world/terrain-surface";
import { isEmpty, isNil, isPlainObject } from "lodash-es";

import {
  assertTraversalGraphBuildBudgetV1,
  assertTraversalSurfaceCountBudgetV1,
} from "./build-budget.js";
import { createTraversalCapabilityEnvelopeV1 } from "./capability-envelope.js";
import { deriveColliderSubshapeIdV1 } from "./collider-subshape-id.js";
import { assertTraversalSurfaceIdentityV1 } from "./graph-contract.js";
import { resolveTraversalLockV1 } from "./lock.js";
import {
  resolveTraversalGraphBuilderProfile,
  resolveTraversalGraphBuilderProfileV2,
} from "./profile-registry.js";
import type {
  ResolvedTraversalLockReceiptV1,
  TraversalCapabilityEnvelopeV1,
  TraversalSurfaceIdentityV1,
} from "./types.js";

type Sha256Hash = `sha256:${string}`;
type UnknownRecord = Record<string, unknown>;
type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];

export interface CanonicalTriangleSoupV1 {
  readonly positionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
}

export interface RouteHardRibbonV1 {
  readonly routeId: string;
  readonly pointsMetersXZ: readonly Vec2[];
  readonly widthMeters: number;
  readonly locomotionProfileRef: string;
}

export interface RouteBuildAnchorV1 {
  readonly entityId: string;
  readonly positionMetersXYZ: Vec3;
}

export type BlockedWaterBoundaryV1 =
  | Readonly<{
      kind: "circle";
      centerMetersXZ: Vec2;
      radiusMeters: number;
    }>
  | Readonly<{
      kind: "ellipse";
      centerMetersXZ: Vec2;
      radiusMetersXZ: Vec2;
    }>
  | Readonly<{
      kind: "polygon";
      pointsMetersXZ: readonly Vec2[];
    }>;

export interface BlockedWaterExclusionV1 {
  readonly waterEntityId: string;
  readonly boundary: BlockedWaterBoundaryV1;
  readonly waterLevelMeters: number;
  readonly depthMeters: number;
}

export interface BlockedTraversalAreaExclusionV1 {
  readonly traversalAreaId: string;
  readonly surfaceEntityId: string;
  readonly boundary: Readonly<{
    kind: "polygon-xz";
    pointsMetersXZ: readonly Vec2[];
  }>;
}

export type RouteTerrainSourceV2 =
  | Readonly<{
      kind: "empty";
      terrainEntityId: string;
    }>
  | Readonly<{
      kind: "bounded";
      terrainEntityId: string;
      triangleSoup: CanonicalTriangleSoupV1;
      minimumMetersXZ: Vec2;
      maximumMetersXZ: Vec2;
    }>;

export interface StaticColliderSourceV1 {
  readonly entityId: string;
  readonly logicalSubshapeId: string;
  readonly colliderSubshapeId: string;
  readonly colliderHash: Sha256Hash;
  readonly triangleSoup: CanonicalTriangleSoupV1;
}

export interface RouteBuildInputV2 {
  readonly kind: "route-build-input";
  readonly schemaVersion: 2;
  readonly authoringSpecHash: Sha256Hash;
  readonly layoutSolveReportHash: Sha256Hash;
  readonly resourceLockHash: Sha256Hash;
  readonly connectivityRequirement: Readonly<{
    readonly constraintId: string;
    readonly traversingEntityId: string;
    readonly startAnchorEntityId: string;
    readonly destinationAnchorEntityId: string;
    readonly routeId: string;
  }>;
  readonly startAnchor: RouteBuildAnchorV1;
  readonly destinationAnchor: RouteBuildAnchorV1;
  readonly hardRibbon: RouteHardRibbonV1;
  readonly traversalSurfaces: readonly TraversalSurfaceIdentityV1[];
  readonly capabilityEnvelope: TraversalCapabilityEnvelopeV1;
  readonly terrainSource: RouteTerrainSourceV2;
  readonly staticColliders: readonly StaticColliderSourceV1[];
  readonly terrainArtifactHash: Sha256Hash;
  readonly colliderArtifactHash: Sha256Hash;
  readonly geometryArtifactHash: Sha256Hash;
  readonly surfaceArtifactHash: Sha256Hash;
  readonly blockedTraversalAreaExclusions: readonly BlockedTraversalAreaExclusionV1[];
  readonly blockedWaterExclusions: readonly BlockedWaterExclusionV1[];
}

export type RouteBuildBudgetEvidenceV2 =
  | Readonly<{ kind: "not-required-empty-geometry" }>
  | Readonly<{
      kind: "route-geometry-tile-estimate";
      tilesX: number;
      tilesZ: number;
      estimatedTiles: number;
      maximumTiles: number;
      minimumMetersXZ: Vec2;
      maximumMetersXZ: Vec2;
    }>;

export interface RouteBuildInputReceiptV2 {
  readonly input: RouteBuildInputV2;
  readonly traversalLockReceipt: ResolvedTraversalLockReceiptV1;
  readonly routeBuildInputHash: Sha256Hash;
  readonly budgetEvidence: RouteBuildBudgetEvidenceV2;
}

export interface CreateRouteBuildInputReceiptV2Input {
  readonly input: RouteBuildInputV2;
  readonly traversalLockReceipt: ResolvedTraversalLockReceiptV1;
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

const CREATE_RECEIPT_FIELDS = ["input", "traversalLockReceipt"] as const;
const RECEIPT_FIELDS = [
  "input",
  "traversalLockReceipt",
  "routeBuildInputHash",
  "budgetEvidence",
] as const;
const EMPTY_BUDGET_FIELDS = ["kind"] as const;
const BOUNDED_BUDGET_FIELDS = [
  "kind",
  "tilesX",
  "tilesZ",
  "estimatedTiles",
  "maximumTiles",
  "minimumMetersXZ",
  "maximumMetersXZ",
] as const;
const GRAPH_POLICY_FIELDS = [
  "clearanceMarginMeters",
  "voxelCellSizeMeters",
  "voxelCellHeightMeters",
  "tileSizeCells",
  "maximumEdgeLengthMeters",
  "maximumSimplificationErrorMeters",
  "positionQuantizationMeters",
  "slopeCostWeight",
  "stepCostWeight",
  "maximumNodes",
  "maximumEdges",
  "maximumTiles",
  "maximumSearchSteps",
  "maximumTraversalSurfaceCount",
  "minimumEquivalentPlaneNormalDotRatio",
  "maximumTraversalSurfaceTrianglePairTestCount",
] as const;


const CONNECTIVITY_FIELDS = [
  "constraintId",
  "traversingEntityId",
  "startAnchorEntityId",
  "destinationAnchorEntityId",
  "routeId",
] as const;

const ANCHOR_FIELDS = ["entityId", "positionMetersXYZ"] as const;
const HARD_RIBBON_FIELDS = [
  "routeId",
  "pointsMetersXZ",
  "widthMeters",
  "locomotionProfileRef",
] as const;
const SOUP_FIELDS = ["positionsMetersXYZ", "triangleIndices"] as const;
const BLOCKER_FIELDS = [
  "entityId",
  "logicalSubshapeId",
  "colliderSubshapeId",
  "colliderHash",
  "triangleSoup",
] as const;
const BUILD_INPUT_FIELDS_V2 = [
  "kind",
  "schemaVersion",
  "authoringSpecHash",
  "layoutSolveReportHash",
  "resourceLockHash",
  "connectivityRequirement",
  "startAnchor",
  "destinationAnchor",
  "hardRibbon",
  "traversalSurfaces",
  "capabilityEnvelope",
  "terrainSource",
  "staticColliders",
  "terrainArtifactHash",
  "colliderArtifactHash",
  "geometryArtifactHash",
  "surfaceArtifactHash",
  "blockedTraversalAreaExclusions",
  "blockedWaterExclusions",
] as const;
const TERRAIN_EMPTY_FIELDS_V2 = ["kind", "terrainEntityId"] as const;
const TERRAIN_BOUNDED_FIELDS_V2 = [
  "kind",
  "terrainEntityId",
  "triangleSoup",
  "minimumMetersXZ",
  "maximumMetersXZ",
] as const;
const EMPTY_GEOMETRY_BUDGET_FIELDS_V2 = ["kind"] as const;
const GEOMETRY_BUDGET_FIELDS_V2 = [
  "kind",
  "tilesX",
  "tilesZ",
  "estimatedTiles",
  "maximumTiles",
  "minimumMetersXZ",
  "maximumMetersXZ",
] as const;
const WATER_FIELDS = [
  "waterEntityId",
  "boundary",
  "waterLevelMeters",
  "depthMeters",
] as const;
const TRAVERSAL_AREA_EXCLUSION_FIELDS = [
  "traversalAreaId",
  "surfaceEntityId",
  "boundary",
] as const;
const TRAVERSAL_AREA_BOUNDARY_FIELDS = ["kind", "pointsMetersXZ"] as const;

const CAPABILITY_FIELDS = [
  "kind",
  "schemaVersion",
  "traversalMode",
  "subjectEntityId",
  "resourceLockHash",
  "colliderSource",
  "physicsBodyProfileRef",
  "physicsBodyProfileHash",
  "locomotionProfileRef",
  "locomotionProfileHash",
  "locomotionCapabilityRef",
  "locomotionCapabilityHash",
  "runtimeBackendRef",
  "runtimeBackendResolvedVersion",
  "runtimeBackendHash",
  "runtimeAdapterRef",
  "runtimeAdapterResolvedVersion",
  "runtimeAdapterHash",
  "capsuleRadiusMeters",
  "capsuleHeightMeters",
  "colliderCenterOffsetMetersXYZ",
  "maxSlopeDegrees",
  "maxStepHeightMeters",
  "resolvedTraversalLockHash",
  "graphBuilderProfileRef",
  "graphBuilderResolvedVersion",
  "graphBuilderProfileHash",
  "clearanceMarginMeters",
  "voxelCellSizeMeters",
  "voxelCellHeightMeters",
  "tileSizeCells",
  "maximumEdgeLengthMeters",
  "maximumSimplificationErrorMeters",
  "positionQuantizationMeters",
  "slopeCostWeight",
  "stepCostWeight",
  "maximumNodes",
  "maximumEdges",
  "maximumTiles",
  "maximumSearchSteps",
  "maximumTraversalSurfaceCount",
  "minimumEquivalentPlaneNormalDotRatio",
  "maximumTraversalSurfaceTrianglePairTestCount",
] as const;

let buildInputErrorPrefix = "HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID";

function fail(path: string, message: string): never {
  throw new Error(
    `${buildInputErrorPrefix}: ${path.length > 0 ? `${path}: ` : ""}${message}`,
  );
}

function withBuildInputErrorPrefix<T>(prefix: string, fn: () => T): T {
  const previous = buildInputErrorPrefix;
  buildInputErrorPrefix = prefix;
  try {
    return fn();
  } finally {
    buildInputErrorPrefix = previous;
  }
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    fail(path, "expected a plain object");
  }
  return value as UnknownRecord;
}

function rejectUnknownFields(
  record: UnknownRecord,
  allowedFields: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) fail(path, `unknown field '${unknown}'`);
}

function requireExactFields(
  value: unknown,
  allowedFields: readonly string[],
  path: string,
): UnknownRecord {
  const record = requireRecord(value, path);
  rejectUnknownFields(record, allowedFields, path);
  for (const field of allowedFields) {
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
    fail(path, "must be a finite number");
  }
  return value;
}

function requirePositive(value: unknown, path: string): number {
  const number = requireFinite(value, path);
  if (!(number > 0)) fail(path, "must be > 0");
  return number;
}

function requireNonNegative(value: unknown, path: string): number {
  const number = requireFinite(value, path);
  if (number < 0) fail(path, "must be >= 0");
  return number;
}

function requirePositiveSafeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    fail(path, "must be a positive safe integer");
  }
  return value as number;
}

function requireVec2(value: unknown, path: string): Vec2 {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(path, "must be a 2-tuple");
  }
  requireFinite(value[0], `${path}/0`);
  requireFinite(value[1], `${path}/1`);
  return value as unknown as Vec2;
}

function requireVec3(value: unknown, path: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) {
    fail(path, "must be a 3-tuple");
  }
  requireFinite(value[0], `${path}/0`);
  requireFinite(value[1], `${path}/1`);
  requireFinite(value[2], `${path}/2`);
  return value as unknown as Vec3;
}

function isDeeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (isNil(value) || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((child) => isDeeplyFrozen(child, seen));
}

function deepFreeze<T>(value: T): T {
  if (isNil(value) || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as object)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function validateCapabilityEnvelope(
  value: unknown,
): TraversalCapabilityEnvelopeV1 {
  const path = "capabilityEnvelope";
  const record = requireExactFields(value, CAPABILITY_FIELDS, path);
  if (!isDeeplyFrozen(value)) fail(path, "must be deeply frozen");
  if (record.kind !== "traversal-capability-envelope") {
    fail(`${path}/kind`, "must be 'traversal-capability-envelope'");
  }
  if (record.schemaVersion !== 1) fail(`${path}/schemaVersion`, "must be 1");
  if (record.traversalMode !== "ground") {
    fail(`${path}/traversalMode`, "must be 'ground'");
  }

  for (const field of [
    "subjectEntityId",
    "physicsBodyProfileRef",
    "locomotionProfileRef",
    "locomotionCapabilityRef",
    "runtimeBackendRef",
    "runtimeBackendResolvedVersion",
    "runtimeAdapterRef",
    "runtimeAdapterResolvedVersion",
    "graphBuilderProfileRef",
    "graphBuilderResolvedVersion",
  ] as const) {
    requireString(record[field], `${path}/${field}`);
  }
  for (const field of [
    "resourceLockHash",
    "physicsBodyProfileHash",
    "locomotionProfileHash",
    "locomotionCapabilityHash",
    "runtimeBackendHash",
    "runtimeAdapterHash",
    "resolvedTraversalLockHash",
    "graphBuilderProfileHash",
  ] as const) {
    requireHash(record[field], `${path}/${field}`);
  }
  try {
    parseTraversalColliderSourceV1(record.colliderSource);
  } catch {
    fail(path + "/colliderSource", "must contain one valid locked collider source");
  }
  requirePositive(record.capsuleRadiusMeters, `${path}/capsuleRadiusMeters`);
  requirePositive(record.capsuleHeightMeters, `${path}/capsuleHeightMeters`);
  requireVec3(
    record.colliderCenterOffsetMetersXYZ,
    `${path}/colliderCenterOffsetMetersXYZ`,
  );
  const maxSlopeDegrees = requireFinite(
    record.maxSlopeDegrees,
    `${path}/maxSlopeDegrees`,
  );
  if (maxSlopeDegrees < 0 || !(maxSlopeDegrees < 90)) {
    fail(`${path}/maxSlopeDegrees`, "must be in [0, 90)");
  }
  requireNonNegative(record.maxStepHeightMeters, `${path}/maxStepHeightMeters`);
  for (const field of [
    "clearanceMarginMeters",
    "maximumSimplificationErrorMeters",
    "slopeCostWeight",
    "stepCostWeight",
  ] as const) {
    requireNonNegative(record[field], `${path}/${field}`);
  }
  for (const field of [
    "voxelCellSizeMeters",
    "voxelCellHeightMeters",
    "maximumEdgeLengthMeters",
    "positionQuantizationMeters",
  ] as const) {
    requirePositive(record[field], `${path}/${field}`);
  }
  for (const field of [
    "tileSizeCells",
    "maximumNodes",
    "maximumEdges",
    "maximumTiles",
    "maximumSearchSteps",
    "maximumTraversalSurfaceCount",
    "maximumTraversalSurfaceTrianglePairTestCount",
  ] as const) {
    requirePositiveSafeInteger(record[field], `${path}/${field}`);
  }
  if (
    (record.maximumTraversalSurfaceTrianglePairTestCount as number) >
    Number.MAX_SAFE_INTEGER - 1
  ) {
    fail(
      `${path}/maximumTraversalSurfaceTrianglePairTestCount`,
      "must be <= Number.MAX_SAFE_INTEGER - 1",
    );
  }
  const minimumEquivalentPlaneNormalDotRatio = requirePositive(
    record.minimumEquivalentPlaneNormalDotRatio,
    `${path}/minimumEquivalentPlaneNormalDotRatio`,
  );
  if (minimumEquivalentPlaneNormalDotRatio > 1) {
    fail(
      `${path}/minimumEquivalentPlaneNormalDotRatio`,
      "must be in (0, 1]",
    );
  }
  return value as TraversalCapabilityEnvelopeV1;
}

function validateTriangleSoup(
  value: unknown,
  path: string,
  mode: "terrain" | "blocker",
): CanonicalTriangleSoupV1 {
  const record = requireExactFields(value, SOUP_FIELDS, path);
  if (
    !Array.isArray(record.positionsMetersXYZ) ||
    record.positionsMetersXYZ.length === 0 ||
    record.positionsMetersXYZ.length % 3 !== 0
  ) {
    fail(`${path}/positionsMetersXYZ`, "must contain complete XYZ vertices");
  }
  if (
    !Array.isArray(record.triangleIndices) ||
    record.triangleIndices.length === 0 ||
    record.triangleIndices.length % 3 !== 0
  ) {
    fail(`${path}/triangleIndices`, "must contain complete triangles");
  }

  const positions = record.positionsMetersXYZ as unknown[];
  const indices = record.triangleIndices as unknown[];
  for (let index = 0; index < positions.length; index += 1) {
    requireFinite(positions[index], `${path}/positionsMetersXYZ/${index}`);
  }
  const vertexCount = positions.length / 3;
  const referenced = new Set<number>();
  const triangleKeys = new Set<string>();
  const directedEdgeCount = new Map<string, number>();
  let signedVolumeTimesSix = 0;

  const position = (index: number): Vec3 => [
    positions[index * 3] as number,
    positions[index * 3 + 1] as number,
    positions[index * 3 + 2] as number,
  ];

  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle: number[] = [];
    for (let corner = 0; corner < 3; corner += 1) {
      const raw = indices[offset + corner];
      if (
        !Number.isSafeInteger(raw) ||
        (raw as number) < 0 ||
        (raw as number) >= vertexCount
      ) {
        fail(`${path}/triangleIndices/${offset + corner}`, "must reference a vertex");
      }
      triangle.push(raw as number);
      referenced.add(raw as number);
    }
    const [ia, ib, ic] = triangle as [number, number, number];
    if (ia === ib || ib === ic || ic === ia) {
      fail(`${path}/triangleIndices/${offset}`, "triangle indices must be distinct");
    }
    const a = position(ia);
    const b = position(ib);
    const c = position(ic);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abz = b[2] - a[2];
    const acx = c[0] - a[0];
    const acy = c[1] - a[1];
    const acz = c[2] - a[2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const areaSquaredTimesFour = nx * nx + ny * ny + nz * nz;
    if (!Number.isFinite(areaSquaredTimesFour) || !(areaSquaredTimesFour > 0)) {
      fail(`${path}/triangleIndices/${offset}`, "triangle area must be finite and non-zero");
    }
    if (mode === "terrain" && !(ny > 0)) {
      fail(`${path}/triangleIndices/${offset}`, "terrain triangle must have positive-Y winding");
    }

    const coordinateKey = [a, b, c]
      .map((point) => point.map((component) => Object.is(component, -0) ? 0 : component).join(","))
      .sort()
      .join("|");
    if (triangleKeys.has(coordinateKey)) {
      fail(`${path}/triangleIndices/${offset}`, "exact duplicate triangle");
    }
    triangleKeys.add(coordinateKey);

    if (mode === "blocker") {
      for (const [from, to] of [[ia, ib], [ib, ic], [ic, ia]] as const) {
        const key = `${from}:${to}`;
        directedEdgeCount.set(key, (directedEdgeCount.get(key) ?? 0) + 1);
      }
      signedVolumeTimesSix +=
        a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
  }

  if (referenced.size !== vertexCount) {
    fail(path, "every vertex must be referenced");
  }
  if (mode === "blocker") {
    const undirectedEdges = new Set<string>();
    for (const directed of directedEdgeCount.keys()) {
      const [from, to] = directed.split(":").map(Number) as [number, number];
      undirectedEdges.add(from < to ? `${from}:${to}` : `${to}:${from}`);
    }
    for (const edge of undirectedEdges) {
      const [low, high] = edge.split(":").map(Number) as [number, number];
      if (
        directedEdgeCount.get(`${low}:${high}`) !== 1 ||
        directedEdgeCount.get(`${high}:${low}`) !== 1
      ) {
        fail(path, "blocker soup must be a closed consistently wound manifold");
      }
    }
    if (!Number.isFinite(signedVolumeTimesSix) || !(signedVolumeTimesSix > 0)) {
      fail(path, "blocker soup must have outward winding and positive volume");
    }
  }
  return value as CanonicalTriangleSoupV1;
}

function validateAnchor(value: unknown, path: string): RouteBuildAnchorV1 {
  const record = requireExactFields(value, ANCHOR_FIELDS, path);
  requireString(record.entityId, `${path}/entityId`);
  requireVec3(record.positionMetersXYZ, `${path}/positionMetersXYZ`);
  return value as RouteBuildAnchorV1;
}

function validateHardRibbon(value: unknown): RouteHardRibbonV1 {
  const path = "hardRibbon";
  const record = requireExactFields(value, HARD_RIBBON_FIELDS, path);
  requireString(record.routeId, `${path}/routeId`);
  requireString(record.locomotionProfileRef, `${path}/locomotionProfileRef`);
  requirePositive(record.widthMeters, `${path}/widthMeters`);
  if (!Array.isArray(record.pointsMetersXZ)) {
    fail(`${path}/pointsMetersXZ`, "must be an array");
  }
  const points = record.pointsMetersXZ.map((point, index) =>
    requireVec2(point, `${path}/pointsMetersXZ/${index}`),
  );
  const distinctSegmentCount = points.slice(1).filter((point, index) => {
    const previous = points[index]!;
    return point[0] !== previous[0] || point[1] !== previous[1];
  }).length;
  if (distinctSegmentCount === 0) {
    fail(`${path}/pointsMetersXZ`, "must contain at least two distinct points");
  }
  return value as RouteHardRibbonV1;
}

function validateWaterBoundary(value: unknown, path: string): BlockedWaterBoundaryV1 {
  const record = requireRecord(value, path);
  if (record.kind === "circle") {
    const exact = requireExactFields(value, ["kind", "centerMetersXZ", "radiusMeters"], path);
    requireVec2(exact.centerMetersXZ, `${path}/centerMetersXZ`);
    requirePositive(exact.radiusMeters, `${path}/radiusMeters`);
  } else if (record.kind === "ellipse") {
    const exact = requireExactFields(value, ["kind", "centerMetersXZ", "radiusMetersXZ"], path);
    requireVec2(exact.centerMetersXZ, `${path}/centerMetersXZ`);
    const radii = requireVec2(exact.radiusMetersXZ, `${path}/radiusMetersXZ`);
    if (!(radii[0] > 0) || !(radii[1] > 0)) {
      fail(`${path}/radiusMetersXZ`, "both radii must be > 0");
    }
  } else if (record.kind === "polygon") {
    const exact = requireExactFields(value, ["kind", "pointsMetersXZ"], path);
    if (!Array.isArray(exact.pointsMetersXZ) || exact.pointsMetersXZ.length < 3) {
      fail(`${path}/pointsMetersXZ`, "must contain at least three points");
    }
    const points = exact.pointsMetersXZ.map((point, index) =>
      requireVec2(point, `${path}/pointsMetersXZ/${index}`),
    );
    let twiceArea = 0;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]!;
      const next = points[(index + 1) % points.length]!;
      twiceArea += point[0] * next[1] - next[0] * point[1];
    }
    if (!Number.isFinite(twiceArea) || twiceArea === 0) {
      fail(`${path}/pointsMetersXZ`, "polygon must have non-zero finite area");
    }
  } else {
    fail(`${path}/kind`, "must be 'circle', 'ellipse', or 'polygon'");
  }
  return value as BlockedWaterBoundaryV1;
}

function validateWaterExclusions(value: unknown): readonly BlockedWaterExclusionV1[] {
  if (!Array.isArray(value)) fail("blockedWaterExclusions", "must be an array");
  let previousId: string | undefined;
  value.forEach((candidate, index) => {
    const path = `blockedWaterExclusions/${index}`;
    const record = requireExactFields(candidate, WATER_FIELDS, path);
    const waterEntityId = requireString(record.waterEntityId, `${path}/waterEntityId`);
    validateWaterBoundary(record.boundary, `${path}/boundary`);
    requireFinite(record.waterLevelMeters, `${path}/waterLevelMeters`);
    requirePositive(record.depthMeters, `${path}/depthMeters`);
    if (!isNil(previousId) && waterEntityId <= previousId) {
      fail("blockedWaterExclusions", "must be strictly sorted by waterEntityId");
    }
    previousId = waterEntityId;
  });
  return value as readonly BlockedWaterExclusionV1[];
}

function validateTraversalAreaExclusions(
  value: unknown,
): readonly BlockedTraversalAreaExclusionV1[] {
  if (!Array.isArray(value)) {
    fail("blockedTraversalAreaExclusions", "must be an array");
  }
  if (
    value.length >
      TRAVERSAL_AREA_COMPLEXITY_LIMITS_V1.maximumAreaCount
  ) {
    fail(
      "blockedTraversalAreaExclusions",
      `area-count-exceeded: ${value.length} > ${TRAVERSAL_AREA_COMPLEXITY_LIMITS_V1.maximumAreaCount}`,
    );
  }
  let previousId: string | undefined;
  const pointCountsByArea: number[] = [];
  value.forEach((candidate, index) => {
    const path = `blockedTraversalAreaExclusions/${index}`;
    const record = requireExactFields(
      candidate,
      TRAVERSAL_AREA_EXCLUSION_FIELDS,
      path,
    );
    const traversalAreaId = requireString(
      record.traversalAreaId,
      `${path}/traversalAreaId`,
    );
    requireString(record.surfaceEntityId, `${path}/surfaceEntityId`);
    const boundary = requireExactFields(
      record.boundary,
      TRAVERSAL_AREA_BOUNDARY_FIELDS,
      `${path}/boundary`,
    );
    if (boundary.kind !== "polygon-xz") {
      fail(`${path}/boundary/kind`, "must be 'polygon-xz'");
    }
    if (!Array.isArray(boundary.pointsMetersXZ) || boundary.pointsMetersXZ.length < 3) {
      fail(`${path}/boundary/pointsMetersXZ`, "must contain at least three points");
    }
    if (
      boundary.pointsMetersXZ.length >
        TRAVERSAL_AREA_COMPLEXITY_LIMITS_V1.maximumPointsPerArea
    ) {
      fail(
        `${path}/boundary/pointsMetersXZ`,
        `points-per-area-exceeded: ${boundary.pointsMetersXZ.length} > ${TRAVERSAL_AREA_COMPLEXITY_LIMITS_V1.maximumPointsPerArea}`,
      );
    }
    pointCountsByArea.push(boundary.pointsMetersXZ.length);
    const points = boundary.pointsMetersXZ.map((point, pointIndex) =>
      requireVec2(point, `${path}/boundary/pointsMetersXZ/${pointIndex}`),
    );
    const polygonValidation = validateSimplePolygonXZV1(points);
    if (!polygonValidation.ok) {
      fail(
        `${path}/boundary/pointsMetersXZ`,
        `polygon must be simple (${polygonValidation.issueCode})`,
      );
    }
    if (!isNil(previousId) && traversalAreaId <= previousId) {
      fail(
        "blockedTraversalAreaExclusions",
        "must be strictly sorted by traversalAreaId",
      );
    }
    previousId = traversalAreaId;
  });
  const complexity = validateTraversalAreaComplexityV1({ pointCountsByArea });
  if (!complexity.ok) {
    fail(
      isNil(complexity.areaIndex)
        ? "blockedTraversalAreaExclusions"
        : `blockedTraversalAreaExclusions/${complexity.areaIndex}/boundary/pointsMetersXZ`,
      `${complexity.issueCode}: ${complexity.actualCount} > ${complexity.maximumCount}`,
    );
  }
  return value as readonly BlockedTraversalAreaExclusionV1[];
}

function failReceipt(path: string, message: string): never {
  throw new Error(
    `HEIGHTFIELD_ROUTE_BUILD_INPUT_RECEIPT_INVALID: ${path.length > 0 ? `${path}: ` : ""}${message}`,
  );
}

function withRouteBuildInputV2ErrorPrefix<T>(fn: () => T): T {
  return withBuildInputErrorPrefix("ROUTE_BUILD_INPUT_INVALID", fn);
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function computeNormalizedXZExtrema(
  soups: readonly CanonicalTriangleSoupV1[],
): { readonly minimumMetersXZ: Vec2; readonly maximumMetersXZ: Vec2 } | undefined {
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  let found = false;
  for (const soup of soups) {
    for (let offset = 0; offset < soup.positionsMetersXYZ.length; offset += 3) {
      const x = normalizeSignedZero(soup.positionsMetersXYZ[offset]!);
      const z = normalizeSignedZero(soup.positionsMetersXYZ[offset + 2]!);
      found = true;
      minimumX = Math.min(minimumX, x);
      minimumZ = Math.min(minimumZ, z);
      maximumX = Math.max(maximumX, x);
      maximumZ = Math.max(maximumZ, z);
    }
  }
  if (!found) return undefined;
  return {
    minimumMetersXZ: [normalizeSignedZero(minimumX), normalizeSignedZero(minimumZ)],
    maximumMetersXZ: [normalizeSignedZero(maximumX), normalizeSignedZero(maximumZ)],
  };
}

function requireExactNormalizedVec2(
  value: Vec2,
  expected: Vec2,
  path: string,
): void {
  if (
    !Object.is(value[0], expected[0]) ||
    !Object.is(value[1], expected[1])
  ) {
    fail(path, "must equal the normalized world-space XZ extrema");
  }
}

function admitRouteTerrainSourceV2(value: unknown): RouteTerrainSourceV2 {
  const path = "terrainSource";
  const base = requireRecord(value, path);
  if (base.kind === "empty") {
    requireExactFields(value, TERRAIN_EMPTY_FIELDS_V2, path);
    requireString(base.terrainEntityId, `${path}/terrainEntityId`);
    return value as RouteTerrainSourceV2;
  }
  if (base.kind !== "bounded") {
    fail(`${path}/kind`, "must be 'empty' or 'bounded'");
  }
  const record = requireExactFields(value, TERRAIN_BOUNDED_FIELDS_V2, path);
  requireString(record.terrainEntityId, `${path}/terrainEntityId`);
  const soup = validateTriangleSoup(
    record.triangleSoup,
    `${path}/triangleSoup`,
    "terrain",
  );
  const declaredMinimum = requireVec2(record.minimumMetersXZ, `${path}/minimumMetersXZ`);
  const declaredMaximum = requireVec2(record.maximumMetersXZ, `${path}/maximumMetersXZ`);
  const extrema = computeNormalizedXZExtrema([soup]);
  if (isNil(extrema)) {
    fail(`${path}/triangleSoup`, "bounded Terrain must contain at least one vertex");
  }
  if (
    !(extrema.maximumMetersXZ[0] > extrema.minimumMetersXZ[0]) ||
    !(extrema.maximumMetersXZ[1] > extrema.minimumMetersXZ[1])
  ) {
    fail(path, "bounded extrema must have positive X and Z extents");
  }
  requireExactNormalizedVec2(
    [
      normalizeSignedZero(declaredMinimum[0]),
      normalizeSignedZero(declaredMinimum[1]),
    ],
    extrema.minimumMetersXZ,
    `${path}/minimumMetersXZ`,
  );
  requireExactNormalizedVec2(
    [
      normalizeSignedZero(declaredMaximum[0]),
      normalizeSignedZero(declaredMaximum[1]),
    ],
    extrema.maximumMetersXZ,
    `${path}/maximumMetersXZ`,
  );
  if (
    Object.is(declaredMinimum[0], -0) ||
    Object.is(declaredMinimum[1], -0) ||
    Object.is(declaredMaximum[0], -0) ||
    Object.is(declaredMaximum[1], -0)
  ) {
    fail(path, "bounded extrema must not use negative zero");
  }
  return value as RouteTerrainSourceV2;
}

function admitStaticCollidersV2(value: unknown): readonly StaticColliderSourceV1[] {
  if (!Array.isArray(value)) fail("staticColliders", "must be an array");
  let previousId: string | undefined;
  value.forEach((candidate, index) => {
    const path = `staticColliders/${index}`;
    const record = requireExactFields(candidate, BLOCKER_FIELDS, path);
    const entityId = requireString(record.entityId, `${path}/entityId`);
    const logicalSubshapeId = requireString(
      record.logicalSubshapeId,
      `${path}/logicalSubshapeId`,
    );
    const colliderSubshapeId = requireString(
      record.colliderSubshapeId,
      `${path}/colliderSubshapeId`,
    );
    requireHash(record.colliderHash, `${path}/colliderHash`);
    validateTriangleSoup(record.triangleSoup, `${path}/triangleSoup`, "blocker");
    if (colliderSubshapeId !== deriveColliderSubshapeIdV1(entityId, logicalSubshapeId)) {
      fail(`${path}/colliderSubshapeId`, "must equal deriveColliderSubshapeIdV1(entityId, logicalSubshapeId)");
    }
    if (!isNil(previousId) && colliderSubshapeId <= previousId) {
      fail("staticColliders", "must be strictly sorted by colliderSubshapeId");
    }
    previousId = colliderSubshapeId;
  });
  return value as readonly StaticColliderSourceV1[];
}

function admitTraversalSurfacesV2(
  value: unknown,
  terrainEntityId: string,
  staticColliders: readonly StaticColliderSourceV1[],
): readonly TraversalSurfaceIdentityV1[] {
  if (!Array.isArray(value) || isEmpty(value)) {
    fail("traversalSurfaces", "must be a non-empty array");
  }
  const colliderKeys = new Set(
    staticColliders.map((row) => `${row.entityId}\0${row.colliderSubshapeId}`),
  );
  let previousId: string | undefined;
  let heightfieldCount = 0;
  const surfaces = value.map((candidate, index) => {
    const path = `traversalSurfaces/${index}`;
    let identity: TraversalSurfaceIdentityV1;
    try {
      identity = assertTraversalSurfaceIdentityV1(candidate);
    } catch (cause) {
      fail(
        path,
        cause instanceof Error ? cause.message : "must be a canonical Traversal Surface identity",
      );
    }
    if (!isNil(previousId) && identity.traversalSurfaceId <= previousId) {
      fail("traversalSurfaces", "must be strictly sorted by unique traversalSurfaceId");
    }
    previousId = identity.traversalSurfaceId;
    if (identity.surfaceEntityId === terrainEntityId) {
      heightfieldCount += 1;
    } else if (
      !colliderKeys.has(`${identity.surfaceEntityId}\0${identity.colliderSubshapeId}`)
    ) {
      fail(
        `${path}/colliderSubshapeId`,
        "non-Heightfield Surface must join a static collider row",
      );
    }
    return identity;
  });
  if (heightfieldCount !== 1) {
    fail(
      "traversalSurfaces",
      "must contain exactly one Heightfield Surface bound to terrainSource.terrainEntityId",
    );
  }
  return surfaces;
}

function assertEnvelopeMatchesResolvedProfileV2(
  envelope: TraversalCapabilityEnvelopeV1,
  failAt: (path: string, message: string) => never = fail,
): void {
  let resolved;
  try {
    resolved = resolveTraversalGraphBuilderProfileV2(envelope.graphBuilderProfileRef);
  } catch (cause) {
    failAt(
      "capabilityEnvelope/graphBuilderProfileRef",
      cause instanceof Error ? cause.message : "Profile resolution failed",
    );
  }
  if (
    resolved.profile.schemaVersion !== 2 ||
    resolved.resolvedVersion !== envelope.graphBuilderResolvedVersion ||
    resolved.contentHash !== envelope.graphBuilderProfileHash
  ) {
    failAt(
      "capabilityEnvelope",
      "Graph Builder identity must resolve to the exact Registry V2 Profile",
    );
  }
  for (const field of GRAPH_POLICY_FIELDS) {
    if (envelope[field] !== resolved.profile[field]) {
      failAt(
        `capabilityEnvelope/${field}`,
        "must match the resolved Registry V2 Profile",
      );
    }
  }
}

function computeRouteBuildBudgetEvidenceV2(
  input: RouteBuildInputV2,
): RouteBuildBudgetEvidenceV2 {
  const soups: CanonicalTriangleSoupV1[] = [];
  if (input.terrainSource.kind === "bounded") {
    soups.push(input.terrainSource.triangleSoup);
  }
  for (const collider of input.staticColliders) {
    soups.push(collider.triangleSoup);
  }
  if (input.terrainSource.kind === "empty" && isEmpty(input.staticColliders)) {
    return { kind: "not-required-empty-geometry" };
  }
  const extrema = computeNormalizedXZExtrema(soups);
  if (isNil(extrema)) {
    fail("staticColliders", "non-empty geometry must contain at least one vertex");
  }
  const estimate = assertTraversalGraphBuildBudgetV1({
    minimumMetersXZ: extrema.minimumMetersXZ,
    maximumMetersXZ: extrema.maximumMetersXZ,
    tileSizeCells: input.capabilityEnvelope.tileSizeCells,
    voxelCellSizeMeters: input.capabilityEnvelope.voxelCellSizeMeters,
    maximumTiles: input.capabilityEnvelope.maximumTiles,
  });
  return {
    kind: "route-geometry-tile-estimate",
    tilesX: estimate.tilesX,
    tilesZ: estimate.tilesZ,
    estimatedTiles: estimate.estimatedTiles,
    maximumTiles: input.capabilityEnvelope.maximumTiles,
    minimumMetersXZ: extrema.minimumMetersXZ,
    maximumMetersXZ: extrema.maximumMetersXZ,
  };
}

export function hashRouteTerrainArtifactV2(value: unknown): Sha256Hash {
  return withRouteBuildInputV2ErrorPrefix(() => {
    const source = admitRouteTerrainSourceV2(value);
    if (source.kind === "empty") {
      return sha256CanonicalJson({
        kind: source.kind,
        terrainEntityId: source.terrainEntityId,
      }) as Sha256Hash;
    }
    return sha256CanonicalJson({
      kind: source.kind,
      terrainEntityId: source.terrainEntityId,
      triangleSoup: source.triangleSoup,
      minimumMetersXZ: source.minimumMetersXZ,
      maximumMetersXZ: source.maximumMetersXZ,
    }) as Sha256Hash;
  });
}

export function hashRouteColliderArtifactV2(value: unknown): Sha256Hash {
  return withRouteBuildInputV2ErrorPrefix(() => {
    const colliders = admitStaticCollidersV2(value);
    return sha256CanonicalJson(colliders) as Sha256Hash;
  });
}

export function hashRouteGeometryArtifactV2(value: unknown): Sha256Hash {
  return withRouteBuildInputV2ErrorPrefix(() => {
    const record = requireExactFields(
      value,
      ["terrainArtifactHash", "colliderArtifactHash"],
      "geometryArtifact",
    );
    return sha256CanonicalJson({
      terrainArtifactHash: requireHash(
        record.terrainArtifactHash,
        "geometryArtifact/terrainArtifactHash",
      ),
      colliderArtifactHash: requireHash(
        record.colliderArtifactHash,
        "geometryArtifact/colliderArtifactHash",
      ),
    }) as Sha256Hash;
  });
}

export function hashRouteSurfaceArtifactV2(value: unknown): Sha256Hash {
  return withRouteBuildInputV2ErrorPrefix(() => {
    if (!Array.isArray(value)) fail("traversalSurfaces", "must be an array");
    const surfaces = value.map((candidate, index) => {
      try {
        return assertTraversalSurfaceIdentityV1(candidate);
      } catch (cause) {
        fail(
          `traversalSurfaces/${index}`,
          cause instanceof Error ? cause.message : "must be a canonical identity",
        );
      }
    });
    let previousId: string | undefined;
    for (const surface of surfaces) {
      if (!isNil(previousId) && surface.traversalSurfaceId <= previousId) {
        fail("traversalSurfaces", "must be strictly sorted by unique traversalSurfaceId");
      }
      previousId = surface.traversalSurfaceId;
    }
    return sha256CanonicalJson(surfaces) as Sha256Hash;
  });
}

export function assertRouteBuildInputV2(value: unknown): RouteBuildInputV2 {
  return withRouteBuildInputV2ErrorPrefix(() => {
    const record = requireExactFields(value, BUILD_INPUT_FIELDS_V2, "");
    if (record.kind !== "route-build-input") {
      fail("kind", "must be 'route-build-input'");
    }
    if (record.schemaVersion !== 2) fail("schemaVersion", "must be 2");
    requireHash(record.authoringSpecHash, "authoringSpecHash");
    requireHash(record.layoutSolveReportHash, "layoutSolveReportHash");
    requireHash(record.resourceLockHash, "resourceLockHash");
    const terrainArtifactHash = requireHash(
      record.terrainArtifactHash,
      "terrainArtifactHash",
    );
    const colliderArtifactHash = requireHash(
      record.colliderArtifactHash,
      "colliderArtifactHash",
    );
    const geometryArtifactHash = requireHash(
      record.geometryArtifactHash,
      "geometryArtifactHash",
    );
    const surfaceArtifactHash = requireHash(
      record.surfaceArtifactHash,
      "surfaceArtifactHash",
    );

    const connectivity = requireExactFields(
      record.connectivityRequirement,
      CONNECTIVITY_FIELDS,
      "connectivityRequirement",
    );
    for (const field of CONNECTIVITY_FIELDS) {
      requireString(connectivity[field], `connectivityRequirement/${field}`);
    }
    if (connectivity.startAnchorEntityId === connectivity.destinationAnchorEntityId) {
      fail("connectivityRequirement", "start and destination anchors must differ");
    }
    const startAnchor = validateAnchor(record.startAnchor, "startAnchor");
    const destinationAnchor = validateAnchor(record.destinationAnchor, "destinationAnchor");
    const hardRibbon = validateHardRibbon(record.hardRibbon);
    const capabilityEnvelope = validateCapabilityEnvelope(record.capabilityEnvelope);
    assertEnvelopeMatchesResolvedProfileV2(capabilityEnvelope);
    const terrainSource = admitRouteTerrainSourceV2(record.terrainSource);
    const staticColliders = admitStaticCollidersV2(record.staticColliders);
    const traversalSurfaces = admitTraversalSurfacesV2(
      record.traversalSurfaces,
      terrainSource.terrainEntityId,
      staticColliders,
    );
    const blockedTraversalAreaExclusions = validateTraversalAreaExclusions(
      record.blockedTraversalAreaExclusions,
    );
    validateWaterExclusions(record.blockedWaterExclusions);

    if (connectivity.startAnchorEntityId !== startAnchor.entityId) {
      fail("startAnchor/entityId", "must match connectivityRequirement.startAnchorEntityId");
    }
    if (connectivity.destinationAnchorEntityId !== destinationAnchor.entityId) {
      fail(
        "destinationAnchor/entityId",
        "must match connectivityRequirement.destinationAnchorEntityId",
      );
    }
    if (connectivity.routeId !== hardRibbon.routeId) {
      fail("hardRibbon/routeId", "must match connectivityRequirement.routeId");
    }
    if (hardRibbon.locomotionProfileRef !== capabilityEnvelope.locomotionProfileRef) {
      fail(
        "hardRibbon/locomotionProfileRef",
        "must match capabilityEnvelope.locomotionProfileRef",
      );
    }
    if (connectivity.traversingEntityId !== capabilityEnvelope.subjectEntityId) {
      fail(
        "connectivityRequirement/traversingEntityId",
        "must match capabilityEnvelope.subjectEntityId",
      );
    }
    if (record.resourceLockHash !== capabilityEnvelope.resourceLockHash) {
      fail("resourceLockHash", "must match capabilityEnvelope.resourceLockHash");
    }
    const surfaceEntityIds = new Set(
      traversalSurfaces.map((surface) => surface.surfaceEntityId),
    );
    for (const [index, exclusion] of blockedTraversalAreaExclusions.entries()) {
      if (!surfaceEntityIds.has(exclusion.surfaceEntityId)) {
        fail(
          `blockedTraversalAreaExclusions/${index}/surfaceEntityId`,
          "must match a declared Traversal Surface",
        );
      }
    }

    if (terrainArtifactHash !== hashRouteTerrainArtifactV2(terrainSource)) {
      fail("terrainArtifactHash", "must hash the canonical Terrain source");
    }
    if (colliderArtifactHash !== hashRouteColliderArtifactV2(staticColliders)) {
      fail("colliderArtifactHash", "must hash the canonical static colliders");
    }
    if (
      geometryArtifactHash !==
      hashRouteGeometryArtifactV2({ terrainArtifactHash, colliderArtifactHash })
    ) {
      fail("geometryArtifactHash", "must hash the Terrain and collider artifact hashes");
    }
    if (surfaceArtifactHash !== hashRouteSurfaceArtifactV2(traversalSurfaces)) {
      fail("surfaceArtifactHash", "must hash the canonical Traversal Surfaces");
    }

    try {
      assertTraversalSurfaceCountBudgetV1({
        traversalSurfaceCount: traversalSurfaces.length,
        capabilityEnvelope,
      });
    } catch (cause) {
      fail(
        "traversalSurfaces",
        cause instanceof Error ? cause.message : "Surface-count budget exceeded",
      );
    }

    return value as RouteBuildInputV2;
  });
}

export function hashRouteBuildInputV2(value: unknown): Sha256Hash {
  return withRouteBuildInputV2ErrorPrefix(() => {
    const input = assertRouteBuildInputV2(value);
    return sha256CanonicalJson(input) as Sha256Hash;
  });
}

export function createRouteBuildInputReceiptV2(
  value: CreateRouteBuildInputReceiptV2Input,
): RouteBuildInputReceiptV2 {
  return withRouteBuildInputV2ErrorPrefix(() => {
    const record = requireExactFields(value, CREATE_RECEIPT_FIELDS, "");
    const input = assertRouteBuildInputV2(record.input);
    const suppliedLockReceipt = record.traversalLockReceipt as ResolvedTraversalLockReceiptV1;
    let traversalLockReceipt: ResolvedTraversalLockReceiptV1;
    try {
      traversalLockReceipt = resolveTraversalLockV1(suppliedLockReceipt.lock);
    } catch (cause) {
      fail(
        "traversalLockReceipt",
        cause instanceof Error ? cause.message : "must be a canonical resolved Lock receipt",
      );
    }
    if (
      !isDeeplyFrozen(suppliedLockReceipt) ||
      sha256CanonicalJson(suppliedLockReceipt) !== sha256CanonicalJson(traversalLockReceipt)
    ) {
      fail(
        "traversalLockReceipt",
        "must equal the canonical deeply frozen resolved Lock receipt",
      );
    }
    const graphBuilderProfile = resolveTraversalGraphBuilderProfileV2(
      input.capabilityEnvelope.graphBuilderProfileRef,
    );
    const expectedEnvelope = createTraversalCapabilityEnvelopeV1({
      traversalLockReceipt,
      graphBuilderProfile,
    }).envelope;
    if (
      sha256CanonicalJson(input.capabilityEnvelope) !==
      sha256CanonicalJson(expectedEnvelope)
    ) {
      fail(
        "input/capabilityEnvelope",
        "must equal the Envelope derived from traversalLockReceipt and its resolved Graph Builder Profile",
      );
    }
    const routeBuildInputHash = hashRouteBuildInputV2(input);
    const budgetEvidence = computeRouteBuildBudgetEvidenceV2(input);
    return deepFreeze({
      input,
      traversalLockReceipt,
      routeBuildInputHash,
      budgetEvidence,
    });
  });
}

export function assertRouteBuildInputReceiptV2(
  value: unknown,
): RouteBuildInputReceiptV2 {
  return withRouteBuildInputV2ErrorPrefix(() => {
    const record = requireExactFields(value, RECEIPT_FIELDS, "");
    if (!isDeeplyFrozen(value)) fail("", "receipt must be deeply frozen");
    const expected = createRouteBuildInputReceiptV2({
      input: record.input as RouteBuildInputV2,
      traversalLockReceipt: record.traversalLockReceipt as ResolvedTraversalLockReceiptV1,
    });
    if (sha256CanonicalJson(value) !== sha256CanonicalJson(expected)) {
      fail("", "must equal the factory-produced canonical receipt bytes");
    }
    return value as RouteBuildInputReceiptV2;
  });
}
