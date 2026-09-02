import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import { failBabylonNativeBlockProfileBuildV1 as fail } from
  "./build-failure.js";
import type {
  BabylonNativeBlockTopologyGeometryV1,
  BabylonNativeBlockWalkableTopologyV1,
} from "./walkable-topology.js";

export interface BabylonNativeBlockGroundBoundaryPolicyV1 {
  readonly kind: "babylon-native-block-ground-boundary-policy";
  readonly schemaVersion: 1;
  readonly heightAboveSurfaceMeters: number;
  readonly depthBelowSurfaceMeters: number;
  readonly maximumSourceSegmentCount: number;
  readonly maximumMergedSegmentCount: number;
  readonly maximumBoundaryVertexCount: number;
  readonly maximumBoundaryTriangleCount: number;
}

export interface BabylonNativeBlockGroundBoundarySegmentV1 {
  readonly id: string;
  readonly startMetersXYZ: readonly [number, number, number];
  readonly endMetersXYZ: readonly [number, number, number];
  readonly sourceLogicalColliderIds: readonly string[];
  readonly sourceBlockIds: readonly string[];
  readonly visualGroupIds: readonly string[];
  readonly sourceSegmentCount: number;
}

export interface BabylonNativeBlockGroundBoundaryV1 {
  readonly kind: "babylon-native-block-ground-boundary";
  readonly schemaVersion: 1;
  readonly derivedColliderRole: "ground-safety-boundary";
  readonly identity: Readonly<{
    readonly topologyHash: Sha256HashV1;
    readonly boundaryPolicyHash: Sha256HashV1;
  }>;
  readonly sourceSegmentCount: number;
  readonly mergedSegmentCount: number;
  readonly segments: readonly BabylonNativeBlockGroundBoundarySegmentV1[];
  readonly positionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly boundaryHash: Sha256HashV1;
}

export interface BuildBabylonNativeBlockGroundBoundaryInputV1 {
  readonly topology: BabylonNativeBlockWalkableTopologyV1;
  readonly policy: BabylonNativeBlockGroundBoundaryPolicyV1;
}

const INPUT_CODE = "WORLDKIT_NATIVE_BLOCK_GROUND_BOUNDARY_INPUT_INVALID";
const IDENTITY_CODE = "WORLDKIT_NATIVE_BLOCK_GROUND_BOUNDARY_IDENTITY_MISMATCH";
const BUDGET_CODE = "WORLDKIT_NATIVE_BLOCK_GROUND_BOUNDARY_BUDGET_EXCEEDED";
const EPSILON = 1e-8;

type Position = readonly [number, number, number];

interface EdgeOccurrence {
  readonly start: Position;
  readonly end: Position;
  readonly geometry: BabylonNativeBlockTopologyGeometryV1;
}

interface SourceSegment {
  readonly axis: "x" | "z";
  readonly fixedMeters: number;
  readonly start: Position;
  readonly end: Position;
  readonly sourceLogicalColliderIds: readonly string[];
  readonly sourceBlockIds: readonly string[];
  readonly visualGroupIds: readonly string[];
}

interface MergedSegment extends SourceSegment {
  readonly sourceSegmentCount: number;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function positionKey(position: Position): string {
  return position.map(canonicalNumber).join(",");
}

function edgeKey(start: Position, end: Position): string {
  const first = positionKey(start);
  const second = positionKey(end);
  return stableCompare(first, second) <= 0
    ? `${first}|${second}`
    : `${second}|${first}`;
}

function parsePolicy(
  input: BabylonNativeBlockGroundBoundaryPolicyV1,
): BabylonNativeBlockGroundBoundaryPolicyV1 {
  const keys = [
    "kind",
    "schemaVersion",
    "heightAboveSurfaceMeters",
    "depthBelowSurfaceMeters",
    "maximumSourceSegmentCount",
    "maximumMergedSegmentCount",
    "maximumBoundaryVertexCount",
    "maximumBoundaryTriangleCount",
  ] as const;
  let descriptors: PropertyDescriptorMap;
  try {
    if (
      typeof input !== "object" ||
      isNil(input) ||
      Array.isArray(input) ||
      Reflect.getPrototypeOf(input) !== Object.prototype ||
      Reflect.ownKeys(input).some((key) => typeof key !== "string")
    ) return fail(INPUT_CODE, "boundary policy must be one plain record");
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch {
    return fail(INPUT_CODE, "boundary policy cannot be inspected safely");
  }
  if (
    Object.keys(descriptors).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(descriptors, key)) ||
    Object.values(descriptors).some((descriptor) =>
      !descriptor.enumerable || !("value" in descriptor))
  ) return fail(INPUT_CODE, "boundary policy must use the closed field set");
  const policy = Object.freeze(Object.fromEntries(keys.map((key) =>
    [key, descriptors[key]!.value]))) as unknown as
    BabylonNativeBlockGroundBoundaryPolicyV1;
  if (
    policy.kind !== "babylon-native-block-ground-boundary-policy" ||
    policy.schemaVersion !== 1
  ) return fail(INPUT_CODE, "boundary policy uses an unsupported contract");
  if (
    !Number.isFinite(policy.heightAboveSurfaceMeters) ||
    policy.heightAboveSurfaceMeters <= 0 ||
    !Number.isFinite(policy.depthBelowSurfaceMeters) ||
    policy.depthBelowSurfaceMeters < 0 ||
    Object.is(policy.depthBelowSurfaceMeters, -0)
  ) return fail(INPUT_CODE, "boundary dimensions are invalid");
  for (const key of [
    "maximumSourceSegmentCount",
    "maximumMergedSegmentCount",
    "maximumBoundaryVertexCount",
    "maximumBoundaryTriangleCount",
  ] as const) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] <= 0) {
      return fail(INPUT_CODE, `boundary budget '${key}' is invalid`);
    }
  }
  return policy;
}

function topologyIsCurrent(topology: BabylonNativeBlockWalkableTopologyV1):
boolean {
  const { topologyHash, ...body } = topology;
  return sha256CanonicalJson(body) === topologyHash;
}

function positionAt(
  geometry: BabylonNativeBlockTopologyGeometryV1,
  index: number,
): Position {
  if (!Number.isSafeInteger(index) || index < 0 || index >= geometry.vertexCount) {
    return fail(INPUT_CODE,
      `topology geometry '${geometry.logicalColliderId}' has an invalid index`);
  }
  const offset = index * 3;
  const position = geometry.collisionPositionsMetersXYZ.slice(
    offset,
    offset + 3,
  );
  if (position.length !== 3 || !position.every(Number.isFinite)) {
    return fail(INPUT_CODE,
      `topology geometry '${geometry.logicalColliderId}' has an invalid vertex`);
  }
  return Object.freeze(position.map(canonicalNumber)) as Position;
}

function normalizeExposedEdge(occurrence: EdgeOccurrence): SourceSegment {
  const { start, end, geometry } = occurrence;
  const hasFixedX = Math.abs(start[0] - end[0]) <= EPSILON;
  const hasFixedZ = Math.abs(start[2] - end[2]) <= EPSILON;
  if (hasFixedX === hasFixedZ) {
    return fail(INPUT_CODE,
      `topology geometry '${geometry.logicalColliderId}' exposes a non-axis-aligned or degenerate edge`);
  }
  const axis = hasFixedZ ? "x" : "z";
  const variableAxis = axis === "x" ? 0 : 2;
  const fixedAxis = axis === "x" ? 2 : 0;
  const [orderedStart, orderedEnd] = start[variableAxis] <= end[variableAxis]
    ? [start, end]
    : [end, start];
  return Object.freeze({
    axis,
    fixedMeters: canonicalNumber(orderedStart[fixedAxis]),
    start: orderedStart,
    end: orderedEnd,
    sourceLogicalColliderIds: Object.freeze([geometry.logicalColliderId]),
    sourceBlockIds: Object.freeze([...geometry.sourceBlockIds].sort(stableCompare)),
    visualGroupIds: Object.freeze([...geometry.visualGroupIds].sort(stableCompare)),
  });
}

function slope(segment: SourceSegment): number {
  const axis = segment.axis === "x" ? 0 : 2;
  return (segment.end[1] - segment.start[1]) /
    (segment.end[axis] - segment.start[axis]);
}

function canMerge(left: MergedSegment, right: SourceSegment): boolean {
  return left.axis === right.axis &&
    Math.abs(left.fixedMeters - right.fixedMeters) <= EPSILON &&
    left.end.every((value, index) =>
      Math.abs(value - right.start[index]!) <= EPSILON) &&
    Math.abs(slope(left) - slope(right)) <= EPSILON;
}

function unionSorted(
  left: readonly string[],
  right: readonly string[],
): readonly string[] {
  return Object.freeze([...new Set([...left, ...right])].sort(stableCompare));
}

function mergeSegments(segments: readonly SourceSegment[]): readonly MergedSegment[] {
  const sorted = [...segments].sort((left, right) =>
    stableCompare(left.axis, right.axis) ||
    left.fixedMeters - right.fixedMeters ||
    left.start[left.axis === "x" ? 0 : 2] -
      right.start[right.axis === "x" ? 0 : 2] ||
    left.start[1] - right.start[1] ||
    stableCompare(
      left.sourceLogicalColliderIds.join("\u0000"),
      right.sourceLogicalColliderIds.join("\u0000"),
    ));
  const merged: MergedSegment[] = [];
  for (const segment of sorted) {
    const prior = merged.at(-1);
    if (isNil(prior) || !canMerge(prior, segment)) {
      merged.push(Object.freeze({ ...segment, sourceSegmentCount: 1 }));
      continue;
    }
    merged[merged.length - 1] = Object.freeze({
      ...prior,
      end: segment.end,
      sourceLogicalColliderIds: unionSorted(
        prior.sourceLogicalColliderIds,
        segment.sourceLogicalColliderIds,
      ),
      sourceBlockIds: unionSorted(prior.sourceBlockIds, segment.sourceBlockIds),
      visualGroupIds: unionSorted(prior.visualGroupIds, segment.visualGroupIds),
      sourceSegmentCount: prior.sourceSegmentCount + 1,
    });
  }
  return Object.freeze(merged);
}

function boundarySegments(
  topology: BabylonNativeBlockWalkableTopologyV1,
): Readonly<{
  sourceSegmentCount: number;
  segments: readonly MergedSegment[];
}> {
  const occurrencesByEdge = new Map<string, EdgeOccurrence[]>();
  for (const geometry of topology.walkableGeometries) {
    if (
      geometry.proxyKind !== "continuous-walkable-surface" ||
      geometry.triangleIndices.length % 3 !== 0 ||
      geometry.collisionPositionsMetersXYZ.length !== geometry.vertexCount * 3
    ) return fail(INPUT_CODE,
      `topology geometry '${geometry.logicalColliderId}' is malformed`);
    for (let offset = 0; offset < geometry.triangleIndices.length; offset += 3) {
      const triangle = [
        geometry.triangleIndices[offset]!,
        geometry.triangleIndices[offset + 1]!,
        geometry.triangleIndices[offset + 2]!,
      ] as const;
      for (const [first, second] of [
        [triangle[0], triangle[1]],
        [triangle[1], triangle[2]],
        [triangle[2], triangle[0]],
      ] as const) {
        const start = positionAt(geometry, first);
        const end = positionAt(geometry, second);
        const key = edgeKey(start, end);
        const occurrences = occurrencesByEdge.get(key) ?? [];
        occurrences.push(Object.freeze({ start, end, geometry }));
        occurrencesByEdge.set(key, occurrences);
      }
    }
  }
  const exposed: SourceSegment[] = [];
  for (const [key, occurrences] of [...occurrencesByEdge.entries()].sort(
    ([left], [right]) => stableCompare(left, right),
  )) {
    if (occurrences.length > 2) {
      return fail(INPUT_CODE, `topology edge '${key}' is non-manifold`);
    }
    if (occurrences.length !== 1) continue;
    const occurrence = occurrences[0]!;
    if (occurrence.geometry.exposedEdgePolicy !== "protect-ground-subject") {
      continue;
    }
    exposed.push(normalizeExposedEdge(occurrence));
  }
  return Object.freeze({
    sourceSegmentCount: exposed.length,
    segments: mergeSegments(exposed),
  });
}

export function buildBabylonNativeBlockGroundBoundaryV1(
  input: BuildBabylonNativeBlockGroundBoundaryInputV1,
): BabylonNativeBlockGroundBoundaryV1 {
  const policy = parsePolicy(input.policy);
  if (!topologyIsCurrent(input.topology)) {
    return fail(IDENTITY_CODE, "walkable topology hash is stale");
  }
  const derived = boundarySegments(input.topology);
  if (derived.sourceSegmentCount > policy.maximumSourceSegmentCount) {
    return fail(BUDGET_CODE,
      `boundary uses ${derived.sourceSegmentCount} source segments`);
  }
  if (derived.segments.length > policy.maximumMergedSegmentCount) {
    return fail(BUDGET_CODE,
      `boundary uses ${derived.segments.length} merged segments`);
  }
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = Object.freeze(derived.segments.map((segment) => {
    const segmentBody = Object.freeze({
      startMetersXYZ: segment.start,
      endMetersXYZ: segment.end,
      sourceLogicalColliderIds: segment.sourceLogicalColliderIds,
      sourceBlockIds: segment.sourceBlockIds,
      visualGroupIds: segment.visualGroupIds,
      sourceSegmentCount: segment.sourceSegmentCount,
    });
    const id = `ground-safety-boundary:${sha256CanonicalJson(segmentBody).slice(7, 23)}`;
    const offset = positions.length / 3;
    positions.push(
      segment.start[0],
      canonicalNumber(segment.start[1] - policy.depthBelowSurfaceMeters),
      segment.start[2],
      segment.end[0],
      canonicalNumber(segment.end[1] - policy.depthBelowSurfaceMeters),
      segment.end[2],
      segment.end[0],
      canonicalNumber(segment.end[1] + policy.heightAboveSurfaceMeters),
      segment.end[2],
      segment.start[0],
      canonicalNumber(segment.start[1] + policy.heightAboveSurfaceMeters),
      segment.start[2],
    );
    indices.push(
      offset, offset + 2, offset + 1,
      offset, offset + 3, offset + 2,
    );
    return Object.freeze({ id, ...segmentBody });
  }));
  const vertexCount = positions.length / 3;
  const triangleCount = indices.length / 3;
  if (
    vertexCount > policy.maximumBoundaryVertexCount ||
    triangleCount > policy.maximumBoundaryTriangleCount
  ) return fail(BUDGET_CODE,
    `boundary uses ${vertexCount} vertices and ${triangleCount} triangles`);
  const body = Object.freeze({
    kind: "babylon-native-block-ground-boundary" as const,
    schemaVersion: 1 as const,
    derivedColliderRole: "ground-safety-boundary" as const,
    identity: Object.freeze({
      topologyHash: input.topology.topologyHash,
      boundaryPolicyHash: sha256CanonicalJson(policy) as Sha256HashV1,
    }),
    sourceSegmentCount: derived.sourceSegmentCount,
    mergedSegmentCount: segments.length,
    segments,
    positionsMetersXYZ: Object.freeze(positions),
    triangleIndices: Object.freeze(indices),
    vertexCount,
    triangleCount,
  });
  return Object.freeze({
    ...body,
    boundaryHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}
