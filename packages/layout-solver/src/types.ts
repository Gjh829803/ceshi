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
}
