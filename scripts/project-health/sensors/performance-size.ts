import { isNil } from "lodash-es";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  parseProjectHealthObservationV1,
  projectHealthFindingFingerprintV1,
  type ProjectHealthFindingV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
} from "../contracts";

export const PERFORMANCE_SIZE_SENSOR_IMPLEMENTATION_HASH_V1 = sha256CanonicalJson({
  sensorId: "performance-size",
  implementationId: "bundle-bytes-v1",
});

export interface PerformanceSizeMeasurementV1 {
  readonly runnerProfileId: string;
  readonly bundleBytes: number;
}

export function observePerformanceSizeV1(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly measurement: PerformanceSizeMeasurementV1 | null;
  readonly baseline: PerformanceSizeMeasurementV1 | null;
}): ProjectHealthObservationV1 {
  const inputFingerprint = sha256CanonicalJson({
    measurement: input.measurement,
    baseline: input.baseline,
  });
  if (isNil(input.measurement)) {
    return parseProjectHealthObservationV1({
      kind: "project-health-observation",
      schemaVersion: 1,
      sensorId: "performance-size",
      sensorImplementationHash: PERFORMANCE_SIZE_SENSOR_IMPLEMENTATION_HASH_V1,
      inputFingerprint,
      status: "incomplete",
      metricsById: {
        "bundle-bytes": {
          id: "bundle-bytes",
          kind: "bytes",
          status: "not-evaluated",
          reasonCode: "OWNER_COMMAND_NOT_RUN",
        },
      },
      findings: [],
      evidenceRefs: [],
    }, input.profile);
  }

  const maximumBytes = input.profile.metricPoliciesById["bundle-bytes"]?.threshold.kind === "bytes"
    ? input.profile.metricPoliciesById["bundle-bytes"].threshold.maximumBytes
    : 0;
  const overBudget = input.measurement.bundleBytes > maximumBytes;
  const findings: ProjectHealthFindingV1[] = [];
  const evidenceRef = sha256CanonicalJson(input.measurement);
  if (overBudget) {
    findings.push({
      kind: "project-health-finding",
      schemaVersion: 1,
      fingerprint: projectHealthFindingFingerprintV1({
        sensorId: "performance-size",
        code: "PROJECT_HEALTH_PERFORMANCE_SIZE_BUDGET_EXCEEDED",
        subjectRefs: ["gate:playground-build"],
        evidenceClassIds: ["performance-budget"],
      }),
      sensorId: "performance-size",
      policy: "advisory-p2",
      dimension: "D5",
      code: "PROJECT_HEALTH_PERFORMANCE_SIZE_BUDGET_EXCEEDED",
      ownerId: "performance-size",
      subjectRefs: ["gate:playground-build"],
      evidenceClassIds: ["performance-budget"],
      metricIds: ["bundle-bytes"],
      evidenceRefs: [evidenceRef],
      expected: "Tracked bundle bytes must stay at or below the frozen Profile static budget.",
      impact: "An oversized bundle can ship a different Playground surface than the accepted budget.",
      suggestedGateId: "playground-build",
    });
  }

  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: "performance-size",
    sensorImplementationHash: PERFORMANCE_SIZE_SENSOR_IMPLEMENTATION_HASH_V1,
    inputFingerprint,
    status: overBudget ? "failed" : "passed",
    metricsById: {
      "bundle-bytes": {
        id: "bundle-bytes",
        kind: "bytes",
        valueBytes: input.measurement.bundleBytes,
      },
    },
    findings,
    evidenceRefs: [evidenceRef],
  }, input.profile);
}
