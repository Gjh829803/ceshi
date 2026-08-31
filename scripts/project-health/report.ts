import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isEqual, isNil, sortBy, uniq } from "lodash-es";

import {
  parseProjectHealthFindingV1,
  parseProjectHealthObservationV1,
  parseProjectHealthReportV1,
  type AcceptedProjectDebtListV1,
  type AcceptedProjectDebtV1,
  type ProjectHealthFindingV1,
  type ProjectHealthMetricCapV1,
  type ProjectHealthMetricV1,
  type ProjectHealthModeV1,
  type ProjectHealthObservationV1,
  type ProjectHealthPolicyV1,
  type ProjectHealthProfileV1,
  type ProjectHealthReportV1,
  type ProjectHealthSensorIdV1,
} from "./contracts";
import {
  isRegisteredProjectHealthGateIdV1,
  PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1,
} from "./registry";

export interface ProjectHealthClockV1 {
  readonly utcDate: () => string;
}

interface AggregateProjectHealthReportInputV1 {
  readonly profile: ProjectHealthProfileV1;
  readonly mode: ProjectHealthModeV1;
  readonly commitSha: string;
  readonly baseSha: string | null;
  readonly clock: ProjectHealthClockV1;
  readonly observations: readonly unknown[];
  readonly acceptedDebt: AcceptedProjectDebtListV1;
  readonly baseline: ProjectHealthReportV1 | null;
}

function metricPoliciesForSensor(
  profile: ProjectHealthProfileV1,
  sensorId: ProjectHealthSensorIdV1,
): readonly [string, ProjectHealthProfileV1["metricPoliciesById"][string]][] {
  return sortBy(
    Object.entries(profile.metricPoliciesById).filter(([, policy]) => policy.sensorId === sensorId),
    ([metricId]) => metricId,
  );
}

function incompleteMetrics(
  profile: ProjectHealthProfileV1,
  sensorId: ProjectHealthSensorIdV1,
  reasonCode: string,
): Readonly<Record<string, ProjectHealthMetricV1>> {
  return Object.fromEntries(metricPoliciesForSensor(profile, sensorId).map(([metricId, policy]) => [metricId, {
    id: metricId,
    kind: policy.kind,
    status: "not-evaluated",
    reasonCode,
  }]));
}

function mergeFindings(
  profile: ProjectHealthProfileV1,
  findings: readonly ProjectHealthFindingV1[],
): readonly ProjectHealthFindingV1[] {
  const grouped = new Map<string, ProjectHealthFindingV1[]>();
  for (const finding of findings) {
    const entries = grouped.get(finding.fingerprint) ?? [];
    entries.push(finding);
    grouped.set(finding.fingerprint, entries);
  }
  return sortBy([...grouped.entries()].map(([, entries]) => {
    const stable = sortBy(entries, (entry) => JSON.stringify({ ...entry, evidenceRefs: [] }))[0]!;
    return parseProjectHealthFindingV1({
      ...stable,
      evidenceRefs: sortBy(uniq(entries.flatMap((entry) => entry.evidenceRefs))),
    }, profile);
  }), ["fingerprint"]);
}

function metricWithinCap(metric: ProjectHealthMetricV1, cap: ProjectHealthMetricCapV1): boolean {
  if ("status" in metric || metric.kind !== cap.kind) return false;
  if (metric.kind === "boolean" && cap.kind === "boolean") return metric.value === cap.acceptedValue;
  if (metric.kind === "count" && cap.kind === "count") return metric.valueCount <= cap.maximumCount;
  if (metric.kind === "bytes" && cap.kind === "bytes") return metric.valueBytes <= cap.maximumBytes;
  if (metric.kind === "duration" && cap.kind === "duration") {
    return metric.valueMilliseconds <= cap.maximumMilliseconds;
  }
  return metric.kind === "ratio" && cap.kind === "ratio" && metric.valueRatio <= cap.maximumRatio;
}

function acceptedDebtMatches(
  finding: ProjectHealthFindingV1,
  metricsById: Readonly<Record<string, ProjectHealthMetricV1>>,
  debt: AcceptedProjectDebtV1 | undefined,
  evaluatedOn: string,
): boolean {
  if (
    isNil(debt) ||
    (finding.policy !== "advisory-p2" && finding.policy !== "advisory-p3") ||
    debt.acceptedPolicy !== finding.policy ||
    debt.ownerId !== finding.ownerId ||
    debt.expiresOn < evaluatedOn ||
    !isEqual(sortBy(Object.keys(debt.metricCapsById)), sortBy(finding.metricIds))
  ) return false;
  return finding.metricIds.every((metricId) => {
    const metric = metricsById[metricId];
    const cap = debt.metricCapsById[metricId];
    return !isNil(metric) && !isNil(cap) && metricWithinCap(metric, cap);
  });
}

function policyRank(policy: ProjectHealthPolicyV1): number {
  if (policy === "blocking-p0") return 4;
  if (policy === "blocking-p1") return 3;
  if (policy === "advisory-p2") return 2;
  return 1;
}

function compareMetricDirection(
  previous: ProjectHealthMetricV1 | undefined,
  current: ProjectHealthMetricV1 | undefined,
  policy: ProjectHealthProfileV1["metricPoliciesById"][string] | undefined,
): "same" | "improved" | "regressed" {
  if (isNil(previous) || isNil(current) || isNil(policy) || previous.kind !== current.kind) return "regressed";
  if (sha256CanonicalJson(previous) === sha256CanonicalJson(current)) return "same";
  if ("status" in previous || "status" in current) {
    if ("status" in previous && previous.status === "not-evaluated" && !("status" in current)) return "improved";
    return "regressed";
  }
  if (previous.kind === "boolean" && current.kind === "boolean" && policy.threshold.kind === "boolean") {
    const previousDistance = previous.value === policy.threshold.expectedValue ? 0 : 1;
    const currentDistance = current.value === policy.threshold.expectedValue ? 0 : 1;
    return currentDistance < previousDistance ? "improved" : "regressed";
  }
  const previousValue = previous.kind === "count"
    ? previous.valueCount
    : previous.kind === "bytes"
      ? previous.valueBytes
      : previous.kind === "duration"
        ? previous.valueMilliseconds
        : previous.kind === "ratio"
          ? previous.valueRatio
          : 0;
  const currentValue = current.kind === "count"
    ? current.valueCount
    : current.kind === "bytes"
      ? current.valueBytes
      : current.kind === "duration"
        ? current.valueMilliseconds
        : current.kind === "ratio"
          ? current.valueRatio
          : 0;
  return currentValue < previousValue ? "improved" : "regressed";
}

function compareFinding(
  profile: ProjectHealthProfileV1,
  baseline: ProjectHealthReportV1,
  currentMetricsBySensorId: ProjectHealthReportV1["metricsBySensorId"],
  previous: ProjectHealthFindingV1,
  current: ProjectHealthFindingV1,
): "unchanged" | "improved" | "regressed" {
  const policyChange = policyRank(current.policy) - policyRank(previous.policy);
  const metricIds = sortBy(uniq([
    ...Object.keys(baseline.metricsBySensorId[previous.sensorId] ?? {}),
    ...Object.keys(currentMetricsBySensorId[current.sensorId] ?? {}),
  ]));
  const directions = metricIds.map((metricId) => compareMetricDirection(
    baseline.metricsBySensorId[previous.sensorId]?.[metricId],
    currentMetricsBySensorId[current.sensorId]?.[metricId],
    profile.metricPoliciesById[metricId],
  ));
  if (policyChange > 0 || directions.includes("regressed")) return "regressed";
  if (policyChange < 0 || directions.includes("improved")) return "improved";
  return "unchanged";
}

function compareBaseline(
  profile: ProjectHealthProfileV1,
  baseline: ProjectHealthReportV1,
  findings: readonly ProjectHealthFindingV1[],
  metricsBySensorId: ProjectHealthReportV1["metricsBySensorId"],
): Readonly<Record<string, "new" | "resolved" | "unchanged" | "improved" | "regressed">> {
  const previousByFingerprint = new Map(baseline.findings.map((finding) => [finding.fingerprint, finding]));
  const currentByFingerprint = new Map(findings.map((finding) => [finding.fingerprint, finding]));
  return Object.fromEntries(sortBy(uniq([
    ...previousByFingerprint.keys(),
    ...currentByFingerprint.keys(),
  ])).map((fingerprint) => {
    const previous = previousByFingerprint.get(fingerprint);
    const current = currentByFingerprint.get(fingerprint);
    if (isNil(previous)) return [fingerprint, "new"] as const;
    if (isNil(current)) return [fingerprint, "resolved"] as const;
    return [fingerprint, compareFinding(profile, baseline, metricsBySensorId, previous, current)] as const;
  }));
}

function derivedReportStatus(
  profile: ProjectHealthProfileV1,
  mode: ProjectHealthModeV1,
  metricsBySensorId: ProjectHealthReportV1["metricsBySensorId"],
  findings: readonly ProjectHealthFindingV1[],
): ProjectHealthReportV1["status"] {
  let hasFailedMetric = false;
  for (const sensorId of profile.modesById[mode].requiredSensorIds) {
    for (const [metricId, policy] of metricPoliciesForSensor(profile, sensorId)) {
      const metric = metricsBySensorId[sensorId]?.[metricId];
      if (isNil(metric) || ("status" in metric && metric.status === "not-evaluated")) return "incomplete";
      if ("status" in metric) continue;
      const threshold = policy.threshold;
      const failed = metric.kind === "boolean" && threshold.kind === "boolean"
        ? metric.value !== threshold.expectedValue
        : metric.kind === "count" && threshold.kind === "count"
          ? metric.valueCount > threshold.maximumCount
          : metric.kind === "bytes" && threshold.kind === "bytes"
            ? metric.valueBytes > threshold.maximumBytes
            : metric.kind === "duration" && threshold.kind === "duration"
              ? metric.valueMilliseconds > threshold.maximumMilliseconds
              : metric.kind === "ratio" && threshold.kind === "ratio"
                ? metric.valueRatio > threshold.maximumRatio
                : true;
      hasFailedMetric ||= failed;
    }
  }
  if (hasFailedMetric || findings.some((finding) =>
    finding.policy === "blocking-p0" || finding.policy === "blocking-p1")) return "failed";
  return "passed";
}

export function aggregateProjectHealthReportV1(
  input: AggregateProjectHealthReportInputV1,
): ProjectHealthReportV1 {
  if (isEmpty(input.profile.modesById[input.mode].requiredSensorIds)) {
    throw new Error("A Project Health mode must select at least one Required Sensor.");
  }
  const selectedSensorIds = sortBy(uniq([
    ...input.profile.modesById[input.mode].requiredSensorIds,
    ...input.profile.modesById[input.mode].advisorySensorIds,
  ]));
  const observationsBySensorId = new Map<ProjectHealthSensorIdV1, ProjectHealthObservationV1>();
  const invalidSensorIds = new Set<ProjectHealthSensorIdV1>();

  for (const raw of input.observations) {
    try {
      const observation = parseProjectHealthObservationV1(raw, input.profile);
      if (!selectedSensorIds.includes(observation.sensorId)) {
        throw new TypeError(`Observation Sensor ${observation.sensorId} is outside the selected mode closure.`);
      }
      if (observationsBySensorId.has(observation.sensorId)) {
        invalidSensorIds.add(observation.sensorId);
        continue;
      }
      observationsBySensorId.set(observation.sensorId, observation);
      const expectedImplementationHash = PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1[observation.sensorId];
      if (observation.sensorImplementationHash !== expectedImplementationHash) {
        invalidSensorIds.add(observation.sensorId);
      }
      if (observation.findings.some((finding) =>
        !isNil(finding.suggestedGateId) && !isRegisteredProjectHealthGateIdV1(finding.suggestedGateId))) {
        invalidSensorIds.add(observation.sensorId);
      }
    } catch {
      const sensorId = typeof raw === "object" && !isNil(raw) && !Array.isArray(raw) &&
          typeof (raw as { sensorId?: unknown }).sensorId === "string"
        ? (raw as { sensorId: ProjectHealthSensorIdV1 }).sensorId
        : null;
      if (!isNil(sensorId) && selectedSensorIds.includes(sensorId)) invalidSensorIds.add(sensorId);
      else throw new TypeError("Project Health input cannot be attributed to a selected Sensor.");
    }
  }

  const sensorImplementationHashesBySensorId: Partial<Record<ProjectHealthSensorIdV1, string>> = {};
  const observationHashesBySensorId: Partial<Record<ProjectHealthSensorIdV1, string>> = {};
  const metricsBySensorId: Partial<Record<ProjectHealthSensorIdV1, Readonly<Record<string, ProjectHealthMetricV1>>>> = {};
  const allFindings: ProjectHealthFindingV1[] = [];
  for (const sensorId of selectedSensorIds) {
    const observation = observationsBySensorId.get(sensorId);
    sensorImplementationHashesBySensorId[sensorId] = observation?.sensorImplementationHash ??
      PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1[sensorId];
    observationHashesBySensorId[sensorId] = isNil(observation)
      ? sha256CanonicalJson({ sensorId, status: "missing" })
      : sha256CanonicalJson(observation);
    metricsBySensorId[sensorId] = isNil(observation) || invalidSensorIds.has(sensorId)
      ? incompleteMetrics(input.profile, sensorId, isNil(observation)
        ? "PROJECT_HEALTH_OBSERVATION_MISSING"
        : "PROJECT_HEALTH_OBSERVATION_INVALID")
      : observation.metricsById;
    if (!isNil(observation) && !invalidSensorIds.has(sensorId)) allFindings.push(...observation.findings);
  }

  const findings = mergeFindings(input.profile, allFindings);
  const evaluatedOn = input.clock.utcDate();
  const debtByFingerprint = new Map(input.acceptedDebt.entries.map((entry) => [entry.fingerprint, entry]));
  const debtStatesByFingerprint = Object.fromEntries(findings.map((finding) => {
    if (finding.policy === "blocking-p0" || finding.policy === "blocking-p1") {
      return [finding.fingerprint, "not-applicable"] as const;
    }
    const accepted = acceptedDebtMatches(
      finding,
      metricsBySensorId[finding.sensorId] ?? {},
      debtByFingerprint.get(finding.fingerprint),
      evaluatedOn,
    );
    return [finding.fingerprint, accepted ? "accepted-debt" : "open-advisory"] as const;
  }));

  const profileHash = sha256CanonicalJson(input.profile);
  let baselineComparisonStatus: ProjectHealthReportV1["baselineComparisonStatus"] = "not-requested";
  let changeByFingerprint: ProjectHealthReportV1["changeByFingerprint"] = null;
  if (!isNil(input.baseline)) {
    const identityMatches = input.baseline.profileHash === profileHash &&
      input.baseline.mode === input.mode &&
      isEqual(input.baseline.sensorImplementationHashesBySensorId, sensorImplementationHashesBySensorId);
    if (identityMatches) {
      baselineComparisonStatus = "compared";
      changeByFingerprint = compareBaseline(input.profile, input.baseline, findings, metricsBySensorId);
    } else {
      baselineComparisonStatus = "profile-mismatch";
      const firstRequired = input.profile.modesById[input.mode].requiredSensorIds[0];
      if (!isNil(firstRequired)) {
        metricsBySensorId[firstRequired] = incompleteMetrics(
          input.profile,
          firstRequired,
          "PROJECT_HEALTH_BASELINE_IDENTITY_MISMATCH",
        );
      }
    }
  }

  const status = derivedReportStatus(input.profile, input.mode, metricsBySensorId, findings);
  return parseProjectHealthReportV1({
    kind: "project-health-report",
    schemaVersion: 1,
    mode: input.mode,
    commitSha: input.commitSha,
    baseSha: input.baseSha,
    evaluatedOn,
    profileHash,
    sensorImplementationHashesBySensorId,
    observationHashesBySensorId,
    metricsBySensorId,
    findings,
    debtStatesByFingerprint,
    status,
    baselineComparisonStatus,
    changeByFingerprint,
  }, input.profile);
}
