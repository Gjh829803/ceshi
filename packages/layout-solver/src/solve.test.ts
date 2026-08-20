import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
  hashLayoutSolveReportV1,
  resolveLayoutSolverProfileV1,
  solveLayoutV1,
  type LayoutSolverProfileV1,
  type ResolvedLayoutInputV1,
  type ResolvedPlacementConstraintV1,
} from "./index.js";

const PROFILE_ROW = resolveLayoutSolverProfileV1(BUILT_IN_LAYOUT_SOLVER_PROFILE_REF);

function transform(x: number, z = 0) {
  return {
    positionMetersXYZ: [x, 1, z] as const,
    rotationEulerRadiansXYZ: [0, 0, 0] as const,
    scaleXYZ: [1, 1, 1] as const,
  };
}

function entity(
  id: string,
  anchorEntityIds: readonly string[],
  constraintIds: readonly string[],
) {
  return {
    id,
    semanticClassId: `test.${id}`,
    halfExtentsMetersXYZ: [0.5, 1, 0.5] as const,
    placement: {
      kind: "solved" as const,
      placementConstraintIds: constraintIds,
    },
    candidateRegionIds: [],
    candidateRouteIds: [],
    explicitAnchorEntityIds: anchorEntityIds,
  };
}

function fixedEntity(id: string, x: number) {
  return {
    id,
    semanticClassId: `test.${id}`,
    halfExtentsMetersXYZ: [0.5, 1, 0.5] as const,
    placement: { kind: "fixed" as const, transform: transform(x) },
    candidateRegionIds: [],
    candidateRouteIds: [],
    explicitAnchorEntityIds: [],
  };
}

function input(
  constraints: readonly ResolvedPlacementConstraintV1[],
): ResolvedLayoutInputV1 {
  return {
    kind: "worldkit-resolved-layout-input",
    schemaVersion: 1,
    id: "solver-test",
    authoringSpecHash: `sha256:${"a".repeat(64)}`,
    registryLockHash: `sha256:${"b".repeat(64)}`,
    solverProfile: {
      solverProfileRef: BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
      resolvedVersion: PROFILE_ROW.resolvedVersion,
      contentHash: PROFILE_ROW.contentHash,
    },
    seed: 42,
    worldBounds: {
      minimumMetersXYZ: [-100, -20, -100],
      maximumMetersXYZ: [100, 100, 100],
    },
    entities: [
      entity("a", ["a0", "a1"], constraints.map((row) => row.id)),
      entity("b", ["b0", "b1"], constraints.map((row) => row.id)),
    ],
    regions: [],
    routes: [],
    screenRegions: [],
    constraints,
    anchorsByEntityId: {
      a0: transform(0),
      a1: transform(10),
      b0: transform(0),
      b1: transform(10),
    },
    geometry: {
      heightfieldsByTerrainEntityId: {},
      staticBoundsByEntityId: {},
      camerasByEntityId: {},
    },
  };
}

function profile(overrides: Partial<LayoutSolverProfileV1["budgets"]> = {}): LayoutSolverProfileV1 {
  return {
    ...structuredClone(PROFILE_ROW.profile),
    budgets: { ...PROFILE_ROW.profile.budgets, ...overrides },
  };
}

function bindProfile(
  value: ResolvedLayoutInputV1,
  solverProfile: LayoutSolverProfileV1,
): ResolvedLayoutInputV1 {
  return {
    ...value,
    solverProfile: {
      ...value.solverProfile,
      contentHash: sha256CanonicalJson(solverProfile) as `sha256:${string}`,
    },
  };
}

describe("deterministic layout solver", () => {
  it("backtracks across coupled distance and clearance constraints", () => {
    const constraints = [
      {
        id: "apart",
        kind: "distance-range",
        requirement: "required",
        entityId: "a",
        referenceEntityId: "b",
        minimumDistanceMeters: 9,
        maximumDistanceMeters: 11,
      },
      {
        id: "no-overlap",
        kind: "minimum-clearance",
        requirement: "required",
        entityId: "a",
        otherEntityIds: ["b"],
        clearanceMeters: 0,
      },
    ] as const satisfies readonly ResolvedPlacementConstraintV1[];

    const solved = solveLayoutV1(input(constraints), profile());
    expect(solved.status).toBe("solved");
    expect(solved.report.placementsByEntityId).toMatchObject({
      a: { transform: { positionMetersXYZ: [0, 1, 0] } },
      b: { transform: { positionMetersXYZ: [10, 1, 0] } },
    });
    expect(solved.report.constraintResultsById).toMatchObject({
      apart: { satisfied: true },
      "no-overlap": { satisfied: true },
    });
    expect(solved.layoutSolveReportHash).toBe(hashLayoutSolveReportV1(solved.report));
    expect(Object.isFrozen(solved)).toBe(true);
    expect(Object.isFrozen(solved.report)).toBe(true);
    expect(Object.isFrozen(solved.report.placementsByEntityId.a?.transform)).toBe(true);
  });

  it("optimizes preferred weights before canonical candidate tie-breaks", () => {
    const preferred = [
      {
        id: "prefer-left",
        kind: "distance-range",
        requirement: "preferred",
        preferenceWeightRatio: 0.8,
        entityId: "a",
        referenceEntityId: "left",
        minimumDistanceMeters: 0,
        maximumDistanceMeters: 1,
      },
      {
        id: "prefer-right",
        kind: "distance-range",
        requirement: "preferred",
        preferenceWeightRatio: 0.2,
        entityId: "a",
        referenceEntityId: "right",
        minimumDistanceMeters: 0,
        maximumDistanceMeters: 1,
      },
    ] as const satisfies readonly ResolvedPlacementConstraintV1[];
    const testInput: ResolvedLayoutInputV1 = {
      ...input(preferred),
      entities: [entity("a", ["a0", "a1"], preferred.map((row) => row.id)), fixedEntity("left", 0), fixedEntity("right", 10)],
    };

    const solved = solveLayoutV1(testInput, profile());
    expect(solved.status).toBe("solved");
    expect(solved.report.placementsByEntityId.a?.transform.positionMetersXYZ).toEqual([0, 1, 0]);
    expect(solved.report.totalPreferenceCostRatio).toBe(0.2);

    const equalWeights = preferred.map((constraint) => ({
      ...constraint,
      preferenceWeightRatio: 1,
    })) as readonly ResolvedPlacementConstraintV1[];
    const equalInput: ResolvedLayoutInputV1 = {
      ...input(equalWeights),
      entities: [entity("a", ["a0", "a1"], equalWeights.map((row) => row.id)), fixedEntity("left", 0), fixedEntity("right", 10)],
    };
    expect(
      solveLayoutV1(equalInput, profile()).report.placementsByEntityId.a?.transform.positionMetersXYZ,
    ).toEqual([0, 1, 0]);
    expect(solveLayoutV1(equalInput, profile()).report.totalPreferenceCostRatio).toBe(0.5);
  });

  it("returns budget-exceeded without partial production placements", () => {
    const solverProfile = profile({ maximumSearchNodes: 1 });
    const result = solveLayoutV1(bindProfile(input([]), solverProfile), solverProfile);
    expect(result).toMatchObject({
      status: "budget-exceeded",
      report: {
        status: "budget-exceeded",
        placementsByEntityId: {},
        diagnostics: [expect.objectContaining({ code: "PLACEMENT_SOLVER_BUDGET_EXCEEDED" })],
      },
    });
  });

  it("returns an irreducible stable conflict core for jointly incompatible constraints", () => {
    const constraints = [
      {
        id: "must-left",
        kind: "distance-range",
        requirement: "required",
        entityId: "a",
        referenceEntityId: "left",
        minimumDistanceMeters: 0,
        maximumDistanceMeters: 1,
      },
      {
        id: "must-right",
        kind: "distance-range",
        requirement: "required",
        entityId: "a",
        referenceEntityId: "right",
        minimumDistanceMeters: 0,
        maximumDistanceMeters: 1,
      },
    ] as const satisfies readonly ResolvedPlacementConstraintV1[];
    const testInput: ResolvedLayoutInputV1 = {
      ...input(constraints),
      entities: [entity("a", ["a0", "a1"], constraints.map((row) => row.id)), fixedEntity("left", 0), fixedEntity("right", 10)],
    };

    const result = solveLayoutV1(testInput, profile());
    expect(result.status).toBe("unsatisfied");
    expect(result.report.placementsByEntityId).toEqual({});
    expect(result.report.conflictConstraintIds).toEqual(["must-left", "must-right"]);
    expect(result.report.diagnostics).toEqual([
      expect.objectContaining({
        code: "PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED",
        constraintIds: ["must-left", "must-right"],
      }),
    ]);
  });

  it("rejects invalid input deterministically and caps diagnostics", () => {
    const invalid: ResolvedLayoutInputV1 = {
      ...input([]),
      entities: [
        entity("duplicate", ["missing"], []),
        entity("duplicate", ["missing"], []),
      ],
    };
    const solverProfile = profile({ maximumDiagnostics: 1 });
    const result = solveLayoutV1(bindProfile(invalid, solverProfile), solverProfile);
    expect(result.status).toBe("invalid-input");
    expect(result.report.diagnostics).toHaveLength(1);
    expect(result.report.diagnostics[0]).toMatchObject({
      code: "PLACEMENT_INPUT_INVALID",
    });
  });

  it("reports solved entities with no candidate as a stable unsatisfied result", () => {
    const noCandidate: ResolvedLayoutInputV1 = {
      ...input([]),
      entities: [entity("a", [], [])],
    };
    expect(solveLayoutV1(noCandidate, profile())).toMatchObject({
      status: "unsatisfied",
      report: {
        placementsByEntityId: {},
        diagnostics: [expect.objectContaining({
          code: "PLACEMENT_REGION_HAS_NO_CANDIDATE",
          entityId: "a",
        })],
      },
    });
  });

  it("rejects non-finite world bounds and floating profile refs", () => {
    const invalid: ResolvedLayoutInputV1 = {
      ...input([]),
      solverProfile: { ...input([]).solverProfile, solverProfileRef: "worldkit://layout-solver-profile/outdoor.s1@latest" },
      worldBounds: {
        minimumMetersXYZ: [Number.NaN, -20, -100],
        maximumMetersXYZ: [100, 100, 100],
      },
    };
    expect(solveLayoutV1(invalid, profile())).toMatchObject({
      status: "invalid-input",
      report: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ instancePath: "/solverProfile/solverProfileRef" }),
          expect.objectContaining({ instancePath: "/worldBounds" }),
        ]),
      },
    });
  });

  it("produces identical report bytes across repeated and concurrent calls", async () => {
    const constraints = [
      {
        id: "apart",
        kind: "distance-range",
        requirement: "required",
        entityId: "a",
        referenceEntityId: "b",
        minimumDistanceMeters: 9,
        maximumDistanceMeters: 11,
      },
    ] as const satisfies readonly ResolvedPlacementConstraintV1[];
    const expectedHash = solveLayoutV1(input(constraints), profile()).layoutSolveReportHash;

    const hashes = await Promise.all(
      Array.from({ length: 8 }, async () =>
        solveLayoutV1(structuredClone(input(constraints)), structuredClone(profile()))
          .layoutSolveReportHash
      ),
    );
    expect(hashes).toEqual(Array(8).fill(expectedHash));
  });
});
