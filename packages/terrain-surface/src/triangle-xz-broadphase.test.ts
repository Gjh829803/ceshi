import { describe, expect, it } from "vitest";

import {
  createTriangleXzBroadphaseIndexV1,
  type TriangleXzBroadphaseEntryV1,
} from "./triangle-xz-broadphase.js";

function query(
  entries: readonly TriangleXzBroadphaseEntryV1[],
  minimumMetersXZ: readonly [number, number],
  maximumMetersXZ: readonly [number, number],
): readonly number[] {
  return [
    ...createTriangleXzBroadphaseIndexV1(entries).overlappingOrdinals(
      minimumMetersXZ,
      maximumMetersXZ,
    ),
  ];
}

describe("deterministic XZ broadphase", () => {
  it("returns no ordinals for an empty index", () => {
    expect(query([], [0, 0], [1, 1])).toEqual([]);
  });

  it("uses inclusive AABB boundaries and returns ordinals in canonical order", () => {
    const entries = [
      {
        ordinal: 9,
        minimumMetersXZ: [1, 1] as const,
        maximumMetersXZ: [2, 2] as const,
      },
      {
        ordinal: 2,
        minimumMetersXZ: [-2, -2] as const,
        maximumMetersXZ: [0, 0] as const,
      },
      {
        ordinal: 5,
        minimumMetersXZ: [0, 0] as const,
        maximumMetersXZ: [0.5, 0.5] as const,
      },
      {
        ordinal: 7,
        minimumMetersXZ: [3, 3] as const,
        maximumMetersXZ: [4, 4] as const,
      },
    ];

    expect(query(entries, [0, 0], [1, 1])).toEqual([2, 5, 9]);
    expect(query([...entries].reverse(), [0, 0], [1, 1])).toEqual([
      2,
      5,
      9,
    ]);
  });

  it("keeps equal bounds deterministic independently of insertion order", () => {
    const entries = [11, 3, 8].map((ordinal) => ({
      ordinal,
      minimumMetersXZ: [-1, -1] as const,
      maximumMetersXZ: [1, 1] as const,
    }));

    expect(query(entries, [-0.25, -0.25], [0.25, 0.25])).toEqual([
      3,
      8,
      11,
    ]);
  });

  it("does not return a nearby disjoint entry", () => {
    expect(query([
      {
        ordinal: 1,
        minimumMetersXZ: [0, 0],
        maximumMetersXZ: [1, 1],
      },
      {
        ordinal: 2,
        minimumMetersXZ: [1.000_001, 0],
        maximumMetersXZ: [2, 1],
      },
    ], [0.25, 0.25], [1, 0.75])).toEqual([1]);
  });
});
