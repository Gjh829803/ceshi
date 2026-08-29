import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  parseWorldChangeReceiptV1,
  RUNTIME_STATE_KINDS_V1,
  type RuntimePublicationIdentityV1,
  type RuntimeStateEffectV1,
  type WorldChangeAffectedIdsV1,
  type WorldChangeBuildIdentityV1,
  type WorldChangeDiagnosticV1,
  type WorldChangeFailurePhaseV1,
  type WorldChangeOperationResultV1,
  type WorldChangeReceiptV1,
  type WorldChangeRequestV1,
  type WorldChangeValidationReportBindingV1,
} from "@whitebox-world/authoring-edit";
import { isNil } from "lodash-es";

import { journalArtifactIdV1 } from "./ids.js";

export function receiptIdForRequestV1(requestId: string): string {
  return journalArtifactIdV1("receipt", requestId);
}

export function assembleRejectedReceiptV1(input: {
  readonly request: WorldChangeRequestV1;
  readonly requestHash: Sha256HashV1;
  readonly authoringEditPolicyHash: Sha256HashV1;
  readonly changeSetHash: Sha256HashV1;
  readonly failurePhase: WorldChangeFailurePhaseV1;
  readonly diagnostics: readonly WorldChangeDiagnosticV1[];
  readonly currentAuthoringSpecHash?: Sha256HashV1;
  readonly conflictingIds?: WorldChangeAffectedIdsV1;
}): WorldChangeReceiptV1 {
  return parseWorldChangeReceiptV1({
    kind: "worldkit-world-change-receipt",
    schemaVersion: 1,
    id: receiptIdForRequestV1(input.request.id),
    requestId: input.request.id,
    requestHash: input.requestHash,
    authoringEditSessionId: input.request.authoringEditSessionId,
    authoringEditPolicyHash: input.authoringEditPolicyHash,
    worldId: input.request.worldId,
    changeSetId: input.request.changeSet.id,
    changeSetHash: input.changeSetHash,
    baseAuthoringSpecHash: input.request.changeSet.baseAuthoringSpecHash,
    diagnostics: input.diagnostics,
    status: "rejected",
    mode: input.request.mode,
    publicationMode: "none",
    failurePhase: input.failurePhase,
    ...(input.request.mode === "apply"
      ? { requestedOutcome: input.request.requestedOutcome }
      : {}),
    ...(isNil(input.currentAuthoringSpecHash)
      ? {}
      : { currentAuthoringSpecHash: input.currentAuthoringSpecHash }),
    ...(isNil(input.conflictingIds) ? {} : { conflictingIds: input.conflictingIds }),
  });
}

export function assembleValidatedReceiptV1(input: {
  readonly request: WorldChangeRequestV1;
  readonly requestHash: Sha256HashV1;
  readonly authoringEditPolicyHash: Sha256HashV1;
  readonly changeSetHash: Sha256HashV1;
}): WorldChangeReceiptV1 {
  return parseWorldChangeReceiptV1({
    kind: "worldkit-world-change-receipt",
    schemaVersion: 1,
    id: receiptIdForRequestV1(input.request.id),
    requestId: input.request.id,
    requestHash: input.requestHash,
    authoringEditSessionId: input.request.authoringEditSessionId,
    authoringEditPolicyHash: input.authoringEditPolicyHash,
    worldId: input.request.worldId,
    changeSetId: input.request.changeSet.id,
    changeSetHash: input.changeSetHash,
    baseAuthoringSpecHash: input.request.changeSet.baseAuthoringSpecHash,
    diagnostics: [],
    status: "validated",
    mode: "validate",
    publicationMode: "none",
  });
}

export function assembleCandidateReceiptFieldsV1(input: {
  readonly request: WorldChangeRequestV1;
  readonly requestHash: Sha256HashV1;
  readonly authoringEditPolicyHash: Sha256HashV1;
  readonly changeSetHash: Sha256HashV1;
  readonly buildIdentity: WorldChangeBuildIdentityV1;
  readonly affectedIds: WorldChangeAffectedIdsV1;
  readonly operationResults: readonly WorldChangeOperationResultV1[];
  readonly validationReports: readonly WorldChangeValidationReportBindingV1[];
}) {
  return {
    kind: "worldkit-world-change-receipt" as const,
    schemaVersion: 1 as const,
    id: receiptIdForRequestV1(input.request.id),
    requestId: input.request.id,
    requestHash: input.requestHash,
    authoringEditSessionId: input.request.authoringEditSessionId,
    authoringEditPolicyHash: input.authoringEditPolicyHash,
    worldId: input.request.worldId,
    changeSetId: input.request.changeSet.id,
    changeSetHash: input.changeSetHash,
    baseAuthoringSpecHash: input.request.changeSet.baseAuthoringSpecHash,
    diagnostics: [],
    buildIdentity: input.buildIdentity,
    affectedIds: input.affectedIds,
    operationResults: input.operationResults,
    validationReports: input.validationReports,
    appliedMigrations: [],
    appliedSafetyFixes: [],
  };
}

export function assembleDryRunReceiptV1(input: {
  readonly request: WorldChangeRequestV1;
  readonly requestHash: Sha256HashV1;
  readonly authoringEditPolicyHash: Sha256HashV1;
  readonly changeSetHash: Sha256HashV1;
  readonly buildIdentity: WorldChangeBuildIdentityV1;
  readonly affectedIds: WorldChangeAffectedIdsV1;
  readonly operationResults: readonly WorldChangeOperationResultV1[];
  readonly validationReports: readonly WorldChangeValidationReportBindingV1[];
  readonly preparedCandidateRef: string;
  readonly preparedCandidateExpiresAtUnixMilliseconds: number;
}): WorldChangeReceiptV1 {
  return parseWorldChangeReceiptV1({
    ...assembleCandidateReceiptFieldsV1(input),
    status: "succeeded",
    mode: "dry-run",
    publicationMode: "none",
    preparedCandidateRef: input.preparedCandidateRef,
    preparedCandidateExpiresAtUnixMilliseconds:
      input.preparedCandidateExpiresAtUnixMilliseconds,
  });
}

export function assembleAuthoringOnlyCommittedReceiptV1(input: {
  readonly request: WorldChangeRequestV1;
  readonly requestHash: Sha256HashV1;
  readonly authoringEditPolicyHash: Sha256HashV1;
  readonly changeSetHash: Sha256HashV1;
  readonly buildIdentity: WorldChangeBuildIdentityV1;
  readonly affectedIds: WorldChangeAffectedIdsV1;
  readonly operationResults: readonly WorldChangeOperationResultV1[];
  readonly validationReports: readonly WorldChangeValidationReportBindingV1[];
  readonly committedRevisionRef: string;
}): WorldChangeReceiptV1 {
  return parseWorldChangeReceiptV1({
    ...assembleCandidateReceiptFieldsV1(input),
    status: "committed",
    mode: "apply",
    requestedOutcome: "authoring-only",
    publicationMode: "none",
    committedRevisionRef: input.committedRevisionRef,
  });
}

function fullReloadRuntimeStateEffectsV1(): readonly RuntimeStateEffectV1[] {
  return RUNTIME_STATE_KINDS_V1.map((runtimeStateKind) => {
    if (runtimeStateKind === "world-package") {
      return {
        runtimeStateKind,
        defaultDisposition: "replaced",
        defaultReasonCode: "new-world-package",
        exceptions: [],
      };
    }
    if (runtimeStateKind === "world-session") {
      return {
        runtimeStateKind,
        defaultDisposition: "replaced",
        defaultReasonCode: "new-world-session",
        exceptions: [],
      };
    }
    if (runtimeStateKind === "simulation-tick") {
      return {
        runtimeStateKind,
        defaultDisposition: "reset",
        defaultReasonCode: "full-reload-tick-zero",
        exceptions: [],
      };
    }
    return {
      runtimeStateKind,
      defaultDisposition: "reset",
      defaultReasonCode: "runtime-state-not-transferred",
      exceptions: [],
    };
  });
}

export function assemblePublishRuntimeCommittedReceiptV1(input: {
  readonly request: WorldChangeRequestV1;
  readonly requestHash: Sha256HashV1;
  readonly authoringEditPolicyHash: Sha256HashV1;
  readonly changeSetHash: Sha256HashV1;
  readonly buildIdentity: WorldChangeBuildIdentityV1;
  readonly affectedIds: WorldChangeAffectedIdsV1;
  readonly operationResults: readonly WorldChangeOperationResultV1[];
  readonly validationReports: readonly WorldChangeValidationReportBindingV1[];
  readonly committedRevisionRef: string;
  readonly previousRuntimeIdentity: RuntimePublicationIdentityV1;
  readonly currentRuntimeIdentity: RuntimePublicationIdentityV1;
  readonly cleanupOperationId: string;
}): WorldChangeReceiptV1 {
  return parseWorldChangeReceiptV1({
    ...assembleCandidateReceiptFieldsV1(input),
    status: "committed",
    mode: "apply",
    requestedOutcome: "publish-runtime",
    publicationMode: "full-reload",
    committedRevisionRef: input.committedRevisionRef,
    previousRuntimeIdentity: input.previousRuntimeIdentity,
    currentRuntimeIdentity: input.currentRuntimeIdentity,
    runtimeStateEffects: fullReloadRuntimeStateEffectsV1(),
    runtimeCleanup: {
      cleanupOperationId: input.cleanupOperationId,
      type: "replaced-runtime",
      previousWorldSessionId: input.previousRuntimeIdentity.worldSessionId,
      statusAtCommit: "scheduled",
    },
  });
}
