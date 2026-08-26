import { hashAuthoringDocumentV4 } from "@whitebox-world/authoring";
import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  createWorldChangeJournalV1,
  getAuthoringRevisionHeadV1,
  seedAuthoringRevisionHeadV1,
} from "@whitebox-world/authoring-host";
import { describe, expect, it, vi } from "vitest";

import {
  AUTHORING_EDIT_HOST_BRIDGE_KIND,
  bindRuntimeHostPublicationPortV1,
  createAuthoringEditHostBridgeV1,
} from "./authoring-edit-host-bridge";

const HASH = `sha256:${"d".repeat(64)}` as const;

describe("P16-B1 Authoring/Edit Host bridge", () => {
  it("maps RuntimeHost publication V2 onto the journal publication port", async () => {
    const persistDurableCommit = vi.fn();
    const publishWorldReplacementV1 = vi.fn(async (input: unknown) => {
      const record = input as {
        readonly persistDurableCommit: typeof persistDurableCommit;
      };
      const releaseFence = record.persistDurableCommit({
        previous: {
          runtimeSessionId: "runtime-session-9",
          worldSessionId: "world-session-31",
          worldPackageRootHash: HASH,
          simulationTick: 3,
        },
        current: {
          runtimeSessionId: "runtime-session-9",
          worldSessionId: "world-session-32",
          worldPackageRootHash: HASH,
          simulationTick: 0,
        },
      });
      if (typeof releaseFence === "function") releaseFence();
      return {
        status: "published" as const,
        publication: {
          publicationEpoch: 2,
          worldState: {},
          gameplayInspection: {},
          viewState: {},
        } as never,
        previous: {
          runtimeSessionId: "runtime-session-9",
          worldSessionId: "world-session-31",
          worldPackageRootHash: HASH,
          simulationTick: 3,
        },
        current: {
          runtimeSessionId: "runtime-session-9",
          worldSessionId: "world-session-32",
          worldPackageRootHash: HASH,
          simulationTick: 0,
        },
        cleanup: { status: "released" as const, diagnostics: [] },
      };
    });
    const port = bindRuntimeHostPublicationPortV1({ publishWorldReplacementV1 });
    const published = await port({
      worldConfiguration: {
        executionPlan: {} as never,
        executionPlanHash: HASH,
        worldPackageRef: "worldkit://world-package/basic-world@1",
        worldPackageBuildReceipt: {} as never,
        gameplayBootstrap: {} as never,
      },
      publication: {
        requestId: "request.apply.publish-house.001",
        requestHash: HASH,
        fencingToken: "journal",
        runtimeExpectation: {
          runtimeSessionId: "runtime-session-9",
          expectedWorldSessionId: "world-session-31",
          expectedWorldPackageRootHash: HASH,
          targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
        },
      },
      persistDurableCommit,
    });
    expect(published).toEqual({
      status: "published",
      previous: {
        runtimeSessionId: "runtime-session-9",
        worldSessionId: "world-session-31",
        worldPackageRootHash: HASH,
        simulationTick: 3,
      },
      current: {
        runtimeSessionId: "runtime-session-9",
        worldSessionId: "world-session-32",
        worldPackageRootHash: HASH,
        simulationTick: 0,
      },
      cleanupStatus: "released",
      cleanupDiagnostics: [],
    });
    expect(publishWorldReplacementV1).toHaveBeenCalledTimes(1);
    expect(persistDurableCommit).toHaveBeenCalledTimes(1);
  });

  it("maps quarantined Runtime cleanup to WORLD_CHANGE_CLEANUP_QUARANTINED", async () => {
    const port = bindRuntimeHostPublicationPortV1({
      publishWorldReplacementV1: async () => ({
        status: "published",
        publication: {
          publicationEpoch: 2,
          worldState: {},
          gameplayInspection: {},
          viewState: {},
        } as never,
        previous: {
          runtimeSessionId: "runtime-session-9",
          worldSessionId: "world-session-31",
          worldPackageRootHash: HASH,
          simulationTick: 1,
        },
        current: {
          runtimeSessionId: "runtime-session-9",
          worldSessionId: "world-session-32",
          worldPackageRootHash: HASH,
          simulationTick: 0,
        },
        cleanup: { status: "quarantined", diagnostics: [] },
      }),
    });
    const published = await port({
      worldConfiguration: {
        executionPlan: {} as never,
        executionPlanHash: HASH,
        worldPackageRef: "worldkit://world-package/basic-world@1",
        worldPackageBuildReceipt: {} as never,
        gameplayBootstrap: {} as never,
      },
      publication: {
        requestId: "request.apply.publish-house.002",
        requestHash: HASH,
        fencingToken: "journal",
        runtimeExpectation: {
          runtimeSessionId: "runtime-session-9",
          expectedWorldSessionId: "world-session-31",
          expectedWorldPackageRootHash: HASH,
          targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
        },
      },
      persistDurableCommit: () => () => undefined,
    });
    expect(published.status).toBe("published");
    if (published.status !== "published") throw new Error("expected published");
    expect(published.cleanupStatus).toBe("quarantined");
    expect(published.cleanupDiagnostics[0]?.code).toBe("WORLD_CHANGE_CLEANUP_QUARANTINED");
  });

  it("creates a Host bound to a seeded Authoring revision", async () => {
    const spec = createValidAuthoringSpec();
    const bridge = createAuthoringEditHostBridgeV1({
      authoringSpec: spec,
      nowUnixMilliseconds: () => 1_700_000_000_000,
    });
    expect(bridge.kind).toBe(AUTHORING_EDIT_HOST_BRIDGE_KIND);
    expect(bridge.host.version).toBe(1);
    expect(bridge.host.currentSession().policy.allowedWorldIds).toEqual([spec.id]);
    const projection = await bridge.host.projectAiSchema({
      kind: "worldkit-ai-schema-projection-request",
      schemaVersion: 1,
      id: "request.project.bridge",
      authoringEditSessionId: bridge.host.currentSession().authoringEditSessionId,
      projectionProfileRef: bridge.host.currentSession().policy.projectionProfileRef,
      authoringSchemaVersion: 4,
    });
    expect(projection.kind).toBe("worldkit-ai-schema-projection");
  });

  it("uses an injected durable journal without reseeding its current revision", () => {
    const spec = createValidAuthoringSpec();
    const journal = createWorldChangeJournalV1();
    seedAuthoringRevisionHeadV1(journal, {
      worldId: spec.id,
      revisionRef: `revision://${spec.id}/7`,
      authoringSpec: spec,
      authoringSpecHash: hashAuthoringDocumentV4(spec),
    });

    const bridge = createAuthoringEditHostBridgeV1({
      authoringSpec: spec,
      journal,
      nowUnixMilliseconds: () => 1_700_000_000_000,
    });

    expect(bridge.journal).toBe(journal);
    expect(getAuthoringRevisionHeadV1(journal, spec.id)?.revisionRef).toBe(
      `revision://${spec.id}/7`,
    );
  });
});
