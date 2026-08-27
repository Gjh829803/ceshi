import {
  parseWorldChangeCleanupReportV1,
  parseWorldChangeReceiptV1,
  type Sha256HashV1,
  type WorldChangeCleanupReportV1,
  type WorldChangeReceiptV1,
} from "@whitebox-world/authoring-edit";
import {
  worldPackageRefFromRootHashV1,
  type WorldPackageRefV1,
} from "@whitebox-world/world-package";
import { isEqual, isNil, orderBy } from "lodash-es";

import {
  getCleanupReportV1,
  getWorldPublicationRecoveryStateV1,
  listDurableRequestRecordsV1,
  listWorldPublicationRecoveryStatesV1,
  putCleanupReportV1,
  putWorldPublicationRecoveryStateV1,
} from "./store.js";
import type { WorldChangeJournalV1 } from "./types.js";

type FullReloadCommittedReceiptV1 = Extract<
  WorldChangeReceiptV1,
  { readonly status: "committed"; readonly requestedOutcome: "publish-runtime" }
> & Readonly<{ readonly publicationMode: "full-reload" }>;

export interface PendingWorldPublicationRecoveryV1 {
  readonly worldId: string;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
  readonly requestHash: Sha256HashV1;
  readonly worldPackageRef: WorldPackageRefV1;
  readonly committedReceipt: FullReloadCommittedReceiptV1;
  readonly cleanupReport: WorldChangeCleanupReportV1;
}

function publicationRecoveryConflict(message: string): never {
  throw new Error(`WORLD_CHANGE_PUBLICATION_RECOVERY_CONFLICT: ${message}`);
}

function cleanupReportConflict(message: string): never {
  throw new Error(`WORLD_CHANGE_CLEANUP_REPORT_CONFLICT: ${message}`);
}

function isTerminalCleanupStatus(
  status: WorldChangeCleanupReportV1["status"],
): boolean {
  return status === "released" || status === "quarantined";
}

export function listPendingWorldPublicationRecoveriesV1(
  journal: WorldChangeJournalV1,
): readonly PendingWorldPublicationRecoveryV1[] {
  const records = listDurableRequestRecordsV1(journal);
  const pending = listWorldPublicationRecoveryStatesV1(journal)
    .filter((state) => state.status === "pending")
    .map((state): PendingWorldPublicationRecoveryV1 => {
      const matchingRecords = records.filter((record) =>
        record.request.worldId === state.worldId &&
        record.request.id === state.requestId
      );
      if (matchingRecords.length !== 1) {
        publicationRecoveryConflict(
          `World '${state.worldId}' does not have exactly one durable Request '${state.requestId}'.`,
        );
      }
      const record = matchingRecords[0];
      if (
        isNil(record) ||
        record.state !== "committed" ||
        record.receipt?.status !== "committed" ||
        record.receipt.requestedOutcome !== "publish-runtime" ||
        record.receipt.publicationMode !== "full-reload" ||
        isNil(record.buildIdentity) ||
        !isEqual(record.buildIdentity, record.receipt.buildIdentity)
      ) {
        publicationRecoveryConflict(
          `World '${state.worldId}' recovery state does not match a committed Full Reload identity.`,
        );
      }
      const committedReceipt = parseWorldChangeReceiptV1(record.receipt);
      if (
        committedReceipt.status !== "committed" ||
        committedReceipt.requestedOutcome !== "publish-runtime" ||
        committedReceipt.publicationMode !== "full-reload"
      ) {
        publicationRecoveryConflict(
          `World '${state.worldId}' committed Receipt is not Full Reload.`,
        );
      }
      const cleanupReport = getCleanupReportV1(
        journal,
        record.request.authoringEditSessionId,
        committedReceipt.runtimeCleanup.cleanupOperationId,
      );
      if (
        isNil(cleanupReport) ||
        cleanupReport.requestId !== record.request.id ||
        cleanupReport.cleanupOperationId !==
          committedReceipt.runtimeCleanup.cleanupOperationId ||
        cleanupReport.previousWorldSessionId !==
          committedReceipt.runtimeCleanup.previousWorldSessionId
      ) {
        publicationRecoveryConflict(
          `World '${state.worldId}' cleanup report does not match its committed Receipt.`,
        );
      }
      return Object.freeze({
        worldId: state.worldId,
        authoringEditSessionId: record.request.authoringEditSessionId,
        requestId: record.request.id,
        requestHash: record.requestHash,
        worldPackageRef: worldPackageRefFromRootHashV1(
          record.buildIdentity.worldPackageRootHash,
        ),
        committedReceipt: committedReceipt as FullReloadCommittedReceiptV1,
        cleanupReport: parseWorldChangeCleanupReportV1(cleanupReport),
      });
    });
  return Object.freeze(orderBy(
    pending,
    ["worldId", "requestId"],
    ["asc", "asc"],
  ));
}

export function markWorldPublicationRecoveredV1(
  journal: WorldChangeJournalV1,
  worldId: string,
  requestId: string,
): void {
  const state = getWorldPublicationRecoveryStateV1(journal, worldId);
  if (isNil(state) || state.requestId !== requestId) {
    publicationRecoveryConflict(
      `World '${worldId}' does not have pending Request '${requestId}'.`,
    );
  }
  if (state.status === "recovered") return;
  putWorldPublicationRecoveryStateV1(
    journal,
    worldId,
    requestId,
    "recovered",
  );
}

export function advanceWorldChangeCleanupReportV1(input: {
  readonly journal: WorldChangeJournalV1;
  readonly authoringEditSessionId: string;
  readonly report: WorldChangeCleanupReportV1;
}): WorldChangeCleanupReportV1 {
  const next = parseWorldChangeCleanupReportV1(input.report);
  const current = getCleanupReportV1(
    input.journal,
    input.authoringEditSessionId,
    next.cleanupOperationId,
  );
  if (isNil(current)) {
    cleanupReportConflict("The scheduled cleanup report does not exist.");
  }
  if (isEqual(current, next)) {
    if (isTerminalCleanupStatus(current.status)) return next;
    cleanupReportConflict("A non-terminal cleanup attempt must advance.");
  }
  if (
    current.id !== next.id ||
    current.requestId !== next.requestId ||
    current.cleanupOperationId !== next.cleanupOperationId ||
    current.previousWorldSessionId !== next.previousWorldSessionId
  ) {
    cleanupReportConflict("Cleanup identity is immutable.");
  }
  if (isTerminalCleanupStatus(current.status)) {
    cleanupReportConflict("A terminal cleanup report is immutable.");
  }
  if (next.attemptCount !== current.attemptCount + 1) {
    cleanupReportConflict("Cleanup attemptCount must increase by exactly one.");
  }
  if (
    next.status !== "retrying" &&
    next.status !== "released" &&
    next.status !== "quarantined"
  ) {
    cleanupReportConflict("Cleanup status cannot move backward.");
  }
  return parseWorldChangeCleanupReportV1(putCleanupReportV1(
    input.journal,
    input.authoringEditSessionId,
    next,
  ));
}
