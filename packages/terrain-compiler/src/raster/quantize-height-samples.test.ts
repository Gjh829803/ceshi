import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import { quantizeUnprotectedTerrainHeightSamplesMeters } from
  "./quantize-height-samples";

describe("quantizeUnprotectedTerrainHeightSamplesMeters", () => {
  it("quantizes only unprotected samples without mutating caller buffers", () => {
    const heightSamplesMeters = new Float32Array([
      -0,
      1.24,
      2.26,
      3.141_592_7,
    ]);
    const protectedSampleMask = new Uint8Array([0, 0, 0, 1]);
    const beforeHeights = new Float32Array(heightSamplesMeters);
    const beforeMask = new Uint8Array(protectedSampleMask);

    const result = quantizeUnprotectedTerrainHeightSamplesMeters({
      heightSamplesMeters,
      protectedSampleMask,
      quantumMeters: 0.1,
    });

    expect(result).toEqual({
      heightSamplesMeters: [0, 1.2, 2.3, heightSamplesMeters[3]],
      quantizedSampleCount: 3,
      protectedSampleCount: 1,
    });
    expect(Object.is(result.heightSamplesMeters[0], -0)).toBe(false);
    expect(heightSamplesMeters).toEqual(beforeHeights);
    expect(protectedSampleMask).toEqual(beforeMask);
  });

  it("keeps a representative 2km 801x801 base field under the 8MiB JSON boundary", () => {
    const sampleCount = 801 * 801;
    const heightSamplesMeters = new Float32Array(sampleCount);
    for (let index = 0; index < sampleCount; index += 1) {
      heightSamplesMeters[index] = -45 + (index % 1351) / 10;
    }

    const result = quantizeUnprotectedTerrainHeightSamplesMeters({
      heightSamplesMeters,
      protectedSampleMask: new Uint8Array(sampleCount),
      quantumMeters: 0.1,
    });
    const byteLength = new TextEncoder().encode(stringifyCanonicalJson({
      heightSamplesMeters: result.heightSamplesMeters,
    })).byteLength;

    expect(result.quantizedSampleCount).toBe(641_601);
    expect(result.protectedSampleCount).toBe(0);
    expect(byteLength).toBeLessThan(8 * 1024 * 1024);
  });

  it("rejects invalid quantum, shape mismatch, and non-finite samples", () => {
    for (const input of [
      {
        heightSamplesMeters: new Float32Array([0]),
        protectedSampleMask: new Uint8Array([0]),
        quantumMeters: 0,
      },
      {
        heightSamplesMeters: new Float32Array([0]),
        protectedSampleMask: new Uint8Array(0),
        quantumMeters: 0.1,
      },
      {
        heightSamplesMeters: new Float32Array([Number.NaN]),
        protectedSampleMask: new Uint8Array([0]),
        quantumMeters: 0.1,
      },
      {
        heightSamplesMeters: new Float32Array([0]),
        protectedSampleMask: new Uint8Array([0]),
        quantumMeters: 0.3,
      },
    ]) {
      expect(() => quantizeUnprotectedTerrainHeightSamplesMeters(input)).toThrow(
        "TERRAIN_HEIGHT_SAMPLE_QUANTIZATION_INVALID",
      );
    }
  });
});
