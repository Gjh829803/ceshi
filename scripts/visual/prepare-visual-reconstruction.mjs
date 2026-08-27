#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!["--scene-id", "--scene-root", "--video", "--user-frame", "--opening-frame", "--triview-manifest"].includes(name) || value === undefined) {
      throw new Error(`Invalid or incomplete option '${name ?? ""}'.`);
    }
    options[name.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function regularReadableFile(filePath, maximumBytes) {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > maximumBytes) {
    throw new Error(`Input must be a regular file from 1-${maximumBytes} bytes: ${filePath}`);
  }
  return info;
}

async function assertSafeTarget(sceneRoot, targetPath) {
  if (!isWithin(sceneRoot, targetPath)) throw new Error("Visual reconstruction target escaped scene root.");
  try {
    const info = await lstat(targetPath);
    if (info.isSymbolicLink()) throw new Error(`Refusing linked visual reconstruction target: ${targetPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function contentHash(filePath) {
  return `sha256:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
}

async function assertVideo(filePath) {
  await regularReadableFile(filePath, 512 * 1024 * 1024);
  const bytes = await readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const webm = extension === ".webm" && bytes.subarray(0, 4).toString("hex") === "1a45dfa3";
  const iso = [".mp4", ".mov"].includes(extension) && bytes.subarray(4, 8).toString("ascii") === "ftyp";
  if (!webm && !iso) throw new Error("Whitebox recording must be a real MP4, MOV, or WebM file matching its extension.");
  return {
    extension,
    mediaType: extension === ".webm" ? "video/webm" : extension === ".mov" ? "video/quicktime" : "video/mp4",
  };
}

async function assertImage(filePath) {
  await regularReadableFile(filePath, 20 * 1024 * 1024);
  const bytes = await readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const valid =
    (extension === ".png" && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") ||
    ([".jpg", ".jpeg"].includes(extension) && bytes.subarray(0, 3).toString("hex") === "ffd8ff") ||
    (extension === ".webp" && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP");
  if (!valid) throw new Error(`User first frame is not a valid PNG, JPEG, or WebP: ${filePath}`);
  return extension === ".jpeg" ? ".jpg" : extension;
}

function command(commandName, args) {
  const result = spawnSync(commandName, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${commandName} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export async function prepareVisualReconstruction(options) {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(options.scene_id ?? "")) throw new Error("scene-id is invalid.");
  const sceneRoot = path.resolve(options.scene_root);
  await mkdir(sceneRoot, { recursive: true });
  const canonicalSceneRoot = await realpath(sceneRoot);
  const sourceVideo = path.resolve(options.video);
  const sourceUserFrame = path.resolve(options.user_frame);
  const openingFrame = path.resolve(options.opening_frame);
  const triviewManifestPath = path.resolve(options.triview_manifest);
  const video = await assertVideo(sourceVideo);
  const userExtension = await assertImage(sourceUserFrame);
  await assertImage(openingFrame);

  const videoTarget = path.join(canonicalSceneRoot, `whitebox-motion${video.extension}`);
  const userFrameTarget = path.join(canonicalSceneRoot, `user-first-frame${userExtension}`);
  for (const target of [videoTarget, userFrameTarget]) {
    await assertSafeTarget(canonicalSceneRoot, target);
  }
  await copyFile(sourceVideo, videoTarget);
  await copyFile(sourceUserFrame, userFrameTarget);

  const probe = JSON.parse(command("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json",
    videoTarget,
  ]));
  const stream = probe.streams?.[0];
  const durationSeconds = Number(probe.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0.5 || durationSeconds > 120 ||
      !Number.isSafeInteger(stream?.width) || !Number.isSafeInteger(stream?.height) ||
      stream.width < 64 || stream.height < 64) {
    throw new Error("Whitebox recording must be 0.5-120 seconds with a valid video frame size.");
  }

  const contactSheetPath = path.join(canonicalSceneRoot, "whitebox-motion-contact-sheet.png");
  await assertSafeTarget(canonicalSceneRoot, contactSheetPath);
  const sampleRate = Math.max(0.1, 12 / durationSeconds);
  command("ffmpeg", [
    "-v", "error", "-y", "-i", videoTarget,
    "-vf", `fps=${sampleRate},scale=320:-2,tile=4x3:padding=8:margin=8:color=white`,
    "-frames:v", "1", contactSheetPath,
  ]);
  await assertImage(contactSheetPath);

  const triviewManifest = JSON.parse(await readFile(triviewManifestPath, "utf8"));
  if (triviewManifest.kind !== "worldkit-whitebox-triview-manifest" || !Array.isArray(triviewManifest.whiteboxTriviews)) {
    throw new Error("Whitebox tri-view manifest is invalid.");
  }
  const supplementalTriviews = [];
  for (const [index, target] of triviewManifest.whiteboxTriviews.entries()) {
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(target.visualTargetId) ||
        target.imageUri !== `${target.visualTargetId}/whitebox-triview.png`) {
      throw new Error(`Whitebox tri-view target '${target.visualTargetId ?? ""}' is unsafe.`);
    }
    const absolutePath = path.resolve(path.dirname(triviewManifestPath), target.imageUri);
    if (!isWithin(path.dirname(triviewManifestPath), absolutePath)) throw new Error("Tri-view path escaped its root.");
    await assertImage(absolutePath);
    const canonicalAbsolutePath = await realpath(absolutePath);
    if (!isWithin(canonicalSceneRoot, canonicalAbsolutePath)) throw new Error("Tri-view resolved outside scene root.");
    supplementalTriviews.push({
      token: `@图片${index + 3}`,
      visualTargetId: target.visualTargetId,
      path: path.relative(canonicalSceneRoot, canonicalAbsolutePath),
      contentHash: await contentHash(absolutePath),
    });
  }

  const draft = {
    kind: "worldkit-visual-reference-manifest-draft",
    schemaVersion: 1,
    sceneId: options.scene_id,
    motionReference: {
      token: "@视频1",
      path: path.basename(videoTarget),
      contentHash: await contentHash(videoTarget),
      mediaType: video.mediaType,
      durationSeconds,
      width: stream.width,
      height: stream.height,
    },
    subjectAppearanceReference: {
      token: "@图片1",
      path: path.basename(userFrameTarget),
      contentHash: await contentHash(userFrameTarget),
    },
    environmentAppearanceReference: {
      token: "@图片2",
      path: "styled-opening-frame.png",
      status: "pending",
    },
    whiteboxOpeningFrame: {
      path: path.basename(openingFrame),
      contentHash: await contentHash(openingFrame),
    },
    motionContactSheet: {
      path: path.basename(contactSheetPath),
      contentHash: await contentHash(contactSheetPath),
    },
    supplementalTriviews,
  };
  const outputPath = path.join(canonicalSceneRoot, "visual-reference-manifest.draft.json");
  await writeJsonAtomic(outputPath, draft);
  return { outputPath, videoTarget, userFrameTarget, contactSheetPath, draft };
}

async function main() {
  const result = await prepareVisualReconstruction(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ ok: true, outputPath: result.outputPath })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
