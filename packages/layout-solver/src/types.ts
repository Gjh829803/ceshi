export interface LayoutSolverProfileV1 {
  readonly kind: "layout-solver-profile";
  readonly schemaVersion: 1;
  readonly candidateGeneration: Readonly<{
    gridSpacingMeters: number;
    boundarySampleSpacingMeters: number;
    routeSampleSpacingMeters: number;
    yawStepDegrees: number;
  }>;
  readonly quantization: Readonly<{
    positionStepMeters: number;
    rotationStepRadians: number;
    ratioStep: number;
    scoreStep: number;
  }>;
  readonly tolerances: Readonly<{
    distanceMeters: number;
    angleDegrees: number;
    supportGapMeters: number;
    overlapMeters: number;
  }>;
  readonly budgets: Readonly<{
    maximumConstraints: number;
    maximumCandidatesPerEntity: number;
    maximumSearchNodes: number;
    maximumConflictChecks: number;
    maximumDiagnostics: number;
  }>;
}

export interface ResolvedLayoutSolverProfileV1 {
  readonly resourceRef: string;
  readonly resolvedVersion: "1";
  readonly contentHash: `sha256:${string}`;
  readonly profile: LayoutSolverProfileV1;
}
