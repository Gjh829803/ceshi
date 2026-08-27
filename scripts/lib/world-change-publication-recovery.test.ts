import { readFileSync } from "node:fs";
import path from "node:path";

import { hashAuthoringDocumentV4 } from "@whitebox-world/authoring";
import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  parseWorldChangeRequestV1,
  parseWorldChangeSetV1,
  type RuntimePublicationIdentityV1,
  type Sha256HashV1,
  type WorldChangeDiagnosticV1,
} from "@whitebox-world/authoring-edit";
import {
  createWorldChangeJournalV1,
  listPendingWorldPublicationRecoveriesV1,
  type RecoverCommittedRuntimePublicationPortV1,
  type TrustedRuntimeWorldConfigurationV1,
} from "@whitebox-world/authoring-host";
import {
  createInMemoryWorldPackageStoreV1,
  createWorldPackageBuildContextFixtureV2,
} from "@whitebox-world/world-package/testing";
import { isNil } from "lodash-es";
import { describe, expect, it, vi } from "vitest";

import { createAuthoringEditHostBridgeV1 } from "./authoring-edit-host-bridge";
import {
  WorldPublicationRecoveryCoordinatorErrorV1,
  recoverCommittedWorldPublicationsV1,
} from "./world-change-publication-recovery";

const EXAMPLES_ROOT = path.resolve(import.meta.dirname, "../../examples/authoring");
const INITIAL_ROOT = `sha256:${"d".repeat(64)}` as Sha256HashV1;

function addHouseChangeSet(baseAuthoringSpecHash: Sha256HashV1) {
  const raw = JSON.parse(readFileSync(
    path.join(EXAMPLES_ROOT, "p16-add-house/change-set.json"),
    "utf8",
  )) as Record<string, unknown>;
  return parseWorldChangeSetV1({ ...raw, baseAuthoringSpecHash });
}

function cleanupDiagnostic(code: WorldChangeDiagnosticV1["code"]): WorldChangeDiagnosticV1 {
  return {
    severity: "error",
    code,
    instancePath: "/runtimeCleanup",
    message: code,
  };
}

async function committedFixture() {
  const spec = createValidAuthoringSpec();
  const baseHash = hashAuthoringDocumentV4(spec) as Sha256HashV1;
  const worldPackageStore = createInMemoryWorldPackageStoreV1();
  let currentIdentity: RuntimePublicationIdentityV1 | undefined;
  const publishWorldReplacementV1 = vi.fn(async (input: {
    readonly worldConfiguration: TrustedRuntimeWorldConfigurationV1;
    readonly persistDurableCommit: (identities: {
      readonly previous: RuntimePublicationIdentityV1;
      readonly current: RuntimePublicationIdentityV1;
    }) => () => void;
  }) => {
    const previous = {
      runtimeSessionId: "runtime-session.recovery",
      worldSessionId: "world-session.previous",
      worldPackageRootHash: INITIAL_ROOT,
      simulationTick: 41,
    } as const;
    const current = {
      runtimeSessionId: "runtime-session.recovery",
      worldSessionId: "world-session.committed",
      worldPackageRootHash:
        input.worldConfiguration.worldPackageBuildReceipt.worldPackageRootHash,
      simulationTick: 0,
    } as const;
    const releaseFence = input.persistDurableCommit({ previous, current });
    releaseFence();
    currentIdentity = current;
    throw new Error("simulated crash after durable commit and before handle swap");
  });
  const bridge = createAuthoringEditHostBridgeV1({
    authoringSpec: spec,
    worldPackageStore,
    worldPackageBuildContext: createWorldPackageBuildContextFixtureV2(),
    resourceArtifacts: [],
    runtimeHost: { publishWorldReplacementV1 } as never,
    nowUnixMilliseconds: () => 1_700_000_000_000,
  });
  const sessionId = bridge.host.currentSession().authoringEditSessionId;
  const changeSet = addHouseChangeSet(baseHash);
  const dryRun = await bridge.host.dryRunWorldChange(parseWorldChangeRequestV1({
    kind: "worldkit-world-change-request",
    schemaVersion: 1,
    id: "request.recovery.dry-run",
    authoringEditSessionId: sessionId,
    worldId: spec.id,
    changeSet,
    mode: "dry-run",
  }) as never);
  if (dryRun.status !== "succeeded" || dryRun.mode !== "dry-run") {
    throw new Error("expected dry run");
  }
  const committed = await bridge.host.applyWorldChange(parseWorldChangeRequestV1({
    kind: "worldkit-world-change-request",
    schemaVersion: 1,
    id: "request.recovery.apply",
    authoringEditSessionId: sessionId,
    worldId: spec.id,
    changeSet,
    mode: "apply",
    requestedOutcome: "publish-runtime",
    preparedCandidateRef: dryRun.preparedCandidateRef,
    runtimeExpectation: {
      runtimeSessionId: "runtime-session.recovery",
      expectedWorldSessionId: "world-session.previous",
      expectedWorldPackageRootHash: INITIAL_ROOT,
      targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
    },
  }) as never);
  if (
    committed.status !== "committed" ||
    committed.mode !== "apply" ||
    committed.requestedOutcome !== "publish-runtime" ||
    isNil(currentIdentity)
  ) throw new Error("expected committed publication");
  return {
    bridge,
    committed,
    currentIdentity,
    worldPackageStore,
  };
}

function runtimePort(input: {
  readonly recover?: RecoverCommittedRuntimePublicationPortV1["recover"];
  readonly retryCleanup?: RecoverCommittedRuntimePublicationPortV1["retryCleanup"];
} = {}): RecoverCommittedRuntimePublicationPortV1 {
  return {
    recover: isNil(input.recover)
      ? async ({ committedIdentity }) => ({
        status: "recovered" as const,
        identity: committedIdentity,
      })
      : input.recover,
    retryCleanup: isNil(input.retryCleanup)
      ? async () => ({ status: "released" as const })
      : input.retryCleanup,
  };
}

describe("committed World publication startup recovery", () => {
  it("does no Runtime or cleanup work for an empty journal", async () => {
    const port = runtimePort({
      recover: vi.fn(),
      retryCleanup: vi.fn(),
    });
    await expect(recoverCommittedWorldPublicationsV1({
      journal: createWorldChangeJournalV1(),
      worldPackageStore: createInMemoryWorldPackageStoreV1(),
      runtimePort: port,
      maximumCleanupAttemptCount: 3,
    })).resolves.toEqual([]);
    expect(port.recover).not.toHaveBeenCalled();
    expect(port.retryCleanup).not.toHaveBeenCalled();
  });

  it("marks recovery only after exact Runtime identity and releases cleanup monotonically", async () => {
    const fixture = await committedFixture();
    const receiptBytes = JSON.stringify(fixture.committed);
    const reports = await recoverCommittedWorldPublicationsV1({
      journal: fixture.bridge.journal,
      worldPackageStore: fixture.worldPackageStore,
      runtimePort: runtimePort(),
      maximumCleanupAttemptCount: 3,
    });
    expect(listPendingWorldPublicationRecoveriesV1(fixture.bridge.journal)).toEqual([]);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ status: "released", attemptCount: 2 });
    expect(JSON.stringify(fixture.committed)).toBe(receiptBytes);
  });

  it("keeps the World fenced when the Package is missing or Runtime identity diverges", async () => {
    const missing = await committedFixture();
    await expect(recoverCommittedWorldPublicationsV1({
      journal: missing.bridge.journal,
      worldPackageStore: createInMemoryWorldPackageStoreV1(),
      runtimePort: runtimePort(),
      maximumCleanupAttemptCount: 3,
    })).rejects.toBeInstanceOf(WorldPublicationRecoveryCoordinatorErrorV1);
    expect(listPendingWorldPublicationRecoveriesV1(missing.bridge.journal)).toHaveLength(1);

    const divergent = await committedFixture();
    await expect(recoverCommittedWorldPublicationsV1({
      journal: divergent.bridge.journal,
      worldPackageStore: divergent.worldPackageStore,
      runtimePort: runtimePort({
        recover: async ({ committedIdentity }) => ({
          status: "recovered",
          identity: {
            ...committedIdentity,
            worldSessionId: "world-session.divergent",
          },
        }),
      }),
      maximumCleanupAttemptCount: 3,
    })).rejects.toBeInstanceOf(WorldPublicationRecoveryCoordinatorErrorV1);
    expect(listPendingWorldPublicationRecoveriesV1(divergent.bridge.journal)).toHaveLength(1);
  });

  it("resumes retrying cleanup after recovery and quarantines at the configured limit", async () => {
    const released = await committedFixture();
    const first = await recoverCommittedWorldPublicationsV1({
      journal: released.bridge.journal,
      worldPackageStore: released.worldPackageStore,
      runtimePort: runtimePort({
        retryCleanup: async () => ({
          status: "retryable",
          diagnostics: [cleanupDiagnostic("WORLD_CHANGE_CLEANUP_INCOMPLETE")],
        }),
      }),
      maximumCleanupAttemptCount: 3,
    });
    expect(first[0]).toMatchObject({ status: "retrying", attemptCount: 1 });
    const second = await recoverCommittedWorldPublicationsV1({
      journal: released.bridge.journal,
      worldPackageStore: released.worldPackageStore,
      runtimePort: runtimePort(),
      maximumCleanupAttemptCount: 3,
    });
    expect(second[0]).toMatchObject({ status: "released", attemptCount: 3 });

    const quarantined = await committedFixture();
    const reports = await recoverCommittedWorldPublicationsV1({
      journal: quarantined.bridge.journal,
      worldPackageStore: quarantined.worldPackageStore,
      runtimePort: runtimePort({
        retryCleanup: async () => ({
          status: "retryable",
          diagnostics: [cleanupDiagnostic("WORLD_CHANGE_CLEANUP_QUARANTINED")],
        }),
      }),
      maximumCleanupAttemptCount: 1,
    });
    expect(reports[0]).toMatchObject({ status: "quarantined", attemptCount: 2 });
  });
});
