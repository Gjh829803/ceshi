#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { normalizeEpisodePng, readPngSize } from "../lib/episode-visual-normalization.mjs";
import {
  EPISODE_STYLE_VARIANT_SEGMENT_IDS,
  sha256File,
  writeJsonAtomic,
} from "../lib/episode-style-variants.mjs";

const arguments_ = process.argv.slice(2);
const value = (name) => {
  const index = arguments_.indexOf(name);
  if (index < 0 || !arguments_[index + 1]) throw new Error(`Missing ${name}.`);
  return arguments_[index + 1];
};
const sceneId = value("--scene-id");
const episodeId = value("--episode-id");
const styleVariantId = value("--style-variant-id");
const episodeRoot = path.resolve(value("--episode-root"));
const sceneRoot = path.resolve(value("--scene-root"));
const variantRoot = path.join(episodeRoot, "style-variants", styleVariantId);
const visualRoot = path.join(variantRoot, "visual");
const [styleVariant, prompts, whiteboxManifest] = await Promise.all([
  readFile(path.join(variantRoot, "style-variant.json"), "utf8").then(JSON.parse),
  readFile(path.join(visualRoot, "visual-prompts.json"), "utf8").then(JSON.parse),
  readFile(path.join(sceneRoot, "triviews/whitebox-triview-manifest.json"), "utf8")
    .then(JSON.parse),
]);
if (styleVariant?.sceneId !== sceneId || styleVariant?.episodeId !== episodeId ||
    styleVariant?.id !== styleVariantId ||
    prompts?.kind !== "worldkit-style-variant-visual-prompts" ||
    prompts?.schemaVersion !== 1 || prompts?.sceneId !== sceneId ||
    prompts?.episodeId !== episodeId || prompts?.styleVariantId !== styleVariantId ||
    prompts?.referencePolicy !== "whitebox-only" ||
    prompts?.appearanceAnchorSegmentId !== "segment-00") {
  throw new Error("Style Variant visual identity is invalid.");
}
const targetIds = (whiteboxManifest.whiteboxTriviews ?? [])
  .map(({ visualTargetId }) => visualTargetId);
if (!Array.isArray(prompts.segmentOpeningFrames) ||
    prompts.segmentOpeningFrames.length !== EPISODE_STYLE_VARIANT_SEGMENT_IDS.length ||
    prompts.segmentOpeningFrames.some((item, index) =>
      item?.segmentId !== EPISODE_STYLE_VARIANT_SEGMENT_IDS[index] ||
      typeof item?.prompt !== "string" || item.prompt.trim().length < 200) ||
    !Array.isArray(prompts.styledTriviews) ||
    prompts.styledTriviews.length !== targetIds.length ||
    prompts.styledTriviews.some((item, index) =>
      item?.visualTargetId !== targetIds[index] ||
      typeof item?.prompt !== "string" || item.prompt.trim().length < 150)) {
  throw new Error("Style Variant visual prompt closure is invalid.");
}
async function image(relativePath) {
  const filePath = path.join(variantRoot, relativePath);
  await normalizeEpisodePng(filePath, { width: 1280, height: 720 });
  const size = await readPngSize(filePath);
  return {
    path: relativePath,
    contentHash: await sha256File(filePath),
    sizeBytes: (await stat(filePath)).size,
    ...size,
  };
}
const segmentOpeningFrames = await Promise.all(
  EPISODE_STYLE_VARIANT_SEGMENT_IDS.map(async (segmentId) => ({
    segmentId,
    ...await image(`visual/${segmentId}-styled-opening-frame.png`),
  })),
);
const targets = await Promise.all(targetIds.map(async (visualTargetId) => ({
  visualTargetId,
  styledTriview: await image(`visual/triviews/${visualTargetId}/styled-triview.png`),
})));
await writeJsonAtomic(path.join(visualRoot, "visual-manifest.json"), {
  kind: "worldkit-style-variant-visual-manifest",
  schemaVersion: 1,
  sceneId,
  episodeId,
  styleVariantId,
  styleVariantHash: await sha256File(path.join(variantRoot, "style-variant.json")),
  promptBundleHash: await sha256File(path.join(visualRoot, "visual-prompts.json")),
  segmentOpeningFrames,
  targets,
});
process.stdout.write(
  `WORLDKIT_STYLE_VARIANT_VISUALS_OK variant=${styleVariantId} targets=${targets.length}\n`,
);
