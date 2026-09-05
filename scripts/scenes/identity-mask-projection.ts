export type IdentityMaskProjectionV1 = Readonly<
  | { outcome: "not-visible"; pixelCount: 0 }
  | {
      outcome: "visible";
      pixelCount: number;
      normalizedBounds: Readonly<{
        minXBasisPoints: number; minYBasisPoints: number;
        maxXBasisPoints: number; maxYBasisPoints: number;
      }>;
      normalizedCenter: Readonly<{ xBasisPoints: number; yBasisPoints: number }>;
      coverageBasisPoints: number;
    }
>;

/** Measures admitted identity pixels, never the enclosing rectangle's area.
 * Label zero is unclassified; positive labels are one-based palette indices.
 * Absence alone cannot distinguish occlusion, out-of-frame or missing geometry.
 */
export function measureIdentityMaskProjectionsV1(input: Readonly<{
  widthPixels: number;
  heightPixels: number;
  targetCount: number;
  admittedTargetByPixel: Uint8Array;
}>): readonly IdentityMaskProjectionV1[] {
  const { widthPixels, heightPixels, targetCount, admittedTargetByPixel } = input;
  const totalPixels = widthPixels * heightPixels;
  if (
    !Number.isSafeInteger(widthPixels) || widthPixels <= 0 ||
    !Number.isSafeInteger(heightPixels) || heightPixels <= 0 ||
    !Number.isSafeInteger(targetCount) || targetCount < 0 || targetCount > 255 ||
    !Number.isSafeInteger(totalPixels) || admittedTargetByPixel.length !== totalPixels
  ) throw new TypeError("IDENTITY_MASK_PROJECTION_INVALID: dimensions or palette");

  const accumulators = Array.from({ length: targetCount }, () => ({
    pixelCount: 0, minX: widthPixels, minY: heightPixels, maxX: -1, maxY: -1,
  }));
  for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += 1) {
    const label = admittedTargetByPixel[pixelIndex]!;
    if (label === 0) continue;
    const target = accumulators[label - 1];
    if (target === undefined) throw new TypeError("IDENTITY_MASK_PROJECTION_INVALID: unknown label");
    const x = pixelIndex % widthPixels;
    const y = Math.floor(pixelIndex / widthPixels);
    target.pixelCount += 1;
    target.minX = Math.min(target.minX, x);
    target.minY = Math.min(target.minY, y);
    target.maxX = Math.max(target.maxX, x);
    target.maxY = Math.max(target.maxY, y);
  }
  return Object.freeze(accumulators.map((target): IdentityMaskProjectionV1 => {
    if (target.pixelCount === 0) return Object.freeze({ outcome: "not-visible", pixelCount: 0 });
    const normalizedBounds = Object.freeze({
      minXBasisPoints: Math.floor(target.minX * 10000 / widthPixels),
      minYBasisPoints: Math.floor(target.minY * 10000 / heightPixels),
      maxXBasisPoints: Math.ceil((target.maxX + 1) * 10000 / widthPixels),
      maxYBasisPoints: Math.ceil((target.maxY + 1) * 10000 / heightPixels),
    });
    return Object.freeze({
      outcome: "visible", pixelCount: target.pixelCount, normalizedBounds,
      normalizedCenter: Object.freeze({
        xBasisPoints: Math.round((normalizedBounds.minXBasisPoints + normalizedBounds.maxXBasisPoints) / 2),
        yBasisPoints: Math.round((normalizedBounds.minYBasisPoints + normalizedBounds.maxYBasisPoints) / 2),
      }),
      coverageBasisPoints: Math.max(1, Math.round(target.pixelCount * 10000 / totalPixels)),
    });
  }));
}
