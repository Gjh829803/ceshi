import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil, sortBy, uniq } from "lodash-es";

import { parseRepositoryRelativePathV1 } from "../lib/workspace-boundary-contract";

export const PROJECT_HEALTH_SENSOR_IDS_V1 = Object.freeze([
  "workspace-boundary",
  "supplemental-authority",
  "contract-parity",
  "supply-chain",
  "test-topology",
  "runtime-health",
  "performance-size",
  "visual-evidence",
  "documentation-truth",
  "independent-review",
] as const);

export type ProjectHealthSensorIdV1 = typeof PROJECT_HEALTH_SENSOR_IDS_V1[number];
export type ProjectHealthModeV1 = "pr" | "nightly" | "release";
export type ProjectHealthPolicyV1 = "blocking-p0" | "blocking-p1" | "advisory-p2" | "advisory-p3";
export type ProjectHealthDimensionV1 = "D1" | "D2" | "D3" | "D4" | "D5" | "D6";
export type ProjectHealthEvidenceClassIdV1 =
  | "workspace-edge"
  | "supplemental-authority-rule"
  | "generated-byte-parity"
  | "dependency-lock-parity"
  | "dependency-provenance"
  | "license-policy"
  | "vulnerability-advisory"
  | "test-census"
  | "gate-receipt"
  | "runtime-owner-count"
  | "runtime-determinism"
  | "performance-budget"
  | "visual-golden"
  | "documentation-claim"
  | "independent-review";

export type ProjectHealthMetricV1 =
  | Readonly<{ id: string; kind: "boolean"; value: boolean }>
  | Readonly<{ id: string; kind: "count"; valueCount: number }>
  | Readonly<{ id: string; kind: "bytes"; valueBytes: number }>
  | Readonly<{ id: string; kind: "duration"; valueMilliseconds: number }>
  | Readonly<{ id: string; kind: "ratio"; valueRatio: number }>
  | Readonly<{
      id: string;
      kind: "boolean" | "count" | "bytes" | "duration" | "ratio";
      status: "not-evaluated" | "not-applicable";
      reasonCode: string;
    }>;

export interface ProjectHealthFindingV1 {
  readonly kind: "project-health-finding";
  readonly schemaVersion: 1;
  readonly fingerprint: string;
  readonly sensorId: ProjectHealthSensorIdV1;
  readonly policy: ProjectHealthPolicyV1;
  readonly dimension: ProjectHealthDimensionV1;
  readonly code: string;
  readonly ownerId: string;
  readonly subjectRefs: readonly string[];
  readonly evidenceClassIds: readonly ProjectHealthEvidenceClassIdV1[];
  readonly metricIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly expected: string;
  readonly impact: string;
  readonly suggestedGateId: string | null;
}

export interface ProjectHealthObservationV1 {
  readonly kind: "project-health-observation";
  readonly schemaVersion: 1;
  readonly sensorId: ProjectHealthSensorIdV1;
  readonly sensorImplementationHash: string;
  readonly inputFingerprint: string;
  readonly status: "passed" | "failed" | "incomplete" | "not-applicable";
  readonly metricsById: Readonly<Record<string, ProjectHealthMetricV1>>;
  readonly findings: readonly ProjectHealthFindingV1[];
  readonly evidenceRefs: readonly string[];
}

export type ProjectHealthMetricThresholdV1 =
  | Readonly<{ kind: "boolean"; expectedValue: boolean }>
  | Readonly<{ kind: "count"; maximumCount: number }>
  | Readonly<{ kind: "bytes"; maximumBytes: number }>
  | Readonly<{ kind: "duration"; maximumMilliseconds: number }>
  | Readonly<{ kind: "ratio"; maximumRatio: number }>;

export interface ProjectHealthInputSelectorV1 {
  readonly exactPaths: readonly string[];
  readonly pathPrefixes: readonly string[];
  readonly configPaths: readonly string[];
}

export interface ProjectHealthCapabilitySelectorV1 {
  readonly exactPaths: readonly string[];
  readonly pathPrefixes: readonly string[];
  readonly pathSuffixes: readonly string[];
  readonly packageIds: readonly string[];
}

export interface ProjectHealthRunnerProfileV1 {
  readonly id: string;
  readonly operatingSystem: "linux" | "macos";
  readonly architecture: "x64" | "arm64";
  readonly nodeVersion: string;
  readonly pnpmVersion: string;
  readonly browserProfileId: string | null;
  readonly hardwareProfileId: string | null;
}

export interface ProjectHealthProfileV1 {
  readonly kind: "project-health-profile";
  readonly schemaVersion: 1;
  readonly id: "worldkit-project-health";
  readonly sensorIds: readonly ProjectHealthSensorIdV1[];
  readonly modesById: Readonly<Record<ProjectHealthModeV1, Readonly<{
    readonly requiredSensorIds: readonly ProjectHealthSensorIdV1[];
    readonly advisorySensorIds: readonly ProjectHealthSensorIdV1[];
    readonly requiredGateIdsBySensorId: Readonly<Partial<Record<ProjectHealthSensorIdV1, readonly string[]>>>;
    readonly runnerProfileId: string;
    readonly maximumDurationMilliseconds: number;
  }>>>;
  readonly metricPoliciesById: Readonly<Record<string, Readonly<{
    readonly sensorId: ProjectHealthSensorIdV1;
    readonly kind: ProjectHealthMetricV1["kind"];
    readonly threshold: ProjectHealthMetricThresholdV1;
    readonly notApplicableReasonCodes: readonly string[];
  }>>>;
  readonly findingPoliciesByCode: Readonly<Record<string, Readonly<{
    readonly sensorId: ProjectHealthSensorIdV1;
    readonly policy: ProjectHealthPolicyV1;
  }>>>;
  readonly inputSelectorsBySensorId: Readonly<Record<ProjectHealthSensorIdV1, ProjectHealthInputSelectorV1>>;
  readonly capabilitySelectorsById: Readonly<Record<string, ProjectHealthCapabilitySelectorV1>>;
  readonly capabilityGateIdsById: Readonly<Record<string, readonly string[]>>;
  readonly runnerProfilesById: Readonly<Record<string, ProjectHealthRunnerProfileV1>>;
  readonly maximumAcceptedDebtCapsByKind: Readonly<{
    readonly count: number;
    readonly bytes: number;
    readonly durationMilliseconds: number;
    readonly ratio: number;
  }>;
  readonly artifactRetentionDays: number;
}

export interface ProjectHealthGateReceiptV1 {
  readonly kind: "project-health-gate-receipt";
  readonly schemaVersion: 1;
  readonly gateId: string;
  readonly commitSha: string;
  readonly inputFingerprint: string;
  readonly commandHash: string;
  readonly status: "passed" | "failed" | "incomplete";
  readonly evidenceRef: string;
}

export interface ProjectHealthDependencyInventoryEntryV1 {
  readonly id: string;
  readonly packageName: string;
  readonly version: string;
  readonly licenseSpdxExpression: string;
}

export interface ProjectHealthDependencyInventoryV1 {
  readonly kind: "project-health-dependency-inventory";
  readonly schemaVersion: 1;
  readonly commitSha: string;
  readonly packageManagerId: "pnpm@10.14.0";
  readonly commandHash: string;
  readonly inputFingerprint: string;
  readonly entries: readonly ProjectHealthDependencyInventoryEntryV1[];
}

export interface ProjectHealthGatePlanV1 {
  readonly kind: "project-health-gate-plan";
  readonly schemaVersion: 1;
  readonly commitSha: string;
  readonly baseSha: string | null;
  readonly requiredGateIds: readonly string[];
  readonly advisoryGateIds: readonly string[];
  readonly reasonsByGateId: Readonly<Record<string, readonly string[]>>;
  readonly inputFingerprintsByGateId: Readonly<Record<string, string>>;
}

export interface IndependentReviewReceiptV1 {
  readonly kind: "independent-review-receipt";
  readonly schemaVersion: 1;
  readonly commitSha: string;
  readonly reviewerId: string;
  readonly status: "completed" | "incomplete";
  readonly candidateFindings: readonly ProjectHealthFindingV1[];
  readonly dispositionsByFingerprint: Readonly<Record<string, "pending-host-review" | "host-confirmed" | "host-rejected">>;
  readonly evidenceRef: string;
}

export type ProjectHealthMetricCapV1 =
  | Readonly<{ kind: "boolean"; acceptedValue: boolean }>
  | Readonly<{ kind: "count"; maximumCount: number }>
  | Readonly<{ kind: "bytes"; maximumBytes: number }>
  | Readonly<{ kind: "duration"; maximumMilliseconds: number }>
  | Readonly<{ kind: "ratio"; maximumRatio: number }>;

export interface AcceptedProjectDebtV1 {
  readonly kind: "accepted-project-debt";
  readonly schemaVersion: 1;
  readonly fingerprint: string;
  readonly acceptedPolicy: "advisory-p2" | "advisory-p3";
  readonly metricCapsById: Readonly<Record<string, ProjectHealthMetricCapV1>>;
  readonly ownerId: string;
  readonly decisionRef: string;
  readonly reason: string;
  readonly expiresOn: string;
}

export interface AcceptedProjectDebtListV1 {
  readonly kind: "accepted-project-debt-list";
  readonly schemaVersion: 1;
  readonly entries: readonly AcceptedProjectDebtV1[];
}

export type ProjectHealthAuthoritySelectorV1 = ProjectHealthCapabilitySelectorV1;

export type ProjectHealthAuthoritySymbolMatchV1 = Readonly<{
  readonly selector: ProjectHealthAuthoritySelectorV1;
  readonly symbolNames: readonly string[];
}>;

export type ProjectHealthAuthorityRuleV1 =
  | Readonly<{
      readonly id: string;
      readonly kind: "forbidden-public-symbol";
      readonly ownerId: string;
      readonly code: string;
      readonly selector: ProjectHealthAuthoritySelectorV1;
      readonly symbolNames: readonly string[];
    }>
  | Readonly<{
      readonly id: string;
      readonly kind: "unique-public-symbol-owner";
      readonly ownerId: string;
      readonly code: string;
      readonly selector: ProjectHealthAuthoritySelectorV1;
      readonly symbolNames: readonly string[];
      readonly ownerPackageId: string;
    }>
  | Readonly<{
      readonly id: string;
      readonly kind: "forbidden-public-symbol-pair";
      readonly ownerId: string;
      readonly code: string;
      readonly left: ProjectHealthAuthoritySymbolMatchV1;
      readonly right: ProjectHealthAuthoritySymbolMatchV1;
    }>;

export interface ProjectHealthAuthorityPolicyV1 {
  readonly kind: "project-health-authority-policy";
  readonly schemaVersion: 1;
  readonly id: "worldkit-supplemental-authority";
  readonly rules: readonly ProjectHealthAuthorityRuleV1[];
  readonly exceptions: readonly Readonly<{
    readonly ruleId: string;
    readonly packageId: string;
    readonly sourcePath: string;
    readonly symbolName: string;
    readonly decisionRef: string;
  }>[];
}

export interface ProjectHealthSupplyChainPolicyV1 {
  readonly kind: "project-health-supply-chain-policy";
  readonly schemaVersion: 1;
  readonly id: "worldkit-supply-chain";
  readonly acceptedSourceIds: readonly string[];
  readonly acceptedLicenseSpdxExpressions: readonly string[];
  readonly advisoryProviderIds: readonly string[];
  readonly maximumAdvisorySnapshotAgeDays: number;
}

export interface ProjectHealthReportV1 {
  readonly kind: "project-health-report";
  readonly schemaVersion: 1;
  readonly mode: ProjectHealthModeV1;
  readonly commitSha: string;
  readonly baseSha: string | null;
  readonly evaluatedOn: string;
  readonly profileHash: string;
  readonly sensorImplementationHashesBySensorId: Readonly<Partial<Record<ProjectHealthSensorIdV1, string>>>;
  readonly observationHashesBySensorId: Readonly<Partial<Record<ProjectHealthSensorIdV1, string>>>;
  readonly metricsBySensorId: Readonly<Partial<Record<ProjectHealthSensorIdV1, Readonly<Record<string, ProjectHealthMetricV1>>>>>;
  readonly findings: readonly ProjectHealthFindingV1[];
  readonly debtStatesByFingerprint: Readonly<Record<string, "not-applicable" | "open-advisory" | "accepted-debt">>;
  readonly status: "passed" | "failed" | "incomplete";
  readonly baselineComparisonStatus: "not-requested" | "compared" | "profile-mismatch";
  readonly changeByFingerprint: Readonly<Record<string, "new" | "resolved" | "unchanged" | "improved" | "regressed">> | null;
}

export interface ProjectHealthProfileParseContextV1 {
  readonly repositoryPaths: readonly string[];
  readonly workspacePackageIds: readonly string[];
}

const HASH = /^sha256:[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CODE = /^[A-Z0-9_]+$/;
const SUBJECT_REF = /^(?:package|path|gate|capability):[^\s]+$/;
const NPM_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/;
const PUBLIC_SYMBOL_NAME = /^(?:[A-Za-z_$][A-Za-z0-9_$]*|default)$/;
const SELECTOR_GLOB_OR_REGEX = /[*?[\]()^$|\\]/;
const SENSOR_IDS = new Set<string>(PROJECT_HEALTH_SENSOR_IDS_V1);
const EVIDENCE_CLASS_IDS = new Set<ProjectHealthEvidenceClassIdV1>([
  "workspace-edge",
  "supplemental-authority-rule",
  "generated-byte-parity",
  "dependency-lock-parity",
  "dependency-provenance",
  "license-policy",
  "vulnerability-advisory",
  "test-census",
  "gate-receipt",
  "runtime-owner-count",
  "runtime-determinism",
  "performance-budget",
  "visual-golden",
  "documentation-claim",
  "independent-review",
]);
const POLICIES = new Set<ProjectHealthPolicyV1>([
  "blocking-p0",
  "blocking-p1",
  "advisory-p2",
  "advisory-p3",
]);

const FROZEN_CAPABILITY_GATE_IDS_BY_ID_V1 = Object.freeze({
  "workspace-graph": ["workspace-boundaries"],
  "agent-self-check-bundles": ["agent-self-check"],
  "typescript-public-contract": ["test-contract", "typecheck", "unreleased-clean-break"],
  "studio-surface": ["test-studio"],
  "independent-test-surface": ["test-independent"],
  "resource-heavy-runtime": ["test-resource-heavy"],
  "test-registration": ["test-census"],
  "playground-build-surface": ["playground-build"],
  "canonical-browser-runtime": ["canonical", "control-capture", "outdoor-gameplay", "validation-capture"],
  "placement-and-subject-runtime": ["g-bot-subject", "placement-layout", "rigged-subject"],
  "trusted-route-runtime": ["route-r0-contract", "route-r1-heightfield", "route-r1b-static-platform"],
  "native-scene-experimental": ["bna1-clean-break", "native-scene-playground"],
  "three-c-migration-experimental": ["3c-migration"],
  "documentation-only": [],
} as const);

const FROZEN_MODE_SENSOR_AND_GATE_CLOSURE_V1 = Object.freeze({
  pr: {
    requiredSensorIds: ["workspace-boundary", "supplemental-authority", "contract-parity", "test-topology"],
    advisorySensorIds: ["supply-chain", "documentation-truth"],
    requiredGateIdsBySensorId: {
      "workspace-boundary": ["workspace-boundaries"],
      "supplemental-authority": [],
      "contract-parity": ["agent-self-check", "playground-build", "tracked-tree-clean", "typecheck"],
      "test-topology": ["test-census", "test-contract", "test-independent", "test-resource-heavy", "test-studio"],
    },
  },
  nightly: {
    requiredSensorIds: ["workspace-boundary", "supplemental-authority", "contract-parity", "test-topology", "runtime-health"],
    advisorySensorIds: ["supply-chain", "performance-size", "visual-evidence", "documentation-truth", "independent-review"],
    requiredGateIdsBySensorId: {
      "workspace-boundary": ["workspace-boundaries"],
      "supplemental-authority": [],
      "contract-parity": ["agent-self-check", "playground-build", "tracked-tree-clean", "typecheck", "unreleased-clean-break"],
      "test-topology": ["test-census", "test-contract", "test-independent", "test-resource-heavy", "test-studio"],
      "runtime-health": [
        "canonical",
        "control-capture",
        "g-bot-subject",
        "outdoor-gameplay",
        "placement-layout",
        "rigged-subject",
        "route-r0-contract",
        "route-r1-heightfield",
        "route-r1b-static-platform",
        "validation-capture",
      ],
    },
  },
  release: {
    requiredSensorIds: [
      "workspace-boundary",
      "supplemental-authority",
      "contract-parity",
      "supply-chain",
      "test-topology",
      "runtime-health",
      "visual-evidence",
      "documentation-truth",
    ],
    advisorySensorIds: ["performance-size", "independent-review"],
    requiredGateIdsBySensorId: {
      "workspace-boundary": ["workspace-boundaries"],
      "supplemental-authority": [],
      "contract-parity": ["agent-self-check", "playground-build", "tracked-tree-clean", "typecheck", "unreleased-clean-break"],
      "supply-chain": ["dependency-inventory"],
      "test-topology": ["test-census", "test-contract", "test-independent", "test-resource-heavy", "test-studio"],
      "runtime-health": [
        "canonical",
        "control-capture",
        "g-bot-subject",
        "outdoor-gameplay",
        "placement-layout",
        "rigged-subject",
        "route-r0-contract",
        "route-r1-heightfield",
        "route-r1b-static-platform",
        "validation-capture",
      ],
      "visual-evidence": [],
      "documentation-truth": [],
    },
  },
} as const);

function invalid(contract: string, detail?: string): never {
  throw new TypeError(detail ?? `Value must match the closed ${contract} schema.`);
}

function record(input: unknown, fields: readonly string[], contract: string): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype
  ) return invalid(contract);
  const source = input as Record<string, unknown>;
  const keys = Object.keys(source);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(source, field)) ||
    keys.some((field) => !fields.includes(field))
  ) return invalid(contract);
  return source;
}

function nonEmptyString(input: unknown, contract: string): string {
  if (
    typeof input !== "string" ||
    isEmpty(input) ||
    input.trim() !== input ||
    input.normalize("NFC") !== input
  ) return invalid(contract);
  return input;
}

function stableText(input: unknown, contract: string): string {
  const value = nonEmptyString(input, contract);
  if (
    /(?:file:\/\/|(?:^|[\s"'(=])\/(?!\/)[^\s"'()]*|[A-Za-z]:\\)/i.test(value) ||
    /(?:api[_-]?key|token|secret)\s*[=:]|\b(?:crsr|sk)_[A-Za-z0-9]{16,}/i.test(value)
  ) return invalid(contract, "Stable Project Health text cannot contain machine paths or credentials.");
  return value;
}

function id(input: unknown, contract: string): string {
  const value = nonEmptyString(input, contract);
  if (!ID.test(value)) return invalid(contract);
  return value;
}

function code(input: unknown, contract: string): string {
  const value = nonEmptyString(input, contract);
  if (!CODE.test(value)) return invalid(contract);
  return value;
}

function hash(input: unknown, contract: string, detail?: string): string {
  if (typeof input !== "string" || !HASH.test(input)) return invalid(contract, detail);
  return input;
}

function commitSha(input: unknown, contract: string): string {
  if (typeof input !== "string" || !COMMIT_SHA.test(input)) return invalid(contract);
  return input;
}

function date(input: unknown, contract: string): string {
  const value = nonEmptyString(input, contract);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid(contract);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) return invalid(contract);
  return value;
}

function nonNegativeNumber(input: unknown, contract: string): number {
  if (
    typeof input !== "number" ||
    !Number.isFinite(input) ||
    Object.is(input, -0) ||
    input < 0
  ) return invalid(contract);
  return input;
}

function nonNegativeInteger(input: unknown, contract: string): number {
  const value = nonNegativeNumber(input, contract);
  if (!Number.isSafeInteger(value)) return invalid(contract);
  return value;
}

function array<T>(input: unknown, parse: (entry: unknown) => T, contract: string): readonly T[] {
  if (!Array.isArray(input)) return invalid(contract);
  return input.map(parse);
}

function uniqueStrings(
  input: unknown,
  parse: (entry: unknown) => string,
  contract: string,
): readonly string[] {
  const values = array(input, parse, contract);
  if (uniq(values).length !== values.length) return invalid(contract);
  return values;
}

function exactStringMap<T>(
  input: unknown,
  parse: (entry: unknown, key: string) => T,
  contract: string,
): Readonly<Record<string, T>> {
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype
  ) return invalid(contract);
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, parse(value, key)]));
}

function sensorId(input: unknown, contract: string): ProjectHealthSensorIdV1 {
  if (typeof input !== "string" || !SENSOR_IDS.has(input)) return invalid(contract);
  return input as ProjectHealthSensorIdV1;
}

function evidenceRef(input: unknown, contract: string): string {
  return hash(input, contract, "Project Health requires a stable evidence reference in sha256 form.");
}

function subjectRef(input: unknown, contract: string): string {
  const value = nonEmptyString(input, contract);
  if (!SUBJECT_REF.test(value)) return invalid(contract);
  const separator = value.indexOf(":");
  const prefix = value.slice(0, separator);
  const payload = value.slice(separator + 1);
  if (prefix === "path") parseRepositoryRelativePathV1(payload);
  else if (prefix === "gate" || prefix === "capability") id(payload, contract);
  else if (!/^(?:@[a-z0-9][a-z0-9.-]*\/)?[a-z0-9][a-z0-9.-]*$/.test(payload)) return invalid(contract);
  return value;
}

function pathSuffix(input: unknown, contract: string): string {
  const value = nonEmptyString(input, contract);
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").some((segment) => isEmpty(segment) || segment === "." || segment === "..")
  ) return invalid(contract, "Project Health selectors require a canonical path suffix.");
  return value;
}

export function parseProjectHealthMetricV1(input: unknown): ProjectHealthMetricV1 {
  const contract = "ProjectHealthMetricV1";
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) return invalid(contract);
  const source = input as Record<string, unknown>;
  const metricId = id(source.id, contract);
  const kind = source.kind;
  if (!["boolean", "count", "bytes", "duration", "ratio"].includes(String(kind))) return invalid(contract);
  if (Object.hasOwn(source, "status")) {
    const pending = record(source, ["id", "kind", "status", "reasonCode"], contract);
    if (pending.status !== "not-evaluated" && pending.status !== "not-applicable") return invalid(contract);
    return {
      id: metricId,
      kind: kind as ProjectHealthMetricV1["kind"],
      status: pending.status,
      reasonCode: code(pending.reasonCode, contract),
    };
  }
  if (kind === "boolean") {
    const value = record(source, ["id", "kind", "value"], contract);
    if (typeof value.value !== "boolean") return invalid(contract);
    return { id: metricId, kind, value: value.value };
  }
  const valueField = kind === "count"
    ? "valueCount"
    : kind === "bytes"
      ? "valueBytes"
      : kind === "duration"
        ? "valueMilliseconds"
        : "valueRatio";
  const value = record(source, ["id", "kind", valueField], contract)[valueField];
  if (kind === "ratio") {
    const ratio = nonNegativeNumber(value, contract);
    if (ratio > 1) return invalid(contract);
    return { id: metricId, kind, valueRatio: ratio };
  }
  const integer = nonNegativeInteger(value, contract);
  if (kind === "count") return { id: metricId, kind, valueCount: integer };
  if (kind === "bytes") return { id: metricId, kind, valueBytes: integer };
  return { id: metricId as string, kind: "duration", valueMilliseconds: integer };
}

function parseMetricMap(input: unknown, contract: string): Readonly<Record<string, ProjectHealthMetricV1>> {
  return exactStringMap(input, (entry, key) => {
    const metric = parseProjectHealthMetricV1(entry);
    if (metric.id !== key) return invalid(contract);
    return metric;
  }, contract);
}

export function projectHealthFindingFingerprintV1(input: Readonly<{
  sensorId: ProjectHealthSensorIdV1;
  code: string;
  subjectRefs: readonly string[];
  evidenceClassIds: readonly ProjectHealthEvidenceClassIdV1[];
}>): string {
  const contract = "ProjectHealthFindingFingerprintV1";
  return sha256CanonicalJson({
    sensorId: sensorId(input.sensorId, contract),
    code: code(input.code, contract),
    subjectRefs: sortBy(uniq(input.subjectRefs.map((entry) => subjectRef(entry, contract)))),
    evidenceClassIds: sortBy(uniq(input.evidenceClassIds.map((entry) => {
      if (!EVIDENCE_CLASS_IDS.has(entry)) return invalid(contract);
      return entry;
    }))),
  });
}

export function parseProjectHealthFindingV1(
  input: unknown,
  profile: ProjectHealthProfileV1,
): ProjectHealthFindingV1 {
  const contract = "ProjectHealthFindingV1";
  if (isNil(profile)) return invalid(contract, "Project Health Finding parsing requires the exact Profile.");
  const source = record(input, [
    "kind",
    "schemaVersion",
    "fingerprint",
    "sensorId",
    "policy",
    "dimension",
    "code",
    "ownerId",
    "subjectRefs",
    "evidenceClassIds",
    "metricIds",
    "evidenceRefs",
    "expected",
    "impact",
    "suggestedGateId",
  ], contract);
  if (source.kind !== "project-health-finding" || source.schemaVersion !== 1) return invalid(contract);
  const parsedSensorId = sensorId(source.sensorId, contract);
  const parsedCode = code(source.code, contract);
  const parsedSubjectRefs = uniqueStrings(source.subjectRefs, (entry) => subjectRef(entry, contract), contract);
  const evidenceClassIds = uniqueStrings(source.evidenceClassIds, (entry) => {
    if (typeof entry !== "string" || !EVIDENCE_CLASS_IDS.has(entry as ProjectHealthEvidenceClassIdV1)) {
      return invalid(contract);
    }
    return entry;
  }, contract) as readonly ProjectHealthEvidenceClassIdV1[];
  if (typeof source.policy !== "string" || !POLICIES.has(source.policy as ProjectHealthPolicyV1)) return invalid(contract);
  if (!["D1", "D2", "D3", "D4", "D5", "D6"].includes(String(source.dimension))) return invalid(contract);
  const fingerprint = hash(source.fingerprint, contract);
  if (fingerprint !== projectHealthFindingFingerprintV1({
    sensorId: parsedSensorId,
    code: parsedCode,
    subjectRefs: parsedSubjectRefs,
    evidenceClassIds,
  })) return invalid(contract);
  const profilePolicy = profile.findingPoliciesByCode[parsedCode];
  if (
    isNil(profilePolicy) ||
    profilePolicy.sensorId !== parsedSensorId ||
    profilePolicy.policy !== source.policy
  ) return invalid(contract, "Finding must use the exact Profile Finding policy.");
  return {
    kind: "project-health-finding",
    schemaVersion: 1,
    fingerprint,
    sensorId: parsedSensorId,
    policy: source.policy as ProjectHealthPolicyV1,
    dimension: source.dimension as ProjectHealthDimensionV1,
    code: parsedCode,
    ownerId: id(source.ownerId, contract),
    subjectRefs: sortBy(parsedSubjectRefs),
    evidenceClassIds: sortBy(evidenceClassIds),
    metricIds: sortBy(uniqueStrings(source.metricIds, (entry) => id(entry, contract), contract)),
    evidenceRefs: sortBy(uniqueStrings(source.evidenceRefs, (entry) => evidenceRef(entry, contract), contract)),
    expected: stableText(source.expected, contract),
    impact: stableText(source.impact, contract),
    suggestedGateId: isNil(source.suggestedGateId) ? null : id(source.suggestedGateId, contract),
  };
}

export function parseProjectHealthObservationV1(
  input: unknown,
  profile: ProjectHealthProfileV1,
): ProjectHealthObservationV1 {
  const contract = "ProjectHealthObservationV1";
  if (isNil(profile)) return invalid(contract, "Project Health Observation parsing requires the exact Profile.");
  const source = record(input, [
    "kind",
    "schemaVersion",
    "sensorId",
    "sensorImplementationHash",
    "inputFingerprint",
    "status",
    "metricsById",
    "findings",
    "evidenceRefs",
  ], contract);
  if (source.kind !== "project-health-observation" || source.schemaVersion !== 1) return invalid(contract);
  const parsedSensorId = sensorId(source.sensorId, contract);
  if (!["passed", "failed", "incomplete", "not-applicable"].includes(String(source.status))) return invalid(contract);
  const metricsById = parseMetricMap(source.metricsById, contract);
  const findings = array(source.findings, (entry) => parseProjectHealthFindingV1(entry, profile), contract);
  for (const finding of findings) {
    if (finding.sensorId !== parsedSensorId || finding.metricIds.some((metricId) => !Object.hasOwn(metricsById, metricId))) {
      return invalid(contract);
    }
  }
  const expectedMetricPolicies = Object.entries(profile.metricPoliciesById)
    .filter(([, policy]) => policy.sensorId === parsedSensorId);
  if (
    JSON.stringify(sortBy(Object.keys(metricsById))) !==
    JSON.stringify(sortBy(expectedMetricPolicies.map(([metricId]) => metricId)))
  ) return invalid(contract, "Observation Metrics must close over the exact Profile Sensor Metric set.");
  for (const [metricId, policy] of expectedMetricPolicies) {
    if (metricsById[metricId]?.kind !== policy.kind) return invalid(contract);
  }
  const metricStatuses = expectedMetricPolicies.map(([metricId, policy]) =>
    evaluateMetricStatus(metricsById[metricId]!, policy, contract));
  const derivedStatus: ProjectHealthObservationV1["status"] = metricStatuses.includes("incomplete")
    ? "incomplete"
    : metricStatuses.includes("failed") || findings.some((finding) =>
      finding.policy === "blocking-p0" || finding.policy === "blocking-p1")
      ? "failed"
      : metricStatuses.length > 0 && metricStatuses.every((status) => status === "not-applicable")
        ? "not-applicable"
        : "passed";
  if (source.status !== derivedStatus) {
    return invalid(contract, "Sensor status must equal the Profile-derived Observation status.");
  }
  return {
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: parsedSensorId,
    sensorImplementationHash: hash(source.sensorImplementationHash, contract),
    inputFingerprint: hash(source.inputFingerprint, contract),
    status: derivedStatus,
    metricsById,
    findings: sortBy(findings, ["fingerprint"]),
    evidenceRefs: sortBy(uniqueStrings(source.evidenceRefs, (entry) => evidenceRef(entry, contract), contract)),
  };
}

function evaluateMetricStatus(
  metric: ProjectHealthMetricV1,
  policy: ProjectHealthProfileV1["metricPoliciesById"][string],
  contract: string,
): "passed" | "failed" | "incomplete" | "not-applicable" {
  if ("status" in metric) {
    if (metric.status === "not-evaluated") return "incomplete";
    if (!policy.notApplicableReasonCodes.includes(metric.reasonCode)) {
      return invalid(contract, "Metric uses a not-applicable reason that is not allowed by the exact Profile.");
    }
    return "not-applicable";
  }
  const threshold = policy.threshold;
  if (metric.kind !== threshold.kind) return invalid(contract);
  if (threshold.kind === "boolean" && metric.kind === "boolean") {
    return metric.value === threshold.expectedValue ? "passed" : "failed";
  }
  if (threshold.kind === "count" && metric.kind === "count") {
    return metric.valueCount <= threshold.maximumCount ? "passed" : "failed";
  }
  if (threshold.kind === "bytes" && metric.kind === "bytes") {
    return metric.valueBytes <= threshold.maximumBytes ? "passed" : "failed";
  }
  if (threshold.kind === "duration" && metric.kind === "duration") {
    return metric.valueMilliseconds <= threshold.maximumMilliseconds ? "passed" : "failed";
  }
  if (threshold.kind === "ratio" && metric.kind === "ratio") {
    return metric.valueRatio <= threshold.maximumRatio ? "passed" : "failed";
  }
  return invalid(contract);
}

export function parseProjectHealthGateReceiptV1(input: unknown): ProjectHealthGateReceiptV1 {
  const contract = "ProjectHealthGateReceiptV1";
  const source = record(input, [
    "kind", "schemaVersion", "gateId", "commitSha", "inputFingerprint", "commandHash", "status", "evidenceRef",
  ], contract);
  if (
    source.kind !== "project-health-gate-receipt" ||
    source.schemaVersion !== 1 ||
    !["passed", "failed", "incomplete"].includes(String(source.status))
  ) return invalid(contract);
  return {
    kind: "project-health-gate-receipt",
    schemaVersion: 1,
    gateId: id(source.gateId, contract),
    commitSha: commitSha(source.commitSha, contract),
    inputFingerprint: hash(source.inputFingerprint, contract),
    commandHash: hash(source.commandHash, contract),
    status: source.status as ProjectHealthGateReceiptV1["status"],
    evidenceRef: evidenceRef(source.evidenceRef, contract),
  };
}

export function parseProjectHealthGatePlanV1(input: unknown): ProjectHealthGatePlanV1 {
  const contract = "ProjectHealthGatePlanV1";
  const source = record(input, [
    "kind", "schemaVersion", "commitSha", "baseSha", "requiredGateIds", "advisoryGateIds", "reasonsByGateId", "inputFingerprintsByGateId",
  ], contract);
  if (source.kind !== "project-health-gate-plan" || source.schemaVersion !== 1) return invalid(contract);
  const requiredGateIds = uniqueStrings(source.requiredGateIds, (entry) => id(entry, contract), contract);
  const advisoryGateIds = uniqueStrings(source.advisoryGateIds, (entry) => id(entry, contract), contract);
  if (requiredGateIds.some((gateId) => advisoryGateIds.includes(gateId))) {
    return invalid(contract, "Project Health required and advisory Gate sets must be disjoint.");
  }
  const allGateIds = sortBy([...requiredGateIds, ...advisoryGateIds]);
  const reasonsByGateId = exactStringMap(source.reasonsByGateId, (entry) =>
    sortBy(uniqueStrings(entry, (value) => code(value, contract), contract)), contract);
  const inputFingerprintsByGateId = exactStringMap(source.inputFingerprintsByGateId, (entry) =>
    hash(entry, contract), contract);
  if (
    JSON.stringify(sortBy(Object.keys(reasonsByGateId))) !== JSON.stringify(allGateIds) ||
    JSON.stringify(sortBy(Object.keys(inputFingerprintsByGateId))) !== JSON.stringify(allGateIds)
  ) return invalid(contract);
  return {
    kind: "project-health-gate-plan",
    schemaVersion: 1,
    commitSha: commitSha(source.commitSha, contract),
    baseSha: isNil(source.baseSha) ? null : commitSha(source.baseSha, contract),
    requiredGateIds: sortBy(requiredGateIds),
    advisoryGateIds: sortBy(advisoryGateIds),
    reasonsByGateId,
    inputFingerprintsByGateId,
  };
}

export function parseProjectHealthDependencyInventoryV1(input: unknown): ProjectHealthDependencyInventoryV1 {
  const contract = "ProjectHealthDependencyInventoryV1";
  const source = record(input, [
    "kind", "schemaVersion", "commitSha", "packageManagerId", "commandHash", "inputFingerprint", "entries",
  ], contract);
  if (
    source.kind !== "project-health-dependency-inventory" ||
    source.schemaVersion !== 1 ||
    source.packageManagerId !== "pnpm@10.14.0"
  ) return invalid(contract);
  const entries = array(source.entries, (entry) => {
    const item = record(entry, ["id", "packageName", "version", "licenseSpdxExpression"], contract);
    const packageName = nonEmptyString(item.packageName, contract);
    if (!NPM_PACKAGE_NAME.test(packageName)) return invalid(contract);
    const version = stableText(item.version, contract);
    const entryId = nonEmptyString(item.id, contract);
    if (entryId !== `${packageName}@${version}`) return invalid(contract);
    return {
      id: entryId,
      packageName,
      version,
      licenseSpdxExpression: stableText(item.licenseSpdxExpression, contract),
    };
  }, contract);
  const licenseByExactPackage = new Map<string, string>();
  for (const entry of entries) {
    const current = licenseByExactPackage.get(entry.id);
    if (!isNil(current) && current !== entry.licenseSpdxExpression) {
      return invalid(contract, "Dependency inventory contains a conflicting license for one exact dependency.");
    }
    licenseByExactPackage.set(entry.id, entry.licenseSpdxExpression);
  }
  return {
    kind: "project-health-dependency-inventory",
    schemaVersion: 1,
    commitSha: commitSha(source.commitSha, contract),
    packageManagerId: "pnpm@10.14.0",
    commandHash: hash(source.commandHash, contract),
    inputFingerprint: hash(source.inputFingerprint, contract),
    entries: sortBy(uniq(entries.map((entry) => JSON.stringify(entry))).map((entry) => JSON.parse(entry) as ProjectHealthDependencyInventoryEntryV1), ["packageName", "version", "licenseSpdxExpression"]),
  };
}

export function parseIndependentReviewReceiptV1(
  input: unknown,
  profile: ProjectHealthProfileV1,
): IndependentReviewReceiptV1 {
  const contract = "IndependentReviewReceiptV1";
  if (isNil(profile)) return invalid(contract, "Independent Review parsing requires the exact Profile.");
  const source = record(input, [
    "kind", "schemaVersion", "commitSha", "reviewerId", "status", "candidateFindings", "dispositionsByFingerprint", "evidenceRef",
  ], contract);
  if (
    source.kind !== "independent-review-receipt" ||
    source.schemaVersion !== 1 ||
    (source.status !== "completed" && source.status !== "incomplete")
  ) return invalid(contract);
  const candidateFindings = array(
    source.candidateFindings,
    (entry) => parseProjectHealthFindingV1(entry, profile),
    contract,
  );
  const dispositionsByFingerprint = exactStringMap(source.dispositionsByFingerprint, (entry) => {
    if (entry !== "pending-host-review" && entry !== "host-confirmed" && entry !== "host-rejected") return invalid(contract);
    return entry;
  }, contract);
  const candidateFingerprints = sortBy(candidateFindings.map((entry) => entry.fingerprint));
  if (JSON.stringify(sortBy(Object.keys(dispositionsByFingerprint))) !== JSON.stringify(candidateFingerprints)) {
    return invalid(contract, "Independent review disposition keys must close exactly over candidate findings.");
  }
  if (source.status === "completed" && Object.values(dispositionsByFingerprint).includes("pending-host-review")) {
    return invalid(contract, "Completed independent review cannot retain a pending disposition.");
  }
  return {
    kind: "independent-review-receipt",
    schemaVersion: 1,
    commitSha: commitSha(source.commitSha, contract),
    reviewerId: id(source.reviewerId, contract),
    status: source.status,
    candidateFindings: sortBy(candidateFindings, ["fingerprint"]),
    dispositionsByFingerprint,
    evidenceRef: evidenceRef(source.evidenceRef, contract),
  };
}

function parseMetricCap(input: unknown): ProjectHealthMetricCapV1 {
  const contract = "ProjectHealthMetricCapV1";
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) return invalid(contract);
  const source = input as Record<string, unknown>;
  if (source.kind === "boolean") {
    const value = record(source, ["kind", "acceptedValue"], contract);
    if (typeof value.acceptedValue !== "boolean") return invalid(contract);
    return { kind: "boolean", acceptedValue: value.acceptedValue };
  }
  const field = source.kind === "count"
    ? "maximumCount"
    : source.kind === "bytes"
      ? "maximumBytes"
      : source.kind === "duration"
        ? "maximumMilliseconds"
        : source.kind === "ratio"
          ? "maximumRatio"
          : null;
  if (isNil(field)) return invalid(contract);
  const raw = record(source, ["kind", field], contract)[field];
  if (source.kind === "ratio") {
    const value = nonNegativeNumber(raw, contract);
    if (value > 1) return invalid(contract, "Project Health ratio caps must be between 0 and 1.");
    return { kind: "ratio", maximumRatio: value };
  }
  const value = nonNegativeInteger(raw, contract);
  if (source.kind === "count") return { kind: "count", maximumCount: value };
  if (source.kind === "bytes") return { kind: "bytes", maximumBytes: value };
  return { kind: "duration", maximumMilliseconds: value };
}

export function parseAcceptedProjectDebtV1(
  input: unknown,
  profile: ProjectHealthProfileV1,
): AcceptedProjectDebtV1 {
  const contract = "AcceptedProjectDebtV1";
  if (isNil(profile)) return invalid(contract, "Accepted Project Debt parsing requires the exact Profile.");
  const source = record(input, [
    "kind", "schemaVersion", "fingerprint", "acceptedPolicy", "metricCapsById", "ownerId", "decisionRef", "reason", "expiresOn",
  ], contract);
  if (source.kind !== "accepted-project-debt" || source.schemaVersion !== 1) return invalid(contract);
  if (source.acceptedPolicy !== "advisory-p2" && source.acceptedPolicy !== "advisory-p3") {
    return invalid(contract, "Project Health accepts advisory debt only; blocking debt is forbidden.");
  }
  const metricCapsById = exactStringMap(source.metricCapsById, (entry, key) => {
    id(key, contract);
    return parseMetricCap(entry);
  }, contract);
  if (isEmpty(metricCapsById)) return invalid(contract);
  for (const [metricId, cap] of Object.entries(metricCapsById)) {
    const metricPolicy = profile.metricPoliciesById[metricId];
    if (isNil(metricPolicy) || metricPolicy.kind !== cap.kind) {
      return invalid(contract, "Accepted debt Metric kind must match the exact Profile Metric kind.");
    }
    const exceedsProfileMaximum = cap.kind === "count"
      ? cap.maximumCount > profile.maximumAcceptedDebtCapsByKind.count
      : cap.kind === "bytes"
        ? cap.maximumBytes > profile.maximumAcceptedDebtCapsByKind.bytes
        : cap.kind === "duration"
          ? cap.maximumMilliseconds > profile.maximumAcceptedDebtCapsByKind.durationMilliseconds
          : cap.kind === "ratio"
            ? cap.maximumRatio > profile.maximumAcceptedDebtCapsByKind.ratio
            : false;
    if (exceedsProfileMaximum) {
      return invalid(contract, "Accepted debt Metric cap exceeds the exact Profile maximum.");
    }
  }
  return {
    kind: "accepted-project-debt",
    schemaVersion: 1,
    fingerprint: hash(source.fingerprint, contract),
    acceptedPolicy: source.acceptedPolicy,
    metricCapsById,
    ownerId: id(source.ownerId, contract),
    decisionRef: parseRepositoryRelativePathV1(source.decisionRef),
    reason: stableText(source.reason, contract),
    expiresOn: date(source.expiresOn, contract),
  };
}

export function parseAcceptedProjectDebtListV1(
  input: unknown,
  profile: ProjectHealthProfileV1,
): AcceptedProjectDebtListV1 {
  const contract = "AcceptedProjectDebtListV1";
  if (isNil(profile)) return invalid(contract, "Accepted Project Debt parsing requires the exact Profile.");
  const source = record(input, ["kind", "schemaVersion", "entries"], contract);
  if (source.kind !== "accepted-project-debt-list" || source.schemaVersion !== 1) return invalid(contract);
  const entries = array(source.entries, (entry) => parseAcceptedProjectDebtV1(entry, profile), contract);
  const fingerprints = entries.map((entry) => entry.fingerprint);
  if (uniq(fingerprints).length !== fingerprints.length) return invalid(contract);
  return { kind: "accepted-project-debt-list", schemaVersion: 1, entries: sortBy(entries, ["fingerprint"]) };
}

function parseAuthoritySelector(input: unknown, contract: string): ProjectHealthAuthoritySelectorV1 {
  const selector = parseSelector(input, true, contract) as ProjectHealthAuthoritySelectorV1;
  const values = [
    ...selector.exactPaths,
    ...selector.pathPrefixes,
    ...selector.pathSuffixes,
    ...selector.packageIds,
  ];
  if (values.some((value) => SELECTOR_GLOB_OR_REGEX.test(value))) return invalid(contract);
  if (
    isEmpty(selector.exactPaths) &&
    isEmpty(selector.pathPrefixes) &&
    isEmpty(selector.pathSuffixes) &&
    isEmpty(selector.packageIds)
  ) return invalid(contract);
  return selector;
}

function parseSymbolNames(input: unknown, contract: string): readonly string[] {
  const names = sortBy(uniqueStrings(input, (entry) => {
    const value = nonEmptyString(entry, contract);
    if (!PUBLIC_SYMBOL_NAME.test(value) || SELECTOR_GLOB_OR_REGEX.test(value)) return invalid(contract);
    return value;
  }, contract));
  if (isEmpty(names)) return invalid(contract);
  return names;
}

function parseAuthoritySymbolMatch(input: unknown, contract: string): ProjectHealthAuthoritySymbolMatchV1 {
  const source = record(input, ["selector", "symbolNames"], contract);
  return {
    selector: parseAuthoritySelector(source.selector, contract),
    symbolNames: parseSymbolNames(source.symbolNames, contract),
  };
}

function npmPackageId(input: unknown, contract: string): string {
  const value = nonEmptyString(input, contract);
  if (!NPM_PACKAGE_NAME.test(value) || SELECTOR_GLOB_OR_REGEX.test(value)) return invalid(contract);
  return value;
}

function parseAuthorityFindingCode(
  input: unknown,
  profile: ProjectHealthProfileV1,
  contract: string,
): string {
  const ruleCode = code(input, contract);
  const policy = profile.findingPoliciesByCode[ruleCode];
  if (isNil(policy) || policy.sensorId !== "supplemental-authority") return invalid(contract);
  return ruleCode;
}

function parseAuthorityRule(
  input: unknown,
  profile: ProjectHealthProfileV1,
  contract: string,
): ProjectHealthAuthorityRuleV1 {
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype
  ) return invalid(contract);
  const kind = (input as { readonly kind?: unknown }).kind;
  if (kind === "forbidden-public-symbol") {
    const rule = record(input, ["id", "kind", "ownerId", "code", "selector", "symbolNames"], contract);
    return {
      id: id(rule.id, contract),
      kind: "forbidden-public-symbol",
      ownerId: id(rule.ownerId, contract),
      code: parseAuthorityFindingCode(rule.code, profile, contract),
      selector: parseAuthoritySelector(rule.selector, contract),
      symbolNames: parseSymbolNames(rule.symbolNames, contract),
    };
  }
  if (kind === "unique-public-symbol-owner") {
    const rule = record(input, [
      "id",
      "kind",
      "ownerId",
      "code",
      "selector",
      "symbolNames",
      "ownerPackageId",
    ], contract);
    const selector = parseAuthoritySelector(rule.selector, contract);
    const ownerPackageId = npmPackageId(rule.ownerPackageId, contract);
    if (!isEmpty(selector.packageIds) && !selector.packageIds.includes(ownerPackageId)) {
      return invalid(contract);
    }
    return {
      id: id(rule.id, contract),
      kind: "unique-public-symbol-owner",
      ownerId: id(rule.ownerId, contract),
      code: parseAuthorityFindingCode(rule.code, profile, contract),
      selector,
      symbolNames: parseSymbolNames(rule.symbolNames, contract),
      ownerPackageId,
    };
  }
  if (kind === "forbidden-public-symbol-pair") {
    const rule = record(input, ["id", "kind", "ownerId", "code", "left", "right"], contract);
    return {
      id: id(rule.id, contract),
      kind: "forbidden-public-symbol-pair",
      ownerId: id(rule.ownerId, contract),
      code: parseAuthorityFindingCode(rule.code, profile, contract),
      left: parseAuthoritySymbolMatch(rule.left, contract),
      right: parseAuthoritySymbolMatch(rule.right, contract),
    };
  }
  return invalid(contract);
}

export function parseProjectHealthAuthorityPolicyV1(
  input: unknown,
  profile: ProjectHealthProfileV1,
): ProjectHealthAuthorityPolicyV1 {
  const contract = "ProjectHealthAuthorityPolicyV1";
  if (isNil(profile)) return invalid(contract, "Authority Policy parsing requires the exact Profile.");
  const source = record(input, ["kind", "schemaVersion", "id", "rules", "exceptions"], contract);
  if (
    source.kind !== "project-health-authority-policy" ||
    source.schemaVersion !== 1 ||
    source.id !== "worldkit-supplemental-authority"
  ) return invalid(contract);
  const rules = array(source.rules, (entry) => parseAuthorityRule(entry, profile, contract), contract);
  const ruleIds = rules.map((rule) => rule.id);
  if (uniq(ruleIds).length !== ruleIds.length) return invalid(contract);
  const exceptions = array(source.exceptions, (entry) => {
    const exception = record(entry, ["ruleId", "packageId", "sourcePath", "symbolName", "decisionRef"], contract);
    const ruleId = id(exception.ruleId, contract);
    if (!ruleIds.includes(ruleId)) return invalid(contract);
    const symbolName = nonEmptyString(exception.symbolName, contract);
    if (!PUBLIC_SYMBOL_NAME.test(symbolName) || SELECTOR_GLOB_OR_REGEX.test(symbolName)) return invalid(contract);
    return {
      ruleId,
      packageId: npmPackageId(exception.packageId, contract),
      sourcePath: parseRepositoryRelativePathV1(exception.sourcePath),
      symbolName,
      decisionRef: parseRepositoryRelativePathV1(exception.decisionRef),
    };
  }, contract);
  const exceptionKeys = exceptions.map((entry) =>
    `${entry.ruleId}\0${entry.packageId}\0${entry.sourcePath}\0${entry.symbolName}`,
  );
  if (uniq(exceptionKeys).length !== exceptionKeys.length) return invalid(contract);
  return {
    kind: "project-health-authority-policy",
    schemaVersion: 1,
    id: "worldkit-supplemental-authority",
    rules: sortBy(rules, ["id"]),
    exceptions: sortBy(exceptions, ["ruleId", "packageId", "sourcePath", "symbolName"]),
  };
}

export function parseProjectHealthSupplyChainPolicyV1(
  input: unknown,
): ProjectHealthSupplyChainPolicyV1 {
  const contract = "ProjectHealthSupplyChainPolicyV1";
  const source = record(input, [
    "kind",
    "schemaVersion",
    "id",
    "acceptedSourceIds",
    "acceptedLicenseSpdxExpressions",
    "advisoryProviderIds",
    "maximumAdvisorySnapshotAgeDays",
  ], contract);
  if (
    source.kind !== "project-health-supply-chain-policy" ||
    source.schemaVersion !== 1 ||
    source.id !== "worldkit-supply-chain"
  ) return invalid(contract);
  const acceptedSourceIds = uniqueStrings(source.acceptedSourceIds, (entry) => id(entry, contract), contract);
  const acceptedLicenseSpdxExpressions = uniqueStrings(
    source.acceptedLicenseSpdxExpressions,
    (entry) => nonEmptyString(entry, contract),
    contract,
  );
  const advisoryProviderIds = uniqueStrings(source.advisoryProviderIds, (entry) => id(entry, contract), contract);
  if (isEmpty(acceptedSourceIds) || isEmpty(acceptedLicenseSpdxExpressions) || isEmpty(advisoryProviderIds)) {
    return invalid(contract);
  }
  return {
    kind: "project-health-supply-chain-policy",
    schemaVersion: 1,
    id: "worldkit-supply-chain",
    acceptedSourceIds: sortBy(acceptedSourceIds),
    acceptedLicenseSpdxExpressions: sortBy(acceptedLicenseSpdxExpressions),
    advisoryProviderIds: sortBy(advisoryProviderIds),
    maximumAdvisorySnapshotAgeDays: nonNegativeInteger(source.maximumAdvisorySnapshotAgeDays, contract),
  };
}

function parseStringArrayMap(input: unknown, contract: string): Readonly<Record<string, readonly string[]>> {
  return exactStringMap(input, (entry) =>
    sortBy(uniqueStrings(entry, (value) => id(value, contract), contract)), contract);
}

function parseSelector(
  input: unknown,
  capability: boolean,
  contract: string,
): ProjectHealthInputSelectorV1 | ProjectHealthCapabilitySelectorV1 {
  const fields = capability
    ? ["exactPaths", "pathPrefixes", "pathSuffixes", "packageIds"]
    : ["exactPaths", "pathPrefixes", "configPaths"];
  const source = record(input, fields, contract);
  const pathList = (value: unknown) =>
    sortBy(uniqueStrings(value, (entry) => parseRepositoryRelativePathV1(entry), contract));
  if (capability) {
    return {
      exactPaths: pathList(source.exactPaths),
      pathPrefixes: pathList(source.pathPrefixes),
      pathSuffixes: sortBy(uniqueStrings(source.pathSuffixes, (entry) => pathSuffix(entry, contract), contract)),
      packageIds: sortBy(uniqueStrings(source.packageIds, (entry) => nonEmptyString(entry, contract), contract)),
    };
  }
  return {
    exactPaths: pathList(source.exactPaths),
    pathPrefixes: pathList(source.pathPrefixes),
    configPaths: pathList(source.configPaths),
  };
}

function selectorEntryMatches(
  selector: ProjectHealthCapabilitySelectorV1,
  context: ProjectHealthProfileParseContextV1,
): boolean {
  const paths = context.repositoryPaths;
  return selector.exactPaths.every((entry) => paths.includes(entry)) &&
    selector.pathPrefixes.every((entry) => paths.some((path) => path === entry || path.startsWith(`${entry}/`))) &&
    selector.pathSuffixes.every((entry) => paths.some((path) => path.endsWith(entry))) &&
    selector.packageIds.every((entry) => context.workspacePackageIds.includes(entry));
}

export function parseProjectHealthProfileV1(
  input: unknown,
  context: ProjectHealthProfileParseContextV1,
): ProjectHealthProfileV1 {
  const contract = "ProjectHealthProfileV1";
  if (isNil(context)) return invalid(contract, "Project Health Profile parsing requires exact tree context.");
  const source = record(input, [
    "kind", "schemaVersion", "id", "sensorIds", "modesById", "metricPoliciesById", "findingPoliciesByCode",
    "inputSelectorsBySensorId", "capabilitySelectorsById", "capabilityGateIdsById", "runnerProfilesById",
    "maximumAcceptedDebtCapsByKind", "artifactRetentionDays",
  ], contract);
  if (source.kind !== "project-health-profile" || source.schemaVersion !== 1 || source.id !== "worldkit-project-health") {
    return invalid(contract);
  }
  const parsedSensorIds = uniqueStrings(source.sensorIds, (entry) => sensorId(entry, contract), contract) as readonly ProjectHealthSensorIdV1[];
  if (JSON.stringify(parsedSensorIds) !== JSON.stringify(PROJECT_HEALTH_SENSOR_IDS_V1)) return invalid(contract);
  const modesSource = record(source.modesById, ["pr", "nightly", "release"], contract);
  const modesById = Object.fromEntries((["pr", "nightly", "release"] as const).map((mode) => {
    const value = record(modesSource[mode], [
      "requiredSensorIds", "advisorySensorIds", "requiredGateIdsBySensorId", "runnerProfileId", "maximumDurationMilliseconds",
    ], contract);
    const requiredSensorIds = uniqueStrings(value.requiredSensorIds, (entry) => sensorId(entry, contract), contract) as readonly ProjectHealthSensorIdV1[];
    const advisorySensorIds = uniqueStrings(value.advisorySensorIds, (entry) => sensorId(entry, contract), contract) as readonly ProjectHealthSensorIdV1[];
    if (requiredSensorIds.some((entry) => advisorySensorIds.includes(entry))) return invalid(contract);
    const requiredGateIdsBySensorId = parseStringArrayMap(value.requiredGateIdsBySensorId, contract);
    if (Object.keys(requiredGateIdsBySensorId).some((entry) => !requiredSensorIds.includes(entry as ProjectHealthSensorIdV1))) {
      return invalid(contract);
    }
    return [mode, {
      requiredSensorIds,
      advisorySensorIds,
      requiredGateIdsBySensorId,
      runnerProfileId: id(value.runnerProfileId, contract),
      maximumDurationMilliseconds: nonNegativeInteger(value.maximumDurationMilliseconds, contract),
    }];
  })) as unknown as ProjectHealthProfileV1["modesById"];
  const parsedModeClosure = Object.fromEntries((["pr", "nightly", "release"] as const).map((mode) => [mode, {
    requiredSensorIds: modesById[mode].requiredSensorIds,
    advisorySensorIds: modesById[mode].advisorySensorIds,
    requiredGateIdsBySensorId: modesById[mode].requiredGateIdsBySensorId,
  }]));
  if (
    sha256CanonicalJson(parsedModeClosure) !==
    sha256CanonicalJson(FROZEN_MODE_SENSOR_AND_GATE_CLOSURE_V1)
  ) return invalid(contract, "Project Health mode Sensor closure differs from the frozen design.");
  const metricPoliciesById = exactStringMap(source.metricPoliciesById, (entry, key) => {
    id(key, contract);
    const value = record(entry, ["sensorId", "kind", "threshold", "notApplicableReasonCodes"], contract);
    const kind = value.kind;
    if (!["boolean", "count", "bytes", "duration", "ratio"].includes(String(kind))) return invalid(contract);
    const threshold = parseMetricThreshold(value.threshold, kind as ProjectHealthMetricV1["kind"], contract);
    return {
      sensorId: sensorId(value.sensorId, contract),
      kind: kind as ProjectHealthMetricV1["kind"],
      threshold,
      notApplicableReasonCodes: sortBy(uniqueStrings(
        value.notApplicableReasonCodes,
        (reason) => code(reason, contract),
        contract,
      )),
    };
  }, contract);
  const findingPoliciesByCode = exactStringMap(source.findingPoliciesByCode, (entry, key) => {
    code(key, contract);
    const value = record(entry, ["sensorId", "policy"], contract);
    if (typeof value.policy !== "string" || !POLICIES.has(value.policy as ProjectHealthPolicyV1)) return invalid(contract);
    return { sensorId: sensorId(value.sensorId, contract), policy: value.policy as ProjectHealthPolicyV1 };
  }, contract);
  const inputSelectorsBySensorId = exactStringMap(source.inputSelectorsBySensorId, (entry, key) => {
    sensorId(key, contract);
    return parseSelector(entry, false, contract) as ProjectHealthInputSelectorV1;
  }, contract) as Readonly<Record<ProjectHealthSensorIdV1, ProjectHealthInputSelectorV1>>;
  if (JSON.stringify(sortBy(Object.keys(inputSelectorsBySensorId))) !== JSON.stringify(sortBy(PROJECT_HEALTH_SENSOR_IDS_V1))) {
    return invalid(contract);
  }
  const capabilitySelectorsById = exactStringMap(source.capabilitySelectorsById, (entry, key) => {
    id(key, contract);
    const selector = parseSelector(entry, true, contract) as ProjectHealthCapabilitySelectorV1;
    if (isEmpty(selector.exactPaths) && isEmpty(selector.pathPrefixes) && isEmpty(selector.pathSuffixes) && isEmpty(selector.packageIds)) {
      return invalid(contract, "PROJECT_HEALTH_CAPABILITY_SELECTOR_EMPTY");
    }
    if (!selectorEntryMatches(selector, context)) {
      return invalid(contract, "PROJECT_HEALTH_CAPABILITY_SELECTOR_EMPTY");
    }
    return selector;
  }, contract);
  const capabilityGateIdsById = parseStringArrayMap(source.capabilityGateIdsById, contract);
  if (JSON.stringify(sortBy(Object.keys(capabilitySelectorsById))) !== JSON.stringify(sortBy(Object.keys(capabilityGateIdsById)))) {
    return invalid(contract);
  }
  if (
    sha256CanonicalJson(capabilityGateIdsById) !==
    sha256CanonicalJson(FROZEN_CAPABILITY_GATE_IDS_BY_ID_V1)
  ) return invalid(contract, "Project Health capability Gate closure differs from the frozen design.");
  const runnerProfilesById = exactStringMap(source.runnerProfilesById, (entry, key) => {
    id(key, contract);
    const value = record(entry, [
      "id", "operatingSystem", "architecture", "nodeVersion", "pnpmVersion", "browserProfileId", "hardwareProfileId",
    ], contract);
    if (value.id !== key || (value.operatingSystem !== "linux" && value.operatingSystem !== "macos") ||
      (value.architecture !== "x64" && value.architecture !== "arm64")) return invalid(contract);
    return {
      id: key,
      operatingSystem: value.operatingSystem as "linux" | "macos",
      architecture: value.architecture as "x64" | "arm64",
      nodeVersion: nonEmptyString(value.nodeVersion, contract),
      pnpmVersion: nonEmptyString(value.pnpmVersion, contract),
      browserProfileId: isNil(value.browserProfileId) ? null : id(value.browserProfileId, contract),
      hardwareProfileId: isNil(value.hardwareProfileId) ? null : id(value.hardwareProfileId, contract),
    };
  }, contract);
  for (const mode of Object.values(modesById)) {
    if (!Object.hasOwn(runnerProfilesById, mode.runnerProfileId)) return invalid(contract);
  }
  const caps = record(source.maximumAcceptedDebtCapsByKind, ["count", "bytes", "durationMilliseconds", "ratio"], contract);
  const ratio = nonNegativeNumber(caps.ratio, contract);
  if (ratio > 1) return invalid(contract);
  return {
    kind: "project-health-profile",
    schemaVersion: 1,
    id: "worldkit-project-health",
    sensorIds: parsedSensorIds,
    modesById,
    metricPoliciesById,
    findingPoliciesByCode,
    inputSelectorsBySensorId,
    capabilitySelectorsById,
    capabilityGateIdsById,
    runnerProfilesById,
    maximumAcceptedDebtCapsByKind: {
      count: nonNegativeInteger(caps.count, contract),
      bytes: nonNegativeInteger(caps.bytes, contract),
      durationMilliseconds: nonNegativeInteger(caps.durationMilliseconds, contract),
      ratio,
    },
    artifactRetentionDays: nonNegativeInteger(source.artifactRetentionDays, contract),
  };
}

function parseMetricThreshold(
  input: unknown,
  expectedKind: ProjectHealthMetricV1["kind"],
  contract: string,
): ProjectHealthMetricThresholdV1 {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) return invalid(contract);
  const source = input as Record<string, unknown>;
  if (source.kind !== expectedKind) return invalid(contract);
  if (expectedKind === "boolean") {
    const value = record(source, ["kind", "expectedValue"], contract);
    if (typeof value.expectedValue !== "boolean") return invalid(contract);
    return { kind: "boolean", expectedValue: value.expectedValue };
  }
  const field = expectedKind === "count"
    ? "maximumCount"
    : expectedKind === "bytes"
      ? "maximumBytes"
      : expectedKind === "duration"
        ? "maximumMilliseconds"
        : "maximumRatio";
  const raw = record(source, ["kind", field], contract)[field];
  if (expectedKind === "ratio") {
    const value = nonNegativeNumber(raw, contract);
    if (value > 1) return invalid(contract);
    return { kind: "ratio", maximumRatio: value };
  }
  const value = nonNegativeInteger(raw, contract);
  if (expectedKind === "count") return { kind: "count", maximumCount: value };
  if (expectedKind === "bytes") return { kind: "bytes", maximumBytes: value };
  return { kind: "duration", maximumMilliseconds: value };
}

export function parseProjectHealthReportV1(
  input: unknown,
  profile: ProjectHealthProfileV1,
): ProjectHealthReportV1 {
  const contract = "ProjectHealthReportV1";
  if (isNil(profile)) return invalid(contract, "Project Health Report parsing requires the exact Profile.");
  const source = record(input, [
    "kind", "schemaVersion", "mode", "commitSha", "baseSha", "evaluatedOn", "profileHash",
    "sensorImplementationHashesBySensorId", "observationHashesBySensorId", "metricsBySensorId", "findings",
    "debtStatesByFingerprint", "status", "baselineComparisonStatus", "changeByFingerprint",
  ], contract);
  if (
    source.kind !== "project-health-report" ||
    source.schemaVersion !== 1 ||
    !["pr", "nightly", "release"].includes(String(source.mode)) ||
    !["passed", "failed", "incomplete"].includes(String(source.status)) ||
    !["not-requested", "compared", "profile-mismatch"].includes(String(source.baselineComparisonStatus))
  ) return invalid(contract);
  const hashMap = (value: unknown) => exactStringMap(value, (entry, key) => {
    sensorId(key, contract);
    return hash(entry, contract);
  }, contract) as Readonly<Partial<Record<ProjectHealthSensorIdV1, string>>>;
  const sensorImplementationHashesBySensorId = hashMap(source.sensorImplementationHashesBySensorId);
  const observationHashesBySensorId = hashMap(source.observationHashesBySensorId);
  const metricsBySensorId = exactStringMap(source.metricsBySensorId, (entry, key) => {
    sensorId(key, contract);
    return parseMetricMap(entry, contract);
  }, contract) as Readonly<Partial<Record<ProjectHealthSensorIdV1, Readonly<Record<string, ProjectHealthMetricV1>>>>>;
  const findings = array(source.findings, (entry) => parseProjectHealthFindingV1(entry, profile), contract);
  const debtStatesByFingerprint = exactStringMap(source.debtStatesByFingerprint, (entry, key) => {
    hash(key, contract);
    if (entry !== "not-applicable" && entry !== "open-advisory" && entry !== "accepted-debt") return invalid(contract);
    return entry;
  }, contract);
  const findingKeys = sortBy(findings.map((entry) => entry.fingerprint));
  if (JSON.stringify(sortBy(Object.keys(debtStatesByFingerprint))) !== JSON.stringify(findingKeys)) return invalid(contract);
  for (const finding of findings) {
    const metricMap = metricsBySensorId[finding.sensorId];
    if (isNil(metricMap) || finding.metricIds.some((metricId) => !Object.hasOwn(metricMap, metricId))) return invalid(contract);
  }
  const keySets = [
    sortBy(Object.keys(sensorImplementationHashesBySensorId)),
    sortBy(Object.keys(observationHashesBySensorId)),
    sortBy(Object.keys(metricsBySensorId)),
  ];
  if (keySets.some((keys) => JSON.stringify(keys) !== JSON.stringify(keySets[0]))) {
    return invalid(
      contract,
      "Report maps must close over the exact selected Sensor closure.",
    );
  }
  if (hash(source.profileHash, contract) !== sha256CanonicalJson(profile)) return invalid(contract);
  const mode = source.mode as ProjectHealthModeV1;
  const selectedSensorIds = sortBy([
    ...profile.modesById[mode].requiredSensorIds,
    ...profile.modesById[mode].advisorySensorIds,
  ]);
  if (JSON.stringify(keySets[0]) !== JSON.stringify(selectedSensorIds)) {
    return invalid(contract, "Report maps must close over the exact selected Sensor closure.");
  }
  const requiredSensorIds = new Set<ProjectHealthSensorIdV1>(profile.modesById[mode].requiredSensorIds);
  const requiredMetricStatuses: Array<"passed" | "failed" | "incomplete" | "not-applicable"> = [];
  for (const selectedSensorId of selectedSensorIds) {
    const expectedMetricPolicies = Object.entries(profile.metricPoliciesById)
      .filter(([, policy]) => policy.sensorId === selectedSensorId);
    const metricMap = metricsBySensorId[selectedSensorId as ProjectHealthSensorIdV1];
    if (
      isNil(metricMap) ||
      JSON.stringify(sortBy(Object.keys(metricMap))) !==
      JSON.stringify(sortBy(expectedMetricPolicies.map(([metricId]) => metricId)))
    ) return invalid(contract, "Report Metrics must close over the exact selected Sensor Metric closure.");
    for (const [metricId, policy] of expectedMetricPolicies) {
      if (metricMap[metricId]?.kind !== policy.kind) return invalid(contract);
      const metricStatus = evaluateMetricStatus(metricMap[metricId]!, policy, contract);
      if (requiredSensorIds.has(selectedSensorId as ProjectHealthSensorIdV1)) {
        requiredMetricStatuses.push(metricStatus);
      }
    }
  }
  const derivedStatus: ProjectHealthReportV1["status"] = requiredMetricStatuses.includes("incomplete")
    ? "incomplete"
    : requiredMetricStatuses.includes("failed") || findings.some((finding) =>
      finding.policy === "blocking-p0" || finding.policy === "blocking-p1")
      ? "failed"
      : "passed";
  if (source.status !== derivedStatus) {
    return invalid(contract, "Report status must equal the Profile-derived Report status.");
  }
  const baselineStatus = source.baselineComparisonStatus as ProjectHealthReportV1["baselineComparisonStatus"];
  let changeByFingerprint: ProjectHealthReportV1["changeByFingerprint"] = null;
  if (baselineStatus === "compared") {
    changeByFingerprint = exactStringMap(source.changeByFingerprint, (entry, key) => {
      hash(key, contract);
      if (!["new", "resolved", "unchanged", "improved", "regressed"].includes(String(entry))) return invalid(contract);
      return entry as "new" | "resolved" | "unchanged" | "improved" | "regressed";
    }, contract);
  } else if (!isNil(source.changeByFingerprint)) {
    return invalid(contract);
  }
  return {
    kind: "project-health-report",
    schemaVersion: 1,
    mode: source.mode as ProjectHealthModeV1,
    commitSha: commitSha(source.commitSha, contract),
    baseSha: isNil(source.baseSha) ? null : commitSha(source.baseSha, contract),
    evaluatedOn: date(source.evaluatedOn, contract),
    profileHash: hash(source.profileHash, contract),
    sensorImplementationHashesBySensorId,
    observationHashesBySensorId,
    metricsBySensorId,
    findings: sortBy(findings, ["fingerprint"]),
    debtStatesByFingerprint,
    status: derivedStatus,
    baselineComparisonStatus: baselineStatus,
    changeByFingerprint,
  };
}
