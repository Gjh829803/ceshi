#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLAYTHROUGH_HOST_EVENT_SLOTS,
  PLAYTHROUGH_EVENT_SEGMENT_INDICES,
  PLAYTHROUGH_PROMPT_WINDOWS,
  PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES,
  PLAYTHROUGH_SEGMENT_FRAME_COUNT,
  sha256Canonical,
  validatePlaythroughFrameTelemetry,
  validateVisualEventPlan,
  writeJsonAtomic,
} from "../lib/playthrough-dataset.mjs";
import { EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION } from "../lib/episode-seedance-prompt.mjs";
import {
  PLAYTHROUGH_CAPTURE_HEALTH_POLICY,
  validatePlaythroughCaptureHealth,
} from "../lib/playthrough-capture-health.mjs";
import { validatePlaythroughPlanStructure } from "../lib/playthrough-plan-structure.mjs";
import {
  loadEpisodeStyleVariantConfig,
  validateStyleVariantOpeningAnchorManifest,
} from "../lib/episode-style-variants.mjs";
import {
  buildEpisodeSceneRuntimeIdentity,
  buildEpisodeVisualEventInputIdentity,
  buildEpisodeVisualInputIdentity,
} from "../lib/episode-input-identity.mjs";
import {
  buildCloudEpisodeArtifactManifest,
  uploadCloudArtifactManifest,
} from "../lib/worldkit-cloud-artifacts.mjs";
import { joinS3Uri } from "../lib/lwdp-generation-client.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index < 0) {
    if (fallback !== null) return fallback;
    throw new Error(`Missing ${name}.`);
  }
  if (!args[index + 1]) throw new Error(`Missing value for ${name}.`);
  return args[index + 1];
};
const sceneId = value("--scene-id");
const episodeId = value("--episode-id", `episode-${sceneId}-${Date.now().toString(36)}`);
const origin = value("--origin", process.env.WORLDKIT_STUDIO_ORIGIN || "http://127.0.0.1:4297");
const backend = value("--backend", "cloud");
const executionPart = value("--execution-part", "full");
const styleUntilByExecutionPart = Object.freeze({
  "style-plan": "plan",
  "style-openings": "openings",
  "style-visuals": "visuals",
  "style-diversity": "diversity",
  "style-events": "events",
  "style-prompts": "prompts",
  seedance: "seedance",
  conformance: "conformance",
  publication: "full",
});
const fineGrainedRenderPart = executionPart in styleUntilByExecutionPart;
if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(sceneId) ||
    !/^[a-z0-9][a-z0-9-]{2,119}$/.test(episodeId) ||
    !["cloud", "local"].includes(backend) ||
    !["full", "prepare", "capture", "render", ...Object.keys(styleUntilByExecutionPart)]
      .includes(executionPart)) {
  throw new Error("Invalid workflow identity or backend.");
}
const sceneRoot = path.join(repoRoot, "artifacts/scenes", sceneId);
const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
const persistedEpisodeIdentity = await readFile(
  path.join(episodeRoot, "episode-record.json"), "utf8",
).then(JSON.parse).catch(() => null);
const productionScope = process.env.WORLDKIT_EPISODE_PRODUCTION_SCOPE ??
  persistedEpisodeIdentity?.productionScope ?? "full";
if (!["full", "visual-sample", "seedance-conformance"].includes(productionScope)) {
  throw new Error(
    "Episode production scope must be full, visual-sample, or seedance-conformance.",
  );
}
const videoPipelineConfig = JSON.parse(await readFile(
  path.join(repoRoot, "config/episode-video-pipeline.json"),
  "utf8",
));
const fallbackVideoPipelineConfig = videoPipelineConfig.fallback?.pipelineConfigPath
  ? JSON.parse(await readFile(
      path.resolve(repoRoot, videoPipelineConfig.fallback.pipelineConfigPath),
      "utf8",
    ))
  : null;
const loadedStyleVariantConfig = await loadEpisodeStyleVariantConfig(repoRoot);
const styleVariantEnvironmentOverride = ["0", "1"].includes(
  process.env.WORLDKIT_EPISODE_STYLE_VARIANTS ?? "",
);
const styleVariantConfig = Object.freeze({
  ...loadedStyleVariantConfig,
  enabled: styleVariantEnvironmentOverride
    ? loadedStyleVariantConfig.enabled
    : persistedEpisodeIdentity === null
      ? loadedStyleVariantConfig.enabled
      : persistedEpisodeIdentity.styleVariantMode === "ten-style",
});
const visualEventDirectorConfigPath = path.join(
  repoRoot,
  "config/episode-visual-event-director.json",
);
const visualEventDirectorConfig = JSON.parse(await readFile(
  visualEventDirectorConfigPath,
  "utf8",
));
const visualEventPromptPath = path.join(
  repoRoot,
  visualEventDirectorConfig.promptTemplatePath,
);
const providerModel = videoPipelineConfig.seedance?.model;
const providerKind = videoPipelineConfig.seedanceProvider?.kind;
const fallbackProviderModel = fallbackVideoPipelineConfig?.seedance?.model;
const fallbackUpscaleModel = fallbackVideoPipelineConfig?.upscale?.model;
const fallbackProviderKind = fallbackVideoPipelineConfig?.seedanceProvider?.kind;
const seedanceConcurrency = Math.max(
  1,
  Math.min(
    PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES.length,
    Number(videoPipelineConfig.seedanceProvider?.maxConcurrentJobs ?? 3),
  ),
);
if (providerModel !== "seedance-2.5" ||
    providerKind !== "seedance-2.5-direct-api" ||
    fallbackProviderModel !== "mg-seedance-2.5-480p" ||
    fallbackUpscaleModel !== "cf-超分-720p-30s" ||
    fallbackProviderKind !== "mg-seedance-2.5-plus-cf-upscale") {
  throw new Error(
    `Unexpected episode video chain: ${providerKind}/${providerModel} -> ` +
      `${fallbackProviderKind}/${fallbackProviderModel}/${fallbackUpscaleModel}`,
  );
}
if (videoPipelineConfig.captureCount !== 6 ||
    JSON.stringify(videoPipelineConfig.seedanceCaptureIndices) !== "[0,1,2,3,4,5]" ||
    JSON.stringify(videoPipelineConfig.eventCaptureIndices) !== "[0,2,4]" ||
    videoPipelineConfig.captureSeconds !== 30) {
  throw new Error("Episode six-capture timing contract is invalid.");
}
if (videoPipelineConfig.promptTemplateVersion !== EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION) {
  throw new Error(
    `Episode Prompt template lock mismatch: config=${videoPipelineConfig.promptTemplateVersion} ` +
    `code=${EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION}`,
  );
}
const delivery = videoPipelineConfig.delivery;
const rawProviderFileName = `${providerModel}.mp4`;
const finalVideoFileName = `final-${delivery.width}x${delivery.height}-${delivery.fps}fps-${delivery.frameCount}f.mp4`;
const recordPath = path.join(episodeRoot, "episode-record.json");
const logPath = path.join(episodeRoot, "pipeline.log");
await mkdir(episodeRoot, { recursive: true });
const log = createWriteStream(logPath, { flags: "a" });
const runningChildren = new Set();
let stopping = false;
const runtimeSlotRoot = path.join(repoRoot, ".codex-tmp/episode-runtime-slot");
const runtimeSlotPath = path.join(runtimeSlotRoot, "slot-0");

const sharedStageDefinitions = [
  ["reconnaissance", "运行时侦察"],
  ["navigation-evidence", "可通行区域与核心目的地"],
  ["playthrough-plan", "六个独立起点游荡剧本"],
  ["whitebox-capture", "六段独立 30 秒白膜录制"],
];
const legacyStageDefinitions = [
  ["visual-reconstruction", "六段样式首帧与共享三视图"],
  ["visual-events", "Gemini 3.5 Flash 单次五事件"],
  ["seedance-prompts", "六条详细 Seedance 渲染 Prompt（三条含事件）"],
  ["seedance-generation", "Seedance 2.5 720p 直出"],
  ["conformance", "24fps / 720 帧一致性"],
];
const stageDefinitions = [
  ...sharedStageDefinitions,
  ...(styleVariantConfig.enabled
    ? [
        ["style-variant-production", "十风格生产编排"],
        ["style-variant-plan", "十种独立风格规划"],
        ["style-variant-opening-anchors", "十张样式首帧与独立审核"],
        ["style-variant-visuals", "多样首帧与三视图生成"],
        ["style-variant-visual-review", "逐风格 Codex 视觉审核"],
        ["style-variant-diversity-review", "十风格差异性审核"],
        ["style-variant-gemini-events", "逐风格 Gemini 大型事件"],
        ["style-variant-seedance-prompts", "六十条 Seedance Prompt"],
        ["style-variant-seedance-generation", "六十段 Seedance 视频"],
        ["style-variant-conformance", "逐段媒体一致性校验"],
        ["episode-publication", "云端产物与 Review Bundle 发布"],
      ]
    : legacyStageDefinitions),
];
let record = {
  kind: "worldkit-episode-workflow-record",
  schemaVersion: 1,
  sceneId,
  episodeId,
  backend,
  segmentCount: 6,
  seedanceSegmentIds: ["segment-00", "segment-01", "segment-02", "segment-03", "segment-04", "segment-05"],
  deliveryDurationSeconds: 180,
  executionDurationSeconds: 180,
  styleVariantCount: styleVariantConfig.enabled ? styleVariantConfig.variantCount : 0,
  styleVariantMode: styleVariantConfig.enabled ? "ten-style" : "legacy",
  styleVariantIds: styleVariantConfig.enabled
    ? Array.from({ length: styleVariantConfig.variantCount }, (_, index) =>
        `style-${String(index).padStart(2, "0")}`)
    : [],
  productionScope,
  lastExecutionPart: executionPart,
  status: "running",
  currentStage: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  finishedAt: null,
  error: null,
  stages: stageDefinitions.map(([id, title]) => ({ id, title, status: "pending", startedAt: null, finishedAt: null })),
};
try {
  const existing = JSON.parse(await readFile(recordPath, "utf8"));
  if (existing.sceneId === sceneId && existing.episodeId === episodeId) {
    record = {
      ...record,
      ...existing,
      backend,
      seedanceSegmentIds: [
        "segment-00", "segment-01", "segment-02",
        "segment-03", "segment-04", "segment-05",
      ],
      styleVariantCount: styleVariantConfig.enabled
        ? styleVariantConfig.variantCount
        : 0,
      styleVariantMode: styleVariantConfig.enabled ? "ten-style" : "legacy",
      styleVariantIds: styleVariantConfig.enabled
        ? Array.from({ length: styleVariantConfig.variantCount }, (_, index) =>
          `style-${String(index).padStart(2, "0")}`)
        : [],
      productionScope,
      lastExecutionPart: executionPart,
      status: "running",
      error: null,
      updatedAt: new Date().toISOString(),
    };
    const priorStages = new Map((existing.stages ?? []).map((item) => [item.id, item]));
    record.stages = stageDefinitions.map(([id, title]) => ({
      id,
      title,
      status: "pending",
      startedAt: null,
      finishedAt: null,
      ...(priorStages.get(id) ?? {}),
      title,
    }));
  }
} catch {}

async function persist() {
  record.updatedAt = new Date().toISOString();
  await writeJsonAtomic(recordPath, record);
}
const cloudCheckpointStages = new Set([
  "style-variant-production",
  "visual-reconstruction",
  "visual-events",
  "seedance-prompts",
  "seedance-generation",
  "conformance",
]);
async function publishCloudStageCheckpoint(stageId) {
  const outputS3Prefix = process.env.WORLDKIT_CLOUD_OUTPUT_S3_PREFIX;
  const cloudExecutionId = process.env.WORLDKIT_CLOUD_EXECUTION_ID;
  const cloudStageId = process.env.WORLDKIT_CLOUD_EXECUTION_STAGE_ID;
  const cloudStageAttempt = Number(process.env.WORLDKIT_CLOUD_STAGE_ATTEMPT ?? 1);
  if (
    !["render", ...Object.keys(styleUntilByExecutionPart)].includes(executionPart) ||
    !cloudCheckpointStages.has(stageId) ||
    typeof outputS3Prefix !== "string" ||
    typeof cloudExecutionId !== "string" ||
    typeof cloudStageId !== "string" ||
    !Number.isSafeInteger(cloudStageAttempt) || cloudStageAttempt < 1
  ) return;
  const checkpointRoot = path.join(
    repoRoot,
    ".codex-tmp",
    "episode-checkpoints",
    episodeId,
  );
  await mkdir(checkpointRoot, { recursive: true });
  const manifestPath = process.env.WORLDKIT_CLOUD_BASE_MANIFEST_PATH
    ? path.resolve(process.env.WORLDKIT_CLOUD_BASE_MANIFEST_PATH)
    : path.join(checkpointRoot, `${stageId}.json`);
  const checkpointS3Prefix = joinS3Uri(
    outputS3Prefix,
    "stages",
    cloudStageId,
    `attempt-${cloudStageAttempt}`,
    "checkpoints",
    stageId,
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
    executionPart,
    reuseArtifacts: (await readJsonIfPresent(manifestPath))?.artifacts ?? [],
  });
  const uploaded = await uploadCloudArtifactManifest(manifest, manifestPath, {
    stageOutputS3Prefix: checkpointS3Prefix,
  });
  if (!process.env.WORLDKIT_CLOUD_BASE_MANIFEST_PATH) {
    await rm(manifestPath, { force: true });
  }
  writeOutput(
    `WORLDKIT_EPISODE_CLOUD_CHECKPOINT ${stageId} ` +
      `${uploaded.cloudExecutionArtifacts[0].s3_uri}\n`,
  );
}
async function exists(filePath) {
  try { return (await stat(filePath)).size > 0; } catch { return false; }
}

async function hasCompleteFrameTelemetry(filePath) {
  try {
    const trace = JSON.parse(await readFile(filePath, "utf8"));
    return trace?.kind === "worldkit-executed-playthrough-trace" && trace.schemaVersion === 3 &&
      validatePlaythroughFrameTelemetry(trace.frameTelemetry).ok;
  } catch {
    return false;
  }
}
async function hasCompleteWhiteboxCapture(whiteboxRoot, planPath) {
  const tracePath = path.join(whiteboxRoot, "executed-playthrough-trace.json");
  if (!await hasCompleteFrameTelemetry(tracePath)) return false;
  const [trace, rawTrace, storedQualityReport, plan] = await Promise.all([
    readJsonIfPresent(tracePath),
    readJsonIfPresent(path.join(whiteboxRoot, "executed-playthrough-raw-trace.json")),
    readJsonIfPresent(path.join(whiteboxRoot, "executed-playthrough-quality-report.json")),
    readJsonIfPresent(planPath),
  ]);
  const planHash = plan ? sha256Canonical(plan) : null;
  let qualityReport = storedQualityReport;
  if (qualityReport?.policy !== PLAYTHROUGH_CAPTURE_HEALTH_POLICY &&
      Array.isArray(rawTrace?.telemetrySamples) && planHash) {
    const segments = Array.from({ length: 6 }, (_, index) => {
      const quality = validatePlaythroughCaptureHealth({
        telemetrySamples: rawTrace.telemetrySamples.slice(
          index * PLAYTHROUGH_SEGMENT_FRAME_COUNT,
          (index + 1) * PLAYTHROUGH_SEGMENT_FRAME_COUNT,
        ),
        consoleErrors: rawTrace.consoleErrors ?? [],
      });
      return {
        segmentId: `segment-0${index}`,
        passed: quality.ok,
        diagnostics: quality.diagnostics,
        metrics: quality.metrics,
      };
    });
    qualityReport = {
      kind: "worldkit-executed-playthrough-quality-report",
      schemaVersion: 3,
      sceneId,
      planHash,
      policy: PLAYTHROUGH_CAPTURE_HEALTH_POLICY,
      passed: segments.every((segment) => segment.passed),
      diagnostics: segments.flatMap((segment) => segment.diagnostics.map(
        (diagnostic) => ({ ...diagnostic, segmentId: segment.segmentId }),
      )),
      segments,
      migratedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(
      path.join(whiteboxRoot, "executed-playthrough-quality-report.json"),
      qualityReport,
    );
  }
  if (qualityReport?.passed !== true || qualityReport?.planHash !== planHash ||
      qualityReport?.policy !== PLAYTHROUGH_CAPTURE_HEALTH_POLICY ||
      !Array.isArray(qualityReport?.segments) || qualityReport.segments.length !== 6 ||
      qualityReport.segments.some((segment) => segment?.passed !== true) ||
      trace?.planHash !== planHash || !Array.isArray(trace?.segments) ||
      trace.segments.length !== 6 || !Array.isArray(rawTrace?.telemetrySamples)) return false;
  if (trace.episodeContentHash !== await fileHash(path.join(
    whiteboxRoot,
    "episode-180s.mp4",
  ))) return false;
  for (const segment of trace.segments) {
    if (segment?.videoContentHash !== await fileHash(path.join(
      whiteboxRoot,
      segment?.videoPath ?? "",
    )) || segment?.firstFrameContentHash !== await fileHash(path.join(
      whiteboxRoot,
      segment?.firstFramePath ?? "",
    ))) return false;
  }
  const markers = new Map((trace.events ?? [])
    .filter((event) => event?.kind === "prompt-marker")
    .map((event) => [event.id, event]));
  for (const slot of PLAYTHROUGH_HOST_EVENT_SLOTS) {
    const marker = markers.get(slot.id);
    const window = PLAYTHROUGH_PROMPT_WINDOWS[slot.windowIndex];
    if (!Number.isFinite(marker?.actualSeconds) ||
        marker.segmentId !== slot.segmentId ||
        marker.actualSeconds < window.startSeconds ||
        marker.actualSeconds >= window.endSeconds) return false;
  }
  const requiredMedia = [
    "episode-180s.mp4",
    ...Array.from({ length: 6 }, (_, index) => `segment-0${index}.mp4`),
    ...Array.from({ length: 6 }, (_, index) => `segment-0${index}-first-frame.png`),
  ];
  return (await Promise.all(requiredMedia.map((fileName) =>
    exists(path.join(whiteboxRoot, fileName))))).every(Boolean);
}
async function fileHash(filePath) {
  try {
    return `sha256:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
  } catch {
    return null;
  }
}
async function hasCompleteStyleVariantProduction() {
  const styleRoot = path.join(episodeRoot, "style-variants");
  const manifestPath = path.join(styleRoot, "style-variant-manifest.json");
  const anchorManifestPath = path.join(styleRoot, "opening-anchor-manifest.json");
  const [manifest, anchorManifest] = await Promise.all([
    readJsonIfPresent(manifestPath),
    readJsonIfPresent(anchorManifestPath),
  ]);
  if (manifest?.kind !== "worldkit-episode-style-variant-manifest" ||
      manifest?.schemaVersion !== 1 || manifest?.sceneId !== sceneId ||
      manifest?.episodeId !== episodeId ||
      manifest?.variantCount !== styleVariantConfig.variantCount ||
      manifest?.productionScope !== productionScope ||
      manifest?.succeededCount !== styleVariantConfig.variantCount ||
      !Array.isArray(manifest.variants) ||
      manifest.variants.length !== styleVariantConfig.variantCount ||
      manifest.variants.some((variant) => productionScope === "visual-sample"
        ? variant?.status !== "visual-passed"
        : variant?.status !== "succeeded")) return false;
  const [traceHash, qualityReportHash, planHash, whiteboxHash, anchorManifestHash] =
    await Promise.all([
    fileHash(path.join(episodeRoot, "whitebox/executed-playthrough-trace.json")),
    fileHash(path.join(episodeRoot, "whitebox/executed-playthrough-quality-report.json")),
    fileHash(path.join(styleRoot, "style-variant-plan.json")),
    fileHash(path.join(episodeRoot, "whitebox/segment-00-first-frame.png")),
    fileHash(anchorManifestPath),
  ]);
  if (manifest.sourceWhiteboxIdentity?.traceHash !== traceHash ||
      manifest.sourceWhiteboxIdentity?.qualityReportHash !== qualityReportHash ||
      manifest.openingAnchorManifestHash !== anchorManifestHash ||
      !validateStyleVariantOpeningAnchorManifest(anchorManifest, {
        sceneId,
        episodeId,
        planHash,
        whiteboxHash,
        variantCount: styleVariantConfig.variantCount,
      }).ok) return false;
  for (const variant of manifest.variants) {
    if (variant.visualManifestHash !== await fileHash(path.join(
      episodeRoot, variant.visualManifestPath ?? "",
    )) || variant.appearanceAnchorHash !== await fileHash(path.join(
      episodeRoot, variant.appearanceAnchorPath ?? "",
    )) || !Array.isArray(variant.targetTriviews) || variant.targetTriviews.length < 1) {
      return false;
    }
    for (const target of variant.targetTriviews) {
      if (target.contentHash !== await fileHash(path.join(
        episodeRoot, target.path ?? "",
      ))) return false;
    }
  }
  return true;
}
async function providerPromptHash(filePath) {
  try {
    const body = JSON.parse(await readFile(filePath, "utf8"));
    if (typeof body.prompt !== "string" || !body.prompt.trim()) return null;
    return `sha256:${createHash("sha256").update(body.prompt.trim()).digest("hex")}`;
  } catch {
    return null;
  }
}
async function readJsonIfPresent(filePath) {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return null; }
}
async function providerResultIsCurrent(
  index,
  { requireFinal = false } = {},
) {
  const segmentId = `segment-0${index}`;
  const segmentRoot = path.join(episodeRoot, "video", segmentId);
  const request = await readJsonIfPresent(path.join(segmentRoot, "request.json"));
  const result = await readJsonIfPresent(path.join(segmentRoot, "provider-run.json"));
  const usesPrimary = result?.inputIdentity?.provider === providerKind &&
    result?.inputIdentity?.model === providerModel &&
    result?.modelChain?.length === 1 && result.modelChain[0] === providerModel;
  const usesFallback = result?.inputIdentity?.provider === fallbackProviderKind &&
    result?.inputIdentity?.model === fallbackProviderModel &&
    result?.inputIdentity?.upscaleModel === fallbackUpscaleModel &&
    result?.modelChain?.length === 2 &&
    result.modelChain[0] === fallbackProviderModel &&
    result.modelChain[1] === fallbackUpscaleModel;
  if (request?.schemaVersion !== 2 || result?.schemaVersion !== 3 ||
      (!usesPrimary && !usesFallback) ||
      typeof result.providerJobId !== "string") return false;
  const promptHash = await providerPromptHash(path.resolve(request.promptPath ?? ""));
  const referenceVideoHash = await fileHash(path.resolve(request.referenceVideoPath ?? ""));
  if (result.inputIdentity?.promptTemplateVersion !== EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION ||
      result.inputIdentity?.promptSha256 !== promptHash?.replace(/^sha256:/, "") ||
      result.inputIdentity?.referenceVideoSha256 !== referenceVideoHash?.replace(/^sha256:/, "")) return false;
  for (const [imageIndex, imagePath] of (request.referenceImagePaths ?? []).entries()) {
    const imageHash = await fileHash(path.resolve(imagePath));
    const key = `referenceImageSha256[${imageIndex}]:${path.basename(imagePath)}`;
    if (result.inputIdentity?.[key] !== imageHash?.replace(/^sha256:/, "")) return false;
  }
  const actualRawProviderFileName = result.rawProviderOutput?.fileName ?? rawProviderFileName;
  if (!await exists(path.join(segmentRoot, actualRawProviderFileName))) return false;
  const rawProviderHash = await fileHash(path.join(segmentRoot, actualRawProviderFileName));
  if (result.rawProviderOutput?.sha256 !== rawProviderHash?.replace(/^sha256:/, "")) {
    return false;
  }
  if (!requireFinal) return ["seedance-ready", "succeeded"].includes(result.status);
  if (usesFallback) {
    const rawUpscaleFileName = result.rawUpscaleOutput?.fileName ??
      "cf-upscaled-720p.mp4";
    if (!await exists(path.join(segmentRoot, rawUpscaleFileName))) return false;
    const rawUpscaleHash = await fileHash(path.join(segmentRoot, rawUpscaleFileName));
    if (result.rawUpscaleOutput?.sha256 !== rawUpscaleHash?.replace(/^sha256:/, "")) {
      return false;
    }
  }
  const finalPath = path.join(segmentRoot, finalVideoFileName);
  const finalHash = await fileHash(finalPath);
  return result.status === "succeeded" && result.output?.sha256 === finalHash?.replace(/^sha256:/, "") &&
    result.output?.frameParity === true && result.output?.deliveryResolutionConformant === true;
}
async function visualManifestMatchesCapture(filePath) {
  try {
    const manifest = JSON.parse(await readFile(filePath, "utf8"));
    const expectedInputIdentity = await buildEpisodeVisualInputIdentity({
      sceneRoot,
      scenePlanRoot: path.join(repoRoot, "apps/playground/public/scene-plans", sceneId),
      episodeRoot,
    });
    if (manifest.inputIdentity?.identityHash !== expectedInputIdentity.identityHash) return false;
    if (!Array.isArray(manifest.sourceWhiteboxFirstFrames) || manifest.sourceWhiteboxFirstFrames.length !== 6) return false;
    for (const [selectedIndex, index] of PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES.entries()) {
      const source = manifest.sourceWhiteboxFirstFrames[selectedIndex];
      if (source.segmentId !== `segment-0${index}` || source.contentHash !== await fileHash(path.join(
        episodeRoot, "whitebox", `segment-0${index}-first-frame.png`,
      ))) return false;
    }
    return true;
  } catch {
    return false;
  }
}
async function visualEventPlanIsCurrent(filePath) {
  try {
    const plan = JSON.parse(await readFile(filePath, "utf8"));
    if (!validateVisualEventPlan(plan, { sceneId, episodeId }).ok ||
        plan.model !== visualEventDirectorConfig.model) {
      return false;
    }
    const expectedInputIdentity = await buildEpisodeVisualEventInputIdentity({
      configPath: visualEventDirectorConfigPath,
      promptTemplatePath: visualEventPromptPath,
      episodeRoot,
      selectedCaptureIndices: PLAYTHROUGH_EVENT_SEGMENT_INDICES,
    });
    if (plan.inputIdentity?.identityHash !== expectedInputIdentity.identityHash) return false;
    const inputPaths = [
      visualEventDirectorConfigPath,
      visualEventPromptPath,
      path.join(episodeRoot, "visual/episode-visual-manifest.json"),
      ...PLAYTHROUGH_EVENT_SEGMENT_INDICES.map(
        (index) => path.join(
          episodeRoot,
          "visual",
          `segment-0${index}-styled-opening-frame.png`,
        ),
      ),
      ...PLAYTHROUGH_EVENT_SEGMENT_INDICES.map(
        (index) => path.join(
          episodeRoot,
          "whitebox",
          `segment-0${index}.mp4`,
        ),
      ),
    ];
    await Promise.all(inputPaths.map((inputPath) => access(inputPath)));
    return true;
  } catch {
    return false;
  }
}
async function seedancePromptSetIsCurrent(planPath, visualEventPlanPath) {
  const [plan, visualEventPlan, visualManifest, visualPromptBundle] = await Promise.all([
    readJsonIfPresent(planPath),
    readJsonIfPresent(visualEventPlanPath),
    readJsonIfPresent(path.join(episodeRoot, "visual/episode-visual-manifest.json")),
    readJsonIfPresent(path.join(episodeRoot, "visual/episode-visual-prompts.json")),
  ]);
  if (!plan || !visualEventPlan || !visualManifest || !visualPromptBundle) return false;
  const planHash = sha256Canonical(plan);
  const visualEventPlanHash = sha256Canonical(visualEventPlan);
  const visualManifestHash = sha256Canonical(visualManifest);
  const visualPromptBundleHash = sha256Canonical(visualPromptBundle);
  for (const index of PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES) {
    const prompt = await readJsonIfPresent(path.join(
      episodeRoot,
      "prompts",
      `segment-0${index}.json`,
    ));
    if (prompt?.kind !== "worldkit-episode-seedance-segment-prompt" ||
        prompt.schemaVersion !== 1 || prompt.sceneId !== sceneId ||
        prompt.episodeId !== episodeId || prompt.segmentId !== `segment-0${index}` ||
        prompt.promptTemplateVersion !== EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION ||
        prompt.planHash !== planHash || prompt.visualEventPlanHash !== visualEventPlanHash ||
        prompt.visualManifestHash !== visualManifestHash ||
        prompt.visualPromptBundleHash !== visualPromptBundleHash ||
        typeof prompt.prompt !== "string" || prompt.prompt.trim().length === 0) return false;
  }
  return true;
}
async function planIsCurrent(planPath, navigationPath) {
  const plan = await readJsonIfPresent(planPath);
  const navigationEvidence = await readJsonIfPresent(navigationPath);
  if (!plan || !navigationEvidence) return false;
  if (!validatePlaythroughPlanStructure(plan, { sceneId, navigationEvidence }).ok) return false;
  return true;
}
async function navigationEvidenceIsCurrent(navigationPath, worldModulePath, reconnaissancePath) {
  const evidence = await readJsonIfPresent(navigationPath);
  return evidence?.kind === "worldkit-episode-navigation-evidence" &&
    evidence.schemaVersion === 1 && evidence.sceneId === sceneId &&
    evidence.source?.worldModuleContentHash === await fileHash(worldModulePath) &&
    evidence.source?.reconnaissanceContentHash === await fileHash(reconnaissancePath);
}
async function reconnaissanceIsCurrent(reconnaissancePath, sourceIdentityHash) {
  const report = await readJsonIfPresent(reconnaissancePath);
  return report?.kind === "worldkit-playthrough-reconnaissance" &&
    report.schemaVersion === 1 && report.sceneId === sceneId &&
    report.sourceIdentityHash === sourceIdentityHash;
}
function writeOutput(chunk) {
  process.stdout.write(chunk);
  log.write(chunk);
}
function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
async function withRuntimeSlot(label, operation) {
  await mkdir(runtimeSlotRoot, { recursive: true });
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let waitingLogged = false;
  while (!stopping) {
    try {
      await mkdir(runtimeSlotPath);
      await writeFile(path.join(runtimeSlotPath, "owner.json"), JSON.stringify({
        pid: process.pid, token, label, acquiredAt: new Date().toISOString(),
      }));
      writeOutput(`WORLDKIT_EPISODE_RUNTIME_SLOT acquired ${label}\n`);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = await readJsonIfPresent(path.join(runtimeSlotPath, "owner.json"));
      let stale = false;
      if (owner) {
        const ageMs = Date.now() - Date.parse(owner.acquiredAt ?? "");
        stale = !processIsAlive(Number(owner.pid)) ||
          !Number.isFinite(ageMs) || ageMs > 2 * 60 * 60 * 1000;
      } else {
        const metadata = await stat(runtimeSlotPath);
        stale = Date.now() - metadata.mtimeMs > 30_000;
      }
      if (stale) {
        await rm(runtimeSlotPath, { recursive: true, force: true });
        continue;
      }
      if (!waitingLogged) {
        waitingLogged = true;
        writeOutput(`WORLDKIT_EPISODE_RUNTIME_SLOT waiting ${label}\n`);
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
    }
  }
  if (stopping) throw new Error("Episode workflow was stopped while waiting for Runtime slot.");
  try {
    return await operation();
  } finally {
    const owner = await readJsonIfPresent(path.join(runtimeSlotPath, "owner.json"));
    if (owner?.token === token) await rm(runtimeSlotPath, { recursive: true, force: true });
    writeOutput(`WORLDKIT_EPISODE_RUNTIME_SLOT released ${label}\n`);
  }
}
async function retryOperation(label, maximumAttempts, operation) {
  let lastError;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const deterministicInputFailure =
        /PLAYTHROUGH_PLAN_INVALID|CAPTURE_SUBJECT_DID_NOT_MOVE|CAPTURE_SUBJECT_STATIONARY_TOO_LONG|CAPTURE_SUBJECT_UNINTENDED_FALL/.test(
          message,
        );
      if (stopping || deterministicInputFailure || attempt === maximumAttempts) throw error;
      writeOutput(
        `WORLDKIT_EPISODE_RETRY ${label} attempt=${attempt + 1}/${maximumAttempts}\n`,
      );
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
    }
  }
  throw lastError;
}

async function runWithConcurrency(items, limit, operation) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const itemIndex = nextIndex;
        nextIndex += 1;
        await operation(items[itemIndex]);
      }
    },
  );
  await Promise.all(workers);
}
function run(command, commandArgs, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      shell: false,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    runningChildren.add(child);
    let outputTail = "";
    const captureOutput = (chunk) => {
      outputTail = `${outputTail}${String(chunk)}`.slice(-8_000);
      writeOutput(chunk);
    };
    child.stdout.on("data", captureOutput);
    child.stderr.on("data", captureOutput);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      runningChildren.delete(child);
      if (code === 0) resolvePromise();
      else reject(new Error(stopping
        ? "Episode workflow was stopped by the user."
        : `${command} exited ${code ?? "null"} signal=${signal ?? "none"}\n${outputTail}`));
    });
  });
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopping = true;
    for (const child of runningChildren) if (!child.killed) child.kill("SIGTERM");
  });
}
async function stage(id, skipWhen, operation) {
  const item = record.stages.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown workflow stage: ${id}`);
  record.currentStage = id;
  item.status = "running";
  item.startedAt ??= new Date().toISOString();
  await persist();
  writeOutput(`WORLDKIT_EPISODE_WORKFLOW_STAGE ${id} running\n`);
  if (await skipWhen()) {
    item.status = "complete";
    item.finishedAt ??= new Date().toISOString();
    await persist();
    writeOutput(`WORLDKIT_EPISODE_WORKFLOW_STAGE ${id} resumed\n`);
    return;
  }
  await operation();
  item.status = "complete";
  item.finishedAt = new Date().toISOString();
  await persist();
  await publishCloudStageCheckpoint(id);
  writeOutput(`WORLDKIT_EPISODE_WORKFLOW_STAGE ${id} complete\n`);
}

try {
  await access(path.join(sceneRoot, "world.mjs"));
  const reconRoot = path.join(episodeRoot, "planning/reconnaissance");
  const reconnaissancePath = path.join(reconRoot, "reconnaissance-report.json");
  const navigationPath = path.join(episodeRoot, "planning/navigation-evidence.json");
  const worldModulePath = path.join(sceneRoot, "world.mjs");
  const planPath = path.join(episodeRoot, "planning/playthrough-plan.json");
  const whiteboxRoot = path.join(episodeRoot, "whitebox");
  if (executionPart === "full" || executionPart === "prepare") {
    const sceneRuntimeIdentity = await buildEpisodeSceneRuntimeIdentity({
      sceneRoot,
      scenePlanRoot: path.join(repoRoot, "apps/playground/public/scene-plans", sceneId),
      episodeSourceReceiptPath: await exists(path.join(
        episodeRoot,
        "episode-source-receipt.json",
      )) ? path.join(episodeRoot, "episode-source-receipt.json") : null,
    });
    await stage("reconnaissance",
      () => reconnaissanceIsCurrent(
        reconnaissancePath,
        sceneRuntimeIdentity.identityHash,
      ),
      () => withRuntimeSlot(`reconnaissance:${episodeId}`, () =>
        run("pnpm", ["exec", "tsx", "scripts/episodes/inspect-playthrough-world.ts",
          "--scene-id", sceneId, "--origin", origin, "--play-path", "/play",
          "--output", reconRoot,
          "--source-identity-hash", sceneRuntimeIdentity.identityHash])));
    await stage("navigation-evidence",
      () => navigationEvidenceIsCurrent(
        navigationPath,
        worldModulePath,
        reconnaissancePath,
      ),
      () => run("pnpm", ["exec", "tsx", "scripts/episodes/build-exploration-navigation-evidence.ts",
        "--scene-id", sceneId, "--world", worldModulePath,
        "--reconnaissance", reconnaissancePath,
        "--output", navigationPath]));
    await stage("playthrough-plan",
      () => planIsCurrent(planPath, navigationPath),
      () => run("bash", ["scripts/agents/run-lwdp-playthrough-planner-agent.sh",
        "--scene-id", sceneId, "--episode-id", episodeId, "--episode-root", episodeRoot,
        "--recon-root", reconRoot, "--backend", backend]));
  } else if (!await navigationEvidenceIsCurrent(
    navigationPath,
    worldModulePath,
    reconnaissancePath,
  ) || !await planIsCurrent(planPath, navigationPath)) {
    throw new Error("EPISODE_PREPARE_CHECKPOINT_REQUIRED");
  }

  if (executionPart === "full" || executionPart === "capture") {
    await stage("whitebox-capture",
      () => hasCompleteWhiteboxCapture(whiteboxRoot, planPath),
      () => withRuntimeSlot(`whitebox-capture:${episodeId}`, () =>
        retryOperation("whitebox-capture", 3, async (captureAttempt) => {
          try {
            await run("pnpm", ["exec", "tsx", "scripts/episodes/run-playthrough-capture.ts",
              "--scene-id", sceneId, "--origin", origin, "--play-path", "/play",
              "--plan", planPath, "--navigation-evidence", navigationPath,
              "--output", whiteboxRoot]);
            if (!await hasCompleteWhiteboxCapture(whiteboxRoot, planPath)) {
              throw new Error("EPISODE_WHITEBOX_CAPTURE_CLOSURE_FAILED");
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const qualityReportPath = path.join(
              whiteboxRoot,
              "executed-playthrough-quality-report.json",
            );
            if (
              captureAttempt < 3 &&
              /EPISODE_MINIMUM_CAPTURE_HEALTH_FAILED/.test(message) &&
              await exists(qualityReportPath)
            ) {
              const repairAttempt = captureAttempt + 1;
              writeOutput(
                `WORLDKIT_EPISODE_PLAN_REPAIR attempt=${repairAttempt}/3 report=${qualityReportPath}\n`,
              );
              await run("bash", ["scripts/agents/run-lwdp-playthrough-planner-agent.sh",
                "--scene-id", sceneId, "--episode-id", episodeId,
                "--episode-root", episodeRoot, "--recon-root", reconRoot,
                "--backend", backend, "--attempt", String(repairAttempt),
                "--repair-report", qualityReportPath]);
              throw new Error("EPISODE_CAPTURE_PLAN_REPAIRED_RETRY");
            }
            throw error;
          }
        })));
  } else if (["render", ...Object.keys(styleUntilByExecutionPart)].includes(executionPart) &&
      !await hasCompleteWhiteboxCapture(whiteboxRoot, planPath)) {
    throw new Error("EPISODE_WHITEBOX_CAPTURE_CHECKPOINT_REQUIRED");
  }

  if (executionPart === "full" || executionPart === "render" || fineGrainedRenderPart) {
  if (styleVariantConfig.enabled) {
    const styleUntil = styleUntilByExecutionPart[executionPart] ??
      (productionScope === "visual-sample"
        ? "visual-review"
        : productionScope === "seedance-conformance" ? "conformance" : "full");
    const requiresCompleteStyleOutput = ["full", "render", "publication"]
      .includes(executionPart);
    await stage("style-variant-production",
      () => requiresCompleteStyleOutput && hasCompleteStyleVariantProduction(),
      () => run("node", [
        "scripts/episodes/run-style-variant-workflow.mjs",
        "--scene-id", sceneId, "--episode-id", episodeId,
        "--scene-root", sceneRoot, "--episode-root", episodeRoot,
        "--backend", backend, "--origin", origin,
        "--until", styleUntil,
      ]));
  } else {
    if (fineGrainedRenderPart) {
      throw new Error("Fine-grained Episode production requires ten-style mode.");
    }
    const visualManifest = path.join(episodeRoot, "visual/episode-visual-manifest.json");
    await stage("visual-reconstruction", () => visualManifestMatchesCapture(visualManifest),
    () => run("bash", ["scripts/agents/run-lwdp-episode-visual-agent.sh",
      "--scene-id", sceneId, "--episode-id", episodeId,
      "--episode-root", episodeRoot, "--backend", backend,
      "--attempt", "1"]));
  const visualEventPlan = path.join(episodeRoot, "prompts/visual-events.json");
  await stage("visual-events", () => visualEventPlanIsCurrent(visualEventPlan),
    () => retryOperation("visual-events", 3, () =>
      run("python3", ["scripts/episodes/run-gemini-visual-event-director.py",
        "--scene-id", sceneId, "--episode-id", episodeId,
        "--episode-root", episodeRoot])));
  await stage("seedance-prompts",
    () => seedancePromptSetIsCurrent(planPath, visualEventPlan),
    () => run("node", ["scripts/episodes/build-episode-seedance-prompts.mjs",
      "--scene-id", sceneId, "--episode-id", episodeId,
      "--scene-root", sceneRoot, "--episode-root", episodeRoot]));
  await run("node", ["scripts/episodes/prepare-episode-video-requests.mjs",
    "--scene-id", sceneId, "--episode-id", episodeId, "--episode-root", episodeRoot]);
  const segmentIndices = [...PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES];
  const segmentRuns = segmentIndices.map((index) => ({
    index,
    resultPath: path.join(episodeRoot, "video", `segment-0${index}`, "provider-run.json"),
  }));
  await stage("seedance-generation",
    async () => (await Promise.all(segmentIndices.map((index) => providerResultIsCurrent(index)))).every(Boolean),
    async () => {
      const pending = [];
      for (const item of segmentRuns) {
        if (!await providerResultIsCurrent(item.index)) pending.push(item);
      }
      await runWithConcurrency(pending, seedanceConcurrency, ({ resultPath, index }) =>
        run("node", [
          "scripts/episodes/run-episode-video-segment-with-fallback.mjs",
          "--request", path.join(episodeRoot, "video", `segment-0${index}`, "request.json"),
          "--result", resultPath,
          "--until", "seedance",
        ]));
    });
    await stage("conformance",
    async () => (await Promise.all(segmentIndices.map((index) =>
      providerResultIsCurrent(index, { requireFinal: true })))).every(Boolean),
    async () => {
      const pending = [];
      for (const item of segmentRuns) {
        if (!await providerResultIsCurrent(item.index, { requireFinal: true })) {
          pending.push(item);
        }
      }
      await runWithConcurrency(pending, seedanceConcurrency, ({ resultPath, index }) =>
        run("node", [
          "scripts/episodes/run-episode-video-segment-with-fallback.mjs",
          "--request", path.join(episodeRoot, "video", `segment-0${index}`, "request.json"),
          "--result", resultPath, "--until", "conformance",
        ]));
    });
  }
  }
  record.status = executionPart === "prepare"
    ? "awaiting-capture"
    : executionPart === "capture" ? "captured"
      : fineGrainedRenderPart && executionPart !== "publication"
        ? "checkpoint"
        : "succeeded";
  record.currentStage = null;
  record.finishedAt = record.status === "succeeded" ? new Date().toISOString() : null;
  record.error = null;
  await persist();
  if (record.status === "succeeded" &&
      styleVariantConfig.enabled && productionScope === "full") {
    await run("node", [
      "scripts/episodes/build-style-variant-bundle.mjs",
      "--episode-id", episodeId,
      "--episode-root", episodeRoot,
    ]);
  }
  writeOutput(record.status === "succeeded"
    ? `WORLDKIT_EPISODE_WORKFLOW_READY ${episodeId}\n`
    : `WORLDKIT_EPISODE_WORKFLOW_CHECKPOINT ${executionPart} ${episodeId}\n`);
} catch (error) {
  const item = record.stages.find((candidate) => candidate.id === record.currentStage);
  if (item) {
    item.status = stopping ? "cancelled" : "failed";
    item.finishedAt = new Date().toISOString();
  }
  record.status = stopping ? "cancelled" : "failed";
  record.finishedAt = new Date().toISOString();
  record.error = error instanceof Error ? error.message : String(error);
  await persist();
  writeOutput(`${stopping ? "WORLDKIT_EPISODE_WORKFLOW_CANCELLED" : "WORLDKIT_EPISODE_WORKFLOW_FAILED"} ${record.error}\n`);
  process.exitCode = stopping ? 130 : 1;
} finally {
  log.end();
}
