import { describe, expect, it } from "vitest";

import {
  OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_HASH_V1,
  OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
  deriveValidationReportStatusV1,
  hashValidationProfileV1,
  hashValidationReportV1,
  validateValidationProfileV1,
  validateValidationReportV1,
  type GateResultV1,
  type ValidationProfileV1,
  type ValidationReportV1,
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
            required: true,
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
