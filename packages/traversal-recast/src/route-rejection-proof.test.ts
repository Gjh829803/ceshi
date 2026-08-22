import { describe, expect, it } from "vitest";

import {
  evaluateRouteRejectionProofV1,
  type RouteRejectionCandidateV1,
  type RouteRejectionReasonV1,
} from "./route-rejection-proof.js";

const POSITION_A = [1, 0.5, 0] as const;
const POSITION_B = [2, 0.5, 0] as const;

function reason(
  kind: RouteRejectionReasonV1["kind"],
): RouteRejectionReasonV1 {
  switch (kind) {
    case "slope":
      return {
        kind,
        terrainEntityId: "terrain-main",
        maximumObservedSlopeDegrees: 48,
        maximumAllowedSlopeDegrees: 42,
      };
    case "step":
      return {
        kind,
        terrainEntityId: "terrain-main",
        maximumObservedStepHeightMeters: 0.35,
        maximumAllowedStepHeightMeters: 0.3,
      };
    case "width":
      return {
        kind,
        terrainEntityId: "terrain-main",
        relevantColliderSubshapeIds: ["wall-main"],
        minimumObservedClearanceWidthMeters: 0.6,
        minimumRequiredClearanceWidthMeters: 0.74,
      };
    case "overhead":
      return {
        kind,
        terrainEntityId: "terrain-main",
        relevantColliderSubshapeIds: ["ceiling-main"],
        minimumObservedClearanceHeightMeters: 1.7,
        minimumRequiredClearanceHeightMeters: 1.92,
      };
    case "gap":
      return {
        kind,
        terrainEntityId: "terrain-main",
        maximumObservedSurfaceGapMeters: 0.1,
        maximumAllowedSurfaceGapMeters: 0,
      };
  }
}

function candidate(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  rejectionReasons: readonly RouteRejectionReasonV1[],
  failurePositionMetersXYZ: readonly [number, number, number] = POSITION_A,
): RouteRejectionCandidateV1 {
  return {
    id,
    fromNodeId,
    toNodeId,
    failurePositionMetersXYZ,
    rejectionReasons,
  };
}

const BUDGET = {
  isProofBudgetExhausted: false,
  maximumNodes: 100,
  maximumEdges: 100,
  maximumSearchSteps: 100,
} as const;

describe("evaluateRouteRejectionProofV1", () => {
  it.each([
    "slope",
    "step",
    "width",
    "overhead",
    "gap",
  ] as const)("publishes a unique %s cut with canonical evidence", (kind) => {
    const result = evaluateRouteRejectionProofV1({
      nodeIds: ["start", "middle", "goal"],
      candidates: [
        candidate("base", "start", "middle", []),
        candidate("z-blocked", "middle", "goal", [reason(kind)], POSITION_B),
        candidate("a-blocked", "middle", "goal", [reason(kind)], POSITION_A),
      ],
      startNodeId: "start",
      destinationNodeId: "goal",
      isSourceProjectionConsistent: true,
      ...BUDGET,
    });

    expect(result).toMatchObject({
      status: "specialized",
      rejectionKind: kind,
      proofKind: "unique-single-reason-cut",
      proofCandidateIds: ["a-blocked"],
      failurePositionMetersXYZ: POSITION_A,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("falls back to generic when more than one singleton reason restores connectivity", () => {
    expect(evaluateRouteRejectionProofV1({
      nodeIds: ["start", "goal"],
      candidates: [
        candidate("slope", "start", "goal", [reason("slope")]),
        candidate("step", "start", "goal", [reason("step")]),
      ],
      startNodeId: "start",
      destinationNodeId: "goal",
      isSourceProjectionConsistent: true,
      ...BUDGET,
    })).toEqual({ status: "generic", reason: "ambiguous-or-mixed-cut" });
  });

  it("does not admit a candidate that retains another rejection", () => {
    expect(evaluateRouteRejectionProofV1({
      nodeIds: ["start", "goal"],
      candidates: [candidate("mixed", "start", "goal", [
        reason("slope"),
        reason("width"),
      ])],
      startNodeId: "start",
      destinationNodeId: "goal",
      isSourceProjectionConsistent: true,
      ...BUDGET,
    })).toEqual({ status: "generic", reason: "ambiguous-or-mixed-cut" });
  });

  it("does not specialize a width reason whose canonical observation is not insufficient", () => {
    const invalidWidthReason: RouteRejectionReasonV1 = {
      kind: "width",
      terrainEntityId: "terrain-main",
      relevantColliderSubshapeIds: ["wall-main"],
      minimumObservedClearanceWidthMeters: 0.74,
      minimumRequiredClearanceWidthMeters: 0.74,
    };

    expect(evaluateRouteRejectionProofV1({
      nodeIds: ["start", "goal"],
      candidates: [candidate("width", "start", "goal", [invalidWidthReason])],
      startNodeId: "start",
      destinationNodeId: "goal",
      isSourceProjectionConsistent: true,
      ...BUDGET,
    })).toEqual({ status: "generic", reason: "source-projection-inconsistent" });
  });

  it("uses one global proof-search budget across rejection kinds", () => {
    expect(evaluateRouteRejectionProofV1({
      nodeIds: ["start", "one", "two", "goal"],
      candidates: [
        candidate("one", "start", "one", []),
        candidate("two", "one", "two", []),
        candidate("slope", "two", "goal", [reason("slope")]),
      ],
      startNodeId: "start",
      destinationNodeId: "goal",
      isSourceProjectionConsistent: true,
      isProofBudgetExhausted: false,
      maximumNodes: 100,
      maximumEdges: 100,
      maximumSearchSteps: 3,
    })).toEqual({ status: "generic", reason: "proof-budget-exhausted" });
  });

  it("fails attribution closed on source/provider inconsistency or proof capacity", () => {
    const base = {
      nodeIds: ["start", "goal"],
      candidates: [candidate("slope", "start", "goal", [reason("slope")])],
      startNodeId: "start",
      destinationNodeId: "goal",
      ...BUDGET,
    } as const;
    expect(evaluateRouteRejectionProofV1({
      ...base,
      isSourceProjectionConsistent: false,
    })).toEqual({ status: "generic", reason: "source-projection-inconsistent" });
    expect(evaluateRouteRejectionProofV1({
      ...base,
      isSourceProjectionConsistent: true,
      maximumEdges: 0,
    })).toEqual({ status: "generic", reason: "proof-budget-exhausted" });
  });
});
