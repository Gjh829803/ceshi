import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEpisodeSeedancePrompt,
  EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION,
} from "./episode-seedance-prompt.mjs";

const prompt = buildEpisodeSeedancePrompt({
  sceneBrief: "## 场景\n开阔火星盆地。\n\n## 仅视觉层设想\n锈红沙地、桃色大气和暖色白昼。",
  motionRenderingGuidance: "Natural sandboard carving with knee flexion.",
  segmentVisualPrompt: "当前段只看见开阔盆地与左右裁切岩脊；环形山门完全不在镜头内，不得出现。",
  visualReferenceLines: [
    "主角（primary-subject）完整三视图",
    "环形山门（primary-landmark）完整三视图",
  ],
  events: [{
    segmentRelativeSeconds: 8.125,
    beforeState: "天空平静。",
    transitionDescription: "巨型尘暴从两侧升起。",
    afterState: "空心尘暴覆盖中远景。",
    timing: { transitionDurationSeconds: 3.2, ending: "hold", endingDurationSeconds: 0 },
    eventPrompt: "事件时间：本段第 8.125 秒独立开始。\n主导变化：火星盆地中独有的环形山壁被大范围红色尘暴连续吞没。\n动作与镜头：事件与所有角色动作完全独立。",
  }, {
    segmentRelativeSeconds: 20.125,
    beforeState: "红色尘暴已经稳定覆盖环形山壁。",
    transitionDescription: "尘暴内部连续出现大范围蓝白闪电并照亮整个盆地。",
    afterState: "蓝白闪电持续照亮尘暴与远处山壁。",
    timing: { transitionDurationSeconds: 2.8, ending: "hold", endingDurationSeconds: 0 },
    eventPrompt: "事件时间：本段第 20.125 秒独立开始。\n主导变化：红色尘暴内部爆发覆盖盆地的大范围蓝白闪电。\n动作与镜头：事件与所有角色动作完全独立。",
  }],
});

test("uses the fixed user-approved Seedance template and only its fill locations", () => {
  assert.equal(
    EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION,
    "worldkit-reference-video-six-capture@6",
  );
  assert.match(prompt, /^参考素材职责：/);
  assert.match(prompt, /@视频1是本视频唯一且严格的运动、镜头和空间调度参考。/);
  assert.match(prompt, /@图片1是当前镜头最终主体、环境、材质、灯光、色彩和艺术风格的基准。/);
  assert.match(prompt, /@图片2：主角（primary-subject）完整三视图/);
  assert.match(prompt, /@图片3：环形山门（primary-landmark）完整三视图/);
  assert.match(prompt, /三视图是条件式外观字典，不是场景清单/);
  assert.match(prompt, /如果@图片1看到的是背包、\n后脑和背部/);
  assert.match(prompt, /只能把主体三视图的 Back 面板用于当前可见侧/);
  assert.match(prompt, /环形山门完全不在镜头内，不得出现/);
  assert.doesNotMatch(prompt, /参考画面中必须保留的可见构图证据/);
  assert.match(prompt, /最终画面：\n当前片段可见性与构图白名单（最高优先级）：/);
  assert.match(prompt, /地点与空间：开阔火星盆地。/);
  assert.match(prompt, /时间线变化（2 个独立大型视觉事件，严格按各自时间执行）：/);
  assert.match(prompt, /事件 1：/);
  assert.match(prompt, /事件 2：/);
  assert.match(prompt, /火星盆地中独有的环形山壁被大范围红色尘暴连续吞没/);
  assert.match(prompt, /红色尘暴内部爆发覆盖盆地的大范围蓝白闪电/);
  assert.match(prompt, /主动补充自然且清晰的蹬地加速/);
  assert.match(prompt, /不必照抄白膜中的僵硬肢体姿态/);
  assert.doesNotMatch(prompt, /不得增加新的主要动作/);
  assert.match(prompt, /35mm镜头，稳定第三人称轨道跟拍/);
  assert.doesNotMatch(prompt, /场景依据：|Seedance Prompt Event|最终动作细化要求|全局限制：/);
  assert.ok(prompt.length > 1700);
  assert.ok(prompt.length < 12000);
});

test("builds a full Seedance prompt without inventing an event for non-event captures", () => {
  const withoutEvents = buildEpisodeSeedancePrompt({
    sceneBrief: "## 场景\n开阔火星盆地。\n\n## 仅视觉层设想\n锈红沙地、桃色大气和暖色白昼。",
    motionRenderingGuidance: "Natural walking and running.",
    segmentVisualPrompt: "主体背对镜头沿开阔沙地向前移动。",
    visualReferenceLines: ["主角（primary-subject）完整三视图"],
    events: [],
  });
  assert.match(withoutEvents, /本段没有 Prompt Event/);
  assert.match(withoutEvents, /不得自行增加变身、技能、环境突变或大型视觉事件/);
  assert.doesNotMatch(withoutEvents, /事件 1：/);
  assert.match(withoutEvents, /@视频1是本视频唯一且严格的运动、镜头和空间调度参考/);
});
