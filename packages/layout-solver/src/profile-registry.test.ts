import { describe, expect, it } from "vitest";

import { canonicalJsonBytes, sha256Bytes } from "@whitebox-world/protocol";

import {
  BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
  resolveLayoutSolverProfileV1,
} from "./index.js";

describe("layout solver profile registry", () => {
  it("resolves the versioned outdoor profile with a canonical content hash", () => {
    const resolved = resolveLayoutSolverProfileV1(BUILT_IN_LAYOUT_SOLVER_PROFILE_REF);

    expect(BUILT_IN_LAYOUT_SOLVER_PROFILE_REF).toBe(
      "worldkit://layout-solver-profile/outdoor.s1@1",
    );
    expect(resolved).toEqual({
      resourceRef: BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
      resolvedVersion: "1",
      contentHash: sha256Bytes(canonicalJsonBytes(resolved.profile)),
      profile: {
        kind: "layout-solver-profile",
        schemaVersion: 1,
        candidateGeneration: {
          gridSpacingMeters: 2,
          boundarySampleSpacingMeters: 1,
          routeSampleSpacingMeters: 1,
          yawStepDegrees: 45,
        },
        quantization: {
          positionStepMeters: 0.001,
          rotationStepRadians: 0.000001,
          ratioStep: 0.000001,
          scoreStep: 0.000001,
        },
        tolerances: {
          distanceMeters: 0.01,
          angleDegrees: 1,
          supportGapMeters: 0.02,
          overlapMeters: 0.001,
        },
        budgets: {
          maximumConstraints: 128,
          maximumCandidatesPerEntity: 4096,
          maximumSearchNodes: 100000,
          maximumConflictChecks: 100000,
          maximumDiagnostics: 256,
        },
      },
    });
  });

  it("rejects unregistered and floating profile refs with a stable code", () => {
    for (const resourceRef of [
      "worldkit://layout-solver-profile/outdoor.s1@latest",
      "worldkit://layout-solver-profile/unknown@1",
    ]) {
      expect(() => resolveLayoutSolverProfileV1(resourceRef)).toThrow(
        "LAYOUT_SOLVER_PROFILE_NOT_FOUND",
      );
    }
  });

  it("returns a fresh deeply frozen projection on every resolve", () => {
    const first = resolveLayoutSolverProfileV1(BUILT_IN_LAYOUT_SOLVER_PROFILE_REF);
    const second = resolveLayoutSolverProfileV1(BUILT_IN_LAYOUT_SOLVER_PROFILE_REF);

    expect(first).not.toBe(second);
    expect(first.profile).not.toBe(second.profile);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.profile)).toBe(true);
    expect(Object.isFrozen(first.profile.budgets)).toBe(true);
    expect(() => {
      (first.profile.budgets as { maximumSearchNodes: number }).maximumSearchNodes = 1;
    }).toThrow(TypeError);
    expect(second.profile.budgets.maximumSearchNodes).toBe(100000);
  });
});
