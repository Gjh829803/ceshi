#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeJsonAtomic } from "../lib/playthrough-dataset.mjs";

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}.`);
  return args[index + 1];
};
const sceneId = value("--scene-id");
const episodeId = value("--episode-id");
const episodeRoot = path.resolve(value("--episode-root"));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pipeline = JSON.parse(await readFile(
  path.join(repoRoot, "config/episode-video-pipeline.json"), "utf8",
));
const model = String(pipeline.seedance?.model ?? "");
const delivery = pipeline.delivery ?? {};
if (!/^[a-z0-9][a-z0-9.-]+$/.test(model) ||
    !Number.isInteger(delivery.width) || !Number.isInteger(delivery.height) ||
    !Number.isInteger(delivery.fps) || !Number.isInteger(delivery.frameCount)) {
  throw new Error("Episode video pipeline output contract is invalid.");
}
const finalName = `final-${delivery.width}x${delivery.height}-${delivery.fps}fps-${delivery.frameCount}f.mp4`;
const manifest = JSON.parse(await readFile(
  path.join(episodeRoot, "visual/episode-visual-manifest.json"), "utf8",
));
if (manifest.sceneId !== sceneId || manifest.episodeId !== episodeId) {
  throw new Error("Episode visual manifest identity mismatch.");
}
const subjectTriview = manifest.targets?.[0]?.styledTriview?.path;
if (typeof subjectTriview !== "string" || !subjectTriview) {
  throw new Error("Episode visual manifest must provide the primary Subject styled tri-view.");
}
const fileExists = async (filePath) => {
  try { await access(filePath); return true; } catch { return false; }
};
for (let index = 0; index < 3; index += 1) {
  const segmentId = `segment-0${index}`;
  const styled = manifest.segmentOpeningFrames[index];
  if (styled?.path !== `visual/${segmentId}-styled-opening-frame.png`) {
    throw new Error(`Styled opening frame missing for ${segmentId}.`);
  }
  const originalReferenceVideoPath = path.join(episodeRoot, "whitebox", `${segmentId}.mp4`);
  const providerSafeReferenceVideoPath = path.join(
    episodeRoot, "whitebox", `${segmentId}-provider-safe.mp4`,
  );
  const hasProviderSafeReference = await fileExists(providerSafeReferenceVideoPath);
  await writeJsonAtomic(path.join(episodeRoot, "video", segmentId, "request.json"), {
    kind: "worldkit-episode-video-segment-request",
    schemaVersion: 2,
    sceneId,
    episodeId,
    segmentId,
    promptPath: path.join(episodeRoot, "prompts", `${segmentId}.json`),
    referenceVideoPath: hasProviderSafeReference
      ? providerSafeReferenceVideoPath
      : originalReferenceVideoPath,
    referenceVideoVariant: hasProviderSafeReference ? "provider-safe-material" : "original",
    referenceImagePaths: [
      path.join(episodeRoot, subjectTriview),
      path.join(episodeRoot, styled.path),
    ],
    rawProviderOutputPath: path.join(episodeRoot, "video", segmentId, `${model}.mp4`),
    rawUpscaleOutputPath: path.join(episodeRoot, "video", segmentId, "cf-upscaled-720p.mp4"),
    outputPath: path.join(episodeRoot, "video", segmentId, finalName),
  });
}
process.stdout.write("WORLDKIT_EPISODE_VIDEO_REQUESTS_OK segments=3\n");
