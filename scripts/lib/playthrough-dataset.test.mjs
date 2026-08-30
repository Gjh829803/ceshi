import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYTHROUGH_FRAME_COUNT,
  PLAYTHROUGH_PROMPT_WINDOWS,
  buildPlaythroughFrameTelemetry,
  renderSeedancePromptEvent,
  validatePlaythroughFrameTelemetry,
  validatePlaythroughPlan,
} from "./playthrough-dataset.mjs";

function promptEvent(index, globalSeconds) {
  const eventClasses = ["subject-transformation", "environment-transformation", "atmospheric-spectacle"];
  const scopes = ["subject-dominant", "environment-dominant", "sky-dominant"];
  const event = {
    id: `prompt-event-0${index}`,
    windowIndex: index,
    globalSeconds,
    segmentId: `segment-0${index}`,
    segmentRelativeSeconds: globalSeconds - index * 30,
    targetNames: ["场景内既有主体"],
    eventClass: eventClasses[index],
    magnitude: "large-scale",
    frameImpact: { scope: scopes[index], coverage: "large", contrast: "dramatic" },
    dominantChange: "主变化覆盖画面中清晰可见的大范围主体、环境或天空，形成从稳定初态到高对比终态的决定性变化，并在远景和前景同时留下立即可辨识的视觉结果；即使缩小观看也能一眼区分事件前后，而不是依赖局部粒子或微弱高光。",
    targetContext: "该目标正在画面中央沿既定可行区域持续移动，轮廓和身份清晰可见。",
    beforeState: "保持样式化首帧中已经锁定的主体身份、服装结构、环境材质和当前光照关系。",
    transitionDescription: "视觉变化从目标表面连续起始，沿既有轮廓和运动方向逐步传播，强度由弱到强并在接触现有表面时产生一致反射，不越过遮挡关系。",
    afterState: "变化完成后目标仍保持原有身份、数量、形体和运动状态，视觉结果稳定且没有闪烁跳变。",
    actionCoupling: "继续严格执行白膜视频中的移动速度、朝向、身体动作和镜头轨迹，不增加白膜中不存在的主要姿态或停顿。",
    spatialContinuity: "保持全部地形轮廓、路线、碰撞边界、标志物位置、空间尺度、遮挡顺序和相机视野不变。",
    audioDescription: "只加入与视觉变化同步、随强度自然变化的环境效果音和表面响应声，无音乐和人声。",
    negativeConstraints: "无新增或删除人物与物体，无切镜、传送、结构变化、材质闪烁、肢体异常、文字、字幕、Logo、UI 或水印。",
    timing: { transitionDurationSeconds: 1.2, ending: "hold", endingDurationSeconds: 0 },
  };
  return { ...event, eventPrompt: renderSeedancePromptEvent(event) };
}

function validPlan() {
  const intervals = [];
  const states = [
    [["W"], ["move-forward"]],
    [["W", "Shift"], ["move-forward", "run"]],
    [["W", "A"], ["move-forward", "move-left"]],
    [["S"], ["move-backward"]],
    [["W", "D"], ["move-forward", "move-right"]],
    [["Space"], ["jump"]],
  ];
  for (let index = 0; index < 18; index += 1) {
    const [rawKeys, semanticActions] = states[index % states.length];
    intervals.push({
      id: `input-${String(index).padStart(2, "0")}`,
      startSeconds: index * 5,
      endSeconds: index * 5 + 3,
      rawKeys,
      semanticActions,
      purpose: `以真实玩家节奏完成第 ${index + 1} 个探索操作并调整位置`,
    });
  }
  return {
    kind: "worldkit-playthrough-plan",
    schemaVersion: 1,
    id: "episode-test-plan",
    sceneId: "scene-test",
    seed: 731991,
    durationSeconds: 90,
    simulationTickRate: 60,
    captureFrameRate: 24,
    frameCount: PLAYTHROUGH_FRAME_COUNT,
    controlledEntityId: "subject-test",
    worldPackageRootHash: "unavailable",
    motionRenderingGuidance: "最终主体运动应保留录制的根节点轨迹、速度阶段和接触时间，同时依据完整主体结构补充连续重心转移、四肢协调、自然加减速、转向倾斜、接触反馈和随动惯性，不能照抄白膜占位体的僵硬关节角度，也不能改变实际路径与落点。",
    explorationTargets: [
      { id: "target-near", description: "穿过出生点前方的主要开放探索区域", priority: "required" },
      { id: "target-far", description: "接近并观察远端完整视觉标志物", priority: "required" },
    ],
    inputIntervals: intervals,
    cameraEvents: [
      { id: "camera-00", atSeconds: 4, yawDeltaRadians: -0.2, pitchDeltaRadians: 0, purpose: "观察左侧既有地标" },
      { id: "camera-01", atSeconds: 12, yawDeltaRadians: 0.3, pitchDeltaRadians: 0, purpose: "观察右侧既有地标" },
      { id: "camera-02", atSeconds: 22, yawDeltaRadians: 0, pitchDeltaRadians: 0.12, purpose: "抬头观察高处空间关系" },
      { id: "camera-03", atSeconds: 34, yawDeltaRadians: 0, pitchDeltaRadians: -0.1, purpose: "低头检查近处可行区域" },
      { id: "camera-04", atSeconds: 49, yawDeltaRadians: -0.15, pitchDeltaRadians: 0, purpose: "转回左侧继续探索" },
      { id: "camera-05", atSeconds: 67, yawDeltaRadians: 0.18, pitchDeltaRadians: 0, purpose: "转向右侧确认剩余空间" },
    ],
    seedancePromptEvents: [promptEvent(0, 15.5), promptEvent(1, 44.25), promptEvent(2, 77.75)],
  };
}

test("accepts one exact 90-second plan with distributed S and three prompt events", () => {
  const result = validatePlaythroughPlan(validPlan(), { sceneId: "scene-test" });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(PLAYTHROUGH_PROMPT_WINDOWS.length, 3);
});
test("rejects a plan that removes backward play from the middle segment", () => {
  const plan = validPlan();
  plan.inputIntervals = plan.inputIntervals.filter((item) =>
    !(item.startSeconds >= 30 && item.startSeconds < 60 && item.rawKeys.includes("S")));
  const result = validatePlaythroughPlan(plan);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) => code === "BACKWARD_INPUT_DISTRIBUTION_INVALID"));
});

test("rejects backward or lateral input across a Segment opening", () => {
  const plan = validPlan();
  const opening = plan.inputIntervals.find((item) => item.startSeconds === 30);
  opening.rawKeys = ["S"];
  opening.semanticActions = ["move-backward"];
  const result = validatePlaythroughPlan(plan);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) => code === "SEGMENT_OPENING_INPUT_INVALID"));
});

test("rejects a camera survey inside a Segment opening window", () => {
  const plan = validPlan();
  plan.cameraEvents[3].atSeconds = 30;
  const result = validatePlaythroughPlan(plan);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) => code === "SEGMENT_OPENING_CAMERA_INVALID"));
});

test("rejects a Prompt Event whose canonical high-detail rendering was weakened", () => {
  const plan = validPlan();
  plan.seedancePromptEvents[1].eventPrompt = "中途发生变化。";
  const result = validatePlaythroughPlan(plan);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) => code === "PROMPT_EVENT_RENDER_INVALID"));
});

test("rejects three locally embellished events without large class and scope diversity", () => {
  const plan = validPlan();
  for (const event of plan.seedancePromptEvents) {
    event.eventClass = "subject-transformation";
    event.frameImpact.scope = "subject-dominant";
    event.eventPrompt = renderSeedancePromptEvent(event);
  }
  const result = validatePlaythroughPlan(plan);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) => code === "PROMPT_EVENT_CLASS_DIVERSITY_INVALID"));
  assert.ok(result.diagnostics.some(({ code }) => code === "PROMPT_EVENT_SCOPE_DIVERSITY_INVALID"));
});

test("rejects a plan that omits final locomotion micro-animation guidance", () => {
  const plan = validPlan();
  delete plan.motionRenderingGuidance;
  const result = validatePlaythroughPlan(plan);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) => code === "MOTION_RENDERING_GUIDANCE_INVALID"));
});

test("aligns subject, input, FOV, intrinsics, and camera extrinsics to video frames", () => {
  const raw = [
    {
      actualSeconds: 0,
      simulationTick: 10,
      worldSessionId: "world-session-1",
      activeKeys: ["W"],
      subject: {
        entityId: "subject-test",
        positionMetersXYZ: [0, 1, 0],
        rotationQuaternionXYZW: [0, 0, 0, 1],
        velocityMetersPerSecondXYZ: [0, 0, -2],
      },
      camera: {
        id: "camera-main",
        targetEntityId: "subject-test",
        positionMetersXYZ: [0, 3, 5],
        targetPositionMetersXYZ: [0, 2, 0],
        verticalFovDegrees: 60,
        nearClipMeters: 0.05,
        farClipMeters: 1000,
      },
    },
    {
      actualSeconds: 0.5,
      simulationTick: 40,
      worldSessionId: "world-session-1",
      activeKeys: ["Shift", "W"],
      subject: {
        entityId: "subject-test",
        positionMetersXYZ: [0, 1, -1],
        rotationQuaternionXYZW: [0, 0, 0, 1],
        velocityMetersPerSecondXYZ: [0, 0, -4],
      },
      camera: {
        id: "camera-main",
        targetEntityId: "subject-test",
        positionMetersXYZ: [0, 3, 4],
        targetPositionMetersXYZ: [0, 2, -1],
        verticalFovDegrees: 58,
        nearClipMeters: 0.05,
        farClipMeters: 1000,
      },
    },
  ];
  const telemetry = buildPlaythroughFrameTelemetry(raw, {
    captureFrameRate: 2,
    frameCount: 2,
    widthPixels: 1280,
    heightPixels: 720,
  });
  assert.equal(telemetry.samples.length, 2);
  assert.deepEqual(telemetry.samples[0].activeKeys, ["W"]);
  assert.deepEqual(telemetry.samples[1].activeKeys, ["Shift", "W"]);
  assert.deepEqual(telemetry.samples[1].subject.positionMetersXYZ, [0, 1, -1]);
  assert.equal(telemetry.samples[1].camera.verticalFovDegrees, 58);
  assert.equal(telemetry.samples[1].camera.intrinsics.matrixRowMajor.length, 9);
  assert.equal(telemetry.samples[1].camera.viewMatrixColumnMajor.length, 16);
  assert.equal(telemetry.samples[1].camera.cameraToWorldMatrixColumnMajor.length, 16);
  assert.equal(telemetry.samples[1].camera.projectionMatrixColumnMajor.length, 16);
  assert.equal(telemetry.coordinateSystems.world.handedness, "right");
});

test("rejects an incomplete production frame telemetry payload", () => {
  const telemetry = buildPlaythroughFrameTelemetry([{
    actualSeconds: 0,
    simulationTick: 0,
    worldSessionId: "world-session-1",
    activeKeys: [],
    subject: {
      entityId: "subject-test",
      positionMetersXYZ: [0, 1, 0],
      rotationQuaternionXYZW: [0, 0, 0, 1],
      velocityMetersPerSecondXYZ: [0, 0, 0],
    },
    camera: {
      id: "camera-main",
      targetEntityId: "subject-test",
      positionMetersXYZ: [0, 3, 5],
      targetPositionMetersXYZ: [0, 2, 0],
      verticalFovDegrees: 58,
      nearClipMeters: 0.05,
      farClipMeters: 1000,
    },
  }]);
  assert.equal(validatePlaythroughFrameTelemetry(telemetry).ok, true);
  telemetry.samples[720].camera.viewMatrixColumnMajor.pop();
  const invalid = validatePlaythroughFrameTelemetry(telemetry);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.diagnostics[0].code, "FRAME_TELEMETRY_SAMPLE_INVALID");
  assert.equal(invalid.diagnostics[0].path, "/samples/720");
});
