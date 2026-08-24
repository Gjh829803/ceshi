import { isEmpty, isNil } from "lodash-es";

import {
  aabbOverlapsInclusiveXZV1,
  classifyProjectedTriangleOverlapV1,
  classifyTriangleXZLocationV1,
  describeWorldTriangleV1,
  firstCoordinateOrderedPointXZV1,
  minimumAbsoluteAffineHeightSeparationMetersV1,
  samplePointOnWorldTriangleV1,
  TriangleWorldGeometryNonFiniteErrorV1,
  type WorldTriangleGeometryV1,
} from "./triangle-world-geometry.js";

export {
  TRAVERSAL_SURFACE_QUERY_AREA_EPSILON_SQUARE_METERS_V1,
  TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1,
  TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1,
} from "./triangle-world-geometry.js";

export interface CanonicalTraversalSurfaceTriangleSourceV1 {
  readonly traversalSurfaceId: string;
  readonly worldPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
}

export type TraversalSurfaceNormalAdmissionV1 =
  | Readonly<{
      mode: "upward-slope";
      minimumUpwardNormalYRatio: number;
    }>
  | Readonly<{
      mode: "retained-support";
      minimumUpwardNormalYRatio: number;
      referenceNormalXYZ: readonly [number, number, number];
      minimumReferenceNormalDotRatio: number;
    }>;

export interface QueryCanonicalTraversalSurfaceHitsInputV1 {
  readonly sources: readonly CanonicalTraversalSurfaceTriangleSourceV1[];
  readonly pointMetersXZ: readonly [number, number];
  readonly referenceHeightMeters: number;
  readonly maximumReferenceHeightDifferenceMeters: number;
  readonly normalAdmission: TraversalSurfaceNormalAdmissionV1;
}

export interface CanonicalTraversalSurfaceHitV1 {
  readonly traversalSurfaceId: string;
  readonly location: "interior" | "boundary-only";
  readonly heightMeters: number;
  readonly normalXYZ: readonly [number, number, number];
}

export type CanonicalTraversalSurfaceHitResolutionV1 =
  | Readonly<{ mode: "missing"; hits: readonly [] }>
  | Readonly<{
      mode: "resolved";
      hit: CanonicalTraversalSurfaceHitV1;
      hits: readonly CanonicalTraversalSurfaceHitV1[];
    }>
  | Readonly<{
      mode: "ambiguous";
      hits: readonly CanonicalTraversalSurfaceHitV1[];
    }>;

export interface PreflightCanonicalTraversalSurfaceOverlapsInputV1 {
  readonly sources: readonly CanonicalTraversalSurfaceTriangleSourceV1[];
  readonly minimumUpwardNormalYRatio: number;
  readonly maximumSameBandHeightDifferenceMeters: number;
  readonly maximumEquivalentPlaneHeightDifferenceMeters: number;
  readonly minimumEquivalentPlaneNormalDotRatio: number;
  readonly maximumTraversalSurfaceTrianglePairTestCount: number;
}

export interface CanonicalTraversalSurfaceOverlapBlockerV1 {
  readonly firstTraversalSurfaceId: string;
  readonly secondTraversalSurfaceId: string;
  readonly witnessPointMetersXZ: readonly [number, number];
  readonly minimumHeightDifferenceMeters: number;
}

export type PreflightCanonicalTraversalSurfaceOverlapsResultV1 =
  | Readonly<{ mode: "clear" }>
  | Readonly<{
      mode: "blocked";
      blocker: CanonicalTraversalSurfaceOverlapBlockerV1;
    }>
  | Readonly<{
      mode: "budget-exceeded";
      reason: "traversal-surface-triangle-pair-test-budget-exceeded";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>;

const SOURCE_KEYS = [
  "traversalSurfaceId",
  "worldPositionsMetersXYZ",
  "triangleIndices",
] as const;
const QUERY_KEYS = [
  "sources",
  "pointMetersXZ",
  "referenceHeightMeters",
  "maximumReferenceHeightDifferenceMeters",
  "normalAdmission",
] as const;
const PREFLIGHT_KEYS = [
  "sources",
  "minimumUpwardNormalYRatio",
  "maximumSameBandHeightDifferenceMeters",
  "maximumEquivalentPlaneHeightDifferenceMeters",
  "minimumEquivalentPlaneNormalDotRatio",
  "maximumTraversalSurfaceTrianglePairTestCount",
] as const;
const UPWARD_SLOPE_KEYS = ["mode", "minimumUpwardNormalYRatio"] as const;
const RETAINED_SUPPORT_KEYS = [
  "mode",
  "minimumUpwardNormalYRatio",
  "referenceNormalXYZ",
  "minimumReferenceNormalDotRatio",
] as const;

interface IndexedTriangleV1 {
  readonly traversalSurfaceId: string;
  readonly ordinal: number;
  readonly geometry: WorldTriangleGeometryV1;
}

interface IndexedSourceV1 {
  readonly traversalSurfaceId: string;
  readonly triangles: readonly IndexedTriangleV1[];
  readonly broadphase: TriangleXzBroadphaseIndexV1;
}

interface SurfaceHitCandidateV1 {
  readonly traversalSurfaceId: string;
  readonly location: "interior" | "boundary-only";
  readonly heightMeters: number;
  readonly normalXYZ: readonly [number, number, number];
  readonly heightDeltaMeters: number;
  readonly retainedNormalDot: number;
  readonly ordinal: number;
}

function failQuery(message: string): never {
  throw new Error(`TRAVERSAL_SURFACE_QUERY_INPUT_INVALID: ${message}`);
}

function withFiniteGeometryErrors<T>(operation: () => T): T {
  try {
    return operation();
  } catch (cause) {
    if (cause instanceof TriangleWorldGeometryNonFiniteErrorV1) {
      failQuery(cause.message);
    }
    throw cause;
  }
}

function requirePlainObject(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (typeof value !== "object" || isNil(value) || Array.isArray(value)) {
    failQuery(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: object,
  expectedKeys: readonly string[],
  path: string,
): void {
  const actualKeys = Object.keys(value).sort();
  const canonicalExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== canonicalExpectedKeys.length ||
    actualKeys.some((key, index) => key !== canonicalExpectedKeys[index])
  ) {
    failQuery(`${path} must contain only ${canonicalExpectedKeys.join(", ")}.`);
  }
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failQuery(`${path} must be a finite number.`);
  }
  return value;
}

function requireNonNegativeFinite(value: unknown, path: string): number {
  const numberValue = requireFiniteNumber(value, path);
  if (numberValue < 0) {
    failQuery(`${path} must be >= 0.`);
  }
  return numberValue;
}

function requireClosedUnitRatio(value: unknown, path: string): number {
  const numberValue = requireFiniteNumber(value, path);
  if (numberValue < 0 || numberValue > 1) {
    failQuery(`${path} must be in [0, 1].`);
  }
  return numberValue;
}

function requireOpenClosedUnitRatio(value: unknown, path: string): number {
  const numberValue = requireFiniteNumber(value, path);
  if (!(numberValue > 0) || numberValue > 1) {
    failQuery(`${path} must be in (0, 1].`);
  }
  return numberValue;
}

function requireFiniteVec2(
  value: unknown,
  path: string,
): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    failQuery(`${path} must be a 2-tuple.`);
  }
  return [
    requireFiniteNumber(value[0], `${path}[0]`),
    requireFiniteNumber(value[1], `${path}[1]`),
  ];
}

function requireFiniteVec3(
  value: unknown,
  path: string,
): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    failQuery(`${path} must be a 3-tuple.`);
  }
  return [
    requireFiniteNumber(value[0], `${path}[0]`),
    requireFiniteNumber(value[1], `${path}[1]`),
    requireFiniteNumber(value[2], `${path}[2]`),
  ];
}

function requirePairTestBudget(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > Number.MAX_SAFE_INTEGER - 1
  ) {
    failQuery(
      `${path} must be a positive safe integer <= Number.MAX_SAFE_INTEGER - 1.`,
    );
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || isNil(value) || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function triangleGeometry(
  worldPositionsMetersXYZ: readonly number[],
  firstIndex: number,
  secondIndex: number,
  thirdIndex: number,
): WorldTriangleGeometryV1 | undefined {
  return describeWorldTriangleV1(
    [
      worldPositionsMetersXYZ[firstIndex * 3]!,
      worldPositionsMetersXYZ[firstIndex * 3 + 1]!,
      worldPositionsMetersXYZ[firstIndex * 3 + 2]!,
    ],
    [
      worldPositionsMetersXYZ[secondIndex * 3]!,
      worldPositionsMetersXYZ[secondIndex * 3 + 1]!,
      worldPositionsMetersXYZ[secondIndex * 3 + 2]!,
    ],
    [
      worldPositionsMetersXYZ[thirdIndex * 3]!,
      worldPositionsMetersXYZ[thirdIndex * 3 + 1]!,
      worldPositionsMetersXYZ[thirdIndex * 3 + 2]!,
    ],
  );
}

function parseSources(
  value: unknown,
  path: string,
): readonly CanonicalTraversalSurfaceTriangleSourceV1[] {
  if (!Array.isArray(value)) {
    failQuery(`${path} must be an array.`);
  }
  const seenIds = new Set<string>();
  const sources: CanonicalTraversalSurfaceTriangleSourceV1[] = [];
  value.forEach((entry, index) => {
    const sourcePath = `${path}[${index}]`;
    const record = requirePlainObject(entry, sourcePath);
    requireExactKeys(record, SOURCE_KEYS, sourcePath);
    const traversalSurfaceId = record.traversalSurfaceId;
    if (typeof traversalSurfaceId !== "string" || isEmpty(traversalSurfaceId)) {
      failQuery(`${sourcePath}.traversalSurfaceId must be a non-empty string.`);
    }
    if (seenIds.has(traversalSurfaceId)) {
      failQuery(`duplicate traversalSurfaceId ${traversalSurfaceId}.`);
    }
    seenIds.add(traversalSurfaceId);
    if (
      !Array.isArray(record.worldPositionsMetersXYZ) ||
      record.worldPositionsMetersXYZ.length % 3 !== 0
    ) {
      failQuery(
        `${sourcePath}.worldPositionsMetersXYZ must contain finite XYZ triples.`,
      );
    }
    const worldPositionsMetersXYZ = record.worldPositionsMetersXYZ.map(
      (component, componentIndex) =>
        requireFiniteNumber(
          component,
          `${sourcePath}.worldPositionsMetersXYZ[${componentIndex}]`,
        ),
    );
    if (
      !Array.isArray(record.triangleIndices) ||
      record.triangleIndices.length % 3 !== 0
    ) {
      failQuery(`${sourcePath}.triangleIndices must contain integer triples.`);
    }
    const vertexCount = worldPositionsMetersXYZ.length / 3;
    const triangleIndices = record.triangleIndices.map(
      (indexValue, indexOffset) => {
        if (
          typeof indexValue !== "number" ||
          !Number.isInteger(indexValue) ||
          indexValue < 0 ||
          indexValue >= vertexCount
        ) {
          failQuery(
            `${sourcePath}.triangleIndices[${indexOffset}] is out of range.`,
          );
        }
        return indexValue;
      },
    );
    for (
      let triangleOffset = 0;
      triangleOffset < triangleIndices.length;
      triangleOffset += 3
    ) {
      const geometry = triangleGeometry(
        worldPositionsMetersXYZ,
        triangleIndices[triangleOffset]!,
        triangleIndices[triangleOffset + 1]!,
        triangleIndices[triangleOffset + 2]!,
      );
      if (isNil(geometry)) {
        failQuery(
          `${sourcePath} triangle ${triangleOffset / 3} is 3D zero-area.`,
        );
      }
    }
    sources.push({
      traversalSurfaceId,
      worldPositionsMetersXYZ,
      triangleIndices,
    });
  });
  return sources;
}

function parseNormalAdmission(
  value: unknown,
): TraversalSurfaceNormalAdmissionV1 {
  const record = requirePlainObject(value, "normalAdmission");
  if (record.mode === "upward-slope") {
    requireExactKeys(record, UPWARD_SLOPE_KEYS, "normalAdmission");
    return {
      mode: "upward-slope",
      minimumUpwardNormalYRatio: requireClosedUnitRatio(
        record.minimumUpwardNormalYRatio,
        "normalAdmission.minimumUpwardNormalYRatio",
      ),
    };
  }
  if (record.mode === "retained-support") {
    requireExactKeys(record, RETAINED_SUPPORT_KEYS, "normalAdmission");
    const referenceNormalXYZ = requireFiniteVec3(
      record.referenceNormalXYZ,
      "normalAdmission.referenceNormalXYZ",
    );
    const referenceNormalLength = Math.hypot(...referenceNormalXYZ);
    if (
      !Number.isFinite(referenceNormalLength) ||
      !(referenceNormalLength > 0)
    ) {
      failQuery(
        "normalAdmission.referenceNormalXYZ must have a finite non-zero length.",
      );
    }
    return {
      mode: "retained-support",
      minimumUpwardNormalYRatio: requireClosedUnitRatio(
        record.minimumUpwardNormalYRatio,
        "normalAdmission.minimumUpwardNormalYRatio",
      ),
      referenceNormalXYZ,
      minimumReferenceNormalDotRatio: requireClosedUnitRatio(
        record.minimumReferenceNormalDotRatio,
        "normalAdmission.minimumReferenceNormalDotRatio",
      ),
    };
  }
  failQuery("normalAdmission.mode is not a closed enum value.");
}

function parseQueryInput(
  value: unknown,
): QueryCanonicalTraversalSurfaceHitsInputV1 {
  const record = requirePlainObject(value, "query");
  requireExactKeys(record, QUERY_KEYS, "query");
  return {
    sources: parseSources(record.sources, "query.sources"),
    pointMetersXZ: requireFiniteVec2(record.pointMetersXZ, "query.pointMetersXZ"),
    referenceHeightMeters: requireFiniteNumber(
      record.referenceHeightMeters,
      "query.referenceHeightMeters",
    ),
    maximumReferenceHeightDifferenceMeters: requireNonNegativeFinite(
      record.maximumReferenceHeightDifferenceMeters,
      "query.maximumReferenceHeightDifferenceMeters",
    ),
    normalAdmission: parseNormalAdmission(record.normalAdmission),
  };
}

function parsePreflightInput(
  value: unknown,
): PreflightCanonicalTraversalSurfaceOverlapsInputV1 {
  const record = requirePlainObject(value, "preflight");
  requireExactKeys(record, PREFLIGHT_KEYS, "preflight");
  return {
    sources: parseSources(record.sources, "preflight.sources"),
    minimumUpwardNormalYRatio: requireClosedUnitRatio(
      record.minimumUpwardNormalYRatio,
      "preflight.minimumUpwardNormalYRatio",
    ),
    maximumSameBandHeightDifferenceMeters: requireNonNegativeFinite(
      record.maximumSameBandHeightDifferenceMeters,
      "preflight.maximumSameBandHeightDifferenceMeters",
    ),
    maximumEquivalentPlaneHeightDifferenceMeters: requireNonNegativeFinite(
      record.maximumEquivalentPlaneHeightDifferenceMeters,
      "preflight.maximumEquivalentPlaneHeightDifferenceMeters",
    ),
    minimumEquivalentPlaneNormalDotRatio: requireOpenClosedUnitRatio(
      record.minimumEquivalentPlaneNormalDotRatio,
      "preflight.minimumEquivalentPlaneNormalDotRatio",
    ),
    maximumTraversalSurfaceTrianglePairTestCount: requirePairTestBudget(
      record.maximumTraversalSurfaceTrianglePairTestCount,
      "preflight.maximumTraversalSurfaceTrianglePairTestCount",
    ),
  };
}

function indexSourceTriangles(
  source: CanonicalTraversalSurfaceTriangleSourceV1,
): readonly IndexedTriangleV1[] {
  const triangles: IndexedTriangleV1[] = [];
  for (
    let triangleOffset = 0;
    triangleOffset < source.triangleIndices.length;
    triangleOffset += 3
  ) {
    const geometry = triangleGeometry(
      source.worldPositionsMetersXYZ,
      source.triangleIndices[triangleOffset]!,
      source.triangleIndices[triangleOffset + 1]!,
      source.triangleIndices[triangleOffset + 2]!,
    );
    if (isNil(geometry)) {
      failQuery(
        `source ${source.traversalSurfaceId} triangle ${triangleOffset / 3} is 3D zero-area.`,
      );
    }
    triangles.push({
      traversalSurfaceId: source.traversalSurfaceId,
      ordinal: triangleOffset / 3,
      geometry,
    });
  }
  return triangles;
}

function normalizeReferenceNormal(
  normalXYZ: readonly [number, number, number],
): readonly [number, number, number] {
  const length = Math.hypot(...normalXYZ);
  return [normalXYZ[0] / length, normalXYZ[1] / length, normalXYZ[2] / length];
}

function admitsNormal(
  unitNormalXYZ: readonly [number, number, number],
  admission: TraversalSurfaceNormalAdmissionV1,
): { readonly admitted: boolean; readonly retainedNormalDot: number } {
  if (unitNormalXYZ[1] < admission.minimumUpwardNormalYRatio) {
    return { admitted: false, retainedNormalDot: Number.NEGATIVE_INFINITY };
  }
  if (admission.mode === "upward-slope") {
    return { admitted: true, retainedNormalDot: Number.NEGATIVE_INFINITY };
  }
  const referenceNormalXYZ = normalizeReferenceNormal(admission.referenceNormalXYZ);
  const retainedNormalDot =
    unitNormalXYZ[0] * referenceNormalXYZ[0] +
    unitNormalXYZ[1] * referenceNormalXYZ[1] +
    unitNormalXYZ[2] * referenceNormalXYZ[2];
  return {
    admitted: retainedNormalDot >= admission.minimumReferenceNormalDotRatio,
    retainedNormalDot,
  };
}

function compareSurfaceHitCandidates(
  left: SurfaceHitCandidateV1,
  right: SurfaceHitCandidateV1,
  hasRetainedNormal: boolean,
): number {
  if (left.location === "interior" && right.location !== "interior") {
    return -1;
  }
  if (right.location === "interior" && left.location !== "interior") {
    return 1;
  }
  if (left.heightDeltaMeters !== right.heightDeltaMeters) {
    return left.heightDeltaMeters - right.heightDeltaMeters;
  }
  if (hasRetainedNormal && left.retainedNormalDot !== right.retainedNormalDot) {
    return right.retainedNormalDot - left.retainedNormalDot;
  }
  return left.ordinal - right.ordinal;
}

function compareSurfaceIds(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export interface TriangleXzBroadphaseEntryV1 {
  readonly ordinal: number;
  readonly minimumMetersXZ: readonly [number, number];
  readonly maximumMetersXZ: readonly [number, number];
}

export interface TriangleXzBroadphaseIndexV1 {
  overlappingOrdinals(
    minimumMetersXZ: readonly [number, number],
    maximumMetersXZ: readonly [number, number],
  ): Iterable<number>;
}

interface TriangleXzBroadphaseNodeV1 {
  readonly minimumMetersXZ: readonly [number, number];
  readonly maximumMetersXZ: readonly [number, number];
  readonly minimumOrdinal: number;
  readonly entry?: TriangleXzBroadphaseEntryV1;
  readonly left?: TriangleXzBroadphaseNodeV1;
  readonly right?: TriangleXzBroadphaseNodeV1;
}

function entryCenter(
  entry: TriangleXzBroadphaseEntryV1,
  axis: 0 | 1,
): number {
  return entry.minimumMetersXZ[axis] +
    (entry.maximumMetersXZ[axis] - entry.minimumMetersXZ[axis]) / 2;
}

function buildTriangleXzBroadphaseNode(
  entries: readonly TriangleXzBroadphaseEntryV1[],
): TriangleXzBroadphaseNodeV1 | undefined {
  if (entries.length === 0) return undefined;
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  let minimumCenterX = Number.POSITIVE_INFINITY;
  let minimumCenterZ = Number.POSITIVE_INFINITY;
  let maximumCenterX = Number.NEGATIVE_INFINITY;
  let maximumCenterZ = Number.NEGATIVE_INFINITY;
  let minimumOrdinal = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    minimumX = Math.min(minimumX, entry.minimumMetersXZ[0]);
    minimumZ = Math.min(minimumZ, entry.minimumMetersXZ[1]);
    maximumX = Math.max(maximumX, entry.maximumMetersXZ[0]);
    maximumZ = Math.max(maximumZ, entry.maximumMetersXZ[1]);
    const centerX = entryCenter(entry, 0);
    const centerZ = entryCenter(entry, 1);
    minimumCenterX = Math.min(minimumCenterX, centerX);
    minimumCenterZ = Math.min(minimumCenterZ, centerZ);
    maximumCenterX = Math.max(maximumCenterX, centerX);
    maximumCenterZ = Math.max(maximumCenterZ, centerZ);
    minimumOrdinal = Math.min(minimumOrdinal, entry.ordinal);
  }
  const minimumMetersXZ = [minimumX, minimumZ] as const;
  const maximumMetersXZ = [maximumX, maximumZ] as const;
  if (entries.length === 1) {
    return {
      minimumMetersXZ,
      maximumMetersXZ,
      minimumOrdinal,
      entry: entries[0]!,
    };
  }
  const centerExtentX = maximumCenterX - minimumCenterX;
  const centerExtentZ = maximumCenterZ - minimumCenterZ;
  const splitAxis: 0 | 1 = centerExtentX >= centerExtentZ ? 0 : 1;
  const otherAxis: 0 | 1 = splitAxis === 0 ? 1 : 0;
  const ordered = [...entries].sort((left, right) =>
    entryCenter(left, splitAxis) - entryCenter(right, splitAxis) ||
    entryCenter(left, otherAxis) - entryCenter(right, otherAxis) ||
    left.ordinal - right.ordinal
  );
  const split = Math.floor(ordered.length / 2);
  return {
    minimumMetersXZ,
    maximumMetersXZ,
    minimumOrdinal,
    left: buildTriangleXzBroadphaseNode(ordered.slice(0, split))!,
    right: buildTriangleXzBroadphaseNode(ordered.slice(split))!,
  };
}

function pushBroadphaseNode(
  heap: TriangleXzBroadphaseNodeV1[],
  node: TriangleXzBroadphaseNodeV1,
): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent]!.minimumOrdinal <= node.minimumOrdinal) break;
    heap[index] = heap[parent]!;
    index = parent;
  }
  heap[index] = node;
}

function popBroadphaseNode(
  heap: TriangleXzBroadphaseNodeV1[],
): TriangleXzBroadphaseNodeV1 | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (heap.length === 0 || isNil(last)) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    const child = right < heap.length &&
        heap[right]!.minimumOrdinal < heap[left]!.minimumOrdinal
      ? right
      : left;
    if (heap[child]!.minimumOrdinal >= last.minimumOrdinal) break;
    heap[index] = heap[child]!;
    index = child;
  }
  heap[index] = last;
  return first;
}

/** Package-private: deliberately not re-exported from the package root. */
export function createTriangleXzBroadphaseIndexV1(
  entries: readonly TriangleXzBroadphaseEntryV1[],
): TriangleXzBroadphaseIndexV1 {
  const root = buildTriangleXzBroadphaseNode(entries);
  const entriesByOrdinal = [...entries].sort(
    (left, right) => left.ordinal - right.ordinal,
  );
  return {
    *overlappingOrdinals(minimumMetersXZ, maximumMetersXZ): Generator<number> {
      if (isNil(root)) return;
      const overlaps = (node: TriangleXzBroadphaseNodeV1) =>
        aabbOverlapsInclusiveXZV1(
          minimumMetersXZ,
          maximumMetersXZ,
          node.minimumMetersXZ,
          node.maximumMetersXZ,
        );
      if (!overlaps(root)) return;
      const containsRoot =
        minimumMetersXZ[0] <= root.minimumMetersXZ[0] &&
        minimumMetersXZ[1] <= root.minimumMetersXZ[1] &&
        maximumMetersXZ[0] >= root.maximumMetersXZ[0] &&
        maximumMetersXZ[1] >= root.maximumMetersXZ[1];
      if (containsRoot) {
        for (const entry of entriesByOrdinal) {
          yield entry.ordinal;
        }
        return;
      }
      const heap: TriangleXzBroadphaseNodeV1[] = [];
      pushBroadphaseNode(heap, root);
      while (heap.length > 0) {
        const node = popBroadphaseNode(heap)!;
        if (!isNil(node.entry)) {
          yield node.entry.ordinal;
          continue;
        }
        if (!isNil(node.left) && overlaps(node.left)) {
          pushBroadphaseNode(heap, node.left);
        }
        if (!isNil(node.right) && overlaps(node.right)) {
          pushBroadphaseNode(heap, node.right);
        }
      }
    },
  };
}

export function queryCanonicalTraversalSurfaceHitsV1(
  input: QueryCanonicalTraversalSurfaceHitsInputV1,
): CanonicalTraversalSurfaceHitResolutionV1 {
  return withFiniteGeometryErrors(() => {
    const parsed = parseQueryInput(input);
    const bestBySurfaceId = new Map<string, SurfaceHitCandidateV1>();
    const hasRetainedNormal = parsed.normalAdmission.mode === "retained-support";
    for (const source of parsed.sources) {
      for (const triangle of indexSourceTriangles(source)) {
        const sample = samplePointOnWorldTriangleV1(
          triangle.geometry,
          parsed.pointMetersXZ,
        );
        if (isNil(sample)) {
          continue;
        }
        const location = classifyTriangleXZLocationV1(
          sample.inwardEdgeDistancesMeters,
        );
        if (location === "outside") {
          continue;
        }
        const heightDeltaMeters = Math.abs(
          sample.heightMeters - parsed.referenceHeightMeters,
        );
        if (heightDeltaMeters > parsed.maximumReferenceHeightDifferenceMeters) {
          continue;
        }
        const admission = admitsNormal(
          triangle.geometry.unitNormalXYZ,
          parsed.normalAdmission,
        );
        if (!admission.admitted) {
          continue;
        }
        const candidate: SurfaceHitCandidateV1 = {
          traversalSurfaceId: source.traversalSurfaceId,
          location,
          heightMeters: sample.heightMeters,
          normalXYZ: triangle.geometry.unitNormalXYZ,
          heightDeltaMeters,
          retainedNormalDot: admission.retainedNormalDot,
          ordinal: triangle.ordinal,
        };
        const current = bestBySurfaceId.get(source.traversalSurfaceId);
        if (
          isNil(current) ||
          compareSurfaceHitCandidates(candidate, current, hasRetainedNormal) < 0
        ) {
          bestBySurfaceId.set(source.traversalSurfaceId, candidate);
        }
      }
    }
    const hits = [...bestBySurfaceId.values()]
      .sort((left, right) =>
        compareSurfaceIds(left.traversalSurfaceId, right.traversalSurfaceId),
      )
      .map((candidate) =>
        deepFreeze({
          traversalSurfaceId: candidate.traversalSurfaceId,
          location: candidate.location,
          heightMeters: candidate.heightMeters,
          normalXYZ: candidate.normalXYZ,
        } satisfies CanonicalTraversalSurfaceHitV1),
      );
    if (hits.length === 0) {
      return deepFreeze({ mode: "missing", hits: [] as const });
    }
    const interiors = hits.filter((hit) => hit.location === "interior");
    if (interiors.length === 1) {
      return deepFreeze({
        mode: "resolved",
        hit: interiors[0]!,
        hits,
      });
    }
    if (interiors.length >= 2) {
      return deepFreeze({ mode: "ambiguous", hits });
    }
    return deepFreeze({
      mode: "resolved",
      hit: hits[0]!,
      hits,
    });
  });
}

function* overlappingSecondOrdinals(
  first: IndexedTriangleV1,
  secondBroadphase: TriangleXzBroadphaseIndexV1,
): Generator<number> {
  yield* secondBroadphase.overlappingOrdinals(
    first.geometry.aabbMinimumMetersXZ,
    first.geometry.aabbMaximumMetersXZ,
  );
}

function classifyIndexedTrianglePair(
  first: IndexedTriangleV1,
  second: IndexedTriangleV1,
  minimumUpwardNormalYRatio: number,
  maximumSameBandHeightDifferenceMeters: number,
):
  | Readonly<{
      kind: "blocker";
      witnessPointMetersXZ: readonly [number, number];
      minimumHeightDifferenceMeters: number;
    }>
  | Readonly<{ kind: "clear" }> {
  if (
    first.geometry.unitNormalXYZ[1] < minimumUpwardNormalYRatio ||
    second.geometry.unitNormalXYZ[1] < minimumUpwardNormalYRatio
  ) {
    return { kind: "clear" };
  }
  const overlap = classifyProjectedTriangleOverlapV1(
    first.geometry,
    second.geometry,
  );
  if (overlap.kind !== "interior-overlap") {
    return { kind: "clear" };
  }
  const minimumHeightDifferenceMeters =
    minimumAbsoluteAffineHeightSeparationMetersV1(
      first.geometry,
      second.geometry,
      overlap.intersectionPolygonMetersXZ,
    );
  if (minimumHeightDifferenceMeters > maximumSameBandHeightDifferenceMeters) {
    return { kind: "clear" };
  }
  const witnessPointMetersXZ = firstCoordinateOrderedPointXZV1(
    overlap.intersectionPolygonMetersXZ,
  );
  if (isNil(witnessPointMetersXZ)) {
    return { kind: "clear" };
  }
  return {
    kind: "blocker",
    witnessPointMetersXZ,
    minimumHeightDifferenceMeters,
  };
}

export function preflightCanonicalTraversalSurfaceOverlapsV1(
  input: PreflightCanonicalTraversalSurfaceOverlapsInputV1,
): PreflightCanonicalTraversalSurfaceOverlapsResultV1 {
  return withFiniteGeometryErrors(() => {
    const parsed = parsePreflightInput(input);
    const indexedSources: IndexedSourceV1[] = [...parsed.sources]
      .sort((left, right) =>
        compareSurfaceIds(left.traversalSurfaceId, right.traversalSurfaceId),
      )
      .map((source) => {
        const triangles = indexSourceTriangles(source);
        return {
          traversalSurfaceId: source.traversalSurfaceId,
          triangles,
          broadphase: createTriangleXzBroadphaseIndexV1(
            triangles.map((triangle) => ({
              ordinal: triangle.ordinal,
              minimumMetersXZ: triangle.geometry.aabbMinimumMetersXZ,
              maximumMetersXZ: triangle.geometry.aabbMaximumMetersXZ,
            })),
          ),
        };
      });
    let testedCount = 0;
    for (
      let firstSourceIndex = 0;
      firstSourceIndex < indexedSources.length;
      firstSourceIndex += 1
    ) {
      const firstSource = indexedSources[firstSourceIndex]!;
      for (
        let secondSourceIndex = firstSourceIndex + 1;
        secondSourceIndex < indexedSources.length;
        secondSourceIndex += 1
      ) {
        const secondSource = indexedSources[secondSourceIndex]!;
        for (const firstTriangle of firstSource.triangles) {
          for (const secondOrdinal of overlappingSecondOrdinals(
            firstTriangle,
            secondSource.broadphase,
          )) {
            testedCount += 1;
            if (
              testedCount ===
              parsed.maximumTraversalSurfaceTrianglePairTestCount + 1
            ) {
              return deepFreeze({
                mode: "budget-exceeded",
                reason:
                  "traversal-surface-triangle-pair-test-budget-exceeded" as const,
                maximumAllowedCount:
                  parsed.maximumTraversalSurfaceTrianglePairTestCount,
                minimumRequiredCount:
                  parsed.maximumTraversalSurfaceTrianglePairTestCount + 1,
              });
            }
            const secondTriangle = secondSource.triangles[secondOrdinal]!;
            const relation = classifyIndexedTrianglePair(
              firstTriangle,
              secondTriangle,
              parsed.minimumUpwardNormalYRatio,
              parsed.maximumSameBandHeightDifferenceMeters,
            );
            if (relation.kind === "blocker") {
              return deepFreeze({
                mode: "blocked",
                blocker: {
                  firstTraversalSurfaceId: firstSource.traversalSurfaceId,
                  secondTraversalSurfaceId: secondSource.traversalSurfaceId,
                  witnessPointMetersXZ: relation.witnessPointMetersXZ,
                  minimumHeightDifferenceMeters:
                    relation.minimumHeightDifferenceMeters,
                },
              });
            }
          }
        }
      }
    }
    return deepFreeze({ mode: "clear" });
  });
}
