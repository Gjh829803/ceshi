import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  queryCanonicalTraversalSurfaceHitsV1,
  TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1,
  type CanonicalTraversalSurfaceTriangleSourceV1,
} from "@whitebox-world/terrain-surface";
import {
  assertRouteBuildInputReceiptV2,
  canonicalTraversalGraphV2,
  quantizeTraversalMetersToMicrometersV1,
  type RouteBuildInputReceiptV2,
  type TraversalCapabilityEnvelopeV1,
  type TraversalEdgeV1,
  type TraversalGraphV2,
  type TraversalNodeV1,
  type TraversalSurfaceIdentityV1,
} from "@whitebox-world/traversal";
import { Detour, type NavMesh } from "recast-navigation";
import { isEmpty, isNil } from "lodash-es";

import { RECAST_QUERY_PROVIDER_CONSTANTS_V1 } from "./adapter-identity.js";
import {
  createHardRibbonProofV1,
  isPointInsideHardRibbonV1,
  isSegmentInsideHardRibbonV1,
} from "./hard-ribbon-proof.js";
import {
  collectBoundTraversalSurfaceQuerySourcesV2,
  mapRouteBuildInputToRecastSourceV2,
} from "./heightfield-source.js";
import { mapTraversalCapabilityEnvelopeToRecastTiledConfigV1 } from "./recast-config.js";

type Vec3 = readonly [number, number, number];
type Vec2 = readonly [number, number];
type Vec3Units = readonly [number, number, number];

export type RecastAuditDetailTriangleV1 = readonly [Vec3, Vec3, Vec3];

export interface RecastAuditPolygonV1 {
  readonly providerPolygonRef: number;
  readonly providerType: number;
  readonly areaId: number;
  readonly flags: number;
  readonly vertexIndices: readonly number[];
  readonly firstLinkIndex: number;
  readonly detailTrianglesMetersXYZ: readonly RecastAuditDetailTriangleV1[];
}

export interface RecastAuditLinkV1 {
  readonly providerLinkIndex: number;
  readonly targetProviderPolygonRef: number;
  readonly nextLinkIndex: number;
  readonly sourceEdgeIndex: number;
  readonly side: number;
  readonly boundaryMinimum: number;
  readonly boundaryMaximum: number;
}

export interface RecastAuditTileV1 {
  readonly tileX: number;
  readonly tileZ: number;
  readonly tileLayer: number;
  readonly maximumLinkCount: number;
  readonly offMeshConnectionCount: number;
  readonly verticesMetersXYZ: readonly Vec3[];
  readonly polygons: readonly RecastAuditPolygonV1[];
  readonly links: readonly RecastAuditLinkV1[];
}

export interface RecastNavMeshAuditSnapshotV1 {
  readonly kind: "recast-navmesh-audit-snapshot";
  readonly schemaVersion: 1;
  readonly nullLinkIndex: number;
  readonly tiles: readonly RecastAuditTileV1[];
}

export type TraversalGraphProjectionV2 =
  | Readonly<{
      status: "complete";
      traversalGraph: TraversalGraphV2;
      traversalNodeIdByProviderPolygonRef: ReadonlyMap<number, string>;
      providerPolygonRefByTraversalNodeId: ReadonlyMap<string, number>;
    }>
  | Readonly<{
      status: "unavailable";
      reason: "no-queryable-ground-surface";
    }>
  | Readonly<{
      status: "incomplete";
      capacityKind: "nodes" | "edges";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>
  | Readonly<{
      status: "incomplete";
      reason: "surface-correlation-missing" | "surface-correlation-ambiguous";
      relatedTraversalSurfaceIdentities: readonly TraversalSurfaceIdentityV1[];
      failurePositionMetersXYZ: Vec3;
    }>;

interface QuantizedPolygonV1 {
  readonly providerPolygonRef: number;
  readonly tile: RecastAuditTileV1;
  readonly polygon: RecastAuditPolygonV1;
  readonly sourceVertexUnitsXYZ: readonly Vec3Units[];
  readonly canonicalCycleUnitsXYZ: readonly Vec3Units[];
  readonly centroidUnitsXYZ: Vec3Units;
  readonly node: TraversalNodeV1;
  readonly slopeDegrees: number;
}

interface PortalEvidenceV1 {
  readonly minimumUnitsXYZ: Vec3Units;
  readonly maximumUnitsXYZ: Vec3Units;
  readonly sourceMinimumYUnits: number;
  readonly sourceMaximumYUnits: number;
  readonly targetMinimumYUnits: number;
  readonly targetMaximumYUnits: number;
}

interface ProjectedEdgeCandidateV1 {
  readonly edge: TraversalEdgeV1;
  readonly portalEvidenceKey: string;
  readonly portal: PortalEvidenceV1;
}

const ANGLE_QUANTUM_DEGREES = 0.000001;
const COST_QUANTUM_RATIO = 0.000001;
const INTERNAL_LINK_SIDE = 0xff;
const GROUND_POLYGON_TYPE = 0;
const TERRAIN_AREA_ID = 0;
const TERRAIN_FLAG = 1;
const CANDIDATE_AREA_ID_MINIMUM = 2;
const CANDIDATE_AREA_ID_MAXIMUM = 62;

function fail(message: string): never {
  throw new Error(`TRAVERSAL_RECAST_GRAPH_PROJECTION_INVALID: ${message}`);
}

function compareCanonical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function deepFreeze<T>(value: T): T {
  if (isNil(value) || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) fail(`${label} must be a safe integer.`);
  return value;
}

function requireFiniteVec3(value: Vec3, label: string): void {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((component) => !Number.isFinite(component))
  ) {
    fail(`${label} must be a finite XYZ tuple.`);
  }
}

function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) fail("quantization input must be finite.");
  const result = value < 0 ? Math.ceil(value - 0.5) : Math.floor(value + 0.5);
  return requireSafeInteger(result, "quantized coordinate");
}

function quantizeToUnits(value: number, quantum: number): number {
  if (!Number.isFinite(quantum) || !(quantum > 0)) {
    fail("position quantum must be positive and finite.");
  }
  return roundHalfAwayFromZero(value / quantum);
}

function pointToUnits(point: Vec3, quantum: number): Vec3Units {
  requireFiniteVec3(point, "provider point");
  return [
    quantizeToUnits(point[0], quantum),
    quantizeToUnits(point[1], quantum),
    quantizeToUnits(point[2], quantum),
  ];
}

function unitsToMeters(units: number, quantum: number): number {
  requireSafeInteger(units, "quantized units");
  const value = units * quantum;
  if (!Number.isFinite(value)) fail("quantized meter value is not finite.");
  return normalizeZero(value);
}

function pointUnitsToMeters(point: Vec3Units, quantum: number): Vec3 {
  return [
    unitsToMeters(point[0], quantum),
    unitsToMeters(point[1], quantum),
    unitsToMeters(point[2], quantum),
  ];
}

function samePoint(left: Vec3Units, right: Vec3Units): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function comparePoint(left: Vec3Units, right: Vec3Units): number {
  for (let axis = 0; axis < 3; axis += 1) {
    if (left[axis]! < right[axis]!) return -1;
    if (left[axis]! > right[axis]!) return 1;
  }
  return 0;
}

function compareCycles(
  left: readonly Vec3Units[],
  right: readonly Vec3Units[],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const comparison = comparePoint(left[index]!, right[index]!);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function rotateCycle(
  cycle: readonly Vec3Units[],
  startIndex: number,
): readonly Vec3Units[] {
  return cycle.map((_, offset) => cycle[(startIndex + offset) % cycle.length]!);
}

function canonicalizeCycle(source: readonly Vec3Units[]): readonly Vec3Units[] {
  const deduplicated: Vec3Units[] = [];
  for (const point of source) {
    if (deduplicated.length === 0 || !samePoint(deduplicated.at(-1)!, point)) {
      deduplicated.push(point);
    }
  }
  if (
    deduplicated.length > 1 &&
    samePoint(deduplicated[0]!, deduplicated.at(-1)!)
  ) {
    deduplicated.pop();
  }
  const unique = new Set(deduplicated.map((point) => point.join(",")));
  if (deduplicated.length < 3 || unique.size < 3) {
    fail("a projected polygon must retain three distinct quantized vertices.");
  }

  let signedAreaTimesTwo = 0n;
  for (let index = 0; index < deduplicated.length; index += 1) {
    const point = deduplicated[index]!;
    const next = deduplicated[(index + 1) % deduplicated.length]!;
    signedAreaTimesTwo +=
      BigInt(point[0]) * BigInt(next[2]) - BigInt(next[0]) * BigInt(point[2]);
  }
  if (signedAreaTimesTwo === 0n) {
    fail("a projected polygon must have non-zero quantized XZ area.");
  }

  const orientations = [deduplicated, [...deduplicated].reverse()] as const;
  let selected: readonly Vec3Units[] | undefined;
  for (const orientation of orientations) {
    for (let startIndex = 0; startIndex < orientation.length; startIndex += 1) {
      const candidate = rotateCycle(orientation, startIndex);
      if (isNil(selected) || compareCycles(candidate, selected) < 0) {
        selected = candidate;
      }
    }
  }
  return selected!;
}

function divideRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): number {
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = (remainder * 2n >= denominator ? quotient + 1n : quotient) * sign;
  const result = Number(rounded);
  return requireSafeInteger(result, "quantized centroid");
}

function centroidUnits(cycle: readonly Vec3Units[]): Vec3Units {
  const denominator = BigInt(cycle.length);
  return [0, 1, 2].map((axis) => divideRoundHalfAwayFromZero(
    cycle.reduce((sum, point) => sum + BigInt(point[axis]!), 0n),
    denominator,
  )) as unknown as Vec3Units;
}

function ceilingToQuantum(value: number, quantum: number): number {
  if (!Number.isFinite(value) || value < 0) fail("upper-bound evidence must be finite and non-negative.");
  const units = Math.ceil(value / quantum - Number.EPSILON);
  return unitsToMeters(requireSafeInteger(units, "ceiling units"), quantum);
}

function floorMicrometerValueToQuantum(
  valueMicrometers: number,
  quantumMeters: number,
): number {
  const quantumMicrometers = quantizeTraversalMetersToMicrometersV1(
    quantumMeters,
  );
  if (!(quantumMicrometers > 0) || !Number.isSafeInteger(valueMicrometers)) {
    fail("micrometer lower-bound evidence is outside the deterministic range.");
  }
  const units = Math.floor(valueMicrometers / quantumMicrometers);
  return unitsToMeters(units, quantumMeters);
}

function maximumDetailSlopeDegrees(
  triangles: readonly RecastAuditDetailTriangleV1[],
): number {
  if (triangles.length === 0) fail("a ground polygon must have detail triangles.");
  let maximum = 0;
  for (const triangle of triangles) {
    const [a, b, c] = triangle;
    requireFiniteVec3(a, "detail triangle A");
    requireFiniteVec3(b, "detail triangle B");
    requireFiniteVec3(c, "detail triangle C");
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abz = b[2] - a[2];
    const acx = c[0] - a[0];
    const acy = c[1] - a[1];
    const acz = c[2] - a[2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const normalLength = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(normalLength) || !(normalLength > 0)) {
      fail("a detail triangle must have finite non-zero area.");
    }
    if (!(ny > 0)) {
      fail("a detail triangle must retain positive-Y provider winding.");
    }
    const degrees = Math.atan2(Math.hypot(nx, nz), ny) * 180 / Math.PI;
    maximum = Math.max(maximum, degrees);
  }
  return ceilingToQuantum(maximum, ANGLE_QUANTUM_DEGREES);
}

function tileId(tile: RecastAuditTileV1): string {
  return `traversal-tile:${sha256CanonicalJson({
    kind: "traversal-tile-identity",
    schemaVersion: 1,
    tileX: tile.tileX,
    tileZ: tile.tileZ,
    tileLayer: tile.tileLayer,
  }).slice("sha256:".length)}`;
}

function nodeIdFromSurface(
  surface: TraversalSurfaceIdentityV1,
  cycle: readonly Vec3Units[],
): string {
  return `traversal-node:${sha256CanonicalJson({
    kind: "traversal-node-identity",
    schemaVersion: 1,
    surfaceArtifactHash: surface.resourceHash,
    traversalSurfaceId: surface.traversalSurfaceId,
    surfaceEntityId: surface.surfaceEntityId,
    colliderSubshapeId: surface.colliderSubshapeId,
    canonicalVertexCycleUnitsXYZ: cycle,
  }).slice("sha256:".length)}`;
}

function edgeId(fromTraversalNodeId: string, toTraversalNodeId: string): string {
  return `traversal-edge:${sha256CanonicalJson({
    kind: "traversal-edge-identity",
    schemaVersion: 1,
    fromTraversalNodeId,
    toTraversalNodeId,
  }).slice("sha256:".length)}`;
}

function safeDifferenceUnits(
  minuend: number,
  subtrahend: number,
  label: string,
): number {
  const difference = Number(BigInt(minuend) - BigInt(subtrahend));
  return requireSafeInteger(difference, label);
}

function absoluteDifferenceUnits(
  left: number,
  right: number,
  label: string,
): number {
  const difference = BigInt(left) - BigInt(right);
  const absolute = difference < 0n ? -difference : difference;
  return requireSafeInteger(Number(absolute), label);
}

export function interpolatePortalBoundaryPointUnitsV1(
  start: Vec3Units,
  end: Vec3Units,
  boundaryByte: number,
): Vec3Units {
  for (const [index, value] of [...start, ...end].entries()) {
    requireSafeInteger(value, `portal endpoint unit ${index}`);
  }
  if (
    !Number.isSafeInteger(boundaryByte) ||
    boundaryByte < 0 ||
    boundaryByte > 255
  ) {
    fail("portal boundary byte must be an integer in [0, 255].");
  }
  const denominator = 255n;
  const boundary = BigInt(boundaryByte);
  return [0, 1, 2].map((axis) => divideRoundHalfAwayFromZero(
    BigInt(start[axis]!) * denominator +
      (BigInt(end[axis]!) - BigInt(start[axis]!)) * boundary,
    denominator,
  )) as unknown as Vec3Units;
}

function crossUnitsXZ(start: Vec3Units, end: Vec3Units, point: Vec3Units): bigint {
  return (BigInt(end[0]) - BigInt(start[0])) *
      (BigInt(point[2]) - BigInt(start[2])) -
    (BigInt(end[2]) - BigInt(start[2])) *
      (BigInt(point[0]) - BigInt(start[0]));
}

function interpolateIntegerUnits(
  startUnits: number,
  endUnits: number,
  axisStartUnits: number,
  axisEndUnits: number,
  axisUnits: number,
): number {
  let denominator = BigInt(axisEndUnits) - BigInt(axisStartUnits);
  if (denominator === 0n) fail("portal interpolation denominator must be non-zero.");
  let numerator = BigInt(startUnits) * denominator +
    (BigInt(endUnits) - BigInt(startUnits)) *
      (BigInt(axisUnits) - BigInt(axisStartUnits));
  if (denominator < 0n) {
    denominator = -denominator;
    numerator = -numerator;
  }
  return divideRoundHalfAwayFromZero(numerator, denominator);
}

function pointAtAxisUnits(
  start: Vec3Units,
  end: Vec3Units,
  axis: 0 | 2,
  axisUnits: number,
): Vec3Units {
  if (end[axis] === start[axis]) {
    fail("portal interpolation axis must have non-zero extent.");
  }
  return [
    axis === 0 ? axisUnits : interpolateIntegerUnits(
      start[0], end[0], start[axis], end[axis], axisUnits,
    ),
    interpolateIntegerUnits(
      start[1], end[1], start[axis], end[axis], axisUnits,
    ),
    axis === 2 ? axisUnits : interpolateIntegerUnits(
      start[2], end[2], start[axis], end[axis], axisUnits,
    ),
  ];
}

function recoverPortal(
  source: QuantizedPolygonV1,
  target: QuantizedPolygonV1,
  link: RecastAuditLinkV1,
  quantum: number,
): PortalEvidenceV1 {
  if (
    !Number.isSafeInteger(link.sourceEdgeIndex) ||
    link.sourceEdgeIndex < 0 ||
    link.sourceEdgeIndex >= source.polygon.vertexIndices.length
  ) {
    fail("Link source edge index is out of range.");
  }
  if (
    !Number.isSafeInteger(link.boundaryMinimum) ||
    !Number.isSafeInteger(link.boundaryMaximum) ||
    link.boundaryMinimum < 0 ||
    link.boundaryMaximum > 255 ||
    link.boundaryMinimum > link.boundaryMaximum
  ) {
    fail("Link boundary byte interval is invalid.");
  }
  const sourceStartRaw = source.tile.verticesMetersXYZ[
    source.polygon.vertexIndices[link.sourceEdgeIndex]!
  ]!;
  const sourceEndRaw = source.tile.verticesMetersXYZ[
    source.polygon.vertexIndices[
      (link.sourceEdgeIndex + 1) % source.polygon.vertexIndices.length
    ]!
  ]!;
  const sourceEdgeStart = pointToUnits(sourceStartRaw, quantum);
  const sourceEdgeEnd = pointToUnits(sourceEndRaw, quantum);
  let sourceStart = sourceEdgeStart;
  let sourceEnd = sourceEdgeEnd;
  if (link.side !== INTERNAL_LINK_SIDE) {
    sourceStart = interpolatePortalBoundaryPointUnitsV1(
      sourceEdgeStart,
      sourceEdgeEnd,
      link.boundaryMinimum,
    );
    sourceEnd = interpolatePortalBoundaryPointUnitsV1(
      sourceEdgeStart,
      sourceEdgeEnd,
      link.boundaryMaximum,
    );
  }
  if (sourceStart[0] === sourceEnd[0] && sourceStart[2] === sourceEnd[2]) {
    fail("Link portal interval has zero quantized XZ length.");
  }
  const deltaX = BigInt(sourceEnd[0]) - BigInt(sourceStart[0]);
  const deltaZ = BigInt(sourceEnd[2]) - BigInt(sourceStart[2]);
  const axis: 0 | 2 = (deltaX < 0n ? -deltaX : deltaX) >=
      (deltaZ < 0n ? -deltaZ : deltaZ)
    ? 0
    : 2;
  const sourceMinimum = Math.min(sourceStart[axis], sourceEnd[axis]);
  const sourceMaximum = Math.max(sourceStart[axis], sourceEnd[axis]);
  const candidates: PortalEvidenceV1[] = [];
  for (let index = 0; index < target.sourceVertexUnitsXYZ.length; index += 1) {
    const targetStart = target.sourceVertexUnitsXYZ[index]!;
    const targetEnd = target.sourceVertexUnitsXYZ[
      (index + 1) % target.sourceVertexUnitsXYZ.length
    ]!;
    if (
      crossUnitsXZ(sourceStart, sourceEnd, targetStart) !== 0n ||
      crossUnitsXZ(sourceStart, sourceEnd, targetEnd) !== 0n
    ) continue;
    const overlapMinimum = Math.max(
      sourceMinimum,
      Math.min(targetStart[axis], targetEnd[axis]),
    );
    const overlapMaximum = Math.min(
      sourceMaximum,
      Math.max(targetStart[axis], targetEnd[axis]),
    );
    if (!(overlapMinimum < overlapMaximum)) continue;
    const sourceMinimumPoint = pointAtAxisUnits(sourceStart, sourceEnd, axis, overlapMinimum);
    const sourceMaximumPoint = pointAtAxisUnits(sourceStart, sourceEnd, axis, overlapMaximum);
    const targetMinimumPoint = pointAtAxisUnits(targetStart, targetEnd, axis, overlapMinimum);
    const targetMaximumPoint = pointAtAxisUnits(targetStart, targetEnd, axis, overlapMaximum);
    candidates.push({
      minimumUnitsXYZ: [
        sourceMinimumPoint[0],
        sourceMinimumPoint[1],
        sourceMinimumPoint[2],
      ],
      maximumUnitsXYZ: [
        sourceMaximumPoint[0],
        sourceMaximumPoint[1],
        sourceMaximumPoint[2],
      ],
      sourceMinimumYUnits: sourceMinimumPoint[1],
      sourceMaximumYUnits: sourceMaximumPoint[1],
      targetMinimumYUnits: targetMinimumPoint[1],
      targetMaximumYUnits: targetMaximumPoint[1],
    });
  }
  const uniqueCandidates = [...new Map(
    candidates.map((candidate) => [JSON.stringify(candidate), candidate]),
  ).values()];
  if (uniqueCandidates.length !== 1) {
    fail(`Link must recover exactly one positive collinear portal overlap; found ${uniqueCandidates.length}.`);
  }
  return uniqueCandidates[0]!;
}

function projectPolygon(
  tile: RecastAuditTileV1,
  polygon: RecastAuditPolygonV1,
  surface: TraversalSurfaceIdentityV1,
  envelope: TraversalCapabilityEnvelopeV1,
  clearanceWidthMeters: number,
  clearanceHeightMeters: number,
): QuantizedPolygonV1 {
  const quantum = envelope.positionQuantizationMeters;
  if (polygon.vertexIndices.length < 3) fail("a ground polygon must have at least three vertices.");
  const sourceVertexUnitsXYZ = polygon.vertexIndices.map((vertexIndex) => {
    if (
      !Number.isSafeInteger(vertexIndex) ||
      vertexIndex < 0 ||
      vertexIndex >= tile.verticesMetersXYZ.length
    ) fail("polygon vertex index is out of range.");
    return pointToUnits(tile.verticesMetersXYZ[vertexIndex]!, quantum);
  });
  const canonicalCycleUnitsXYZ = canonicalizeCycle(sourceVertexUnitsXYZ);
  const centroid = centroidUnits(canonicalCycleUnitsXYZ);
  const slopeDegrees = maximumDetailSlopeDegrees(polygon.detailTrianglesMetersXYZ);
  const id = nodeIdFromSurface(surface, canonicalCycleUnitsXYZ);
  return {
    providerPolygonRef: polygon.providerPolygonRef,
    tile,
    polygon,
    sourceVertexUnitsXYZ,
    canonicalCycleUnitsXYZ,
    centroidUnitsXYZ: centroid,
    slopeDegrees,
    node: {
      id,
      traversalSurfaceId: surface.traversalSurfaceId,
      surfaceEntityId: surface.surfaceEntityId,
      colliderSubshapeId: surface.colliderSubshapeId,
      positionMetersXYZ: pointUnitsToMeters(centroid, quantum),
      tileId: tileId(tile),
      clearanceWidthMeters,
      clearanceHeightMeters,
    },
  };
}

interface GraphEdgeBuildInputV1 {
  readonly capabilityEnvelope: TraversalCapabilityEnvelopeV1;
  readonly hardRibbon: {
    readonly pointsMetersXZ: readonly (readonly [number, number])[];
    readonly widthMeters: number;
  };
}

function buildEdge(
  source: QuantizedPolygonV1,
  target: QuantizedPolygonV1,
  link: RecastAuditLinkV1,
  input: GraphEdgeBuildInputV1,
  clearanceWidthMeters: number,
  clearanceHeightMeters: number,
): ProjectedEdgeCandidateV1 | undefined {
  const envelope = input.capabilityEnvelope;
  const quantum = envelope.positionQuantizationMeters;
  const portal = recoverPortal(source, target, link, quantum);
  if (
    link.side !== INTERNAL_LINK_SIDE &&
    link.side !== 0 &&
    link.side !== 2 &&
    link.side !== 4 &&
    link.side !== 6
  ) {
    fail("ground Link side must be internal or one of the four Tile boundary sides.");
  }
  const startXZ = [
    unitsToMeters(portal.minimumUnitsXYZ[0], quantum),
    unitsToMeters(portal.minimumUnitsXYZ[2], quantum),
  ] as const;
  const endXZ = [
    unitsToMeters(portal.maximumUnitsXYZ[0], quantum),
    unitsToMeters(portal.maximumUnitsXYZ[2], quantum),
  ] as const;
  const ribbon = createHardRibbonProofV1({
    pointsMetersXZ: input.hardRibbon.pointsMetersXZ,
    widthMeters: input.hardRibbon.widthMeters,
  });
  if (!isSegmentInsideHardRibbonV1(ribbon, startXZ, endXZ)) return undefined;

  const deltaX = target.node.positionMetersXYZ[0] - source.node.positionMetersXYZ[0];
  const deltaZ = target.node.positionMetersXYZ[2] - source.node.positionMetersXYZ[2];
  const distanceMeters = ceilingToQuantum(Math.hypot(deltaX, deltaZ), quantum);
  const heightDeltaMeters = unitsToMeters(safeDifferenceUnits(
    target.centroidUnitsXYZ[1],
    source.centroidUnitsXYZ[1],
    "height delta units",
  ), quantum);
  const stepHeightMeters = unitsToMeters(Math.max(
    absoluteDifferenceUnits(
      portal.sourceMinimumYUnits,
      portal.targetMinimumYUnits,
      "portal minimum step units",
    ),
    absoluteDifferenceUnits(
      portal.sourceMaximumYUnits,
      portal.targetMaximumYUnits,
      "portal maximum step units",
    ),
  ), quantum);
  const slopeDegrees = Math.max(source.slopeDegrees, target.slopeDegrees);
  if (
    slopeDegrees > envelope.maxSlopeDegrees ||
    stepHeightMeters > envelope.maxStepHeightMeters ||
    clearanceWidthMeters < envelope.capsuleRadiusMeters * 2 ||
    clearanceHeightMeters < envelope.capsuleHeightMeters
  ) return undefined;
  if (slopeDegrees > 0 && envelope.maxSlopeDegrees === 0) return undefined;
  if (stepHeightMeters > 0 && envelope.maxStepHeightMeters === 0) return undefined;

  const cost = distanceMeters / envelope.maximumEdgeLengthMeters +
    (envelope.maxSlopeDegrees === 0
      ? 0
      : envelope.slopeCostWeight * slopeDegrees / envelope.maxSlopeDegrees) +
    (envelope.maxStepHeightMeters === 0
      ? 0
      : envelope.stepCostWeight * stepHeightMeters / envelope.maxStepHeightMeters);
  const routePathCost = ceilingToQuantum(cost, COST_QUANTUM_RATIO);
  if (!(routePathCost > 0)) fail("a projected Edge must have positive routePathCost.");
  const edge: TraversalEdgeV1 = {
      id: edgeId(source.node.id, target.node.id),
      type: stepHeightMeters > 0 ? "step" : slopeDegrees > 0 ? "slope" : "walk",
      fromTraversalNodeId: source.node.id,
      toTraversalNodeId: target.node.id,
      distanceMeters,
      heightDeltaMeters,
      stepHeightMeters,
      slopeDegrees,
      minimumClearanceWidthMeters: clearanceWidthMeters,
      minimumClearanceHeightMeters: clearanceHeightMeters,
      routePathCost,
  };
  return {
    edge,
    portalEvidenceKey: JSON.stringify(portal),
    portal,
  };
}

function capacityResult(
  capacityKind: "nodes" | "edges",
  maximumAllowedCount: number,
): TraversalGraphProjectionV2 {
  return deepFreeze({
    status: "incomplete",
    capacityKind,
    maximumAllowedCount,
    minimumRequiredCount: maximumAllowedCount + 1,
  });
}

export function classifyGraphProjectionCapacityV1(input: Readonly<{
  nodeCount: number;
  edgeCount: number;
  maximumNodes: number;
  maximumEdges: number;
}>): TraversalGraphProjectionV2 | undefined {
  for (const [field, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      fail(`${field} must be a non-negative safe integer.`);
    }
  }
  if (!(input.maximumNodes > 0) || !(input.maximumEdges > 0)) {
    fail("Graph projection capacities must be positive.");
  }
  if (input.nodeCount > input.maximumNodes) {
    return capacityResult("nodes", input.maximumNodes);
  }
  if (input.edgeCount > input.maximumEdges) {
    return capacityResult("edges", input.maximumEdges);
  }
  return undefined;
}

function rawTileVertex(tile: RecastAuditTileV1, index: number): Vec3 {
  const point = tile.verticesMetersXYZ[index];
  if (isNil(point)) fail("raw polygon vertex index is out of range.");
  return point;
}

export function snapshotRecastNavMeshV1(navMesh: NavMesh): RecastNavMeshAuditSnapshotV1 {
  if (!Number.isSafeInteger(Detour.DT_NULL_LINK)) {
    fail("Recast provider must be initialized before NavMesh projection.");
  }
  const tiles: RecastAuditTileV1[] = [];
  for (let slot = 0; slot < navMesh.getMaxTiles(); slot += 1) {
    const rawTile = navMesh.getTile(slot);
    const header = rawTile.header();
    if (isNil(header)) continue;
    if (header.offMeshConCount() !== 0) {
      fail("off-mesh connections are forbidden before reading polygon detail data.");
    }
    if (header.detailMeshCount() !== header.polyCount()) {
      fail("detail Mesh count must equal ground polygon count.");
    }
    const verticesMetersXYZ: Vec3[] = [];
    for (let vertexIndex = 0; vertexIndex < header.vertCount(); vertexIndex += 1) {
      const point: Vec3 = [
        rawTile.verts(vertexIndex * 3),
        rawTile.verts(vertexIndex * 3 + 1),
        rawTile.verts(vertexIndex * 3 + 2),
      ];
      requireFiniteVec3(point, "raw Tile vertex");
      verticesMetersXYZ.push(point);
    }
    const tileShell: RecastAuditTileV1 = {
      tileX: header.x(),
      tileZ: header.y(),
      tileLayer: header.layer(),
      maximumLinkCount: header.maxLinkCount(),
      offMeshConnectionCount: header.offMeshConCount(),
      verticesMetersXYZ,
      polygons: [],
      links: [],
    };
    const polygons: RecastAuditPolygonV1[] = [];
    const baseRef = navMesh.getPolyRefBase(rawTile);
    for (let polygonIndex = 0; polygonIndex < header.polyCount(); polygonIndex += 1) {
      const rawPolygon = rawTile.polys(polygonIndex);
      const vertexIndices = Array.from(
        { length: rawPolygon.vertCount() },
        (_, index) => rawPolygon.verts(index),
      );
      const detail = rawTile.detailMeshes(polygonIndex);
      if (
        detail.triBase() < 0 ||
        detail.triCount() < 0 ||
        detail.triBase() + detail.triCount() > header.detailTriCount() ||
        detail.vertBase() < 0 ||
        detail.vertCount() < 0 ||
        detail.vertBase() + detail.vertCount() > header.detailVertCount()
      ) {
        fail("detail Mesh range exceeds the Tile detail arrays.");
      }
      const detailTrianglesMetersXYZ: RecastAuditDetailTriangleV1[] = [];
      for (let detailIndex = 0; detailIndex < detail.triCount(); detailIndex += 1) {
        const triangleIndices = [0, 1, 2].map((corner) =>
          rawTile.detailTris((detail.triBase() + detailIndex) * 4 + corner));
        const triangle = triangleIndices.map((triangleIndex) => {
          if (triangleIndex! < rawPolygon.vertCount()) {
            return rawTileVertex(tileShell, vertexIndices[triangleIndex!]!);
          }
          const localDetailVertexIndex = triangleIndex! - rawPolygon.vertCount();
          if (
            localDetailVertexIndex < 0 ||
            localDetailVertexIndex >= detail.vertCount()
          ) {
            fail("detail triangle local vertex index is out of range.");
          }
          const detailVertexIndex = detail.vertBase() + localDetailVertexIndex;
          if (detailVertexIndex < 0 || detailVertexIndex >= header.detailVertCount()) {
            fail("detail triangle vertex index is out of range.");
          }
          const point: Vec3 = [
            rawTile.detailVerts(detailVertexIndex * 3),
            rawTile.detailVerts(detailVertexIndex * 3 + 1),
            rawTile.detailVerts(detailVertexIndex * 3 + 2),
          ];
          requireFiniteVec3(point, "raw detail vertex");
          return point;
        }) as unknown as RecastAuditDetailTriangleV1;
        detailTrianglesMetersXYZ.push(triangle);
      }
      polygons.push({
        providerPolygonRef: baseRef + polygonIndex,
        providerType: rawPolygon.getType(),
        areaId: rawPolygon.areaAndType() & 0x3f,
        flags: rawPolygon.flags(),
        vertexIndices,
        firstLinkIndex: rawPolygon.firstLink(),
        detailTrianglesMetersXYZ,
      });
    }
    const links: RecastAuditLinkV1[] = [];
    const usedLinkIndices = new Set<number>();
    for (const polygon of polygons) {
      const chainIndices = new Set<number>();
      let linkIndex = polygon.firstLinkIndex;
      while (linkIndex !== Detour.DT_NULL_LINK) {
        if (
          !Number.isSafeInteger(linkIndex) ||
          linkIndex < 0 ||
          linkIndex >= header.maxLinkCount()
        ) fail("used raw Link index is outside maxLinkCount.");
        if (chainIndices.has(linkIndex)) fail("raw Link chain contains a cycle.");
        if (usedLinkIndices.has(linkIndex)) fail("raw Link slot is owned by multiple polygons.");
        chainIndices.add(linkIndex);
        usedLinkIndices.add(linkIndex);
        if (chainIndices.size > header.maxLinkCount()) {
          fail("raw Link chain exceeds maxLinkCount.");
        }
        const rawLink = rawTile.links(linkIndex);
        const nextLinkIndex = rawLink.next();
        links.push({
          providerLinkIndex: linkIndex,
          targetProviderPolygonRef: rawLink.ref(),
          nextLinkIndex,
          sourceEdgeIndex: rawLink.edge(),
          side: rawLink.side(),
          boundaryMinimum: rawLink.bmin(),
          boundaryMaximum: rawLink.bmax(),
        });
        linkIndex = nextLinkIndex;
      }
    }
    tiles.push({ ...tileShell, polygons, links });
  }
  return deepFreeze({
    kind: "recast-navmesh-audit-snapshot",
    schemaVersion: 1,
    nullLinkIndex: Detour.DT_NULL_LINK,
    tiles,
  });
}


function sortIdentitiesBySurfaceId(
  identities: readonly TraversalSurfaceIdentityV1[],
): TraversalSurfaceIdentityV1[] {
  return [...identities].sort((left, right) =>
    compareCanonical(left.traversalSurfaceId, right.traversalSurfaceId));
}

export function graphNodeCorrelationHeightWindowMetersV2(
  envelope: Pick<TraversalCapabilityEnvelopeV1, "positionQuantizationMeters">,
): number {
  return envelope.positionQuantizationMeters / 2 +
    TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1;
}

function interpolateTriangleHeightMetersAtXzV2(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  pointMetersXZ: readonly [number, number],
): number | undefined {
  const px = pointMetersXZ[0];
  const pz = pointMetersXZ[1];
  const v0x = c[0] - a[0];
  const v0z = c[2] - a[2];
  const v1x = b[0] - a[0];
  const v1z = b[2] - a[2];
  const v2x = px - a[0];
  const v2z = pz - a[2];
  const dot00 = v0x * v0x + v0z * v0z;
  const dot01 = v0x * v1x + v0z * v1z;
  const dot02 = v0x * v2x + v0z * v2z;
  const dot11 = v1x * v1x + v1z * v1z;
  const dot12 = v1x * v2x + v1z * v2z;
  const denom = dot00 * dot11 - dot01 * dot01;
  if (denom === 0) return undefined;
  const u = (dot11 * dot02 - dot01 * dot12) / denom;
  const v = (dot00 * dot12 - dot01 * dot02) / denom;
  if (u < -1e-12 || v < -1e-12 || u + v > 1 + 1e-12) return undefined;
  return a[1] + v * (b[1] - a[1]) + u * (c[1] - a[1]);
}

function sampleQuantizedDetailHeightMetersAtXzV2(
  triangles: readonly RecastAuditDetailTriangleV1[],
  pointMetersXZ: readonly [number, number],
  quantumMeters: number,
): number | undefined {
  for (const triangle of triangles) {
    const heightMeters = interpolateTriangleHeightMetersAtXzV2(
      triangle[0],
      triangle[1],
      triangle[2],
      pointMetersXZ,
    );
    if (isNil(heightMeters)) continue;
    return unitsToMeters(quantizeToUnits(heightMeters, quantumMeters), quantumMeters);
  }
  return undefined;
}

function sampleClosestSourceHeightMetersAtXzV2(
  source: CanonicalTraversalSurfaceTriangleSourceV1,
  pointMetersXZ: readonly [number, number],
  preferredHeightMeters: number,
  quantumMeters: number,
): number | undefined {
  const positions = source.worldPositionsMetersXYZ;
  const indices = source.triangleIndices;
  if (isNil(positions) || isNil(indices) || isEmpty(indices)) return undefined;
  let bestHeightMeters: number | undefined;
  let bestDeltaMeters = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const i0 = indices[offset]! * 3;
    const i1 = indices[offset + 1]! * 3;
    const i2 = indices[offset + 2]! * 3;
    const a: Vec3 = [positions[i0]!, positions[i0 + 1]!, positions[i0 + 2]!];
    const b: Vec3 = [positions[i1]!, positions[i1 + 1]!, positions[i1 + 2]!];
    const c: Vec3 = [positions[i2]!, positions[i2 + 1]!, positions[i2 + 2]!];
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (!(ny > 0)) continue;
    const heightMeters = interpolateTriangleHeightMetersAtXzV2(a, b, c, pointMetersXZ);
    if (isNil(heightMeters)) continue;
    const deltaMeters = Math.abs(heightMeters - preferredHeightMeters);
    if (deltaMeters < bestDeltaMeters) {
      bestDeltaMeters = deltaMeters;
      bestHeightMeters = heightMeters;
    }
  }
  if (isNil(bestHeightMeters)) return undefined;
  return unitsToMeters(quantizeToUnits(bestHeightMeters, quantumMeters), quantumMeters);
}

function correlateTaggedTraversalSurfaceV2(
  polygon: RecastAuditPolygonV1,
  centroidMetersXYZ: Vec3,
  candidateTraversalSurfaceIds: readonly string[],
  identitiesById: ReadonlyMap<string, TraversalSurfaceIdentityV1>,
  querySourcesById: ReadonlyMap<string, CanonicalTraversalSurfaceTriangleSourceV1>,
  envelope: TraversalCapabilityEnvelopeV1,
):
  | Readonly<{ mode: "resolved"; identity: TraversalSurfaceIdentityV1 }>
  | Readonly<{
      mode: "missing";
      relatedTraversalSurfaceIdentities: readonly TraversalSurfaceIdentityV1[];
    }>
  | Readonly<{
      mode: "ambiguous";
      relatedTraversalSurfaceIdentities: readonly TraversalSurfaceIdentityV1[];
    }>
{
  if (
    polygon.areaId < CANDIDATE_AREA_ID_MINIMUM ||
    polygon.areaId > CANDIDATE_AREA_ID_MAXIMUM
  ) {
    return { mode: "missing", relatedTraversalSurfaceIdentities: [] };
  }
  const ordinal = polygon.areaId - CANDIDATE_AREA_ID_MINIMUM;
  const taggedId = candidateTraversalSurfaceIds[ordinal];
  if (isNil(taggedId)) {
    return { mode: "missing", relatedTraversalSurfaceIdentities: [] };
  }
  const identity = identitiesById.get(taggedId);
  const source = querySourcesById.get(taggedId);
  if (isNil(identity) || isNil(source) || isEmpty(source.worldPositionsMetersXYZ)) {
    return {
      mode: "missing",
      relatedTraversalSurfaceIdentities: isNil(identity) ? [] : [identity],
    };
  }
  const pointMetersXZ: readonly [number, number] = [
    centroidMetersXYZ[0],
    centroidMetersXYZ[2],
  ];
  const detailHeightMeters = sampleQuantizedDetailHeightMetersAtXzV2(
    polygon.detailTrianglesMetersXYZ,
    pointMetersXZ,
    envelope.positionQuantizationMeters,
  );
  const recastHeightMeters = isNil(detailHeightMeters)
    ? centroidMetersXYZ[1]
    : detailHeightMeters;
  const sourceHeightMeters = sampleClosestSourceHeightMetersAtXzV2(
    source,
    pointMetersXZ,
    recastHeightMeters,
    envelope.positionQuantizationMeters,
  );
  const referenceHeightMeters = isNil(sourceHeightMeters)
    ? recastHeightMeters
    : sourceHeightMeters;
  const hits = queryCanonicalTraversalSurfaceHitsV1({
    sources: [source],
    pointMetersXZ,
    referenceHeightMeters,
    maximumReferenceHeightDifferenceMeters:
      graphNodeCorrelationHeightWindowMetersV2(envelope),
    normalAdmission: {
      mode: "upward-slope",
      minimumUpwardNormalYRatio: Math.cos(
        envelope.maxSlopeDegrees * Math.PI / 180,
      ),
    },
  });
  if (hits.mode === "missing") {
    return { mode: "missing", relatedTraversalSurfaceIdentities: [identity] };
  }
  if (hits.mode === "ambiguous") {
    const related = sortIdentitiesBySurfaceId(
      hits.hits.flatMap((hit) => {
        const row = identitiesById.get(hit.traversalSurfaceId);
        return isNil(row) ? [] : [row];
      }),
    );
    if (related.length < 2) {
      fail("tagged-source correlation produced an ambiguous hit with fewer than two identities.");
    }
    return {
      mode: "ambiguous",
      relatedTraversalSurfaceIdentities: related,
    };
  }
  if (hits.hit.traversalSurfaceId !== taggedId) {
    return { mode: "missing", relatedTraversalSurfaceIdentities: [identity] };
  }
  return { mode: "resolved", identity };
}


function sampleResolvedHeightMetersV2(
  source: CanonicalTraversalSurfaceTriangleSourceV1,
  pointMetersXZ: readonly [number, number],
  envelope: TraversalCapabilityEnvelopeV1,
  referenceHeightMeters: number,
): number | undefined {
  const hits = queryCanonicalTraversalSurfaceHitsV1({
    sources: [source],
    pointMetersXZ,
    referenceHeightMeters: referenceHeightMeters,
    maximumReferenceHeightDifferenceMeters:
      envelope.maxStepHeightMeters +
      envelope.voxelCellHeightMeters +
      envelope.capsuleHeightMeters,
    normalAdmission: {
      mode: "upward-slope",
      minimumUpwardNormalYRatio: Math.cos(
        envelope.maxSlopeDegrees * Math.PI / 180,
      ),
    },
  });
  if (hits.mode !== "resolved") return undefined;
  return hits.hit.heightMeters;
}

function closestPointOnSegmentXzV2(
  point: Vec2,
  start: Vec2,
  end: Vec2,
): Vec2 {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  const rawT = lengthSquared === 0
    ? 0
    : ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) /
      lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  return [start[0] + t * dx, start[1] + t * dz];
}

function collectUpwardSourceEdgesV2(
  source: CanonicalTraversalSurfaceTriangleSourceV1,
): readonly (readonly [Vec2, Vec2])[] {
  const edges: Array<readonly [Vec2, Vec2]> = [];
  for (let offset = 0; offset + 2 < source.triangleIndices.length; offset += 3) {
    const indices = [
      source.triangleIndices[offset]!,
      source.triangleIndices[offset + 1]!,
      source.triangleIndices[offset + 2]!,
    ];
    const vertices = indices.map((index) => [
      source.worldPositionsMetersXYZ[index * 3]!,
      source.worldPositionsMetersXYZ[index * 3 + 1]!,
      source.worldPositionsMetersXYZ[index * 3 + 2]!,
    ] as const);
    const a = vertices[0]!;
    const b = vertices[1]!;
    const c = vertices[2]!;
    const normalY =
      (b[2] - a[2]) * (c[0] - a[0]) -
      (b[0] - a[0]) * (c[2] - a[2]);
    if (!(normalY > 0)) continue;
    const points = vertices.map((vertex) => [vertex[0], vertex[2]] as const);
    for (let edge = 0; edge < 3; edge += 1) {
      edges.push([points[edge]!, points[(edge + 1) % 3]!]);
    }
  }
  return edges;
}

function closestSegmentPairCandidatesV2(
  left: readonly [Vec2, Vec2],
  right: readonly [Vec2, Vec2],
  portalPointMetersXZ: Vec2,
): readonly Readonly<{ leftPoint: Vec2; rightPoint: Vec2 }>[] {
  return [
    {
      leftPoint: closestPointOnSegmentXzV2(portalPointMetersXZ, ...left),
      rightPoint: closestPointOnSegmentXzV2(portalPointMetersXZ, ...right),
    },
    { leftPoint: left[0], rightPoint: closestPointOnSegmentXzV2(left[0], ...right) },
    { leftPoint: left[1], rightPoint: closestPointOnSegmentXzV2(left[1], ...right) },
    { leftPoint: closestPointOnSegmentXzV2(right[0], ...left), rightPoint: right[0] },
    { leftPoint: closestPointOnSegmentXzV2(right[1], ...left), rightPoint: right[1] },
  ];
}

function nearestLocalSourcePairV2(
  leftSource: CanonicalTraversalSurfaceTriangleSourceV1,
  rightSource: CanonicalTraversalSurfaceTriangleSourceV1,
  portalPointMetersXZ: Vec2,
  maximumLocalDistanceMeters: number,
): Readonly<{ leftPoint: Vec2; rightPoint: Vec2; gapMeters: number }> | undefined {
  let best:
    | Readonly<{
        leftPoint: Vec2;
        rightPoint: Vec2;
        gapMeters: number;
        portalDistanceMeters: number;
      }>
    | undefined;
  for (const left of collectUpwardSourceEdgesV2(leftSource)) {
    for (const right of collectUpwardSourceEdgesV2(rightSource)) {
      for (const candidate of closestSegmentPairCandidatesV2(
        left,
        right,
        portalPointMetersXZ,
      )) {
        const midpoint: Vec2 = [
          (candidate.leftPoint[0] + candidate.rightPoint[0]) / 2,
          (candidate.leftPoint[1] + candidate.rightPoint[1]) / 2,
        ];
        const portalDistanceMeters = Math.hypot(
          midpoint[0] - portalPointMetersXZ[0],
          midpoint[1] - portalPointMetersXZ[1],
        );
        if (portalDistanceMeters > maximumLocalDistanceMeters) continue;
        const gapMeters = Math.hypot(
          candidate.leftPoint[0] - candidate.rightPoint[0],
          candidate.leftPoint[1] - candidate.rightPoint[1],
        );
        if (
          isNil(best) ||
          gapMeters < best.gapMeters ||
          (gapMeters === best.gapMeters &&
            portalDistanceMeters < best.portalDistanceMeters)
        ) {
          best = { ...candidate, gapMeters, portalDistanceMeters };
        }
      }
    }
  }
  return best;
}

function retypeProjectedEdgeAsStepV2(
  projected: ProjectedEdgeCandidateV1,
  stepHeightMeters: number,
  envelope: TraversalCapabilityEnvelopeV1,
): ProjectedEdgeCandidateV1 {
  const cost = projected.edge.distanceMeters / envelope.maximumEdgeLengthMeters +
    (envelope.maxSlopeDegrees === 0
      ? 0
      : envelope.slopeCostWeight * projected.edge.slopeDegrees / envelope.maxSlopeDegrees) +
    (envelope.maxStepHeightMeters === 0
      ? 0
      : envelope.stepCostWeight * stepHeightMeters / envelope.maxStepHeightMeters);
  return {
    edge: {
      ...projected.edge,
      type: "step",
      stepHeightMeters,
      routePathCost: ceilingToQuantum(cost, COST_QUANTUM_RATIO),
    },
    portalEvidenceKey: projected.portalEvidenceKey,
    portal: projected.portal,
  };
}

function refineCanonicalSeamEdgeV2(
  projected: ProjectedEdgeCandidateV1,
  source: QuantizedPolygonV1,
  target: QuantizedPolygonV1,
  querySourcesById: ReadonlyMap<string, CanonicalTraversalSurfaceTriangleSourceV1>,
  envelope: TraversalCapabilityEnvelopeV1,
): ProjectedEdgeCandidateV1 | undefined {
  const sourceSurfaceId = source.node.traversalSurfaceId;
  const targetSurfaceId = target.node.traversalSurfaceId;
  if (sourceSurfaceId === targetSurfaceId) return projected;
  const sourceSource = querySourcesById.get(sourceSurfaceId);
  const targetSource = querySourcesById.get(targetSurfaceId);
  if (isNil(sourceSource) || isNil(targetSource)) return undefined;
  const portalMinimumMeters = pointUnitsToMeters(
    projected.portal.minimumUnitsXYZ,
    envelope.positionQuantizationMeters,
  );
  const portalMaximumMeters = pointUnitsToMeters(
    projected.portal.maximumUnitsXYZ,
    envelope.positionQuantizationMeters,
  );
  const samplesMetersXZ = [
    [portalMinimumMeters[0], portalMinimumMeters[2]],
    [
      (portalMinimumMeters[0] + portalMaximumMeters[0]) / 2,
      (portalMinimumMeters[2] + portalMaximumMeters[2]) / 2,
    ],
    [portalMaximumMeters[0], portalMaximumMeters[2]],
  ] as const;
  let stepHeightMeters = 0;
  for (const pointMetersXZ of samplesMetersXZ) {
    const pair = nearestLocalSourcePairV2(
      sourceSource,
      targetSource,
      pointMetersXZ,
      envelope.voxelCellSizeMeters * 2 + envelope.positionQuantizationMeters,
    );
    if (isNil(pair) || pair.gapMeters > envelope.positionQuantizationMeters) {
      return undefined;
    }
    const sourceHeight = sampleResolvedHeightMetersV2(
      sourceSource,
      pair.leftPoint,
      envelope,
      source.node.positionMetersXYZ[1],
    );
    const targetHeight = sampleResolvedHeightMetersV2(
      targetSource,
      pair.rightPoint,
      envelope,
      target.node.positionMetersXYZ[1],
    );
    if (isNil(sourceHeight) || isNil(targetHeight)) return undefined;
    stepHeightMeters = Math.max(
      stepHeightMeters,
      Math.abs(sourceHeight - targetHeight),
    );
  }
  if (stepHeightMeters > envelope.maxStepHeightMeters) return undefined;
  if (stepHeightMeters > envelope.positionQuantizationMeters) {
    return retypeProjectedEdgeAsStepV2(projected, stepHeightMeters, envelope);
  }
  return projected;
}


export function buildTraversalGraphFromSnapshotV2(
  snapshot: RecastNavMeshAuditSnapshotV1,
  rawReceipt: RouteBuildInputReceiptV2,
): TraversalGraphProjectionV2 {
  const receipt = assertRouteBuildInputReceiptV2(rawReceipt);
  if (
    receipt.input.terrainSource.kind !== "bounded" &&
    isEmpty(receipt.input.staticColliders)
  ) {
    fail("a bounded Heightfield source is required for Graph projection.");
  }
  if (
    snapshot.kind !== "recast-navmesh-audit-snapshot" ||
    snapshot.schemaVersion !== 1 ||
    !Number.isSafeInteger(snapshot.nullLinkIndex)
  ) fail("audit snapshot header is invalid.");
  if (receipt.budgetEvidence.kind !== "route-geometry-tile-estimate") {
    fail("bounded source requires Tile budget evidence.");
  }
  if (snapshot.tiles.length > receipt.budgetEvidence.estimatedTiles) {
    fail("observed non-null Tile count exceeds the admitted estimate.");
  }

  const envelope = receipt.input.capabilityEnvelope;
  const mappedSource = mapRouteBuildInputToRecastSourceV2(receipt.input);
  const candidateTraversalSurfaceIds = mappedSource.candidateTraversalSurfaceIds ?? [];
  const identitiesById = new Map(
    receipt.input.traversalSurfaces.map((surface) => [
      surface.traversalSurfaceId,
      surface,
    ] as const),
  );
  const querySourcesById = new Map(
    collectBoundTraversalSurfaceQuerySourcesV2(receipt.input).map((source) => [
      source.traversalSurfaceId,
      source,
    ] as const),
  );
  const config = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(envelope);
  const voxelCellSizeMicrometers = quantizeTraversalMetersToMicrometersV1(
    envelope.voxelCellSizeMeters,
  );
  const voxelCellHeightMicrometers = quantizeTraversalMetersToMicrometersV1(
    envelope.voxelCellHeightMeters,
  );
  const clearanceWidthMeters = floorMicrometerValueToQuantum(
    2 * config.walkableRadius * voxelCellSizeMicrometers,
    envelope.positionQuantizationMeters,
  );
  const clearanceHeightMeters = floorMicrometerValueToQuantum(
    config.walkableHeight * voxelCellHeightMicrometers,
    envelope.positionQuantizationMeters,
  );
  if (!(clearanceWidthMeters > 0) || !(clearanceHeightMeters > 0)) {
    fail("conservative clearance lower bounds must be positive.");
  }
  const ribbon = createHardRibbonProofV1({
    pointsMetersXZ: receipt.input.hardRibbon.pointsMetersXZ,
    widthMeters: receipt.input.hardRibbon.widthMeters,
  });

  const providerRefs = new Set<number>();
  const omittedRefs = new Set<number>();
  const tileIds = new Set<string>();
  const candidates: QuantizedPolygonV1[] = [];
  for (const tile of snapshot.tiles) {
    for (const field of [tile.tileX, tile.tileZ, tile.tileLayer, tile.maximumLinkCount]) {
      requireSafeInteger(field, "Tile integer field");
    }
    if (tile.maximumLinkCount < 0 || tile.links.length > tile.maximumLinkCount) {
      fail("Tile Link table exceeds maxLinkCount.");
    }
    if (tile.offMeshConnectionCount !== 0) {
      fail("off-mesh connections are forbidden in Heightfield R1.");
    }
    const canonicalTileId = tileId(tile);
    if (tileIds.has(canonicalTileId)) fail("duplicate canonical Tile identity.");
    tileIds.add(canonicalTileId);
    for (const polygon of tile.polygons) {
      if (
        !Number.isSafeInteger(polygon.providerPolygonRef) ||
        !(polygon.providerPolygonRef > 0) ||
        polygon.providerPolygonRef > RECAST_QUERY_PROVIDER_CONSTANTS_V1.maximumProviderPolygonRef
      ) fail("provider polygon Ref must be a positive unsigned 32-bit integer.");
      if (providerRefs.has(polygon.providerPolygonRef)) fail("duplicate provider polygon Ref.");
      providerRefs.add(polygon.providerPolygonRef);
      if (
        polygon.providerType !== GROUND_POLYGON_TYPE ||
        polygon.flags !== TERRAIN_FLAG ||
        polygon.areaId < CANDIDATE_AREA_ID_MINIMUM ||
        polygon.areaId > CANDIDATE_AREA_ID_MAXIMUM
      ) continue;
      const fallbackIdentity = receipt.input.traversalSurfaces[0];
      if (isNil(fallbackIdentity)) {
        fail("Route Build Input V2 must retain at least one Traversal Surface.");
      }
      const projectedProbe = projectPolygon(
        tile,
        polygon,
        fallbackIdentity,
        envelope,
        clearanceWidthMeters,
        clearanceHeightMeters,
      );
      const centroid = projectedProbe.node.positionMetersXYZ;
      if (!isPointInsideHardRibbonV1(ribbon, [centroid[0], centroid[2]])) {
        omittedRefs.add(polygon.providerPolygonRef);
        continue;
      }
      const correlation = correlateTaggedTraversalSurfaceV2(
        polygon,
        centroid,
        candidateTraversalSurfaceIds,
        identitiesById,
        querySourcesById,
        envelope,
      );
      if (correlation.mode === "missing" || correlation.mode === "ambiguous") {
        return deepFreeze({
          status: "incomplete",
          reason: correlation.mode === "missing"
            ? "surface-correlation-missing"
            : "surface-correlation-ambiguous",
          relatedTraversalSurfaceIdentities: correlation.relatedTraversalSurfaceIdentities,
          failurePositionMetersXYZ: centroid,
        });
      }
      candidates.push(projectPolygon(
        tile,
        polygon,
        correlation.identity,
        envelope,
        clearanceWidthMeters,
        clearanceHeightMeters,
      ));
    }
  }
  candidates.sort((left, right) => compareCanonical(left.node.id, right.node.id));
  if (candidates.length === 0) {
    return deepFreeze({ status: "unavailable", reason: "no-queryable-ground-surface" });
  }
  const nodeCapacity = classifyGraphProjectionCapacityV1({
    nodeCount: candidates.length,
    edgeCount: 0,
    maximumNodes: envelope.maximumNodes,
    maximumEdges: envelope.maximumEdges,
  });
  if (!isNil(nodeCapacity)) return nodeCapacity as TraversalGraphProjectionV2;

  const byProviderRef = new Map<number, QuantizedPolygonV1>();
  const byNodeId = new Map<string, QuantizedPolygonV1>();
  for (const candidate of candidates) {
    if (byNodeId.has(candidate.node.id)) fail("canonical Node ID collision.");
    byProviderRef.set(candidate.providerPolygonRef, candidate);
    byNodeId.set(candidate.node.id, candidate);
  }
  const edgeCandidates = new Map<string, ProjectedEdgeCandidateV1>();
  for (const source of candidates) {
    const linksByIndex = new Map(
      source.tile.links.map((link) => [link.providerLinkIndex, link]),
    );
    const visited = new Set<number>();
    let linkIndex = source.polygon.firstLinkIndex;
    while (linkIndex !== snapshot.nullLinkIndex) {
      if (visited.has(linkIndex)) fail("Link cycle detected.");
      visited.add(linkIndex);
      if (visited.size > source.tile.maximumLinkCount) {
        fail("Link chain exceeds maxLinkCount.");
      }
      const link = linksByIndex.get(linkIndex);
      if (isNil(link)) fail("Link index is out of range.");
      if (link.targetProviderPolygonRef !== 0) {
        const target = byProviderRef.get(link.targetProviderPolygonRef);
        if (isNil(target)) {
          if (!omittedRefs.has(link.targetProviderPolygonRef)) {
            fail("Link has an unresolved non-zero target Ref.");
          }
        } else {
          const recastEdge = buildEdge(
            source,
            target,
            link,
            receipt.input,
            clearanceWidthMeters,
            clearanceHeightMeters,
          );
          const projectedEdge = isNil(recastEdge)
            ? undefined
            : refineCanonicalSeamEdgeV2(
                recastEdge,
                source,
                target,
                querySourcesById,
                envelope,
              );
          if (!isNil(projectedEdge)) {
            const existing = edgeCandidates.get(projectedEdge.edge.id);
            if (
              !isNil(existing) &&
              (
                JSON.stringify(existing.edge) !== JSON.stringify(projectedEdge.edge) ||
                existing.portalEvidenceKey !== projectedEdge.portalEvidenceKey
              )
            ) {
              fail("ordered polygon pair produced conflicting Edge evidence.");
            }
            edgeCandidates.set(projectedEdge.edge.id, projectedEdge);
          }
        }
      }
      linkIndex = link.nextLinkIndex;
    }
  }
  const edges = [...edgeCandidates.values()].map(({ edge }) => edge).sort((left, right) =>
    compareCanonical(left.id, right.id));
  const edgeCapacity = classifyGraphProjectionCapacityV1({
    nodeCount: candidates.length,
    edgeCount: edges.length,
    maximumNodes: envelope.maximumNodes,
    maximumEdges: envelope.maximumEdges,
  });
  if (!isNil(edgeCapacity)) return edgeCapacity as TraversalGraphProjectionV2;

  const traversalNodesById = Object.fromEntries(
    candidates.map((candidate) => [candidate.node.id, candidate.node]),
  );
  const traversalEdgesById = Object.fromEntries(
    edges.map((edge) => [edge.id, edge]),
  );
  const traversalSurfaceIdentitiesById = Object.fromEntries(
    receipt.input.traversalSurfaces.map((surface) => [
      surface.traversalSurfaceId,
      surface,
    ]),
  );
  const graph = canonicalTraversalGraphV2({
    kind: "traversal-graph",
    schemaVersion: 2,
    authoringSpecHash: receipt.input.authoringSpecHash,
    layoutSolveReportHash: receipt.input.layoutSolveReportHash,
    resourceLockHash: receipt.input.resourceLockHash,
    terrainArtifactHash: receipt.input.terrainArtifactHash,
    colliderArtifactHash: receipt.input.colliderArtifactHash,
    geometryArtifactHash: receipt.input.geometryArtifactHash,
    surfaceArtifactHash: receipt.input.surfaceArtifactHash,
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: envelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: envelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: envelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: envelope.graphBuilderProfileHash,
    routeId: receipt.input.connectivityRequirement.routeId,
    startAnchorEntityId: receipt.input.connectivityRequirement.startAnchorEntityId,
    destinationAnchorEntityId: receipt.input.connectivityRequirement.destinationAnchorEntityId,
    traversalSurfaceIdentitiesById,
    traversalNodesById,
    traversalEdgesById,
  });
  return deepFreeze({
    status: "complete",
    traversalGraph: graph,
    traversalNodeIdByProviderPolygonRef: new Map(
      candidates.map((candidate) => [candidate.providerPolygonRef, candidate.node.id]),
    ),
    providerPolygonRefByTraversalNodeId: new Map(
      candidates.map((candidate) => [candidate.node.id, candidate.providerPolygonRef]),
    ),
  });
}

export function buildTraversalGraphV2(
  navMesh: NavMesh,
  receipt: RouteBuildInputReceiptV2,
): TraversalGraphProjectionV2 {
  return buildTraversalGraphFromSnapshotV2(
    snapshotRecastNavMeshV1(navMesh),
    receipt,
  );
}
