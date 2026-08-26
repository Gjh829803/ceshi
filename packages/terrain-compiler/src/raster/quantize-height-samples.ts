export interface QuantizeTerrainHeightSamplesInput {
  readonly heightSamplesMeters: Float32Array;
  readonly protectedSampleMask: Uint8Array;
  readonly quantumMeters: number;
}

export interface QuantizedTerrainHeightSamples {
  readonly heightSamplesMeters: readonly number[];
  readonly quantizedSampleCount: number;
  readonly protectedSampleCount: number;
}

function fail(message: string): never {
  throw new Error(`TERRAIN_HEIGHT_SAMPLE_QUANTIZATION_INVALID: ${message}`);
}

export function quantizeUnprotectedTerrainHeightSamplesMeters(
  input: QuantizeTerrainHeightSamplesInput,
): QuantizedTerrainHeightSamples {
  if (!(input.heightSamplesMeters instanceof Float32Array)) {
    fail("heightSamplesMeters must be a Float32Array.");
  }
  if (!(input.protectedSampleMask instanceof Uint8Array)) {
    fail("protectedSampleMask must be a Uint8Array.");
  }
  if (input.heightSamplesMeters.length !== input.protectedSampleMask.length) {
    fail("heightSamplesMeters and protectedSampleMask lengths must match.");
  }
  if (!Number.isFinite(input.quantumMeters) || !(input.quantumMeters > 0)) {
    fail("quantumMeters must be finite and positive.");
  }
  const quantumStepsPerMeter = 1 / input.quantumMeters;
  if (
    !Number.isSafeInteger(quantumStepsPerMeter) ||
    !(quantumStepsPerMeter > 0)
  ) {
    fail("quantumMeters must evenly divide one meter with a safe integer step count.");
  }

  let quantizedSampleCount = 0;
  let protectedSampleCount = 0;
  const heightSamplesMeters = Array.from(
    input.heightSamplesMeters,
    (heightMeters, index) => {
      if (!Number.isFinite(heightMeters)) {
        fail(`heightSamplesMeters[${index}] must be finite.`);
      }
      const protection = input.protectedSampleMask[index]!;
      if (protection !== 0 && protection !== 1) {
        fail(`protectedSampleMask[${index}] must equal 0 or 1.`);
      }
      if (protection === 1) {
        protectedSampleCount += 1;
        return Object.is(heightMeters, -0) ? 0 : heightMeters;
      }
      quantizedSampleCount += 1;
      const quantized = Math.round(heightMeters * quantumStepsPerMeter) /
        quantumStepsPerMeter;
      return Object.is(quantized, -0) ? 0 : quantized;
    },
  );
  return {
    heightSamplesMeters,
    quantizedSampleCount,
    protectedSampleCount,
  };
}
