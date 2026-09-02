import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

export const PLAYTHROUGH_SEGMENT_COUNT = 6;
export const PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES = Object.freeze([0, 1, 2, 3, 4, 5]);
export const PLAYTHROUGH_EVENT_SEGMENT_INDICES = Object.freeze([0, 2, 4]);
export const PLAYTHROUGH_SEGMENT_DELIVERY_SECONDS = 30;
export const PLAYTHROUGH_CAMERA_RESET_BUFFER_SECONDS = 0;
export const PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS =
  PLAYTHROUGH_SEGMENT_DELIVERY_SECONDS + PLAYTHROUGH_CAMERA_RESET_BUFFER_SECONDS;
export const PLAYTHROUGH_DELIVERY_DURATION_SECONDS =
  PLAYTHROUGH_SEGMENT_COUNT * PLAYTHROUGH_SEGMENT_DELIVERY_SECONDS;
export const PLAYTHROUGH_EXECUTION_DURATION_SECONDS =
  PLAYTHROUGH_SEGMENT_COUNT * PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS;
// Kept as the execution-clock authority for the Browser runner. Delivery media
// uses PLAYTHROUGH_DELIVERY_DURATION_SECONDS and excludes every reset buffer.
export const PLAYTHROUGH_DURATION_SECONDS = PLAYTHROUGH_EXECUTION_DURATION_SECONDS;
export const PLAYTHROUGH_TICK_RATE = 60;
export const PLAYTHROUGH_CAPTURE_FPS = 24;
export const PLAYTHROUGH_FRAME_COUNT =
  PLAYTHROUGH_DELIVERY_DURATION_SECONDS * PLAYTHROUGH_CAPTURE_FPS;
export const PLAYTHROUGH_EXECUTION_FRAME_COUNT =
  PLAYTHROUGH_EXECUTION_DURATION_SECONDS * PLAYTHROUGH_CAPTURE_FPS;
export const PLAYTHROUGH_SEGMENT_SECONDS = PLAYTHROUGH_SEGMENT_DELIVERY_SECONDS;
export const PLAYTHROUGH_SEGMENT_FRAME_COUNT = 720;
export const PLAYTHROUGH_EVENT_COUNT = 5;
export const PLAYTHROUGH_CAMERA_RESET_WINDOWS = Object.freeze([]);
export const PLAYTHROUGH_PROMPT_WINDOWS = Object.freeze(
  PLAYTHROUGH_EVENT_SEGMENT_INDICES.flatMap((segmentIndex, selectedIndex) =>
    (selectedIndex < 2
      ? [{ start: 6, end: 12, at: 8 }, { start: 18, end: 24, at: 20 }]
      : [{ start: 11, end: 19, at: 14 }])
      .map((relative, eventIndexInSegment) => {
        const windowIndex = selectedIndex * 2 + eventIndexInSegment;
        const segmentStartSeconds = segmentIndex * PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS;
        return Object.freeze({
          windowIndex,
          segmentIndex,
          eventIndexInSegment,
          segmentId: `segment-0${segmentIndex}`,
          startSeconds: segmentStartSeconds + relative.start,
          endSeconds: segmentStartSeconds + relative.end,
          relativeSeconds: relative.at,
        });
      })).flat(),
);
export const PLAYTHROUGH_HOST_EVENT_SLOTS = Object.freeze(
  PLAYTHROUGH_PROMPT_WINDOWS.map((window) => Object.freeze({
    id: `prompt-event-${String(window.windowIndex).padStart(2, "0")}`,
    windowIndex: window.windowIndex,
    segmentId: window.segmentId,
    globalSeconds: window.segmentIndex * PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS +
      window.relativeSeconds,
    segmentRelativeSeconds: window.relativeSeconds,
  })),
);
export const VISUAL_EVENT_ACTION_INDEPENDENCE =
  "事件按 Host 给定时间独立发生，不依赖、触发或配合任何角色动作或按键；完整保留@视频1的运动、镜头、路径、速度和落点。";

const DEFAULT_CAMERA_NEAR_CLIP_METERS = 0.05;
const DEFAULT_CAMERA_FAR_CLIP_METERS = 10_000;

const ID = /^[a-z0-9][a-z0-9-]{2,119}$/;
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

function add(diagnostics, code, pathValue, message) {
  diagnostics.push({ code, path: pathValue, message });
}

export function executionSegmentStartSeconds(segmentIndex) {
  return segmentIndex * PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS;
}

export function executionSegmentForSeconds(seconds) {
  return Math.min(
    PLAYTHROUGH_SEGMENT_COUNT - 1,
    Math.max(0, Math.floor(seconds / PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS)),
  );
}

export function deliveryFrameExecutionTimeSeconds(frameIndex) {
  const segmentIndex = Math.min(
    PLAYTHROUGH_SEGMENT_COUNT - 1,
    Math.floor(frameIndex / PLAYTHROUGH_SEGMENT_FRAME_COUNT),
  );
  const localFrameIndex = frameIndex - segmentIndex * PLAYTHROUGH_SEGMENT_FRAME_COUNT;
  return executionSegmentStartSeconds(segmentIndex) +
    localFrameIndex / PLAYTHROUGH_CAPTURE_FPS;
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
    const executionTimeSeconds = frameCount === PLAYTHROUGH_FRAME_COUNT &&
        captureFrameRate === PLAYTHROUGH_CAPTURE_FPS
      ? deliveryFrameExecutionTimeSeconds(frameIndex)
      : videoTimeSeconds;
    while (sourceIndex + 1 < samples.length &&
        Math.abs(samples[sourceIndex + 1].actualSeconds - executionTimeSeconds) <=
        Math.abs(samples[sourceIndex].actualSeconds - executionTimeSeconds)) {
      sourceIndex += 1;
    }
    const source = samples[sourceIndex];
    const camera = cameraFrame(source, widthPixels, heightPixels);
    if (!camera) throw new Error(`PLAYTHROUGH_FRAME_TELEMETRY_CAMERA_MISSING frame=${frameIndex}`);
    frames.push({
      frameIndex,
      videoTimeSeconds,
      executionTimeSeconds,
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
    reject("FRAME_TELEMETRY_HEADER_INVALID", "", `Expected one 1280x720, 24fps, ${PLAYTHROUGH_FRAME_COUNT}-frame Telemetry V1 payload.`);
    return { ok: false, diagnostics };
  }
  for (const [frameIndex, sample] of value.samples.entries()) {
    const camera = sample?.camera;
    const subject = sample?.subject;
    const finiteArray = (item, length) => Array.isArray(item) && item.length === length && item.every(number);
    if (sample?.frameIndex !== frameIndex || sample.videoTimeSeconds !== frameIndex / 24 ||
        sample.executionTimeSeconds !== deliveryFrameExecutionTimeSeconds(frameIndex) ||
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

const MOVEMENT_RAW_KEYS = Object.freeze(["W", "A", "S", "D"]);
const OPPOSITE_MOVEMENT_RAW_KEY = Object.freeze({ W: "S", S: "W", A: "D", D: "A" });
const FATAL_RUNTIME_CAPTURE_PATTERN =
  /WORLDKIT_RUNTIME_(?:FRAME|FRAME_RECOVERY)_FAILED|ADAPTER_FIXED_INPUT_FAILED/;

/**
 * Host-owned admission for an executed Episode. Planned input is not evidence:
 * this validator consumes Runtime Tick and Subject position samples and rejects a
 * recording that continued after the Runtime stopped advancing.
 */
export function validatePlaythroughExecutionQuality(input) {
  const diagnostics = [];
  const telemetrySamples = Array.isArray(input?.telemetrySamples)
    ? input.telemetrySamples
      .filter((sample) => number(sample?.actualSeconds))
      .sort((left, right) => left.actualSeconds - right.actualSeconds)
    : [];
  const routeReports = Array.isArray(input?.routeReports) ? input.routeReports : [];
  const consoleErrors = Array.isArray(input?.consoleErrors) ? input.consoleErrors.map(String) : [];
  const {
    minimumMaximumDistanceMeters,
    minimumPathLengthMeters,
  } = explorationScaleThresholds(input?.navigationEvidence);

  if (telemetrySamples.length < PLAYTHROUGH_CAPTURE_FPS * 10) {
    add(
      diagnostics,
      "EXECUTION_TELEMETRY_INCOMPLETE",
      "/telemetrySamples",
      "Executed quality admission requires continuous Runtime telemetry, not only a planned input timeline.",
    );
  }
  const fatalRuntimeErrors = consoleErrors.filter((message) =>
    FATAL_RUNTIME_CAPTURE_PATTERN.test(message));
  if (fatalRuntimeErrors.length > 0) {
    add(
      diagnostics,
      "EXECUTION_RUNTIME_FATAL_ERROR",
      "/consoleErrors",
      "Runtime frame/input execution failed during recording; the video cannot be promoted even if media encoding completed.",
    );
  }

  let maximumStalledTickSeconds = 0;
  let stalledTickSeconds = 0;
  let totalPathLengthMeters = 0;
  let maximumDistanceFromStartMeters = 0;
  let movementRequestedSeconds = 0;
  let movementResponsiveSeconds = 0;
  let maximumUnresponsiveMovementSeconds = 0;
  let unresponsiveMovementSeconds = 0;
  let rapidOppositeTransitionCount = 0;
  const lastReleasedAtSeconds = new Map();
  let previousActiveMovementKeys = new Set();
  const firstPosition = finiteVec3(telemetrySamples[0]?.subject?.positionMetersXYZ);

  for (let index = 1; index < telemetrySamples.length; index += 1) {
    const previous = telemetrySamples[index - 1];
    const current = telemetrySamples[index];
    const deltaSeconds = current.actualSeconds - previous.actualSeconds;
    if (!number(deltaSeconds) || deltaSeconds <= 0 || deltaSeconds > 0.5) continue;
    if (!Number.isSafeInteger(previous.simulationTick) ||
        !Number.isSafeInteger(current.simulationTick) ||
        current.simulationTick < previous.simulationTick) {
      add(
        diagnostics,
        "EXECUTION_SIMULATION_TICK_INVALID",
        `/telemetrySamples/${index}/simulationTick`,
        "Runtime Tick must be present and monotonic throughout recording.",
      );
      break;
    }
    if (current.simulationTick === previous.simulationTick) {
      stalledTickSeconds += deltaSeconds;
      maximumStalledTickSeconds = Math.max(maximumStalledTickSeconds, stalledTickSeconds);
    } else {
      stalledTickSeconds = 0;
    }

    const previousPosition = finiteVec3(previous?.subject?.positionMetersXYZ);
    const currentPosition = finiteVec3(current?.subject?.positionMetersXYZ);
    if (!previousPosition || !currentPosition) continue;
    const displacementMeters = Math.hypot(
      currentPosition[0] - previousPosition[0],
      currentPosition[2] - previousPosition[2],
    );
    totalPathLengthMeters += displacementMeters;
    if (firstPosition) {
      maximumDistanceFromStartMeters = Math.max(
        maximumDistanceFromStartMeters,
        Math.hypot(
          currentPosition[0] - firstPosition[0],
          currentPosition[2] - firstPosition[2],
        ),
      );
    }
    const requestedMovementKeys = new Set(
      (Array.isArray(previous.activeKeys) ? previous.activeKeys : [])
        .filter((key) => MOVEMENT_RAW_KEYS.includes(key)),
    );
    if (requestedMovementKeys.size > 0) {
      movementRequestedSeconds += deltaSeconds;
      if (displacementMeters / deltaSeconds >= 0.1) {
        movementResponsiveSeconds += deltaSeconds;
        unresponsiveMovementSeconds = 0;
      } else {
        unresponsiveMovementSeconds += deltaSeconds;
        maximumUnresponsiveMovementSeconds = Math.max(
          maximumUnresponsiveMovementSeconds,
          unresponsiveMovementSeconds,
        );
      }
    } else {
      unresponsiveMovementSeconds = 0;
    }

    const currentActiveMovementKeys = new Set(
      (Array.isArray(current.activeKeys) ? current.activeKeys : [])
        .filter((key) => MOVEMENT_RAW_KEYS.includes(key)),
    );
    for (const key of previousActiveMovementKeys) {
      if (!currentActiveMovementKeys.has(key)) {
        lastReleasedAtSeconds.set(key, current.actualSeconds);
      }
    }
    for (const key of currentActiveMovementKeys) {
      if (previousActiveMovementKeys.has(key)) continue;
      const oppositeReleasedAt = lastReleasedAtSeconds.get(OPPOSITE_MOVEMENT_RAW_KEY[key]);
      if (number(oppositeReleasedAt) && current.actualSeconds - oppositeReleasedAt <= 1.25) {
        rapidOppositeTransitionCount += 1;
      }
    }
    previousActiveMovementKeys = currentActiveMovementKeys;
  }

  const firstSample = telemetrySamples[0];
  const lastSample = telemetrySamples.at(-1);
  const sampledDurationSeconds = lastSample && firstSample
    ? lastSample.actualSeconds - firstSample.actualSeconds
    : 0;
  const tickProgressRate = sampledDurationSeconds > 0 &&
      Number.isSafeInteger(firstSample?.simulationTick) &&
      Number.isSafeInteger(lastSample?.simulationTick)
    ? (lastSample.simulationTick - firstSample.simulationTick) / sampledDurationSeconds
    : 0;
  const movementResponsiveRatio = movementRequestedSeconds > 0
    ? movementResponsiveSeconds / movementRequestedSeconds
    : 0;
  if (maximumStalledTickSeconds > 1 || tickProgressRate < 30) {
    add(
      diagnostics,
      "EXECUTION_SIMULATION_TICK_STALLED",
      "/telemetrySamples",
      "Runtime Tick stopped or advanced too slowly while recording continued.",
    );
  }
  if (movementRequestedSeconds < 8 || movementResponsiveRatio < 0.7 ||
      maximumUnresponsiveMovementSeconds > 1.25) {
    add(
      diagnostics,
      "EXECUTION_INPUT_RESPONSE_INSUFFICIENT",
      "/telemetrySamples",
      "Highlighted movement input must produce sustained measured Subject motion; planned keys alone are insufficient.",
    );
  }
  if (maximumDistanceFromStartMeters < minimumMaximumDistanceMeters ||
      totalPathLengthMeters < minimumPathLengthMeters) {
    add(
      diagnostics,
      "EXECUTION_EXPLORATION_COVERAGE_INSUFFICIENT",
      "/telemetrySamples",
      "The recorded Subject remained near spawn or covered too little of the reachable world.",
    );
  }
  if (rapidOppositeTransitionCount > 2) {
    add(
      diagnostics,
      "EXECUTION_RAPID_OPPOSITE_INPUT_EXCESSIVE",
      "/telemetrySamples",
      "The executed controls contain too many rapid W/S or A/D reversals to resemble deliberate player exploration.",
    );
  }
  if (routeReports.length !== PLAYTHROUGH_SEGMENT_COUNT || routeReports.some((report) =>
    report?.arrived !== true || report?.reachedRouteEnd !== true || report?.failure ||
    Number(report?.recoveryAttempts ?? 0) > 0 ||
    !number(report?.distanceMeters) || !number(report?.arrivalRadiusMeters) ||
    report.distanceMeters > report.arrivalRadiusMeters + 1e-6 ||
    !number(report?.effectiveArrivalRadiusMeters) ||
    report.effectiveArrivalRadiusMeters > report.arrivalRadiusMeters + 1e-6)) {
    add(
      diagnostics,
      "EXECUTION_DESTINATION_CLOSURE_INVALID",
      "/routeReports",
      "Every Segment must reach its route end without a stall recovery and remain inside the authored arrival radius; an inflated Host radius is forbidden.",
    );
  }

  const metrics = {
    sampledDurationSeconds,
    tickProgressRate,
    maximumStalledTickSeconds,
    movementRequestedSeconds,
    movementResponsiveRatio,
    maximumUnresponsiveMovementSeconds,
    totalPathLengthMeters,
    maximumDistanceFromStartMeters,
    minimumPathLengthMeters,
    minimumMaximumDistanceMeters,
    rapidOppositeTransitionCount,
    fatalRuntimeErrorCount: fatalRuntimeErrors.length,
  };
  return diagnostics.length === 0
    ? { ok: true, diagnostics: [], metrics }
    : { ok: false, diagnostics, metrics };
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
  let backwardEpisodes = 0;
  let shiftEpisodes = 0;
  let spaceEpisodes = 0;
  let rapidOppositeTransitions = 0;
  let previousMovementInterval = null;
  for (const [index, interval] of intervals.entries()) {
    const p = `/inputIntervals/${index}`;
    if (!isObject(interval) || !ID.test(interval.id ?? "")) {
      add(diagnostics, "INPUT_INTERVAL_ID_INVALID", `${p}/id`, "Input interval id is invalid.");
      continue;
    }
    if (!number(interval.startSeconds) || !number(interval.endSeconds) ||
        interval.startSeconds < 0 || interval.endSeconds <= interval.startSeconds ||
        interval.endSeconds > PLAYTHROUGH_EXECUTION_DURATION_SECONDS ||
        interval.startSeconds < previousEnd ||
        executionSegmentForSeconds(interval.startSeconds) !==
          executionSegmentForSeconds(interval.endSeconds - 1e-9)) {
      add(diagnostics, "INPUT_INTERVAL_RANGE_INVALID", p, `Input intervals must be ordered, non-overlapping, and inside 0-${PLAYTHROUGH_EXECUTION_DURATION_SECONDS} execution seconds.`);
      continue;
    }
    previousEnd = interval.endSeconds;
    if (!Array.isArray(interval.rawKeys) || interval.rawKeys.length === 0 ||
        new Set(interval.rawKeys).size !== interval.rawKeys.length ||
        interval.rawKeys.some((key) => !RAW_KEYS.has(key))) {
      add(diagnostics, "INPUT_INTERVAL_KEYS_INVALID", `${p}/rawKeys`, "rawKeys must be a non-empty unique subset of W/A/S/D/Shift/Space.");
    }
    const resetWindow = overlapsResetBuffer(interval.startSeconds, interval.endSeconds);
    if (resetWindow) {
      add(
        diagnostics,
        "SEGMENT_RESET_BUFFER_INPUT_INVALID",
        p,
        `Segment ${resetWindow.segmentIndex} reserves its final second for camera reset and accepts no gameplay input.`,
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
    const movementKeys = (interval.rawKeys ?? []).filter((key) =>
      key === "W" || key === "A" || key === "S" || key === "D");
    if (movementKeys.length > 0 && duration < 0.35) {
      add(
        diagnostics,
        "MOVEMENT_INPUT_DURATION_TOO_SHORT",
        p,
        "W/A/S/D input must remain active for at least 0.35 seconds so it reads as deliberate player control.",
      );
    }
    if (interval.rawKeys?.includes("Shift") && duration < 0.5) {
      add(
        diagnostics,
        "RUN_INPUT_DURATION_TOO_SHORT",
        p,
        "A run episode using Shift must remain active for at least 0.5 seconds.",
      );
    }
    if (interval.rawKeys?.includes("Space") && (duration < 0.08 || duration > 0.25)) {
      add(
        diagnostics,
        "SPACE_INPUT_DURATION_INVALID",
        p,
        "Space is an edge-triggered action and must be a visible short press between 0.08 and 0.25 seconds.",
      );
    }
    for (const key of interval.rawKeys ?? []) keyDurations.set(key, (keyDurations.get(key) ?? 0) + duration);
    if (interval.rawKeys?.includes("S")) {
      sSegments.add(executionSegmentForSeconds(interval.startSeconds));
      backwardEpisodes += 1;
    }
    if (interval.rawKeys?.includes("Shift")) shiftEpisodes += 1;
    if (interval.rawKeys?.includes("Space")) spaceEpisodes += 1;
    if (movementKeys.length > 0) {
      if (previousMovementInterval !== null &&
          interval.startSeconds - previousMovementInterval.endSeconds <= 1.25 &&
          movementKeys.some((key) => previousMovementInterval.keys.includes(
            OPPOSITE_MOVEMENT_RAW_KEY[key],
          ))) {
        rapidOppositeTransitions += 1;
      }
      previousMovementInterval = {
        keys: movementKeys,
        endSeconds: interval.endSeconds,
      };
    }
  }
  for (const key of ["W", "A", "S", "D", "Shift", "Space"]) {
    if ((keyDurations.get(key) ?? 0) <= 0) {
      add(diagnostics, "INPUT_KEY_COVERAGE_MISSING", "/inputIntervals", `Required raw key ${key} is absent.`);
    }
  }
  const backwardDurationSeconds = keyDurations.get("S") ?? 0;
  if (sSegments.size < 3 || backwardEpisodes < 3 ||
      backwardEpisodes > 8 || backwardDurationSeconds < 2 ||
      backwardDurationSeconds > 8) {
    add(
      diagnostics,
      "BACKWARD_INPUT_DISTRIBUTION_INVALID",
      "/inputIntervals",
      "Use purposeful short S actions across at least three captures; S is required natural coverage, never a repeated W/S patrol.",
    );
  }
  if (rapidOppositeTransitions > 2) {
    add(
      diagnostics,
      "RAPID_OPPOSITE_INPUT_EXCESSIVE",
      "/inputIntervals",
      "Allow at most two close W/S or A/D reversals in the whole Episode; prefer sustained forward arcs and camera-guided turns.",
    );
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
        event.atSeconds < 0 || event.atSeconds >= PLAYTHROUGH_EXECUTION_DURATION_SECONDS ||
        event.atSeconds <= previous ||
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
    const resetWindow = overlapsResetBuffer(event.atSeconds, event.atSeconds + 0.001);
    if (resetWindow) {
      add(
        diagnostics,
        "SEGMENT_RESET_BUFFER_CAMERA_INVALID",
        `${p}/atSeconds`,
        `Camera events are not allowed in Segment ${resetWindow.segmentIndex}'s final reset second.`,
      );
    }
  }
  for (const direction of ["left", "right", "up", "down"]) {
    if (!directions.has(direction)) add(diagnostics, "CAMERA_DIRECTION_MISSING", "/cameraEvents", `Camera direction ${direction} is absent.`);
  }
}

function validatePromptEvents(events, diagnostics, basePath = "/events") {
  if (!Array.isArray(events) || events.length !== PLAYTHROUGH_EVENT_COUNT) {
    add(diagnostics, "PROMPT_EVENT_COUNT_INVALID", basePath, "Exactly five Seedance Prompt Events are required across the three selected captures.");
    return;
  }
  for (const [index, event] of events.entries()) {
    const p = `${basePath}/${index}`;
    const window = PLAYTHROUGH_PROMPT_WINDOWS[index];
    if (!isObject(event) || event.windowIndex !== index || !ID.test(event.id ?? "") ||
        !number(event.globalSeconds) || event.globalSeconds < window.startSeconds ||
        event.globalSeconds >= window.endSeconds || event.segmentId !== window.segmentId ||
        !number(event.segmentRelativeSeconds) ||
        Math.abs(event.segmentRelativeSeconds -
          (event.globalSeconds - executionSegmentStartSeconds(window.segmentIndex))) > 0.001) {
      add(diagnostics, "PROMPT_EVENT_TIME_INVALID", p, "Prompt Event does not match its deterministic window and segment-relative time.");
    }
    if (!PROMPT_EVENT_CLASSES.has(event.eventClass) || event.magnitude !== "large-scale" ||
        !isObject(event.frameImpact) || !PROMPT_EVENT_SCOPES.has(event.frameImpact.scope) ||
        event.frameImpact.coverage !== "large" || event.frameImpact.contrast !== "dramatic" ||
        !string(event.dominantChange) ||
        !Array.isArray(event.targetNames) || event.targetNames.length === 0 ||
        event.targetNames.some((value) => !string(value)) || !string(event.targetContext) ||
        !string(event.beforeState) || !string(event.transitionDescription) ||
        !string(event.afterState) || !string(event.actionCoupling) ||
        !string(event.spatialContinuity) || !string(event.audioDescription) ||
        !string(event.negativeConstraints) || !isObject(event.timing) ||
        !number(event.timing.transitionDurationSeconds) || event.timing.transitionDurationSeconds <= 0.25 ||
        event.timing.transitionDurationSeconds > 10 ||
        !["hold", "fade", "settle"].includes(event.timing.ending) ||
        !number(event.timing.endingDurationSeconds) || event.timing.endingDurationSeconds < 0 ||
        event.timing.endingDurationSeconds > 6) {
      add(diagnostics, "PROMPT_EVENT_CONTENT_INVALID", p, "Prompt Event is missing a required structural field or valid timing value.");
      continue;
    }
    const rendered = renderSeedancePromptEvent(event);
    if (!string(event.eventPrompt, 250) || event.eventPrompt.trim() !== rendered) {
      add(diagnostics, "PROMPT_EVENT_RENDER_INVALID", `${p}/eventPrompt`, "eventPrompt must exactly match the canonical high-detail event rendering.");
    }
  }
}

export function validateVisualEventPlan(value, expected = {}) {
  const diagnostics = [];
  if (!isObject(value) || value.kind !== "worldkit-episode-visual-events" ||
      value.schemaVersion !== 1 || !ID.test(value.sceneId ?? "") ||
      !string(value.episodeId, 3) || !string(value.model, 3) ||
      (expected.sceneId && value.sceneId !== expected.sceneId) ||
      (expected.episodeId && value.episodeId !== expected.episodeId)) {
    add(diagnostics, "VISUAL_EVENT_PLAN_IDENTITY_INVALID", "", "Visual Event Plan identity is invalid.");
    return { ok: false, diagnostics };
  }
  validatePromptEvents(value.events, diagnostics);
  for (const [index, event] of Array.isArray(value.events) ? value.events.entries() : []) {
    if (event?.actionCoupling !== VISUAL_EVENT_ACTION_INDEPENDENCE) {
      add(
        diagnostics,
        "VISUAL_EVENT_ACTION_COUPLING_INVALID",
        `/events/${index}/actionCoupling`,
        "Visual events must use the Host-owned action-independent statement.",
      );
    }
  }
  return diagnostics.length === 0
    ? { ok: true, value, diagnostics: [] }
    : { ok: false, diagnostics };
}

function validateSegmentPlans(plan, diagnostics, navigationEvidence) {
  const segments = plan.segmentPlans;
  if (!Array.isArray(segments) || segments.length !== PLAYTHROUGH_SEGMENT_COUNT) {
    add(diagnostics, "SEGMENT_PLAN_COUNT_INVALID", "/segmentPlans", "Exactly six independent 30-second capture plans are required.");
    return;
  }
  const destinationIds = new Set();
  const coveredTargets = new Set();
  const admittedDestinations = Array.isArray(navigationEvidence?.destinations)
    ? navigationEvidence.destinations
    : [];
  const admittedCorridors = Array.isArray(navigationEvidence?.corridors)
    ? navigationEvidence.corridors
    : [];
  const evidenceDestinations = new Map(
    admittedDestinations.map((destination) => [destination.id, destination]),
  );
  const evidenceCorridors = new Map(
    admittedCorridors.map((corridor) => [corridor.id, corridor]),
  );
  const safeWaypointKeys = new Set([
    ...(navigationEvidence?.spawn?.positionMetersXYZ ? [navigationEvidence.spawn.positionMetersXYZ] : []),
    ...admittedDestinations.map((destination) => destination.positionMetersXYZ),
    ...admittedCorridors.flatMap((corridor) => corridor.centerlineStandPositionsMetersXYZ ?? []),
  ].filter((position) => finiteVec3(position)).map((position) => position.join(",")));
  for (const [index, segment] of segments.entries()) {
    const p = `/segmentPlans/${index}`;
    const expectedStartSeconds = executionSegmentStartSeconds(index);
    if (!isObject(segment) || segment.segmentId !== `segment-0${index}` ||
        segment.executionStartSeconds !== expectedStartSeconds ||
        segment.deliveryDurationSeconds !== PLAYTHROUGH_SEGMENT_DELIVERY_SECONDS ||
        segment.cameraResetBufferSeconds !== PLAYTHROUGH_CAMERA_RESET_BUFFER_SECONDS ||
        !finiteVec3(segment.initialPositionMetersXYZ) ||
        !number(segment.initialFacingYawRadians) ||
        !ID.test(segment.destinationId ?? "") || !finiteVec3(segment.destinationPositionMetersXYZ) ||
        !number(segment.arrivalRadiusMeters) || segment.arrivalRadiusMeters < 0.5 ||
        segment.arrivalRadiusMeters > 8 || !number(segment.expectedArrivalSeconds) ||
        segment.expectedArrivalSeconds <= 2 || segment.expectedArrivalSeconds > 29 ||
        !string(segment.purpose, 16) || !Array.isArray(segment.routeBandIds) ||
        segment.routeBandIds.length < 1 || !Array.isArray(segment.routeWaypointsMetersXYZ) ||
        segment.routeWaypointsMetersXYZ.length < 2 ||
        segment.routeWaypointsMetersXYZ.some((position) => !finiteVec3(position)) ||
        !Array.isArray(segment.coverageTargetIds) || segment.coverageTargetIds.length < 1 ||
        segment.coverageTargetIds.some((id) => !ID.test(id ?? ""))) {
      add(diagnostics, "SEGMENT_PLAN_INVALID", p, "Capture needs a safe initial position and facing, a local destination, route, arrival budget, and coverage targets.");
      continue;
    }
    destinationIds.add(segment.destinationId);
    for (const id of segment.coverageTargetIds) coveredTargets.add(id);
    const lastWaypoint = segment.routeWaypointsMetersXYZ.at(-1);
    const firstWaypoint = segment.routeWaypointsMetersXYZ[0];
    const expectedOrigin = segment.initialPositionMetersXYZ;
    if (finiteVec3(expectedOrigin) && firstWaypoint.join(",") !== expectedOrigin.join(",")) {
      add(
        diagnostics,
        "SEGMENT_ROUTE_ORIGIN_MISMATCH",
        `${p}/routeWaypointsMetersXYZ/0`,
        "Each independent route must begin at its declared capture initial position.",
      );
    }
    if (Math.hypot(
      lastWaypoint[0] - segment.destinationPositionMetersXYZ[0],
      lastWaypoint[1] - segment.destinationPositionMetersXYZ[1],
      lastWaypoint[2] - segment.destinationPositionMetersXYZ[2],
    ) > segment.arrivalRadiusMeters) {
      add(diagnostics, "SEGMENT_ROUTE_DESTINATION_MISMATCH", `${p}/routeWaypointsMetersXYZ`, "The final safe waypoint must enter the declared destination radius.");
    }
    if (navigationEvidence !== undefined) {
      if (!safeWaypointKeys.has(segment.initialPositionMetersXYZ.join(","))) {
        add(diagnostics, "SEGMENT_INITIAL_POSITION_NOT_ADMITTED", `${p}/initialPositionMetersXYZ`, "Capture initial position must be one exact Host-admitted stand position.");
      }
      const destination = evidenceDestinations.get(segment.destinationId);
      if (destination === undefined || segment.destinationPositionMetersXYZ.join(",") !==
          destination.positionMetersXYZ.join(",")) {
        add(diagnostics, "SEGMENT_DESTINATION_NOT_ADMITTED", `${p}/destinationId`, "Destination must match Host navigation evidence exactly.");
      } else {
        const allowedCoverageIds = new Set([
          destination.id,
          ...(destination.coverageTargetIds ?? []),
        ]);
        for (const [coverageIndex, coverageId] of segment.coverageTargetIds.entries()) {
          if (!allowedCoverageIds.has(coverageId)) {
            add(
              diagnostics,
              "SEGMENT_COVERAGE_NOT_ADMITTED",
              `${p}/coverageTargetIds/${coverageIndex}`,
              "Coverage claims must belong to the selected Host-admitted destination viewpoint.",
            );
          }
        }
      }
      for (const [routeIndex, routeId] of segment.routeBandIds.entries()) {
        if (!evidenceCorridors.has(routeId)) {
          add(diagnostics, "SEGMENT_ROUTE_NOT_ADMITTED", `${p}/routeBandIds/${routeIndex}`, "Route band is absent from Host navigation evidence.");
        }
      }
      const selectedRouteWaypointKeys = new Set(segment.routeBandIds.flatMap((routeId) =>
        evidenceCorridors.get(routeId)?.centerlineStandPositionsMetersXYZ ?? [])
        .filter((position) => finiteVec3(position))
        .map((position) => position.join(",")));
      for (const [waypointIndex, position] of segment.routeWaypointsMetersXYZ.entries()) {
        if (!safeWaypointKeys.has(position.join(","))) {
          add(diagnostics, "SEGMENT_WAYPOINT_NOT_ADMITTED", `${p}/routeWaypointsMetersXYZ/${waypointIndex}`, "Waypoint must be an exact Host-admitted stand position.");
        } else if (!selectedRouteWaypointKeys.has(position.join(","))) {
          add(
            diagnostics,
            "SEGMENT_WAYPOINT_ROUTE_MISMATCH",
            `${p}/routeWaypointsMetersXYZ/${waypointIndex}`,
            "Waypoint must belong to one of this Segment's declared Host corridor centerlines.",
          );
        }
      }
    }
  }
  const requiredDistinct = Math.min(
    3,
    Math.max(1, admittedDestinations.length || 3),
  );
  if (destinationIds.size < requiredDistinct) {
    add(diagnostics, "SEGMENT_DESTINATION_DIVERSITY_INVALID", "/segmentPlans", `Expected at least ${requiredDistinct} distinct reachable destinations across six independent captures.`);
  }
  for (const coreId of Array.isArray(navigationEvidence?.coreDestinationIds)
    ? navigationEvidence.coreDestinationIds
    : []) {
    if (!coveredTargets.has(coreId) && !destinationIds.has(coreId)) {
      add(diagnostics, "CORE_DESTINATION_COVERAGE_MISSING", "/segmentPlans", `Core destination '${coreId}' is not covered by the six-capture plan.`);
    }
  }
}

export function validatePlaythroughPlan(value, expected = {}) {
  const diagnostics = [];
  if (!isObject(value) || value.kind !== "worldkit-playthrough-plan" || value.schemaVersion !== 3) {
    add(diagnostics, "PLAYTHROUGH_IDENTITY_INVALID", "", "Playthrough Plan identity is invalid.");
    return { ok: false, diagnostics };
  }
  if (!ID.test(value.id ?? "") || !ID.test(value.sceneId ?? "") ||
      (expected.sceneId && value.sceneId !== expected.sceneId) ||
      !integer(value.seed) || value.seed < 0 ||
      value.deliveryDurationSeconds !== PLAYTHROUGH_DELIVERY_DURATION_SECONDS ||
      value.executionDurationSeconds !== PLAYTHROUGH_EXECUTION_DURATION_SECONDS ||
      value.segmentCount !== PLAYTHROUGH_SEGMENT_COUNT ||
      value.segmentDeliverySeconds !== PLAYTHROUGH_SEGMENT_DELIVERY_SECONDS ||
      value.segmentExecutionSeconds !== PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS ||
      value.cameraResetBufferSeconds !== PLAYTHROUGH_CAMERA_RESET_BUFFER_SECONDS ||
      value.simulationTickRate !== 60 || value.captureFrameRate !== 24 ||
      value.frameCount !== PLAYTHROUGH_FRAME_COUNT ||
      value.executionFrameCount !== PLAYTHROUGH_EXECUTION_FRAME_COUNT ||
      !string(value.controlledEntityId, 2) || !SHA256.test(value.navigationEvidenceHash ?? "") ||
      !string(value.worldPackageRootHash, 1) ||
      (value.worldPackageRootHash !== "unavailable" && !SHA256.test(value.worldPackageRootHash))) {
    add(diagnostics, "PLAYTHROUGH_HEADER_INVALID", "", "Plan header, timing, scene, subject, or world hash is invalid.");
  }
  if (!string(value.motionRenderingGuidance, 100)) {
    add(diagnostics, "MOTION_RENDERING_GUIDANCE_INVALID", "/motionRenderingGuidance", "Plan needs scene-specific final locomotion micro-animation guidance.");
  }
  const navigationEvidence = expected.navigationEvidence;
  if (navigationEvidence !== undefined && (
    !isObject(navigationEvidence) ||
    navigationEvidence.kind !== "worldkit-episode-navigation-evidence" ||
    navigationEvidence.schemaVersion !== 1 ||
    navigationEvidence.sceneId !== value.sceneId ||
    !SHA256.test(navigationEvidence.source?.worldModuleContentHash ?? "") ||
    !Array.isArray(navigationEvidence.destinations) ||
    !Array.isArray(navigationEvidence.coreDestinationIds) ||
    !Array.isArray(navigationEvidence.corridors)
  )) {
    add(
      diagnostics,
      "NAVIGATION_EVIDENCE_INVALID",
      "/navigationEvidenceHash",
      "Host navigation evidence identity, scene, destinations, or corridors are invalid.",
    );
  }
  if (navigationEvidence !== undefined && value.navigationEvidenceHash !==
      sha256Canonical(navigationEvidence)) {
    add(diagnostics, "NAVIGATION_EVIDENCE_HASH_MISMATCH", "/navigationEvidenceHash", "Plan must bind the exact Host navigation evidence.");
  }
  if (navigationEvidence !== undefined) {
    const spawn = finiteVec3(navigationEvidence?.spawn?.positionMetersXYZ);
    const coreIds = new Set(Array.isArray(navigationEvidence?.coreDestinationIds)
      ? navigationEvidence.coreDestinationIds
      : []);
    const corePositions = (Array.isArray(navigationEvidence?.destinations)
      ? navigationEvidence.destinations
      : [])
      .filter((destination) => coreIds.has(destination?.id))
      .map((destination) => finiteVec3(destination?.positionMetersXYZ))
      .filter(Boolean);
    const { minimumMaximumDistanceMeters } = explorationScaleThresholds(
      navigationEvidence,
    );
    const maximumCoreDistanceMeters = spawn && corePositions.length > 0
      ? Math.max(...corePositions.map((position) => Math.hypot(
          position[0] - spawn[0],
          position[2] - spawn[2],
        )))
      : 0;
    if (maximumCoreDistanceMeters < minimumMaximumDistanceMeters) {
      add(
        diagnostics,
        "NAVIGATION_EXPLORATION_SCALE_INSUFFICIENT",
        "/navigationEvidenceHash",
        "Core destinations are compressed near spawn and do not cover a meaningful share of the reachable world.",
      );
    }
  }
  validateSegmentPlans(value, diagnostics, navigationEvidence);
  validateInputIntervals(value, diagnostics);
  validateCameraEvents(value, diagnostics);
  if (Object.prototype.hasOwnProperty.call(value, "seedancePromptEvents")) {
    add(
      diagnostics,
      "PLAYTHROUGH_EVENT_AUTHORITY_VIOLATION",
      "/seedancePromptEvents",
      "Playthrough Planner must not author visual events; Gemini Flash owns the later styled-frame stage.",
    );
  }
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
