import { groupBy, isEqual, isNil, isPlainObject } from "lodash-es";

import {
  OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_HASH_V1,
  OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
} from "./profile";
import {
  deriveValidationGateStatusV1,
  deriveValidationReportStatusV1,
} from "./policy";
import type {
  EvidenceArtifactV1,
  GateDefinitionV1,
  GateResultV1,
  MetricDefinitionV1,
  MetricResultV1,
  ValidationContractDiagnosticCodeV1,
  ValidationContractDiagnosticV1,
  ValidationContractResultV1,
  ValidationDiagnosticV1,
  ValidationProfileV1,
  ValidationReportV1,
} from "./types";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const VALIDATION_DIAGNOSTIC_CODES_V1 = [
  "CAPTURE_BUNDLE_JSON_INVALID",
  "CAPTURE_FILE_HASH_MISMATCH",
  "CAPTURE_FILE_MISSING",
  "CAPTURE_FILE_UNDECLARED",
  "CAPTURE_FRAME_INDEX_INVALID",
  "CAPTURE_FRAME_DIMENSIONS_INVALID",
  "CAPTURE_FRAME_HASH_MISMATCH",
  "CAPTURE_FRAME_TICK_INVALID",
  "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
  "CAPTURE_GAMEPLAY_TRACK_INVALID",
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
    addDiagnostic(
      diagnostics,
      "VALIDATION_OBJECT_INVALID",
      path,
      "Expected an object.",
    );
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

function requireHash(
  value: unknown,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
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
    addDiagnostic(
      diagnostics,
      "VALIDATION_ARRAY_INVALID",
      path,
      "Expected an array.",
    );
    return false;
  }
  value.forEach((entry, index) =>
    requireString(entry, `${path}/${index}`, diagnostics)
  );
  return true;
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
  const sharedFields = ["id", "kind", "isRequired", "evaluatorProfileRef"];
  const fieldsByKind: Readonly<Record<string, readonly string[]>> = {
    "boolean-assertion": [...sharedFields, "expectedValue"],
    "count-threshold": [
      ...sharedFields,
      "minimumAllowedCount",
      "maximumAllowedCount",
    ],
    "set-equality": [...sharedFields, "expectedValues"],
    "hash-equality": [...sharedFields, "expectedHash"],
  };
  if (typeof kind !== "string" || fieldsByKind[kind] === undefined) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_METRIC_KIND_INVALID",
      `${path}/kind`,
      "Metric kind is not supported by V1.",
    );
    return;
  }
  rejectUnknownFields(record, fieldsByKind[kind]!, path, diagnostics);
  if (requireString(record.id, `${path}/id`, diagnostics) && record.id !== mapId) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_MAP_ID_MISMATCH",
      `${path}/id`,
      "Metric map key and inner id must match.",
    );
  }
  requireBoolean(record.isRequired, `${path}/isRequired`, diagnostics);
  requireString(
    record.evaluatorProfileRef,
    `${path}/evaluatorProfileRef`,
    diagnostics,
  );
  if (kind === "boolean-assertion") {
    requireBoolean(record.expectedValue, `${path}/expectedValue`, diagnostics);
  } else if (kind === "count-threshold") {
    if (
      isNil(record.minimumAllowedCount) &&
      isNil(record.maximumAllowedCount)
    ) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_NUMBER_INVALID",
        path,
        "Count threshold requires a minimum or maximum.",
      );
    }
    if (!isNil(record.minimumAllowedCount)) {
      requireNonNegativeInteger(
        record.minimumAllowedCount,
        `${path}/minimumAllowedCount`,
        diagnostics,
      );
    }
    if (!isNil(record.maximumAllowedCount)) {
      requireNonNegativeInteger(
        record.maximumAllowedCount,
        `${path}/maximumAllowedCount`,
        diagnostics,
      );
    }
    if (
      typeof record.minimumAllowedCount === "number" &&
      typeof record.maximumAllowedCount === "number" &&
      record.minimumAllowedCount > record.maximumAllowedCount
    ) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_NUMBER_INVALID",
        path,
        "Count threshold minimum must not exceed its maximum.",
      );
    }
  } else if (kind === "set-equality") {
    requireStringArray(record.expectedValues, `${path}/expectedValues`, diagnostics);
  } else {
    requireHash(record.expectedHash, `${path}/expectedHash`, diagnostics);
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
  requireEnum(
    record.requirement,
    ["blocking", "advisory"],
    `${path}/requirement`,
    diagnostics,
  );
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
  } else if (!metricDefinitionValues.some((metricDefinition) =>
    isPlainObject(metricDefinition) &&
    (metricDefinition as Record<string, unknown>).isRequired === true
  )) {
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

export function validateValidationProfileV1(
  value: unknown,
): ValidationContractResultV1<ValidationProfileV1> {
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
        "gateDefinitionsById",
      ],
      "",
      diagnostics,
    );
    requireEnum(
      record.kind,
      ["worldkit-validation-profile"],
      "/kind",
      diagnostics,
    );
    if (record.schemaVersion !== 1) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_ENUM_INVALID",
        "/schemaVersion",
        "Validation Profile schemaVersion must be 1.",
      );
    }
    requireString(record.id, "/id", diagnostics);
    requireString(record.resourceRef, "/resourceRef", diagnostics);
    requireString(record.version, "/version", diagnostics);
    requireEnum(
      record.subjectKind,
      ["control-capture-bundle"],
      "/subjectKind",
      diagnostics,
    );
    const gates = asRecord(
      record.gateDefinitionsById,
      "/gateDefinitionsById",
      diagnostics,
    );
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
    ? { ok: true, value: value as ValidationProfileV1, diagnostics: [] }
    : { ok: false, diagnostics };
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
  const sharedFields = [
    "id",
    "kind",
    "status",
    "evaluatorProfileRef",
    "evidenceArtifactRefs",
    "diagnosticIds",
  ];
  const fieldsByKind: Readonly<Record<string, readonly string[]>> = {
    "boolean-assertion": [...sharedFields, "value", "expectedValue"],
    "count-threshold": [
      ...sharedFields,
      "valueCount",
      "minimumAllowedCount",
      "maximumAllowedCount",
    ],
    "set-equality": [...sharedFields, "actualValues", "expectedValues"],
    "hash-equality": [...sharedFields, "actualHash", "expectedHash"],
  };
  if (typeof kind !== "string" || fieldsByKind[kind] === undefined) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_METRIC_KIND_INVALID",
      `${path}/kind`,
      "Metric result kind is not supported by V1.",
    );
    return;
  }
  rejectUnknownFields(record, fieldsByKind[kind]!, path, diagnostics);
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
  requireString(
    record.evaluatorProfileRef,
    `${path}/evaluatorProfileRef`,
    diagnostics,
  );
  requireStringArray(
    record.evidenceArtifactRefs,
    `${path}/evidenceArtifactRefs`,
    diagnostics,
  );
  requireStringArray(record.diagnosticIds, `${path}/diagnosticIds`, diagnostics);
  const isNotEvaluated = record.status === "not-evaluated";
  if (kind === "boolean-assertion") {
    if (!isNotEvaluated || !isNil(record.value)) {
      requireBoolean(record.value, `${path}/value`, diagnostics);
    }
    requireBoolean(record.expectedValue, `${path}/expectedValue`, diagnostics);
  } else if (kind === "count-threshold") {
    if (!isNotEvaluated || !isNil(record.valueCount)) {
      requireNonNegativeInteger(record.valueCount, `${path}/valueCount`, diagnostics);
    }
    if (!isNil(record.minimumAllowedCount)) {
      requireNonNegativeInteger(
        record.minimumAllowedCount,
        `${path}/minimumAllowedCount`,
        diagnostics,
      );
    }
    if (!isNil(record.maximumAllowedCount)) {
      requireNonNegativeInteger(
        record.maximumAllowedCount,
        `${path}/maximumAllowedCount`,
        diagnostics,
      );
    }
  } else if (kind === "set-equality") {
    if (!isNotEvaluated || !isNil(record.actualValues)) {
      requireStringArray(record.actualValues, `${path}/actualValues`, diagnostics);
    }
    requireStringArray(record.expectedValues, `${path}/expectedValues`, diagnostics);
  } else {
    if (!isNotEvaluated || !isNil(record.actualHash)) {
      requireHash(record.actualHash, `${path}/actualHash`, diagnostics);
    }
    requireHash(record.expectedHash, `${path}/expectedHash`, diagnostics);
  }
  if (record.status === "passed" || record.status === "failed") {
    let assertionPassed = false;
    let canEvaluateAssertion = false;
    if (kind === "boolean-assertion") {
      canEvaluateAssertion =
        typeof record.value === "boolean" &&
        typeof record.expectedValue === "boolean";
      assertionPassed = canEvaluateAssertion && record.value === record.expectedValue;
    } else if (kind === "count-threshold") {
      const valueCount = record.valueCount as number;
      canEvaluateAssertion = Number.isSafeInteger(valueCount);
      assertionPassed = canEvaluateAssertion &&
        (isNil(record.minimumAllowedCount) ||
          valueCount >= (record.minimumAllowedCount as number)) &&
        (isNil(record.maximumAllowedCount) ||
          valueCount <= (record.maximumAllowedCount as number));
    } else if (kind === "set-equality") {
      canEvaluateAssertion =
        Array.isArray(record.actualValues) &&
        Array.isArray(record.expectedValues);
      assertionPassed = canEvaluateAssertion && isEqual(
        [...(record.actualValues as readonly string[])].sort(),
        [...(record.expectedValues as readonly string[])].sort(),
      );
    } else {
      canEvaluateAssertion =
        typeof record.actualHash === "string" &&
        typeof record.expectedHash === "string";
      assertionPassed = canEvaluateAssertion && record.actualHash === record.expectedHash;
    }
    if (
      canEvaluateAssertion &&
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
}

function validateGateResult(
  value: unknown,
  path: string,
  mapId: string,
  diagnostics: ValidationContractDiagnosticV1[],
): GateResultV1 | undefined {
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
  requireEnum(
    record.requirement,
    ["blocking", "advisory"],
    `${path}/requirement`,
    diagnostics,
  );
  requireEnum(
    record.status,
    ["passed", "failed", "incomplete", "not-applicable"],
    `${path}/status`,
    diagnostics,
  );
  const metrics = asRecord(
    record.metricResultsById,
    `${path}/metricResultsById`,
    diagnostics,
  );
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
  return record as unknown as GateResultV1;
}

function validateEvidenceArtifact(
  value: unknown,
  path: string,
  mapId: string,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const record = asRecord(value, path, diagnostics);
  if (record === undefined) return;
  rejectUnknownFields(
    record,
    ["id", "kind", "artifactRef", "mediaType", "sizeBytes", "contentHash"],
    path,
    diagnostics,
  );
  if (requireString(record.id, `${path}/id`, diagnostics) && record.id !== mapId) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_MAP_ID_MISMATCH",
      `${path}/id`,
      "Evidence map key and inner id must match.",
    );
  }
  requireEnum(
    record.kind,
    ["control-capture-bundle"],
    `${path}/kind`,
    diagnostics,
  );
  requireString(record.artifactRef, `${path}/artifactRef`, diagnostics);
  requireString(record.mediaType, `${path}/mediaType`, diagnostics);
  requireNonNegativeInteger(record.sizeBytes, `${path}/sizeBytes`, diagnostics);
  requireHash(record.contentHash, `${path}/contentHash`, diagnostics);
}

function validateReportDiagnostic(
  value: unknown,
  path: string,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const record = asRecord(value, path, diagnostics);
  if (record === undefined) return;
  rejectUnknownFields(
    record,
    [
      "id",
      "code",
      "severity",
      "gateId",
      "metricId",
      "artifactPath",
      "expectedValue",
      "actualValue",
      "message",
      "suggestedFix",
    ],
    path,
    diagnostics,
  );
  for (const field of [
    "id",
    "gateId",
    "metricId",
    "artifactPath",
    "expectedValue",
    "actualValue",
    "message",
    "suggestedFix",
  ]) {
    requireString(record[field], `${path}/${field}`, diagnostics);
  }
  requireEnum(
    record.code,
    VALIDATION_DIAGNOSTIC_CODES_V1,
    `${path}/code`,
    diagnostics,
  );
  requireEnum(
    record.severity,
    ["error", "warning"],
    `${path}/severity`,
    diagnostics,
  );
}

function validateReportReferences(
  report: ValidationReportV1,
  diagnostics: ValidationContractDiagnosticV1[],
): void {
  const evidenceRefs = new Set(
    Object.values(report.evidenceArtifactsById).map(
      (artifact: EvidenceArtifactV1) => artifact.artifactRef,
    ),
  );
  const diagnosticIds = new Set(
    report.diagnostics.map((diagnostic: ValidationDiagnosticV1) => diagnostic.id),
  );
  const gateDiagnosticOwners: Array<{
    readonly diagnosticId: string;
    readonly ownerId: string;
  }> = [];
  const metricDiagnosticOwners: Array<{
    readonly diagnosticId: string;
    readonly ownerId: string;
  }> = [];
  if (diagnosticIds.size !== report.diagnostics.length) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_REFERENCE_INVALID",
      "/diagnostics",
      "Diagnostic IDs must be unique.",
    );
  }
  const captureBundleArtifact = report.evidenceArtifactsById["capture-bundle"];
  if (
    captureBundleArtifact === undefined ||
    captureBundleArtifact.contentHash !== report.subject.bundleRootHash
  ) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_REFERENCE_INVALID",
      "/evidenceArtifactsById/capture-bundle/contentHash",
      "Capture Bundle Evidence contentHash must match the Subject bundleRootHash.",
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
        (
          metricResult.status === "failed" ||
          metricResult.status === "not-evaluated"
        ) &&
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
          addDiagnostic(
            diagnostics,
            "VALIDATION_REFERENCE_INVALID",
            `/gateResultsById/${gateId}/metricResultsById/${metricResult.id}/evidenceArtifactRefs`,
            `Unknown Evidence Artifact Ref '${artifactRef}'.`,
          );
        }
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
  const gateOwnersByDiagnosticId = groupBy(
    gateDiagnosticOwners,
    "diagnosticId",
  );
  const metricOwnersByDiagnosticId = groupBy(
    metricDiagnosticOwners,
    "diagnosticId",
  );
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
      !isEqual(metricOwners, [
        `${diagnostic.gateId}/${diagnostic.metricId}`,
      ])
    ) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_REFERENCE_INVALID",
        `/diagnostics/${index}`,
        "A Diagnostic must be referenced by exactly its one declared Gate and Metric owner.",
      );
    }
  }
}

function metricResultMatchesDefinition(
  metricDefinition: MetricDefinitionV1,
  metricResult: MetricResultV1,
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
    return metricResult.minimumAllowedCount ===
        metricDefinition.minimumAllowedCount &&
      metricResult.maximumAllowedCount ===
        metricDefinition.maximumAllowedCount;
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
  return false;
}

export function validateValidationReportV1(
  value: unknown,
): ValidationContractResultV1<ValidationReportV1> {
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
        "validationProfileRef",
        "resolvedVersion",
        "validationProfileHash",
        "status",
        "gateResultsById",
        "evidenceArtifactsById",
        "diagnostics",
      ],
      "",
      diagnostics,
    );
    requireEnum(
      record.kind,
      ["worldkit-validation-report"],
      "/kind",
      diagnostics,
    );
    if (record.schemaVersion !== 1) {
      addDiagnostic(
        diagnostics,
        "VALIDATION_ENUM_INVALID",
        "/schemaVersion",
        "Validation Report schemaVersion must be 1.",
      );
    }
    requireString(record.id, "/id", diagnostics);
    const subject = asRecord(record.subject, "/subject", diagnostics);
    if (subject !== undefined) {
      rejectUnknownFields(
        subject,
        ["kind", "worldPackageRootHash", "takeHash", "bundleRootHash"],
        "/subject",
        diagnostics,
      );
      requireEnum(
        subject.kind,
        ["control-capture-bundle"],
        "/subject/kind",
        diagnostics,
      );
      requireHash(
        subject.worldPackageRootHash,
        "/subject/worldPackageRootHash",
        diagnostics,
      );
      requireHash(subject.takeHash, "/subject/takeHash", diagnostics);
      requireHash(subject.bundleRootHash, "/subject/bundleRootHash", diagnostics);
    }
    requireString(record.validationProfileRef, "/validationProfileRef", diagnostics);
    requireString(record.resolvedVersion, "/resolvedVersion", diagnostics);
    requireHash(
      record.validationProfileHash,
      "/validationProfileHash",
      diagnostics,
    );
    requireEnum(
      record.status,
      ["passed", "failed", "incomplete"],
      "/status",
      diagnostics,
    );
    const gates = asRecord(
      record.gateResultsById,
      "/gateResultsById",
      diagnostics,
    );
    if (gates !== undefined) {
      for (const [gateId, gateResult] of Object.entries(gates)) {
        validateGateResult(
          gateResult,
          `/gateResultsById/${gateId}`,
          gateId,
          diagnostics,
        );
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
      addDiagnostic(
        diagnostics,
        "VALIDATION_ARRAY_INVALID",
        "/diagnostics",
        "Expected an array.",
      );
    } else {
      record.diagnostics.forEach((diagnostic, index) =>
        validateReportDiagnostic(
          diagnostic,
          `/diagnostics/${index}`,
          diagnostics,
        )
      );
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const report = value as ValidationReportV1;
  if (
    report.validationProfileRef !==
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.resourceRef ||
    report.resolvedVersion !==
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.version ||
    report.validationProfileHash !==
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_HASH_V1
  ) {
    addDiagnostic(
      diagnostics,
      "VALIDATION_REFERENCE_INVALID",
      "/validationProfileRef",
      "V1 reports must resolve the built-in outdoor-control-video-dev Profile exactly.",
    );
  }

  for (const [gateId, gateDefinition] of Object.entries(
    OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.gateDefinitionsById,
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
          "The built-in V1 Profile does not define applicability conditions.",
        );
      }
      const expectedGateStatus = deriveValidationGateStatusV1(
        gateDefinition as GateDefinitionV1,
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
            "The built-in V1 Profile does not define applicability conditions.",
          );
        }
      }
      for (const metricId of Object.keys(gateResult.metricResultsById)) {
        if (
          (gateDefinition as GateDefinitionV1).metricDefinitionsById[
            metricId
          ] === undefined
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
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.gateDefinitionsById[
        gateId as keyof typeof OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.gateDefinitionsById
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
  const expectedStatus = deriveValidationReportStatusV1(
    OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
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
