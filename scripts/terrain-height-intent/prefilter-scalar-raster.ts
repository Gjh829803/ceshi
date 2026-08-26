export interface PrefilteredScalarRasterV0 {
  readonly columns: number;
  readonly rows: number;
  readonly values: Float32Array;
  readonly radiusPixelsXY: readonly [number, number];
}

function requireRasterDimension(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 2) {
    throw new Error(`${fieldName} must be a safe integer of at least 2.`);
  }
}

function prefilterRadiusPixels(sourceSize: number, targetSize: number): number {
  if (targetSize >= sourceSize) return 0;
  const endpointAlignedScale = (sourceSize - 1) / (targetSize - 1);
  return Math.max(1, Math.floor(endpointAlignedScale / 2));
}

function blurRows(
  source: Float32Array,
  columns: number,
  rows: number,
  radiusPixels: number,
): Float64Array {
  const output = new Float64Array(source.length);
  const prefix = new Float64Array(columns + 1);
  for (let row = 0; row < rows; row += 1) {
    prefix[0] = 0;
    const rowOffset = row * columns;
    for (let column = 0; column < columns; column += 1) {
      prefix[column + 1] = prefix[column]! + source[rowOffset + column]!;
    }
    for (let column = 0; column < columns; column += 1) {
      const minimumColumn = Math.max(0, column - radiusPixels);
      const maximumColumn = Math.min(columns - 1, column + radiusPixels);
      output[rowOffset + column] =
        (prefix[maximumColumn + 1]! - prefix[minimumColumn]!) /
        (maximumColumn - minimumColumn + 1);
    }
  }
  return output;
}

function blurColumns(
  source: Float64Array,
  columns: number,
  rows: number,
  radiusPixels: number,
): Float32Array {
  const output = new Float32Array(source.length);
  const prefix = new Float64Array(rows + 1);
  for (let column = 0; column < columns; column += 1) {
    prefix[0] = 0;
    for (let row = 0; row < rows; row += 1) {
      prefix[row + 1] = prefix[row]! + source[row * columns + column]!;
    }
    for (let row = 0; row < rows; row += 1) {
      const minimumRow = Math.max(0, row - radiusPixels);
      const maximumRow = Math.min(rows - 1, row + radiusPixels);
      output[row * columns + column] =
        (prefix[maximumRow + 1]! - prefix[minimumRow]!) /
        (maximumRow - minimumRow + 1);
    }
  }
  return output;
}

export function prefilterScalarRasterForDownsampleV0(
  input: {
    readonly columns: number;
    readonly rows: number;
    readonly values: Float32Array;
  },
  targetResolutionVerticesXY: readonly [number, number],
): PrefilteredScalarRasterV0 {
  requireRasterDimension(input.columns, "columns");
  requireRasterDimension(input.rows, "rows");
  requireRasterDimension(targetResolutionVerticesXY[0], "targetResolutionVerticesXY[0]");
  requireRasterDimension(targetResolutionVerticesXY[1], "targetResolutionVerticesXY[1]");
  const expectedSampleCount = input.columns * input.rows;
  if (!Number.isSafeInteger(expectedSampleCount)) {
    throw new Error("Scalar raster sample count exceeds the safe integer range.");
  }
  if (input.values.length !== expectedSampleCount) {
    throw new Error(
      `Scalar raster sample count must be ${expectedSampleCount}; received ${input.values.length}.`,
    );
  }
  if (input.values.some((value) => !Number.isFinite(value))) {
    throw new Error("Scalar raster values must be finite.");
  }

  const radiusPixelsXY = [
    prefilterRadiusPixels(input.columns, targetResolutionVerticesXY[0]),
    prefilterRadiusPixels(input.rows, targetResolutionVerticesXY[1]),
  ] as const;
  if (radiusPixelsXY[0] === 0 && radiusPixelsXY[1] === 0) {
    return {
      columns: input.columns,
      rows: input.rows,
      values: new Float32Array(input.values),
      radiusPixelsXY,
    };
  }

  const horizontallyFiltered = radiusPixelsXY[0] === 0
    ? Float64Array.from(input.values)
    : blurRows(input.values, input.columns, input.rows, radiusPixelsXY[0]);
  const values = radiusPixelsXY[1] === 0
    ? Float32Array.from(horizontallyFiltered)
    : blurColumns(horizontallyFiltered, input.columns, input.rows, radiusPixelsXY[1]);
  return {
    columns: input.columns,
    rows: input.rows,
    values,
    radiusPixelsXY,
  };
}
