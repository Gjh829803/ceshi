#!/usr/bin/env node
import { stat } from "node:fs/promises";
import path from "node:path";

import { normalizeEpisodePng, readPngSize } from "../lib/episode-visual-normalization.mjs";
import {
  episodeStyleVariantIds,
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
const batchPath = path.resolve(value("--batch"));
const imageRoot = path.resolve(value("--image-root"));
const outputPath = path.resolve(value("--output"));
const jobId = value("--job-id");
const images = await Promise.all(episodeStyleVariantIds().map(async (styleVariantId) => {
  const imagePath = path.join(imageRoot, `${styleVariantId}.png`);
  await normalizeEpisodePng(imagePath, { width: 1280, height: 720 });
  const size = await readPngSize(imagePath);
  return {
    styleVariantId,
    path: path.relative(path.dirname(outputPath), imagePath).replaceAll(path.sep, "/"),
    contentHash: await sha256File(imagePath),
    sizeBytes: (await stat(imagePath)).size,
    ...size,
  };
}));
await writeJsonAtomic(outputPath, {
  kind: "worldkit-style-variant-opening-imagegen-run",
  schemaVersion: 1,
  sceneId,
  episodeId,
  referencePolicy: "whitebox-only",
  imagegenJobId: jobId,
  batchHash: await sha256File(batchPath),
  images,
});
process.stdout.write("WORLDKIT_STYLE_OPENING_BATCH_READY images=10 size=1280x720\n");
