export interface SignedHeightMeterMappingInputV0 {
  readonly heightRatios: Float32Array;
  readonly minimumHeightMeters: number;
  readonly datumHeightMeters: number;
  readonly maximumHeightMeters: number;
}

export function mapSignedHeightRatiosToMetersV0(
  input: SignedHeightMeterMappingInputV0,
): Float32Array {
  const bounds = [
    input.minimumHeightMeters,
    input.datumHeightMeters,
    input.maximumHeightMeters,
  ];
  if (bounds.some((value) => !Number.isFinite(value))) {
    throw new Error("Terrain height bounds must be finite.");
  }
  if (input.minimumHeightMeters >= input.datumHeightMeters) {
    throw new Error("minimumHeightMeters must be less than datumHeightMeters.");
  }
  if (input.datumHeightMeters >= input.maximumHeightMeters) {
    throw new Error("maximumHeightMeters must be greater than datumHeightMeters.");
  }

  const heightSamplesMeters = new Float32Array(input.heightRatios.length);
  for (let index = 0; index < input.heightRatios.length; index += 1) {
    const ratio = input.heightRatios[index]!;
    if (!Number.isFinite(ratio)) {
      throw new Error("Signed height ratios must be finite.");
    }
    if (ratio < -1 || ratio > 1) {
      throw new Error("Signed height ratios must remain within -1..1.");
    }

    heightSamplesMeters[index] = ratio < 0
      ? input.datumHeightMeters +
        (input.datumHeightMeters - input.minimumHeightMeters) * ratio
      : input.datumHeightMeters +
        (input.maximumHeightMeters - input.datumHeightMeters) * ratio;
  }

  return heightSamplesMeters;
}
