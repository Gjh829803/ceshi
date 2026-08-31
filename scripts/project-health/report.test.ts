import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil, uniq } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  parseAcceptedProjectDebtListV1,
  parseProjectHealthFindingV1,
  parseProjectHealthObservationV1,
  parseProjectHealthProfileV1,
  projectHealthFindingFingerprintV1,
  type ProjectHealthFindingV1,
  type ProjectHealthMetricV1,
  type ProjectHealthModeV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
  type ProjectHealthSensorIdV1,
} from "./contracts";
import { aggregateProjectHealthReportV1 } from "./report";
import {
  CONTRACT_PARITY_SENSOR_IMPLEMENTATION_HASH_V1,
} from "./sensors/contract-parity";
import {
  DOCUMENTATION_TRUTH_SENSOR_IMPLEMENTATION_HASH_V1,
} from "./sensors/documentation-truth";
import {
  INDEPENDENT_REVIEW_SENSOR_IMPLEMENTATION_HASH_V1,
} from "./sensors/independent-review";
import {
  PERFORMANCE_SIZE_SENSOR_IMPLEMENTATION_HASH_V1,
} from "./sensors/performance-size";
import {
  RUNTIME_HEALTH_SENSOR_IMPLEMENTATION_HASH_V1,
} from "./sensors/runtime-health";
import {
  SUPPLEMENTAL_AUTHORITY_SENSOR_IMPLEMENTATION_HASH_V1,
} from "./sensors/supplemental-authority";
import {
  SUPPLY_CHAIN_SENSOR_IMPLEMENTATION_HASH_V1,
} from "./sensors/supply-chain";
import {
  TEST_TOPOLOGY_SENSOR_IMPLEMENTATION_HASH_V1,
} from "./sensors/test-topology";
import {
  VISUAL_EVIDENCE_SENSOR_IMPLEMENTATION_HASH_V1,
} from "./sensors/visual-evidence";
import {
  WORKSPACE_BOUNDARY_SENSOR_IMPLEMENTATION_HASH_V1,
} from "./sensors/workspace-boundary";

const REPOSITORY_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const COMMIT_SHA = "c".repeat(40);
const BASE_SHA = "d".repeat(40);
const EVIDENCE_A = `sha256:${"a".repeat(64)}`;
const EVIDENCE_B = `sha256:${"b".repeat(64)}`;
const IMPLEMENTATION_HASHES = {
  "workspace-boundary": WORKSPACE_BOUNDARY_SENSOR_IMPLEMENTATION_HASH_V1,
  "supplemental-authority": SUPPLEMENTAL_AUTHORITY_SENSOR_IMPLEMENTATION_HASH_V1,
  "contract-parity": CONTRACT_PARITY_SENSOR_IMPLEMENTATION_HASH_V1,
  "supply-chain": SUPPLY_CHAIN_SENSOR_IMPLEMENTATION_HASH_V1,
  "test-topology": TEST_TOPOLOGY_SENSOR_IMPLEMENTATION_HASH_V1,
  "runtime-health": RUNTIME_HEALTH_SENSOR_IMPLEMENTATION_HASH_V1,
  "performance-size": PERFORMANCE_SIZE_SENSOR_IMPLEMENTATION_HASH_V1,
  "visual-evidence": VISUAL_EVIDENCE_SENSOR_IMPLEMENTATION_HASH_V1,
  "documentation-truth": DOCUMENTATION_TRUTH_SENSOR_IMPLEMENTATION_HASH_V1,
  "independent-review": INDEPENDENT_REVIEW_SENSOR_IMPLEMENTATION_HASH_V1,
} as const;

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8"));
}

function parsedProfile(): ProjectHealthProfileV1 {
  const repositoryPaths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);
  const workspacePackageIds = ["package.json", ...[
    ...readdirSync(path.join(REPOSITORY_ROOT, "packages"), { withFileTypes: true }),
    ...readdirSync(path.join(REPOSITORY_ROOT, "apps"), { withFileTypes: true }),
  ].filter((entry) => entry.isDirectory()).map((entry) => {
    const parent = readdirSync(path.join(REPOSITORY_ROOT, "packages"), { withFileTypes: true })
      .some((candidate) => candidate.name === entry.name)
      ? "packages"
      : "apps";
    return `${parent}/${entry.name}/package.json`;
  })].flatMap((manifestPath) => {
    try {
      const manifest = readJson(manifestPath) as { readonly name?: unknown };
      return typeof manifest.name === "string" ? [manifest.name] : [];
    } catch {
      return [];
    }
  });
  return parseProjectHealthProfileV1(readJson("config/project-health/profile.json"), {
    repositoryPaths,
    workspacePackageIds,
  });
}

function passingMetric(
  sensorId: ProjectHealthSensorIdV1,
  metricId: string,
  profile: ProjectHealthProfileV1,
  override?: ProjectHealthMetricV1,
): ProjectHealthMetricV1 {
  if (!isNil(override)) return override;
  const policy = profile.metricPoliciesById[metricId];
  if (isNil(policy) || policy.sensorId !== sensorId) {
    throw new Error(`Missing Profile metric ${metricId}`);
  }
  if (policy.kind === "boolean") return { id: metricId, kind: "boolean", value: true };
  if (policy.kind === "count") {
    return {
      id: metricId,
      kind: "count",
      valueCount: metricId === "workspace-boundary-debt-count" ? 49 : 0,
    };
  }
  if (policy.kind === "bytes") return { id: metricId, kind: "bytes", valueBytes: 1_000 };
  if (policy.kind === "duration") return { id: metricId, kind: "duration", valueMilliseconds: 1 };
  return { id: metricId, kind: "ratio", valueRatio: 0 };
}

function observation(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly sensorId: ProjectHealthSensorIdV1;
  readonly findings?: readonly ProjectHealthFindingV1[];
  readonly metricsById?: Readonly<Record<string, ProjectHealthMetricV1>>;
  readonly evidenceRefs?: readonly string[];
  readonly sensorImplementationHash?: string;
  readonly inputFingerprint?: string;
}): ProjectHealthObservationV1 {
  const metricIds = Object.entries(input.profile.metricPoliciesById)
    .filter(([, policy]) => policy.sensorId === input.sensorId)
    .map(([metricId]) => metricId);
  const metricsById = Object.fromEntries(metricIds.map((metricId) => [
    metricId,
    passingMetric(input.sensorId, metricId, input.profile, input.metricsById?.[metricId]),
  ]));
  const findings = input.findings ?? [];
  const metricStatuses = metricIds.map((metricId) => {
    const metric = metricsById[metricId]!;
    const policy = input.profile.metricPoliciesById[metricId]!;
    if ("status" in metric) return metric.status === "not-evaluated" ? "incomplete" : "not-applicable";
    if (policy.threshold.kind === "boolean" && metric.kind === "boolean") {
      return metric.value === policy.threshold.expectedValue ? "passed" : "failed";
    }
    if (policy.threshold.kind === "count" && metric.kind === "count") {
      return metric.valueCount <= policy.threshold.maximumCount ? "passed" : "failed";
    }
    if (policy.threshold.kind === "bytes" && metric.kind === "bytes") {
      return metric.valueBytes <= policy.threshold.maximumBytes ? "passed" : "failed";
    }
    if (policy.threshold.kind === "duration" && metric.kind === "duration") {
      return metric.valueMilliseconds <= policy.threshold.maximumMilliseconds ? "passed" : "failed";
    }
    if (policy.threshold.kind === "ratio" && metric.kind === "ratio") {
      return metric.valueRatio <= policy.threshold.maximumRatio ? "passed" : "failed";
    }
    return "failed";
  });
  const status = metricStatuses.includes("incomplete")
    ? "incomplete"
    : metricStatuses.includes("failed") || findings.some((finding) =>
      finding.policy === "blocking-p0" || finding.policy === "blocking-p1")
      ? "failed"
      : metricStatuses.length > 0 && metricStatuses.every((entry) => entry === "not-applicable")
        ? "not-applicable"
        : "passed";
  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: input.sensorId,
    sensorImplementationHash: input.sensorImplementationHash ?? IMPLEMENTATION_HASHES[input.sensorId],
    inputFingerprint: input.inputFingerprint ?? EVIDENCE_A,
    status,
    metricsById,
    findings,
    evidenceRefs: input.evidenceRefs ?? (isEmpty(findings)
      ? [EVIDENCE_A]
      : uniq(findings.flatMap((finding) => finding.evidenceRefs))),
  }, input.profile);
}

function finding(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly sensorId: ProjectHealthSensorIdV1;
  readonly code: string;
  readonly subjectRefs: readonly string[];
  readonly evidenceClassIds: ProjectHealthFindingV1["evidenceClassIds"];
  readonly metricIds: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly suggestedGateId: string | null;
}): ProjectHealthFindingV1 {
  const policy = input.profile.findingPoliciesByCode[input.code];
  if (isNil(policy)) throw new Error(`Missing finding policy ${input.code}`);
  return parseProjectHealthFindingV1({
    kind: "project-health-finding",
    schemaVersion: 1,
    fingerprint: projectHealthFindingFingerprintV1({
      sensorId: input.sensorId,
      code: input.code,
      subjectRefs: input.subjectRefs,
      evidenceClassIds: input.evidenceClassIds,
    }),
    sensorId: input.sensorId,
    policy: policy.policy,
    dimension: input.sensorId === "contract-parity" || input.sensorId === "supply-chain"
      ? "D2"
      : input.sensorId === "test-topology"
        ? "D3"
        : input.sensorId === "runtime-health"
          ? "D4"
          : input.sensorId === "performance-size" || input.sensorId === "visual-evidence"
            ? "D5"
            : input.sensorId === "documentation-truth" || input.sensorId === "independent-review"
              ? "D6"
              : "D1",
    code: input.code,
    ownerId: input.sensorId,
    subjectRefs: input.subjectRefs,
    evidenceClassIds: input.evidenceClassIds,
    metricIds: input.metricIds,
    evidenceRefs: input.evidenceRefs ?? [EVIDENCE_A],
    expected: "The exact Profile metric stays inside its frozen threshold.",
    impact: "A drifted owner receipt can hide a second authority or a stale generated artifact.",
    suggestedGateId: input.suggestedGateId,
  }, input.profile);
}

function selectedObservations(
  profile: ProjectHealthProfileV1,
  mode: ProjectHealthModeV1,
  overrides: Partial<Record<ProjectHealthSensorIdV1, ProjectHealthObservationV1>> = {},
): ProjectHealthObservationV1[] {
  const sensorIds = [
    ...profile.modesById[mode].requiredSensorIds,
    ...profile.modesById[mode].advisorySensorIds,
  ];
  return sensorIds.map((sensorId) => overrides[sensorId] ?? observation({ profile, sensorId }));
}

function emptyDebt(profile: ProjectHealthProfileV1) {
  return parseAcceptedProjectDebtListV1({
    kind: "accepted-project-debt-list",
    schemaVersion: 1,
    entries: [],
  }, profile);
}

function aggregate(input: {
  readonly profile?: ProjectHealthProfileV1;
  readonly mode?: ProjectHealthModeV1;
  readonly observations?: readonly ProjectHealthObservationV1[];
  readonly evaluatedOn?: string;
  readonly acceptedDebt?: ReturnType<typeof emptyDebt>;
  readonly baseline?: ReturnType<typeof aggregateProjectHealthReportV1> | null;
  readonly rawObservations?: readonly unknown[];
}) {
  const profile = input.profile ?? parsedProfile();
  const mode = input.mode ?? "pr";
  return aggregateProjectHealthReportV1({
    profile,
    mode,
    commitSha: COMMIT_SHA,
    baseSha: BASE_SHA,
    clock: { utcDate: () => input.evaluatedOn ?? "2026-08-31" },
    observations: input.rawObservations ?? input.observations ?? selectedObservations(profile, mode),
    acceptedDebt: input.acceptedDebt ?? emptyDebt(profile),
    baseline: input.baseline ?? null,
  });
}

describe("project health report aggregation", () => {
  it("does not spawn and hashes Observations before aggregation", async () => {
    const source = await readFileAsync(new URL("./report.ts", import.meta.url), "utf8");
    expect(source).not.toMatch("child_process");
    const profile = parsedProfile();
    const observations = selectedObservations(profile, "pr");
    const report = aggregate({ profile, observations });
    expect(report.profileHash).toBe(sha256CanonicalJson(profile));
    expect(report.evaluatedOn).toBe("2026-08-31");
    expect(report.status).toBe("passed");
    expect(report.baselineComparisonStatus).toBe("not-requested");
    expect(report.changeByFingerprint).toBeNull();
    expect(Object.keys(report.observationHashesBySensorId)).toEqual([
      "contract-parity",
      "documentation-truth",
      "supplemental-authority",
      "supply-chain",
      "test-topology",
      "workspace-boundary",
    ]);
    for (const observationEntry of observations) {
      expect(report.observationHashesBySensorId[observationEntry.sensorId]).toBe(
        sha256CanonicalJson(observationEntry),
      );
      expect(report.sensorImplementationHashesBySensorId[observationEntry.sensorId]).toBe(
        IMPLEMENTATION_HASHES[observationEntry.sensorId],
      );
      expect(report.metricsBySensorId[observationEntry.sensorId]).toEqual(observationEntry.metricsById);
    }
  });

  it("dedupes Findings by fingerprint and unions every evidence ref", () => {
    const profile = parsedProfile();
    const first = finding({
      profile,
      sensorId: "contract-parity",
      code: "PROJECT_HEALTH_GENERATED_DRIFT",
      subjectRefs: ["package:builder"],
      evidenceClassIds: ["generated-byte-parity"],
      metricIds: ["generated-bytes-current"],
      evidenceRefs: [EVIDENCE_A],
      suggestedGateId: "agent-self-check",
    });
    const second = finding({
      profile,
      sensorId: "contract-parity",
      code: "PROJECT_HEALTH_GENERATED_DRIFT",
      subjectRefs: ["package:builder"],
      evidenceClassIds: ["generated-byte-parity"],
      metricIds: ["generated-bytes-current"],
      evidenceRefs: [EVIDENCE_B],
      suggestedGateId: "agent-self-check",
    });
    expect(first.fingerprint).toBe(second.fingerprint);
    const report = aggregate({
      profile,
      observations: selectedObservations(profile, "pr", {
        "contract-parity": observation({
          profile,
          sensorId: "contract-parity",
          findings: [first, second],
          evidenceRefs: [EVIDENCE_A, EVIDENCE_B],
        }),
      }),
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.fingerprint).toBe(first.fingerprint);
    expect(report.findings[0]?.evidenceRefs).toEqual([EVIDENCE_A, EVIDENCE_B]);
    expect(report.findings[0]?.suggestedGateId).toBe("agent-self-check");
    expect(report.status).toBe("failed");
  });

  it("marks the Report incomplete when a Required Sensor is missing or illegal", () => {
    const profile = parsedProfile();
    const missing = aggregate({
      profile,
      observations: selectedObservations(profile, "pr").filter((entry) => entry.sensorId !== "test-topology"),
    });
    expect(missing.status).toBe("incomplete");
    expect(missing.metricsBySensorId["test-topology"]?.["test-census-current"]).toMatchObject({
      status: "not-evaluated",
    });

    const illegal = aggregate({
      profile,
      rawObservations: [
        ...selectedObservations(profile, "pr").filter((entry) => entry.sensorId !== "contract-parity"),
        { kind: "project-health-observation", sensorId: "contract-parity" },
      ],
    });
    expect(illegal.status).toBe("incomplete");
  });

  it("fails on a Required Observation failure or any blocking Finding", () => {
    const profile = parsedProfile();
    const requiredFailed = aggregate({
      profile,
      observations: selectedObservations(profile, "pr", {
        "contract-parity": observation({
          profile,
          sensorId: "contract-parity",
          metricsById: {
            "generated-bytes-current": { id: "generated-bytes-current", kind: "boolean", value: false },
          },
        }),
      }),
    });
    expect(requiredFailed.status).toBe("failed");

    const blocking = finding({
      profile,
      sensorId: "test-topology",
      code: "PROJECT_HEALTH_TEST_UNREGISTERED",
      subjectRefs: ["path:scripts/example.test.ts"],
      evidenceClassIds: ["test-census"],
      metricIds: ["test-census-current"],
      suggestedGateId: "test-census",
    });
    const blockingReport = aggregate({
      profile,
      observations: selectedObservations(profile, "pr", {
        "test-topology": observation({
          profile,
          sensorId: "test-topology",
          findings: [blocking],
        }),
      }),
    });
    expect(blockingReport.status).toBe("failed");
    expect(blockingReport.debtStatesByFingerprint[blocking.fingerprint]).toBe("not-applicable");
  });

  it("keeps advisory Findings without changing a passing Required status", () => {
    const profile = parsedProfile();
    const advisory = finding({
      profile,
      sensorId: "supply-chain",
      code: "PROJECT_HEALTH_VULNERABILITY_ADVISORY",
      subjectRefs: ["package:lodash-es"],
      evidenceClassIds: ["vulnerability-advisory"],
      metricIds: ["dependency-inventory-complete"],
      suggestedGateId: "dependency-inventory",
    });
    const report = aggregate({
      profile,
      observations: selectedObservations(profile, "pr", {
        "supply-chain": observation({
          profile,
          sensorId: "supply-chain",
          findings: [advisory],
        }),
      }),
    });
    expect(report.status).toBe("passed");
    expect(report.findings.map((entry) => entry.fingerprint)).toEqual([advisory.fingerprint]);
    expect(report.debtStatesByFingerprint[advisory.fingerprint]).toBe("open-advisory");
  });

  it("accepts exact advisory debt on the same day and expires the next day", () => {
    const profile = parsedProfile();
    const advisory = finding({
      profile,
      sensorId: "supply-chain",
      code: "PROJECT_HEALTH_VULNERABILITY_ADVISORY",
      subjectRefs: ["package:lodash-es"],
      evidenceClassIds: ["vulnerability-advisory"],
      metricIds: ["dependency-inventory-complete"],
      suggestedGateId: "dependency-inventory",
    });
    const acceptedDebt = parseAcceptedProjectDebtListV1({
      kind: "accepted-project-debt-list",
      schemaVersion: 1,
      entries: [{
        kind: "accepted-project-debt",
        schemaVersion: 1,
        fingerprint: advisory.fingerprint,
        acceptedPolicy: "advisory-p2",
        metricCapsById: {
          "dependency-inventory-complete": { kind: "boolean", acceptedValue: true },
        },
        ownerId: "supply-chain",
        decisionRef: "docs/decisions/ADR-0001.md",
        reason: "A version-bound advisory stays below the frozen metric cap.",
        expiresOn: "2026-08-31",
      }],
    }, profile);
    const observations = selectedObservations(profile, "pr", {
      "supply-chain": observation({
        profile,
        sensorId: "supply-chain",
        findings: [advisory],
      }),
    });
    const sameDay = aggregate({ profile, observations, acceptedDebt, evaluatedOn: "2026-08-31" });
    expect(sameDay.debtStatesByFingerprint[advisory.fingerprint]).toBe("accepted-debt");
    expect(sameDay.status).toBe("passed");

    const nextDay = aggregate({ profile, observations, acceptedDebt, evaluatedOn: "2026-09-01" });
    expect(nextDay.debtStatesByFingerprint[advisory.fingerprint]).toBe("open-advisory");

    const capMiss = parseAcceptedProjectDebtListV1({
      kind: "accepted-project-debt-list",
      schemaVersion: 1,
      entries: [{
        kind: "accepted-project-debt",
        schemaVersion: 1,
        fingerprint: advisory.fingerprint,
        acceptedPolicy: "advisory-p2",
        metricCapsById: {
          "dependency-inventory-complete": { kind: "boolean", acceptedValue: false },
        },
        ownerId: "supply-chain",
        decisionRef: "docs/decisions/ADR-0001.md",
        reason: "A version-bound advisory stays below the frozen metric cap.",
        expiresOn: "2026-08-31",
      }],
    }, profile);
    expect(aggregate({
      profile,
      observations,
      acceptedDebt: capMiss,
    }).debtStatesByFingerprint[advisory.fingerprint]).toBe("open-advisory");
  });

  it("never suppresses a blocking Finding through accepted debt", () => {
    const profile = parsedProfile();
    const blocking = finding({
      profile,
      sensorId: "contract-parity",
      code: "PROJECT_HEALTH_GENERATED_DRIFT",
      subjectRefs: ["package:builder"],
      evidenceClassIds: ["generated-byte-parity"],
      metricIds: ["generated-bytes-current"],
      suggestedGateId: "agent-self-check",
    });
    const acceptedDebt = parseAcceptedProjectDebtListV1({
      kind: "accepted-project-debt-list",
      schemaVersion: 1,
      entries: [{
        kind: "accepted-project-debt",
        schemaVersion: 1,
        fingerprint: blocking.fingerprint,
        acceptedPolicy: "advisory-p2",
        metricCapsById: {
          "generated-bytes-current": { kind: "boolean", acceptedValue: false },
        },
        ownerId: "builder-self-check",
        decisionRef: "docs/decisions/ADR-0001.md",
        reason: "Blocking drift cannot be accepted as advisory debt.",
        expiresOn: "2026-09-30",
      }],
    }, profile);
    const report = aggregate({
      profile,
      acceptedDebt,
      observations: selectedObservations(profile, "pr", {
        "contract-parity": observation({
          profile,
          sensorId: "contract-parity",
          findings: [blocking],
        }),
      }),
    });
    expect(report.status).toBe("failed");
    expect(report.debtStatesByFingerprint[blocking.fingerprint]).toBe("not-applicable");
    expect(report.findings).toHaveLength(1);
  });

  it("compares a standalone baseline and nulls the map on identity mismatch", () => {
    const profile = parsedProfile();
    const advisory = finding({
      profile,
      sensorId: "supply-chain",
      code: "PROJECT_HEALTH_VULNERABILITY_ADVISORY",
      subjectRefs: ["package:lodash-es"],
      evidenceClassIds: ["vulnerability-advisory"],
      metricIds: ["dependency-inventory-complete"],
      suggestedGateId: "dependency-inventory",
    });
    const runtimeFinding = finding({
      profile,
      sensorId: "runtime-health",
      code: "PROJECT_HEALTH_RUNTIME_OWNER_LEAK",
      subjectRefs: ["gate:canonical"],
      evidenceClassIds: ["runtime-owner-count"],
      metricIds: ["runtime-owner-leak-count"],
      suggestedGateId: "canonical",
    });
    const baseline = aggregate({
      profile,
      mode: "nightly",
      observations: selectedObservations(profile, "nightly", {
        "supply-chain": observation({
          profile,
          sensorId: "supply-chain",
          findings: [advisory],
          metricsById: {
            "dependency-inventory-complete": { id: "dependency-inventory-complete", kind: "boolean", value: false },
          },
        }),
        "runtime-health": observation({
          profile,
          sensorId: "runtime-health",
          findings: [runtimeFinding],
          metricsById: {
            "runtime-owner-leak-count": { id: "runtime-owner-leak-count", kind: "count", valueCount: 2 },
            "runtime-determinism-mismatch-count": { id: "runtime-determinism-mismatch-count", kind: "count", valueCount: 1 },
          },
        }),
      }),
    });
    const current = aggregate({
      profile,
      mode: "nightly",
      baseline,
      observations: selectedObservations(profile, "nightly", {
        "runtime-health": observation({
          profile,
          sensorId: "runtime-health",
          findings: [runtimeFinding],
          metricsById: {
            "runtime-owner-leak-count": { id: "runtime-owner-leak-count", kind: "count", valueCount: 1 },
            "runtime-determinism-mismatch-count": { id: "runtime-determinism-mismatch-count", kind: "count", valueCount: 0 },
          },
        }),
        "documentation-truth": observation({
          profile,
          sensorId: "documentation-truth",
          findings: [finding({
            profile,
            sensorId: "documentation-truth",
            code: "PROJECT_HEALTH_DOCUMENTATION_TRUTH_CONFLICT",
            subjectRefs: ["path:README.md"],
            evidenceClassIds: ["documentation-claim"],
            metricIds: ["documentation-claims-current"],
            suggestedGateId: null,
          })],
        }),
      }),
    });
    expect(current.baselineComparisonStatus).toBe("compared");
    expect(current.changeByFingerprint?.[advisory.fingerprint]).toBe("resolved");
    expect(current.changeByFingerprint?.[runtimeFinding.fingerprint]).toBe("improved");
    const docFingerprint = current.findings.find((entry) => entry.sensorId === "documentation-truth")?.fingerprint;
    expect(current.changeByFingerprint?.[docFingerprint ?? ""]).toBe("new");

    const mixed = aggregate({
      profile,
      mode: "nightly",
      baseline,
      observations: selectedObservations(profile, "nightly", {
        "supply-chain": observation({
          profile,
          sensorId: "supply-chain",
          findings: [advisory],
        }),
        "runtime-health": observation({
          profile,
          sensorId: "runtime-health",
          findings: [runtimeFinding],
          metricsById: {
            "runtime-owner-leak-count": { id: "runtime-owner-leak-count", kind: "count", valueCount: 1 },
            "runtime-determinism-mismatch-count": { id: "runtime-determinism-mismatch-count", kind: "count", valueCount: 2 },
          },
        }),
      }),
    });
    expect(mixed.changeByFingerprint?.[runtimeFinding.fingerprint]).toBe("regressed");
    expect(mixed.changeByFingerprint?.[advisory.fingerprint]).toBe("improved");

    const mismatch = aggregate({
      profile,
      mode: "nightly",
      baseline,
      observations: selectedObservations(profile, "nightly", {
        "workspace-boundary": observation({
          profile,
          sensorId: "workspace-boundary",
          sensorImplementationHash: `sha256:${"e".repeat(64)}`,
        }),
      }),
    });
    expect(mismatch.baselineComparisonStatus).toBe("profile-mismatch");
    expect(mismatch.changeByFingerprint).toBeNull();
    expect(mismatch.status).toBe("incomplete");
  });

  it("rejects an unregistered suggested Gate and keeps Findings stably ordered", () => {
    const profile = parsedProfile();
    const legal = finding({
      profile,
      sensorId: "contract-parity",
      code: "PROJECT_HEALTH_DEPENDENCY_LOCK_DRIFT",
      subjectRefs: ["path:pnpm-lock.yaml"],
      evidenceClassIds: ["dependency-lock-parity"],
      metricIds: ["generated-bytes-current"],
      suggestedGateId: "typecheck",
    });
    const report = aggregate({
      profile,
      rawObservations: selectedObservations(profile, "pr", {
        "contract-parity": observation({
          profile,
          sensorId: "contract-parity",
          findings: [
            legal,
            {
              ...finding({
                profile,
                sensorId: "contract-parity",
                code: "PROJECT_HEALTH_GENERATED_DRIFT",
                subjectRefs: ["package:builder"],
                evidenceClassIds: ["generated-byte-parity"],
                metricIds: ["generated-bytes-current"],
                suggestedGateId: "agent-self-check",
              }),
              suggestedGateId: "not-a-registered-gate",
            },
          ],
        }),
      }),
    });
    expect(report.status).toBe("incomplete");
    expect(report.findings.map((entry) => entry.fingerprint)).toEqual(
      [...report.findings.map((entry) => entry.fingerprint)].sort(),
    );
  });

  it("drops Findings published by an invalid Observation", () => {
    const profile = parsedProfile();
    const blocking = finding({
      profile,
      sensorId: "contract-parity",
      code: "PROJECT_HEALTH_GENERATED_DRIFT",
      subjectRefs: ["package:builder"],
      evidenceClassIds: ["generated-byte-parity"],
      metricIds: ["generated-bytes-current"],
      suggestedGateId: "agent-self-check",
    });
    const report = aggregate({
      profile,
      observations: selectedObservations(profile, "pr", {
        "contract-parity": observation({
          profile,
          sensorId: "contract-parity",
          findings: [blocking],
          sensorImplementationHash: `sha256:${"e".repeat(64)}`,
        }),
      }),
    });
    expect(report.status).toBe("incomplete");
    expect(report.findings).toEqual([]);
    expect(report.metricsBySensorId["contract-parity"]?.["generated-bytes-current"]).toMatchObject({
      status: "not-evaluated",
    });
  });

  it("attributes duplicate Advisory input to that Sensor and rejects unattributable input", () => {
    const profile = parsedProfile();
    const advisoryObservation = observation({ profile, sensorId: "supply-chain" });
    const duplicateAdvisory = aggregate({
      profile,
      rawObservations: [
        ...selectedObservations(profile, "pr").filter((entry) => entry.sensorId !== "supply-chain"),
        advisoryObservation,
        advisoryObservation,
      ],
    });
    expect(duplicateAdvisory.status).toBe("passed");
    expect(duplicateAdvisory.metricsBySensorId["supply-chain"]?.["dependency-inventory-complete"]).toMatchObject({
      status: "not-evaluated",
    });
    expect(duplicateAdvisory.metricsBySensorId["workspace-boundary"]?.["workspace-boundary-debt-count"]).toEqual({
      id: "workspace-boundary-debt-count",
      kind: "count",
      valueCount: 49,
    });
    expect(() => aggregate({
      profile,
      rawObservations: [...selectedObservations(profile, "pr"), { kind: "unknown-input" }],
    })).toThrow(/attribute|sensor/i);
  });
});
