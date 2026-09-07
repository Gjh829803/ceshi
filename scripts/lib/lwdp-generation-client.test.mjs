import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertSuccessfulJob,
  cancelGenerationJob,
  classifyCodexTaskFailureForRetry,
  downloadS3FileAtomic,
  findGenerationJobByRequestId,
  joinS3Uri,
  LwdpJobPendingError,
  lwdpRequest,
  loadLwdpGenerationConfig,
  pollGenerationJob,
  resolveLwdpJobTimeoutMs,
  salvageableGenerationItemIds,
  submitCodexGenerationJob,
  submittedJobId,
} from "./lwdp-generation-client.mjs";
test("uses stage-specific LWDP wait windows with explicit override precedence", () => {
  assert.equal(resolveLwdpJobTimeoutMs("planner", {}), 45 * 60_000);
  assert.equal(resolveLwdpJobTimeoutMs("coding-agent", {}), 120 * 60_000);
  assert.equal(resolveLwdpJobTimeoutMs("visual-reconstruction", {}), 120 * 60_000);
  assert.equal(resolveLwdpJobTimeoutMs("other", {}), 120 * 60_000);
  assert.equal(resolveLwdpJobTimeoutMs("planner", {
    WORLDKIT_LWDP_JOB_TIMEOUT_MS: "5000",
    WORLDKIT_LWDP_PLANNER_TIMEOUT_MS: "7000",
  }), 7000);
  assert.equal(resolveLwdpJobTimeoutMs("coding-agent", {
    WORLDKIT_LWDP_JOB_TIMEOUT_MS: "5000",
    WORLDKIT_LWDP_BUILDER_TIMEOUT_MS: "8000",
  }), 8000);
  assert.equal(resolveLwdpJobTimeoutMs("visual-reconstruction", {
    WORLDKIT_LWDP_JOB_TIMEOUT_MS: "5000",
    WORLDKIT_LWDP_VISUAL_TIMEOUT_MS: "9000",
  }), 9000);
  assert.equal(resolveLwdpJobTimeoutMs("other", {
    WORLDKIT_LWDP_JOB_TIMEOUT_MS: "6000",
  }), 6000);
  assert.throws(() => resolveLwdpJobTimeoutMs("planner", {
    WORLDKIT_LWDP_PLANNER_TIMEOUT_MS: "not-a-number",
  }), /positive safe integer/);
});

test("classifies only terminal transient Codex task failures for bounded retries", () => {
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("401 Unauthorized; refresh token was revoked"),
  ), "auth");
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account."),
  ), "account-model-compatibility");
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("Selected model is at capacity"),
  ), "capacity");
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("Ray job submit failed: http 500: No available agent to submit job, please try again later."),
  ), "capacity");
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("codex timeout after 1800s"),
  ), "task-timeout");
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("websocket connection reset by peer"),
  ), "transport");
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("LWDP job did not succeed: Remote end closed connection without response"),
  ), "transport");
  const tlsFailure = new TypeError("fetch failed", {
    cause: Object.assign(new Error("ssl/tls alert handshake failure"), {
      code: "ERR_SSL_SSL/TLS_ALERT_HANDSHAKE_FAILURE",
    }),
  });
  assert.equal(classifyCodexTaskFailureForRetry(tlsFailure), "transport");
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("LWDP job did not succeed: Ray job FAILED: failed to get job supervisor"),
  ), "transport");
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("LWDP job did not succeed: timed out"),
  ), "transport");
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("missing required outputs: result.json"),
  ), "output-omission");
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED", {
      cause: new Error("missing required outputs: world.mjs"),
    }),
  ), null);
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("Builder self-check failed: ground connectivity is incomplete."),
  ), null);
  const pending = new LwdpJobPendingError("gen_pending", 120_000, {
    status: "running",
    counters: { queued: 1, running: 0 },
  });
  assert.equal(classifyCodexTaskFailureForRetry(pending), null);
});

test("loads explicit LWDP configuration without exposing the token", async () => {
  const config = await loadLwdpGenerationConfig({
    LWDP_GENERATION_API_TOKEN: "secret-token",
    LWDP_API_BASE: "https://lwdp.example.test/",
    LWDP_USER_ID: "worldkit-test",
  });
  assert.deepEqual(config, {
    baseUrl: "https://lwdp.example.test",
    token: "secret-token",
    userId: "worldkit-test",
  });
});

test("sends machine auth and parses generic Codex job ids", async () => {
  const observed = [];
  const payload = await lwdpRequest("/api/v1/generation/codex/jobs", {
    config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
    method: "POST",
    body: { tasks: [{ id: "planner" }] },
    fetchImplementation: async (url, init) => {
      observed.push({ url, init });
      return new Response(JSON.stringify({ job: { job_id: "gen_test" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(submittedJobId(payload), "gen_test");
  assert.equal(observed[0].init.headers["X-LWDP-Token"], "secret");
  assert.equal(observed[0].init.headers["X-LWDP-User-Id"], "worldkit");
});

test("retries transient LWDP gateway responses with the same request body", async () => {
  const observedBodies = [];
  const payload = await lwdpRequest("/api/v1/generation/codex/jobs", {
    config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
    method: "POST",
    body: { request_id: "stable-id" },
    retryDelayMs: 1,
    fetchImplementation: async (_url, init) => {
      observedBodies.push(init.body);
      return observedBodies.length === 1
        ? new Response("temporary", { status: 502 })
        : new Response(JSON.stringify({ job: { job_id: "gen_retry" } }), { status: 200 });
    },
  });
  assert.equal(submittedJobId(payload), "gen_retry");
  assert.deepEqual(observedBodies, [
    JSON.stringify({ request_id: "stable-id" }),
    JSON.stringify({ request_id: "stable-id" }),
  ]);
});

test("surfaces FastAPI detail from a failed LWDP submission", async () => {
  await assert.rejects(
    lwdpRequest("/api/v1/generation/codex/jobs", {
      config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
      method: "POST",
      body: { request_id: "failed-id" },
      maxAttempts: 1,
      fetchImplementation: async () => new Response(JSON.stringify({
        detail: "Ray dashboard name resolution failed",
      }), { status: 502, headers: { "content-type": "application/json" } }),
    }),
    /Ray dashboard name resolution failed/,
  );
});

test("recovers one single-task Codex job by exact request_id without a second POST", async () => {
  const requests = [];
  const config = { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit-studio" };
  const payload = await submitCodexGenerationJob({
    request_id: "worldkit-planner-attempt-1",
    tasks: [{ id: "planner" }],
  }, {
    config,
    recoveryAttempts: 2,
    recoveryDelayMs: 1,
    fetchImplementation: async (url, init) => {
      requests.push({ url, method: init.method });
      if (init.method === "POST") return new Response("gateway lost response", { status: 502 });
      return new Response(JSON.stringify({ job: { job_id: "gen_recovered", status: "submitted" } }), {
        status: 200,
      });
    },
  });
  assert.equal(submittedJobId(payload), "gen_recovered");
  assert.equal(payload.recovered_by_request_id, true);
  assert.deepEqual(requests, [
    { url: "https://lwdp.example.test/api/v1/generation/codex/jobs", method: "POST" },
    {
      url: "https://lwdp.example.test/api/v1/generation/jobs/by-request-id/worldkit-planner-attempt-1?pipeline=codex",
      method: "GET",
    },
  ]);
});

test("does not hide a conflicting idempotency payload behind request lookup", async () => {
  const requests = [];
  await assert.rejects(submitCodexGenerationJob({
    request_id: "worldkit-conflict",
    tasks: [{ id: "planner" }],
  }, {
    config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit-studio" },
    fetchImplementation: async (url, init) => {
      requests.push({ url, method: init.method });
      return new Response(JSON.stringify({ error: "request_id_conflict" }), { status: 409 });
    },
  }), /request_id_conflict/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  await assert.rejects(findGenerationJobByRequestId("", {}), /request_id is required/);
});

test("polls until a terminal LWDP status and rejects item failures", async () => {
  const states = ["submitted", "running", "succeeded"];
  const progress = [];
  const job = await pollGenerationJob("gen_test", {
    config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
    intervalMs: 1,
    timeoutMs: 1_000,
    onProgress: (current) => progress.push(current.status),
    fetchImplementation: async () => new Response(JSON.stringify({
      job_id: "gen_test",
      status: states.shift() ?? "succeeded",
      counters: {},
    }), { status: 200 }),
  });
  assert.equal(job.status, "succeeded");
  assert.deepEqual(progress, ["submitted", "running", "succeeded"]);
  assert.throws(() => assertSuccessfulJob(
    { status: "completed" },
    { items: [{ item_id: "builder", status: "failed", error: "bad output" }] },
  ), /builder: bad output/);
});

test("recovers a non-terminal job from injected completion evidence", async () => {
  const evidence = {
    taskId: "planner-delivery-evidence",
    itemsPayload: { items: [{ item_id: "planner-delivery-evidence", status: "succeeded" }] },
  };
  const pendingJob = {
    job_id: "gen_delivery_evidence",
    status: "submitted",
    counters: { total: 1, queued: 1 },
  };
  const progress = [];
  const job = await pollGenerationJob("gen_delivery_evidence", {
    config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
    timeoutMs: 1_000,
    onProgress: (current) => progress.push(current.status),
    nonTerminalCompletionProbe: async (current) => {
      assert.deepEqual(current, pendingJob);
      return evidence;
    },
    fetchImplementation: async () => new Response(JSON.stringify(pendingJob), { status: 200 }),
  });
  assert.equal(job.status, "succeeded");
  assert.equal(job.delivery_evidence, evidence);
  assert.deepEqual(job.counters, {
    total: 1, queued: 0, running: 0, succeeded: 1, failed: 0, skipped: 0, rejected: 0,
  });
  assert.deepEqual(progress, ["submitted", "succeeded"]);
});

test("converts injected infrastructure failure evidence to a retryable terminal", async () => {
  const rayJob = {
    job_id: "gen_ray_failure",
    status: "running",
    counters: { total: 1, queued: 1 },
  };
  const evidence = {
    submissionId: "lwdp_gen_ray_failure",
    message: "Job supervisor actor died because its node has died; Raylet could not connect to Runtime Env Agent",
  };
  const progress = [];
  const terminal = await pollGenerationJob("gen_ray_failure", {
    config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
    timeoutMs: 1_000,
    onProgress: (current) => progress.push(current.status),
    nonTerminalCompletionProbe: async () => null,
    nonTerminalFailureProbe: async (current) => {
      assert.deepEqual(current, rayJob);
      return evidence;
    },
    fetchImplementation: async () => new Response(JSON.stringify(rayJob), { status: 200 }),
  });
  assert.equal(terminal.status, "failed");
  assert.equal(terminal.ray_failure_evidence, evidence);
  assert.match(terminal.error, /Job supervisor actor died/);
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error(`LWDP job did not succeed: ${terminal.error}`),
  ), "transport");
  assert.deepEqual(progress, ["running", "failed"]);
});

test("returns a typed pending outcome instead of disguising a non-terminal timeout as failure", async () => {
  const lastJob = {
    job_id: "gen_pending",
    status: "running",
    counters: { total: 1, queued: 1, running: 0, succeeded: 0, failed: 0 },
  };
  await assert.rejects(
    pollGenerationJob("gen_pending", {
      config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
      intervalMs: 1,
      timeoutMs: 0,
      fetchImplementation: async () => new Response(JSON.stringify(lastJob), { status: 200 }),
    }),
    (error) => {
      assert.equal(error instanceof LwdpJobPendingError, true);
      assert.equal(error.code, "LWDP_JOB_PENDING");
      assert.equal(error.jobId, "gen_pending");
      assert.equal(error.timeoutMs, 0);
      assert.deepEqual(error.lastJob, lastJob);
      return true;
    },
  );
});

test("treats a polling transport failure after submission as an unknown remote outcome", async () => {
  const lastJob = {
    job_id: "gen_transport_pending",
    status: "running",
    counters: { total: 1, queued: 1, running: 0 },
  };
  let requestCount = 0;
  await assert.rejects(
    pollGenerationJob("gen_transport_pending", {
      config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
      intervalMs: 1,
      timeoutMs: 1_000,
      requestMaxAttempts: 1,
      requestRetryDelayMs: 1,
      fetchImplementation: async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(JSON.stringify(lastJob), { status: 200 });
        }
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("ssl/tls alert handshake failure"), {
            code: "ERR_SSL_SSL/TLS_ALERT_HANDSHAKE_FAILURE",
          }),
        });
      },
    }),
    (error) => {
      assert.equal(error instanceof LwdpJobPendingError, true);
      assert.equal(error.code, "LWDP_JOB_PENDING");
      assert.equal(error.jobId, "gen_transport_pending");
      assert.deepEqual(error.lastJob, lastJob);
      assert.match(error.cause?.message ?? "", /fetch failed/);
      return true;
    },
  );
});

test("treats cancelled and stopped LWDP jobs and items as unsuccessful terminal results", () => {
  for (const status of ["cancelled", "stopped"]) {
    assert.throws(
      () => assertSuccessfulJob({ status }, { items: [] }, ["planner"]),
      new RegExp(`LWDP job did not succeed: ${status}`),
    );
    assert.throws(
      () => assertSuccessfulJob(
        { status: "completed" },
        { items: [{ item_id: "planner", status }] },
        ["planner"],
      ),
      new RegExp(`planner: ${status}`),
    );
  }
});

test("cancels an LWDP job through the idempotent generation endpoint", async () => {
  const observed = [];
  const payload = await cancelGenerationJob("gen_cancel", {
    config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
    fetchImplementation: async (url, init) => {
      observed.push({ url, init });
      return new Response(JSON.stringify({ job: { job_id: "gen_cancel", status: "cancelled" } }), {
        status: 200,
      });
    },
  });
  assert.equal(payload.job.status, "cancelled");
  assert.equal(observed[0].url, "https://lwdp.example.test/api/v1/generation/jobs/gen_cancel/cancel");
  assert.equal(observed[0].init.method, "POST");
});

test("recognizes only Ray-timeout items whose generated files were salvaged", () => {
  assert.deepEqual(salvageableGenerationItemIds({ items: [
    {
      item_id: "styled-opening-image",
      status: "failed",
      error: "ray shard timed out before returning; salvaged generated files from work_dir",
    },
    { item_id: "hard-failure", status: "failed", error: "image generation failed" },
    { item_id: "complete-image", status: "succeeded", error: "" },
  ] }), new Set(["styled-opening-image"]));
});

test("downloads S3 outputs through a sibling file before atomic promotion", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-client-"));
  const destination = path.join(root, "scene", "result.json");
  try {
    await downloadS3FileAtomic("s3://bucket/prefix/result.json", destination, {
      execFileImplementation: (_command, args, _options, callback) => {
        const temporaryPath = args.at(-1);
        void mkdir(path.dirname(temporaryPath), { recursive: true })
          .then(() => writeFile(temporaryPath, '{"ok":true}'))
          .then(() => callback(null, "", ""), callback);
      },
    });
    assert.equal(await readFile(destination, "utf8"), '{"ok":true}');
    assert.equal(joinS3Uri("s3://bucket/prefix/", "tasks", "planner"),
      "s3://bucket/prefix/tasks/planner");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
