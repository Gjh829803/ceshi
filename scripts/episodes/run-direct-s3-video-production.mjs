#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { readRemoteS3Artifact } from "../lib/cloud-s3-runtime.mjs";
import { downloadS3FileAtomic, joinS3Uri, uploadS3File } from
  "../lib/lwdp-generation-client.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const manifests = args.flatMap((item, index) =>
  item === "--manifest" && args[index + 1] ? [args[index + 1]] : []);
const concurrencyIndex = args.indexOf("--concurrency");
const concurrency = concurrencyIndex >= 0 ? Number(args[concurrencyIndex + 1]) : 10;
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const pipelineConfigPath = path.resolve(repoRoot, option(
  "--pipeline-config",
  "config/episode-video-pipeline.json",
));
const taskListPath = args.includes("--task-list")
  ? path.resolve(repoRoot, option("--task-list", ""))
  : null;
const excludedTaskListPath = args.includes("--exclude-task-list")
  ? path.resolve(repoRoot, option("--exclude-task-list", ""))
  : null;
const runId = option("--run-id", "default");
const journalNamespace = option("--journal-namespace", "provider-journals");
const outputNamespace = option("--output-namespace", "direct-video");
const dryRun = args.includes("--dry-run");
if (manifests.length === 0 || !Number.isSafeInteger(concurrency) ||
    concurrency < 1 || concurrency > 50 || (taskListPath && excludedTaskListPath) ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(runId) ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(journalNamespace) ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(outputNamespace)) {
  throw new Error(
    "Usage: run-direct-s3-video-production.mjs --manifest <s3-uri> " +
    "[--manifest ...] [--concurrency 50] [--pipeline-config <json>] " +
    "[--task-list <json> | --exclude-task-list <json>] [--run-id <id>] " +
    "[--journal-namespace <name>] " +
    "[--output-namespace <name>]",
  );
}

const config = JSON.parse(await readFile(
  path.join(repoRoot, "config/cloud-episode-production.json"), "utf8",
));
const videoPipeline = JSON.parse(await readFile(
  pipelineConfigPath, "utf8",
));
const execFileAsync = promisify(execFile);
const workRoot = runId === "default"
  ? path.join(repoRoot, ".codex-tmp", "direct-s3-video-production")
  : path.join(repoRoot, ".codex-tmp", "direct-s3-video-production", runId);
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

function episodeArtifactPath(absolutePath, episodeId) {
  const marker = `/artifacts/episodes/${episodeId}/`;
  const normalized = String(absolutePath ?? "").replaceAll("\\", "/");
  const index = normalized.indexOf(marker);
  if (index < 0) throw new Error(`Episode request path is not portable: ${absolutePath}`);
  return `episode/${normalized.slice(index + marker.length)}`;
}

async function readS3Json(s3Uri, maximumBytes = 4 * 1024 * 1024) {
  const bytes = await readRemoteS3Artifact(s3Uri, { repoRoot, maximumBytes });
  return JSON.parse(bytes.toString("utf8"));
}

function parseIni(contents, profile) {
  let current = "";
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section) { current = section[1]; continue; }
    if (current !== profile) continue;
    const separator = line.indexOf("=");
    if (separator > 0) values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

const awsCredentialsFile = process.env.AWS_SHARED_CREDENTIALS_FILE ||
  path.join(repoRoot, ".codex-tmp/runtime-config/aws-credentials");
const awsCredentials = parseIni(await readFile(
  awsCredentialsFile,
  "utf8",
), process.env.AWS_PROFILE || "default");
if (!awsCredentials.aws_access_key_id || !awsCredentials.aws_secret_access_key) {
  throw new Error("Direct S3 video production requires static project AWS credentials.");
}

const rfc3986 = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
  `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const hex = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
const bucketRegionPromises = new Map();

async function regionForBucket(bucket) {
  if (!bucketRegionPromises.has(bucket)) {
    bucketRegionPromises.set(bucket, (async () => {
      const { stdout } = await execFileAsync("aws", [
        "s3api", "get-bucket-location", "--bucket", bucket,
        "--query", "LocationConstraint", "--output", "json",
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          AWS_SHARED_CREDENTIALS_FILE: awsCredentialsFile,
        },
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      });
      const location = JSON.parse(stdout);
      if (location === null || location === "") return "us-east-1";
      if (location === "EU") return "eu-west-1";
      if (typeof location !== "string" || !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(location)) {
        throw new Error(`S3 returned an invalid region for ${bucket}.`);
      }
      return location;
    })());
  }
  return bucketRegionPromises.get(bucket);
}

async function presign(s3Uri) {
  const parsed = new URL(s3Uri);
  const bucket = parsed.hostname;
  const key = parsed.pathname.slice(1);
  const awsRegion = await regionForBucket(bucket);
  const host = `${bucket}.s3.${awsRegion}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${awsRegion}/s3/aws4_request`;
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${awsCredentials.aws_access_key_id}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": "21600",
    "X-Amz-SignedHeaders": "host",
    ...(awsCredentials.aws_session_token
      ? { "X-Amz-Security-Token": awsCredentials.aws_session_token }
      : {}),
  };
  const canonicalQuery = Object.entries(query)
    .map(([name, value]) => [rfc3986(name), rfc3986(value)])
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  const canonicalUri = `/${key.split("/").map(rfc3986).join("/")}`;
  const canonicalRequest = [
    "GET", canonicalUri, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    hex(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(`AWS4${awsCredentials.aws_secret_access_key}`, dateStamp);
  const regionKey = hmac(dateKey, awsRegion);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

async function assertProviderInputReadable(url, label) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Range: "bytes=0-0" },
    redirect: "manual",
  });
  await response.body?.cancel();
  if (![200, 206].includes(response.status)) {
    throw new Error(`${label} is not directly readable: HTTP ${response.status}`);
  }
}

async function inspectManifest(manifestS3Uri) {
  const bytes = await readRemoteS3Artifact(manifestS3Uri, {
    repoRoot,
    maximumBytes: 8 * 1024 * 1024,
  });
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest?.stageId !== "episode-style-prompts" ||
      manifest?.executionPart !== "style-prompts") {
    throw new Error(`Direct video production requires style-prompts: ${manifestS3Uri}`);
  }
  const artifactMap = new Map(manifest.artifacts.map((artifact) => [artifact.path, artifact]));
  const requestArtifacts = manifest.artifacts.filter((artifact) =>
    /^episode\/style-variants\/style-\d{2}\/video\/segment-\d{2}\/request\.json$/
      .test(artifact.path));
  if (requestArtifacts.length < 6 || requestArtifacts.length % 6 !== 0) {
    throw new Error(`Direct video manifest contains an incomplete approved style: ${manifest.episodeId}`);
  }
  process.stdout.write(
    `WORLDKIT_DIRECT_VIDEO_INPUT ${manifest.episodeId} ` +
      `approvedStyles=${requestArtifacts.length / 6} tasks=${requestArtifacts.length}\n`,
  );
  return { manifest, artifactMap, requestArtifacts };
}

const inspected = await Promise.all(manifests.map(inspectManifest));
const taskListRecord = taskListPath
  ? JSON.parse(await readFile(taskListPath, "utf8"))
  : null;
const excludedTaskListRecord = excludedTaskListPath
  ? JSON.parse(await readFile(excludedTaskListPath, "utf8"))
  : null;
const taskIdsFromRecord = (record, label) => {
  const values = Array.isArray(record) ? record : record?.taskIds;
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
    throw new Error(`${label} must be a JSON array or { taskIds: string[] }.`);
  }
  return values;
};
const allowedTaskIds = taskListPath
  ? new Set(taskIdsFromRecord(taskListRecord, "Direct video task list"))
  : null;
const excludedTaskIds = excludedTaskListPath
  ? new Set(taskIdsFromRecord(excludedTaskListRecord, "Direct video exclusion list"))
  : null;
const allTasks = inspected.flatMap(({ manifest, artifactMap, requestArtifacts }) =>
  requestArtifacts.map((requestArtifact) => {
    const match = /\/(style-\d{2})\/video\/(segment-\d{2})\/request\.json$/.exec(
      requestArtifact.path,
    );
    return {
      manifest,
      artifactMap,
      requestArtifact,
      styleVariantId: match[1],
      segmentId: match[2],
      segmentRoot: path.join(
        workRoot,
        "outputs",
        manifest.episodeId,
        match[1],
        match[2],
      ),
    };
  }));
const tasks = allTasks.filter((task) => {
  const taskId = `${task.manifest.episodeId}/${task.styleVariantId}/${task.segmentId}`;
  return (!allowedTaskIds || allowedTaskIds.has(taskId)) &&
    (!excludedTaskIds || !excludedTaskIds.has(taskId));
});
if (allowedTaskIds) {
  const selected = new Set(tasks.map((task) =>
    `${task.manifest.episodeId}/${task.styleVariantId}/${task.segmentId}`));
  const missing = [...allowedTaskIds].filter((taskId) => !selected.has(taskId));
  if (missing.length > 0) {
    throw new Error(`Task list includes ${missing.length} unknown task(s): ${missing.slice(0, 3).join(", ")}`);
  }
}
process.stdout.write(
  `WORLDKIT_DIRECT_VIDEO_POOL run=${runId} provider=${videoPipeline.seedanceProvider.kind} ` +
    `selected=${tasks.length} available=${allTasks.length} concurrency=${concurrency}\n`,
);
if (dryRun) process.exit(0);

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
      outputNamespace,
      task.styleVariantId,
      task.segmentId,
    );
    if (state.tasks[taskId]?.status === "succeeded") continue;
    await persistState(taskId, { status: "running", error: null });
    let remoteRequestPath = null;
    try {
      const sourceRequest = await readS3Json(task.requestArtifact.s3Uri);
      const artifactFor = (absolutePath) => {
        const artifactPath = episodeArtifactPath(absolutePath, task.manifest.episodeId);
        const artifact = task.artifactMap.get(artifactPath);
        if (!artifact) throw new Error(`Style Prompt manifest omitted ${artifactPath}`);
        return artifact;
      };
      const promptArtifact = artifactFor(sourceRequest.promptPath);
      const promptRecord = await readS3Json(promptArtifact.s3Uri);
      const videoArtifact = artifactFor(sourceRequest.referenceVideoPath);
      const imageArtifacts = sourceRequest.referenceImagePaths.map(artifactFor);
      const [videoUrl, ...imageUrls] = await Promise.all([
        presign(videoArtifact.s3Uri),
        ...imageArtifacts.map((artifact) => presign(artifact.s3Uri)),
      ]);
      await Promise.all([
        assertProviderInputReadable(videoUrl, "reference video"),
        ...imageUrls.map((url, imageIndex) =>
          assertProviderInputReadable(url, `reference image ${imageIndex + 1}`)),
      ]);
      await mkdir(task.segmentRoot, { recursive: true });
      const model = String(videoPipeline.seedance.model);
      const delivery = videoPipeline.delivery;
      remoteRequestPath = path.join(task.segmentRoot, "request.remote.json");
      await writeFile(remoteRequestPath, `${JSON.stringify({
        kind: "worldkit-episode-video-segment-request",
        schemaVersion: 3,
        sceneId: task.manifest.sceneId,
        episodeId: task.manifest.episodeId,
        styleVariantId: task.styleVariantId,
        segmentId: task.segmentId,
        prompt: promptRecord.prompt,
        referenceVideo: {
          name: path.basename(sourceRequest.referenceVideoPath),
          sha256: videoArtifact.sha256,
          url: videoUrl,
        },
        referenceImages: imageArtifacts.map((artifact, imageIndex) => ({
          name: path.basename(sourceRequest.referenceImagePaths[imageIndex]),
          sha256: artifact.sha256,
          url: imageUrls[imageIndex],
        })),
        rawProviderOutputPath: path.join(task.segmentRoot, `${model}.mp4`),
        rawUpscaleOutputPath: path.join(task.segmentRoot, "cf-upscaled-720p.mp4"),
        outputPath: path.join(
          task.segmentRoot,
          `final-${delivery.width}x${delivery.height}-${delivery.fps}fps-${delivery.frameCount}f.mp4`,
        ),
      }, null, 2)}\n`, { mode: 0o600 });
      const journal = path.join(task.segmentRoot, "provider-run.json");
      const journalS3Uri = joinS3Uri(
        outputPrefix,
        journalNamespace,
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
        "--request", remoteRequestPath,
        "--result", journal,
        "--config", pipelineConfigPath,
        "--until", "conformance",
      ], {
        env: {
          ...process.env,
          WORLDKIT_PROVIDER_JOURNAL_S3_PREFIX: joinS3Uri(
            outputPrefix,
            journalNamespace,
          ),
        },
      });
      for (const fileName of await readdir(task.segmentRoot)) {
        if (!/\.(?:mp4|json)$/.test(fileName)) continue;
        if (fileName === "request.remote.json") continue;
        await uploadS3File(
          path.join(task.segmentRoot, fileName),
          joinS3Uri(directPrefix, fileName),
        );
      }
      await persistState(taskId, {
        status: "succeeded",
        outputS3Prefix: directPrefix,
      });
      for (const fileName of await readdir(task.segmentRoot)) {
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
    } finally {
      if (remoteRequestPath) await rm(remoteRequestPath, { force: true });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
const failed = Object.values(state.tasks).filter(({ status }) => status === "failed").length;
process.stdout.write(`WORLDKIT_DIRECT_VIDEO_BATCH_COMPLETE tasks=${tasks.length} failed=${failed}\n`);
if (failed > 0) process.exitCode = 1;
