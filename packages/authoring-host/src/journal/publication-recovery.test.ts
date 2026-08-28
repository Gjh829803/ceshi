import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  AUTHORING_EDIT_SCOPES_V1,
  parseAuthoringEditPolicyProjectionV1,
  parseWorldChangeCleanupReportQueryV1,
  parseWorldChangeCleanupReportV1,
  type WorldChangeCleanupReportV1,
} from "@whitebox-world/authoring-edit";
import { describe, expect, it } from "vitest";

import {
  advanceWorldChangeCleanupReportV1,
  createWorldChangeJournalV1,
  queryWorldChangeCleanupReportV1,
} from "../index.js";
import {
  getCleanupReportV1,
  putCleanupReportV1,
} from "./store.js";
import type {
  AuthoringEditSessionV1,
  WorldChangeJournalTransactionV1,
  WorldChangeJournalV1,
} from "./types.js";

const NOW = 1_700_000_000_000;
const SESSION_ID = "edit-session-cleanup-1";
const CLEANUP_OPERATION_ID = "cleanup.replaced-runtime.101";
const REQUEST_ID = "request.apply.publish-cleanup.101";

function session(): AuthoringEditSessionV1 {
  return {
    authoringEditSessionId: SESSION_ID,
    authorizationEpoch: 1,
    isActive: true,
    expiresAtUnixMilliseconds: NOW + 3_600_000,
    scopes: [...AUTHORING_EDIT_SCOPES_V1],
    policy: parseAuthoringEditPolicyProjectionV1({
      allowedWorldIds: ["basic-world"],
      registryLockHash: `sha256:${"a".repeat(64)}` as Sha256HashV1,
      capabilitySetHash: `sha256:${"b".repeat(64)}` as Sha256HashV1,
      projectionProfileRef:
        "worldkit://ai-schema-projection-profile/constrained-json@1",
      allowedWorldChangeOperationTypes: [],
      allowedOverridePaths: [],
      requiredGateProfileRefs: [],
      workloadBudget: {
        maximumChangeSetBytes: 1,
        maximumPreconditionCount: 1,
        maximumOperationCount: 1,
        maximumConcurrentNonTerminalRequestCount: 1,
        maximumPreparedCandidateCount: 1,
        maximumPreparedCandidateBytes: 1,
        maximumPreparedCandidateRetentionMilliseconds: 1,
      },
    }),
    hasActiveRuntimeBinding: true,
  };
}

function cleanupReport(
  overrides: Partial<WorldChangeCleanupReportV1> = {},
): WorldChangeCleanupReportV1 {
  return parseWorldChangeCleanupReportV1({
    kind: "worldkit-world-change-cleanup-report",
    schemaVersion: 1,
    id: "cleanup-report.publish-cleanup.101",
    requestId: REQUEST_ID,
    cleanupOperationId: CLEANUP_OPERATION_ID,
    previousWorldSessionId: "world-session-100",
    status: "scheduled",
    attemptCount: 0,
    diagnostics: [],
    ...overrides,
  });
}

function journalWithScheduledCleanup(): {
  readonly journal: WorldChangeJournalV1;
  readonly transactions: WorldChangeJournalTransactionV1[];
  readonly scheduled: WorldChangeCleanupReportV1;
} {
  const transactions: WorldChangeJournalTransactionV1[] = [];
  const journal = createWorldChangeJournalV1({
    wal: {
      brand: "WorldChangeJournalWalV1",
      readTransactions: () => transactions,
      appendTransaction: (transaction) => {
        transactions.push(transaction);
      },
    },
  });
  const scheduled = cleanupReport();
  putCleanupReportV1(journal, SESSION_ID, scheduled);
  return { journal, transactions, scheduled };
}

function advance(
  journal: WorldChangeJournalV1,
  report: WorldChangeCleanupReportV1,
): WorldChangeCleanupReportV1 {
  return advanceWorldChangeCleanupReportV1({
    journal,
    authoringEditSessionId: SESSION_ID,
    report,
  });
}

describe("durable publication cleanup progress", () => {
  it("accepts scheduled or retrying cleanup quarantine with strictly increasing attempts", () => {
    const direct = journalWithScheduledCleanup();
    expect(advance(direct.journal, cleanupReport({
      status: "quarantined",
      attemptCount: 1,
    }))).toMatchObject({ status: "quarantined", attemptCount: 1 });

    const retried = journalWithScheduledCleanup();
    const retrying = advance(retried.journal, cleanupReport({
      status: "retrying",
      attemptCount: 1,
    }));
    expect(advance(retried.journal, cleanupReport({
      ...retrying,
      status: "quarantined",
      attemptCount: 2,
    }))).toMatchObject({ status: "quarantined", attemptCount: 2 });
  });

  it.each([
    ["report id", { id: "cleanup-report.changed" }],
    ["request id", { requestId: "request.apply.changed" }],
    ["cleanup operation id", { cleanupOperationId: "cleanup.changed" }],
    ["previous WorldSession id", { previousWorldSessionId: "world-session.changed" }],
  ] as const)("rejects changed %s", (_label, changed) => {
    const { journal } = journalWithScheduledCleanup();
    expect(() => advance(journal, cleanupReport({
      ...changed,
      status: "retrying",
      attemptCount: 1,
    }))).toThrow(/WORLD_CHANGE_CLEANUP_REPORT_CONFLICT/);
  });

  it("rejects equal, decreased, and reverse cleanup attempts", () => {
    const { journal } = journalWithScheduledCleanup();
    const retrying = advance(journal, cleanupReport({
      status: "retrying",
      attemptCount: 1,
    }));
    expect(() => advance(journal, cleanupReport({
      ...retrying,
      attemptCount: 1,
    }))).toThrow(/WORLD_CHANGE_CLEANUP_REPORT_CONFLICT/);
    expect(() => advance(journal, cleanupReport({
      ...retrying,
      attemptCount: 0,
    }))).toThrow(/WORLD_CHANGE_CLEANUP_REPORT_CONFLICT/);
    expect(() => advance(journal, cleanupReport({
      ...retrying,
      status: "scheduled",
      attemptCount: 2,
    }))).toThrow(/WORLD_CHANGE_CLEANUP_REPORT_CONFLICT/);
  });

  it("accepts only byte-identical terminal replay", () => {
    const { journal } = journalWithScheduledCleanup();
    const released = advance(journal, cleanupReport({
      status: "released",
      attemptCount: 1,
    }));
    expect(advance(journal, released)).toEqual(released);
    expect(() => advance(journal, cleanupReport({
      ...released,
      status: "quarantined",
    }))).toThrow(/WORLD_CHANGE_CLEANUP_REPORT_CONFLICT/);
    expect(() => advance(journal, cleanupReport({
      ...released,
      attemptCount: 2,
    }))).toThrow(/WORLD_CHANGE_CLEANUP_REPORT_CONFLICT/);
  });

  it("keeps cleanup queries read-only", () => {
    const { journal, transactions, scheduled } = journalWithScheduledCleanup();
    const transactionCount = transactions.length;
    expect(queryWorldChangeCleanupReportV1({
      journal,
      session: session(),
      query: parseWorldChangeCleanupReportQueryV1({
        kind: "worldkit-world-change-cleanup-report-query",
        schemaVersion: 1,
        id: "q.cleanup.read-only.101",
        authoringEditSessionId: SESSION_ID,
        cleanupOperationId: CLEANUP_OPERATION_ID,
      }),
      nowUnixMilliseconds: NOW,
    })).toEqual({ status: "found", report: scheduled });
    expect(transactions).toHaveLength(transactionCount);
    expect(getCleanupReportV1(
      journal,
      SESSION_ID,
      CLEANUP_OPERATION_ID,
    )).toEqual(scheduled);
  });
});
