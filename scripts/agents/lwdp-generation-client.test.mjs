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
    new Error("codex timeout after 1800s"),
  ), "task-timeout");
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("websocket connection reset by peer"),
  ), "transport");
  assert.equal(classifyCodexTaskFailureForRetry(
    new Error("missing required outputs: result.json"),
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
      /WORLDKIT_LWDP_CODEX_SMOKE codex-smoke dispatch=single-task-fast-path tasks=1 profile=formal model=gpt-5\.6-sol reasoning=xhigh submitAttempts=1 taskAttempts=1 timeoutMs=2700000 assets=1 outputs=1/,
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
      /taskAttempts=3 timeoutMs=7200000/,
    );
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

test("rejects repeated creation attempts for formal Codex and WorldKit T2I stages", async () => {
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

    const nonVisualTaskRetry = spawnSync(process.execPath, [
      "scripts/agents/run-lwdp-codex-task.mjs",
      "--repo-root", repoRoot,
      "--task-id", "builder-smoke",
      "--stage", "coding-agent",
      "--output-s3-prefix", "s3://bucket/worldkit/builder-smoke",
      "--instruction-file", instruction,
      "--output", `result.json::${path.join(root, "builder-result.json")}::application/json`,
      "--task-attempts", "2",
    ], { cwd: repoRoot, env: environment, encoding: "utf8" });
    assert.notEqual(nonVisualTaskRetry.status, 0);
    assert.match(nonVisualTaskRetry.stderr, /Only final visual reconstruction supports/);

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
