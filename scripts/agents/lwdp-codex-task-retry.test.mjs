import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { CodexTaskOutcomeError } from "../lib/codex-task-outcome.mjs";
import { cloudTaskAttemptIdentity, openCloudTaskAttemptLedger } from "./lwdp-codex-task-attempt-ledger.mjs";
import {
  canRetryTerminalTask, confirmedTerminalTaskFailure, resolveTerminalTaskRetryPolicy,
  terminalTaskFailureEvidence, terminalTaskRetryDelayMs,
} from "./lwdp-codex-task-retry.mjs";

test("frozen Cloud stage budgets, timeout cap, prior attempts and 30s/120s backoff", () => {
  for (const stage of ["planner", "builder", "coding-agent", "visual-reconstruction", "playthrough-planner", "episode-visual", "episode-opening-review"]) {
    const policy = resolveTerminalTaskRetryPolicy(stage, undefined, {});
    assert.equal(policy.maximumAttempts, 3);
    assert.equal(terminalTaskRetryDelayMs(policy, 1), 30_000);
    assert.equal(terminalTaskRetryDelayMs(policy, 2), 120_000);
    assert.equal(terminalTaskRetryDelayMs(policy, 3), 300_000);
    assert.equal(canRetryTerminalTask(policy, 1, "task-timeout"), true);
    assert.equal(canRetryTerminalTask(policy, 2, "task-timeout"), false);
    assert.equal(canRetryTerminalTask(policy, 2, "capacity"), true);
    assert.equal(canRetryTerminalTask(policy, 3, "capacity"), false);
    assert.equal(canRetryTerminalTask(policy, 1, null), false);
  }
  assert.equal(resolveTerminalTaskRetryPolicy("unlisted", undefined, {}).maximumAttempts, 1);
  assert.throws(() => resolveTerminalTaskRetryPolicy("unlisted", 2, {}), /Only formal/);
  assert.throws(() => resolveTerminalTaskRetryPolicy("builder", 4, {}), /integer/);
  assert.throws(() => resolveTerminalTaskRetryPolicy("builder", 2, { WORLDKIT_LWDP_STAGE_RETRY_BASE_DELAY_MS: "-1" }), /integer/);
  const prior = resolveTerminalTaskRetryPolicy("builder", undefined, { WORLDKIT_LWDP_BUILDER_PRIOR_ATTEMPTS: "1" });
  assert.equal(canRetryTerminalTask(prior, 1, "task-timeout"), false);
  assert.equal(canRetryTerminalTask(prior, 1, "capacity"), true);
  assert.equal(canRetryTerminalTask(prior, 2, "capacity"), false);
  assert.equal(resolveTerminalTaskRetryPolicy("builder", undefined, { WORLDKIT_LWDP_BUILDER_MAX_ATTEMPTS: "2" }).maximumAttempts, 2);
  assert.equal(resolveTerminalTaskRetryPolicy("visual-reconstruction", undefined, { WORLDKIT_VISUAL_RECONSTRUCTION_RETRY_DELAY_MS: "12" }).baseDelayMs, 12);
});

function terminal(error, overrides = {}) {
  return confirmedTerminalTaskFailure({
    job: { job_id: "job-one", request_id: "root-request", output_s3_prefix: "s3://bucket/run", status: "failed", error, ...overrides },
    requestId: "root-request", taskId: "builder", outputS3Prefix: "s3://bucket/run", itemsPayload: { items: [] },
  });
}

test("classifies only identity-bound terminal evidence, preserving old failure classes and deterministic stops", () => {
  for (const [diagnostic, expected] of [
    ["401 Unauthorized token_expired", "auth"],
    ["model gpt is not supported when using Codex with a ChatGPT account", "account-model-compatibility"],
    ["Selected model is at capacity", "capacity"], ["codex timeout after 1800s", "task-timeout"],
    ["missing required outputs: source.ts", "output-omission"],
    ["Job supervisor actor died", "transport"], ["connection reset by peer", "transport"],
    ["HTTP 503", "transport"], ["timed out", "transport"],
    ["BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED: missing required outputs: source.ts", null],
    ["arbitrary source self-check failure", null],
  ]) assert.equal(terminalTaskFailureEvidence(terminal(diagnostic)).retryClass, expected);
  assert.equal(terminalTaskFailureEvidence(new Error("HTTP 503")), null);
  assert.equal(terminalTaskFailureEvidence(new CodexTaskOutcomeError("task-timeout", "codex timeout after 1s")), null);
  assert.equal(terminalTaskFailureEvidence(terminal("capacity", { status: "cancelled" })).retryClass, null);
  assert.equal(terminalTaskFailureEvidence(terminal("capacity", { status: "stopped" })).retryClass, null);
  assert.throws(() => terminal("HTTP 503", { status: "running" }), /confirmed terminal/);
  assert.throws(() => terminal("HTTP 503", { request_id: "foreign-request" }), /confirmed terminal/);
});

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
function collect(argv, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, argv, { cwd: repoRoot, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    child.once("error", reject);
    child.once("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function fixture(t, outcomes, { deterministicStop = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-terminal-retry-"));
  const taskId = "fixture-builder", requestId = "fixture-root-request", outputPrefix = "s3://bucket/run";
  const posts = [], jobs = new Map();
  let currentOutcomes = outcomes;
  const server = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.method === "POST") {
      let text = "";
      for await (const chunk of request) text += chunk;
      const payload = JSON.parse(text);
      posts.push(payload);
      const number = posts.length;
      const job = { job_id: `job-${number}`, request_id: payload.request_id,
        output_s3_prefix: payload.output_s3_prefix, ...currentOutcomes[Math.min(number - 1, currentOutcomes.length - 1)] };
      jobs.set(payload.request_id, job);
      response.end(JSON.stringify({ job })); return;
    }
    if (request.url?.includes("by-request-id")) {
      const id = decodeURIComponent(request.url.split("/").at(-1).split("?")[0]);
      const job = jobs.get(id);
      if (job) { response.end(JSON.stringify({ job })); return; }
    }
    const match = /\/jobs\/(job-\d+)/.exec(request.url ?? "");
    const job = [...jobs.values()].find((value) => value.job_id === match?.[1]);
    if (job) {
      if (request.url.includes("/items?")) {
        response.end(JSON.stringify({ items: [{ item_id: taskId, status: job.status === "succeeded" ? "succeeded" : "failed",
          error: job.error, error_code: job.error_code,
          metadata: job.status === "succeeded" ? { output_uris: [`${job.output_s3_prefix}/tasks/${taskId}/result.json`] } :
            { log_uri: `${job.output_s3_prefix}/tasks/${taskId}/logs/codex_attempt.json` } }] }));
      } else response.end(JSON.stringify({ job }));
      return;
    }
    response.statusCode = 404; response.end(JSON.stringify({ detail: "not found" }));
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  t.after(async () => { await new Promise((resolvePromise) => server.close(resolvePromise)); await rm(root, { recursive: true, force: true }); });
  const bin = path.join(root, "bin"); await mkdir(bin);
  const aws = path.join(bin, "aws");
  await writeFile(aws, `#!/usr/bin/env node\nconst fs = require('node:fs'); const path = require('node:path');\nconst destination = process.argv.at(-1);\nfs.mkdirSync(path.dirname(destination), {recursive:true});\nfs.writeFileSync(destination, process.argv.at(-2).endsWith('codex_attempt.json') ? ${JSON.stringify(JSON.stringify({ item_id: taskId, status: "missing_outputs", stdout_tail: deterministicStop ? "BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED" : "ordinary output omission" }))} : '{"ok":true}\\n');\n`);
  await chmod(aws, 0o755);
  const instruction = path.join(root, "instruction.txt"), destination = path.join(root, "result.json");
  await writeFile(instruction, "Write result.json.");
  const argv = ["scripts/agents/run-lwdp-codex-task.mjs", "--repo-root", root, "--stage", "builder", "--task-id", taskId,
    "--request-id", requestId, "--output-s3-prefix", outputPrefix, "--instruction-file", instruction,
    "--output", `result.json::${destination}::application/json`];
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    LWDP_API_BASE: `http://127.0.0.1:${server.address().port}`, LWDP_GENERATION_API_TOKEN: "test-only-token", LWDP_USER_ID: "test",
    WORLDKIT_LWDP_STAGE_RETRY_BASE_DELAY_MS: "0", WORLDKIT_LWDP_BUILDER_PRIOR_ATTEMPTS: "0", WORLDKIT_LWDP_BUILDER_MAX_ATTEMPTS: "3",
    WORLDKIT_LWDP_JOB_TIMEOUT_MS: "1", WORLDKIT_LWDP_QUEUE_TIMEOUT_MS: "1" };
  return { root, posts, jobs, destination, requestId, outputPrefix,
    ledgerDirectory: path.join(root, ".codex-tmp/lwdp-codex/task-attempts", requestId),
    run: (extra = [], envPatch = {}) => collect([...argv, ...extra], { ...env, ...envPatch }),
    setOutcomes: (next) => { currentOutcomes = next; },
  };
}

test("terminal retry produces new physical IDs/prefixes and stable logical outcome, then resumes completed outputs without POST", async (t) => {
  const f = await fixture(t, [{ status: "failed", error: "Selected model is at capacity" }, { status: "succeeded" }]);
  const first = await f.run();
  assert.equal(first.code, 0, first.stderr);
  assert.equal(f.posts.length, 2);
  assert.equal(f.posts[1].request_id, `${f.requestId}-attempt-2`);
  assert.equal(f.posts[1].output_s3_prefix, `${f.outputPrefix}/attempt-2`);
  const envelope = first.stdout.split("\n").filter((line) => line.startsWith("WORLDKIT_CODEX_TASK_OUTCOME "));
  assert.equal(envelope.length, 1); assert.match(envelope[0], /"requestId":"fixture-root-request","outcome":"completed"/);
  assert.equal(first.stdout.split("\n").filter((line) => line.startsWith("WORLDKIT_LWDP_JOB ")).length, 1);
  assert.match(first.stdout, /WORLDKIT_LWDP_JOB builder fixture-builder job-2 dispatch=single-task-fast-path profile=formal model=gpt-5\.6-sol reasoning=xhigh/);
  const failure = JSON.parse(await readFile(path.join(f.ledgerDirectory, "attempt-1-terminal.json"), "utf8"));
  const success = JSON.parse(await readFile(path.join(f.ledgerDirectory, "attempt-2-terminal.json"), "utf8"));
  assert.equal(failure.evidence.retryClass, "capacity"); assert.equal(success.outcome, "completed");
  assert.match(success.evidence.outputs[0].sha256, /^[a-f0-9]{64}$/);
  const resumed = await f.run(["--reconcile-only"]); assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(resumed.stdout.split("\n").filter((line) => line.startsWith("WORLDKIT_LWDP_JOB ")).length, 1);
  assert.match(resumed.stdout, /WORLDKIT_LWDP_JOB builder fixture-builder job-2 /);
  assert.equal(f.posts.length, 2);
  await writeFile(f.destination, "tampered");
  const drift = await f.run(); assert.notEqual(drift.code, 0); assert.match(drift.stderr, /Hash drifted/);
  assert.equal(f.posts.length, 2);
});

test("default exhaustion persists all three terminal failures and process restart cannot reset budget", async (t) => {
  const f = await fixture(t, [{ status: "failed", error: "HTTP 503" }]);
  assert.notEqual((await f.run()).code, 0); assert.equal(f.posts.length, 3);
  assert.notEqual((await f.run()).code, 0); assert.equal(f.posts.length, 3);
  assert.equal((await readdir(f.ledgerDirectory)).filter((file) => file.endsWith("-terminal.json")).length, 3);
  const drift = await f.run([], { WORLDKIT_LWDP_BUILDER_MAX_ATTEMPTS: "2" });
  assert.notEqual(drift.code, 0); assert.match(drift.stderr, /immutable record identity drifted/); assert.equal(f.posts.length, 3);
});

test("provider terminal timeout is capped at two total attempts", async (t) => {
  const f = await fixture(t, [{ status: "failed", error_code: "task_timeout", error: "codex timeout after 1800s" }]);
  const result = await f.run(); assert.notEqual(result.code, 0); assert.equal(f.posts.length, 2);
  assert.match(result.stdout, /"outcome":"task-timeout"/);
});

test("pending remains one original POST; reconcile-only never submits replacement; normal restart continues confirmed terminal ledger", async (t) => {
  const f = await fixture(t, [{ status: "running" }]);
  const pending = await f.run(); assert.notEqual(pending.code, 0); assert.equal(f.posts.length, 1);
  assert.match(pending.stdout, /"outcome":"creation-outcome-unknown"/);
  assert.equal((await readdir(f.ledgerDirectory)).filter((file) => file.endsWith("-terminal.json")).length, 0);
  Object.assign(f.jobs.get(f.requestId), { status: "failed", error: "Selected model is at capacity" });
  const recovered = await f.run(["--reconcile-only"]); assert.notEqual(recovered.code, 0); assert.equal(f.posts.length, 1);
  f.setOutcomes([{ status: "succeeded" }]);
  const continued = await f.run(); assert.equal(continued.code, 0, continued.stderr); assert.equal(f.posts.length, 2);
});

test("deterministic capability stop in the exact remote log prevents missing-output retry", async (t) => {
  const f = await fixture(t, [{ status: "failed", error: "missing required outputs: result.json" }], { deterministicStop: true });
  const result = await f.run(); assert.notEqual(result.code, 0); assert.equal(f.posts.length, 1);
  const record = JSON.parse(await readFile(path.join(f.ledgerDirectory, "attempt-1-terminal.json"), "utf8"));
  assert.equal(record.evidence.deterministicStop, true); assert.equal(record.evidence.retryClass, null);
});

test("ordinary output omission retains the old terminal retry", async (t) => {
  const f = await fixture(t, [{ status: "failed", error: "missing required outputs: result.json" }, { status: "succeeded" }]);
  const result = await f.run(); assert.equal(result.code, 0, result.stderr); assert.equal(f.posts.length, 2);
});

test("cancelled terminal result records proof without retry even if diagnostic resembles capacity", async (t) => {
  const f = await fixture(t, [{ status: "cancelled", error: "Selected model is at capacity" }]);
  assert.notEqual((await f.run()).code, 0); assert.equal(f.posts.length, 1);
  const record = JSON.parse(await readFile(path.join(f.ledgerDirectory, "attempt-1-terminal.json"), "utf8"));
  assert.equal(record.evidence.status, "cancelled"); assert.equal(record.evidence.retryClass, null);
});

async function crashAfterOutputPromotion(fixture) {
  const preload = path.join(fixture.root, "crash-before-ledger-success.mjs");
  await writeFile(preload, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.promises.link;
fs.promises.link = async (source, destination) => {
  if (String(destination).endsWith('attempt-1-terminal.json')) process.kill(process.pid, 'SIGKILL');
  return original(source, destination);
};
syncBuiltinESMExports();
`);
  const result = await fixture.run([], { NODE_OPTIONS: `--import=${preload}` });
  assert.notEqual(result.code, 0);
  assert.equal(await readFile(fixture.destination, "utf8"), '{"ok":true}\n');
  assert.equal(fixture.posts.length, 1);
  assert.equal((await readdir(fixture.ledgerDirectory)).includes("attempt-1-terminal.json"), false);
  return lstat(fixture.destination);
}

test("actual router crash after output promotion resumes exact pending request without overwriting matching output or POST", async (t) => {
  const f = await fixture(t, [{ status: "succeeded" }]);
  const before = await crashAfterOutputPromotion(f);
  const resumed = await f.run(["--reconcile-only"]);
  assert.equal(resumed.code, 0, resumed.stderr); assert.equal(f.posts.length, 1);
  assert.equal((await lstat(f.destination)).ino, before.ino);
  assert.equal(resumed.stdout.split("\n").filter((line) => line.startsWith("WORLDKIT_LWDP_JOB ")).length, 1);
  assert.equal(JSON.parse(await readFile(path.join(f.ledgerDirectory, "attempt-1-terminal.json"), "utf8")).outcome, "completed");
});

test("crash recovery rejects differing existing output without overwrite; fresh tasks still reject any preexisting output", async (t) => {
  const f = await fixture(t, [{ status: "succeeded" }]);
  await crashAfterOutputPromotion(f);
  await writeFile(f.destination, "user-owned-different-bytes");
  const resumed = await f.run(["--reconcile-only"]);
  assert.notEqual(resumed.code, 0); assert.match(resumed.stderr, /Hash differs/);
  assert.equal(f.posts.length, 1); assert.equal(await readFile(f.destination, "utf8"), "user-owned-different-bytes");
  const fresh = await fixture(t, [{ status: "succeeded" }]);
  await writeFile(fresh.destination, '{"ok":true}\n');
  const rejected = await fresh.run(); assert.notEqual(rejected.code, 0); assert.equal(fresh.posts.length, 0);
  assert.match(rejected.stderr, /output already exists/);
});

test("long root IDs retain unique bounded retry identities and ledger rejects symlink roots", async () => {
  const requestId = "a".repeat(80);
  const identity = cloudTaskAttemptIdentity(requestId, "s3://bucket/root/", 2);
  assert.equal(identity.requestId.length, 80); assert.equal(identity.outputS3Prefix, "s3://bucket/root/attempt-2");
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-ledger-path-"));
  try {
    await mkdir(path.join(root, "other")); await symlink(path.join(root, "other"), path.join(root, ".codex-tmp"));
    await assert.rejects(openCloudTaskAttemptLedger({ repoRoot: root, requestId, taskId: "builder", outputS3Prefix: "s3://bucket/root",
      requestArgumentFingerprint: "a".repeat(64), policy: resolveTerminalTaskRetryPolicy("builder", undefined, {}) }), /Unsafe/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
