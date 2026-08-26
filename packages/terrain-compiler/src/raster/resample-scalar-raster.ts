export interface ScalarRasterV0 {
  readonly columns: number;
  readonly rows: number;
  readonly values: Float32Array;
}

function requireRasterDimension(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 2) {
    throw new Error(`${fieldName} must be a safe integer of at least 2.`);
  }
}

function requireFiniteRaster(input: ScalarRasterV0): void {
  requireRasterDimension(input.columns, "columns");
  requireRasterDimension(input.rows, "rows");
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
    throw new Error("Scalar raster samples must be finite.");
  }
}

export function resampleScalarRasterBilinearV0(
  input: ScalarRasterV0,
  outputResolutionVerticesXZ: readonly [columns: number, rows: number],
): ScalarRasterV0 {
  requireFiniteRaster(input);
  const [outputColumns, outputRows] = outputResolutionVerticesXZ;
  requireRasterDimension(outputColumns, "output columns");
  requireRasterDimension(outputRows, "output rows");
  const outputSampleCount = outputColumns * outputRows;
  if (!Number.isSafeInteger(outputSampleCount)) {
    throw new Error("Output scalar raster sample count exceeds the safe integer range.");
  }

  const values = new Float32Array(outputSampleCount);
  const maximumSourceColumn = input.columns - 1;
  const maximumSourceRow = input.rows - 1;

  for (let outputRow = 0; outputRow < outputRows; outputRow += 1) {
    const sourceRow = (outputRow / (outputRows - 1)) * maximumSourceRow;
    const row0 = Math.floor(sourceRow);
    const row1 = Math.min(row0 + 1, maximumSourceRow);
    const rowRatio = sourceRow - row0;

    for (let outputColumn = 0; outputColumn < outputColumns; outputColumn += 1) {
      const sourceColumn = (outputColumn / (outputColumns - 1)) * maximumSourceColumn;
      const column0 = Math.floor(sourceColumn);
      const column1 = Math.min(column0 + 1, maximumSourceColumn);
      const columnRatio = sourceColumn - column0;
      const topLeft = input.values[row0 * input.columns + column0]!;
      const topRight = input.values[row0 * input.columns + column1]!;
      const bottomLeft = input.values[row1 * input.columns + column0]!;
      const bottomRight = input.values[row1 * input.columns + column1]!;
      const top = topLeft + (topRight - topLeft) * columnRatio;
      const bottom = bottomLeft + (bottomRight - bottomLeft) * columnRatio;

      values[outputRow * outputColumns + outputColumn] =
        top + (bottom - top) * rowRatio;
    }
  }

  return {
    columns: outputColumns,
    rows: outputRows,
    values,
  };
}
