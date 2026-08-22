export {
  queryLockedColliderSupportHeightMeters,
  type LockedSupportColliderV1,
} from "./collider-support.js";
export {
  emitStaticColliderTriangleMeshV1,
  emitTransformedStaticColliderTriangleMeshV1,
  queryStaticColliderTriangleMeshSupportHeightMetersV1,
  type StaticColliderTriangleMeshV1,
  type StaticColliderTriangleShapeV1,
  type StaticColliderTransformV1,
  type StaticColliderWorldTriangleMeshV1,
} from "./static-collider-triangle-mesh.js";

export type TerrainSurfaceVec2 = readonly [x: number, z: number];
export type TerrainSurfaceVec3 = readonly [x: number, y: number, z: number];

export interface TriangleHeightfieldSurfaceInput {
  readonly centerMetersXZ: TerrainSurfaceVec2;
  readonly sizeMetersXZ: TerrainSurfaceVec2;
  readonly resolutionVerticesXZ: readonly [columns: number, rows: number];
  readonly heightSamplesMeters: ArrayLike<number>;
}

export interface TriangleHeightfieldSurfaceSample {
  readonly heightMeters: number;
  readonly normalXYZ: TerrainSurfaceVec3;
  readonly slopeDegrees: number;
}

export interface TriangleHeightfieldMeshV1 {
  readonly originMetersXYZ: TerrainSurfaceVec3;
  readonly localPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
}

function failHeightfieldInput(message: string): never {
  throw new Error(`TRIANGLE_HEIGHTFIELD_INPUT_INVALID: ${message}`);
}

function validateTriangleHeightfieldSurfaceInput(
  input: TriangleHeightfieldSurfaceInput,
): readonly [columns: number, rows: number] {
  const [centerX, centerZ] = input.centerMetersXZ;
  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
    failHeightfieldInput("centerMetersXZ must contain finite numbers.");
  }
  const [sizeX, sizeZ] = input.sizeMetersXZ;
  if (!Number.isFinite(sizeX) || !Number.isFinite(sizeZ) || sizeX <= 0 || sizeZ <= 0) {
    failHeightfieldInput("sizeMetersXZ must contain positive finite numbers.");
  }
  const [columns, rows] = input.resolutionVerticesXZ;
  if (
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 2 ||
    rows < 2
  ) {
    failHeightfieldInput(
      "resolutionVerticesXZ must contain integers greater than or equal to 2.",
    );
  }
  const expectedSampleCount = columns * rows;
  if (
    !Number.isSafeInteger(expectedSampleCount) ||
    input.heightSamplesMeters.length !== expectedSampleCount
  ) {
    failHeightfieldInput(
      "heightSamplesMeters length must equal columns multiplied by rows.",
    );
  }
  for (let index = 0; index < expectedSampleCount; index += 1) {
    if (!Number.isFinite(input.heightSamplesMeters[index])) {
      failHeightfieldInput("heightSamplesMeters must contain only finite numbers.");
    }
  }
  return [columns, rows];
}

function cellTriangleIndices(
  columns: number,
  column: number,
  row: number,
): readonly [number, number, number, number, number, number] {
  const topLeft = row * columns + column;
  const topRight = topLeft + 1;
  const bottomLeft = topLeft + columns;
  const bottomRight = bottomLeft + 1;
  return [
    topLeft,
    bottomLeft,
    topRight,
    topRight,
    bottomLeft,
    bottomRight,
  ];
}

function localVertex(
  input: TriangleHeightfieldSurfaceInput,
  columns: number,
  rows: number,
  vertexIndex: number,
): TerrainSurfaceVec3 {
  const column = vertexIndex % columns;
  const row = Math.floor(vertexIndex / columns);
  const [sizeX, sizeZ] = input.sizeMetersXZ;
  return [
    (column / (columns - 1)) * sizeX - sizeX / 2,
    input.heightSamplesMeters[vertexIndex]!,
    (row / (rows - 1)) * sizeZ - sizeZ / 2,
  ];
}

export function emitTriangleHeightfieldSurfaceV1(
  input: TriangleHeightfieldSurfaceInput,
): TriangleHeightfieldMeshV1 {
  const [columns, rows] = validateTriangleHeightfieldSurfaceInput(input);
  const localPositionsMetersXYZ: number[] = [];
  const triangleIndices: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      localPositionsMetersXYZ.push(
        ...localVertex(input, columns, rows, row * columns + column),
      );
    }
  }
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      triangleIndices.push(...cellTriangleIndices(columns, column, row));
    }
  }

  return {
    originMetersXYZ: [input.centerMetersXZ[0], 0, input.centerMetersXZ[1]],
    localPositionsMetersXYZ,
    triangleIndices,
  };
}

function barycentricWeightsXZ(
  point: TerrainSurfaceVec2,
  first: TerrainSurfaceVec3,
  second: TerrainSurfaceVec3,
  third: TerrainSurfaceVec3,
): readonly [number, number, number] | undefined {
  const denominator =
    (second[2] - third[2]) * (first[0] - third[0]) +
    (third[0] - second[0]) * (first[2] - third[2]);
  const firstWeight = (
    (second[2] - third[2]) * (point[0] - third[0]) +
    (third[0] - second[0]) * (point[1] - third[2])
  ) / denominator;
  const secondWeight = (
    (third[2] - first[2]) * (point[0] - third[0]) +
    (first[0] - third[0]) * (point[1] - third[2])
  ) / denominator;
  const thirdWeight = 1 - firstWeight - secondWeight;
  const tolerance = 1e-12;
  return firstWeight >= -tolerance && secondWeight >= -tolerance && thirdWeight >= -tolerance
    ? [firstWeight, secondWeight, thirdWeight]
    : undefined;
}

function triangleSample(
  point: TerrainSurfaceVec2,
  first: TerrainSurfaceVec3,
  second: TerrainSurfaceVec3,
  third: TerrainSurfaceVec3,
): TriangleHeightfieldSurfaceSample | undefined {
  const weights = barycentricWeightsXZ(point, first, second, third);
  if (weights === undefined) return undefined;
  const edgeAX = second[0] - first[0];
  const edgeAY = second[1] - first[1];
  const edgeAZ = second[2] - first[2];
  const edgeBX = third[0] - first[0];
  const edgeBY = third[1] - first[1];
  const edgeBZ = third[2] - first[2];
  const normalX = edgeAY * edgeBZ - edgeAZ * edgeBY;
  const normalY = edgeAZ * edgeBX - edgeAX * edgeBZ;
  const normalZ = edgeAX * edgeBY - edgeAY * edgeBX;
  const normalLength = Math.hypot(normalX, normalY, normalZ);
  const normalizedY = normalY / normalLength;
  return {
    heightMeters:
      first[1] * weights[0] +
      second[1] * weights[1] +
      third[1] * weights[2],
    normalXYZ: [
      normalX / normalLength,
      normalizedY,
      normalZ / normalLength,
    ],
    slopeDegrees: Math.acos(normalizedY) * (180 / Math.PI),
  };
}

/** Samples the same indexed triangles emitted for terrain meshes. */
export function sampleTriangleHeightfieldSurface(
  input: TriangleHeightfieldSurfaceInput,
  pointMetersXZ: TerrainSurfaceVec2,
): TriangleHeightfieldSurfaceSample | undefined {
  const [columns, rows] = validateTriangleHeightfieldSurfaceInput(input);
  if (!Number.isFinite(pointMetersXZ[0]) || !Number.isFinite(pointMetersXZ[1])) {
    failHeightfieldInput("pointMetersXZ must contain finite numbers.");
  }
  const minimumX = input.centerMetersXZ[0] - input.sizeMetersXZ[0] / 2;
  const minimumZ = input.centerMetersXZ[1] - input.sizeMetersXZ[1] / 2;
  const u = (pointMetersXZ[0] - minimumX) / input.sizeMetersXZ[0];
  const v = (pointMetersXZ[1] - minimumZ) / input.sizeMetersXZ[1];
  if (u < 0 || u > 1 || v < 0 || v > 1) return undefined;

  const columnPosition = u * (columns - 1);
  const rowPosition = v * (rows - 1);
  const column = Math.min(columns - 2, Math.floor(columnPosition));
  const row = Math.min(rows - 2, Math.floor(rowPosition));
  const localPoint: TerrainSurfaceVec2 = [
    pointMetersXZ[0] - input.centerMetersXZ[0],
    pointMetersXZ[1] - input.centerMetersXZ[1],
  ];
  const indices = cellTriangleIndices(columns, column, row);
  for (let triangleOffset = 0; triangleOffset < indices.length; triangleOffset += 3) {
    const sample = triangleSample(
      localPoint,
      localVertex(input, columns, rows, indices[triangleOffset]!),
      localVertex(input, columns, rows, indices[triangleOffset + 1]!),
      localVertex(input, columns, rows, indices[triangleOffset + 2]!),
    );
    if (sample !== undefined) return sample;
  }
  failHeightfieldInput("pointMetersXZ did not resolve to an indexed triangle.");
}
