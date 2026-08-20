import { describe, expect, it } from "vitest";

import {
  BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
  generateLayoutCandidatesV1,
  resolveLayoutSolverProfileV1,
  type LayoutCandidateGenerationInputV1,
  type LayoutSolverProfileV1,
} from "./index.js";

function profile(
  maximumCandidatesPerEntity = 256,
): LayoutSolverProfileV1 {
  const base = resolveLayoutSolverProfileV1(
    BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
  ).profile;
  return {
    ...structuredClone(base),
    candidateGeneration: {
      gridSpacingMeters: 3,
      boundarySampleSpacingMeters: 2,
      routeSampleSpacingMeters: 2,
      yawStepDegrees: 180,
    },
    budgets: {
      ...base.budgets,
      maximumCandidatesPerEntity,
    },
  };
}

function input(): LayoutCandidateGenerationInputV1 {
  return {
    entity: {
      id: "tower",
      semanticClassId: "landmark.tower",
      halfExtentsMetersXYZ: [0.5, 1, 0.5],
      placement: {
        kind: "solved",
        initialTransform: {
          positionMetersXYZ: [1.23456, 1, -2.34567],
          rotationEulerRadiansXYZ: [0, 0.1234567, 0],
          scaleXYZ: [1, 1, 1],
        },
        placementConstraintIds: ["inside-zone"],
      },
      candidateRegionIds: ["zone-b", "zone-a"],
      candidateRouteIds: ["route-b", "route-a"],
      explicitAnchorEntityIds: ["anchor-b", "anchor-a"],
      supportingTerrainEntityId: "terrain",
    },
    regions: [
      {
        id: "zone-b",
        kind: "polygon-xz",
        pointsMetersXZ: [[10, 10], [14, 10], [14, 14], [10, 14]],
        semanticClassId: "terrain.zone",
      },
      {
        id: "zone-a",
        kind: "polygon-xz",
        pointsMetersXZ: [[0, 0], [4, 0], [4, 4], [0, 4]],
        semanticClassId: "terrain.zone",
      },
    ],
    routes: [
      {
        id: "route-b",
        kind: "polyline-xz",
        pointsMetersXZ: [[20, 0], [24, 0]],
        widthMeters: 2,
        locomotionProfileRef: "worldkit://locomotion-profile/test@1",
      },
      {
        id: "route-a",
        kind: "polyline-xz",
        pointsMetersXZ: [[-8, 0], [-4, 0]],
        widthMeters: 2,
        locomotionProfileRef: "worldkit://locomotion-profile/test@1",
      },
    ],
    anchorsByEntityId: {
      "anchor-b": {
        positionMetersXYZ: [32, 1, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
      "anchor-a": {
        positionMetersXYZ: [30, 1, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
    },
    geometry: {
      heightfieldsByTerrainEntityId: {
        terrain: {
          terrainEntityId: "terrain",
          centerMetersXZ: [12, 6],
          sizeMetersXZ: [48, 24],
          resolutionVerticesXZ: [2, 2],
          heightSamplesMeters: [0, 0, 0, 0],
        },
      },
      staticBoundsByEntityId: {},
      camerasByEntityId: {},
    },
  };
}

describe("deterministic layout candidate generation", () => {
  it("orders initial, region grid, boundary, route, and anchor candidates", () => {
    const candidates = generateLayoutCandidatesV1(input(), profile());
    const firstIndexBySource = new Map<string, number>();
    candidates.forEach((candidate, index) => {
      if (!firstIndexBySource.has(candidate.source.kind)) {
        firstIndexBySource.set(candidate.source.kind, index);
      }
    });

    expect(candidates[0]).toMatchObject({
      id: "tower:initial:000000",
      isInitial: true,
      source: { kind: "initial" },
      transform: {
        positionMetersXYZ: [1.235, 1, -2.346],
        rotationEulerRadiansXYZ: [0, 0.123457, 0],
      },
    });
    expect([...firstIndexBySource.keys()]).toEqual([
      "initial",
      "region-grid",
      "region-boundary",
      "route",
      "anchor",
    ]);
    expect(candidates[firstIndexBySource.get("region-grid")!]?.source).toMatchObject({
      regionId: "zone-a",
    });
    expect(candidates[firstIndexBySource.get("route")!]?.source).toMatchObject({
      routeId: "route-a",
    });
    expect(candidates[firstIndexBySource.get("anchor")!]?.source).toEqual({
      kind: "anchor",
      anchorEntityId: "anchor-a",
    });
    expect(candidates.every((candidate, index) =>
      candidate.id === `tower:${candidate.source.kind}:${String(index).padStart(6, "0")}`
    )).toBe(true);
  });

  it("is invariant to input collection order and emits unique quantized transforms", () => {
    const original = input();
    const permuted: LayoutCandidateGenerationInputV1 = {
      ...structuredClone(original),
      regions: [...original.regions].reverse(),
      routes: [...original.routes].reverse(),
      entity: {
        ...original.entity,
        candidateRegionIds: [...original.entity.candidateRegionIds].reverse(),
        candidateRouteIds: [...original.entity.candidateRouteIds].reverse(),
        explicitAnchorEntityIds: [...original.entity.explicitAnchorEntityIds].reverse(),
      },
    };

    expect(generateLayoutCandidatesV1(permuted, profile())).toEqual(
      generateLayoutCandidatesV1(original, profile()),
    );
    const transforms = generateLayoutCandidatesV1(original, profile()).map((candidate) =>
      JSON.stringify(candidate.transform),
    );
    expect(new Set(transforms).size).toBe(transforms.length);
  });

  it("enforces the candidate budget before producing an oversized collection", () => {
    expect(() => generateLayoutCandidatesV1(input(), profile(2))).toThrow(
      "LAYOUT_CANDIDATE_BUDGET_EXCEEDED: 'tower' exceeds 2 candidates.",
    );
  });

  it("projects rotated primitive extents into candidate AABBs", () => {
    const source = input();
    const fixed: LayoutCandidateGenerationInputV1 = {
      ...source,
      entity: {
        ...source.entity,
        halfExtentsMetersXYZ: [1, 1, 2],
        placement: {
          kind: "fixed",
          transform: {
            positionMetersXYZ: [0, 1, 0],
            rotationEulerRadiansXYZ: [0, Math.PI / 2, 0],
            scaleXYZ: [1, 1, 1],
          },
        },
      },
    };

    expect(generateLayoutCandidatesV1(fixed, profile())).toEqual([
      expect.objectContaining({
        bounds: {
          minimumMetersXYZ: [-2, 0, -1],
          maximumMetersXYZ: [2, 2, 1],
        },
      }),
    ]);
  });

  it("rejects non-finite and degenerate geometry before search", () => {
    const source = input();
    const invalid: LayoutCandidateGenerationInputV1 = {
      ...source,
      regions: source.regions.map((region, index) =>
        index === 0
          ? { ...region, pointsMetersXZ: [[0, 0], [1, 1], [2, 2]] as const }
          : region
      ),
    };
    expect(() => generateLayoutCandidatesV1(invalid, profile())).toThrow(
      "LAYOUT_POLYGON_DEGENERATE",
    );

    const invalidProfile = profile() as unknown as {
      candidateGeneration: { gridSpacingMeters: number };
    } & LayoutSolverProfileV1;
    invalidProfile.candidateGeneration.gridSpacingMeters = Number.NaN;
    expect(() => generateLayoutCandidatesV1(input(), invalidProfile)).toThrow(
      "LAYOUT_CANDIDATE_PROFILE_INVALID",
    );
  });
});
