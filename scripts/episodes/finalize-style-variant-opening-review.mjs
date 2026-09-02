#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  validateStyleVariantDiversityReview,
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
const inputPath = path.resolve(value("--input"));
const reviewPath = path.resolve(value("--review"));
const reportPath = path.resolve(value("--report"));
const reviewerTaskId = value("--reviewer-task-id");
const reviewerRequestId = value("--reviewer-request-id");
const [inputIdentity, review] = await Promise.all([
  readFile(inputPath, "utf8").then(JSON.parse),
  readFile(reviewPath, "utf8").then(JSON.parse),
]);
const validation = validateStyleVariantDiversityReview(review, {
  sceneId,
  episodeId,
  inputIdentity,
});
await writeJsonAtomic(reportPath, {
  kind: "worldkit-style-variant-opening-review-report",
  schemaVersion: 1,
  sceneId,
  episodeId,
  passed: validation.ok && review.verdict === "passed",
  reviewerVerdict: review.verdict ?? null,
  reviewerTaskId,
  reviewerRequestId,
  diagnostics: validation.diagnostics,
});
if (!validation.ok) {
  throw new Error(`STYLE_VARIANT_OPENING_REVIEW_INVALID ${JSON.stringify(validation.diagnostics)}`);
}
process.stdout.write(`WORLDKIT_STYLE_OPENING_REVIEW_OK verdict=${review.verdict}\n`);
if (review.verdict !== "passed") process.exitCode = 10;
