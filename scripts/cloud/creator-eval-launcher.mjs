#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { copyFile, lstat, readFile, realpath } from "node:fs/promises";
import { finished } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRuntimeLock, parseCloudLayout, executionEnvironment, prepareSessionDirectories, fileSha256, writeJson } from "./creator-eval-runtime.mjs";
import { eventStatistics, isPassingDelivery, validateDeliveryEvidence } from "./creator-eval-statistics.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const startedAt = new Date().toISOString();
const originalArgs = process.argv.slice(2);
const layout = await parseCloudLayout(originalArgs);
const eventsFile = path.join(layout.outputs, "creator-events.jsonl");
const stderrFile = path.join(layout.outputs, "creator-stderr.log");
const reportFile = path.join(layout.outputs, "creator-launcher-report.json");
const report = {kind: "experimental-creator-launcher-report", schemaVersion: 1, caseId: layout.caseId, startedAt, workspace: layout.workspace, declaredOutputsRoot: layout.outputs, status: "starting", model: "gpt-6-astra", reasoningEffort: "xhigh"};
try {
  const lock = await readRuntimeLock(path.join(directory, "runtime-lock.json"), {checkInstalled: true});
  Object.assign(report, {runtimeHash: lock.runtimeHash, codexBinary: lock.codexBinary, codexBinarySha256: lock.codexBinarySha256, toolkitRoot: lock.toolkitRoot, browserRoot: lock.browserRoot});
  const bridge = path.join(directory, "creator-eval-mcp-bridge.mjs");
  const mcpArgs = [bridge, "--runtime-lock", lock.runtimeLockPath, "--workspace", layout.workspace];
  const enabledTools = ["creator_describe_environment", "creator_get_authoring_schema", "assets_search", "assets_describe", "world_validate", "world_preview", "world_playtest", "world_capture_triviews", "world_submit", "operations_get", "operations_cancel"];
  const toolPolicies = enabledTools.map(name => `${name}={approval_mode="approve"}`).join(",");
  const mcpConfiguration = `mcp_servers={worldkit_creator={command=${JSON.stringify(lock.nodeBinary)},args=${JSON.stringify(mcpArgs)},cwd=${JSON.stringify(layout.workspace)},enabled=true,required=true,env_vars=[],default_tools_approval_mode="prompt",tools={${toolPolicies}},enabled_tools=${JSON.stringify(enabledTools)},startup_timeout_sec=60,tool_timeout_sec=90}}`;
  const overrides = ["approval_policy=\"never\"", "features.apps=false", "features.hooks=false", "features.plugins=false", "features.remote_plugin=false", "features.skill_mcp_dependency_install=false", "skills.bundled.enabled=false", "skills.include_instructions=false", "tools.view_image=true", "allow_login_shell=false", "features.shell_snapshot=false", "shell_environment_policy.inherit=\"core\"", mcpConfiguration];
  const args = [...originalArgs.slice(0, -1), "--ignore-user-config", "--ignore-rules", "--json", ...overrides.flatMap(value => ["-c", value]), originalArgs.at(-1)];
  const env = executionEnvironment(lock, layout.workspace, {includeAuthentication: true});
  await prepareSessionDirectories(env);
  Object.assign(report, {status: "running", appliedConfiguration: overrides, modelEnvironmentKeys: Object.keys(env).sort(), mcpAuthenticationEnvironmentPassed: false});
  await writeJson(reportFile, report);
  const events = createWriteStream(eventsFile, {flags: "wx"});
  const errors = createWriteStream(stderrFile, {flags: "wx"});
  const transportHash = createHash("sha256");
  const child = spawn(lock.codexBinary, args, {cwd: layout.workspace, env, stdio: ["inherit", "pipe", "pipe"], detached: true});
  const stop = signal => { try { process.kill(-child.pid, signal); } catch {} };
  const signalHandlers = new Map(["SIGTERM", "SIGINT"].map(signal => [signal, () => { report.interruptedBy = signal; stop(signal); }]));
  for (const [signal, handler] of signalHandlers) process.on(signal, handler);
  let timedOut = false;
  let forcedKill;
  const timer = setTimeout(() => { timedOut = true; stop("SIGTERM"); forcedKill = setTimeout(() => stop("SIGKILL"), 15_000); }, lock.maximumTaskSeconds * 1000);
  events.on("error", () => stop("SIGTERM")); errors.on("error", () => stop("SIGTERM"));
  // Keep full image-bearing events on disk instead of duplicating the entire
  // stream in LWDP's unbounded subprocess output buffer.
  child.stdout.on("data", chunk => transportHash.update(chunk));
  child.stdout.pipe(events);
  child.stderr.pipe(errors); child.stderr.pipe(process.stderr, {end: false});
  let exit;
  try {
    exit = await new Promise((resolvePromise, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolvePromise({code, signal})); });
    await Promise.all([finished(events), finished(errors)]);
  } finally {
    clearTimeout(timer); clearTimeout(forcedKill);
    for (const [signal, handler] of signalHandlers) process.off(signal, handler);
    stop("SIGTERM");
  }
  Object.assign(report, {childExitCode: exit.code, childExitSignal: exit.signal, timedOut, eventsSha256: await fileSha256(eventsFile), stderrSha256: await fileSha256(stderrFile)});
  report.eventsTransportSha256 = transportHash.digest("hex");
  if (report.eventsSha256 !== report.eventsTransportSha256) throw new Error("CREATOR_EVENT_STREAM_TAMPERED");
  if (timedOut || exit.code !== 0) throw new Error(timedOut ? "CREATOR_TASK_TIMEOUT" : `CREATOR_CODEX_EXIT_${exit.code ?? exit.signal}`);
  const sourceResult = path.join(layout.workspace, "creator-result.json");
  const result = JSON.parse(await readFile(sourceResult, "utf8"));
  if (!isPassingDelivery(result)) throw new Error("CREATOR_DELIVERY_CONTRACT_FAILED");
  const artifacts = {};
  for (const name of ["creator-result.json", "creator-delivery.tar.gz"]) {
    const source = path.join(layout.workspace, name);
    const metadata = await lstat(source);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || await realpath(source) !== source) throw new Error(`CREATOR_DELIVERY_FILE_INVALID: ${name}`);
    const destination = path.join(layout.outputs, name);
    await copyFile(source, destination);
    artifacts[name] = {bytes: metadata.size, sha256: await fileSha256(destination)};
  }
  Object.assign(report, {sourceHash: result.sourceHash, artifacts});
  const toolEvidence = await eventStatistics(eventsFile);
  report.toolEvidence = toolEvidence;
  const receipt = validateDeliveryEvidence({result, launcherReport: report, events: toolEvidence, eventsSha256: report.eventsSha256, artifacts, expectedRuntimeHash: lock.runtimeHash, expectedSceneId: layout.caseId, expectedWorkspace: layout.workspace});
  Object.assign(report, {status: "delivered", submitReceipt: receipt, qualification: "experimental-tool-delivery with matching transport receipt; independent visual/runtime review remains required"});
} catch (error) {
  Object.assign(report, {status: "failed", error: error instanceof Error ? error.message : String(error)});
  process.stderr.write(`CREATOR_LAUNCHER_FAILED: ${report.error}\n`);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeJson(reportFile, report);
}
