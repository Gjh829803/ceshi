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

    expect(acquired.release()).toMatchObject({ status: "released" });
    expect(acquired.release()).toMatchObject({ status: "released" });
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
    expect(first.release()).toMatchObject({ status: "terminated-by-host" });
    expect(second.release()).toMatchObject({ status: "terminated-by-host" });
    expect(coordinator.snapshot()).toEqual({
      runtimeActivityEpoch: 3,
      activeRuntimeActivityCount: 0,
      retainedRuntimeActivityRecordCount: 2,
    });
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
});
