import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  applyWorldChangeSetV1,
  assembleWorldChangeDiffV1,
  hashAuthoringEditPolicyProjectionV1,
  hashWorldChangeRequestV1,
  hashWorldChangeSetV1,
  isAppliedWorldChangeSetResultV1,
  parseWorldChangeCleanupReportV1,
  type WorldChangeAffectedIdsV1,
  type WorldChangeDiagnosticV1,
  type WorldChangeFailurePhaseV1,
} from "@whitebox-world/authoring-edit";
import { isEqual, isNil } from "lodash-es";

import { admissionBudgetDiagnostic, worldChangeDiagnostic } from "../diagnostics.js";
import { prepareTrustedCandidateV1 } from "../build.js";
import {
  lookupPreparedCandidateV1,
  pinPreparedCandidateV1,
  preparedCandidateLeaseUsageV1,
  releasePreparedCandidatePinV1,
} from "../lease-store.js";
import {
  requiredWorldChangeScopesV1,
  sessionAuthorizationDiagnosticV1,
} from "./authorize.js";
import { WorldChangeJournalCrashErrorV1 } from "./crash.js";
import { journalArtifactIdV1 } from "./ids.js";
import {
  assembleAuthoringOnlyCommittedReceiptV1,
  assembleDryRunReceiptV1,
  assemblePublishRuntimeCommittedReceiptV1,
  assembleRejectedReceiptV1,
  assembleValidatedReceiptV1,
} from "./receipts.js";
import {
  advanceWorldChangeCleanupReportV1,
  markWorldPublicationRecoveredV1,
} from "./publication-recovery.js";
import {
  acquireWorldPublicationFenceV1,
  commitAuthoringRevisionV1,
  getAuthoringRevisionHeadV1,
  getDurableRequestRecordV1,
  hasNonTerminalApplyOnWorldV1,
  lockChangeSetHashV1,
  lockedChangeSetHashV1,
  nextAuthoringRevisionRefV1,
  isTerminalStateV1,
  nonTerminalRequestCountV1,
  putDurableRequestRecordV1,
  recoveryFencingTokenV1,
} from "./store.js";
import type {
  DurableRequestRecordV1,
  PublishRuntimeReplacementFailureKindV1,
  PublishRuntimeReplacementV1,
  SubmitWorldChangeRequestInputV1,
  SubmitWorldChangeRequestResultV1,
} from "./types.js";

function persist(
  input: SubmitWorldChangeRequestInputV1,
  record: DurableRequestRecordV1,
): DurableRequestRecordV1 {
  const stored = putDurableRequestRecordV1(input.journal, record);
  if (input.crashAfterState === stored.state) {
    throw new WorldChangeJournalCrashErrorV1(stored.state);
  }
  return stored;
}

function withoutReservations(record: DurableRequestRecordV1): DurableRequestRecordV1 {
  const { pin: _pin, pendingRevisionRef: _pendingRevisionRef, ...rest } = record;
  return rest;
}

function reserveRevisionRef(
  input: SubmitWorldChangeRequestInputV1,
  record: DurableRequestRecordV1,
): {
  readonly record: DurableRequestRecordV1;
  readonly revisionRef: string;
} {
  if (!isNil(record.pendingRevisionRef)) {
    return { record, revisionRef: record.pendingRevisionRef };
  }
  const revisionRef = nextAuthoringRevisionRefV1(input.journal, record.request.worldId);
  return {
    record: persist(input, { ...record, pendingRevisionRef: revisionRef }),
    revisionRef,
  };
}

function rejectRecord(
  input: SubmitWorldChangeRequestInputV1,
  record: DurableRequestRecordV1,
  failurePhase: WorldChangeFailurePhaseV1,
  diagnostics: readonly WorldChangeDiagnosticV1[],
  extras: {
    readonly currentAuthoringSpecHash?: Sha256HashV1;
    readonly conflictingIds?: WorldChangeAffectedIdsV1;
  } = {},
): SubmitWorldChangeRequestResultV1 {
  if (!isNil(record.pin) && !isNil(record.preparedCandidateRef)) {
    releasePreparedCandidatePinV1({
      store: input.leaseStore,
      preparedCandidateRef: record.preparedCandidateRef,
      requestId: record.request.id,
      nowUnixMilliseconds: input.nowUnixMilliseconds,
    });
  }
  const receipt = assembleRejectedReceiptV1({
    request: record.request,
    requestHash: record.requestHash,
    authoringEditPolicyHash: record.authoringEditPolicyHash,
    changeSetHash: record.changeSetHash,
    failurePhase,
    diagnostics,
    ...(isNil(extras.currentAuthoringSpecHash)
      ? {}
      : { currentAuthoringSpecHash: extras.currentAuthoringSpecHash }),
    ...(isNil(extras.conflictingIds) ? {} : { conflictingIds: extras.conflictingIds }),
  });
  persist(input, {
    ...withoutReservations(record),
    state: "rejected",
    receipt,
  });
  return { status: "accepted", receipt };
}

function authorize(
  input: SubmitWorldChangeRequestInputV1,
  record: DurableRequestRecordV1,
): WorldChangeDiagnosticV1 | undefined {
  return sessionAuthorizationDiagnosticV1({
    session: input.session,
    expectedSessionId: record.request.authoringEditSessionId,
    requiredScopes: requiredWorldChangeScopesV1(record.request),
    nowUnixMilliseconds: input.nowUnixMilliseconds,
    worldId: record.request.worldId,
    expectedAuthorizationEpoch: record.authorizationEpoch,
    expectedPolicyHash: record.authoringEditPolicyHash,
  });
}

function publicationFailure(
  failureKind: PublishRuntimeReplacementFailureKindV1,
  message: string,
): {
  readonly failurePhase: WorldChangeFailurePhaseV1;
  readonly diagnostic: WorldChangeDiagnosticV1;
} {
  if (failureKind === "expectation-stale") {
    return {
      failurePhase: "runtime-preflight",
      diagnostic: worldChangeDiagnostic(
        "WORLD_CHANGE_RUNTIME_EXPECTATION_STALE",
        "/runtimeExpectation",
        message,
      ),
    };
  }
  if (failureKind === "publication-mode-unsupported") {
    return {
      failurePhase: "runtime-preflight",
      diagnostic: worldChangeDiagnostic(
        "WORLD_CHANGE_PUBLICATION_MODE_UNSUPPORTED",
        "/runtimeExpectation/targetPhaseBarrier",
        message,
      ),
    };
  }
  if (failureKind === "capacity-exceeded") {
    return {
      failurePhase: "runtime-preflight",
      diagnostic: worldChangeDiagnostic(
        "WORLD_CHANGE_RUNTIME_CAPACITY_EXCEEDED",
        "/runtimeExpectation",
        message,
      ),
    };
  }
  if (failureKind === "publication-conflict") {
    return {
      failurePhase: "publication-conflict",
      diagnostic: worldChangeDiagnostic(
        "WORLD_CHANGE_PUBLICATION_CONFLICT",
        "/worldId",
        message,
      ),
    };
  }
  if (failureKind === "commit-failed") {
    return {
      failurePhase: "publication-commit",
      diagnostic: worldChangeDiagnostic(
        "WORLD_CHANGE_CANDIDATE_INVALID",
        "/",
        message,
      ),
    };
  }
  return {
    failurePhase: "runtime-prepare",
    diagnostic: worldChangeDiagnostic(
      "WORLD_CHANGE_RUNTIME_PREPARE_FAILED",
      "/requestedOutcome",
      message,
    ),
  };
}

async function finishRuntimePublication(
  input: SubmitWorldChangeRequestInputV1,
  record: DurableRequestRecordV1,
): Promise<SubmitWorldChangeRequestResultV1> {
  if (isNil(input.publishRuntimeReplacement)) {
    return rejectRecord(input, record, "runtime-prepare", [
      worldChangeDiagnostic(
        "WORLD_CHANGE_RUNTIME_PUBLICATION_REQUIRED",
        "/requestedOutcome",
        "Runtime publication is owned by RuntimeHost publication V2 and is not wired in this journal slice.",
      ),
    ]);
  }
  if (
    record.request.mode !== "apply" ||
    record.request.requestedOutcome !== "publish-runtime" ||
    isNil(record.applied) ||
    isNil(record.buildIdentity) ||
    isNil(record.validationReports) ||
    isNil(record.preparedCandidateRef) ||
    isNil(record.pin)
  ) {
    return rejectRecord(input, record, "runtime-prepare", [
      worldChangeDiagnostic(
        "WORLD_CHANGE_CANDIDATE_INVALID",
        "/",
        "Publish-runtime is missing the pinned Prepared Candidate.",
      ),
    ]);
  }
  const runtimeExpectation = record.request.runtimeExpectation;
  const found = lookupPreparedCandidateV1(
    input.leaseStore,
    record.preparedCandidateRef,
    input.nowUnixMilliseconds,
  );
  if (
    found.status !== "found" ||
    found.lease.worldId !== record.request.worldId ||
    found.lease.buildIdentity.resultAuthoringSpecHash !==
      record.applied.resultAuthoringSpecHash
  ) {
    return rejectRecord(input, record, "admission", [
      worldChangeDiagnostic(
        "WORLD_CHANGE_PREPARED_CANDIDATE_STALE",
        "/preparedCandidateRef",
        "Prepared Candidate no longer matches the applied ChangeSet.",
      ),
    ]);
  }
  let verifiedWorldPackage;
  try {
    verifiedWorldPackage = await input.worldPackageStore.get(
      found.lease.worldPackageRef,
    );
  } catch (error) {
    return rejectRecord(input, record, "runtime-prepare", [
      worldChangeDiagnostic(
        "WORLD_CHANGE_RUNTIME_PREPARE_FAILED",
        "/preparedCandidateRef",
        error instanceof Error
          ? `Stored WorldPackage verification failed: ${error.message}`
          : "Stored WorldPackage verification failed.",
      ),
    ]);
  }
  if (
    isNil(verifiedWorldPackage) ||
    !isEqual(
      verifiedWorldPackage.receipt,
      found.lease.worldPackageBuildReceipt,
    )
  ) {
    return rejectRecord(input, record, "runtime-prepare", [
      worldChangeDiagnostic(
        "WORLD_CHANGE_RUNTIME_PREPARE_FAILED",
        "/preparedCandidateRef",
        "Stored WorldPackage is missing or no longer matches the Candidate Receipt.",
      ),
    ]);
  }
  let current = record;
  const cleanupOperationId = journalArtifactIdV1("cleanup", current.request.id);
  let commitDenial: WorldChangeDiagnosticV1 | undefined;
  let committedReceipt = current.receipt;
  let releasePublicationFence: (() => void) | undefined;
  let publicationError: unknown;
  let published: Awaited<ReturnType<PublishRuntimeReplacementV1>> | undefined;
  try {
    published = await input.publishRuntimeReplacement({
      worldConfiguration: {
        executionPlan: verifiedWorldPackage.executionPlan,
        executionPlanHash:
          verifiedWorldPackage.receipt.manifest.executionPlanHash,
        worldPackageRef: found.lease.worldPackageRef,
        worldPackageBuildReceipt: verifiedWorldPackage.receipt,
        gameplayBootstrap: verifiedWorldPackage.gameplayBootstrap,
      },
      publication: {
        requestId: current.request.id,
        requestHash: current.requestHash,
        fencingToken: recoveryFencingTokenV1(input.journal) ?? current.fencingToken,
        runtimeExpectation,
      },
      persistDurableCommit: (identities) => {
        releasePublicationFence = acquireWorldPublicationFenceV1(
          input.journal,
          current.request.worldId,
          recoveryFencingTokenV1(input.journal) ?? current.fencingToken,
        );
        try {
          const authz = authorize(input, current);
          if (!isNil(authz)) {
            commitDenial = authz;
            throw new Error("WORLD_CHANGE_COMMIT_DENIED");
          }
          const reserved = reserveRevisionRef(input, current);
          current = reserved.record;
          const receipt = assemblePublishRuntimeCommittedReceiptV1({
            request: current.request,
            requestHash: current.requestHash,
            authoringEditPolicyHash: current.authoringEditPolicyHash,
            changeSetHash: current.changeSetHash,
            buildIdentity: current.buildIdentity!,
            affectedIds: current.applied!.affectedIds,
            operationResults: current.applied!.operationResults,
            validationReports: current.validationReports!,
            committedRevisionRef: reserved.revisionRef,
            previousRuntimeIdentity: identities.previous,
            currentRuntimeIdentity: identities.current,
            cleanupOperationId,
          });
          const scheduledCleanup = parseWorldChangeCleanupReportV1({
            kind: "worldkit-world-change-cleanup-report",
            schemaVersion: 1,
            id: journalArtifactIdV1("cr", current.request.id),
            requestId: current.request.id,
            cleanupOperationId,
            previousWorldSessionId: identities.previous.worldSessionId,
            status: "scheduled",
            attemptCount: 0,
            diagnostics: [],
          });
          const { pin: _pin, pendingRevisionRef: _pendingRevisionRef, ...rest } = current;
          commitAuthoringRevisionV1(
            input.journal,
            {
              worldId: current.request.worldId,
              revisionRef: reserved.revisionRef,
              authoringSpec: current.applied!.candidateAuthoringSpec,
              authoringSpecHash: current.applied!.resultAuthoringSpecHash,
            },
            {
              ...rest,
              state: "committed",
              receipt,
              commitRecord: {
                revisionRef: reserved.revisionRef,
                authoringSpecHash: current.applied!.resultAuthoringSpecHash,
              },
            },
            scheduledCleanup,
          );
          committedReceipt = receipt;
        } catch (error) {
          releasePublicationFence();
          throw error;
        }
        return releasePublicationFence;
      },
    });
  } catch (error) {
    publicationError = error;
  }
  if (published?.status === "published") {
    markWorldPublicationRecoveredV1(
      input.journal,
      current.request.worldId,
      current.request.id,
    );
    releasePublicationFence?.();
  }
  if (!isNil(committedReceipt)) {
    if (published?.status === "published") {
      advanceWorldChangeCleanupReportV1({
        journal: input.journal,
        authoringEditSessionId: current.request.authoringEditSessionId,
        report: parseWorldChangeCleanupReportV1({
          kind: "worldkit-world-change-cleanup-report",
          schemaVersion: 1,
          id: journalArtifactIdV1("cr", current.request.id),
          requestId: current.request.id,
          cleanupOperationId,
          previousWorldSessionId: published.previous.worldSessionId,
          status: published.cleanupStatus,
          attemptCount: 1,
          diagnostics: published.cleanupDiagnostics,
        }),
      });
    }
    if (
      published?.status === "published" &&
      !isNil(current.preparedCandidateRef) &&
      !isNil(current.pin)
    ) {
      releasePreparedCandidatePinV1({
        store: input.leaseStore,
        preparedCandidateRef: current.preparedCandidateRef,
        requestId: current.request.id,
        nowUnixMilliseconds: input.nowUnixMilliseconds,
      });
    }
    return { status: "accepted", receipt: committedReceipt };
  }
  if (!isNil(commitDenial)) {
    return rejectRecord(input, current, "authorization", [commitDenial]);
  }
  if (!isNil(publicationError)) throw publicationError;
  if (isNil(published)) throw new Error("WORLD_CHANGE_RUNTIME_PUBLICATION_FAILED");
  if (published.status === "rejected") {
    const mapped = publicationFailure(published.failureKind, published.message);
    return rejectRecord(input, current, mapped.failurePhase, [mapped.diagnostic]);
  }
  return rejectRecord(input, current, "publication-commit", [
    worldChangeDiagnostic(
      "WORLD_CHANGE_CANDIDATE_INVALID",
      "/",
      "Runtime publication returned published without a durable commit.",
    ),
  ]);
}

async function advance(
  input: SubmitWorldChangeRequestInputV1,
  record: DurableRequestRecordV1,
): Promise<SubmitWorldChangeRequestResultV1> {
  if (isTerminalStateV1(record.state) && !isNil(record.receipt)) {
    return { status: "accepted", receipt: record.receipt };
  }
  let current = record;
  const authz = authorize(input, current);
  if (!isNil(authz)) {
    return rejectRecord(input, current, "authorization", [authz]);
  }

  if (current.state === "received") {
    const budget = input.session.policy.workloadBudget;
    const concurrent = nonTerminalRequestCountV1(input.journal);
    if (concurrent > budget.maximumConcurrentNonTerminalRequestCount) {
      return rejectRecord(input, current, "admission", [
        admissionBudgetDiagnostic(
          "concurrent-non-terminal-request-count",
          "/",
          budget.maximumConcurrentNonTerminalRequestCount,
          concurrent,
        ),
      ]);
    }
    if (
      current.request.mode === "apply" &&
      hasNonTerminalApplyOnWorldV1(input.journal, current.request.worldId, current.request.id)
    ) {
      return rejectRecord(input, current, "publication-conflict", [
        worldChangeDiagnostic(
          "WORLD_CHANGE_PUBLICATION_CONFLICT",
          "/worldId",
          "Another non-terminal Apply already owns this World.",
        ),
      ]);
    }
    current = persist(input, { ...current, state: "validating" });
  }

  if (current.state === "validating") {
    const head = getAuthoringRevisionHeadV1(input.journal, current.request.worldId);
    if (isNil(head) || head.authoringSpec.id !== current.request.worldId) {
      return rejectRecord(input, current, "base-check", [
        worldChangeDiagnostic(
          "WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH",
          "/worldId",
          "Request World does not match the Authoring revision head.",
        ),
      ]);
    }
    const leaseUsage = preparedCandidateLeaseUsageV1(input.leaseStore);
    const applied = applyWorldChangeSetV1({
      baseAuthoringSpec: head.authoringSpec,
      changeSet: current.request.changeSet,
      workloadBudget: input.session.policy.workloadBudget,
      admissionUsage: {
        concurrentNonTerminalRequestCount: nonTerminalRequestCountV1(input.journal),
        preparedCandidateCount: leaseUsage.count,
        preparedCandidateBytes: leaseUsage.bytes,
      },
      ...(isNil(input.overrideValidation)
        ? {}
        : { overrideValidation: input.overrideValidation }),
    });
    if (!isAppliedWorldChangeSetResultV1(applied)) {
      return rejectRecord(input, current, applied.failurePhase, applied.diagnostics, {
        ...(isNil(applied.currentAuthoringSpecHash)
          ? {}
          : { currentAuthoringSpecHash: applied.currentAuthoringSpecHash }),
        ...(isNil(applied.conflictingIds) ? {} : { conflictingIds: applied.conflictingIds }),
      });
    }
    const diff = assembleWorldChangeDiffV1({
      id: journalArtifactIdV1("diff", current.request.id),
      requestId: current.request.id,
      applied,
    });
    current = persist(input, {
      ...current,
      applied,
      diff,
      state: current.request.mode === "validate" ? "validated" : "building-candidate",
      ...(current.request.mode === "validate"
        ? {
            receipt: assembleValidatedReceiptV1({
              request: current.request,
              requestHash: current.requestHash,
              authoringEditPolicyHash: current.authoringEditPolicyHash,
              changeSetHash: current.changeSetHash,
            }),
          }
        : {}),
    });
    if (current.state === "validated" && !isNil(current.receipt)) {
      return { status: "accepted", receipt: current.receipt };
    }
  }

  if (current.state === "building-candidate") {
    if (isNil(current.applied)) {
      return rejectRecord(input, current, "candidate-apply", [
        worldChangeDiagnostic(
          "WORLD_CHANGE_CANDIDATE_INVALID",
          "/",
          "Durable request is missing the isolated candidate application.",
        ),
      ]);
    }
    if (current.request.mode === "apply" && !isNil(current.request.preparedCandidateRef)) {
      const pin = pinPreparedCandidateV1({
        store: input.leaseStore,
        preparedCandidateRef: current.request.preparedCandidateRef,
        authoringEditSessionId: current.request.authoringEditSessionId,
        changeSetHash: current.changeSetHash,
        baseAuthoringSpecHash: current.request.changeSet.baseAuthoringSpecHash,
        requestId: current.request.id,
        requestHash: current.requestHash,
        authoringEditPolicyHash: current.authoringEditPolicyHash,
        nowUnixMilliseconds: input.nowUnixMilliseconds,
      });
      if (pin.status !== "pinned") {
        return rejectRecord(input, current, pin.failurePhase, pin.diagnostics);
      }
      const found = lookupPreparedCandidateV1(
        input.leaseStore,
        current.request.preparedCandidateRef,
        input.nowUnixMilliseconds,
      );
      if (
        found.status !== "found" ||
        found.lease.worldId !== current.request.worldId ||
        found.lease.buildIdentity.resultAuthoringSpecHash !==
          current.applied.resultAuthoringSpecHash
      ) {
        return rejectRecord(
          input,
          {
            ...current,
            pin: pin.pin,
            preparedCandidateRef: current.request.preparedCandidateRef,
          },
          "admission",
          [
            worldChangeDiagnostic(
              "WORLD_CHANGE_PREPARED_CANDIDATE_STALE",
              "/preparedCandidateRef",
              "Prepared Candidate no longer matches the applied ChangeSet.",
            ),
          ],
        );
      }
      current = persist(input, {
        ...current,
        pin: pin.pin,
        preparedCandidateRef: current.request.preparedCandidateRef,
        buildIdentity: found.lease.buildIdentity,
        validationReports: found.lease.validationReports,
        validationReportsHash: found.lease.validationReportsHash,
        requiredGateProfileRefs: found.lease.requiredGateProfileRefs,
        preparedCandidateCreatedAtUnixMilliseconds:
          found.lease.createdAtUnixMilliseconds,
        preparedCandidateSizeBytes: found.lease.sizeBytes,
        expiresAtUnixMilliseconds: found.lease.expiresAtUnixMilliseconds,
        state: "candidate-ready",
      });
    } else {
      const prepared = await prepareTrustedCandidateV1({
        candidateAuthoringSpec: current.applied.candidateAuthoringSpec,
        authoringEditSessionId: current.request.authoringEditSessionId,
        changeSetHash: current.changeSetHash,
        baseAuthoringSpecHash: current.request.changeSet.baseAuthoringSpecHash,
        policy: input.session.policy,
        store: input.leaseStore,
        worldPackageStore: input.worldPackageStore,
        worldPackageBuildContext: input.worldPackageBuildContext,
        resourceArtifacts: input.resourceArtifacts,
        nowUnixMilliseconds: input.nowUnixMilliseconds,
        ...(isNil(input.evaluateRequiredGates)
          ? {}
          : { evaluateRequiredGates: input.evaluateRequiredGates }),
      });
      if (prepared.status !== "prepared") {
        return rejectRecord(input, current, prepared.failurePhase, prepared.diagnostics);
      }
      if (current.request.mode === "dry-run") {
        const receipt = assembleDryRunReceiptV1({
          request: current.request,
          requestHash: current.requestHash,
          authoringEditPolicyHash: current.authoringEditPolicyHash,
          changeSetHash: current.changeSetHash,
          buildIdentity: prepared.buildIdentity,
          affectedIds: current.applied.affectedIds,
          operationResults: current.applied.operationResults,
          validationReports: prepared.validationReports,
          preparedCandidateRef: prepared.preparedCandidateRef,
          preparedCandidateExpiresAtUnixMilliseconds:
            prepared.preparedCandidateExpiresAtUnixMilliseconds,
        });
        persist(input, {
          ...current,
          preparedCandidateRef: prepared.preparedCandidateRef,
          buildIdentity: prepared.buildIdentity,
          validationReports: prepared.validationReports,
          validationReportsHash: prepared.validationReportsHash,
          requiredGateProfileRefs: input.session.policy.requiredGateProfileRefs,
          preparedCandidateCreatedAtUnixMilliseconds:
            prepared.createdAtUnixMilliseconds,
          preparedCandidateSizeBytes: prepared.sizeBytes,
          expiresAtUnixMilliseconds: prepared.preparedCandidateExpiresAtUnixMilliseconds,
          state: "dry-run-succeeded",
          receipt,
        });
        return { status: "accepted", receipt };
      }
      current = persist(input, {
        ...current,
        preparedCandidateRef: prepared.preparedCandidateRef,
        buildIdentity: prepared.buildIdentity,
        validationReports: prepared.validationReports,
        validationReportsHash: prepared.validationReportsHash,
        requiredGateProfileRefs: input.session.policy.requiredGateProfileRefs,
        preparedCandidateCreatedAtUnixMilliseconds:
          prepared.createdAtUnixMilliseconds,
        preparedCandidateSizeBytes: prepared.sizeBytes,
        expiresAtUnixMilliseconds: prepared.preparedCandidateExpiresAtUnixMilliseconds,
        state: "candidate-ready",
      });
    }
  }

  if (current.state === "candidate-ready") {
    if (
      current.request.mode === "apply" &&
      current.request.requestedOutcome === "publish-runtime"
    ) {
      current = persist(input, {
        ...current,
        state: "preparing-runtime",
      });
    } else {
      current = persist(input, {
        ...current,
        state: "committing",
      });
    }
  }

  if (current.state === "preparing-runtime") {
    return finishRuntimePublication(input, current);
  }

  if (current.state === "committing") {
    const commitAuthz = authorize(input, current);
    if (!isNil(commitAuthz)) {
      return rejectRecord(input, current, "authorization", [commitAuthz]);
    }
    if (input.session.hasActiveRuntimeBinding) {
      return rejectRecord(input, current, "runtime-preflight", [
        worldChangeDiagnostic(
          "WORLD_CHANGE_RUNTIME_PUBLICATION_REQUIRED",
          "/requestedOutcome",
          "An active Runtime binding cannot commit authoring-only.",
        ),
      ]);
    }
    const applied = current.applied;
    const buildIdentity = current.buildIdentity;
    const validationReports = current.validationReports;
    if (isNil(applied) || isNil(buildIdentity) || isNil(validationReports)) {
      return rejectRecord(input, current, "publication-commit", [
        worldChangeDiagnostic(
          "WORLD_CHANGE_CANDIDATE_INVALID",
          "/",
          "Apply is missing the immutable Candidate to commit.",
        ),
      ]);
    }
    const reserved = reserveRevisionRef(input, current);
    current = reserved.record;
    const revisionRef = reserved.revisionRef;
    const receipt = assembleAuthoringOnlyCommittedReceiptV1({
      request: current.request,
      requestHash: current.requestHash,
      authoringEditPolicyHash: current.authoringEditPolicyHash,
      changeSetHash: current.changeSetHash,
      buildIdentity,
      affectedIds: applied.affectedIds,
      operationResults: applied.operationResults,
      validationReports,
      committedRevisionRef: revisionRef,
    });
    const { pin: _pin, pendingRevisionRef: _pendingRevisionRef, ...rest } = current;
    const committed: DurableRequestRecordV1 = {
      ...rest,
      state: "committed",
      receipt,
      commitRecord: {
        revisionRef,
        authoringSpecHash: applied.resultAuthoringSpecHash,
      },
    };
    commitAuthoringRevisionV1(
      input.journal,
      {
        worldId: current.request.worldId,
        revisionRef,
        authoringSpec: applied.candidateAuthoringSpec,
        authoringSpecHash: applied.resultAuthoringSpecHash,
      },
      committed,
    );
    if (!isNil(current.preparedCandidateRef) && !isNil(current.pin)) {
      releasePreparedCandidatePinV1({
        store: input.leaseStore,
        preparedCandidateRef: current.preparedCandidateRef,
        requestId: current.request.id,
        nowUnixMilliseconds: input.nowUnixMilliseconds,
      });
    }
    return { status: "accepted", receipt };
  }

  if (!isNil(current.receipt)) {
    return { status: "accepted", receipt: current.receipt };
  }
  return rejectRecord(input, current, "idempotency", [
    worldChangeDiagnostic(
      "WORLD_CHANGE_REQUEST_ID_CONFLICT",
      "/requestId",
      "Durable request reached an unknown non-terminal state.",
    ),
  ]);
}

export async function submitWorldChangeRequestV1(
  input: SubmitWorldChangeRequestInputV1,
): Promise<SubmitWorldChangeRequestResultV1> {
  try {
    const requestHash = hashWorldChangeRequestV1(input.request);
    const changeSetHash = hashWorldChangeSetV1(input.request.changeSet);
    const authoringEditPolicyHash = hashAuthoringEditPolicyProjectionV1(input.session.policy);
    const existing = getDurableRequestRecordV1(
      input.journal,
      input.request.authoringEditSessionId,
      input.request.id,
    );
    if (!isNil(existing)) {
      if (
        existing.requestHash !== requestHash ||
        existing.authoringEditPolicyHash !== authoringEditPolicyHash
      ) {
        return {
          status: "accepted",
          receipt: assembleRejectedReceiptV1({
            request: input.request,
            requestHash,
            authoringEditPolicyHash,
            changeSetHash,
            failurePhase: "idempotency",
            diagnostics: [
              worldChangeDiagnostic(
                "WORLD_CHANGE_REQUEST_ID_CONFLICT",
                "/requestId",
                "Request ID already durable with a different Request or Policy Hash.",
              ),
            ],
          }),
        };
      }
      if (!isNil(existing.receipt)) {
        return { status: "accepted", receipt: existing.receipt };
      }
      return await advance(input, existing);
    }

    const lockedHash = lockedChangeSetHashV1(
      input.journal,
      input.request.worldId,
      input.request.changeSet.id,
    );
    const record: DurableRequestRecordV1 = {
      request: input.request,
      requestHash,
      authoringEditPolicyHash,
      authorizationEpoch: input.session.authorizationEpoch,
      changeSetHash,
      state: "received",
      fencingToken: "journal",
      requiredGateProfileRefs: input.session.policy.requiredGateProfileRefs,
    };
    if (!isNil(lockedHash) && lockedHash !== changeSetHash) {
      const receipt = assembleRejectedReceiptV1({
        request: input.request,
        requestHash,
        authoringEditPolicyHash,
        changeSetHash,
        failurePhase: "idempotency",
        diagnostics: [
          worldChangeDiagnostic(
            "WORLD_CHANGE_SET_ID_CONFLICT",
            "/changeSet/id",
            "ChangeSet ID already durable with a different ChangeSet Hash.",
          ),
        ],
      });
      persist(input, { ...record, state: "rejected", receipt });
      return { status: "accepted", receipt };
    }
    lockChangeSetHashV1(
      input.journal,
      input.request.worldId,
      input.request.changeSet.id,
      changeSetHash,
    );
    return await advance(input, persist(input, record));
  } catch (error) {
    if (error instanceof WorldChangeJournalCrashErrorV1) {
      return { status: "crashed", state: error.state };
    }
    throw error;
  }
}

export async function resumeWorldChangeRequestV1(
  input: SubmitWorldChangeRequestInputV1,
): Promise<SubmitWorldChangeRequestResultV1> {
  const existing = getDurableRequestRecordV1(
    input.journal,
    input.request.authoringEditSessionId,
    input.request.id,
  );
  if (isNil(existing)) {
    return submitWorldChangeRequestV1(input);
  }
  try {
    return await advance(input, existing);
  } catch (error) {
    if (error instanceof WorldChangeJournalCrashErrorV1) {
      return { status: "crashed", state: error.state };
    }
    throw error;
  }
}
