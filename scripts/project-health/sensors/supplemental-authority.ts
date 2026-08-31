import { isEmpty, isNil } from "lodash-es";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type { WorkspaceBoundaryEvidenceV1, WorkspacePublicSymbolOwnershipV1 } from "../../lib/workspace-boundary-contract";
import {
  parseProjectHealthObservationV1,
  projectHealthFindingFingerprintV1,
  type ProjectHealthAuthorityPolicyV1,
  type ProjectHealthAuthoritySelectorV1,
  type ProjectHealthFindingV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
} from "../contracts";
import { workspaceBoundaryEvidenceRefV1 } from "../workspace-boundary-adapter";

function selectorMatches(
  selector: ProjectHealthAuthoritySelectorV1,
  symbol: WorkspacePublicSymbolOwnershipV1,
): boolean {
  if (!isEmpty(selector.exactPaths) && !selector.exactPaths.includes(symbol.sourcePath)) return false;
  if (
    !isEmpty(selector.pathPrefixes) &&
    !selector.pathPrefixes.some((prefix) => symbol.sourcePath === prefix || symbol.sourcePath.startsWith(`${prefix}/`))
  ) return false;
  if (!isEmpty(selector.pathSuffixes) && !selector.pathSuffixes.some((suffix) => symbol.sourcePath.endsWith(suffix))) {
    return false;
  }
  if (!isEmpty(selector.packageIds) && !selector.packageIds.includes(symbol.packageId)) return false;
  return true;
}

function keywordCandidate(symbolName: string): boolean {
  if (/V2(?:[A-Za-z]|$)/.test(symbolName)) return true;
  const tokens = symbolName.split(/(?=[A-Z])|[_-]/).map((token) => token.toLowerCase());
  return tokens.some((token) => token === "compat" || token === "legacy");
}

function excepted(
  policy: ProjectHealthAuthorityPolicyV1,
  ruleId: string,
  symbol: WorkspacePublicSymbolOwnershipV1,
): boolean {
  return policy.exceptions.some((entry) =>
    entry.ruleId === ruleId &&
    entry.packageId === symbol.packageId &&
    entry.sourcePath === symbol.sourcePath &&
    entry.symbolName === symbol.symbolName);
}

function authorityFinding(input: {
  readonly evidenceRef: string;
  readonly code: "PROJECT_HEALTH_AUTHORITY_DUPLICATE" | "PROJECT_HEALTH_PUBLIC_COMPAT_ALIAS" | "PROJECT_HEALTH_AUTHORITY_KEYWORD_CANDIDATE";
  readonly policy: "blocking-p1" | "advisory-p3";
  readonly ownerId: string;
  readonly subjectRefs: readonly string[];
  readonly expected: string;
  readonly impact: string;
}): ProjectHealthFindingV1 {
  const evidenceClassIds = ["supplemental-authority-rule"] as const;
  return {
    kind: "project-health-finding",
    schemaVersion: 1,
    fingerprint: projectHealthFindingFingerprintV1({
      sensorId: "supplemental-authority",
      code: input.code,
      subjectRefs: input.subjectRefs,
      evidenceClassIds,
    }),
    sensorId: "supplemental-authority",
    policy: input.policy,
    dimension: "D1",
    code: input.code,
    ownerId: input.ownerId,
    subjectRefs: input.subjectRefs,
    evidenceClassIds,
    metricIds: ["supplemental-authority-valid"],
    evidenceRefs: [input.evidenceRef],
    expected: input.expected,
    impact: input.impact,
    suggestedGateId: null,
  };
}

export function observeSupplementalAuthorityV1(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly sensorImplementationHash: string;
  readonly evidence: WorkspaceBoundaryEvidenceV1 | null;
  readonly authorityPolicy: ProjectHealthAuthorityPolicyV1 | null;
}): ProjectHealthObservationV1 {
  if (isNil(input.evidence) || isNil(input.authorityPolicy)) {
    return parseProjectHealthObservationV1({
      kind: "project-health-observation",
      schemaVersion: 1,
      sensorId: "supplemental-authority",
      sensorImplementationHash: input.sensorImplementationHash,
      inputFingerprint: sha256CanonicalJson({ evidence: input.evidence, authorityPolicy: input.authorityPolicy }),
      status: "incomplete",
      metricsById: {
        "supplemental-authority-valid": {
          id: "supplemental-authority-valid",
          kind: "boolean",
          status: "not-evaluated",
          reasonCode: "OWNER_COMMAND_NOT_RUN",
        },
      },
      findings: [],
      evidenceRefs: [],
    }, input.profile);
  }
  const evidenceRef = workspaceBoundaryEvidenceRefV1(input.evidence);
  const findings: ProjectHealthFindingV1[] = [];
  const blockedKeys = new Set<string>();

  function add(finding: ProjectHealthFindingV1, symbol?: WorkspacePublicSymbolOwnershipV1): void {
    findings.push(finding);
    if (!isNil(symbol) && finding.policy === "blocking-p1") {
      blockedKeys.add(`${symbol.packageId}\0${symbol.sourcePath}\0${symbol.symbolName}`);
    }
  }

  for (const rule of input.authorityPolicy.rules) {
    if (rule.kind === "forbidden-public-symbol") {
      for (const symbol of input.evidence.publicSymbols) {
        if (!rule.symbolNames.includes(symbol.symbolName) || !selectorMatches(rule.selector, symbol)) continue;
        if (excepted(input.authorityPolicy, rule.id, symbol)) continue;
        add(authorityFinding({
          evidenceRef,
          code: rule.code === "PROJECT_HEALTH_PUBLIC_COMPAT_ALIAS"
            ? "PROJECT_HEALTH_PUBLIC_COMPAT_ALIAS"
            : "PROJECT_HEALTH_AUTHORITY_DUPLICATE",
          policy: "blocking-p1",
          ownerId: rule.ownerId,
          subjectRefs: [`package:${symbol.packageId}`, `path:${symbol.sourcePath}`],
          expected: `Public symbol ${symbol.symbolName} must not appear in the selected ownership set.`,
          impact: "A public compatibility alias or forbidden symbol reintroduces a second current contract.",
        }), symbol);
      }
      continue;
    }
    if (rule.kind === "unique-public-symbol-owner") {
      const matches = input.evidence.publicSymbols.filter((symbol) =>
        rule.symbolNames.includes(symbol.symbolName) && selectorMatches(rule.selector, symbol));
      for (const symbol of matches) {
        if (symbol.packageId === rule.ownerPackageId) continue;
        if (excepted(input.authorityPolicy, rule.id, symbol)) continue;
        add(authorityFinding({
          evidenceRef,
          code: "PROJECT_HEALTH_AUTHORITY_DUPLICATE",
          policy: "blocking-p1",
          ownerId: rule.ownerId,
          subjectRefs: [`package:${symbol.packageId}`, `path:${symbol.sourcePath}`],
          expected: `Public symbol ${symbol.symbolName} has exactly one owner package ${rule.ownerPackageId}.`,
          impact: "A second public parser or protocol owner can diverge from the frozen contract.",
        }), symbol);
      }
      continue;
    }
    const leftHits = input.evidence.publicSymbols.filter((symbol) =>
      rule.left.symbolNames.includes(symbol.symbolName) && selectorMatches(rule.left.selector, symbol));
    const rightHits = input.evidence.publicSymbols.filter((symbol) =>
      rule.right.symbolNames.includes(symbol.symbolName) && selectorMatches(rule.right.selector, symbol));
    if (isEmpty(leftHits) || isEmpty(rightHits)) continue;
    const left = leftHits[0]!;
    const right = rightHits[0]!;
    if (excepted(input.authorityPolicy, rule.id, left) || excepted(input.authorityPolicy, rule.id, right)) continue;
    add(authorityFinding({
      evidenceRef,
      code: "PROJECT_HEALTH_AUTHORITY_DUPLICATE",
      policy: "blocking-p1",
      ownerId: rule.ownerId,
      subjectRefs: [
        `package:${left.packageId}`,
        `path:${left.sourcePath}`,
        `package:${right.packageId}`,
        `path:${right.sourcePath}`,
      ],
      expected: "Canonical and Native Scene Source public symbols must not be owned together.",
      impact: "A world cannot have two Scene Source owners in the same public surface.",
    }));
  }

  for (const symbol of input.evidence.publicSymbols) {
    if (!keywordCandidate(symbol.symbolName)) continue;
    if (blockedKeys.has(`${symbol.packageId}\0${symbol.sourcePath}\0${symbol.symbolName}`)) continue;
    add(authorityFinding({
      evidenceRef,
      code: "PROJECT_HEALTH_AUTHORITY_KEYWORD_CANDIDATE",
      policy: "advisory-p3",
      ownerId: "public-contract",
      subjectRefs: [`package:${symbol.packageId}`, `path:${symbol.sourcePath}`],
      expected: "compat, legacy, and V2 public names remain advisory candidates until an exact forbidden rule matches.",
      impact: "A keyword-named public symbol may indicate a compatibility path, but it is not a blocking owner fact.",
    }));
  }

  const blocking = findings.some((finding) => finding.policy === "blocking-p0" || finding.policy === "blocking-p1");
  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: "supplemental-authority",
    sensorImplementationHash: input.sensorImplementationHash,
    inputFingerprint: evidenceRef,
    status: blocking ? "failed" : "passed",
    metricsById: {
      "supplemental-authority-valid": {
        id: "supplemental-authority-valid",
        kind: "boolean",
        value: !blocking,
      },
    },
    findings,
    evidenceRefs: [evidenceRef],
  }, input.profile);
}
