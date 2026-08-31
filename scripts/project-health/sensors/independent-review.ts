import { isEmpty, isNil } from "lodash-es";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  parseIndependentReviewReceiptV1,
  parseProjectHealthObservationV1,
  projectHealthFindingFingerprintV1,
  type IndependentReviewReceiptV1,
  type ProjectHealthFindingV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
} from "../contracts";

export const INDEPENDENT_REVIEW_SENSOR_IMPLEMENTATION_HASH_V1 = sha256CanonicalJson({
  sensorId: "independent-review",
  implementationId: "host-disposition-v1",
});

function finding(input: {
  readonly code: "PROJECT_HEALTH_INDEPENDENT_REVIEW_INCOMPLETE" | "PROJECT_HEALTH_INDEPENDENT_REVIEW_HOST_CONFIRMED";
  readonly policy: "advisory-p2" | "blocking-p1";
  readonly evidenceRefs: readonly string[];
  readonly expected: string;
  readonly impact: string;
}): ProjectHealthFindingV1 {
  return {
    kind: "project-health-finding",
    schemaVersion: 1,
    fingerprint: projectHealthFindingFingerprintV1({
      sensorId: "independent-review",
      code: input.code,
      subjectRefs: ["path:docs/reviews/full-dimension-review-protocol.md"],
      evidenceClassIds: ["independent-review"],
    }),
    sensorId: "independent-review",
    policy: input.policy,
    dimension: "D6",
    code: input.code,
    ownerId: "independent-review",
    subjectRefs: ["path:docs/reviews/full-dimension-review-protocol.md"],
    evidenceClassIds: ["independent-review"],
    metricIds: ["independent-review-dispositions-complete"],
    evidenceRefs: input.evidenceRefs,
    expected: input.expected,
    impact: input.impact,
    suggestedGateId: null,
  };
}

function incompleteObservation(
  profile: ProjectHealthProfileV1,
  inputFingerprint: string,
  evidenceRefs: readonly string[],
  extraFindings: readonly ProjectHealthFindingV1[] = [],
): ProjectHealthObservationV1 {
  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: "independent-review",
    sensorImplementationHash: INDEPENDENT_REVIEW_SENSOR_IMPLEMENTATION_HASH_V1,
    inputFingerprint,
    status: "incomplete",
    metricsById: {
      "independent-review-dispositions-complete": {
        id: "independent-review-dispositions-complete",
        kind: "boolean",
        status: "not-evaluated",
        reasonCode: "OWNER_COMMAND_NOT_RUN",
      },
    },
    findings: extraFindings,
    evidenceRefs,
  }, profile);
}

export function observeIndependentReviewV1(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly expectedCommitSha: string;
  readonly receipt: IndependentReviewReceiptV1 | null;
  readonly timedOut: boolean;
}): ProjectHealthObservationV1 {
  const inputFingerprint = sha256CanonicalJson({
    expectedCommitSha: input.expectedCommitSha,
    receipt: input.receipt,
    timedOut: input.timedOut,
  });
  if (input.timedOut === true || isNil(input.receipt)) {
    return incompleteObservation(
      input.profile,
      inputFingerprint,
      isNil(input.receipt) ? [] : [input.receipt.evidenceRef],
      [finding({
        code: "PROJECT_HEALTH_INDEPENDENT_REVIEW_INCOMPLETE",
        policy: "advisory-p2",
        evidenceRefs: isNil(input.receipt) ? [] : [input.receipt.evidenceRef],
        expected: "Independent review must finish on the exact commit with Host dispositions.",
        impact: "A timed-out or missing review cannot prove Host dispositions on the exact tree.",
      })],
    );
  }

  const receipt = parseIndependentReviewReceiptV1(input.receipt, input.profile);
  const evidenceRefs = [receipt.evidenceRef];
  if (receipt.commitSha !== input.expectedCommitSha || receipt.status !== "completed") {
    return incompleteObservation(input.profile, inputFingerprint, evidenceRefs, [finding({
      code: "PROJECT_HEALTH_INDEPENDENT_REVIEW_INCOMPLETE",
      policy: "advisory-p2",
      evidenceRefs,
      expected: "Independent review Receipts must bind the expected commit and finish every disposition.",
      impact: "A wrong SHA or pending candidate leaves Host-confirmed defects unenforced.",
    })]);
  }

  if (Object.values(receipt.dispositionsByFingerprint).includes("pending-host-review")) {
    return incompleteObservation(input.profile, inputFingerprint, evidenceRefs, [finding({
      code: "PROJECT_HEALTH_INDEPENDENT_REVIEW_INCOMPLETE",
      policy: "advisory-p2",
      evidenceRefs,
      expected: "Every candidate Finding must be host-confirmed or host-rejected.",
      impact: "A pending disposition keeps an AI candidate from becoming an exact Host decision.",
    })]);
  }

  const findings: ProjectHealthFindingV1[] = [];
  for (const candidate of receipt.candidateFindings) {
    if (receipt.dispositionsByFingerprint[candidate.fingerprint] !== "host-confirmed") continue;
    if (candidate.policy !== "blocking-p0" && candidate.policy !== "blocking-p1") continue;
    findings.push(finding({
      code: "PROJECT_HEALTH_INDEPENDENT_REVIEW_HOST_CONFIRMED",
      policy: "blocking-p1",
      evidenceRefs,
      expected: "A Host-confirmed AI P0/P1 must appear as a Blocking Finding on the exact tree.",
      impact: "Host-confirmed defects remain open until the original owner gate is repaired.",
    }));
  }

  const complete = isEmpty(findings.filter((entry) => entry.code === "PROJECT_HEALTH_INDEPENDENT_REVIEW_INCOMPLETE"));
  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: "independent-review",
    sensorImplementationHash: INDEPENDENT_REVIEW_SENSOR_IMPLEMENTATION_HASH_V1,
    inputFingerprint,
    status: isEmpty(findings) ? "passed" : "failed",
    metricsById: {
      "independent-review-dispositions-complete": {
        id: "independent-review-dispositions-complete",
        kind: "boolean",
        value: complete,
      },
    },
    findings,
    evidenceRefs,
  }, input.profile);
}
