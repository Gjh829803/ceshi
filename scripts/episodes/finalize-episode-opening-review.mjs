#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { normalizeEpisodePng, readPngSize } from "../lib/episode-visual-normalization.mjs";
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
const reviewId = value("--review-id");
if (![sceneId, episodeId, reviewId].every((item) => /^[a-z0-9][a-z0-9-]{2,119}$/.test(item))) {
  throw new Error("Episode opening-review identity is invalid.");
}
const reviewRoot = path.join(episodeRoot, "visual-reviews", reviewId);

async function hash(filePath) {
  return `sha256:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
}

async function normalizeImage(filePath) {
  await normalizeEpisodePng(filePath, { width: 1280, height: 720 });
  const dimensions = await readPngSize(filePath);
  const metadata = await stat(filePath);
  return {
    path: path.relative(episodeRoot, filePath),
    contentHash: await hash(filePath),
    sizeBytes: metadata.size,
    ...dimensions,
  };
}

const promptsPath = path.join(reviewRoot, "episode-opening-review-prompts.json");
const prompts = JSON.parse(await readFile(promptsPath, "utf8"));
if (prompts.kind !== "worldkit-episode-opening-review-prompts" || prompts.schemaVersion !== 1 ||
    prompts.provider !== "lwdp-codex" || prompts.sceneId !== sceneId ||
    prompts.episodeId !== episodeId || prompts.reviewId !== reviewId ||
    !Array.isArray(prompts.segmentOpeningFrames) || prompts.segmentOpeningFrames.length !== 3 ||
    prompts.segmentOpeningFrames.some((item, index) =>
      item.segmentId !== `segment-0${index}` || typeof item.prompt !== "string" || item.prompt.length < 300)) {
  throw new Error("Episode opening-review prompt bundle is invalid.");
}

const frames = [];
const sources = [];
for (let index = 0; index < 3; index += 1) {
  const segmentId = `segment-0${index}`;
  const source = path.join(episodeRoot, "whitebox", `${segmentId}-first-frame.png`);
  sources.push({ segmentId, path: path.relative(episodeRoot, source), contentHash: await hash(source) });
  frames.push({ segmentId, image: await normalizeImage(path.join(reviewRoot, `${segmentId}-styled-opening-frame.png`)) });
}

await writeJsonAtomic(path.join(reviewRoot, "episode-opening-review-manifest.json"), {
  kind: "worldkit-episode-opening-review-manifest",
  schemaVersion: 1,
  sceneId,
  episodeId,
  reviewId,
  baseVisualPromptPath: `artifacts/scenes/${sceneId}/visual-generation-prompts.json`,
  promptBundle: { path: path.relative(episodeRoot, promptsPath), contentHash: await hash(promptsPath) },
  sources,
  frames,
  generatedAt: new Date().toISOString(),
});
process.stdout.write(`WORLDKIT_EPISODE_OPENING_REVIEW_OK frames=${frames.length}\n`);
