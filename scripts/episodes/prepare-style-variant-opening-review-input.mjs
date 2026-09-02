#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { sha256File, writeJsonAtomic } from "../lib/episode-style-variants.mjs";

const arguments_ = process.argv.slice(2);
const value = (name) => {
  const index = arguments_.indexOf(name);
  if (index < 0 || !arguments_[index + 1]) throw new Error(`Missing ${name}.`);
  return arguments_[index + 1];
};
const sceneId = value("--scene-id");
const episodeId = value("--episode-id");
const episodeRoot = path.resolve(value("--episode-root"));
const runRoot = path.resolve(value("--run-root"));
const outputPath = path.resolve(value("--output"));
const runPath = path.join(runRoot, "imagegen-run.json");
const run = JSON.parse(await readFile(runPath, "utf8"));
if (run?.sceneId !== sceneId || run?.episodeId !== episodeId ||
    run?.referencePolicy !== "whitebox-only" || run?.images?.length !== 10) {
  throw new Error("Style opening review requires one complete whitebox-only ImageGen run.");
}
await writeJsonAtomic(outputPath, {
  kind: "worldkit-style-variant-opening-review-input",
  schemaVersion: 1,
  sceneId,
  episodeId,
  planHash: await sha256File(path.join(
    episodeRoot, "style-variants/style-variant-plan.json",
  )),
  whiteboxHash: await sha256File(path.join(
    episodeRoot, "whitebox/segment-00-first-frame.png",
  )),
  imagegenRunHash: await sha256File(runPath),
  variants: run.images.map(({ styleVariantId, contentHash }) => ({
    styleVariantId,
    contentHash,
  })),
});
process.stdout.write("WORLDKIT_STYLE_OPENING_REVIEW_INPUT_OK variants=10\n");
