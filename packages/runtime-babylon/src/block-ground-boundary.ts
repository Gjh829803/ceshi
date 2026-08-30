import type { BlockGroundBoundarySegmentV1 } from "./block-walkable-surface.js";

export const BLOCK_WORLD_GROUND_BOUNDARY_HEIGHT_METERS_V1 = 4;
export const BLOCK_WORLD_GROUND_BOUNDARY_BELOW_SURFACE_METERS_V1 = 0.2;
export const BLOCK_WORLD_GROUND_BOUNDARY_MEMBERSHIP_MASK_V1 = 0x20000000;

const EPSILON = 1e-8;

export type BlockWorldMotionKernelImplementationIdV1 =
  | "free-ground"
  | "forward-steer"
  | "wheeled-arcade"
  | "surface-slide"
  | "hover"
  | "water-surface"
  | "underwater"
  | "unpowered-glide"
  | "powered-flight"
  | "zero-gravity-six-dof";

export function blockWorldGroundBoundaryEnabledForKernelV1(
  implementationId: BlockWorldMotionKernelImplementationIdV1,
): boolean {
  return implementationId === "free-ground" ||
    implementationId === "forward-steer" ||
    implementationId === "wheeled-arcade" ||
    implementationId === "surface-slide";
}

export function blockWorldGroundBoundaryCollideMaskV1(
  currentMask: number,
  implementationId: BlockWorldMotionKernelImplementationIdV1,
): number {
  const unsigned = currentMask >>> 0;
  return blockWorldGroundBoundaryEnabledForKernelV1(implementationId)
    ? (unsigned | BLOCK_WORLD_GROUND_BOUNDARY_MEMBERSHIP_MASK_V1) >>> 0
    : (unsigned & ~BLOCK_WORLD_GROUND_BOUNDARY_MEMBERSHIP_MASK_V1) >>> 0;
}

interface NormalizedBoundarySegmentV1 extends BlockGroundBoundarySegmentV1 {
  readonly axis: "x" | "z";
  readonly fixedMeters: number;
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPSILON;
}

function normalizedSegment(
  segment: BlockGroundBoundarySegmentV1,
): NormalizedBoundarySegmentV1 {
  const xFixed = close(segment.startMetersXYZ[0], segment.endMetersXYZ[0]);
  const axis = xFixed ? "z" : "x";
  const variableAxis = axis === "x" ? 0 : 2;
  const fixedAxis = axis === "x" ? 2 : 0;
  const ordered = segment.startMetersXYZ[variableAxis] <=
      segment.endMetersXYZ[variableAxis]
    ? segment
    : {
        startMetersXYZ: segment.endMetersXYZ,
        endMetersXYZ: segment.startMetersXYZ,
      };
  return Object.freeze({
    ...ordered,
    axis,
    fixedMeters: ordered.startMetersXYZ[fixedAxis],
  });
}

function segmentSlope(segment: NormalizedBoundarySegmentV1): number {
  const axis = segment.axis === "x" ? 0 : 2;
  return (segment.endMetersXYZ[1] - segment.startMetersXYZ[1]) /
    (segment.endMetersXYZ[axis] - segment.startMetersXYZ[axis]);
}

function canMerge(
  left: NormalizedBoundarySegmentV1,
  right: NormalizedBoundarySegmentV1,
): boolean {
  return left.axis === right.axis && close(left.fixedMeters, right.fixedMeters) &&
    left.endMetersXYZ.every((value, axis) =>
      close(value, right.startMetersXYZ[axis]!)) &&
    close(segmentSlope(left), segmentSlope(right));
}

export function coalesceBlockWorldGroundBoundarySegmentsV1(
  segments: readonly BlockGroundBoundarySegmentV1[],
): readonly BlockGroundBoundarySegmentV1[] {
  const sorted = segments.map(normalizedSegment).sort((left, right) =>
    left.axis.localeCompare(right.axis) ||
    left.fixedMeters - right.fixedMeters ||
    left.startMetersXYZ[left.axis === "x" ? 0 : 2] -
      right.startMetersXYZ[right.axis === "x" ? 0 : 2] ||
    left.startMetersXYZ[1] - right.startMetersXYZ[1]);
  const merged: NormalizedBoundarySegmentV1[] = [];
  for (const segment of sorted) {
    const previous = merged.at(-1);
    if (previous === undefined || !canMerge(previous, segment)) {
      merged.push(segment);
      continue;
    }
    merged[merged.length - 1] = Object.freeze({
      ...previous,
      endMetersXYZ: segment.endMetersXYZ,
    });
  }
  return Object.freeze(merged.map(({ startMetersXYZ, endMetersXYZ }) =>
    Object.freeze({ startMetersXYZ, endMetersXYZ })));
}

export function buildBlockWorldGroundBoundaryGeometryV1(
  segments: readonly BlockGroundBoundarySegmentV1[],
): Readonly<{
  sourceSegmentCount: number;
  mergedSegmentCount: number;
  positionsMetersXYZ: readonly number[];
  triangleIndices: readonly number[];
}> {
  const merged = coalesceBlockWorldGroundBoundarySegmentsV1(segments);
  const positions: number[] = [];
  const indices: number[] = [];
  for (const segment of merged) {
    const offset = positions.length / 3;
    const start = segment.startMetersXYZ;
    const end = segment.endMetersXYZ;
    positions.push(
      start[0], start[1] - BLOCK_WORLD_GROUND_BOUNDARY_BELOW_SURFACE_METERS_V1, start[2],
      end[0], end[1] - BLOCK_WORLD_GROUND_BOUNDARY_BELOW_SURFACE_METERS_V1, end[2],
      end[0], end[1] + BLOCK_WORLD_GROUND_BOUNDARY_HEIGHT_METERS_V1, end[2],
      start[0], start[1] + BLOCK_WORLD_GROUND_BOUNDARY_HEIGHT_METERS_V1, start[2],
    );
    indices.push(offset, offset + 2, offset + 1, offset, offset + 3, offset + 2);
  }
  return Object.freeze({
    sourceSegmentCount: segments.length,
    mergedSegmentCount: merged.length,
    positionsMetersXYZ: Object.freeze(positions),
    triangleIndices: Object.freeze(indices),
  });
}
