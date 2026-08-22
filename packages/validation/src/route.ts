import {
  ROUTE_CONNECTIVITY_FAILURE_CODES_V1,
  type RouteConnectivityFailureV1,
} from "@whitebox-world/traversal";

import type { Sha256HashV1 } from "./types";
import type {
  RouteDiagnosticDetailsV1,
  ValidationDiagnosticV2,
} from "./types-v2";

export const ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2 = [
  ...ROUTE_CONNECTIVITY_FAILURE_CODES_V1,
  "ROUTE_SURFACE_PROFILE_MISSING",
  "ROUTE_LOCOMOTION_PROFILE_MISMATCH",
  "ROUTE_WATER_TRAVERSAL_UNSUPPORTED",
  "ROUTE_TRAVERSAL_LOCK_MISMATCH",
  "ROUTE_CORRIDOR_LAYER_AMBIGUOUS",
  "ROUTE_START_SUPPORT_INVALID",
  "ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH",
  "ROUTE_RUNTIME_STALLED",
  "ROUTE_RUNTIME_DEVIATED",
  "ROUTE_RUNTIME_SUPPORT_LOST",
  "ROUTE_RUNTIME_TIMEOUT",
] as const;

export type RouteValidationDiagnosticCodeV2 =
  (typeof ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2)[number];

export interface RouteRuntimeGateThresholdsV1 {
  readonly destinationToleranceMetersXZ: number;
  readonly maximumRouteDeviationMetersXZ: number;
  readonly minimumProgressMetersXZ: number;
  readonly stalledWindowTicks: number;
  readonly maximumConsecutiveUnsupportedTicks: number;
  readonly maximumProbeTicks: number;
}

export const OUTDOOR_WORLD_PACKAGE_DEV_ROUTE_RUNTIME_GATE_THRESHOLDS_V1 = {
  destinationToleranceMetersXZ: 0.5,
  maximumRouteDeviationMetersXZ: 1,
  minimumProgressMetersXZ: 0.05,
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
  readonly maximumRouteDeviationMetersXZ: number;
  readonly maximumConsecutiveUnexpectedUnsupportedTicks: number;
  readonly slidingDurationTicks: number;
  readonly unexpectedSupportLossCount: number;
  readonly wrongSupportSurfaceCount: number;
  readonly invalidPhysicsValueCount: number;
  readonly completionDurationTicks: number;
}

export interface CreateRouteConnectivityValidationDiagnosticInputV2 {
  readonly id: string;
  readonly metricId: string;
  readonly evidenceArtifactRef: string;
  readonly failure: RouteConnectivityFailureV1;
}

function diagnosticDetailsForFailure(
  failure: RouteConnectivityFailureV1,
): RouteDiagnosticDetailsV1 {
  const reason = failure.reason;
  switch (reason.kind) {
    case "slope-threshold-exceeded":
      return {
        kind: "degrees-threshold",
        expectedDegrees: reason.maximumAllowedSlopeDegrees,
        actualDegrees: reason.maximumObservedSlopeDegrees,
      };
    case "step-height-threshold-exceeded":
      return {
        kind: "meters-threshold",
        expectedMeters: reason.maximumAllowedStepHeightMeters,
        actualMeters: reason.maximumObservedStepHeightMeters,
      };
    case "clearance-width-insufficient":
      return {
        kind: "meters-threshold",
        expectedMeters: reason.minimumRequiredClearanceWidthMeters,
        actualMeters: reason.minimumObservedClearanceWidthMeters,
      };
    case "overhead-clearance-insufficient":
      return {
        kind: "meters-threshold",
        expectedMeters: reason.minimumRequiredClearanceHeightMeters,
        actualMeters: reason.minimumObservedClearanceHeightMeters,
      };
    case "surface-gap-exceeded":
      return {
        kind: "meters-threshold",
        expectedMeters: reason.maximumAllowedSurfaceGapMeters,
        actualMeters: reason.maximumObservedSurfaceGapMeters,
      };
    case "node-budget-exceeded":
    case "edge-budget-exceeded":
    case "search-budget-exceeded":
    case "straight-path-capacity-exceeded":
      return {
        kind: "capacity-exceeded",
        maximumAllowedCount: reason.maximumAllowedCount,
        minimumRequiredCount: reason.minimumRequiredCount,
      };
    case "empty-heightfield-source":
    case "no-queryable-ground-surface":
    case "start-surface-not-found":
    case "destination-surface-not-found":
    case "required-path-unreachable":
      return {
        kind: "state-mismatch",
        expectedState: "reachable",
        actualState: reason.kind,
      };
  }
  const exhaustive: never = reason;
  throw new Error(`ROUTE_CONNECTIVITY_FAILURE_REASON_UNHANDLED: ${String(exhaustive)}`);
}

function diagnosticPositionForFailure(
  failure: RouteConnectivityFailureV1,
): readonly [number, number, number] {
  const reason = failure.reason;
  switch (reason.kind) {
    case "slope-threshold-exceeded":
    case "step-height-threshold-exceeded":
    case "clearance-width-insufficient":
    case "overhead-clearance-insufficient":
    case "surface-gap-exceeded":
      return reason.failurePositionMetersXYZ;
    case "start-surface-not-found":
    case "destination-surface-not-found":
      return reason.positionMetersXYZ;
    case "empty-heightfield-source":
    case "no-queryable-ground-surface":
    case "required-path-unreachable":
    case "node-budget-exceeded":
    case "edge-budget-exceeded":
    case "search-budget-exceeded":
    case "straight-path-capacity-exceeded":
      return failure.startAnchorPositionMetersXYZ;
  }
  const exhaustive: never = reason;
  throw new Error(`ROUTE_CONNECTIVITY_FAILURE_REASON_UNHANDLED: ${String(exhaustive)}`);
}

function remediationForFailure(failure: RouteConnectivityFailureV1): string {
  switch (failure.reason.kind) {
    case "slope-threshold-exceeded":
      return "Reduce the slope or add a longer walkable ramp inside the Route ribbon.";
    case "step-height-threshold-exceeded":
      return "Lower the step, add intermediate treads, or replace it with a compliant ramp.";
    case "clearance-width-insufficient":
      return "Widen the traversable corridor or move blocking Colliders away from the Route.";
    case "overhead-clearance-insufficient":
      return "Raise or remove the overhead Collider to restore the locked capsule clearance.";
    case "surface-gap-exceeded":
      return "Close the unsupported gap with continuous Heightfield ground.";
    case "node-budget-exceeded":
    case "edge-budget-exceeded":
    case "search-budget-exceeded":
    case "straight-path-capacity-exceeded":
      return "Reduce Route complexity or select a reviewed Graph Builder Profile with sufficient capacity.";
    case "empty-heightfield-source":
    case "no-queryable-ground-surface":
    case "start-surface-not-found":
    case "destination-surface-not-found":
    case "required-path-unreachable":
      return "Repair the Heightfield, Anchors, blockers, or Route ribbon and rebuild traversal evidence.";
  }
  const exhaustive: never = failure.reason;
  throw new Error(`ROUTE_CONNECTIVITY_FAILURE_REASON_UNHANDLED: ${String(exhaustive)}`);
}

export function createRouteConnectivityValidationDiagnosticV2(
  input: CreateRouteConnectivityValidationDiagnosticInputV2,
): ValidationDiagnosticV2 {
  const { failure } = input;
  return {
    id: input.id,
    code: failure.reason.code,
    severity: "error",
    gateId: "route-connectivity",
    metricId: input.metricId,
    routeId: failure.routeId,
    traversingEntityId: failure.traversingEntityId,
    startAnchorEntityId: failure.startAnchorEntityId,
    destinationAnchorEntityId: failure.destinationAnchorEntityId,
    traversalSurfaceId: failure.traversalSurfaceId,
    colliderSubshapeId: failure.colliderSubshapeId,
    positionMetersXYZ: diagnosticPositionForFailure(failure),
    evidenceArtifactRefs: [input.evidenceArtifactRef],
    details: diagnosticDetailsForFailure(failure),
    message: `Required Route '${failure.routeId}' failed: ${failure.reason.kind}.`,
    suggestedFix: remediationForFailure(failure),
  };
}
