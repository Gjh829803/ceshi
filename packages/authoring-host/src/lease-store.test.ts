import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  parseAuthoringEditPolicyProjectionV1,
  WORLD_CHANGE_OPERATION_TYPES_V1,
} from "@whitebox-world/authoring-edit";
import {
  createInMemoryWorldPackageStoreV1,
  createWorldPackageBuildContextFixtureV2,
} from "@whitebox-world/world-package/testing";
import { describe, expect, it } from "vitest";

import { prepareTrustedCandidateV1 } from "./build.js";
import {
  createPreparedCandidateLeaseStoreV1,
  lookupPreparedCandidateV1,
  rehydratePreparedCandidateLeaseV1,
} from "./lease-store.js";

const NOW = 1_700_000_000_000;

async function createCompleteLease() {
  const sourceStore = createPreparedCandidateLeaseStoreV1();
  const result = await prepareTrustedCandidateV1({
    candidateAuthoringSpec: createValidAuthoringSpec(),
    authoringEditSessionId: "edit-session-lease-recovery",
    changeSetHash: `sha256:${"c".repeat(64)}` as Sha256HashV1,
    baseAuthoringSpecHash: `sha256:${"d".repeat(64)}` as Sha256HashV1,
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
        maximumPreparedCandidateRetentionMilliseconds: 3_600_000,
      },
    }),
    store: sourceStore,
    worldPackageStore: createInMemoryWorldPackageStoreV1(),
    worldPackageBuildContext: createWorldPackageBuildContextFixtureV2(),
    resourceArtifacts: [],
    nowUnixMilliseconds: NOW,
  });
  if (result.status !== "prepared") throw new Error("expected prepared Candidate");
  const found = lookupPreparedCandidateV1(
    sourceStore,
    result.preparedCandidateRef,
    NOW,
  );
  if (found.status !== "found") throw new Error("expected complete lease");
  return found.lease;
}

describe("Prepared Candidate lease rehydration", () => {
  it("accepts only a new or byte-identical lease for one Candidate Ref", async () => {
    const lease = await createCompleteLease();
    const targetStore = createPreparedCandidateLeaseStoreV1();
    expect(rehydratePreparedCandidateLeaseV1(targetStore, lease)).toBe(
      "rehydrated",
    );
    expect(rehydratePreparedCandidateLeaseV1(targetStore, lease)).toBe(
      "existing",
    );
    expect(() => rehydratePreparedCandidateLeaseV1(targetStore, {
      ...lease,
      sizeBytes: lease.sizeBytes + 1,
    })).toThrow(/WORLD_CHANGE_PREPARED_CANDIDATE_RECOVERY_CONFLICT/);
    expect(lookupPreparedCandidateV1(
      targetStore,
      lease.preparedCandidateRef,
      NOW,
    )).toEqual({ status: "found", lease });
  });
});
