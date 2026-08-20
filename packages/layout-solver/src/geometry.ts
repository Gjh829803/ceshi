import type {
  LayoutAabbV1,
  LayoutCameraV1,
  LayoutHeightfieldV1,
  LayoutVec2V1,
  LayoutVec3V1,
} from "./types.js";

const EPSILON = 1e-9;

function assertFinite(value: number): void {
  if (!Number.isFinite(value)) throw new Error("LAYOUT_GEOMETRY_NON_FINITE");
}

function assertFiniteVector(values: readonly number[]): void {
  values.forEach(assertFinite);
}

export function quantizeFinite(value: number, step: number): number {
  assertFinite(value);
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error("LAYOUT_QUANTIZATION_STEP_INVALID");
  }
  const quantized = Math.round(value / step) * step;
  const normalized = Number(quantized.toPrecision(15));
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function validatePolygonXZ(
  points: readonly LayoutVec2V1[],
): "LAYOUT_POLYGON_DEGENERATE" | undefined {
  if (points.length < 3) return "LAYOUT_POLYGON_DEGENERATE";
  points.forEach(assertFiniteVector);
  let doubledArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    doubledArea += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(doubledArea) <= EPSILON ? "LAYOUT_POLYGON_DEGENERATE" : undefined;
}

function pointOnSegment(
  point: LayoutVec2V1,
  start: LayoutVec2V1,
  end: LayoutVec2V1,
): boolean {
  const cross =
    (point[1] - start[1]) * (end[0] - start[0]) -
    (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > EPSILON) return false;
  const dot =
    (point[0] - start[0]) * (end[0] - start[0]) +
    (point[1] - start[1]) * (end[1] - start[1]);
  const squaredLength =
    (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  return dot >= -EPSILON && dot <= squaredLength + EPSILON;
}

export function pointInPolygonXZ(
  point: LayoutVec2V1,
  polygon: readonly LayoutVec2V1[],
): boolean {
  assertFiniteVector(point);
  const invalid = validatePolygonXZ(polygon);
  if (invalid !== undefined) throw new Error(invalid);
  let inside = false;
  for (let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex, currentIndex += 1) {
    const current = polygon[currentIndex]!;
    const previous = polygon[previousIndex]!;
    if (pointOnSegment(point, previous, current)) return true;
    const crosses =
      (current[1] > point[1]) !== (previous[1] > point[1]) &&
      point[0] <
        ((previous[0] - current[0]) * (point[1] - current[1])) /
          (previous[1] - current[1]) +
          current[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointToSegmentDistance(
  point: LayoutVec2V1,
  start: LayoutVec2V1,
  end: LayoutVec2V1,
): number {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= EPSILON) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const ratio = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared),
  );
  return Math.hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dz));
}

export function pointToPolygonBoundaryDistanceMeters(
  point: LayoutVec2V1,
  polygon: readonly LayoutVec2V1[],
): number {
  assertFiniteVector(point);
  const invalid = validatePolygonXZ(polygon);
  if (invalid !== undefined) throw new Error(invalid);
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    distance = Math.min(
      distance,
      pointToSegmentDistance(point, polygon[index]!, polygon[(index + 1) % polygon.length]!),
    );
  }
  return distance;
}

function validateAabb(bounds: LayoutAabbV1): void {
  assertFiniteVector(bounds.minimumMetersXYZ);
  assertFiniteVector(bounds.maximumMetersXYZ);
  for (let axis = 0; axis < 3; axis += 1) {
    if (bounds.minimumMetersXYZ[axis]! > bounds.maximumMetersXYZ[axis]!) {
      throw new Error("LAYOUT_AABB_INVALID");
    }
  }
}

export function aabbSeparationMeters(left: LayoutAabbV1, right: LayoutAabbV1): number {
  validateAabb(left);
  validateAabb(right);
  const gaps = [0, 1, 2].map((axis) =>
    Math.max(
      0,
      right.minimumMetersXYZ[axis]! - left.maximumMetersXYZ[axis]!,
      left.minimumMetersXYZ[axis]! - right.maximumMetersXYZ[axis]!,
    ),
  );
  return Math.hypot(gaps[0]!, gaps[1]!, gaps[2]!);
}

export function aabbOverlapDepthMetersXYZ(
  left: LayoutAabbV1,
  right: LayoutAabbV1,
): LayoutVec3V1 | undefined {
  validateAabb(left);
  validateAabb(right);
  const overlap = [0, 1, 2].map((axis) =>
    Math.min(left.maximumMetersXYZ[axis]!, right.maximumMetersXYZ[axis]!) -
    Math.max(left.minimumMetersXYZ[axis]!, right.minimumMetersXYZ[axis]!),
  ) as [number, number, number];
  return overlap.some((value) => value <= 0) ? undefined : overlap;
}

function validateHeightfield(heightfield: LayoutHeightfieldV1): void {
  assertFiniteVector(heightfield.centerMetersXZ);
  assertFiniteVector(heightfield.sizeMetersXZ);
  const [columns, rows] = heightfield.resolutionVerticesXZ;
  if (
    !Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2 ||
    heightfield.sizeMetersXZ[0] <= 0 || heightfield.sizeMetersXZ[1] <= 0 ||
    heightfield.heightSamplesMeters.length !== columns * rows
  ) {
    throw new Error("LAYOUT_HEIGHTFIELD_INVALID");
  }
  heightfield.heightSamplesMeters.forEach(assertFinite);
}

export function sampleHeightfieldV1(
  heightfield: LayoutHeightfieldV1,
  pointMetersXZ: LayoutVec2V1,
): Readonly<{
  heightMeters: number;
  normalXYZ: LayoutVec3V1;
  slopeDegrees: number;
}> | undefined {
  validateHeightfield(heightfield);
  assertFiniteVector(pointMetersXZ);
  const [columns, rows] = heightfield.resolutionVerticesXZ;
  const minimumX = heightfield.centerMetersXZ[0] - heightfield.sizeMetersXZ[0] / 2;
  const minimumZ = heightfield.centerMetersXZ[1] - heightfield.sizeMetersXZ[1] / 2;
  const u = (pointMetersXZ[0] - minimumX) / heightfield.sizeMetersXZ[0];
  const v = (pointMetersXZ[1] - minimumZ) / heightfield.sizeMetersXZ[1];
  if (u < 0 || u > 1 || v < 0 || v > 1) return undefined;

  const columnPosition = u * (columns - 1);
  const rowPosition = v * (rows - 1);
  const column = Math.min(columns - 2, Math.floor(columnPosition));
  const row = Math.min(rows - 2, Math.floor(rowPosition));
  const tx = columnPosition - column;
  const tz = rowPosition - row;
  const sample = (x: number, z: number) => heightfield.heightSamplesMeters[z * columns + x]!;
  const h00 = sample(column, row);
  const h10 = sample(column + 1, row);
  const h01 = sample(column, row + 1);
  const h11 = sample(column + 1, row + 1);
  const near = h00 * (1 - tx) + h10 * tx;
  const far = h01 * (1 - tx) + h11 * tx;
  const heightMeters = near * (1 - tz) + far * tz;
  const dxMeters = heightfield.sizeMetersXZ[0] / (columns - 1);
  const dzMeters = heightfield.sizeMetersXZ[1] / (rows - 1);
  const derivativeX = ((h10 - h00) * (1 - tz) + (h11 - h01) * tz) / dxMeters;
  const derivativeZ = ((h01 - h00) * (1 - tx) + (h11 - h10) * tx) / dzMeters;
  const length = Math.hypot(derivativeX, 1, derivativeZ);
  const normalXYZ: LayoutVec3V1 = [
    quantizeFinite(-derivativeX / length, 0.000001),
    quantizeFinite(1 / length, 0.000001),
    quantizeFinite(-derivativeZ / length, 0.000001),
  ];
  const slopeDegrees = quantizeFinite(
    Math.atan(Math.hypot(derivativeX, derivativeZ)) * 180 / Math.PI,
    0.000001,
  );
  return { heightMeters: quantizeFinite(heightMeters, 0.000001), normalXYZ, slopeDegrees };
}

export function sampleRoutePolylineV1(
  points: readonly LayoutVec2V1[],
  spacingMeters: number,
): readonly LayoutVec2V1[] {
  if (!Number.isFinite(spacingMeters) || spacingMeters <= 0 || points.length < 2) {
    throw new Error("LAYOUT_ROUTE_INVALID");
  }
  points.forEach(assertFiniteVector);
  const samples: LayoutVec2V1[] = [points[0]!];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length <= EPSILON) throw new Error("LAYOUT_ROUTE_INVALID");
    for (let distance = spacingMeters; distance < length - EPSILON; distance += spacingMeters) {
      const ratio = distance / length;
      samples.push([
        quantizeFinite(start[0] + (end[0] - start[0]) * ratio, 0.000001),
        quantizeFinite(start[1] + (end[1] - start[1]) * ratio, 0.000001),
      ]);
    }
    samples.push(end);
  }
  return samples.filter((point, index) =>
    index === 0 || point[0] !== samples[index - 1]![0] || point[1] !== samples[index - 1]![1]
  );
}

function subtract(left: LayoutVec3V1, right: LayoutVec3V1): LayoutVec3V1 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: LayoutVec3V1, right: LayoutVec3V1): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: LayoutVec3V1, right: LayoutVec3V1): LayoutVec3V1 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(vector: LayoutVec3V1): LayoutVec3V1 {
  assertFiniteVector(vector);
  const length = Math.hypot(...vector);
  if (length <= EPSILON) throw new Error("LAYOUT_CAMERA_INVALID");
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

export function projectToScreenUv(
  camera: LayoutCameraV1,
  pointMetersXYZ: LayoutVec3V1,
): readonly [u: number, v: number] | undefined {
  assertFiniteVector(camera.positionMetersXYZ);
  assertFiniteVector(camera.targetMetersXYZ);
  assertFiniteVector(pointMetersXYZ);
  if (
    !Number.isFinite(camera.verticalFovDegrees) || camera.verticalFovDegrees <= 0 || camera.verticalFovDegrees >= 180 ||
    !Number.isFinite(camera.aspectRatio) || camera.aspectRatio <= 0 ||
    !Number.isFinite(camera.nearClipMeters) || !Number.isFinite(camera.farClipMeters) ||
    camera.nearClipMeters <= 0 || camera.nearClipMeters >= camera.farClipMeters
  ) {
    throw new Error("LAYOUT_CAMERA_INVALID");
  }
  const forward = normalize(subtract(camera.targetMetersXYZ, camera.positionMetersXYZ));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const delta = subtract(pointMetersXYZ, camera.positionMetersXYZ);
  const depth = dot(delta, forward);
  if (depth < camera.nearClipMeters || depth > camera.farClipMeters) return undefined;
  const halfHeight = depth * Math.tan(camera.verticalFovDegrees * Math.PI / 360);
  const ndcX = dot(delta, right) / (halfHeight * camera.aspectRatio);
  const ndcY = dot(delta, up) / halfHeight;
  return [
    quantizeFinite(0.5 + ndcX / 2, 0.000001),
    quantizeFinite(0.5 - ndcY / 2, 0.000001),
  ];
}
