import type { SignedHeightIntentProjectionV0 } from "./project-signed-rgb";

export interface TerrainIntentProjectionSummaryV0 {
  readonly minimumHeightRatio: number;
  readonly medianHeightRatio: number;
  readonly maximumHeightRatio: number;
  readonly meanRampResidualRgbUnits: number;
  readonly p95RampResidualRgbUnits: number;
  readonly meanNeighborDeltaRatio: number;
  readonly p95NeighborDeltaRatio: number;
}

function requirePositiveDimension(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer.`);
  }
}

function requireFiniteSamples(
  samples: Float32Array,
  expectedCount: number,
  fieldName: string,
): void {
  if (samples.length !== expectedCount) {
    throw new Error(`${fieldName} sample count must be ${expectedCount}; received ${samples.length}.`);
  }
  if (samples.some((sample) => !Number.isFinite(sample))) {
    throw new Error(`${fieldName} samples must be finite.`);
  }
}

function mean(samples: readonly number[]): number {
  if (samples.length === 0) {
    return 0;
  }
  return samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
}

function nearestRankPercentile(sortedSamples: readonly number[], ratio: number): number {
  if (sortedSamples.length === 0) {
    return 0;
  }
  const index = Math.max(0, Math.ceil(ratio * sortedSamples.length) - 1);
  return sortedSamples[index]!;
}

export function summarizeTerrainIntentProjectionV0(
  projection: SignedHeightIntentProjectionV0,
): TerrainIntentProjectionSummaryV0 {
  requirePositiveDimension(projection.widthPixels, "widthPixels");
  requirePositiveDimension(projection.heightPixels, "heightPixels");
  const sampleCount = projection.widthPixels * projection.heightPixels;
  if (!Number.isSafeInteger(sampleCount)) {
    throw new Error("Projection sample count exceeds the safe integer range.");
  }
  requireFiniteSamples(projection.heightRatios, sampleCount, "heightRatios");
  requireFiniteSamples(
    projection.rampResidualRgbUnits,
    sampleCount,
    "rampResidualRgbUnits",
  );

  const sortedRatios = Array.from(projection.heightRatios).sort((left, right) => left - right);
  const residuals = Array.from(projection.rampResidualRgbUnits);
  const sortedResiduals = [...residuals].sort((left, right) => left - right);
  const neighborDeltas: number[] = [];

  for (let row = 0; row < projection.heightPixels; row += 1) {
    for (let column = 0; column < projection.widthPixels; column += 1) {
      const sampleIndex = row * projection.widthPixels + column;
      const heightRatio = projection.heightRatios[sampleIndex]!;
      if (column + 1 < projection.widthPixels) {
        neighborDeltas.push(
          Math.abs(projection.heightRatios[sampleIndex + 1]! - heightRatio),
        );
      }
      if (row + 1 < projection.heightPixels) {
        neighborDeltas.push(
          Math.abs(
            projection.heightRatios[sampleIndex + projection.widthPixels]! - heightRatio,
          ),
        );
      }
    }
  }
  neighborDeltas.sort((left, right) => left - right);

  return {
    minimumHeightRatio: sortedRatios[0]!,
    medianHeightRatio: nearestRankPercentile(sortedRatios, 0.5),
    maximumHeightRatio: sortedRatios[sortedRatios.length - 1]!,
    meanRampResidualRgbUnits: mean(residuals),
    p95RampResidualRgbUnits: nearestRankPercentile(sortedResiduals, 0.95),
    meanNeighborDeltaRatio: mean(neighborDeltas),
    p95NeighborDeltaRatio: nearestRankPercentile(neighborDeltas, 0.95),
  };
}
