import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PLAYTHROUGH_HOST_EVENT_SLOTS,
  VISUAL_EVENT_ACTION_INDEPENDENCE,
  validateVisualEventPlan,
} from "../lib/playthrough-dataset.mjs";

function rawEvent(index) {
  const classes = [
    "subject-transformation",
    "environment-transformation",
    "atmospheric-spectacle",
    "ability-manifestation",
  ];
  const scopes = [
    "subject-dominant",
    "environment-dominant",
    "sky-dominant",
    "subject-dominant",
  ];
  return {
    targetNames: [`第${index + 1}段完整场景标志物`],
    eventClass: classes[index % classes.length],
    magnitude: "large-scale",
    frameImpact: { scope: scopes[index % scopes.length], coverage: "large", contrast: "dramatic" },
    dominantChange: "图片中独有的完整标志物与周围环境发生大范围、具有清晰材质传播方向和强烈前后反差的场景专属变化，变化沿既有地貌连续展开，前景、中景和远景形成统一、易于理解并具有电影感的视觉结果，同时完整保持原有空间结构与主体身份。",
    targetContext: "完整目标清晰存在于最终样式首帧中，并与周围地形、建筑和光照建立独特关系。",
    beforeState: "事件开始前严格保持最终样式首帧中已经锁定的主体身份、环境材质、空间层次和光照状态。",
    transitionDescription: "变化从完整标志物的既有表面连续开始，沿与场景结构一致的方向扩展到周围环境，材质、光线和体积层次逐步增强，并保持全部遮挡关系。",
    afterState: "变化完成后形成覆盖画面大范围区域的稳定结果，原有主体、标志物、空间结构和实体数量仍清晰可辨。",
    spatialContinuity: "保持地形、道路、建筑、主体、相机、前中后景遮挡、碰撞、可通行区域和完整空间拓扑完全不变。",
    audioDescription: "只加入与视觉传播过程同步的环境声和材质响应声，不加入音乐或任何人类语音。",
    negativeConstraints: "不得新增删除或替换人物、建筑和持久物体，不得改变结构、镜头、路径、碰撞，不得出现文字、界面、Logo、水印或抽象通用特效。",
    timing: { transitionDurationSeconds: 2.5, ending: "hold", endingDurationSeconds: 0 },
  };
}

test("Gemini Event Director smoke exposes the locked model and prompt policy", () => {
  const result = spawnSync("python3", [
    "scripts/episodes/run-gemini-visual-event-director.py",
    "--smoke",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    model: "gemini-3.5-flash",
    prompt_sha256: JSON.parse(result.stdout).prompt_sha256,
    styled_frame_count: 3,
    whitebox_video_count: 3,
    video_sampling_fps: 0.25,
    event_count: 5,
    event_distribution: [2, 2, 1],
    single_model_call: true,
    event_field_extension: false,
    action_independent: true,
  });
});

test("Gemini Event Director ignores external credential and model overrides", () => {
  const result = spawnSync("python3", [
    "scripts/episodes/run-gemini-visual-event-director.py",
    "--runtime-config-smoke",
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      GOOGLE_APPLICATION_CREDENTIALS: "/tmp/external-google.json",
      GCLOUD_PROJECT_ID: "external-project",
      WORLDKIT_GEMINI_EVENT_MODEL: "external-model",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.project_local_only, true);
  assert.equal(
    output.credential_file,
    ".codex-tmp/runtime-config/google-service-account.json",
  );
  assert.equal(output.model, "gemini-3.5-flash");
});

test("workflow keeps gameplay planning separate and directs Segment video plus styled frame before Seedance prompts", async () => {
  const [workflow, launcher, skill, contract, director, promptTemplate] = await Promise.all([
    readFile("scripts/episodes/run-episode-workflow.mjs", "utf8"),
    readFile("scripts/agents/run-lwdp-playthrough-planner-agent.sh", "utf8"),
    readFile(".codex/skills/worldkit-playthrough-planner/SKILL.md", "utf8"),
    readFile(".codex/skills/worldkit-playthrough-planner/references/contract.md", "utf8"),
    readFile("scripts/episodes/run-gemini-visual-event-director.py", "utf8"),
    readFile("config/prompts/episode-visual-event-director.zh-CN.md", "utf8"),
  ]);
  const visualReconstruction = workflow.indexOf("await stage(\"visual-reconstruction\"");
  const visualEvents = workflow.indexOf("await stage(\"visual-events\"");
  const seedancePrompts = workflow.indexOf("await stage(\"seedance-prompts\"");
  assert.ok(visualReconstruction >= 0);
  assert.ok(visualReconstruction < visualEvents);
  assert.ok(visualEvents < seedancePrompts);
  assert.match(workflow, /run-gemini-visual-event-director\.py/);
  assert.match(workflow, /visualEventPlanIsCurrent/);
  assert.match(launcher, /Do not write seedancePromptEvents or propose visual events/);
  assert.match(launcher, /six independent 30-second wander captures/);
  assert.match(launcher, /captures 00, 02 and 04/);
  assert.match(skill, /six independent 30-second player captures/i);
  assert.match(skill, /no required 180–360 degree orbit/);
  assert.match(contract, /exactly six entries in Segment order/);
  assert.doesNotMatch(contract, /seedancePromptEvents\?:/);
  assert.match(director, /mime_type="video\/mp4"/);
  assert.match(director, /VideoMetadata\(fps=video_sampling_fps\)/);
  assert.doesNotMatch(director, /ThreadPoolExecutor/);
  assert.match(director, /\[0, 2, 4\]/);
  assert.match(promptTemplate, /@视频1 \+ @图片1/);
  assert.match(promptTemplate, /0\.25fps/);
  assert.match(promptTemplate, /恰好五个 `events`/);
  assert.match(promptTemplate, /五条中恰好一条必须是“全场景视觉重构/);
  assert.match(promptTemplate, /同一张地图的整体换肤/);
  assert.match(promptTemplate, /地形高度与轮廓、空间拓扑、道路和地面可通行区域/);
  assert.match(promptTemplate, /这个例子只说明变化的范围和强度/);
  assert.match(promptTemplate, /其余四条继续自由设计不同类型的大型变化/);
});

test("Host finalizer binds Gemini content to executed slots without action coupling", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-gemini-events-"));
  try {
    const rawPath = path.join(root, "raw.json");
    const tracePath = path.join(root, "trace.json");
    const outputPath = path.join(root, "visual-events.json");
    await writeFile(rawPath, JSON.stringify({
      events: PLAYTHROUGH_HOST_EVENT_SLOTS.map((_, index) => rawEvent(index)),
    }));
    await writeFile(tracePath, JSON.stringify({
      events: PLAYTHROUGH_HOST_EVENT_SLOTS.map((slot) => ({
        id: slot.id,
        kind: "prompt-marker",
        segmentId: slot.segmentId,
        actualSeconds: slot.globalSeconds,
      })),
    }));
    const result = spawnSync("node", [
      "scripts/episodes/finalize-gemini-visual-events.mjs",
      "--scene-id", "scene-test",
      "--episode-id", "episode-scene-test",
      "--model", "gemini-3.5-flash",
      "--input", rawPath,
      "--trace", tracePath,
      "--output", outputPath,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(await readFile(outputPath, "utf8"));
    const validation = validateVisualEventPlan(output, {
      sceneId: "scene-test",
      episodeId: "episode-scene-test",
    });
    assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
    assert.equal(output.events.length, 5);
    assert.deepEqual(
      output.events.map(({ segmentId, segmentRelativeSeconds }) =>
        [segmentId, segmentRelativeSeconds]),
      PLAYTHROUGH_HOST_EVENT_SLOTS.map(({ segmentId, segmentRelativeSeconds }) =>
        [segmentId, segmentRelativeSeconds]),
    );
    assert.ok(output.events.every((event) =>
      event.actionCoupling === VISUAL_EVENT_ACTION_INDEPENDENCE &&
      event.eventPrompt.includes("动作与镜头：事件按 Host 给定时间独立发生")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Host finalizer allows visual transformation wording without treating turn or land nouns as gameplay", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-gemini-events-wording-"));
  try {
    const rawPath = path.join(root, "raw.json");
    const tracePath = path.join(root, "trace.json");
    const outputPath = path.join(root, "visual-events.json");
    const events = PLAYTHROUGH_HOST_EVENT_SLOTS.map((_, index) => rawEvent(index));
    events[4].dominantChange = "The paper moon palace turns into translucent moonstone while the surrounding land remains structurally unchanged.";
    events[4].negativeConstraints = "Do not alter the character's walking, turning, landing, camera path, or key presses.";
    events[3].audioDescription = "远处碎屑落地时产生低沉回响，声音来自画面中的环境变化。";
    await writeFile(rawPath, JSON.stringify({ events }));
    await writeFile(tracePath, JSON.stringify({
      events: PLAYTHROUGH_HOST_EVENT_SLOTS.map((slot) => ({
        id: slot.id,
        kind: "prompt-marker",
        segmentId: slot.segmentId,
        actualSeconds: slot.globalSeconds,
      })),
    }));
    const result = spawnSync("node", [
      "scripts/episodes/finalize-gemini-visual-events.mjs",
      "--scene-id", "scene-test",
      "--episode-id", "episode-scene-test",
      "--model", "gemini-3.5-flash",
      "--input", rawPath,
      "--trace", tracePath,
      "--output", outputPath,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
