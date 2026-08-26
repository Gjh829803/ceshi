export interface NormalizedSignedHeightRaster {
  readonly values: Float32Array;
  readonly medianHeightRatioBefore: number;
  readonly heightRatioOffsetApplied: number;
  readonly inputRange: readonly [minimum: number, maximum: number];
  readonly outputRange: readonly [minimum: number, maximum: number];
  readonly clampedSampleCount: number;
}

export function normalizeSignedHeightRaster(
  values: ArrayLike<number>,
): NormalizedSignedHeightRaster {
  if (!Number.isSafeInteger(values.length) || values.length < 1) {
    throw new Error("Signed height raster must contain at least one sample.");
  }
  const source = Array.from(values);
  let inputMinimum = Number.POSITIVE_INFINITY;
  let inputMaximum = Number.NEGATIVE_INFINITY;
  for (const value of source) {
    if (!Number.isFinite(value)) {
      throw new Error("Signed height raster must contain only finite samples.");
    }
    inputMinimum = Math.min(inputMinimum, value);
    inputMaximum = Math.max(inputMaximum, value);
  }
  const sorted = [...source].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianHeightRatioBefore = sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const rawHeightRatioOffset = -medianHeightRatioBefore;
  const heightRatioOffsetApplied = Object.is(rawHeightRatioOffset, -0)
    ? 0
    : rawHeightRatioOffset;
  let clampedSampleCount = 0;
  let outputMinimum = Number.POSITIVE_INFINITY;
  let outputMaximum = Number.NEGATIVE_INFINITY;
  const normalized = new Float32Array(source.length);
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index]!;
    const translated = value + heightRatioOffsetApplied;
    const clamped = Math.max(-1, Math.min(1, translated));
    if (clamped !== translated) clampedSampleCount += 1;
    const canonical = Object.is(clamped, -0) ? 0 : clamped;
    outputMinimum = Math.min(outputMinimum, canonical);
    outputMaximum = Math.max(outputMaximum, canonical);
    normalized[index] = canonical;
  }
  return {
    values: normalized,
    medianHeightRatioBefore,
    heightRatioOffsetApplied,
    inputRange: [inputMinimum, inputMaximum],
    outputRange: [outputMinimum, outputMaximum],
    clampedSampleCount,
  };
}
