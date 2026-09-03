import assert from "node:assert/strict";
import test from "node:test";

import {
  loadCloudProductionThroughputConfig,
  parseCloudProductionThroughputConfig,
} from "./cloud-production-throughput.mjs";

test("loads the bounded 200-Case 48-hour production profile", async () => {
  const profile = await loadCloudProductionThroughputConfig(process.cwd());
  assert.equal(profile.profileId, "worldkit-200-cases-48h@1");
  assert.equal(profile.pools.sceneCases, 24);
  assert.equal(profile.batching.codexMaxTasksPerBatch, 1000);
  assert.equal(profile.batching.codexAccountConcurrency, 20);
  assert.equal(profile.pools.whiteboxCaptureCases, 16);
  assert.equal(profile.pools.seedanceGlobal, 96);
  assert.equal(profile.submission.maxConcurrentCreates, 24);
  assert.equal(profile.submission.maxNonTerminalLwdpBatches, 120);
  assert.deepEqual(profile.ramp.lwdpBatches, [24, 48, 80, 120]);
});

test("rejects unsafe submission and mismatched ramp limits", async () => {
  const current = await loadCloudProductionThroughputConfig(process.cwd());
  assert.throws(() => parseCloudProductionThroughputConfig({
    ...current,
    submission: { ...current.submission, maxConcurrentCreates: 33 },
  }), /maxConcurrentCreates/);
  assert.throws(() => parseCloudProductionThroughputConfig({
    ...current,
    ramp: { ...current.ramp, seedance: [40, 64] },
  }), /terminate/);
});
