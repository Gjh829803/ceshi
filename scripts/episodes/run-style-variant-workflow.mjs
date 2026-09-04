#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  assertConcurrentStageSucceeded,
  createJsonAtomicWriter,
  EPISODE_STYLE_VARIANT_SEGMENT_IDS,
  episodeStyleVariantIds,
  loadEpisodeStyleVariantConfig,
  sha256File,
  styleVariantPassedDiversityReview,
  styleVariantPassedReview,
  validateStyleVariantOpeningAnchorManifest,
  writeJsonAtomic,
} from "../lib/episode-style-variants.mjs";
import { joinS3Uri } from "../lib/lwdp-generation-client.mjs";
import {
  buildCloudEpisodeArtifactManifest,
  uploadCloudArtifactManifest,
} from "../lib/worldkit-cloud-artifacts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arguments_ = process.argv.slice(2);
const value = (name) => {
  const index = arguments_.indexOf(name);
  if (index < 0 || !arguments_[index + 1]) throw new Error(`Missing ${name}.`);
  return arguments_[index + 1];
};
const sceneId = value("--scene-id");
const episodeId = value("--episode-id");
const episodeRoot = path.resolve(value("--episode-root"));
const sceneRoot = path.resolve(value("--scene-root"));
const backend = value("--backend");
const explicitOrigin = arguments_.includes("--origin") ? value("--origin") : null;
const until = arguments_.includes("--until") ? value("--until") : "full";
const checkpointPhases = new Set([
  "plan",
  "openings",
  "visuals",
  "diversity",
  "events",
  "prompts",
  "seedance",
  "conformance",
]);
if (!["full", "visual-review", ...checkpointPhases].includes(until)) {
  throw new Error("Style Variant --until phase is invalid.");
}
const config = await loadEpisodeStyleVariantConfig(repoRoot);
if (!config.enabled) throw new Error("Style Variant production is disabled.");
const visualConcurrency = backend === "local" ? 1 : config.visualConcurrency;
const reviewConcurrency = backend === "local" ? 1 : config.reviewConcurrency;
const variantIds = episodeStyleVariantIds(config.variantCount);
const styleRoot = path.join(episodeRoot, "style-variants");
const planInputPath = path.join(styleRoot, "style-variant-plan-input.json");
const planPath = path.join(styleRoot, "style-variant-plan.json");
const planReportPath = path.join(styleRoot, "style-variant-plan-report.json");
const openingAnchorManifestPath = path.join(styleRoot, "opening-anchor-manifest.json");
const recordPath = path.join(styleRoot, "style-variant-production-record.json");
const manifestPath = path.join(styleRoot, "style-variant-manifest.json");
const videoPipeline = JSON.parse(await readFile(
  path.join(repoRoot, "config/episode-video-pipeline.json"), "utf8",
));
const delivery = videoPipeline.delivery;
const finalVideoName = `final-${delivery.width}x${delivery.height}-${delivery.fps}fps-${delivery.frameCount}f.mp4`;
const cloudExecutionId = process.env.WORLDKIT_CLOUD_EXECUTION_ID;
const cloudStageId = process.env.WORLDKIT_CLOUD_EXECUTION_STAGE_ID;
const cloudStageAttempt = Number(process.env.WORLDKIT_CLOUD_STAGE_ATTEMPT ?? 1);
const cloudOutputS3Prefix = process.env.WORLDKIT_CLOUD_OUTPUT_S3_PREFIX;
const cloudBaseManifestPath = process.env.WORLDKIT_CLOUD_BASE_MANIFEST_PATH
  ? path.resolve(process.env.WORLDKIT_CLOUD_BASE_MANIFEST_PATH)
  : path.join(
      repoRoot,
      ".codex-tmp",
      "episode-checkpoints",
      episodeId,
      "latest-style-checkpoint.json",
    );
let cloudCheckpointSequence = 0;
let latestCloudCheckpointManifest = await readJson(cloudBaseManifestPath);

async function publishCloudCheckpoint(internalStageId) {
  if (
    ![
      "render", "style-plan", "style-openings", "style-visuals",
      "style-diversity", "style-events", "style-prompts", "seedance",
      "conformance", "publication",
    ].includes(process.env.WORLDKIT_CLOUD_EXECUTION_PART) ||
    typeof cloudExecutionId !== "string" ||
    typeof cloudStageId !== "string" ||
    typeof cloudOutputS3Prefix !== "string" ||
    !Number.isSafeInteger(cloudStageAttempt) || cloudStageAttempt < 1
  ) return;
  cloudCheckpointSequence += 1;
  await mkdir(path.dirname(cloudBaseManifestPath), { recursive: true });
  const checkpointS3Prefix = joinS3Uri(
    cloudOutputS3Prefix,
    "stages",
    cloudStageId,
    `attempt-${cloudStageAttempt}`,
    "checkpoints",
    internalStageId,
    `revision-${String(cloudCheckpointSequence).padStart(3, "0")}`,
  );
  const manifest = await buildCloudEpisodeArtifactManifest({
    sceneId,
    episodeId,
    executionId: cloudExecutionId,
    stageId: cloudStageId,
    stageOutputS3Prefix: checkpointS3Prefix,
    episodeRoot,
    workerImage: process.env.WORLDKIT_CLOUD_WORKER_IMAGE ?? null,
    sourceRevision: process.env.WORLDKIT_SOURCE_REVISION ?? null,
    requireComplete: false,
    executionPart: "render",
    reuseArtifacts: latestCloudCheckpointManifest?.artifacts ?? [],
  });
  const uploaded = await uploadCloudArtifactManifest(
    manifest,
    cloudBaseManifestPath,
    { stageOutputS3Prefix: checkpointS3Prefix },
  );
  latestCloudCheckpointManifest = uploaded.manifest;
  process.stdout.write(
    `WORLDKIT_EPISODE_CLOUD_CHECKPOINT ${internalStageId} ` +
      `${uploaded.cloudExecutionArtifacts[0].s3_uri}\n`,
  );
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function readJson(filePath) {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return null; }
}

async function run(command, args, { accept = [0], env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (accept.includes(code)) resolve({ code, signal });
      else reject(new Error(
        `${command} ${args.join(" ")} exited ${code ?? `by ${signal}`}.`,
      ));
    });
  });
}

const episodeRecordAtStart = await readJson(path.join(episodeRoot, "episode-record.json"));
if (episodeRecordAtStart?.styleVariantMode !== "ten-style") {
  let inheritedOrigin = explicitOrigin ?? process.env.WORLDKIT_STUDIO_ORIGIN ?? null;
  if (inheritedOrigin === null) {
    try {
      const parentCommand = execFileSync(
        "ps", ["-p", String(process.ppid), "-o", "command="], { encoding: "utf8" },
      );
      inheritedOrigin = /--origin\s+([^\s]+)/.exec(parentCommand)?.[1] ?? null;
    } catch {}
  }
  await run("node", [
    "scripts/episodes/run-episode-workflow.mjs",
    "--scene-id", sceneId,
    "--episode-id", episodeId,
    "--origin", inheritedOrigin ?? "http://127.0.0.1:4297",
    "--backend", backend,
  ], {
    env: { ...process.env, WORLDKIT_EPISODE_STYLE_VARIANTS: "0" },
  });
  process.stdout.write("WORLDKIT_STYLE_VARIANT_COMPATIBILITY legacy-episode-preserved\n");
  process.exit(0);
}

async function mapConcurrent(items, concurrency, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = { ok: true, value: await operation(items[index], index) };
        } catch (error) {
          results[index] = { ok: false, error };
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}

let record = {
  kind: "worldkit-episode-style-variant-production-record",
  schemaVersion: 1,
  sceneId,
  episodeId,
  productionScope: until === "visual-review" ? "visual-sample" : "full",
  status: "running",
  currentStage: null,
  variants: variantIds.map((id) => ({
    id,
    status: "pending",
    currentStage: null,
    visualAttempt: 0,
    error: null,
  })),
};
const previous = await readJson(recordPath);
if (previous?.sceneId === sceneId && previous?.episodeId === episodeId) {
  const prior = new Map((previous.variants ?? []).map((item) => [item.id, item]));
  record = {
    ...record,
    ...previous,
    status: "running",
    variants: record.variants.map((item) => ({ ...item, ...(prior.get(item.id) ?? {}) })),
  };
}
const writeRecord = createJsonAtomicWriter(recordPath);
function persist() {
  const snapshot = { ...record, updatedAt: new Date().toISOString() };
  return writeRecord(snapshot);
}
async function updateVariant(id, patch) {
  record = {
    ...record,
    variants: record.variants.map((item) => item.id === id ? { ...item, ...patch } : item),
  };
  await persist();
}
async function stage(id, operation) {
  record = { ...record, currentStage: id };
  await persist();
  process.stdout.write(`WORLDKIT_STYLE_VARIANT_STAGE ${id} running\n`);
  const result = await operation();
  await publishCloudCheckpoint(id);
  process.stdout.write(`WORLDKIT_STYLE_VARIANT_STAGE ${id} complete\n`);
  return result;
}

class StyleVariantCheckpointComplete extends Error {
  constructor(phase) {
    super(`Style Variant checkpoint complete: ${phase}`);
    this.phase = phase;
  }
}

function stopAtCheckpoint(phase) {
  if (until === phase) throw new StyleVariantCheckpointComplete(phase);
}

async function prepareCurrentPlanInput() {
  await run("node", [
    "scripts/episodes/prepare-style-variant-plan-input.mjs",
    "--scene-id", sceneId, "--episode-id", episodeId,
    "--scene-root", sceneRoot, "--episode-root", episodeRoot,
    "--output", planInputPath,
  ]);
}

async function planIsCurrent() {
  if (!await exists(planPath) || !await exists(planReportPath)) return false;
  try {
    await prepareCurrentPlanInput();
    await run("node", [
      "scripts/episodes/validate-style-variant-plan.mjs",
      "--scene-id", sceneId, "--episode-id", episodeId,
      "--input", planInputPath, "--plan", planPath, "--report", planReportPath,
    ]);
    return true;
  } catch {
    return false;
  }
}

async function openingAnchorsAreCurrent() {
  const manifest = await readJson(openingAnchorManifestPath);
  if (!manifest) return false;
  const [planHash, whiteboxHash] = await Promise.all([
    sha256File(planPath).catch(() => null),
    sha256File(path.join(episodeRoot, "whitebox/segment-00-first-frame.png"))
      .catch(() => null),
  ]);
  const validation = validateStyleVariantOpeningAnchorManifest(manifest, {
    sceneId,
    episodeId,
    planHash,
    whiteboxHash,
    variantCount: config.variantCount,
  });
  if (!validation.ok || (process.env.WORLDKIT_CLOUD_EXECUTION_ID &&
      manifest.approval.mode !== "codex-review")) return false;
  for (const anchor of manifest.anchors) {
    const anchorPath = path.join(styleRoot, anchor.path);
    if (await sha256File(anchorPath).catch(() => null) !== anchor.contentHash) return false;
  }
  return true;
}

async function reviewIsCurrent(styleVariantId) {
  const variantRoot = path.join(styleRoot, styleVariantId);
  const reviewPath = path.join(variantRoot, "review/visual-quality-review.json");
  const reportPath = path.join(variantRoot, "review/visual-quality-review-report.json");
  const currentInputPath = path.join(variantRoot, "review/input-identity-current.json");
  const [review, report] = await Promise.all([
    readJson(reviewPath),
    readJson(reportPath),
  ]);
  if (!styleVariantPassedReview(review) || report?.passed !== true ||
      report?.reviewerVerdict !== "passed" ||
      !String(report?.reviewerTaskId ?? "").startsWith(
        `style-review-${styleVariantId}-`,
      )) return false;
  try {
    await run("node", [
      "scripts/episodes/prepare-style-variant-review-input.mjs",
      "--scene-id", sceneId, "--episode-id", episodeId,
      "--style-variant-id", styleVariantId,
      "--scene-root", sceneRoot, "--episode-root", episodeRoot,
      "--output", currentInputPath,
    ]);
    return isDeepStrictEqual(review.inputIdentity, await readJson(currentInputPath));
  } catch {
    return false;
  }
}

async function diversityReviewIsCurrent() {
  const reviewPath = path.join(styleRoot, "diversity-review.json");
  const reportPath = path.join(styleRoot, "diversity-review-report.json");
  const currentInputPath = path.join(styleRoot, "diversity-review-input-current.json");
  const [review, report] = await Promise.all([
    readJson(reviewPath),
    readJson(reportPath),
  ]);
  if (!styleVariantPassedDiversityReview(review) || report?.passed !== true ||
      !String(report?.reviewerTaskId ?? "").startsWith("style-diversity-review-")) {
    return false;
  }
  try {
    await run("node", [
      "scripts/episodes/prepare-style-variant-diversity-review-input.mjs",
      "--scene-id", sceneId, "--episode-id", episodeId,
      "--episode-root", episodeRoot, "--output", currentInputPath,
    ]);
    return isDeepStrictEqual(review.inputIdentity, await readJson(currentInputPath));
  } catch {
    return false;
  }
}

async function eventsAreCurrent(styleVariantId) {
  const variantRoot = path.join(styleRoot, styleVariantId);
  const [eventPlan, styleHash, reviewHash, reviewReportHash] = await Promise.all([
    readJson(path.join(variantRoot, "prompts/visual-events.json")),
    sha256File(path.join(variantRoot, "style-variant.json")).catch(() => null),
    sha256File(path.join(variantRoot, "review/visual-quality-review.json"))
      .catch(() => null),
    sha256File(path.join(variantRoot, "review/visual-quality-review-report.json"))
      .catch(() => null),
  ]);
  return eventPlan?.styleVariantId === styleVariantId &&
    eventPlan?.styleVariantInput?.styleVariantHash === styleHash &&
    eventPlan?.styleVariantInput?.visualReviewHash === reviewHash &&
    eventPlan?.styleVariantInput?.visualReviewReportHash === reviewReportHash;
}

async function providerReady(variantRoot, segmentId, requireFinal) {
  const result = await readJson(path.join(variantRoot, "video", segmentId, "provider-run.json"));
  if (!result) return false;
  return requireFinal
    ? result.status === "succeeded" &&
        await exists(path.join(variantRoot, "video", segmentId, finalVideoName))
    : ["seedance-ready", "succeeded"].includes(result.status);
}

try {
  await stage("style-variant-plan", async () => {
    if (!await planIsCurrent()) {
      await run("bash", [
        "scripts/agents/run-lwdp-style-variant-director-agent.sh",
        "--scene-id", sceneId, "--episode-id", episodeId,
        "--episode-root", episodeRoot, "--backend", backend,
      ]);
    }
    await run("node", [
      "scripts/episodes/materialize-style-variant-roots.mjs",
      "--episode-root", episodeRoot, "--plan", planPath,
    ]);
  });
  stopAtCheckpoint("plan");

  await stage("style-variant-opening-anchors", async () => {
    if (await openingAnchorsAreCurrent()) return;
    let priorRunRoot = null;
    let priorReviewPath = null;
    for (let attempt = 1; attempt <= config.maximumOpeningAttempts; attempt += 1) {
      const runRoot = path.join(
        repoRoot,
        ".codex-tmp/style-variant-opening-batch",
        episodeId,
        `attempt-${attempt}`,
      );
      const generationArgs = [
        "scripts/agents/run-style-variant-opening-imagegen-batch.sh",
        "--scene-id", sceneId,
        "--episode-id", episodeId,
        "--episode-root", episodeRoot,
        "--attempt", String(attempt),
      ];
      if (priorRunRoot && priorReviewPath) generationArgs.push(
        "--prior-run", priorRunRoot,
        "--review", priorReviewPath,
      );
      await run("bash", generationArgs);
      const reviewArgs = [
        "scripts/agents/run-style-variant-opening-reviewer-agent.sh",
        "--scene-id", sceneId,
        "--episode-id", episodeId,
        "--episode-root", episodeRoot,
        "--run-root", runRoot,
        "--backend", backend,
        "--attempt", String(attempt),
      ];
      if (priorReviewPath) reviewArgs.push("--prior-review", priorReviewPath);
      const review = await run("bash", reviewArgs, { accept: [0, 10] });
      if (review.code === 0) {
        await run("node", [
          "scripts/episodes/promote-style-variant-opening-anchors.mjs",
          "--scene-id", sceneId,
          "--episode-id", episodeId,
          "--episode-root", episodeRoot,
          "--run-root", runRoot,
          "--approval-mode", "codex-review",
        ]);
        if (!await openingAnchorsAreCurrent()) {
          throw new Error("Promoted Style Variant opening anchors are stale.");
        }
        return;
      }
      priorRunRoot = runRoot;
      priorReviewPath = path.join(runRoot, "review/opening-review.json");
    }
    throw new Error("Style Variant openings did not pass within the repair budget.");
  });
  stopAtCheckpoint("openings");

  const alreadyPassed = [];
  const initialVisualIds = [];
  const interruptedVisualsByAttempt = new Map();
  for (const styleVariantId of variantIds) {
    if (await reviewIsCurrent(styleVariantId)) alreadyPassed.push(styleVariantId);
    else {
      const prior = record.variants.find(({ id }) => id === styleVariantId);
      const priorAttempt = Number(prior?.visualAttempt ?? 0);
      if (prior?.status === "running" && priorAttempt >= 1 &&
          String(prior?.currentStage ?? "").includes("visual")) {
        const ids = interruptedVisualsByAttempt.get(priorAttempt) ?? [];
        ids.push(styleVariantId);
        interruptedVisualsByAttempt.set(priorAttempt, ids);
      } else if (priorAttempt < 1 || prior?.status === "pending") {
        initialVisualIds.push(styleVariantId);
      }
    }
  }
  for (const styleVariantId of alreadyPassed) {
    await updateVariant(styleVariantId, {
      status: "visual-passed", currentStage: null, error: null,
    });
  }
  const generateVisuals = async (styleVariantIds, attempt, stageId) =>
    stage(stageId, async () => {
      const results = await mapConcurrent(
        styleVariantIds,
        visualConcurrency,
        async (styleVariantId) => {
          await updateVariant(styleVariantId, {
            status: "running", currentStage: stageId,
            visualAttempt: attempt, error: null,
          });
          await run("bash", [
            "scripts/agents/run-lwdp-style-variant-visual-agent.sh",
            "--scene-id", sceneId, "--episode-id", episodeId,
            "--episode-root", episodeRoot, "--style-variant-id", styleVariantId,
            "--backend", backend, "--attempt", String(attempt),
          ]);
          await updateVariant(styleVariantId, {
            status: "visuals-ready", currentStage: null, error: null,
          });
        },
      );
      for (const [index, result] of results.entries()) {
        if (result.ok) continue;
        await updateVariant(styleVariantIds[index], {
          status: "visual-generation-failed",
          currentStage: null,
          error: result.error.message,
        });
      }
    });
  const reviewVisuals = async (styleVariantIds, attempt, stageId) =>
    stage(stageId, async () => {
      const results = await mapConcurrent(
        styleVariantIds,
        reviewConcurrency,
        async (styleVariantId) => {
          await updateVariant(styleVariantId, {
            status: "running", currentStage: stageId, error: null,
          });
          const review = await run("bash", [
            "scripts/agents/run-lwdp-style-variant-reviewer-agent.sh",
            "--scene-id", sceneId, "--episode-id", episodeId,
            "--episode-root", episodeRoot, "--style-variant-id", styleVariantId,
            "--backend", backend, "--attempt", String(attempt),
          ], { accept: [0, 10] });
          const passed = review.code === 0 && await reviewIsCurrent(styleVariantId);
          await updateVariant(styleVariantId, passed
            ? { status: "visual-passed", currentStage: null, error: null }
            : {
                status: "visual-needs-repair",
                currentStage: null,
                error: "Independent Codex Reviewer requested repair.",
              });
        },
      );
      for (const [index, result] of results.entries()) {
        if (result.ok) continue;
        await updateVariant(styleVariantIds[index], {
          status: "visual-review-failed",
          currentStage: null,
          error: result.error.message,
        });
      }
    });

  if (initialVisualIds.length > 0) {
    await generateVisuals(initialVisualIds, 1, "style-variant-visuals");
  }
  for (const [attempt, styleVariantIds] of interruptedVisualsByAttempt) {
    await generateVisuals(
      styleVariantIds,
      attempt,
      "style-variant-visual-resume",
    );
  }
  const reviewIds = record.variants
    .filter(({ status }) => ["visuals-ready", "visual-review-failed"].includes(status))
    .map(({ id }) => id);
  if (reviewIds.length > 0) {
    await reviewVisuals(reviewIds, 1, "style-variant-visual-review");
  }
  for (let attempt = 2; attempt <= config.maximumVisualAttempts; attempt += 1) {
    const repairIds = record.variants
      .filter(({ status, visualAttempt }) =>
        ["visual-needs-repair", "visual-generation-failed"].includes(status) &&
        Number(visualAttempt ?? 0) < attempt)
      .map(({ id }) => id);
    if (repairIds.length === 0) break;
    await generateVisuals(repairIds, attempt, "style-variant-visual-repair");
    const rereviewIds = record.variants
      .filter(({ id, status }) => repairIds.includes(id) && status === "visuals-ready")
      .map(({ id }) => id);
    await reviewVisuals(rereviewIds, attempt, "style-variant-visual-rereview");
  }
  for (const item of record.variants.filter(({ status }) =>
    ["visual-needs-repair", "visual-generation-failed", "visual-review-failed"]
      .includes(status))) {
    await updateVariant(item.id, {
      status: "visual-review-failed",
      currentStage: null,
      error: item.error ?? "Visual review did not pass within the repair budget.",
    });
  }
  stopAtCheckpoint("visuals");
  let passedVariantIds = record.variants
    .filter(({ status }) => status === "visual-passed")
    .map(({ id }) => id);

  if (passedVariantIds.length === variantIds.length) {
    await stage("style-variant-diversity-review", async () => {
      if (await diversityReviewIsCurrent()) return;
      const review = await run("bash", [
        "scripts/agents/run-lwdp-style-variant-diversity-reviewer-agent.sh",
        "--scene-id", sceneId, "--episode-id", episodeId,
        "--episode-root", episodeRoot, "--backend", backend, "--attempt", "1",
      ], { accept: [0, 10] });
      if (review.code === 0 && await diversityReviewIsCurrent()) return;
      const diversityReview = await readJson(path.join(styleRoot, "diversity-review.json"));
      const failedIds = new Set((diversityReview?.variantReviews ?? [])
        .filter(({ verdict }) => verdict === "needs-repair")
        .map(({ styleVariantId }) => styleVariantId));
      for (const styleVariantId of variantIds) {
        if (!failedIds.has(styleVariantId)) continue;
        const finding = diversityReview.variantReviews.find(
          (item) => item.styleVariantId === styleVariantId,
        );
        await updateVariant(styleVariantId, {
          status: "visual-diversity-failed",
          currentStage: null,
          error: finding?.repairInstructions ?? "Joint Codex diversity review requested repair.",
        });
      }
    });
    passedVariantIds = record.variants
      .filter(({ status }) => status === "visual-passed")
      .map(({ id }) => id);
  }
  stopAtCheckpoint("diversity");

  if (["full", "events", "prompts", "seedance", "conformance"].includes(until)) {
    await stage("style-variant-gemini-events", async () => {
    const results = await mapConcurrent(
      passedVariantIds,
      config.geminiConcurrency,
      async (styleVariantId) => {
        const variantRoot = path.join(styleRoot, styleVariantId);
        if (!await eventsAreCurrent(styleVariantId)) {
          await run("python3", [
            "scripts/episodes/run-gemini-visual-event-director.py",
            "--scene-id", sceneId, "--episode-id", episodeId,
            "--episode-root", episodeRoot, "--style-root", variantRoot,
            "--style-variant", path.join(variantRoot, "style-variant.json"),
          ]);
        }
        await updateVariant(styleVariantId, {
          status: "events-ready", currentStage: null, error: null,
        });
      },
    );
    for (const [index, result] of results.entries()) {
      if (result.ok) continue;
      await updateVariant(passedVariantIds[index], {
        status: "gemini-failed", currentStage: null, error: result.error.message,
      });
    }
  });
  stopAtCheckpoint("events");
  const eventReadyIds = record.variants
    .filter(({ status }) => status === "events-ready")
    .map(({ id }) => id);

  await stage("style-variant-seedance-prompts", async () => {
    const results = await mapConcurrent(eventReadyIds, config.geminiConcurrency,
      async (styleVariantId) => {
        const variantRoot = path.join(styleRoot, styleVariantId);
        await run("node", [
          "scripts/episodes/build-episode-seedance-prompts.mjs",
          "--scene-id", sceneId, "--episode-id", episodeId,
          "--scene-root", sceneRoot, "--episode-root", episodeRoot,
          "--style-root", variantRoot, "--style-variant-id", styleVariantId,
        ]);
        await run("node", [
          "scripts/episodes/prepare-episode-video-requests.mjs",
          "--scene-id", sceneId, "--episode-id", episodeId,
          "--episode-root", episodeRoot, "--style-root", variantRoot,
          "--style-variant-id", styleVariantId,
        ]);
        await updateVariant(styleVariantId, {
          status: "seedance-prompts-ready", currentStage: null, error: null,
        });
      });
    for (const [index, result] of results.entries()) {
      if (result.ok) continue;
      await updateVariant(eventReadyIds[index], {
        status: "seedance-prompt-failed", error: result.error.message,
      });
    }
  });
  stopAtCheckpoint("prompts");
  const promptReadyIds = record.variants
    .filter(({ status }) => status === "seedance-prompts-ready")
    .map(({ id }) => id);
  const videoTasks = promptReadyIds.flatMap((styleVariantId) =>
    EPISODE_STYLE_VARIANT_SEGMENT_IDS.map((segmentId) => ({
      styleVariantId,
      segmentId,
      variantRoot: path.join(styleRoot, styleVariantId),
    })));

  await stage("style-variant-seedance-generation", async () => {
    const results = await mapConcurrent(videoTasks, config.seedanceConcurrency,
      async ({ variantRoot, segmentId }) => {
        if (await providerReady(variantRoot, segmentId, false)) return;
        await run("node", [
          "scripts/episodes/run-episode-video-segment-with-fallback.mjs",
          "--request", path.join(variantRoot, "video", segmentId, "request.json"),
          "--result", path.join(variantRoot, "video", segmentId, "provider-run.json"),
          "--until", "seedance",
        ]);
      });
    const failed = new Set(results.flatMap((result, index) =>
      result.ok ? [] : [videoTasks[index].styleVariantId]));
    for (const styleVariantId of promptReadyIds) {
      await updateVariant(styleVariantId, failed.has(styleVariantId)
        ? { status: "seedance-failed", error: "One or more Seedance Jobs failed." }
        : { status: "seedance-ready", error: null });
    }
    assertConcurrentStageSucceeded(results, "SEEDANCE_PROVIDER_STAGE_INCOMPLETE");
  });
  stopAtCheckpoint("seedance");
  const seedanceReadyTasks = videoTasks.filter(({ styleVariantId }) =>
    record.variants.find(({ id }) => id === styleVariantId)?.status === "seedance-ready");

    await stage("style-variant-conformance", async () => {
    const results = await mapConcurrent(seedanceReadyTasks, config.seedanceConcurrency,
      async ({ variantRoot, segmentId }) => {
        if (await providerReady(variantRoot, segmentId, true)) return;
        await run("node", [
          "scripts/episodes/run-episode-video-segment-with-fallback.mjs",
          "--request", path.join(variantRoot, "video", segmentId, "request.json"),
          "--result", path.join(variantRoot, "video", segmentId, "provider-run.json"),
          "--until", "conformance",
        ]);
      });
    const failed = new Set(results.flatMap((result, index) =>
      result.ok ? [] : [seedanceReadyTasks[index].styleVariantId]));
    for (const styleVariantId of promptReadyIds) {
      if (record.variants.find(({ id }) => id === styleVariantId)?.status !== "seedance-ready") {
        continue;
      }
      await updateVariant(styleVariantId, failed.has(styleVariantId)
        ? { status: "conformance-failed", error: "One or more final videos failed conformance." }
        : { status: "succeeded", currentStage: null, error: null });
    }
    });
    stopAtCheckpoint("conformance");
  }

  const plan = await readJson(planPath);
  const variants = await Promise.all(record.variants.map(async (item) => {
    const variantRoot = path.join(styleRoot, item.id);
    const visualManifestPath = path.join(variantRoot, "visual/visual-manifest.json");
    const visualManifest = await readJson(visualManifestPath);
    return {
      ...item,
      styleVariantPath: `style-variants/${item.id}/style-variant.json`,
      visualManifestPath: `style-variants/${item.id}/visual/visual-manifest.json`,
      visualManifestHash: await sha256File(visualManifestPath).catch(() => null),
      visualPromptPath: `style-variants/${item.id}/visual/visual-prompts.json`,
      appearanceAnchorPath:
        `style-variants/${item.id}/visual/segment-00-styled-opening-frame.png`,
      appearanceAnchorHash: visualManifest?.appearanceAnchorHash ?? null,
      targetTriviews: (visualManifest?.targets ?? []).map((target) => ({
        visualTargetId: target.visualTargetId,
        path: `style-variants/${item.id}/${target.styledTriview.path}`,
        contentHash: target.styledTriview.contentHash,
      })),
      visualReviewPath: `style-variants/${item.id}/review/visual-quality-review.json`,
      visualReviewHash: await sha256File(path.join(
        variantRoot, "review/visual-quality-review.json",
      )).catch(() => null),
      visualReviewReportPath: `style-variants/${item.id}/review/visual-quality-review-report.json`,
      visualReviewReportHash: await sha256File(path.join(
        variantRoot, "review/visual-quality-review-report.json",
      )).catch(() => null),
      geminiEventPath: `style-variants/${item.id}/prompts/visual-events.json`,
      finalVideos: EPISODE_STYLE_VARIANT_SEGMENT_IDS.map((segmentId) => ({
        segmentId,
        path: `style-variants/${item.id}/video/${segmentId}/${finalVideoName}`,
      })),
    };
  }));
  const succeededCount = variants.filter(({ status }) => until === "visual-review"
    ? status === "visual-passed"
    : status === "succeeded").length;
  await writeJsonAtomic(manifestPath, {
    kind: "worldkit-episode-style-variant-manifest",
    schemaVersion: 1,
    sceneId,
    episodeId,
    sourceWhiteboxIdentity: plan.sourceWhiteboxIdentity,
    openingAnchorManifestPath: "style-variants/opening-anchor-manifest.json",
    openingAnchorManifestHash: await sha256File(openingAnchorManifestPath),
    diversityReviewPath: "style-variants/diversity-review.json",
    diversityReviewHash: await sha256File(path.join(
      styleRoot, "diversity-review.json",
    )).catch(() => null),
    diversityReviewReportPath: "style-variants/diversity-review-report.json",
    diversityReviewReportHash: await sha256File(path.join(
      styleRoot, "diversity-review-report.json",
    )).catch(() => null),
    productionScope: until === "visual-review" ? "visual-sample" : "full",
    variantCount: variants.length,
    succeededCount,
    variants,
  });
  record = {
    ...record,
    status: succeededCount === config.variantCount ? "succeeded" : "failed",
    currentStage: null,
    productionScope: until === "visual-review" ? "visual-sample" : "full",
  };
  await persist();
  if (succeededCount !== config.variantCount) {
    throw new Error(
      `STYLE_VARIANT_PRODUCTION_INCOMPLETE succeeded=${succeededCount}/${config.variantCount}`,
    );
  }
  process.stdout.write(
    `WORLDKIT_STYLE_VARIANT_WORKFLOW_READY variants=${succeededCount} until=${until}\n`,
  );
} catch (error) {
  if (error instanceof StyleVariantCheckpointComplete) {
    record = {
      ...record,
      status: "checkpoint",
      currentStage: null,
      error: null,
      checkpointPhase: error.phase,
    };
    await persist();
    process.stdout.write(
      `WORLDKIT_STYLE_VARIANT_WORKFLOW_CHECKPOINT phase=${error.phase}\n`,
    );
  } else {
  record = { ...record, status: "failed", currentStage: null, error: error.message };
  await persist();
  throw error;
  }
}
