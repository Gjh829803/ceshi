#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  executionSegmentStartSeconds,
  PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES,
  renderSeedancePromptEvent,
  sha256Canonical,
  validateVisualEventPlan,
  writeJsonAtomic,
} from "../lib/playthrough-dataset.mjs";
import { validatePlaythroughPlanStructure } from "../lib/playthrough-plan-structure.mjs";
import {
  buildEpisodeSeedancePrompt,
  EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION,
} from "../lib/episode-seedance-prompt.mjs";

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}.`);
  return args[index + 1];
};

const sceneId = value("--scene-id");
const episodeId = value("--episode-id");
const sceneRoot = path.resolve(value("--scene-root"));
const episodeRoot = path.resolve(value("--episode-root"));
const variant = value("--variant");
if (!["legacy-heavy", "relaxed-action"].includes(variant)) {
  throw new Error(`Unsupported Prompt A/B variant: ${variant}`);
}

const [plan, eventPlan, sceneBrief, manifest, trace, pipeline] = await Promise.all([
  readFile(path.join(episodeRoot, "planning/playthrough-plan.json"), "utf8").then(JSON.parse),
  readFile(path.join(episodeRoot, "prompts/visual-events.json"), "utf8").then(JSON.parse),
  readFile(path.join(sceneRoot, "scene-brief.md"), "utf8"),
  readFile(path.join(episodeRoot, "visual/episode-visual-manifest.json"), "utf8").then(JSON.parse),
  readFile(path.join(episodeRoot, "whitebox/executed-playthrough-trace.json"), "utf8").then(JSON.parse),
  readFile(path.resolve("config/episode-video-pipeline.json"), "utf8").then(JSON.parse),
]);
const validation = validatePlaythroughPlanStructure(plan, { sceneId });
if (!validation.ok) throw new Error(`Invalid Playthrough Plan: ${JSON.stringify(validation.diagnostics)}`);
const eventValidation = validateVisualEventPlan(eventPlan, { sceneId, episodeId });
if (!eventValidation.ok) throw new Error(`Invalid Gemini Visual Event Plan: ${JSON.stringify(eventValidation.diagnostics)}`);
const styledTriviews = (manifest.targets ?? []).map((target) =>
  target?.styledTriview?.path);
if (styledTriviews.length < 1 ||
    styledTriviews.some((relativePath) => typeof relativePath !== "string" || !relativePath)) {
  throw new Error("Complete-target styled tri-views are missing.");
}
const markers = new Map((trace.events ?? [])
  .filter((event) => event.kind === "prompt-marker")
  .map((event) => [event.id, event]));
const model = String(pipeline.seedance?.model ?? "");
const delivery = pipeline.delivery ?? {};
const finalName = `final-${delivery.width}x${delivery.height}-${delivery.fps}fps-${delivery.frameCount}f.mp4`;

for (const index of PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES) {
  const segmentId = `segment-0${index}`;
  const segmentEvents = eventPlan.events.filter((event) =>
    event.segmentId === segmentId);
  const expectedEventCount = index === 4 ? 1 : 2;
  if (segmentEvents.length !== expectedEventCount) {
    throw new Error(`Exactly ${expectedEventCount} Prompt Events are required for ${segmentId}.`);
  }
  const executedEvents = segmentEvents.map((event) => {
    const marker = markers.get(event.id);
    if (!marker || !Number.isFinite(marker.actualSeconds)) {
      throw new Error(`Executed Prompt marker missing: ${event.id}`);
    }
    return {
      ...event,
      globalSeconds: marker.actualSeconds,
      segmentRelativeSeconds: marker.actualSeconds - executionSegmentStartSeconds(index),
    };
  });
  const canonicalEvents = executedEvents.map(renderSeedancePromptEvent);
  const styledFrame = manifest.segmentOpeningFrames.find((item) =>
    item.segmentId === segmentId)?.path;
  if (styledFrame !== `visual/${segmentId}-styled-opening-frame.png`) {
    throw new Error(`Styled opening frame missing for ${segmentId}.`);
  }
  const legacyPrompt = `你是 Seedance 2.5 的参考视频编辑执行器。生成一条完整 30 秒、16:9 的最终视频。

参考素材职责：
@视频1是本段唯一且严格的运动、镜头、时序和空间调度参考。逐帧保持其中的相机路径、镜头速度、起止构图、受控主体位置、移动方向、动作时序、关键姿态、遮挡关系和最终落点。@视频1中的白膜材质、语义颜色、低模表面、网格、辅助线、文字和界面都不得出现在最终视频。

@图片1是主角最终外观的唯一参考，只约束主角身份、完整结构、材质和细节；不得改变@视频1规定的主角动作、位置、方向和时间节奏。
@图片2是本段第 0 帧最终环境、主体基础外观、材质、色调、光照和开场构图权威。首帧必须与@图片2一致，不能提前出现下面的 Prompt Event；空间布局、相机路径和遮挡关系仍以@视频1为准。

场景依据：
${sceneBrief.trim().slice(0, 5000)}

动作与摄影：
严格保持@视频1的连续第三人称玩家操作和镜头，不增加切镜、反打、旋转、额外推拉、传送或新的主要动作。动作具有自然重量、惯性、重心转换和真实接触感。滑板滑行时允许补充轻微蹬地、屈膝、压板与自然转弯，但不得改变@视频1的主体根轨迹、速度、方向、起跳落点或镜头。

本段 ${segmentEvents.length} 个 Seedance Prompt Event（必须分别按时渲染，不能省略、提前或改写）：
${canonicalEvents.map((eventPrompt, eventIndex) =>
    `事件 ${eventIndex + 1}：\n${eventPrompt}`).join("\n\n")}

声音：
生成与玩家动作、环境和 Prompt Event 同步的真实音效。严禁音乐、配乐、歌曲、对白、旁白、解说、人声或语音。

全局限制：
主体身份和数量全程一致；无角色交换、无额外人物、无新增或删除持久物体、无空间结构变化、无碰撞/路线改变、无肢体融合、穿模、漂移、闪烁、材质无故跳变、白膜残留、文字、字幕、Logo、水印、时间码或界面元素。`;
  const prompt = variant === "legacy-heavy"
    ? legacyPrompt
    : buildEpisodeSeedancePrompt({
        sceneBrief,
        motionRenderingGuidance: plan.motionRenderingGuidance,
        events: executedEvents,
        visualReferenceLines: (manifest.targets ?? []).map((target) =>
          `${target.visualTargetId} 完整三视图`),
      });

  const promptPath = path.join(episodeRoot, "prompt-ab", variant, `${segmentId}.json`);
  await writeJsonAtomic(promptPath, {
    kind: "worldkit-episode-seedance-prompt-ab",
    schemaVersion: 1,
    sceneId,
    episodeId,
    segmentId,
    variant,
    promptTemplateVersion: variant === "relaxed-action"
      ? EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION
      : "legacy-heavy@1",
    planHash: sha256Canonical(plan),
    eventIds: executedEvents.map((event) => event.id),
    executedEventSeconds: executedEvents.map((event) => event.globalSeconds),
    prompt,
  });
  const variantRoot = path.join(episodeRoot, "video-ab", variant, segmentId);
  await writeJsonAtomic(path.join(variantRoot, "request.json"), {
    kind: "worldkit-episode-video-segment-request",
    schemaVersion: 2,
    sceneId,
    episodeId,
    segmentId,
    promptPath,
    referenceVideoPath: path.join(episodeRoot, "whitebox", `${segmentId}.mp4`),
    referenceImagePaths: [
      path.join(episodeRoot, styledFrame),
      ...styledTriviews.map((relativePath) => path.join(episodeRoot, relativePath)),
    ],
    rawProviderOutputPath: path.join(variantRoot, `${model}.mp4`),
    outputPath: path.join(variantRoot, finalName),
  });
}

process.stdout.write(`WORLDKIT_EPISODE_PROMPT_AB_READY variant=${variant} segments=3\n`);
