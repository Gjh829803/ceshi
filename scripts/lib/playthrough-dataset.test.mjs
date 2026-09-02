import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYTHROUGH_DELIVERY_DURATION_SECONDS,
  PLAYTHROUGH_EVENT_COUNT,
  PLAYTHROUGH_EVENT_SEGMENT_INDICES,
  PLAYTHROUGH_FRAME_COUNT,
  PLAYTHROUGH_HOST_EVENT_SLOTS,
  PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES,
  PLAYTHROUGH_SEGMENT_COUNT,
  VISUAL_EVENT_ACTION_INDEPENDENCE,
  buildPlaythroughFrameTelemetry,
  deliveryFrameExecutionTimeSeconds,
  renderSeedancePromptEvent,
  validatePlaythroughFrameTelemetry,
  validateVisualEventPlan,
} from "./playthrough-dataset.mjs";

test("locks six independent captures, sends all to Seedance, and selects three for events", () => {
  assert.equal(PLAYTHROUGH_SEGMENT_COUNT, 6);
  assert.equal(PLAYTHROUGH_DELIVERY_DURATION_SECONDS, 180);
  assert.equal(PLAYTHROUGH_FRAME_COUNT, 4320);
  assert.deepEqual([...PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES], [0, 1, 2, 3, 4, 5]);
  assert.deepEqual([...PLAYTHROUGH_EVENT_SEGMENT_INDICES], [0, 2, 4]);
  assert.equal(PLAYTHROUGH_EVENT_COUNT, 5);
  assert.equal(deliveryFrameExecutionTimeSeconds(0), 0);
  assert.equal(deliveryFrameExecutionTimeSeconds(719), 719 / 24);
  assert.equal(deliveryFrameExecutionTimeSeconds(720), 30);
  assert.equal(deliveryFrameExecutionTimeSeconds(4319), 4319 / 24);
});

function runtimeSample(actualSeconds) {
  return {
    actualSeconds,
    simulationTick: Math.round(actualSeconds * 60),
    worldSessionId: "world-session",
    activeKeys: actualSeconds % 10 < 8 ? ["W"] : [],
    subject: {
      entityId: "player",
      positionMetersXYZ: [actualSeconds, 1, 0],
      rotationQuaternionXYZW: [0, 0, 0, 1],
      velocityMetersPerSecondXYZ: [1, 0, 0],
    },
    camera: {
      id: "camera-main",
      targetEntityId: "player",
      activeCameraProfileRef: "third-person.standard@1",
      activeCameraRigRef: "orbit.medium@1",
      positionMetersXYZ: [actualSeconds, 3, 6],
      targetPositionMetersXYZ: [actualSeconds, 1, 0],
      verticalFovDegrees: 56,
      nearClipMeters: 0.05,
      farClipMeters: 10_000,
    },
  };
}

test("builds exact 180-second frame telemetry without reset gaps or synthetic frames", () => {
  const samples = Array.from({ length: 181 }, (_, second) => runtimeSample(second));
  const telemetry = buildPlaythroughFrameTelemetry(samples);
  const result = validatePlaythroughFrameTelemetry(telemetry);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(telemetry.samples.length, 4320);
  assert.equal(telemetry.samples[720].executionTimeSeconds, 30);
  assert.equal(telemetry.samples[2160].executionTimeSeconds, 90);
});

function eventForSlot(slot, index) {
  const event = {
    id: slot.id,
    windowIndex: index,
    segmentId: slot.segmentId,
    globalSeconds: slot.globalSeconds,
    segmentRelativeSeconds: slot.segmentRelativeSeconds,
    targetNames: [`场景完整目标 ${index + 1}`],
    eventClass: index % 2 === 0 ? "environment-transformation" : "subject-transformation",
    magnitude: "large-scale",
    frameImpact: {
      scope: index % 2 === 0 ? "environment-dominant" : "subject-dominant",
      coverage: "large",
      contrast: "dramatic",
    },
    dominantChange: "结合当前场景独有地貌、材质和标志物形成大范围、清晰、连续而且具有强烈前后反差的视觉变化，并让前景、中景和远景都出现一致且容易理解的电影级结果；变化必须只属于当前场景，不能替换成任何通用特效。",
    targetContext: "目标来自当前样式首帧并与周围地形、建筑、材质和主光建立明确关系。",
    beforeState: "变化前完整保持样式首帧中的主体身份、环境外观、空间层级、遮挡和灯光。",
    transitionDescription: "变化沿当前场景真实表面和空间关系逐步传播，形成清楚的起因、过程与完成状态，同时不改变任何已有结构和运动。",
    afterState: "变化完成后成为覆盖画面大范围区域的稳定结果，主体、标志物和场景拓扑仍然清楚可辨。",
    actionCoupling: VISUAL_EVENT_ACTION_INDEPENDENCE,
    spatialContinuity: "完整保持视频中的地形、建筑、道路、角色根轨迹、镜头路径、时序、速度、遮挡和可通行空间，不移动任何已有实体。",
    audioDescription: "只加入与材质变化和环境传播同步的真实声响，不加入音乐、对白或旁白。",
    negativeConstraints: "不得新增删除人物或持久物体，不改变场景结构、主体身份、镜头、路径、速度、碰撞，也不得出现文字、Logo、水印或界面。",
    timing: {
      transitionDurationSeconds: 2.5,
      ending: "hold",
      endingDurationSeconds: 0,
    },
  };
  return { ...event, eventPrompt: renderSeedancePromptEvent(event) };
}

test("admits exactly five scene events distributed 2/2/1 over selected captures", () => {
  const value = {
    kind: "worldkit-episode-visual-events",
    schemaVersion: 1,
    sceneId: "scene-test",
    episodeId: "episode-scene-test",
    model: "gemini-3.5-flash",
    events: PLAYTHROUGH_HOST_EVENT_SLOTS.map(eventForSlot),
  };
  const result = validateVisualEventPlan(value, {
    sceneId: "scene-test",
    episodeId: "episode-scene-test",
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(
    value.events.map(({ segmentId }) => segmentId),
    ["segment-00", "segment-00", "segment-02", "segment-02", "segment-04"],
  );
});
