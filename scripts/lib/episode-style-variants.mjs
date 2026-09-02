import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const ID = /^[a-z0-9][a-z0-9-]{2,119}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const SEGMENT_IDS = Object.freeze(
  Array.from({ length: 6 }, (_, index) => `segment-0${index}`),
);

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

function diagnostic(code, pathValue, message) {
  return { code, path: pathValue, message };
}

export async function loadEpisodeStyleVariantConfig(repoRoot, {
  configPath = path.join(repoRoot, "config", "episode-style-variants.json"),
} = {}) {
  const value = JSON.parse(await readFile(configPath, "utf8"));
  if (value?.kind !== "worldkit-episode-style-variant-production-config" ||
      value?.schemaVersion !== 1) {
    throw new Error("Episode Style Variant config identity is invalid.");
  }
  const integer = (name, minimum, maximum) => {
    const item = Number(value[name]);
    if (!Number.isSafeInteger(item) || item < minimum || item > maximum) {
      throw new Error(`Episode Style Variant ${name} is invalid.`);
    }
    return item;
  };
  return Object.freeze({
    enabled: process.env.WORLDKIT_EPISODE_STYLE_VARIANTS === "0"
      ? false
      : process.env.WORLDKIT_EPISODE_STYLE_VARIANTS === "1"
        ? true
        : value.enabled === true,
    variantCount: integer("variantCount", 1, 10),
    visualConcurrency: integer("visualConcurrency", 1, 10),
    reviewConcurrency: integer("reviewConcurrency", 1, 10),
    geminiConcurrency: integer("geminiConcurrency", 1, 10),
    seedanceConcurrency: integer("seedanceConcurrency", 1, 20),
    maximumVisualAttempts: integer("maximumVisualAttempts", 1, 3),
  });
}

export function episodeStyleVariantIds(count = 10) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 10) {
    throw new Error("Style Variant count must be between 1 and 10.");
  }
  return Object.freeze(Array.from(
    { length: count },
    (_, index) => `style-${String(index).padStart(2, "0")}`,
  ));
}

export function validateEpisodeStyleVariantPlan(value, {
  sceneId,
  episodeId,
  targetIds,
  variantCount = 10,
} = {}) {
  const diagnostics = [];
  if (!object(value) ||
      value.kind !== "worldkit-episode-style-variant-plan" ||
      value.schemaVersion !== 1 ||
      value.sceneId !== sceneId ||
      value.episodeId !== episodeId) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_PLAN_IDENTITY_INVALID",
      "",
      "Style Variant Plan identity does not match the Episode.",
    ));
    return { ok: false, diagnostics };
  }
  const expectedIds = episodeStyleVariantIds(variantCount);
  const expectedTargets = Array.isArray(targetIds) ? targetIds : [];
  if (!object(value.sourceWhiteboxIdentity) ||
      !HASH.test(value.sourceWhiteboxIdentity.traceHash ?? "") ||
      !HASH.test(value.sourceWhiteboxIdentity.qualityReportHash ?? "") ||
      !Array.isArray(value.sourceWhiteboxIdentity.segmentVideoHashes) ||
      value.sourceWhiteboxIdentity.segmentVideoHashes.length !== SEGMENT_IDS.length ||
      value.sourceWhiteboxIdentity.segmentVideoHashes.some((item, index) =>
        item?.segmentId !== SEGMENT_IDS[index] || !HASH.test(item?.contentHash ?? ""))) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_WHITEBOX_IDENTITY_INVALID",
      "/sourceWhiteboxIdentity",
      "Style variants must bind the exact shared trace, quality report, and six videos.",
    ));
  }
  if (!Array.isArray(value.variants) || value.variants.length !== variantCount) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_COUNT_INVALID",
      "/variants",
      `Style Variant Plan must contain exactly ${variantCount} variants.`,
    ));
    return { ok: false, diagnostics };
  }
  value.variants.forEach((variant, index) => {
    const base = `/variants/${index}`;
    if (!object(variant) || variant.id !== expectedIds[index] ||
        !text(variant.name, 4) || !text(variant.styleFamily, 12) ||
        !text(variant.worldIdentity, 24) || !text(variant.subjectIdentity, 24) ||
        !text(variant.diversityRationale, 60) || !text(variant.concept, 80) ||
        !text(variant.visualPrompt, 300) ||
        !text(variant.geminiEventPrompt, 200) ||
        !text(variant.negativeConstraints, 120)) {
      diagnostics.push(diagnostic(
        "STYLE_VARIANT_DEFINITION_INVALID",
        base,
        "Each ordered variant needs a concrete concept and standalone visual/Gemini prompts.",
      ));
      return;
    }
    if (!Array.isArray(variant.targetInterpretations) ||
        variant.targetInterpretations.length !== expectedTargets.length ||
        variant.targetInterpretations.some((target, targetIndex) =>
          target?.visualTargetId !== expectedTargets[targetIndex] ||
          !text(target?.finalIdentity, 24) ||
          !text(target?.appearance, 60))) {
      diagnostics.push(diagnostic(
        "STYLE_VARIANT_TARGET_CLOSURE_INVALID",
        `${base}/targetInterpretations`,
        "Every variant must reinterpret every declared target in manifest order.",
      ));
    }
  });
  const concepts = value.variants.map((variant) =>
    String(variant?.concept ?? "").trim().toLocaleLowerCase());
  const semanticFields = ["styleFamily", "worldIdentity", "subjectIdentity"];
  if (new Set(concepts).size !== concepts.length || semanticFields.some((field) => {
    const values = value.variants.map((variant) =>
      String(variant?.[field] ?? "").trim().toLocaleLowerCase());
    return new Set(values).size !== values.length;
  })) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_CONCEPTS_DUPLICATED",
      "/variants",
      "Every style variant needs independent Subject, world, style and concept identities.",
    ));
  }
  return diagnostics.length === 0
    ? { ok: true, diagnostics: [] }
    : { ok: false, diagnostics };
}

export function validateStyleVariantVisualReview(value, {
  sceneId,
  episodeId,
  styleVariantId,
  targetIds,
  inputIdentity,
} = {}) {
  const diagnostics = [];
  const expectedTargets = Array.isArray(targetIds) ? targetIds : [];
  if (!object(value) ||
      value.kind !== "worldkit-style-variant-visual-review" ||
      value.schemaVersion !== 1 || value.reviewer !== "lwdp-codex" ||
      value.sceneId !== sceneId || value.episodeId !== episodeId ||
      value.styleVariantId !== styleVariantId ||
      !["passed", "needs-repair"].includes(value.verdict)) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_REVIEW_IDENTITY_INVALID",
      "",
      "Visual Review identity or verdict is invalid.",
    ));
    return { ok: false, diagnostics };
  }
  if (!isDeepStrictEqual(value.inputIdentity, inputIdentity)) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_REVIEW_INPUT_STALE",
      "/inputIdentity",
      "Visual Review does not bind the current generated images.",
    ));
  }
  if (!Array.isArray(value.openingFrameReviews) ||
      value.openingFrameReviews.length !== SEGMENT_IDS.length ||
      value.openingFrameReviews.some((review, index) =>
        review?.segmentId !== SEGMENT_IDS[index] ||
        !["passed", "needs-repair"].includes(review?.verdict) ||
        !text(review?.observations, 30))) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_OPENING_REVIEW_INVALID",
      "/openingFrameReviews",
      "Reviewer must inspect all six styled openings in order.",
    ));
  }
  if (!Array.isArray(value.triviewReviews) ||
      value.triviewReviews.length !== expectedTargets.length ||
      value.triviewReviews.some((review, index) =>
        review?.visualTargetId !== expectedTargets[index] ||
        !["passed", "needs-repair"].includes(review?.verdict) ||
        !text(review?.observations, 30))) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_TRIVIEW_REVIEW_INVALID",
      "/triviewReviews",
      "Reviewer must inspect every declared tri-view in manifest order.",
    ));
  }
  const childVerdicts = [
    ...(value.openingFrameReviews ?? []),
    ...(value.triviewReviews ?? []),
  ].map((item) => item?.verdict);
  const expectedVerdict = childVerdicts.every((item) => item === "passed")
    ? "passed"
    : "needs-repair";
  if (value.verdict !== expectedVerdict || !text(value.summary, 40) ||
      (value.verdict === "needs-repair" && !text(value.repairInstructions, 80))) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_REVIEW_VERDICT_INCOHERENT",
      "/verdict",
      "Aggregate verdict and repair instructions do not match image findings.",
    ));
  }
  return diagnostics.length === 0
    ? { ok: true, diagnostics: [] }
    : { ok: false, diagnostics };
}

export function styleVariantPassedReview(value) {
  return value?.kind === "worldkit-style-variant-visual-review" &&
    value?.schemaVersion === 1 && value?.reviewer === "lwdp-codex" &&
    value?.verdict === "passed";
}

export function validateStyleVariantDiversityReview(value, {
  sceneId,
  episodeId,
  inputIdentity,
} = {}) {
  const diagnostics = [];
  const expectedIds = episodeStyleVariantIds();
  if (!object(value) ||
      value.kind !== "worldkit-style-variant-diversity-review" ||
      value.schemaVersion !== 1 || value.reviewer !== "lwdp-codex" ||
      value.sceneId !== sceneId || value.episodeId !== episodeId ||
      !["passed", "needs-repair"].includes(value.verdict)) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_DIVERSITY_REVIEW_IDENTITY_INVALID",
      "",
      "Diversity Review identity or verdict is invalid.",
    ));
    return { ok: false, diagnostics };
  }
  if (!isDeepStrictEqual(value.inputIdentity, inputIdentity)) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_DIVERSITY_REVIEW_INPUT_STALE",
      "/inputIdentity",
      "Diversity Review does not bind the current ten visual variants.",
    ));
  }
  const dimensions = [
    "spatial-registration", "subjects", "environments", "landmarks", "overall-read",
  ];
  if (!Array.isArray(value.dimensionReviews) ||
      value.dimensionReviews.length !== dimensions.length ||
      value.dimensionReviews.some((review, index) =>
        review?.dimension !== dimensions[index] ||
        !["passed", "needs-repair"].includes(review?.verdict) ||
        !text(review?.observations, 40))) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_DIVERSITY_DIMENSIONS_INVALID",
      "/dimensionReviews",
      "Diversity Reviewer must inspect all four ordered visual dimensions.",
    ));
  }
  if (!Array.isArray(value.variantReviews) ||
      value.variantReviews.length !== expectedIds.length ||
      value.variantReviews.some((review, index) =>
        review?.styleVariantId !== expectedIds[index] ||
        !["passed", "needs-repair"].includes(review?.verdict) ||
        !Array.isArray(review?.confusableWith) ||
        review.confusableWith.some((id) => !expectedIds.includes(id) || id === review.styleVariantId) ||
        !text(review?.observations, 40) ||
        (review.verdict === "needs-repair" && !text(review?.repairInstructions, 60)))) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_DIVERSITY_VARIANTS_INVALID",
      "/variantReviews",
      "Diversity Reviewer must inspect all ten ordered variants with actionable findings.",
    ));
  }
  const childVerdicts = [
    ...(value.dimensionReviews ?? []),
    ...(value.variantReviews ?? []),
  ].map((review) => review?.verdict);
  const expectedVerdict = childVerdicts.every((verdict) => verdict === "passed")
    ? "passed"
    : "needs-repair";
  const namedRepairCount = (value.variantReviews ?? [])
    .filter((review) => review?.verdict === "needs-repair").length;
  if (value.verdict !== expectedVerdict || !text(value.summary, 60) ||
      (value.verdict === "needs-repair" &&
        (!text(value.repairInstructions, 100) || namedRepairCount < 1))) {
    diagnostics.push(diagnostic(
      "STYLE_VARIANT_DIVERSITY_VERDICT_INCOHERENT",
      "/verdict",
      "Aggregate diversity verdict must match all dimension and variant findings.",
    ));
  }
  return diagnostics.length === 0
    ? { ok: true, diagnostics: [] }
    : { ok: false, diagnostics };
}

export function styleVariantPassedDiversityReview(value) {
  return value?.kind === "worldkit-style-variant-diversity-review" &&
    value?.schemaVersion === 1 && value?.reviewer === "lwdp-codex" &&
    value?.verdict === "passed";
}

export function createJsonAtomicWriter(filePath) {
  let queue = Promise.resolve();
  return (value) => {
    queue = queue.then(
      () => writeJsonAtomic(filePath, value),
      () => writeJsonAtomic(filePath, value),
    );
    return queue;
  };
}

export async function sha256File(filePath) {
  return `sha256:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
}

export async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export const EPISODE_STYLE_VARIANT_SEGMENT_IDS = SEGMENT_IDS;
