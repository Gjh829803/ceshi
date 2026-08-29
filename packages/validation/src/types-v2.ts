import type { Sha256HashV1 } from "@whitebox-world/protocol";

import type {
  BooleanAssertionMetricDefinitionV1,
  BooleanAssertionMetricResultV1,
  CountThresholdMetricDefinitionV1,
  CountThresholdMetricResultV1,
  HashEqualityMetricDefinitionV1,
  HashEqualityMetricResultV1,
  SetEqualityMetricDefinitionV1,
  SetEqualityMetricResultV1,
  ValidationDiagnosticCodeV1,
  ValidationGateRequirementV1,
  ValidationGateStatusV1,
  ValidationMetricStatusV1,
  ValidationReportStatusV1,
} from "./types";
import type {
  RouteRuntimeGateThresholdsV1,
  RouteValidationDiagnosticCodeV2,
} from "./route";
import type { TraversalSurfaceIdentityV1 } from "@whitebox-world/traversal";

interface MetricDefinitionBaseV2 {
  readonly id: string;
  readonly isRequired: boolean;
  readonly evaluatorProfileRef: string;
}

export interface MetersThresholdMetricDefinitionV2 extends MetricDefinitionBaseV2 {
  readonly kind: "meters-threshold";
  readonly minimumAllowedMeters?: number;
  readonly maximumAllowedMeters?: number;
}

export interface DegreesThresholdMetricDefinitionV2 extends MetricDefinitionBaseV2 {
  readonly kind: "degrees-threshold";
  readonly minimumAllowedDegrees?: number;
  readonly maximumAllowedDegrees?: number;
}

export interface TicksThresholdMetricDefinitionV2 extends MetricDefinitionBaseV2 {
  readonly kind: "ticks-threshold";
  readonly minimumAllowedTicks?: number;
  readonly maximumAllowedTicks?: number;
}

export interface CostThresholdMetricDefinitionV2 extends MetricDefinitionBaseV2 {
  readonly kind: "cost-threshold";
  readonly minimumAllowedCost?: number;
  readonly maximumAllowedCost?: number;
}

export type MetricDefinitionV2 =
  | BooleanAssertionMetricDefinitionV1
  | CountThresholdMetricDefinitionV1
  | SetEqualityMetricDefinitionV1
  | HashEqualityMetricDefinitionV1
  | MetersThresholdMetricDefinitionV2
  | DegreesThresholdMetricDefinitionV2
  | TicksThresholdMetricDefinitionV2
  | CostThresholdMetricDefinitionV2;

export interface GateDefinitionV2 {
  readonly id: string;
  readonly requirement: ValidationGateRequirementV1;
  readonly metricDefinitionsById: Readonly<Record<string, MetricDefinitionV2>>;
}

export interface ValidationProfileV2 {
  readonly kind: "worldkit-validation-profile";
  readonly schemaVersion: 2;
  readonly id: string;
  readonly resourceRef: string;
  readonly version: string;
  readonly subjectKind: "world-package";
  readonly routeRuntimeGateThresholds: RouteRuntimeGateThresholdsV1;
  readonly gateDefinitionsById: Readonly<Record<string, GateDefinitionV2>>;
}

interface MetricResultBaseV2 {
  readonly id: string;
  readonly status: ValidationMetricStatusV1;
  readonly evaluatorProfileRef: string;
  readonly evidenceArtifactRefs: readonly string[];
  readonly diagnosticIds: readonly string[];
}

export interface MetersThresholdMetricResultV2 extends MetricResultBaseV2 {
  readonly kind: "meters-threshold";
  readonly valueMeters?: number;
  readonly minimumAllowedMeters?: number;
  readonly maximumAllowedMeters?: number;
}

export interface DegreesThresholdMetricResultV2 extends MetricResultBaseV2 {
  readonly kind: "degrees-threshold";
  readonly valueDegrees?: number;
  readonly minimumAllowedDegrees?: number;
  readonly maximumAllowedDegrees?: number;
}

export interface TicksThresholdMetricResultV2 extends MetricResultBaseV2 {
  readonly kind: "ticks-threshold";
  readonly valueTicks?: number;
  readonly minimumAllowedTicks?: number;
  readonly maximumAllowedTicks?: number;
}

export interface CostThresholdMetricResultV2 extends MetricResultBaseV2 {
  readonly kind: "cost-threshold";
  readonly valueCost?: number;
  readonly minimumAllowedCost?: number;
  readonly maximumAllowedCost?: number;
}

export type MetricResultV2 =
  | BooleanAssertionMetricResultV1
  | CountThresholdMetricResultV1
  | SetEqualityMetricResultV1
  | HashEqualityMetricResultV1
  | MetersThresholdMetricResultV2
  | DegreesThresholdMetricResultV2
  | TicksThresholdMetricResultV2
  | CostThresholdMetricResultV2;

export interface GateResultV2 {
  readonly id: string;
  readonly requirement: ValidationGateRequirementV1;
  readonly status: ValidationGateStatusV1;
  readonly metricResultsById: Readonly<Record<string, MetricResultV2>>;
  readonly diagnosticIds: readonly string[];
}

export interface WorldPackageValidationSubjectV1 {
  readonly kind: "world-package";
  readonly worldPackageRootHash: Sha256HashV1;
  readonly authoringSpecHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly worldBuildIdentityHash: Sha256HashV1;
  readonly resourceLockHash: Sha256HashV1;
  readonly layoutSolveReportHash: Sha256HashV1;
}

export type EvidenceArtifactKindV2 =
  | "route-validation-set-receipt"
  | "traversal-graph"
  | "route-path-receipt"
  | "route-connectivity-failure"
  | "route-runtime-probe-receipt"
  | "route-overlay";

interface EvidenceArtifactBaseV2 {
  readonly id: string;
  readonly kind: EvidenceArtifactKindV2;
  readonly artifactRef: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly contentHash: Sha256HashV1;
}

export interface RouteValidationSetRowV1 {
  readonly constraintId: string;
  readonly routeId: string;
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly resolvedTraversalLockHash: Sha256HashV1;
  readonly connectivityStatus: "complete" | "unreachable" | "incomplete";
  readonly runtimeStatus: "complete" | "failed" | "not-run";
  readonly evidenceArtifactRefs: readonly string[];
}

export interface RouteValidationRequiredRouteV1 {
  readonly constraintId: string;
  readonly routeId: string;
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
}

export interface RouteValidationSetReceiptV1 {
  readonly kind: "route-validation-set-receipt";
  readonly schemaVersion: 1;
  readonly authoringSpecHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly executionPlanHash: Sha256HashV1;
  readonly resourceLockHash: Sha256HashV1;
  readonly layoutSolveReportHash: Sha256HashV1;
  readonly requiredRouteCount: number;
  readonly requiredRouteSetHash: Sha256HashV1;
  readonly requiredRoutes: readonly RouteValidationRequiredRouteV1[];
  readonly rows: readonly RouteValidationSetRowV1[];
}

export interface RouteValidationSetReceiptEvidenceArtifactV2
  extends EvidenceArtifactBaseV2 {
  readonly kind: "route-validation-set-receipt";
  readonly receipt: RouteValidationSetReceiptV1;
}

interface RouteEvidenceArtifactBaseV2 extends EvidenceArtifactBaseV2 {
  readonly constraintId: string;
  readonly routeId: string;
}

export interface TraversalGraphEvidenceArtifactV2 extends RouteEvidenceArtifactBaseV2 {
  readonly kind: "traversal-graph";
  readonly resolvedTraversalLockHash: Sha256HashV1;
  readonly graphBuilderProfileRef: string;
  readonly graphBuilderResolvedVersion: string;
  readonly graphBuilderProfileHash: Sha256HashV1;
}

export interface RoutePathReceiptEvidenceArtifactV2 extends RouteEvidenceArtifactBaseV2 {
  readonly kind: "route-path-receipt";
  readonly resolvedTraversalLockHash: Sha256HashV1;
  readonly graphBuilderProfileRef: string;
  readonly graphBuilderResolvedVersion: string;
  readonly graphBuilderProfileHash: Sha256HashV1;
}

export interface RouteConnectivityFailureEvidenceArtifactV2
  extends RouteEvidenceArtifactBaseV2 {
  readonly kind: "route-connectivity-failure";
  readonly routeBuildInputHash: Sha256HashV1;
  readonly resolvedTraversalLockHash: Sha256HashV1;
  readonly graphBuilderProfileRef: string;
  readonly graphBuilderResolvedVersion: string;
  readonly graphBuilderProfileHash: Sha256HashV1;
}

export interface RouteRuntimeProbeReceiptEvidenceArtifactV2 extends RouteEvidenceArtifactBaseV2 {
  readonly kind: "route-runtime-probe-receipt";
  readonly resolvedTraversalLockHash: Sha256HashV1;
  readonly driverProfileRef: string;
  readonly driverResolvedVersion: string;
  readonly driverProfileHash: Sha256HashV1;
  readonly runtimeBackendRef: string;
  readonly runtimeBackendResolvedVersion: string;
  readonly runtimeBackendHash: Sha256HashV1;
  readonly runtimeAdapterRef: string;
  readonly runtimeAdapterResolvedVersion: string;
  readonly runtimeAdapterHash: Sha256HashV1;
}

export interface RouteOverlayEvidenceArtifactV2 extends RouteEvidenceArtifactBaseV2 {
  readonly kind: "route-overlay";
  readonly resolvedTraversalLockHash: Sha256HashV1;
}

export type EvidenceArtifactV2 =
  | RouteValidationSetReceiptEvidenceArtifactV2
  | TraversalGraphEvidenceArtifactV2
  | RoutePathReceiptEvidenceArtifactV2
  | RouteConnectivityFailureEvidenceArtifactV2
  | RouteRuntimeProbeReceiptEvidenceArtifactV2
  | RouteOverlayEvidenceArtifactV2;

export type RouteDiagnosticDetailsV1 =
  | Readonly<{
      kind: "meters-threshold";
      expectedMeters: number;
      actualMeters: number;
    }>
  | Readonly<{
      kind: "degrees-threshold";
      expectedDegrees: number;
      actualDegrees: number;
    }>
  | Readonly<{
      kind: "ticks-threshold";
      expectedTicks: number;
      actualTicks: number;
    }>
  | Readonly<{
      kind: "count-threshold";
      maximumAllowedCount: number;
      actualCount: number;
    }>
  | Readonly<{
      kind: "capacity-exceeded";
      maximumAllowedCount: number;
      minimumRequiredCount: number;
    }>
  | Readonly<{
      kind: "hash-mismatch";
      expectedHash: Sha256HashV1;
      actualHash: Sha256HashV1;
    }>
  | Readonly<{
      kind: "identity-mismatch";
      expectedId: string;
      actualId: string;
    }>
  | Readonly<{
      kind: "missing-reference";
      missingRef: string;
    }>
  | Readonly<{
      kind: "state-mismatch";
      expectedState: string;
      actualState: string;
    }>;

export type ValidationDiagnosticCodeV2 =
  | ValidationDiagnosticCodeV1
  | RouteValidationDiagnosticCodeV2;

interface ValidationDiagnosticBaseV2 {
  readonly id: string;
  readonly code: ValidationDiagnosticCodeV2;
  readonly severity: "error" | "warning";
  readonly gateId: string;
  readonly metricId: string;
  readonly evidenceArtifactRefs: readonly string[];
  readonly details: RouteDiagnosticDetailsV1;
  readonly message: string;
  readonly suggestedFix: string;
}

export interface WorldValidationDiagnosticV2 extends ValidationDiagnosticBaseV2 {
  readonly scope: "world";
}

export interface RouteRowValidationDiagnosticV2 extends ValidationDiagnosticBaseV2 {
  readonly scope: "route-row";
  readonly constraintId: string;
  readonly routeId: string;
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly traversalSurfaceId?: string;
  readonly colliderSubshapeId?: string;
  readonly relatedTraversalSurfaceIdentities?: readonly TraversalSurfaceIdentityV1[];
  readonly positionMetersXYZ?: readonly [number, number, number];
}

export type ValidationDiagnosticV2 =
  | WorldValidationDiagnosticV2
  | RouteRowValidationDiagnosticV2;

export interface ValidationReportV2 {
  readonly kind: "worldkit-validation-report";
  readonly schemaVersion: 2;
  readonly id: string;
  readonly subject: WorldPackageValidationSubjectV1;
  readonly dependencyReportRefs: readonly string[];
  readonly validationProfileRef: string;
  readonly resolvedVersion: string;
  readonly validationProfileHash: Sha256HashV1;
  readonly routeValidationSetReceipt: RouteValidationSetReceiptV1;
  readonly status: ValidationReportStatusV1;
  readonly gateResultsById: Readonly<Record<string, GateResultV2>>;
  readonly evidenceArtifactsById: Readonly<Record<string, EvidenceArtifactV2>>;
  readonly diagnostics: readonly ValidationDiagnosticV2[];
}
