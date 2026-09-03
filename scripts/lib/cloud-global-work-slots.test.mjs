import assert from "node:assert/strict";
import test from "node:test";

import { GlobalCloudWorkSlotPool } from "./cloud-global-work-slots.mjs";

class MemoryLeaseStore {
  constructor() {
    this.items = new Map();
    this.revision = 0;
  }
  async get(name) { return structuredClone(this.items.get(name) ?? null); }
  async create(manifest) {
    if (this.items.has(manifest.metadata.name)) return null;
    const value = structuredClone(manifest);
    value.metadata.resourceVersion = String(++this.revision);
    this.items.set(value.metadata.name, value);
    return value;
  }
  async replace(manifest) {
    const current = this.items.get(manifest.metadata.name);
    if (!current || current.metadata.resourceVersion !== manifest.metadata.resourceVersion) {
      return null;
    }
    const value = structuredClone(manifest);
    value.metadata.resourceVersion = String(++this.revision);
    this.items.set(value.metadata.name, value);
    return value;
  }
}

test("atomically reserves and releases a weighted global work-slot group", async () => {
  const store = new MemoryLeaseStore();
  const pool = new GlobalCloudWorkSlotPool({
    namespace: "lwdp",
    poolName: "codex",
    slotCount: 4,
    store,
    now: () => Date.parse("2026-09-03T00:00:00Z"),
  });
  const lease = await pool.acquire("episode/style-opening", { count: 3 });
  assert.equal([...store.items.values()].filter(({ spec }) => spec.holderIdentity).length, 3);
  await lease.release();
  assert.equal([...store.items.values()].filter(({ spec }) => spec.holderIdentity).length, 0);
});

test("does not partially retain slots when the requested group cannot fit", async () => {
  const store = new MemoryLeaseStore();
  let current = 0;
  const pool = new GlobalCloudWorkSlotPool({
    namespace: "lwdp",
    poolName: "codex",
    slotCount: 2,
    store,
    now: () => current,
    sleep: async (milliseconds) => { current += milliseconds; },
    pollIntervalMs: 50,
  });
  const first = await pool.acquire("first-task", { count: 2 });
  await assert.rejects(
    pool.acquire("second-task", { count: 1, waitTimeoutMs: 1_000 }),
    /Timed out/,
  );
  assert.equal([...store.items.values()].filter(({ spec }) => spec.holderIdentity).length, 2);
  await first.release();
});
