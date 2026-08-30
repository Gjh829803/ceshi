#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validatePlaythroughFrameTelemetry,
  writeJsonAtomic,
} from "../lib/playthrough-dataset.mjs";
import { EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION } from "../lib/episode-seedance-prompt.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index < 0) {
    if (fallback !== null) return fallback;
    throw new Error(`Missing ${name}.`);
  }
  if (!args[index + 1]) throw new Error(`Missing value for ${name}.`);
  return args[index + 1];
};
const sceneId = value("--scene-id");
const episodeId = value("--episode-id", `episode-${sceneId}-${Date.now().toString(36)}`);
const origin = value("--origin", process.env.WORLDKIT_STUDIO_ORIGIN || "http://127.0.0.1:4297");
const backend = value("--backend", "cloud");
if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(sceneId) ||
    !/^[a-z0-9][a-z0-9-]{2,119}$/.test(episodeId) ||
    !["cloud", "local"].includes(backend)) {
  throw new Error("Invalid workflow identity or backend.");
}
const sceneRoot = path.join(repoRoot, "artifacts/scenes", sceneId);
const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
const videoPipelineConfig = JSON.parse(await readFile(
  path.join(repoRoot, "config/episode-video-pipeline.json"),
  "utf8",
));
const providerModel = videoPipelineConfig.seedance?.model;
const upscaleModel = videoPipelineConfig.upscale?.model;
if (providerModel !== "mg-seedance-2.5-480p") {
  throw new Error(`Unexpected episode Seedance model: ${providerModel}`);
}
if (upscaleModel !== "cf-超分-720p-30s") {
  throw new Error(`Unexpected episode upscale model: ${upscaleModel}`);
}
if (videoPipelineConfig.promptTemplateVersion !== EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION) {
  throw new Error(
    `Episode Prompt template lock mismatch: config=${videoPipelineConfig.promptTemplateVersion} ` +
    `code=${EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION}`,
  );
}
const delivery = videoPipelineConfig.delivery;
const rawProviderFileName = `${providerModel}.mp4`;
const rawUpscaleFileName = "cf-upscaled-720p.mp4";
const finalVideoFileName = `final-${delivery.width}x${delivery.height}-${delivery.fps}fps-${delivery.frameCount}f.mp4`;
const recordPath = path.join(episodeRoot, "episode-record.json");
const logPath = path.join(episodeRoot, "pipeline.log");
await mkdir(episodeRoot, { recursive: true });
const log = createWriteStream(logPath, { flags: "a" });
const runningChildren = new Set();
let stopping = false;
const runtimeSlotRoot = path.join(repoRoot, ".codex-tmp/episode-runtime-slot");
const runtimeSlotPath = path.join(runtimeSlotRoot, "slot-0");

const stageDefinitions = [
  ["reconnaissance", "运行时侦察"],
  ["playthrough-plan", "90 秒玩家剧本"],
  ["whitebox-capture", "白膜视频与三段切分"],
  ["visual-reconstruction", "三段样式首帧与共享三视图"],
  ["seedance-prompts", "三条 Seedance 渲染 Prompt"],
  ["seedance-generation", "MG Seedance 2.5 480p"],
  ["cf-upscale", "CF 超分 720p"],
  ["conformance", "24fps / 720 帧一致性"],
];
let record = {
  kind: "worldkit-episode-workflow-record",
  schemaVersion: 1,
  sceneId,
  episodeId,
  backend,
  status: "running",
  currentStage: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  finishedAt: null,
  error: null,
  stages: stageDefinitions.map(([id, title]) => ({ id, title, status: "pending", startedAt: null, finishedAt: null })),
};
try {
  const existing = JSON.parse(await readFile(recordPath, "utf8"));
  if (existing.sceneId === sceneId && existing.episodeId === episodeId) {
    record = { ...record, ...existing, status: "running", error: null, updatedAt: new Date().toISOString() };
    const priorStages = new Map((existing.stages ?? []).map((item) => [item.id, item]));
    record.stages = stageDefinitions.map(([id, title]) => ({
      id,
      title,
      status: "pending",
      startedAt: null,
      finishedAt: null,
      ...(priorStages.get(id) ?? {}),
      title,
    }));
  }
} catch {}

async function persist() {
  record.updatedAt = new Date().toISOString();
  await writeJsonAtomic(recordPath, record);
}
async function exists(filePath) {
  try { return (await stat(filePath)).size > 0; } catch { return false; }
}

async function hasCompleteFrameTelemetry(filePath) {
  try {
    const trace = JSON.parse(await readFile(filePath, "utf8"));
    return trace?.kind === "worldkit-executed-playthrough-trace" && trace.schemaVersion === 2 &&
      validatePlaythroughFrameTelemetry(trace.frameTelemetry).ok;
  } catch {
    return false;
  }
}
async function fileHash(filePath) {
  try {
    return `sha256:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
  } catch {
    return null;
  }
}
async function providerPromptHash(filePath) {
  try {
    const body = JSON.parse(await readFile(filePath, "utf8"));
    if (typeof body.prompt !== "string" || !body.prompt.trim()) return null;
    return `sha256:${createHash("sha256").update(body.prompt.trim()).digest("hex")}`;
  } catch {
    return null;
  }
}
async function readJsonIfPresent(filePath) {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return null; }
}
async function providerResultIsCurrent(
  index,
  { requireUpscale = false, requireFinal = false } = {},
) {
  const segmentId = `segment-0${index}`;
  const segmentRoot = path.join(episodeRoot, "video", segmentId);
  const request = await readJsonIfPresent(path.join(segmentRoot, "request.json"));
  const result = await readJsonIfPresent(path.join(segmentRoot, "provider-run.json"));
  if (request?.schemaVersion !== 2 || result?.modelChain?.length !== 2 ||
      result.modelChain[0] !== providerModel || result.modelChain[1] !== upscaleModel ||
      typeof result.providerTaskId !== "string") return false;
  const promptHash = await providerPromptHash(path.resolve(request.promptPath ?? ""));
  const referenceVideoHash = await fileHash(path.resolve(request.referenceVideoPath ?? ""));
  if (result.inputIdentity?.providerModel !== providerModel ||
      result.inputIdentity?.upscaleModel !== upscaleModel ||
      result.inputIdentity?.promptTemplateVersion !== EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION ||
      result.inputIdentity?.promptSha256 !== promptHash?.replace(/^sha256:/, "") ||
      result.inputIdentity?.referenceVideoSha256 !== referenceVideoHash?.replace(/^sha256:/, "")) return false;
  for (const [imageIndex, imagePath] of (request.referenceImagePaths ?? []).entries()) {
    const imageHash = await fileHash(path.resolve(imagePath));
    const key = `referenceImageSha256[${imageIndex}]:${path.basename(imagePath)}`;
    if (result.inputIdentity?.[key] !== imageHash?.replace(/^sha256:/, "")) return false;
  }
  if (!await exists(path.join(segmentRoot, rawProviderFileName))) return false;
  if (!requireUpscale && !requireFinal) {
    return ["seedance-ready", "upscale-submitted", "upscale-ready", "succeeded"].includes(result.status);
  }
  if (typeof result.upscaleTaskId !== "string" ||
      !await exists(path.join(segmentRoot, rawUpscaleFileName))) return false;
  if (!requireFinal) return ["upscale-ready", "succeeded"].includes(result.status);
  const finalPath = path.join(segmentRoot, finalVideoFileName);
  const finalHash = await fileHash(finalPath);
  return result.status === "succeeded" && result.output?.sha256 === finalHash?.replace(/^sha256:/, "") &&
    result.output?.frameParity === true && result.output?.deliveryResolutionConformant === true;
}
async function visualManifestMatchesCapture(filePath) {
  try {
    const manifest = JSON.parse(await readFile(filePath, "utf8"));
    if (!Array.isArray(manifest.sourceWhiteboxFirstFrames) || manifest.sourceWhiteboxFirstFrames.length !== 3) return false;
    for (let index = 0; index < 3; index += 1) {
      const source = manifest.sourceWhiteboxFirstFrames[index];
      if (source.segmentId !== `segment-0${index}` || source.contentHash !== await fileHash(path.join(
        episodeRoot, "whitebox", `segment-0${index}-first-frame.png`,
      ))) return false;
    }
    return true;
  } catch {
    return false;
  }
}
function writeOutput(chunk) {
  process.stdout.write(chunk);
  log.write(chunk);
}
function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
async function withRuntimeSlot(label, operation) {
  await mkdir(runtimeSlotRoot, { recursive: true });
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let waitingLogged = false;
  while (!stopping) {
    try {
      await mkdir(runtimeSlotPath);
      await writeFile(path.join(runtimeSlotPath, "owner.json"), JSON.stringify({
        pid: process.pid, token, label, acquiredAt: new Date().toISOString(),
      }));
      writeOutput(`WORLDKIT_EPISODE_RUNTIME_SLOT acquired ${label}\n`);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = await readJsonIfPresent(path.join(runtimeSlotPath, "owner.json"));
      let stale = false;
      if (owner) {
        const ageMs = Date.now() - Date.parse(owner.acquiredAt ?? "");
        stale = !processIsAlive(Number(owner.pid)) ||
          !Number.isFinite(ageMs) || ageMs > 2 * 60 * 60 * 1000;
      } else {
        const metadata = await stat(runtimeSlotPath);
        stale = Date.now() - metadata.mtimeMs > 30_000;
      }
      if (stale) {
        await rm(runtimeSlotPath, { recursive: true, force: true });
        continue;
      }
      if (!waitingLogged) {
        waitingLogged = true;
        writeOutput(`WORLDKIT_EPISODE_RUNTIME_SLOT waiting ${label}\n`);
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
    }
  }
  if (stopping) throw new Error("Episode workflow was stopped while waiting for Runtime slot.");
  try {
    return await operation();
  } finally {
    const owner = await readJsonIfPresent(path.join(runtimeSlotPath, "owner.json"));
    if (owner?.token === token) await rm(runtimeSlotPath, { recursive: true, force: true });
    writeOutput(`WORLDKIT_EPISODE_RUNTIME_SLOT released ${label}\n`);
  }
}
async function retryOperation(label, maximumAttempts, operation) {
  let lastError;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (stopping || attempt === maximumAttempts) throw error;
      writeOutput(
        `WORLDKIT_EPISODE_RETRY ${label} attempt=${attempt + 1}/${maximumAttempts}\n`,
      );
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
    }
  }
  throw lastError;
}
function run(command, commandArgs, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      shell: false,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    runningChildren.add(child);
    child.stdout.on("data", (chunk) => writeOutput(chunk));
    child.stderr.on("data", (chunk) => writeOutput(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      runningChildren.delete(child);
      if (code === 0) resolvePromise();
      else reject(new Error(stopping
        ? "Episode workflow was stopped by the user."
        : `${command} exited ${code ?? "null"} signal=${signal ?? "none"}`));
    });
  });
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopping = true;
    for (const child of runningChildren) if (!child.killed) child.kill("SIGTERM");
  });
}
async function stage(id, skipWhen, operation) {
  const item = record.stages.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown workflow stage: ${id}`);
  record.currentStage = id;
  item.status = "running";
  item.startedAt ??= new Date().toISOString();
  await persist();
  writeOutput(`WORLDKIT_EPISODE_WORKFLOW_STAGE ${id} running\n`);
  if (await skipWhen()) {
    item.status = "complete";
    item.finishedAt ??= new Date().toISOString();
    await persist();
    writeOutput(`WORLDKIT_EPISODE_WORKFLOW_STAGE ${id} resumed\n`);
    return;
  }
  await operation();
  item.status = "complete";
  item.finishedAt = new Date().toISOString();
  await persist();
  writeOutput(`WORLDKIT_EPISODE_WORKFLOW_STAGE ${id} complete\n`);
}

try {
  await access(path.join(sceneRoot, "world.mjs"));
  const reconRoot = path.join(episodeRoot, "planning/reconnaissance");
  await stage("reconnaissance",
    () => exists(path.join(reconRoot, "reconnaissance-report.json")),
    () => withRuntimeSlot(`reconnaissance:${episodeId}`, () =>
      run("pnpm", ["exec", "tsx", "scripts/episodes/inspect-playthrough-world.ts",
        "--scene-id", sceneId, "--origin", origin, "--play-path", "/play",
        "--output", reconRoot])));
  const planPath = path.join(episodeRoot, "planning/playthrough-plan.json");
  await stage("playthrough-plan", () => exists(planPath),
    () => run("bash", ["scripts/agents/run-lwdp-playthrough-planner-agent.sh",
      "--scene-id", sceneId, "--episode-id", episodeId, "--episode-root", episodeRoot,
      "--recon-root", reconRoot, "--backend", backend]));
  const whiteboxRoot = path.join(episodeRoot, "whitebox");
  const executedTracePath = path.join(whiteboxRoot, "executed-playthrough-trace.json");
  await stage("whitebox-capture",
    () => hasCompleteFrameTelemetry(executedTracePath),
    () => withRuntimeSlot(`whitebox-capture:${episodeId}`, () =>
      retryOperation("whitebox-capture", 3, async () => {
        await run("pnpm", ["exec", "tsx", "scripts/episodes/run-playthrough-capture.ts",
          "--scene-id", sceneId, "--origin", origin, "--play-path", "/play",
          "--plan", planPath, "--output", whiteboxRoot]);
        if (!await hasCompleteFrameTelemetry(executedTracePath)) {
          throw new Error("EPISODE_FRAME_TELEMETRY_CONFORMANCE_FAILED");
        }
      })));
  const visualManifest = path.join(episodeRoot, "visual/episode-visual-manifest.json");
  await stage("visual-reconstruction", () => visualManifestMatchesCapture(visualManifest),
    () => retryOperation("visual-reconstruction", 3, (attempt) =>
      run("bash", ["scripts/agents/run-lwdp-episode-visual-agent.sh",
        "--scene-id", sceneId, "--episode-id", episodeId,
        "--episode-root", episodeRoot, "--backend", backend,
        "--attempt", String(attempt)])));
  await stage("seedance-prompts",
    async () => false,
    () => run("node", ["scripts/episodes/build-episode-seedance-prompts.mjs",
      "--scene-id", sceneId, "--episode-id", episodeId,
      "--scene-root", sceneRoot, "--episode-root", episodeRoot]));
  await run("node", ["scripts/episodes/prepare-episode-video-requests.mjs",
    "--scene-id", sceneId, "--episode-id", episodeId, "--episode-root", episodeRoot]);
  const resultPaths = [0, 1, 2].map((index) =>
    path.join(episodeRoot, "video", `segment-0${index}`, "provider-run.json"));
  await stage("seedance-generation",
    async () => (await Promise.all([0, 1, 2].map((index) => providerResultIsCurrent(index)))).every(Boolean),
    () => Promise.all(resultPaths.map((resultPath, index) => run("python3", [
      "scripts/episodes/run-episode-video-segment.py",
      "--request", path.join(episodeRoot, "video", `segment-0${index}`, "request.json"),
      "--result", resultPath,
      "--until", "seedance",
    ]))));
  await stage("cf-upscale",
    async () => (await Promise.all([0, 1, 2].map((index) =>
      providerResultIsCurrent(index, { requireUpscale: true })))).every(Boolean),
    () => Promise.all(resultPaths.map((resultPath, index) => run("python3", [
      "scripts/episodes/run-episode-video-segment.py",
      "--request", path.join(episodeRoot, "video", `segment-0${index}`, "request.json"),
      "--result", resultPath,
      "--until", "upscale",
    ]))));
  await stage("conformance",
    async () => (await Promise.all([0, 1, 2].map((index) =>
      providerResultIsCurrent(index, { requireFinal: true })))).every(Boolean),
    () => Promise.all(resultPaths.map((resultPath, index) => run("python3", [
      "scripts/episodes/run-episode-video-segment.py",
      "--request", path.join(episodeRoot, "video", `segment-0${index}`, "request.json"),
      "--result", resultPath, "--until", "conformance",
    ]))));
  record.status = "succeeded";
  record.currentStage = null;
  record.finishedAt = new Date().toISOString();
  record.error = null;
  await persist();
  writeOutput(`WORLDKIT_EPISODE_WORKFLOW_READY ${episodeId}\n`);
} catch (error) {
  const item = record.stages.find((candidate) => candidate.id === record.currentStage);
  if (item) {
    item.status = stopping ? "cancelled" : "failed";
    item.finishedAt = new Date().toISOString();
  }
  record.status = stopping ? "cancelled" : "failed";
  record.finishedAt = new Date().toISOString();
  record.error = error instanceof Error ? error.message : String(error);
  await persist();
  writeOutput(`${stopping ? "WORLDKIT_EPISODE_WORKFLOW_CANCELLED" : "WORLDKIT_EPISODE_WORKFLOW_FAILED"} ${record.error}\n`);
  process.exitCode = stopping ? 130 : 1;
} finally {
  log.end();
}
