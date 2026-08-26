import { hashAuthoringDocumentV4 } from "@whitebox-world/authoring";
import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  AUTHORING_EDIT_SCOPES_V1,
  hashWorldChangeReceiptV1,
  parseAuthoringEditPolicyProjectionV1,
  parseWorldChangeCleanupReportQueryV1,
  parseWorldChangeDiffRequestV1,
  parseWorldChangeExplainRequestV1,
  parseWorldChangeReceiptQueryV1,
  parseWorldChangeRequestV1,
  parseWorldChangeSetV1,
  WORLD_CHANGE_OPERATION_TYPES_V1,
  type AuthoringEditPolicyProjectionV1,
  type AuthoringEditScopeV1,
  type Sha256HashV1,
  type WorldChangeOperationV1,
  type WorldChangeRequestV1,
  type WorldChangeSetV1,
  type WorldPreconditionV1,
} from "@whitebox-world/authoring-edit";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  createPreparedCandidateLeaseStoreV1,
  createWorldChangeJournalV1,
  getAuthoringRevisionHeadV1,
  lookupPreparedCandidateV1,
  queryWorldChangeCleanupReportV1,
  queryWorldChangeDiffV1,
  queryWorldChangeExplainV1,
  queryWorldChangeReceiptV1,
  recoverWorldChangeRequestV1,
  seedAuthoringRevisionHeadV1,
  submitWorldChangeRequestV1,
} from "../index.js";
import type {
  AuthoringEditSessionV1,
  DurableCrashAfterStateV1,
  PublishRuntimeReplacementV1,
  SubmitWorldChangeRequestResultV1,
  WorldChangeJournalV1,
} from "./types.js";

const NOW = 1_700_000_000_000;
const HASH_LOCK = `sha256:${"a".repeat(64)}` as Sha256HashV1;
const HASH_CAPS = `sha256:${"b".repeat(64)}` as Sha256HashV1;
const SESSION_ID = "edit-session-17";
const VALIDATE_REQUEST_ID = "request.validate.add-house.001";
const DRY_RUN_REQUEST_ID = "request.dry-run.add-house.001";
const APPLY_REQUEST_ID = "request.apply.add-house.001";
const APPLY_REQUEST_ID_B = "request.apply.add-house.002";
const PUBLISH_REQUEST_ID = "request.apply.publish-house.001";

const HOUSE_PROTOTYPE = {
  id: "house-blockout",
  version: 1,
  kind: "primitive",
  primitive: "box",
  sizeMetersXYZ: [8, 5, 10],
  collisionEnabled: true,
  semantic: { classId: "structure.house" },
} as const;

const HOUSE_NODE = {
  id: "house-north",
  kind: "object",
  prototypeRef: "package://prototype/house-blockout@1",
  placement: {
    kind: "fixed",
    transform: { positionMetersXYZ: [18, 2.5, -24] },
  },
} as const;

const ADD_HOUSE_OPERATIONS: readonly WorldChangeOperationV1[] = [
  {
    id: "operation.add-house-prototype",
    type: "resource-upsert",
    resourceKind: "prototype",
    prototype: HOUSE_PROTOTYPE,
  },
  {
    id: "operation.add-house-node",
    type: "node-upsert",
    node: HOUSE_NODE,
  },
];

const ADD_HOUSE_PRECONDITIONS: readonly WorldPreconditionV1[] = [
  {
    id: "precondition.house-prototype-absent",
    type: "target-absent",
    target: {
      kind: "resource",
      resourceKind: "prototype",
      resourceId: "house-blockout",
    },
  },
  {
    id: "precondition.house-node-absent",
    type: "target-absent",
    target: { kind: "node", nodeEntityId: "house-north" },
  },
];

function generousBudget() {
  return {
    maximumChangeSetBytes: 1_000_000,
    maximumPreconditionCount: 64,
    maximumOperationCount: 64,
    maximumConcurrentNonTerminalRequestCount: 8,
    maximumPreparedCandidateCount: 8,
    maximumPreparedCandidateBytes: 2_000_000,
    maximumPreparedCandidateRetentionMilliseconds: 3_600_000,
  };
}

function policy(): AuthoringEditPolicyProjectionV1 {
  return parseAuthoringEditPolicyProjectionV1({
    allowedWorldIds: ["basic-world"],
    registryLockHash: HASH_LOCK,
    capabilitySetHash: HASH_CAPS,
    projectionProfileRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
    allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
    allowedOverridePaths: [],
    requiredGateProfileRefs: [],
    workloadBudget: generousBudget(),
  });
}

function session(
  overrides: {
    readonly authorizationEpoch?: number;
    readonly isActive?: boolean;
    readonly expiresAtUnixMilliseconds?: number;
    readonly scopes?: readonly AuthoringEditScopeV1[];
    readonly hasActiveRuntimeBinding?: boolean;
  } = {},
): AuthoringEditSessionV1 {
  return {
    authoringEditSessionId: SESSION_ID,
    authorizationEpoch: overrides.authorizationEpoch ?? 1,
    isActive: overrides.isActive ?? true,
    expiresAtUnixMilliseconds: overrides.expiresAtUnixMilliseconds ?? NOW + 3_600_000,
    scopes: overrides.scopes ?? [...AUTHORING_EDIT_SCOPES_V1],
    policy: policy(),
    hasActiveRuntimeBinding: overrides.hasActiveRuntimeBinding ?? false,
  };
}

function addHouseChangeSet(
  specHash: Sha256HashV1,
  extras: {
    readonly id?: string;
    readonly operations?: readonly WorldChangeOperationV1[];
  } = {},
): WorldChangeSetV1 {
  return parseWorldChangeSetV1({
    kind: "worldkit-world-change-set",
    schemaVersion: 1,
    id: extras.id ?? "change.add-house.001",
    baseAuthoringSpecHash: specHash,
    preconditions: ADD_HOUSE_PRECONDITIONS,
    operations: extras.operations ?? ADD_HOUSE_OPERATIONS,
  });
}

function seededJournal(spec = createValidAuthoringSpec()) {
  const journal = createWorldChangeJournalV1();
  const authoringSpecHash = hashAuthoringDocumentV4(spec) as Sha256HashV1;
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
    changeSet: addHouseChangeSet(authoringSpecHash),
  };
}

function requestFor(
  mode: "validate" | "dry-run" | "apply-authoring" | "apply-publish",
  changeSet: WorldChangeSetV1,
  extras: {
    readonly id?: string;
    readonly preparedCandidateRef?: string;
  } = {},
): WorldChangeRequestV1 {
  if (mode === "validate" || mode === "dry-run") {
    return parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: extras.id ?? (mode === "validate" ? VALIDATE_REQUEST_ID : DRY_RUN_REQUEST_ID),
      authoringEditSessionId: SESSION_ID,
      worldId: "basic-world",
      changeSet,
      mode,
    });
  }
  if (mode === "apply-publish") {
    if (isNil(extras.preparedCandidateRef)) {
      throw new Error("publish-runtime requires preparedCandidateRef");
    }
    return parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: extras.id ?? PUBLISH_REQUEST_ID,
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
    id: extras.id ?? APPLY_REQUEST_ID,
    authoringEditSessionId: SESSION_ID,
    worldId: "basic-world",
    changeSet,
    mode: "apply",
    requestedOutcome: "authoring-only",
    ...(isNil(extras.preparedCandidateRef)
      ? {}
      : { preparedCandidateRef: extras.preparedCandidateRef }),
  });
}

function submit(
  journal: WorldChangeJournalV1,
  leaseStore: ReturnType<typeof createPreparedCandidateLeaseStoreV1>,
  request: WorldChangeRequestV1,
  extras: {
    readonly session?: AuthoringEditSessionV1;
    readonly crashAfterState?: DurableCrashAfterStateV1;
    readonly nowUnixMilliseconds?: number;
    readonly publishRuntimeReplacement?: PublishRuntimeReplacementV1;
  } = {},
) {
  return submitWorldChangeRequestV1({
    journal,
    leaseStore,
    request,
    session: extras.session ?? session(),
    nowUnixMilliseconds: extras.nowUnixMilliseconds ?? NOW,
    ...(isNil(extras.crashAfterState) ? {} : { crashAfterState: extras.crashAfterState }),
    ...(isNil(extras.publishRuntimeReplacement)
      ? {}
      : { publishRuntimeReplacement: extras.publishRuntimeReplacement }),
  });
}

function recover(
  journal: WorldChangeJournalV1,
  leaseStore: ReturnType<typeof createPreparedCandidateLeaseStoreV1>,
  request: WorldChangeRequestV1,
  extras: {
    readonly session?: AuthoringEditSessionV1;
    readonly publishRuntimeReplacement?: PublishRuntimeReplacementV1;
  } = {},
) {
  return recoverWorldChangeRequestV1({
    journal,
    leaseStore,
    request,
    session: extras.session ?? session(),
    nowUnixMilliseconds: NOW,
    ...(isNil(extras.publishRuntimeReplacement)
      ? {}
      : { publishRuntimeReplacement: extras.publishRuntimeReplacement }),
  });
}

function accepted(
  result: SubmitWorldChangeRequestResultV1,
): Extract<SubmitWorldChangeRequestResultV1, { status: "accepted" }> {
  expect(result.status).toBe("accepted");
  if (result.status !== "accepted") throw new Error("expected accepted journal result");
  return result;
}

function crashed(
  result: SubmitWorldChangeRequestResultV1,
): Extract<SubmitWorldChangeRequestResultV1, { status: "crashed" }> {
  expect(result.status).toBe("crashed");
  if (result.status !== "crashed") throw new Error("expected crashed journal result");
  return result;
}

function receiptQuery(requestId: string) {
  return parseWorldChangeReceiptQueryV1({
    kind: "worldkit-world-change-receipt-query",
    schemaVersion: 1,
    id: "q.receipt.001",
    authoringEditSessionId: SESSION_ID,
    requestId,
  });
}

describe("P16-R1 durable WorldChange journal", () => {
  it("validates, queries, and returns a byte-identical retry without moving the revision head", async () => {
    const { journal, leaseStore, changeSet, authoringSpecHash } = seededJournal();
    const request = requestFor("validate", changeSet);
    const first = accepted(await submit(journal, leaseStore, request));
    expect(first.receipt.status).toBe("validated");
    expect(first.receipt.mode).toBe("validate");
    expect(first.receipt.publicationMode).toBe("none");

    const queried = queryWorldChangeReceiptV1({
      journal,
      session: session(),
      query: receiptQuery(VALIDATE_REQUEST_ID),
      nowUnixMilliseconds: NOW,
    });
    expect(queried.status).toBe("found");
    if (queried.status !== "found") throw new Error("expected found receipt");
    expect(hashWorldChangeReceiptV1(queried.receipt)).toBe(
      hashWorldChangeReceiptV1(first.receipt),
    );

    const retry = accepted(await submit(journal, leaseStore, request));
    expect(hashWorldChangeReceiptV1(retry.receipt)).toBe(
      hashWorldChangeReceiptV1(first.receipt),
    );
    const head = getAuthoringRevisionHeadV1(journal, "basic-world");
    expect(head?.revisionRef).toBe("revision://basic-world/1");
    expect(head?.authoringSpecHash).toBe(authoringSpecHash);
  });

  it("rejects a replay of the same Request ID with a different Request Hash", async () => {
    const { journal, leaseStore, changeSet } = seededJournal();
    const validate = requestFor("validate", changeSet);
    const original = accepted(await submit(journal, leaseStore, validate));
    const conflict = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", changeSet, { id: VALIDATE_REQUEST_ID }),
    ));
    expect(conflict.receipt.status).toBe("rejected");
    if (conflict.receipt.status !== "rejected") throw new Error("expected rejected");
    expect(conflict.receipt.failurePhase).toBe("idempotency");
    expect(conflict.receipt.diagnostics[0]?.code).toBe("WORLD_CHANGE_REQUEST_ID_CONFLICT");

    const queried = queryWorldChangeReceiptV1({
      journal,
      session: session(),
      query: receiptQuery(VALIDATE_REQUEST_ID),
      nowUnixMilliseconds: NOW,
    });
    expect(queried.status).toBe("found");
    if (queried.status !== "found") throw new Error("expected original receipt");
    expect(hashWorldChangeReceiptV1(queried.receipt)).toBe(
      hashWorldChangeReceiptV1(original.receipt),
    );
  });

  it("rejects a second ChangeSet ID with a different ChangeSet Hash", async () => {
    const { journal, leaseStore, changeSet, authoringSpecHash } = seededJournal();
    accepted(await submit(journal, leaseStore, requestFor("validate", changeSet)));
    const other = addHouseChangeSet(authoringSpecHash, {
      operations: [
        ADD_HOUSE_OPERATIONS[0]!,
        {
          id: "operation.add-house-node",
          type: "node-upsert",
          node: {
            ...HOUSE_NODE,
            id: "house-south",
            placement: {
              kind: "fixed",
              transform: { positionMetersXYZ: [10, 2.5, -10] },
            },
          },
        },
      ],
    });
    const conflict = accepted(await submit(
      journal,
      leaseStore,
      requestFor("validate", other, { id: "request.validate.add-house.002" }),
    ));
    expect(conflict.receipt.status).toBe("rejected");
    if (conflict.receipt.status !== "rejected") throw new Error("expected rejected");
    expect(conflict.receipt.diagnostics[0]?.code).toBe("WORLD_CHANGE_SET_ID_CONFLICT");
  });

  it("dry-runs into a Prepared Candidate lease without moving the revision head", async () => {
    const { journal, leaseStore, changeSet, authoringSpecHash } = seededJournal();
    const result = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", changeSet),
    ));
    expect(result.receipt.status).toBe("succeeded");
    expect(result.receipt.mode).toBe("dry-run");
    if (result.receipt.status !== "succeeded" || result.receipt.mode !== "dry-run") {
      throw new Error("expected dry-run receipt");
    }
    const found = lookupPreparedCandidateV1(
      leaseStore,
      result.receipt.preparedCandidateRef,
      NOW,
    );
    expect(found.status).toBe("found");
    const head = getAuthoringRevisionHeadV1(journal, "basic-world");
    expect(head?.revisionRef).toBe("revision://basic-world/1");
    expect(head?.authoringSpecHash).toBe(authoringSpecHash);
  });

  it("commits authoring-only and advances the revision head once", async () => {
    const { journal, leaseStore, changeSet, spec } = seededJournal();
    const result = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-authoring", changeSet),
    ));
    expect(result.receipt.status).toBe("committed");
    expect(result.receipt.mode).toBe("apply");
    if (result.receipt.status !== "committed" || result.receipt.mode !== "apply") {
      throw new Error("expected committed receipt");
    }
    expect(result.receipt.requestedOutcome).toBe("authoring-only");
    expect(result.receipt.publicationMode).toBe("none");
    expect(result.receipt.committedRevisionRef).toBe("revision://basic-world/2");
    const head = getAuthoringRevisionHeadV1(journal, spec.id);
    expect(head?.revisionRef).toBe("revision://basic-world/2");
    expect(head?.authoringSpec.nodes.some((node) => node.id === "house-north")).toBe(true);
    expect(head?.authoringSpecHash).not.toBe(hashAuthoringDocumentV4(spec));
  });

  it("reuses a Dry Run Prepared Candidate on a new authoring-only Apply Request ID", async () => {
    const { journal, leaseStore, changeSet } = seededJournal();
    const dryRun = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", changeSet),
    ));
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected dry-run receipt");
    }
    const apply = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-authoring", changeSet, {
        id: APPLY_REQUEST_ID,
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
    ));
    expect(apply.receipt.status).toBe("committed");
    if (apply.receipt.status !== "committed") throw new Error("expected committed");
    expect(apply.receipt.committedRevisionRef).toBe("revision://basic-world/2");
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.revisionRef).toBe(
      "revision://basic-world/2",
    );
  });

  it("fail-closes publish-runtime without moving the revision head", async () => {
    const { journal, leaseStore, changeSet, authoringSpecHash } = seededJournal();
    const dryRun = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", changeSet),
    ));
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected dry-run receipt");
    }
    const publish = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-publish", changeSet, {
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
    ));
    expect(publish.receipt.status).toBe("rejected");
    if (publish.receipt.status !== "rejected") throw new Error("expected rejected");
    expect(publish.receipt.requestedOutcome).toBe("publish-runtime");
    expect(publish.receipt.failurePhase).toBe("runtime-prepare");
    expect(publish.receipt.diagnostics[0]?.code).toBe(
      "WORLD_CHANGE_RUNTIME_PUBLICATION_REQUIRED",
    );
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.authoringSpecHash).toBe(
      authoringSpecHash,
    );
  });

  it("rejects an expired Authoring/Edit Session at admission", async () => {
    const { journal, leaseStore, changeSet } = seededJournal();
    const result = accepted(await submit(
      journal,
      leaseStore,
      requestFor("validate", changeSet),
      { session: session({ expiresAtUnixMilliseconds: NOW }) },
    ));
    expect(result.receipt.status).toBe("rejected");
    if (result.receipt.status !== "rejected") throw new Error("expected rejected");
    expect(result.receipt.failurePhase).toBe("authorization");
    expect(result.receipt.diagnostics[0]?.code).toBe("WORLD_CHANGE_AUTHORIZATION_STALE");
    expect(result.receipt.diagnostics[0]?.details).toEqual({
      kind: "authorization-stale",
      reason: "session-expired",
    });
  });

  it("resumes the same Request after a crash at received", async () => {
    const { journal, leaseStore, changeSet } = seededJournal();
    const request = requestFor("validate", changeSet);
    const crash = crashed(await submit(journal, leaseStore, request, {
      crashAfterState: "received",
    }));
    expect(crash.state).toBe("received");
    const pending = queryWorldChangeReceiptV1({
      journal,
      session: session(),
      query: receiptQuery(VALIDATE_REQUEST_ID),
      nowUnixMilliseconds: NOW,
    });
    expect(pending).toEqual({ status: "pending", state: "received" });
    const resumed = accepted(await recover(journal, leaseStore, request));
    expect(resumed.receipt.status).toBe("validated");
  });

  it("commits exactly once after a crash at committing", async () => {
    const { journal, leaseStore, changeSet } = seededJournal();
    const request = requestFor("apply-authoring", changeSet);
    expect(crashed(await submit(journal, leaseStore, request, {
      crashAfterState: "committing",
    })).state).toBe("committing");
    const first = accepted(await recover(journal, leaseStore, request));
    expect(first.receipt.status).toBe("committed");
    if (first.receipt.status !== "committed") throw new Error("expected committed");
    expect(first.receipt.committedRevisionRef).toBe("revision://basic-world/2");
    const retry = accepted(await submit(journal, leaseStore, request));
    expect(hashWorldChangeReceiptV1(retry.receipt)).toBe(
      hashWorldChangeReceiptV1(first.receipt),
    );
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.revisionRef).toBe(
      "revision://basic-world/2",
    );
  });

  it("rejects a second concurrent Apply on the same World", async () => {
    const { journal, leaseStore, changeSet } = seededJournal();
    const firstRequest = requestFor("apply-authoring", changeSet);
    expect(crashed(await submit(journal, leaseStore, firstRequest, {
      crashAfterState: "received",
    })).state).toBe("received");
    const second = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-authoring", changeSet, { id: APPLY_REQUEST_ID_B }),
    ));
    expect(second.receipt.status).toBe("rejected");
    if (second.receipt.status !== "rejected") throw new Error("expected rejected");
    expect(second.receipt.diagnostics[0]?.code).toBe("WORLD_CHANGE_PUBLICATION_CONFLICT");
    const resumed = accepted(await recover(journal, leaseStore, firstRequest));
    expect(resumed.receipt.status).toBe("committed");
  });

  it("keeps the base revision when recovery sees an authorization epoch drift", async () => {
    const { journal, leaseStore, changeSet, authoringSpecHash } = seededJournal();
    const request = requestFor("apply-authoring", changeSet);
    expect(crashed(await submit(journal, leaseStore, request, {
      crashAfterState: "committing",
    })).state).toBe("committing");
    const drifted = accepted(await recover(journal, leaseStore, request, {
      session: session({ authorizationEpoch: 2 }),
    }));
    expect(drifted.receipt.status).toBe("rejected");
    if (drifted.receipt.status !== "rejected") throw new Error("expected rejected");
    expect(drifted.receipt.failurePhase).toBe("authorization");
    expect(drifted.receipt.diagnostics[0]?.code).toBe("WORLD_CHANGE_AUTHORIZATION_STALE");
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.revisionRef).toBe(
      "revision://basic-world/1",
    );
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.authoringSpecHash).toBe(
      authoringSpecHash,
    );
  });

  it("assembles Explain and Diff from the journal and reports missing Cleanup", async () => {
    const { journal, leaseStore, changeSet } = seededJournal();
    accepted(await submit(journal, leaseStore, requestFor("validate", changeSet)));
    const explain = queryWorldChangeExplainV1({
      journal,
      session: session(),
      request: parseWorldChangeExplainRequestV1({
        kind: "worldkit-world-change-explain-request",
        schemaVersion: 1,
        id: "q.explain.001",
        authoringEditSessionId: SESSION_ID,
        requestId: VALIDATE_REQUEST_ID,
        selector: { mode: "summary" },
      }),
      nowUnixMilliseconds: NOW,
    });
    expect(explain.status).toBe("found");
    if (explain.status !== "found") throw new Error("expected explain");
    expect(explain.explain.explanations.map((row) => row.type)).toEqual([
      "operation-effect",
      "operation-effect",
    ]);
    const diff = queryWorldChangeDiffV1({
      journal,
      session: session(),
      request: parseWorldChangeDiffRequestV1({
        kind: "worldkit-world-change-diff-request",
        schemaVersion: 1,
        id: "q.diff.001",
        authoringEditSessionId: SESSION_ID,
        requestId: VALIDATE_REQUEST_ID,
      }),
      nowUnixMilliseconds: NOW,
    });
    expect(diff.status).toBe("found");
    if (diff.status !== "found") throw new Error("expected diff");
    expect(diff.diff.changes.map((change) => change.type)).toEqual(["added", "added"]);
    const cleanup = queryWorldChangeCleanupReportV1({
      journal,
      session: session(),
      query: parseWorldChangeCleanupReportQueryV1({
        kind: "worldkit-world-change-cleanup-report-query",
        schemaVersion: 1,
        id: "q.cleanup.001",
        authoringEditSessionId: SESSION_ID,
        cleanupOperationId: "cleanup.replaced-runtime.001",
      }),
      nowUnixMilliseconds: NOW,
    });
    expect(cleanup).toEqual({ status: "missing" });
  });

  it("dry-runs from building-candidate to succeeded without persisting candidate-ready", async () => {
    const { journal, leaseStore, changeSet } = seededJournal();
    const request = requestFor("dry-run", changeSet);
    expect(crashed(await submit(journal, leaseStore, request, {
      crashAfterState: "building-candidate",
    })).state).toBe("building-candidate");
    const pending = queryWorldChangeReceiptV1({
      journal,
      session: session(),
      query: receiptQuery(DRY_RUN_REQUEST_ID),
      nowUnixMilliseconds: NOW,
    });
    expect(pending).toEqual({ status: "pending", state: "building-candidate" });
    const resumed = accepted(await recover(journal, leaseStore, request));
    expect(resumed.receipt.status).toBe("succeeded");
    expect(resumed.receipt.mode).toBe("dry-run");

    const isolated = seededJournal();
    const completed = accepted(await submit(
      isolated.journal,
      isolated.leaseStore,
      requestFor("dry-run", isolated.changeSet),
      { crashAfterState: "candidate-ready" },
    ));
    expect(completed.receipt.status).toBe("succeeded");
    expect(completed.receipt.mode).toBe("dry-run");
  });

  it("does not rewrite a committed Receipt when recovery sees an expired Session", async () => {
    const { journal, leaseStore, changeSet } = seededJournal();
    const request = requestFor("apply-authoring", changeSet);
    const committed = accepted(await submit(journal, leaseStore, request));
    expect(committed.receipt.status).toBe("committed");
    const recovered = accepted(await recover(journal, leaseStore, request, {
      session: session({ expiresAtUnixMilliseconds: NOW }),
    }));
    expect(hashWorldChangeReceiptV1(recovered.receipt)).toBe(
      hashWorldChangeReceiptV1(committed.receipt),
    );
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.revisionRef).toBe(
      "revision://basic-world/2",
    );
  });

  it("lets an expired Session read a terminal Receipt but not Apply", async () => {
    const { journal, leaseStore, changeSet } = seededJournal();
    const validated = accepted(await submit(
      journal,
      leaseStore,
      requestFor("validate", changeSet),
    ));
    const expired = session({ expiresAtUnixMilliseconds: NOW });
    const queried = queryWorldChangeReceiptV1({
      journal,
      session: expired,
      query: receiptQuery(VALIDATE_REQUEST_ID),
      nowUnixMilliseconds: NOW,
    });
    expect(queried.status).toBe("found");
    if (queried.status !== "found") throw new Error("expected found receipt");
    expect(hashWorldChangeReceiptV1(queried.receipt)).toBe(
      hashWorldChangeReceiptV1(validated.receipt),
    );
    const revoked = queryWorldChangeReceiptV1({
      journal,
      session: session({ isActive: false }),
      query: receiptQuery(VALIDATE_REQUEST_ID),
      nowUnixMilliseconds: NOW,
    });
    expect(revoked.status).toBe("rejected");
    if (revoked.status !== "rejected") throw new Error("expected revoked query");
    expect(revoked.diagnostics[0]?.code).toBe("WORLD_CHANGE_AUTHORIZATION_STALE");
    const apply = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-authoring", changeSet),
      { session: expired },
    ));
    expect(apply.receipt.status).toBe("rejected");
    if (apply.receipt.status !== "rejected") throw new Error("expected rejected apply");
    expect(apply.receipt.failurePhase).toBe("authorization");
    expect(apply.receipt.diagnostics[0]?.code).toBe("WORLD_CHANGE_AUTHORIZATION_STALE");
  });

  it("returns a cloned Authoring revision head", async () => {
    const { journal, spec } = seededJournal();
    const head = getAuthoringRevisionHeadV1(journal, spec.id);
    expect(head).toBeDefined();
    if (isNil(head)) throw new Error("expected seeded revision head");
    expect(head).not.toBe(getAuthoringRevisionHeadV1(journal, spec.id));
    const writableSpec = head.authoringSpec as { id: string };
    writableSpec.id = "mutated-world";
    expect(getAuthoringRevisionHeadV1(journal, spec.id)?.authoringSpec.id).toBe(spec.id);
  });

  it("publishes runtime through an injected port and keeps a byte-identical retry", async () => {
    const { journal, leaseStore, changeSet } = seededJournal();
    const dryRun = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", changeSet),
    ));
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected dry-run receipt");
    }
    const found = lookupPreparedCandidateV1(
      leaseStore,
      dryRun.receipt.preparedCandidateRef,
      NOW,
    );
    if (found.status !== "found") throw new Error("expected prepared lease");
    const previous = {
      runtimeSessionId: "runtime-session-9",
      worldSessionId: "world-session-31",
      worldPackageRootHash: `sha256:${"d".repeat(64)}` as Sha256HashV1,
      simulationTick: 12,
    };
    const current = {
      runtimeSessionId: "runtime-session-9",
      worldSessionId: "world-session-32",
      worldPackageRootHash: found.lease.buildIdentity.worldPackageRootHash,
      simulationTick: 0,
    };
    let persistCalls = 0;
    let portCalls = 0;
    const publishRuntimeReplacement: PublishRuntimeReplacementV1 = async ({
      persistDurableCommit,
    }) => {
      portCalls += 1;
      persistDurableCommit({ previous, current });
      persistCalls += 1;
      return {
        status: "published",
        previous,
        current,
        cleanupStatus: "released",
        cleanupDiagnostics: [],
      };
    };
    const first = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-publish", changeSet, {
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
      { publishRuntimeReplacement },
    ));
    expect(first.receipt.status).toBe("committed");
    expect(first.receipt.mode).toBe("apply");
    if (
      first.receipt.status !== "committed" ||
      first.receipt.mode !== "apply" ||
      first.receipt.requestedOutcome !== "publish-runtime"
    ) {
      throw new Error("expected publish-runtime receipt");
    }
    expect(first.receipt.publicationMode).toBe("full-reload");
    expect(first.receipt.committedRevisionRef).toBe("revision://basic-world/2");
    expect(first.receipt.previousRuntimeIdentity).toEqual(previous);
    expect(first.receipt.currentRuntimeIdentity).toEqual(current);
    expect(first.receipt.runtimeCleanup.statusAtCommit).toBe("scheduled");
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.revisionRef).toBe(
      "revision://basic-world/2",
    );
    const cleanup = queryWorldChangeCleanupReportV1({
      journal,
      session: session(),
      query: parseWorldChangeCleanupReportQueryV1({
        kind: "worldkit-world-change-cleanup-report-query",
        schemaVersion: 1,
        id: "q.cleanup.002",
        authoringEditSessionId: SESSION_ID,
        cleanupOperationId: first.receipt.runtimeCleanup.cleanupOperationId,
      }),
      nowUnixMilliseconds: NOW,
    });
    expect(cleanup.status).toBe("found");
    if (cleanup.status !== "found") throw new Error("expected cleanup report");
    expect(cleanup.report.status).toBe("released");
    const retry = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-publish", changeSet, {
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
      { publishRuntimeReplacement },
    ));
    expect(hashWorldChangeReceiptV1(retry.receipt)).toBe(
      hashWorldChangeReceiptV1(first.receipt),
    );
    expect(portCalls).toBe(1);
    expect(persistCalls).toBe(1);
  });

  it("rejects publish-runtime when the injected port reports expectation-stale", async () => {
    const { journal, leaseStore, changeSet, authoringSpecHash } = seededJournal();
    const dryRun = accepted(await submit(
      journal,
      leaseStore,
      requestFor("dry-run", changeSet),
    ));
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected dry-run receipt");
    }
    const publish = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-publish", changeSet, {
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
      {
        publishRuntimeReplacement: async () => ({
          status: "rejected",
          failureKind: "expectation-stale",
          message: "Runtime publication expectation does not match the live Runtime.",
        }),
      },
    ));
    expect(publish.receipt.status).toBe("rejected");
    if (publish.receipt.status !== "rejected") throw new Error("expected rejected");
    expect(publish.receipt.failurePhase).toBe("runtime-preflight");
    expect(publish.receipt.diagnostics[0]?.code).toBe(
      "WORLD_CHANGE_RUNTIME_EXPECTATION_STALE",
    );
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.authoringSpecHash).toBe(
      authoringSpecHash,
    );
    expect(queryWorldChangeCleanupReportV1({
      journal,
      session: session(),
      query: parseWorldChangeCleanupReportQueryV1({
        kind: "worldkit-world-change-cleanup-report-query",
        schemaVersion: 1,
        id: "q.cleanup.003",
        authoringEditSessionId: SESSION_ID,
        cleanupOperationId: "cleanup.apply.publish-house.001",
      }),
      nowUnixMilliseconds: NOW,
    })).toEqual({ status: "missing" });
    const found = lookupPreparedCandidateV1(
      leaseStore,
      dryRun.receipt.preparedCandidateRef,
      NOW,
    );
    if (found.status !== "found") throw new Error("expected prepared lease");
    const previous = {
      runtimeSessionId: "runtime-session-9",
      worldSessionId: "world-session-31",
      worldPackageRootHash: `sha256:${"d".repeat(64)}` as Sha256HashV1,
      simulationTick: 12,
    };
    const current = {
      runtimeSessionId: "runtime-session-9",
      worldSessionId: "world-session-33",
      worldPackageRootHash: found.lease.buildIdentity.worldPackageRootHash,
      simulationTick: 0,
    };
    const committed = accepted(await submit(
      journal,
      leaseStore,
      requestFor("apply-publish", changeSet, {
        id: "request.apply.publish-house.after-stale",
        preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
      }),
      {
        publishRuntimeReplacement: async ({ persistDurableCommit }) => {
          persistDurableCommit({ previous, current });
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
    if (committed.receipt.status !== "committed") throw new Error("expected committed");
    expect(committed.receipt.committedRevisionRef).toBe("revision://basic-world/2");
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.revisionRef).toBe(
      "revision://basic-world/2",
    );
  });

  it("rejects Receipt query without authoring.receipt.read", async () => {
    const { journal, leaseStore, changeSet } = seededJournal();
    accepted(await submit(journal, leaseStore, requestFor("validate", changeSet)));
    const queried = queryWorldChangeReceiptV1({
      journal,
      session: session({
        scopes: AUTHORING_EDIT_SCOPES_V1.filter(
          (scope) => scope !== "authoring.receipt.read",
        ),
      }),
      query: receiptQuery(VALIDATE_REQUEST_ID),
      nowUnixMilliseconds: NOW,
    });
    expect(queried.status).toBe("rejected");
    if (queried.status !== "rejected") throw new Error("expected rejected query");
    expect(queried.diagnostics[0]?.code).toBe("WORLD_CHANGE_PUBLICATION_SCOPE_REQUIRED");
  });
});
