import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { hashAuthoringDocumentV4 } from "@whitebox-world/authoring";
import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  AUTHORING_EDIT_SCOPES_V1,
  hashWorldChangeReceiptV1,
  parseAuthoringEditPolicyProjectionV1,
  parseWorldChangeCleanupReportQueryV1,
  parseWorldChangeDiagnosticV1,
  parseWorldChangeReceiptQueryV1,
  parseWorldChangeRequestV1,
  parseWorldChangeSetV1,
  WORLD_CHANGE_OPERATION_TYPES_V1,
  type AuthoringEditPolicyProjectionV1,
  type Sha256HashV1,
  type WorldChangeRequestV1,
  type WorldChangeSetV1,
} from "@whitebox-world/authoring-edit";
import { isNil } from "lodash-es";
import {
  createInMemoryWorldPackageStoreV1,
  createWorldPackageBuildContextFixtureV2,
} from "@whitebox-world/world-package/testing";
import { describe, expect, it } from "vitest";

import {
  advanceWorldChangeCleanupReportV1,
  createPreparedCandidateLeaseStoreV1,
  createWorldChangeJournalV1,
  getAuthoringRevisionHeadV1,
  listPendingWorldPublicationRecoveriesV1,
  lookupPreparedCandidateV1,
  markWorldPublicationRecoveredV1,
  queryWorldChangeCleanupReportV1,
  queryWorldChangeReceiptV1,
  recoverWorldChangeRequestV1,
  seedAuthoringRevisionHeadV1,
  submitWorldChangeRequestV1,
  sweepExpiredPreparedCandidatesV1,
} from "../index.js";
import type {
  AuthoringEditSessionV1,
  PublishRuntimeReplacementV1,
  SubmitWorldChangeRequestResultV1,
  WorldChangeJournalTransactionV1,
  WorldChangeJournalV1,
} from "./types.js";

const NOW = 1_700_000_000_000;
const SESSION_ID = "edit-session-17";
const HASH_LOCK = `sha256:${"a".repeat(64)}` as Sha256HashV1;
const HASH_CAPS = `sha256:${"b".repeat(64)}` as Sha256HashV1;
const EXAMPLES_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../examples/authoring",
);
const GATE_REF = "worldkit://validation-profile/outdoor-world-package-dev@1";
const WORLD_PACKAGE_STORE = createInMemoryWorldPackageStoreV1();
const WORLD_PACKAGE_BUILD_CONTEXT = createWorldPackageBuildContextFixtureV2();

function generousBudget(overrides: {
  readonly maximumPreparedCandidateRetentionMilliseconds?: number;
} = {}) {
  return {
    maximumChangeSetBytes: 1_000_000,
    maximumPreconditionCount: 64,
    maximumOperationCount: 64,
    maximumConcurrentNonTerminalRequestCount: 8,
    maximumPreparedCandidateCount: 8,
    maximumPreparedCandidateBytes: 2_000_000,
    maximumPreparedCandidateRetentionMilliseconds:
      overrides.maximumPreparedCandidateRetentionMilliseconds ?? 3_600_000,
  };
}

function policy(extras: {
  readonly requiredGateProfileRefs?: readonly string[];
  readonly maximumPreparedCandidateRetentionMilliseconds?: number;
} = {}): AuthoringEditPolicyProjectionV1 {
  return parseAuthoringEditPolicyProjectionV1({
    allowedWorldIds: ["basic-world"],
    registryLockHash: HASH_LOCK,
    capabilitySetHash: HASH_CAPS,
    projectionProfileRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
    allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
    allowedOverridePaths: [],
    requiredGateProfileRefs: extras.requiredGateProfileRefs ?? [],
    workloadBudget: generousBudget(extras),
  });
}

function session(overrides: {
  readonly expiresAtUnixMilliseconds?: number;
  readonly isActive?: boolean;
  readonly policy?: AuthoringEditPolicyProjectionV1;
} = {}): AuthoringEditSessionV1 {
  return {
    authoringEditSessionId: SESSION_ID,
    authorizationEpoch: 1,
    isActive: overrides.isActive ?? true,
    expiresAtUnixMilliseconds: overrides.expiresAtUnixMilliseconds ?? NOW + 3_600_000,
    scopes: [...AUTHORING_EDIT_SCOPES_V1],
    policy: overrides.policy ?? policy(),
    hasActiveRuntimeBinding: true,
  };
}

function loadChangeSet(name: "p16-add-house" | "p16-terrain-replace", specHash: Sha256HashV1): WorldChangeSetV1 {
  const raw = JSON.parse(
    readFileSync(join(EXAMPLES_ROOT, name, "change-set.json"), "utf8"),
  ) as Record<string, unknown>;
  return parseWorldChangeSetV1({
    ...raw,
    baseAuthoringSpecHash: specHash,
  });
}

function seeded(extras: {
  readonly policy?: AuthoringEditPolicyProjectionV1;
  readonly journal?: WorldChangeJournalV1;
} = {}) {
  const spec = createValidAuthoringSpec();
  const authoringSpecHash = hashAuthoringDocumentV4(spec) as Sha256HashV1;
  const journal = extras.journal ?? createWorldChangeJournalV1();
  seedAuthoringRevisionHeadV1(journal, {
    worldId: spec.id,
    revisionRef: `revision://${spec.id}/1`,
    authoringSpec: spec,
    authoringSpecHash,
  });
  return {
    spec,
    journal,
    leaseStore: createPreparedCandidateLeaseStoreV1(),
    authoringSpecHash,
    session: isNil(extras.policy) ? session() : session({ policy: extras.policy }),
    addHouse: loadChangeSet("p16-add-house", authoringSpecHash),
    terrainReplace: loadChangeSet("p16-terrain-replace", authoringSpecHash),
  };
}

function requestFor(
  mode: "dry-run" | "apply-authoring" | "apply-publish",
  changeSet: WorldChangeSetV1,
  extras: {
    readonly id?: string;
    readonly preparedCandidateRef?: string;
  } = {},
): WorldChangeRequestV1 {
  if (mode === "dry-run") {
    return parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: extras.id ?? "request.dry-run.f1",
      authoringEditSessionId: SESSION_ID,
      worldId: "basic-world",
      changeSet,
      mode: "dry-run",
    });
  }
  if (mode === "apply-publish") {
    if (isNil(extras.preparedCandidateRef)) {
      throw new Error("publish-runtime requires preparedCandidateRef");
    }
    return parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: extras.id ?? "request.apply.publish-f1",
      authoringEditSessionId: SESSION_ID,
      worldId: "basic-world",
      changeSet,
      mode: "apply",
      requestedOutcome: "publish-runtime",
      preparedCandidateRef: extras.preparedCandidateRef,
      runtimeExpectation: {
        runtimeSessionId: "runtime-session-9",
        expectedWorldSessionId: "world-session-31",
        expectedWorldPackageRootHash: `sha256:${"d".repeat(64)}`,
        targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
      },
    });
  }
  return parseWorldChangeRequestV1({
    kind: "worldkit-world-change-request",
    schemaVersion: 1,
    id: extras.id ?? "request.apply.authoring-f1",
    authoringEditSessionId: SESSION_ID,
    worldId: "basic-world",
    changeSet,
    mode: "apply",
    requestedOutcome: "authoring-only",
  });
}

function accepted(result: SubmitWorldChangeRequestResultV1) {
  if (result.status !== "accepted") throw new Error(`expected accepted, got ${result.status}`);
  return result;
}

function submit(
  journal: WorldChangeJournalV1,
  leaseStore: ReturnType<typeof createPreparedCandidateLeaseStoreV1>,
  request: WorldChangeRequestV1,
  extras: {
    readonly session?: AuthoringEditSessionV1;
    readonly nowUnixMilliseconds?: number;
    readonly publishRuntimeReplacement?: PublishRuntimeReplacementV1;
    readonly evaluateRequiredGates?: Parameters<
      typeof submitWorldChangeRequestV1
    >[0]["evaluateRequiredGates"];
    readonly crashAfterState?: Parameters<
      typeof submitWorldChangeRequestV1
    >[0]["crashAfterState"];
  } = {},
) {
  return submitWorldChangeRequestV1({
    journal,
    leaseStore,
    worldPackageStore: WORLD_PACKAGE_STORE,
    worldPackageBuildContext: WORLD_PACKAGE_BUILD_CONTEXT,
    resourceArtifacts: [],
    request,
    session: extras.session ?? session(),
    nowUnixMilliseconds: extras.nowUnixMilliseconds ?? NOW,
    ...(isNil(extras.publishRuntimeReplacement)
      ? {}
      : { publishRuntimeReplacement: extras.publishRuntimeReplacement }),
    ...(isNil(extras.evaluateRequiredGates)
      ? {}
      : { evaluateRequiredGates: extras.evaluateRequiredGates }),
    ...(isNil(extras.crashAfterState) ? {} : { crashAfterState: extras.crashAfterState }),
  });
}

function successfulPublishPort(cleanupStatus: "released" | "quarantined"): PublishRuntimeReplacementV1 {
  const previous = {
    runtimeSessionId: "runtime-session-9",
    worldSessionId: "world-session-31",
    worldPackageRootHash: `sha256:${"d".repeat(64)}` as Sha256HashV1,
    simulationTick: 12,
  };
  const current = {
    ...previous,
    worldSessionId: "world-session-32",
    simulationTick: 0,
  };
  return async ({ persistDurableCommit }) => {
    const releaseFence = persistDurableCommit({ previous, current });
    releaseFence();
    return {
      status: "published",
      previous,
      current,
      cleanupStatus,
      cleanupDiagnostics: cleanupStatus === "quarantined"
        ? [
            parseWorldChangeDiagnosticV1({
              severity: "error",
              code: "WORLD_CHANGE_CLEANUP_QUARANTINED",
              instancePath: "/runtimeCleanup",
              message: "Runtime cleanup entered quarantine.",
            }),
          ]
        : [],
    };
  };
}

describe("P16-F1 Full Reload adversarial publication", () => {
  it("hides the durable commit until the Runtime handle swap releases the fence", async () => {
    const { journal, leaseStore, addHouse, session: active } = seeded();
    const dryRun = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", addHouse, { id: "request.dry-run.fence" }),
      { session: active },
    ));
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected dry-run");
    }
    const applyRequest = requestFor("apply-publish", addHouse, {
      id: "request.apply.publish-fence",
      preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
    });
    const previous = {
      runtimeSessionId: "runtime-session-9",
      worldSessionId: "world-session-31",
      worldPackageRootHash: `sha256:${"d".repeat(64)}` as Sha256HashV1,
      simulationTick: 12,
    };
    const current = {
      ...previous,
      worldSessionId: "world-session-32",
      simulationTick: 0,
    };
    const committed = accepted(await submit(
      journal,
      leaseStore,
      applyRequest,
      {
        session: active,
        publishRuntimeReplacement: async ({ persistDurableCommit }) => {
          const releaseFence = persistDurableCommit({ previous, current }) as unknown;
          const duringCommit = queryWorldChangeReceiptV1({
            journal,
            session: active,
            query: parseWorldChangeReceiptQueryV1({
              kind: "worldkit-world-change-receipt-query",
              schemaVersion: 1,
              id: "q.receipt.fence.during-commit",
              authoringEditSessionId: SESSION_ID,
              requestId: applyRequest.id,
            }),
            nowUnixMilliseconds: NOW,
          });
          expect(duringCommit).toEqual({
            status: "pending",
            state: "preparing-runtime",
          });
          expect(() => getAuthoringRevisionHeadV1(journal, "basic-world")).toThrow(
            /WORLD_CHANGE_PUBLICATION_FENCE_ACTIVE/,
          );
          expect(typeof releaseFence).toBe("function");
          if (typeof releaseFence === "function") releaseFence();
          return {
            status: "published",
            previous,
            current,
            cleanupStatus: "released",
            cleanupDiagnostics: [],
          };
        },
      },
    ));
    expect(committed.receipt.status).toBe("committed");
    const afterSwap = queryWorldChangeReceiptV1({
      journal,
      session: active,
      query: parseWorldChangeReceiptQueryV1({
        kind: "worldkit-world-change-receipt-query",
        schemaVersion: 1,
        id: "q.receipt.fence.after-swap",
        authoringEditSessionId: SESSION_ID,
        requestId: applyRequest.id,
      }),
      nowUnixMilliseconds: NOW,
    });
    expect(afterSwap.status).toBe("found");
  });

  it("returns the stored committed Receipt when the publisher disconnects after durable commit", async () => {
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
    const { leaseStore, addHouse, session: active } = seeded({ journal });
    const dryRun = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", addHouse, { id: "request.dry-run.post-commit-drop" }),
      { session: active },
    ));
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected dry-run");
    }
    const applyRequest = requestFor("apply-publish", addHouse, {
      id: "request.apply.publish-post-commit-drop",
      preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
    });
    const previous = {
      runtimeSessionId: "runtime-session-9",
      worldSessionId: "world-session-31",
      worldPackageRootHash: `sha256:${"d".repeat(64)}` as Sha256HashV1,
      simulationTick: 12,
    };
    const current = {
      ...previous,
      worldSessionId: "world-session-32",
      simulationTick: 0,
    };

    const committed = accepted(await submit(
      journal,
      leaseStore,
      applyRequest,
      {
        session: active,
        publishRuntimeReplacement: async ({ persistDurableCommit }) => {
          persistDurableCommit({ previous, current });
          throw new Error("transport disconnected after durable commit");
        },
      },
    ));

    expect(committed.receipt.status).toBe("committed");
    expect(() => getAuthoringRevisionHeadV1(journal, "basic-world")).toThrow(
      /WORLD_CHANGE_PUBLICATION_FENCE_ACTIVE/,
    );
    const queried = queryWorldChangeReceiptV1({
      journal,
      session: active,
      query: parseWorldChangeReceiptQueryV1({
        kind: "worldkit-world-change-receipt-query",
        schemaVersion: 1,
        id: "q.receipt.post-commit-drop",
        authoringEditSessionId: SESSION_ID,
        requestId: applyRequest.id,
      }),
      nowUnixMilliseconds: NOW,
    });
    expect(queried).toEqual({ status: "pending", state: "preparing-runtime" });
    const cleanup = queryWorldChangeCleanupReportV1({
      journal,
      session: active,
      query: parseWorldChangeCleanupReportQueryV1({
        kind: "worldkit-world-change-cleanup-report-query",
        schemaVersion: 1,
        id: "q.cleanup.post-commit-drop",
        authoringEditSessionId: SESSION_ID,
        cleanupOperationId:
          committed.receipt.status === "committed" &&
            committed.receipt.requestedOutcome === "publish-runtime"
            ? committed.receipt.runtimeCleanup.cleanupOperationId
            : "cleanup.invalid",
      }),
      nowUnixMilliseconds: NOW,
    });
    expect(cleanup).toMatchObject({
      status: "found",
      report: {
        status: "scheduled",
        attemptCount: 0,
        previousWorldSessionId: "world-session-31",
      },
    });
    expect(transactions.at(-1)?.operations.map((operation) => operation.type)).toEqual([
      "revision-head-put",
      "request-record-put",
      "cleanup-report-put",
      "publication-recovery-state-put",
    ]);
    const reopened = createWorldChangeJournalV1({
      wal: {
        brand: "WorldChangeJournalWalV1",
        readTransactions: () => transactions,
        appendTransaction: (transaction) => {
          transactions.push(transaction);
        },
      },
    });
    expect(() => getAuthoringRevisionHeadV1(reopened, "basic-world")).toThrow(
      /WORLD_CHANGE_PUBLICATION_RECOVERY_REQUIRED/,
    );
    expect(queryWorldChangeReceiptV1({
      journal: reopened,
      session: active,
      query: parseWorldChangeReceiptQueryV1({
        kind: "worldkit-world-change-receipt-query",
        schemaVersion: 1,
        id: "q.receipt.post-commit-restart",
        authoringEditSessionId: SESSION_ID,
        requestId: applyRequest.id,
      }),
      nowUnixMilliseconds: NOW,
    })).toEqual({ status: "pending", state: "preparing-runtime" });
    const pending = listPendingWorldPublicationRecoveriesV1(reopened);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      worldId: "basic-world",
      authoringEditSessionId: SESSION_ID,
      requestId: applyRequest.id,
      cleanupReport: {
        status: "scheduled",
        attemptCount: 0,
      },
    });
    const committedReceiptHash = hashWorldChangeReceiptV1(committed.receipt);
    markWorldPublicationRecoveredV1(
      reopened,
      "basic-world",
      applyRequest.id,
    );
    expect(listPendingWorldPublicationRecoveriesV1(reopened)).toEqual([]);
    expect(getAuthoringRevisionHeadV1(reopened, "basic-world")?.revisionRef).toBe(
      "revision://basic-world/2",
    );
    const recoveredQuery = queryWorldChangeReceiptV1({
      journal: reopened,
      session: active,
      query: parseWorldChangeReceiptQueryV1({
        kind: "worldkit-world-change-receipt-query",
        schemaVersion: 1,
        id: "q.receipt.post-commit-recovered",
        authoringEditSessionId: SESSION_ID,
        requestId: applyRequest.id,
      }),
      nowUnixMilliseconds: NOW,
    });
    expect(recoveredQuery.status).toBe("found");
    if (recoveredQuery.status !== "found") throw new Error("expected found");
    expect(hashWorldChangeReceiptV1(recoveredQuery.receipt)).toBe(
      committedReceiptHash,
    );
    if (cleanup.status !== "found") throw new Error("expected cleanup report");
    const retrying = advanceWorldChangeCleanupReportV1({
      journal: reopened,
      authoringEditSessionId: SESSION_ID,
      report: {
        ...cleanup.report,
        status: "retrying",
        attemptCount: 1,
        diagnostics: [
          parseWorldChangeDiagnosticV1({
            severity: "warning",
            code: "WORLD_CHANGE_CLEANUP_INCOMPLETE",
            instancePath: "/runtimeCleanup",
            message: "Cleanup will be retried by the trusted Host.",
          }),
        ],
      },
    });
    expect(retrying).toMatchObject({ status: "retrying", attemptCount: 1 });
    expect(() => advanceWorldChangeCleanupReportV1({
      journal: reopened,
      authoringEditSessionId: SESSION_ID,
      report: { ...retrying, status: "scheduled", attemptCount: 2 },
    })).toThrow(/WORLD_CHANGE_CLEANUP_REPORT_CONFLICT/);
    const released = advanceWorldChangeCleanupReportV1({
      journal: reopened,
      authoringEditSessionId: SESSION_ID,
      report: {
        ...retrying,
        status: "released",
        attemptCount: 2,
        diagnostics: [],
      },
    });
    expect(released).toMatchObject({ status: "released", attemptCount: 2 });
    expect(advanceWorldChangeCleanupReportV1({
      journal: reopened,
      authoringEditSessionId: SESSION_ID,
      report: released,
    })).toEqual(released);
    const lease = lookupPreparedCandidateV1(
      leaseStore,
      dryRun.receipt.preparedCandidateRef,
      NOW,
    );
    expect(lease.status).toBe("found");
    if (lease.status !== "found") throw new Error("expected retained candidate lease");
    expect(lease.lease.pin?.requestId).toBe(applyRequest.id);
  });

  it("keeps a committed publish-runtime Receipt after the Session expires", async () => {
    const { journal, leaseStore, addHouse, session: active } = seeded();
    const dryRun = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", addHouse),
      { session: active },
    ));
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected dry-run");
    }
    const committed = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-publish", addHouse, {
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
      {
        session: active,
        publishRuntimeReplacement: successfulPublishPort("released"),
      },
    ));
    expect(committed.receipt.status).toBe("committed");
    const expired = session({ expiresAtUnixMilliseconds: NOW });
    const queried = queryWorldChangeReceiptV1({
      journal,
      session: expired,
      query: parseWorldChangeReceiptQueryV1({
        kind: "worldkit-world-change-receipt-query",
        schemaVersion: 1,
        id: "q.receipt.f1.expired",
        authoringEditSessionId: SESSION_ID,
        requestId: "request.apply.publish-f1",
      }),
      nowUnixMilliseconds: NOW,
    });
    expect(queried.status).toBe("found");
    if (queried.status !== "found") throw new Error("expected found");
    expect(hashWorldChangeReceiptV1(queried.receipt)).toBe(
      hashWorldChangeReceiptV1(committed.receipt),
    );
    const recovered = accepted(await recoverWorldChangeRequestV1({
      journal,
      leaseStore,
      worldPackageStore: WORLD_PACKAGE_STORE,
      worldPackageBuildContext: WORLD_PACKAGE_BUILD_CONTEXT,
      resourceArtifacts: [],
      request: requestFor("apply-publish", addHouse, {
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
      session: expired,
      nowUnixMilliseconds: NOW,
    }));
    expect(hashWorldChangeReceiptV1(recovered.receipt)).toBe(
      hashWorldChangeReceiptV1(committed.receipt),
    );
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.revisionRef).toBe(
      "revision://basic-world/2",
    );
    const later = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-authoring", addHouse, { id: "request.apply.after-expire" }),
      { session: expired },
    ));
    expect(later.receipt.status).toBe("rejected");
    if (later.receipt.status !== "rejected") throw new Error("expected rejected");
    expect(later.receipt.diagnostics[0]?.code).toBe("WORLD_CHANGE_AUTHORIZATION_STALE");
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.revisionRef).toBe(
      "revision://basic-world/2",
    );
  });

  it("records a quarantined Cleanup Report without rewriting the committed Receipt", async () => {
    const { journal, leaseStore, addHouse, session: active } = seeded();
    const dryRun = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", addHouse, { id: "request.dry-run.quarantine" }),
      { session: active },
    ));
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected dry-run");
    }
    const committed = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-publish", addHouse, {
        id: "request.apply.publish-quarantine",
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
      {
        session: active,
        publishRuntimeReplacement: successfulPublishPort("quarantined"),
      },
    ));
    expect(committed.receipt.status).toBe("committed");
    if (
      committed.receipt.status !== "committed" ||
      committed.receipt.mode !== "apply" ||
      committed.receipt.requestedOutcome !== "publish-runtime"
    ) {
      throw new Error("expected committed publish-runtime");
    }
    const cleanup = queryWorldChangeCleanupReportV1({
      journal,
      session: active,
      query: parseWorldChangeCleanupReportQueryV1({
        kind: "worldkit-world-change-cleanup-report-query",
        schemaVersion: 1,
        id: "q.cleanup.f1.quarantine",
        authoringEditSessionId: SESSION_ID,
        cleanupOperationId: committed.receipt.runtimeCleanup.cleanupOperationId,
      }),
      nowUnixMilliseconds: NOW,
    });
    expect(cleanup.status).toBe("found");
    if (cleanup.status !== "found") throw new Error("expected cleanup");
    expect(cleanup.report.status).toBe("quarantined");
    expect(cleanup.report.diagnostics[0]?.code).toBe("WORLD_CHANGE_CLEANUP_QUARANTINED");
    const queried = queryWorldChangeReceiptV1({
      journal,
      session: active,
      query: parseWorldChangeReceiptQueryV1({
        kind: "worldkit-world-change-receipt-query",
        schemaVersion: 1,
        id: "q.receipt.f1.quarantine",
        authoringEditSessionId: SESSION_ID,
        requestId: "request.apply.publish-quarantine",
      }),
      nowUnixMilliseconds: NOW,
    });
    expect(queried.status).toBe("found");
    if (queried.status !== "found") throw new Error("expected receipt");
    expect(hashWorldChangeReceiptV1(queried.receipt)).toBe(
      hashWorldChangeReceiptV1(committed.receipt),
    );
  });

  it("lets only an in-flight pin win against lease GC", async () => {
    const selectedPolicy = policy({
      maximumPreparedCandidateRetentionMilliseconds: 100,
    });
    const { journal, leaseStore, addHouse } = seeded({ policy: selectedPolicy });
    const active = session({ policy: selectedPolicy });
    const dryRun = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", addHouse, { id: "request.dry-run.pin-race" }),
      { session: active },
    ));
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected dry-run");
    }
    const crashed = await submit(
      journal,
      leaseStore,
      requestFor("apply-publish", addHouse, {
        id: "request.apply.publish-pin-owner",
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
      { session: active, crashAfterState: "candidate-ready" },
    );
    expect(crashed.status).toBe("crashed");
    sweepExpiredPreparedCandidatesV1(leaseStore, NOW + 10_000);
    expect(lookupPreparedCandidateV1(
      leaseStore,
      dryRun.receipt.preparedCandidateRef,
      NOW + 10_000,
    ).status).toBe("found");
    const stolen = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-publish", addHouse, {
        id: "request.apply.publish-pin-thief",
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
      { session: active, nowUnixMilliseconds: NOW + 10_000 },
    ));
    expect(stolen.receipt.status).toBe("rejected");
    if (stolen.receipt.status !== "rejected") throw new Error("expected rejected thief");
    expect(stolen.receipt.diagnostics[0]?.code).toBe("WORLD_CHANGE_PUBLICATION_CONFLICT");
    const resumed = accepted(await recoverWorldChangeRequestV1({
      journal,
      leaseStore,
      worldPackageStore: WORLD_PACKAGE_STORE,
      worldPackageBuildContext: WORLD_PACKAGE_BUILD_CONTEXT,
      resourceArtifacts: [],
      request: requestFor("apply-publish", addHouse, {
        id: "request.apply.publish-pin-owner",
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
      session: active,
      nowUnixMilliseconds: NOW + 10_000,
      publishRuntimeReplacement: successfulPublishPort("released"),
    }));
    expect(resumed.receipt.status).toBe("committed");
  });

  it("rejects a late Apply after unpinned GC and keeps the old world", async () => {
    const selectedPolicy = policy({
      maximumPreparedCandidateRetentionMilliseconds: 100,
    });
    const { journal, leaseStore, addHouse, authoringSpecHash } = seeded({
      policy: selectedPolicy,
    });
    const active = session({ policy: selectedPolicy });
    const dryRun = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", addHouse, { id: "request.dry-run.gc" }),
      { session: active },
    ));
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected dry-run");
    }
    sweepExpiredPreparedCandidatesV1(leaseStore, NOW + 100);
    const late = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-publish", addHouse, {
        id: "request.apply.publish-gc",
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
      { session: active, nowUnixMilliseconds: NOW + 100 },
    ));
    expect(late.receipt.status).toBe("rejected");
    if (late.receipt.status !== "rejected") throw new Error("expected expired");
    expect(late.receipt.diagnostics[0]?.code).toBe("WORLD_CHANGE_PREPARED_CANDIDATE_EXPIRED");
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.authoringSpecHash).toBe(
      authoringSpecHash,
    );
  });

  it("keeps the old revision when Runtime prepare fails", async () => {
    const { journal, leaseStore, addHouse, authoringSpecHash } = seeded();
    const dryRun = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", addHouse, { id: "request.dry-run.prepare-fail" }),
    ));
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected dry-run");
    }
    const failed = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-publish", addHouse, {
        id: "request.apply.publish-prepare-fail",
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
      {
        publishRuntimeReplacement: async () => ({
          status: "rejected",
          failureKind: "prepare-failed",
          message: "Replacement Runtime failed to become ready.",
        }),
      },
    ));
    expect(failed.receipt.status).toBe("rejected");
    if (failed.receipt.status !== "rejected") throw new Error("expected rejected");
    expect(failed.receipt.failurePhase).toBe("runtime-prepare");
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.authoringSpecHash).toBe(
      authoringSpecHash,
    );
  });

  it("re-runs compile and required gates for a terrain-source-replace Dry Run", async () => {
    const selectedPolicy = policy({ requiredGateProfileRefs: [GATE_REF] });
    const { journal, leaseStore, terrainReplace, authoringSpecHash } = seeded({
      policy: selectedPolicy,
    });
    let gateCalls = 0;
    const dryRun = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", terrainReplace, { id: "request.dry-run.terrain" }),
      {
        session: session({ policy: selectedPolicy }),
        evaluateRequiredGates: ({ requiredGateProfileRefs }) => {
          gateCalls += 1;
          expect(requiredGateProfileRefs).toEqual([GATE_REF]);
          return { status: "passed", validationReports: [] };
        },
      },
    ));
    expect(dryRun.receipt.status).toBe("succeeded");
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected terrain dry-run");
    }
    expect(gateCalls).toBe(1);
    expect(dryRun.receipt.buildIdentity.resultAuthoringSpecHash).not.toBe(authoringSpecHash);
    expect(dryRun.receipt.buildIdentity.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(dryRun.receipt.publicationMode).toBe("none");
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.authoringSpecHash).toBe(
      authoringSpecHash,
    );
  });
});
