#!/usr/bin/env node
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { joinS3Uri, uploadS3File } from "../lib/lwdp-generation-client.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  if (fallback !== null) return fallback;
  throw new Error(`Missing ${name}.`);
};
const requestPath = path.resolve(option("--request"));
const resultPath = path.resolve(option("--result"));
const until = option("--until", "conformance");
const primaryConfigPath = path.resolve(
  repoRoot,
  option("--config", "config/episode-video-pipeline.json"),
);
if (!["seedance", "conformance"].includes(until)) {
  throw new Error("--until must be seedance or conformance.");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

function runPython(configPath, activeRequestPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [
      "scripts/episodes/run-episode-video-segment.py",
      "--request", activeRequestPath,
      "--result", resultPath,
      "--config", configPath,
      "--until", until,
    ], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({
      ok: code === 0,
      code,
      signal,
    }));
  });
}

async function uploadRouterSidecar(filePath, identity) {
  const root = process.env.WORLDKIT_PROVIDER_JOURNAL_S3_PREFIX;
  if (!root || !identity?.episodeId || !identity?.segmentId) return;
  await uploadS3File(filePath, joinS3Uri(
    root,
    identity.episodeId,
    ...(identity.styleVariantId ? [identity.styleVariantId] : []),
    identity.segmentId,
    path.basename(filePath),
  ));
}

async function ensureFallbackRequest() {
  const request = await readJson(requestPath);
  const directory = path.dirname(request.rawProviderOutputPath);
  const fallbackRequest = {
    ...request,
    rawProviderOutputPath: path.join(directory, "mg-seedance-2.5-480p.mp4"),
    rawUpscaleOutputPath: path.join(directory, "cf-upscaled-720p.mp4"),
  };
  await writeJsonAtomic(fallbackRequestPath, fallbackRequest);
}

const primaryConfig = await readJson(primaryConfigPath);
const fallbackRelativePath = primaryConfig?.fallback?.pipelineConfigPath;
const routePath = resultPath.replace(/\.json$/, ".route.json");
const primaryJournalPath = resultPath.replace(/\.json$/, ".primary.json");
const fallbackRequestPath = requestPath.replace(/\.json$/, ".mg-fallback.json");
const existingRoute = await readFile(routePath, "utf8").then(JSON.parse).catch(() => null);

if (existingRoute?.selectedProvider === "fallback") {
  const fallbackConfigPath = path.resolve(
    repoRoot,
    existingRoute.fallbackPipelineConfigPath,
  );
  await ensureFallbackRequest();
  const fallbackResult = await runPython(fallbackConfigPath, fallbackRequestPath);
  if (!fallbackResult.ok) process.exitCode = fallbackResult.code ?? 1;
} else {
  const primaryResult = await runPython(primaryConfigPath, requestPath);
  if (primaryResult.ok) {
    const currentJournal = await readJson(resultPath);
    await writeJsonAtomic(routePath, {
      kind: "worldkit-episode-video-provider-route",
      schemaVersion: 1,
      selectedProvider: "primary",
      primaryProviderKind: primaryConfig.seedanceProvider?.kind,
      primaryPipelineConfigPath: path.relative(repoRoot, primaryConfigPath),
      updatedAt: new Date().toISOString(),
    });
    await uploadRouterSidecar(routePath, currentJournal);
  } else {
    const primaryJournal = await readFile(resultPath, "utf8")
      .then(JSON.parse)
      .catch(() => null);
    const triggerStatuses = new Set(
      primaryConfig?.fallback?.triggerTerminalStatuses ?? [],
    );
    if (!fallbackRelativePath || !triggerStatuses.has(primaryJournal?.status)) {
      process.exitCode = primaryResult.code ?? 1;
    } else {
      const fallbackConfigPath = path.resolve(repoRoot, fallbackRelativePath);
      if (primaryConfig.fallback.preservePrimaryJournal !== false) {
        await copyFile(resultPath, primaryJournalPath);
      }
      await ensureFallbackRequest();
      const fallbackConfig = await readJson(fallbackConfigPath);
      await writeJsonAtomic(routePath, {
        kind: "worldkit-episode-video-provider-route",
        schemaVersion: 1,
        selectedProvider: "fallback",
        fallbackReason: `primary-terminal-${primaryJournal.status}`,
        primaryProviderKind: primaryConfig.seedanceProvider?.kind,
        primaryPipelineConfigPath: path.relative(repoRoot, primaryConfigPath),
        primaryJournalPath: path.basename(primaryJournalPath),
        fallbackProviderKind: fallbackConfig.seedanceProvider?.kind,
        fallbackPipelineConfigPath: path.relative(repoRoot, fallbackConfigPath),
        updatedAt: new Date().toISOString(),
      });
      await Promise.all([
        uploadRouterSidecar(primaryJournalPath, primaryJournal),
        uploadRouterSidecar(routePath, primaryJournal),
      ]);
      const fallbackResult = await runPython(fallbackConfigPath, fallbackRequestPath);
      if (!fallbackResult.ok) process.exitCode = fallbackResult.code ?? 1;
    }
  }
}
