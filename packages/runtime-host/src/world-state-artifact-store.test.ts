import {
  buildWorldStateSnapshotV1,
  deriveWorldStateSnapshotRefV1,
  type WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import { describe, expect, it } from "vitest";

import { WorldStateArtifactStore } from "./world-state-artifact-store";

function snapshot(simulationTick: number, worldPackageRef = "worldkit://world-package/1"):
  WorldStateSnapshotV1 {
  return buildWorldStateSnapshotV1({
    kind: "worldkit-world-state-snapshot",
    schemaVersion: 1,
    runtimeSessionId: "runtime-1",
    worldSessionId: "world-1",
    simulationTick,
    worldPackageRef,
    worldPackageRootHash: `sha256:${"1".repeat(64)}`,
    executionPlanHash: `sha256:${"2".repeat(64)}`,
    entityStatesById: {},
    capabilityStatesById: {},
    relationshipStatesById: {},
    semanticFactsById: {},
    activeActionStatesById: {},
    lastEventSequence: simulationTick,
  });
}

function ref(value: WorldStateSnapshotV1): string {
  return deriveWorldStateSnapshotRefV1({
    runtimeSessionId: value.runtimeSessionId,
    worldSessionId: value.worldSessionId,
    worldStateHash: value.worldStateHash,
  });
}

describe("WorldStateArtifactStore", () => {
  it("reserves an unknown artifact slot before prepare and derives the Ref later", () => {
    const store = new WorldStateArtifactStore({
      maximumRetainedWorldStateSnapshotCount: 1,
    });
    const first = snapshot(1);
    const reservation = store.reserveSlot();
    if (reservation.status !== "reserved") throw new Error("Expected capacity.");

    const prepared = reservation.reservation.prepare(first);
    expect(prepared.worldStateRef).toBe(ref(first));
    expect(store.get(ref(first))).toBeUndefined();
    expect(prepared.commitPrepared).not.toThrow();
    expect(prepared.commitPrepared).not.toThrow();
    expect(store.get(ref(first))).toBe(prepared.snapshot);
    expect(store.reserveSlot()).toEqual({ status: "capacity-exceeded" });
  });

  it("releases a pre-prepare unknown artifact slot", () => {
    const store = new WorldStateArtifactStore({
      maximumRetainedWorldStateSnapshotCount: 1,
    });
    const reservation = store.reserveSlot();
    if (reservation.status !== "reserved") throw new Error("Expected capacity.");

    expect(reservation.reservation.release()).toBe("released");
    expect(store.reserveSlot().status).toBe("reserved");
  });

  it("retains a canonical Snapshot by Ref until disposal", () => {
    const store = new WorldStateArtifactStore({
      maximumRetainedWorldStateSnapshotCount: 2,
    });
    const first = snapshot(1);
    const firstRef = ref(first);
    const reserved = store.reserve(firstRef);
    if (reserved.status !== "reserved") throw new Error("Expected capacity.");

    const retained = reserved.reservation.prepare(first).commitPrepared();
    expect(store.get(firstRef)).toBe(retained);
    expect(store.snapshot()).toEqual({
      retainedWorldStateSnapshotCount: 1,
      reservedWorldStateSnapshotCount: 0,
      isDisposed: false,
    });

    store.dispose();
    expect(store.snapshot()).toEqual({
      retainedWorldStateSnapshotCount: 0,
      reservedWorldStateSnapshotCount: 0,
      isDisposed: true,
    });
    expect(() => store.get(firstRef)).toThrow(/disposed/);
  });

  it("treats the same Ref and exact canonical bytes as idempotent without a new slot", () => {
    const store = new WorldStateArtifactStore({
      maximumRetainedWorldStateSnapshotCount: 1,
    });
    const first = snapshot(1);
    const firstRef = ref(first);
    const firstReservation = store.reserve(firstRef);
    if (firstReservation.status !== "reserved") throw new Error("Expected capacity.");
    firstReservation.reservation.prepare(first).commitPrepared();

    const replayReservation = store.reserve(firstRef);
    if (replayReservation.status !== "reserved") throw new Error("Expected replay.");
    const replay = replayReservation.reservation.prepare({ ...first }).commitPrepared();

    expect(replay).toBe(store.get(firstRef));
    expect(store.snapshot().retainedWorldStateSnapshotCount).toBe(1);
  });

  it("fails closed when the same Ref is paired with different canonical bytes", () => {
    const store = new WorldStateArtifactStore({
      maximumRetainedWorldStateSnapshotCount: 1,
    });
    const first = snapshot(1);
    const firstRef = ref(first);
    const firstReservation = store.reserve(firstRef);
    if (firstReservation.status !== "reserved") throw new Error("Expected capacity.");
    firstReservation.reservation.prepare(first).commitPrepared();
    const conflict = { ...first, worldPackageRef: "worldkit://world-package/changed" };
    const conflictReservation = store.reserve(firstRef);
    if (conflictReservation.status !== "reserved") throw new Error("Expected replay slot.");

    expect(() => conflictReservation.reservation.prepare(conflict)).toThrow(
      /canonical bytes conflict/,
    );
    expect(store.get(firstRef)).toEqual(first);
  });

  it("rejects a Snapshot whose derived Ref differs from the reservation", () => {
    const store = new WorldStateArtifactStore({
      maximumRetainedWorldStateSnapshotCount: 2,
    });
    const first = snapshot(1);
    const second = snapshot(2);
    const reserved = store.reserve(ref(first));
    if (reserved.status !== "reserved") throw new Error("Expected capacity.");

    expect(() => reserved.reservation.prepare(second)).toThrow(/reserved Ref/);
    expect(store.snapshot().reservedWorldStateSnapshotCount).toBe(0);
  });

  it("releases capacity idempotently and fails closed at the configured bound", () => {
    const store = new WorldStateArtifactStore({
      maximumRetainedWorldStateSnapshotCount: 1,
    });
    const first = snapshot(1);
    const second = snapshot(2);
    const firstReservation = store.reserve(ref(first));
    if (firstReservation.status !== "reserved") throw new Error("Expected capacity.");

    expect(store.reserve(ref(second))).toEqual({ status: "capacity-exceeded" });
    expect(firstReservation.reservation.release()).toBe("released");
    expect(firstReservation.reservation.release()).toBe("released");
    expect(store.reserve(ref(second)).status).toBe("reserved");
  });

  it("rejects invalid capacity, Ref, hostile Snapshot, and all writes after disposal", () => {
    expect(() => new WorldStateArtifactStore({
      maximumRetainedWorldStateSnapshotCount: -1,
    })).toThrow(/maximumRetainedWorldStateSnapshotCount/);
    const store = new WorldStateArtifactStore({
      maximumRetainedWorldStateSnapshotCount: 1,
    });
    expect(() => store.reserve("not-a-world-state-ref")).toThrow(/World State Ref/);
    const first = snapshot(1);
    const reserved = store.reserve(ref(first));
    if (reserved.status !== "reserved") throw new Error("Expected capacity.");
    const hostile = { ...first } as Record<string, unknown>;
    Object.defineProperty(hostile, "simulationTick", {
      enumerable: true,
      get: () => 1,
    });
    expect(() => reserved.reservation.prepare(hostile)).toThrow();
    store.dispose();
    expect(() => store.reserve(ref(first))).toThrow(/disposed/);
  });

  it("does not let late reservation release after disposal corrupt capacity counters", () => {
    const store = new WorldStateArtifactStore({
      maximumRetainedWorldStateSnapshotCount: 1,
    });
    const first = snapshot(1);
    const reserved = store.reserve(ref(first));
    if (reserved.status !== "reserved") throw new Error("Expected capacity.");

    store.dispose();
    expect(reserved.reservation.release()).toBe("released");
    expect(store.snapshot().reservedWorldStateSnapshotCount).toBe(0);
  });

  it("does not let a prepared publication resurrect artifacts after disposal", () => {
    const store = new WorldStateArtifactStore({
      maximumRetainedWorldStateSnapshotCount: 1,
    });
    const first = snapshot(1);
    const reserved = store.reserveSlot();
    if (reserved.status !== "reserved") throw new Error("Expected capacity.");
    const prepared = reserved.reservation.prepare(first);

    store.dispose();
    expect(prepared.commitPrepared).not.toThrow();
    expect(store.snapshot()).toEqual({
      retainedWorldStateSnapshotCount: 0,
      reservedWorldStateSnapshotCount: 0,
      isDisposed: true,
    });
  });
});
