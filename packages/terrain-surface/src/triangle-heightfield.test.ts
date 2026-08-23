import { describe, expect, it } from "vitest";

import * as terrainSurface from "./index.js";

type HeightfieldInput = terrainSurface.TriangleHeightfieldSurfaceInput;
type HeightfieldMesh = Readonly<{
  originMetersXYZ: readonly [number, number, number];
  localPositionsMetersXYZ: readonly number[];
  triangleIndices: readonly number[];
}>;

function emitter(): (input: HeightfieldInput) => HeightfieldMesh {
  const candidate = (
    terrainSurface as typeof terrainSurface & {
      emitTriangleHeightfieldSurfaceV1?: (input: HeightfieldInput) => HeightfieldMesh;
    }
  ).emitTriangleHeightfieldSurfaceV1;
  expect(candidate).toBeTypeOf("function");
  return candidate!;
}

function signedAreaXZ(
  positions: readonly number[],
  firstIndex: number,
  secondIndex: number,
  thirdIndex: number,
): number {
  const firstOffset = firstIndex * 3;
  const secondOffset = secondIndex * 3;
  const thirdOffset = thirdIndex * 3;
  const firstX = positions[firstOffset]!;
  const firstZ = positions[firstOffset + 2]!;
  const secondX = positions[secondOffset]!;
  const secondZ = positions[secondOffset + 2]!;
  const thirdX = positions[thirdOffset]!;
  const thirdZ = positions[thirdOffset + 2]!;
  return (
    (secondX - firstX) * (thirdZ - firstZ) -
    (secondZ - firstZ) * (thirdX - firstX)
  ) / 2;
}

function normalY(
  positions: readonly number[],
  firstIndex: number,
  secondIndex: number,
  thirdIndex: number,
): number {
  const firstOffset = firstIndex * 3;
  const secondOffset = secondIndex * 3;
  const thirdOffset = thirdIndex * 3;
  const edgeAX = positions[secondOffset]! - positions[firstOffset]!;
  const edgeAZ = positions[secondOffset + 2]! - positions[firstOffset + 2]!;
  const edgeBX = positions[thirdOffset]! - positions[firstOffset]!;
  const edgeBZ = positions[thirdOffset + 2]! - positions[firstOffset + 2]!;
  return edgeAZ * edgeBX - edgeAX * edgeBZ;
}

describe("canonical triangle heightfield topology", () => {
  it("emits non-square row-major local vertices and exact positive-Y triangle indices", () => {
    const mesh = emitter()({
      centerMetersXZ: [10, -4],
      sizeMetersXZ: [4, 6],
      resolutionVerticesXZ: [3, 2],
      heightSamplesMeters: [0, 1, 2, 3, 4, 5],
    });

    expect(mesh).toEqual({
      originMetersXYZ: [10, 0, -4],
      localPositionsMetersXYZ: [
        -2, 0, -3,
        0, 1, -3,
        2, 2, -3,
        -2, 3, 3,
        0, 4, 3,
        2, 5, 3,
      ],
      triangleIndices: [0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5],
    });
    for (let offset = 0; offset < mesh.triangleIndices.length; offset += 3) {
      const firstIndex = mesh.triangleIndices[offset]!;
      const secondIndex = mesh.triangleIndices[offset + 1]!;
      const thirdIndex = mesh.triangleIndices[offset + 2]!;
      expect(signedAreaXZ(
        mesh.localPositionsMetersXYZ,
        firstIndex,
        secondIndex,
        thirdIndex,
      )).toBeLessThan(0);
      expect(normalY(
        mesh.localPositionsMetersXYZ,
        firstIndex,
        secondIndex,
        thirdIndex,
      )).toBeGreaterThan(0);
    }
  });

  it("samples the plane selected by the emitted asymmetric saddle diagonal", () => {
    const input: HeightfieldInput = {
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [2, 2],
      resolutionVerticesXZ: [2, 2],
      heightSamplesMeters: [0, 2, 4, 0],
    };
    expect(emitter()(input).triangleIndices).toEqual([0, 2, 1, 1, 2, 3]);

    const firstTriangle = terrainSurface.sampleTriangleHeightfieldSurface(
      input,
      [-0.5, -0.5],
    );
    expect(firstTriangle?.heightMeters).toBeCloseTo(1.5, 12);
    expect(firstTriangle?.normalXYZ).toEqual([
      -1 / Math.sqrt(6),
      1 / Math.sqrt(6),
      -2 / Math.sqrt(6),
    ]);

    const secondTriangle = terrainSurface.sampleTriangleHeightfieldSurface(
      input,
      [0.5, -0.25],
    );
    expect(secondTriangle?.heightMeters).toBeCloseTo(2.25, 12);
    expect(secondTriangle?.normalXYZ).toEqual([
      2 / Math.sqrt(6),
      1 / Math.sqrt(6),
      1 / Math.sqrt(6),
    ]);
  });

  it("fails closed for invalid dimensions, sizes, centers, and sample bytes", () => {
    const valid: HeightfieldInput = {
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [2, 2],
      resolutionVerticesXZ: [2, 2],
      heightSamplesMeters: [0, 1, 2, 3],
    };
    const invalidInputs: readonly HeightfieldInput[] = [
      { ...valid, centerMetersXZ: [Number.NaN, 0] },
      { ...valid, sizeMetersXZ: [0, 2] },
      { ...valid, sizeMetersXZ: [2, Number.POSITIVE_INFINITY] },
      { ...valid, resolutionVerticesXZ: [1, 2] },
      { ...valid, resolutionVerticesXZ: [2.5, 2] },
      { ...valid, heightSamplesMeters: [0, 1, 2] },
      { ...valid, heightSamplesMeters: [0, 1, Number.NaN, 3] },
    ];

    for (const input of invalidInputs) {
      expect(() => emitter()(input)).toThrow(
        /^TRIANGLE_HEIGHTFIELD_INPUT_INVALID:/,
      );
      expect(() =>
        terrainSurface.sampleTriangleHeightfieldSurface(input, [0, 0]),
      ).toThrow(/^TRIANGLE_HEIGHTFIELD_INPUT_INVALID:/);
    }
  });
});
