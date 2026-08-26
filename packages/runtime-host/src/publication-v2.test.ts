import { describe, expect, it } from "vitest";

import {
  HASH_A,
  INITIAL_WORLD_PACKAGE_REF,
  REPLACEMENT_WORLD_PACKAGE_REF,
  RUNTIME_SESSION_ID,
  createHost,
  createPortHarness,
  mutableWorldConfiguration,
  replacementRequest,
} from "./test/runtime-host-lifecycle-harness";
import type { WorldSessionPublicationV1 } from "./world-session";

const REQUEST_HASH = `sha256:${"2".repeat(64)}` as const;

function publicationEnvelope(
  host: {
    readonly runtimeSessionId: string;
    readonly currentWorldSessionId: string;
    snapshot(): { readonly worldState: { readonly worldPackageRootHash: string } };
  },
  extras: {
    readonly expectedWorldSessionId?: string;
    readonly expectedWorldPackageRootHash?: string;
    readonly targetPhaseBarrier?:
      | { readonly mode: "next-world-replacement-barrier" }
      | { readonly mode: "fixed-tick"; readonly expectedSimulationTick: number };
  } = {},
) {
  return {
    requestId: "request.apply.publish-house.001",
    requestHash: REQUEST_HASH,
    fencingToken: "journal",
    runtimeExpectation: {
      runtimeSessionId: host.runtimeSessionId,
      expectedWorldSessionId: extras.expectedWorldSessionId ?? host.currentWorldSessionId,
      expectedWorldPackageRootHash: extras.expectedWorldPackageRootHash ??
        host.snapshot().worldState.worldPackageRootHash,
      targetPhaseBarrier: extras.targetPhaseBarrier ?? {
        mode: "next-world-replacement-barrier" as const,
      },
    },
  };
}

describe("P16-H1 RuntimeHost publication V2", () => {
  it("publishes a new WorldSession at tick 0 and calls persistDurableCommit before swap", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const { host } = await createHost([oldPort, candidatePort]);
    const previousSessionId = host.currentWorldSessionId;
    const previousHash = host.snapshot().worldState.worldPackageRootHash;
    let persistWorldSessionId: string | undefined;
    let persistOrder = "";
    const result = await host.publishWorldReplacementV1({
      worldConfiguration: mutableWorldConfiguration(REPLACEMENT_WORLD_PACKAGE_REF),
      publication: publicationEnvelope(host),
      persistDurableCommit: () => {
        persistWorldSessionId = host.currentWorldSessionId;
        persistOrder = "persist";
      },
    });
    expect(result.status).toBe("published");
    if (result.status !== "published") throw new Error("expected published");
    expect(persistOrder).toBe("persist");
    expect(persistWorldSessionId).toBe(previousSessionId);
    expect(host.currentWorldSessionId).toBe("world-session.next");
    expect(host.snapshot().worldState).toMatchObject({
      worldSessionId: "world-session.next",
      worldPackageRef: REPLACEMENT_WORLD_PACKAGE_REF,
      simulationTick: 0,
    });
    expect(result.previous).toEqual({
      runtimeSessionId: RUNTIME_SESSION_ID,
      worldSessionId: previousSessionId,
      worldPackageRootHash: previousHash,
      simulationTick: 0,
    });
    expect(result.current.worldSessionId).toBe("world-session.next");
    expect(result.current.simulationTick).toBe(0);
    expect(result.cleanup.status).toBe("released");
    expect(oldPort.disposeCount).toBe(1);
    expect(candidatePort.disposeCount).toBe(0);
  });

  it("rejects a stale Runtime expectation before creating a candidate", async () => {
    const oldPort = createPortHarness();
    const unused = createPortHarness();
    const { adapter, host } = await createHost([oldPort, unused]);
    const before = host.snapshot();
    const result = await host.publishWorldReplacementV1({
      worldConfiguration: mutableWorldConfiguration(REPLACEMENT_WORLD_PACKAGE_REF),
      publication: publicationEnvelope(host, {
        expectedWorldSessionId: "world-session.missing",
      }),
    });
    expect(result).toEqual({
      status: "rejected",
      failureKind: "expectation-stale",
      message: "Runtime publication expectation does not match the live Runtime.",
    });
    expect(host.snapshot()).toBe(before);
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(adapter.factory.create).toHaveBeenCalledTimes(1);
    expect(unused.calls).toEqual([]);
  });

  it("rejects fixed-tick publication mode", async () => {
    const oldPort = createPortHarness();
    const unused = createPortHarness();
    const { adapter, host } = await createHost([oldPort, unused]);
    const result = await host.publishWorldReplacementV1({
      worldConfiguration: mutableWorldConfiguration(REPLACEMENT_WORLD_PACKAGE_REF),
      publication: publicationEnvelope(host, {
        targetPhaseBarrier: { mode: "fixed-tick", expectedSimulationTick: 4 },
      }),
    });
    expect(result).toEqual({
      status: "rejected",
      failureKind: "publication-mode-unsupported",
      message: "Full Reload V1 only accepts next-world-replacement-barrier.",
    });
    expect(adapter.factory.preflightConcurrentResidency).not.toHaveBeenCalled();
    expect(unused.calls).toEqual([]);
  });

  it("rejects publication while Runtime Activity is active", async () => {
    const oldPort = createPortHarness();
    const unused = createPortHarness();
    const { host } = await createHost([oldPort, unused]);
    const acquired = host.acquireRuntimeActivity({
      kind: "runtime-run",
      requestId: "activity.block-publish",
      payloadHash: HASH_A,
    });
    expect(acquired.status).toBe("active");
    const result = await host.publishWorldReplacementV1({
      worldConfiguration: mutableWorldConfiguration(REPLACEMENT_WORLD_PACKAGE_REF),
      publication: publicationEnvelope(host),
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejected");
    expect(result.failureKind).toBe("publication-conflict");
    expect(host.currentWorldSessionId).toBe("world-session.initial");
    if (acquired.status === "active") acquired.lease.release();
  });

  it("rejects dual-residency preflight without swapping", async () => {
    const oldPort = createPortHarness();
    const unused = createPortHarness();
    const { adapter, host } = await createHost([oldPort, unused]);
    adapter.factory.preflightConcurrentResidency.mockReturnValueOnce(
      Object.freeze({
        status: "rejected" as const,
        diagnostic: {
          code: "WORLD_REPLACEMENT_CAPACITY_EXCEEDED",
          message: "The Runtime Adapter rejected concurrent World residency.",
        },
      }),
    );
    const result = await host.publishWorldReplacementV1({
      worldConfiguration: mutableWorldConfiguration(REPLACEMENT_WORLD_PACKAGE_REF),
      publication: publicationEnvelope(host),
    });
    expect(result).toMatchObject({
      status: "rejected",
      failureKind: "capacity-exceeded",
    });
    expect(host.currentWorldSessionId).toBe("world-session.initial");
    expect(oldPort.disposeCount).toBe(0);
  });

  it("keeps the old world when persistDurableCommit throws", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const { host } = await createHost([oldPort, candidatePort]);
    const before = host.snapshot();
    const result = await host.publishWorldReplacementV1({
      worldConfiguration: mutableWorldConfiguration(REPLACEMENT_WORLD_PACKAGE_REF),
      publication: publicationEnvelope(host),
      persistDurableCommit: () => {
        throw new Error("durable commit denied");
      },
    });
    expect(result).toEqual({
      status: "rejected",
      failureKind: "commit-failed",
      message: "durable commit denied",
    });
    expect(host.snapshot()).toBe(before);
    expect(host.currentWorldSessionId).toBe("world-session.initial");
    expect(candidatePort.disposeCount).toBe(1);
    expect(oldPort.disposeCount).toBe(0);
  });

  it("still publishes when the retired WorldSession dispose throws", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    oldPort.failNextOperation("dispose", "throw", new Error("private retiring cleanup"));
    const { host } = await createHost([oldPort, candidatePort]);
    const result = await host.publishWorldReplacementV1({
      worldConfiguration: mutableWorldConfiguration(REPLACEMENT_WORLD_PACKAGE_REF),
      publication: publicationEnvelope(host),
    });
    expect(result.status).toBe("published");
    if (result.status !== "published") throw new Error("expected published");
    expect(result.cleanup.status).toBe("quarantined");
    expect(host.currentWorldSessionId).toBe("world-session.next");
    expect(candidatePort.disposeCount).toBe(0);
  });

  it("blocks a second publisher while a replacement is in progress", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const initialize = candidatePort.deferNextOperation("initialize");
    const { host } = await createHost(
      [oldPort, candidatePort],
      ["world-session.initial", "world-session.next", "world-session.third"],
    );
    const first = host.publishWorldReplacementV1({
      worldConfiguration: mutableWorldConfiguration(REPLACEMENT_WORLD_PACKAGE_REF),
      publication: publicationEnvelope(host),
    });
    await initialize.entered;
    const second = await host.publishWorldReplacementV1({
      worldConfiguration: mutableWorldConfiguration(REPLACEMENT_WORLD_PACKAGE_REF),
      publication: publicationEnvelope(host),
    });
    expect(second).toEqual({
      status: "rejected",
      failureKind: "publication-conflict",
      message: "A World replacement is already in progress.",
    });
    initialize.release();
    const published = await first;
    expect(published.status).toBe("published");
  });

  it("leaves possession unbound at the publication ready gate", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const { host, adapter } = await createHost([oldPort, candidatePort]);
    let controlledAtReady: string | undefined;
    adapter.factory.awaitCandidatePublicationReady.mockImplementation(
      async (input: { publication: WorldSessionPublicationV1 }) => {
        const possessed = Object.values(
          input.publication.gameplayInspection.relationshipStatesById,
        ).find((relationship) => relationship.type === "possessedBy");
        controlledAtReady = possessed?.type === "possessedBy"
          ? possessed.controlledEntityId
          : undefined;
      },
    );
    const result = await host.publishWorldReplacementV1({
      worldConfiguration: mutableWorldConfiguration(REPLACEMENT_WORLD_PACKAGE_REF),
      publication: publicationEnvelope(host),
    });
    expect(result.status).toBe("published");
    expect(controlledAtReady).toBeUndefined();
  });

  it("keeps ordinary replaceWorld on the exact worldConfiguration envelope", async () => {
    const oldPort = createPortHarness();
    const candidatePort = createPortHarness();
    const { host } = await createHost([oldPort, candidatePort]);
    const published = await host.replaceWorld(
      replacementRequest(REPLACEMENT_WORLD_PACKAGE_REF),
    );
    expect(published.worldState).toMatchObject({
      worldSessionId: "world-session.next",
      worldPackageRef: REPLACEMENT_WORLD_PACKAGE_REF,
    });
    expect(() => host.replaceWorld({
      worldConfiguration: mutableWorldConfiguration(INITIAL_WORLD_PACKAGE_REF),
      publication: publicationEnvelope(host),
    })).toThrow(/RuntimeWorldReplacementRequestV1/);
  });
});
