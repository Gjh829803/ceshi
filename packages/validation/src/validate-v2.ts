import { groupBy, isEqual, isNil, isPlainObject } from "lodash-es";
import { canonicalJsonBytes, sha256Bytes } from "@whitebox-world/protocol";
import {
  resolveTraversalDriverProfileV1,
  resolveTraversalGraphBuilderProfile,
} from "@whitebox-world/traversal";

import {
  deriveValidationGateStatusV2,
  deriveValidationReportStatusV2,
} from "./policy";
import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
} from "./profile-v2";
import { ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2 } from "./route";
import { canonicalRouteValidationSetReceiptV1 } from "./route-validation-set";
import type {
  ValidationContractDiagnosticCodeV1,
  ValidationContractDiagnosticV1,
  ValidationContractResultV1,
} from "./types";
import type {
  EvidenceArtifactKindV2,
  EvidenceArtifactV2,
  GateDefinitionV2,
  GateResultV2,
  MetricDefinitionV2,
  MetricResultV2,
  ValidationDiagnosticV2,
  ValidationProfileV2,
  ValidationReportV2,
} from "./types-v2";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_SHA256 = `sha256:${"0".repeat(64)}`;
const CAPTURE_DIAGNOSTIC_CODES_V1 = [
  "CAPTURE_BUNDLE_JSON_INVALID",
  "CAPTURE_FILE_HASH_MISMATCH",
  "CAPTURE_FILE_MISSING",
  "CAPTURE_FILE_UNDECLARED",
  "CAPTURE_FRAME_INDEX_INVALID",
  "CAPTURE_FRAME_DIMENSIONS_INVALID",
  "CAPTURE_FRAME_HASH_MISMATCH",
  "CAPTURE_FRAME_TICK_INVALID",
  "CAPTURE_LINEAR_DEPTH_INVALID",
  "CAPTURE_MANIFEST_HASH_MISMATCH",
  "CAPTURE_REQUIRED_PASS_MISSING",
  "CAPTURE_ROOT_HASH_MISMATCH",
  "CAPTURE_PROFILE_MISMATCH",
  "CAPTURE_SESSION_MISMATCH",
  "CAPTURE_TABLE_INVALID",
  "CAPTURE_TAKE_MISMATCH",
  "CAPTURE_WORLD_PACKAGE_MISMATCH",
  "VALIDATION_EVALUATOR_FAILED",
  "VALIDATION_REQUIRED_METRIC_MISSING",
] as const;

const VALIDATION_DIAGNOSTIC_CODES_V2 = [
  ...CAPTURE_DIAGNOSTIC_CODES_V1,
  ...ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2,
];

const EVIDENCE_KINDS_V2 = [
  "route-validation-set-receipt",
  "traversal-graph",
  "route-path-receipt",
  "route-connectivity-failure",
  "route-runtime-probe-receipt",
  "route-overlay",
] as const;

const LOCK_DERIVED_THRESHOLD_METRIC_IDS = new Set([
  "maximum-observed-step-height-meters",
  "maximum-observed-slope-degrees",
  "minimum-observed-clearance-width-meters",
  "minimum-observed-clearance-height-meters",
  "maximum-observed-surface-gap-meters",
]);

function hasClosedLockDerivedResultBounds(
  metricId: string,
  kind: string,
  record: Readonly<Record<string, unknown>>,
): boolean {
  if (metricId === "maximum-observed-slope-degrees") {
    return kind === "degrees-threshold" &&
      isNil(record.minimumAllowedDegrees) &&
      typeof record.maximumAllowedDegrees === "number";
  }
  if (
    metricId === "maximum-observed-step-height-meters"
  ) {
    return kind === "meters-threshold" &&
      isNil(record.minimumAllowedMeters) &&
      typeof record.maximumAllowedMeters === "number";
  }
  if (metricId === "maximum-observed-surface-gap-meters") {
    return kind === "meters-threshold" &&
      isNil(record.minimumAllowedMeters) &&
      record.maximumAllowedMeters === 0;
  }
  if (
    metricId === "minimum-observed-clearance-width-meters" ||
    metricId === "minimum-observed-clearance-height-meters"
  ) {
    return kind === "meters-threshold" &&
      typeof record.minimumAllowedMeters === "number" &&
      isNil(record.maximumAllowedMeters);
  }
  return false;
}

const EVIDENCE_BASE_FIELDS = [
  "id",
  "kind",
  "artifactRef",
  "mediaType",
  "sizeBytes",
  "contentHash",
] as const;

const ROUTE_EVIDENCE_BASE_FIELDS = [
  ...EVIDENCE_BASE_FIELDS,
  "constraintId",
  "routeId",
] as const;

const EVIDENCE_FIELDS_BY_KIND: Readonly<Record<string, readonly string[]>> = {
  "traversal-graph": [
    ...ROUTE_EVIDENCE_BASE_FIELDS,
    "resolvedTraversalLockHash",
    "graphBuilderProfileRef",
    "graphBuilderResolvedVersion",
    "graphBuilderProfileHash",
  ],
  "route-path-receipt": [
    ...ROUTE_EVIDENCE_BASE_FIELDS,
    "resolvedTraversalLockHash",
    "graphBuilderProfileRef",
    "graphBuilderResolvedVersion",
    "graphBuilderProfileHash",
  ],
  "route-connectivity-failure": [
    ...ROUTE_EVIDENCE_BASE_FIELDS,
    "routeBuildInputHash",
    "resolvedTraversalLockHash",
    "graphBuilderProfileRef",
    "graphBuilderResolvedVersion",
    "graphBuilderProfileHash",
  ],
  "route-runtime-probe-receipt": [
    ...ROUTE_EVIDENCE_BASE_FIELDS,
    "resolvedTraversalLockHash",
    "driverProfileRef",
    "driverResolvedVersion",
    "driverProfileHash",
    "runtimeBackendRef",
    "runtimeBackendResolvedVersion",
    "runtimeBackendHash",
    "runtimeAdapterRef",
    "runtimeAdapterResolvedVersion",
    "runtimeAdapterHash",
  ],
  "route-overlay": [
    ...ROUTE_EVIDENCE_BASE_FIELDS,
    "resolvedTraversalLockHash",
  ],
  "route-validation-set-receipt": [...EVIDENCE_BASE_FIELDS, "receipt"],
};

const REQUIRED_EVIDENCE_KINDS_BY_GATE: Readonly<
  Record<string, ReadonlySet<EvidenceArtifactKindV2>>
> = {
  "route-connectivity": new Set(["traversal-graph", "route-path-receipt"]),
  "route-runtime-conformance": new Set(["route-runtime-probe-receipt"]),
};

const METRIC_DEFINITION_FIELDS_BY_KIND: Readonly<Record<string, readonly string[]>> = {
  "boolean-assertion": ["id", "kind", "isRequired", "evaluatorProfileRef", "expectedValue"],
  "count-threshold": [
    "id",
    "kind",
    "isRequired",
    "evaluatorProfileRef",
    "minimumAllowedCount",
    "maximumAllowedCount",
  ],
  "set-equality": ["id", "kind", "isRequired", "evaluatorProfileRef", "expectedValues"],
  "hash-equality": ["id", "kind", "isRequired", "evaluatorProfileRef", "expectedHash"],
  "meters-threshold": [
    "id",
    "kind",
    "isRequired",
    "evaluatorProfileRef",
    "minimumAllowedMeters",
    "maximumAllowedMeters",
  ],
  "degrees-threshold": [
    "id",
    "kind",
    "isRequired",
    "evaluatorProfileRef",
    "minimumAllowedDegrees",
    "maximumAllowedDegrees",
  ],
  "ticks-threshold": [
    "id",
    "kind",
    "isRequired",
    "evaluatorProfileRef",
    "minimumAllowedTicks",
    "maximumAllowedTicks",
  ],
  "cost-threshold": [
    "id",
    "kind",
    "isRequired",
    "evaluatorProfileRef",
    "minimumAllowedCost",
    "maximumAllowedCost",
  ],
};

const METRIC_RESULT_FIELDS_BY_KIND: Readonly<Record<string, readonly string[]>> = {
  "boolean-assertion": [
    "id",
    "kind",
    "status",
    "evaluatorProfileRef",
    "evidenceArtifactRefs",
    "diagnosticIds",
    "value",
    "expectedValue",
  ],
  "count-threshold": [
    "id",
    "kind",
    "status",
    "evaluatorProfileRef",
    "evidenceArtifactRefs",
    "diagnosticIds",
    "valueCount",
    "minimumAllowedCount",
    "maximumAllowedCount",
  ],
  "set-equality": [
    "id",
    "kind",
    "status",
    "evaluatorProfileRef",
    "evidenceArtifactRefs",
    "diagnosticIds",
    "actualValues",
    "expectedValues",
  ],
  "hash-equality": [
    "id",
    "kind",
    "status",
    "evaluatorProfileRef",
    "evidenceArtifactRefs",
    "diagnosticIds",
    "actualHash",
    "expectedHash",
  ],
  "meters-threshold": [
    "id",
    "kind",
    "status",
    "evaluatorProfileRef",
    "evidenceArtifactRefs",
    "diagnosticIds",
    "valueMeters",
    "minimumAllowedMeters",
    "maximumAllowedMeters",
  ],
  "degrees-threshold": [
    "id",
    "kind",
    "status",
    "evaluatorProfileRef",
    "evidenceArtifactRefs",
    "diagnosticIds",
    "valueDegrees",
    "minimumAllowedDegrees",
    "maximumAllowedDegrees",
  ],
  "ticks-threshold": [
    "id",
    "kind",
    "status",
    "evaluatorProfileRef",
    "evidenceArtifactRefs",
    "diagnosticIds",
    "valueTicks",
    "minimumAllowedTicks",
    "maximumAllowedTicks",
  ],
  "cost-threshold": [
    "id",
    "kind",
    "status",
    "evaluatorProfileRef",
    "evidenceArtifactRefs",
    "diagnosticIds",
    "valueCost",
    "minimumAllowedCost",
    "maximumAllowedCost",
  ],
};

const DETAILS_FIELDS_BY_KIND: Readonly<Record<string, readonly string[]>> = {
  "meters-threshold": ["kind", "expectedMeters", "actualMeters"],
  "degrees-threshold": ["kind", "expectedDegrees", "actualDegrees"],
  "ticks-threshold": ["kind", "expectedTicks", "actualTicks"],
  "count-threshold": ["kind", "maximumAllowedCount", "actualCount"],
  "capacity-exceeded": [
    "kind",
    "maximumAllowedCount",
    "minimumRequiredCount",
  ],
  "hash-mismatch": ["kind", "expectedHash", "actualHash"],
  "identity-mismatch": ["kind", "expectedId", "actualId"],
  "missing-reference": ["kind", "missingRef"],
  "state-mismatch": ["kind", "expectedState", "actualState"],
};

function addDiagnostic(
  diagnostics: ValidationContractDiagnosticV1[],
  code: ValidationContractDiagnosticCodeV1,
  path: string,
  message: string,
): void {
  diagnostics.push({ code, path, message });
}

function asRecord(
  value: unknown,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) {
    addDiagnostic(diagnostics, "VALIDATION_OBJECT_INVALID", path, "Expected an object.");
    return undefined;
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowedFields: readonly string[],
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_FIELD_UNKNOWN",
        `${path}/${field}`,
        `Unknown field '${field}'.`,
      );
    }
  }
}

function requireString(
  value: unknown,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): value is string {
  if (typeof value !== "string" || value.length === 0) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_STRING_INVALID",
      path,
      "Expected a non-empty string.",
    );
    return false;
  }
  return true;
}

function requireBoolean(
  value: unknown,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): value is boolean {
  if (typeof value !== "boolean") {
    addDiagnostic(
      diagnostics,
      "VALIDATION_BOOLEAN_INVALID",
      path,
      "Expected a boolean.",
    );
    return false;
  }
  return true;
}

function requireNonNegativeInteger(
  value: unknown,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_INTEGER_INVALID",
      path,
      "Expected a non-negative safe integer.",
    );
    return false;
  }
  return true;
}

function requireFiniteNumber(
  value: unknown,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_NUMBER_INVALID",
      path,
      "Expected a finite number.",
    );
    return false;
  }
  return true;
}

function requireHash(
  value: unknown,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): value is string {
  if (
    typeof value !== "string" ||
    !SHA256_PATTERN.test(value) ||
    value === ZERO_SHA256
  ) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_HASH_INVALID",
      path,
      "Expected a lowercase SHA-256 value with the 'sha256:' prefix.",
    );
    return false;
  }
  return true;
}

function requireEnum(
  value: unknown,
  allowedValues: readonly string[],
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): value is string {
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_ENUM_INVALID",
      path,
      `Expected one of: ${allowedValues.join(", ")}.`,
    );
    return false;
  }
  return true;
}

function requireStringArray(
  value: unknown,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): value is readonly string[] {
  if (!Array.isArray(value)) {
    addDiagnostic(diagnostics, "VALIDATION_ARRAY_INVALID", path, "Expected an array.");
    return false;
  }
  value.forEach((entry, index) => requireString(entry, `${path}/${index}`, diagnostics));
  return true;
}

function requireOptionalBound(
  record: Record<string, unknown>,
  field: string,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
  integer: boolean,
): void {
  if (isNil(record[field])) return;
  if (integer) {
    requireNonNegativeInteger(record[field], `${path}/${field}`, diagnostics);
    return;
  }
  requireFiniteNumber(record[field], `${path}/${field}`, diagnostics);
}

function requireThresholdPair(
  record: Record<string, unknown>,
  minimumField: string,
  maximumField: string,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
  integer: boolean,
): void {
  if (isNil(record[minimumField]) && isNil(record[maximumField])) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_NUMBER_INVALID",
      path,
      "Threshold requires a minimum or maximum.",
    );
  }
  requireOptionalBound(record, minimumField, path, diagnostics, integer);
  requireOptionalBound(record, maximumField, path, diagnostics, integer);
  if (
    typeof record[minimumField] === "number" &&
    typeof record[maximumField] === "number" &&
    record[minimumField] > record[maximumField]
  ) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_NUMBER_INVALID",
      path,
      "Threshold minimum must not exceed its maximum.",
    );
  }
}

function validateMetricDefinition(
  value: unknown,
  path: string,
  mapId: string,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const record = asRecord(value, path, diagnostics);
  if (record === undefined) return;
  const kind = record.kind;
  if (typeof kind !== "string" || METRIC_DEFINITION_FIELDS_BY_KIND[kind] === undefined) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_METRIC_KIND_INVALID",
      `${path}/kind`,
      "Metric kind is not supported by V2.",
    );
    return;
  }
  rejectUnknownFields(record, METRIC_DEFINITION_FIELDS_BY_KIND[kind]!, path, diagnostics);
  if (requireString(record.id, `${path}/id`, diagnostics) && record.id !== mapId) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_MAP_ID_MISMATCH",
      `${path}/id`,
      "Metric map key and inner id must match.",
    );
  }
  requireBoolean(record.isRequired, `${path}/isRequired`, diagnostics);
  requireString(record.evaluatorProfileRef, `${path}/evaluatorProfileRef`, diagnostics);
  if (kind === "boolean-assertion") {
    requireBoolean(record.expectedValue, `${path}/expectedValue`, diagnostics);
  } else if (kind === "count-threshold") {
    requireThresholdPair(
      record,
      "minimumAllowedCount",
      "maximumAllowedCount",
      path,
      diagnostics,
      true,
    );
  } else if (kind === "set-equality") {
    requireStringArray(record.expectedValues, `${path}/expectedValues`, diagnostics);
  } else if (kind === "hash-equality") {
    requireHash(record.expectedHash, `${path}/expectedHash`, diagnostics);
  } else if (kind === "meters-threshold") {
    if (
      !(
        LOCK_DERIVED_THRESHOLD_METRIC_IDS.has(mapId) &&
        isNil(record.minimumAllowedMeters) &&
        isNil(record.maximumAllowedMeters)
      )
    ) {
      requireThresholdPair(
        record,
        "minimumAllowedMeters",
        "maximumAllowedMeters",
        path,
        diagnostics,
        false,
      );
    }
  } else if (kind === "degrees-threshold") {
    if (
      !(
        LOCK_DERIVED_THRESHOLD_METRIC_IDS.has(mapId) &&
        isNil(record.minimumAllowedDegrees) &&
        isNil(record.maximumAllowedDegrees)
      )
    ) {
      requireThresholdPair(
        record,
        "minimumAllowedDegrees",
        "maximumAllowedDegrees",
        path,
        diagnostics,
        false,
      );
    }
  } else if (kind === "ticks-threshold") {
    requireThresholdPair(
      record,
      "minimumAllowedTicks",
      "maximumAllowedTicks",
      path,
      diagnostics,
      true,
    );
  } else {
    requireThresholdPair(
      record,
      "minimumAllowedCost",
      "maximumAllowedCost",
      path,
      diagnostics,
      false,
    );
  }
}

function validateGateDefinition(
  value: unknown,
  path: string,
  mapId: string,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const record = asRecord(value, path, diagnostics);
  if (record === undefined) return;
  rejectUnknownFields(
    record,
    ["id", "requirement", "metricDefinitionsById"],
    path,
    diagnostics,
  );
  if (requireString(record.id, `${path}/id`, diagnostics) && record.id !== mapId) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_MAP_ID_MISMATCH",
      `${path}/id`,
      "Gate map key and inner id must match.",
    );
  }
  requireEnum(record.requirement, ["blocking", "advisory"], `${path}/requirement`, diagnostics);
  const metricDefinitions = asRecord(
    record.metricDefinitionsById,
    `${path}/metricDefinitionsById`,
    diagnostics,
  );
  if (metricDefinitions === undefined) return;
  const metricDefinitionValues = Object.values(metricDefinitions);
  if (metricDefinitionValues.length === 0) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_REFERENCE_INVALID",
      `${path}/metricDefinitionsById`,
      "A Validation Gate must define at least one Metric.",
    );
  } else if (
    !metricDefinitionValues.some((metricDefinition) =>
      isPlainObject(metricDefinition) &&
      (metricDefinition as Record<string, unknown>).isRequired === true
    )
  ) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_REFERENCE_INVALID",
      `${path}/metricDefinitionsById`,
      "A Validation Gate must define at least one Required Metric.",
    );
  }
  for (const [metricId, metricDefinition] of Object.entries(metricDefinitions)) {
    validateMetricDefinition(
      metricDefinition,
      `${path}/metricDefinitionsById/${metricId}`,
      metricId,
      diagnostics,
    );
  }
}

function validateRouteRuntimeGateThresholds(
  value: unknown,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const record = asRecord(value, path, diagnostics);
  if (record === undefined) return;
  rejectUnknownFields(
    record,
    [
      "destinationToleranceMetersXZ",
      "maximumRouteDeviationMetersXZ",
      "minimumProgressMetersXZ",
      "stalledWindowTicks",
      "maximumConsecutiveUnsupportedTicks",
      "maximumProbeTicks",
    ],
    path,
    diagnostics,
  );
  for (const field of [
    "destinationToleranceMetersXZ",
    "maximumRouteDeviationMetersXZ",
    "minimumProgressMetersXZ",
  ]) {
    if (requireFiniteNumber(record[field], `${path}/${field}`, diagnostics)) {
      if ((record[field] as number) <= 0) {
        addDiagnostic(
          diagnostics,
          "VALIDATION_NUMBER_INVALID",
          `${path}/${field}`,
          "Expected a positive finite number.",
        );
      }
    }
  }
  if (
    requireNonNegativeInteger(record.stalledWindowTicks, `${path}/stalledWindowTicks`, diagnostics) &&
    record.stalledWindowTicks < 1
  ) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_INTEGER_INVALID",
      `${path}/stalledWindowTicks`,
      "Expected a positive tick count.",
    );
  }
  requireNonNegativeInteger(
    record.maximumConsecutiveUnsupportedTicks,
    `${path}/maximumConsecutiveUnsupportedTicks`,
    diagnostics,
  );
  if (
    requireNonNegativeInteger(
      record.maximumProbeTicks,
      `${path}/maximumProbeTicks`,
      diagnostics,
    ) &&
    record.maximumProbeTicks < 1
  ) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_INTEGER_INVALID",
      `${path}/maximumProbeTicks`,
      "Expected a positive tick count.",
    );
  }
}

export function validateValidationProfileV2(
  value: unknown,
): ValidationContractResultV1<ValidationProfileV2> {
  const diagnostics: ValidationContractDiagnosticV1[] = [];
  const record = asRecord(value, "", diagnostics);
  if (record !== undefined) {
    rejectUnknownFields(
      record,
      [
        "kind",
        "schemaVersion",
        "id",
        "resourceRef",
        "version",
        "subjectKind",
        "routeRuntimeGateThresholds",
        "gateDefinitionsById",
      ],
      "",
      diagnostics,
    );
    requireEnum(record.kind, ["worldkit-validation-profile"], "/kind", diagnostics);
    if (record.schemaVersion !== 2) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_ENUM_INVALID",
        "/schemaVersion",
        "Validation Profile schemaVersion must be 2.",
      );
    }
    requireString(record.id, "/id", diagnostics);
    requireString(record.resourceRef, "/resourceRef", diagnostics);
    requireString(record.version, "/version", diagnostics);
    requireEnum(record.subjectKind, ["world-package"], "/subjectKind", diagnostics);
    validateRouteRuntimeGateThresholds(
      record.routeRuntimeGateThresholds,
      "/routeRuntimeGateThresholds",
      diagnostics,
    );
    const gates = asRecord(record.gateDefinitionsById, "/gateDefinitionsById", diagnostics);
    if (gates !== undefined) {
      if (Object.keys(gates).length === 0) {
        addDiagnostic(
          diagnostics,
          "VALIDATION_REFERENCE_INVALID",
          "/gateDefinitionsById",
          "A Validation Profile must define at least one Gate.",
        );
      }
      for (const [gateId, gateDefinition] of Object.entries(gates)) {
        validateGateDefinition(
          gateDefinition,
          `/gateDefinitionsById/${gateId}`,
          gateId,
          diagnostics,
        );
      }
    }
  }
  return diagnostics.length === 0
    ? { ok: true, value: value as ValidationProfileV2, diagnostics: [] }
    : { ok: false, diagnostics };
}

function thresholdHolds(
  value: number,
  minimum: unknown,
  maximum: unknown,
): boolean {
  return (isNil(minimum) || value >= (minimum as number)) &&
    (isNil(maximum) || value <= (maximum as number));
}

function validateMetricResult(
  value: unknown,
  path: string,
  mapId: string,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const record = asRecord(value, path, diagnostics);
  if (record === undefined) return;
  const kind = record.kind;
  if (typeof kind !== "string" || METRIC_RESULT_FIELDS_BY_KIND[kind] === undefined) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_METRIC_KIND_INVALID",
      `${path}/kind`,
      "Metric result kind is not supported by V2.",
    );
    return;
  }
  rejectUnknownFields(record, METRIC_RESULT_FIELDS_BY_KIND[kind]!, path, diagnostics);
  if (requireString(record.id, `${path}/id`, diagnostics) && record.id !== mapId) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_MAP_ID_MISMATCH",
      `${path}/id`,
      "Metric result map key and inner id must match.",
    );
  }
  requireEnum(
    record.status,
    ["passed", "failed", "not-evaluated", "not-applicable"],
    `${path}/status`,
    diagnostics,
  );
  requireString(record.evaluatorProfileRef, `${path}/evaluatorProfileRef`, diagnostics);
  requireStringArray(record.evidenceArtifactRefs, `${path}/evidenceArtifactRefs`, diagnostics);
  requireStringArray(record.diagnosticIds, `${path}/diagnosticIds`, diagnostics);
  const isNotEvaluated = record.status === "not-evaluated";
  let assertionPassed = false;
  let canEvaluateAssertion = false;
  if (kind === "boolean-assertion") {
    if (!isNotEvaluated || !isNil(record.value)) {
      requireBoolean(record.value, `${path}/value`, diagnostics);
    }
    requireBoolean(record.expectedValue, `${path}/expectedValue`, diagnostics);
    canEvaluateAssertion =
      typeof record.value === "boolean" && typeof record.expectedValue === "boolean";
    assertionPassed = canEvaluateAssertion && record.value === record.expectedValue;
  } else if (kind === "count-threshold") {
    if (!isNotEvaluated || !isNil(record.valueCount)) {
      requireNonNegativeInteger(record.valueCount, `${path}/valueCount`, diagnostics);
    }
    requireOptionalBound(record, "minimumAllowedCount", path, diagnostics, true);
    requireOptionalBound(record, "maximumAllowedCount", path, diagnostics, true);
    canEvaluateAssertion = Number.isSafeInteger(record.valueCount);
    assertionPassed = canEvaluateAssertion &&
      thresholdHolds(
        record.valueCount as number,
        record.minimumAllowedCount,
        record.maximumAllowedCount,
      );
  } else if (kind === "set-equality") {
    if (!isNotEvaluated || !isNil(record.actualValues)) {
      requireStringArray(record.actualValues, `${path}/actualValues`, diagnostics);
    }
    requireStringArray(record.expectedValues, `${path}/expectedValues`, diagnostics);
    canEvaluateAssertion = Array.isArray(record.actualValues) && Array.isArray(record.expectedValues);
    assertionPassed = canEvaluateAssertion && isEqual(
      [...(record.actualValues as readonly string[])].sort(),
      [...(record.expectedValues as readonly string[])].sort(),
    );
  } else if (kind === "hash-equality") {
    if (!isNotEvaluated || !isNil(record.actualHash)) {
      requireHash(record.actualHash, `${path}/actualHash`, diagnostics);
    }
    requireHash(record.expectedHash, `${path}/expectedHash`, diagnostics);
    canEvaluateAssertion =
      typeof record.actualHash === "string" && typeof record.expectedHash === "string";
    assertionPassed = canEvaluateAssertion && record.actualHash === record.expectedHash;
  } else if (kind === "meters-threshold") {
    if (!isNotEvaluated || !isNil(record.valueMeters)) {
      requireFiniteNumber(record.valueMeters, `${path}/valueMeters`, diagnostics);
    }
    requireOptionalBound(record, "minimumAllowedMeters", path, diagnostics, false);
    requireOptionalBound(record, "maximumAllowedMeters", path, diagnostics, false);
    canEvaluateAssertion = typeof record.valueMeters === "number";
    assertionPassed = canEvaluateAssertion &&
      thresholdHolds(
        record.valueMeters as number,
        record.minimumAllowedMeters,
        record.maximumAllowedMeters,
      );
  } else if (kind === "degrees-threshold") {
    if (!isNotEvaluated || !isNil(record.valueDegrees)) {
      requireFiniteNumber(record.valueDegrees, `${path}/valueDegrees`, diagnostics);
    }
    requireOptionalBound(record, "minimumAllowedDegrees", path, diagnostics, false);
    requireOptionalBound(record, "maximumAllowedDegrees", path, diagnostics, false);
    canEvaluateAssertion = typeof record.valueDegrees === "number";
    assertionPassed = canEvaluateAssertion &&
      thresholdHolds(
        record.valueDegrees as number,
        record.minimumAllowedDegrees,
        record.maximumAllowedDegrees,
      );
  } else if (kind === "ticks-threshold") {
    if (!isNotEvaluated || !isNil(record.valueTicks)) {
      requireNonNegativeInteger(record.valueTicks, `${path}/valueTicks`, diagnostics);
    }
    requireOptionalBound(record, "minimumAllowedTicks", path, diagnostics, true);
    requireOptionalBound(record, "maximumAllowedTicks", path, diagnostics, true);
    canEvaluateAssertion = Number.isSafeInteger(record.valueTicks);
    assertionPassed = canEvaluateAssertion &&
      thresholdHolds(
        record.valueTicks as number,
        record.minimumAllowedTicks,
        record.maximumAllowedTicks,
      );
  } else {
    if (!isNotEvaluated || !isNil(record.valueCost)) {
      requireFiniteNumber(record.valueCost, `${path}/valueCost`, diagnostics);
    }
    requireOptionalBound(record, "minimumAllowedCost", path, diagnostics, false);
    requireOptionalBound(record, "maximumAllowedCost", path, diagnostics, false);
    canEvaluateAssertion = typeof record.valueCost === "number";
    assertionPassed = canEvaluateAssertion &&
      thresholdHolds(
        record.valueCost as number,
        record.minimumAllowedCost,
        record.maximumAllowedCost,
      );
  }
  if (
    (record.status === "passed" || record.status === "failed") &&
    canEvaluateAssertion &&
    !LOCK_DERIVED_THRESHOLD_METRIC_IDS.has(mapId) &&
    (record.status === "passed") !== assertionPassed
  ) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_STATUS_INCONSISTENT",
      `${path}/status`,
      "Metric status does not match its measured and expected values.",
    );
  }
}

function validateGateResult(
  value: unknown,
  path: string,
  mapId: string,
  diagnostics: ValidationContractDiagnosticV1[],
): GateResultV2 | undefined {
  const record = asRecord(value, path, diagnostics);
  if (record === undefined) return undefined;
  rejectUnknownFields(
    record,
    ["id", "requirement", "status", "metricResultsById", "diagnosticIds"],
    path,
    diagnostics,
  );
  if (requireString(record.id, `${path}/id`, diagnostics) && record.id !== mapId) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_MAP_ID_MISMATCH",
      `${path}/id`,
      "Gate result map key and inner id must match.",
    );
  }
  requireEnum(record.requirement, ["blocking", "advisory"], `${path}/requirement`, diagnostics);
  requireEnum(
    record.status,
    ["passed", "failed", "incomplete", "not-applicable"],
    `${path}/status`,
    diagnostics,
  );
  const metrics = asRecord(record.metricResultsById, `${path}/metricResultsById`, diagnostics);
  if (metrics !== undefined) {
    for (const [metricId, metricResult] of Object.entries(metrics)) {
      validateMetricResult(
        metricResult,
        `${path}/metricResultsById/${metricId}`,
        metricId,
        diagnostics,
      );
    }
  }
  requireStringArray(record.diagnosticIds, `${path}/diagnosticIds`, diagnostics);
  return record as unknown as GateResultV2;
}

function validateEvidenceArtifact(
  value: unknown,
  path: string,
  mapId: string,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const record = asRecord(value, path, diagnostics);
  if (record === undefined) return;
  if (typeof record.kind !== "string" || EVIDENCE_FIELDS_BY_KIND[record.kind] === undefined) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_ENUM_INVALID",
      `${path}/kind`,
      "Evidence kind is not supported by V2.",
    );
    return;
  }
  rejectUnknownFields(record, EVIDENCE_FIELDS_BY_KIND[record.kind]!, path, diagnostics);
  if (requireString(record.id, `${path}/id`, diagnostics) && record.id !== mapId) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_MAP_ID_MISMATCH",
      `${path}/id`,
      "Evidence map key and inner id must match.",
    );
  }
  requireEnum(record.kind, EVIDENCE_KINDS_V2, `${path}/kind`, diagnostics);
  requireString(record.artifactRef, `${path}/artifactRef`, diagnostics);
  requireString(record.mediaType, `${path}/mediaType`, diagnostics);
  requireNonNegativeInteger(record.sizeBytes, `${path}/sizeBytes`, diagnostics);
  requireHash(record.contentHash, `${path}/contentHash`, diagnostics);
  if (record.kind === "route-validation-set-receipt") {
    try {
      const receipt = canonicalRouteValidationSetReceiptV1(record.receipt);
      const bytes = canonicalJsonBytes(receipt);
      if (record.sizeBytes !== bytes.byteLength) {
        addReferenceInvalid(
          diagnostics,
          `${path}/sizeBytes`,
          "Route Validation Set receipt size must match its canonical bytes.",
        );
      }
      if (record.contentHash !== sha256Bytes(bytes)) {
        addReferenceInvalid(
          diagnostics,
          `${path}/contentHash`,
          "Route Validation Set receipt hash must match its canonical bytes.",
        );
      }
    } catch (error) {
      addReferenceInvalid(
        diagnostics,
        `${path}/receipt`,
        error instanceof Error ? error.message : String(error),
      );
    }
  } else {
    requireString(record.constraintId, `${path}/constraintId`, diagnostics);
    requireString(record.routeId, `${path}/routeId`, diagnostics);
  }
  if (
    record.kind === "traversal-graph" ||
    record.kind === "route-path-receipt" ||
    record.kind === "route-connectivity-failure"
  ) {
    if (record.kind === "route-connectivity-failure") {
      requireHash(
        record.routeBuildInputHash,
        `${path}/routeBuildInputHash`,
        diagnostics,
      );
    }
    requireHash(record.resolvedTraversalLockHash, `${path}/resolvedTraversalLockHash`, diagnostics);
    requireString(record.graphBuilderProfileRef, `${path}/graphBuilderProfileRef`, diagnostics);
    requireString(
      record.graphBuilderResolvedVersion,
      `${path}/graphBuilderResolvedVersion`,
      diagnostics,
    );
    requireHash(record.graphBuilderProfileHash, `${path}/graphBuilderProfileHash`, diagnostics);
  }
  if (record.kind === "route-runtime-probe-receipt") {
    requireHash(record.resolvedTraversalLockHash, `${path}/resolvedTraversalLockHash`, diagnostics);
    requireString(record.driverProfileRef, `${path}/driverProfileRef`, diagnostics);
    requireString(record.driverResolvedVersion, `${path}/driverResolvedVersion`, diagnostics);
    requireHash(record.driverProfileHash, `${path}/driverProfileHash`, diagnostics);
    requireString(record.runtimeBackendRef, `${path}/runtimeBackendRef`, diagnostics);
    requireString(
      record.runtimeBackendResolvedVersion,
      `${path}/runtimeBackendResolvedVersion`,
      diagnostics,
    );
    requireHash(record.runtimeBackendHash, `${path}/runtimeBackendHash`, diagnostics);
    requireString(record.runtimeAdapterRef, `${path}/runtimeAdapterRef`, diagnostics);
    requireString(
      record.runtimeAdapterResolvedVersion,
      `${path}/runtimeAdapterResolvedVersion`,
      diagnostics,
    );
    requireHash(record.runtimeAdapterHash, `${path}/runtimeAdapterHash`, diagnostics);
  }
  if (record.kind === "route-overlay") {
    requireHash(
      record.resolvedTraversalLockHash,
      `${path}/resolvedTraversalLockHash`,
      diagnostics,
    );
  }
}

function validateDiagnosticDetails(
  value: unknown,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const record = asRecord(value, path, diagnostics);
  if (record === undefined) return;
  const kind = record.kind;
  if (typeof kind !== "string" || DETAILS_FIELDS_BY_KIND[kind] === undefined) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_ENUM_INVALID",
      `${path}/kind`,
      "Diagnostic details kind is not supported by V2.",
    );
    return;
  }
  rejectUnknownFields(record, DETAILS_FIELDS_BY_KIND[kind]!, path, diagnostics);
  if (kind === "meters-threshold") {
    requireFiniteNumber(record.expectedMeters, `${path}/expectedMeters`, diagnostics);
    requireFiniteNumber(record.actualMeters, `${path}/actualMeters`, diagnostics);
  } else if (kind === "degrees-threshold") {
    requireFiniteNumber(record.expectedDegrees, `${path}/expectedDegrees`, diagnostics);
    requireFiniteNumber(record.actualDegrees, `${path}/actualDegrees`, diagnostics);
  } else if (kind === "ticks-threshold") {
    requireNonNegativeInteger(record.expectedTicks, `${path}/expectedTicks`, diagnostics);
    requireNonNegativeInteger(record.actualTicks, `${path}/actualTicks`, diagnostics);
  } else if (kind === "count-threshold") {
    requireNonNegativeInteger(
      record.maximumAllowedCount,
      `${path}/maximumAllowedCount`,
      diagnostics,
    );
    requireNonNegativeInteger(record.actualCount, `${path}/actualCount`, diagnostics);
  } else if (kind === "capacity-exceeded") {
    const maximumValid = requireNonNegativeInteger(
      record.maximumAllowedCount,
      `${path}/maximumAllowedCount`,
      diagnostics,
    );
    const minimumValid = requireNonNegativeInteger(
      record.minimumRequiredCount,
      `${path}/minimumRequiredCount`,
      diagnostics,
    );
    if (
      maximumValid &&
      minimumValid &&
      (record.minimumRequiredCount as number) <=
        (record.maximumAllowedCount as number)
    ) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_NUMBER_INVALID",
        `${path}/minimumRequiredCount`,
        "minimumRequiredCount must be greater than maximumAllowedCount.",
      );
    }
  } else if (kind === "hash-mismatch") {
    requireHash(record.expectedHash, `${path}/expectedHash`, diagnostics);
    requireHash(record.actualHash, `${path}/actualHash`, diagnostics);
  } else if (kind === "identity-mismatch") {
    requireString(record.expectedId, `${path}/expectedId`, diagnostics);
    requireString(record.actualId, `${path}/actualId`, diagnostics);
  } else if (kind === "missing-reference") {
    requireString(record.missingRef, `${path}/missingRef`, diagnostics);
  } else {
    requireString(record.expectedState, `${path}/expectedState`, diagnostics);
    requireString(record.actualState, `${path}/actualState`, diagnostics);
  }
}

function validateReportDiagnostic(
  value: unknown,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const record = asRecord(value, path, diagnostics);
  if (record === undefined) return;
  const scope = record.scope;
  if (scope !== "world" && scope !== "route-row") {
    addDiagnostic(
      diagnostics,
      "VALIDATION_ENUM_INVALID",
      `${path}/scope`,
      "Expected world or route-row.",
    );
    return;
  }
  rejectUnknownFields(
    record,
    [
      "id",
      "scope",
      "code",
      "severity",
      "gateId",
      "metricId",
      ...(scope === "route-row" ? ["constraintId"] : []),
      "routeId",
      "traversingEntityId",
      "startAnchorEntityId",
      "destinationAnchorEntityId",
      "traversalSurfaceId",
      "colliderSubshapeId",
      "relatedTraversalSurfaceIdentities",
      "positionMetersXYZ",
      "evidenceArtifactRefs",
      "details",
      "message",
      "suggestedFix",
    ].filter((field) =>
      scope === "route-row" ||
      ![
        "routeId",
        "traversingEntityId",
        "startAnchorEntityId",
        "destinationAnchorEntityId",
        "traversalSurfaceId",
        "colliderSubshapeId",
        "relatedTraversalSurfaceIdentities",
        "positionMetersXYZ",
      ].includes(field)
    ),
    path,
    diagnostics,
  );
  for (const field of [
    "id",
    "gateId",
    "metricId",
    "message",
    "suggestedFix",
  ]) {
    requireString(record[field], `${path}/${field}`, diagnostics);
  }
  if (scope === "route-row") {
    for (const field of [
      "constraintId",
      "routeId",
      "traversingEntityId",
      "startAnchorEntityId",
      "destinationAnchorEntityId",
    ]) {
      requireString(record[field], `${path}/${field}`, diagnostics);
    }
  }
  requireEnum(record.code, VALIDATION_DIAGNOSTIC_CODES_V2, `${path}/code`, diagnostics);
  requireEnum(record.severity, ["error", "warning"], `${path}/severity`, diagnostics);
  if (!isNil(record.traversalSurfaceId)) {
    requireString(record.traversalSurfaceId, `${path}/traversalSurfaceId`, diagnostics);
  }
  if (!isNil(record.colliderSubshapeId)) {
    requireString(record.colliderSubshapeId, `${path}/colliderSubshapeId`, diagnostics);
  }
  if (!isNil(record.relatedTraversalSurfaceIdentities)) {
    if (!Array.isArray(record.relatedTraversalSurfaceIdentities)) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_ARRAY_INVALID",
        `${path}/relatedTraversalSurfaceIdentities`,
        "Expected an array.",
      );
    } else {
      let previousTraversalSurfaceId: string | undefined;
      record.relatedTraversalSurfaceIdentities.forEach((value, index) => {
        const identityPath = `${path}/relatedTraversalSurfaceIdentities/${index}`;
        const identity = asRecord(value, identityPath, diagnostics);
        if (identity === undefined) return;
        rejectUnknownFields(
          identity,
          [
            "traversalSurfaceId",
            "surfaceEntityId",
            "colliderSubshapeId",
            "resourceRef",
            "resolvedVersion",
            "resourceHash",
          ],
          identityPath,
          diagnostics,
        );
        for (const field of [
          "traversalSurfaceId",
          "surfaceEntityId",
          "colliderSubshapeId",
          "resourceRef",
          "resolvedVersion",
        ]) {
          requireString(identity[field], `${identityPath}/${field}`, diagnostics);
        }
        requireHash(identity.resourceHash, `${identityPath}/resourceHash`, diagnostics);
        const traversalSurfaceId = identity.traversalSurfaceId;
        if (
          typeof traversalSurfaceId === "string" &&
          previousTraversalSurfaceId !== undefined &&
          previousTraversalSurfaceId >= traversalSurfaceId
        ) {
          addDiagnostic(
            diagnostics,
            "VALIDATION_ARRAY_INVALID",
            `${path}/relatedTraversalSurfaceIdentities`,
            "Expected unique identities sorted by traversalSurfaceId.",
          );
        }
        if (typeof traversalSurfaceId === "string") {
          previousTraversalSurfaceId = traversalSurfaceId;
        }
      });
    }
  }
  if (!isNil(record.positionMetersXYZ)) {
    if (!Array.isArray(record.positionMetersXYZ) || record.positionMetersXYZ.length !== 3) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_ARRAY_INVALID",
        `${path}/positionMetersXYZ`,
        "Expected a 3-tuple.",
      );
    } else {
      record.positionMetersXYZ.forEach((component, index) =>
        requireFiniteNumber(component, `${path}/positionMetersXYZ/${index}`, diagnostics)
      );
    }
  }
  requireStringArray(
    record.evidenceArtifactRefs,
    `${path}/evidenceArtifactRefs`,
    diagnostics,
  );
  validateDiagnosticDetails(record.details, `${path}/details`, diagnostics);
}

function metricResultMatchesDefinition(
  metricDefinition: MetricDefinitionV2,
  metricResult: MetricResultV2,
): boolean {
  if (
    metricResult.kind !== metricDefinition.kind ||
    metricResult.evaluatorProfileRef !== metricDefinition.evaluatorProfileRef
  ) {
    return false;
  }
  if (
    metricDefinition.kind === "boolean-assertion" &&
    metricResult.kind === "boolean-assertion"
  ) {
    return metricResult.expectedValue === metricDefinition.expectedValue;
  }
  if (
    metricDefinition.kind === "count-threshold" &&
    metricResult.kind === "count-threshold"
  ) {
    return metricResult.minimumAllowedCount === metricDefinition.minimumAllowedCount &&
      metricResult.maximumAllowedCount === metricDefinition.maximumAllowedCount;
  }
  if (
    metricDefinition.kind === "set-equality" &&
    metricResult.kind === "set-equality"
  ) {
    return isEqual(
      [...metricResult.expectedValues].sort(),
      [...metricDefinition.expectedValues].sort(),
    );
  }
  if (
    metricDefinition.kind === "hash-equality" &&
    metricResult.kind === "hash-equality"
  ) {
    return metricResult.expectedHash === metricDefinition.expectedHash;
  }
  if (
    metricDefinition.kind === "meters-threshold" &&
    metricResult.kind === "meters-threshold"
  ) {
    return metricResult.minimumAllowedMeters === metricDefinition.minimumAllowedMeters &&
      metricResult.maximumAllowedMeters === metricDefinition.maximumAllowedMeters;
  }
  if (
    metricDefinition.kind === "degrees-threshold" &&
    metricResult.kind === "degrees-threshold"
  ) {
    return metricResult.minimumAllowedDegrees === metricDefinition.minimumAllowedDegrees &&
      metricResult.maximumAllowedDegrees === metricDefinition.maximumAllowedDegrees;
  }
  if (
    metricDefinition.kind === "ticks-threshold" &&
    metricResult.kind === "ticks-threshold"
  ) {
    return metricResult.minimumAllowedTicks === metricDefinition.minimumAllowedTicks &&
      metricResult.maximumAllowedTicks === metricDefinition.maximumAllowedTicks;
  }
  if (
    metricDefinition.kind === "cost-threshold" &&
    metricResult.kind === "cost-threshold"
  ) {
    return metricResult.minimumAllowedCost === metricDefinition.minimumAllowedCost &&
      metricResult.maximumAllowedCost === metricDefinition.maximumAllowedCost;
  }
  return false;
}

function artifactsByRef(
  report: ValidationReportV2,
): ReadonlyMap<string, EvidenceArtifactV2> {
  return new Map(
    Object.values(report.evidenceArtifactsById).map((artifact) => [
      artifact.artifactRef,
      artifact,
    ]),
  );
}

function addReferenceInvalid(
  diagnostics: ValidationContractDiagnosticV1[],
  path: string,
  message: string,
): void {
  addDiagnostic(diagnostics, "VALIDATION_REFERENCE_INVALID", path, message);
}

function assertEvaluatedMetricEvidenceKinds(
  gateId: string,
  metricResult: MetricResultV2,
  artifacts: ReadonlyMap<string, EvidenceArtifactV2>,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const requiredKinds =
    gateId === "route-connectivity" && metricResult.status === "failed"
      ? new Set<EvidenceArtifactKindV2>([
          "traversal-graph",
          "route-path-receipt",
          "route-connectivity-failure",
        ])
      : REQUIRED_EVIDENCE_KINDS_BY_GATE[gateId];
  if (isNil(requiredKinds)) {
    return;
  }
  const referencedKinds = new Set<EvidenceArtifactKindV2>(
    metricResult.evidenceArtifactRefs.flatMap((artifactRef) => {
      const artifact = artifacts.get(artifactRef);
      return isNil(artifact) ? [] : [artifact.kind];
    }),
  );
  const hasRequiredKind = [...requiredKinds].some((kind) => referencedKinds.has(kind));
  if (
    metricResult.id === "required-route-count" &&
    referencedKinds.has("route-validation-set-receipt")
  ) {
    return;
  }
  const routeSetArtifact = [...artifacts.values()].find(
    ({ kind }) => kind === "route-validation-set-receipt",
  );
  if (
    routeSetArtifact?.kind === "route-validation-set-receipt" &&
    routeSetArtifact.receipt.rows.length === 0 &&
    referencedKinds.has("route-validation-set-receipt")
  ) {
    return;
  }
  if (!hasRequiredKind) {
    addReferenceInvalid(
      diagnostics,
      `/gateResultsById/${gateId}/metricResultsById/${metricResult.id}/evidenceArtifactRefs`,
      `Evaluated ${gateId} metrics must cite ${[...requiredKinds].join(" or ")} evidence.`,
    );
  }
}

function assertRegistryIdentity(
  path: string,
  resolve: () => { readonly resolvedVersion: string; readonly contentHash: string },
  resolvedVersion: string,
  contentHash: string,
  label: string,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  try {
    const resolved = resolve();
    if (
      resolved.resolvedVersion !== resolvedVersion ||
      resolved.contentHash !== contentHash
    ) {
      addReferenceInvalid(
        diagnostics,
        path,
        `${label} must match the Registry Profile.`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addReferenceInvalid(diagnostics, path, message);
  }
}

function assertEvidenceArtifactIdentities(
  report: ValidationReportV2,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const receipt = report.routeValidationSetReceipt;
  if (
    receipt.authoringSpecHash !== report.subject.authoringSpecHash ||
    receipt.normalizedWorldIrHash !== report.subject.normalizedWorldIrHash ||
    receipt.layoutSolveReportHash !== report.subject.layoutSolveReportHash
  ) {
    addReferenceInvalid(
      diagnostics,
      "/routeValidationSetReceipt",
      "Route Validation Set receipt must match the Report subject.",
    );
  }
  const rowsByKey = new Map(receipt.rows.map((row) => [
    `${row.constraintId}\u0000${row.routeId}`,
    row,
  ]));
  const artifactOwnersByRef = groupBy(
    receipt.rows.flatMap((row) => row.evidenceArtifactRefs.map((artifactRef) => ({
      artifactRef,
      row,
    }))),
    "artifactRef",
  );
  const artifacts = Object.values(report.evidenceArtifactsById);
  const artifactRefs = artifacts.map(({ artifactRef }) => artifactRef);
  if (new Set(artifactRefs).size !== artifactRefs.length) {
    addReferenceInvalid(
      diagnostics,
      "/evidenceArtifactsById",
      "Evidence Artifact refs must be unique.",
    );
  }
  const setArtifacts = artifacts.filter(
    ({ kind }) => kind === "route-validation-set-receipt",
  );
  const setArtifact = setArtifacts[0];
  if (
    setArtifacts.length !== 1 ||
    setArtifact?.kind !== "route-validation-set-receipt" ||
    !isEqual(setArtifact.receipt, receipt)
  ) {
    addReferenceInvalid(
      diagnostics,
      "/routeValidationSetReceipt",
      "Report must contain exactly one matching Route Validation Set Evidence Artifact.",
    );
  } else if (
    setArtifact.id !== "route-validation-set-receipt" ||
    setArtifact.artifactRef !==
      "artifact://world/route-validation-set-receipt.json"
  ) {
    addReferenceInvalid(
      diagnostics,
      "/routeValidationSetReceipt",
      "Route Validation Set Evidence Artifact ID and Ref must be canonical.",
    );
  }
  for (const [artifactId, artifact] of Object.entries(report.evidenceArtifactsById)) {
    const path = `/evidenceArtifactsById/${artifactId}`;
    if (artifact.kind === "route-validation-set-receipt") continue;
    const row = rowsByKey.get(`${artifact.constraintId}\u0000${artifact.routeId}`);
    if (isNil(row) || !row.evidenceArtifactRefs.includes(artifact.artifactRef)) {
      addReferenceInvalid(
        diagnostics,
        path,
        "Route Evidence Artifact must belong to exactly one indexed Route row.",
      );
    }
    const owners = artifactOwnersByRef[artifact.artifactRef] ?? [];
    if (owners.length !== 1) {
      addReferenceInvalid(
        diagnostics,
        path,
        "Route Evidence Artifact Ref must have exactly one Route row owner.",
      );
    }
    const filenameByKind: Readonly<Record<string, string>> = {
      "traversal-graph": "traversal-graph.json",
      "route-path-receipt": "route-path-receipt.json",
      "route-connectivity-failure": "route-connectivity-failure.json",
      "route-runtime-probe-receipt": "route-runtime-probe-receipt.json",
      "route-overlay": "route-overlay.bin",
    };
    const expectedId = `route:${artifact.constraintId}:${artifact.kind}`;
    const expectedRef =
      `artifact://route/${encodeURIComponent(artifact.routeId)}/constraint/` +
      `${encodeURIComponent(artifact.constraintId)}/${filenameByKind[artifact.kind]}`;
    if (artifact.id !== expectedId || artifact.artifactRef !== expectedRef) {
      addReferenceInvalid(
        diagnostics,
        path,
        "Route Evidence Artifact ID and Ref must be constraint-qualified canonical values.",
      );
    }
    if (
      artifact.kind === "traversal-graph" ||
      artifact.kind === "route-path-receipt" ||
      artifact.kind === "route-connectivity-failure"
    ) {
      if (!isNil(row) && artifact.resolvedTraversalLockHash !== row.resolvedTraversalLockHash) {
        addReferenceInvalid(
          diagnostics,
          `${path}/resolvedTraversalLockHash`,
          "Artifact lock must match its indexed Route row lock.",
        );
      }
      assertRegistryIdentity(
        path,
        () => resolveTraversalGraphBuilderProfile(artifact.graphBuilderProfileRef),
        artifact.graphBuilderResolvedVersion,
        artifact.graphBuilderProfileHash,
        "Graph Builder identity",
        diagnostics,
      );
    } else if (artifact.kind === "route-runtime-probe-receipt") {
      if (!isNil(row) && artifact.resolvedTraversalLockHash !== row.resolvedTraversalLockHash) {
        addReferenceInvalid(
          diagnostics,
          `${path}/resolvedTraversalLockHash`,
          "Artifact lock must match its indexed Route row lock.",
        );
      }
      assertRegistryIdentity(
        path,
        () => resolveTraversalDriverProfileV1(artifact.driverProfileRef),
        artifact.driverResolvedVersion,
        artifact.driverProfileHash,
        "Traversal Driver identity",
        diagnostics,
      );
    } else if (artifact.kind === "route-overlay") {
      if (!isNil(row) && artifact.resolvedTraversalLockHash !== row.resolvedTraversalLockHash) {
        addReferenceInvalid(
          diagnostics,
          `${path}/resolvedTraversalLockHash`,
          "Artifact lock must match its indexed Route row lock.",
        );
      }
    }
  }
  const artifactsByArtifactRef = new Set(artifactRefs);
  for (const [rowIndex, row] of receipt.rows.entries()) {
    const rowArtifacts = row.evidenceArtifactRefs.flatMap((artifactRef) => {
      const artifact = artifacts.find((candidate) => candidate.artifactRef === artifactRef);
      return isNil(artifact) ? [] : [artifact];
    });
    const rowKinds = new Set(rowArtifacts.map(({ kind }) => kind));
    const hasGraph = rowKinds.has("traversal-graph");
    const hasPath = rowKinds.has("route-path-receipt");
    const hasFailure = rowKinds.has("route-connectivity-failure");
    const hasProbe = rowKinds.has("route-runtime-probe-receipt");
    const connectivityEvidenceValid = row.connectivityStatus === "complete"
      ? hasGraph && hasPath && !hasFailure
      : hasFailure && !hasPath;
    const runtimeEvidenceValid = row.runtimeStatus === "not-run"
      ? !hasProbe
      : row.connectivityStatus === "complete" && hasProbe;
    if (!connectivityEvidenceValid || !runtimeEvidenceValid) {
      addReferenceInvalid(
        diagnostics,
        `/routeValidationSetReceipt/rows/${rowIndex}`,
        "Route row status must match its Graph, Path, Failure, and Probe evidence kinds.",
      );
    }
    for (const artifactRef of row.evidenceArtifactRefs) {
      if (artifactRef === "artifact://world/route-validation-set-receipt.json") {
        addReferenceInvalid(
          diagnostics,
          `/routeValidationSetReceipt/rows/${rowIndex}/evidenceArtifactRefs`,
          "A Route row cannot own the world-level Route Validation Set receipt.",
        );
      }
      if (!artifactsByArtifactRef.has(artifactRef)) {
        addReferenceInvalid(
          diagnostics,
          `/routeValidationSetReceipt/rows/${rowIndex}/evidenceArtifactRefs`,
          `Unknown Evidence Artifact Ref '${artifactRef}'.`,
        );
      }
    }
  }
  for (const [diagnosticIndex, diagnostic] of report.diagnostics.entries()) {
    if (diagnostic.scope !== "route-row") continue;
    const row = rowsByKey.get(
      `${diagnostic.constraintId}\u0000${diagnostic.routeId}`,
    );
    if (isNil(row)) {
      addReferenceInvalid(
        diagnostics,
        `/diagnostics/${diagnosticIndex}`,
        "Route-row Diagnostic must match one indexed Route row.",
      );
    } else if (
      !diagnostic.id.startsWith(`route:${diagnostic.constraintId}:`) ||
      diagnostic.traversingEntityId !== row.traversingEntityId ||
      diagnostic.startAnchorEntityId !== row.startAnchorEntityId ||
      diagnostic.destinationAnchorEntityId !== row.destinationAnchorEntityId ||
      diagnostic.evidenceArtifactRefs.some((artifactRef) =>
        artifactRef !== "artifact://world/route-validation-set-receipt.json" &&
        !row.evidenceArtifactRefs.includes(artifactRef)
      )
    ) {
      addReferenceInvalid(
        diagnostics,
        `/diagnostics/${diagnosticIndex}`,
        "Route-row Diagnostic ID and Evidence refs must stay constraint-qualified to its row.",
      );
    }
  }
}

function validateReportReferences(
  report: ValidationReportV2,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const evidenceByRef = artifactsByRef(report);
  const evidenceRefs = new Set(evidenceByRef.keys());
  const diagnosticIds = new Set(
    report.diagnostics.map((diagnostic: ValidationDiagnosticV2) => diagnostic.id),
  );
  const gateDiagnosticOwners: Array<{ diagnosticId: string; ownerId: string }> = [];
  const metricDiagnosticOwners: Array<{ diagnosticId: string; ownerId: string }> = [];
  if (diagnosticIds.size !== report.diagnostics.length) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_REFERENCE_INVALID",
      "/diagnostics",
      "Diagnostic IDs must be unique.",
    );
  }
  for (const [gateId, gateResult] of Object.entries(report.gateResultsById)) {
    for (const metricResult of Object.values(gateResult.metricResultsById)) {
      if (
        metricResult.status !== "not-evaluated" &&
        metricResult.status !== "not-applicable" &&
        metricResult.evidenceArtifactRefs.length === 0
      ) {
        addDiagnostic(
          diagnostics,
          "VALIDATION_REFERENCE_INVALID",
          `/gateResultsById/${gateId}/metricResultsById/${metricResult.id}/evidenceArtifactRefs`,
          "Every evaluated Metric must reference at least one Evidence Artifact.",
        );
      }
      if (
        (metricResult.status === "failed" || metricResult.status === "not-evaluated") &&
        metricResult.diagnosticIds.length === 0
      ) {
        addDiagnostic(
          diagnostics,
          "VALIDATION_REFERENCE_INVALID",
          `/gateResultsById/${gateId}/metricResultsById/${metricResult.id}/diagnosticIds`,
          "A failed or not-evaluated Metric must reference an actionable Diagnostic.",
        );
      }
      for (const artifactRef of metricResult.evidenceArtifactRefs) {
        if (!evidenceRefs.has(artifactRef)) {
          addReferenceInvalid(
            diagnostics,
            `/gateResultsById/${gateId}/metricResultsById/${metricResult.id}/evidenceArtifactRefs`,
            `Unknown Evidence Artifact Ref '${artifactRef}'.`,
          );
        }
      }
      if (
        metricResult.status === "passed" ||
        metricResult.status === "failed"
      ) {
        assertEvaluatedMetricEvidenceKinds(
          gateId,
          metricResult,
          evidenceByRef,
          diagnostics,
        );
      }
      for (const diagnosticId of metricResult.diagnosticIds) {
        metricDiagnosticOwners.push({
          diagnosticId,
          ownerId: `${gateId}/${metricResult.id}`,
        });
        if (!diagnosticIds.has(diagnosticId)) {
          addDiagnostic(
            diagnostics,
            "VALIDATION_REFERENCE_INVALID",
            `/gateResultsById/${gateId}/metricResultsById/${metricResult.id}/diagnosticIds`,
            `Unknown Diagnostic ID '${diagnosticId}'.`,
          );
        }
      }
    }
    for (const diagnosticId of gateResult.diagnosticIds) {
      gateDiagnosticOwners.push({ diagnosticId, ownerId: gateId });
      if (!diagnosticIds.has(diagnosticId)) {
        addDiagnostic(
          diagnostics,
          "VALIDATION_REFERENCE_INVALID",
          `/gateResultsById/${gateId}/diagnosticIds`,
          `Unknown Diagnostic ID '${diagnosticId}'.`,
        );
      }
    }
  }
  const gateOwnersByDiagnosticId = groupBy(gateDiagnosticOwners, "diagnosticId");
  const metricOwnersByDiagnosticId = groupBy(metricDiagnosticOwners, "diagnosticId");
  for (const [index, diagnostic] of report.diagnostics.entries()) {
    const gateResult = report.gateResultsById[diagnostic.gateId];
    const metricResult = gateResult?.metricResultsById[diagnostic.metricId];
    if (
      gateResult === undefined ||
      metricResult === undefined ||
      !gateResult.diagnosticIds.includes(diagnostic.id) ||
      !metricResult.diagnosticIds.includes(diagnostic.id)
    ) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_REFERENCE_INVALID",
        `/diagnostics/${index}`,
        "Diagnostic ownership must resolve to one Gate and Metric that both reference its ID.",
      );
    }
    const gateOwners = (gateOwnersByDiagnosticId[diagnostic.id] ?? [])
      .map(({ ownerId }) => ownerId)
      .sort();
    const metricOwners = (metricOwnersByDiagnosticId[diagnostic.id] ?? [])
      .map(({ ownerId }) => ownerId)
      .sort();
    if (
      !isEqual(gateOwners, [diagnostic.gateId]) ||
      !isEqual(metricOwners, [`${diagnostic.gateId}/${diagnostic.metricId}`])
    ) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_REFERENCE_INVALID",
        `/diagnostics/${index}`,
        "A Diagnostic must be referenced by exactly its one declared Gate and Metric owner.",
      );
    }
  }
  assertEvidenceArtifactIdentities(report, diagnostics);
}

export function validateValidationReportV2(
  value: unknown,
): ValidationContractResultV1<ValidationReportV2> {
  const diagnostics: ValidationContractDiagnosticV1[] = [];
  const record = asRecord(value, "", diagnostics);
  if (record !== undefined) {
    rejectUnknownFields(
      record,
      [
        "kind",
        "schemaVersion",
        "id",
        "subject",
        "dependencyReportRefs",
        "validationProfileRef",
        "resolvedVersion",
        "validationProfileHash",
        "routeValidationSetReceipt",
        "status",
        "gateResultsById",
        "evidenceArtifactsById",
        "diagnostics",
      ],
      "",
      diagnostics,
    );
    requireEnum(record.kind, ["worldkit-validation-report"], "/kind", diagnostics);
    if (record.schemaVersion !== 2) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_ENUM_INVALID",
        "/schemaVersion",
        "Validation Report schemaVersion must be 2.",
      );
    }
    requireString(record.id, "/id", diagnostics);
    const subject = asRecord(record.subject, "/subject", diagnostics);
    if (subject !== undefined) {
      rejectUnknownFields(
        subject,
        [
          "kind",
          "worldPackageRootHash",
          "authoringSpecHash",
          "normalizedWorldIrHash",
          "worldBuildIdentityHash",
          "resourceLockHash",
          "layoutSolveReportHash",
        ],
        "/subject",
        diagnostics,
      );
      requireEnum(subject.kind, ["world-package"], "/subject/kind", diagnostics);
      requireHash(subject.worldPackageRootHash, "/subject/worldPackageRootHash", diagnostics);
      requireHash(subject.authoringSpecHash, "/subject/authoringSpecHash", diagnostics);
      requireHash(subject.normalizedWorldIrHash, "/subject/normalizedWorldIrHash", diagnostics);
      requireHash(
        subject.worldBuildIdentityHash,
        "/subject/worldBuildIdentityHash",
        diagnostics,
      );
      requireHash(subject.resourceLockHash, "/subject/resourceLockHash", diagnostics);
      requireHash(subject.layoutSolveReportHash, "/subject/layoutSolveReportHash", diagnostics);
    }
    requireStringArray(record.dependencyReportRefs, "/dependencyReportRefs", diagnostics);
    requireString(record.validationProfileRef, "/validationProfileRef", diagnostics);
    requireString(record.resolvedVersion, "/resolvedVersion", diagnostics);
    requireHash(record.validationProfileHash, "/validationProfileHash", diagnostics);
    try {
      canonicalRouteValidationSetReceiptV1(record.routeValidationSetReceipt);
    } catch (error) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_REFERENCE_INVALID",
        "/routeValidationSetReceipt",
        error instanceof Error ? error.message : String(error),
      );
    }
    requireEnum(record.status, ["passed", "failed", "incomplete"], "/status", diagnostics);
    const gates = asRecord(record.gateResultsById, "/gateResultsById", diagnostics);
    if (gates !== undefined) {
      for (const [gateId, gateResult] of Object.entries(gates)) {
        validateGateResult(gateResult, `/gateResultsById/${gateId}`, gateId, diagnostics);
      }
    }
    const artifacts = asRecord(
      record.evidenceArtifactsById,
      "/evidenceArtifactsById",
      diagnostics,
    );
    if (artifacts !== undefined) {
      for (const [artifactId, artifact] of Object.entries(artifacts)) {
        validateEvidenceArtifact(
          artifact,
          `/evidenceArtifactsById/${artifactId}`,
          artifactId,
          diagnostics,
        );
      }
    }
    if (!Array.isArray(record.diagnostics)) {
      addDiagnostic(diagnostics, "VALIDATION_ARRAY_INVALID", "/diagnostics", "Expected an array.");
    } else {
      record.diagnostics.forEach((diagnostic, index) =>
        validateReportDiagnostic(diagnostic, `/diagnostics/${index}`, diagnostics)
      );
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const report = value as ValidationReportV2;
  if (
    report.validationProfileRef !==
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.resourceRef ||
    report.resolvedVersion !== OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.version ||
    report.validationProfileHash !== OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2
  ) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_REFERENCE_INVALID",
      "/validationProfileRef",
      "V2 reports must resolve the built-in outdoor-world-package-dev Profile exactly.",
    );
  }

  for (const [gateId, gateDefinition] of Object.entries(
    OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.gateDefinitionsById,
  )) {
    const gateResult = report.gateResultsById[gateId];
    if (isNil(gateResult)) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_REFERENCE_INVALID",
        `/gateResultsById/${gateId}`,
        "Report must materialize every Gate declared by the resolved Profile.",
      );
    } else {
      if (gateResult.requirement !== gateDefinition.requirement) {
        addDiagnostic(
          diagnostics,
          "VALIDATION_STATUS_INCONSISTENT",
          `/gateResultsById/${gateId}/requirement`,
          "Gate requirement differs from the resolved Profile.",
        );
      }
      if (gateResult.status === "not-applicable") {
        addDiagnostic(
          diagnostics,
          "VALIDATION_STATUS_INCONSISTENT",
          `/gateResultsById/${gateId}/status`,
          "The built-in V2 Profile does not define applicability conditions.",
        );
      }
      const expectedGateStatus = deriveValidationGateStatusV2(
        gateDefinition as GateDefinitionV2,
        gateResult,
      );
      if (gateResult.status !== expectedGateStatus) {
        addDiagnostic(
          diagnostics,
          "VALIDATION_STATUS_INCONSISTENT",
          `/gateResultsById/${gateId}/status`,
          `Gate status must be '${expectedGateStatus}'.`,
        );
      }
      for (const [metricId, metricDefinition] of Object.entries(
        gateDefinition.metricDefinitionsById,
      )) {
        const metricResult = gateResult.metricResultsById[metricId];
        if (isNil(metricResult) && metricDefinition.isRequired === true) {
          addDiagnostic(
            diagnostics,
            "VALIDATION_REFERENCE_INVALID",
            `/gateResultsById/${gateId}/metricResultsById/${metricId}`,
            "Report must materialize every Required Metric declared by the resolved Profile.",
          );
        } else if (
          !isNil(metricResult) &&
          !metricResultMatchesDefinition(metricDefinition, metricResult)
        ) {
          addDiagnostic(
            diagnostics,
            "VALIDATION_REFERENCE_INVALID",
            `/gateResultsById/${gateId}/metricResultsById/${metricId}`,
            "Metric result kind, evaluator, or expected value differs from the resolved Profile definition.",
          );
        }
        if (!isNil(metricResult) && metricResult.status === "not-applicable") {
          addDiagnostic(
            diagnostics,
            "VALIDATION_STATUS_INCONSISTENT",
            `/gateResultsById/${gateId}/metricResultsById/${metricId}/status`,
            "The built-in V2 Profile does not define applicability conditions.",
          );
        }
      }
      for (const metricId of Object.keys(gateResult.metricResultsById)) {
        if (
          (gateDefinition as GateDefinitionV2).metricDefinitionsById[metricId] === undefined
        ) {
          addDiagnostic(
            diagnostics,
            "VALIDATION_REFERENCE_INVALID",
            `/gateResultsById/${gateId}/metricResultsById/${metricId}`,
            "Metric is not declared by the resolved Profile Gate.",
          );
        }
      }
    }
  }
  for (const gateId of Object.keys(report.gateResultsById)) {
    if (
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.gateDefinitionsById[
        gateId as keyof typeof OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.gateDefinitionsById
      ] === undefined
    ) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_REFERENCE_INVALID",
        `/gateResultsById/${gateId}`,
        "Gate is not declared by the resolved Profile.",
      );
    }
  }
  const expectedStatus = deriveValidationReportStatusV2(
    OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
    report.gateResultsById,
  );
  if (report.status !== expectedStatus) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_STATUS_INCONSISTENT",
      "/status",
      `Report status must be '${expectedStatus}'.`,
    );
  }
  validateReportReferences(report, diagnostics);
  return diagnostics.length === 0
    ? { ok: true, value: report, diagnostics: [] }
    : { ok: false, diagnostics };
}
