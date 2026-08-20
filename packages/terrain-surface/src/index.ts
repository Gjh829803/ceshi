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

/** Samples the same top-right-to-bottom-left triangle diagonal used by terrain meshes. */
export function sampleTriangleHeightfieldSurface(
  input: TriangleHeightfieldSurfaceInput,
  pointMetersXZ: TerrainSurfaceVec2,
): TriangleHeightfieldSurfaceSample | undefined {
  const [columns, rows] = input.resolutionVerticesXZ;
  const minimumX = input.centerMetersXZ[0] - input.sizeMetersXZ[0] / 2;
  const minimumZ = input.centerMetersXZ[1] - input.sizeMetersXZ[1] / 2;
  const u = (pointMetersXZ[0] - minimumX) / input.sizeMetersXZ[0];
  const v = (pointMetersXZ[1] - minimumZ) / input.sizeMetersXZ[1];
  if (u < 0 || u > 1 || v < 0 || v > 1) return undefined;

  const columnPosition = u * (columns - 1);
  const rowPosition = v * (rows - 1);
  const column = Math.min(columns - 2, Math.floor(columnPosition));
  const row = Math.min(rows - 2, Math.floor(rowPosition));
  const tx = columnPosition - column;
  const tz = rowPosition - row;
  const at = (x: number, z: number): number =>
    input.heightSamplesMeters[z * columns + x]!;
  const h00 = at(column, row);
  const h10 = at(column + 1, row);
  const h01 = at(column, row + 1);
  const h11 = at(column + 1, row + 1);
  const dxMeters = input.sizeMetersXZ[0] / (columns - 1);
  const dzMeters = input.sizeMetersXZ[1] / (rows - 1);

  const isTopLeftTriangle = tx + tz <= 1;
  const heightMeters = isTopLeftTriangle
    ? h00 + (h10 - h00) * tx + (h01 - h00) * tz
    : h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  const derivativeX = isTopLeftTriangle
    ? (h10 - h00) / dxMeters
    : (h11 - h01) / dxMeters;
  const derivativeZ = isTopLeftTriangle
    ? (h01 - h00) / dzMeters
    : (h11 - h10) / dzMeters;
  const normalLength = Math.hypot(derivativeX, 1, derivativeZ);

  return {
    heightMeters,
    normalXYZ: [
      -derivativeX / normalLength,
      1 / normalLength,
      -derivativeZ / normalLength,
    ],
    slopeDegrees:
      Math.atan(Math.hypot(derivativeX, derivativeZ)) * (180 / Math.PI),
  };
}
