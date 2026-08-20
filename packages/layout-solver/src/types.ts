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

export type LayoutVec2V1 = readonly [x: number, z: number];
export type LayoutVec3V1 = readonly [x: number, y: number, z: number];

export interface LayoutTransformV1 {
  readonly positionMetersXYZ: LayoutVec3V1;
  readonly rotationEulerRadiansXYZ: LayoutVec3V1;
  readonly scaleXYZ: LayoutVec3V1;
}

export type ResolvedLayoutPlacementV1 =
  | Readonly<{ kind: "fixed"; transform: LayoutTransformV1 }>
  | Readonly<{
      kind: "solved";
      initialTransform?: LayoutTransformV1;
      placementConstraintIds: readonly string[];
    }>;

export interface ResolvedLayoutEntityV1 {
  readonly id: string;
  readonly semanticClassId?: string;
  readonly halfExtentsMetersXYZ: LayoutVec3V1;
  readonly placement: ResolvedLayoutPlacementV1;
  readonly candidateRegionIds: readonly string[];
  readonly candidateRouteIds: readonly string[];
  readonly explicitAnchorEntityIds: readonly string[];
  readonly supportingTerrainEntityId?: string;
}

export interface LayoutSpatialRegionV1 {
  readonly id: string;
  readonly kind: "polygon-xz";
  readonly pointsMetersXZ: readonly LayoutVec2V1[];
  readonly minimumHeightMeters?: number;
  readonly maximumHeightMeters?: number;
  readonly semanticClassId: string;
}

export interface LayoutRouteV1 {
  readonly id: string;
  readonly kind: "polyline-xz";
  readonly pointsMetersXZ: readonly LayoutVec2V1[];
  readonly widthMeters: number;
  readonly locomotionProfileRef: string;
}

export interface LayoutScreenRegionV1 {
  readonly id: string;
  readonly kind: "rectangle-uv";
  readonly minimumUv: readonly [u: number, v: number];
  readonly maximumUv: readonly [u: number, v: number];
}

export interface LayoutAabbV1 {
  readonly minimumMetersXYZ: LayoutVec3V1;
  readonly maximumMetersXYZ: LayoutVec3V1;
}

export interface LayoutHeightfieldV1 {
  readonly terrainEntityId: string;
  readonly centerMetersXZ: LayoutVec2V1;
  readonly sizeMetersXZ: LayoutVec2V1;
  readonly resolutionVerticesXZ: readonly [columns: number, rows: number];
  readonly heightSamplesMeters: readonly number[];
}

export interface LayoutCameraV1 {
  readonly cameraEntityId: string;
  readonly positionMetersXYZ: LayoutVec3V1;
  readonly targetMetersXYZ: LayoutVec3V1;
  readonly verticalFovDegrees: number;
  readonly aspectRatio: number;
  readonly nearClipMeters: number;
  readonly farClipMeters: number;
}

export interface LayoutGeometryQueryV1 {
  readonly heightfieldsByTerrainEntityId: Readonly<Record<string, LayoutHeightfieldV1>>;
  readonly staticBoundsByEntityId: Readonly<Record<string, LayoutAabbV1>>;
  readonly camerasByEntityId: Readonly<Record<string, LayoutCameraV1>>;
}

export interface LayoutCandidateGenerationInputV1 {
  readonly entity: ResolvedLayoutEntityV1;
  readonly regions: readonly LayoutSpatialRegionV1[];
  readonly routes: readonly LayoutRouteV1[];
  readonly anchorsByEntityId: Readonly<Record<string, LayoutTransformV1>>;
  readonly geometry: LayoutGeometryQueryV1;
}

export type LayoutCandidateSourceV1 =
  | Readonly<{ kind: "fixed" }>
  | Readonly<{ kind: "initial" }>
  | Readonly<{
      kind: "region-grid";
      regionId: string;
      sampleIndex: number;
      yawDegrees: number;
    }>
  | Readonly<{
      kind: "region-boundary";
      regionId: string;
      sampleIndex: number;
      yawDegrees: number;
    }>
  | Readonly<{
      kind: "route";
      routeId: string;
      sampleIndex: number;
      yawDegrees: number;
    }>
  | Readonly<{ kind: "anchor"; anchorEntityId: string }>;

export interface LayoutCandidateV1 {
  readonly id: string;
  readonly entityId: string;
  readonly isInitial: boolean;
  readonly source: LayoutCandidateSourceV1;
  readonly transform: LayoutTransformV1;
  readonly bounds: LayoutAabbV1;
  readonly localCostRatio: number;
}

type ResolvedRequiredConstraintV1 = Readonly<{
  requirement: "required";
  preferenceWeightRatio?: never;
}>;

type ResolvedPreferredConstraintV1 = Readonly<{
  requirement: "preferred";
  preferenceWeightRatio: number;
}>;

type ResolvedConstraintBaseV1 = Readonly<{ id: string }> &
  (ResolvedRequiredConstraintV1 | ResolvedPreferredConstraintV1);

export type ResolvedPlacementConstraintV1 = ResolvedConstraintBaseV1 &
  (
    | Readonly<{ kind: "inside-region"; entityId: string; regionId: string; boundaryClearanceMeters: number }>
    | Readonly<{ kind: "outside-region"; entityId: string; regionId: string; boundaryClearanceMeters: number }>
    | Readonly<{ kind: "distance-range"; entityId: string; referenceEntityId: string; minimumDistanceMeters: number; maximumDistanceMeters: number }>
    | Readonly<{ kind: "faces-entity"; facingEntityId: string; targetEntityId: string; maximumAngularDeviationDegrees: number }>
    | Readonly<{ kind: "supported-by"; supportedEntityId: string; supportingEntityId: string; maximumSupportGapMeters: number; minimumSupportRatio: number }>
    | (Readonly<{ kind: "minimum-clearance"; entityId: string; clearanceMeters: number }> &
        (Readonly<{ otherEntityIds: readonly string[]; semanticClassIds?: never }> |
          Readonly<{ semanticClassIds: readonly string[]; otherEntityIds?: never }>))
    | (Readonly<{ kind: "within-slope-limit"; terrainEntityId: string; maximumSlopeDegrees: number }> &
        (Readonly<{ entityId: string; routeId?: never }> |
          Readonly<{ routeId: string; entityId?: never }>))
    | Readonly<{ kind: "visible-in-camera-region"; visibleEntityId: string; cameraEntityId: string; screenRegionId: string; minimumVisibleRatio: number; minimumProjectedAreaRatio: number }>
  );

export interface LayoutEvaluationEntityV1 {
  readonly id: string;
  readonly semanticClassId?: string;
}

export interface LayoutConstraintEvaluationContextV1 {
  readonly profile: LayoutSolverProfileV1;
  readonly entitiesById: Readonly<Record<string, LayoutEvaluationEntityV1>>;
  readonly regionsById: Readonly<Record<string, LayoutSpatialRegionV1>>;
  readonly routesById: Readonly<Record<string, LayoutRouteV1>>;
  readonly screenRegionsById: Readonly<Record<string, LayoutScreenRegionV1>>;
  readonly geometry: LayoutGeometryQueryV1;
}

export type PlacementConstraintViolationCodeV1 =
  | "PLACEMENT_REFERENCE_NOT_FOUND"
  | "PLACEMENT_NON_FINITE_MEASUREMENT"
  | "PLACEMENT_REGION_CONSTRAINT_UNSATISFIED"
  | "PLACEMENT_DISTANCE_RANGE_UNSATISFIED"
  | "PLACEMENT_FACING_CONSTRAINT_UNSATISFIED"
  | "PLACEMENT_SUPPORT_CONSTRAINT_UNSATISFIED"
  | "PLACEMENT_CLEARANCE_CONFLICT"
  | "PLACEMENT_SLOPE_LIMIT_EXCEEDED"
  | "PLACEMENT_CAMERA_PROJECTED_AREA_TOO_SMALL"
  | "PLACEMENT_CAMERA_REGION_OCCLUDED"
  | "PLACEMENT_CAMERA_REGION_UNSATISFIED";

export interface ConstraintEvaluationV1 {
  readonly constraintId: string;
  readonly kind: ResolvedPlacementConstraintV1["kind"];
  readonly requirement: "required" | "preferred";
  readonly satisfied: boolean;
  readonly preferenceCostRatio: number;
  readonly measurements: Readonly<Record<string, number | boolean | string>>;
  readonly tolerances: Readonly<Record<string, number>>;
  readonly evidenceIds: readonly string[];
  readonly violationCode?: PlacementConstraintViolationCodeV1;
}

export interface ResolvedLayoutInputV1 {
  readonly kind: "worldkit-resolved-layout-input";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringSpecHash: `sha256:${string}`;
  readonly registryLockHash: `sha256:${string}`;
  readonly solverProfile: Readonly<{
    solverProfileRef: string;
    resolvedVersion: string;
    contentHash: `sha256:${string}`;
  }>;
  readonly seed: number;
  readonly worldBounds: LayoutAabbV1;
  readonly entities: readonly ResolvedLayoutEntityV1[];
  readonly regions: readonly LayoutSpatialRegionV1[];
  readonly routes: readonly LayoutRouteV1[];
  readonly screenRegions: readonly LayoutScreenRegionV1[];
  readonly constraints: readonly ResolvedPlacementConstraintV1[];
  readonly anchorsByEntityId: Readonly<Record<string, LayoutTransformV1>>;
  readonly geometry: LayoutGeometryQueryV1;
}

export type LayoutSolveStatusV1 =
  | "solved"
  | "unsatisfied"
  | "budget-exceeded"
  | "invalid-input";

export type LayoutDiagnosticCodeV1 =
  | "PLACEMENT_INPUT_INVALID"
  | "PLACEMENT_REGION_HAS_NO_CANDIDATE"
  | "PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED"
  | "PLACEMENT_SOLVER_BUDGET_EXCEEDED";

export interface LayoutDiagnosticV1 {
  readonly severity: "error";
  readonly code: LayoutDiagnosticCodeV1;
  readonly instancePath: string;
  readonly entityId?: string;
  readonly constraintIds?: readonly string[];
  readonly repairOperations?: readonly (
    | "increase-region-area"
    | "reduce-preference-weight"
    | "add-explicit-anchor"
    | "split-required-constraints"
  )[];
}

export interface LayoutPlacementResultV1 {
  readonly entityId: string;
  readonly candidateId: string;
  readonly candidateSource: LayoutCandidateSourceV1;
  readonly transform: LayoutTransformV1;
  readonly satisfiedConstraintIds: readonly string[];
  readonly preferenceCostRatio: number;
}

export interface LayoutSolveReportV1 {
  readonly kind: "worldkit-layout-solve-report";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly authoringSpecHash: `sha256:${string}`;
  readonly registryLockHash: `sha256:${string}`;
  readonly solverProfileRef: string;
  readonly resolvedVersion: string;
  readonly solverProfileHash: `sha256:${string}`;
  readonly seed: number;
  readonly status: LayoutSolveStatusV1;
  readonly placementsByEntityId: Readonly<Record<string, LayoutPlacementResultV1>>;
  readonly constraintResultsById: Readonly<Record<string, ConstraintEvaluationV1>>;
  readonly totalPreferenceCostRatio: number;
  readonly diagnostics: readonly LayoutDiagnosticV1[];
  readonly searchNodeCount: number;
  readonly conflictCheckCount: number;
  readonly conflictConstraintIds: readonly string[];
}

export interface LayoutSolveResultV1 {
  readonly status: LayoutSolveStatusV1;
  readonly report: LayoutSolveReportV1;
  readonly layoutSolveReportHash: `sha256:${string}`;
}
