import { describe, expect, it } from "vitest";

import { triangulatePolygonMetersXZV1 } from "./polygon-triangulation.js";

function signedArea(
  points: readonly (readonly [number, number])[],
): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

describe("Babylon polygon water triangulation", () => {
  it("preserves the area of an asymmetric concave shoreline", () => {
    const shoreline = [
      [-8, -8],
      [8, -8],
      [7, 7],
      [2, 3],
      [0, 7],
      [-6, 4],
    ] as const;
    const indices = triangulatePolygonMetersXZV1(shoreline);
    const triangleArea = Array.from(
      { length: indices.length / 3 },
      (_, triangleIndex) => {
        const a = shoreline[indices[triangleIndex * 3]!]!;
        const b = shoreline[indices[triangleIndex * 3 + 1]!]!;
        const c = shoreline[indices[triangleIndex * 3 + 2]!]!;
        return Math.abs(signedArea([a, b, c]));
      },
    ).reduce((sum, area) => sum + area, 0);

    expect(indices).toHaveLength((shoreline.length - 2) * 3);
    expect(triangleArea).toBeCloseTo(Math.abs(signedArea(shoreline)), 10);
  });

  it.each([
    { points: [] as readonly (readonly [number, number])[] },
    { points: [[0, 0]] as const },
    { points: [[0, 0], [1, 1]] as const },
    { points: [[0, 0], [1, 1], [2, 2]] as const },
  ])("fails closed for an invalid or degenerate polygon", ({ points }) => {
    expect(() => triangulatePolygonMetersXZV1(points)).toThrow();
  });
});
