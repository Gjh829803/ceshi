#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  renderSeedancePromptEvent,
  sha256Canonical,
  validatePlaythroughPlan,
  writeJsonAtomic,
} from "../lib/playthrough-dataset.mjs";
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

const [plan, sceneBrief, manifest, trace, pipeline] = await Promise.all([
  readFile(path.join(episodeRoot, "planning/playthrough-plan.json"), "utf8").then(JSON.parse),
  readFile(path.join(sceneRoot, "scene-brief.md"), "utf8"),
  readFile(path.join(episodeRoot, "visual/episode-visual-manifest.json"), "utf8").then(JSON.parse),
  readFile(path.join(episodeRoot, "whitebox/executed-playthrough-trace.json"), "utf8").then(JSON.parse),
  readFile(path.resolve("config/episode-video-pipeline.json"), "utf8").then(JSON.parse),
]);
const validation = validatePlaythroughPlan(plan, { sceneId });
if (!validation.ok) throw new Error(`Invalid Playthrough Plan: ${JSON.stringify(validation.diagnostics)}`);
const subjectTriview = manifest.targets?.[0]?.styledTriview?.path;
if (typeof subjectTriview !== "string" || !subjectTriview) {
  throw new Error("Primary Subject styled tri-view is missing.");
}
const markers = new Map((trace.events ?? [])
  .filter((event) => event.kind === "prompt-marker")
  .map((event) => [event.id, event]));
const model = String(pipeline.seedance?.model ?? "");
const delivery = pipeline.delivery ?? {};
const finalName = `final-${delivery.width}x${delivery.height}-${delivery.fps}fps-${delivery.frameCount}f.mp4`;

for (let index = 0; index < 3; index += 1) {
  const segmentId = `segment-0${index}`;
  const event = plan.seedancePromptEvents[index];
  const marker = markers.get(event.id);
  if (!marker || !Number.isFinite(marker.actualSeconds)) {
    throw new Error(`Executed Prompt marker missing: ${event.id}`);
  }
  const executedEvent = {
    ...event,
    globalSeconds: marker.actualSeconds,
    segmentRelativeSeconds: marker.actualSeconds - index * 30,
  };
  const canonicalEvent = renderSeedancePromptEvent(executedEvent);
  const styledFrame = manifest.segmentOpeningFrames[index]?.path;
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

Seedance Prompt Event（必须按时渲染，不能省略、提前或改写）：
${canonicalEvent}

声音：
生成与玩家动作、环境和 Prompt Event 同步的真实音效。严禁音乐、配乐、歌曲、对白、旁白、解说、人声或语音。

全局限制：
主体身份和数量全程一致；无角色交换、无额外人物、无新增或删除持久物体、无空间结构变化、无碰撞/路线改变、无肢体融合、穿模、漂移、闪烁、材质无故跳变、白膜残留、文字、字幕、Logo、水印、时间码或界面元素。`;
  const prompt = variant === "legacy-heavy"
    ? legacyPrompt
    : buildEpisodeSeedancePrompt({
        sceneBrief,
        motionRenderingGuidance: plan.motionRenderingGuidance,
        event: executedEvent,
        executedRelativeSeconds: executedEvent.segmentRelativeSeconds,
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
    eventId: event.id,
    executedEventSeconds: marker.actualSeconds,
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
      path.join(episodeRoot, subjectTriview),
      path.join(episodeRoot, styledFrame),
    ],
    rawProviderOutputPath: path.join(variantRoot, `${model}.mp4`),
    rawUpscaleOutputPath: path.join(variantRoot, "cf-upscaled-720p.mp4"),
    outputPath: path.join(variantRoot, finalName),
  });
}

process.stdout.write(`WORLDKIT_EPISODE_PROMPT_AB_READY variant=${variant} segments=3\n`);
