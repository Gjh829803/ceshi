import { isNil } from "lodash-es";

import {
  describeWorldTriangleV1,
  isBarycentricInsideFacadeV1,
  samplePointOnWorldTriangleV1,
} from "./triangle-world-geometry.js";

export type StaticColliderTriangleShapeV1 =
  | Readonly<{
      kind: "box";
      sizeMetersXYZ: readonly [number, number, number];
    }>
  | Readonly<{
      kind: "sphere";
      radiusMeters: number;
    }>
  | Readonly<{
      kind: "cylinder";
      radiusMeters: number;
      heightMeters: number;
    }>;

export interface StaticColliderTriangleMeshV1 {
  readonly localPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
}

export interface StaticColliderWorldTriangleMeshV1 {
  readonly worldPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
}

export interface StaticColliderTransformV1 {
  readonly positionMetersXYZ: readonly [number, number, number];
  readonly rotationEulerRadiansXYZ: readonly [number, number, number];
  readonly scaleXYZ: readonly [number, number, number];
}

type MutableVec3 = [number, number, number];

const CYLINDER_SIDE_COUNT = 24;
const ICOSPHERE_SUBDIVISION_LEVEL = 2;

function fail(message: string): never {
  throw new Error(`STATIC_COLLIDER_TRIANGLE_MESH_INPUT_INVALID: ${message}`);
}

function requirePositiveFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) {
    fail(`${path} must be a positive finite number.`);
  }
  return value;
}

function requireExactFields(
  value: object,
  expectedFields: readonly string[],
  path: string,
): void {
  const actualFields = Object.keys(value).sort();
  const canonicalExpectedFields = [...expectedFields].sort();
  if (
    actualFields.length !== canonicalExpectedFields.length ||
    actualFields.some(
      (field, index) => field !== canonicalExpectedFields[index],
    )
  ) {
    fail(`${path} must contain only ${canonicalExpectedFields.join(", ")}.`);
  }
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

function boxMesh(value: unknown): StaticColliderTriangleMeshV1 {
  if (
    typeof value !== "object" ||
    isNil(value) ||
    !("sizeMetersXYZ" in value) ||
    !Array.isArray(value.sizeMetersXYZ) ||
    value.sizeMetersXYZ.length !== 3
  ) {
    fail("box.sizeMetersXYZ must be a 3-tuple.");
  }
  requireExactFields(value, ["kind", "sizeMetersXYZ"], "box");
  const [x, y, z] = value.sizeMetersXYZ.map((entry, index) =>
    requirePositiveFinite(entry, `box.sizeMetersXYZ[${index}]`) / 2
  ) as MutableVec3;
  return {
    localPositionsMetersXYZ: [
      -x, -y, -z, x, -y, -z, x, y, -z, -x, y, -z,
      -x, -y, z, x, -y, z, x, y, z, -x, y, z,
    ],
    triangleIndices: [
      0, 3, 2, 0, 2, 1,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      3, 7, 6, 3, 6, 2,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
    ],
  };
}

function cylinderMesh(value: unknown): StaticColliderTriangleMeshV1 {
  if (
    typeof value !== "object" ||
    isNil(value) ||
    !("radiusMeters" in value) ||
    !("heightMeters" in value)
  ) {
    fail("cylinder radius and height are required.");
  }
  requireExactFields(
    value,
    ["kind", "radiusMeters", "heightMeters"],
    "cylinder",
  );
  const radiusMeters = requirePositiveFinite(
    value.radiusMeters,
    "cylinder.radiusMeters",
  );
  const heightMeters = requirePositiveFinite(
    value.heightMeters,
    "cylinder.heightMeters",
  );
  const radius = radiusMeters / Math.cos(Math.PI / CYLINDER_SIDE_COUNT);
  const halfHeight = heightMeters / 2;
  const positions: number[] = [];
  for (let index = 0; index < CYLINDER_SIDE_COUNT; index += 1) {
    const angle = index * Math.PI * 2 / CYLINDER_SIDE_COUNT;
    positions.push(
      Math.cos(angle) * radius,
      -halfHeight,
      Math.sin(angle) * radius,
    );
  }
  for (let index = 0; index < CYLINDER_SIDE_COUNT; index += 1) {
    const angle = index * Math.PI * 2 / CYLINDER_SIDE_COUNT;
    positions.push(
      Math.cos(angle) * radius,
      halfHeight,
      Math.sin(angle) * radius,
    );
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, -halfHeight, 0);
  const topCenter = positions.length / 3;
  positions.push(0, halfHeight, 0);
  const indices: number[] = [];
  for (let index = 0; index < CYLINDER_SIDE_COUNT; index += 1) {
    const next = (index + 1) % CYLINDER_SIDE_COUNT;
    const top = index + CYLINDER_SIDE_COUNT;
    const topNext = next + CYLINDER_SIDE_COUNT;
    indices.push(index, top, topNext, index, topNext, next);
    indices.push(bottomCenter, index, next);
    indices.push(topCenter, topNext, top);
  }
  return { localPositionsMetersXYZ: positions, triangleIndices: indices };
}

function sphereMesh(value: unknown): StaticColliderTriangleMeshV1 {
  if (
    typeof value !== "object" ||
    isNil(value) ||
    !("radiusMeters" in value)
  ) {
    fail("sphere.radiusMeters is required.");
  }
  requireExactFields(value, ["kind", "radiusMeters"], "sphere");
  const radiusMeters = requirePositiveFinite(
    value.radiusMeters,
    "sphere.radiusMeters",
  );
  const golden = (1 + Math.sqrt(5)) / 2;
  const baseVertices: MutableVec3[] = [
    [-1, golden, 0], [1, golden, 0], [-1, -golden, 0], [1, -golden, 0],
    [0, -1, golden], [0, 1, golden], [0, -1, -golden], [0, 1, -golden],
    [golden, 0, -1], [golden, 0, 1], [-golden, 0, -1], [-golden, 0, 1],
  ];
  let vertices: MutableVec3[] = baseVertices.map((point) => {
    const length = Math.hypot(...point);
    return [point[0] / length, point[1] / length, point[2] / length];
  });
  let faces: Array<[number, number, number]> = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let level = 0; level < ICOSPHERE_SUBDIVISION_LEVEL; level += 1) {
    const midpointByEdge = new Map<string, number>();
    const midpoint = (left: number, right: number): number => {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      if (midpointByEdge.has(key)) {
        return midpointByEdge.get(key)!;
      }
      const a = vertices[left]!;
      const b = vertices[right]!;
      const raw: MutableVec3 = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
      const length = Math.hypot(...raw);
      const created = vertices.length;
      vertices.push([raw[0] / length, raw[1] / length, raw[2] / length]);
      midpointByEdge.set(key, created);
      return created;
    };
    const nextFaces: Array<[number, number, number]> = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      nextFaces.push(
        [a, ab, ca],
        [b, bc, ab],
        [c, ca, bc],
        [ab, bc, ca],
      );
    }
    faces = nextFaces;
  }
  faces = faces.map((face) => {
    const [a, b, c] = face.map((index) => vertices[index]!) as unknown as [
      MutableVec3,
      MutableVec3,
      MutableVec3,
    ];
    const ab: MutableVec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: MutableVec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal: MutableVec3 = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const centroid: MutableVec3 = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ];
    return normal[0] * centroid[0] +
        normal[1] * centroid[1] +
        normal[2] * centroid[2] > 0
      ? face
      : [face[0], face[2], face[1]];
  });
  const minimumPlaneDistance = Math.min(...faces.map(([ia, ib, ic]) => {
    const a = vertices[ia]!;
    const b = vertices[ib]!;
    const c = vertices[ic]!;
    const ab: MutableVec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: MutableVec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal: MutableVec3 = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    return Math.abs(
      normal[0] * a[0] + normal[1] * a[1] + normal[2] * a[2],
    ) / Math.hypot(...normal);
  }));
  const scale = radiusMeters / minimumPlaneDistance;
  vertices = vertices.map((point) =>
    point.map((entry) => entry * scale) as MutableVec3
  );
  return {
    localPositionsMetersXYZ: vertices.flat(),
    triangleIndices: faces.flat(),
  };
}

export function emitStaticColliderTriangleMeshV1(
  shape: StaticColliderTriangleShapeV1,
): StaticColliderTriangleMeshV1 {
  if (typeof shape !== "object" || isNil(shape) || !("kind" in shape)) {
    fail("shape must be a discriminated object.");
  }
  let mesh: StaticColliderTriangleMeshV1;
  switch (shape.kind) {
    case "box":
      mesh = boxMesh(shape);
      break;
    case "cylinder":
      mesh = cylinderMesh(shape);
      break;
    case "sphere":
      mesh = sphereMesh(shape);
      break;
    default:
      fail("shape.kind is unsupported.");
  }
  return deepFreeze({
    localPositionsMetersXYZ: [...mesh.localPositionsMetersXYZ],
    triangleIndices: [...mesh.triangleIndices],
  });
}

function requireFiniteVec3(
  value: readonly [number, number, number],
  path: string,
  requirePositive: boolean,
): void {
  if (!Array.isArray(value) || value.length !== 3) {
    fail(`${path} must be a 3-tuple.`);
  }
  value.forEach((entry, index) => {
    if (
      !Number.isFinite(entry) ||
      (requirePositive && !(entry > 0))
    ) {
      fail(
        `${path}[${index}] must be ${
          requirePositive ? "a positive finite" : "a finite"
        } number.`,
      );
    }
  });
}

function transformStaticColliderPoint(
  point: readonly [number, number, number],
  transform: StaticColliderTransformV1,
): MutableVec3 {
  let [x, y, z] = point.map((value, index) =>
    value * transform.scaleXYZ[index]!
  ) as MutableVec3;
  const [pitch, yaw, roll] = transform.rotationEulerRadiansXYZ;
  const cosineRoll = Math.cos(roll);
  const sineRoll = Math.sin(roll);
  [x, y] = [
    x * cosineRoll - y * sineRoll,
    x * sineRoll + y * cosineRoll,
  ];
  const cosinePitch = Math.cos(pitch);
  const sinePitch = Math.sin(pitch);
  [y, z] = [
    y * cosinePitch - z * sinePitch,
    y * sinePitch + z * cosinePitch,
  ];
  const cosineYaw = Math.cos(yaw);
  const sineYaw = Math.sin(yaw);
  [x, z] = [
    x * cosineYaw + z * sineYaw,
    -x * sineYaw + z * cosineYaw,
  ];
  return [
    x + transform.positionMetersXYZ[0],
    y + transform.positionMetersXYZ[1],
    z + transform.positionMetersXYZ[2],
  ];
}

/**
 * Emits the exact static-collider triangle topology after canonical full TRS.
 * The Euler composition matches Babylon Quaternion.FromEulerAngles: yaw(Y) *
 * pitch(X) * roll(Z).
 */
export function emitTransformedStaticColliderTriangleMeshV1(
  shape: StaticColliderTriangleShapeV1,
  transform: StaticColliderTransformV1,
): StaticColliderWorldTriangleMeshV1 {
  requireFiniteVec3(transform.positionMetersXYZ, "transform.positionMetersXYZ", false);
  requireFiniteVec3(
    transform.rotationEulerRadiansXYZ,
    "transform.rotationEulerRadiansXYZ",
    false,
  );
  requireFiniteVec3(transform.scaleXYZ, "transform.scaleXYZ", true);
  const local = emitStaticColliderTriangleMeshV1(shape);
  const worldPositionsMetersXYZ: number[] = [];
  for (let offset = 0; offset < local.localPositionsMetersXYZ.length; offset += 3) {
    worldPositionsMetersXYZ.push(...transformStaticColliderPoint([
      local.localPositionsMetersXYZ[offset]!,
      local.localPositionsMetersXYZ[offset + 1]!,
      local.localPositionsMetersXYZ[offset + 2]!,
    ], transform));
  }
  return deepFreeze({
    worldPositionsMetersXYZ,
    triangleIndices: [...local.triangleIndices],
  });
}

/** Returns the highest vertical hit on an exact world-space triangle mesh. */
export function queryStaticColliderTriangleMeshSupportHeightMetersV1(
  worldMesh: StaticColliderWorldTriangleMeshV1,
  pointMetersXZ: readonly [number, number],
): number | undefined {
  const [pointX, pointZ] = pointMetersXZ;
  if (!Number.isFinite(pointX) || !Number.isFinite(pointZ)) {
    fail("pointMetersXZ must contain finite numbers.");
  }
  let highestHitMeters = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < worldMesh.triangleIndices.length; offset += 3) {
    const firstIndex = worldMesh.triangleIndices[offset]! * 3;
    const secondIndex = worldMesh.triangleIndices[offset + 1]! * 3;
    const thirdIndex = worldMesh.triangleIndices[offset + 2]! * 3;
    const ax = worldMesh.worldPositionsMetersXYZ[firstIndex]!;
    const ay = worldMesh.worldPositionsMetersXYZ[firstIndex + 1]!;
    const az = worldMesh.worldPositionsMetersXYZ[firstIndex + 2]!;
    const bx = worldMesh.worldPositionsMetersXYZ[secondIndex]!;
    const by = worldMesh.worldPositionsMetersXYZ[secondIndex + 1]!;
    const bz = worldMesh.worldPositionsMetersXYZ[secondIndex + 2]!;
    const cx = worldMesh.worldPositionsMetersXYZ[thirdIndex]!;
    const cy = worldMesh.worldPositionsMetersXYZ[thirdIndex + 1]!;
    const cz = worldMesh.worldPositionsMetersXYZ[thirdIndex + 2]!;
    const geometry = describeWorldTriangleV1(
      [ax, ay, az],
      [bx, by, bz],
      [cx, cy, cz],
    );
    if (isNil(geometry)) {
      continue;
    }
    const sample = samplePointOnWorldTriangleV1(geometry, [pointX, pointZ]);
    if (isNil(sample) || !isBarycentricInsideFacadeV1(sample.barycentricUVW)) {
      continue;
    }
    if (sample.heightMeters > highestHitMeters) {
      highestHitMeters = sample.heightMeters;
    }
  }
  return Number.isFinite(highestHitMeters) ? highestHitMeters : undefined;
}
