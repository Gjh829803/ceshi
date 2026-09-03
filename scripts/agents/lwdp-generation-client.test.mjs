import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
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
} from "../lib/lwdp-generation-client.mjs";
import {
  probeCodexDeterministicAgentStop,
  probeCodexDeliveryEvidence,
  probeCodexRayInfrastructureFailure,
} from
  "../lib/lwdp-codex-delivery-evidence.mjs";

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

test("distinguishes a deliberate capability stop from a transient missing-output task", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-agent-stop-evidence-"));
  const taskId = "builder-capability-stop";
  const outputS3Prefix = "s3://bucket/worldkit/capability-stop";
  try {
    const evidence = await probeCodexDeterministicAgentStop({
      itemsPayload: { items: [{
        item_id: taskId,
        status: "failed",
        error: "missing required outputs: world.mjs",
        metadata: {
          log_uri: `${outputS3Prefix}/tasks/${taskId}/logs/codex_attempt.json`,
        },
      }] },
      outputS3Prefix,
      taskId,
      stagingRoot: root,
      downloadImplementation: async (_uri, destination) => writeFile(
        destination,
        JSON.stringify({
          item_id: taskId,
          status: "missing_outputs",
          stdout_tail: "BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED: flight is unavailable",
          stderr_tail: "",
        }),
      ),
    });
    assert.equal(evidence?.code, "BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED");
    assert.equal(await probeCodexDeterministicAgentStop({
      itemsPayload: { items: [{
        item_id: taskId,
        status: "failed",
        error: "missing required outputs: world.mjs",
        metadata: { log_uri: "s3://other/log.json" },
      }] },
      outputS3Prefix,
      taskId,
      stagingRoot: root,
      downloadImplementation: async () => undefined,
    }), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test("recovers a non-terminal Job only from exact completed S3 delivery evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-delivery-evidence-"));
  const taskId = "planner-delivery-evidence";
  const outputS3Prefix = "s3://bucket/worldkit/planner";
  const expectedOutputPaths = ["scene-brief.md", "world-plan.png"];
  const outputUris = expectedOutputPaths.map((outputPath) =>
    joinS3Uri(outputS3Prefix, "tasks", taskId, outputPath));
  try {
    const downloadImplementation = async (s3Uri, localPath) => {
      const value = s3Uri.endsWith("codex_delivery_report.json")
        ? {
            counters: {
              total: 1, queued: 0, running: 0, succeeded: 1,
              failed: 0, skipped: 0, rejected: 0,
            },
          }
        : {
            id: taskId,
            status: "succeeded",
            metadata: { output_uris: outputUris },
          };
      await writeFile(localPath, `${JSON.stringify(value)}\n`);
      return { localPath, s3Uri };
    };
    const evidence = await probeCodexDeliveryEvidence({
      outputS3Prefix,
      taskId,
      expectedOutputPaths,
      stagingRoot: root,
      downloadImplementation,
    });
    assert.equal(evidence?.taskId, taskId);
    assert.deepEqual(evidence?.itemsPayload.items.map((item) => item.status), ["succeeded"]);
    const progress = [];
    const job = await pollGenerationJob("gen_delivery_evidence", {
      config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
      timeoutMs: 1_000,
      onProgress: (current) => progress.push(current.status),
      nonTerminalCompletionProbe: async () => evidence,
      fetchImplementation: async () => new Response(JSON.stringify({
        job_id: "gen_delivery_evidence",
        status: "submitted",
        counters: { total: 1, queued: 1 },
      }), { status: 200 }),
    });
    assert.equal(job.status, "succeeded");
    assert.equal(job.delivery_evidence, evidence);
    assert.deepEqual(progress, ["submitted", "succeeded"]);
    const mismatched = await probeCodexDeliveryEvidence({
      outputS3Prefix,
      taskId,
      expectedOutputPaths: [...expectedOutputPaths].reverse(),
      stagingRoot: root,
      downloadImplementation,
    });
    assert.equal(mismatched, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("converts only trusted internal Ray infrastructure failure evidence to a retryable terminal", async () => {
  const rayJob = {
    job_id: "gen_ray_failure",
    status: "running",
    counters: { total: 1, queued: 1 },
    ray_dashboard_url: "http://ray-cluster-head-svc.ray.svc.cluster.local:8265",
    ray_submission_id: "lwdp_gen_ray_failure",
  };
  const evidence = await probeCodexRayInfrastructureFailure(rayJob, {
    fetchImplementation: async (url) => {
      assert.equal(
        String(url),
        "http://ray-cluster-head-svc.ray.svc.cluster.local:8265/api/jobs/lwdp_gen_ray_failure",
      );
      return new Response(JSON.stringify({
        status: "FAILED",
        message: "Job supervisor actor died because its node has died; Raylet could not connect to Runtime Env Agent",
      }), { status: 200 });
    },
  });
  assert.equal(evidence?.submissionId, "lwdp_gen_ray_failure");
  assert.equal(await probeCodexRayInfrastructureFailure({
    ...rayJob,
    ray_dashboard_url: "http://attacker.example.test:8265",
  }, {
    fetchImplementation: async () => {
      throw new Error("untrusted Ray URL must never be fetched");
    },
  }), null);
  assert.equal(await probeCodexRayInfrastructureFailure(rayJob, {
    fetchImplementation: async () => new Response(JSON.stringify({
      status: "FAILED",
      message: "Builder self-check failed: missing ground support",
    }), { status: 200 }),
  }), null);
  const progress = [];
  const terminal = await pollGenerationJob("gen_ray_failure", {
    config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
    timeoutMs: 1_000,
    onProgress: (current) => progress.push(current.status),
    nonTerminalCompletionProbe: async () => null,
    nonTerminalFailureProbe: async () => evidence,
    fetchImplementation: async () => new Response(JSON.stringify(rayJob), { status: 200 }),
  });
  assert.equal(terminal.status, "failed");
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

test("assembles cloud Codex and T2I tasks without local credentials in smoke mode", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-cli-smoke-"));
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  try {
    const instruction = path.join(root, "instruction.txt");
    const manifest = path.join(root, "manifest.json");
    await writeFile(instruction, "Write result.json.");
    await writeFile(manifest, JSON.stringify({
      items: [{ id: "image-smoke", prompt: "neutral whitebox", orientation: "横图" }],
    }));
    const environment = { ...process.env, WORLDKIT_LWDP_CLIENT_SMOKE: "1" };
    const codex = spawnSync(process.execPath, [
      "scripts/agents/run-lwdp-codex-task.mjs",
      "--repo-root", repoRoot,
      "--task-id", "codex-smoke",
      "--stage", "planner",
      "--output-s3-prefix", "s3://bucket/worldkit/smoke",
      "--instruction-file", instruction,
      "--context", "package.json",
      "--output", `result.json::${path.join(root, "result.json")}::application/json`,
    ], { cwd: repoRoot, env: environment, encoding: "utf8" });
    assert.equal(codex.status, 0, codex.stderr);
    assert.match(
      codex.stdout,
      /WORLDKIT_LWDP_CODEX_SMOKE codex-smoke dispatch=single-task-fast-path tasks=1 profile=formal model=gpt-5\.6-sol reasoning=xhigh submitAttempts=1 taskAttempts=3 priorTaskAttempts=0 timeoutMs=2700000 assets=1 outputs=1/,
    );
    const visual = spawnSync(process.execPath, [
      "scripts/agents/run-lwdp-codex-task.mjs",
      "--repo-root", repoRoot,
      "--task-id", "visual-smoke",
      "--stage", "visual-reconstruction",
      "--output-s3-prefix", "s3://bucket/worldkit/visual-smoke",
      "--instruction-file", instruction,
      "--output", `result.json::${path.join(root, "visual-result.json")}::application/json`,
    ], { cwd: repoRoot, env: environment, encoding: "utf8" });
    assert.equal(visual.status, 0, visual.stderr);
    assert.match(
      visual.stdout,
      /taskAttempts=3 priorTaskAttempts=0 timeoutMs=7200000/,
    );
    const playthrough = spawnSync(process.execPath, [
      "scripts/agents/run-lwdp-codex-task.mjs",
      "--repo-root", repoRoot,
      "--task-id", "playthrough-smoke",
      "--stage", "playthrough-planner",
      "--output-s3-prefix", "s3://bucket/worldkit/playthrough-smoke",
      "--instruction-file", instruction,
      "--output", `result.json::${path.join(root, "playthrough-result.json")}::application/json`,
    ], { cwd: repoRoot, env: environment, encoding: "utf8" });
    assert.equal(playthrough.status, 0, playthrough.stderr);
    assert.match(playthrough.stdout, /taskAttempts=3 priorTaskAttempts=0/);
    const cloudRetryPlaythrough = spawnSync(process.execPath, [
      "scripts/agents/run-lwdp-codex-task.mjs",
      "--repo-root", repoRoot,
      "--task-id", "playthrough-retry-smoke",
      "--stage", "playthrough-planner",
      "--request-id", "episode-plan-v3",
      "--output-s3-prefix", "s3://bucket/worldkit/playthrough-retry-smoke",
      "--instruction-file", instruction,
      "--output", `result.json::${path.join(root, "playthrough-retry-result.json")}::application/json`,
    ], {
      cwd: repoRoot,
      env: {
        ...environment,
        WORLDKIT_CLOUD_EXECUTION_ID: "exec_abcdefghijklmnop",
        WORLDKIT_CLOUD_STAGE_ATTEMPT: "2",
      },
      encoding: "utf8",
    });
    assert.equal(cloudRetryPlaythrough.status, 0, cloudRetryPlaythrough.stderr);
    assert.match(cloudRetryPlaythrough.stdout,
      /cloudExecutionId=exec_abcdefghijklmnop cloudStageAttempt=2 requestId=episode-plan-v3-cloud-exec-efghijklmnop-attempt-2 outputS3Prefix=s3:\/\/bucket\/worldkit\/playthrough-retry-smoke\/cloud-exec-efghijklmnop-attempt-2/);
    const cloudRunner = await readFile(path.join(repoRoot, "scripts/agents/run-lwdp-codex-task.mjs"), "utf8");
    assert.doesNotMatch(cloudRunner, /distributed|max_pods|pod_concurrency|account_concurrency/);

    const t2i = spawnSync(process.execPath, [
      "scripts/agents/run-lwdp-t2i-job.mjs",
      "--stage", "styled-opening-frame",
      "--output-s3-prefix", "s3://bucket/worldkit/t2i-smoke",
      "--manifest", manifest,
      "--download", `image-smoke::${path.join(root, "image.png")}`,
    ], { cwd: repoRoot, env: environment, encoding: "utf8" });
    assert.equal(t2i.status, 0, t2i.stderr);
    assert.match(t2i.stdout, /WORLDKIT_LWDP_T2I_SMOKE items=1 references=0 submitAttempts=1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps creation idempotent while allowing bounded formal Stage attempts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-cli-no-create-retry-"));
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  try {
    const instruction = path.join(root, "instruction.txt");
    const manifest = path.join(root, "manifest.json");
    await writeFile(instruction, "Write result.json.");
    await writeFile(manifest, JSON.stringify({
      items: [{ id: "image-smoke", prompt: "neutral whitebox", orientation: "横图" }],
    }));
    const environment = { ...process.env, WORLDKIT_LWDP_CLIENT_SMOKE: "1" };
    const codex = spawnSync(process.execPath, [
      "scripts/agents/run-lwdp-codex-task.mjs",
      "--repo-root", repoRoot,
      "--task-id", "codex-smoke",
      "--stage", "planner",
      "--output-s3-prefix", "s3://bucket/worldkit/smoke",
      "--instruction-file", instruction,
      "--output", `result.json::${path.join(root, "result.json")}::application/json`,
      "--submit-attempts", "2",
    ], { cwd: repoRoot, env: environment, encoding: "utf8" });
    assert.notEqual(codex.status, 0);
    assert.match(codex.stderr, /submits every LWDP Codex creation request exactly once/);

    const builderTaskRetry = spawnSync(process.execPath, [
      "scripts/agents/run-lwdp-codex-task.mjs",
      "--repo-root", repoRoot,
      "--task-id", "builder-smoke",
      "--stage", "coding-agent",
      "--output-s3-prefix", "s3://bucket/worldkit/builder-smoke",
      "--instruction-file", instruction,
      "--output", `result.json::${path.join(root, "builder-result.json")}::application/json`,
      "--task-attempts", "2",
    ], { cwd: repoRoot, env: environment, encoding: "utf8" });
    assert.equal(builderTaskRetry.status, 0, builderTaskRetry.stderr);
    assert.match(builderTaskRetry.stdout, /taskAttempts=2/);

    const t2i = spawnSync(process.execPath, [
      "scripts/agents/run-lwdp-t2i-job.mjs",
      "--stage", "styled-opening-frame",
      "--output-s3-prefix", "s3://bucket/worldkit/t2i-smoke",
      "--manifest", manifest,
      "--download", `image-smoke::${path.join(root, "image.png")}`,
      "--submit-attempts", "2",
    ], { cwd: repoRoot, env: environment, encoding: "utf8" });
    assert.notEqual(t2i.status, 0);
    assert.match(t2i.stderr, /submit each LWDP creation request exactly once/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("treats one thousand T2I items as one admitted LWDP batch", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-t2i-batch-limit-"));
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  try {
    const manifest = path.join(root, "manifest.json");
    const items = Array.from({ length: 1_000 }, (_, index) => ({
      id: `image-${String(index).padStart(4, "0")}`,
      prompt: "neutral whitebox",
      orientation: "横图",
    }));
    await writeFile(manifest, JSON.stringify({ items }));
    const accepted = spawnSync(process.execPath, [
      "scripts/agents/run-lwdp-t2i-job.mjs",
      "--stage", "styled-opening-frame",
      "--output-s3-prefix", "s3://bucket/worldkit/t2i-batch-limit",
      "--manifest", manifest,
    ], {
      cwd: repoRoot,
      env: { ...process.env, WORLDKIT_LWDP_CLIENT_SMOKE: "1" },
      encoding: "utf8",
    });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /WORLDKIT_LWDP_T2I_SMOKE items=1000/);

    items.push({ id: "image-1000", prompt: "neutral whitebox", orientation: "横图" });
    await writeFile(manifest, JSON.stringify({ items }));
    const rejected = spawnSync(process.execPath, [
      "scripts/agents/run-lwdp-t2i-job.mjs",
      "--stage", "styled-opening-frame",
      "--output-s3-prefix", "s3://bucket/worldkit/t2i-batch-limit",
      "--manifest", manifest,
    ], {
      cwd: repoRoot,
      env: { ...process.env, WORLDKIT_LWDP_CLIENT_SMOKE: "1" },
      encoding: "utf8",
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /cannot exceed the LWDP batch limit of 1000/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retries a terminal visual account-model incompatibility with a new request id and isolated S3 prefix", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-visual-retry-"));
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const parsedBody = body ? JSON.parse(body) : null;
    requests.push({ method: request.method, url: request.url, body: parsedBody });
    const send = (payload) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    };
    if (request.method === "POST") {
      const attempt = requests.filter(({ method }) => method === "POST").length;
      send({ job: { job_id: attempt === 1 ? "gen_model_incompatible" : "gen_visualok" } });
      return;
    }
    if (request.url === "/api/v1/generation/jobs/gen_model_incompatible") {
      send({ status: "completed", counters: { total: 1, failed: 1 } });
      return;
    }
    if (request.url === "/api/v1/generation/jobs/gen_model_incompatible/items?size=1000") {
      send({ items: [{
        item_id: "visual-retry-test",
        status: "failed",
        error: "The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account.",
      }] });
      return;
    }
    if (request.url === "/api/v1/generation/jobs/gen_visualok") {
      send({ status: "succeeded", counters: { total: 1, succeeded: 1 } });
      return;
    }
    if (request.url === "/api/v1/generation/jobs/gen_visualok/items?size=1000") {
      send({ items: [{ item_id: "visual-retry-test", status: "succeeded", error: "" }] });
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const instruction = path.join(root, "instruction.txt");
    const output = path.join(root, "result.json");
    const binRoot = path.join(root, "bin");
    const aws = path.join(binRoot, "aws");
    await mkdir(binRoot, { recursive: true });
    await Promise.all([
      writeFile(instruction, "Write result.json."),
      writeFile(aws, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const destination = process.argv.at(-1);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, "{\\\"ok\\\":true}");
`),
    ]);
    await chmod(aws, 0o755);
    const childResult = await new Promise((resolveResult) => {
      const child = spawn(process.execPath, [
        "scripts/agents/run-lwdp-codex-task.mjs",
        "--repo-root", repoRoot,
        "--task-id", "visual-retry-test",
        "--stage", "visual-reconstruction",
        "--request-id", "visual-retry-request",
        "--output-s3-prefix", "s3://bucket/worldkit/visual-retry",
        "--instruction-file", instruction,
        "--output", `result.json::${output}::application/json`,
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          PATH: `${binRoot}${path.delimiter}${process.env.PATH}`,
          LWDP_API_BASE: `http://127.0.0.1:${address.port}`,
          LWDP_GENERATION_API_TOKEN: "test-token",
          LWDP_USER_ID: "worldkit-test",
          WORLDKIT_LWDP_TEST_ENV_CONFIG: "1",
          WORLDKIT_VISUAL_RECONSTRUCTION_RETRY_DELAY_MS: "0",
          WORLDKIT_LWDP_POLL_INTERVAL_MS: "1",
        },
        encoding: "utf8",
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("close", (code) => resolveResult({ code, stdout, stderr }));
    });
    assert.equal(childResult.code, 0, childResult.stderr);
    assert.match(childResult.stdout, /WORLDKIT_LWDP_STAGE_RETRY visual-reconstruction 2 3 reason=account-model-compatibility/);
    assert.equal(await readFile(output, "utf8"), '{"ok":true}');
    const posts = requests.filter(({ method }) => method === "POST");
    assert.equal(posts.length, 2);
    assert.equal(posts[0].body.request_id, "visual-retry-request");
    assert.equal(posts[0].body.output_s3_prefix, "s3://bucket/worldkit/visual-retry");
    assert.equal(posts[1].body.request_id, "visual-retry-request-attempt-2");
    assert.equal(posts[1].body.output_s3_prefix, "s3://bucket/worldkit/visual-retry/attempt-2");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("retries a terminal Planner capacity failure with a new request id and isolated S3 prefix", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-planner-capacity-retry-"));
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const parsedBody = body ? JSON.parse(body) : null;
    requests.push({ method: request.method, url: request.url, body: parsedBody });
    const send = (payload) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    };
    if (request.method === "POST") {
      const attempt = requests.filter(({ method }) => method === "POST").length;
      send({ job: { job_id: attempt === 1 ? "gen_planner_capacity" : "gen_planner_ok" } });
      return;
    }
    if (request.url === "/api/v1/generation/jobs/gen_planner_capacity") {
      send({ status: "completed", counters: { total: 1, failed: 1 } });
      return;
    }
    if (request.url === "/api/v1/generation/jobs/gen_planner_capacity/items?size=1000") {
      send({ items: [{
        item_id: "planner-capacity-test",
        status: "failed",
        error: "Selected model is at capacity. Please try a different model.",
      }] });
      return;
    }
    if (request.url === "/api/v1/generation/jobs/gen_planner_ok") {
      send({ status: "succeeded", counters: { total: 1, succeeded: 1 } });
      return;
    }
    if (request.url === "/api/v1/generation/jobs/gen_planner_ok/items?size=1000") {
      send({ items: [{ item_id: "planner-capacity-test", status: "succeeded", error: "" }] });
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const instruction = path.join(root, "instruction.txt");
    const output = path.join(root, "result.json");
    const binRoot = path.join(root, "bin");
    const aws = path.join(binRoot, "aws");
    await mkdir(binRoot, { recursive: true });
    await Promise.all([
      writeFile(instruction, "Write result.json."),
      writeFile(aws, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const destination = process.argv.at(-1);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, "{\\"ok\\":true}");
`),
    ]);
    await chmod(aws, 0o755);
    const childResult = await new Promise((resolveResult) => {
      const child = spawn(process.execPath, [
        "scripts/agents/run-lwdp-codex-task.mjs",
        "--repo-root", repoRoot,
        "--task-id", "planner-capacity-test",
        "--stage", "planner",
        "--request-id", "planner-capacity-request",
        "--output-s3-prefix", "s3://bucket/worldkit/planner-capacity",
        "--instruction-file", instruction,
        "--output", `result.json::${output}::application/json`,
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          PATH: `${binRoot}${path.delimiter}${process.env.PATH}`,
          LWDP_API_BASE: `http://127.0.0.1:${address.port}`,
          LWDP_GENERATION_API_TOKEN: "test-token",
          LWDP_USER_ID: "worldkit-test",
          WORLDKIT_LWDP_TEST_ENV_CONFIG: "1",
          WORLDKIT_LWDP_STAGE_RETRY_BASE_DELAY_MS: "0",
          WORLDKIT_LWDP_POLL_INTERVAL_MS: "1",
        },
        encoding: "utf8",
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("close", (code) => resolveResult({ code, stdout, stderr }));
    });
    assert.equal(childResult.code, 0, childResult.stderr);
    assert.match(
      childResult.stdout,
      /WORLDKIT_LWDP_STAGE_RETRY planner 2 3 reason=capacity previousJob=gen_planner_capacity delayMs=0/,
    );
    assert.equal(await readFile(output, "utf8"), '{"ok":true}');
    const posts = requests.filter(({ method }) => method === "POST");
    assert.equal(posts.length, 2);
    assert.equal(posts[0].body.request_id, "planner-capacity-request");
    assert.equal(posts[0].body.output_s3_prefix, "s3://bucket/worldkit/planner-capacity");
    assert.equal(posts[1].body.request_id, "planner-capacity-request-attempt-2");
    assert.equal(posts[1].body.output_s3_prefix, "s3://bucket/worldkit/planner-capacity/attempt-2");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("does not retry a terminal Builder authoring failure", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-builder-authoring-failure-"));
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, url: request.url, body: body ? JSON.parse(body) : null });
    const send = (payload) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    };
    if (request.method === "POST") {
      send({ job: { job_id: "gen_builder_authoring_failure" } });
      return;
    }
    if (request.url === "/api/v1/generation/jobs/gen_builder_authoring_failure") {
      send({ status: "completed", counters: { total: 1, failed: 1 } });
      return;
    }
    if (request.url === "/api/v1/generation/jobs/gen_builder_authoring_failure/items?size=1000") {
      send({ items: [{
        item_id: "builder-authoring-test",
        status: "failed",
        error: "Builder self-check failed: ground connectivity is incomplete.",
      }] });
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const instruction = path.join(root, "instruction.txt");
    await writeFile(instruction, "Write result.json.");
    const childResult = await new Promise((resolveResult) => {
      const child = spawn(process.execPath, [
        "scripts/agents/run-lwdp-codex-task.mjs",
        "--repo-root", repoRoot,
        "--task-id", "builder-authoring-test",
        "--stage", "coding-agent",
        "--request-id", "builder-authoring-request",
        "--output-s3-prefix", "s3://bucket/worldkit/builder-authoring",
        "--instruction-file", instruction,
        "--output", `result.json::${path.join(root, "result.json")}::application/json`,
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          LWDP_API_BASE: `http://127.0.0.1:${address.port}`,
          LWDP_GENERATION_API_TOKEN: "test-token",
          LWDP_USER_ID: "worldkit-test",
          WORLDKIT_LWDP_TEST_ENV_CONFIG: "1",
          WORLDKIT_LWDP_STAGE_RETRY_BASE_DELAY_MS: "0",
          WORLDKIT_LWDP_POLL_INTERVAL_MS: "1",
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("close", (code) => resolveResult({ code, stdout, stderr }));
    });
    assert.notEqual(childResult.code, 0);
    assert.doesNotMatch(childResult.stdout, /WORLDKIT_LWDP_STAGE_RETRY/);
    assert.match(childResult.stderr, /ground connectivity is incomplete/);
    assert.equal(requests.filter(({ method }) => method === "POST").length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
