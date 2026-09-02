import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createJsonAtomicWriter,
  episodeStyleVariantIds,
  validateEpisodeStyleVariantPlan,
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
