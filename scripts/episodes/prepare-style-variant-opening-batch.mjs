#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  episodeStyleVariantIds,
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
const reviewPath = arguments_.includes("--review")
  ? path.resolve(value("--review"))
  : null;
const styleRoot = path.join(episodeRoot, "style-variants");
const whiteboxPath = path.join(episodeRoot, "whitebox/segment-00-first-frame.png");
const plan = JSON.parse(await readFile(
  path.join(styleRoot, "style-variant-plan.json"),
  "utf8",
));
const variantIds = episodeStyleVariantIds();
if (plan?.sceneId !== sceneId || plan?.episodeId !== episodeId ||
    plan?.variants?.map(({ id }) => id).join("\n") !== variantIds.join("\n")) {
  throw new Error("Style opening batch requires one valid ordered ten-style plan.");
}
const review = reviewPath
  ? JSON.parse(await readFile(reviewPath, "utf8"))
  : null;
if (review && (review?.sceneId !== sceneId || review?.episodeId !== episodeId ||
    review?.verdict !== "needs-repair")) {
  throw new Error("Style opening repair batch requires one current needs-repair review.");
}
const reviewById = new Map((review?.variantReviews ?? [])
  .map((item) => [item.styleVariantId, item]));
const selectedVariants = review
  ? plan.variants.filter((variant) => reviewById.get(variant.id)?.verdict === "needs-repair")
  : plan.variants;
if (selectedVariants.length < 1) throw new Error("Style opening batch has no selected variants.");
const items = selectedVariants.map((variant) => {
  const targetSummary = variant.targetInterpretations.map((target) =>
    `${target.visualTargetId}: ${target.finalIdentity}. ${target.appearance}`).join("\n");
  const repair = reviewById.get(variant.id);
  const prompt = `Use the attached Image 1 as the sole edit target and sole spatial ` +
    `reference. Image 1 is a whitebox frame and provides no final appearance or ` +
    `semantic identity. Preserve its camera, FOV, crop, horizon, Subject pose and ` +
    `screen position, terrain profiles, target centers, approximate occupancy, depth, ` +
    `visible fraction, occlusion, openings, negative space, and traversable clearance. ` +
    `Do not zoom or reframe. This is a registered image edit, not a new composition. ` +
    `The Subject must remain the same small lower-center figure. Every distant target ` +
    `must remain the same tiny distant silhouette at the same center; words such as ` +
    `giant, colossal, monumental, palace, factory, cathedral, city, or mainframe ` +
    `describe in-world identity only and must never enlarge screen occupancy. Preserve ` +
    `the whitebox's large open sky/negative space and do not add foreground or background ` +
    `masses outside existing silhouettes. Remove all whitebox, voxel, block-seam, helper, UI, and ` +
    `placeholder residue. Reconstruct every visible surface as one coherent final world.\n\n` +
    `STYLE FAMILY: ${variant.styleFamily}\n` +
    `WORLD IDENTITY: ${variant.worldIdentity}\n` +
    `SUBJECT IDENTITY: ${variant.subjectIdentity}\n` +
    `DECLARED TARGET IDENTITIES:\n${targetSummary}\n\n` +
    `${variant.visualPrompt}\n\n${variant.negativeConstraints}\n\n` +
    (repair ? `INDEPENDENT REVIEW EVIDENCE:\n${repair.observations}\n` +
      `REQUIRED REPAIR:\n${repair.repairInstructions}\n\n` : "") +
    `The Subject, environment, and every landmark must all visibly and unmistakably ` +
    `realize this variant. Preserve only whitebox spatial registration; do not retain ` +
    `or guess any source-scene identity. No text, labels, logo, watermark, or Prompt Event.`;
  return {
    id: variant.id,
    prompt,
    shortPrompt: `${variant.name}: ${variant.worldIdentity}`.slice(0, 500),
    orientation: "横图",
    width: 1280,
    height: 720,
    referenceImages: [{
      path: whiteboxPath,
      role: "structure",
      name: "segment-00-whitebox",
      description: "Sole spatial authority; contains no final appearance identity.",
    }],
  };
});
await writeJsonAtomic(outputPath, {
  kind: "worldkit-style-variant-opening-imagegen-batch",
  schemaVersion: 1,
  sceneId,
  episodeId,
  referencePolicy: "whitebox-only",
  width: 1280,
  height: 720,
  maxReferenceImagesPerItem: 1,
  items,
  ...(reviewPath ? { repairReviewPath: reviewPath } : {}),
});
process.stdout.write(
  `WORLDKIT_STYLE_OPENING_BATCH_INPUT_OK items=${items.length} references=1\n`,
);
