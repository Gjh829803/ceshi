import { worldPackageRefFromRootHashV1 } from "@whitebox-world/world-identity";

import {
  hashWorldChangeRequestV1,
  hashWorldChangeSetV1,
} from "@whitebox-world/authoring-edit";
import { canonicalJsonBytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  type WorldPackageStoreV1,
} from "@whitebox-world/world-package";
import { isNil } from "lodash-es";

import {
  rehydratePreparedCandidateLeaseV1,
} from "../lease-store.js";
import type {
  PreparedCandidateLeaseStoreV1,
  PreparedCandidateLeaseV1,
} from "../types.js";
import {
  getDurableRequestRecordV1,
  isTerminalStateV1,
} from "./store.js";
import type { WorldChangeJournalV1 } from "./types.js";

function invalidRecovery(message: string): never {
  throw new Error(
    `WORLD_CHANGE_PREPARED_CANDIDATE_RECOVERY_INVALID: ${message}`,
  );
}

function candidateClosureBytes(input: {
  readonly worldPackageBuildReceipt: PreparedCandidateLeaseV1["worldPackageBuildReceipt"];
  readonly validationReports: PreparedCandidateLeaseV1["validationReports"];
}): number {
  return canonicalJsonBytes(input.worldPackageBuildReceipt).byteLength +
    canonicalJsonBytes(input.validationReports).byteLength;
}

export async function rehydratePreparedCandidateForRecoveryV1(input: {
  readonly journal: WorldChangeJournalV1;
  readonly leaseStore: PreparedCandidateLeaseStoreV1;
  readonly worldPackageStore: WorldPackageStoreV1;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
  readonly nowUnixMilliseconds: number;
}): Promise<
  | { readonly status: "rehydrated"; readonly preparedCandidateRef: string }
  | { readonly status: "not-required" }
> {
  const record = getDurableRequestRecordV1(
    input.journal,
    input.authoringEditSessionId,
    input.requestId,
  );
  if (isNil(record)) {
    invalidRecovery("The durable Request does not exist.");
  }
  if (isTerminalStateV1(record.state)) return { status: "not-required" };
  if (
    isNil(record.preparedCandidateRef) &&
    isNil(record.buildIdentity) &&
    isNil(record.validationReports) &&
    isNil(record.validationReportsHash) &&
    isNil(record.preparedCandidateCreatedAtUnixMilliseconds) &&
    isNil(record.preparedCandidateSizeBytes) &&
    isNil(record.expiresAtUnixMilliseconds) &&
    isNil(record.pin)
  ) {
    return { status: "not-required" };
  }
  if (
    isNil(record.preparedCandidateRef) ||
    isNil(record.buildIdentity) ||
    isNil(record.validationReports) ||
    isNil(record.validationReportsHash) ||
    isNil(record.requiredGateProfileRefs) ||
    isNil(record.preparedCandidateCreatedAtUnixMilliseconds) ||
    isNil(record.preparedCandidateSizeBytes) ||
    isNil(record.expiresAtUnixMilliseconds)
  ) {
    invalidRecovery("The durable Candidate identity is incomplete.");
  }
  if (
    record.request.authoringEditSessionId !== input.authoringEditSessionId ||
    record.request.id !== input.requestId ||
    hashWorldChangeRequestV1(record.request) !== record.requestHash ||
    hashWorldChangeSetV1(record.request.changeSet) !== record.changeSetHash
  ) {
    invalidRecovery("The durable Request identity diverged.");
  }
  if (
    sha256CanonicalJson(record.validationReports) !==
      record.validationReportsHash
  ) {
    invalidRecovery("The Validation Report binding diverged.");
  }
  if (
    record.preparedCandidateCreatedAtUnixMilliseconds >
      record.expiresAtUnixMilliseconds
  ) {
    invalidRecovery("The Candidate lease interval is invalid.");
  }
  if (isNil(record.pin)) {
    if (input.nowUnixMilliseconds >= record.expiresAtUnixMilliseconds) {
      invalidRecovery("The unpinned Candidate lease expired.");
    }
  } else if (
    record.pin.preparedCandidateRef !== record.preparedCandidateRef ||
    record.pin.authoringEditSessionId !== input.authoringEditSessionId ||
    record.pin.requestId !== input.requestId ||
    record.pin.requestHash !== record.requestHash ||
    record.pin.authoringEditPolicyHash !== record.authoringEditPolicyHash
  ) {
    invalidRecovery("The durable Candidate pin identity diverged.");
  }

  const worldPackageRef = worldPackageRefFromRootHashV1(
    record.buildIdentity.worldPackageRootHash,
  );
  let verifiedDirectory;
  try {
    verifiedDirectory = await input.worldPackageStore.get(worldPackageRef);
  } catch (error) {
    invalidRecovery(
      error instanceof Error
        ? `The immutable Package is corrupt: ${error.message}`
        : "The immutable Package is corrupt.",
    );
  }
  if (isNil(verifiedDirectory)) {
    invalidRecovery("The immutable Package is missing.");
  }
  const receipt = verifiedDirectory.receipt;
  if (
    receipt.manifest.worldId !== record.request.worldId ||
    verifiedDirectory.receipt.manifest.sceneSource.authoringSpecHash !==
      record.buildIdentity.resultAuthoringSpecHash ||
    receipt.manifest.registryLockHash !== record.buildIdentity.registryLockHash ||
    verifiedDirectory.receipt.manifest.sceneSource.normalizedWorldIrHash !==
      record.buildIdentity.normalizedWorldIrHash ||
    verifiedDirectory.receipt.manifest.sceneSource.executionPlanHash !== record.buildIdentity.executionPlanHash ||
    receipt.worldPackageRootHash !== record.buildIdentity.worldPackageRootHash ||
    isNil(record.applied) ||
    record.applied.resultAuthoringSpecHash !==
      record.buildIdentity.resultAuthoringSpecHash
  ) {
    invalidRecovery("The immutable Package does not match the durable build identity.");
  }
  const sizeBytes = candidateClosureBytes({
    worldPackageBuildReceipt: receipt,
    validationReports: record.validationReports,
  });
  if (sizeBytes !== record.preparedCandidateSizeBytes) {
    invalidRecovery("The Candidate closure size diverged.");
  }
  const lease: PreparedCandidateLeaseV1 = {
    preparedCandidateRef: record.preparedCandidateRef,
    worldId: record.request.worldId,
    authoringEditSessionId: input.authoringEditSessionId,
    changeSetHash: record.changeSetHash,
    baseAuthoringSpecHash: record.request.changeSet.baseAuthoringSpecHash,
    authoringEditPolicyHash: record.authoringEditPolicyHash,
    requiredGateProfileRefs: record.requiredGateProfileRefs,
    buildIdentity: record.buildIdentity,
    worldPackageRef,
    worldPackageBuildReceipt: receipt,
    validationReports: record.validationReports,
    validationReportsHash: record.validationReportsHash,
    sizeBytes,
    createdAtUnixMilliseconds:
      record.preparedCandidateCreatedAtUnixMilliseconds,
    expiresAtUnixMilliseconds: record.expiresAtUnixMilliseconds,
    ...(isNil(record.pin) ? {} : { pin: record.pin }),
  };
  const restored = rehydratePreparedCandidateLeaseV1(input.leaseStore, lease);
  if (restored === "existing") return { status: "not-required" };
  return {
    status: "rehydrated",
    preparedCandidateRef: record.preparedCandidateRef,
  };
}
