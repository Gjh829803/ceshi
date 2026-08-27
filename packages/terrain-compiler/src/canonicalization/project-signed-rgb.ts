export const SIGNED_HEIGHT_INTENT_PROFILE = Object.freeze({
  id: "signed-diverging-blue-gray-orange@1",
  depressionRgb: Object.freeze([32, 64, 208] as const),
  datumRgb: Object.freeze([128, 128, 128] as const),
  elevationRgb: Object.freeze([224, 96, 32] as const),
  maximumMeanRampResidualRgbUnits: 60,
  maximumP95RampResidualRgbUnits: 90,
});

export interface SignedHeightIntentRgbInput {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly rgbBytes: Uint8Array;
}

export interface SignedHeightIntentProjection {
  readonly profileId: typeof SIGNED_HEIGHT_INTENT_PROFILE.id;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly heightRatios: Float32Array;
  readonly rampResidualRgbUnits: Float32Array;
}

interface SegmentProjection {
  readonly heightRatio: number;
  readonly residualRgbUnits: number;
}

function projectRgbToSegment(
  red: number,
  green: number,
  blue: number,
  startRgb: readonly [number, number, number],
  endRgb: readonly [number, number, number],
  startHeightRatio: number,
): SegmentProjection {
  const deltaRed = endRgb[0] - startRgb[0];
  const deltaGreen = endRgb[1] - startRgb[1];
  const deltaBlue = endRgb[2] - startRgb[2];
  const segmentLengthSquared =
    deltaRed * deltaRed + deltaGreen * deltaGreen + deltaBlue * deltaBlue;
  const unclampedRatio =
    ((red - startRgb[0]) * deltaRed +
      (green - startRgb[1]) * deltaGreen +
      (blue - startRgb[2]) * deltaBlue) /
    segmentLengthSquared;
  const segmentRatio = Math.min(1, Math.max(0, unclampedRatio));
  const projectedRed = startRgb[0] + segmentRatio * deltaRed;
  const projectedGreen = startRgb[1] + segmentRatio * deltaGreen;
  const projectedBlue = startRgb[2] + segmentRatio * deltaBlue;

  return {
    heightRatio: startHeightRatio + segmentRatio,
    residualRgbUnits: Math.hypot(
      red - projectedRed,
      green - projectedGreen,
      blue - projectedBlue,
    ),
  };
}

function requirePositivePixelDimension(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer.`);
  }
}

export function projectSignedHeightIntentRgb(
  input: SignedHeightIntentRgbInput,
): SignedHeightIntentProjection {
  requirePositivePixelDimension(input.widthPixels, "widthPixels");
  requirePositivePixelDimension(input.heightPixels, "heightPixels");

  const pixelCount = input.widthPixels * input.heightPixels;
  const expectedRgbByteCount = pixelCount * 3;
  if (!Number.isSafeInteger(expectedRgbByteCount)) {
    throw new Error("Raster RGB byte count exceeds the safe integer range.");
  }
  if (input.rgbBytes.length !== expectedRgbByteCount) {
    throw new Error(
      `RGB byte count must be ${expectedRgbByteCount} for ${input.widthPixels}x${input.heightPixels}; received ${input.rgbBytes.length}.`,
    );
  }

  const heightRatios = new Float32Array(pixelCount);
  const rampResidualRgbUnits = new Float32Array(pixelCount);
  const { depressionRgb, datumRgb, elevationRgb } = SIGNED_HEIGHT_INTENT_PROFILE;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const byteIndex = pixelIndex * 3;
    const red = input.rgbBytes[byteIndex]!;
    const green = input.rgbBytes[byteIndex + 1]!;
    const blue = input.rgbBytes[byteIndex + 2]!;
    const depressionProjection = projectRgbToSegment(
      red,
      green,
      blue,
      depressionRgb,
      datumRgb,
      -1,
    );
    const elevationProjection = projectRgbToSegment(
      red,
      green,
      blue,
      datumRgb,
      elevationRgb,
      0,
    );
    const projection =
      elevationProjection.residualRgbUnits < depressionProjection.residualRgbUnits
        ? elevationProjection
        : depressionProjection;

    heightRatios[pixelIndex] = projection.heightRatio;
    rampResidualRgbUnits[pixelIndex] = projection.residualRgbUnits;
  }

  return {
    profileId: SIGNED_HEIGHT_INTENT_PROFILE.id,
    widthPixels: input.widthPixels,
    heightPixels: input.heightPixels,
    heightRatios,
    rampResidualRgbUnits,
  };
}
