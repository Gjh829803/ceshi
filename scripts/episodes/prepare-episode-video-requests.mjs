#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES,
  writeJsonAtomic,
} from "../lib/playthrough-dataset.mjs";

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}.`);
  return args[index + 1];
};
const sceneId = value("--scene-id");
const episodeId = value("--episode-id");
const episodeRoot = path.resolve(value("--episode-root"));
const styleRoot = args.includes("--style-root")
  ? path.resolve(value("--style-root"))
  : episodeRoot;
const styleVariantId = args.includes("--style-variant-id")
  ? value("--style-variant-id")
  : null;
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
  path.join(styleRoot, "visual", styleVariantId === null
    ? "episode-visual-manifest.json"
    : "visual-manifest.json"), "utf8",
));
if (manifest.sceneId !== sceneId || manifest.episodeId !== episodeId) {
  throw new Error("Episode visual manifest identity mismatch.");
}
if (styleVariantId !== null && manifest.styleVariantId !== styleVariantId) {
  throw new Error("Episode visual manifest Style Variant identity mismatch.");
}
const styledTriviews = (manifest.targets ?? []).map((target) =>
  target?.styledTriview?.path);
if (styledTriviews.length < 1 || styledTriviews.length > 5 ||
    styledTriviews.some((item) => typeof item !== "string" || !item)) {
  throw new Error("Episode visual manifest must provide all complete-target styled tri-views.");
}
const fileExists = async (filePath) => {
  try { await access(filePath); return true; } catch { return false; }
};
for (const index of PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES) {
  const segmentId = `segment-0${index}`;
  const styled = manifest.segmentOpeningFrames.find((item) =>
    item.segmentId === segmentId);
  if (styled?.path !== `visual/${segmentId}-styled-opening-frame.png`) {
    throw new Error(`Styled opening frame missing for ${segmentId}.`);
  }
  const originalReferenceVideoPath = path.join(episodeRoot, "whitebox", `${segmentId}.mp4`);
  const providerSafeReferenceVideoPath = path.join(
    episodeRoot, "whitebox", `${segmentId}-provider-safe.mp4`,
  );
  const hasProviderSafeReference = await fileExists(providerSafeReferenceVideoPath);
  await writeJsonAtomic(path.join(styleRoot, "video", segmentId, "request.json"), {
    kind: "worldkit-episode-video-segment-request",
    schemaVersion: 2,
    sceneId,
    episodeId,
    ...(styleVariantId === null ? {} : { styleVariantId }),
    segmentId,
    promptPath: path.join(styleRoot, "prompts", `${segmentId}.json`),
    referenceVideoPath: hasProviderSafeReference
      ? providerSafeReferenceVideoPath
      : originalReferenceVideoPath,
    referenceVideoVariant: hasProviderSafeReference ? "provider-safe-material" : "original",
    referenceImagePaths: [
      path.join(styleRoot, styled.path),
      ...styledTriviews.map((relativePath) => path.join(styleRoot, relativePath)),
    ],
    rawProviderOutputPath: path.join(styleRoot, "video", segmentId, `${model}.mp4`),
    outputPath: path.join(styleRoot, "video", segmentId, finalName),
  });
}
process.stdout.write("WORLDKIT_EPISODE_VIDEO_REQUESTS_OK segments=6 eventSegments=3 references=opening-plus-all-triviews\n");
