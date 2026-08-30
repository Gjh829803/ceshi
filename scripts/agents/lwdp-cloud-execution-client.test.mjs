import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSuccessfulCloudExecution,
  claimCloudExecutionStage,
  cloudExecutionRecord,
  createCloudExecution,
  pollCloudExecution,
  reportCloudExecutionStageProgress,
} from "../lib/lwdp-cloud-execution-client.mjs";

const config = {
  baseUrl: "https://lwdp.example.test",
  token: "secret",
  userId: "worldkit-studio",
};

test("recovers a durable Cloud Execution by request_id after a lost POST", async () => {
  const requests = [];
  const payload = await createCloudExecution({
    kind: "scene",
    scene_id: "scene-001",
    request_id: "scene-001-run-001",
  }, {
    config,
    recoveryDelayMs: 1,
    fetchImplementation: async (url, init) => {
      requests.push({ url, method: init.method });
      if (init.method === "POST") return new Response("lost", { status: 502 });
      return new Response(JSON.stringify({
        execution: { execution_id: "exec_001", kind: "scene", status: "queued" },
      }), { status: 200 });
    },
  });
  assert.equal(cloudExecutionRecord(payload).execution_id, "exec_001");
  assert.equal(payload.recovered_by_request_id, true);
  assert.deepEqual(requests, [
    {
      url: "https://lwdp.example.test/api/v1/cloud-executions",
      method: "POST",
    },
    {
      url: "https://lwdp.example.test/api/v1/cloud-executions/by-request-id/scene-001-run-001?kind=scene",
      method: "GET",
    },
  ]);
});

test("claims one worker lease and reports progress with the exact lease", async () => {
  const requests = [];
  const fetchImplementation = async (url, init) => {
    requests.push({ url, method: init.method, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(
      init.method === "POST" ? { lease_id: "lease-001" } : { accepted: true },
    ), { status: 200 });
  };
  const claim = await claimCloudExecutionStage(
    "exec-001",
    "scene-production",
    { worker_id: "worker-001", lease_seconds: 900 },
    { config, fetchImplementation },
  );
  assert.equal(claim.lease_id, "lease-001");
  await reportCloudExecutionStageProgress(
    "exec-001",
    "scene-production",
    {
      status: "running",
      lease_id: claim.lease_id,
      diagnostics: { internal_stage: "planner" },
    },
    { config, fetchImplementation },
  );
  assert.deepEqual(requests.map(({ method, body }) => ({ method, body })), [
    {
      method: "POST",
      body: { worker_id: "worker-001", lease_seconds: 900 },
    },
    {
      method: "PUT",
      body: {
        status: "running",
        lease_id: "lease-001",
        diagnostics: { internal_stage: "planner" },
      },
    },
  ]);
});

test("polls Cloud Execution milestones to one successful terminal state", async () => {
  const states = [
    { status: "queued", current_stage_id: "scene-production" },
    { status: "running", current_stage_id: "scene-production" },
    { status: "succeeded", current_stage_id: null },
  ];
  const observed = [];
  const result = await pollCloudExecution("exec-001", {
    config,
    intervalMs: 1,
    timeoutMs: 1_000,
    onProgress: (execution) => observed.push(execution.status),
    fetchImplementation: async () => new Response(JSON.stringify({
      execution: { execution_id: "exec-001", ...states.shift() },
    }), { status: 200 }),
  });
  assert.equal(assertSuccessfulCloudExecution(result).status, "succeeded");
  assert.deepEqual(observed, ["queued", "running", "succeeded"]);
  assert.throws(
    () => assertSuccessfulCloudExecution({
      execution_id: "exec-failed",
      status: "failed",
      error: "worker lease expired",
    }),
    /worker lease expired/,
  );
});

test("rejects Cloud Execution requests without stable identities", async () => {
  await assert.rejects(
    createCloudExecution({ kind: "scene" }),
    /request_id is required/,
  );
  assert.throws(() => cloudExecutionRecord({ status: "queued" }), /execution_id/);
});
