import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import {
  buildStaticReviewModel,
  writeStaticReviewBundle,
} from "./build-seedance-static-review.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_BUCKET = "leap-world-us-east-2";
const DEFAULT_PREFIX = "world-model/sft/worldkit_seedance_review";
const DEFAULT_SOURCE_ORIGIN = "http://127.0.0.1:4398";
const DEFAULT_EPISODES_ROOT = resolve(PROJECT_ROOT, "artifacts/episodes");
const DEFAULT_CONCURRENCY = 8;

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unknown argument '${token}'.`);
    const key = token.slice(2);
    if (key === "dry-run") {
      values[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Argument '--${key}' requires a value.`);
    }
    values[key] = value;
    index += 1;
  }
  return values;
}

function releaseIdNow() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function awsEnvironment() {
  const credentials = resolve(PROJECT_ROOT, ".codex-tmp/runtime-config/aws-credentials");
  const config = resolve(PROJECT_ROOT, ".codex-tmp/runtime-config/aws-config");
  return {
    ...process.env,
    AWS_ACCESS_KEY_ID: undefined,
    AWS_SECRET_ACCESS_KEY: undefined,
    AWS_SESSION_TOKEN: undefined,
    AWS_PROFILE: undefined,
    AWS_DEFAULT_PROFILE: undefined,
    HTTP_PROXY: undefined,
    HTTPS_PROXY: undefined,
    ALL_PROXY: undefined,
    http_proxy: undefined,
    https_proxy: undefined,
    all_proxy: undefined,
    AWS_SHARED_CREDENTIALS_FILE: credentials,
    AWS_CONFIG_FILE: config,
    AWS_SDK_LOAD_CONFIG: "1",
  };
}

async function ensureRuntimeCredentials() {
  await Promise.all([
    access(resolve(PROJECT_ROOT, ".codex-tmp/runtime-config/aws-credentials")),
    access(resolve(PROJECT_ROOT, ".codex-tmp/runtime-config/aws-config")),
  ]);
}

async function run(command, args, options = {}) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? PROJECT_ROOT,
      env: options.env ?? process.env,
      stdio: options.quiet ? ["ignore", "ignore", "pipe"] : "inherit",
    });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited ${code}: ${stderr.trim()}`));
    });
  });
}

async function awsCopy(source, bucket, key, cacheControl) {
  await run("aws", [
    "s3",
    "cp",
    source,
    `s3://${bucket}/${key}`,
    "--only-show-errors",
    "--cache-control",
    cacheControl,
  ], { env: awsEnvironment(), quiet: true });
}

async function awsSync(sourceDirectory, bucket, prefix) {
  await run("aws", [
    "s3",
    "sync",
    sourceDirectory,
    `s3://${bucket}/${prefix}`,
    "--exclude",
    "data/publication-plan.json",
    "--only-show-errors",
    "--cache-control",
    "public,max-age=31536000,immutable",
  ], { env: awsEnvironment(), quiet: true });
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}.`);
  return response.json();
}

async function downloadToTemporaryFile(sourceUrl, destination, temporaryDirectory) {
  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok || response.body === null) {
    throw new Error(`GET ${sourceUrl} returned HTTP ${response.status}.`);
  }
  const suffix = basename(destination).includes(".")
    ? `.${basename(destination).split(".").at(-1)}`
    : ".bin";
  const path = join(
    temporaryDirectory,
    `${createHash("sha256").update(destination).digest("hex")}${suffix}`,
  );
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
  const info = await stat(path);
  if (info.size === 0) throw new Error(`GET ${sourceUrl} produced an empty file.`);
  return path;
}

function sourceUrl(origin, path) {
  return new URL(path, `${origin.replace(/\/$/, "")}/`).href;
}

async function mapConcurrent(items, concurrency, worker) {
  let cursor = 0;
  let completed = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
      completed += 1;
      if (completed % 20 === 0 || completed === items.length) {
        process.stdout.write(`uploaded ${completed}/${items.length}\n`);
      }
    }
  });
  await Promise.all(runners);
}

function localArtifactPath(episodesRoot, request) {
  const episodeRoot = resolve(episodesRoot, request.episodeId);
  const candidate = resolve(episodeRoot, request.sourceRelativePath);
  if (!candidate.startsWith(`${episodeRoot}/`)) {
    throw new Error(`Artifact escapes Episode root: ${request.sourceRelativePath}`);
  }
  return candidate;
}

async function publishRequests(input) {
  const unique = new Map();
  for (const request of input.requests) {
    const previous = unique.get(request.destination);
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(request)) {
      throw new Error(`Conflicting publication destination '${request.destination}'.`);
    }
    unique.set(request.destination, request);
  }
  const requests = [...unique.values()];
  await mapConcurrent(requests, input.concurrency, async (request) => {
    const key = `${input.releasePrefix}/${request.destination}`;
    if (request.kind === "episode-artifact") {
      const source = localArtifactPath(input.episodesRoot, request);
      const info = await stat(source);
      if (!info.isFile() || info.size === 0) {
        throw new Error(`Episode artifact is unavailable: ${source}`);
      }
      await awsCopy(source, input.bucket, key, "public,max-age=31536000,immutable");
      return;
    }
    const temporaryFile = await downloadToTemporaryFile(
      sourceUrl(input.sourceOrigin, request.sourcePath),
      request.destination,
      input.temporaryDirectory,
    );
    try {
      await awsCopy(
        temporaryFile,
        input.bucket,
        key,
        "public,max-age=31536000,immutable",
      );
    } finally {
      await rm(temporaryFile, { force: true });
    }
  });
}

function latestRedirectHtml(releaseId) {
  const target = `../releases/${releaseId}/index.html`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${target}"><title>WorldKit Seedance Review</title></head><body><script>location.replace(${JSON.stringify(target)}+location.search+location.hash)</script><a href="${target}">打开 WorldKit Seedance Review</a></body></html>\n`;
}

async function validatePublishedRelease(bucket, releasePrefix, model) {
  const sample = model.catalog.episodes[0];
  const keys = [
    `${releasePrefix}/index.html`,
    `${releasePrefix}/data/catalog.json`,
    `${releasePrefix}/${sample.manifestUrl}`,
    `${releasePrefix}/${sample.posterUrl}`,
  ];
  for (const key of keys) {
    await run("aws", ["s3api", "head-object", "--bucket", bucket, "--key", key], {
      env: awsEnvironment(),
      quiet: true,
    });
  }
}

export async function publishStaticReview(options) {
  await ensureRuntimeCredentials();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "worldkit-seedance-publish-"));
  try {
    const payload = await fetchJson(`${options.sourceOrigin.replace(/\/$/, "")}/api/episode-workflows?review=seedance`);
    const model = buildStaticReviewModel(payload);
    const releaseDirectory = join(temporaryDirectory, "release");
    await writeStaticReviewBundle(releaseDirectory, model);
    const releasePrefix = `${options.prefix}/releases/${options.releaseId}`;
    if (options.dryRun) {
      return {
        dryRun: true,
        releaseId: options.releaseId,
        releasePrefix,
        episodeCount: model.catalog.episodes.length,
        requestCount: model.requests.length,
      };
    }
    await awsSync(releaseDirectory, options.bucket, releasePrefix);
    await publishRequests({
      requests: model.requests,
      sourceOrigin: options.sourceOrigin,
      episodesRoot: options.episodesRoot,
      bucket: options.bucket,
      releasePrefix,
      temporaryDirectory,
      concurrency: options.concurrency,
    });
    await validatePublishedRelease(options.bucket, releasePrefix, model);
    const latestIndex = join(temporaryDirectory, "latest-index.html");
    await writeFile(latestIndex, latestRedirectHtml(options.releaseId));
    await Promise.all([
      awsCopy(latestIndex, options.bucket, `${options.prefix}/latest/index.html`, "no-store"),
      awsCopy(
        join(releaseDirectory, "data", "catalog.json"),
        options.bucket,
        `${options.prefix}/latest/catalog.json`,
        "no-store",
      ),
    ]);
    return {
      dryRun: false,
      releaseId: options.releaseId,
      releasePrefix,
      episodeCount: model.catalog.episodes.length,
      requestCount: model.requests.length,
      releaseIdentitySha256: model.catalog.releaseIdentitySha256,
      latestUrl: `https://${options.bucket}.s3.us-east-2.amazonaws.com/${options.prefix}/latest/index.html`,
      releaseUrl: `https://${options.bucket}.s3.us-east-2.amazonaws.com/${releasePrefix}/index.html`,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const concurrency = Number(args.concurrency ?? DEFAULT_CONCURRENCY);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error("--concurrency must be an integer from 1 through 32.");
  }
  const result = await publishStaticReview({
    sourceOrigin: args["source-origin"] ?? DEFAULT_SOURCE_ORIGIN,
    episodesRoot: resolve(args["episodes-root"] ?? DEFAULT_EPISODES_ROOT),
    bucket: args.bucket ?? DEFAULT_BUCKET,
    prefix: (args.prefix ?? DEFAULT_PREFIX).replace(/^\/+|\/+$/g, ""),
    releaseId: args["release-id"] ?? releaseIdNow(),
    concurrency,
    dryRun: args["dry-run"] === true,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
