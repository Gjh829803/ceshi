import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertSuccessfulJob,
  cancelGenerationJob,
  downloadS3FileAtomic,
  findGenerationJobByRequestId,
  joinS3Uri,
  lwdpRequest,
  loadLwdpGenerationConfig,
  pollGenerationJob,
  salvageableGenerationItemIds,
  submitCodexGenerationJob,
  submittedJobId,
} from "../lib/lwdp-generation-client.mjs";

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

test("maps only a structured provider task timeout code to the neutral timeout outcome", () => {
  assert.throws(
    () => assertSuccessfulJob(
      { status: "completed" },
      { items: [{ item_id: "builder", status: "failed", error_code: "task_timeout", error: "private detail" }] },
      ["builder"],
    ),
    (error) => error?.outcomeCode === "task-timeout",
  );
  assert.throws(
    () => assertSuccessfulJob(
      { status: "completed" },
      { items: [{ item_id: "builder", status: "failed", error: "codex timeout after 1800s" }] },
      ["builder"],
    ),
    (error) => error?.outcomeCode === "task-rejected",
  );
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
      "--request-id", "codex-smoke-request",
      "--stage", "planner",
      "--output-s3-prefix", "s3://bucket/worldkit/smoke",
      "--instruction-file", instruction,
      "--context", "package.json",
      "--output", `result.json::${path.join(root, "result.json")}::application/json`,
    ], { cwd: repoRoot, env: environment, encoding: "utf8" });
    assert.equal(codex.status, 0, codex.stderr);
    assert.match(
      codex.stdout,
      /WORLDKIT_LWDP_CODEX_SMOKE codex-smoke dispatch=single-task-fast-path tasks=1 profile=formal model=gpt-5\.6-sol reasoning=xhigh submitAttempts=1 assets=1 outputs=1/,
    );
    assert.match(
      codex.stdout,
      /WORLDKIT_CODEX_TASK_OUTCOME \{"kind":"worldkit-codex-task-outcome","schemaVersion":1,"requestId":"codex-smoke-request","outcome":"completed"\}/,
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

const sameIdRecovery = await import("./lwdp-codex-same-id-recovery.mjs");

function sameIdLookupUrl(requestId) {
  return `https://lwdp.example.test/api/v1/generation/jobs/by-request-id/${requestId}?pipeline=codex`;
}

function sameIdJobUrl(jobId) {
  return `https://lwdp.example.test/api/v1/generation/jobs/${jobId}`;
}

function sameIdItemsUrl(jobId) {
  return `https://lwdp.example.test/api/v1/generation/jobs/${jobId}/items?size=1000`;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function createSameIdFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-same-id-"));
  const outputSpecs = [
    {
      remotePath: "scene.ts",
      localPath: path.join(root, "delivered", "scene.ts"),
      contentType: "text/plain",
    },
    {
      remotePath: "native-resources.json",
      localPath: path.join(root, "delivered", "native-resources.json"),
      contentType: "application/json",
    },
  ];
  const outputS3Prefix = "s3://bucket/worldkit/same-id";
  const taskId = "same-id-task";
  const requestId = "same-id-request";
  const declaredOutputUris = sameIdRecovery.declaredOutputUris(outputS3Prefix, taskId, outputSpecs);
  const requestArgumentFingerprint = sameIdRecovery.lwdpCodexRequestArgumentFingerprint({
    requestId,
    taskId,
    outputS3Prefix,
    declaredOutputUris,
    outputs: outputSpecs,
    instructionSha256: "a".repeat(64),
    defaults: {
      model: "gpt-5.6-sol",
      reasoning_effort: "xhigh",
      sandbox: "workspace-write",
      timeout_seconds: 1_800,
    },
  });
  const journal = {
    kind: sameIdRecovery.LWDP_CODEX_PENDING_JOURNAL_KIND,
    schemaVersion: 1,
    requestId,
    taskId,
    outputS3Prefix,
    declaredOutputUris,
    outputs: outputSpecs,
    requestArgumentFingerprint,
    instructionSha256: "a".repeat(64),
    defaults: {
      model: "gpt-5.6-sol",
      reasoning_effort: "xhigh",
      sandbox: "workspace-write",
      timeout_seconds: 1_800,
    },
    jobId: null,
  };
  return { root, outputSpecs, outputS3Prefix, taskId, requestId, journal };
}

async function writeDownloadedOutput(s3Uri, localPath) {
  await mkdir(path.dirname(localPath), { recursive: true });
  const body = `recovered:${path.basename(s3Uri)}\n`;
  await writeFile(localPath, body);
  return { s3Uri, localPath, size: Buffer.byteLength(body) };
}

test("same-id recovery helper never imports creation or cancel POST ports", async () => {
  const helperSource = await readFile(new URL("./lwdp-codex-same-id-recovery.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(helperSource, /submitCodexGenerationJob|submitGenerationJob|cancelGenerationJob/);
  assert.match(helperSource, /findGenerationJobByRequestId/);
  assert.match(helperSource, /pollGenerationJob/);
  assert.match(helperSource, /downloadS3FileAtomic/);
});

test("recovers a pending same-request-id job to terminal outputs without a POST", async () => {
  const fixture = await createSameIdFixture();
  const requests = [];
  const pollStates = ["running", "succeeded"];
  try {
    await sameIdRecovery.writePendingJournal(fixture.journal, { repoRoot: fixture.root });
    const result = await sameIdRecovery.reconcileLwdpCodexSameRequestId({
      repoRoot: fixture.root,
      current: fixture.journal,
      config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
      intervalMs: 1,
      timeoutMs: 1_000,
      fetchImplementation: async (url, init) => {
        requests.push({ url, method: init?.method ?? "GET" });
        if (url === sameIdLookupUrl(fixture.requestId)) {
          return jsonResponse({
            job: { job_id: "gen_pending", request_id: fixture.requestId, status: "running" },
          });
        }
        if (url === sameIdJobUrl("gen_pending")) {
          return jsonResponse({
            job_id: "gen_pending",
            request_id: fixture.requestId,
            status: pollStates.shift() ?? "succeeded",
          });
        }
        if (url === sameIdItemsUrl("gen_pending")) {
          return jsonResponse({ items: [{ item_id: fixture.taskId, status: "succeeded" }] });
        }
        throw new Error(`unexpected URL ${url}`);
      },
      downloadImplementation: writeDownloadedOutput,
    });
    assert.equal(result.status, "recovered");
    assert.equal(result.jobId, "gen_pending");
    assert.equal(await readFile(fixture.outputSpecs[0].localPath, "utf8"), "recovered:scene.ts\n");
    assert.equal(
      await readFile(fixture.outputSpecs[1].localPath, "utf8"),
      "recovered:native-resources.json\n",
    );
    assert.equal(requests.length > 0, true);
    assert.deepEqual(requests.map((request) => request.method), requests.map(() => "GET"));
    assert.equal(requests.some((request) => request.method === "POST"), false);
    await assert.rejects(
      readFile(sameIdRecovery.pendingJournalPath(fixture.root, fixture.requestId), "utf8"),
      /ENOENT/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("promotes only the exact declared output URI set through sibling temporary files", async () => {
  const fixture = await createSameIdFixture();
  const downloadedUris = [];
  const downloadPaths = [];
  try {
    await sameIdRecovery.writePendingJournal(fixture.journal, { repoRoot: fixture.root });
    await sameIdRecovery.reconcileLwdpCodexSameRequestId({
      repoRoot: fixture.root,
      current: fixture.journal,
      config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
      fetchImplementation: async (url) => {
        if (String(url).includes("/by-request-id/")) {
          return jsonResponse({
            job: { job_id: "gen_exact", request_id: fixture.requestId, status: "succeeded" },
          });
        }
        if (String(url).endsWith("/items?size=1000")) {
          return jsonResponse({ items: [{ item_id: fixture.taskId, status: "succeeded" }] });
        }
        return jsonResponse({
          job_id: "gen_exact",
          request_id: fixture.requestId,
          status: "succeeded",
        });
      },
      downloadImplementation: async (s3Uri, localPath) => {
        downloadedUris.push(s3Uri);
        downloadPaths.push(localPath);
        assert.equal(localPath.startsWith(`${path.dirname(fixture.outputSpecs[0].localPath)}${path.sep}.`), true);
        assert.notEqual(localPath, fixture.outputSpecs[0].localPath);
        assert.notEqual(localPath, fixture.outputSpecs[1].localPath);
        return writeDownloadedOutput(s3Uri, localPath);
      },
    });
    assert.deepEqual(downloadedUris, fixture.journal.declaredOutputUris);
    const leftover = await readdir(path.join(fixture.root, "delivered"));
    assert.deepEqual(leftover.sort(), ["native-resources.json", "scene.ts"]);
    assert.equal(downloadPaths.every((downloadPath) => leftover.includes(path.basename(downloadPath))), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("fails closed on zero jobs, duplicate jobs, identity drift, and output URI drift without POSTing", async () => {
  const fixture = await createSameIdFixture();
  const methods = [];
  const recordGet = async (url, init, handler) => {
    methods.push(init?.method ?? "GET");
    return handler(url);
  };
  try {
    await sameIdRecovery.writePendingJournal(fixture.journal, { repoRoot: fixture.root });
    await assert.rejects(
      sameIdRecovery.reconcileLwdpCodexSameRequestId({
        repoRoot: fixture.root,
        current: fixture.journal,
        config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
        fetchImplementation: async (url, init) => recordGet(url, init, async () =>
          new Response(JSON.stringify({ detail: "not found" }), { status: 404 })),
      }),
      /zero jobs/,
    );

    await assert.rejects(
      sameIdRecovery.reconcileLwdpCodexSameRequestId({
        repoRoot: fixture.root,
        current: fixture.journal,
        config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
        fetchImplementation: async (url, init) => recordGet(url, init, async () => jsonResponse({
          jobs: [
            { job_id: "gen_a", request_id: fixture.requestId, status: "running" },
            { job_id: "gen_b", request_id: fixture.requestId, status: "running" },
          ],
        })),
      }),
      /duplicate jobs without a supported GET-only canonical choice/,
    );

    await assert.rejects(
      sameIdRecovery.reconcileLwdpCodexSameRequestId({
        repoRoot: fixture.root,
        current: fixture.journal,
        config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
        fetchImplementation: async (url, init) => recordGet(url, init, async () => jsonResponse({
          job: { job_id: "gen_other", request_id: "different-request", status: "succeeded" },
        })),
      }),
      /request identity drifted/,
    );

    const drifted = {
      ...fixture.journal,
      declaredOutputUris: [
        ...fixture.journal.declaredOutputUris,
        "s3://bucket/worldkit/same-id/tasks/same-id-task/extra.json",
      ],
    };
    await assert.rejects(
      sameIdRecovery.reconcileLwdpCodexSameRequestId({
        repoRoot: fixture.root,
        current: drifted,
        config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
        fetchImplementation: async (url, init) => recordGet(url, init, async () => jsonResponse({
          job: { job_id: "gen_drift", request_id: fixture.requestId, status: "succeeded" },
        })),
      }),
      /declared output URI set drifted/,
    );

    assert.equal(methods.includes("POST"), false);
    assert.equal(methods.every((method) => method === "GET"), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("fails closed on unexpected outputs, stale terminal identity, download failure, and partial promotion", async () => {
  const fixture = await createSameIdFixture();
  try {
    await sameIdRecovery.writePendingJournal({
      ...fixture.journal,
      jobId: "gen_original",
    }, { repoRoot: fixture.root });

    await assert.rejects(
      sameIdRecovery.reconcileLwdpCodexSameRequestId({
        repoRoot: fixture.root,
        current: fixture.journal,
        config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
        fetchImplementation: async (url) => {
          if (String(url).includes("/by-request-id/")) {
            return jsonResponse({
              job: { job_id: "gen_stale", request_id: fixture.requestId, status: "succeeded" },
            });
          }
          return jsonResponse({ items: [{ item_id: fixture.taskId, status: "succeeded" }] });
        },
      }),
      /terminal job identity is stale/,
    );

    await sameIdRecovery.writePendingJournal(fixture.journal, { repoRoot: fixture.root });
    await assert.rejects(
      sameIdRecovery.reconcileLwdpCodexSameRequestId({
        repoRoot: fixture.root,
        current: fixture.journal,
        config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
        fetchImplementation: async (url) => {
          if (String(url).includes("/by-request-id/")) {
            return jsonResponse({
              job: { job_id: "gen_unexpected", request_id: fixture.requestId, status: "succeeded" },
            });
          }
          if (String(url).endsWith("/items?size=1000")) {
            return jsonResponse({
              items: [{
                item_id: fixture.taskId,
                status: "succeeded",
                metadata: {
                  output_uris: [
                    ...fixture.journal.declaredOutputUris,
                    "s3://bucket/worldkit/same-id/tasks/same-id-task/extra.json",
                  ],
                },
              }],
            });
          }
          return jsonResponse({
            job_id: "gen_unexpected",
            request_id: fixture.requestId,
            status: "succeeded",
          });
        },
      }),
      /unexpected outputs/,
    );

    await sameIdRecovery.writePendingJournal(fixture.journal, { repoRoot: fixture.root });
    await assert.rejects(
      sameIdRecovery.reconcileLwdpCodexSameRequestId({
        repoRoot: fixture.root,
        current: fixture.journal,
        config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
        fetchImplementation: async (url) => {
          if (String(url).includes("/by-request-id/")) {
            return jsonResponse({
              job: { job_id: "gen_download", request_id: fixture.requestId, status: "succeeded" },
            });
          }
          if (String(url).endsWith("/items?size=1000")) {
            return jsonResponse({ items: [{ item_id: fixture.taskId, status: "succeeded" }] });
          }
          return jsonResponse({
            job_id: "gen_download",
            request_id: fixture.requestId,
            status: "succeeded",
          });
        },
        downloadImplementation: async () => {
          throw new Error("S3 unavailable");
        },
      }),
      /download failed/,
    );
    await assert.rejects(readFile(fixture.outputSpecs[0].localPath, "utf8"), /ENOENT/);

    await sameIdRecovery.writePendingJournal(fixture.journal, { repoRoot: fixture.root });
    let promotions = 0;
    const { rename } = await import("node:fs/promises");
    await assert.rejects(
      sameIdRecovery.reconcileLwdpCodexSameRequestId({
        repoRoot: fixture.root,
        current: fixture.journal,
        config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
        fetchImplementation: async (url) => {
          if (String(url).includes("/by-request-id/")) {
            return jsonResponse({
              job: { job_id: "gen_partial", request_id: fixture.requestId, status: "succeeded" },
            });
          }
          if (String(url).endsWith("/items?size=1000")) {
            return jsonResponse({ items: [{ item_id: fixture.taskId, status: "succeeded" }] });
          }
          return jsonResponse({
            job_id: "gen_partial",
            request_id: fixture.requestId,
            status: "succeeded",
          });
        },
        downloadImplementation: writeDownloadedOutput,
        fileSystem: {
          rename: async (from, to) => {
            promotions += 1;
            if (promotions === 2) throw new Error("destination rename failed");
            return rename(from, to);
          },
        },
      }),
      /promotion was partial/,
    );
    await assert.rejects(readFile(fixture.outputSpecs[1].localPath, "utf8"), /ENOENT/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("fails closed when pending journal cleanup fails after promotion", async () => {
  const fixture = await createSameIdFixture();
  try {
    await sameIdRecovery.writePendingJournal(fixture.journal, { repoRoot: fixture.root });
    await assert.rejects(
      sameIdRecovery.reconcileLwdpCodexSameRequestId({
        repoRoot: fixture.root,
        current: fixture.journal,
        config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
        fetchImplementation: async (url) => {
          if (String(url).includes("/by-request-id/")) {
            return jsonResponse({
              job: { job_id: "gen_cleanup", request_id: fixture.requestId, status: "succeeded" },
            });
          }
          if (String(url).endsWith("/items?size=1000")) {
            return jsonResponse({ items: [{ item_id: fixture.taskId, status: "succeeded" }] });
          }
          return jsonResponse({
            job_id: "gen_cleanup",
            request_id: fixture.requestId,
            status: "succeeded",
          });
        },
        downloadImplementation: writeDownloadedOutput,
        fileSystem: {
          rm: async () => {
            throw new Error("journal unlink failed");
          },
        },
      }),
      /cleanup failed/,
    );
    assert.equal(await readFile(fixture.outputSpecs[0].localPath, "utf8"), "recovered:scene.ts\n");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("retries GET-only recovery from the persisted journal after a process restart", async () => {
  const first = await createSameIdFixture();
  try {
    await sameIdRecovery.writePendingJournal(first.journal, { repoRoot: first.root });
    const journalPath = sameIdRecovery.pendingJournalPath(first.root, first.requestId);
    const persisted = JSON.parse(await readFile(journalPath, "utf8"));
    assert.equal(persisted.kind, sameIdRecovery.LWDP_CODEX_PENDING_JOURNAL_KIND);
    assert.deepEqual(persisted.declaredOutputUris, first.journal.declaredOutputUris);

    const restarted = {
      ...first.journal,
      outputs: first.outputSpecs,
    };
    const methods = [];
    const result = await sameIdRecovery.reconcileLwdpCodexSameRequestId({
      repoRoot: first.root,
      current: restarted,
      config: { baseUrl: "https://lwdp.example.test", token: "secret", userId: "worldkit" },
      fetchImplementation: async (url, init) => {
        methods.push(init?.method ?? "GET");
        if (String(url).includes("/by-request-id/")) {
          return jsonResponse({
            job: { job_id: "gen_restart", request_id: first.requestId, status: "succeeded" },
          });
        }
        if (String(url).endsWith("/items?size=1000")) {
          return jsonResponse({ items: [{ item_id: first.taskId, status: "succeeded" }] });
        }
        return jsonResponse({
          job_id: "gen_restart",
          request_id: first.requestId,
          status: "succeeded",
        });
      },
      downloadImplementation: writeDownloadedOutput,
    });
    assert.equal(result.status, "recovered");
    assert.equal(methods.includes("POST"), false);
    assert.equal(await readFile(first.outputSpecs[0].localPath, "utf8"), "recovered:scene.ts\n");
  } finally {
    await rm(first.root, { recursive: true, force: true });
  }
});

test("cloud Codex runner persists a pending journal and uses GET-only recovery after unknown POST", async () => {
  const runner = await readFile(new URL("./run-lwdp-codex-task.mjs", import.meta.url), "utf8");
  assert.match(runner, /from "\.\/lwdp-codex-same-id-recovery\.mjs"/);
  assert.match(runner, /writePendingJournal/);
  assert.match(runner, /reconcileLwdpCodexSameRequestId/);
  assert.match(runner, /readPendingJournal/);
  const submitIndex = runner.indexOf("submitCodexGenerationJob");
  const journalIndex = runner.indexOf("writePendingJournal");
  const recoverIndex = runner.lastIndexOf("reconcileLwdpCodexSameRequestId");
  assert.equal(submitIndex > 0 && journalIndex > 0 && recoverIndex > 0, true);
  assert.equal(journalIndex < submitIndex, true);
  assert.match(runner, /creation-outcome-unknown/);
});
