import { canonicalJsonBytes, sha256Bytes } from "@whitebox-world/protocol";

import type {
  LayoutSolverProfileV1,
  ResolvedLayoutSolverProfileV1,
} from "./types.js";

export const BUILT_IN_LAYOUT_SOLVER_PROFILE_REF =
  "worldkit://layout-solver-profile/outdoor.s1@1" as const;

const BUILT_IN_OUTDOOR_PROFILE: LayoutSolverProfileV1 = {
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
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function resolveLayoutSolverProfileV1(
  resourceRef: string,
): ResolvedLayoutSolverProfileV1 {
  if (resourceRef !== BUILT_IN_LAYOUT_SOLVER_PROFILE_REF) {
    throw new Error(`LAYOUT_SOLVER_PROFILE_NOT_FOUND: '${resourceRef}'.`);
  }

  const profile = deepFreeze(structuredClone(BUILT_IN_OUTDOOR_PROFILE));
  const contentHash = sha256Bytes(canonicalJsonBytes(profile)) as `sha256:${string}`;
  return deepFreeze({
    resourceRef: BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
    resolvedVersion: "1",
    contentHash,
    profile,
  });
}
