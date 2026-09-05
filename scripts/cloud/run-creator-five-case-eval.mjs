#!/usr/bin/env node
import { mkdir, readFile, writeFile, stat, rmdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadS3FileAtomic, fetchGenerationItems, findGenerationJobByRequestId, lwdpRequest, pollGenerationJob, submitCodexGenerationJob, submittedJobId, uploadS3File } from "../lib/lwdp-generation-client.mjs";
import { fileSha256, readRuntimeLock, resolveCreatorSubmission, sha256, writeJson } from "./creator-eval-runtime.mjs";
import { eventStatistics, failureClass, validateDeliveryEvidence } from "./creator-eval-statistics.mjs";
import { recoverFailedCreatorDiagnostics } from "./creator-eval-diagnostics.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  const key = args[index];
  if (!["--mode", "--manifest", "--runtime-lock", "--run-id", "--output-root", "--max-concurrency", "--account-concurrency", "--case-limit", "--case-id", "--output-s3-root"].includes(key) || !args[index + 1] || options[key] !== undefined) throw new Error(`Invalid argument: ${key}`);
  options[key] = args[index + 1];
}
const mode = options["--mode"] ?? "prepare";
if (!["prepare", "run", "resume", "stats"].includes(mode)) throw new Error("--mode must be prepare, run, resume, or stats");
const manifestPath = path.resolve(options["--manifest"] ?? path.join(repo, ".codex-tmp/gpt6-five-case-eval/selected-cases.json"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.cases?.length !== 5 || new Set(manifest.cases.map(item => item.id)).size !== 5) throw new Error("Five unique fixed cases are required.");
const runId = options["--run-id"] ?? manifest.id;
if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(runId)) throw new Error("Invalid --run-id");
const outputRoot = path.resolve(options["--output-root"] ?? path.join(repo, ".codex-tmp/gpt6-five-case-eval/runs", runId));
await mkdir(outputRoot, {recursive: true});
const maxConcurrency = Number(options["--max-concurrency"] ?? 2);
if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 4) throw new Error("--max-concurrency must be an integer in [1, 4]");
const accountConcurrency = Number(options["--account-concurrency"] ?? 1);
if (!Number.isSafeInteger(accountConcurrency) || accountConcurrency < 1 || accountConcurrency > 4) throw new Error("--account-concurrency must be an integer in [1, 4]");
const caseLimit = Number(options["--case-limit"] ?? 5);
if (!Number.isSafeInteger(caseLimit) || caseLimit < 1 || caseLimit > 5) throw new Error("--case-limit must be an integer in [1, 5]");
const requestedCaseId = options["--case-id"];
if (requestedCaseId && !manifest.cases.some(item => item.id === requestedCaseId)) throw new Error("--case-id must identify one of the five frozen cases");
if (requestedCaseId && options["--case-limit"]) throw new Error("Use either --case-id or --case-limit");
const outputs = [
  {path: "creator-result.json", required: true, content_type: "application/json"},
  {path: "creator-delivery.tar.gz", required: true, content_type: "application/gzip"},
  {path: "creator-events.jsonl", required: true, content_type: "application/x-ndjson"},
  {path: "creator-launcher-report.json", required: true, content_type: "application/json"},
  {path: "creator-stderr.log", required: false, content_type: "text/plain"},
  {path: "creator-mcp-stderr.log", required: false, content_type: "text/plain"},
];
const statePath = caseId => path.join(outputRoot, caseId, "state.json");
async function optionalJson(file) { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
async function saveSummary() {
  const cases = await Promise.all(manifest.cases.map(async item => ({id: item.id, title: item.title, ...(await optionalJson(statePath(item.id)) ?? {phase: "not-started"})})));
  const summary = {schemaVersion: 1, kind: "experimental-creator-five-case-evaluation", runId, updatedAt: new Date().toISOString(), model: "gpt-6-astra", reasoningEffort: "xhigh", caseCount: 5,
    deliveredCount: cases.filter(item => item.phase === "delivered").length, failedCount: cases.filter(item => item.phase === "failed").length, pendingCount: cases.filter(item => ["submitted", "running", "remote-pending", "delivery-pending", "submission-unknown", "admission-blocked"].includes(item.phase)).length,
    qualification: "Pipeline and artifact evidence only; independent visual review and playable-world checks are reported separately.", cases};
  await writeJson(path.join(outputRoot, "summary.json"), summary);
  return summary;
}
if (mode === "stats") { const summary = await saveSummary(); console.log(JSON.stringify({summary: path.join(outputRoot, "summary.json"), delivered: summary.deliveredCount, failed: summary.failedCount, pending: summary.pendingCount})); process.exit(0); }
const lockPath = path.resolve(options["--runtime-lock"] ?? path.join(repo, ".codex-tmp/gpt6-five-case-eval/runtime-lock.json"));
const lock = await readRuntimeLock(lockPath, {requireReady: mode !== "prepare"});
if (typeof lock.launcherPath !== "string" || !/^\/fsx\/pipeline\/worldkit-creator-experiments\/.+\/creator-eval-launcher\.mjs$/.test(lock.launcherPath)) throw new Error("runtime-lock.launcherPath must identify the isolated cloud launcher.");
const s3Root = (options["--output-s3-root"] ?? "s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk/gpt6-creator/five-case-eval").replace(/\/$/, "");
if (!s3Root.startsWith("s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk/")) throw new Error("Evaluation S3 prefix must stay within the project's artifact root.");
const commonInstructions = await readFile(path.join(repo, "scripts/cloud/creator-eval-instructions.md"), "utf8");
const plans = [];
for (const item of manifest.cases) {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(item.id)) throw new Error("Invalid case id");
  const imagePath = path.resolve(item.referenceImage.path);
  const promptPath = path.resolve(item.effectiveUserPromptFile.path);
  for (const file of [imagePath, promptPath]) if (!file.startsWith(`${repo}${path.sep}`)) throw new Error("Use copied inputs in this checkout only.");
  if (await fileSha256(imagePath) !== item.referenceImage.contentSha256 || await fileSha256(promptPath) !== item.effectiveUserPromptFile.contentSha256) throw new Error(`Frozen input hash mismatch: ${item.id}`);
  const effectivePrompt = (await readFile(promptPath, "utf8")).trimEnd();
  if (effectivePrompt !== item.effectiveUserPrompt.trimEnd()) throw new Error(`Effective prompt mismatch: ${item.id}`);
  const caseInput = {schemaVersion: 1, caseId: item.id, title: item.title, sourceTestSetId: item.sourceTestSetId, sourceCaseId: item.sourceCaseId, referenceImageSha256: item.referenceImage.contentSha256, effectivePromptSha256: item.effectiveUserPromptFile.contentSha256, creatorInstructionsSha256: sha256(commonInstructions), sourceUserPrompt: item.sourceUserPrompt, effectiveUserPrompt: effectivePrompt, expectedSubjectCategory: item.expectedSubjectCategory, acceptanceFocus: item.acceptanceFocus, runtimeHash: lock.runtimeHash, model: "gpt-6-astra", reasoningEffort: "xhigh"};
  const caseHash = sha256(JSON.stringify(caseInput));
  const requestId = `wk6-${sha256(`${runId}:${caseHash}`).slice(0, 16)}-${item.id}-a1`;
  const outputS3Prefix = `${s3Root}/${runId}/${item.id}/${caseHash.slice(0, 16)}`;
  const caseRoot = path.join(outputRoot, item.id); await mkdir(caseRoot, {recursive: true});
  const inputFile = path.join(caseRoot, "case-input.json");
  const inputS3Uri = `${outputS3Prefix}/inputs/case-input.json`;
  const imageS3Uri = `${outputS3Prefix}/inputs/reference-${item.referenceImage.contentSha256}.png`;
  const instruction = `${commonInstructions}\n\nCase ID: ${item.id}. Set scene.json id to this exact ID.\n\nUser requirements:\n${effectivePrompt}\n\nHost acceptance focus:\n${item.acceptanceFocus.join("\n")}\n\nThe attached case-input.json records immutable source and runtime identity. The original reference image is attached directly.\n`;
  const payload = {job_name: `GPT-6 Native Creator · ${item.title}`, request_id: requestId, output_s3_prefix: outputS3Prefix, defaults: {model: "gpt-6-astra", reasoning_effort: "xhigh", sandbox: "workspace-write", timeout_seconds: lock.maximumTaskSeconds + 120, account_concurrency: accountConcurrency, pod_concurrency: 1}, options: {codex_bin: lock.launcherPath}, tasks: [{id: item.id, instruction, assets: [{id: "reference", name: "reference.png", s3_uri: imageS3Uri, media_type: "image/png", attach_as: "image"}, {id: "case-input", name: "case-input.json", s3_uri: inputS3Uri, media_type: "application/json", attach_as: "file"}], outputs}]};
  const plan = {item, caseRoot, imagePath, inputFile, imageS3Uri, inputS3Uri, payload, payloadHash: sha256(JSON.stringify(payload)), caseHash, requestId, outputS3Prefix};
  const intent = await optionalJson(path.join(caseRoot, "submission-intent.json"));
  if (intent && intent.payloadHash !== plan.payloadHash) throw new Error(`Submission payload changed for ${item.id}; use a deliberate new run ID.`);
  await writeJson(inputFile, caseInput);
  await writeJson(path.join(caseRoot, "payload.json"), payload); plans.push(plan);
}
await writeJson(path.join(outputRoot, "evaluation-plan.json"), {schemaVersion: 1, runId, runtimeHash: lock.runtimeHash, launcherPath: lock.launcherPath, maxConcurrency, manifestPath, cases: plans.map(plan => ({caseId: plan.item.id, caseHash: plan.caseHash, requestId: plan.requestId, payloadHash: plan.payloadHash, outputS3Prefix: plan.outputS3Prefix}))});
if (mode === "prepare") { console.log(`CREATOR_EVAL_PREPARED ${outputRoot} cases=5 cloudSubmissions=0`); process.exit(0); }
// Force the existing S3 client to use this checkout's closed credential files.
for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN", "AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_ROLE_ARN", "AWS_PROFILE", "AWS_DEFAULT_PROFILE"]) delete process.env[key];
process.env.AWS_SHARED_CREDENTIALS_FILE = path.join(repo, ".codex-tmp/runtime-config/aws-credentials");
process.env.AWS_CONFIG_FILE = path.join(repo, ".codex-tmp/runtime-config/aws-config");
process.env.AWS_EC2_METADATA_DISABLED = "true";
await stat(process.env.AWS_SHARED_CREDENTIALS_FILE); await stat(process.env.AWS_CONFIG_FILE);
let stopAdmission = false;
const admissionRoot = path.join(repo, ".codex-tmp/gpt6-five-case-eval/admissions");
const isTerminalStatus = status => ["succeeded", "completed", "failed", "submit_failed", "cancelled", "stopped"].includes(status);
async function withAdmissionLock(caseId, work) {
  await mkdir(admissionRoot, {recursive: true});
  const directory = path.join(admissionRoot, `${caseId}.lock`);
  try { await mkdir(directory); } catch (error) { if (error.code === "EEXIST") throw new Error(`CREATOR_CASE_ADMISSION_BUSY: ${caseId}; another local coordinator owns the admission lock`); throw error; }
  try { return await work(path.join(admissionRoot, `${caseId}.json`)); } finally { await rmdir(directory); }
}
function admissionIsClosed(record) {
  return ["delivered", "failed"].includes(record.phase) && (isTerminalStatus(record.providerStatus) || (!record.jobId && record.hasSubmissionIntent === false) || record.submissionRejected === true);
}
async function reserveCase(plan, state) {
  await withAdmissionLock(plan.item.id, async file => {
    const existing = await optionalJson(file);
    if (existing && existing.requestId !== plan.requestId && !admissionIsClosed(existing)) throw new Error(`CREATOR_CASE_ALREADY_ACTIVE: ${plan.item.id} belongs to run ${existing.runId}, request ${existing.requestId}, job ${existing.jobId ?? "unresolved"}; resume that request before creating another run`);
    const retryOf = existing && existing.requestId !== plan.requestId ? {runId: existing.runId, requestId: existing.requestId, jobId: existing.jobId ?? null, providerStatus: existing.providerStatus ?? null} : existing?.retryOf;
    state.retryOf = retryOf;
    await writeJson(file, {...existing, runId, requestId: plan.requestId, caseId: plan.item.id, phase: state.phase ?? "reserved", jobId: state.jobId ?? null, providerStatus: state.providerStatus ?? null, hasSubmissionIntent: Boolean(await optionalJson(path.join(plan.caseRoot, "submission-intent.json"))), outputRoot, retryOf, updatedAt: new Date().toISOString()});
  });
}
async function execute(plan) {
  const previous = await optionalJson(statePath(plan.item.id));
  if (["delivered", "failed"].includes(previous?.phase)) return;
  const state = {...previous, caseId: plan.item.id, sourceTestSetId: plan.item.sourceTestSetId, sourceCaseId: plan.item.sourceCaseId, caseHash: plan.caseHash, runtimeHash: lock.runtimeHash, model: "gpt-6-astra", reasoningEffort: "xhigh", requestId: plan.requestId, outputS3Prefix: plan.outputS3Prefix};
  let admissionReserved = false;
  const save = async () => {
    state.updatedAt = new Date().toISOString(); await writeJson(statePath(plan.item.id), state);
    if (admissionReserved) await withAdmissionLock(plan.item.id, async file => {
      const existing = await optionalJson(file);
      if (existing?.requestId !== plan.requestId) throw new Error("CREATOR_CASE_ADMISSION_OWNER_CHANGED");
      await writeJson(file, {...existing, phase: state.phase, jobId: state.jobId ?? null, providerStatus: state.providerStatus ?? null, submissionRejected: state.submissionRejected ?? false, hasSubmissionIntent: Boolean(await optionalJson(path.join(plan.caseRoot, "submission-intent.json"))), updatedAt: state.updatedAt});
    });
  };
  try {
    const intentFile = path.join(plan.caseRoot, "submission-intent.json");
    const intent = await optionalJson(intentFile);
    if (mode === "resume" && !state.jobId && !intent) { state.phase = "not-started"; await save(); return; }
    await reserveCase(plan, state); admissionReserved = true;
    if (!state.jobId) {
      state.jobId = await resolveCreatorSubmission({existingJobId: state.jobId, hasDurableIntent: Boolean(intent), mode,
        findExisting: async () => submittedJobId(await findGenerationJobByRequestId(plan.requestId)),
        createIntentAndSubmit: async () => {
          await uploadS3File(plan.imagePath, plan.imageS3Uri); await uploadS3File(plan.inputFile, plan.inputS3Uri);
          await writeFile(intentFile, JSON.stringify({requestId: plan.requestId, payloadHash: plan.payloadHash, createdAt: new Date().toISOString()}, null, 2) + "\n", {flag: "wx"});
          state.phase = "submission-unknown"; await save();
          return submittedJobId(await submitCodexGenerationJob(plan.payload));
        }});
      if (!state.jobId) { state.phase = "not-started"; await save(); return; }
      state.phase = "submitted"; await save();
      console.log(`CREATOR_EVAL_JOB ${plan.item.id} ${state.jobId} requestId=${plan.requestId}`);
    }
    const echo = await lwdpRequest(`/api/v1/generation/jobs/${state.jobId}/config`);
    await writeJson(path.join(plan.caseRoot, "config-echo.json"), echo);
    if (echo.config?.request_id !== plan.requestId || echo.config?.options?.codex_bin !== lock.launcherPath || echo.config?.options?.model !== "gpt-6-astra") throw new Error("CREATOR_EFFECTIVE_CONFIG_MISMATCH");
    const job = await pollGenerationJob(state.jobId, {timeoutMs: (lock.maximumTaskSeconds + 1800) * 1000, onProgress: current => { console.log(`CREATOR_EVAL_PROGRESS ${plan.item.id} ${current.status} ${JSON.stringify(current.counters ?? {})}`); }});
    state.providerStatus = job.status; state.timing = job.timing; state.apiBuildCommit = job.build_commit;
    await writeJson(path.join(plan.caseRoot, "job-final.json"), job);
    const items = await fetchGenerationItems(state.jobId); await writeJson(path.join(plan.caseRoot, "items.json"), items);
    const item = (items.items ?? items.data ?? []).find(row => (row.item_id ?? row.id) === plan.item.id);
    state.itemStatus = item?.status; state.phase = "delivery-pending"; await save();
    const downloadStarted = Date.now(); const downloadFailures = [];
    const downloads = [...outputs.map(output => ({remote: `tasks/${plan.item.id}/${output.path}`, name: output.path, required: output.required})), {remote: `tasks/${plan.item.id}/logs/codex_attempt.json`, name: "codex-attempt.json", required: false}, {remote: "reports/codex_delivery_report.json", name: "provider-delivery-report.json", required: false}];
    state.artifacts = {};
    for (const output of downloads) {
      try { const target = path.join(plan.caseRoot, output.name); await downloadS3FileAtomic(`${plan.outputS3Prefix}/${output.remote}`, target); state.artifacts[output.name] = {bytes: (await stat(target)).size, sha256: await fileSha256(target)}; }
      catch (error) { downloadFailures.push({name: output.name, required: output.required, error: error.message}); }
    }
    state.deliverySeconds = (Date.now() - downloadStarted) / 1000;
    state.downloadFailures = downloadFailures;
    if (job.status !== "succeeded" || item?.status !== "succeeded") {
      try {
        state.diagnosticsRecovery = await recoverFailedCreatorDiagnostics({jobId: state.jobId, caseId: plan.item.id, workDirectory: echo.config.options.work_dir, localCaseRoot: plan.caseRoot, outputS3Prefix: plan.outputS3Prefix});
        for (const [name, recovered] of Object.entries(state.diagnosticsRecovery.files)) state.artifacts[name] = {bytes: recovered.bytes, sha256: recovered.sha256, source: "trusted-host-fsx-recovery"};
      } catch (error) { state.diagnosticsRecoveryError = error.message; }
    }
    state.toolEvidence = await eventStatistics(path.join(plan.caseRoot, "creator-events.jsonl"));
    const launcher = await optionalJson(path.join(plan.caseRoot, "creator-launcher-report.json"));
    const result = await optionalJson(path.join(plan.caseRoot, "creator-result.json"));
    state.launcherStatus = launcher?.status;
    state.playtest = result?.playtest;
    state.sourceHash = result?.sourceHash;
    if (job.status !== "succeeded" || item?.status !== "succeeded") throw new Error(item?.error || job.error || `Provider did not succeed: ${job.status}/${item?.status}`);
    if (downloadFailures.some(output => output.required)) { state.phase = "delivery-pending"; state.failure = {category: "delivery", message: "Required artifacts were not all downloaded; resume the same job."}; await save(); return; }
    if (launcher?.status !== "delivered") throw new Error("CREATOR_DELIVERY_OR_EVENT_IDENTITY_FAILED");
    state.submitReceipt = validateDeliveryEvidence({result, launcherReport: launcher, events: state.toolEvidence, eventsSha256: state.artifacts["creator-events.jsonl"].sha256, artifacts: state.artifacts, expectedRuntimeHash: lock.runtimeHash, expectedSceneId: plan.item.id, expectedWorkspace: path.join(echo.config.options.work_dir, "tasks", plan.item.id)});
    state.phase = "delivered"; delete state.failure; await save();
  } catch (error) {
    if (/^CREATOR_CASE_(?:ALREADY_ACTIVE|ADMISSION_BUSY)(?::|$)/.test(error.message)) {
      // A competing coordinator/unknown request is still the admission owner.
      // Persist only this run's recoverable state, never rewrite that owner.
      admissionReserved = false;
      state.phase = "admission-blocked";
      state.failure = {category: "admission", message: error.message};
      stopAdmission = true;
      await save();
      console.log(`CREATOR_EVAL_PENDING ${plan.item.id} admission`);
      return;
    }
    const terminal = isTerminalStatus(state.providerStatus);
    const rejected = !state.jobId && [400, 401, 403, 422].includes(error.status);
    if (rejected) state.submissionRejected = true;
    const unresolved = !rejected && (error.code === "LWDP_JOB_PENDING" || (state.jobId && !terminal) || (!state.jobId && await optionalJson(path.join(plan.caseRoot, "submission-intent.json"))));
    const pendingDelivery = terminal && failureClass(error.message) === "transport";
    state.phase = unresolved ? (state.jobId ? "remote-pending" : "submission-unknown") : pendingDelivery ? "delivery-pending" : "failed";
    state.failure = {category: unresolved ? "unresolved-submission-or-execution" : pendingDelivery ? "delivery" : failureClass(error.message), message: error.message};
    if (unresolved) stopAdmission = true;
    await save(); console.log(`CREATOR_EVAL_${unresolved || pendingDelivery ? "PENDING" : "FAILED"} ${plan.item.id} ${state.failure.category}`);
  }
}
let index = 0;
const executionPlans = requestedCaseId ? plans.filter(plan => plan.item.id === requestedCaseId) : plans.slice(0, caseLimit);
await Promise.all(Array.from({length: Math.min(maxConcurrency, executionPlans.length)}, async () => { while (index < executionPlans.length && !stopAdmission) { const plan = executionPlans[index++]; await execute(plan); } }));
const summary = await saveSummary();
console.log(`CREATOR_EVAL_SUMMARY delivered=${summary.deliveredCount} failed=${summary.failedCount} pending=${summary.pendingCount} ${path.join(outputRoot, "summary.json")}`);
if (summary.cases.filter(item => executionPlans.some(plan => plan.item.id === item.id)).some(item => item.phase !== "delivered")) process.exitCode = 1;
