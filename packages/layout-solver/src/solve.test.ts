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
    layoutInputHash: `sha256:${"e".repeat(64)}`,
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
  it.each([10_000, 30_000])("solves %i fixed entities without exhausting the call stack", (entityCount) => {
    const solverProfile = profile({ maximumSearchNodes: entityCount });
    const testInput = bindProfile({
      ...input([]),
      entities: Array.from({ length: entityCount }, (_, index) =>
        fixedEntity(`fixed-${index.toString().padStart(5, "0")}`, 0)
      ),
    }, solverProfile);

    const result = solveLayoutV1(testInput, solverProfile);
    expect(result.status).toBe("solved");
    expect(result.report.searchNodeCount).toBe(entityCount);
    expect(Object.keys(result.report.placementsByEntityId)).toHaveLength(entityCount);
    expect(result.report.placementsByEntityId["fixed-09999"]?.transform).toEqual(transform(0));
  });

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
    expect(solved.report.searchNodeCount).toBe(6);
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

  it("clears exhausted branches and chooses a later equal-cost canonical signature", () => {
    const constraints = [{
      id: "apart",
      kind: "distance-range",
      requirement: "required",
      entityId: "a",
      referenceEntityId: "b",
      minimumDistanceMeters: 9,
      maximumDistanceMeters: 11,
    }] as const satisfies readonly ResolvedPlacementConstraintV1[];
    const testInput: ResolvedLayoutInputV1 = {
      ...input(constraints),
      anchorsByEntityId: {
        a0: transform(10), a1: transform(0),
        b0: transform(10), b1: transform(0),
      },
    };
    const result = solveLayoutV1(testInput, profile());
    expect(result.status).toBe("solved");
    expect(result.report.searchNodeCount).toBe(6);
    expect(result.report.placementsByEntityId).toMatchObject({
      a: { candidateId: "a:anchor:000000", transform: transform(10) },
      b: { candidateId: "b:anchor:000001", transform: transform(0) },
    });
    expect(result.layoutSolveReportHash).toBe("sha256:2487b8928ddbb8c4e0c18cb0130f7f47e30f28b9a8088e05fa3d04dd901f7af4");
    expect(solveLayoutV1({
      ...testInput,
      entities: [...testInput.entities].reverse(),
    }, profile())).toEqual(result);
  });

  it("ranks local cost before signature and preference cost before local cost", () => {
    const testInput: ResolvedLayoutInputV1 = {
      ...input([]),
      entities: [{
        ...entity("a", ["a0"], []),
        placement: {
          kind: "solved",
          placementConstraintIds: [],
          initialTransform: transform(10),
        },
      }, fixedEntity("left", 0)],
    };
    const localResult = solveLayoutV1(testInput, profile());
    expect(localResult.report.placementsByEntityId.a?.candidateSource.kind).toBe("initial");
    expect(localResult.report.searchNodeCount).toBe(3);
    expect(localResult.layoutSolveReportHash).toBe("sha256:5a71963cd6910f454e8b3e893518966927c3ed8b48c71a9b52eca5b7c56c94e5");

    const preferredInput: ResolvedLayoutInputV1 = {
      ...testInput,
      constraints: [{
        id: "prefer-left",
        kind: "distance-range",
        requirement: "preferred",
        preferenceWeightRatio: 1,
        entityId: "a",
        referenceEntityId: "left",
        minimumDistanceMeters: 0,
        maximumDistanceMeters: 1,
      }],
    };
    const preferredResult = solveLayoutV1(preferredInput, profile());
    expect(preferredResult.report.placementsByEntityId.a?.candidateSource.kind).toBe("anchor");
    expect(preferredResult.report.totalPreferenceCostRatio).toBe(0);
    expect(preferredResult.layoutSolveReportHash).toBe("sha256:057763500110d180ecc0f96b5787ad72a6ba3784383eeb702ba21229f74bb04b");
  });

  // Hashes below were recorded from the recursive solver before its stack-safe replacement.
  it.each([
    [1, "sha256:66ac7ae33664c4042d4e90e6b95c706b6854d7dece4412f004e1d35dd483da40"],
    [2, "sha256:f4154122a5f86236ce166de0d4acec0c8d26a2e9c4d0e6da010cbf97e75cfc1b"],
    [5, "sha256:7078c8f57780d4f5430f56e6ca69d5bfff7f7a99140ed6d57172e32bcd24bbb4"],
    [6, "sha256:5b1e9291057d22a63348dceac8b7562145f7e115cfce10fdc30797e8baef98da"],
  ] as const)("preserves node-budget boundary %i after partial or complete assignments", (maximumSearchNodes, expectedHash) => {
    const solverProfile = profile({ maximumSearchNodes });
    const result = solveLayoutV1(bindProfile(input([]), solverProfile), solverProfile);
    expect(result.status).toBe(maximumSearchNodes < 6 ? "budget-exceeded" : "solved");
    expect(result.report.searchNodeCount).toBe(Math.min(maximumSearchNodes + 1, 6));
    if (maximumSearchNodes < 6) expect(result.report.placementsByEntityId).toEqual({});
    expect(result.layoutSolveReportHash).toBe(expectedHash);
  });

  it("evaluates an empty assignment without spending a search node", () => {
    const result = solveLayoutV1({ ...input([]), entities: [] }, profile());
    expect(result.status).toBe("solved");
    expect(result.report.searchNodeCount).toBe(0);
    expect(result.report.placementsByEntityId).toEqual({});
    expect(result.layoutSolveReportHash).toBe("sha256:e07e3fbec468832891adb686a7a200cf5805a475e2f620b2db3908898eb897dc");
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
    expect(result.report.searchNodeCount).toBe(4);
    expect(result.report.conflictCheckCount).toBe(2);
    expect(result.layoutSolveReportHash).toBe("sha256:536d6710f59b9566ff78e637355ecf4b157088afc3cc127db33409695a238050");
    expect(result.report.placementsByEntityId).toEqual({});
    expect(result.report.conflictConstraintIds).toEqual(["must-left", "must-right"]);
    expect(result.report.diagnostics).toEqual([
      expect.objectContaining({
        code: "PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED",
        constraintIds: ["must-left", "must-right"],
      }),
    ]);
  });

  it.each([
    [4, "sha256:5bf180c2e8d9cf54d16ccb9423e7459a2a4294d99df1c4d60c054fc3348c209b"],
    [5, "sha256:1ea6b0872fd1b3621a4f7e151ccbf30e78cac6f6fb957cec37ca8afbf7bfa249"],
  ] as const)("preserves conflict-search early exit and budget boundary %i", (maximumSearchNodes, expectedHash) => {
    const constraints = ["left", "right"].map((side) => ({
      id: `must-${side}`,
      kind: "distance-range" as const,
      requirement: "required" as const,
      entityId: "a",
      referenceEntityId: side,
      minimumDistanceMeters: 0,
      maximumDistanceMeters: 1,
    }));
    const solverProfile = profile({ maximumSearchNodes });
    const testInput = bindProfile({
      ...input(constraints),
      entities: [
        entity("a", ["a0", "a1"], constraints.map((row) => row.id)),
        entity("b", ["b0", "b1", "b2"], []),
        fixedEntity("left", 0), fixedEntity("right", 10),
      ],
      anchorsByEntityId: { ...input([]).anchorsByEntityId, b2: transform(20) },
    }, solverProfile);
    const result = solveLayoutV1(testInput, solverProfile);
    expect(result.status).toBe(maximumSearchNodes === 4 ? "budget-exceeded" : "unsatisfied");
    expect(result.report.searchNodeCount).toBe(maximumSearchNodes === 4 ? 9 : 4);
    expect(result.report.conflictCheckCount).toBe(maximumSearchNodes === 4 ? 1 : 2);
    expect(result.report.conflictConstraintIds).toEqual(
      maximumSearchNodes === 4 ? [] : ["must-left", "must-right"],
    );
    expect(result.layoutSolveReportHash).toBe(expectedHash);
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

  it("rejects a missing or malformed layoutInputHash without borrowing authoringSpecHash", () => {
    const invalid = {
      ...input([]),
      layoutInputHash: "sha256:not-a-hash",
    } as ResolvedLayoutInputV1;
    expect(solveLayoutV1(invalid, profile())).toMatchObject({
      status: "invalid-input",
      report: {
        authoringSpecHash: invalid.authoringSpecHash,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ instancePath: "/layoutInputHash" }),
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
