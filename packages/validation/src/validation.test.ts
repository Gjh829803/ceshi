import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  resolveTraversalDriverProfileV1,
  resolveTraversalGraphBuilderProfileV1,
  resolveTraversalGraphBuilderProfile,
} from "@whitebox-world/traversal";

import {
  OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_HASH_V1,
  OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  deriveValidationReportStatusV1,
  deriveValidationReportStatusV2,
  hashValidationProfileV1,
  hashValidationProfileV2,
  hashValidationReportV1,
  hashValidationReportV2,
  validateValidationProfileV1,
  validateValidationProfileV2,
  validateValidationReportV1,
  validateValidationReportV2,
  type EvidenceArtifactV2,
  type GateResultV1,
  type GateResultV2,
  type MetricDefinitionV2,
  type MetricResultV2,
  type ValidationProfileV1,
  type ValidationReportV1,
  type ValidationReportV2,
} from "./index";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;

function passedGateResults(): Record<string, GateResultV1> {
  return Object.fromEntries(
    Object.values(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.gateDefinitionsById,
    ).map((gateDefinition) => [
      gateDefinition.id,
      {
        id: gateDefinition.id,
        requirement: gateDefinition.requirement,
        status: "passed" as const,
        metricResultsById: Object.fromEntries(
          Object.values(gateDefinition.metricDefinitionsById).map(
            (metricDefinition) => [
              metricDefinition.id,
              {
                id: metricDefinition.id,
                kind: "boolean-assertion" as const,
                status: "passed" as const,
                value: true,
                expectedValue: true,
                evaluatorProfileRef: metricDefinition.evaluatorProfileRef,
                evidenceArtifactRefs: ["artifact://capture-bundle"],
                diagnosticIds: [],
              },
            ],
          ),
        ),
        diagnosticIds: [],
      },
    ]),
  );
}

function validReport(): ValidationReportV1 {
  const gateResultsById = passedGateResults();
  return {
    kind: "worldkit-validation-report",
    schemaVersion: 1,
    id: "capture-bundle-validation",
    subject: {
      kind: "control-capture-bundle",
      worldPackageRootHash: HASH_A,
      takeHash: HASH_B,
      bundleRootHash: HASH_C,
    },
    validationProfileRef:
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.resourceRef,
    resolvedVersion:
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.version,
    validationProfileHash:
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_HASH_V1,
    status: deriveValidationReportStatusV1(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
      gateResultsById,
    ),
    gateResultsById,
    evidenceArtifactsById: {
      "capture-bundle": {
        id: "capture-bundle",
        kind: "control-capture-bundle",
        artifactRef: "artifact://capture-bundle",
        mediaType:
          "application/vnd.worldkit.control-capture-bundle.v1+directory",
        sizeBytes: 100,
        contentHash: HASH_C,
      },
    },
    diagnostics: [],
  };
}

function withAdvisoryGate(
  profile: ValidationProfileV1,
): ValidationProfileV1 {
  return {
    ...profile,
    gateDefinitionsById: {
      ...profile.gateDefinitionsById,
      "capture-preview-readability": {
        id: "capture-preview-readability",
        requirement: "advisory",
        metricDefinitionsById: {
          "preview-readable": {
            id: "preview-readable",
            kind: "boolean-assertion",
            isRequired: true,
            expectedValue: true,
            evaluatorProfileRef:
              "worldkit://validation-evaluator/preview-readability@1",
          },
        },
      },
    },
  };
}

describe("Validation Profile/Report V1", () => {
  it("freezes one deterministic built-in Capture/Integrity Profile", () => {
    expect(validateValidationProfileV1(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
    )).toMatchObject({ ok: true });
    expect(OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_HASH_V1).toBe(
      hashValidationProfileV1(
        OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
      ),
    );
    expect(Object.keys(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.gateDefinitionsById,
    )).toEqual([
      "capture-bundle-integrity",
      "capture-completeness",
      "capture-ownership",
    ]);
  });

  it("rejects unknown fields, unknown metric kinds, and map key/id drift", () => {
    const unknownProfile = {
      ...OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
      scoreThreshold: 0.8,
    };
    expect(validateValidationProfileV1(unknownProfile)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_FIELD_UNKNOWN" }),
      ]),
    });

    const unknownMetricKind = structuredClone(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
    ) as unknown as Record<string, unknown>;
    const gates = unknownMetricKind.gateDefinitionsById as Record<
      string,
      Record<string, unknown>
    >;
    const metrics = gates["capture-completeness"]!
      .metricDefinitionsById as Record<string, Record<string, unknown>>;
    metrics["capture-linear-depth-valid"]!.kind = "average-score";
    expect(validateValidationProfileV1(unknownMetricKind)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_METRIC_KIND_INVALID" }),
      ]),
    });

    const driftedReport = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    const reportGates = driftedReport.gateResultsById as Record<
      string,
      Record<string, unknown>
    >;
    reportGates["capture-bundle-integrity"]!.id = "other-gate";
    expect(validateValidationReportV1(driftedReport)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_MAP_ID_MISMATCH" }),
      ]),
    });
  });

  it("rejects Profiles with empty Gates or no Required Metric", () => {
    const emptyGateProfile = structuredClone(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
    ) as unknown as Record<string, unknown>;
    const emptyGateDefinitions = emptyGateProfile.gateDefinitionsById as Record<
      string,
      Record<string, unknown>
    >;
    emptyGateDefinitions["capture-completeness"]!.metricDefinitionsById = {};
    expect(validateValidationProfileV1(emptyGateProfile)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_REFERENCE_INVALID" }),
      ]),
    });

    const optionalOnlyProfile = structuredClone(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
    ) as unknown as Record<string, unknown>;
    const optionalOnlyGates = optionalOnlyProfile.gateDefinitionsById as Record<
      string,
      Record<string, unknown>
    >;
    const optionalOnlyMetrics = optionalOnlyGates["capture-completeness"]!
      .metricDefinitionsById as Record<string, Record<string, unknown>>;
    for (const metric of Object.values(optionalOnlyMetrics)) {
      metric.isRequired = false;
    }
    expect(validateValidationProfileV1(optionalOnlyProfile)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_REFERENCE_INVALID" }),
      ]),
    });
  });

  it("rejects an inverted Count Threshold", () => {
    const profile = structuredClone(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
    ) as unknown as Record<string, unknown>;
    const gates = profile.gateDefinitionsById as Record<
      string,
      Record<string, unknown>
    >;
    const metrics = gates["capture-completeness"]!
      .metricDefinitionsById as Record<string, Record<string, unknown>>;
    metrics["capture-linear-depth-valid"] = {
      id: "capture-linear-depth-valid",
      kind: "count-threshold",
      isRequired: true,
      evaluatorProfileRef:
        "worldkit://validation-evaluator/capture-linear-depth@1",
      minimumAllowedCount: 2,
      maximumAllowedCount: 1,
    };
    expect(validateValidationProfileV1(profile)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_NUMBER_INVALID" }),
      ]),
    });
  });

  it("rejects malformed hashes and an inconsistent derived status", () => {
    const malformedHash = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    (malformedHash.subject as Record<string, unknown>).bundleRootHash =
      "sha256:not-a-hash";
    expect(validateValidationReportV1(malformedHash)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_HASH_INVALID" }),
      ]),
    });

    const inconsistent = { ...validReport(), status: "failed" };
    expect(validateValidationReportV1(inconsistent)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_STATUS_INCONSISTENT" }),
      ]),
    });
  });

  it("rejects undeclared Metrics and contradictory Metric status", () => {
    const undeclaredMetric = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    const undeclaredGates = undeclaredMetric.gateResultsById as Record<
      string,
      Record<string, unknown>
    >;
    const undeclaredMetrics = undeclaredGates["capture-completeness"]!
      .metricResultsById as Record<string, unknown>;
    undeclaredMetrics["average-quality-score"] = {
      id: "average-quality-score",
      kind: "boolean-assertion",
      status: "passed",
      value: true,
      expectedValue: true,
      evaluatorProfileRef: "worldkit://validation-evaluator/average-score@1",
      evidenceArtifactRefs: ["artifact://capture-bundle"],
      diagnosticIds: [],
    };
    expect(validateValidationReportV1(undeclaredMetric)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_REFERENCE_INVALID" }),
      ]),
    });

    const contradictory = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    const contradictoryGates = contradictory.gateResultsById as Record<
      string,
      Record<string, unknown>
    >;
    const contradictoryMetrics = contradictoryGates["capture-completeness"]!
      .metricResultsById as Record<string, Record<string, unknown>>;
    contradictoryMetrics["capture-linear-depth-valid"]!.value = false;
    expect(validateValidationReportV1(contradictory)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_STATUS_INCONSISTENT" }),
      ]),
    });
  });

  it("rejects Metric expectations that drift from the resolved Profile", () => {
    const driftedExpectation = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    const gates = driftedExpectation.gateResultsById as Record<
      string,
      Record<string, unknown>
    >;
    const metrics = gates["capture-bundle-integrity"]!
      .metricResultsById as Record<string, Record<string, unknown>>;
    const metric = metrics["capture-bundle-integrity-valid"]!;
    metric.value = false;
    metric.expectedValue = false;

    expect(validateValidationReportV1(driftedExpectation)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_REFERENCE_INVALID" }),
      ]),
    });
  });

  it("rejects Reports that omit a Profile-required Gate or Metric", () => {
    const missingGate = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    const missingGateResults = missingGate.gateResultsById as Record<
      string,
      unknown
    >;
    delete missingGateResults["capture-ownership"];
    missingGate.status = "incomplete";
    expect(validateValidationReportV1(missingGate)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_REFERENCE_INVALID" }),
      ]),
    });

    const missingMetric = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    const missingMetricGates = missingMetric.gateResultsById as Record<
      string,
      Record<string, unknown>
    >;
    const completenessGate = missingMetricGates["capture-completeness"]!;
    const completenessMetrics = completenessGate.metricResultsById as Record<
      string,
      unknown
    >;
    delete completenessMetrics["capture-linear-depth-valid"];
    completenessGate.status = "incomplete";
    missingMetric.status = "incomplete";
    expect(validateValidationReportV1(missingMetric)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_REFERENCE_INVALID" }),
      ]),
    });
  });

  it("rejects Evidence or Diagnostic ownership that drifts from the Report", () => {
    const evidenceDrift = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    const evidenceById = evidenceDrift.evidenceArtifactsById as Record<
      string,
      Record<string, unknown>
    >;
    evidenceById["capture-bundle"]!.contentHash = HASH_A;
    expect(validateValidationReportV1(evidenceDrift)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_REFERENCE_INVALID" }),
      ]),
    });

    const diagnosticDrift = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    diagnosticDrift.diagnostics = [
      {
        id: "foreign-diagnostic",
        code: "CAPTURE_FILE_HASH_MISMATCH",
        severity: "error",
        gateId: "not-a-profile-gate",
        metricId: "not-a-profile-metric",
        artifactPath: "bundle.json",
        expectedValue: "valid",
        actualValue: "invalid",
        message: "Foreign ownership.",
        suggestedFix: "Regenerate.",
      },
    ];
    expect(validateValidationReportV1(diagnosticDrift)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_REFERENCE_INVALID" }),
      ]),
    });
  });

  it("rejects evaluated Metrics without Evidence and failures without Diagnostics", () => {
    const evidenceFree = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    const evidenceFreeGates = evidenceFree.gateResultsById as Record<
      string,
      Record<string, unknown>
    >;
    const evidenceFreeMetrics = evidenceFreeGates[
      "capture-bundle-integrity"
    ]!.metricResultsById as Record<string, Record<string, unknown>>;
    evidenceFreeMetrics["capture-bundle-integrity-valid"]!
      .evidenceArtifactRefs = [];
    expect(validateValidationReportV1(evidenceFree)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_REFERENCE_INVALID" }),
      ]),
    });

    const diagnosticFreeFailure = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    const failureGates = diagnosticFreeFailure.gateResultsById as Record<
      string,
      Record<string, unknown>
    >;
    const integrityGate = failureGates["capture-bundle-integrity"]!;
    const integrityMetrics = integrityGate.metricResultsById as Record<
      string,
      Record<string, unknown>
    >;
    integrityMetrics["capture-bundle-integrity-valid"]!.value = false;
    integrityMetrics["capture-bundle-integrity-valid"]!.status = "failed";
    integrityGate.status = "failed";
    diagnosticFreeFailure.status = "failed";
    expect(validateValidationReportV1(diagnosticFreeFailure)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_REFERENCE_INVALID" }),
      ]),
    });
  });

  it("rejects a Diagnostic referenced by any owner besides its declared owner", () => {
    const report = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    const gates = report.gateResultsById as Record<
      string,
      Record<string, unknown>
    >;
    const integrityGate = gates["capture-bundle-integrity"]!;
    const integrityMetrics = integrityGate.metricResultsById as Record<
      string,
      Record<string, unknown>
    >;
    const integrityMetric = integrityMetrics["capture-bundle-integrity-valid"]!;
    integrityMetric.value = false;
    integrityMetric.status = "failed";
    integrityMetric.diagnosticIds = ["integrity-failure"];
    integrityGate.status = "failed";
    integrityGate.diagnosticIds = ["integrity-failure"];
    report.status = "failed";
    report.diagnostics = [{
      id: "integrity-failure",
      code: "CAPTURE_FILE_HASH_MISMATCH",
      severity: "error",
      gateId: "capture-bundle-integrity",
      metricId: "capture-bundle-integrity-valid",
      artifactPath: "bundle.json",
      expectedValue: "valid",
      actualValue: "invalid",
      message: "Integrity failed.",
      suggestedFix: "Regenerate the Bundle.",
    }];
    const completenessGate = gates["capture-completeness"]!;
    const completenessMetrics = completenessGate.metricResultsById as Record<
      string,
      Record<string, unknown>
    >;
    completenessGate.diagnosticIds = ["integrity-failure"];
    completenessMetrics["capture-linear-depth-valid"]!.diagnosticIds = [
      "integrity-failure",
    ];

    expect(validateValidationReportV1(report)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_REFERENCE_INVALID" }),
      ]),
    });
  });

  it("gives explicit Blocking Failure priority over incomplete evidence", () => {
    const gateResultsById = passedGateResults();
    const integrityMetric = gateResultsById["capture-bundle-integrity"]!
      .metricResultsById["capture-bundle-integrity-valid"]!;
    if (integrityMetric.kind !== "boolean-assertion") {
      throw new Error("Expected the built-in integrity Metric to be boolean.");
    }
    gateResultsById["capture-bundle-integrity"] = {
      ...gateResultsById["capture-bundle-integrity"]!,
      status: "failed",
      metricResultsById: {
        ...gateResultsById["capture-bundle-integrity"]!.metricResultsById,
        "capture-bundle-integrity-valid": {
          ...integrityMetric,
          status: "failed",
          value: false,
        },
      },
    };
    const {
      "capture-linear-depth-valid": _missingDepth,
      ...incompleteMetrics
    } = gateResultsById["capture-completeness"]!.metricResultsById;
    gateResultsById["capture-completeness"] = {
      ...gateResultsById["capture-completeness"]!,
      status: "incomplete",
      metricResultsById: incompleteMetrics,
    };

    expect(deriveValidationReportStatusV1(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
      gateResultsById,
    )).toBe("failed");
  });

  it("marks missing or not-evaluated Required Metrics incomplete", () => {
    const missing = passedGateResults();
    const {
      "capture-linear-depth-valid": _missingDepth,
      ...remainingMetrics
    } = missing["capture-completeness"]!.metricResultsById;
    missing["capture-completeness"] = {
      ...missing["capture-completeness"]!,
      status: "incomplete",
      metricResultsById: remainingMetrics,
    };
    expect(deriveValidationReportStatusV1(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
      missing,
    )).toBe("incomplete");

    const notEvaluated = passedGateResults();
    const depthMetric = notEvaluated["capture-completeness"]!
      .metricResultsById["capture-linear-depth-valid"]!;
    notEvaluated["capture-completeness"] = {
      ...notEvaluated["capture-completeness"]!,
      status: "incomplete",
      metricResultsById: {
        ...notEvaluated["capture-completeness"]!.metricResultsById,
        "capture-linear-depth-valid": {
          ...depthMetric,
          status: "not-evaluated",
        },
      },
    };
    expect(deriveValidationReportStatusV1(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
      notEvaluated,
    )).toBe("incomplete");
  });

  it("never lets full or partial not-applicable Blocking evidence pass", () => {
    const fullyNotApplicable = passedGateResults();
    const integrityGate = fullyNotApplicable["capture-bundle-integrity"]!;
    const integrityMetric = integrityGate.metricResultsById[
      "capture-bundle-integrity-valid"
    ]!;
    fullyNotApplicable["capture-bundle-integrity"] = {
      ...integrityGate,
      status: "not-applicable",
      metricResultsById: {
        "capture-bundle-integrity-valid": {
          ...integrityMetric,
          status: "not-applicable",
        },
      },
    };
    expect(deriveValidationReportStatusV1(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
      fullyNotApplicable,
    )).toBe("incomplete");

    const fullReport = validReport();
    expect(validateValidationReportV1({
      ...fullReport,
      status: "incomplete",
      gateResultsById: {
        ...fullReport.gateResultsById,
        "capture-bundle-integrity":
          fullyNotApplicable["capture-bundle-integrity"]!,
      },
    })).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_STATUS_INCONSISTENT" }),
      ]),
    });

    const partiallyNotApplicable = passedGateResults();
    const completenessGate = partiallyNotApplicable["capture-completeness"]!;
    const depthMetric = completenessGate.metricResultsById[
      "capture-linear-depth-valid"
    ]!;
    partiallyNotApplicable["capture-completeness"] = {
      ...completenessGate,
      status: "incomplete",
      metricResultsById: {
        ...completenessGate.metricResultsById,
        "capture-linear-depth-valid": {
          ...depthMetric,
          status: "not-applicable",
        },
      },
    };
    expect(deriveValidationReportStatusV1(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
      partiallyNotApplicable,
    )).toBe("incomplete");
  });

  it("preserves Advisory Failure without failing complete Blocking Gates", () => {
    const profile = withAdvisoryGate(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
    );
    const gateResultsById = passedGateResults();
    gateResultsById["capture-preview-readability"] = {
      id: "capture-preview-readability",
      requirement: "advisory",
      status: "failed",
      metricResultsById: {
        "preview-readable": {
          id: "preview-readable",
          kind: "boolean-assertion",
          status: "failed",
          value: false,
          expectedValue: true,
          evaluatorProfileRef:
            "worldkit://validation-evaluator/preview-readability@1",
          evidenceArtifactRefs: ["artifact://capture-bundle"],
          diagnosticIds: ["preview-not-readable"],
        },
      },
      diagnosticIds: ["preview-not-readable"],
    };

    expect(deriveValidationReportStatusV1(profile, gateResultsById)).toBe(
      "passed",
    );
  });

  it("hashes canonical content rather than object insertion order", () => {
    const report = validReport();
    const reordered = {
      diagnostics: report.diagnostics,
      evidenceArtifactsById: report.evidenceArtifactsById,
      gateResultsById: report.gateResultsById,
      status: report.status,
      validationProfileHash: report.validationProfileHash,
      resolvedVersion: report.resolvedVersion,
      validationProfileRef: report.validationProfileRef,
      subject: report.subject,
      id: report.id,
      schemaVersion: report.schemaVersion,
      kind: report.kind,
    } as ValidationReportV1;
    expect(hashValidationReportV1(reordered)).toBe(
      hashValidationReportV1(report),
    );
    expect(hashValidationReportV1({ ...report, id: "another-report" })).not.toBe(
      hashValidationReportV1(report),
    );
  });
});

function passedWorldPackageGateResults(): Record<string, GateResultV2> {
  return Object.fromEntries(
    Object.values(
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.gateDefinitionsById,
    ).map((gateDefinition) => [
      gateDefinition.id,
      {
        id: gateDefinition.id,
        requirement: gateDefinition.requirement,
        status: "passed" as const,
        metricResultsById: Object.fromEntries(
          Object.values(gateDefinition.metricDefinitionsById).map(
            (metricDefinition) => [
              metricDefinition.id,
              passedWorldPackageMetricResult(metricDefinition, gateDefinition.id),
            ],
          ),
        ),
        diagnosticIds: [],
      },
    ]),
  );
}

function includeBound<K extends string>(
  field: K,
  value: number | undefined,
): {} | Record<K, number> {
  return isNil(value) ? {} : { [field]: value } as Record<K, number>;
}

function evidenceArtifactRefForGate(gateId: string): string {
  return gateId === "route-runtime-conformance"
    ? "artifact://route-runtime-probe-receipt"
    : "artifact://traversal-graph";
}

function passedWorldPackageMetricResult(
  metricDefinition: MetricDefinitionV2,
  gateId: string,
): MetricResultV2 {
  const shared = {
    id: metricDefinition.id,
    status: "passed" as const,
    evaluatorProfileRef: metricDefinition.evaluatorProfileRef,
    evidenceArtifactRefs: [evidenceArtifactRefForGate(gateId)],
    diagnosticIds: [],
  };
  if (metricDefinition.kind === "boolean-assertion") {
    return {
      ...shared,
      kind: "boolean-assertion",
      value: metricDefinition.expectedValue,
      expectedValue: metricDefinition.expectedValue,
    };
  }
  if (metricDefinition.kind === "count-threshold") {
    return {
      ...shared,
      kind: "count-threshold",
      valueCount: metricDefinition.minimumAllowedCount ?? 0,
      ...includeBound("minimumAllowedCount", metricDefinition.minimumAllowedCount),
      ...includeBound("maximumAllowedCount", metricDefinition.maximumAllowedCount),
    };
  }
  if (metricDefinition.kind === "meters-threshold") {
    const lockDerivedBounds =
      metricDefinition.id === "maximum-observed-step-height-meters"
        ? { maximumAllowedMeters: 0.3 }
        : metricDefinition.id === "maximum-observed-surface-gap-meters"
          ? { maximumAllowedMeters: 0 }
          : metricDefinition.id === "minimum-observed-clearance-width-meters"
            ? { minimumAllowedMeters: 0.7 }
            : metricDefinition.id === "minimum-observed-clearance-height-meters"
              ? { minimumAllowedMeters: 1.8 }
              : {};
    return {
      ...shared,
      kind: "meters-threshold",
      valueMeters: ("minimumAllowedMeters" in lockDerivedBounds
        ? lockDerivedBounds.minimumAllowedMeters
        : undefined) ?? metricDefinition.minimumAllowedMeters ??
        metricDefinition.maximumAllowedMeters ??
        0,
      ...includeBound("minimumAllowedMeters", metricDefinition.minimumAllowedMeters),
      ...includeBound("maximumAllowedMeters", metricDefinition.maximumAllowedMeters),
      ...lockDerivedBounds,
    };
  }
  if (metricDefinition.kind === "degrees-threshold") {
    const lockDerivedBounds =
      metricDefinition.id === "maximum-observed-slope-degrees"
        ? { maximumAllowedDegrees: 42 }
        : {};
    return {
      ...shared,
      kind: "degrees-threshold",
      valueDegrees: metricDefinition.maximumAllowedDegrees ?? 0,
      ...includeBound("minimumAllowedDegrees", metricDefinition.minimumAllowedDegrees),
      ...includeBound("maximumAllowedDegrees", metricDefinition.maximumAllowedDegrees),
      ...lockDerivedBounds,
    };
  }
  if (metricDefinition.kind === "ticks-threshold") {
    return {
      ...shared,
      kind: "ticks-threshold",
      valueTicks: metricDefinition.minimumAllowedTicks ?? 0,
      ...includeBound("minimumAllowedTicks", metricDefinition.minimumAllowedTicks),
      ...includeBound("maximumAllowedTicks", metricDefinition.maximumAllowedTicks),
    };
  }
  if (metricDefinition.kind === "cost-threshold") {
    return {
      ...shared,
      kind: "cost-threshold",
      valueCost: metricDefinition.minimumAllowedCost ?? 0,
      ...includeBound("minimumAllowedCost", metricDefinition.minimumAllowedCost),
      ...includeBound("maximumAllowedCost", metricDefinition.maximumAllowedCost),
    };
  }
  throw new Error(`Unsupported metric kind '${metricDefinition.kind}'.`);
}

function typedWorldPackageEvidenceArtifacts(): Record<string, EvidenceArtifactV2> {
  const graphBuilder = resolveTraversalGraphBuilderProfile(
    BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  );
  const driver = resolveTraversalDriverProfileV1(
    BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  );
  return {
    "traversal-graph": {
      id: "traversal-graph",
      kind: "traversal-graph",
      artifactRef: "artifact://traversal-graph",
      mediaType: "application/vnd.worldkit.traversal-graph.v1+json",
      sizeBytes: 128,
      contentHash: HASH_A,
      resolvedTraversalLockHash: HASH_A,
      graphBuilderProfileRef: graphBuilder.resourceRef,
      graphBuilderResolvedVersion: graphBuilder.resolvedVersion,
      graphBuilderProfileHash: graphBuilder.contentHash,
    },
    "route-runtime-probe-receipt": {
      id: "route-runtime-probe-receipt",
      kind: "route-runtime-probe-receipt",
      artifactRef: "artifact://route-runtime-probe-receipt",
      mediaType: "application/vnd.worldkit.route-runtime-probe-receipt.v1+json",
      sizeBytes: 256,
      contentHash: HASH_B,
      resolvedTraversalLockHash: HASH_A,
      driverProfileRef: driver.resourceRef,
      driverResolvedVersion: driver.resolvedVersion,
      driverProfileHash: driver.contentHash,
      runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
      runtimeBackendResolvedVersion: "1",
      runtimeBackendHash: HASH_C,
      runtimeAdapterRef: "worldkit://runtime-adapter/character-controller@1",
      runtimeAdapterResolvedVersion: "1",
      runtimeAdapterHash: HASH_C,
    },
  };
}

function routeConnectivityFailureEvidence(): EvidenceArtifactV2 {
  const graphBuilder = resolveTraversalGraphBuilderProfile(
    BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  );
  return {
    id: "route-connectivity-failure",
    kind: "route-connectivity-failure",
    artifactRef: "artifact://route-connectivity-failure",
    mediaType: "application/vnd.worldkit.route-connectivity-failure.v1+json",
    sizeBytes: 256,
    contentHash: HASH_C,
    routeBuildInputHash: HASH_B,
    resolvedTraversalLockHash: HASH_A,
    graphBuilderProfileRef: graphBuilder.resourceRef,
    graphBuilderResolvedVersion: graphBuilder.resolvedVersion,
    graphBuilderProfileHash: graphBuilder.contentHash,
  };
}

function withUniformEvidence(
  report: ValidationReportV2,
  artifactRef: string,
  evidenceArtifactsById: Record<string, EvidenceArtifactV2>,
): ValidationReportV2 {
  return {
    ...report,
    evidenceArtifactsById,
    gateResultsById: Object.fromEntries(
      Object.entries(report.gateResultsById).map(([gateId, gateResult]) => [
        gateId,
        {
          ...gateResult,
          metricResultsById: Object.fromEntries(
            Object.entries(gateResult.metricResultsById).map(([metricId, metricResult]) => [
              metricId,
              {
                ...metricResult,
                evidenceArtifactRefs: [artifactRef],
              },
            ]),
          ),
        },
      ]),
    ),
  };
}

function validWorldPackageReport(): ValidationReportV2 {
  const gateResultsById = passedWorldPackageGateResults();
  return {
    kind: "worldkit-validation-report",
    schemaVersion: 2,
    id: "world-package-route-validation",
    subject: {
      kind: "world-package",
      worldPackageRootHash: HASH_A,
      authoringSpecHash: HASH_B,
      normalizedWorldIrHash: HASH_C,
      executionPlanHash: HASH_A,
      resourceLockHash: HASH_B,
      layoutSolveReportHash: HASH_C,
    },
    dependencyReportRefs: [],
    validationProfileRef:
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.resourceRef,
    resolvedVersion: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.version,
    validationProfileHash: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2,
    status: deriveValidationReportStatusV2(
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
      gateResultsById,
    ),
    gateResultsById,
    evidenceArtifactsById: typedWorldPackageEvidenceArtifacts(),
    diagnostics: [],
  };
}

function graphOnlyPassedWorldPackageReport(): ValidationReportV2 {
  const report = validWorldPackageReport();
  return withUniformEvidence(
    report,
    "artifact://traversal-graph",
    {
      "traversal-graph": report.evidenceArtifactsById["traversal-graph"]!,
    },
  );
}

function probeOnlyPassedWorldPackageReport(): ValidationReportV2 {
  const report = validWorldPackageReport();
  return withUniformEvidence(
    report,
    "artifact://route-runtime-probe-receipt",
    {
      "route-runtime-probe-receipt":
        report.evidenceArtifactsById["route-runtime-probe-receipt"]!,
    },
  );
}

describe("Validation Profile/Report V2", () => {
  it("freezes the world-package Profile without changing Capture V1", () => {
    expect(validateValidationProfileV2(
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
    )).toMatchObject({ ok: true });
    expect(OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2).toBe(
      hashValidationProfileV2(OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2),
    );
    expect(OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_HASH_V1).toBe(
      hashValidationProfileV1(OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1),
    );
    expect(OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.schemaVersion).toBe(1);
    expect(
      Object.keys(
        OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.gateDefinitionsById,
      ),
    ).toEqual(["route-connectivity", "route-runtime-conformance"]);
  });

  it("accepts a world-package Report and rejects Capture subjects", () => {
    expect(validateValidationReportV2(validWorldPackageReport())).toMatchObject({
      ok: true,
    });

    const captureSubject = {
      ...validWorldPackageReport(),
      subject: {
        kind: "control-capture-bundle",
        worldPackageRootHash: HASH_A,
        takeHash: HASH_B,
        bundleRootHash: HASH_C,
      },
    };
    expect(validateValidationReportV2(captureSubject)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_ENUM_INVALID" }),
      ]),
    });
  });

  it("rejects a passed runtime gate backed only by traversal-graph evidence", () => {
    expect(validateValidationReportV2(graphOnlyPassedWorldPackageReport())).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "VALIDATION_REFERENCE_INVALID",
          path: expect.stringMatching(/route-runtime-conformance/),
        }),
      ]),
    });
  });

  it("rejects a passed connectivity gate backed only by probe evidence", () => {
    expect(validateValidationReportV2(probeOnlyPassedWorldPackageReport())).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "VALIDATION_REFERENCE_INVALID",
          path: expect.stringMatching(/route-connectivity/),
        }),
      ]),
    });
  });

  it("accepts exact V2 Graph Builder and canonical failure evidence for a failed connectivity Metric", () => {
    const report = validWorldPackageReport();
    const gate = report.gateResultsById["route-connectivity"]!;
    const metric = gate.metricResultsById["unreachable-required-route-count"]!;
    const diagnosticId = "route-unreachable";
    const failedMetric = {
      ...metric,
      status: "failed" as const,
      valueCount: 1,
      evidenceArtifactRefs: ["artifact://route-connectivity-failure"],
      diagnosticIds: [diagnosticId],
    };
    const failedGate = {
      ...gate,
      status: "failed" as const,
      metricResultsById: {
        ...gate.metricResultsById,
        "unreachable-required-route-count": failedMetric,
      },
      diagnosticIds: [diagnosticId],
    };
    const failedReport: ValidationReportV2 = {
      ...report,
      status: "failed",
      gateResultsById: {
        ...report.gateResultsById,
        "route-connectivity": failedGate,
      },
      evidenceArtifactsById: {
        ...report.evidenceArtifactsById,
        "route-connectivity-failure": routeConnectivityFailureEvidence(),
      },
      diagnostics: [{
        id: diagnosticId,
        code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
        severity: "error",
        gateId: "route-connectivity",
        metricId: "unreachable-required-route-count",
        routeId: "main-route",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn",
        destinationAnchorEntityId: "goal",
        traversalSurfaceId: "surface-main",
        colliderSubshapeId: "terrain-heightfield",
        positionMetersXYZ: [0, 0, 0],
        evidenceArtifactRefs: ["artifact://route-connectivity-failure"],
        details: {
          kind: "state-mismatch",
          expectedState: "reachable",
          actualState: "unreachable",
        },
        message: "The required route is unreachable.",
        suggestedFix: "Repair the route geometry and rebuild traversal evidence.",
      }],
    };

    expect(validateValidationReportV2(failedReport)).toMatchObject({ ok: true });
  });

  it("rejects a passed connectivity Metric backed only by failure evidence", () => {
    const report = validWorldPackageReport();
    const failure = routeConnectivityFailureEvidence();
    const rewritten = withUniformEvidence(
      report,
      failure.artifactRef,
      { [failure.id]: failure },
    );

    expect(validateValidationReportV2(rewritten)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "VALIDATION_REFERENCE_INVALID",
          path: expect.stringMatching(/route-connectivity/),
        }),
      ]),
    });
  });

  it("rejects evidence artifacts that do not share one resolvedTraversalLockHash", () => {
    const report = validWorldPackageReport();
    const probe = report.evidenceArtifactsById["route-runtime-probe-receipt"];
    if (isNil(probe) || probe.kind !== "route-runtime-probe-receipt") {
      throw new Error("Expected a typed runtime probe receipt in the fixture.");
    }
    expect(validateValidationReportV2({
      ...report,
      evidenceArtifactsById: {
        ...report.evidenceArtifactsById,
        "route-runtime-probe-receipt": {
          ...probe,
          resolvedTraversalLockHash: HASH_B,
        },
      },
    })).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "VALIDATION_REFERENCE_INVALID",
          path: "/evidenceArtifactsById",
        }),
      ]),
    });
  });

  it("rejects graph builder and driver identities that do not match the Registry", () => {
    const report = validWorldPackageReport();
    const graph = report.evidenceArtifactsById["traversal-graph"];
    const probe = report.evidenceArtifactsById["route-runtime-probe-receipt"];
    if (isNil(graph) || graph.kind !== "traversal-graph") {
      throw new Error("Expected a typed traversal-graph artifact in the fixture.");
    }
    if (isNil(probe) || probe.kind !== "route-runtime-probe-receipt") {
      throw new Error("Expected a typed runtime probe receipt in the fixture.");
    }

    expect(validateValidationReportV2({
      ...report,
      evidenceArtifactsById: {
        ...report.evidenceArtifactsById,
        "traversal-graph": {
          ...graph,
          graphBuilderProfileHash: HASH_B,
        },
      },
    })).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "VALIDATION_REFERENCE_INVALID",
          path: "/evidenceArtifactsById/traversal-graph",
        }),
      ]),
    });

    expect(validateValidationReportV2({
      ...report,
      evidenceArtifactsById: {
        ...report.evidenceArtifactsById,
        "route-runtime-probe-receipt": {
          ...probe,
          driverProfileRef: "worldkit://traversal-driver-profile/unknown@1",
        },
      },
    })).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "VALIDATION_REFERENCE_INVALID",
          path: "/evidenceArtifactsById/route-runtime-probe-receipt",
        }),
      ]),
    });
  });

  it("rejects V2 Profiles that omit Route thresholds or mix Capture fields", () => {
    const withoutThresholds = {
      ...OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
    } as unknown as Record<string, unknown>;
    delete withoutThresholds.routeRuntimeGateThresholds;
    expect(validateValidationProfileV2(withoutThresholds)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_OBJECT_INVALID" }),
      ]),
    });

    expect(validateValidationProfileV2(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
    )).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_ENUM_INVALID" }),
      ]),
    });
  });

  it("accepts only the closed directional bounds materialized from the Traversal Lock", () => {
    const missingMaximum = structuredClone(
      validWorldPackageReport(),
    ) as unknown as Record<string, unknown>;
    const missingMaximumGates = missingMaximum.gateResultsById as Record<
      string,
      Record<string, unknown>
    >;
    const missingMaximumMetrics = missingMaximumGates["route-connectivity"]!
      .metricResultsById as Record<string, Record<string, unknown>>;
    delete missingMaximumMetrics["maximum-observed-step-height-meters"]!
      .maximumAllowedMeters;

    expect(validateValidationReportV2(missingMaximum)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "VALIDATION_REFERENCE_INVALID",
          path: expect.stringMatching(/maximum-observed-step-height-meters/),
        }),
      ]),
    });

    const conflictingDirection = structuredClone(
      validWorldPackageReport(),
    ) as unknown as Record<string, unknown>;
    const conflictingDirectionGates = conflictingDirection.gateResultsById as Record<
      string,
      Record<string, unknown>
    >;
    const conflictingDirectionMetrics = conflictingDirectionGates["route-connectivity"]!
      .metricResultsById as Record<string, Record<string, unknown>>;
    conflictingDirectionMetrics["minimum-observed-clearance-width-meters"]!
      .maximumAllowedMeters = 2;

    expect(validateValidationReportV2(conflictingDirection)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "VALIDATION_REFERENCE_INVALID",
          path: expect.stringMatching(/minimum-observed-clearance-width-meters/),
        }),
      ]),
    });

    const nonZeroSurfaceGap = structuredClone(
      validWorldPackageReport(),
    ) as unknown as Record<string, unknown>;
    const nonZeroSurfaceGapGates = nonZeroSurfaceGap.gateResultsById as Record<
      string,
      Record<string, unknown>
    >;
    const nonZeroSurfaceGapMetrics = nonZeroSurfaceGapGates["route-connectivity"]!
      .metricResultsById as Record<string, Record<string, unknown>>;
    nonZeroSurfaceGapMetrics["maximum-observed-surface-gap-meters"]!
      .maximumAllowedMeters = 0.1;

    expect(validateValidationReportV2(nonZeroSurfaceGap)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "VALIDATION_REFERENCE_INVALID",
          path: expect.stringMatching(/maximum-observed-surface-gap-meters/),
        }),
      ]),
    });
  });

  it("hashes V2 reports independently of insertion order", () => {
    const report = validWorldPackageReport();
    const reordered = {
      diagnostics: report.diagnostics,
      evidenceArtifactsById: report.evidenceArtifactsById,
      gateResultsById: report.gateResultsById,
      status: report.status,
      validationProfileHash: report.validationProfileHash,
      resolvedVersion: report.resolvedVersion,
      validationProfileRef: report.validationProfileRef,
      dependencyReportRefs: report.dependencyReportRefs,
      subject: report.subject,
      id: report.id,
      schemaVersion: report.schemaVersion,
      kind: report.kind,
    } as ValidationReportV2;
    expect(hashValidationReportV2(reordered)).toBe(hashValidationReportV2(report));
  });
});
