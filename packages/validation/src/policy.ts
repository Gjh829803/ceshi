import { isNil } from "lodash-es";

import type {
  GateDefinitionV1,
  GateResultV1,
  MetricDefinitionV1,
  MetricResultV1,
  ValidationGateStatusV1,
  ValidationProfileV1,
  ValidationReportStatusV1,
} from "./types";

function requiredMetricResults(
  gateDefinition: GateDefinitionV1,
  gateResult: GateResultV1,
): readonly (MetricResultV1 | undefined)[] {
  return Object.values(gateDefinition.metricDefinitionsById)
    .filter((metricDefinition: MetricDefinitionV1) => metricDefinition.required)
    .map((metricDefinition) =>
      gateResult.metricResultsById[metricDefinition.id]
    );
}

export function deriveValidationGateStatusV1(
  gateDefinition: GateDefinitionV1,
  gateResult: GateResultV1 | undefined,
): ValidationGateStatusV1 {
  if (isNil(gateResult)) return "incomplete";
  const requiredResults = requiredMetricResults(gateDefinition, gateResult);
  if (requiredResults.some((metricResult) => metricResult?.status === "failed")) {
    return "failed";
  }
  if (
    requiredResults.some((metricResult) =>
      isNil(metricResult) || metricResult.status === "not-evaluated"
    )
  ) {
    return "incomplete";
  }
  if (
    requiredResults.length > 0 &&
    requiredResults.every(
      (metricResult) => metricResult?.status === "not-applicable",
    )
  ) {
    return "not-applicable";
  }
  return "passed";
}

export function deriveValidationReportStatusV1(
  profile: ValidationProfileV1,
  gateResultsById: Readonly<Record<string, GateResultV1>>,
): ValidationReportStatusV1 {
  const gateEvaluations = Object.values(profile.gateDefinitionsById).map(
    (gateDefinition) => ({
      gateDefinition,
      status: deriveValidationGateStatusV1(
        gateDefinition,
        gateResultsById[gateDefinition.id],
      ),
    }),
  );
  if (
    gateEvaluations.some(
      ({ gateDefinition, status }) =>
        gateDefinition.requirement === "blocking" && status === "failed",
    )
  ) {
    return "failed";
  }
  if (
    gateEvaluations.some(({ status }) => status === "incomplete")
  ) {
    return "incomplete";
  }
  return "passed";
}
