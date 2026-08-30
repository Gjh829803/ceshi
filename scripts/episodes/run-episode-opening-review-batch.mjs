#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeJsonAtomic } from "../lib/playthrough-dataset.mjs";

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = path.resolve(option("--config", path.join(repoRoot, "config/episode-opening-review-batch.json")));
const config = JSON.parse(await readFile(configPath, "utf8"));
const concurrency = Number(option("--concurrency", config.concurrency ?? 10));
if (!/^[a-z0-9][a-z0-9-]{2,119}$/.test(config.batchId ?? "") ||
    !/^[a-z0-9][a-z0-9-]{2,119}$/.test(config.reviewId ?? "") ||
    !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 20 ||
    !Array.isArray(config.episodes) || config.episodes.length === 0) {
  throw new Error("Episode opening-review batch config is invalid.");
}

const batchRoot = path.join(repoRoot, "artifacts/episode-opening-review-batches", config.batchId);
const manifestPath = path.join(batchRoot, "manifest.json");
await mkdir(batchRoot, { recursive: true });
const idPattern = /^[a-z0-9][a-z0-9-]{2,119}$/;
const items = config.episodes.map((item) => {
  if (!idPattern.test(item?.sceneId ?? "") || !idPattern.test(item?.episodeId ?? "")) {
    throw new Error("Batch episode identity is invalid.");
  }
  return {
    sceneId: item.sceneId,
    episodeId: item.episodeId,
    status: "pending",
    startedAt: null,
    finishedAt: null,
    error: null,
    outputRoot: `artifacts/episodes/${item.episodeId}/visual-reviews/${config.reviewId}`,
  };
});
const manifest = {
  kind: "worldkit-episode-opening-review-batch",
  schemaVersion: 1,
  batchId: config.batchId,
  reviewId: config.reviewId,
  concurrency,
  totalImages: items.length * 3,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  items,
};
let persistQueue = Promise.resolve();
const persist = () => {
  manifest.updatedAt = new Date().toISOString();
  persistQueue = persistQueue.then(() => writeJsonAtomic(manifestPath, manifest));
  return persistQueue;
};
await persist();

async function runItem(item) {
  item.status = "running";
  item.startedAt = new Date().toISOString();
  await persist();
  const logPath = path.join(batchRoot, `${item.episodeId}.log`);
  const child = spawn("bash", [
    "scripts/agents/run-lwdp-episode-opening-review-agent.sh",
    "--scene-id", item.sceneId,
    "--episode-id", item.episodeId,
    "--episode-root", path.join(repoRoot, "artifacts/episodes", item.episodeId),
    "--review-id", config.reviewId,
    "--backend", config.backend ?? "cloud",
  ], { cwd: repoRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
    process.stdout.write(`[${item.sceneId}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
    process.stderr.write(`[${item.sceneId}] ${chunk}`);
  });
  const exitCode = await new Promise((resolve) => {
    child.once("error", () => resolve(1));
    child.once("close", (code) => resolve(code ?? 1));
  });
  await writeFile(logPath, output, "utf8");
  item.finishedAt = new Date().toISOString();
  item.status = exitCode === 0 ? "passed" : "failed";
  item.error = exitCode === 0 ? null : `opening-review runner exited with code ${exitCode}`;
  await persist();
}

let cursor = 0;
async function worker() {
  while (cursor < items.length) {
    const index = cursor;
    cursor += 1;
    await runItem(items[index]);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
await persistQueue;
const passed = items.filter((item) => item.status === "passed").length;
const failed = items.length - passed;
process.stdout.write(`WORLDKIT_EPISODE_OPENING_REVIEW_BATCH batch=${config.batchId} passed=${passed} failed=${failed} images=${passed * 3}\n`);
if (failed > 0) process.exitCode = 1;
