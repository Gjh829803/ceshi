#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readRemoteS3Artifact } from "../lib/cloud-s3-runtime.mjs";
import { downloadS3FileAtomic, joinS3Uri, uploadS3File } from
  "../lib/lwdp-generation-client.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const manifests = args.flatMap((item, index) =>
  item === "--manifest" && args[index + 1] ? [args[index + 1]] : []);
const concurrencyIndex = args.indexOf("--concurrency");
const concurrency = concurrencyIndex >= 0 ? Number(args[concurrencyIndex + 1]) : 10;
if (manifests.length === 0 || !Number.isSafeInteger(concurrency) ||
    concurrency < 1 || concurrency > 20) {
  throw new Error("Usage: run-direct-s3-video-production.mjs --manifest <s3-uri> [--manifest ...] [--concurrency 10]");
}

const config = JSON.parse(await readFile(
  path.join(repoRoot, "config/cloud-episode-production.json"), "utf8",
));
const workRoot = path.join(repoRoot, ".codex-tmp", "direct-s3-video-production");
const statePath = path.join(workRoot, "state.json");
await mkdir(workRoot, { recursive: true });
let state = await readFile(statePath, "utf8").then(JSON.parse).catch(() => ({
  kind: "worldkit-direct-s3-video-production",
  schemaVersion: 1,
  tasks: {},
}));
let stateWrite = Promise.resolve();

function run(command, commandArgs, { env = process.env, accept = [0] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (accept.includes(code)) resolve({ code, signal });
      else reject(new Error(`${command} exited ${code ?? signal}`));
    });
  });
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(`sha256:${hash.digest("hex")}`));
  });
}

async function mapConcurrent(items, limit, operation) {
  let next = 0;
  async function runner() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      await operation(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()));
}

async function persistState(taskId, patchValue) {
  state.tasks[taskId] = {
    ...(state.tasks[taskId] ?? {}),
    ...patchValue,
    updatedAt: new Date().toISOString(),
  };
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  stateWrite = stateWrite.then(async () => {
    const temporary = `${statePath}.${process.pid}.tmp`;
    await writeFile(temporary, serialized, { mode: 0o600 });
    await import("node:fs/promises").then(({ rename }) => rename(temporary, statePath));
  });
  await stateWrite;
}

async function hydrate(manifestS3Uri) {
  const bytes = await readRemoteS3Artifact(manifestS3Uri, {
    repoRoot,
    maximumBytes: 8 * 1024 * 1024,
  });
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest?.stageId !== "episode-style-prompts" ||
      manifest?.executionPart !== "style-prompts") {
    throw new Error(`Direct video production requires style-prompts: ${manifestS3Uri}`);
  }
  const root = path.join(workRoot, manifest.episodeId);
  const episodeRoot = path.join(root, "episode");
  const manifestPath = path.join(root, "style-prompts-manifest.json");
  await mkdir(root, { recursive: true });
  await writeFile(manifestPath, bytes, { mode: 0o600 });
  return { manifest, root, episodeRoot };
}

const hydrated = await Promise.all(manifests.map(hydrate));
const artifactDownloads = hydrated.flatMap(({ manifest, episodeRoot }) =>
  manifest.artifacts.map((artifact) => ({ artifact, episodeRoot })));
await mapConcurrent(artifactDownloads, 32, async ({ artifact, episodeRoot }) => {
  const artifactPath = String(artifact?.path ?? "");
  if (!artifactPath.startsWith("episode/") || artifactPath.split("/").includes("..")) {
    throw new Error(`Unsafe direct video artifact path: ${artifactPath}`);
  }
  const localPath = path.join(episodeRoot, artifactPath.slice("episode/".length));
  const current = await stat(localPath).catch(() => null);
  if (current?.size === artifact.byteSize &&
      await sha256File(localPath).catch(() => null) === artifact.sha256) return;
  await mkdir(path.dirname(localPath), { recursive: true });
  await downloadS3FileAtomic(artifact.s3Uri, localPath);
  const downloaded = await stat(localPath);
  if (downloaded.size !== artifact.byteSize || await sha256File(localPath) !== artifact.sha256) {
    throw new Error(`Direct video artifact verification failed: ${artifactPath}`);
  }
});

await Promise.all(hydrated.map(async ({ manifest, episodeRoot }) => {
  for (let styleIndex = 0; styleIndex < 10; styleIndex += 1) {
    const styleVariantId = `style-${String(styleIndex).padStart(2, "0")}`;
    await run("node", [
      "scripts/episodes/prepare-episode-video-requests.mjs",
      "--scene-id", manifest.sceneId,
      "--episode-id", manifest.episodeId,
      "--episode-root", episodeRoot,
      "--style-root", path.join(episodeRoot, "style-variants", styleVariantId),
      "--style-variant-id", styleVariantId,
    ]);
  }
}));
const tasks = hydrated.flatMap(({ manifest, root, episodeRoot }) =>
  Array.from({ length: 10 }, (_, styleIndex) => {
    const styleVariantId = `style-${String(styleIndex).padStart(2, "0")}`;
    const styleRoot = path.join(episodeRoot, "style-variants", styleVariantId);
    return Array.from({ length: 6 }, (_, segmentIndex) => {
      const segmentId = `segment-${String(segmentIndex).padStart(2, "0")}`;
      return {
        manifest,
        root,
        episodeRoot,
        styleVariantId,
        segmentId,
        segmentRoot: path.join(styleRoot, "video", segmentId),
      };
    });
  }).flat());

let nextTask = 0;
async function worker() {
  for (;;) {
    const index = nextTask;
    nextTask += 1;
    if (index >= tasks.length) return;
    const task = tasks[index];
    const taskId = `${task.manifest.episodeId}/${task.styleVariantId}/${task.segmentId}`;
    const outputPrefix = joinS3Uri(
      config.outputS3Root,
      task.manifest.sceneId,
      task.manifest.episodeId,
    );
    const directPrefix = joinS3Uri(
      outputPrefix,
      "direct-video",
      task.styleVariantId,
      task.segmentId,
    );
    if (state.tasks[taskId]?.status === "succeeded") continue;
    await persistState(taskId, { status: "running", error: null });
    try {
      const journal = path.join(task.segmentRoot, "provider-run.json");
      const journalS3Uri = joinS3Uri(
        outputPrefix,
        "provider-journals",
        task.manifest.episodeId,
        task.styleVariantId,
        task.segmentId,
        "provider-run.json",
      );
      if (!await exists(journal)) {
        await downloadS3FileAtomic(journalS3Uri, journal).catch(() => undefined);
      }
      await run("python3", [
        "scripts/episodes/run-episode-video-segment.py",
        "--request", path.join(task.segmentRoot, "request.json"),
        "--result", journal,
        "--until", "conformance",
      ], {
        env: {
          ...process.env,
          WORLDKIT_CLOUD_EXECUTION_ID: "direct-s3-video-production",
          WORLDKIT_PROVIDER_JOURNAL_S3_PREFIX: joinS3Uri(
            outputPrefix,
            "provider-journals",
          ),
        },
      });
      const files = (await import("node:fs/promises")).readdir(task.segmentRoot);
      for (const fileName of await files) {
        if (!/\.(?:mp4|json)$/.test(fileName)) continue;
        await uploadS3File(
          path.join(task.segmentRoot, fileName),
          joinS3Uri(directPrefix, fileName),
        );
      }
      await persistState(taskId, {
        status: "succeeded",
        outputS3Prefix: directPrefix,
      });
      for (const fileName of await (await import("node:fs/promises")).readdir(task.segmentRoot)) {
        if (fileName.endsWith(".mp4")) {
          await rm(path.join(task.segmentRoot, fileName), { force: true });
        }
      }
      process.stdout.write(`WORLDKIT_DIRECT_VIDEO_READY ${taskId} ${directPrefix}\n`);
    } catch (error) {
      await persistState(taskId, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      process.stderr.write(`WORLDKIT_DIRECT_VIDEO_FAILED ${taskId} ${error.message}\n`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
const failed = Object.values(state.tasks).filter(({ status }) => status === "failed").length;
process.stdout.write(`WORLDKIT_DIRECT_VIDEO_BATCH_COMPLETE tasks=${tasks.length} failed=${failed}\n`);
if (failed > 0) process.exitCode = 1;
