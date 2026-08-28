import type { Sha256HashV1 } from "@whitebox-world/protocol";

export type ValidationReportStatusV1 = "passed" | "failed" | "incomplete";
export type ValidationGateRequirementV1 = "blocking" | "advisory";
export type ValidationGateStatusV1 =
  | "passed"
  | "failed"
  | "incomplete"
  | "not-applicable";
export type ValidationMetricStatusV1 =
  | "passed"
  | "failed"
  | "not-evaluated"
  | "not-applicable";

interface MetricDefinitionBaseV1 {
  readonly id: string;
  readonly isRequired: boolean;
  readonly evaluatorProfileRef: string;
}

export interface BooleanAssertionMetricDefinitionV1
  extends MetricDefinitionBaseV1 {
  readonly kind: "boolean-assertion";
  readonly expectedValue: boolean;
}

export interface CountThresholdMetricDefinitionV1
  extends MetricDefinitionBaseV1 {
  readonly kind: "count-threshold";
  readonly minimumAllowedCount?: number;
  readonly maximumAllowedCount?: number;
}

export interface SetEqualityMetricDefinitionV1 extends MetricDefinitionBaseV1 {
  readonly kind: "set-equality";
  readonly expectedValues: readonly string[];
}

export interface HashEqualityMetricDefinitionV1 extends MetricDefinitionBaseV1 {
  readonly kind: "hash-equality";
  readonly expectedHash: Sha256HashV1;
}

export type MetricDefinitionV1 =
  | BooleanAssertionMetricDefinitionV1
  | CountThresholdMetricDefinitionV1
  | SetEqualityMetricDefinitionV1
  | HashEqualityMetricDefinitionV1;

export interface GateDefinitionV1 {
  readonly id: string;
  readonly requirement: ValidationGateRequirementV1;
  readonly metricDefinitionsById: Readonly<Record<string, MetricDefinitionV1>>;
}

export interface ValidationProfileV1 {
  readonly kind: "worldkit-validation-profile";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly resourceRef: string;
  readonly version: string;
  readonly subjectKind: "control-capture-bundle";
  readonly gateDefinitionsById: Readonly<Record<string, GateDefinitionV1>>;
}

interface MetricResultBaseV1 {
  readonly id: string;
  readonly status: ValidationMetricStatusV1;
  readonly evaluatorProfileRef: string;
  readonly evidenceArtifactRefs: readonly string[];
  readonly diagnosticIds: readonly string[];
}

export interface BooleanAssertionMetricResultV1 extends MetricResultBaseV1 {
  readonly kind: "boolean-assertion";
  readonly value?: boolean;
  readonly expectedValue: boolean;
}

export interface CountThresholdMetricResultV1 extends MetricResultBaseV1 {
  readonly kind: "count-threshold";
  readonly valueCount?: number;
  readonly minimumAllowedCount?: number;
  readonly maximumAllowedCount?: number;
}

export interface SetEqualityMetricResultV1 extends MetricResultBaseV1 {
  readonly kind: "set-equality";
  readonly actualValues?: readonly string[];
  readonly expectedValues: readonly string[];
}

export interface HashEqualityMetricResultV1 extends MetricResultBaseV1 {
  readonly kind: "hash-equality";
  readonly actualHash?: Sha256HashV1;
  readonly expectedHash: Sha256HashV1;
}

export type MetricResultV1 =
  | BooleanAssertionMetricResultV1
  | CountThresholdMetricResultV1
  | SetEqualityMetricResultV1
  | HashEqualityMetricResultV1;

export interface GateResultV1 {
  readonly id: string;
  readonly requirement: ValidationGateRequirementV1;
  readonly status: ValidationGateStatusV1;
  readonly metricResultsById: Readonly<Record<string, MetricResultV1>>;
  readonly diagnosticIds: readonly string[];
}

export interface ControlCaptureBundleValidationSubjectV1 {
  readonly kind: "control-capture-bundle";
  readonly worldPackageRootHash: Sha256HashV1;
  readonly takeHash: Sha256HashV1;
  readonly bundleRootHash: Sha256HashV1;
}

export interface EvidenceArtifactV1 {
  readonly id: string;
  readonly kind: "control-capture-bundle";
  readonly artifactRef: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly contentHash: Sha256HashV1;
}

export type ValidationDiagnosticCodeV1 =
  | "CAPTURE_BUNDLE_JSON_INVALID"
  | "CAPTURE_FILE_HASH_MISMATCH"
  | "CAPTURE_FILE_MISSING"
  | "CAPTURE_FILE_UNDECLARED"
  | "CAPTURE_FRAME_INDEX_INVALID"
  | "CAPTURE_FRAME_DIMENSIONS_INVALID"
  | "CAPTURE_FRAME_HASH_MISMATCH"
  | "CAPTURE_FRAME_TICK_INVALID"
  | "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH"
  | "CAPTURE_GAMEPLAY_TRACK_INVALID"
  | "CAPTURE_LINEAR_DEPTH_INVALID"
  | "CAPTURE_MANIFEST_HASH_MISMATCH"
  | "CAPTURE_REQUIRED_PASS_MISSING"
  | "CAPTURE_ROOT_HASH_MISMATCH"
  | "CAPTURE_PROFILE_MISMATCH"
  | "CAPTURE_SESSION_MISMATCH"
  | "CAPTURE_TABLE_INVALID"
  | "CAPTURE_TAKE_MISMATCH"
  | "CAPTURE_WORLD_PACKAGE_MISMATCH"
  | "VALIDATION_EVALUATOR_FAILED"
  | "VALIDATION_REQUIRED_METRIC_MISSING";

export interface ValidationDiagnosticV1 {
  readonly id: string;
  readonly code: ValidationDiagnosticCodeV1;
  readonly severity: "error" | "warning";
  readonly gateId: string;
  readonly metricId: string;
  readonly artifactPath: string;
  readonly expectedValue: string;
  readonly actualValue: string;
  readonly message: string;
  readonly suggestedFix: string;
}

export interface ValidationReportV1 {
  readonly kind: "worldkit-validation-report";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly subject: ControlCaptureBundleValidationSubjectV1;
  readonly validationProfileRef: string;
  readonly resolvedVersion: string;
  readonly validationProfileHash: Sha256HashV1;
  readonly status: ValidationReportStatusV1;
  readonly gateResultsById: Readonly<Record<string, GateResultV1>>;
  readonly evidenceArtifactsById: Readonly<
    Record<string, EvidenceArtifactV1>
  >;
  readonly diagnostics: readonly ValidationDiagnosticV1[];
}

export type ValidationContractDiagnosticCodeV1 =
  | "VALIDATION_ARRAY_INVALID"
  | "VALIDATION_BOOLEAN_INVALID"
  | "VALIDATION_ENUM_INVALID"
  | "VALIDATION_FIELD_UNKNOWN"
  | "VALIDATION_HASH_INVALID"
  | "VALIDATION_INTEGER_INVALID"
  | "VALIDATION_MAP_ID_MISMATCH"
  | "VALIDATION_METRIC_KIND_INVALID"
  | "VALIDATION_NUMBER_INVALID"
  | "VALIDATION_OBJECT_INVALID"
  | "VALIDATION_REFERENCE_INVALID"
  | "VALIDATION_STATUS_INCONSISTENT"
  | "VALIDATION_STRING_INVALID";

export interface ValidationContractDiagnosticV1 {
  readonly code: ValidationContractDiagnosticCodeV1;
  readonly path: string;
  readonly message: string;
}

export type ValidationContractResultV1<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly ValidationContractDiagnosticV1[];
    };
