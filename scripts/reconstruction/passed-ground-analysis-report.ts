import {
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";

const REPORT_FIELDS = [
  "kind",
  "schemaVersion",
  "identity",
  "analysisOutcome",
  "admissionOutcome",
  "failureFacts",
  "metrics",
  "standableNodes",
].sort();
const IDENTITY_FIELDS = [
  "logicalGroundModelHash",
  "walkableTopologyHash",
  "traversalCapabilityEnvelopeHash",
  "caseHash",
  "worldPackageRootHash",
  "measurementChunkPolicyHash",
].sort();

function invalid(): never {
  throw new Error("NBR70_GROUND_ANALYSIS_EVIDENCE_INVALID");
}

function exactFields(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) invalid();
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid();
  }
  return value as Readonly<Record<string, unknown>>;
}

export function verifyPassedGroundAnalysisReportV1(input: Readonly<{
  reportBytes: Uint8Array;
  reportRef: string;
  expectedReportRef: string;
  reportHash: Sha256HashV1;
  expectedCaseHash: Sha256HashV1;
  expectedWorldPackageRootHash: Sha256HashV1;
}>): Readonly<Record<string, unknown>> {
  if (input.reportRef !== input.expectedReportRef) invalid();
  let reportValue: unknown;
  try {
    reportValue = JSON.parse(new TextDecoder().decode(input.reportBytes));
  } catch {
    return invalid();
  }
  const report = record(reportValue);
  const identity = record(report.identity);
  exactFields(report, REPORT_FIELDS);
  exactFields(identity, IDENTITY_FIELDS);
  if (
    report.kind !== "babylon-native-block-ground-analysis-report" ||
    report.schemaVersion !== 1 ||
    report.analysisOutcome !== "passed" ||
    report.admissionOutcome !== "passed" ||
    !Array.isArray(report.failureFacts) ||
    report.failureFacts.length !== 0 ||
    !Array.isArray(report.standableNodes) ||
    typeof report.metrics !== "object" ||
    report.metrics === null ||
    Array.isArray(report.metrics) ||
    identity.caseHash !== input.expectedCaseHash ||
    identity.worldPackageRootHash !== input.expectedWorldPackageRootHash ||
    sha256CanonicalJson(report) !== input.reportHash
  ) invalid();
  const canonicalBytes = new TextEncoder().encode(
    `${stringifyCanonicalJson(report)}\n`,
  );
  if (sha256Bytes(input.reportBytes) !== sha256Bytes(canonicalBytes)) invalid();
  return Object.freeze(report);
}
