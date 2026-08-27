import type {
  Sha256HashV1,
  WorldChangeCleanupReportV1,
} from "@whitebox-world/authoring-edit";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import type {
  AuthoringRevisionHeadV1,
  CreateWorldChangeJournalInputV1,
  DurableRequestRecordV1,
  DurableRequestStateV1,
  WorldPublicationRecoveryStatusV1,
  WorldChangeJournalTransactionOperationV1,
  WorldChangeJournalTransactionV1,
  WorldChangeJournalV1,
  WorldChangeJournalWalV1,
} from "./types.js";

const GENESIS_TRANSACTION_HASH = sha256CanonicalJson(
  "worldkit-world-change-journal-genesis-v1",
) as Sha256HashV1;

class WorldChangeJournal implements WorldChangeJournalV1 {
  public readonly brand = "WorldChangeJournalV1" as const;
  public readonly records = new Map<string, DurableRequestRecordV1>();
  public readonly changeSetHashes = new Map<string, DurableRequestRecordV1["changeSetHash"]>();
  public readonly revisions = new Map<string, AuthoringRevisionHeadV1>();
  public readonly cleanupReports = new Map<string, WorldChangeCleanupReportV1>();
  public readonly publicationFenceTokensByWorldId = new Map<string, string>();
  public readonly publicationRecoveryStatesByWorldId = new Map<
    string,
    Readonly<{
      requestId: string;
      status: WorldPublicationRecoveryStatusV1;
    }>
  >();
  public revisionSequence = 0;
  public transactionSequence = 0;
  public lastTransactionHash: Sha256HashV1 = GENESIS_TRANSACTION_HASH;
  public fencingToken: string | undefined;

  constructor(public readonly wal?: WorldChangeJournalWalV1) {
    const transactions = wal?.readTransactions() ?? [];
    validateWorldChangeJournalTransactionsV1(transactions);
    for (const transaction of transactions) {
      applyOperations(this, transaction.operations, true);
      this.transactionSequence = transaction.sequence;
      this.lastTransactionHash = transaction.transactionHash;
    }
  }
}

function corrupt(message: string): never {
  throw new Error(`WORLD_CHANGE_JOURNAL_WAL_CORRUPT: ${message}`);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return !isNil(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length &&
    keys.every((key, index) => key === expected[index]);
}

function isSha256(value: unknown): value is DurableRequestRecordV1["changeSetHash"] {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function assertOperation(operation: unknown): asserts operation is WorldChangeJournalTransactionOperationV1 {
  if (!isRecord(operation) || typeof operation.type !== "string") {
    corrupt("Transaction operation must be an object with a type.");
  }
  if (operation.type === "request-record-put") {
    if (
      !hasExactKeys(operation, ["type", "key", "record"]) ||
      typeof operation.key !== "string" ||
      !isRecord(operation.record)
    ) {
      corrupt("request-record-put operation is invalid.");
    }
    return;
  }
  if (operation.type === "change-set-hash-lock") {
    if (
      !hasExactKeys(operation, ["type", "key", "changeSetHash"]) ||
      typeof operation.key !== "string" ||
      !isSha256(operation.changeSetHash)
    ) {
      corrupt("change-set-hash-lock operation is invalid.");
    }
    return;
  }
  if (operation.type === "revision-head-put") {
    if (
      !hasExactKeys(operation, ["type", "key", "head"]) ||
      typeof operation.key !== "string" ||
      !isRecord(operation.head)
    ) {
      corrupt("revision-head-put operation is invalid.");
    }
    return;
  }
  if (operation.type === "revision-sequence-set") {
    if (
      !hasExactKeys(operation, ["type", "revisionSequence"]) ||
      !Number.isSafeInteger(operation.revisionSequence) ||
      Number(operation.revisionSequence) < 0
    ) {
      corrupt("revision-sequence-set operation is invalid.");
    }
    return;
  }
  if (operation.type === "cleanup-report-put") {
    if (
      !hasExactKeys(operation, ["type", "key", "report"]) ||
      typeof operation.key !== "string" ||
      !isRecord(operation.report)
    ) {
      corrupt("cleanup-report-put operation is invalid.");
    }
    return;
  }
  if (operation.type === "publication-recovery-state-put") {
    if (
      !hasExactKeys(operation, ["type", "worldId", "requestId", "status"]) ||
      typeof operation.worldId !== "string" ||
      operation.worldId.length === 0 ||
      typeof operation.requestId !== "string" ||
      operation.requestId.length === 0 ||
      !["pending", "recovered"].includes(operation.status as string)
    ) {
      corrupt("publication-recovery-state-put operation is invalid.");
    }
    return;
  }
  if (operation.type === "recovery-fencing-token-set") {
    if (
      !hasExactKeys(operation, ["type", "fencingToken"]) ||
      typeof operation.fencingToken !== "string" ||
      operation.fencingToken.length === 0
    ) {
      corrupt("recovery-fencing-token-set operation is invalid.");
    }
    return;
  }
  corrupt(`Unknown transaction operation '${operation.type}'.`);
}

function transactionHash(
  input: Omit<WorldChangeJournalTransactionV1, "transactionHash">,
): Sha256HashV1 {
  return sha256CanonicalJson(input) as Sha256HashV1;
}

function assertTransaction(
  input: unknown,
  expectedSequence: number,
  expectedPreviousTransactionHash: Sha256HashV1,
): asserts input is WorldChangeJournalTransactionV1 {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "kind",
      "schemaVersion",
      "sequence",
      "previousTransactionHash",
      "operations",
      "transactionHash",
    ]) ||
    input.kind !== "worldkit-world-change-journal-transaction" ||
    input.schemaVersion !== 1 ||
    input.sequence !== expectedSequence ||
    input.previousTransactionHash !== expectedPreviousTransactionHash ||
    !Array.isArray(input.operations) ||
    input.operations.length === 0 ||
    !isSha256(input.previousTransactionHash) ||
    !isSha256(input.transactionHash)
  ) {
    corrupt(`Transaction ${expectedSequence} envelope or hash chain is invalid.`);
  }
  input.operations.forEach(assertOperation);
  const calculated = transactionHash({
    kind: input.kind,
    schemaVersion: input.schemaVersion,
    sequence: input.sequence,
    previousTransactionHash: input.previousTransactionHash,
    operations: input.operations,
  });
  if (calculated !== input.transactionHash) {
    corrupt(`Transaction ${expectedSequence} content hash is invalid.`);
  }
}

export function validateWorldChangeJournalTransactionsV1(
  transactions: readonly WorldChangeJournalTransactionV1[],
): void {
  let sequence = 0;
  let previousTransactionHash = GENESIS_TRANSACTION_HASH;
  for (const transaction of transactions) {
    assertTransaction(transaction, sequence + 1, previousTransactionHash);
    sequence = transaction.sequence;
    previousTransactionHash = transaction.transactionHash;
  }
}

function asJournal(journal: WorldChangeJournalV1): WorldChangeJournal {
  if (!(journal instanceof WorldChangeJournal)) {
    throw new TypeError("WorldChangeJournalV1 is required");
  }
  return journal;
}

function applyOperations(
  journal: WorldChangeJournal,
  operations: readonly WorldChangeJournalTransactionOperationV1[],
  isRecovery: boolean,
): void {
  for (const operation of operations) {
    if (operation.type === "request-record-put") {
      journal.records.set(operation.key, structuredClone(operation.record));
      continue;
    }
    if (operation.type === "change-set-hash-lock") {
      const current = journal.changeSetHashes.get(operation.key);
      if (isRecovery && !isNil(current) && current !== operation.changeSetHash) {
        corrupt(`ChangeSet lock '${operation.key}' changed hash during replay.`);
      }
      journal.changeSetHashes.set(operation.key, operation.changeSetHash);
      continue;
    }
    if (operation.type === "revision-head-put") {
      journal.revisions.set(operation.key, structuredClone(operation.head));
      continue;
    }
    if (operation.type === "revision-sequence-set") {
      if (isRecovery && operation.revisionSequence < journal.revisionSequence) {
        corrupt("Revision sequence moved backward during replay.");
      }
      journal.revisionSequence = operation.revisionSequence;
      continue;
    }
    if (operation.type === "cleanup-report-put") {
      journal.cleanupReports.set(operation.key, structuredClone(operation.report));
      continue;
    }
    if (operation.type === "publication-recovery-state-put") {
      const current = journal.publicationRecoveryStatesByWorldId.get(
        operation.worldId,
      );
      if (
        operation.status === "recovered" &&
        (isNil(current) || current.requestId !== operation.requestId)
      ) {
        if (isRecovery) {
          corrupt(
            `Publication recovery '${operation.worldId}' completed without its pending request.`,
          );
        }
        throw new Error(
          "WORLD_CHANGE_PUBLICATION_RECOVERY_CONFLICT: Recovery request is not pending.",
        );
      }
      if (
        operation.status === "pending" &&
        !isNil(current) &&
        (
          current.status === "pending" ||
          current.requestId === operation.requestId
        )
      ) {
        if (isRecovery) {
          corrupt(`Publication recovery '${operation.worldId}' regressed or changed request.`);
        }
        throw new Error(
          "WORLD_CHANGE_PUBLICATION_RECOVERY_CONFLICT: Recovery state cannot regress or replace a pending request.",
        );
      }
      journal.publicationRecoveryStatesByWorldId.set(
        operation.worldId,
        Object.freeze({
          requestId: operation.requestId,
          status: operation.status,
        }),
      );
      continue;
    }
    journal.fencingToken = operation.fencingToken;
  }
}

function commitTransaction(
  journal: WorldChangeJournalV1,
  operations: readonly WorldChangeJournalTransactionOperationV1[],
): void {
  const internals = asJournal(journal);
  const transactionWithoutHash = {
    kind: "worldkit-world-change-journal-transaction" as const,
    schemaVersion: 1 as const,
    sequence: internals.transactionSequence + 1,
    previousTransactionHash: internals.lastTransactionHash,
    operations: structuredClone(operations),
  };
  const transaction: WorldChangeJournalTransactionV1 = {
    ...transactionWithoutHash,
    transactionHash: transactionHash(transactionWithoutHash),
  };
  internals.wal?.appendTransaction(transaction);
  applyOperations(internals, transaction.operations, false);
  internals.transactionSequence = transaction.sequence;
  internals.lastTransactionHash = transaction.transactionHash;
}

export function requestJournalKeyV1(
  authoringEditSessionId: string,
  requestId: string,
): string {
  return `${authoringEditSessionId}::${requestId}`;
}

export function changeSetJournalKeyV1(worldId: string, changeSetId: string): string {
  return `${worldId}::${changeSetId}`;
}

export function cleanupJournalKeyV1(
  authoringEditSessionId: string,
  cleanupOperationId: string,
): string {
  return `${authoringEditSessionId}::${cleanupOperationId}`;
}

export function createWorldChangeJournalV1(
  input: CreateWorldChangeJournalInputV1 = {},
): WorldChangeJournalV1 {
  return new WorldChangeJournal(input.wal);
}

export function seedAuthoringRevisionHeadV1(
  journal: WorldChangeJournalV1,
  head: AuthoringRevisionHeadV1,
): void {
  const internals = asJournal(journal);
  const match = /^revision:\/\/([^/]+)\/(\d+)$/.exec(head.revisionRef);
  const revisionSequence = !isNil(match) && match[1] === head.worldId
    ? Math.max(internals.revisionSequence, Number(match[2]))
    : Math.max(internals.revisionSequence, 1);
  commitTransaction(journal, [
    { type: "revision-head-put", key: head.worldId, head },
    { type: "revision-sequence-set", revisionSequence },
  ]);
}

export function getAuthoringRevisionHeadV1(
  journal: WorldChangeJournalV1,
  worldId: string,
): AuthoringRevisionHeadV1 | undefined {
  if (asJournal(journal).publicationFenceTokensByWorldId.has(worldId)) {
    throw new Error(
      "WORLD_CHANGE_PUBLICATION_FENCE_ACTIVE: Authoring revision is hidden until Runtime handle swap.",
    );
  }
  if (isWorldPublicationRecoveryPendingV1(journal, worldId)) {
    throw new Error(
      "WORLD_CHANGE_PUBLICATION_RECOVERY_REQUIRED: Runtime publication must recover before the Authoring revision is exposed.",
    );
  }
  const head = asJournal(journal).revisions.get(worldId);
  return isNil(head) ? undefined : structuredClone(head);
}

export function getAuthoringRevisionHeadForStartupRecoveryV1(
  journal: WorldChangeJournalV1,
  worldId: string,
): AuthoringRevisionHeadV1 | undefined {
  const head = asJournal(journal).revisions.get(worldId);
  return isNil(head) ? undefined : structuredClone(head);
}

export function getWorldPublicationRecoveryStateV1(
  journal: WorldChangeJournalV1,
  worldId: string,
): Readonly<{
  readonly requestId: string;
  readonly status: WorldPublicationRecoveryStatusV1;
}> | undefined {
  const state = asJournal(journal).publicationRecoveryStatesByWorldId.get(worldId);
  return isNil(state) ? undefined : Object.freeze(structuredClone(state));
}

export function listWorldPublicationRecoveryStatesV1(
  journal: WorldChangeJournalV1,
): readonly Readonly<{
  readonly worldId: string;
  readonly requestId: string;
  readonly status: WorldPublicationRecoveryStatusV1;
}>[] {
  return [...asJournal(journal).publicationRecoveryStatesByWorldId.entries()].map(
    ([worldId, state]) => Object.freeze({ worldId, ...structuredClone(state) }),
  );
}

export function putWorldPublicationRecoveryStateV1(
  journal: WorldChangeJournalV1,
  worldId: string,
  requestId: string,
  status: WorldPublicationRecoveryStatusV1,
): void {
  commitTransaction(journal, [{
    type: "publication-recovery-state-put",
    worldId,
    requestId,
    status,
  }]);
}

export function isWorldPublicationRecoveryPendingV1(
  journal: WorldChangeJournalV1,
  worldId: string,
): boolean {
  return getWorldPublicationRecoveryStateV1(journal, worldId)?.status === "pending";
}

export function acquireWorldPublicationFenceV1(
  journal: WorldChangeJournalV1,
  worldId: string,
  fencingToken: string,
): () => void {
  const internals = asJournal(journal);
  if (
    internals.publicationFenceTokensByWorldId.has(worldId) ||
    isWorldPublicationRecoveryPendingV1(journal, worldId)
  ) {
    throw new Error(
      "WORLD_CHANGE_PUBLICATION_CONFLICT: World publication fence is already held.",
    );
  }
  internals.publicationFenceTokensByWorldId.set(worldId, fencingToken);
  let isReleased = false;
  return () => {
    if (isReleased) return;
    isReleased = true;
    if (internals.publicationFenceTokensByWorldId.get(worldId) === fencingToken) {
      internals.publicationFenceTokensByWorldId.delete(worldId);
    }
  };
}

export function isWorldPublicationFencedV1(
  journal: WorldChangeJournalV1,
  worldId: string,
): boolean {
  const internals = asJournal(journal);
  return internals.publicationFenceTokensByWorldId.has(worldId) ||
    isWorldPublicationRecoveryPendingV1(journal, worldId);
}

export function nextAuthoringRevisionRefV1(
  journal: WorldChangeJournalV1,
  worldId: string,
): string {
  const revisionSequence = asJournal(journal).revisionSequence + 1;
  commitTransaction(journal, [{ type: "revision-sequence-set", revisionSequence }]);
  return `revision://${worldId}/${revisionSequence}`;
}

export function getDurableRequestRecordV1(
  journal: WorldChangeJournalV1,
  authoringEditSessionId: string,
  requestId: string,
): DurableRequestRecordV1 | undefined {
  const record = asJournal(journal).records.get(
    requestJournalKeyV1(authoringEditSessionId, requestId),
  );
  return isNil(record) ? undefined : structuredClone(record);
}

export function listDurableRequestRecordsV1(
  journal: WorldChangeJournalV1,
): readonly DurableRequestRecordV1[] {
  return [...asJournal(journal).records.values()].map((record) =>
    structuredClone(record),
  );
}

export function nonTerminalRequestCountV1(journal: WorldChangeJournalV1): number {
  return listDurableRequestRecordsV1(journal).filter(
    (record) => !isTerminalStateV1(record.state),
  ).length;
}

export function hasNonTerminalApplyOnWorldV1(
  journal: WorldChangeJournalV1,
  worldId: string,
  exceptRequestId?: string,
): boolean {
  return listDurableRequestRecordsV1(journal).some((record) =>
    record.request.worldId === worldId &&
    record.request.mode === "apply" &&
    record.state !== "committed" &&
    record.state !== "rejected" &&
    (isNil(exceptRequestId) || record.request.id !== exceptRequestId)
  );
}

export function putDurableRequestRecordV1(
  journal: WorldChangeJournalV1,
  record: DurableRequestRecordV1,
): DurableRequestRecordV1 {
  const snapshot = structuredClone(record);
  commitTransaction(journal, [{
    type: "request-record-put",
    key: requestJournalKeyV1(record.request.authoringEditSessionId, record.request.id),
    record: snapshot,
  }]);
  return snapshot;
}

export function lockedChangeSetHashV1(
  journal: WorldChangeJournalV1,
  worldId: string,
  changeSetId: string,
): DurableRequestRecordV1["changeSetHash"] | undefined {
  return asJournal(journal).changeSetHashes.get(
    changeSetJournalKeyV1(worldId, changeSetId),
  );
}

export function lockChangeSetHashV1(
  journal: WorldChangeJournalV1,
  worldId: string,
  changeSetId: string,
  changeSetHash: DurableRequestRecordV1["changeSetHash"],
): void {
  commitTransaction(journal, [{
    type: "change-set-hash-lock",
    key: changeSetJournalKeyV1(worldId, changeSetId),
    changeSetHash,
  }]);
}

export function commitAuthoringRevisionV1(
  journal: WorldChangeJournalV1,
  head: AuthoringRevisionHeadV1,
  record: DurableRequestRecordV1,
  cleanupReport?: WorldChangeCleanupReportV1,
): DurableRequestRecordV1 {
  const committed = structuredClone(record);
  const operations: WorldChangeJournalTransactionOperationV1[] = [
    { type: "revision-head-put", key: head.worldId, head },
    {
      type: "request-record-put",
      key: requestJournalKeyV1(
        committed.request.authoringEditSessionId,
        committed.request.id,
      ),
      record: committed,
    },
  ];
  if (!isNil(cleanupReport)) {
    operations.push({
      type: "cleanup-report-put",
      key: cleanupJournalKeyV1(
        committed.request.authoringEditSessionId,
        cleanupReport.cleanupOperationId,
      ),
      report: structuredClone(cleanupReport),
    });
    if (
      committed.state !== "committed" ||
      committed.receipt?.status !== "committed" ||
      committed.receipt.requestedOutcome !== "publish-runtime" ||
      committed.receipt.publicationMode !== "full-reload" ||
      cleanupReport.requestId !== committed.request.id ||
      cleanupReport.cleanupOperationId !==
        committed.receipt.runtimeCleanup.cleanupOperationId
    ) {
      throw new Error(
        "WORLD_CHANGE_PUBLICATION_RECOVERY_CONFLICT: Durable publication recovery requires one matching Full Reload commit.",
      );
    }
    operations.push({
      type: "publication-recovery-state-put",
      worldId: committed.request.worldId,
      requestId: committed.request.id,
      status: "pending",
    });
  }
  commitTransaction(journal, operations);
  return committed;
}

export function setRecoveryFencingTokenV1(
  journal: WorldChangeJournalV1,
  fencingToken: string,
): void {
  commitTransaction(journal, [{ type: "recovery-fencing-token-set", fencingToken }]);
}

export function recoveryFencingTokenV1(
  journal: WorldChangeJournalV1,
): string | undefined {
  return asJournal(journal).fencingToken;
}

export function putCleanupReportV1(
  journal: WorldChangeJournalV1,
  authoringEditSessionId: string,
  report: WorldChangeCleanupReportV1,
): WorldChangeCleanupReportV1 {
  const snapshot = structuredClone(report);
  commitTransaction(journal, [{
    type: "cleanup-report-put",
    key: cleanupJournalKeyV1(authoringEditSessionId, report.cleanupOperationId),
    report: snapshot,
  }]);
  return snapshot;
}

export function getCleanupReportV1(
  journal: WorldChangeJournalV1,
  authoringEditSessionId: string,
  cleanupOperationId: string,
): WorldChangeCleanupReportV1 | undefined {
  const report = asJournal(journal).cleanupReports.get(
    cleanupJournalKeyV1(authoringEditSessionId, cleanupOperationId),
  );
  return isNil(report) ? undefined : structuredClone(report);
}

export function isTerminalStateV1(state: DurableRequestStateV1): boolean {
  return (
    state === "validated" ||
    state === "dry-run-succeeded" ||
    state === "committed" ||
    state === "rejected"
  );
}
