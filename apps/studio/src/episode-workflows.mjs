import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const idPattern = /^[a-z0-9][a-z0-9-]{2,119}$/;
const artifactDefinitions = [
  ["planning/reconnaissance/reconnaissance-report.json", "运行时侦察报告", "json", "reconnaissance"],
  ["planning/reconnaissance/recon-00-initial.png", "侦察初始画面", "image", "reconnaissance"],
  ["planning/playthrough-plan.json", "90 秒玩家剧本", "json", "playthrough-plan"],
  ["whitebox/episode-90s.mp4", "90 秒白膜试玩", "video", "whitebox-capture"],
  ["whitebox/executed-playthrough-trace.json", "实际执行轨迹", "json", "whitebox-capture"],
  ["whitebox/segment-00.mp4", "白膜 00–30s", "video", "whitebox-capture"],
  ["whitebox/segment-01.mp4", "白膜 30–60s", "video", "whitebox-capture"],
  ["whitebox/segment-02.mp4", "白膜 60–90s", "video", "whitebox-capture"],
  ["visual/segment-00-styled-opening-frame.png", "第 1 段最终样式首帧", "image", "visual-reconstruction"],
  ["visual/segment-01-styled-opening-frame.png", "第 2 段最终样式首帧", "image", "visual-reconstruction"],
  ["visual/segment-02-styled-opening-frame.png", "第 3 段最终样式首帧", "image", "visual-reconstruction"],
  ["visual/episode-visual-prompts.json", "首帧与三视图生成 Prompt", "json", "visual-reconstruction"],
  ["visual/episode-visual-manifest.json", "视觉重建清单", "json", "visual-reconstruction"],
  ["visual-reviews/visual-reconstructor-v5/episode-opening-review-prompts.json", "Visual Reconstructor V5 首帧 Prompt", "json", "visual-reconstruction"],
  ["visual-reviews/visual-reconstructor-v5/episode-opening-review-manifest.json", "Visual Reconstructor V5 首帧审阅清单", "json", "visual-reconstruction"],
  ["prompts/segment-00.json", "第 1 段 Seedance 渲染 Prompt", "json", "seedance-prompts"],
  ["prompts/segment-01.json", "第 2 段 Seedance 渲染 Prompt", "json", "seedance-prompts"],
  ["prompts/segment-02.json", "第 3 段 Seedance 渲染 Prompt", "json", "seedance-prompts"],
  ["video/segment-00/mg-seedance-2.5-480p.mp4", "第 1 段 MG Seedance 480p", "video", "seedance-generation"],
  ["video/segment-01/mg-seedance-2.5-480p.mp4", "第 2 段 MG Seedance 480p", "video", "seedance-generation"],
  ["video/segment-02/mg-seedance-2.5-480p.mp4", "第 3 段 MG Seedance 480p", "video", "seedance-generation"],
  // Historical OV + CF artifacts remain readable for already completed episodes.
  ["video/segment-00/ov-seedance-2.5-720p-gz-30s.mp4", "历史第 1 段 OV 720p", "video", "seedance-generation"],
  ["video/segment-01/ov-seedance-2.5-720p-gz-30s.mp4", "历史第 2 段 OV 720p", "video", "seedance-generation"],
  ["video/segment-02/ov-seedance-2.5-720p-gz-30s.mp4", "历史第 3 段 OV 720p", "video", "seedance-generation"],
  ["video/segment-00/cf-upscaled-720p.mp4", "第 1 段 CF 720p", "video", "cf-upscale"],
  ["video/segment-01/cf-upscaled-720p.mp4", "第 2 段 CF 720p", "video", "cf-upscale"],
  ["video/segment-02/cf-upscaled-720p.mp4", "第 3 段 CF 720p", "video", "cf-upscale"],
  ["video/segment-00/final-1280x720-24fps-720f.mp4", "第 1 段最终视频", "video", "conformance"],
  ["video/segment-01/final-1280x720-24fps-720f.mp4", "第 2 段最终视频", "video", "conformance"],
  ["video/segment-02/final-1280x720-24fps-720f.mp4", "第 3 段最终视频", "video", "conformance"],
  ["video/segment-00/final-854x480-24fps-720f.mp4", "第 1 段最终 480p 视频", "video", "conformance"],
  ["video/segment-01/final-854x480-24fps-720f.mp4", "第 2 段最终 480p 视频", "video", "conformance"],
  ["video/segment-02/final-854x480-24fps-720f.mp4", "第 3 段最终 480p 视频", "video", "conformance"],
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
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);
const segmentDurationSeconds = 30;
const segmentCount = 3;

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

async function existingArtifact(episodeRoot, episodeId, relativePath) {
  try {
    const metadata = await stat(path.join(episodeRoot, relativePath));
    if (!metadata.isFile() || metadata.size <= 0) return null;
    return { relativePath, url: artifactUrl(episodeId, relativePath), sizeBytes: metadata.size };
  } catch {
    return null;
  }
}

function clipActivation(activation, segmentIndex) {
  const globalStartSeconds = segmentIndex * segmentDurationSeconds;
  const globalEndSeconds = globalStartSeconds + segmentDurationSeconds;
  const startSeconds = Math.max(globalStartSeconds, activation.startSeconds);
  const endSeconds = Math.min(globalEndSeconds, activation.endSeconds);
  if (endSeconds <= startSeconds) return null;
  return {
    id: activation.id,
    kind: activation.kind,
    startSeconds: roundedSeconds(startSeconds - globalStartSeconds),
    endSeconds: roundedSeconds(endSeconds - globalStartSeconds),
    keys: [...new Set(activation.keys.filter((key) => playbackKeys.has(key)))],
  };
}

function executedActivations(trace, segmentIndex) {
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
    activations.push({ ...start, endSeconds: segmentCount * segmentDurationSeconds });
  }
  return activations
    .map((activation) => clipActivation(activation, segmentIndex))
    .filter((activation) => activation && activation.keys.length > 0)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id));
}

function promptEventForSegment(plan, trace, promptDocument, segmentId, segmentIndex) {
  const planned = (plan?.seedancePromptEvents ?? []).find((event) => event?.segmentId === segmentId) ?? null;
  const marker = (trace?.events ?? []).find((event) =>
    event?.kind === "prompt-marker" && (event.segmentId === segmentId || event.id === planned?.id)) ?? null;
  const globalSeconds = finiteSeconds(
    promptDocument?.executedEventSeconds,
    finiteSeconds(marker?.actualSeconds, finiteSeconds(planned?.globalSeconds)),
  );
  const relativeSeconds = globalSeconds === null
    ? finiteSeconds(planned?.segmentRelativeSeconds)
    : globalSeconds - segmentIndex * segmentDurationSeconds;
  const transitionDurationSeconds = Math.max(0, finiteSeconds(planned?.timing?.transitionDurationSeconds, 0));
  const endingDurationSeconds = Math.max(0, finiteSeconds(planned?.timing?.endingDurationSeconds, 0));
  const providerPrompt = typeof promptDocument?.prompt === "string" ? promptDocument.prompt : "";
  const eventPrompt = typeof planned?.eventPrompt === "string" ? planned.eventPrompt : "";
  if (!planned && !providerPrompt) return null;
  return {
    id: String(promptDocument?.eventId ?? planned?.id ?? `${segmentId}-prompt`),
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
    eventPrompt,
    providerPrompt,
  };
}

async function buildPlaybackComparisons(episodeRoot, episodeId, sceneId) {
  const [plan, trace, ...promptDocuments] = await Promise.all([
    readJson(path.join(episodeRoot, "planning/playthrough-plan.json")),
    readJson(path.join(episodeRoot, "whitebox/executed-playthrough-trace.json")),
    ...Array.from({ length: segmentCount }, (_, index) =>
      readJson(path.join(episodeRoot, `prompts/segment-${String(index).padStart(2, "0")}.json`))),
  ]);
  return Promise.all(Array.from({ length: segmentCount }, async (_, index) => {
    const segmentId = `segment-${String(index).padStart(2, "0")}`;
    const globalStartSeconds = index * segmentDurationSeconds;
    const [whiteboxVideo, finalVideo720, finalVideo480, providerVideo480, legacyPromptVideo, legacyPrompt, relaxedActionVideo, relaxedPrompt, whiteboxPoster, finalPoster, reviewStyledOpeningFrame] = await Promise.all([
      existingArtifact(episodeRoot, episodeId, `whitebox/${segmentId}.mp4`),
      existingArtifact(
        episodeRoot,
        episodeId,
        `video/${segmentId}/final-1280x720-24fps-720f.mp4`,
      ),
      existingArtifact(
        episodeRoot,
        episodeId,
        `video/${segmentId}/final-854x480-24fps-720f.mp4`,
      ),
      existingArtifact(
        episodeRoot,
        episodeId,
        `video/${segmentId}/mg-seedance-2.5-480p.mp4`,
      ),
      existingArtifact(
        episodeRoot,
        episodeId,
        `video-ab/legacy-heavy/${segmentId}/final-854x480-24fps-720f.mp4`,
      ),
      readJson(path.join(episodeRoot, `prompt-ab/legacy-heavy/${segmentId}.json`)),
      existingArtifact(
        episodeRoot,
        episodeId,
        `video-ab/relaxed-action/${segmentId}/final-854x480-24fps-720f.mp4`,
      ),
      readJson(path.join(episodeRoot, `prompt-ab/relaxed-action/${segmentId}.json`)),
      existingArtifact(episodeRoot, episodeId, `whitebox/${segmentId}-first-frame.png`),
      existingArtifact(episodeRoot, episodeId, `visual/${segmentId}-styled-opening-frame.png`),
      existingArtifact(episodeRoot, episodeId, `visual-reviews/visual-reconstructor-v5/${segmentId}-styled-opening-frame.png`),
    ]);
    const basePromptEvent = promptEventForSegment(
      plan, trace, promptDocuments[index], segmentId, index,
    );
    const finalVideo = finalVideo720 ?? finalVideo480;
    return {
      segmentId,
      index,
      title: `阶段 ${index + 1}`,
      globalStartSeconds,
      globalEndSeconds: globalStartSeconds + segmentDurationSeconds,
      durationSeconds: segmentDurationSeconds,
      whiteboxVideo: whiteboxVideo ? { ...whiteboxVideo, poster: whiteboxPoster } : null,
      finalVideo: finalVideo ? { ...finalVideo, poster: finalPoster } : null,
      publicPreviewVideo: finalVideo480 || providerVideo480
        ? { ...(finalVideo480 ?? providerVideo480), poster: finalPoster }
        : null,
      baseStyledOpeningFrame: { url: `/api/worlds/${sceneId}/deliverables/styled-opening-frame` },
      reviewStyledOpeningFrame,
      legacyPromptVideo: legacyPromptVideo ? { ...legacyPromptVideo, poster: finalPoster } : null,
      relaxedActionVideo: relaxedActionVideo ? { ...relaxedActionVideo, poster: finalPoster } : null,
      inputActivations: executedActivations(trace, index),
      promptEvent: basePromptEvent
        ? {
            ...basePromptEvent,
            ...(typeof legacyPrompt?.prompt === "string" ? { legacyProviderPrompt: legacyPrompt.prompt } : {}),
            ...(typeof relaxedPrompt?.prompt === "string" ? { relaxedProviderPrompt: relaxedPrompt.prompt } : {}),
          }
        : null,
    };
  }));
}

export function buildEpisodeInteractionTimeline(record, playbackComparisons, executedTrace = null) {
  const segments = (playbackComparisons ?? []).map((comparison) => {
    const globalStartSeconds = finiteSeconds(comparison?.globalStartSeconds, 0);
    const prompt = comparison?.promptEvent;
    return {
      segmentId: comparison.segmentId,
      globalStartSeconds,
      globalEndSeconds: finiteSeconds(
        comparison?.globalEndSeconds,
        globalStartSeconds + segmentDurationSeconds,
      ),
      inputs: (comparison?.inputActivations ?? []).map((activation) => ({
        id: activation.id,
        kind: activation.kind,
        keys: [...(activation.keys ?? [])],
        segmentStartSeconds: roundedSeconds(activation.startSeconds),
        segmentEndSeconds: roundedSeconds(activation.endSeconds),
        globalStartSeconds: roundedSeconds(globalStartSeconds + activation.startSeconds),
        globalEndSeconds: roundedSeconds(globalStartSeconds + activation.endSeconds),
      })),
      promptEvent: prompt ? {
        id: prompt.id,
        eventClass: prompt.eventClass,
        targetNames: [...(prompt.targetNames ?? [])],
        globalSeconds: prompt.globalSeconds,
        segmentSeconds: prompt.relativeSeconds,
        activeEndSeconds: prompt.activeEndSeconds,
        commandText: prompt.commandText,
        inputPrompt: prompt.eventPrompt,
        seedanceProviderPrompt: prompt.providerPrompt,
      } : null,
    };
  });
  return {
    kind: "worldkit-episode-interaction-timeline",
    schemaVersion: executedTrace?.frameTelemetry ? 2 : 1,
    sceneId: record.sceneId,
    episodeId: record.episodeId,
    durationSeconds: segmentCount * segmentDurationSeconds,
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
  const listAllCache = new Map();

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
    for (const [id, title, filePath] of [
      ["user-reference", "用户参考首帧", path.join(sceneRoot, "user-first-frame.png")],
      ["world-plan", "Planner 世界俯视图", worldPlanPath],
      ["base-styled-opening", "场景最终样式基准", path.join(sceneRoot, "styled-opening-frame.png")],
    ]) {
      const metadata = await fileMetadata(filePath);
      if (metadata) images.push({ id, title, group: "reference", sizeBytes: metadata.size, url: sceneAssetUrl(record.episodeId, id) });
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
      const styledPath = path.join(episodeRoot, styledRelativePath);
      const [whiteboxMetadata, styledMetadata] = await Promise.all([
        fileMetadata(whiteboxPath),
        fileMetadata(styledPath),
      ]);
      if (whiteboxMetadata) images.push({
        id: `whitebox-triview-${visualTargetId}`,
        title: `${visualTargetId} · 白膜三视图`,
        group: "triview",
        sizeBytes: whiteboxMetadata.size,
        url: sceneAssetUrl(record.episodeId, `whitebox-triview-${visualTargetId}`),
      });
      if (styledMetadata) images.push({
        id: `styled-triview-${visualTargetId}`,
        title: `${visualTargetId} · 最终样式三视图`,
        group: "triview",
        sizeBytes: styledMetadata.size,
        url: artifactUrl(record.episodeId, styledRelativePath),
      });
    }
    const documentPaths = new Set([
      "planning/playthrough-plan.json",
      "whitebox/executed-playthrough-trace.json",
      "visual/episode-visual-prompts.json",
      "visual/episode-visual-manifest.json",
      "prompts/segment-00.json",
      "prompts/segment-01.json",
      "prompts/segment-02.json",
      "video/segment-00/provider-run.json",
      "video/segment-01/provider-run.json",
      "video/segment-02/provider-run.json",
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
    const bundleReady = record.status === "succeeded" && playbackComparisons.length === segmentCount &&
      playbackComparisons.every((comparison) => comparison.whiteboxVideo?.url && comparison.finalVideo?.url);
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

  async function prepareEpisodeBundle(record) {
    const episodeRoot = path.join(episodesRoot, record.episodeId);
    const sceneRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
    const visualManifest = await readJson(path.join(episodeRoot, "visual/episode-visual-manifest.json"));
    const playbackComparisons = await buildPlaybackComparisons(
      episodeRoot,
      record.episodeId,
      record.sceneId,
    );
    const executedTrace = await readJson(
      path.join(episodeRoot, "whitebox/executed-playthrough-trace.json"),
    );
    if (record.status !== "succeeded" || playbackComparisons.length !== segmentCount ||
        !playbackComparisons.every((comparison) => comparison.whiteboxVideo?.url && comparison.finalVideo?.url)) {
      throw new Error("Episode 尚未完成三段白膜与最终视频，暂不能打包。");
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
        ["planning/playthrough-plan.json", "planning/playthrough-plan.json", "planned-input-and-prompt-script", true],
        ["planning/reconnaissance/reconnaissance-report.json", "planning/reconnaissance-report.json", "runtime-reconnaissance", false],
        ["whitebox/episode-90s.mp4", "whitebox/episode-90s-1280x720-24fps.mp4", "complete-whitebox-video", true],
        ["whitebox/episode-raw.webm", "whitebox/episode-raw.webm", "original-browser-capture", false],
        ["whitebox/executed-playthrough-trace.json", "whitebox/executed-playthrough-trace.json", "raw-executed-input-trace", true],
        ["visual/episode-visual-prompts.json", "visual/episode-visual-prompts.json", "visual-reconstruction-prompts", true],
        ["visual/episode-visual-manifest.json", "visual/episode-visual-manifest.json", "visual-reconstruction-manifest", true],
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
      for (let index = 0; index < segmentCount; index += 1) {
        const segmentId = `segment-${String(index).padStart(2, "0")}`;
        const segmentRoot = `segments/${segmentId}`;
        const final1280 = path.join(episodeRoot, `video/${segmentId}/final-1280x720-24fps-720f.mp4`);
        const final480 = path.join(episodeRoot, `video/${segmentId}/final-854x480-24fps-720f.mp4`);
        const finalPath = await fileMetadata(final1280) ? final1280 : final480;
        for (const [sourcePath, destinationRelativePath, role, required] of [
          [path.join(episodeRoot, `whitebox/${segmentId}.mp4`), `${segmentRoot}/whitebox-1280x720-24fps-720f.mp4`, "segment-whitebox-video", true],
          [path.join(episodeRoot, `whitebox/${segmentId}-first-frame.png`), `${segmentRoot}/whitebox-first-frame.png`, "segment-whitebox-first-frame", true],
          [path.join(episodeRoot, `visual/${segmentId}-styled-opening-frame.png`), `${segmentRoot}/styled-opening-frame.png`, "segment-styled-opening-frame", true],
          [path.join(episodeRoot, `video/${segmentId}/mg-seedance-2.5-480p.mp4`), `${segmentRoot}/seedance-mg-480p.mp4`, "seedance-provider-video", false],
          [path.join(episodeRoot, `video/${segmentId}/cf-upscaled-720p.mp4`), `${segmentRoot}/seedance-cf-720p.mp4`, "seedance-upscaled-video", false],
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
          segmentDirectory: "segments/segment-00..02",
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
      } catch { return null; }
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
      } catch {}
    }
    const playbackComparisons = await buildPlaybackComparisons(episodeRoot, record.episodeId, record.sceneId);
    const reviewDownloads = await buildReviewDownloads(
      record,
      artifacts,
      playbackComparisons,
      visualManifest,
    );
    return {
      ...record,
      running: activeChildren.has(record.episodeId),
      artifacts,
      playbackComparisons,
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

  async function listRecords({ sceneId = null, requireFinalVideo = false, latestPerScene = false } = {}) {
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
          "video/segment-00/final-854x480-24fps-720f.mp4",
          "video/segment-01/final-854x480-24fps-720f.mp4",
          "video/segment-02/final-854x480-24fps-720f.mp4",
      ];
      const hasFinalVideo = (await Promise.all(finalCandidates.map(async (relativePath) => {
        try {
          const metadata = await stat(path.join(episodesRoot, entry.name, relativePath));
          return metadata.isFile() && metadata.size > 0;
        } catch { return false; }
      }))).some(Boolean);
      return hasFinalVideo ? record : null;
    }))).filter(Boolean);
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

  async function start(sceneId, backend = "cloud") {
    if (!idPattern.test(sceneId) || !["cloud", "local"].includes(backend)) {
      throw new Error("Invalid episode scene or backend.");
    }
    const existing = (await listForScene(sceneId)).find((record) => record.running);
    if (existing) return { episodeId: existing.episodeId, reused: true };
    const episodeId = `episode-${sceneId.slice(0, 70)}-${randomBytes(3).toString("hex")}`;
    const episodeRoot = path.join(episodesRoot, episodeId);
    await mkdir(episodeRoot, { recursive: true });
    return spawnEpisode(sceneId, episodeId, backend, false);
  }

  function spawnEpisode(sceneId, episodeId, backend, resumed) {
    const child = spawnImplementation("node", [
      "scripts/episodes/run-episode-workflow.mjs", "--scene-id", sceneId,
      "--episode-id", episodeId, "--origin", options.studioOrigin(), "--backend", backend,
    ], { cwd: repoRoot, env: process.env, stdio: "ignore", detached: false });
    activeChildren.set(episodeId, child);
    child.once("close", () => activeChildren.delete(episodeId));
    child.once("error", () => activeChildren.delete(episodeId));
    return { episodeId, reused: false, resumed };
  }

  async function resume(episodeId) {
    if (!idPattern.test(episodeId)) throw new Error("Invalid episode id.");
    if (activeChildren.has(episodeId)) return { episodeId, reused: true, resumed: true };
    const record = await readJson(path.join(episodesRoot, episodeId, "episode-record.json"));
    if (!record || record.episodeId !== episodeId || !idPattern.test(record.sceneId) ||
        !["cloud", "local"].includes(record.backend)) {
      throw new Error("Episode is not resumable.");
    }
    return spawnEpisode(record.sceneId, episodeId, record.backend, true);
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
      const result = await start(String(body.sceneId ?? ""), String(body.backend ?? "cloud"));
      sendJson(response, 202, result);
      return true;
    }
    const detail = /^\/api\/episode-workflows\/([a-z0-9-]+)$/.exec(url.pathname);
    if (request.method === "GET" && detail) {
      const record = await readJson(path.join(episodesRoot, detail[1], "episode-record.json"));
      if (!record) { sendJson(response, 404, { error: "Episode not found." }); return true; }
      sendJson(response, 200, { episode: await enrich(record) });
      return true;
    }
    const stop = /^\/api\/episode-workflows\/([a-z0-9-]+)\/stop$/.exec(url.pathname);
    if (request.method === "POST" && stop) {
      const child = activeChildren.get(stop[1]);
      if (child && !child.killed) child.kill("SIGTERM");
      sendJson(response, 202, { stopped: Boolean(child) });
      return true;
    }
    const resumeMatch = /^\/api\/episode-workflows\/([a-z0-9-]+)\/resume$/.exec(url.pathname);
    if (request.method === "POST" && resumeMatch) {
      sendJson(response, 202, await resume(resumeMatch[1]));
      return true;
    }
    const interactionTimelineMatch = /^\/api\/episode-workflows\/([a-z0-9-]+)\/interaction-timeline$/.exec(url.pathname);
    if (request.method === "GET" && interactionTimelineMatch) {
      const episodeId = interactionTimelineMatch[1];
      const record = await readJson(path.join(episodesRoot, episodeId, "episode-record.json"));
      if (!record || record.episodeId !== episodeId) {
        sendJson(response, 404, { error: "Episode not found." });
        return true;
      }
      const comparisons = await buildPlaybackComparisons(
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
      const record = await readJson(path.join(episodesRoot, episodeId, "episode-record.json"));
      if (!record || record.episodeId !== episodeId) {
        sendJson(response, 404, { error: "Episode not found." });
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
      const record = await readJson(path.join(episodesRoot, episodeId, "episode-record.json"));
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
        await serveRange(request, response, filePath, createReadStreamImplementation);
      } catch {
        sendJson(response, 404, { error: "Artifact not found." });
      }
      return true;
    }
    return false;
  }

  async function shutdown() {
    for (const child of activeChildren.values()) if (!child.killed) child.kill("SIGTERM");
    activeChildren.clear();
  }

  return { handleApi, listForScene, listAll, shutdown, get activeJobs() { return [...activeChildren.keys()]; } };
}
