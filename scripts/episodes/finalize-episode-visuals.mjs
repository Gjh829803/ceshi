#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeEpisodePng, readPngSize } from "../lib/episode-visual-normalization.mjs";
import { buildEpisodeVisualInputIdentity } from "../lib/episode-input-identity.mjs";
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
const sceneRoot = path.resolve(value("--scene-root"));
const visualRoot = path.join(episodeRoot, "visual");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scenePlanRoot = path.join(
  repoRoot,
  "apps/playground/public/scene-plans",
  sceneId,
);
const segmentIndices = [0, 1, 2, 3, 4, 5];

async function hash(filePath) {
  const bytes = await readFile(filePath);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function assertPng(filePath, expected = { width: 1280, height: 720 }) {
  await normalizeEpisodePng(filePath, expected);
  const { width, height } = await readPngSize(filePath);
  return {
    path: path.relative(episodeRoot, filePath),
    contentHash: await hash(filePath),
    sizeBytes: (await stat(filePath)).size,
    width,
    height,
  };
}

const promptsPath = path.join(visualRoot, "episode-visual-prompts.json");
const prompts = JSON.parse(await readFile(promptsPath, "utf8"));
if (prompts.kind !== "worldkit-episode-visual-prompts" || prompts.schemaVersion !== 1 ||
    prompts.provider !== "lwdp-codex" || prompts.sceneId !== sceneId || prompts.episodeId !== episodeId ||
    !Array.isArray(prompts.segmentOpeningFrames) || prompts.segmentOpeningFrames.length !== 6 ||
    prompts.segmentOpeningFrames.some((item, index) =>
      item.segmentId !== `segment-0${segmentIndices[index]}` ||
      typeof item.prompt !== "string" || item.prompt.length < 200)) {
  throw new Error("Episode visual prompt bundle is invalid.");
}
const whiteboxManifest = JSON.parse(await readFile(path.join(sceneRoot, "triviews/whitebox-triview-manifest.json"), "utf8"));
const targetIds = (whiteboxManifest.whiteboxTriviews ?? []).map((target) => target.visualTargetId);
if (targetIds.length < 1 || targetIds.length > 5 || new Set(targetIds).size !== targetIds.length) {
  throw new Error("Whitebox tri-view manifest must declare 1-5 unique complete visual targets.");
}
if (!Array.isArray(prompts.styledTriviews) || prompts.styledTriviews.length !== targetIds.length ||
    prompts.styledTriviews.some((item, index) => item.visualTargetId !== targetIds[index] || typeof item.prompt !== "string" || item.prompt.length < 150)) {
  throw new Error("Episode styled tri-view prompt closure is invalid.");
}
const segmentOpeningFrames = [];
const sourceWhiteboxFirstFrames = [];
for (const index of segmentIndices) {
  const sourcePath = path.join(episodeRoot, "whitebox", `segment-0${index}-first-frame.png`);
  sourceWhiteboxFirstFrames.push({
    segmentId: `segment-0${index}`,
    path: path.relative(episodeRoot, sourcePath),
    contentHash: await hash(sourcePath),
  });
  segmentOpeningFrames.push({
    segmentId: `segment-0${index}`,
    ...await assertPng(path.join(
      visualRoot,
      `segment-0${index}-styled-opening-frame.png`,
    )),
  });
}
const targets = [];
for (const visualTargetId of targetIds) {
  const image = await assertPng(path.join(visualRoot, "triviews", visualTargetId, "styled-triview.png"));
  targets.push({ visualTargetId, styledTriview: image });
}
const inputIdentity = await buildEpisodeVisualInputIdentity({
  sceneRoot,
  scenePlanRoot,
  episodeRoot,
});
await writeJsonAtomic(path.join(visualRoot, "episode-visual-manifest.json"), {
  kind: "worldkit-episode-visual-manifest",
  schemaVersion: 1,
  sceneId,
  episodeId,
  promptBundle: { path: "visual/episode-visual-prompts.json", contentHash: await hash(promptsPath) },
  inputIdentity,
  sourceWhiteboxFirstFrames,
  segmentOpeningFrames,
  targets,
  generatedAt: new Date().toISOString(),
});
process.stdout.write(`WORLDKIT_EPISODE_VISUALS_OK segments=6 targets=${targets.length}\n`);
