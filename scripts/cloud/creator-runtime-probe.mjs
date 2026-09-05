#!/usr/bin/env node
/** Experimental capability probe retry using an explicitly pinned cloud CLI.
 * Uses the existing platform's options.codex_bin; no invented runtime profile.
 * Never alters the production binary, deployment, account, or global config.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertSuccessfulJob, downloadS3FileAtomic, fetchGenerationItems,
  findGenerationJobByRequestId, lwdpRequest, pollGenerationJob,
  submitCodexGenerationJob, submittedJobId,
} from "../lib/lwdp-generation-client.mjs";

const argv = process.argv.slice(2);
const options = Object.fromEntries(argv.reduce((pairs, value, index) => {
  if (index % 2 === 0) pairs.push([value, argv[index + 1]]);
  return pairs;
}, []));
if (argv.length % 2 !== 0 || Object.keys(options).some((key) => !["--codex-bin", "--job-id"].includes(key))) {
  throw new Error("Usage: creator-runtime-probe.mjs --codex-bin /fsx/pipeline/worldkit-creator-experiments/.../codex-0.153.3-linux-x64/bin/codex [--job-id gen_...]");
}
const codexBin = options["--codex-bin"];
if (!/^\/fsx\/pipeline\/worldkit-creator-experiments\/[a-z0-9-]+\/codex-0\.153\.3-linux-x64\/bin\/codex$/.test(codexBin ?? "")) {
  throw new Error("Probe requires the reviewed task-private Codex 0.153.3 binary path.");
}
const root = resolve(".codex-tmp/gpt6-cloud-probe");
const attemptRoot = resolve(root, "attempt-2");
await mkdir(attemptRoot, { recursive: true });
const original = JSON.parse(await readFile(resolve(root, "attempt-1/config-echo.json"), "utf8")).config;
const previous = JSON.parse(await readFile(resolve(root, "attempt-1/job-final.json"), "utf8"));
if (!["completed", "failed", "submit_failed", "cancelled", "stopped", "succeeded"].includes(previous.status)) {
  throw new Error("Previous probe is not confirmed terminal; do not create another execution.");
}
const requestId = "gpt6-creator-probe-20260905-a2-c83fd126";
const outputS3Prefix = "s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk/gpt6-creator/cloud-probe/20260905-a2-c83fd126";
const payload = {
  job_name: "worldkit creator capability probe with pinned Codex 0.153.3",
  request_id: requestId,
  output_s3_prefix: outputS3Prefix,
  defaults: { model: "gpt-6-astra", reasoning_effort: "xhigh", sandbox: "workspace-write", timeout_seconds: 900 },
  options: { codex_bin: codexBin },
  tasks: original.items,
};
const payloadSha256 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
let jobId = options["--job-id"];
if (jobId && !/^gen_[a-f0-9]+$/.test(jobId)) throw new Error("Invalid job id.");
if (!jobId) {
  let priorIntent;
  try { priorIntent = JSON.parse(await readFile(resolve(attemptRoot, "submission-intent.json"), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (priorIntent) {
    if (priorIntent.payloadSha256 !== payloadSha256) throw new Error("Attempt payload changed; refusing another submission.");
    jobId = submittedJobId(await findGenerationJobByRequestId(requestId));
  } else {
    await writeFile(resolve(attemptRoot, "submission-intent.json"), JSON.stringify({requestId, outputS3Prefix, payloadSha256, codexBin}, null, 2) + "\n", {flag: "wx"});
    await writeFile(resolve(attemptRoot, "payload.json"), JSON.stringify(payload, null, 2) + "\n");
    jobId = submittedJobId(await submitCodexGenerationJob(payload));
  }
}
await writeFile(resolve(attemptRoot, "job-identity.json"), JSON.stringify({jobId, requestId, outputS3Prefix, codexBin}, null, 2) + "\n");
process.stdout.write(`CREATOR_PROBE_JOB ${jobId} requestId=${requestId} model=gpt-6-astra effort=xhigh codexBin=${codexBin}\n`);
const echo = await lwdpRequest(`/api/v1/generation/jobs/${jobId}/config`);
await writeFile(resolve(attemptRoot, "config-echo.json"), JSON.stringify(echo, null, 2) + "\n");
if (echo.config?.request_id !== requestId || echo.config?.options?.codex_bin !== codexBin || echo.config?.options?.model !== "gpt-6-astra") {
  throw new Error("Effective requested config does not echo the pinned binary/model; reconcile this job, never resubmit.");
}
const job = await pollGenerationJob(jobId, {
  timeoutMs: 30 * 60_000,
  onProgress: (state) => process.stdout.write(`CREATOR_PROBE_PROGRESS ${state.status} ${JSON.stringify(state.counters ?? {})}\n`),
});
await writeFile(resolve(attemptRoot, "job-final.json"), JSON.stringify(job, null, 2) + "\n");
const items = await fetchGenerationItems(jobId);
await writeFile(resolve(attemptRoot, "items.json"), JSON.stringify(items, null, 2) + "\n");
for (const [remote, local] of [
  ["tasks/creator-capability-probe/logs/codex_attempt.json", "codex-attempt.json"],
  ["reports/codex_delivery_report.json", "delivery-report.json"],
]) {
  await downloadS3FileAtomic(`${outputS3Prefix}/${remote}`, resolve(attemptRoot, local));
}
assertSuccessfulJob(job, items, ["creator-capability-probe"]);
for (const output of original.items[0].outputs) {
  await downloadS3FileAtomic(`${outputS3Prefix}/tasks/creator-capability-probe/${output.path}`, resolve(attemptRoot, output.path));
}
process.stdout.write(`CREATOR_PROBE_DELIVERED ${jobId}\n`);
