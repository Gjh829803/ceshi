import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCloudProductionFailure,
  cloudInfrastructureRetryDelayMs,
  evaluateCloudProductionCircuit,
} from "./cloud-production-retry-policy.mjs";

test("routes cloud infrastructure failures without consuming content attempts", () => {
  const result = classifyCloudProductionFailure({
    error: "Ray job status failed: curl (28) timed out after 5000ms",
  });
  assert.deepEqual(result, {
    pool: "infrastructure",
    retryable: true,
    consumesContentAttempt: false,
    code: "CLOUD_INFRASTRUCTURE_UNAVAILABLE",
  });
  assert.equal(classifyCloudProductionFailure(
    "worker lease expired before a terminal progress update",
  ).code, "CLOUD_INFRASTRUCTURE_UNAVAILABLE");
});

test("reconciles an uncertain submission instead of creating a replacement", () => {
  assert.equal(
    classifyCloudProductionFailure(new Error(
      "LWDP Cloud Execution submission outcome is unknown.",
    )).pool,
    "provider-reconcile",
  );
});

test("keeps semantic repair and unknown engineering failures out of infra retry", () => {
  assert.equal(classifyCloudProductionFailure("Builder self-check failed").pool,
    "content-repair");
  assert.equal(classifyCloudProductionFailure(
    "EPISODE_MINIMUM_CAPTURE_HEALTH_FAILED",
  ).pool, "content-repair");
  assert.equal(classifyCloudProductionFailure("Unexpected schema identity").pool,
    "manual-engineering");
});

test("bounds infrastructure backoff and opens only after enough evidence", () => {
  assert.equal(cloudInfrastructureRetryDelayMs(1, { random: () => 0.5 }), 30_000);
  assert.equal(cloudInfrastructureRetryDelayMs(20, { random: () => 0.5 }), 600_000);
  assert.equal(evaluateCloudProductionCircuit(
    Array.from({ length: 19 }, () => "infrastructure"),
    { minimumSamples: 20, openFailureRatio: 0.5 },
  ).state, "closed");
  assert.equal(evaluateCloudProductionCircuit(
    Array.from({ length: 20 }, (_, index) => index < 11 ? "infrastructure" : "succeeded"),
    { minimumSamples: 20, openFailureRatio: 0.5 },
  ).state, "open");
});
