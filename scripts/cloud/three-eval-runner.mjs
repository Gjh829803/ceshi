#!/usr/bin/env node
import { mkdir, readFile, writeFile, stat, rmdir, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadS3FileAtomic, fetchGenerationItems, findGenerationJobByRequestId, lwdpRequest, loadLwdpGenerationConfig, pollGenerationJob, submitCodexGenerationJob, submittedJobId, uploadS3File } from "../lib/lwdp-generation-client.mjs";
import { fileSha256, readRuntimeLock, resolveCreatorSubmission, sha256, writeJson } from "./three-eval-runtime.mjs";
import { eventStatistics, failureClass, validateDeliveryEvidence } from "./three-eval-statistics.mjs";
import { recoverFailedCreatorDiagnostics } from "./creator-eval-diagnostics.mjs";
import { creativePromptFromSource, terminalJobHasStopped, assessOwnedJob, effectiveConfigMatches, reportedTokenUsage, MAXIMUM_QUEUE_SECONDS, STOP_DRAIN_SECONDS } from "./three-eval-policy.mjs";
import { withAdmissionDirectoryLock, admissionIsClosed } from "./three-eval-admission.mjs";
import { stopOwnedThreeJob } from "./three-eval-stop.mjs";
import { readThreeLiveStatus } from "./three-eval-live.mjs";
import {THREE_CHECKPOINT_OUTPUTS, THREE_PROGRESS_OUTPUTS, retrieveThreeProgress, installThreeProgress, retrieveThreeDeliveryArtifacts, retrieveThreeCheckpoint, installThreeCheckpoint, refreshTerminalThreeCheckpoint} from './three-eval-checkpoints.mjs';

import {MAXIMUM_MODEL_ATTEMPTS, recoveryDecision, assertContinuationParent, prepareContinuationAssets, continuationLineage, continuationLocation, registerContinuationRun, runRecoveryCoordinator} from './three-eval-recovery.mjs';
import {discoverThreeAttemptRuns} from './three-eval-recovery-index.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  const key = args[index];
  if (!["--mode", "--manifest", "--runtime-lock", "--run-id", "--output-root", "--max-concurrency", "--account-concurrency", "--case-limit", "--case-id", "--profile", "--suite", "--experiment-revision", "--output-s3-root", "--continue-from", "--auto-continue"].includes(key) || !args[index + 1] || options[key] !== undefined) throw new Error(`Invalid argument: ${key}`);
  options[key] = args[index + 1];
}
const mode = options["--mode"] ?? "prepare";
if (!["prepare", "run", "resume", "continue", "stats"].includes(mode)) throw new Error("--mode must be prepare, run, resume, continue, or stats");
const runId = options["--run-id"];
if (!runId) throw new Error("Choose an explicit Three experiment --run-id");
if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(runId)) throw new Error("Invalid --run-id");
const outputRoot = path.resolve(options["--output-root"] ?? path.join(repo, ".codex-tmp/three-creator-eval/runs", runId));
await mkdir(outputRoot, {recursive: true});
const previousPlan = await optionalJson(path.join(outputRoot, "evaluation-plan.json"));
const continueFromRoot = options["--continue-from"] ? path.resolve(options["--continue-from"]) : previousPlan?.continuationFromRunRoot ?? null;
if (previousPlan && (previousPlan.continuationFromRunRoot ?? null) !== continueFromRoot) throw new Error("THREE_RECOVERY_PARENT_CHANGED");
if (continueFromRoot && (await realpath(continueFromRoot) !== continueFromRoot || continueFromRoot === outputRoot)) throw new Error("THREE_RECOVERY_PARENT_PATH_INVALID");
const parentPlan = continueFromRoot ? await optionalJson(path.join(continueFromRoot, "evaluation-plan.json")) : null;
if (continueFromRoot && !parentPlan) throw new Error("THREE_RECOVERY_PARENT_PLAN_MISSING");
if (options["--auto-continue"] && !["true", "false"].includes(options["--auto-continue"])) throw new Error("--auto-continue must be true or false");
const recoveryPolicy = previousPlan?.recoveryPolicy ?? {automaticContinuation: !previousPlan && options["--auto-continue"] !== "false", maximumModelAttempts: MAXIMUM_MODEL_ATTEMPTS};
if (options["--auto-continue"] && recoveryPolicy.automaticContinuation !== (options["--auto-continue"] === "true")) throw new Error("Frozen recovery policy changed");
const selectedManifest = options["--manifest"] ?? previousPlan?.manifestPath ?? parentPlan?.manifestPath;
if (!selectedManifest) throw new Error("A new run requires an explicit --manifest; resume uses its saved plan manifest.");
const manifestPath = path.resolve(selectedManifest);
if (previousPlan?.manifestPath && path.resolve(previousPlan.manifestPath) !== manifestPath) throw new Error("Case manifest changed; use a deliberate new run ID.");
const manifestBytes = await readFile(manifestPath), manifestSha256 = sha256(manifestBytes);
if (previousPlan?.manifestSha256 && previousPlan.manifestSha256 !== manifestSha256) throw new Error("Frozen case manifest bytes changed.");
const sourceManifest = JSON.parse(manifestBytes);
if (sourceManifest.cases?.length !== 5 || new Set(sourceManifest.cases.map(item => item.id)).size !== 5) throw new Error("Five unique fixed cases are required.");
const previousSuite = previousPlan && (previousPlan.suite ?? "paired");
const suite = options["--suite"] ?? previousSuite ?? "sdk-only";
if (!["sdk-only", "paired"].includes(suite)) throw new Error("--suite must be sdk-only or paired");
if (previousSuite && previousSuite !== suite) throw new Error("Experiment suite changed; use a deliberate new run ID.");
const experimentRevision = options["--experiment-revision"] ?? previousPlan?.experimentRevision ?? (suite === "sdk-only" ? "three-sdk-v2" : "three-paired-v1");
if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(experimentRevision)) throw new Error("Invalid --experiment-revision");
if (previousPlan?.experimentRevision && previousPlan.experimentRevision !== experimentRevision) throw new Error("Experiment revision changed; use a deliberate new run ID.");
const profiles = suite === "sdk-only" ? ["three-sdk"] : ["three-raw", "three-sdk"];
const manifest = {...sourceManifest, cases: sourceManifest.cases.flatMap(item => profiles.map(profile => ({...item, baseCaseId: item.id, profile, id: `${item.id}--${profile}`})))};
const maxConcurrency = Number(options["--max-concurrency"] ?? previousPlan?.maxConcurrency ?? (suite === "sdk-only" ? 5 : 4));
if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 5) throw new Error("--max-concurrency must be an integer in [1, 5]");
const accountConcurrency = Number(options["--account-concurrency"] ?? previousPlan?.accountConcurrency ?? (suite === "sdk-only" ? 5 : 4));
if (previousPlan && accountConcurrency !== previousPlan.accountConcurrency) throw new Error("Submitted account concurrency is frozen; scheduler concurrency may change independently.");
if (!Number.isSafeInteger(accountConcurrency) || accountConcurrency < 1 || accountConcurrency > 5) throw new Error("--account-concurrency must be an integer in [1, 5]");
const caseLimit = Number(options["--case-limit"] ?? sourceManifest.cases.length);
if (!Number.isSafeInteger(caseLimit) || caseLimit < 1 || caseLimit > sourceManifest.cases.length) throw new Error("--case-limit must be within the frozen selection size");
const requestedCaseId = options["--case-id"] ?? (options["--case-limit"] || suite === "sdk-only" ? undefined : "gpt6-eval-forest-lookout");
const requestedProfile = options["--profile"];
if (requestedProfile && !profiles.includes(requestedProfile)) throw new Error("--profile must belong to the selected suite; sdk-only admits only three-sdk");
if (requestedCaseId && !sourceManifest.cases.some(item => item.id === requestedCaseId)) throw new Error("--case-id must identify one of the frozen cases");
if (requestedCaseId && options["--case-limit"]) throw new Error("Use either --case-id or --case-limit");
const outputs = [
  ...THREE_CHECKPOINT_OUTPUTS,
  ...THREE_PROGRESS_OUTPUTS,
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
  let cases = await Promise.all(manifest.cases.map(async item => ({id: item.id, baseCaseId: item.baseCaseId, profile: item.profile, title: item.title, ...(await optionalJson(statePath(item.id)) ?? {phase: "not-started"})})));
  if (await optionalJson(path.join(outputRoot, "evaluation-plan.json"))) {
    const linked = await discoverThreeAttemptRuns({runRoot: outputRoot});
    for (const child of linked.slice(1)) for (const taskId of child.plan.selectedTaskIds) {
      const state = await optionalJson(path.join(child.root, taskId, "state.json"));
      if (state) cases = cases.map(row => row.id === taskId ? {...row, ...state, currentRunId: child.plan.runId} : row);
    }
  }
  const summary = {schemaVersion: 1, kind: suite === "sdk-only" ? "three-creator-sdk-evaluation" : "three-creator-paired-evaluation", suite, experimentRevision, engine: "three@0.185.1", runId, updatedAt: new Date().toISOString(), model: "gpt-6-astra", reasoningEffort: "xhigh", caseCount: sourceManifest.cases.length, profileCount: profiles.length, taskCount: manifest.cases.length,
    deliveredCount: cases.filter(item => item.phase === "delivered").length, failedCount: cases.filter(item => item.phase === "failed").length, pendingCount: cases.filter(item => ["submitted", "running", "remote-pending", "delivery-pending", "submission-unknown", "admission-blocked", "stop-pending"].includes(item.phase)).length,
    qualification: "Pipeline and artifact evidence only; independent visual review and playable-world checks are reported separately.", cases};
  await writeJson(path.join(outputRoot, "summary.json"), summary);
  return summary;
}
if (mode === "stats") { const summary = await saveSummary(); console.log(JSON.stringify({summary: path.join(outputRoot, "summary.json"), delivered: summary.deliveredCount, failed: summary.failedCount, pending: summary.pendingCount})); process.exit(0); }
const lockPath = path.resolve(options["--runtime-lock"] ?? previousPlan?.runtimeLockPath ?? parentPlan?.runtimeLockPath ?? path.join(repo, ".codex-tmp/three-creator-eval/runtime-lock.json"));
const lock = await readRuntimeLock(lockPath, {requireReady: mode !== "prepare"});
if (previousPlan && previousPlan.runtimeHash !== lock.runtimeHash) throw new Error("Frozen runtime changed; resume with the original run lock");
const frozenRuntimeLockPath = path.join(outputRoot,"runtime-lock.json");
if (path.resolve(lockPath) !== frozenRuntimeLockPath) {
  const bytes = await readFile(lockPath);
  try { await writeFile(frozenRuntimeLockPath,bytes,{flag:"wx"}); }
  catch(error) { if(error.code!=="EEXIST" || await fileSha256(frozenRuntimeLockPath)!==lock.runtimeHash) throw error; }
}
if (typeof lock.launcherPath !== "string" || !/^\/fsx\/pipeline\/worldkit-three-creator-experiments\/.+\/three-eval-launcher\.mjs$/.test(lock.launcherPath)) throw new Error("runtime-lock.launcherPath must identify the isolated cloud launcher.");
const s3Root = (options["--output-s3-root"] ?? previousPlan?.outputS3Root ?? `s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk/three-creator/${suite === "sdk-only" ? "sdk-eval" : "paired-eval"}`).replace(/\/$/, "");
if (!s3Root.startsWith("s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk/three-creator/")) throw new Error("Evaluation S3 prefix must stay within the project's Three artifact root.");
const commonInstructions = await readFile(path.join(repo, "scripts/cloud/three-eval-instructions.md"), "utf8");
if (!previousPlan && !continueFromRoot && sourceManifest.genericInstructionsSha256 && sourceManifest.genericInstructionsSha256 !== sha256(commonInstructions)) throw new Error("Frozen generic instructions hash mismatch.");
const evaluationPolicyPath = sourceManifest.evaluationPolicyPath ? path.resolve(repo, sourceManifest.evaluationPolicyPath) : null;
if (evaluationPolicyPath && !evaluationPolicyPath.startsWith(`${repo}${path.sep}`)) throw new Error("Host evaluation policy must stay in this checkout.");
const acceptancePolicy = evaluationPolicyPath ? {scope: "host-only", documents: [{path: path.relative(repo, evaluationPolicyPath), sha256: await fileSha256(evaluationPolicyPath)}]} : null;
const plans = [];
for (const item of manifest.cases) {
  if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(item.id)) throw new Error("Invalid case id");
  const imagePath = path.resolve(item.referenceImage.path);
  const promptPath = path.resolve(item.effectiveUserPromptFile.path);
  for (const file of [imagePath, promptPath]) if (!file.startsWith(`${repo}${path.sep}`)) throw new Error("Use copied inputs in this checkout only.");
  if (await fileSha256(imagePath) !== item.referenceImage.contentSha256 || await fileSha256(promptPath) !== item.effectiveUserPromptFile.contentSha256) throw new Error(`Frozen input hash mismatch: ${item.id}`);
  const originalEffectivePrompt = (await readFile(promptPath, "utf8")).trimEnd();
  const effectivePrompt = creativePromptFromSource(originalEffectivePrompt);
  if (originalEffectivePrompt !== item.effectiveUserPrompt.trimEnd()) throw new Error(`Effective prompt mismatch: ${item.id}`);
  let caseInput = {schemaVersion: 1, kind: "three-creator-case-input", caseId: item.baseCaseId, taskId: item.id, profile: item.profile, engine: "three@0.185.1", sourceTestSetId: item.sourceTestSetId, sourceCaseId: item.sourceCaseId, referenceImageSha256: item.referenceImage.contentSha256, sourceEffectivePromptSha256: item.effectiveUserPromptFile.contentSha256, effectivePromptSha256: sha256(effectivePrompt), creatorInstructionsSha256: sha256(commonInstructions), sourceUserPromptSha256: sha256(item.sourceUserPrompt ?? ""), supersededSourcePolicyStoredInManifest: true, effectiveUserPrompt: effectivePrompt, runtimeHash: lock.runtimeHash, model: "gpt-6-astra", reasoningEffort: "xhigh", ...(suite === "sdk-only" ? {experimentRevision} : {})};
  const previousCasePlan = previousPlan?.cases?.find(row => row.taskId === item.id);
  if (previousCasePlan || continueFromRoot) {
    caseInput = await optionalJson(path.join(previousCasePlan ? outputRoot : continueFromRoot, item.id, "case-input.json"));
    if (!caseInput || caseInput.runtimeHash !== lock.runtimeHash || caseInput.taskId !== item.id || caseInput.caseId !== item.baseCaseId || caseInput.referenceImageSha256 !== item.referenceImage.contentSha256) throw new Error("THREE_RECOVERY_INPUT_IDENTITY_MISMATCH");
  }
  const caseHash = sha256(JSON.stringify(caseInput));
  if (previousCasePlan && caseHash !== previousCasePlan.caseHash) throw new Error("Frozen case input changed");
  const requestId = `wk3-${sha256(`${runId}:${caseHash}`).slice(0, 16)}-${item.id}-a1`;
  const outputS3Prefix = `${s3Root}/${runId}/${item.id}/${caseHash.slice(0, 16)}`;
  const caseRoot = path.join(outputRoot, item.id); await mkdir(caseRoot, {recursive: true});
  const inputFile = path.join(caseRoot, "case-input.json");
  const inputS3Uri = `${outputS3Prefix}/inputs/case-input.json`;
  const imageS3Uri = `${outputS3Prefix}/inputs/reference-${item.referenceImage.contentSha256}.png`;
  let instruction = `${commonInstructions}\n\nCase ID: ${item.baseCaseId}. Task ID: ${item.id}. Profile: ${item.profile}. Read the selected MCP environment and examples for this profile.\n\nUser requirements:\n${effectivePrompt}\n\nThe attached case-input.json records immutable source and runtime identity. The original reference image is attached directly.\n`;
  if (continueFromRoot) {
    const parentPayload = await optionalJson(path.join(continueFromRoot, item.id, "payload.json"));
    const task = parentPlan.cases.find(row => row.taskId === item.id);
    if (!parentPayload || sha256(JSON.stringify(parentPayload)) !== task?.payloadHash || task.caseHash !== caseHash) throw new Error("THREE_RECOVERY_PARENT_PAYLOAD_CHANGED");
    instruction = parentPayload.tasks[0].instruction;
  }
  let payload = {job_name: `GPT-6 Three ${item.profile} · ${item.title}`, request_id: requestId, output_s3_prefix: outputS3Prefix, defaults: {model: "gpt-6-astra", reasoning_effort: "xhigh", sandbox: "workspace-write", timeout_seconds: lock.maximumTaskSeconds + 120, account_concurrency: accountConcurrency, pod_concurrency: 1}, options: {codex_bin: lock.launcherPath}, tasks: [{id: item.id, instruction, assets: [{id: "reference", name: "reference.png", s3_uri: imageS3Uri, media_type: "image/png", attach_as: "image"}, {id: "case-input", name: "case-input.json", s3_uri: inputS3Uri, media_type: "application/json", attach_as: "file"}], outputs}]};
  let continuation = null;
  if (continueFromRoot && item.baseCaseId === requestedCaseId && (!requestedProfile || item.profile === requestedProfile)) {
    if (!lock.launcherFilesSha256["three-eval-restore.mjs"]) throw new Error("THREE_RECOVERY_RUNTIME_UNSUPPORTED: source continuation requires a capsule with restoration support; do not silently change the original SDK");
    const location = continuationLocation(continueFromRoot,parentPlan.runId,item.id);
    if (outputRoot !== location.root || runId !== location.runId) throw new Error("THREE_RECOVERY_CHILD_LOCATION_INVALID");
    continuation = await prepareContinuationAssets({parentRoot:continueFromRoot,caseRoot,taskId:item.id,caseHash,lock});
    if (continuation.unavailable) throw new Error(`THREE_RECOVERY_SOURCE_UNAVAILABLE: ${continuation.reason}`);
    for (const file of continuation.files) payload.tasks[0].assets.push({id:path.basename(file).replaceAll('.', '-'),name:path.basename(file),s3_uri:`${outputS3Prefix}/inputs/${path.basename(file)}`,media_type:file.endsWith('.gz')?'application/gzip':'application/json',attach_as:'file'});
  }
  if (previousCasePlan) {
    payload = await optionalJson(path.join(caseRoot, "payload.json"));
    if (!payload || sha256(JSON.stringify(payload)) !== previousCasePlan.payloadHash || payload.request_id !== requestId || payload.output_s3_prefix !== outputS3Prefix) throw new Error("Frozen submission payload changed");
  }
  const plan = {item, continuation, caseRoot, imagePath, inputFile, imageS3Uri, inputS3Uri, payload, payloadHash: sha256(JSON.stringify(payload)), caseHash, requestId, outputS3Prefix};
  const intent = await optionalJson(path.join(caseRoot, "submission-intent.json"));
  if (intent && intent.payloadHash !== plan.payloadHash) throw new Error(`Submission payload changed for ${item.id}; use a deliberate new run ID.`);
  await writeJson(inputFile, caseInput);
  await writeJson(path.join(caseRoot, "payload.json"), payload);
  if (continuation && !await optionalJson(statePath(item.id))) await writeJson(statePath(item.id), {caseId:item.baseCaseId,taskId:item.id,profile:item.profile,caseHash,runtimeHash:lock.runtimeHash,requestId,outputS3Prefix,phase:"not-started",continuation:continuationLineage(continuation.manifest),createdAt:new Date().toISOString()});
  plans.push(plan);
}
if (continueFromRoot && !requestedCaseId) throw new Error("Artifact continuation selects one explicit --case-id; the parent coordinator runs failed cases concurrently");
const selectedBaseIds = requestedCaseId ? [requestedCaseId] : sourceManifest.cases.slice(0, caseLimit).map(item => item.id);
const executionPlans = previousPlan && !options["--case-id"] && !options["--case-limit"] && !options["--profile"]
  ? plans.filter(plan=>previousPlan.selectedTaskIds.includes(plan.item.id))
  : plans.filter(plan => selectedBaseIds.includes(plan.item.baseCaseId) && (!requestedProfile || plan.item.profile === requestedProfile));
await writeJson(path.join(outputRoot, "evaluation-plan.json"), {schemaVersion: 1, kind: suite === "sdk-only" ? "three-creator-sdk-plan" : "three-creator-paired-plan", suite, experimentRevision, recoveryPolicy, continuationFromRunRoot:continueFromRoot, runtimeLockPath:frozenRuntimeLockPath, acceptancePolicy, engine: "three@0.185.1", runId, runtimeHash: lock.runtimeHash, launcherPath: lock.launcherPath, maxConcurrency, accountConcurrency, outputS3Root: s3Root, safetyPolicy: {maximumQueueSeconds: MAXIMUM_QUEUE_SECONDS, maximumModelSeconds: lock.maximumTaskSeconds, maximumTotalWallSeconds: MAXIMUM_QUEUE_SECONDS + lock.maximumTaskSeconds + STOP_DRAIN_SECONDS, automaticResubmissions: recoveryPolicy.automaticContinuation ? 1 : 0, maximumCumulativeModelSeconds: lock.maximumTaskSeconds * MAXIMUM_MODEL_ATTEMPTS, monetaryAccounting: "Provider does not expose a per-job bill; wall time and raw token counters are recorded, not converted to invented charges."}, manifestPath, manifestSha256, selectedTaskIds: executionPlans.map(plan => plan.item.id), cases: plans.map(plan => ({caseId: plan.item.baseCaseId, taskId: plan.item.id, profile: plan.item.profile, caseHash: plan.caseHash, requestId: plan.requestId, payloadHash: plan.payloadHash, outputS3Prefix: plan.outputS3Prefix, hostReview: {acceptanceFocus: plan.item.acceptanceFocus ?? [], expectedSubjectCategory: plan.item.expectedSubjectCategory ?? null}}))});
if (mode === "prepare") { console.log(`THREE_EVAL_PREPARED ${outputRoot} cases=${sourceManifest.cases.length} profiles=${profiles.length} tasks=${plans.length} cloudSubmissions=0`); process.exit(0); }
// Force the existing S3 client to use this checkout's closed credential files.
for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN", "AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_ROLE_ARN", "AWS_PROFILE", "AWS_DEFAULT_PROFILE"]) delete process.env[key];
process.env.AWS_SHARED_CREDENTIALS_FILE = path.join(repo, ".codex-tmp/runtime-config/aws-credentials");
process.env.AWS_CONFIG_FILE = path.join(repo, ".codex-tmp/runtime-config/aws-config");
process.env.AWS_EC2_METADATA_DISABLED = "true";
await stat(process.env.AWS_SHARED_CREDENTIALS_FILE); await stat(process.env.AWS_CONFIG_FILE);
let stopAdmission = false;
const haltPath = path.join(outputRoot, "halt.json");
const admissionRoot = path.join(repo, ".codex-tmp/three-creator-eval/admissions");
const isTerminalStatus = status => ["succeeded", "completed", "failed", "submit_failed", "cancelled", "stopped"].includes(status);
async function withAdmissionLock(caseId, work) {
  return withAdmissionDirectoryLock(admissionRoot, caseId, work, {waitMilliseconds: ["__capacity", "__dispatch"].includes(caseId) ? 10000 : 0});
}

async function reserveCase(plan, state) {
  await withAdmissionLock("__capacity", async () => withAdmissionLock(plan.item.id, async file => {
    const existing = await optionalJson(file);
    if (existing && existing.requestId !== plan.requestId && !admissionIsClosed(existing)) throw new Error(`CREATOR_CASE_ALREADY_ACTIVE: ${plan.item.id} belongs to run ${existing.runId}, request ${existing.requestId}, job ${existing.jobId ?? "unresolved"}; resume that request before creating another run`);
    if (existing?.requestId !== plan.requestId) {
      const records = await Promise.all((await readdir(admissionRoot)).filter(name => name.endsWith('.json')).map(name => optionalJson(path.join(admissionRoot, name))));
      const active = records.filter(record => record && !admissionIsClosed(record));
      const capacity = 5;
      if (active.length >= capacity) throw new Error(`CREATOR_CASE_ADMISSION_BUSY: ${capacity} Three requests remain in flight; resume them before admitting another`);
    }
    const retryOf = existing && existing.requestId !== plan.requestId ? {runId: existing.runId, requestId: existing.requestId, jobId: existing.jobId ?? null, providerStatus: existing.providerStatus ?? null} : existing?.retryOf;
    state.retryOf = retryOf;
    await writeJson(file, {...existing, runId, requestId: plan.requestId, caseId: plan.item.id, phase: state.phase ?? "reserved", jobId: state.jobId ?? null, providerStatus: state.providerStatus ?? null, hasSubmissionIntent: Boolean(await optionalJson(path.join(plan.caseRoot, "submission-intent.json"))), outputRoot, maximumConcurrentJobs:Math.max(maxConcurrency,Number.isSafeInteger(parentPlan?.maxConcurrency)&&parentPlan.maxConcurrency<=5?parentPlan.maxConcurrency:0), retryOf, updatedAt: new Date().toISOString()});
  }));
}
async function execute(plan) {
  const previous = await optionalJson(statePath(plan.item.id));
  const checkpointExpected={taskId:plan.item.id,caseId:plan.item.baseCaseId,profile:plan.item.profile,creatorRuntimeLockHash:lock.runtimeHash,runtimeHash:lock.prebuiltRuntimes[plan.item.profile].runtimeHash};
  const knownChild = continuationLocation(outputRoot, runId, plan.item.id);
  const hasLinkedChild = (await optionalJson(path.join(outputRoot,"recovery-runs.json")))?.runs?.some(row=>row.runId===knownChild.runId);
  if (hasLinkedChild || ["delivered","cancelled","stopped"].includes(previous?.phase) || (previous?.phase === "failed" && !["resume", "continue"].includes(mode))) {
    await refreshTerminalThreeCheckpoint({mode,state:previous,caseRoot:plan.caseRoot,expected:checkpointExpected,requestId:plan.requestId,caseHash:plan.caseHash});
    return;
  }
  const state = {...previous, ...(plan.continuation ? {continuation:continuationLineage(plan.continuation.manifest)} : {}), caseId: plan.item.baseCaseId, taskId: plan.item.id, profile: plan.item.profile, sourceTestSetId: plan.item.sourceTestSetId, sourceCaseId: plan.item.sourceCaseId, caseHash: plan.caseHash, runtimeHash: lock.runtimeHash, model: "gpt-6-astra", reasoningEffort: "xhigh", requestId: plan.requestId, outputS3Prefix: plan.outputS3Prefix};
  let admissionReserved = false;
  let checkpointObservedAt=0;
  const observeCheckpoint=async(force=false)=>{
    if(!state.jobId||(!force&&Date.now()-checkpointObservedAt<30000))return;
    checkpointObservedAt=Date.now();
    try{const checkpoint=await retrieveThreeCheckpoint({jobId:state.jobId,taskId:plan.item.id,workDirectory:`/fsx/pipeline/lwdp_generation/${state.jobId}`,caseRoot:plan.caseRoot,expected:checkpointExpected});
      if(checkpoint){state.checkpoint={worldBuildHash:checkpoint.worldBuildHash,sourceHash:checkpoint.sourceHash,createdAt:checkpoint.createdAt,status:'runnable'};delete state.checkpointObservationWarning;}
    }catch{state.checkpointObservationWarning='THREE_CHECKPOINT_NOT_REFRESHED';}
    try{const progress=await retrieveThreeProgress({jobId:state.jobId,taskId:plan.item.id,workDirectory:`/fsx/pipeline/lwdp_generation/${state.jobId}`,caseRoot:plan.caseRoot,expected:checkpointExpected});if(progress)state.progress={status:'unverified',sourceHash:progress.sourceHash,createdAt:progress.createdAt};}catch{state.progressObservationWarning='THREE_PROGRESS_NOT_REFRESHED';}
  };
  const save = async () => {
    state.updatedAt = new Date().toISOString(); await writeJson(statePath(plan.item.id), state);
    if (admissionReserved) await withAdmissionLock(plan.item.id, async file => {
      const existing = await optionalJson(file);
      if (existing?.requestId !== plan.requestId) throw new Error("CREATOR_CASE_ADMISSION_OWNER_CHANGED");
      await writeJson(file, {...existing, phase: state.phase, jobId: state.jobId ?? null, providerStatus: state.providerStatus ?? null, rayCleanupConfirmed: state.rayCleanupConfirmed ?? false, submissionRejected: state.submissionRejected ?? false, hasSubmissionIntent: Boolean(await optionalJson(path.join(plan.caseRoot, "submission-intent.json"))), updatedAt: state.updatedAt});
    });
  };
  try {
    const intentFile = path.join(plan.caseRoot, "submission-intent.json");
    const intent = await optionalJson(intentFile);
    if (["resume", "continue"].includes(mode) && !state.jobId && !intent) { state.phase = "not-started"; await save(); return; }
    if (!state.jobId && !intent && await optionalJson(haltPath)) throw new Error("CREATOR_CASE_ADMISSION_BUSY: this run was halted; existing requests may be reconciled but no new jobs are admitted");
    // Retrieving a terminal attempt is read-only with respect to model admission.
    // A newer run may own this case now; historical artifact recovery must neither
    // block on nor rewrite that newer execution's lease.
    if (!(previous?.phase === "failed" && state.jobId)) { await reserveCase(plan, state); admissionReserved = true; }
    if (!state.jobId) {
      state.jobId = await resolveCreatorSubmission({existingJobId: state.jobId, hasDurableIntent: Boolean(intent), mode: mode === "continue" ? "resume" : mode,
        findExisting: async () => submittedJobId(await findGenerationJobByRequestId(plan.requestId)),
        createIntentAndSubmit: async () => {
          if (plan.continuation) await assertContinuationParent({parentRoot:continueFromRoot,taskId:plan.item.id,manifest:plan.continuation.manifest,lock,readJob:id=>lwdpRequest(`/api/v1/generation/jobs/${id}`)});
          for (const file of plan.continuation?.files ?? []) await uploadS3File(file, `${plan.outputS3Prefix}/inputs/${path.basename(file)}`);
          await uploadS3File(plan.imagePath, plan.imageS3Uri); await uploadS3File(plan.inputFile, plan.inputS3Uri);
          const config = await loadLwdpGenerationConfig(); // Never serialized or passed to a model/MCP.
          let submission;
          await withAdmissionLock("__dispatch", async () => {
            if (stopAdmission || await optionalJson(haltPath)) throw new Error("CREATOR_RUN_HALTED_BEFORE_POST");
            if (plan.continuation) await assertContinuationParent({parentRoot:continueFromRoot,taskId:plan.item.id,manifest:plan.continuation.manifest,lock,readJob:id=>lwdpRequest(`/api/v1/generation/jobs/${id}`)});
            await writeFile(intentFile, JSON.stringify({requestId: plan.requestId, payloadHash: plan.payloadHash, createdAt: new Date().toISOString()}, null, 2) + "\n", {flag: "wx"});
            state.phase = "submission-unknown"; await save();
            // With config already resolved, the single POST begins inside the
            // same cross-process mutex used to write a durable run halt.
            submission = submitCodexGenerationJob(plan.payload, {config, fetchImplementation: (url, init) => fetch(url, {...init, signal: AbortSignal.timeout(30000)})});
            submission.catch(() => {}); // Await outside the mutex; preserve the original rejection.
          });
          return submittedJobId(await submission);
        }});
      if (!state.jobId) { state.phase = "not-started"; await save(); return; }
      state.phase = "submitted"; await save();
      console.log(`CREATOR_EVAL_JOB ${plan.item.id} ${state.jobId} requestId=${plan.requestId}`);
    }
    state.submittedAt = (await optionalJson(intentFile))?.createdAt;
    if (!Number.isFinite(Date.parse(state.submittedAt))) { const error = new Error("THREE_EXECUTION_GUARD: invalid-durable-start-time"); error.guard = {action: "stop", reason: "invalid-durable-start-time"}; throw error; }
    const echo = await lwdpRequest(`/api/v1/generation/jobs/${state.jobId}/config`);
    await writeJson(path.join(plan.caseRoot, "config-echo.json"), echo);
    if (!effectiveConfigMatches(echo.config, plan.payload)) throw new Error("CREATOR_EFFECTIVE_CONFIG_MISMATCH");
    const remainingMilliseconds = Math.max(1000, Date.parse(state.submittedAt) + (MAXIMUM_QUEUE_SECONDS + lock.maximumTaskSeconds + STOP_DRAIN_SECONDS) * 1000 - Date.now());
    const job = await pollGenerationJob(state.jobId, {timeoutMs: remainingMilliseconds, fetchImplementation: (url, init) => fetch(url, {...init, signal: AbortSignal.timeout(30000)}), completionProbeIntervalMs: 10000,
      nonTerminalFailureProbe: async current => {
        await observeCheckpoint();
        if (!state.cliActivityEvidence) {
          let observed = await optionalJson(path.join(repo, ".codex-tmp/three-creator-eval/live-cache", state.jobId + ".json"));
          if (!observed?.job?.cliActivityObserved && Date.now()-Date.parse(state.submittedAt)>(MAXIMUM_QUEUE_SECONDS-30)*1000) {
            try {const snapshot=await readThreeLiveStatus([{jobId:state.jobId,taskId:plan.item.id,requestId:plan.requestId,workDir:echo.config.options.work_dir}]);observed={observedAt:snapshot.observedAt,job:snapshot.jobs[0]};}
            catch (error) {state.liveObservationError=error.name;}
          }
          if (observed?.job?.jobId===state.jobId && observed.job.taskId===plan.item.id && observed.job.requestId===plan.requestId && observed.job.cliActivityObserved===true && observed.job.launcher?.runtimeHash===lock.runtimeHash) state.cliActivityEvidence={source:"host-fixed-output-cli-events",observedAt:observed.observedAt,launcherStartedAt:observed.job.launcher.startedAt??null};
        }
        const guard = assessOwnedJob(current, {requestId: plan.requestId, outputS3Prefix: plan.outputS3Prefix, submittedAt: state.submittedAt, maximumTaskSeconds: lock.maximumTaskSeconds, hasObservedCliActivity:Boolean(state.cliActivityEvidence)});
        state.providerStatus = current.status; state.lastGuard = guard; state.lastObservedAt = new Date().toISOString(); await save();
        if (["stop", "halt-unowned", "stop-pending"].includes(guard.action)) { const error = new Error(`THREE_EXECUTION_GUARD: ${guard.reason}`); error.guard = guard; throw error; }
        return null;
      }, onProgress: current => { console.log(`CREATOR_EVAL_PROGRESS ${plan.item.id} ${current.status} ${JSON.stringify(current.counters ?? {})}`); }});
    const finalGuard = assessOwnedJob(job, {requestId: plan.requestId, outputS3Prefix: plan.outputS3Prefix, submittedAt: state.submittedAt, maximumTaskSeconds: lock.maximumTaskSeconds, hasObservedCliActivity:Boolean(state.cliActivityEvidence)});
    if (["stop", "halt-unowned"].includes(finalGuard.action)) { const error = new Error(`THREE_EXECUTION_GUARD: ${finalGuard.reason}`); error.guard = finalGuard; throw error; }
    state.providerStatus = job.status; state.rayCleanupConfirmed = terminalJobHasStopped(job); state.timing = job.timing; state.apiBuildCommit = job.build_commit;
    if (["cancelled", "stopped"].includes(job.status) && !state.rayCleanupConfirmed) { const error = new Error("THREE_EXECUTION_GUARD: ray-cleanup-unconfirmed"); error.guard = {action: "stop-pending", reason: "ray-cleanup-unconfirmed"}; throw error; }
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
    // Optional checkpoint verification cannot change the attempt's outcome.
    try{if(state.artifacts['creator-checkpoint.json']&&state.artifacts['creator-checkpoint.tar.gz']){
      const checkpoint=await installThreeCheckpoint({archivePath:path.join(plan.caseRoot,'creator-checkpoint.tar.gz'),receiptPath:path.join(plan.caseRoot,'creator-checkpoint.json'),caseRoot:plan.caseRoot,expected:checkpointExpected,jobId:state.jobId});
      state.checkpoint={worldBuildHash:checkpoint.worldBuildHash,sourceHash:checkpoint.sourceHash,createdAt:checkpoint.createdAt,status:'runnable'};
      delete state.checkpointObservationWarning;
    }}catch{state.checkpointObservationWarning='THREE_CHECKPOINT_NOT_REFRESHED';}
    try{if(state.artifacts['creator-progress.json']&&state.artifacts['creator-progress.tar.gz']){
      const progress=await installThreeProgress({archivePath:path.join(plan.caseRoot,'creator-progress.tar.gz'),receiptPath:path.join(plan.caseRoot,'creator-progress.json'),caseRoot:plan.caseRoot,expected:checkpointExpected,jobId:state.jobId});state.progress={status:'unverified',sourceHash:progress.sourceHash,createdAt:progress.createdAt};
    }}catch{state.progressObservationWarning='THREE_PROGRESS_NOT_REFRESHED';}
    await observeCheckpoint(true);
    if (["cancelled", "stopped"].includes(job.status)) {
      // Provider cleanup has already been acknowledged. Preserve source/evidence,
      // but do not reclassify an explicit stop as a failed generation or retry it.
      state.phase = job.status; delete state.failure; await save(); return;
    }
    if (job.status !== "succeeded" || item?.status !== "succeeded") {
      try {
        state.diagnosticsRecovery = await recoverFailedCreatorDiagnostics({jobId: state.jobId, caseId: plan.item.id, workDirectory: echo.config.options.work_dir, localCaseRoot: plan.caseRoot, outputS3Prefix: plan.outputS3Prefix});
        for (const [name, recovered] of Object.entries(state.diagnosticsRecovery.files)) state.artifacts[name] = {bytes: recovered.bytes, sha256: recovered.sha256, source: "trusted-host-fsx-recovery"};
      } catch (error) { state.diagnosticsRecoveryError = error.message; }
    }
    if (terminalJobHasStopped(job)) {
      const missing = ["creator-result.json","creator-delivery.tar.gz","creator-events.jsonl","creator-launcher-report.json"].filter(name=>!state.artifacts[name]);
      try {
        const recovered = await retrieveThreeDeliveryArtifacts({jobId:state.jobId,taskId:plan.item.id,caseRoot:plan.caseRoot,names:missing});
        Object.assign(state.artifacts,recovered);
        state.downloadFailures = state.downloadFailures.filter(row=>!recovered[row.name]);
      } catch { state.deliveryRecoveryWarning = "THREE_DELIVERY_OUTPUTS_NOT_REFRESHED"; }
    }
    state.toolEvidence = await eventStatistics(path.join(plan.caseRoot, "creator-events.jsonl"));
    state.usage = await reportedTokenUsage(path.join(plan.caseRoot, "creator-events.jsonl"));
    const launcher = await optionalJson(path.join(plan.caseRoot, "creator-launcher-report.json"));
    const result = await optionalJson(path.join(plan.caseRoot, "creator-result.json"));
    state.launcherStatus = launcher?.status;
    state.actualWallSeconds = result?.actualWallSeconds;
    state.inputWallSeconds = result?.inputWallSeconds;
    state.activePlaySeconds = result?.activePlaySeconds;
    state.videoMetadata = result?.videoMetadata;
    state.captureTiming = result?.captureTiming;
    state.targetResults = result?.targetResults;
    state.worldBuildHash = result?.worldBuildHash;
    state.episodeHash = result?.episodeHash;
    state.sourceHash = result?.sourceHash;
    state.toolVersion = result?.toolVersion;
    state.sdkVersion = result?.sdkVersion;
    state.browserObservationContract = result?.browserObservationContract;
    // A provider upload failure does not invalidate a completed world. Keep
    // recovering this delivery and its exact receipts without another Agent.
    if (launcher?.status === "delivered" && state.downloadFailures.some(output => output.required)) { state.phase = "delivery-pending"; state.failure = {category:"delivery",message:"Launcher delivered; recover the same job's missing artifacts."}; await save(); return; }
    if (launcher?.status !== "delivered" && (job.status !== "succeeded" || item?.status !== "succeeded")) throw new Error(item?.error || job.error || `Provider did not succeed: ${job.status}/${item?.status}`);
    if (state.downloadFailures.some(output => output.required)) { state.phase = "delivery-pending"; state.failure = {category: "delivery", message: "Required artifacts were not all downloaded; resume the same job."}; await save(); return; }
    if (launcher?.status !== "delivered") throw new Error("CREATOR_DELIVERY_OR_EVENT_IDENTITY_FAILED");
    state.submitReceipt = validateDeliveryEvidence({result, launcherReport: launcher, events: state.toolEvidence, eventsSha256: state.artifacts["creator-events.jsonl"].sha256, artifacts: state.artifacts, expectedRuntimeHash: lock.runtimeHash, expectedFixedRuntimeHash: lock.prebuiltRuntimes[plan.item.profile].runtimeHash, expectedCaseId: plan.item.baseCaseId, expectedTaskId: plan.item.id, expectedProfile: plan.item.profile, expectedWorkspace: path.join(echo.config.options.work_dir, "tasks", plan.item.id)});
    if (job.status !== "succeeded" || item?.status !== "succeeded") state.deliveryRecovery = {kind:"artifact-only",providerStatus:job.status};
    state.phase = "delivered"; delete state.failure; await save();
  } catch (error) {
    await observeCheckpoint(true);
    const hardDeadline = error.code === "LWDP_JOB_PENDING" && error.reason === "timeout";
    if (state.jobId && (error.guard || error.message === "CREATOR_EFFECTIVE_CONFIG_MISMATCH" || hardDeadline)) {
      stopAdmission = true;
      const reason = error.guard?.reason ?? (hardDeadline ? "total-wall-deadline" : "effective-config-mismatch");
      await withAdmissionLock("__dispatch", async () => {
        if (!await optionalJson(haltPath)) await writeJson(haltPath, {kind: "three-creator-run-halt", at: new Date().toISOString(), taskId: plan.item.id, jobId: state.jobId, requestId: plan.requestId, reason, policy: "Stop this owned request and admit no new jobs; preserve unknown states until confirmed terminal."});
      });
      try {
        state.stop = await stopOwnedThreeJob({jobId: state.jobId, requestId: plan.requestId, outputS3Prefix: plan.outputS3Prefix, evidenceRoot: plan.caseRoot, reason});
        state.providerStatus = state.stop.providerStatus; state.rayCleanupConfirmed = state.stop.rayCleanupConfirmed;
      } catch (stopError) { state.stopError = stopError.message; state.rayCleanupConfirmed = false; }
      state.phase = state.rayCleanupConfirmed ? (["succeeded", "completed"].includes(state.providerStatus) ? "delivery-pending" : ["cancelled", "stopped"].includes(state.providerStatus) ? state.providerStatus : "failed") : "stop-pending";
      state.failure = {category: "execution-guard", message: error.message};
      if (state.rayCleanupConfirmed) {
        try { state.diagnosticsRecovery = await recoverFailedCreatorDiagnostics({jobId: state.jobId, caseId: plan.item.id, workDirectory: `/fsx/pipeline/lwdp_generation/${state.jobId}`, localCaseRoot: plan.caseRoot, outputS3Prefix: plan.outputS3Prefix}); }
        catch (recoveryError) { state.diagnosticsRecoveryError = recoveryError.message; }
      }
      await save(); console.log(`THREE_EVAL_STOP ${plan.item.id} ${state.phase} ${reason}`); return;
    }
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
    const terminal = isTerminalStatus(state.providerStatus) && (!["cancelled", "stopped"].includes(state.providerStatus) || state.rayCleanupConfirmed === true);
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
async function recoverCase(plan) {
  if (continueFromRoot || !["run","resume","continue"].includes(mode)) return;
  const child = continuationLocation(outputRoot, runId, plan.item.id);
  const linked = (await optionalJson(path.join(outputRoot,"recovery-runs.json")))?.runs?.some(row=>row.runId===child.runId);
  const parentState = await optionalJson(statePath(plan.item.id));
  if (!linked) {
    if (mode === "resume" || (mode !== "continue" && !recoveryPolicy.automaticContinuation)) return;
    if (parentState?.phase !== "failed" || !parentState.jobId || stopAdmission || await optionalJson(haltPath)) return;
    let decision;
    try { decision = recoveryDecision(parentState, await lwdpRequest(`/api/v1/generation/jobs/${parentState.jobId}`)); }
    catch { await writeJson(path.join(plan.caseRoot,"recovery-status.json"),{action:"reconcile",reason:"provider-confirmation-unavailable"}); return; }
    if (decision.action !== "continue") { await writeJson(path.join(plan.caseRoot,"recovery-status.json"),decision); return; }
  }
  const base = ["--run-id",child.runId,"--output-root",child.root,"--manifest",manifestPath,"--runtime-lock",frozenRuntimeLockPath,"--suite",suite,"--experiment-revision",experimentRevision,"--case-id",plan.item.baseCaseId,"--profile",plan.item.profile,"--continue-from",outputRoot,"--max-concurrency",String(maxConcurrency),"--account-concurrency",String(accountConcurrency),"--output-s3-root",s3Root,"--auto-continue","false"];
  if (!linked) {
    const prepared = await runRecoveryCoordinator(["--mode","prepare",...base]);
    if (prepared.code !== 0) { await writeJson(path.join(plan.caseRoot,"recovery-status.json"),{action:"none",reason:"no-admitted-continuation-source"}); return; }
    await registerContinuationRun(outputRoot,child);
  }
  console.log(`THREE_EVAL_CONTINUATION ${plan.item.id} ${child.runId} from=${parentState.jobId}`);
  await runRecoveryCoordinator(["--mode",mode === "resume" ? "resume" : "run",...base]);
}
let index = 0;
await Promise.all(Array.from({length: Math.min(maxConcurrency, executionPlans.length)}, async () => { while (index < executionPlans.length && !stopAdmission) { const plan = executionPlans[index++]; await execute(plan); await recoverCase(plan); } }));
const summary = await saveSummary();
console.log(`CREATOR_EVAL_SUMMARY delivered=${summary.deliveredCount} failed=${summary.failedCount} pending=${summary.pendingCount} ${path.join(outputRoot, "summary.json")}`);
if (summary.cases.filter(item => executionPlans.some(plan => plan.item.id === item.id)).some(item => item.phase !== "delivered")) process.exitCode = 1;
