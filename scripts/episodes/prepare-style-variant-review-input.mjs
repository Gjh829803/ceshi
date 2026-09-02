#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

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
const sceneRoot = path.resolve(value("--scene-root"));
const episodeRoot = path.resolve(value("--episode-root"));
const outputPath = path.resolve(value("--output"));
const variantRoot = path.join(episodeRoot, "style-variants", styleVariantId);
const manifest = JSON.parse(await readFile(
  path.join(variantRoot, "visual/visual-manifest.json"), "utf8",
));
if (manifest?.sceneId !== sceneId || manifest?.episodeId !== episodeId ||
    manifest?.styleVariantId !== styleVariantId) {
  throw new Error("Style Variant visual manifest identity mismatch.");
}
await writeJsonAtomic(outputPath, {
  styleVariantHash: await sha256File(path.join(variantRoot, "style-variant.json")),
  openingFrameHashes: await Promise.all(
    EPISODE_STYLE_VARIANT_SEGMENT_IDS.map(async (segmentId) => ({
      segmentId,
      whiteboxHash: await sha256File(path.join(
        episodeRoot, "whitebox", `${segmentId}-first-frame.png`,
      )),
      styledHash: await sha256File(path.join(
        variantRoot, "visual", `${segmentId}-styled-opening-frame.png`,
      )),
    })),
  ),
  triviewHashes: await Promise.all((manifest.targets ?? []).map(async (target) => ({
    visualTargetId: target.visualTargetId,
    whiteboxHash: await sha256File(path.join(
      sceneRoot, "triviews", target.visualTargetId, "whitebox-triview.png",
    )),
    styledHash: await sha256File(path.join(
      variantRoot, target.styledTriview.path,
    )),
  }))),
});
process.stdout.write(`WORLDKIT_STYLE_VARIANT_REVIEW_INPUT_OK variant=${styleVariantId}\n`);
