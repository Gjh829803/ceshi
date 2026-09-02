#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

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
const episodeRoot = path.resolve(value("--episode-root"));
const outputPath = path.resolve(value("--output"));
const styleRoot = path.join(episodeRoot, "style-variants");
const planPath = path.join(styleRoot, "style-variant-plan.json");
const plan = JSON.parse(await readFile(planPath, "utf8"));
const variantIds = episodeStyleVariantIds();
if (plan?.sceneId !== sceneId || plan?.episodeId !== episodeId ||
    plan?.variants?.map(({ id }) => id).join("\n") !== variantIds.join("\n")) {
  throw new Error("Style Variant Diversity input requires one complete ordered plan.");
}
const variants = await Promise.all(variantIds.map(async (styleVariantId) => {
  const variantRoot = path.join(styleRoot, styleVariantId);
  const manifestPath = path.join(variantRoot, "visual/visual-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest?.sceneId !== sceneId || manifest?.episodeId !== episodeId ||
      manifest?.styleVariantId !== styleVariantId) {
    throw new Error(`Style Variant visual manifest is invalid: ${styleVariantId}`);
  }
  return {
    styleVariantId,
    styleVariantHash: await sha256File(path.join(variantRoot, "style-variant.json")),
    visualManifestHash: await sha256File(manifestPath),
    primaryOpeningHash: await sha256File(path.join(
      variantRoot, "visual/segment-00-styled-opening-frame.png",
    )),
    targetTriviewHashes: await Promise.all((manifest.targets ?? []).map(async (target) => ({
      visualTargetId: target.visualTargetId,
      contentHash: await sha256File(path.join(variantRoot, target.styledTriview.path)),
    }))),
  };
}));
await writeJsonAtomic(outputPath, {
  kind: "worldkit-style-variant-diversity-review-input",
  schemaVersion: 1,
  sceneId,
  episodeId,
  planHash: await sha256File(planPath),
  variants,
});
process.stdout.write("WORLDKIT_STYLE_VARIANT_DIVERSITY_INPUT_OK variants=10\n");
