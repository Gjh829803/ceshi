import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertSuccessfulJob,
  downloadS3FileAtomic,
  joinS3Uri,
  lwdpRequest,
  loadLwdpGenerationConfig,
  pollGenerationJob,
  salvageableGenerationItemIds,
  submittedJobId,
} from "./lib/lwdp-generation-client.mjs";

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
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  try {
    const instruction = path.join(root, "instruction.txt");
    const manifest = path.join(root, "manifest.json");
    await writeFile(instruction, "Write result.json.");
    await writeFile(manifest, JSON.stringify({
      items: [{ id: "image-smoke", prompt: "neutral whitebox", orientation: "横图" }],
    }));
    const environment = { ...process.env, WORLDKIT_LWDP_CLIENT_SMOKE: "1" };
    const codex = spawnSync(process.execPath, [
      "scripts/run-lwdp-codex-task.mjs",
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
      /WORLDKIT_LWDP_CODEX_SMOKE codex-smoke profile=formal model=gpt-5\.6-sol reasoning=xhigh submitAttempts=1 assets=1 outputs=1/,
    );

    const t2i = spawnSync(process.execPath, [
      "scripts/run-lwdp-t2i-job.mjs",
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
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  try {
    const instruction = path.join(root, "instruction.txt");
    const manifest = path.join(root, "manifest.json");
    await writeFile(instruction, "Write result.json.");
    await writeFile(manifest, JSON.stringify({
      items: [{ id: "image-smoke", prompt: "neutral whitebox", orientation: "横图" }],
    }));
    const environment = { ...process.env, WORLDKIT_LWDP_CLIENT_SMOKE: "1" };
    const codex = spawnSync(process.execPath, [
      "scripts/run-lwdp-codex-task.mjs",
      "--repo-root", repoRoot,
      "--task-id", "codex-smoke",
      "--stage", "planner",
      "--output-s3-prefix", "s3://bucket/worldkit/smoke",
      "--instruction-file", instruction,
      "--output", `result.json::${path.join(root, "result.json")}::application/json`,
      "--submit-attempts", "2",
    ], { cwd: repoRoot, env: environment, encoding: "utf8" });
    assert.notEqual(codex.status, 0);
    assert.match(codex.stderr, /submit each LWDP creation request exactly once/);

    const t2i = spawnSync(process.execPath, [
      "scripts/run-lwdp-t2i-job.mjs",
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
