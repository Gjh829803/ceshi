import {
  parseWorldChangeExplainV1,
  type WorldChangeDiagnosticV1,
  type WorldChangeExplainV1,
  type WorldChangeTargetV1,
} from "@whitebox-world/authoring-edit";
import { isNil, uniq } from "lodash-es";

import { sessionAuthorizationDiagnosticV1 } from "./authorize.js";
import { journalArtifactIdV1 } from "./ids.js";
import { getDurableRequestRecordV1, isTerminalStateV1 } from "./store.js";
import type {
  DurableRequestRecordV1,
  QueryWorldChangeCleanupReportInputV1,
  QueryWorldChangeCleanupReportResultV1,
  QueryWorldChangeDiffInputV1,
  QueryWorldChangeDiffResultV1,
  QueryWorldChangeExplainInputV1,
  QueryWorldChangeExplainResultV1,
  QueryWorldChangeReceiptInputV1,
  QueryWorldChangeReceiptResultV1,
} from "./types.js";

function queryAuthorization(input: {
  readonly session: QueryWorldChangeReceiptInputV1["session"];
  readonly expectedSessionId: string;
  readonly nowUnixMilliseconds: number;
  readonly worldId?: string;
}): {
  readonly status: "rejected";
  readonly diagnostics: readonly WorldChangeDiagnosticV1[];
} | undefined {
  const diagnostic = sessionAuthorizationDiagnosticV1({
    session: input.session,
    expectedSessionId: input.expectedSessionId,
    requiredScopes: ["authoring.receipt.read"],
    nowUnixMilliseconds: input.nowUnixMilliseconds,
    ...(isNil(input.worldId) ? {} : { worldId: input.worldId }),
  });
  if (isNil(diagnostic)) return undefined;
  return {
    status: "rejected",
    diagnostics: [diagnostic],
  };
}

function relatedIdsFromTarget(target: WorldChangeTargetV1): readonly string[] {
  if (target.kind === "resource") return [target.resourceId];
  if (target.kind === "node") return [target.nodeEntityId];
  if (target.kind === "spatial-feature") return [target.spatialFeatureId];
  if (target.kind === "relationship") return [target.relationshipId];
  if (target.kind === "constraint") return [target.constraintId];
  if (target.kind === "definition-override") {
    return uniq([target.nodeEntityId, target.overrideId]);
  }
  return [target.worldId];
}

function relatedIdsFromDiagnostic(
  diagnostic: WorldChangeDiagnosticV1,
): readonly string[] {
  if (diagnostic.details?.kind === "related-ids") {
    return diagnostic.details.ids;
  }
  return [];
}

function assembleExplainV1(
  record: DurableRequestRecordV1,
  selector: QueryWorldChangeExplainInputV1["request"]["selector"],
): WorldChangeExplainV1 {
  const explanations: WorldChangeExplainV1["explanations"][number][] = [];
  if (!isNil(record.applied) && selector.mode !== "diagnostic") {
    for (const operation of record.applied.operationResults) {
      if (
        selector.mode === "operation" &&
        operation.operationId !== selector.operationId
      ) {
        continue;
      }
      explanations.push({
        id: journalArtifactIdV1("e", operation.operationId),
        type: "operation-effect",
        message: `Operation '${operation.operationId}' applied ${operation.operationType}.`,
        relatedIds: uniq([
          operation.operationId,
          ...relatedIdsFromTarget(operation.target),
        ]),
      });
    }
  }
  if (
    selector.mode !== "operation" &&
    (record.request.mode === "dry-run" || record.request.mode === "apply")
  ) {
    explanations.push({
      id: "e.publication",
      type: "publication-selection",
      message:
        record.request.mode === "dry-run"
          ? "Dry Run prepared an isolated candidate without advancing the revision head."
          : "Authoring-only commit; Runtime publication is owned by RuntimeHost publication V2.",
      relatedIds: [],
    });
  }
  if (selector.mode !== "operation") {
    const diagnostics = record.receipt?.diagnostics ?? [];
    diagnostics.forEach((diagnostic, index) => {
      if (
        selector.mode === "diagnostic" &&
        diagnostic.code !== selector.diagnosticCode
      ) {
        return;
      }
      explanations.push({
        id: `e.diag.${String(index + 1).padStart(3, "0")}`,
        type: "conflict",
        message: diagnostic.message,
        relatedIds: relatedIdsFromDiagnostic(diagnostic),
      });
    });
  }
  return parseWorldChangeExplainV1({
    kind: "worldkit-world-change-explain",
    schemaVersion: 1,
    id: journalArtifactIdV1("explain", record.request.id),
    requestId: record.request.id,
    explanations,
  });
}

export function queryWorldChangeReceiptV1(
  input: QueryWorldChangeReceiptInputV1,
): QueryWorldChangeReceiptResultV1 {
  const early = queryAuthorization({
    session: input.session,
    expectedSessionId: input.query.authoringEditSessionId,
    nowUnixMilliseconds: input.nowUnixMilliseconds,
  });
  if (!isNil(early)) return early;
  const record = getDurableRequestRecordV1(
    input.journal,
    input.query.authoringEditSessionId,
    input.query.requestId,
  );
  if (isNil(record)) return { status: "missing" };
  const worldAuthz = queryAuthorization({
    session: input.session,
    expectedSessionId: input.query.authoringEditSessionId,
    nowUnixMilliseconds: input.nowUnixMilliseconds,
    worldId: record.request.worldId,
  });
  if (!isNil(worldAuthz)) return worldAuthz;
  if (!isNil(record.receipt) && isTerminalStateV1(record.state)) {
    return { status: "found", receipt: record.receipt };
  }
  return { status: "pending", state: record.state };
}

export function queryWorldChangeExplainV1(
  input: QueryWorldChangeExplainInputV1,
): QueryWorldChangeExplainResultV1 {
  const early = queryAuthorization({
    session: input.session,
    expectedSessionId: input.request.authoringEditSessionId,
    nowUnixMilliseconds: input.nowUnixMilliseconds,
  });
  if (!isNil(early)) return early;
  const record = getDurableRequestRecordV1(
    input.journal,
    input.request.authoringEditSessionId,
    input.request.requestId,
  );
  if (isNil(record)) return { status: "missing" };
  const worldAuthz = queryAuthorization({
    session: input.session,
    expectedSessionId: input.request.authoringEditSessionId,
    nowUnixMilliseconds: input.nowUnixMilliseconds,
    worldId: record.request.worldId,
  });
  if (!isNil(worldAuthz)) return worldAuthz;
  if (!isTerminalStateV1(record.state)) {
    return { status: "pending", state: record.state };
  }
  return { status: "found", explain: assembleExplainV1(record, input.request.selector) };
}

export function queryWorldChangeDiffV1(
  input: QueryWorldChangeDiffInputV1,
): QueryWorldChangeDiffResultV1 {
  const early = queryAuthorization({
    session: input.session,
    expectedSessionId: input.request.authoringEditSessionId,
    nowUnixMilliseconds: input.nowUnixMilliseconds,
  });
  if (!isNil(early)) return early;
  const record = getDurableRequestRecordV1(
    input.journal,
    input.request.authoringEditSessionId,
    input.request.requestId,
  );
  if (isNil(record)) return { status: "missing" };
  const worldAuthz = queryAuthorization({
    session: input.session,
    expectedSessionId: input.request.authoringEditSessionId,
    nowUnixMilliseconds: input.nowUnixMilliseconds,
    worldId: record.request.worldId,
  });
  if (!isNil(worldAuthz)) return worldAuthz;
  if (!isTerminalStateV1(record.state)) {
    return { status: "pending", state: record.state };
  }
  if (isNil(record.diff)) return { status: "missing" };
  return { status: "found", diff: record.diff };
}

export function queryWorldChangeCleanupReportV1(
  input: QueryWorldChangeCleanupReportInputV1,
): QueryWorldChangeCleanupReportResultV1 {
  const early = queryAuthorization({
    session: input.session,
    expectedSessionId: input.query.authoringEditSessionId,
    nowUnixMilliseconds: input.nowUnixMilliseconds,
  });
  if (!isNil(early)) return early;
  return { status: "missing" };
}
