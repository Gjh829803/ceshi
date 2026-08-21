import type { Sha256HashV1 } from "./types";

export const ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2 = [
  "ROUTE_START_SURFACE_NOT_FOUND",
  "ROUTE_DESTINATION_SURFACE_NOT_FOUND",
  "ROUTE_REQUIRED_PATH_UNREACHABLE",
  "ROUTE_STEP_HEIGHT_EXCEEDED",
  "ROUTE_SLOPE_EXCEEDED",
  "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT",
  "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT",
  "ROUTE_SURFACE_GAP_EXCEEDED",
  "ROUTE_SURFACE_PROFILE_MISSING",
  "ROUTE_LOCOMOTION_PROFILE_MISMATCH",
  "ROUTE_TRAVERSAL_LOCK_MISMATCH",
  "ROUTE_CORRIDOR_LAYER_AMBIGUOUS",
  "ROUTE_START_SUPPORT_INVALID",
  "ROUTE_RUNTIME_STALLED",
  "ROUTE_RUNTIME_DEVIATED",
  "ROUTE_RUNTIME_SUPPORT_LOST",
  "ROUTE_GRAPH_BUDGET_EXCEEDED",
] as const;

export type RouteValidationDiagnosticCodeV2 =
  (typeof ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2)[number];

export interface RouteRuntimeGateThresholdsV1 {
  readonly destinationToleranceMeters: number;
  readonly maximumRouteDeviationMeters: number;
  readonly minimumProgressMeters: number;
  readonly stalledWindowTicks: number;
  readonly maximumConsecutiveUnsupportedTicks: number;
  readonly maximumProbeTicks: number;
}

export const OUTDOOR_WORLD_PACKAGE_DEV_ROUTE_RUNTIME_GATE_THRESHOLDS_V1 = {
  destinationToleranceMeters: 0.5,
  maximumRouteDeviationMeters: 1,
  minimumProgressMeters: 0.05,
  stalledWindowTicks: 30,
  maximumConsecutiveUnsupportedTicks: 6,
  maximumProbeTicks: 1200,
} as const satisfies RouteRuntimeGateThresholdsV1;

export interface RouteConnectivityMetricsV1 {
  readonly requiredRouteCount: number;
  readonly unreachableRequiredRouteCount: number;
  readonly maximumObservedStepHeightMeters: number;
  readonly maximumObservedSlopeDegrees: number;
  readonly minimumObservedClearanceWidthMeters: number;
  readonly minimumObservedClearanceHeightMeters: number;
  readonly maximumObservedSurfaceGapMeters: number;
  readonly routePathDistanceMeters: number;
  readonly routePathCost: number;
  readonly traversalGraphNodeCount: number;
  readonly traversalGraphEdgeCount: number;
  readonly traversalGraphHash: Sha256HashV1;
}

export interface RouteRuntimeConformanceMetricsV1 {
  readonly completedRequiredRouteCount: number;
  readonly failedRequiredRouteCount: number;
  readonly maximumStalledDurationTicks: number;
  readonly maximumRouteDeviationMeters: number;
  readonly maximumConsecutiveUnexpectedUnsupportedTicks: number;
  readonly slidingDurationTicks: number;
  readonly unexpectedSupportLossCount: number;
  readonly wrongSupportSurfaceCount: number;
  readonly invalidPhysicsValueCount: number;
  readonly completionDurationTicks: number;
}
