import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { hashAuthoringDocumentV4 } from "@whitebox-world/authoring";
import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  AUTHORING_EDIT_SCOPES_V1,
  parseAuthoringEditPolicyProjectionV1,
  parseWorldChangeRequestV1,
  parseWorldChangeSetV1,
  WORLD_CHANGE_OPERATION_TYPES_V1,
  type WorldChangeRequestV1,
  type WorldChangeSetV1,
} from "@whitebox-world/authoring-edit";
import {
  createInMemoryWorldPackageStoreV1,
  createCanonicalWorldPackageBuildContextFixtureV1,
} from "@whitebox-world/world-package/testing";
import type { WorldPackageStoreV1 } from "@whitebox-world/world-package";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  createPreparedCandidateLeaseStoreV1,
  createWorldChangeJournalV1,
  lookupPreparedCandidateV1,
  rehydratePreparedCandidateForRecoveryV1,
  seedAuthoringRevisionHeadV1,
  submitWorldChangeRequestV1,
} from "../index.js";
import {
  getDurableRequestRecordV1,
  putDurableRequestRecordV1,
} from "./store.js";
import { putPreparedCandidateLeaseV1 } from "../lease-store.js";
import type {
  AuthoringEditSessionV1,
  SubmitWorldChangeRequestResultV1,
  WorldChangeJournalTransactionV1,
  WorldChangeJournalV1,
} from "./types.js";

const NOW = 1_700_000_000_000;
const SESSION_ID = "edit-session-candidate-recovery";
const EXAMPLES_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../examples/authoring",
);
const WORLD_PACKAGE_BUILD_CONTEXT = createCanonicalWorldPackageBuildContextFixtureV1();

function session(): AuthoringEditSessionV1 {
  return {
    authoringEditSessionId: SESSION_ID,
    authorizationEpoch: 1,
    isActive: true,
    expiresAtUnixMilliseconds: NOW + 3_600_000,
    scopes: [...AUTHORING_EDIT_SCOPES_V1],
    policy: parseAuthoringEditPolicyProjectionV1({
      allowedWorldIds: ["basic-world"],
      registryLockHash: `sha256:${"a".repeat(64)}`,
      capabilitySetHash: `sha256:${"b".repeat(64)}`,
      projectionProfileRef:
        "worldkit://ai-schema-projection-profile/constrained-json@1",
      allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
      allowedOverridePaths: [],
      requiredGateProfileRefs: [],
      workloadBudget: {
        maximumChangeSetBytes: 1_000_000,
        maximumPreconditionCount: 64,
        maximumOperationCount: 64,
        maximumConcurrentNonTerminalRequestCount: 8,
        maximumPreparedCandidateCount: 8,
        maximumPreparedCandidateBytes: 2_000_000,
        maximumPreparedCandidateRetentionMilliseconds: 1_000,
      },
    }),
    hasActiveRuntimeBinding: false,
  };
}

function loadChangeSet(authoringSpecHash: Sha256HashV1): WorldChangeSetV1 {
  const raw = JSON.parse(
    readFileSync(
      join(EXAMPLES_ROOT, "p16-add-house", "change-set.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  return parseWorldChangeSetV1({
    ...raw,
    baseAuthoringSpecHash: authoringSpecHash,
  });
}

function requestFor(
  mode: "dry-run" | "apply",
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
      id: extras.id ?? "request.dry-run.candidate-recovery",
      authoringEditSessionId: SESSION_ID,
      worldId: "basic-world",
      changeSet,
      mode: "dry-run",
    });
  }
  return parseWorldChangeRequestV1({
    kind: "worldkit-world-change-request",
    schemaVersion: 1,
    id: extras.id ?? "request.apply.candidate-recovery",
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

function accepted(result: SubmitWorldChangeRequestResultV1) {
  if (result.status !== "accepted") {
    throw new Error(`expected accepted, got ${result.status}`);
  }
  return result;
}

function createReopenableJournal(): {
  readonly journal: WorldChangeJournalV1;
  readonly reopen: () => WorldChangeJournalV1;
} {
  const transactions: WorldChangeJournalTransactionV1[] = [];
  const wal = {
    brand: "WorldChangeJournalWalV1" as const,
    readTransactions: () => transactions,
    appendTransaction: (transaction: WorldChangeJournalTransactionV1) => {
      transactions.push(transaction);
    },
  };
  return {
    journal: createWorldChangeJournalV1({ wal }),
    reopen: () => createWorldChangeJournalV1({ wal }),
  };
}

function submit(input: {
  readonly journal: WorldChangeJournalV1;
  readonly leaseStore: ReturnType<typeof createPreparedCandidateLeaseStoreV1>;
  readonly worldPackageStore: WorldPackageStoreV1;
  readonly request: WorldChangeRequestV1;
  readonly crashAfterState?: "candidate-ready";
}) {
  return submitWorldChangeRequestV1({
    journal: input.journal,
    leaseStore: input.leaseStore,
    worldPackageStore: input.worldPackageStore,
    worldPackageBuildContext: WORLD_PACKAGE_BUILD_CONTEXT,
    resourceArtifacts: [],
    request: input.request,
    session: session(),
    nowUnixMilliseconds: NOW,
    ...(isNil(input.crashAfterState)
      ? {}
      : { crashAfterState: input.crashAfterState }),
  });
}

async function createRecoveryCase(input: {
  readonly isPinned: boolean;
}): Promise<{
  readonly journal: WorldChangeJournalV1;
  readonly request: WorldChangeRequestV1;
  readonly worldPackageStore: WorldPackageStoreV1;
  readonly originalLease: Extract<
    ReturnType<typeof lookupPreparedCandidateV1>,
    { readonly status: "found" }
  >["lease"];
}> {
  const reopenable = createReopenableJournal();
  const worldPackageStore = createInMemoryWorldPackageStoreV1();
  const leaseStore = createPreparedCandidateLeaseStoreV1();
  const spec = createValidAuthoringSpec();
  const authoringSpecHash = hashAuthoringDocumentV4(spec) as Sha256HashV1;
  const changeSet = loadChangeSet(authoringSpecHash);
  seedAuthoringRevisionHeadV1(reopenable.journal, {
    worldId: spec.id,
    revisionRef: `revision://${spec.id}/1`,
    authoringSpec: spec,
    authoringSpecHash,
  });

  let request: WorldChangeRequestV1;
  if (input.isPinned) {
    const dryRun = accepted(await submit({
      journal: reopenable.journal,
      leaseStore,
      worldPackageStore,
      request: requestFor("dry-run", changeSet),
    }));
    if (dryRun.receipt.status !== "succeeded" || dryRun.receipt.mode !== "dry-run") {
      throw new Error("expected Dry Run Candidate");
    }
    request = requestFor("apply", changeSet, {
      preparedCandidateRef: dryRun.receipt.preparedCandidateRef,
    });
  } else {
    request = requestFor("apply", changeSet);
  }

  expect(await submit({
    journal: reopenable.journal,
    leaseStore,
    worldPackageStore,
    request,
    crashAfterState: "candidate-ready",
  })).toEqual({ status: "crashed", state: "candidate-ready" });
  const durableRecord = getDurableRequestRecordV1(
    reopenable.journal,
    SESSION_ID,
    request.id,
  );
  if (isNil(durableRecord?.preparedCandidateRef)) {
    throw new Error("expected durable Candidate Ref");
  }
  const original = lookupPreparedCandidateV1(
    leaseStore,
    durableRecord.preparedCandidateRef,
    NOW,
  );
  if (original.status !== "found") throw new Error("expected original lease");
  return {
    journal: reopenable.reopen(),
    request,
    worldPackageStore,
    originalLease: original.lease,
  };
}

describe("prepared Candidate recovery", () => {
  it("rehydrates the exact durable lease and pin into a fresh store", async () => {
    const recovery = await createRecoveryCase({ isPinned: true });
    const freshLeaseStore = createPreparedCandidateLeaseStoreV1();
    expect(await rehydratePreparedCandidateForRecoveryV1({
      journal: recovery.journal,
      leaseStore: freshLeaseStore,
      worldPackageStore: recovery.worldPackageStore,
      authoringEditSessionId: SESSION_ID,
      requestId: recovery.request.id,
      nowUnixMilliseconds: NOW,
    })).toEqual({
      status: "rehydrated",
      preparedCandidateRef: recovery.originalLease.preparedCandidateRef,
    });
    expect(lookupPreparedCandidateV1(
      freshLeaseStore,
      recovery.originalLease.preparedCandidateRef,
      NOW,
    )).toEqual({ status: "found", lease: recovery.originalLease });
  });

  it("rejects a missing or corrupt immutable Package", async () => {
    const recovery = await createRecoveryCase({ isPinned: true });
    const missingStore: WorldPackageStoreV1 = {
      brand: "WorldPackageStoreV1",
      put: (directory) => recovery.worldPackageStore.put(directory),
      get: async () => undefined,
    };
    await expect(rehydratePreparedCandidateForRecoveryV1({
      journal: recovery.journal,
      leaseStore: createPreparedCandidateLeaseStoreV1(),
      worldPackageStore: missingStore,
      authoringEditSessionId: SESSION_ID,
      requestId: recovery.request.id,
      nowUnixMilliseconds: NOW,
    })).rejects.toThrow(/WORLD_CHANGE_PREPARED_CANDIDATE_RECOVERY_INVALID/);

    const corruptStore: WorldPackageStoreV1 = {
      brand: "WorldPackageStoreV1",
      put: (directory) => recovery.worldPackageStore.put(directory),
      get: async () => {
        throw new Error("WORLD_PACKAGE_STORE_CORRUPT: test corruption");
      },
    };
    await expect(rehydratePreparedCandidateForRecoveryV1({
      journal: recovery.journal,
      leaseStore: createPreparedCandidateLeaseStoreV1(),
      worldPackageStore: corruptStore,
      authoringEditSessionId: SESSION_ID,
      requestId: recovery.request.id,
      nowUnixMilliseconds: NOW,
    })).rejects.toThrow(/WORLD_CHANGE_PREPARED_CANDIDATE_RECOVERY_INVALID/);
  });

  it("rejects validation-report or Policy Hash divergence", async () => {
    const recovery = await createRecoveryCase({ isPinned: true });
    const record = getDurableRequestRecordV1(
      recovery.journal,
      SESSION_ID,
      recovery.request.id,
    );
    if (isNil(record)) throw new Error("expected durable record");
    putDurableRequestRecordV1(recovery.journal, {
      ...record,
      validationReportsHash: `sha256:${"f".repeat(64)}`,
    });
    await expect(rehydratePreparedCandidateForRecoveryV1({
      journal: recovery.journal,
      leaseStore: createPreparedCandidateLeaseStoreV1(),
      worldPackageStore: recovery.worldPackageStore,
      authoringEditSessionId: SESSION_ID,
      requestId: recovery.request.id,
      nowUnixMilliseconds: NOW,
    })).rejects.toThrow(/WORLD_CHANGE_PREPARED_CANDIDATE_RECOVERY_INVALID/);

    const changeSetRecovery = await createRecoveryCase({ isPinned: true });
    const changeSetRecord = getDurableRequestRecordV1(
      changeSetRecovery.journal,
      SESSION_ID,
      changeSetRecovery.request.id,
    );
    if (isNil(changeSetRecord)) throw new Error("expected durable record");
    putDurableRequestRecordV1(changeSetRecovery.journal, {
      ...changeSetRecord,
      changeSetHash: `sha256:${"d".repeat(64)}`,
    });
    await expect(rehydratePreparedCandidateForRecoveryV1({
      journal: changeSetRecovery.journal,
      leaseStore: createPreparedCandidateLeaseStoreV1(),
      worldPackageStore: changeSetRecovery.worldPackageStore,
      authoringEditSessionId: SESSION_ID,
      requestId: changeSetRecovery.request.id,
      nowUnixMilliseconds: NOW,
    })).rejects.toThrow(/WORLD_CHANGE_PREPARED_CANDIDATE_RECOVERY_INVALID/);

    const policyRecovery = await createRecoveryCase({ isPinned: true });
    const policyRecord = getDurableRequestRecordV1(
      policyRecovery.journal,
      SESSION_ID,
      policyRecovery.request.id,
    );
    if (isNil(policyRecord)) throw new Error("expected durable record");
    putDurableRequestRecordV1(policyRecovery.journal, {
      ...policyRecord,
      authoringEditPolicyHash: `sha256:${"e".repeat(64)}`,
    });
    await expect(rehydratePreparedCandidateForRecoveryV1({
      journal: policyRecovery.journal,
      leaseStore: createPreparedCandidateLeaseStoreV1(),
      worldPackageStore: policyRecovery.worldPackageStore,
      authoringEditSessionId: SESSION_ID,
      requestId: policyRecovery.request.id,
      nowUnixMilliseconds: NOW,
    })).rejects.toThrow(/WORLD_CHANGE_PREPARED_CANDIDATE_RECOVERY_INVALID/);
  });

  it("rejects an expired unpinned Candidate but preserves an expired pin", async () => {
    const unpinned = await createRecoveryCase({ isPinned: false });
    await expect(rehydratePreparedCandidateForRecoveryV1({
      journal: unpinned.journal,
      leaseStore: createPreparedCandidateLeaseStoreV1(),
      worldPackageStore: unpinned.worldPackageStore,
      authoringEditSessionId: SESSION_ID,
      requestId: unpinned.request.id,
      nowUnixMilliseconds: unpinned.originalLease.expiresAtUnixMilliseconds + 1,
    })).rejects.toThrow(/WORLD_CHANGE_PREPARED_CANDIDATE_RECOVERY_INVALID/);

    const pinned = await createRecoveryCase({ isPinned: true });
    const freshLeaseStore = createPreparedCandidateLeaseStoreV1();
    await expect(rehydratePreparedCandidateForRecoveryV1({
      journal: pinned.journal,
      leaseStore: freshLeaseStore,
      worldPackageStore: pinned.worldPackageStore,
      authoringEditSessionId: SESSION_ID,
      requestId: pinned.request.id,
      nowUnixMilliseconds: pinned.originalLease.expiresAtUnixMilliseconds + 1,
    })).resolves.toMatchObject({ status: "rehydrated" });
    expect(lookupPreparedCandidateV1(
      freshLeaseStore,
      pinned.originalLease.preparedCandidateRef,
      pinned.originalLease.expiresAtUnixMilliseconds + 1,
    )).toEqual({ status: "found", lease: pinned.originalLease });
  });

  it("makes duplicate exact rehydration a no-op", async () => {
    const recovery = await createRecoveryCase({ isPinned: true });
    const freshLeaseStore = createPreparedCandidateLeaseStoreV1();
    const input = {
      journal: recovery.journal,
      leaseStore: freshLeaseStore,
      worldPackageStore: recovery.worldPackageStore,
      authoringEditSessionId: SESSION_ID,
      requestId: recovery.request.id,
      nowUnixMilliseconds: NOW,
    };
    await expect(rehydratePreparedCandidateForRecoveryV1(input)).resolves.toMatchObject({
      status: "rehydrated",
    });
    await expect(rehydratePreparedCandidateForRecoveryV1(input)).resolves.toEqual({
      status: "not-required",
    });
    expect(lookupPreparedCandidateV1(
      freshLeaseStore,
      recovery.originalLease.preparedCandidateRef,
      NOW,
    )).toEqual({ status: "found", lease: recovery.originalLease });
  });

  it("rejects an existing lease with the same Ref and a divergent closure", async () => {
    const recovery = await createRecoveryCase({ isPinned: true });
    const freshLeaseStore = createPreparedCandidateLeaseStoreV1();
    const input = {
      journal: recovery.journal,
      leaseStore: freshLeaseStore,
      worldPackageStore: recovery.worldPackageStore,
      authoringEditSessionId: SESSION_ID,
      requestId: recovery.request.id,
      nowUnixMilliseconds: NOW,
    };
    await rehydratePreparedCandidateForRecoveryV1(input);
    putPreparedCandidateLeaseV1(freshLeaseStore, {
      ...recovery.originalLease,
      sizeBytes: recovery.originalLease.sizeBytes + 1,
    });
    await expect(rehydratePreparedCandidateForRecoveryV1(input)).rejects.toThrow(
      /WORLD_CHANGE_PREPARED_CANDIDATE_RECOVERY_CONFLICT/,
    );
  });
});
