#!/usr/bin/env node
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { readPngSize } from "../lib/episode-visual-normalization.mjs";
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
const runRoot = path.resolve(value("--run-root"));
const approvalMode = value("--approval-mode");
if (!["codex-review", "human-review"].includes(approvalMode)) {
  throw new Error("Opening anchor approval mode must be codex-review or human-review.");
}

const styleRoot = path.join(episodeRoot, "style-variants");
const planPath = path.join(styleRoot, "style-variant-plan.json");
const runPath = path.join(runRoot, "imagegen-run.json");
const [plan, run] = await Promise.all([
  readFile(planPath, "utf8").then(JSON.parse),
  readFile(runPath, "utf8").then(JSON.parse),
]);
const variantIds = episodeStyleVariantIds();
if (plan?.sceneId !== sceneId || plan?.episodeId !== episodeId ||
    run?.sceneId !== sceneId || run?.episodeId !== episodeId ||
    run?.referencePolicy !== "whitebox-only" ||
    plan?.variants?.map(({ id }) => id).join("\n") !== variantIds.join("\n") ||
    run?.images?.map(({ styleVariantId }) => styleVariantId).join("\n") !==
      variantIds.join("\n")) {
  throw new Error("Opening anchor inputs do not form one ordered ten-style run.");
}

let approval;
if (approvalMode === "codex-review") {
  const reviewPath = path.join(runRoot, "review/opening-review.json");
  const reportPath = path.join(runRoot, "review/opening-review-report.json");
  const [review, report] = await Promise.all([
    readFile(reviewPath, "utf8").then(JSON.parse),
    readFile(reportPath, "utf8").then(JSON.parse),
  ]);
  if (review?.sceneId !== sceneId || review?.episodeId !== episodeId ||
      review?.verdict !== "passed" || report?.passed !== true ||
      review?.variantReviews?.some(({ verdict }) => verdict !== "passed")) {
    throw new Error("Codex opening review did not approve all ten anchors.");
  }
  approval = {
    mode: approvalMode,
    reviewHash: await sha256File(reviewPath),
    reportHash: await sha256File(reportPath),
  };
} else {
  approval = {
    mode: approvalMode,
    note: value("--approval-note"),
  };
}

const anchors = [];
for (const item of run.images) {
  const sourcePath = path.join(runRoot, item.path);
  const destinationPath = path.join(
    styleRoot,
    item.styleVariantId,
    "visual/segment-00-styled-opening-frame.png",
  );
  const [sourceHash, size] = await Promise.all([
    sha256File(sourcePath),
    readPngSize(sourcePath),
  ]);
  if (sourceHash !== item.contentHash || size.width !== 1280 || size.height !== 720) {
    throw new Error(`Opening anchor source is stale: ${item.styleVariantId}`);
  }
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
  const destinationHash = await sha256File(destinationPath);
  if (destinationHash !== sourceHash) {
    throw new Error(`Opening anchor promotion changed bytes: ${item.styleVariantId}`);
  }
  anchors.push({
    styleVariantId: item.styleVariantId,
    path: `${item.styleVariantId}/visual/segment-00-styled-opening-frame.png`,
    contentHash: destinationHash,
    sizeBytes: (await stat(destinationPath)).size,
    ...size,
  });
}

await writeJsonAtomic(path.join(styleRoot, "opening-anchor-manifest.json"), {
  kind: "worldkit-style-variant-opening-anchor-manifest",
  schemaVersion: 1,
  sceneId,
  episodeId,
  referencePolicy: "whitebox-only",
  planHash: await sha256File(planPath),
  whiteboxHash: await sha256File(path.join(
    episodeRoot,
    "whitebox/segment-00-first-frame.png",
  )),
  imagegenRunHash: await sha256File(runPath),
  approval,
  anchors,
});
process.stdout.write(
  `WORLDKIT_STYLE_OPENING_ANCHORS_PROMOTED anchors=${anchors.length} approval=${approvalMode}\n`,
);
