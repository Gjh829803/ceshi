import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadEpisodeStyleVariantConfig } from "../../../scripts/lib/episode-style-variants.mjs";
import {
  classifyCloudProductionFailure,
  cloudInfrastructureRetryDelayMs,
} from "../../../scripts/lib/cloud-production-retry-policy.mjs";

const idPattern = /^[a-z0-9][a-z0-9-]{2,119}$/;

export function failedEpisodeStageId(execution) {
  const stages = Array.isArray(execution?.stages) ? execution.stages : [];
  const failed = stages.find((stage) =>
    stage && typeof stage === "object" &&
    ["failed", "interrupted"].includes(stage.status) &&
    typeof stage.stage_id === "string" && stage.stage_id.length > 0);
  return failed?.stage_id ?? null;
}

function episodeGpuBatchStatus(execution, remoteStage, fallback = "preparing") {
  if (execution?.current_stage_id === "whitebox-capture") {
    return remoteStage?.status === "running" ? "capturing" : "waiting-for-batch";
  }
  if (execution?.current_stage_id === "episode-render" ||
      /^episode-(?:style|seedance|conformance|publication)/
        .test(String(execution?.current_stage_id ?? ""))) {
    return "capture-complete";
  }
  return fallback;
}
const episodeBoundaryByRemoteStage = Object.freeze({
  "episode-prepare": "reconnaissance",
  "whitebox-capture": "whitebox-capture",
  "episode-render": "style-variant-production",
  "episode-style-plan": "style-variant-plan",
  "episode-style-openings": "style-variant-opening-anchors",
  "episode-style-visuals": "style-variant-visuals",
  "episode-style-diversity": "style-variant-diversity-review",
  "episode-style-events": "style-variant-gemini-events",
  "episode-style-prompts": "style-variant-seedance-prompts",
  "episode-seedance": "style-variant-seedance-generation",
  "episode-conformance": "style-variant-conformance",
  "episode-publication": "episode-publication",
});

function displayedEpisodeStage(record, execution, remoteStage) {
  const reported = remoteStage?.diagnostics?.internal_stage ??
    execution?.diagnostics?.internal_stage ?? record.currentStage;
  return record.stages.some((stage) => stage.id === reported)
    ? reported
    : episodeBoundaryByRemoteStage[execution?.current_stage_id] ?? reported;
}
const absorbingEpisodeStatuses = new Set(["cancelled", "succeeded"]);

export function resolveEpisodeRecordWrite(current, incoming, updatedAt, {
  allowCancelledRestart = false,
} = {}) {
  if (!incoming || typeof incoming !== "object") {
    throw new Error("Episode record write requires one record.");
  }
  if (current && typeof current === "object") {
    if (absorbingEpisodeStatuses.has(current.status)) {
      const nextRestartGeneration = Number(incoming.restartGeneration ?? 0);
      const currentRestartGeneration = Number(current.restartGeneration ?? 0);
      if (
        current.status === "cancelled" &&
        allowCancelledRestart &&
        incoming.status === "running" &&
        nextRestartGeneration === currentRestartGeneration + 1
      ) {
        // An explicit user retry is a new lifecycle generation. Ordinary
        // asynchronous writers never receive this capability, so cancelled
        // remains absorbing for stale recovery and worker callbacks.
      } else {
        return { applied: false, reason: `absorbing-${current.status}`, record: current };
      }
    }
    if (
      Number(incoming.restartGeneration ?? 0) < Number(current.restartGeneration ?? 0)
    ) return { applied: false, reason: "restart-generation-drift", record: current };
    if (
      current.remoteExecutionId && incoming.remoteExecutionId &&
      current.remoteExecutionId !== incoming.remoteExecutionId
    ) return { applied: false, reason: "execution-drift", record: current };
    if (
      incoming.status !== "cancelled" &&
      Number(incoming.recordRevision ?? 0) < Number(current.recordRevision ?? 0)
    ) return { applied: false, reason: "revision-drift", record: current };
  }
  return {
    applied: true,
    reason: "applied",
    record: {
      ...incoming,
      recordRevision: Math.max(
        Number(current?.recordRevision ?? 0),
        Number(incoming.recordRevision ?? 0),
      ) + 1,
      updatedAt,
    },
  };
}
const artifactDefinitions = [
  ["planning/reconnaissance/reconnaissance-report.json", "运行时侦察报告", "json", "reconnaissance"],
  ["planning/navigation-evidence.json", "模型探索参考", "json", "navigation-evidence"],
  ["planning/reconnaissance/recon-00-initial.png", "侦察初始画面", "image", "reconnaissance"],
  ["planning/playthrough-plan.json", "六起点玩家操作剧本", "json", "playthrough-plan"],
  ["whitebox/executed-playthrough-quality-report.json", "最小运行与移动健康检查", "json", "whitebox-capture"],
  ["whitebox/episode-124s-execution.mp4", "124 秒含镜头归位缓冲的白膜执行母片", "video", "whitebox-capture"],
  ["whitebox/episode-120s.mp4", "120 秒白膜交付母片", "video", "whitebox-capture"],
  ["whitebox/episode-180s.mp4", "六起点独立白膜母片", "video", "whitebox-capture"],
  ["whitebox/executed-playthrough-trace.json", "实际执行轨迹", "json", "whitebox-capture"],
  ["whitebox/segment-00.mp4", "白膜起点 1", "video", "whitebox-capture"],
  ["whitebox/segment-01.mp4", "白膜起点 2", "video", "whitebox-capture"],
  ["whitebox/segment-02.mp4", "白膜起点 3", "video", "whitebox-capture"],
  ["whitebox/segment-03.mp4", "白膜起点 4", "video", "whitebox-capture"],
  ["whitebox/segment-04.mp4", "白膜起点 5", "video", "whitebox-capture"],
  ["whitebox/segment-05.mp4", "白膜起点 6", "video", "whitebox-capture"],
  ["visual/segment-00-styled-opening-frame.png", "第 1 段最终样式首帧", "image", "visual-reconstruction"],
  ["visual/segment-01-styled-opening-frame.png", "第 2 段最终样式首帧", "image", "visual-reconstruction"],
  ["visual/segment-02-styled-opening-frame.png", "第 3 段最终样式首帧", "image", "visual-reconstruction"],
  ["visual/segment-03-styled-opening-frame.png", "第 4 段最终样式首帧", "image", "visual-reconstruction"],
  ["visual/segment-04-styled-opening-frame.png", "起点 5 最终样式首帧", "image", "visual-reconstruction"],
  ["visual/segment-05-styled-opening-frame.png", "起点 6 最终样式首帧", "image", "visual-reconstruction"],
  ["visual/episode-visual-prompts.json", "首帧与三视图生成 Prompt", "json", "visual-reconstruction"],
  ["visual/episode-visual-manifest.json", "视觉重建清单", "json", "visual-reconstruction"],
  ["prompts/visual-events.json", "Gemini 大型视觉事件", "json", "visual-events"],
  ["visual-reviews/visual-reconstructor-v5/episode-opening-review-prompts.json", "Visual Reconstructor V5 首帧 Prompt", "json", "visual-reconstruction"],
  ["visual-reviews/visual-reconstructor-v5/episode-opening-review-manifest.json", "Visual Reconstructor V5 首帧审阅清单", "json", "visual-reconstruction"],
  ["prompts/segment-00.json", "第 1 段 Seedance 渲染 Prompt", "json", "seedance-prompts"],
  ["prompts/segment-01.json", "第 2 段 Seedance 渲染 Prompt", "json", "seedance-prompts"],
  ["prompts/segment-02.json", "第 3 段 Seedance 渲染 Prompt", "json", "seedance-prompts"],
  ["prompts/segment-03.json", "第 4 段 Seedance 渲染 Prompt", "json", "seedance-prompts"],
  ["prompts/segment-04.json", "起点 5 Seedance 渲染 Prompt", "json", "seedance-prompts"],
  ["prompts/segment-05.json", "起点 6 Seedance 渲染 Prompt", "json", "seedance-prompts"],
  ["video/segment-00/seedance-2.5.mp4", "起点 1 Seedance 2.5 720p", "video", "seedance-generation"],
  ["video/segment-01/seedance-2.5.mp4", "起点 2 Seedance 2.5 720p", "video", "seedance-generation"],
  ["video/segment-02/seedance-2.5.mp4", "起点 3 Seedance 2.5 720p", "video", "seedance-generation"],
  ["video/segment-03/seedance-2.5.mp4", "起点 4 Seedance 2.5 720p", "video", "seedance-generation"],
  ["video/segment-04/seedance-2.5.mp4", "起点 5 Seedance 2.5 720p", "video", "seedance-generation"],
  ["video/segment-05/seedance-2.5.mp4", "起点 6 Seedance 2.5 720p", "video", "seedance-generation"],
  ["video/segment-00/mg-seedance-2.5-480p.mp4", "第 1 段 MG Seedance 480p", "video", "seedance-generation"],
  ["video/segment-01/mg-seedance-2.5-480p.mp4", "第 2 段 MG Seedance 480p", "video", "seedance-generation"],
  ["video/segment-02/mg-seedance-2.5-480p.mp4", "第 3 段 MG Seedance 480p", "video", "seedance-generation"],
  ["video/segment-03/mg-seedance-2.5-480p.mp4", "第 4 段 MG Seedance 480p", "video", "seedance-generation"],
  // Historical OV + CF artifacts remain readable for already completed episodes.
  ["video/segment-00/ov-seedance-2.5-720p-gz-30s.mp4", "历史第 1 段 OV 720p", "video", "seedance-generation"],
  ["video/segment-01/ov-seedance-2.5-720p-gz-30s.mp4", "历史第 2 段 OV 720p", "video", "seedance-generation"],
  ["video/segment-02/ov-seedance-2.5-720p-gz-30s.mp4", "历史第 3 段 OV 720p", "video", "seedance-generation"],
  ["video/segment-00/mediakit-enhanced-720p.mp4", "第 1 段 MediaKit 720p", "video", "mediakit-upscale"],
  ["video/segment-01/mediakit-enhanced-720p.mp4", "第 2 段 MediaKit 720p", "video", "mediakit-upscale"],
  ["video/segment-02/mediakit-enhanced-720p.mp4", "第 3 段 MediaKit 720p", "video", "mediakit-upscale"],
  ["video/segment-03/mediakit-enhanced-720p.mp4", "第 4 段 MediaKit 720p", "video", "mediakit-upscale"],
  // Historical CF artifacts remain readable for already completed episodes.
  ["video/segment-00/cf-upscaled-720p.mp4", "历史第 1 段 CF 720p", "video", "cf-upscale"],
  ["video/segment-01/cf-upscaled-720p.mp4", "历史第 2 段 CF 720p", "video", "cf-upscale"],
  ["video/segment-02/cf-upscaled-720p.mp4", "历史第 3 段 CF 720p", "video", "cf-upscale"],
  ["video/segment-03/cf-upscaled-720p.mp4", "历史第 4 段 CF 720p", "video", "cf-upscale"],
  ["video/segment-00/final-1280x720-24fps-720f.mp4", "第 1 段最终视频", "video", "conformance"],
  ["video/segment-01/final-1280x720-24fps-720f.mp4", "第 2 段最终视频", "video", "conformance"],
  ["video/segment-02/final-1280x720-24fps-720f.mp4", "第 3 段最终视频", "video", "conformance"],
  ["video/segment-03/final-1280x720-24fps-720f.mp4", "第 4 段最终视频", "video", "conformance"],
  ["video/segment-04/final-1280x720-24fps-720f.mp4", "起点 5 最终视频", "video", "conformance"],
  ["video/segment-05/final-1280x720-24fps-720f.mp4", "起点 6 最终视频", "video", "conformance"],
  ["video/segment-00/final-854x480-24fps-720f.mp4", "第 1 段最终 480p 视频", "video", "conformance"],
  ["video/segment-01/final-854x480-24fps-720f.mp4", "第 2 段最终 480p 视频", "video", "conformance"],
  ["video/segment-02/final-854x480-24fps-720f.mp4", "第 3 段最终 480p 视频", "video", "conformance"],
  ["video/segment-03/final-854x480-24fps-720f.mp4", "第 4 段最终 480p 视频", "video", "conformance"],
  ["prompt-ab/legacy-heavy/segment-00.json", "第 1 段旧版重 Prompt", "json", "seedance-prompts"],
  ["prompt-ab/legacy-heavy/segment-01.json", "第 2 段旧版重 Prompt", "json", "seedance-prompts"],
  ["prompt-ab/legacy-heavy/segment-02.json", "第 3 段旧版重 Prompt", "json", "seedance-prompts"],
  ["video-ab/legacy-heavy/segment-00/final-854x480-24fps-720f.mp4", "第 1 段旧版 Prompt 成片", "video", "conformance"],
  ["video-ab/legacy-heavy/segment-01/final-854x480-24fps-720f.mp4", "第 2 段旧版 Prompt 成片", "video", "conformance"],
  ["video-ab/legacy-heavy/segment-02/final-854x480-24fps-720f.mp4", "第 3 段旧版 Prompt 成片", "video", "conformance"],
  ["prompt-ab/relaxed-action/segment-00.json", "第 1 段放开动作 Prompt", "json", "seedance-prompts"],
  ["prompt-ab/relaxed-action/segment-01.json", "第 2 段放开动作 Prompt", "json", "seedance-prompts"],
  ["prompt-ab/relaxed-action/segment-02.json", "第 3 段放开动作 Prompt", "json", "seedance-prompts"],
  ["video-ab/relaxed-action/segment-00/final-854x480-24fps-720f.mp4", "第 1 段放开动作成片", "video", "conformance"],
  ["video-ab/relaxed-action/segment-01/final-854x480-24fps-720f.mp4", "第 2 段放开动作成片", "video", "conformance"],
  ["video-ab/relaxed-action/segment-02/final-854x480-24fps-720f.mp4", "第 3 段放开动作成片", "video", "conformance"],
  ["video/segment-00/provider-run.json", "第 1 段 Provider 任务", "json", "conformance"],
  ["video/segment-01/provider-run.json", "第 2 段 Provider 任务", "json", "conformance"],
  ["video/segment-02/provider-run.json", "第 3 段 Provider 任务", "json", "conformance"],
  ["video/segment-03/provider-run.json", "第 4 段 Provider 任务", "json", "conformance"],
  ["video/segment-04/provider-run.json", "起点 5 Provider 任务", "json", "conformance"],
  ["video/segment-05/provider-run.json", "起点 6 Provider 任务", "json", "conformance"],
  ["pipeline.log", "整条流水线日志", "text", "conformance"],
];
const contentTypes = new Map([
  [".json", "application/json; charset=utf-8"],
  [".log", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".zip", "application/zip"],
]);
const playbackKeys = new Set([
  "W", "A", "S", "D", "Space", "Shift",
  "I", "J", "K", "L",
]);
const canonicalPlaybackKey = (key) => ({
  ArrowUp: "I",
  ArrowLeft: "J",
  ArrowDown: "K",
  ArrowRight: "L",
}[key] ?? key);
const segmentDurationSeconds = 30;
const legacySegmentExecutionSeconds = 31;
const legacySeedanceSegmentIds = Object.freeze([
  "segment-00", "segment-01", "segment-02", "segment-03",
]);
const currentSeedanceSegmentIds = Object.freeze([
  "segment-00", "segment-01", "segment-02", "segment-03", "segment-04", "segment-05",
]);
const seedanceSegmentIdsForRecord = (record) =>
  Array.isArray(record?.seedanceSegmentIds) && record.seedanceSegmentIds.length > 0
    ? record.seedanceSegmentIds
    : legacySeedanceSegmentIds;
const executionSecondsForRecord = (record) =>
  Number(record?.segmentCount) === 6 ? 30 : legacySegmentExecutionSeconds;
const sharedEpisodeStageDefinitions = [
  ["reconnaissance", "运行时侦察"],
  ["navigation-evidence", "可通行区域与核心目的地"],
  ["playthrough-plan", "六个独立起点游荡剧本"],
  ["whitebox-capture", "六段独立 30 秒白膜录制"],
];
const legacyEpisodeStageDefinitions = [
  ...sharedEpisodeStageDefinitions,
  ["visual-reconstruction", "六段样式首帧与共享三视图"],
  ["visual-events", "Gemini 3.5 Flash 单次五事件"],
  ["seedance-prompts", "六条详细 Seedance 渲染 Prompt（三条含事件）"],
  ["seedance-generation", "Seedance 2.5 720p 直出"],
  ["conformance", "24fps / 720 帧一致性"],
];
const tenStyleEpisodeStageDefinitions = [
  ...sharedEpisodeStageDefinitions,
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
];
const episodeStageDefinitionsForMode = (mode) => mode === "ten-style"
  ? tenStyleEpisodeStageDefinitions
  : legacyEpisodeStageDefinitions;

async function readJson(filePath) {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return null; }
}

function finiteSeconds(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundedSeconds(value) {
  return Math.round(value * 1000) / 1000;
}

function artifactUrl(episodeId, relativePath) {
  return `/api/episode-workflows/${episodeId}/artifacts/${relativePath}`;
}

function remoteEpisodeArtifact(record, relativePath) {
  const manifestPath = `episode/${String(relativePath).replaceAll("\\", "/")}`;
  return Array.isArray(record?.remoteArtifacts)
    ? record.remoteArtifacts.find((artifact) => artifact?.path === manifestPath) ?? null
    : null;
}

async function existingArtifact(record, episodeRoot, episodeId, relativePath) {
  try {
    const metadata = await stat(path.join(episodeRoot, relativePath));
    if (!metadata.isFile() || metadata.size <= 0) return null;
    return { relativePath, url: artifactUrl(episodeId, relativePath), sizeBytes: metadata.size };
  } catch {
    const remote = remoteEpisodeArtifact(record, relativePath);
    return remote
      ? { relativePath, url: artifactUrl(episodeId, relativePath), sizeBytes: remote.byteSize }
      : null;
  }
}

function clipActivation(activation, segmentIndex, executionSegmentSeconds) {
  const executionStartSeconds = segmentIndex * executionSegmentSeconds;
  const executionEndSeconds = executionStartSeconds + segmentDurationSeconds;
  const startSeconds = Math.max(executionStartSeconds, activation.startSeconds);
  const endSeconds = Math.min(executionEndSeconds, activation.endSeconds);
  if (endSeconds <= startSeconds) return null;
  return {
    id: activation.id,
    kind: activation.kind,
    startSeconds: roundedSeconds(startSeconds - executionStartSeconds),
    endSeconds: roundedSeconds(endSeconds - executionStartSeconds),
    keys: [...new Set(activation.keys
      .map(canonicalPlaybackKey)
      .filter((key) => playbackKeys.has(key)))],
  };
}

function executedActivations(trace, segmentIndex, executionSegmentSeconds) {
  const events = Array.isArray(trace?.events) ? trace.events : [];
  const startedInputs = new Map();
  const activations = [];
  for (const event of events) {
    const actualSeconds = finiteSeconds(event?.actualSeconds);
    if (actualSeconds === null) continue;
    if (event.kind === "input-start" && typeof event.id === "string") {
      startedInputs.set(event.id, {
        id: event.id,
        kind: "movement",
        startSeconds: actualSeconds,
        keys: Array.isArray(event.rawKeys) ? event.rawKeys : [],
      });
      continue;
    }
    if (event.kind === "input-end" && typeof event.id === "string") {
      const start = startedInputs.get(event.id);
      if (!start) continue;
      activations.push({ ...start, endSeconds: actualSeconds });
      startedInputs.delete(event.id);
      continue;
    }
    if (event.kind === "camera") {
      const durationSeconds = Math.max(0, finiteSeconds(event.durationMs, 0) / 1000);
      if (durationSeconds <= 0) continue;
      activations.push({
        id: typeof event.id === "string" ? event.id : `camera-${activations.length}`,
        kind: "camera",
        startSeconds: actualSeconds,
        endSeconds: actualSeconds + durationSeconds,
        keys: Array.isArray(event.cameraKeys) ? event.cameraKeys : [],
      });
    }
  }
  for (const start of startedInputs.values()) {
    activations.push({
      ...start,
      endSeconds: (segmentIndex + 1) * executionSegmentSeconds,
    });
  }
  return activations
    .map((activation) => clipActivation(
      activation,
      segmentIndex,
      executionSegmentSeconds,
    ))
    .filter((activation) => activation && activation.keys.length > 0)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id));
}

function promptEventsForSegment(
  eventPlan,
  trace,
  promptDocument,
  segmentId,
  segmentIndex,
  executionSegmentSeconds,
) {
  const plannedEvents = (eventPlan?.events ?? [])
    .filter((event) => event?.segmentId === segmentId)
    .sort((left, right) => finiteSeconds(left?.windowIndex, 0) -
      finiteSeconds(right?.windowIndex, 0));
  const documentIds = Array.isArray(promptDocument?.eventIds)
    ? promptDocument.eventIds.map(String)
    : promptDocument?.eventId ? [String(promptDocument.eventId)] : [];
  const documentSeconds = Array.isArray(promptDocument?.executedEventSeconds)
    ? promptDocument.executedEventSeconds
    : Number.isFinite(Number(promptDocument?.executedEventSeconds))
      ? [promptDocument.executedEventSeconds]
      : [];
  const providerPrompt = typeof promptDocument?.prompt === "string" ? promptDocument.prompt : "";
  if (plannedEvents.length === 0) return [];
  const sourceEvents = plannedEvents;
  return sourceEvents.map((planned, eventIndex) => {
    const eventId = documentIds[eventIndex] ?? planned?.id ??
      `${segmentId}-prompt-${eventIndex}`;
    const marker = (trace?.events ?? []).find((event) =>
      event?.kind === "prompt-marker" && event.id === eventId) ?? null;
    const globalSeconds = finiteSeconds(
      documentSeconds[eventIndex],
      finiteSeconds(marker?.actualSeconds, finiteSeconds(planned?.globalSeconds)),
    );
    const relativeSeconds = globalSeconds === null
      ? finiteSeconds(planned?.segmentRelativeSeconds)
      : globalSeconds - segmentIndex * executionSegmentSeconds;
    const transitionDurationSeconds = Math.max(
      0,
      finiteSeconds(planned?.timing?.transitionDurationSeconds, 0),
    );
    const endingDurationSeconds = Math.max(
      0,
      finiteSeconds(planned?.timing?.endingDurationSeconds, 0),
    );
    return {
      id: String(eventId),
      globalSeconds: globalSeconds === null ? null : roundedSeconds(globalSeconds),
      relativeSeconds: relativeSeconds === null ? null : roundedSeconds(relativeSeconds),
      activeEndSeconds: relativeSeconds === null
        ? null
        : roundedSeconds(relativeSeconds + transitionDurationSeconds + endingDurationSeconds),
      targetNames: Array.isArray(planned?.targetNames) ? planned.targetNames.map(String) : [],
      eventClass: typeof planned?.eventClass === "string" ? planned.eventClass : null,
      commandText: typeof planned?.dominantChange === "string"
        ? planned.dominantChange
        : typeof planned?.transitionDescription === "string" ? planned.transitionDescription : "",
      eventPrompt: typeof planned?.eventPrompt === "string" ? planned.eventPrompt : "",
      providerPrompt,
    };
  });
}

async function buildPlaybackComparisons(record, episodeRoot, episodeId, sceneId) {
  const segmentIds = seedanceSegmentIdsForRecord(record);
  const executionSegmentSeconds = executionSecondsForRecord(record);
  const [eventPlan, trace, ...promptDocuments] = await Promise.all([
    readJson(path.join(episodeRoot, "prompts/visual-events.json")),
    readJson(path.join(episodeRoot, "whitebox/executed-playthrough-trace.json")),
    ...segmentIds.map((segmentId) =>
      readJson(path.join(episodeRoot, `prompts/${segmentId}.json`))),
  ]);
  return Promise.all(segmentIds.map(async (segmentId, selectedIndex) => {
    const index = Number(segmentId.slice(-2));
    const globalStartSeconds = index * segmentDurationSeconds;
    const executionStartSeconds = index * executionSegmentSeconds;
    const [whiteboxVideo, finalVideo720, finalVideo480, providerVideo720, providerVideo480, legacyPromptVideo, legacyPrompt, relaxedActionVideo, relaxedPrompt, whiteboxPoster, finalPoster, reviewStyledOpeningFrame] = await Promise.all([
      existingArtifact(record, episodeRoot, episodeId, `whitebox/${segmentId}.mp4`),
      existingArtifact(
        record, episodeRoot,
        episodeId,
        `video/${segmentId}/final-1280x720-24fps-720f.mp4`,
      ),
      existingArtifact(
        record, episodeRoot,
        episodeId,
        `video/${segmentId}/final-854x480-24fps-720f.mp4`,
      ),
      existingArtifact(
        record, episodeRoot,
        episodeId,
        `video/${segmentId}/seedance-2.5.mp4`,
      ),
      existingArtifact(
        record, episodeRoot,
        episodeId,
        `video/${segmentId}/mg-seedance-2.5-480p.mp4`,
      ),
      existingArtifact(
        record, episodeRoot,
        episodeId,
        `video-ab/legacy-heavy/${segmentId}/final-854x480-24fps-720f.mp4`,
      ),
      readJson(path.join(episodeRoot, `prompt-ab/legacy-heavy/${segmentId}.json`)),
      existingArtifact(
        record, episodeRoot,
        episodeId,
        `video-ab/relaxed-action/${segmentId}/final-854x480-24fps-720f.mp4`,
      ),
      readJson(path.join(episodeRoot, `prompt-ab/relaxed-action/${segmentId}.json`)),
      existingArtifact(record, episodeRoot, episodeId, `whitebox/${segmentId}-first-frame.png`),
      existingArtifact(record, episodeRoot, episodeId, `visual/${segmentId}-styled-opening-frame.png`),
      existingArtifact(record, episodeRoot, episodeId, `visual-reviews/visual-reconstructor-v5/${segmentId}-styled-opening-frame.png`),
    ]);
    const basePromptEvents = promptEventsForSegment(
      eventPlan,
      trace,
      promptDocuments[selectedIndex],
      segmentId,
      index,
      executionSegmentSeconds,
    );
    const promptEvents = basePromptEvents.map((promptEvent) => ({
      ...promptEvent,
      ...(typeof legacyPrompt?.prompt === "string"
        ? { legacyProviderPrompt: legacyPrompt.prompt }
        : {}),
      ...(typeof relaxedPrompt?.prompt === "string"
        ? { relaxedProviderPrompt: relaxedPrompt.prompt }
        : {}),
    }));
    const finalVideo = finalVideo720 ?? finalVideo480;
    return {
      segmentId,
      index,
      title: `起点 ${index + 1}`,
      globalStartSeconds,
      globalEndSeconds: globalStartSeconds + segmentDurationSeconds,
      executionStartSeconds,
      executionEndSeconds: executionStartSeconds + segmentDurationSeconds,
      durationSeconds: segmentDurationSeconds,
      whiteboxVideo: whiteboxVideo ? { ...whiteboxVideo, poster: whiteboxPoster } : null,
      finalVideo: finalVideo ? { ...finalVideo, poster: finalPoster } : null,
      publicPreviewVideo: finalVideo720 || finalVideo480 || providerVideo720 || providerVideo480
        ? { ...(finalVideo720 ?? finalVideo480 ?? providerVideo720 ?? providerVideo480), poster: finalPoster }
        : null,
      baseStyledOpeningFrame: { url: `/api/worlds/${sceneId}/deliverables/styled-opening-frame` },
      reviewStyledOpeningFrame,
      legacyPromptVideo: legacyPromptVideo ? { ...legacyPromptVideo, poster: finalPoster } : null,
      relaxedActionVideo: relaxedActionVideo ? { ...relaxedActionVideo, poster: finalPoster } : null,
      inputActivations: executedActivations(trace, index, executionSegmentSeconds),
      seedanceProviderPrompt:
        typeof promptDocuments[selectedIndex]?.prompt === "string"
          ? promptDocuments[selectedIndex].prompt
          : "",
      promptEvents,
      promptEvent: promptEvents[0] ?? null,
    };
  }));
}

export function buildEpisodeInteractionTimeline(record, playbackComparisons, executedTrace = null) {
  const executionSegmentSeconds = executionSecondsForRecord(record);
  const segments = (playbackComparisons ?? []).map((comparison) => {
    const globalStartSeconds = finiteSeconds(comparison?.globalStartSeconds, 0);
    const executionStartSeconds = finiteSeconds(
      comparison?.executionStartSeconds,
      0,
    );
    const prompts = Array.isArray(comparison?.promptEvents)
      ? comparison.promptEvents
      : comparison?.promptEvent ? [comparison.promptEvent] : [];
    return {
      segmentId: comparison.segmentId,
      globalStartSeconds,
      globalEndSeconds: finiteSeconds(
        comparison?.globalEndSeconds,
        globalStartSeconds + segmentDurationSeconds,
      ),
      executionStartSeconds,
      executionEndSeconds: executionStartSeconds + segmentDurationSeconds,
      inputs: (comparison?.inputActivations ?? []).map((activation) => ({
        id: activation.id,
        kind: activation.kind,
        keys: [...(activation.keys ?? [])],
        segmentStartSeconds: roundedSeconds(activation.startSeconds),
        segmentEndSeconds: roundedSeconds(activation.endSeconds),
        globalStartSeconds: roundedSeconds(globalStartSeconds + activation.startSeconds),
        globalEndSeconds: roundedSeconds(globalStartSeconds + activation.endSeconds),
        executionStartSeconds: roundedSeconds(executionStartSeconds + activation.startSeconds),
        executionEndSeconds: roundedSeconds(executionStartSeconds + activation.endSeconds),
      })),
      promptEvents: prompts.map((prompt) => ({
        id: prompt.id,
        eventClass: prompt.eventClass,
        targetNames: [...(prompt.targetNames ?? [])],
        globalSeconds: prompt.globalSeconds,
        segmentSeconds: prompt.relativeSeconds,
        activeEndSeconds: prompt.activeEndSeconds,
        commandText: prompt.commandText,
        inputPrompt: prompt.eventPrompt,
        seedanceProviderPrompt: prompt.providerPrompt,
      })),
      promptEvent: prompts[0] ? {
        id: prompts[0].id,
        eventClass: prompts[0].eventClass,
        targetNames: [...(prompts[0].targetNames ?? [])],
        globalSeconds: prompts[0].globalSeconds,
        segmentSeconds: prompts[0].relativeSeconds,
        activeEndSeconds: prompts[0].activeEndSeconds,
        commandText: prompts[0].commandText,
        inputPrompt: prompts[0].eventPrompt,
        seedanceProviderPrompt: prompts[0].providerPrompt,
      } : null,
    };
  });
  return {
    kind: "worldkit-episode-interaction-timeline",
    schemaVersion: executedTrace?.frameTelemetry ? 3 : 1,
    sceneId: record.sceneId,
    episodeId: record.episodeId,
    durationSeconds: Number(record?.deliveryDurationSeconds) ||
      Number(record?.segmentCount || 4) * segmentDurationSeconds,
    executionDurationSeconds: Number(record?.executionDurationSeconds) ||
      Number(record?.segmentCount || 4) * executionSegmentSeconds,
    captureFrameRate: 24,
    segments,
    ...(executedTrace?.frameTelemetry
      ? { frameTelemetry: executedTrace.frameTelemetry }
      : {}),
  };
}

function sendDownloadJson(response, fileName, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "content-disposition": `attachment; filename="${fileName}"`,
    "cache-control": "no-store",
  });
  response.end(body);
}

function runZip(sourceRoot, folderName, zipPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/zip", ["-q", "-0", "-r", path.basename(zipPath), folderName], {
      cwd: sourceRoot,
      env: process.env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `zip exited ${code ?? "without a code"}`));
    });
  });
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 128 * 1024) throw new Error("Episode request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(`${JSON.stringify(value)}\n`);
}

function pipeFileToResponse(request, response, stream) {
  const stop = () => {
    if (!stream.destroyed) stream.destroy();
  };
  const cleanup = () => {
    request.off("aborted", stop);
    response.off("close", stop);
    response.off("finish", cleanup);
    stream.off("close", cleanup);
  };
  request.once("aborted", stop);
  response.once("close", stop);
  response.once("finish", cleanup);
  stream.once("close", cleanup);
  stream.once("error", () => {
    if (!response.destroyed) response.destroy();
  });
  stream.pipe(response);
}

async function serveRange(
  request,
  response,
  filePath,
  createStream = createReadStream,
  downloadName = null,
) {
  const metadata = await stat(filePath);
  const type = contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
  const downloadHeaders = downloadName
    ? { "content-disposition": `attachment; filename="${downloadName}"` }
    : {};
  const range = request.headers.range;
  if (!range) {
    response.writeHead(200, { "content-type": type, "content-length": metadata.size, "accept-ranges": "bytes", "cache-control": "private, max-age=60", ...downloadHeaders });
    if (request.method === "HEAD") response.end();
    else pipeFileToResponse(request, response, createStream(filePath));
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    response.writeHead(416, { "content-range": `bytes */${metadata.size}` });
    response.end();
    return;
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), metadata.size - 1) : metadata.size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= metadata.size) {
    response.writeHead(416, { "content-range": `bytes */${metadata.size}` });
    response.end();
    return;
  }
  response.writeHead(206, {
    "content-type": type,
    "content-length": end - start + 1,
    "content-range": `bytes ${start}-${end}/${metadata.size}`,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=60",
    ...downloadHeaders,
  });
  if (request.method === "HEAD") response.end();
  else pipeFileToResponse(request, response, createStream(filePath, { start, end }));
}

export function createEpisodeWorkflowService(options) {
  const repoRoot = options.repoRoot;
  const episodesRoot = path.join(repoRoot, "artifacts/episodes");
  const spawnImplementation = options.spawnImplementation ?? spawn;
  const createReadStreamImplementation = options.createReadStreamImplementation ?? createReadStream;
  const activeChildren = new Map();
  const activeCloudExecutions = new Map();
  const cloudRetryTimers = new Map();
  const episodePersistenceQueues = new Map();
  const listAllCache = new Map();
  const executeCloudEpisode = options.executeCloudEpisode ?? null;
  const retryCloudEpisode = options.retryCloudEpisode ?? null;
  const recoverCloudEpisode = options.recoverCloudEpisode ?? null;
  const ensureCloudEpisodeAvailable = options.ensureCloudEpisodeAvailable ?? null;
  const resolveCloudSceneInput = options.resolveCloudSceneInput ?? null;
  const cancelCloudEpisode = options.cancelCloudEpisode ?? null;
  const cancelCloudEpisodeWorkers = options.cancelCloudEpisodeWorkers ?? null;
  const readCloudEpisodeManifest = options.readCloudEpisodeManifest ?? null;
  const resolveCloudEpisodeResumeManifest = options.resolveCloudEpisodeResumeManifest ?? null;
  const readVerifiedRemoteArtifact = options.readVerifiedRemoteArtifact ?? null;
  const streamRemoteArtifact = options.streamRemoteArtifact ?? null;
  const redirectRemoteArtifact = options.redirectRemoteArtifact ?? null;
  const persistCloudEpisodeRecord = options.persistCloudEpisodeRecord ?? null;
  const readCloudEpisodeRecord = options.readCloudEpisodeRecord ?? null;
  const listCloudEpisodeRecords = options.listCloudEpisodeRecords ?? null;
  const loadStyleVariantConfig = options.loadEpisodeStyleVariantConfig ??
    (() => loadEpisodeStyleVariantConfig(repoRoot));
  const scheduleTimer = options.setTimeoutImplementation ?? setTimeout;
  const cancelTimer = options.clearTimeoutImplementation ?? clearTimeout;
  const now = options.nowImplementation ?? (() => Date.now());

  function clearCloudRetryTimer(episodeId) {
    const timer = cloudRetryTimers.get(episodeId);
    if (timer !== undefined) cancelTimer(timer);
    cloudRetryTimers.delete(episodeId);
  }

  function scheduleCloudEpisodeRecovery(record, delayMs) {
    clearCloudRetryTimer(record.episodeId);
    const timer = scheduleTimer(() => {
      cloudRetryTimers.delete(record.episodeId);
      void (async () => {
        const latest = await readEpisodeRecordById(record.episodeId);
        if (!latest || latest.status !== "remote-pending" ||
            activeCloudExecutions.has(record.episodeId)) return;
        activeCloudExecutions.set(
          record.episodeId,
          latest.remoteExecutionId ?? "recovering",
        );
        if (typeof latest.remoteExecutionId === "string" && latest.remoteExecutionId) {
          await runCloudEpisodeRecovery(latest);
        } else {
          await runCloudEpisode(latest.sceneId, latest.episodeId, {
            requestId: latest.remoteRequestId ?? `${latest.episodeId}-cloud-run-1`,
            cloudAttempt: Number(latest.cloudAttempt ?? 1),
          });
        }
      })();
    }, Math.max(0, delayMs));
    timer?.unref?.();
    cloudRetryTimers.set(record.episodeId, timer);
  }

  async function deferCloudEpisodeRecovery(record, failure) {
    const classification = classifyCloudProductionFailure(failure);
    if (!classification.retryable || classification.consumesContentAttempt) return false;
    const infrastructureAttempt = Number(record.infrastructureRetryAttempt ?? 0) + 1;
    const delayMs = cloudInfrastructureRetryDelayMs(infrastructureAttempt, {
      baseMs: options.infrastructureRetryBaseMs ?? 30_000,
      maximumMs: options.infrastructureRetryMaximumMs ?? 10 * 60_000,
    });
    const deferred = {
      ...record,
      status: "remote-pending",
      finishedAt: null,
      error: failure instanceof Error ? failure.message :
        String(failure?.error ?? failure?.message ?? failure),
      retryPool: classification.pool,
      failureClass: classification.code,
      infrastructureRetryAttempt: infrastructureAttempt,
      retryNotBeforeAt: new Date(now() + delayMs).toISOString(),
    };
    await persistEpisodeRecord(deferred);
    scheduleCloudEpisodeRecovery(deferred, delayMs);
    return true;
  }

  function cloudFailureRecordFields(failure) {
    const classification = classifyCloudProductionFailure(failure);
    return {
      retryPool: classification.pool,
      failureClass: classification.code,
      consumesContentAttempt: classification.consumesContentAttempt,
    };
  }

  async function fileMetadata(filePath) {
    try {
      const metadata = await stat(filePath);
      return metadata.isFile() && metadata.size > 0 ? metadata : null;
    } catch {
      return null;
    }
  }

  function sceneAssetUrl(episodeId, assetId) {
    return `/api/episode-workflows/${episodeId}/scene-assets/${assetId}`;
  }

  async function buildReviewDownloads(record, artifacts, playbackComparisons, visualManifest) {
    const episodeRoot = path.join(episodesRoot, record.episodeId);
    const sceneRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
    const worldPlanPath = path.join(
      repoRoot,
      "apps/playground/public/scene-plans",
      record.sceneId,
      "world-plan.png",
    );
    const images = [];
    for (const [id, title, filePath, remoteUrl] of [
      ["user-reference", "用户参考首帧", path.join(sceneRoot, "user-first-frame.png"),
        `/api/worlds/${record.sceneId}/reference`],
      ["world-plan", "Planner 世界俯视图", worldPlanPath,
        `/scene-assets/${record.sceneId}/world-plan.png`],
      ["base-styled-opening", "场景最终样式基准",
        path.join(sceneRoot, "styled-opening-frame.png"),
        `/api/worlds/${record.sceneId}/deliverables/styled-opening-frame`],
    ]) {
      const metadata = await fileMetadata(filePath);
      images.push({
        id,
        title,
        group: "reference",
        sizeBytes: metadata?.size ?? null,
        url: metadata ? sceneAssetUrl(record.episodeId, id) : remoteUrl,
      });
    }
    for (const comparison of playbackComparisons) {
      if (comparison.whiteboxVideo?.poster) images.push({
        id: `${comparison.segmentId}-whitebox-first-frame`,
        title: `${comparison.title} · 白膜首帧`,
        group: comparison.segmentId,
        ...comparison.whiteboxVideo.poster,
      });
      if (comparison.finalVideo?.poster) images.push({
        id: `${comparison.segmentId}-styled-opening-frame`,
        title: `${comparison.title} · 最终样式首帧`,
        group: comparison.segmentId,
        ...comparison.finalVideo.poster,
      });
    }
    for (const target of visualManifest?.targets ?? []) {
      const visualTargetId = target?.visualTargetId;
      const styledRelativePath = target?.styledTriview?.path;
      if (!idPattern.test(visualTargetId ?? "") ||
          typeof styledRelativePath !== "string" ||
          !/^visual\/triviews\/[a-z0-9-]+\/styled-triview\.png$/.test(styledRelativePath)) continue;
      const whiteboxPath = path.join(sceneRoot, "triviews", visualTargetId, "whitebox-triview.png");
      const [whiteboxMetadata, styledArtifact] = await Promise.all([
        fileMetadata(whiteboxPath),
        existingArtifact(record, episodeRoot, record.episodeId, styledRelativePath),
      ]);
      images.push({
        id: `whitebox-triview-${visualTargetId}`,
        title: `${visualTargetId} · 白膜三视图`,
        group: "triview",
        sizeBytes: whiteboxMetadata?.size ?? null,
        url: whiteboxMetadata
          ? sceneAssetUrl(record.episodeId, `whitebox-triview-${visualTargetId}`)
          : `/api/worlds/${record.sceneId}/triviews/${visualTargetId}`,
      });
      if (styledArtifact) images.push({
        id: `styled-triview-${visualTargetId}`,
        title: `${visualTargetId} · 最终样式三视图`,
        group: "triview",
        sizeBytes: styledArtifact.sizeBytes,
        url: styledArtifact.url,
      });
    }
    const documentPaths = new Set([
      "planning/playthrough-plan.json",
      "planning/navigation-evidence.json",
      "whitebox/executed-playthrough-quality-report.json",
      "whitebox/executed-playthrough-trace.json",
      "visual/episode-visual-prompts.json",
      "visual/episode-visual-manifest.json",
      "prompts/visual-events.json",
      "prompts/segment-00.json",
      "prompts/segment-01.json",
      "prompts/segment-02.json",
      "prompts/segment-03.json",
      "prompts/segment-04.json",
      "prompts/segment-05.json",
      "video/segment-00/provider-run.json",
      "video/segment-01/provider-run.json",
      "video/segment-02/provider-run.json",
      "video/segment-03/provider-run.json",
      "video/segment-04/provider-run.json",
      "video/segment-05/provider-run.json",
    ]);
    const documents = [{
      id: "interaction-timeline",
      title: "WASD / 镜头 / Prompt 交互时间线",
      kind: "json",
      url: `/api/episode-workflows/${record.episodeId}/interaction-timeline`,
    }, ...artifacts.filter((artifact) => documentPaths.has(artifact.relativePath)).map((artifact) => ({
      id: artifact.relativePath.replaceAll("/", "-").replace(/\.[^.]+$/, ""),
      title: artifact.title,
      kind: artifact.kind,
      sizeBytes: artifact.sizeBytes,
      url: artifact.url,
    }))];
    const expectedComparisonCount = seedanceSegmentIdsForRecord(record).length;
    const styleVariantManifest = await readJson(path.join(
      episodeRoot, "style-variants/style-variant-manifest.json",
    ));
    const styleVariantsReady = styleVariantManifest?.kind ===
        "worldkit-episode-style-variant-manifest" &&
      styleVariantManifest.succeededCount === styleVariantManifest.variantCount &&
      styleVariantManifest.variantCount === 10;
    const bundleReady = record.productionScope !== "visual-sample" &&
      record.status === "succeeded" && (styleVariantsReady || (
      playbackComparisons.length === expectedComparisonCount &&
      playbackComparisons.every((comparison) =>
        comparison.whiteboxVideo?.url && comparison.finalVideo?.url)
    ));
    return {
      images,
      documents,
      bundle: {
        ready: bundleReady,
        fileName: `${record.episodeId}-seedance-review.zip`,
        url: bundleReady ? `/api/episode-workflows/${record.episodeId}/bundle` : null,
      },
    };
  }

  async function buildStyleVariantReviews(record, episodeRoot) {
    const [manifest, productionRecord] = await Promise.all([
      readJson(path.join(episodeRoot, "style-variants/style-variant-manifest.json")),
      readJson(path.join(episodeRoot, "style-variants/style-variant-production-record.json")),
    ]);
    const entries = manifest?.kind === "worldkit-episode-style-variant-manifest"
      ? manifest.variants
      : productionRecord?.kind === "worldkit-episode-style-variant-production-record"
        ? productionRecord.variants
        : [];
    if (!Array.isArray(entries)) return [];
    return Promise.all(entries.map(async (entry) => {
      const variantRoot = `style-variants/${entry.id}`;
      const [definition, visualManifest, review, reviewReport, events] = await Promise.all([
        readJson(path.join(episodeRoot, variantRoot, "style-variant.json")),
        readJson(path.join(episodeRoot, variantRoot, "visual/visual-manifest.json")),
        readJson(path.join(episodeRoot, variantRoot, "review/visual-quality-review.json")),
        readJson(path.join(episodeRoot, variantRoot, "review/visual-quality-review-report.json")),
        readJson(path.join(episodeRoot, variantRoot, "prompts/visual-events.json")),
      ]);
      const comparisons = await Promise.all(seedanceSegmentIdsForRecord(record)
        .map(async (segmentId, index) => ({
          segmentId,
          title: `起点 ${index + 1}`,
          whiteboxVideo: await existingArtifact(
            record, episodeRoot, record.episodeId, `whitebox/${segmentId}.mp4`,
          ),
          styledOpeningFrame: await existingArtifact(
            record, episodeRoot, record.episodeId,
            `${variantRoot}/visual/${segmentId}-styled-opening-frame.png`,
          ),
          finalVideo: await existingArtifact(
            record, episodeRoot, record.episodeId,
            `${variantRoot}/video/${segmentId}/final-1280x720-24fps-720f.mp4`,
          ),
          seedancePrompt: await readJson(path.join(
            episodeRoot, variantRoot, "prompts", `${segmentId}.json`,
          )),
        })));
      const triviews = await Promise.all((visualManifest?.targets ?? []).map(async (target) => ({
        visualTargetId: target.visualTargetId,
        styled: await existingArtifact(
          record, episodeRoot, record.episodeId,
          `${variantRoot}/${target.styledTriview.path}`,
        ),
        whiteboxUrl: `/api/worlds/${record.sceneId}/triviews/${target.visualTargetId}`,
      })));
      return {
        id: entry.id,
        name: definition?.name ?? entry.id,
        concept: definition?.concept ?? "",
        status: entry.status,
        visualAttempt: entry.visualAttempt ?? null,
        visualReview: review,
        visualReviewReport: reviewReport,
        geminiEvents: events,
        comparisons,
        triviews,
      };
    }));
  }

  async function prepareEpisodeBundle(record) {
    const episodeRoot = path.join(episodesRoot, record.episodeId);
    const sceneRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
    const visualManifest = await readJson(path.join(episodeRoot, "visual/episode-visual-manifest.json"));
    const playbackComparisons = await buildPlaybackComparisons(
      record,
      episodeRoot,
      record.episodeId,
      record.sceneId,
    );
    const executedTrace = await readJson(
      path.join(episodeRoot, "whitebox/executed-playthrough-trace.json"),
    );
    if (record.status !== "succeeded" ||
        playbackComparisons.length !== seedanceSegmentIdsForRecord(record).length ||
        !playbackComparisons.every((comparison) => comparison.whiteboxVideo?.url && comparison.finalVideo?.url)) {
      throw new Error("Episode 尚未完成全部六个白膜起点与六段最终视频，暂不能打包。");
    }
    const timeline = buildEpisodeInteractionTimeline(record, playbackComparisons, executedTrace);
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-bundle-"));
    const folderName = `${record.episodeId}-seedance-review`;
    const folder = path.join(temporaryRoot, folderName);
    const entries = [];
    try {
      await mkdir(folder, { recursive: true });
      const copy = async (sourcePath, relativePath, role, required = false) => {
        const metadata = await fileMetadata(sourcePath);
        if (!metadata) {
          if (required) throw new Error(`Episode 下载包缺少 ${relativePath}`);
          return;
        }
        const destinationPath = path.join(folder, relativePath);
        await mkdir(path.dirname(destinationPath), { recursive: true });
        await copyFile(sourcePath, destinationPath);
        entries.push({ relativePath, role, sizeBytes: metadata.size });
      };
      const writeJsonEntry = async (relativePath, role, value) => {
        const destinationPath = path.join(folder, relativePath);
        const body = `${JSON.stringify(value, null, 2)}\n`;
        await mkdir(path.dirname(destinationPath), { recursive: true });
        await writeFile(destinationPath, body, "utf8");
        entries.push({ relativePath, role, sizeBytes: Buffer.byteLength(body) });
      };
      await writeJsonEntry("interaction-timeline.json", "wasd-camera-and-prompt-timeline", timeline);
      for (const [sourceRelativePath, destinationRelativePath, role, required] of [
        ["episode-record.json", "episode-record.json", "workflow-record", true],
        ["planning/playthrough-plan.json", "planning/playthrough-plan.json", "planned-gameplay-script", true],
        ["planning/navigation-evidence.json", "planning/navigation-evidence.json", "host-navigation-evidence", false],
        ["planning/reconnaissance/reconnaissance-report.json", "planning/reconnaissance-report.json", "runtime-reconnaissance", false],
        ["whitebox/episode-180s.mp4", "whitebox/episode-180s-six-independent-captures.mp4", "complete-six-capture-whitebox-video", Number(record.segmentCount) === 6],
        ["whitebox/episode-120s.mp4", "whitebox/episode-120s-1280x720-24fps.mp4", "legacy-complete-delivery-whitebox-video", Number(record.segmentCount) !== 6],
        ["whitebox/episode-124s-execution.mp4", "whitebox/episode-124s-execution-with-camera-reset-buffers.mp4", "legacy-complete-execution-whitebox-video", false],
        ["whitebox/executed-playthrough-quality-report.json", "whitebox/executed-playthrough-quality-report.json", "minimal-runtime-and-motion-health", true],
        ["whitebox/executed-playthrough-trace.json", "whitebox/executed-playthrough-trace.json", "raw-executed-input-trace", true],
        ["visual/episode-visual-prompts.json", "visual/episode-visual-prompts.json", "visual-reconstruction-prompts", true],
        ["visual/episode-visual-manifest.json", "visual/episode-visual-manifest.json", "visual-reconstruction-manifest", true],
        ["prompts/visual-events.json", "prompts/visual-events.json", "gemini-visual-event-plan", true],
        ["pipeline.log", "logs/pipeline.log", "workflow-log", false],
      ]) {
        await copy(path.join(episodeRoot, sourceRelativePath), destinationRelativePath, role, required);
      }
      await copy(path.join(sceneRoot, "user-first-frame.png"), "reference/user-first-frame.png", "user-visual-reference", true);
      await copy(
        path.join(repoRoot, "apps/playground/public/scene-plans", record.sceneId, "world-plan.png"),
        "reference/world-plan.png",
        "planner-world-layout",
        true,
      );
      await copy(path.join(sceneRoot, "styled-opening-frame.png"), "reference/base-styled-opening-frame.png", "scene-style-anchor", true);
      for (const target of visualManifest?.targets ?? []) {
        const visualTargetId = target?.visualTargetId;
        const styledRelativePath = target?.styledTriview?.path;
        if (!idPattern.test(visualTargetId ?? "") || typeof styledRelativePath !== "string" ||
            !/^visual\/triviews\/[a-z0-9-]+\/styled-triview\.png$/.test(styledRelativePath)) continue;
        await copy(
          path.join(sceneRoot, "triviews", visualTargetId, "whitebox-triview.png"),
          `visual/triviews/${visualTargetId}-whitebox.png`,
          "whitebox-triview",
          true,
        );
        await copy(
          path.join(episodeRoot, styledRelativePath),
          `visual/triviews/${visualTargetId}-styled.png`,
          "styled-triview",
          true,
        );
      }
      for (let index = 0; index < Number(record.segmentCount || 4); index += 1) {
        const captureId = `segment-${String(index).padStart(2, "0")}`;
        await copy(
          path.join(episodeRoot, `whitebox/${captureId}.mp4`),
          `whitebox-captures/${captureId}-1280x720-24fps-720f.mp4`,
          "independent-whitebox-capture",
          true,
        );
        await copy(
          path.join(episodeRoot, `whitebox/${captureId}-first-frame.png`),
          `whitebox-captures/${captureId}-first-frame.png`,
          "independent-whitebox-first-frame",
          true,
        );
      }
      for (const segmentId of seedanceSegmentIdsForRecord(record)) {
        const index = Number(segmentId.slice(-2));
        const segmentRoot = `segments/${segmentId}`;
        const final1280 = path.join(episodeRoot, `video/${segmentId}/final-1280x720-24fps-720f.mp4`);
        const final480 = path.join(episodeRoot, `video/${segmentId}/final-854x480-24fps-720f.mp4`);
        const finalPath = await fileMetadata(final1280) ? final1280 : final480;
        for (const [sourcePath, destinationRelativePath, role, required] of [
          [path.join(episodeRoot, `whitebox/${segmentId}.mp4`), `${segmentRoot}/whitebox-1280x720-24fps-720f.mp4`, "segment-whitebox-video", true],
          [path.join(episodeRoot, `whitebox/${segmentId}-first-frame.png`), `${segmentRoot}/whitebox-first-frame.png`, "segment-whitebox-first-frame", true],
          [path.join(episodeRoot, `visual/${segmentId}-styled-opening-frame.png`), `${segmentRoot}/styled-opening-frame.png`, "segment-styled-opening-frame", true],
          [path.join(episodeRoot, `video/${segmentId}/mg-seedance-2.5-480p.mp4`), `${segmentRoot}/seedance-mg-480p.mp4`, "seedance-provider-video", false],
          [path.join(episodeRoot, `video/${segmentId}/mediakit-enhanced-720p.mp4`), `${segmentRoot}/seedance-mediakit-720p.mp4`, "seedance-upscaled-video", false],
          [finalPath, `${segmentRoot}/seedance-final-1280x720-24fps-720f.mp4`, "seedance-final-video", true],
          [path.join(episodeRoot, `prompts/${segmentId}.json`), `${segmentRoot}/seedance-prompt.json`, "seedance-prompt", true],
          [path.join(episodeRoot, `video/${segmentId}/provider-run.json`), `${segmentRoot}/provider-run.json`, "provider-run-metadata", true],
        ]) {
          await copy(sourcePath, destinationRelativePath, role, required);
        }
      }
      await writeJsonEntry("manifest.json", "portable-bundle-manifest", {
        kind: "worldkit-episode-seedance-review-bundle",
        schemaVersion: 1,
        sceneId: record.sceneId,
        episodeId: record.episodeId,
        createdAt: new Date().toISOString(),
        naming: {
          segmentDirectory: "segments/segment-00..05",
          whiteboxVideo: "whitebox-1280x720-24fps-720f.mp4",
          finalVideo: "seedance-final-1280x720-24fps-720f.mp4",
          interactionTimeline: "interaction-timeline.json",
        },
        files: [...entries],
      });
      const zipPath = path.join(temporaryRoot, `${folderName}.zip`);
      await runZip(temporaryRoot, folderName, zipPath);
      return { temporaryRoot, zipPath, fileName: `${folderName}.zip` };
    } catch (error) {
      await rm(temporaryRoot, { recursive: true, force: true });
      throw error;
    }
  }

  async function enrich(record) {
    const episodeRoot = path.join(episodesRoot, record.episodeId);
    const artifacts = (await Promise.all(artifactDefinitions.map(async ([relativePath, title, kind, stage]) => {
      const filePath = path.join(episodeRoot, relativePath);
      try {
        const metadata = await stat(filePath);
        if (!metadata.isFile() || metadata.size <= 0) return null;
        return {
          relativePath, title, kind, stage, sizeBytes: metadata.size,
          url: `/api/episode-workflows/${record.episodeId}/artifacts/${relativePath}`,
        };
      } catch {
        const remote = remoteEpisodeArtifact(record, relativePath);
        return remote ? {
          relativePath,
          title,
          kind,
          stage,
          sizeBytes: remote.byteSize,
          url: `/api/episode-workflows/${record.episodeId}/artifacts/${relativePath}`,
        } : null;
      }
    }))).filter(Boolean);
    const visualManifest = await readJson(path.join(episodeRoot, "visual/episode-visual-manifest.json"));
    for (const target of visualManifest?.targets ?? []) {
      const relativePath = target?.styledTriview?.path;
      if (typeof relativePath !== "string" ||
          !/^visual\/triviews\/[a-z0-9-]+\/styled-triview\.png$/.test(relativePath)) continue;
      try {
        const metadata = await stat(path.join(episodeRoot, relativePath));
        if (!metadata.isFile() || metadata.size <= 0) continue;
        artifacts.push({
          relativePath,
          title: `${target.visualTargetId} · 共享最终三视图`,
          kind: "image",
          stage: "visual-reconstruction",
          sizeBytes: metadata.size,
          url: `/api/episode-workflows/${record.episodeId}/artifacts/${relativePath}`,
        });
      } catch {
        const remote = remoteEpisodeArtifact(record, relativePath);
        if (remote) artifacts.push({
          relativePath,
          title: `${target.visualTargetId} · 共享最终三视图`,
          kind: "image",
          stage: "visual-reconstruction",
          sizeBytes: remote.byteSize,
          url: `/api/episode-workflows/${record.episodeId}/artifacts/${relativePath}`,
        });
      }
    }
    const playbackComparisons = await buildPlaybackComparisons(
      record,
      episodeRoot,
      record.episodeId,
      record.sceneId,
    );
    const styleVariants = await buildStyleVariantReviews(record, episodeRoot);
    const reviewDownloads = await buildReviewDownloads(
      record,
      artifacts,
      playbackComparisons,
      visualManifest,
    );
    return {
      ...record,
      running: activeChildren.has(record.episodeId) ||
        activeCloudExecutions.has(record.episodeId) ||
        ["running", "remote-pending"].includes(record.status),
      artifacts,
      playbackComparisons,
      styleVariants,
      reviewDownloads,
    };
  }

  async function listForScene(sceneId) {
    if (!idPattern.test(sceneId)) return [];
    return listRecords({ sceneId });
  }

  async function listAll({ requireFinalVideo = false, latestPerScene = false } = {}) {
    const cacheKey = `${requireFinalVideo}:${latestPerScene}`;
    const cached = listAllCache.get(cacheKey);
    if (cached?.records && cached.expiresAt > Date.now()) return cached.records;
    if (cached?.promise) return cached.promise;
    const promise = listRecords({ requireFinalVideo, latestPerScene });
    listAllCache.set(cacheKey, { promise, records: cached?.records ?? null, expiresAt: 0 });
    try {
      const records = await promise;
      listAllCache.set(cacheKey, { promise: null, records, expiresAt: Date.now() + 5_000 });
      return records;
    } catch (error) {
      listAllCache.delete(cacheKey);
      throw error;
    }
  }

  async function listRecords({
    sceneId = null,
    requireFinalVideo = false,
    latestPerScene = false,
    includeRemote = true,
  } = {}) {
    let entries = [];
    try { entries = await readdir(episodesRoot, { withFileTypes: true }); } catch {}
    let records = (await Promise.all(entries.map(async (entry) => {
      if (!entry.isDirectory() || !idPattern.test(entry.name)) return null;
      const record = await readJson(path.join(episodesRoot, entry.name, "episode-record.json"));
      if (!record || record.episodeId !== entry.name || !idPattern.test(record.sceneId)) return null;
      if (sceneId && record.sceneId !== sceneId) return null;
      if (!requireFinalVideo) return record;
      const finalCandidates = [
          "video/segment-00/final-1280x720-24fps-720f.mp4",
          "video/segment-01/final-1280x720-24fps-720f.mp4",
          "video/segment-02/final-1280x720-24fps-720f.mp4",
          "video/segment-03/final-1280x720-24fps-720f.mp4",
          "video/segment-00/final-854x480-24fps-720f.mp4",
          "video/segment-01/final-854x480-24fps-720f.mp4",
          "video/segment-02/final-854x480-24fps-720f.mp4",
          "video/segment-03/final-854x480-24fps-720f.mp4",
          ...((record.styleVariantIds ?? []).flatMap((styleVariantId) =>
            seedanceSegmentIdsForRecord(record).map((segmentId) =>
              `style-variants/${styleVariantId}/video/${segmentId}/final-1280x720-24fps-720f.mp4`))),
      ];
      const hasFinalVideo = (await Promise.all(finalCandidates.map(async (relativePath) => {
        try {
          const metadata = await stat(path.join(episodesRoot, entry.name, relativePath));
          return metadata.isFile() && metadata.size > 0;
        } catch { return remoteEpisodeArtifact(record, relativePath) !== null; }
      }))).some(Boolean);
      return hasFinalVideo ? record : null;
    }))).filter(Boolean);
    if (includeRemote && typeof listCloudEpisodeRecords === "function") {
      const remoteRecords = await listCloudEpisodeRecords().catch(() => []);
      const byEpisodeId = new Map(records.map((record) => [record.episodeId, record]));
      for (const remoteRecord of remoteRecords) {
        if (!remoteRecord || !idPattern.test(remoteRecord.episodeId ?? "") ||
            !idPattern.test(remoteRecord.sceneId ?? "") ||
            (sceneId && remoteRecord.sceneId !== sceneId)) continue;
        if (requireFinalVideo) {
          const expectedSegments = seedanceSegmentIdsForRecord(remoteRecord);
          const paths = new Set((remoteRecord.remoteArtifacts ?? []).map((artifact) => artifact.path));
          if (!expectedSegments.every((segmentId) =>
            paths.has(`episode/video/${segmentId}/final-1280x720-24fps-720f.mp4`) ||
            (remoteRecord.styleVariantIds ?? []).some((styleVariantId) =>
              paths.has(`episode/style-variants/${styleVariantId}/video/${segmentId}/final-1280x720-24fps-720f.mp4`)))) {
            continue;
          }
        }
        const local = byEpisodeId.get(remoteRecord.episodeId);
        if (!local || Number(remoteRecord.recordRevision ?? 0) > Number(local.recordRevision ?? 0)) {
          byEpisodeId.set(remoteRecord.episodeId, remoteRecord);
        }
      }
      records = [...byEpisodeId.values()];
    }
    records.sort((left, right) => String(right.updatedAt ?? right.createdAt)
      .localeCompare(String(left.updatedAt ?? left.createdAt)));
    if (latestPerScene) {
      const seenScenes = new Set();
      records = records.filter((record) => {
        if (seenScenes.has(record.sceneId)) return false;
        seenScenes.add(record.sceneId);
        return true;
      });
    }
    const enriched = await Promise.all(records.map((record) => enrich(record)));
    return enriched.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  }

  async function writeLocalEpisodeRecordCache(record) {
    const recordPath = path.join(episodesRoot, record.episodeId, "episode-record.json");
    await mkdir(path.dirname(recordPath), { recursive: true });
    const temporaryPath = `${recordPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await rename(temporaryPath, recordPath);
    listAllCache.clear();
  }

  async function persistEpisodeRecord(record, writeOptions = {}) {
    const episodeId = record?.episodeId;
    if (!idPattern.test(episodeId ?? "")) throw new Error("Episode record ID is invalid.");
    const prior = episodePersistenceQueues.get(episodeId) ?? Promise.resolve();
    const operation = prior.catch(() => undefined).then(async () => {
      const current = await readJson(path.join(episodesRoot, episodeId, "episode-record.json"));
      const decision = resolveEpisodeRecordWrite(
        current,
        record,
        new Date().toISOString(),
        writeOptions,
      );
      if (!decision.applied) return decision.record;
      Object.assign(record, decision.record);
      if (record.backend === "cloud" && typeof persistCloudEpisodeRecord === "function") {
        // S3 is the durable authority for the cloud lane. Publish it before the
        // disposable local compatibility cache so a local disk write can never
        // make an uncommitted control-plane transition look durable.
        await persistCloudEpisodeRecord(record);
      }
      await writeLocalEpisodeRecordCache(record);
      return record;
    });
    episodePersistenceQueues.set(episodeId, operation);
    try {
      return await operation;
    } finally {
      if (episodePersistenceQueues.get(episodeId) === operation) {
        episodePersistenceQueues.delete(episodeId);
      }
    }
  }

  async function readEpisodeRecordById(episodeId) {
    const local = await readJson(path.join(episodesRoot, episodeId, "episode-record.json"));
    const remote = typeof readCloudEpisodeRecord === "function"
      ? readCloudEpisodeRecord(episodeId)
      : null;
    const resolvedRemote = await remote;
    if (!local) return resolvedRemote;
    if (!resolvedRemote) return local;
    return Number(resolvedRemote.recordRevision ?? 0) > Number(local.recordRevision ?? 0)
      ? resolvedRemote
      : local;
  }

  async function hydrateCloudEpisodeMetadata(record) {
    if (typeof readVerifiedRemoteArtifact !== "function") return;
    const episodeRoot = path.join(episodesRoot, record.episodeId);
    const metadataPaths = [
      "planning/playthrough-plan.json",
      "planning/navigation-evidence.json",
      "planning/reconnaissance/reconnaissance-report.json",
      "whitebox/executed-playthrough-trace.json",
      "whitebox/executed-playthrough-quality-report.json",
      "visual/episode-visual-manifest.json",
      "visual/episode-visual-prompts.json",
      "prompts/visual-events.json",
      ...seedanceSegmentIdsForRecord(record).map((segmentId) =>
        `prompts/${segmentId}.json`),
      ...seedanceSegmentIdsForRecord(record).map((segmentId) =>
        `video/${segmentId}/provider-run.json`),
      ...((record.styleVariantIds ?? []).length === 0 ? [] : [
        "style-variants/style-variant-plan.json",
        "style-variants/style-variant-plan-report.json",
        "style-variants/style-variant-manifest.json",
        "style-variants/style-variant-production-record.json",
        ...(record.styleVariantIds ?? []).flatMap((styleVariantId) => [
          `style-variants/${styleVariantId}/style-variant.json`,
          `style-variants/${styleVariantId}/visual/visual-manifest.json`,
          `style-variants/${styleVariantId}/review/visual-quality-review.json`,
          `style-variants/${styleVariantId}/review/visual-quality-review-report.json`,
          `style-variants/${styleVariantId}/prompts/visual-events.json`,
          ...seedanceSegmentIdsForRecord(record).flatMap((segmentId) => [
            `style-variants/${styleVariantId}/prompts/${segmentId}.json`,
            `style-variants/${styleVariantId}/video/${segmentId}/provider-run.json`,
          ]),
        ]),
      ]),
    ];
    for (const relativePath of metadataPaths) {
      const bytes = await readVerifiedRemoteArtifact(
        record,
        `episode/${relativePath}`,
      ).catch(() => null);
      if (!bytes) continue;
      const destination = path.join(episodeRoot, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes, { mode: 0o600 });
    }
  }

  async function admitCloudEpisodeResult(recordPath, record, result) {
    if (result.execution?.status !== "succeeded" || !result.manifestS3Uri) {
      throw new Error(
        `Cloud Episode Execution ended as ${result.execution?.status ?? "unknown"}: ` +
        `${result.execution?.error ?? "no error detail"}`,
      );
    }
    const manifest = await readCloudEpisodeManifest(result.manifestS3Uri, {
      expectedExecutionId: result.execution.execution_id,
      expectedSceneId: record.sceneId,
      expectedEpisodeId: record.episodeId,
    });
    if (record.remoteExecutionProfile === "cpu-gpu-batch-cpu@1" &&
        (manifest.stageId !== "episode-render" || manifest.executionPart !== "render")) {
      throw new Error("Cloud Episode final admission requires the episode-render manifest.");
    }
    if (record.remoteExecutionProfile === "cpu-gpu-streaming-checkpoints@1" &&
        (manifest.stageId !== "episode-publication" ||
          manifest.executionPart !== "publication")) {
      throw new Error("Streaming Cloud Episode final admission requires the publication manifest.");
    }
    if (typeof record.remoteWorkerImage !== "string" ||
        manifest.workerImage !== record.remoteWorkerImage) {
      throw new Error("Cloud Episode manifest Worker image does not match the frozen request digest.");
    }
    if (typeof readVerifiedRemoteArtifact !== "function") {
      throw new Error("Cloud Episode source receipt verifier is unavailable.");
    }
    const sourceReceiptBytes = await readVerifiedRemoteArtifact(
      { ...record, remoteArtifacts: manifest.artifacts },
      "episode/episode-source-receipt.json",
    );
    const sourceReceipt = JSON.parse(sourceReceiptBytes?.toString("utf8") ?? "null");
    if (sourceReceipt?.kind !== "worldkit-cloud-episode-source-receipt" ||
        sourceReceipt.schemaVersion !== 1 ||
        sourceReceipt.sceneId !== record.sceneId ||
        sourceReceipt.episodeId !== record.episodeId ||
        sourceReceipt.sceneExecutionId !== record.sourceSceneExecutionId ||
        sourceReceipt.sceneManifestS3Uri !== record.sourceSceneManifestS3Uri ||
        sourceReceipt.workerImage !== record.remoteWorkerImage ||
        sourceReceipt.styleVariantMode !== record.styleVariantMode ||
        !/^sha256:[a-f0-9]{64}$/.test(sourceReceipt.sceneManifestContentHash ?? "") ||
        !/^sha256:[a-f0-9]{64}$/.test(sourceReceipt.worldBuildIdentityHash ?? "") ||
        !/^sha256:[a-f0-9]{64}$/.test(sourceReceipt.sceneCaptureReceiptContentHash ?? "")) {
      throw new Error("Cloud Episode source receipt does not bind the admitted Scene and Worker.");
    }
    const styleVariantIds = [...new Set(manifest.artifacts.flatMap((artifact) => {
      const match = /^episode\/style-variants\/(style-0[0-9])\/style-variant\.json$/
        .exec(String(artifact?.path ?? ""));
      return match ? [match[1]] : [];
    }))].sort();
    const styleVariantMode = manifest.artifacts.some((artifact) =>
      artifact?.path === "episode/style-variants/style-variant-manifest.json");
    if ((record.styleVariantMode === "ten-style") !== styleVariantMode) {
      throw new Error("Cloud Episode output mode does not match its frozen production profile.");
    }
    const visualSample = record.productionScope === "visual-sample";
    const required = [
      "episode/episode-record.json",
      "episode/episode-source-receipt.json",
      "episode/planning/reconnaissance/reconnaissance-report.json",
      "episode/planning/navigation-evidence.json",
      "episode/planning/playthrough-plan.json",
      "episode/whitebox/episode-180s.mp4",
      "episode/whitebox/executed-playthrough-raw-trace.json",
      "episode/whitebox/executed-playthrough-trace.json",
      "episode/whitebox/executed-playthrough-quality-report.json",
      ...(visualSample ? [] : [`episode/bundle/${record.episodeId}-seedance-review.zip`]),
      ...Array.from({ length: Number(record.segmentCount || 4) }, (_, index) => [
        `episode/whitebox/segment-0${index}.mp4`,
        `episode/whitebox/segment-0${index}-first-frame.png`,
      ]).flat(),
      ...(styleVariantMode
        ? [
            "episode/style-variants/style-variant-plan.json",
            "episode/style-variants/style-variant-plan-report.json",
            "episode/style-variants/style-variant-manifest.json",
            ...styleVariantIds.flatMap((styleVariantId) => [
              `episode/style-variants/${styleVariantId}/style-variant.json`,
              `episode/style-variants/${styleVariantId}/visual/visual-manifest.json`,
              `episode/style-variants/${styleVariantId}/review/visual-quality-review.json`,
              `episode/style-variants/${styleVariantId}/review/visual-quality-review-report.json`,
              ...seedanceSegmentIdsForRecord(record).map((segmentId) =>
                `episode/style-variants/${styleVariantId}/visual/${segmentId}-styled-opening-frame.png`),
              ...(visualSample ? [] : [
                `episode/style-variants/${styleVariantId}/prompts/visual-events.json`,
                ...seedanceSegmentIdsForRecord(record).map((segmentId) =>
                  `episode/style-variants/${styleVariantId}/video/${segmentId}/final-1280x720-24fps-720f.mp4`),
              ]),
            ]),
          ]
        : [
            "episode/visual/episode-visual-prompts.json",
            "episode/visual/episode-visual-manifest.json",
            "episode/prompts/visual-events.json",
            ...seedanceSegmentIdsForRecord(record).flatMap((segmentId) => [
              `episode/visual/${segmentId}-styled-opening-frame.png`,
              `episode/prompts/${segmentId}.json`,
              `episode/video/${segmentId}/request.json`,
              `episode/video/${segmentId}/provider-run.json`,
              `episode/video/${segmentId}/seedance-2.5.mp4`,
              `episode/video/${segmentId}/final-1280x720-24fps-720f.mp4`,
            ]),
          ]),
    ];
    if (styleVariantMode && (styleVariantIds.length !== 10 ||
        styleVariantIds.some((id, index) => id !== `style-${String(index).padStart(2, "0")}`))) {
      throw new Error("Cloud Episode manifest must close exactly ten ordered Style Variants.");
    }
    if (!required.every((artifactPath) => manifest.artifacts.some((artifact) =>
      artifact.path === artifactPath && artifact.required === true))) {
      throw new Error("Cloud Episode manifest omitted required deliverables.");
    }
    record = await readJson(recordPath) ?? record;
    record = {
      ...record,
      status: "finalizing",
      currentStage: "artifact-metadata",
      finishedAt: null,
      error: null,
      styleVariantCount: styleVariantMode ? styleVariantIds.length : 0,
      styleVariantIds,
      stages: record.stages.map((stage) => ({ ...stage, status: "complete" })),
      remoteExecutionId: result.execution.execution_id,
      remoteArtifactManifestS3Uri: result.manifestS3Uri,
      remoteArtifactAdmission: {
        status: "passed",
        executionId: result.execution.execution_id,
        verifiedAt: new Date().toISOString(),
      },
      remoteArtifacts: manifest.artifacts,
    };
    await persistEpisodeRecord(record);
    await hydrateCloudEpisodeMetadata(record);
    const completedAt = new Date().toISOString();
    record = {
      ...record,
      status: "succeeded",
      currentStage: null,
      finishedAt: completedAt,
      retryPool: null,
      retryNotBeforeAt: null,
      failureClass: null,
      stages: record.stages.map((stage) => ({
        ...stage,
        status: "complete",
        startedAt: stage.startedAt ?? completedAt,
        finishedAt: stage.finishedAt ?? completedAt,
      })),
    };
    await persistEpisodeRecord(record);
    return record;
  }

  async function runCloudEpisode(sceneId, episodeId, {
    requestId: requestedRequestId = null,
    resumeEpisodeManifest = undefined,
    cloudAttempt = 1,
    workerImage = undefined,
  } = {}) {
    const recordPath = path.join(episodesRoot, episodeId, "episode-record.json");
    let record = await readJson(recordPath);
    const requestId = requestedRequestId ?? `${episodeId}-cloud-run-1`;
    try {
      // Startup recovery may discover an S3 Run Index entry before its
      // disposable local compatibility cache has been materialized. The
      // recovery coordinator normally hydrates it first; if it disappears
      // concurrently, leave the durable remote record untouched instead of
      // dereferencing a missing local record or creating a second execution.
      if (!record) return;
      if (
        typeof executeCloudEpisode !== "function" ||
        typeof resolveCloudSceneInput !== "function" ||
        typeof readCloudEpisodeManifest !== "function"
      ) throw new Error("Cloud Episode production is not configured.");
      if (typeof ensureCloudEpisodeAvailable === "function") {
        await ensureCloudEpisodeAvailable();
      }
      const scene = await resolveCloudSceneInput(sceneId);
      const result = await executeCloudEpisode({
        sceneId,
        episodeId,
        sceneExecutionId: scene.sceneExecutionId,
        sceneManifestS3Uri: scene.sceneManifestS3Uri,
        sceneRecord: scene.sceneRecord,
        productionScope: record.productionScope ?? "full",
        styleVariantMode: record.styleVariantMode ?? "legacy",
        resumeEpisodeManifest,
        workerImage,
        requestId,
        onSubmitted: async (submitted) => {
          activeCloudExecutions.set(episodeId, submitted.executionId);
          record = {
            ...record,
            remoteExecutionId: submitted.executionId,
            remoteStageId: "episode-prepare",
            remoteRequestId: requestId,
            remoteOutputS3Prefix: submitted.outputS3Prefix,
            remoteRequestS3Uri: submitted.requestS3Uri,
            remoteWorkerImage: submitted.workerImage,
            remoteExecutionProfile: submitted.executionProfile ?? "legacy-coarse@1",
            gpuBatchMinimumSize: submitted.gpuBatch?.minimumBatchSize ?? 100,
            gpuBatchMaximumSize: submitted.gpuBatch?.maximumBatchSize ?? 128,
            gpuBatchTailFlushIdleSeconds:
              submitted.gpuBatch?.tailFlushIdleSeconds ?? 120,
            gpuBatchStatus: "preparing",
            sourceSceneExecutionId: scene.sceneExecutionId,
            sourceSceneManifestS3Uri: scene.sceneManifestS3Uri,
            cloudAttempt,
            ...(resumeEpisodeManifest ? {
              resumedFromEpisodeExecutionId: resumeEpisodeManifest.executionId,
              resumedFromEpisodeManifestS3Uri: resumeEpisodeManifest.s3Uri,
            } : {}),
          };
          await persistEpisodeRecord(record);
        },
        onProgress: async (execution) => {
          record = await readJson(recordPath) ?? record;
          const remoteStage = execution?.stages?.find?.((stage) =>
            stage?.stage_id === execution?.current_stage_id);
          const internalStage = displayedEpisodeStage(record, execution, remoteStage);
          const stageIndex = record.stages.findIndex((stage) => stage.id === internalStage);
          const gpuBatchStatus = episodeGpuBatchStatus(execution, remoteStage);
          record = {
            ...record,
            status: "running",
            currentStage: internalStage,
            remoteStageId: execution.current_stage_id ?? record.remoteStageId,
            gpuBatchStatus,
            cloudLastHeartbeat: execution.last_heartbeat ?? new Date().toISOString(),
            retryPool: null,
            retryNotBeforeAt: null,
            failureClass: null,
            stages: record.stages.map((stage, index) => ({
              ...stage,
              status: index < stageIndex
                ? "complete"
                : index === stageIndex ? "running" : stage.status,
            })),
          };
          await persistEpisodeRecord(record);
        },
      });
      record = await admitCloudEpisodeResult(recordPath, record, result);
    } catch (error) {
      record = await readJson(recordPath) ?? record;
      if (record && record.status !== "cancelled") {
        if (await deferCloudEpisodeRecovery(record, error)) return;
        record = {
          ...record,
          status: record.remoteExecutionId ? "remote-pending" : "failed",
          error: error instanceof Error ? error.message : String(error),
          finishedAt: record.remoteExecutionId ? null : new Date().toISOString(),
          ...cloudFailureRecordFields(error),
        };
        await persistEpisodeRecord(record);
      }
    } finally {
      activeCloudExecutions.delete(episodeId);
    }
  }

  async function runCloudEpisodeRetry(record) {
    const recordPath = path.join(episodesRoot, record.episodeId, "episode-record.json");
    const attempt = Number(record.cloudAttempt ?? 1) + 1;
    const retryStageId = record.remoteStageId ?? "episode-render";
    try {
      if (
        typeof retryCloudEpisode !== "function" ||
        typeof readCloudEpisodeManifest !== "function" ||
        typeof record.remoteExecutionId !== "string" ||
        typeof record.remoteRequestS3Uri !== "string" ||
        typeof record.remoteOutputS3Prefix !== "string"
      ) throw new Error("Cloud Episode retry identity is incomplete.");
      const prepareStageIds = new Set([
        "reconnaissance", "navigation-evidence", "playthrough-plan",
      ]);
      const retryBoundaryIndex = record.stages.findIndex((stage) =>
        stage.id === episodeBoundaryByRemoteStage[retryStageId]);
      record = {
        ...record,
        remoteStageId: retryStageId,
        status: "running",
        currentStage: "preparing",
        finishedAt: null,
        error: null,
        cloudAttempt: attempt,
        remoteArtifactAdmission: null,
        remoteArtifacts: [],
        stages: record.stages.map((stage, index) => {
          const preserve = retryBoundaryIndex >= 0
            ? index < retryBoundaryIndex
            : retryStageId === "whitebox-capture"
              ? prepareStageIds.has(stage.id)
              : false;
          return preserve ? stage : {
            ...stage,
            status: "pending",
            startedAt: null,
            finishedAt: null,
          };
        }),
      };
      await persistEpisodeRecord(record);
      const result = await retryCloudEpisode({
        executionId: record.remoteExecutionId,
        requestS3Uri: record.remoteRequestS3Uri,
        outputS3Prefix: record.remoteOutputS3Prefix,
        retryRequestId: `${record.episodeId}-retry-${attempt}`,
        attempt,
        stageId: retryStageId,
        workerImage: record.remoteWorkerImage,
        onProgress: async (execution) => {
          record = await readJson(recordPath) ?? record;
          const remoteStage = execution?.stages?.find?.((stage) =>
            stage?.stage_id === execution?.current_stage_id);
          const internalStage = displayedEpisodeStage(record, execution, remoteStage);
          record = {
            ...record,
            currentStage: internalStage,
            remoteStageId: execution.current_stage_id ?? record.remoteStageId,
            gpuBatchStatus: episodeGpuBatchStatus(
              execution,
              remoteStage,
              record.gpuBatchStatus,
            ),
            retryPool: null,
            retryNotBeforeAt: null,
            failureClass: null,
          };
          await persistEpisodeRecord(record);
        },
      });
      await admitCloudEpisodeResult(recordPath, record, result);
    } catch (error) {
      record = await readJson(recordPath) ?? record;
      if (record.status !== "cancelled") {
        if (await deferCloudEpisodeRecovery(record, error)) return;
        await persistEpisodeRecord({
          ...record,
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
          ...cloudFailureRecordFields(error),
        });
      }
    } finally {
      activeCloudExecutions.delete(record.episodeId);
    }
  }

  async function runCloudEpisodeRecovery(record) {
    const recordPath = path.join(episodesRoot, record.episodeId, "episode-record.json");
    try {
      if (typeof recoverCloudEpisode !== "function" ||
          typeof record.remoteExecutionId !== "string") {
        throw new Error("Cloud Episode recovery identity is incomplete.");
      }
      const result = await recoverCloudEpisode({
        executionId: record.remoteExecutionId,
        requestS3Uri: record.remoteRequestS3Uri,
        outputS3Prefix: record.remoteOutputS3Prefix,
        workerImage: record.remoteWorkerImage,
        attempt: Number(record.cloudAttempt ?? 1),
        onProgress: async (execution) => {
          record = await readJson(recordPath) ?? record;
          const remoteStage = execution?.stages?.find?.((stage) =>
            stage?.stage_id === execution?.current_stage_id);
          const internalStage = displayedEpisodeStage(record, execution, remoteStage);
          await persistEpisodeRecord({
            ...record,
            status: "running",
            currentStage: internalStage,
            remoteStageId: execution.current_stage_id ?? record.remoteStageId,
            gpuBatchStatus: episodeGpuBatchStatus(
              execution,
              remoteStage,
              record.gpuBatchStatus,
            ),
            cloudLastHeartbeat: execution.last_heartbeat ?? new Date().toISOString(),
            finishedAt: null,
            error: null,
            retryPool: null,
            retryNotBeforeAt: null,
            failureClass: null,
          });
        },
      });
      if (result.cancelled) {
        await persistEpisodeRecord({
          ...record,
          status: "cancelled",
          finishedAt: new Date().toISOString(),
          error: "Cloud Episode was cancelled by the user.",
        });
        return;
      }
      if (result.retryRequired) {
        if (await deferCloudEpisodeRecovery(record, result.execution)) return;
        const retryStageId = failedEpisodeStageId(result.execution);
        const retryRecord = {
          ...(await readJson(recordPath) ?? record),
          ...(retryStageId === null ? {} : { remoteStageId: retryStageId }),
        };
        await runCloudEpisodeRetry(retryRecord);
        return;
      }
      await admitCloudEpisodeResult(recordPath, record, result);
    } catch (error) {
      record = await readJson(recordPath) ?? record;
      if (record.status !== "cancelled") {
        if (await deferCloudEpisodeRecovery(record, error)) return;
        await persistEpisodeRecord({
          ...record,
          status: "remote-pending",
          finishedAt: null,
          error: error instanceof Error ? error.message : String(error),
          ...cloudFailureRecordFields(error),
        });
      }
    } finally {
      activeCloudExecutions.delete(record.episodeId);
    }
  }

  async function adoptSucceededCloudExecution(episodeId, executionId) {
    if (!idPattern.test(episodeId) || !/^exec_[a-z0-9]+$/.test(executionId)) {
      throw new Error("Cloud Episode adoption identity is invalid.");
    }
    const recordPath = path.join(episodesRoot, episodeId, "episode-record.json");
    let record = await readJson(recordPath);
    if (!record || record.episodeId !== episodeId || record.backend !== "cloud") {
      throw new Error("Cloud Episode is not adoptable.");
    }
    if (typeof recoverCloudEpisode !== "function" ||
        typeof readCloudEpisodeManifest !== "function") {
      throw new Error("Cloud Episode recovery is not configured.");
    }
    const result = await recoverCloudEpisode({ executionId });
    if (result.retryRequired || result.cancelled || result.execution?.status !== "succeeded") {
      throw new Error(`Cloud Episode Execution ${executionId} is not succeeded.`);
    }
    record = {
      ...record,
      remoteExecutionId: executionId,
      remoteStageId: result.execution.current_stage_id ?? "episode-render",
      remoteArtifactManifestS3Uri: result.manifestS3Uri,
    };
    await persistEpisodeRecord(record);
    return admitCloudEpisodeResult(recordPath, record, result);
  }

  async function start(sceneId, backend = "cloud", productionScope = "full") {
    if (!idPattern.test(sceneId) || !["cloud", "local"].includes(backend) ||
        !["full", "visual-sample"].includes(productionScope)) {
      throw new Error("Invalid episode scene or backend.");
    }
    const existing = (await listForScene(sceneId)).find((record) => record.running);
    if (existing) return { episodeId: existing.episodeId, reused: true };
    const episodeId = `episode-${sceneId.slice(0, 70)}-${randomBytes(3).toString("hex")}`;
    const episodeRoot = path.join(episodesRoot, episodeId);
    await mkdir(episodeRoot, { recursive: true });
    if (backend === "cloud") {
      const createdAt = new Date().toISOString();
      const styleVariantConfig = await loadStyleVariantConfig();
      const styleVariantMode = styleVariantConfig.enabled ? "ten-style" : "legacy";
      const styleVariantIds = styleVariantMode === "ten-style"
        ? Array.from({ length: styleVariantConfig.variantCount }, (_, index) =>
          `style-${String(index).padStart(2, "0")}`)
        : [];
      await persistEpisodeRecord({
        kind: "worldkit-episode-workflow-record",
        schemaVersion: 1,
        sceneId,
        episodeId,
        backend,
        styleVariantMode,
        styleVariantCount: styleVariantIds.length,
        styleVariantIds,
        productionScope,
        segmentCount: 6,
        seedanceSegmentIds: [...currentSeedanceSegmentIds],
        deliveryDurationSeconds: 180,
        executionDurationSeconds: 180,
        status: "running",
        currentStage: "preparing",
        createdAt,
        updatedAt: createdAt,
        finishedAt: null,
        error: null,
        remoteExecutionId: null,
        remoteStageId: "episode-prepare",
        remoteExecutionProfile: "cpu-gpu-batch-cpu@1",
        gpuBatchMinimumSize: 100,
        gpuBatchMaximumSize: 128,
        gpuBatchStatus: "preparing",
        remoteRequestId: `${episodeId}-cloud-run-1`,
        remoteArtifactManifestS3Uri: null,
        remoteArtifactAdmission: null,
        remoteArtifacts: [],
        stages: episodeStageDefinitionsForMode(styleVariantMode).map(([id, title]) => ({
          id,
          title,
          status: "pending",
          startedAt: null,
          finishedAt: null,
        })),
      });
      activeCloudExecutions.set(episodeId, "submitting");
      void runCloudEpisode(sceneId, episodeId);
      return { episodeId, reused: false, resumed: false };
    }
    return spawnEpisode(sceneId, episodeId, backend, false, productionScope);
  }

  function spawnEpisode(sceneId, episodeId, backend, resumed, productionScope = "full") {
    const child = spawnImplementation("node", [
      "scripts/episodes/run-episode-workflow.mjs", "--scene-id", sceneId,
      "--episode-id", episodeId, "--origin", options.studioOrigin(), "--backend", backend,
    ], {
      cwd: repoRoot,
      env: { ...process.env, WORLDKIT_EPISODE_PRODUCTION_SCOPE: productionScope },
      stdio: "ignore",
      detached: false,
    });
    activeChildren.set(episodeId, child);
    child.once("close", () => activeChildren.delete(episodeId));
    child.once("error", () => activeChildren.delete(episodeId));
    return { episodeId, reused: false, resumed };
  }

  async function resume(episodeId) {
    if (!idPattern.test(episodeId)) throw new Error("Invalid episode id.");
    if (activeChildren.has(episodeId) || activeCloudExecutions.has(episodeId)) {
      return { episodeId, reused: true, resumed: true };
    }
    const record = await readEpisodeRecordById(episodeId);
    if (!record || record.episodeId !== episodeId || !idPattern.test(record.sceneId) ||
        !["cloud", "local"].includes(record.backend)) {
      throw new Error("Episode is not resumable.");
    }
    if (record.backend === "cloud") {
      if (record.status === "cancelled") {
        if (
          typeof resolveCloudEpisodeResumeManifest !== "function" ||
          typeof record.remoteExecutionId !== "string"
        ) throw new Error("Cancelled Cloud Episode has no resumable checkpoint.");
        const resumeEpisodeManifest = await resolveCloudEpisodeResumeManifest(record);
        const restartGeneration = Number(record.restartGeneration ?? 0) + 1;
        const cloudAttempt = Number(record.cloudAttempt ?? 1) + 1;
        const requestId = `${episodeId}-restart-${restartGeneration}`;
        const restarted = {
          ...record,
          status: "running",
          currentStage: "preparing",
          finishedAt: null,
          error: null,
          restartGeneration,
          cloudAttempt,
          remoteExecutionId: null,
          remoteStageId: "episode-prepare",
          remoteRequestId: requestId,
          remoteRequestS3Uri: null,
          remoteArtifactManifestS3Uri: null,
          remoteArtifactAdmission: null,
          remoteArtifacts: [],
          resumedFromEpisodeExecutionId: resumeEpisodeManifest.executionId,
          resumedFromEpisodeManifestS3Uri: resumeEpisodeManifest.s3Uri,
          stages: record.stages.map((stage) => ({
            ...stage,
            status: stage.id === "style-variant-production" ? "pending" : stage.status,
            ...(stage.id === "style-variant-production" ? {
              startedAt: null,
              finishedAt: null,
            } : {}),
          })),
        };
        await persistEpisodeRecord(restarted, { allowCancelledRestart: true });
        activeCloudExecutions.set(episodeId, "submitting");
        void runCloudEpisode(record.sceneId, episodeId, {
          requestId,
          resumeEpisodeManifest,
          cloudAttempt,
          workerImage: resumeEpisodeManifest.workerImage ?? record.remoteWorkerImage,
        });
        return { episodeId, reused: false, resumed: true, restartGeneration };
      }
      activeCloudExecutions.set(episodeId, record.remoteExecutionId ?? "recovering");
      void (record.remoteExecutionId
        ? runCloudEpisodeRecovery(record)
        : runCloudEpisode(record.sceneId, episodeId));
      return { episodeId, reused: false, resumed: true };
    }
    return spawnEpisode(
      record.sceneId,
      episodeId,
      record.backend,
      true,
      record.productionScope ?? "full",
    );
  }

  async function recoverPersistedCloudEpisodes({ includeRemote = true } = {}) {
    let recovered = 0;
    for (const listedRecord of await listRecords({ includeRemote })) {
      const record = await readEpisodeRecordById(listedRecord.episodeId) ?? listedRecord;
      if (
        record.backend !== "cloud" ||
        !["running", "remote-pending"].includes(record.status) ||
        activeCloudExecutions.has(record.episodeId)
      ) continue;
      recovered += 1;
      const retryNotBeforeMs = Date.parse(record.retryNotBeforeAt ?? "");
      if (Number.isFinite(retryNotBeforeMs) && retryNotBeforeMs > now()) {
        scheduleCloudEpisodeRecovery(record, retryNotBeforeMs - now());
        continue;
      }
      const localRecordPath = path.join(
        episodesRoot,
        record.episodeId,
        "episode-record.json",
      );
      const localRecord = await readJson(localRecordPath);
      if (
        !localRecord ||
        Number(record.recordRevision ?? 0) > Number(localRecord.recordRevision ?? 0)
      ) {
        // S3 is authoritative in the cloud lane, but the asynchronous worker
        // functions intentionally operate on one local compatibility record.
        // Hydrate that cache without republishing or incrementing the durable
        // record before launching recovery, so all later reads keep the same
        // immutable Episode identity.
        await writeLocalEpisodeRecordCache({ ...record });
      }
      if (typeof record.remoteExecutionId === "string" && record.remoteExecutionId) {
        activeCloudExecutions.set(record.episodeId, record.remoteExecutionId);
        void runCloudEpisodeRecovery(record);
      } else {
        activeCloudExecutions.set(record.episodeId, "submitting");
        void runCloudEpisode(record.sceneId, record.episodeId);
      }
    }
    return recovered;
  }

  async function handleApi(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/episode-workflows") {
      const sceneId = url.searchParams.get("sceneId") ?? "";
      const episodes = sceneId
        ? await listForScene(sceneId)
        : await listAll({
            requireFinalVideo: url.searchParams.get("review") === "seedance",
            latestPerScene: url.searchParams.get("review") === "seedance",
          });
      sendJson(response, 200, { episodes });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/episode-workflows") {
      const body = await readJsonBody(request);
      const result = await start(
        String(body.sceneId ?? ""),
        String(body.backend ?? "cloud"),
        String(body.productionScope ?? "full"),
      );
      sendJson(response, 202, result);
      return true;
    }
    const detail = /^\/api\/episode-workflows\/([a-z0-9-]+)$/.exec(url.pathname);
    if (request.method === "GET" && detail) {
      const record = await readEpisodeRecordById(detail[1]);
      if (!record) { sendJson(response, 404, { error: "Episode not found." }); return true; }
      sendJson(response, 200, { episode: await enrich(record) });
      return true;
    }
    const stop = /^\/api\/episode-workflows\/([a-z0-9-]+)\/stop$/.exec(url.pathname);
    if (request.method === "POST" && stop) {
      const child = activeChildren.get(stop[1]);
      if (child && !child.killed) child.kill("SIGTERM");
      const record = await readEpisodeRecordById(stop[1]);
      let cloudStopped = false;
      if (record?.backend === "cloud" && record.remoteExecutionId &&
          typeof cancelCloudEpisode === "function") {
        await cancelCloudEpisode(record.remoteExecutionId);
        cloudStopped = true;
        await persistEpisodeRecord({
          ...record,
          status: "cancelled",
          finishedAt: new Date().toISOString(),
          error: "Cloud Episode was cancelled by the user.",
        });
        if (typeof cancelCloudEpisodeWorkers === "function") {
          await cancelCloudEpisodeWorkers(record.remoteExecutionId).catch((error) => {
            console.error("WORLDKIT_EPISODE_WORKER_CANCEL_FAILED", error);
          });
        }
      }
      sendJson(response, 202, { stopped: Boolean(child) || cloudStopped });
      return true;
    }
    const resumeMatch = /^\/api\/episode-workflows\/([a-z0-9-]+)\/resume$/.exec(url.pathname);
    if (request.method === "POST" && resumeMatch) {
      sendJson(response, 202, await resume(resumeMatch[1]));
      return true;
    }
    const adoptMatch = /^\/api\/episode-workflows\/([a-z0-9-]+)\/adopt-cloud-execution$/.exec(
      url.pathname,
    );
    if (request.method === "POST" && adoptMatch) {
      const body = await readJsonBody(request);
      const episode = await adoptSucceededCloudExecution(
        adoptMatch[1],
        String(body.executionId ?? ""),
      );
      sendJson(response, 200, { episode: await enrich(episode) });
      return true;
    }
    const interactionTimelineMatch = /^\/api\/episode-workflows\/([a-z0-9-]+)\/interaction-timeline$/.exec(url.pathname);
    if (request.method === "GET" && interactionTimelineMatch) {
      const episodeId = interactionTimelineMatch[1];
      const record = await readEpisodeRecordById(episodeId);
      if (!record || record.episodeId !== episodeId) {
        sendJson(response, 404, { error: "Episode not found." });
        return true;
      }
      const comparisons = await buildPlaybackComparisons(
        record,
        path.join(episodesRoot, episodeId),
        episodeId,
        record.sceneId,
      );
      const executedTrace = await readJson(
        path.join(episodesRoot, episodeId, "whitebox/executed-playthrough-trace.json"),
      );
      sendDownloadJson(
        response,
        `${episodeId}-interaction-timeline.json`,
        buildEpisodeInteractionTimeline(record, comparisons, executedTrace),
      );
      return true;
    }
    const bundleMatch = /^\/api\/episode-workflows\/([a-z0-9-]+)\/bundle$/.exec(url.pathname);
    if (request.method === "GET" && bundleMatch) {
      const episodeId = bundleMatch[1];
      const record = await readEpisodeRecordById(episodeId);
      if (!record || record.episodeId !== episodeId) {
        sendJson(response, 404, { error: "Episode not found." });
        return true;
      }
      const remoteBundle = remoteEpisodeArtifact(
        record,
        `bundle/${episodeId}-seedance-review.zip`,
      );
      if (remoteBundle && typeof streamRemoteArtifact === "function") {
        const serveRemote = typeof redirectRemoteArtifact === "function"
          ? redirectRemoteArtifact
          : streamRemoteArtifact;
        await serveRemote(response, remoteBundle, {
          downloadName: `${episodeId}-seedance-review.zip`,
        });
        return true;
      }
      const localBundlePath = path.join(
        episodesRoot, episodeId, "bundle", `${episodeId}-seedance-review.zip`,
      );
      const localBundleMetadata = await fileMetadata(localBundlePath);
      if (localBundleMetadata) {
        await serveRange(
          request,
          response,
          localBundlePath,
          createReadStreamImplementation,
          `${episodeId}-seedance-review.zip`,
        );
        return true;
      }
      let bundle = null;
      try {
        bundle = await prepareEpisodeBundle(record);
        const cleanup = () => void rm(bundle.temporaryRoot, { recursive: true, force: true });
        response.once("close", cleanup);
        await serveRange(
          request,
          response,
          bundle.zipPath,
          createReadStreamImplementation,
          bundle.fileName,
        );
      } catch (error) {
        if (bundle) await rm(bundle.temporaryRoot, { recursive: true, force: true });
        sendJson(response, /尚未完成|缺少/.test(String(error?.message ?? error)) ? 409 : 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }
    const sceneAssetMatch = /^\/api\/episode-workflows\/([a-z0-9-]+)\/scene-assets\/([a-z0-9-]+)$/.exec(url.pathname);
    if (["GET", "HEAD"].includes(request.method) && sceneAssetMatch) {
      const [, episodeId, assetId] = sceneAssetMatch;
      const record = await readEpisodeRecordById(episodeId);
      if (!record || record.episodeId !== episodeId) {
        sendJson(response, 404, { error: "Episode not found." });
        return true;
      }
      const sceneRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
      let filePath = null;
      if (assetId === "user-reference") filePath = path.join(sceneRoot, "user-first-frame.png");
      else if (assetId === "world-plan") filePath = path.join(
        repoRoot,
        "apps/playground/public/scene-plans",
        record.sceneId,
        "world-plan.png",
      );
      else if (assetId === "base-styled-opening") filePath = path.join(sceneRoot, "styled-opening-frame.png");
      else if (assetId.startsWith("whitebox-triview-")) {
        const visualTargetId = assetId.slice("whitebox-triview-".length);
        if (idPattern.test(visualTargetId)) {
          filePath = path.join(sceneRoot, "triviews", visualTargetId, "whitebox-triview.png");
        }
      }
      if (!filePath) {
        sendJson(response, 404, { error: "Episode scene asset not found." });
        return true;
      }
      try {
        await serveRange(request, response, filePath, createReadStreamImplementation);
      } catch {
        sendJson(response, 404, { error: "Episode scene asset not found." });
      }
      return true;
    }
    const artifact = /^\/api\/episode-workflows\/([a-z0-9-]+)\/artifacts\/(.+)$/.exec(url.pathname);
    if (["GET", "HEAD"].includes(request.method) && artifact) {
      const relativePath = decodeURIComponent(artifact[2]);
      const episodeRoot = path.join(episodesRoot, artifact[1]);
      const filePath = path.resolve(episodeRoot, relativePath);
      if (!filePath.startsWith(`${episodeRoot}${path.sep}`)) {
        sendJson(response, 400, { error: "Invalid artifact path." });
        return true;
      }
      try {
        const record = await readJson(path.join(
          episodesRoot,
          artifact[1],
          "episode-record.json",
        ));
        const remote = remoteEpisodeArtifact(record, relativePath);
        if (await fileMetadata(filePath)) {
          await serveRange(request, response, filePath, createReadStreamImplementation);
        } else if (remote && (
          typeof redirectRemoteArtifact === "function" ||
          typeof streamRemoteArtifact === "function"
        )) {
          const serveRemote = typeof redirectRemoteArtifact === "function"
            ? redirectRemoteArtifact
            : streamRemoteArtifact;
          await serveRemote(response, remote);
        } else throw new Error("Artifact not found.");
      } catch {
        sendJson(response, 404, { error: "Artifact not found." });
      }
      return true;
    }
    return false;
  }

  async function shutdown() {
    for (const child of activeChildren.values()) if (!child.killed) child.kill("SIGTERM");
    // A Studio/control-plane process shutdown is not a user cancellation.
    // Remote Cloud Executions continue and the next process instance reattaches
    // through recoverPersistedCloudEpisodes(). Only the explicit /stop API may
    // cancel a remote Episode.
    activeChildren.clear();
    activeCloudExecutions.clear();
    for (const episodeId of cloudRetryTimers.keys()) clearCloudRetryTimer(episodeId);
  }

  return {
    handleApi,
    listForScene,
    listAll,
    recoverPersistedCloudEpisodes,
    shutdown,
    get activeJobs() {
      return [...new Set([...activeChildren.keys(), ...activeCloudExecutions.keys()])];
    },
  };
}
