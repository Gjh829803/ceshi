#!/usr/bin/env node
import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";

import {
  validateStyleVariantVisualReview,
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
const variantRoot = path.resolve(value("--variant-root"));
const inputPath = path.resolve(value("--input-identity"));
const reviewPath = path.resolve(value("--review"));
const reportPath = path.resolve(value("--report"));
const reviewerTaskId = value("--reviewer-task-id");
const reviewerRequestId = value("--reviewer-request-id");
const [manifest, inputIdentity, review] = await Promise.all([
  readFile(path.join(variantRoot, "visual/visual-manifest.json"), "utf8")
    .then(JSON.parse),
  readFile(inputPath, "utf8").then(JSON.parse),
  readFile(reviewPath, "utf8").then(JSON.parse),
]);
const targetIds = (manifest.targets ?? []).map(({ visualTargetId }) => visualTargetId);
const validation = validateStyleVariantVisualReview(review, {
  sceneId,
  episodeId,
  styleVariantId,
  targetIds,
  inputIdentity,
});
await writeJsonAtomic(reportPath, {
  kind: "worldkit-style-variant-visual-review-report",
  schemaVersion: 1,
  sceneId,
  episodeId,
  styleVariantId,
  passed: validation.ok && review.verdict === "passed",
  reviewerVerdict: review.verdict ?? null,
  reviewerTaskId,
  reviewerRequestId,
  diagnostics: validation.diagnostics,
});
if (!validation.ok) {
  throw new Error(`STYLE_VARIANT_VISUAL_REVIEW_INVALID ${JSON.stringify(validation.diagnostics)}`);
}
await copyFile(reviewPath, path.join(variantRoot, "review/visual-quality-review.json"));
await copyFile(reportPath, path.join(variantRoot, "review/visual-quality-review-report.json"));
process.stdout.write(
  `WORLDKIT_STYLE_VARIANT_REVIEW_OK variant=${styleVariantId} verdict=${review.verdict}\n`,
);
if (review.verdict !== "passed") process.exitCode = 10;
