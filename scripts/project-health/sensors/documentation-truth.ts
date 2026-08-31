import path from "node:path";

import { isEmpty, isNil, uniq } from "lodash-es";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  parseProjectHealthObservationV1,
  projectHealthFindingFingerprintV1,
  type ProjectHealthFindingV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
} from "../contracts";

export const DOCUMENTATION_TRUTH_SENSOR_IMPLEMENTATION_HASH_V1 = sha256CanonicalJson({
  sensorId: "documentation-truth",
  implementationId: "link-and-status-v1",
});

export interface DocumentationDocumentV1 {
  readonly path: string;
  readonly markdown: string;
}

const MARKDOWN_LINK = /\[[^\]]+\]\(([^)]+)\)/g;
const TASK_ID = /PHO-\d+/g;
const STATUS_WORD = /\b(Implemented|Proposed|Experimental)\b/g;

function resolveLink(fromPath: string, target: string): string | null {
  const trimmed = target.trim();
  if (isEmpty(trimmed) || trimmed.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return null;
  }
  const withoutHash = trimmed.split("#")[0] ?? "";
  if (isEmpty(withoutHash)) return null;
  const fromDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const joined = path.posix.normalize(fromDir === "" ? withoutHash : `${fromDir}/${withoutHash}`);
  if (joined.startsWith("../") || joined === "..") return joined;
  return joined;
}

function finding(pathRef: string, expected: string, impact: string, evidenceRef: string): ProjectHealthFindingV1 {
  return {
    kind: "project-health-finding",
    schemaVersion: 1,
    fingerprint: projectHealthFindingFingerprintV1({
      sensorId: "documentation-truth",
      code: "PROJECT_HEALTH_DOCUMENTATION_TRUTH_CONFLICT",
      subjectRefs: [`path:${pathRef}`],
      evidenceClassIds: ["documentation-claim"],
    }),
    sensorId: "documentation-truth",
    policy: "blocking-p1",
    dimension: "D6",
    code: "PROJECT_HEALTH_DOCUMENTATION_TRUTH_CONFLICT",
    ownerId: "documentation-truth",
    subjectRefs: [`path:${pathRef}`],
    evidenceClassIds: ["documentation-claim"],
    metricIds: ["documentation-claims-current"],
    evidenceRefs: [evidenceRef],
    expected,
    impact,
    suggestedGateId: null,
  };
}

export function observeDocumentationTruthV1(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly documents: readonly DocumentationDocumentV1[];
  readonly repositoryPaths: readonly string[];
  readonly declaredStatusesByTaskId: Readonly<Record<string, "Proposed" | "Implemented" | "Experimental">>;
}): ProjectHealthObservationV1 {
  const inputFingerprint = sha256CanonicalJson({
    documents: input.documents,
    declaredStatusesByTaskId: input.declaredStatusesByTaskId,
  });
  const repositoryPaths = new Set(input.repositoryPaths);
  const findings: ProjectHealthFindingV1[] = [];
  const evidenceRefs: string[] = [];

  for (const document of input.documents) {
    const evidenceRef = sha256CanonicalJson({ path: document.path, markdown: document.markdown });
    evidenceRefs.push(evidenceRef);
    for (const match of document.markdown.matchAll(MARKDOWN_LINK)) {
      const target = match[1];
      if (isNil(target)) continue;
      const resolved = resolveLink(document.path, target);
      if (isNil(resolved)) continue;
      if (resolved.startsWith("../") || resolved === ".." || !repositoryPaths.has(resolved)) {
        findings.push(finding(
          document.path,
          "Documentation links must resolve to a tracked repository path or an external URL.",
          "A broken repo-relative link can send an agent or reviewer to a missing contract.",
          evidenceRef,
        ));
      }
    }
    const taskIds = uniq(document.markdown.match(TASK_ID) ?? []);
    const claimedStatuses = uniq(document.markdown.match(STATUS_WORD) ?? []) as Array<
      "Proposed" | "Implemented" | "Experimental"
    >;
    for (const taskId of taskIds) {
      const declared = input.declaredStatusesByTaskId[taskId];
      if (isNil(declared) || isEmpty(claimedStatuses)) continue;
      if (claimedStatuses.some((claimed) => claimed !== declared)) {
        findings.push(finding(
          document.path,
          "Documented Implemented/Proposed/Experimental status must match the declared Backlog state.",
          "A status conflict can present unfinished work as a production capability.",
          evidenceRef,
        ));
      }
    }
  }

  const current = isEmpty(findings);
  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: "documentation-truth",
    sensorImplementationHash: DOCUMENTATION_TRUTH_SENSOR_IMPLEMENTATION_HASH_V1,
    inputFingerprint,
    status: current ? "passed" : "failed",
    metricsById: {
      "documentation-claims-current": {
        id: "documentation-claims-current",
        kind: "boolean",
        value: current,
      },
    },
    findings,
    evidenceRefs,
  }, input.profile);
}
