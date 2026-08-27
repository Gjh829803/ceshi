import { describe, expect, it } from "vitest";

import { hashLayoutSolveReportV1, type LayoutSolveReportV1 } from "./index.js";

function report(): LayoutSolveReportV1 {
  return {
    kind: "worldkit-layout-solve-report",
    schemaVersion: 1,
    id: "report-test",
    authoringSpecHash: `sha256:${"a".repeat(64)}`,
    layoutInputHash: `sha256:${"e".repeat(64)}`,
    registryLockHash: `sha256:${"b".repeat(64)}`,
    solverProfileRef: "worldkit://layout-solver-profile/outdoor.s1@1",
    resolvedVersion: "1",
    solverProfileHash: `sha256:${"c".repeat(64)}`,
    seed: 1,
    status: "solved",
    placementsByEntityId: {},
    constraintResultsById: {},
    totalPreferenceCostRatio: 0,
    diagnostics: [],
    searchNodeCount: 0,
    conflictCheckCount: 0,
    conflictConstraintIds: [],
  };
}

describe("canonical layout solve report", () => {
  it("hashes the exact report externally without a self-hash field", () => {
    const value = report();
    expect(hashLayoutSolveReportV1(value)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(value).not.toHaveProperty("layoutSolveReportHash");
    expect(hashLayoutSolveReportV1({ ...value, seed: 2 })).not.toBe(
      hashLayoutSolveReportV1(value),
    );
    expect(() => hashLayoutSolveReportV1({
      ...value,
      layoutSolveReportHash: `sha256:${"d".repeat(64)}`,
    } as never)).toThrow("LAYOUT_REPORT_SELF_HASH_FORBIDDEN");
  });

  it("is invariant to record insertion order but sensitive to result values", () => {
    const first: LayoutSolveReportV1 = { ...report(), placementsByEntityId: {
      z: {
        entityId: "z",
        candidateId: "z:fixed:000000",
        candidateSource: { kind: "fixed" },
        transform: {
          positionMetersXYZ: [1, 1, 1],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        satisfiedConstraintIds: [],
        preferenceCostRatio: 0,
      },
      a: {
        entityId: "a",
        candidateId: "a:fixed:000000",
        candidateSource: { kind: "fixed" },
        transform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        satisfiedConstraintIds: [],
        preferenceCostRatio: 0,
      },
    } };
    const second = { ...first, placementsByEntityId: { a: first.placementsByEntityId.a!, z: first.placementsByEntityId.z! } };
    expect(hashLayoutSolveReportV1(first)).toBe(hashLayoutSolveReportV1(second));
    const changed: LayoutSolveReportV1 = {
      ...second,
      placementsByEntityId: {
        ...second.placementsByEntityId,
        a: {
          ...second.placementsByEntityId.a!,
          transform: {
            ...second.placementsByEntityId.a!.transform,
            positionMetersXYZ: [0.001, 0, 0],
          },
        },
      },
    };
    expect(hashLayoutSolveReportV1(changed)).not.toBe(hashLayoutSolveReportV1(first));
  });
});
