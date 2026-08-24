import { describe, expect, it } from "vitest";

import {
  TRAVERSAL_SURFACE_QUERY_AREA_EPSILON_SQUARE_METERS_V1,
  TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1,
  TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1,
  emitTriangleHeightfieldSurfaceV1,
  preflightCanonicalTraversalSurfaceOverlapsV1,
  queryCanonicalTraversalSurfaceHitsV1,
  sampleTriangleHeightfieldSurface,
  type CanonicalTraversalSurfaceTriangleSourceV1,
  type QueryCanonicalTraversalSurfaceHitsInputV1,
} from "./index.js";
import * as terrainSurface from "./index.js";
import * as traversalSurfaceQueryModule from "./traversal-surface-query.js";

const XZ_EPSILON = TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1;
const DELTA = 1e-7;

function horizontalSource(
  traversalSurfaceId: string,
  originMetersXZ: readonly [number, number] = [0, 0],
  sizeMeters = 1,
  heightMeters = 0,
): CanonicalTraversalSurfaceTriangleSourceV1 {
  const [originX, originZ] = originMetersXZ;
  return {
    traversalSurfaceId,
    worldPositionsMetersXYZ: [
      originX, heightMeters, originZ,
      originX, heightMeters, originZ + sizeMeters,
      originX + sizeMeters, heightMeters, originZ,
    ],
    triangleIndices: [0, 1, 2],
  };
}

function queryHits(
  partial: Partial<QueryCanonicalTraversalSurfaceHitsInputV1> &
    Pick<QueryCanonicalTraversalSurfaceHitsInputV1, "sources">,
) {
  return queryCanonicalTraversalSurfaceHitsV1({
    pointMetersXZ: [0.3, 0.3],
    referenceHeightMeters: 0,
    maximumReferenceHeightDifferenceMeters: 4,
    normalAdmission: {
      mode: "upward-slope",
      minimumUpwardNormalYRatio: 0.1,
    },
    ...partial,
  });
}

function preflight(
  sources: readonly CanonicalTraversalSurfaceTriangleSourceV1[],
  extra: Record<string, unknown> = {},
) {
  return preflightCanonicalTraversalSurfaceOverlapsV1({
    sources,
    minimumUpwardNormalYRatio: 0.1,
    maximumSameBandHeightDifferenceMeters: 0.2,
    maximumEquivalentPlaneHeightDifferenceMeters: 0.2,
    minimumEquivalentPlaneNormalDotRatio: 0.99999,
    maximumTraversalSurfaceTrianglePairTestCount: 4_000_000,
    ...extra,
  } as never);
}

describe("canonical traversal surface query constants", () => {
  it("freezes the three public tolerances with separated dimensions", () => {
    expect(TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1).toBe(0.00001);
    expect(TRAVERSAL_SURFACE_QUERY_AREA_EPSILON_SQUARE_METERS_V1).toBe(1e-10);
    expect(TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1).toBe(0.00001);
    expect(
      TRAVERSAL_SURFACE_QUERY_AREA_EPSILON_SQUARE_METERS_V1,
    ).toBeCloseTo(XZ_EPSILON * XZ_EPSILON, 20);
  });

  it("does not export the package-private pair classifier", () => {
    expect("classifyProjectedTriangleOverlapV1" in terrainSurface).toBe(false);
    expect("describeWorldTriangleV1" in terrainSurface).toBe(false);
  });
});

describe("queryCanonicalTraversalSurfaceHitsV1", () => {
  it("rejects finite triangle inputs whose derived geometry becomes non-finite", () => {
    const overflow: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "overflow",
      worldPositionsMetersXYZ: [
        0, 0, 0,
        0, 0, 1e200,
        1e200, 0, 0,
      ],
      triangleIndices: [0, 1, 2],
    };

    expect(() => queryHits({
      sources: [overflow],
      pointMetersXZ: [0, 0],
    })).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
  });

  it("rejects a finite retained normal whose normalization overflows", () => {
    expect(() => queryHits({
      sources: [horizontalSource("floor")],
      normalAdmission: {
        mode: "retained-support",
        minimumUpwardNormalYRatio: 0,
        referenceNormalXYZ: [
          Number.MAX_VALUE,
          Number.MAX_VALUE,
          0,
        ],
        minimumReferenceNormalDotRatio: 0,
      },
    })).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
  });

  it("classifies XZ offsets by meter distance on both 1m and 100m triangles", () => {
    for (const sizeMeters of [1, 100]) {
      const surface = horizontalSource("floor", [0, 0], sizeMeters);
      const pointX = sizeMeters / 2;
      const interior = queryHits({
        sources: [surface],
        pointMetersXZ: [pointX, XZ_EPSILON + DELTA],
      });
      const exact = queryHits({
        sources: [surface],
        pointMetersXZ: [pointX, XZ_EPSILON],
      });
      const insideBand = queryHits({
        sources: [surface],
        pointMetersXZ: [pointX, XZ_EPSILON - DELTA],
      });
      expect(interior.mode).toBe("resolved");
      if (interior.mode === "resolved") {
        expect(interior.hit.location).toBe("interior");
      }
      expect(exact.mode).toBe("resolved");
      if (exact.mode === "resolved") {
        expect(exact.hit.location).toBe("boundary-only");
      }
      expect(insideBand.mode).toBe("resolved");
      if (insideBand.mode === "resolved") {
        expect(insideBand.hit.location).toBe("boundary-only");
      }
    }
  });

  it("rejects downward bottoms and vertical walls without flipping normals", () => {
    const bottom: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "bottom",
      worldPositionsMetersXYZ: [0, 0, 0, 1, 0, 0, 0, 0, 1],
      triangleIndices: [0, 1, 2],
    };
    const wall: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "wall",
      worldPositionsMetersXYZ: [0, 0, 0, 0, 2, 0, 0, 0, 2],
      triangleIndices: [0, 1, 2],
    };
    const top = horizontalSource("top", [0, 0], 1, 1);
    expect(queryHits({
      sources: [bottom, wall],
      pointMetersXZ: [0.2, 0.2],
      referenceHeightMeters: 0,
    }).mode).toBe("missing");
    const resolved = queryHits({
      sources: [bottom, wall, top],
      pointMetersXZ: [0.2, 0.2],
      referenceHeightMeters: 1,
      maximumReferenceHeightDifferenceMeters: 2,
    });
    expect(resolved.mode).toBe("resolved");
    if (resolved.mode === "resolved") {
      expect(resolved.hit.traversalSurfaceId).toBe("top");
      expect(resolved.hit.normalXYZ[1]).toBeGreaterThan(0.9);
    }
  });

  it("admits a legal slope and rejects an over-slope face", () => {
    const legal: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "legal-slope",
      worldPositionsMetersXYZ: [0, 0, 0, 0, 0.5, 1, 1, 0, 0],
      triangleIndices: [0, 1, 2],
    };
    const steep: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "steep-slope",
      worldPositionsMetersXYZ: [0, 0, 0, 0, 2, 1, 1, 0, 0],
      triangleIndices: [0, 1, 2],
    };
    const admission = {
      mode: "upward-slope" as const,
      minimumUpwardNormalYRatio: Math.cos((45 * Math.PI) / 180),
    };
    const legalHit = queryHits({
      sources: [legal],
      pointMetersXZ: [0.2, 0.2],
      referenceHeightMeters: 0.2,
      normalAdmission: admission,
    });
    const steepHit = queryHits({
      sources: [steep],
      pointMetersXZ: [0.2, 0.2],
      referenceHeightMeters: 0.4,
      normalAdmission: admission,
    });
    expect(legalHit.mode).toBe("resolved");
    expect(steepHit.mode).toBe("missing");
  });

  it("resolves two triangles of one Heightfield Surface on the canonical diagonal", () => {
    const input = {
      centerMetersXZ: [0, 0] as const,
      sizeMetersXZ: [2, 2] as const,
      resolutionVerticesXZ: [2, 2] as const,
      heightSamplesMeters: [0, 0, 0, 0],
    };
    const mesh = emitTriangleHeightfieldSurfaceV1(input);
    const worldPositionsMetersXYZ = mesh.localPositionsMetersXYZ.map(
      (value, index) => value + mesh.originMetersXYZ[index % 3]!,
    );
    const source: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "heightfield",
      worldPositionsMetersXYZ,
      triangleIndices: mesh.triangleIndices,
    };
    const diagonal = queryHits({
      sources: [source],
      pointMetersXZ: [0, 0],
    });
    expect(diagonal.mode).toBe("resolved");
    if (diagonal.mode === "resolved") {
      expect(diagonal.hit.traversalSurfaceId).toBe("heightfield");
      expect(diagonal.hits).toHaveLength(1);
    }
  });

  it("lets a unique interior beat another surface's boundary-only hit", () => {
    const interior = horizontalSource("alpha", [0, 0], 2, 0);
    const boundaryNeighbor = horizontalSource("beta", [1, 0], 1, 0);
    const resolution = queryHits({
      sources: [boundaryNeighbor, interior],
      pointMetersXZ: [1, 0.3],
    });
    expect(resolution.mode).toBe("resolved");
    if (resolution.mode === "resolved") {
      expect(resolution.hit.traversalSurfaceId).toBe("alpha");
      expect(resolution.hit.location).toBe("interior");
    }
  });

  it("is ambiguous for two distinct interior Surface IDs even when coplanar", () => {
    const left = horizontalSource("left", [0, 0], 2, 0);
    const right = horizontalSource("right", [0, 0], 2, 0);
    const resolution = queryHits({
      sources: [right, left],
      pointMetersXZ: [0.4, 0.4],
    });
    expect(resolution.mode).toBe("ambiguous");
    if (resolution.mode === "ambiguous") {
      expect(resolution.hits.map((hit) => hit.traversalSurfaceId)).toEqual([
        "left",
        "right",
      ]);
    }
  });

  it("selects the code-point-lowest boundary-only Surface ID", () => {
    const zebra = horizontalSource("zebra", [0, 0], 1, 0);
    const alpha = horizontalSource("alpha", [0, 0], 1, 0);
    const resolution = queryHits({
      sources: [zebra, alpha],
      pointMetersXZ: [0.5, 0],
    });
    expect(resolution.mode).toBe("resolved");
    if (resolution.mode === "resolved") {
      expect(resolution.hit.traversalSurfaceId).toBe("alpha");
      expect(resolution.hit.location).toBe("boundary-only");
    }
  });

  it.each([
    {
      name: "flat-to-ramp",
      referenceHeightMeters: 0,
      first: {
        traversalSurfaceId: "z-flat",
        worldPositionsMetersXYZ: [0, 0, 0, 0, 0, 1, 1, 0, 0],
        triangleIndices: [0, 1, 2],
      },
      second: {
        traversalSurfaceId: "a-ramp",
        worldPositionsMetersXYZ: [0, 0, 0, -1, 1, 0, 0, 0, 1],
        triangleIndices: [0, 1, 2],
      },
    },
    {
      name: "ridge",
      referenceHeightMeters: 1,
      first: {
        traversalSurfaceId: "z-right-slope",
        worldPositionsMetersXYZ: [0, 1, 0, 0, 1, 1, 1, 0, 0],
        triangleIndices: [0, 1, 2],
      },
      second: {
        traversalSurfaceId: "a-left-slope",
        worldPositionsMetersXYZ: [0, 1, 0, -1, 0, 0, 0, 1, 1],
        triangleIndices: [0, 1, 2],
      },
    },
    {
      name: "legal-0.25m-step",
      referenceHeightMeters: 0.125,
      first: {
        traversalSurfaceId: "z-lower-step",
        worldPositionsMetersXYZ: [0, 0, 0, 0, 0, 1, 1, 0, 0],
        triangleIndices: [0, 1, 2],
      },
      second: {
        traversalSurfaceId: "a-upper-step",
        worldPositionsMetersXYZ: [0, 0.25, 0, -1, 0.25, 0, 0, 0.25, 1],
        triangleIndices: [0, 1, 2],
      },
    },
  ])("uses the lowest boundary owner at a $name seam", ({
    referenceHeightMeters,
    first,
    second,
  }) => {
    const resolution = queryHits({
      sources: [first, second],
      pointMetersXZ: [0, 0.4],
      referenceHeightMeters,
      maximumReferenceHeightDifferenceMeters: 0.2,
      normalAdmission: {
        mode: "upward-slope",
        minimumUpwardNormalYRatio: 0.5,
      },
    });

    expect(resolution.mode).toBe("resolved");
    if (resolution.mode === "resolved") {
      expect(resolution.hit.traversalSurfaceId).toBe(
        second.traversalSurfaceId,
      );
      expect(resolution.hit.location).toBe("boundary-only");
      expect(resolution.hits).toHaveLength(2);
    }
  });

  it("keeps canonical ordinals assigned before slope filtering", () => {
    const mixed: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "mixed",
      worldPositionsMetersXYZ: [
        0, 0, 0, 0, 3, 0, 0, 0, 1,
        0, 0, 0, 0, 0, 1, 1, 0, 0,
        0, 0.05, 0, 0, 0.05, 1, 1, 0.05, 0,
      ],
      triangleIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    };
    const resolution = queryHits({
      sources: [mixed],
      pointMetersXZ: [0.3, 0.3],
      referenceHeightMeters: 0,
      maximumReferenceHeightDifferenceMeters: 0.2,
      normalAdmission: {
        mode: "upward-slope",
        minimumUpwardNormalYRatio: 0.7,
      },
    });
    expect(resolution.mode).toBe("resolved");
    if (resolution.mode === "resolved") {
      expect(resolution.hit.heightMeters).toBeCloseTo(0, 6);
    }
  });

  it("preserves query output when the source inventory is reversed", () => {
    const first = horizontalSource("a-floor", [0, 0], 1, 0);
    const second = horizontalSource("b-floor", [3, 3], 1, 0);
    const forward = queryHits({ sources: [second, first] });
    const reversed = queryHits({ sources: [first, second] });
    expect(reversed).toEqual(forward);
  });

  it("rejects malformed input and accepts open sheets plus projected walls", () => {
    const legal = horizontalSource("sheet", [0, 0], 1, 0);
    expect(() => queryHits({
      sources: [{ ...legal, extra: true } as never],
    })).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
    expect(() => queryHits({
      sources: [{ ...legal, triangleIndices: [0, 1] }],
    })).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
    expect(() => queryHits({
      sources: [{ ...legal, triangleIndices: [0, 1, 9] }],
    })).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
    expect(() => queryHits({
      sources: [{
        ...legal,
        worldPositionsMetersXYZ: [0, Number.NaN, 0, 0, 0, 1, 1, 0, 0],
      }],
    })).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
    expect(() => queryHits({
      sources: [legal, horizontalSource("sheet")],
    })).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
    expect(() => queryHits({
      sources: [{
        traversalSurfaceId: "zero",
        worldPositionsMetersXYZ: [0, 0, 0, 1, 0, 0, 2, 0, 0],
        triangleIndices: [0, 1, 2],
      }],
    })).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
    expect(() => queryHits({
      sources: [legal],
      normalAdmission: {
        mode: "sideways",
        minimumUpwardNormalYRatio: 0.5,
      } as never,
    })).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
    const wall: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "open-wall",
      worldPositionsMetersXYZ: [0, 0, 0, 0, 1, 0, 0, 0, 1],
      triangleIndices: [0, 1, 2],
    };
    expect(queryHits({ sources: [legal, wall] }).mode).toBe("resolved");
    const frozen = queryHits({ sources: [legal] });
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.hits)).toBe(true);
    if (frozen.mode === "resolved") {
      expect(Object.isFrozen(frozen.hit)).toBe(true);
      expect(Object.isFrozen(frozen.hit.normalXYZ)).toBe(true);
    }
  });
});

describe("preflightCanonicalTraversalSurfaceOverlapsV1", () => {
  it("rejects non-finite geometry derivation before overlap classification", () => {
    const overflow: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "overflow",
      worldPositionsMetersXYZ: [
        0, 0, 0,
        0, 0, 1e200,
        1e200, 0, 0,
      ],
      triangleIndices: [0, 1, 2],
    };

    expect(() => preflight([
      overflow,
      horizontalSource("floor"),
    ])).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
  });

  it("rejects a non-finite translated polygon area derived from finite triangles", () => {
    const origin = 1e160;
    const extent = 1e145;
    const translated = (traversalSurfaceId: string): CanonicalTraversalSurfaceTriangleSourceV1 => ({
      traversalSurfaceId,
      worldPositionsMetersXYZ: [
        origin, 0, origin,
        origin, 0, origin + extent,
        origin + extent, 0, origin,
      ],
      triangleIndices: [0, 1, 2],
    });

    expect(() => preflight([
      translated("translated-a"),
      translated("translated-b"),
    ])).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
  });

  it("blocks coplanar interior overlap and crossing same-band slopes", () => {
    const first = horizontalSource("platform-a", [0, 0], 2, 0);
    const second = horizontalSource("platform-b", [0.5, 0.5], 2, 0);
    expect(preflight([first, second]).mode).toBe("blocked");

    const up: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "up-slope",
      worldPositionsMetersXYZ: [0, 0, 0, 0, 1, 2, 2, 0, 0],
      triangleIndices: [0, 1, 2],
    };
    const down: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "down-slope",
      worldPositionsMetersXYZ: [0, 1, 0, 0, 0, 2, 2, 1, 0],
      triangleIndices: [0, 1, 2],
    };
    expect(preflight([up, down], {
      maximumSameBandHeightDifferenceMeters: 0.05,
    }).mode).toBe("blocked");
  });

  it("keeps exact boundary-only boxes, a 1cm gap, and stacked layers clear", () => {
    const left = horizontalSource("left", [0, 0], 1, 0);
    const right = horizontalSource("right", [1, 0], 1, 0);
    expect(preflight([left, right]).mode).toBe("clear");

    const gapped = horizontalSource("gapped", [1.01, 0], 1, 0);
    expect(preflight([left, gapped]).mode).toBe("clear");

    const lower = horizontalSource("lower", [0, 0], 1, 0);
    const upper = horizontalSource("upper", [0, 0], 1, 1);
    expect(preflight([lower, upper], {
      maximumSameBandHeightDifferenceMeters: 0.2,
    }).mode).toBe("clear");
  });

  it("streams budget-exceeded on the second overlapping candidate when the limit is 1", () => {
    const first = horizontalSource("layer-a", [0, 0], 4, 0);
    const second: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "layer-b",
      worldPositionsMetersXYZ: [
        0, 2, 0, 0, 2, 4, 2, 2, 0,
        1, 2, 1, 1, 2, 3, 3, 2, 1,
      ],
      triangleIndices: [0, 1, 2, 3, 4, 5],
    };
    const result = preflight([first, second], {
      maximumTraversalSurfaceTrianglePairTestCount: 1,
      maximumSameBandHeightDifferenceMeters: 0.1,
    });
    expect(result).toEqual({
      mode: "budget-exceeded",
      reason: "traversal-surface-triangle-pair-test-budget-exceeded",
      maximumAllowedCount: 1,
      minimumRequiredCount: 2,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("counts downward candidates before normal admission", () => {
    const upward: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "upward",
      worldPositionsMetersXYZ: [0, 0, 0, 0, 0, 2, 2, 0, 0],
      triangleIndices: [0, 1, 2],
    };
    const downward: CanonicalTraversalSurfaceTriangleSourceV1 = {
      traversalSurfaceId: "downward",
      worldPositionsMetersXYZ: [
        0, 2, 0, 2, 2, 0, 0, 2, 2,
        0, 3, 0, 2, 3, 0, 0, 3, 2,
      ],
      triangleIndices: [0, 1, 2, 3, 4, 5],
    };

    expect(preflight([upward, downward], {
      maximumTraversalSurfaceTrianglePairTestCount: 1,
    })).toEqual({
      mode: "budget-exceeded",
      reason: "traversal-surface-triangle-pair-test-budget-exceeded",
      maximumAllowedCount: 1,
      minimumRequiredCount: 2,
    });
  });

  it("rejects forged pair budgets before broadphase work", () => {
    const first = horizontalSource("a");
    const second = horizontalSource("b", [0, 0], 1, 2);
    for (const budget of [0, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER, -4]) {
      expect(() => preflight([first, second], {
        maximumTraversalSurfaceTrianglePairTestCount: budget,
      })).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
    }
    expect(() => preflight([first, second], {
      minimumEquivalentPlaneNormalDotRatio: 0,
    })).toThrow("TRAVERSAL_SURFACE_QUERY_INPUT_INVALID");
  });

  it("preserves preflight output when sources are reversed", () => {
    const lower = horizontalSource("lower", [0, 0], 1, 0);
    const upper = horizontalSource("upper", [0, 0], 1, 1);
    expect(preflight([upper, lower])).toEqual(preflight([lower, upper]));
  });

  it("preserves the canonical blocker and witness when sources are reversed", () => {
    const alpha = horizontalSource("alpha", [0, 0], 2, 0);
    const zeta = horizontalSource("zeta", [0, 0], 2, 0);
    const expected = {
      mode: "blocked",
      blocker: {
        firstTraversalSurfaceId: "alpha",
        secondTraversalSurfaceId: "zeta",
        witnessPointMetersXZ: [0, 0],
        minimumHeightDifferenceMeters: 0,
      },
    };

    expect(preflight([zeta, alpha])).toEqual(expected);
    expect(preflight([alpha, zeta])).toEqual(expected);
  });
});

describe("package-private deterministic XZ broadphase", () => {
  type BroadphaseFactory = (entries: readonly Readonly<{
      ordinal: number;
      minimumMetersXZ: readonly [number, number];
      maximumMetersXZ: readonly [number, number];
    }>[]) => Readonly<{
      overlappingOrdinals(
        minimumMetersXZ: readonly [number, number],
        maximumMetersXZ: readonly [number, number],
      ): Iterable<number>;
    }>;
  const factory = (
    traversalSurfaceQueryModule as unknown as {
      createTriangleXzBroadphaseIndexV1?: BroadphaseFactory;
    }
  ).createTriangleXzBroadphaseIndexV1;

  it("returns overlapping triangle ordinals in canonical order", () => {
    expect(factory).toBeTypeOf("function");
    if (factory === undefined) return;
    const index = factory([
      {
        ordinal: 7,
        minimumMetersXZ: [100, 100],
        maximumMetersXZ: [101, 101],
      },
      {
        ordinal: 4,
        minimumMetersXZ: [0.5, 0.5],
        maximumMetersXZ: [2, 2],
      },
      {
        ordinal: 1,
        minimumMetersXZ: [-1, -1],
        maximumMetersXZ: [0.25, 0.25],
      },
    ]);

    expect([...index.overlappingOrdinals([0, 0], [1, 1])]).toEqual([1, 4]);
  });

  it("streams a fully covered root in strict canonical order under entry reversal", () => {
    expect(factory).toBeTypeOf("function");
    if (factory === undefined) return;
    const entries = [
      {
        ordinal: 5,
        minimumMetersXZ: [4, 4] as const,
        maximumMetersXZ: [5, 5] as const,
      },
      {
        ordinal: 1,
        minimumMetersXZ: [-5, -5] as const,
        maximumMetersXZ: [-4, -4] as const,
      },
      {
        ordinal: 3,
        minimumMetersXZ: [0, 0] as const,
        maximumMetersXZ: [1, 1] as const,
      },
    ];
    const queryMinimum = [-10, -10] as const;
    const queryMaximum = [10, 10] as const;

    expect([
      ...factory(entries).overlappingOrdinals(queryMinimum, queryMaximum),
    ]).toEqual([1, 3, 5]);
    expect([
      ...factory([...entries].reverse()).overlappingOrdinals(
        queryMinimum,
        queryMaximum,
      ),
    ]).toEqual([1, 3, 5]);
  });

  it("builds a large source without exceeding the JavaScript argument limit", () => {
    expect(factory).toBeTypeOf("function");
    if (factory === undefined) return;
    const entries = Array.from({ length: 130_000 }, (_, ordinal) => ({
      ordinal,
      minimumMetersXZ: [ordinal * 2, 0] as const,
      maximumMetersXZ: [ordinal * 2 + 1, 1] as const,
    }));

    expect(() => factory(entries)).not.toThrow();
  });
});

describe("shared triangle facade", () => {
  it("keeps heightfield sampling aligned with the shared query", () => {
    const input = {
      centerMetersXZ: [0, 0] as const,
      sizeMetersXZ: [2, 2] as const,
      resolutionVerticesXZ: [2, 2] as const,
      heightSamplesMeters: [0, 2, 4, 0],
    };
    const sample = sampleTriangleHeightfieldSurface(input, [0, 0]);
    const mesh = emitTriangleHeightfieldSurfaceV1(input);
    const worldPositionsMetersXYZ = mesh.localPositionsMetersXYZ.map(
      (value, index) => value + mesh.originMetersXYZ[index % 3]!,
    );
    const resolution = queryCanonicalTraversalSurfaceHitsV1({
      sources: [{
        traversalSurfaceId: "heightfield",
        worldPositionsMetersXYZ,
        triangleIndices: mesh.triangleIndices,
      }],
      pointMetersXZ: [0, 0],
      referenceHeightMeters: sample?.heightMeters ?? 0,
      maximumReferenceHeightDifferenceMeters: 1,
      normalAdmission: {
        mode: "upward-slope",
        minimumUpwardNormalYRatio: 0,
      },
    });
    expect(resolution.mode).toBe("resolved");
    if (resolution.mode === "resolved") {
      expect(resolution.hit.heightMeters).toBeCloseTo(sample?.heightMeters ?? 0, 10);
    }
  });
});
