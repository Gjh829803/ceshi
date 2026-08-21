import { isNil } from "lodash-es";

import type {
  ValidationGateRequirementV1,
  ValidationGateStatusV1,
  ValidationMetricStatusV1,
  ValidationReportStatusV1,
} from "./types";

interface RequiredMetricDefinitionLike {
  readonly id: string;
  readonly isRequired: boolean;
}

interface GateDefinitionLike {
  readonly id: string;
  readonly requirement: ValidationGateRequirementV1;
  readonly metricDefinitionsById: Readonly<
    Record<string, RequiredMetricDefinitionLike>
  >;
}

interface MetricResultLike {
  readonly status: ValidationMetricStatusV1;
}

interface GateResultLike {
  readonly metricResultsById: Readonly<Record<string, MetricResultLike>>;
}

interface ValidationProfileLike {
  readonly gateDefinitionsById: Readonly<Record<string, GateDefinitionLike>>;
}

function requiredMetricResults(
  gateDefinition: GateDefinitionLike,
  gateResult: GateResultLike,
): readonly (MetricResultLike | undefined)[] {
  return Object.values(gateDefinition.metricDefinitionsById)
    .filter((metricDefinition) => metricDefinition.isRequired)
    .map((metricDefinition) => gateResult.metricResultsById[metricDefinition.id]);
}

export function deriveValidationGateStatusV1(
  gateDefinition: GateDefinitionLike,
  gateResult: GateResultLike | undefined,
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
  if (requiredResults.some(
    (metricResult) => metricResult?.status === "not-applicable",
  )) {
    return "incomplete";
  }
  return "passed";
}

export function deriveValidationReportStatusV1(
  profile: ValidationProfileLike,
  gateResultsById: Readonly<Record<string, GateResultLike>>,
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
    gateEvaluations.some(
      ({ gateDefinition, status }) =>
        gateDefinition.requirement === "blocking" && status !== "passed",
    )
  ) {
    return "incomplete";
  }
  if (
    gateEvaluations.some(({ status }) => status === "incomplete")
  ) {
    return "incomplete";
  }
  return "passed";
}

export const deriveValidationGateStatusV2 = deriveValidationGateStatusV1;
export const deriveValidationReportStatusV2 = deriveValidationReportStatusV1;
