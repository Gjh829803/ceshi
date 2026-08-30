import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEpisodeSeedancePrompt,
  EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION,
} from "./episode-seedance-prompt.mjs";

const prompt = buildEpisodeSeedancePrompt({
  sceneBrief: "## 场景\n开阔火星盆地。\n\n## 仅视觉层设想\n锈红沙地、桃色大气和暖色白昼。",
  motionRenderingGuidance: "Natural sandboard carving with knee flexion.",
  executedRelativeSeconds: 15.125,
  event: {
    beforeState: "天空平静。",
    transitionDescription: "巨型尘暴从两侧升起。",
    afterState: "空心尘暴覆盖中远景。",
    timing: { transitionDurationSeconds: 3.2, ending: "hold", endingDurationSeconds: 0 },
  },
});

test("uses the fixed user-approved Seedance template and only its fill locations", () => {
  assert.equal(
    EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION,
    "worldkit-reference-video-relaxed-action@1",
  );
  assert.match(prompt, /^参考素材职责：/);
  assert.match(prompt, /@视频1是本视频唯一且严格的运动、镜头和空间调度参考。/);
  assert.match(prompt, /@图片1是主角最终外观的唯一参考。/);
  assert.match(prompt, /@图片2是最终环境与灯光参考。/);
  assert.match(prompt, /最终画面：\n地点与空间：开阔火星盆地。/);
  assert.match(prompt, /时间线变化：本段第 15\.125 秒开始/);
  assert.match(prompt, /主动补充自然且清晰的蹬地加速/);
  assert.match(prompt, /不必照抄白膜中的僵硬肢体姿态/);
  assert.doesNotMatch(prompt, /不得增加新的主要动作/);
  assert.match(prompt, /35mm镜头，稳定第三人称轨道跟拍/);
  assert.doesNotMatch(prompt, /场景依据：|Seedance Prompt Event|最终动作细化要求|全局限制：|@图片3/);
  assert.ok(prompt.length < 3000);
});
