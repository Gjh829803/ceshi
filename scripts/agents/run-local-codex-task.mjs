#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";

import {
  CodexTaskOutcomeError,
  serializeCodexTaskOutcomeEnvelopeV1,
} from "../lib/codex-task-outcome.mjs";
import { resolveCodexExecutionProfile } from "../lib/lwdp-codex-profile.mjs";
import { inspectLocalOutput, retainLocalTaskFailure } from "./local-codex-failure-evidence.mjs";
import { hashLocalTaskArguments, retainLocalTaskDelivery } from "./local-codex-delivery-evidence.mjs";

function parseArguments(argv) {
  const result = { contexts: [], assets: [], outputs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (["--context", "--asset", "--output"].includes(key)) {
      if (value === undefined) throw new Error(`Missing value after ${key}.`);
      result[`${key.slice(2)}s`].push(value);
      index += 1;
    } else if (key === "--dry-run") {
      result.dryRun = true;
    } else if (key?.startsWith("--")) {
      if (value === undefined) throw new Error(`Missing value after ${key}.`);
      result[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
    } else {
      throw new Error(`Unsupported argument: ${key}`);
    }
  }
  return result;
}

function splitSpec(value, fieldCount, label) {
  const parts = value.split("::");
  if (parts.length < fieldCount) {
    throw new Error(`${label} must contain ${fieldCount} '::'-separated fields.`);
  }
  return parts;
}

function safeTaskId(value) {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(value ?? "")) {
    throw new Error("--task-id is invalid.");
  }
  return value;
}

function safeRelativePath(root, value, label) {
  const absolute = resolve(root, value);
  const rel = relative(root, absolute);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Unsafe ${label} path: ${value}`);
  }
  return { absolute, relative: rel };
}

function safeOutputPath(value) {
  if (!value || value.startsWith("/") || value.split("/").includes("..")) {
    throw new Error(`Unsafe declared output path: ${value}`);
  }
  return value;
}

async function copyIsolatedTree(source, destination) {
  const metadata = await lstat(source);
  if (metadata.isSymbolicLink()) throw new Error(`Symlinks are not allowed in local Codex inputs: ${source}`);
  if (metadata.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(source)) {
      await copyIsolatedTree(resolve(source, entry), resolve(destination, entry));
    }
    return;
  }
  if (!metadata.isFile()) throw new Error(`Unsupported local Codex input: ${source}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

function localCodexEnvironment(environment = process.env) {
  const allowed = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "TERM",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "ALL_PROXY",
  ];
  const isolated = {};
  for (const key of allowed) {
    if (environment[key]) isolated[key] = environment[key];
  }
  const codexHome = environment.WORLDKIT_LOCAL_CODEX_HOME || environment.CODEX_HOME;
  if (codexHome) isolated.CODEX_HOME = codexHome;
  return isolated;
}

function executableAvailable(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore", shell: false });
  return result.status === 0;
}

async function promoteFileAtomic(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = resolve(
    dirname(destination),
    `.${basename(destination)}.local-codex-${process.pid}-${randomBytes(4).toString("hex")}.part`,
  );
  try {
    await copyFile(source, temporary);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

const args = parseArguments(process.argv.slice(2));
const repoRoot = await realpath(resolve(args.repoRoot || process.cwd()));
const taskId = safeTaskId(args.taskId);
const requestId = safeTaskId(args.requestId || taskId);
const executionProfile = resolveCodexExecutionProfile({
  executionProfile: args.executionProfile || "formal",
  model: args.model,
  reasoningEffort: args.reasoningEffort,
});
if (!args.instructionFile) throw new Error("--instruction-file is required.");
if (args.outputs.length === 0) throw new Error("At least one --output is required.");

const runToken = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
const stagingRoot = resolve(repoRoot, ".codex-tmp", "local-codex", `${taskId}-${runToken}`);
const smokeMode = process.env.WORLDKIT_LOCAL_CODEX_SMOKE === "1";
const codexBin = process.env.WORLDKIT_LOCAL_CODEX_BIN || "codex";

let child = null;
let timeout = null;
let didTimeout = false;
let outcomeEmitted = false;
let outputSpecs = [];
let stderrTail = "";
let childExitCode = null;
const failureEvidenceRoot = args.failureEvidenceRoot === undefined ? null :
  resolve(await realpath(dirname(resolve(args.failureEvidenceRoot))), basename(args.failureEvidenceRoot));
if (failureEvidenceRoot !== null &&
    (!relative(repoRoot, failureEvidenceRoot) || relative(repoRoot, failureEvidenceRoot).startsWith(".."))) {
  throw new Error("Failure evidence must be inside the Host run root.");
}
const deliveryEvidenceRoot = args.deliveryEvidenceRoot === undefined ? null :
  resolve(await realpath(dirname(resolve(args.deliveryEvidenceRoot))), basename(args.deliveryEvidenceRoot));
if (deliveryEvidenceRoot !== null &&
    (!relative(repoRoot, deliveryEvidenceRoot) || relative(repoRoot, deliveryEvidenceRoot).startsWith(".."))) {
  throw new Error("Delivery evidence must be inside the Host run root.");
}
await mkdir(stagingRoot, { recursive: true });
const emitOutcome = (outcome) => {
  if (outcomeEmitted) throw new Error("Codex task outcome was emitted more than once.");
  outcomeEmitted = true;
  process.stdout.write(serializeCodexTaskOutcomeEnvelopeV1({
    kind: "worldkit-codex-task-outcome",
    schemaVersion: 1,
    requestId,
    outcome,
  }));
};
const stopChild = (signal) => {
  if (child !== null && !child.killed) child.kill(signal);
};
process.once("SIGINT", () => stopChild("SIGINT"));
process.once("SIGTERM", () => stopChild("SIGTERM"));

try {
  try {
  if (args.workspaceContextRoot && args.contexts.length > 0) {
    throw new Error(
      "--workspace-context-root and --context are mutually exclusive.",
    );
  }
  if (args.workspaceContextRoot) {
    const source = safeRelativePath(
      repoRoot,
      args.workspaceContextRoot,
      "workspace context root",
    );
    const metadata = await lstat(source.absolute);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(
        "--workspace-context-root must be a canonical directory.",
      );
    }
    for (const entry of await readdir(source.absolute)) {
      await copyIsolatedTree(
        resolve(source.absolute, entry),
        resolve(stagingRoot, entry),
      );
    }
  } else {
    for (const context of args.contexts) {
      const source = safeRelativePath(repoRoot, context, "context");
      await copyIsolatedTree(
        source.absolute,
        resolve(stagingRoot, source.relative),
      );
    }
  }

  const assetRows = [];
  const attachedImages = [];
  const seenAssetIds = new Set();
  for (const rawAsset of args.assets) {
    const [id, localPath, attachAs = "file", mediaType = "application/octet-stream"] =
      splitSpec(rawAsset, 2, "--asset");
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id) || seenAssetIds.has(id)) {
      throw new Error(`Invalid or duplicate asset id: ${id}`);
    }
    if (!["file", "image", "video"].includes(attachAs)) {
      throw new Error(`Invalid attach_as: ${attachAs}`);
    }
    seenAssetIds.add(id);
    const absolutePath = resolve(localPath);
    const metadata = await lstat(absolutePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size === 0) {
      throw new Error(`Asset is not a non-empty regular file: ${localPath}`);
    }
    const digest = createHash("sha256").update(await readFile(absolutePath)).digest("hex").slice(0, 16);
    const suffix = extname(absolutePath).toLowerCase();
    const relativePath = `inputs/${id}-${digest}${suffix}`;
    const stagedPath = resolve(stagingRoot, relativePath);
    await mkdir(dirname(stagedPath), { recursive: true });
    await copyFile(absolutePath, stagedPath);
    assetRows.push({ id, attachAs, mediaType, relativePath });
    if (attachAs === "image") attachedImages.push(stagedPath);
  }

  outputSpecs = args.outputs.map((rawOutput) => {
    const [remotePath, localPath, contentType = "application/octet-stream"] =
      splitSpec(rawOutput, 2, "--output");
    const safePath = safeOutputPath(remotePath);
    return {
      remotePath: safePath,
      stagedPath: resolve(stagingRoot, safePath),
      localPath: resolve(localPath),
      contentType,
    };
  });
  for (const output of outputSpecs) await mkdir(dirname(output.stagedPath), { recursive: true });

  if (smokeMode || args.dryRun) {
    process.stdout.write(
      `${smokeMode ? "WORLDKIT_LOCAL_CODEX_SMOKE" : "WORLDKIT_LOCAL_CODEX_DRY_RUN"} ${taskId} profile=${executionProfile.name} model=${executionProfile.model} reasoning=${executionProfile.reasoningEffort} contexts=${args.contexts.length} assets=${assetRows.length} outputs=${outputSpecs.length}\n`,
    );
    emitOutcome("completed");
    await rm(stagingRoot, { recursive: true, force: true });
    process.exit(0);
  }
  if (!executableAvailable(codexBin)) {
    throw new Error(`Local Codex executable is unavailable: ${codexBin}`);
  }

  const callerInstruction = await readFile(resolve(args.instructionFile), "utf8");
  const inputList = assetRows.length === 0
    ? "- none"
    : assetRows.map(({ id, attachAs, mediaType, relativePath }) =>
        `- ${id}: ${relativePath} (${attachAs}, ${mediaType})`).join("\n");
  const outputList = outputSpecs.map(({ remotePath, contentType }) =>
    `- ${remotePath} (${contentType}, required)`).join("\n");
  const localProtocol = `\n\nLocal isolated workspace protocol:
- The current working directory is a fresh task workspace containing only Host-selected context and assets.
- Treat existing context and input files as read-only. Do not access the parent checkout, credentials, unrelated directories, or external project state.
- Input assets:\n${inputList}
- Write only these declared output files at their exact relative paths:\n${outputList}
- Create parent directories when needed. Do not write outputs anywhere else.
- The trusted Host validates and atomically promotes declared outputs after this process exits; do not claim Host validation you did not run.`;
  const prompt = `${callerInstruction}${localProtocol}`;
  const lastMessagePath = resolve(stagingRoot, ".codex-last-message.txt");
  const timeoutSeconds = Number(args.timeoutSeconds || 1_800);
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 7_200) {
    throw new Error("--timeout-seconds must be an integer in [1, 7200].");
  }
  const codexArgs = [
    "exec",
    "--cd", stagingRoot,
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--sandbox", "workspace-write",
    "--model", executionProfile.model,
    "--config", `model_reasoning_effort=${JSON.stringify(executionProfile.reasoningEffort)}`,
    "--config", "approval_policy=\"never\"",
    "--color", "never",
    "--output-last-message", lastMessagePath,
  ];
  for (const imagePath of attachedImages) codexArgs.push("--image", imagePath);
  codexArgs.push("-");

  child = spawn(codexBin, codexArgs, {
    cwd: stagingRoot,
    env: localCodexEnvironment(),
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  process.stdout.write(
    `WORLDKIT_LOCAL_CODEX_JOB ${args.stage || taskId} ${taskId} pid=${child.pid ?? 0} profile=${executionProfile.name} model=${executionProfile.model} reasoning=${executionProfile.reasoningEffort}\n`,
  );
  process.stdout.write(`WORLDKIT_LOCAL_CODEX_PROGRESS ${taskId} running\n`);
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    stderrTail = `${stderrTail}${chunk}`.slice(-64 * 1024);
  });
  child.stdin.end(prompt);
  timeout = setTimeout(() => {
    didTimeout = true;
    stopChild("SIGTERM");
  }, timeoutSeconds * 1_000);
  timeout.unref();
  const result = await new Promise((resolvePromise) => {
    child.once("error", (error) => resolvePromise({ code: 1, error }));
    child.once("close", (code, signal) => resolvePromise({ code: code ?? 1, signal }));
  });
  childExitCode = result.code;
  clearTimeout(timeout);
  timeout = null;
  if (result.error) throw result.error;
  if (result.code !== 0) {
    throw new CodexTaskOutcomeError(
      didTimeout ? "task-timeout" : "task-rejected",
      `Local Codex task ${taskId} failed with code ${result.code}${result.signal ? ` (${result.signal})` : ""}: ${stderrTail.trim()}`,
    );
  }
  for (const output of outputSpecs) {
    const metadata = await inspectLocalOutput(stagingRoot, output.remotePath);
    if (metadata.status !== "present") {
      throw new Error(
        `WORLDKIT_LOCAL_CODEX_OUTPUT_MISSING: Local Codex omitted a non-empty declared output: ${output.remotePath}`,
      );
    }
  }
  if (deliveryEvidenceRoot !== null) {
    try {
      await retainLocalTaskDelivery({ evidenceRoot: deliveryEvidenceRoot, stagingRoot, outputs: outputSpecs,
        requestId, taskId, childExitCode, argumentsHash: hashLocalTaskArguments(process.argv.slice(2)) });
    } catch {
      // Recovery evidence is not an additional production gate. Keep the old
      // successful-child/output-promotion behavior if this optional snapshot fails.
      process.stderr.write("WORLDKIT_LOCAL_CODEX_DELIVERY_EVIDENCE_UNAVAILABLE\n");
    }
  }
  for (const output of outputSpecs) await promoteFileAtomic(output.stagedPath, output.localPath);
  process.stdout.write(`WORLDKIT_LOCAL_CODEX_TASK_READY ${taskId}\n`);
  } catch (error) {
    if (failureEvidenceRoot !== null) {
      try {
        await retainLocalTaskFailure({
          evidenceRoot: failureEvidenceRoot, stagingRoot, outputs: outputSpecs,
          requestId, taskId, childExitCode, stderrTail,
          outcome: error instanceof CodexTaskOutcomeError ? error.outcomeCode : "task-rejected",
        });
      } catch {
        // Do not overwrite prior evidence or replace the original task failure.
        process.stderr.write("WORLDKIT_LOCAL_CODEX_FAILURE_EVIDENCE_UNAVAILABLE\n");
      }
    }
    throw error;
  } finally {
    if (timeout !== null) clearTimeout(timeout);
    stopChild("SIGTERM");
    await rm(stagingRoot, { recursive: true, force: true });
  }
  emitOutcome("completed");
} catch (error) {
  emitOutcome(error instanceof CodexTaskOutcomeError
    ? error.outcomeCode
    : "task-rejected");
  throw error;
}
