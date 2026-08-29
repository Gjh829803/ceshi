import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  ROUTE_CONNECTIVITY_FAILURE_CODES_V2,
  type RouteConnectivityFailureV2,
} from "@whitebox-world/traversal";

import { isNil } from "lodash-es";

import type {
  RouteDiagnosticDetailsV1,
  RouteRowValidationDiagnosticV2,
} from "./types-v2";

export const ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2 = [
  ...ROUTE_CONNECTIVITY_FAILURE_CODES_V2,
  "ROUTE_LOCOMOTION_PROFILE_MISMATCH",
  "ROUTE_WATER_TRAVERSAL_UNSUPPORTED",
  "ROUTE_TRAVERSAL_LOCK_MISMATCH",
  "ROUTE_START_SUPPORT_INVALID",
  "ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH",
  "ROUTE_RUNTIME_STALLED",
  "ROUTE_RUNTIME_DEVIATED",
  "ROUTE_RUNTIME_SUPPORT_LOST",
  "ROUTE_RUNTIME_TIMEOUT",
  "ROUTE_REQUIRED_ROWS_MISSING",
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
  readonly failure: RouteConnectivityFailureV2;
}

function diagnosticDetailsForFailure(
  failure: RouteConnectivityFailureV2,
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
    case "start-surface-ambiguous":
    case "destination-surface-ambiguous":
    case "required-path-unreachable":
    case "surface-profile-missing":
    case "surface-correlation-missing":
    case "surface-correlation-ambiguous":
      return {
        kind: "state-mismatch",
        expectedState: "reachable",
        actualState: reason.kind,
      };
    case "traversal-surface-count-budget-exceeded":
    case "traversal-surface-triangle-pair-test-budget-exceeded":
      return {
        kind: "capacity-exceeded",
        maximumAllowedCount: reason.maximumAllowedCount,
        minimumRequiredCount: reason.minimumRequiredCount,
      };
  }
  const exhaustive: never = reason;
  throw new Error(`ROUTE_CONNECTIVITY_FAILURE_REASON_UNHANDLED: ${String(exhaustive)}`);
}

function diagnosticPositionForFailure(
  failure: RouteConnectivityFailureV2,
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
    case "start-surface-ambiguous":
    case "destination-surface-ambiguous":
      return reason.positionMetersXYZ;
    case "empty-heightfield-source":
    case "no-queryable-ground-surface":
    case "required-path-unreachable":
    case "node-budget-exceeded":
    case "edge-budget-exceeded":
    case "search-budget-exceeded":
    case "straight-path-capacity-exceeded":
    case "traversal-surface-count-budget-exceeded":
    case "traversal-surface-triangle-pair-test-budget-exceeded":
      return failure.startAnchorPositionMetersXYZ;
    case "surface-profile-missing":
    case "surface-correlation-missing":
    case "surface-correlation-ambiguous":
      return reason.failurePositionMetersXYZ;
  }
  const exhaustive: never = reason;
  throw new Error(`ROUTE_CONNECTIVITY_FAILURE_REASON_UNHANDLED: ${String(exhaustive)}`);
}

function remediationForFailure(failure: RouteConnectivityFailureV2): string {
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
    case "start-surface-ambiguous":
    case "destination-surface-ambiguous":
      return "Move the Anchor onto exactly one walkable height layer or remove the overlapping layer.";
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
    case "surface-profile-missing":
    case "surface-correlation-missing":
    case "surface-correlation-ambiguous":
      return "Repair the Heightfield, Anchors, blockers, or Route ribbon and rebuild traversal evidence.";
    case "traversal-surface-count-budget-exceeded":
    case "traversal-surface-triangle-pair-test-budget-exceeded":
      return "Reduce Route complexity or select a reviewed Graph Builder Profile with sufficient capacity.";
  }
  const exhaustive: never = failure.reason;
  throw new Error(`ROUTE_CONNECTIVITY_FAILURE_REASON_UNHANDLED: ${String(exhaustive)}`);
}

export function createRouteConnectivityValidationDiagnosticV2(
  input: CreateRouteConnectivityValidationDiagnosticInputV2,
): RouteRowValidationDiagnosticV2 {
  const { failure } = input;
  return {
    id: input.id,
    scope: "route-row",
    code: failure.reason.code,
    severity: "error",
    gateId: "route-connectivity",
    metricId: input.metricId,
    constraintId: failure.constraintId,
    routeId: failure.routeId,
    traversingEntityId: failure.traversingEntityId,
    startAnchorEntityId: failure.startAnchorEntityId,
    destinationAnchorEntityId: failure.destinationAnchorEntityId,
    ...(isNil(failure.relatedTraversalSurfaceIdentities[0])
      ? {}
      : {
          traversalSurfaceId:
            failure.relatedTraversalSurfaceIdentities[0].traversalSurfaceId,
          colliderSubshapeId:
            failure.relatedTraversalSurfaceIdentities[0].colliderSubshapeId,
          relatedTraversalSurfaceIdentities:
            failure.relatedTraversalSurfaceIdentities,
        }),
    positionMetersXYZ: diagnosticPositionForFailure(failure),
    evidenceArtifactRefs: [input.evidenceArtifactRef],
    details: diagnosticDetailsForFailure(failure),
    message: `Required Route '${failure.routeId}' failed: ${failure.reason.kind}.`,
    suggestedFix: remediationForFailure(failure),
  };
}
