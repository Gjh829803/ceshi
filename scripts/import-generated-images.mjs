#!/usr/bin/env node

import { copyFile, lstat, mkdir, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

function parseArgs(argv) {
  const options = { targets: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (["--codex-home", "--transcript", "--stage-started", "--output-root", "--target"].includes(option) && value === undefined) {
      throw new Error(`Missing value after ${option}.`);
    }
    if (option === "--codex-home") options.codexHome = value;
    else if (option === "--transcript") options.transcript = value;
    else if (option === "--stage-started") options.stageStarted = value;
    else if (option === "--output-root") options.outputRoot = value;
    else if (option === "--target") {
      const separator = value.indexOf("=");
      if (separator <= 0 || separator === value.length - 1) throw new Error("Targets use logical-name=/absolute/path syntax.");
      options.targets.push({ logicalName: value.slice(0, separator), targetPath: value.slice(separator + 1) });
    } else throw new Error(`Unsupported option: ${option}`);
    index += 1;
  }
  return options;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertPng(sourcePath) {
  const handle = await readFile(sourcePath);
  if (handle.length <= PNG_SIGNATURE.length || !handle.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`Generated image is not a valid PNG: ${sourcePath}`);
  }
}

export async function importGeneratedImages({ codexHome, transcript, stageStarted, outputRoot, targets }) {
  if (!codexHome || !transcript || !stageStarted || !outputRoot || targets.length === 0) {
    throw new Error("codex home, transcript, stage marker, output root, and at least one target are required.");
  }
  if (targets.some(({ logicalName }) => !/^[a-z0-9][a-z0-9-]*$/.test(logicalName))) {
    throw new Error("Logical image names must contain lowercase letters, numbers, and hyphens.");
  }

  const transcriptText = await readFile(transcript, "utf8");
  const sessionMatches = [...transcriptText.matchAll(/^(?:\[stdout\]\s+)?session id:\s+([a-f0-9-]{36})\s*$/gm)];
  const sessionId = sessionMatches.at(-1)?.[1];
  if (!sessionId) throw new Error("Could not identify the successful Codex session from its transcript.");

  const canonicalCodexHome = await realpath(codexHome);
  const cacheDirectory = path.resolve(canonicalCodexHome, "generated_images", sessionId);
  if (!isWithin(path.join(canonicalCodexHome, "generated_images"), cacheDirectory)) {
    throw new Error("Generated-image session escaped the private Codex cache.");
  }
  const canonicalCacheDirectory = await realpath(cacheDirectory);
  const stageStartedAt = (await stat(stageStarted)).mtimeMs;
  const entries = await readdir(canonicalCacheDirectory, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^exec-[a-f0-9-]+\.png$/.test(entry.name)) continue;
    const sourcePath = path.join(canonicalCacheDirectory, entry.name);
    const sourceInfo = await lstat(sourcePath);
    if (sourceInfo.isSymbolicLink() || sourceInfo.mtimeMs <= stageStartedAt) continue;
    const canonicalSource = await realpath(sourcePath);
    if (path.dirname(canonicalSource) !== canonicalCacheDirectory) {
      throw new Error(`Generated image escaped its session cache: ${sourcePath}`);
    }
    await assertPng(canonicalSource);
    candidates.push({ sourcePath: canonicalSource, mtimeMs: sourceInfo.mtimeMs, name: entry.name });
  }
  candidates.sort((left, right) => left.mtimeMs - right.mtimeMs || left.name.localeCompare(right.name));
  if (candidates.length !== targets.length) {
    throw new Error(`Expected exactly ${targets.length} fresh generated PNGs in session ${sessionId}, found ${candidates.length}.`);
  }

  const declaredOutputRoot = path.resolve(outputRoot);
  await mkdir(declaredOutputRoot, { recursive: true });
  const canonicalOutputRoot = await realpath(outputRoot);
  const imported = [];
  for (let index = 0; index < targets.length; index += 1) {
    const { logicalName, targetPath } = targets[index];
    const absoluteTarget = path.resolve(targetPath);
    if (!isWithin(declaredOutputRoot, absoluteTarget)) {
      throw new Error(`Generated-image target escaped the declared output root: ${absoluteTarget}`);
    }
    await mkdir(path.dirname(absoluteTarget), { recursive: true });
    const canonicalParent = await realpath(path.dirname(absoluteTarget));
    if (!isWithin(canonicalOutputRoot, canonicalParent)) {
      throw new Error(`Generated-image target parent escaped the declared output root: ${canonicalParent}`);
    }
    try {
      const targetInfo = await lstat(absoluteTarget);
      if (targetInfo.isSymbolicLink()) throw new Error(`Refusing to replace linked image target: ${absoluteTarget}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await copyFile(candidates[index].sourcePath, absoluteTarget);
    imported.push({ logicalName, sourcePath: candidates[index].sourcePath, targetPath: absoluteTarget });
  }
  return { sessionId, imported };
}

async function main() {
  const result = await importGeneratedImages(parseArgs(process.argv.slice(2)));
  for (const image of result.imported) {
    process.stdout.write(`WORLDKIT_IMAGE_IMPORTED ${image.logicalName} ${image.targetPath}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 5;
  });
}
