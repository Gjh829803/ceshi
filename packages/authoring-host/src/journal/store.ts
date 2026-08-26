import { isNil } from "lodash-es";

import type {
  AuthoringRevisionHeadV1,
  DurableRequestRecordV1,
  DurableRequestStateV1,
  WorldChangeJournalV1,
} from "./types.js";

class WorldChangeJournal implements WorldChangeJournalV1 {
  public readonly brand = "WorldChangeJournalV1" as const;
  public readonly records = new Map<string, DurableRequestRecordV1>();
  public readonly changeSetHashes = new Map<string, DurableRequestRecordV1["changeSetHash"]>();
  public readonly revisions = new Map<string, AuthoringRevisionHeadV1>();
  public revisionSequence = 0;
  public fencingToken: string | undefined;
}

function asJournal(journal: WorldChangeJournalV1): WorldChangeJournal {
  if (!(journal instanceof WorldChangeJournal)) {
    throw new TypeError("WorldChangeJournalV1 is required");
  }
  return journal;
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

export function createWorldChangeJournalV1(): WorldChangeJournalV1 {
  return new WorldChangeJournal();
}

export function seedAuthoringRevisionHeadV1(
  journal: WorldChangeJournalV1,
  head: AuthoringRevisionHeadV1,
): void {
  const internals = asJournal(journal);
  internals.revisions.set(head.worldId, structuredClone(head));
  const match = /^revision:\/\/([^/]+)\/(\d+)$/.exec(head.revisionRef);
  if (!isNil(match) && match[1] === head.worldId) {
    internals.revisionSequence = Math.max(
      internals.revisionSequence,
      Number(match[2]),
    );
    return;
  }
  internals.revisionSequence = Math.max(internals.revisionSequence, 1);
}

export function getAuthoringRevisionHeadV1(
  journal: WorldChangeJournalV1,
  worldId: string,
): AuthoringRevisionHeadV1 | undefined {
  return asJournal(journal).revisions.get(worldId);
}

export function nextAuthoringRevisionRefV1(
  journal: WorldChangeJournalV1,
  worldId: string,
): string {
  const internals = asJournal(journal);
  internals.revisionSequence += 1;
  return `revision://${worldId}/${internals.revisionSequence}`;
}

export function getDurableRequestRecordV1(
  journal: WorldChangeJournalV1,
  authoringEditSessionId: string,
  requestId: string,
): DurableRequestRecordV1 | undefined {
  return asJournal(journal).records.get(
    requestJournalKeyV1(authoringEditSessionId, requestId),
  );
}

export function listDurableRequestRecordsV1(
  journal: WorldChangeJournalV1,
): readonly DurableRequestRecordV1[] {
  return [...asJournal(journal).records.values()];
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
  asJournal(journal).records.set(
    requestJournalKeyV1(record.request.authoringEditSessionId, record.request.id),
    snapshot,
  );
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
  asJournal(journal).changeSetHashes.set(
    changeSetJournalKeyV1(worldId, changeSetId),
    changeSetHash,
  );
}

export function commitAuthoringRevisionV1(
  journal: WorldChangeJournalV1,
  head: AuthoringRevisionHeadV1,
  record: DurableRequestRecordV1,
): DurableRequestRecordV1 {
  const internals = asJournal(journal);
  const committed = structuredClone(record);
  internals.revisions.set(head.worldId, structuredClone(head));
  internals.records.set(
    requestJournalKeyV1(committed.request.authoringEditSessionId, committed.request.id),
    committed,
  );
  return committed;
}

export function setRecoveryFencingTokenV1(
  journal: WorldChangeJournalV1,
  fencingToken: string,
): void {
  asJournal(journal).fencingToken = fencingToken;
}

export function recoveryFencingTokenV1(
  journal: WorldChangeJournalV1,
): string | undefined {
  return asJournal(journal).fencingToken;
}

export function isTerminalStateV1(state: DurableRequestStateV1): boolean {
  return (
    state === "validated" ||
    state === "dry-run-succeeded" ||
    state === "committed" ||
    state === "rejected"
  );
}
