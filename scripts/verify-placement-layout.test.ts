import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/authoring";
import type { LayoutSolveReportV1 } from "../packages/layout-solver/src/index.js";

import {
  placementMutationCode,
  verifyPlacementReportEnvelope,
} from "./verify-placement-layout";

function reportFixture(
  overrides: Partial<LayoutSolveReportV1> = {},
): LayoutSolveReportV1 {
  return {
    kind: "worldkit-layout-solve-report",
    schemaVersion: 1,
    id: "coast-layout",
    authoringSpecHash: `sha256:${"1".repeat(64)}`,
    layoutInputHash: `sha256:${"4".repeat(64)}`,
    registryLockHash: `sha256:${"2".repeat(64)}`,
    solverProfileRef: "worldkit://layout-solver-profile/outdoor.s1@1",
    resolvedVersion: "1",
    solverProfileHash: `sha256:${"3".repeat(64)}`,
    seed: 42,
    status: "solved",
    placementsByEntityId: {},
    constraintResultsById: {},
    totalPreferenceCostRatio: 0,
    diagnostics: [],
    searchNodeCount: 1,
    conflictCheckCount: 0,
    conflictConstraintIds: [],
    ...overrides,
  };
}

describe("placement layout conformance helpers", () => {
  it("accepts an exact solved report and rejects missing or stale report identity", () => {
    const report = reportFixture();
    const hash = sha256CanonicalJson(report);

    expect(verifyPlacementReportEnvelope(report, hash)).toEqual({ ok: true });
    expect(verifyPlacementReportEnvelope(undefined, hash)).toEqual({
      ok: false,
      code: "PLACEMENT_REPORT_MISSING",
    });
    const staleReport = { ...report, seed: report.seed + 1 };
    expect(verifyPlacementReportEnvelope(staleReport, hash)).toEqual({
      ok: false,
      code: "PLACEMENT_REPORT_HASH_MISMATCH",
    });
  });

  it("returns stable required-conflict and budget diagnostics", () => {
    const unsatisfied = reportFixture({
      status: "unsatisfied",
      diagnostics: [
        {
          severity: "error",
          code: "PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED",
          instancePath: "/constraints/placements",
        },
      ],
    });
    expect(
      verifyPlacementReportEnvelope(
        unsatisfied,
        sha256CanonicalJson(unsatisfied),
      ),
    ).toEqual({
      ok: false,
      code: "PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED",
    });

    const budget = reportFixture({
      status: "budget-exceeded",
      diagnostics: [
        {
          severity: "error",
          code: "PLACEMENT_SOLVER_BUDGET_EXCEEDED",
          instancePath: "/solverProfile/budgets/maximumSearchNodes",
        },
      ],
    });
    expect(
      verifyPlacementReportEnvelope(budget, sha256CanonicalJson(budget)),
    ).toEqual({
      ok: false,
      code: "PLACEMENT_SOLVER_BUDGET_EXCEEDED",
    });
  });

  it("classifies seed, profile, and bounds mutations without modifying either input", () => {
    const baseline = {
      seed: 42,
      layout: {
        solverProfileRef: "worldkit://layout-solver-profile/outdoor.s1@1",
      },
      world: {
        bounds: {
          centerMetersXZ: [0, 0],
          sizeMetersXZ: [100, 80],
          heightRangeMeters: [-4, 20],
        },
      },
    } as const;
    const before = JSON.stringify(baseline);

    expect(
      placementMutationCode(baseline, { ...baseline, seed: 43 }),
    ).toBe("PLACEMENT_REPORT_SEED_MISMATCH");
    expect(
      placementMutationCode(baseline, {
        ...baseline,
        layout: { solverProfileRef: "worldkit://layout-solver-profile/other@1" },
      }),
    ).toBe("PLACEMENT_REPORT_PROFILE_MISMATCH");
    expect(
      placementMutationCode(baseline, {
        ...baseline,
        world: {
          bounds: { ...baseline.world.bounds, sizeMetersXZ: [50, 40] },
        },
      }),
    ).toBe("PLACEMENT_REPORT_BOUNDS_MISMATCH");
    expect(placementMutationCode(baseline, structuredClone(baseline))).toBeUndefined();
    expect(JSON.stringify(baseline)).toBe(before);
  });
});
