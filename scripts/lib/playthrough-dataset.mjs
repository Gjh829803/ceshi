import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

export const PLAYTHROUGH_DURATION_SECONDS = 90;
export const PLAYTHROUGH_TICK_RATE = 60;
export const PLAYTHROUGH_CAPTURE_FPS = 24;
export const PLAYTHROUGH_FRAME_COUNT = 2_160;
export const PLAYTHROUGH_SEGMENT_SECONDS = 30;
export const PLAYTHROUGH_SEGMENT_FRAME_COUNT = 720;
export const PLAYTHROUGH_SEGMENT_OPENING_WINDOWS = Object.freeze([
  Object.freeze({ boundarySeconds: 30, startSeconds: 28.5, endSeconds: 31 }),
  Object.freeze({ boundarySeconds: 60, startSeconds: 58.5, endSeconds: 61 }),
]);
export const PLAYTHROUGH_PROMPT_WINDOWS = Object.freeze([
  Object.freeze({ windowIndex: 0, startSeconds: 10, endSeconds: 20 }),
  Object.freeze({ windowIndex: 1, startSeconds: 40, endSeconds: 50 }),
  Object.freeze({ windowIndex: 2, startSeconds: 70, endSeconds: 80 }),
]);

const DEFAULT_CAMERA_NEAR_CLIP_METERS = 0.05;
const DEFAULT_CAMERA_FAR_CLIP_METERS = 10_000;

const ID = /^[a-z0-9][a-z0-9-]{2,119}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const RAW_KEYS = new Set(["W", "A", "S", "D", "Shift", "Space"]);
const SEMANTIC_ACTIONS = new Set([
  "move-forward", "move-backward", "move-left", "move-right", "run", "jump",
  "boost", "brake", "primary-action", "secondary-action",
]);
const PROMPT_EVENT_CLASSES = new Set([
  "subject-transformation",
  "ability-manifestation",
  "environment-transformation",
  "atmospheric-spectacle",
]);
const PROMPT_EVENT_SCOPES = new Set([
  "subject-dominant",
  "environment-dominant",
  "sky-dominant",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function string(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function integer(value) {
  return Number.isSafeInteger(value);
}

function add(diagnostics, code, pathValue, message) {
  diagnostics.push({ code, path: pathValue, message });
}

function segmentForSeconds(seconds) {
  return Math.min(2, Math.max(0, Math.floor(seconds / PLAYTHROUGH_SEGMENT_SECONDS)));
}

function finiteVec3(value, fallback = null) {
  return Array.isArray(value) && value.length === 3 && value.every(number)
    ? value.map(Number)
    : fallback;
}

function cameraFrame(sample, widthPixels, heightPixels) {
  const camera = sample?.camera;
  const positionMetersXYZ = finiteVec3(camera?.positionMetersXYZ);
  const targetPositionMetersXYZ = finiteVec3(camera?.targetPositionMetersXYZ);
  const verticalFovDegrees = Number(camera?.verticalFovDegrees);
  if (!positionMetersXYZ || !targetPositionMetersXYZ || !number(verticalFovDegrees) ||
      verticalFovDegrees <= 0 || verticalFovDegrees >= 180) return null;
  const position = Vector3.FromArray(positionMetersXYZ);
  const target = Vector3.FromArray(targetPositionMetersXYZ);
  let forward = target.subtract(position);
  if (forward.lengthSquared() <= 1e-12) forward = new Vector3(0, 0, -1);
  else forward.normalize();
  let right = Vector3.Cross(forward, Vector3.Up());
  if (right.lengthSquared() <= 1e-12) right = Vector3.Right();
  else right.normalize();
  const up = Vector3.Cross(right, forward).normalize();
  const verticalFovRadians = (verticalFovDegrees * Math.PI) / 180;
  const aspectRatio = widthPixels / heightPixels;
  const horizontalFovRadians = 2 * Math.atan(Math.tan(verticalFovRadians / 2) * aspectRatio);
  const focalLengthPixels = heightPixels / (2 * Math.tan(verticalFovRadians / 2));
  const nearClipMeters = number(camera.nearClipMeters)
    ? camera.nearClipMeters
    : DEFAULT_CAMERA_NEAR_CLIP_METERS;
  const farClipMeters = number(camera.farClipMeters)
    ? camera.farClipMeters
    : DEFAULT_CAMERA_FAR_CLIP_METERS;
  const view = Matrix.LookAtRH(position, target, up);
  const cameraToWorld = Matrix.Invert(view);
  const projection = Matrix.PerspectiveFovRH(
    verticalFovRadians,
    aspectRatio,
    nearClipMeters,
    farClipMeters,
  );
  return {
    id: typeof camera.id === "string" ? camera.id : "camera-main",
    targetEntityId: typeof camera.targetEntityId === "string" ? camera.targetEntityId : null,
    activeCameraProfileRef: typeof camera.activeCameraProfileRef === "string"
      ? camera.activeCameraProfileRef
      : null,
    activeCameraRigRef: typeof camera.activeCameraRigRef === "string"
      ? camera.activeCameraRigRef
      : null,
    positionMetersXYZ,
    targetPositionMetersXYZ,
    forwardXYZ: forward.asArray(),
    upXYZ: up.asArray(),
    verticalFovDegrees,
    verticalFovRadians,
    horizontalFovDegrees: (horizontalFovRadians * 180) / Math.PI,
    nearClipMeters,
    farClipMeters,
    intrinsics: {
      widthPixels,
      heightPixels,
      fxPixels: focalLengthPixels,
      fyPixels: focalLengthPixels,
      cxPixels: widthPixels / 2,
      cyPixels: heightPixels / 2,
      matrixRowMajor: [
        focalLengthPixels, 0, widthPixels / 2,
        0, focalLengthPixels, heightPixels / 2,
        0, 0, 1,
      ],
    },
    viewMatrixColumnMajor: Array.from(view.asArray()),
    cameraToWorldMatrixColumnMajor: Array.from(cameraToWorld.asArray()),
    projectionMatrixColumnMajor: Array.from(projection.asArray()),
  };
}

export function buildPlaythroughFrameTelemetry(rawSamples, options = {}) {
  const captureFrameRate = Number(options.captureFrameRate ?? PLAYTHROUGH_CAPTURE_FPS);
  const frameCount = Number(options.frameCount ?? PLAYTHROUGH_FRAME_COUNT);
  const widthPixels = Number(options.widthPixels ?? 1280);
  const heightPixels = Number(options.heightPixels ?? 720);
  if (!Array.isArray(rawSamples) || rawSamples.length === 0 ||
      !Number.isSafeInteger(captureFrameRate) || captureFrameRate <= 0 ||
      !Number.isSafeInteger(frameCount) || frameCount <= 0 ||
      !Number.isSafeInteger(widthPixels) || widthPixels <= 0 ||
      !Number.isSafeInteger(heightPixels) || heightPixels <= 0) {
    throw new Error("PLAYTHROUGH_FRAME_TELEMETRY_INPUT_INVALID");
  }
  const samples = rawSamples
    .filter((sample) => number(sample?.actualSeconds))
    .sort((left, right) => left.actualSeconds - right.actualSeconds);
  if (samples.length === 0) throw new Error("PLAYTHROUGH_FRAME_TELEMETRY_SAMPLES_MISSING");
  const frames = [];
  let sourceIndex = 0;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const videoTimeSeconds = frameIndex / captureFrameRate;
    while (sourceIndex + 1 < samples.length &&
        Math.abs(samples[sourceIndex + 1].actualSeconds - videoTimeSeconds) <=
        Math.abs(samples[sourceIndex].actualSeconds - videoTimeSeconds)) {
      sourceIndex += 1;
    }
    const source = samples[sourceIndex];
    const camera = cameraFrame(source, widthPixels, heightPixels);
    if (!camera) throw new Error(`PLAYTHROUGH_FRAME_TELEMETRY_CAMERA_MISSING frame=${frameIndex}`);
    frames.push({
      frameIndex,
      videoTimeSeconds,
      sourceSampleTimeSeconds: source.actualSeconds,
      simulationTick: Number.isSafeInteger(source.simulationTick) ? source.simulationTick : null,
      worldSessionId: typeof source.worldSessionId === "string" ? source.worldSessionId : null,
      activeKeys: Array.isArray(source.activeKeys) ? [...source.activeKeys].map(String).sort() : [],
      subject: source.subject ?? null,
      camera,
    });
  }
  return {
    kind: "worldkit-episode-frame-telemetry",
    schemaVersion: 1,
    samplingMode: "nearest-runtime-sample",
    captureFrameRate,
    frameCount,
    widthPixels,
    heightPixels,
    durationSeconds: frameCount / captureFrameRate,
    coordinateSystems: {
      world: { handedness: "right", units: "meters", upAxis: "+Y" },
      camera: { handedness: "right", forwardAxis: "-Z", upAxis: "+Y", rightAxis: "+X" },
      image: { origin: "top-left", rightAxis: "+u", downAxis: "+v", units: "pixels" },
      matrixLayout: "column-major-unless-field-says-row-major",
    },
    samples: frames,
  };
}

export function validatePlaythroughFrameTelemetry(value) {
  const diagnostics = [];
  const reject = (code, pathValue, message) => diagnostics.push({ code, path: pathValue, message });
  if (!isObject(value) || value.kind !== "worldkit-episode-frame-telemetry" ||
      value.schemaVersion !== 1 || value.samplingMode !== "nearest-runtime-sample" ||
      value.captureFrameRate !== PLAYTHROUGH_CAPTURE_FPS ||
      value.frameCount !== PLAYTHROUGH_FRAME_COUNT || value.widthPixels !== 1280 ||
      value.heightPixels !== 720 || !Array.isArray(value.samples) ||
      value.samples.length !== PLAYTHROUGH_FRAME_COUNT) {
    reject("FRAME_TELEMETRY_HEADER_INVALID", "", "Expected one 1280x720, 24fps, 2160-frame Telemetry V1 payload.");
    return { ok: false, diagnostics };
  }
  for (const [frameIndex, sample] of value.samples.entries()) {
    const camera = sample?.camera;
    const subject = sample?.subject;
    const finiteArray = (item, length) => Array.isArray(item) && item.length === length && item.every(number);
    if (sample?.frameIndex !== frameIndex || sample.videoTimeSeconds !== frameIndex / 24 ||
        !Number.isSafeInteger(sample.simulationTick) || !Array.isArray(sample.activeKeys) ||
        !finiteArray(subject?.positionMetersXYZ, 3) ||
        !finiteArray(subject?.rotationQuaternionXYZW, 4) ||
        !finiteArray(subject?.velocityMetersPerSecondXYZ, 3) ||
        !number(camera?.verticalFovDegrees) || !number(camera?.nearClipMeters) ||
        !number(camera?.farClipMeters) || !finiteArray(camera?.intrinsics?.matrixRowMajor, 9) ||
        !finiteArray(camera?.viewMatrixColumnMajor, 16) ||
        !finiteArray(camera?.cameraToWorldMatrixColumnMajor, 16) ||
        !finiteArray(camera?.projectionMatrixColumnMajor, 16)) {
      reject(
        "FRAME_TELEMETRY_SAMPLE_INVALID",
        `/samples/${frameIndex}`,
        "Frame identity, input, Subject pose, FOV, clipping, intrinsics, or camera matrices are incomplete.",
      );
      break;
    }
  }
  return diagnostics.length === 0 ? { ok: true, value, diagnostics: [] } : { ok: false, diagnostics };
}

export function renderSeedancePromptEvent(event) {
  const targetNames = event.targetNames.join("、");
  const ending = event.timing.ending === "fade"
    ? `随后用 ${event.timing.endingDurationSeconds.toFixed(1)} 秒自然消退。`
    : event.timing.ending === "hold"
      ? "随后保持到本段结束。"
      : `随后按以下方式稳定结束：${event.afterState}`;
  return [
    `事件时间：在本段第 ${event.segmentRelativeSeconds.toFixed(3)} 秒开始，用 ${event.timing.transitionDurationSeconds.toFixed(1)} 秒完成主要变化；${ending}`,
    `事件目标：${targetNames}。${event.targetContext}`,
    `事件类别：${event.eventClass}；规模：${event.magnitude}；画面影响：${event.frameImpact.scope} / ${event.frameImpact.coverage} / ${event.frameImpact.contrast}`,
    `主导变化：${event.dominantChange}`,
    `变化前状态：${event.beforeState}`,
    `变化过程：${event.transitionDescription}`,
    `完成状态：${event.afterState}`,
    `动作与镜头：${event.actionCoupling}`,
    `空间连续性：${event.spatialContinuity}`,
    `声音：${event.audioDescription}`,
    `限制：${event.negativeConstraints}`,
  ].join("\n");
}

function validateInputIntervals(plan, diagnostics) {
  const intervals = plan.inputIntervals;
  if (!Array.isArray(intervals) || intervals.length < 12 || intervals.length > 240) {
    add(diagnostics, "INPUT_INTERVALS_INVALID", "/inputIntervals", "Expected 12-240 input intervals.");
    return;
  }
  let previousEnd = 0;
  const keyDurations = new Map([...RAW_KEYS].map((key) => [key, 0]));
  const sSegments = new Set();
  let shiftEpisodes = 0;
  let spaceEpisodes = 0;
  for (const [index, interval] of intervals.entries()) {
    const p = `/inputIntervals/${index}`;
    if (!isObject(interval) || !ID.test(interval.id ?? "")) {
      add(diagnostics, "INPUT_INTERVAL_ID_INVALID", `${p}/id`, "Input interval id is invalid.");
      continue;
    }
    if (!number(interval.startSeconds) || !number(interval.endSeconds) ||
        interval.startSeconds < 0 || interval.endSeconds <= interval.startSeconds ||
        interval.endSeconds > PLAYTHROUGH_DURATION_SECONDS || interval.startSeconds < previousEnd) {
      add(diagnostics, "INPUT_INTERVAL_RANGE_INVALID", p, "Input intervals must be ordered, non-overlapping, and inside 0-90 seconds.");
      continue;
    }
    previousEnd = interval.endSeconds;
    if (!Array.isArray(interval.rawKeys) || interval.rawKeys.length === 0 ||
        new Set(interval.rawKeys).size !== interval.rawKeys.length ||
        interval.rawKeys.some((key) => !RAW_KEYS.has(key))) {
      add(diagnostics, "INPUT_INTERVAL_KEYS_INVALID", `${p}/rawKeys`, "rawKeys must be a non-empty unique subset of W/A/S/D/Shift/Space.");
    }
    const openingWindow = PLAYTHROUGH_SEGMENT_OPENING_WINDOWS.find((window) =>
      interval.startSeconds < window.endSeconds && interval.endSeconds > window.startSeconds);
    if (openingWindow && (!interval.rawKeys?.includes("W") ||
        interval.rawKeys.some((key) => key !== "W" && key !== "Shift"))) {
      add(
        diagnostics,
        "SEGMENT_OPENING_INPUT_INVALID",
        `${p}/rawKeys`,
        `The ${openingWindow.boundarySeconds}s Segment opening window allows only idle, W, or W+Shift so the Subject remains rear-facing.`,
      );
    }
    if (!Array.isArray(interval.semanticActions) || interval.semanticActions.length === 0 ||
        interval.semanticActions.some((action) => !SEMANTIC_ACTIONS.has(action))) {
      add(diagnostics, "INPUT_INTERVAL_ACTIONS_INVALID", `${p}/semanticActions`, "semanticActions contain an unsupported value.");
    }
    if (!string(interval.purpose, 8)) {
      add(diagnostics, "INPUT_INTERVAL_PURPOSE_INVALID", `${p}/purpose`, "Each interval needs a scene-grounded purpose.");
    }
    const duration = interval.endSeconds - interval.startSeconds;
    for (const key of interval.rawKeys ?? []) keyDurations.set(key, (keyDurations.get(key) ?? 0) + duration);
    if (interval.rawKeys?.includes("S")) sSegments.add(segmentForSeconds(interval.startSeconds));
    if (interval.rawKeys?.includes("Shift")) shiftEpisodes += 1;
    if (interval.rawKeys?.includes("Space")) spaceEpisodes += 1;
  }
  for (const key of ["W", "A", "S", "D", "Shift", "Space"]) {
    if ((keyDurations.get(key) ?? 0) <= 0) {
      add(diagnostics, "INPUT_KEY_COVERAGE_MISSING", "/inputIntervals", `Required raw key ${key} is absent.`);
    }
  }
  if (sSegments.size !== 3 || (keyDurations.get("S") ?? 0) < 3) {
    add(diagnostics, "BACKWARD_INPUT_DISTRIBUTION_INVALID", "/inputIntervals", "S must appear in all three segments and total at least 3 seconds.");
  }
  if (shiftEpisodes < 3) add(diagnostics, "RUN_INPUT_DISTRIBUTION_INVALID", "/inputIntervals", "Shift needs at least three separate episodes.");
  if (spaceEpisodes < 3) add(diagnostics, "SPACE_INPUT_DISTRIBUTION_INVALID", "/inputIntervals", "Space needs at least three separate episodes or capability probes.");
}

function validateCameraEvents(plan, diagnostics) {
  const events = plan.cameraEvents;
  if (!Array.isArray(events) || events.length < 6 || events.length > 80) {
    add(diagnostics, "CAMERA_EVENTS_INVALID", "/cameraEvents", "Expected 6-80 camera events.");
    return;
  }
  let previous = -1;
  const directions = new Set();
  for (const [index, event] of events.entries()) {
    const p = `/cameraEvents/${index}`;
    if (!isObject(event) || !ID.test(event.id ?? "") || !number(event.atSeconds) ||
        event.atSeconds < 0 || event.atSeconds >= 90 || event.atSeconds <= previous ||
        !number(event.yawDeltaRadians) || !number(event.pitchDeltaRadians) || !string(event.purpose, 8)) {
      add(diagnostics, "CAMERA_EVENT_INVALID", p, "Camera events need ordered time, finite yaw/pitch, and a purpose.");
      continue;
    }
    previous = event.atSeconds;
    if (event.yawDeltaRadians < -0.02) directions.add("left");
    if (event.yawDeltaRadians > 0.02) directions.add("right");
    if (event.pitchDeltaRadians > 0.02) directions.add("up");
    if (event.pitchDeltaRadians < -0.02) directions.add("down");
    if (Math.abs(event.yawDeltaRadians) > 1.2 || Math.abs(event.pitchDeltaRadians) > 0.6) {
      add(diagnostics, "CAMERA_EVENT_DELTA_EXCESSIVE", p, "One camera event is too abrupt for natural play.");
    }
    const openingWindow = PLAYTHROUGH_SEGMENT_OPENING_WINDOWS.find((window) =>
      event.atSeconds >= window.startSeconds && event.atSeconds < window.endSeconds);
    if (openingWindow) {
      add(
        diagnostics,
        "SEGMENT_OPENING_CAMERA_INVALID",
        `${p}/atSeconds`,
        `Camera events are not allowed in the ${openingWindow.boundarySeconds}s rear-view opening window.`,
      );
    }
  }
  for (const direction of ["left", "right", "up", "down"]) {
    if (!directions.has(direction)) add(diagnostics, "CAMERA_DIRECTION_MISSING", "/cameraEvents", `Camera direction ${direction} is absent.`);
  }
}

function validatePromptEvents(plan, diagnostics) {
  const events = plan.seedancePromptEvents;
  if (!Array.isArray(events) || events.length !== 3) {
    add(diagnostics, "PROMPT_EVENT_COUNT_INVALID", "/seedancePromptEvents", "Exactly three Seedance Prompt Events are required.");
    return;
  }
  const eventClasses = new Set();
  const impactScopes = new Set();
  for (const [index, event] of events.entries()) {
    const p = `/seedancePromptEvents/${index}`;
    const window = PLAYTHROUGH_PROMPT_WINDOWS[index];
    if (!isObject(event) || event.windowIndex !== index || !ID.test(event.id ?? "") ||
        !number(event.globalSeconds) || event.globalSeconds < window.startSeconds ||
        event.globalSeconds >= window.endSeconds || event.segmentId !== `segment-0${index}` ||
        !number(event.segmentRelativeSeconds) ||
        Math.abs(event.segmentRelativeSeconds - (event.globalSeconds - index * 30)) > 0.001) {
      add(diagnostics, "PROMPT_EVENT_TIME_INVALID", p, "Prompt Event does not match its deterministic window and segment-relative time.");
    }
    if (!PROMPT_EVENT_CLASSES.has(event.eventClass) || event.magnitude !== "large-scale" ||
        !isObject(event.frameImpact) || !PROMPT_EVENT_SCOPES.has(event.frameImpact.scope) ||
        event.frameImpact.coverage !== "large" || event.frameImpact.contrast !== "dramatic" ||
        !string(event.dominantChange, 80) ||
        !Array.isArray(event.targetNames) || event.targetNames.length === 0 ||
        event.targetNames.some((value) => !string(value, 2)) || !string(event.targetContext, 16) ||
        !string(event.beforeState, 30) || !string(event.transitionDescription, 50) ||
        !string(event.afterState, 30) || !string(event.actionCoupling, 40) ||
        !string(event.spatialContinuity, 40) || !string(event.audioDescription, 20) ||
        !string(event.negativeConstraints, 50) || !isObject(event.timing) ||
        !number(event.timing.transitionDurationSeconds) || event.timing.transitionDurationSeconds <= 0.25 ||
        event.timing.transitionDurationSeconds > 10 ||
        !["hold", "fade", "settle"].includes(event.timing.ending) ||
        !number(event.timing.endingDurationSeconds) || event.timing.endingDurationSeconds < 0 ||
        event.timing.endingDurationSeconds > 6) {
      add(diagnostics, "PROMPT_EVENT_CONTENT_INVALID", p, "Prompt Event lacks a large dramatic class/impact or grounded before/process/after, motion, space, sound, and negative detail.");
      continue;
    }
    eventClasses.add(event.eventClass);
    impactScopes.add(event.frameImpact.scope);
    const rendered = renderSeedancePromptEvent(event);
    if (!string(event.eventPrompt, 250) || event.eventPrompt.trim() !== rendered) {
      add(diagnostics, "PROMPT_EVENT_RENDER_INVALID", `${p}/eventPrompt`, "eventPrompt must exactly match the canonical high-detail event rendering.");
    }
  }
  if (eventClasses.size < 2) {
    add(diagnostics, "PROMPT_EVENT_CLASS_DIVERSITY_INVALID", "/seedancePromptEvents", "Three Prompt Events must use at least two large-event classes.");
  }
  if (impactScopes.size < 2 ||
      ![...impactScopes].some((scope) => scope === "environment-dominant" || scope === "sky-dominant")) {
    add(diagnostics, "PROMPT_EVENT_SCOPE_DIVERSITY_INVALID", "/seedancePromptEvents", "Prompt Events need at least two impact scopes and one environment- or sky-dominant event.");
  }
}

export function validatePlaythroughPlan(value, expected = {}) {
  const diagnostics = [];
  if (!isObject(value) || value.kind !== "worldkit-playthrough-plan" || value.schemaVersion !== 1) {
    add(diagnostics, "PLAYTHROUGH_IDENTITY_INVALID", "", "Playthrough Plan identity is invalid.");
    return { ok: false, diagnostics };
  }
  if (!ID.test(value.id ?? "") || !ID.test(value.sceneId ?? "") ||
      (expected.sceneId && value.sceneId !== expected.sceneId) ||
      !integer(value.seed) || value.seed < 0 || value.durationSeconds !== 90 ||
      value.simulationTickRate !== 60 || value.captureFrameRate !== 24 ||
      value.frameCount !== 2160 || !string(value.controlledEntityId, 2) ||
      !string(value.worldPackageRootHash, 1) ||
      (value.worldPackageRootHash !== "unavailable" && !SHA256.test(value.worldPackageRootHash))) {
    add(diagnostics, "PLAYTHROUGH_HEADER_INVALID", "", "Plan header, timing, scene, subject, or world hash is invalid.");
  }
  if (!string(value.motionRenderingGuidance, 100)) {
    add(diagnostics, "MOTION_RENDERING_GUIDANCE_INVALID", "/motionRenderingGuidance", "Plan needs scene-specific final locomotion micro-animation guidance.");
  }
  if (!Array.isArray(value.explorationTargets) || value.explorationTargets.length < 2 ||
      value.explorationTargets.some((target) => !isObject(target) || !ID.test(target.id ?? "") ||
        !string(target.description, 12) || !["required", "opportunistic"].includes(target.priority))) {
    add(diagnostics, "EXPLORATION_TARGETS_INVALID", "/explorationTargets", "At least two grounded exploration targets are required.");
  }
  validateInputIntervals(value, diagnostics);
  validateCameraEvents(value, diagnostics);
  validatePromptEvents(value, diagnostics);
  return diagnostics.length === 0 ? { ok: true, value, diagnostics: [] } : { ok: false, diagnostics };
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function sha256Canonical(value) {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

export async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}
