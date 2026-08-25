import { describe, expect, it } from "vitest";

import {
  RuntimeActivityCoordinator,
  type RuntimeActivityRequestV1,
} from "./runtime-host";

const firstRequest = {
  kind: "runtime-run",
  requestId: "runtime-run-1",
  payloadHash: `sha256:${"1".repeat(64)}`,
} as const satisfies RuntimeActivityRequestV1;

describe("RuntimeActivityCoordinator", () => {
  it("retains one active lease for an idempotent exact request", () => {
    const coordinator = new RuntimeActivityCoordinator({
      maximumRuntimeActivityRecordCount: 2,
    });

    const first = coordinator.acquire(firstRequest, "world-session-1");
    const replay = coordinator.acquire({ ...firstRequest }, "world-session-1");

    expect(first).toMatchObject({ status: "active" });
    expect(replay).toBe(first);
    if (first.status !== "active") throw new Error("Expected active lease.");
    expect(first.lease).not.toHaveProperty("status");
    expect(coordinator.snapshot()).toEqual({
      runtimeActivityEpoch: 1,
      activeRuntimeActivityCount: 1,
      retainedRuntimeActivityRecordCount: 1,
    });
  });

  it("rejects changed payload and world-session reuse without changing epoch", () => {
    const coordinator = new RuntimeActivityCoordinator({
      maximumRuntimeActivityRecordCount: 2,
    });
    coordinator.acquire(firstRequest, "world-session-1");

    expect(coordinator.acquire({
      ...firstRequest,
      payloadHash: `sha256:${"2".repeat(64)}`,
    }, "world-session-1")).toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_ACTIVITY_ID_CONFLICT" },
    });
    expect(coordinator.acquire(firstRequest, "world-session-2")).toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_ACTIVITY_ID_CONFLICT" },
    });
    expect(coordinator.snapshot().runtimeActivityEpoch).toBe(1);
  });

  it("releases once, makes late release idempotent, and never revives the request", () => {
    const coordinator = new RuntimeActivityCoordinator({
      maximumRuntimeActivityRecordCount: 2,
    });
    const acquired = coordinator.acquire(firstRequest, "world-session-1");
    if (acquired.status !== "active") throw new Error("Expected active lease.");

    expect(acquired.lease.release()).toMatchObject({ status: "released" });
    expect(acquired.lease.release()).toMatchObject({ status: "released" });
    expect(acquired.lease).not.toHaveProperty("status");
    expect(coordinator.acquire(firstRequest, "world-session-1")).toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_ACTIVITY_NOT_ACTIVE" },
    });
    expect(coordinator.snapshot()).toEqual({
      runtimeActivityEpoch: 2,
      activeRuntimeActivityCount: 0,
      retainedRuntimeActivityRecordCount: 1,
    });
  });

  it("fails closed at retained-record capacity before changing epoch", () => {
    const coordinator = new RuntimeActivityCoordinator({
      maximumRuntimeActivityRecordCount: 1,
    });
    coordinator.acquire(firstRequest, "world-session-1");

    expect(coordinator.acquire({
      kind: "control-capture",
      requestId: "capture-2",
      payloadHash: `sha256:${"2".repeat(64)}`,
    }, "world-session-1")).toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_HOST_CAPACITY_EXCEEDED" },
    });
    expect(coordinator.snapshot()).toEqual({
      runtimeActivityEpoch: 1,
      activeRuntimeActivityCount: 1,
      retainedRuntimeActivityRecordCount: 1,
    });
  });

  it("terminates active leases atomically and makes late release observe the terminal state", () => {
    const coordinator = new RuntimeActivityCoordinator({
      maximumRuntimeActivityRecordCount: 2,
    });
    const first = coordinator.acquire(firstRequest, "world-session-1");
    const second = coordinator.acquire({
      kind: "simulation-take",
      requestId: "take-2",
      payloadHash: `sha256:${"2".repeat(64)}`,
    }, "world-session-1");
    if (first.status !== "active" || second.status !== "active") {
      throw new Error("Expected active leases.");
    }

    expect(coordinator.terminateAll()).toEqual([
      expect.objectContaining({ requestId: "runtime-run-1", status: "terminated-by-host" }),
      expect.objectContaining({ requestId: "take-2", status: "terminated-by-host" }),
    ]);
    expect(first.lease.release()).toMatchObject({ status: "terminated-by-host" });
    expect(second.lease.release()).toMatchObject({ status: "terminated-by-host" });
    expect(coordinator.snapshot()).toEqual({
      runtimeActivityEpoch: 3,
      activeRuntimeActivityCount: 0,
      retainedRuntimeActivityRecordCount: 2,
    });
  });

  it("aborts active work and joins its registered cleanup before Host disposal", async () => {
    const coordinator = new RuntimeActivityCoordinator({
      maximumRuntimeActivityRecordCount: 1,
    });
    const acquired = coordinator.acquire(firstRequest, "world-session-1");
    if (acquired.status !== "active") throw new Error("Expected active lease.");
    let finishCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    acquired.lease.registerCleanup(cleanup);

    const joined = coordinator.terminateAllForHostDisposal();
    expect(acquired.lease.cancellationSignal.aborted).toBe(true);
    let settled = false;
    void joined.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishCleanup();
    await expect(joined).resolves.toBeUndefined();
    expect(acquired.lease.release()).toMatchObject({
      status: "terminated-by-host",
    });
  });

  it("joins registered cleanup after the Activity was released", async () => {
    const coordinator = new RuntimeActivityCoordinator({
      maximumRuntimeActivityRecordCount: 1,
    });
    const acquired = coordinator.acquire(firstRequest, "world-session-1");
    if (acquired.status !== "active") throw new Error("Expected active lease.");
    let finishCleanup!: () => void;
    acquired.lease.registerCleanup(new Promise<void>((resolve) => {
      finishCleanup = resolve;
    }));
    expect(acquired.lease.release()).toMatchObject({ status: "released" });

    const joined = coordinator.terminateAllForHostDisposal();
    let settled = false;
    void joined.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishCleanup();
    await expect(joined).resolves.toBeUndefined();
  });

  it("waits for every registered cleanup before reporting a failure", async () => {
    const coordinator = new RuntimeActivityCoordinator({
      maximumRuntimeActivityRecordCount: 2,
    });
    const first = coordinator.acquire(firstRequest, "world-session-1");
    const second = coordinator.acquire({
      kind: "simulation-take",
      requestId: "take-cleanup-pending",
      payloadHash: `sha256:${"2".repeat(64)}`,
    }, "world-session-1");
    if (first.status !== "active" || second.status !== "active") {
      throw new Error("Expected active leases.");
    }
    first.lease.registerCleanup(Promise.reject(new Error("private failure")));
    let finishSecondCleanup!: () => void;
    second.lease.registerCleanup(new Promise<void>((resolve) => {
      finishSecondCleanup = resolve;
    }));

    const joined = coordinator.terminateAllForHostDisposal();
    let settled = false;
    void joined.catch(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    finishSecondCleanup();
    await expect(joined).rejects.toBeInstanceOf(AggregateError);
  });

  it("marks every lease terminal before dispatching synchronous abort callbacks", () => {
    const coordinator = new RuntimeActivityCoordinator({
      maximumRuntimeActivityRecordCount: 2,
    });
    const first = coordinator.acquire(firstRequest, "world-session-1");
    const second = coordinator.acquire({
      kind: "simulation-take",
      requestId: "take-abort-reentrant-release",
      payloadHash: `sha256:${"2".repeat(64)}`,
    }, "world-session-1");
    if (first.status !== "active" || second.status !== "active") {
      throw new Error("Expected active leases.");
    }
    first.lease.cancellationSignal.addEventListener("abort", () => {
      second.lease.release();
    });

    expect(coordinator.terminateAll()).toEqual([
      expect.objectContaining({
        requestId: firstRequest.requestId,
        status: "terminated-by-host",
      }),
      expect.objectContaining({
        requestId: "take-abort-reentrant-release",
        status: "terminated-by-host",
      }),
    ]);
    expect(coordinator.snapshot().activeRuntimeActivityCount).toBe(0);
    expect(second.lease.release()).toMatchObject({ status: "terminated-by-host" });
    expect(coordinator.snapshot().activeRuntimeActivityCount).toBe(0);
  });

  it("rejects cleanup registration after terminal release", async () => {
    const coordinator = new RuntimeActivityCoordinator({
      maximumRuntimeActivityRecordCount: 1,
    });
    const acquired = coordinator.acquire(firstRequest, "world-session-1");
    if (acquired.status !== "active") throw new Error("Expected active lease.");

    coordinator.terminateAll();
    acquired.lease.release();
    expect(() => acquired.lease.registerCleanup(Promise.resolve())).toThrow(
      /RUNTIME_ACTIVITY_ID_CONFLICT/,
    );
    await expect(coordinator.terminateAllForHostDisposal()).resolves
      .toBeUndefined();
  });

  it("rejects hostile requests without invoking accessors", () => {
    const coordinator = new RuntimeActivityCoordinator({
      maximumRuntimeActivityRecordCount: 2,
    });
    let reads = 0;
    const hostile = {
      kind: "runtime-run",
      requestId: "hostile",
      payloadHash: `sha256:${"3".repeat(64)}`,
    } as Record<string, unknown>;
    Object.defineProperty(hostile, "requestId", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "hostile";
      },
    });

    expect(coordinator.acquire(hostile, "world-session-1")).toMatchObject({
      status: "rejected",
      diagnostic: { code: "INPUT_INVALID" },
    });
    expect(reads).toBe(0);
    expect(coordinator.snapshot().runtimeActivityEpoch).toBe(0);
  });

  it("snapshots exact constructor options once and rejects hostile shapes", () => {
    let reads = 0;
    const accessorOptions = {} as Record<string, unknown>;
    Object.defineProperty(accessorOptions, "maximumRuntimeActivityRecordCount", {
      enumerable: true,
      get: () => {
        reads += 1;
        return reads < 3 ? 1 : -1;
      },
    });

    for (const options of [
      accessorOptions,
      { maximumRuntimeActivityRecordCount: 1, extra: true },
      { maximumRuntimeActivityRecordCount: 1, [Symbol("hidden")]: true },
      Object.assign(Object.create({ inherited: true }), {
        maximumRuntimeActivityRecordCount: 1,
      }),
    ]) {
      expect(() => new RuntimeActivityCoordinator(options)).toThrow(
        /maximumRuntimeActivityRecordCount/,
      );
    }
    expect(reads).toBe(0);
  });

  it.each(["released", "terminated-by-host"] as const)(
    "keeps a %s record in retention capacity",
    (terminalStatus) => {
      const coordinator = new RuntimeActivityCoordinator({
        maximumRuntimeActivityRecordCount: 1,
      });
      const acquired = coordinator.acquire(firstRequest, "world-session-1");
      if (acquired.status !== "active") throw new Error("Expected active lease.");
      if (terminalStatus === "released") acquired.lease.release();
      else coordinator.terminateAll();

      expect(coordinator.acquire({
        kind: "control-capture",
        requestId: "capture-after-terminal",
        payloadHash: `sha256:${"4".repeat(64)}`,
      }, "world-session-1")).toMatchObject({
        status: "rejected",
        diagnostic: { code: "RUNTIME_HOST_CAPACITY_EXCEEDED" },
      });
      expect(coordinator.snapshot()).toMatchObject({
        activeRuntimeActivityCount: 0,
        retainedRuntimeActivityRecordCount: 1,
      });
    },
  );
});
