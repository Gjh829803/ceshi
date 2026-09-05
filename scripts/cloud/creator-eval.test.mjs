import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { eventStatistics, isPassingDelivery, validateDeliveryEvidence } from "./creator-eval-statistics.mjs";
import { CODEX_BINARY_SHA256, executionEnvironment, parseCloudLayout, readRuntimeLock, resolveCreatorSubmission, sha256 } from "./creator-eval-runtime.mjs";

// Synthetic records exercise admission logic only; they are never cloud or
// browser evidence. No test loads credentials, uploads inputs or submits jobs.
const sourceHash = `sha256:${"a".repeat(64)}`;
const archiveSha256 = `sha256:${"b".repeat(64)}`;
const validDelivery = () => ({
  kind: "experimental-native-creator-delivery", status: "submitted", sceneId: "case-test", sourceHash,
  archivePath: "/task/creator-delivery.tar.gz", archiveSha256,
  opening: { sourceHash },
  playtest: { status: "passed", sourceHash, actualSimulationSeconds: 180, targetCount: 3, uniqueFiveMeterCells: 15, maximumDistanceFromSpawnMeters: 30 },
});
const operation = (id, type, status, result) => ({ id, type, status, ...(result === undefined ? {} : { result }) });
const transport = (tool, value, extraContent = []) => ({ type: "item.completed", item: {
  type: "mcp_tool_call", server: "worldkit_creator", tool, status: "completed",
  result: { content: [{ type: "text", text: JSON.stringify(value) }, ...extraContent] },
} });
const image = { type: "image", mimeType: "image/png", data: "synthetic-test-image" };
async function temporary(t) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "creator-eval-contract-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function writeEvents(t, events) {
  const file = path.join(await temporary(t), "events.jsonl");
  await writeFile(file, events.map(value => typeof value === "string" ? value : JSON.stringify(value)).join("\n") + "\n");
  return file;
}

test("delivery thresholds reject absent, string, NaN and infinite numbers", () => {
  assert.equal(isPassingDelivery(validDelivery()), true);
  for (const key of ["actualSimulationSeconds", "targetCount", "uniqueFiveMeterCells", "maximumDistanceFromSpawnMeters"]) {
    for (const invalid of [undefined, null, "180", NaN, Infinity, -Infinity, -1]) {
      const delivery = validDelivery(); delivery.playtest[key] = invalid;
      assert.equal(isPassingDelivery(delivery), false, `${key}: ${String(invalid)}`);
    }
  }
  for (const sourceHash of ["not-a-hash", `sha256:${"g".repeat(64)}`]) assert.equal(isPassingDelivery({ ...validDelivery(), sourceHash }), false);
});

test("only completed WorldKit MCP transport records count as submit and image evidence", async t => {
  const submit = transport("world_submit", operation("op-real", "world.submit", "queued"));
  const receipt = transport("operations_get", operation("op-real", "world.submit", "succeeded", validDelivery()));
  const preview = transport("operations_get", operation("op-preview", "world.preview", "succeeded", { sourceHash }), [image]);
  const file = await writeEvents(t, [
    { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(receipt) } },
    { type: "item.completed", item: { type: "command_execution", aggregated_output: JSON.stringify(receipt) } },
    { ...receipt, type: "item.started" },
    { ...receipt, item: { ...receipt.item, server: "other_server" } },
    { ...receipt, item: { ...receipt.item, error: { message: "failed" } } },
    { ...preview, item: { ...preview.item, result: { ...preview.item.result, isError: true } } },
    transport("operations_get", operation("op-never-issued", "world.submit", "succeeded", validDelivery())),
    submit, preview, receipt,
  ]);
  const actual = await eventStatistics(file);
  assert.deepEqual(actual.submitOperationIds, ["op-real"]);
  assert.equal(actual.successfulSubmitReceipts.length, 1);
  assert.equal(actual.successfulSubmitReceipts[0].operationId, "op-real");
  assert.equal(actual.successfulSubmitReceipts[0].archiveSha256, archiveSha256);
  assert.equal(actual.previewImageObservations, 1);
});

test("assistant claims alone, missing issued operations and invalid JSON never qualify delivery", async t => {
  const delivery = validDelivery();
  const file = await writeEvents(t, [
    { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(delivery) } },
    transport("operations_get", operation("unissued", "world.submit", "succeeded", delivery)),
    "{truncated transport",
  ]);
  const actual = await eventStatistics(file);
  assert.deepEqual(actual.successfulSubmitReceipts, []);
  assert.equal(actual.previewImageObservations, 0);
  assert.equal(actual.invalidLines, 1);
  assert.equal((await eventStatistics(`${file}.missing`)).unavailable, true);
});

test("delivery binds original transport bytes, the final source preview, complete JSON and archive hash", async t => {
  const result = { ...validDelivery(), archiveSha256: `sha256:${sha256("synthetic archived bytes")}` };
  const file = await writeEvents(t, [
    transport("world_submit", operation("op-delivery", "world.submit", "queued")),
    transport("operations_get", operation("op-preview", "world.preview", "succeeded", { sourceHash }), [image]),
    transport("operations_get", operation("op-delivery", "world.submit", "succeeded", result)),
  ]);
  const eventsSha256 = sha256(await readFile(file));
  const artifacts = { "creator-result.json": { sha256: sha256(JSON.stringify(result)) }, "creator-delivery.tar.gz": { sha256: sha256("synthetic archived bytes") } };
  const input = {
    result, events: await eventStatistics(file), eventsSha256, artifacts, expectedSceneId: result.sceneId, expectedWorkspace: "/task", expectedRuntimeHash: `sha256:${"c".repeat(64)}`,
    launcherReport: { runtimeHash: `sha256:${"c".repeat(64)}`, workspace: "/task", eventsSha256, eventsTransportSha256: eventsSha256, artifacts },
  };
  assert.equal(validateDeliveryEvidence(input).operationId, "op-delivery");
  const corruptions = [
    value => { value.eventsSha256 = "d".repeat(64); },
    value => { value.launcherReport.eventsTransportSha256 = "d".repeat(64); },
    value => { value.artifacts["creator-delivery.tar.gz"] = { sha256: "d".repeat(64) }; },
    value => { value.artifacts["creator-result.json"] = { sha256: "d".repeat(64) }; },
    value => { value.events.previewSourceHashes = [`sha256:${"d".repeat(64)}`]; },
    value => { value.events.successfulSubmitReceipts = []; },
    value => { value.result.extraAuthoredClaim = "not in the actual receipt"; },
    value => { value.events.invalidLines = 1; },
    value => { value.expectedRuntimeHash = `sha256:${"d".repeat(64)}`; },
    value => { value.expectedWorkspace = "/other-task"; },
  ];
  for (const mutate of corruptions) {
    // JSON copying intentionally breaks aliases so local artifact replacement
    // does not also edit the independently downloaded launcher's record.
    const changed = JSON.parse(JSON.stringify(input)); mutate(changed);
    assert.throws(() => validateDeliveryEvidence(changed), /CREATOR_/);
  }
});

test("durable unknown submissions reconcile without any second POST", async () => {
  for (const mode of ["run", "resume"]) {
    const calls = [];
    const options = { mode, hasDurableIntent: true,
      findExisting: async () => { calls.push("lookup"); return "gen_a123"; },
      createIntentAndSubmit: async () => { calls.push("submit"); return "gen_b456"; } };
    assert.equal(await resolveCreatorSubmission(options), "gen_a123");
    assert.deepEqual(calls, ["lookup"]);
    for (const findExisting of [async () => null, async () => { throw new Error("unknown transport outcome"); }]) {
      await assert.rejects(resolveCreatorSubmission({ ...options, findExisting }));
    }
    assert.deepEqual(calls, ["lookup"]);
    assert.equal(await resolveCreatorSubmission({ ...options, existingJobId: "gen_a123" }), "gen_a123");
    assert.deepEqual(calls, ["lookup"]);
  }
});

test("resume never creates a fresh intent, while a fresh run calls submission once", async () => {
  const calls = [];
  const options = { hasDurableIntent: false, findExisting: async () => { calls.push("lookup"); return "gen_a123"; }, createIntentAndSubmit: async () => { calls.push("submit"); return "gen_b456"; } };
  assert.equal(await resolveCreatorSubmission({ ...options, mode: "resume" }), null);
  assert.deepEqual(calls, []);
  assert.equal(await resolveCreatorSubmission({ ...options, mode: "run" }), "gen_b456");
  assert.deepEqual(calls, ["submit"]);
});

async function cloudArguments(t) {
  const workspace = await temporary(t);
  await mkdir(path.join(workspace, "inputs")); await mkdir(path.join(workspace, "outputs"));
  return { workspace, argv: ["exec", "--skip-git-repo-check", "--ephemeral", "--model", "gpt-6-astra", "--sandbox", "workspace-write", "-c", 'model_reasoning_effort="xhigh"', "-c", "notify=[]", "-C", workspace,
    "--add-dir", path.join(workspace, "outputs"), "--add-dir", path.join(workspace, "inputs"), "--image", path.join(workspace, "inputs", "reference.png"), "--output-last-message", path.join(workspace, "outputs", "assistant_response.md"), "Build the reference world."] };
}

test("cloud layout preserves the actual task workspace, declared outputs and GPT-6 xhigh contract", async t => {
  const { workspace, argv } = await cloudArguments(t);
  assert.deepEqual(await parseCloudLayout(argv), { workspace, outputs: path.join(workspace, "outputs"), lastMessage: path.join(workspace, "outputs", "assistant_response.md"), caseId: path.basename(workspace) });
  for (const changed of [
    argv.map(value => value === "gpt-6-astra" ? "gpt-5.6-sol" : value),
    argv.map(value => value === 'model_reasoning_effort="xhigh"' ? 'model_reasoning_effort="low"' : value),
    argv.map(value => value === "workspace-write" ? "danger-full-access" : value),
    [...argv.slice(0, -1), "--model", "gpt-6-astra", argv.at(-1)],
    argv.map(value => value.endsWith("assistant_response.md") ? path.join(workspace, "assistant_response.md") : value),
  ]) await assert.rejects(parseCloudLayout(changed), /CREATOR_/);
});

test("a later conflicting reasoning configuration cannot silently override xhigh", async t => {
  const { argv } = await cloudArguments(t);
  await assert.rejects(parseCloudLayout([...argv.slice(0, -1), "-c", 'model_reasoning_effort="low"', argv.at(-1)]), /CREATOR_/);
});

test("MCP environment excludes inherited credentials and keeps the frozen runtime identity", () => {
  const lock = { nodeBinary: "/node/bin/node", codexBinary: "/cli/bin/codex", runtimeHash: sourceHash, browserEnvironment: { WORLDKIT_CHROMIUM_EXECUTABLE: "/browser/run", LANG: "C.UTF-8" } };
  const inherited = { CODEX_HOME: "/platform/auth", AWS_ACCESS_KEY_ID: "synthetic", LWDP_TOKEN: "synthetic", OPENAI_API_KEY: "synthetic", HTTP_PROXY: "synthetic", WORLDKIT_CREATOR_RUNTIME_HASH: "forged", PATH: "/untrusted", HOME: "/untrusted" };
  const mcp = executionEnvironment(lock, "/task", { inherited });
  for (const key of ["CODEX_HOME", "AWS_ACCESS_KEY_ID", "LWDP_TOKEN", "OPENAI_API_KEY", "HTTP_PROXY"]) assert.equal(Object.hasOwn(mcp, key), false);
  assert.equal(mcp.WORLDKIT_CREATOR_RUNTIME_HASH, sourceHash);
  assert.equal(mcp.HOME, "/task/.creator-session/home");
  assert.equal(mcp.WORLDKIT_CHROMIUM_EXECUTABLE, "/browser/run");
  assert.equal(executionEnvironment(lock, "/task", { inherited, includeAuthentication: true }).CODEX_HOME, "/platform/auth");
  assert.throws(() => executionEnvironment(lock, "/task", { inherited: {}, includeAuthentication: true }), /CREATOR_PLATFORM_AUTH_HOME_MISSING/);
});

test("runtime lock identity binds exact bytes and refuses unauthorized binary or environment fields", async t => {
  const file = path.join(await temporary(t), "runtime-lock.json");
  const base = { schemaVersion: 1, status: "ready", toolkitRoot: "/toolkit", browserRoot: "/browser", codexBinary: "/cli/bin/codex", codexBinarySha256: CODEX_BINARY_SHA256 };
  await writeFile(file, JSON.stringify(base) + "\n");
  assert.equal((await readRuntimeLock(file)).runtimeHash, `sha256:${sha256(await readFile(file))}`);
  for (const invalid of [{ ...base, status: "draft" }, { ...base, codexBinarySha256: "0".repeat(64) }, { ...base, browserEnvironment: { CODEX_HOME: "/wrong" } }, { ...base, maximumTaskSeconds: 300.5 }]) {
    await writeFile(file, JSON.stringify(invalid));
    await assert.rejects(readRuntimeLock(file), /CREATOR_/);
  }
});

test("prepare preserves five frozen cases and emits GPT-6 xhigh requests without cloud submission", async t => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const parent = path.join(repo, ".codex-tmp"); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "creator-eval-contract-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const imagePath = path.join(directory, "reference.png"); const promptPath = path.join(directory, "prompt.txt");
  await writeFile(imagePath, "synthetic reference bytes"); await writeFile(promptPath, "A world test.\n");
  const cases = Array.from({ length: 5 }, (_, index) => ({ id: `fixture-case-${index}`, title: `Case ${index}`, sourceCaseId: String(index), sourceTestSetId: "fixture-only", sourceUserPrompt: "A world test.", effectiveUserPrompt: "A world test.", acceptanceFocus: ["Fixture"], expectedSubjectCategory: "humanoid",
    referenceImage: { path: imagePath, contentSha256: sha256("synthetic reference bytes") }, effectiveUserPromptFile: { path: promptPath, contentSha256: sha256("A world test.\n") } }));
  const manifest = path.join(directory, "manifest.json"); await writeFile(manifest, JSON.stringify({ id: "fixture-evaluation", cases }));
  const lock = path.join(directory, "runtime-lock.json");
  const launcherPath = "/fsx/pipeline/worldkit-creator-experiments/fixture/creator-eval-launcher.mjs";
  await writeFile(lock, JSON.stringify({ schemaVersion: 1, status: "ready", toolkitRoot: "/toolkit", browserRoot: "/browser", codexBinary: "/cli/bin/codex", codexBinarySha256: CODEX_BINARY_SHA256, launcherPath }));
  const output = path.join(directory, "output");
  const prepareArguments = [path.join(repo, "scripts/cloud/run-creator-five-case-eval.mjs"), "--mode", "prepare", "--manifest", manifest, "--runtime-lock", lock, "--output-root", output];
  const executionOptions = {
    cwd: repo, env: { PATH: process.env.PATH, HOME: directory }, timeout: 10_000,
  };
  const child = await promisify(execFile)(process.execPath, [...prepareArguments, "--max-concurrency", "4"], executionOptions);
  assert.match(child.stdout, /cases=5 cloudSubmissions=0/);
  const plan = JSON.parse(await readFile(path.join(output, "evaluation-plan.json"), "utf8"));
  assert.equal(plan.maxConcurrency, 4);
  assert.equal(plan.cases.length, 5);
  assert.equal(new Set(plan.cases.map(row => row.requestId)).size, 5);
  for (const item of cases) {
    const payload = JSON.parse(await readFile(path.join(output, item.id, "payload.json"), "utf8"));
    assert.equal(payload.defaults.model, "gpt-6-astra");
    assert.equal(payload.defaults.reasoning_effort, "xhigh");
    assert.equal(payload.defaults.account_concurrency, 1);
    assert.equal(payload.options.codex_bin, launcherPath);
    assert.equal(payload.tasks[0].id, item.id);
    assert.equal(payload.tasks[0].assets[0].attach_as, "image");
    assert(payload.tasks[0].outputs.some(row => row.path === "creator-events.jsonl" && row.required));
  }
  await assert.rejects(promisify(execFile)(process.execPath, [...prepareArguments, "--max-concurrency", "5"], executionOptions), error => error.code === 1 && /--max-concurrency must be an integer in \[1, 4\]/.test(error.stderr));
  await promisify(execFile)(process.execPath, [...prepareArguments, "--account-concurrency", "4"], executionOptions);
  for (const item of cases) {
    const payload = JSON.parse(await readFile(path.join(output, item.id, "payload.json"), "utf8"));
    assert.equal(payload.defaults.account_concurrency, 4);
  }
  await assert.rejects(promisify(execFile)(process.execPath, [...prepareArguments, "--account-concurrency", "5"], executionOptions), error => error.code === 1 && /--account-concurrency must be an integer in \[1, 4\]/.test(error.stderr));
});

for (const obstruction of ["active-owner", "busy-lock"]) test(`${obstruction} remains recoverable without altering its owner or resubmitting an unknown request`, async t => {
  const repo = await temporary(t);
  const cloud = path.join(repo, "scripts/cloud"); const lib = path.join(repo, "scripts/lib");
  const credentials = path.join(repo, ".codex-tmp/runtime-config");
  const admissions = path.join(repo, ".codex-tmp/gpt6-five-case-eval/admissions");
  for (const directory of [cloud, lib, credentials, admissions]) await mkdir(directory, { recursive: true });
  for (const name of ["run-creator-five-case-eval.mjs", "creator-eval-runtime.mjs", "creator-eval-statistics.mjs", "creator-eval-diagnostics.mjs", "creator-eval-instructions.md"]) {
    await copyFile(new URL(name, import.meta.url), path.join(cloud, name));
  }
  // Only the provider boundary is replaced. The unchanged real runner owns
  // state, locks, planning, catch classification, selection and recovery.
  await writeFile(path.join(lib, "lwdp-generation-client.mjs"), `
    import {appendFileSync} from 'node:fs';
    const note = name => appendFileSync(process.env.CREATOR_TEST_CALLS, name+'\\n');
    export async function findGenerationJobByRequestId(){note('lookup'); return {job_id:'gen_a123'};}
    export const submittedJobId = value => value.job_id;
    export async function lwdpRequest(){note('config'); throw new Error('fixture-stops-before-network');}
    const forbidden = async () => {note('FORBIDDEN_SUBMISSION_OR_TRANSFER'); throw new Error('unexpected provider operation');};
    export const submitCodexGenerationJob=forbidden, uploadS3File=forbidden, downloadS3FileAtomic=forbidden, fetchGenerationItems=forbidden, pollGenerationJob=forbidden;
  `);
  for (const name of ["aws-credentials", "aws-config"]) await writeFile(path.join(credentials, name), "# empty test fixture\n");
  const imagePath = path.join(repo, "reference.png"); const promptPath = path.join(repo, "prompt.txt");
  await writeFile(imagePath, "fixture"); await writeFile(promptPath, "fixture");
  const cases = Array.from({ length: 5 }, (_, index) => ({ id: `case-${index}`, title: `Case ${index}`, effectiveUserPrompt: "fixture", acceptanceFocus: [],
    referenceImage: { path: imagePath, contentSha256: sha256("fixture") }, effectiveUserPromptFile: { path: promptPath, contentSha256: sha256("fixture") } }));
  const manifest = path.join(repo, "manifest.json"); await writeFile(manifest, JSON.stringify({ id: "same-run", cases }));
  const lock = path.join(repo, "runtime-lock.json");
  await writeFile(lock, JSON.stringify({ schemaVersion: 1, status: "ready", toolkitRoot: "/toolkit", browserRoot: "/browser", codexBinary: "/cli/bin/codex", codexBinarySha256: CODEX_BINARY_SHA256, launcherPath: "/fsx/pipeline/worldkit-creator-experiments/fixture/creator-eval-launcher.mjs" }));
  const output = path.join(repo, "output"); const calls = path.join(repo, "calls.log"); await writeFile(calls, "");
  const ownerPath = path.join(admissions, "case-0.json");
  const ownerBytes = JSON.stringify({ runId: "previous-run", requestId: "previous-request", jobId: "gen_b456", phase: "remote-pending", providerStatus: "running", hasSubmissionIntent: true }) + "\n";
  await writeFile(ownerPath, ownerBytes);
  const lockDirectory = path.join(admissions, "case-0.lock");
  if (obstruction === "busy-lock") await mkdir(lockDirectory);
  const invoke = async (mode, selection = ["--case-limit", "2"]) => {
    try { return await promisify(execFile)(process.execPath, [path.join(cloud, "run-creator-five-case-eval.mjs"), "--mode", mode, "--manifest", manifest, "--runtime-lock", lock, "--output-root", output, "--max-concurrency", "1", ...selection], { cwd: repo, env: { PATH: process.env.PATH, HOME: repo, CREATOR_TEST_CALLS: calls }, timeout: 10_000 }); }
    catch (error) { assert.equal(error.code, 1, error.stderr); return error; }
  };
  await invoke("run");
  let summary = JSON.parse(await readFile(path.join(output, "summary.json"), "utf8"));
  assert.equal(summary.cases[0].phase, "admission-blocked");
  assert.equal(summary.pendingCount, 1); assert.equal(summary.failedCount, 0);
  assert.equal(summary.cases[1].phase, "not-started");
  assert.equal(await readFile(ownerPath, "utf8"), ownerBytes);
  assert.equal(await readFile(calls, "utf8"), "");
  if (obstruction === "busy-lock") await rm(lockDirectory, { recursive: true });
  await writeFile(ownerPath, JSON.stringify({ runId: "previous-run", requestId: "previous-request", jobId: "gen_b456", phase: "failed", providerStatus: "failed", hasSubmissionIntent: true }));
  const plan = JSON.parse(await readFile(path.join(output, "evaluation-plan.json"), "utf8"));
  await writeFile(path.join(output, "case-0/submission-intent.json"), JSON.stringify({ requestId: plan.cases[0].requestId, payloadHash: plan.cases[0].payloadHash }));
  await invoke("resume", ["--case-id", "case-0"]);
  summary = JSON.parse(await readFile(path.join(output, "summary.json"), "utf8"));
  assert.equal(summary.cases[0].phase, "remote-pending");
  assert.equal(summary.cases[0].jobId, "gen_a123");
  assert.equal(await readFile(calls, "utf8"), "lookup\nconfig\n");
  await invoke("run", ["--case-id", "case-0"]);
  assert.equal(await readFile(calls, "utf8"), "lookup\nconfig\nconfig\n");
  await writeFile(path.join(output, "case-2/state.json"), JSON.stringify({ phase: "delivered" }));
  const completedSelection = await invoke("run", ["--case-id", "case-2"]);
  assert.equal(completedSelection.code, undefined, "a completed selected case must exit zero despite another pending case");
  summary = JSON.parse(await readFile(path.join(output, "summary.json"), "utf8"));
  assert.equal(summary.pendingCount, 1); assert.equal(summary.deliveredCount, 1);
  assert.equal(await readFile(calls, "utf8"), "lookup\nconfig\nconfig\n");
});
