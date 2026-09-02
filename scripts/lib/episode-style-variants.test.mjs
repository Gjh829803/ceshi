import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createJsonAtomicWriter,
  episodeStyleVariantIds,
  validateEpisodeStyleVariantPlan,
  validateStyleVariantDiversityReview,
  validateStyleVariantVisualReview,
} from "./episode-style-variants.mjs";
import { validateStyleVariantDirectorOutput } from
  "../../.codex/skills/worldkit-style-variant-director/scripts/self-check.mjs";

const HASH = `sha256:${"a".repeat(64)}`;
const targetIds = ["player-subject", "primary-landmark"];

function plan() {
  return {
    kind: "worldkit-episode-style-variant-plan",
    schemaVersion: 1,
    sceneId: "scene-one",
    episodeId: "episode-one",
    sourceWhiteboxIdentity: {
      traceHash: HASH,
      qualityReportHash: HASH,
      segmentVideoHashes: Array.from({ length: 6 }, (_, index) => ({
        segmentId: `segment-0${index}`,
        contentHash: HASH,
      })),
    },
    variants: episodeStyleVariantIds().map((id, index) => ({
      id,
      name: `完整风格 ${index}`,
      styleFamily: `第 ${index} 套完全独立的造型、材质与光照体系`,
      worldIdentity: `第 ${index} 个独立环境世界身份、空间叙事、生态结构与建筑体系`,
      subjectIdentity: `第 ${index} 个独立主体身份、身体轮廓、服装体系、材质与主配色`,
      diversityRationale: `第 ${index} 个方案的主体、环境和主要标志物使用独立语义、轮廓、材质、配色及照明，因此隐藏标题后仍不会与其余九个方案混淆，并能在缩略图中立即识别。`,
      concept: `这是第 ${index} 个完全独立的世界概念，拥有清晰的地点、核心标志物、材料体系、照明逻辑和气氛变化，同时保持白膜世界的空间关系、镜头构图、可见裁切与运动区域。`.repeat(2),
      visualPrompt: `第 ${index} 个视觉提示。`.repeat(80),
      geminiEventPrompt: `第 ${index} 个 Gemini 事件提示，要求创作符合当前世界语义的大型可见变化，同时不改变空间结构、镜头、动作、路径和时序。`.repeat(20),
      negativeConstraints: "禁止移动镜头、改变裁切、缩窄路线、增加遮挡、交换主体、改变动作和复制其他风格。".repeat(10),
      targetInterpretations: targetIds.map((visualTargetId) => ({
        visualTargetId,
        finalIdentity: `${visualTargetId} 在当前世界中的完整独立身份`,
        appearance: "具有独立轮廓、连续材质、明确尺度、正反侧面一致细节和场景相关装饰，并在六个开场镜头中保持完全相同的身份、配色、材质语言与局部结构。",
      })),
    })),
  };
}

test("admits exactly ten standalone style variants bound to one whitebox", () => {
  const result = validateEpisodeStyleVariantPlan(plan(), {
    sceneId: "scene-one",
    episodeId: "episode-one",
    targetIds,
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
});

test("rejects duplicated style concepts", () => {
  const value = plan();
  value.variants[1].concept = value.variants[0].concept;
  const result = validateEpisodeStyleVariantPlan(value, {
    sceneId: "scene-one",
    episodeId: "episode-one",
    targetIds,
  });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) =>
    code === "STYLE_VARIANT_CONCEPTS_DUPLICATED"));
});

test("Director self-check catches a missing secondary target before delivery", () => {
  const value = plan();
  const input = {
    sceneId: value.sceneId,
    episodeId: value.episodeId,
    sourceWhiteboxIdentity: value.sourceWhiteboxIdentity,
    targets: targetIds.map((visualTargetId) => ({ visualTargetId })),
  };
  assert.deepEqual(validateStyleVariantDirectorOutput(input, value), []);
  value.variants[0].targetInterpretations.pop();
  assert.ok(validateStyleVariantDirectorOutput(input, value).some(({ code, path }) =>
    code === "TARGET_COUNT_INVALID" && path === "/variants/0/targetInterpretations"));
});

test("concurrent atomic writes never share a temporary path or corrupt JSON", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "worldkit-style-record-"));
  const output = path.join(root, "record.json");
  try {
    const write = createJsonAtomicWriter(output);
    await Promise.all(Array.from({ length: 40 }, (_, index) =>
      write({ index, payload: `variant-${index}`.repeat(100) })));
    const value = JSON.parse(await readFile(output, "utf8"));
    assert.equal(value.index, 39);
    assert.equal(value.payload, `variant-${value.index}`.repeat(100));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires an independent Codex review bound to exact image hashes", () => {
  const inputIdentity = {
    styleVariantHash: HASH,
    openingFrameHashes: Array.from({ length: 6 }, (_, index) => ({
      segmentId: `segment-0${index}`,
      whiteboxHash: HASH,
      styledHash: HASH,
    })),
    triviewHashes: targetIds.map((visualTargetId) => ({
      visualTargetId,
      whiteboxHash: HASH,
      styledHash: HASH,
    })),
  };
  const review = {
    kind: "worldkit-style-variant-visual-review",
    schemaVersion: 1,
    reviewer: "lwdp-codex",
    sceneId: "scene-one",
    episodeId: "episode-one",
    styleVariantId: "style-00",
    inputIdentity,
    verdict: "passed",
    summary: "六张首帧和全部三视图在语义构图、目标方向、裁切与空间关系上均保持一致，主体位置、标志物占位和可通行空间也没有发生变化。",
    repairInstructions: "",
    openingFrameReviews: Array.from({ length: 6 }, (_, index) => ({
      segmentId: `segment-0${index}`,
      verdict: "passed",
      observations: "相机、主体、标志物占位、前后景关系和可通行空间均与对应白膜一致。",
    })),
    triviewReviews: targetIds.map((visualTargetId) => ({
      visualTargetId,
      verdict: "passed",
      observations: "Front、Right、Back 顺序正确，尺度和基线一致，身份与样式化首帧一致。",
    })),
  };
  const result = validateStyleVariantVisualReview(review, {
    sceneId: "scene-one",
    episodeId: "episode-one",
    styleVariantId: "style-00",
    targetIds,
    inputIdentity,
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  review.inputIdentity = { ...inputIdentity, styleVariantHash: `sha256:${"b".repeat(64)}` };
  assert.equal(validateStyleVariantVisualReview(review, {
    sceneId: "scene-one",
    episodeId: "episode-one",
    styleVariantId: "style-00",
    targetIds,
    inputIdentity,
  }).ok, false);
});

test("requires a joint Codex diversity review bound to all ten visual sets", () => {
  const inputIdentity = {
    kind: "worldkit-style-variant-diversity-review-input",
    schemaVersion: 1,
    sceneId: "scene-one",
    episodeId: "episode-one",
    planHash: HASH,
    variants: episodeStyleVariantIds().map((styleVariantId) => ({
      styleVariantId,
      styleVariantHash: HASH,
      visualManifestHash: HASH,
      primaryOpeningHash: HASH,
      targetTriviewHashes: targetIds.map((visualTargetId) => ({
        visualTargetId,
        contentHash: HASH,
      })),
    })),
  };
  const review = {
    kind: "worldkit-style-variant-diversity-review",
    schemaVersion: 1,
    reviewer: "lwdp-codex",
    sceneId: "scene-one",
    episodeId: "episode-one",
    inputIdentity,
    verdict: "passed",
    summary: "十个方案在主体轮廓、环境世界观、主要标志物身份、材质与照明上均可在隐藏标题后清晰区分，同时每个方案内部保持统一视觉语言。",
    repairInstructions: "",
    dimensionReviews: [
      "spatial-registration", "subjects", "environments", "landmarks", "overall-read",
    ]
      .map((dimension) => ({
        dimension,
        verdict: "passed",
        observations: "十张图在这个维度上使用清楚且互不混淆的视觉身份，并且实际图像支持方案文本中的差异。",
      })),
    variantReviews: episodeStyleVariantIds().map((styleVariantId) => ({
      styleVariantId,
      verdict: "passed",
      confusableWith: [],
      observations: "该方案的主体、环境和标志物形成独特组合，在隐藏标题的缩略图状态下也不会被误认为其他方案，图像证据清晰可见。",
      repairInstructions: "",
    })),
  };
  const result = validateStyleVariantDiversityReview(review, {
    sceneId: "scene-one",
    episodeId: "episode-one",
    inputIdentity,
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  review.inputIdentity = { ...inputIdentity, planHash: `sha256:${"b".repeat(64)}` };
  assert.equal(validateStyleVariantDiversityReview(review, {
    sceneId: "scene-one",
    episodeId: "episode-one",
    inputIdentity,
  }).ok, false);
});

test("style visual generation exposes no original styled reference or Scene prose", async () => {
  const runner = await readFile(
    path.resolve("scripts/agents/run-lwdp-style-variant-visual-agent.sh"),
    "utf8",
  );
  assert.equal(runner.includes("source-reference"), false);
  assert.equal(runner.includes("reference-0"), false);
  assert.equal(runner.includes("scene-brief.md"), false);
  assert.match(runner, /segment-00-whitebox/);
  assert.match(runner, /whitebox-triview-/);
});
