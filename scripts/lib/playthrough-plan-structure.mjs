import {
  PLAYTHROUGH_CAMERA_RESET_WINDOWS,
  PLAYTHROUGH_CAPTURE_FPS,
  PLAYTHROUGH_DELIVERY_DURATION_SECONDS,
  PLAYTHROUGH_EXECUTION_DURATION_SECONDS,
  PLAYTHROUGH_EXECUTION_FRAME_COUNT,
  PLAYTHROUGH_FRAME_COUNT,
  PLAYTHROUGH_SEGMENT_COUNT,
  PLAYTHROUGH_SEGMENT_DELIVERY_SECONDS,
  PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS,
  sha256Canonical,
} from "./playthrough-dataset.mjs";

const idPattern = /^[a-z0-9][a-z0-9-]{2,119}$/;
const hashPattern = /^sha256:[a-f0-9]{64}$/;
const rawKeys = new Set(["W", "A", "S", "D", "Shift", "Space"]);
const semanticActions = new Set([
  "move-forward", "move-backward", "move-left", "move-right", "run",
  "jump", "boost", "brake", "primary-action", "secondary-action",
]);
const SEGMENT_OPENING_FORWARD_SECONDS = 2;
// Space is only the edge that starts a jump. The actual takeoff, airborne and
// landing phases continue after that short input interval, so camera admission
// must protect the whole gesture rather than only the key-down milliseconds.
export const PLAYTHROUGH_CAMERA_JUMP_LEAD_SECONDS = 0.35;
export const PLAYTHROUGH_CAMERA_JUMP_SETTLE_SECONDS = 1.75;

function diagnostic(diagnostics, code, path, message) {
  diagnostics.push({ code, path, message });
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function samePosition(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === 3 &&
    right.length === 3 && left.every((component, axis) => component === right[axis]);
}

function overlapsReset(startSeconds, endSeconds) {
  return PLAYTHROUGH_CAMERA_RESET_WINDOWS.some((window) =>
    startSeconds < window.endSeconds && endSeconds > window.startSeconds);
}

/**
 * Structural Host admission only. The model owns route quality, destination
 * choice, key distribution, camera creativity and exploration style.
 */
export function validatePlaythroughPlanStructure(value, expected = {}) {
  const diagnostics = [];
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.kind !== "worldkit-playthrough-plan" || value.schemaVersion !== 3) {
    return {
      ok: false,
      diagnostics: [{
        code: "PLAYTHROUGH_STRUCTURE_INVALID",
        path: "",
        message: "Playthrough Plan identity is invalid.",
      }],
    };
  }
  if (!idPattern.test(value.id ?? "") || !idPattern.test(value.sceneId ?? "") ||
      expected.sceneId && value.sceneId !== expected.sceneId ||
      value.deliveryDurationSeconds !== PLAYTHROUGH_DELIVERY_DURATION_SECONDS ||
      value.executionDurationSeconds !== PLAYTHROUGH_EXECUTION_DURATION_SECONDS ||
      value.segmentCount !== PLAYTHROUGH_SEGMENT_COUNT ||
      value.segmentDeliverySeconds !== PLAYTHROUGH_SEGMENT_DELIVERY_SECONDS ||
      value.segmentExecutionSeconds !== PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS ||
      value.cameraResetBufferSeconds !== 0 || value.simulationTickRate !== 60 ||
      value.captureFrameRate !== PLAYTHROUGH_CAPTURE_FPS ||
      value.frameCount !== PLAYTHROUGH_FRAME_COUNT ||
      value.executionFrameCount !== PLAYTHROUGH_EXECUTION_FRAME_COUNT ||
      typeof value.controlledEntityId !== "string") {
    diagnostic(
      diagnostics,
      "PLAYTHROUGH_HEADER_INVALID",
      "",
      "Plan identity, timing, scene, or controlled Subject is invalid.",
    );
  }
  if (expected.navigationEvidence && (
    !hashPattern.test(value.navigationEvidenceHash ?? "") ||
    value.navigationEvidenceHash !== sha256Canonical(expected.navigationEvidence)
  )) {
    diagnostic(
      diagnostics,
      "PLAYTHROUGH_NAVIGATION_BINDING_INVALID",
      "/navigationEvidenceHash",
      "Plan must bind the Host-provided navigation context.",
    );
  }
  if (expected.navigationEvidence && (
    !Array.isArray(expected.navigationEvidence.safeStartViewCatalog) ||
    expected.navigationEvidence.safeStartViewCatalog.length <
      PLAYTHROUGH_SEGMENT_COUNT
  )) {
    diagnostic(
      diagnostics,
      "PLAYTHROUGH_START_VIEW_CATALOG_MISSING",
      "/segmentPlans",
      "Navigation evidence must provide at least six camera-clear start position/facing pairs.",
    );
  }
  if (!Array.isArray(value.segmentPlans) ||
      value.segmentPlans.length !== PLAYTHROUGH_SEGMENT_COUNT) {
    diagnostic(diagnostics, "PLAYTHROUGH_SEGMENTS_INVALID", "/segmentPlans", "Exactly six independent 30-second capture descriptions are required.");
  } else {
    const admittedStarts = Array.isArray(expected.navigationEvidence?.safeStandPositionCatalog)
      ? expected.navigationEvidence.safeStandPositionCatalog
      : null;
    const admittedStartViews = Array.isArray(expected.navigationEvidence?.safeStartViewCatalog)
      ? expected.navigationEvidence.safeStartViewCatalog
      : null;
    const seenStarts = new Set();
    value.segmentPlans.forEach((segment, index) => {
      if (segment?.segmentId !== `segment-0${index}` ||
          segment?.executionStartSeconds !== index * PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS ||
          segment?.deliveryDurationSeconds !== PLAYTHROUGH_SEGMENT_DELIVERY_SECONDS ||
          segment?.cameraResetBufferSeconds !== 0 ||
          !Array.isArray(segment?.initialPositionMetersXYZ) ||
          segment.initialPositionMetersXYZ.length !== 3 ||
          segment.initialPositionMetersXYZ.some((component) => !finiteNumber(component)) ||
          !finiteNumber(segment?.initialFacingYawRadians) ||
          typeof segment?.purpose !== "string" || !segment.purpose.trim()) {
        diagnostic(
          diagnostics,
          "PLAYTHROUGH_SEGMENT_STRUCTURE_INVALID",
          `/segmentPlans/${index}`,
          "Segment identity, timing, or purpose is invalid.",
        );
      }
      if (admittedStarts !== null &&
          !admittedStarts.some((position) =>
            samePosition(position, segment?.initialPositionMetersXYZ))) {
        diagnostic(
          diagnostics,
          "PLAYTHROUGH_START_NOT_ADMITTED",
          `/segmentPlans/${index}/initialPositionMetersXYZ`,
          "Every capture start must exactly match a Host-admitted safe stand position.",
        );
      }
      if (admittedStartViews !== null &&
          !admittedStartViews.some((startView) =>
            samePosition(
              startView?.initialPositionMetersXYZ,
              segment?.initialPositionMetersXYZ,
            ) && startView?.initialFacingYawRadians ===
              segment?.initialFacingYawRadians)) {
        diagnostic(
          diagnostics,
          "PLAYTHROUGH_START_VIEW_NOT_ADMITTED",
          `/segmentPlans/${index}`,
          "Every capture start must use one exact Host-admitted camera-clear position and facing pair.",
        );
      }
      const startKey = Array.isArray(segment?.initialPositionMetersXYZ)
        ? segment.initialPositionMetersXYZ.join(",")
        : "";
      if (startKey && seenStarts.has(startKey)) {
        diagnostic(
          diagnostics,
          "PLAYTHROUGH_START_DUPLICATED",
          `/segmentPlans/${index}/initialPositionMetersXYZ`,
          "The six independent captures require different admitted start positions.",
        );
      }
      if (startKey) seenStarts.add(startKey);
    });
  }
  if (!Array.isArray(value.inputIntervals) || value.inputIntervals.length === 0 ||
      value.inputIntervals.length > 240) {
    diagnostic(diagnostics, "PLAYTHROUGH_INPUTS_INVALID", "/inputIntervals", "Expected 1-240 input intervals.");
  } else {
    let previousEndSeconds = 0;
    value.inputIntervals.forEach((interval, index) => {
      const path = `/inputIntervals/${index}`;
      const startSeconds = interval?.startSeconds;
      const endSeconds = interval?.endSeconds;
      if (!idPattern.test(interval?.id ?? "") || !finiteNumber(startSeconds) ||
          !finiteNumber(endSeconds) || startSeconds < previousEndSeconds ||
          endSeconds <= startSeconds || startSeconds < 0 ||
          endSeconds > PLAYTHROUGH_EXECUTION_DURATION_SECONDS ||
          Math.floor(startSeconds / PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS) !==
            Math.floor((endSeconds - 1e-9) / PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS) ||
          overlapsReset(startSeconds, endSeconds) ||
          !Array.isArray(interval?.rawKeys) || interval.rawKeys.length === 0 ||
          interval.rawKeys.some((key) => !rawKeys.has(key)) ||
          !Array.isArray(interval?.semanticActions) ||
          interval.semanticActions.length === 0 ||
          interval.semanticActions.some((action) => !semanticActions.has(action))) {
        diagnostic(
          diagnostics,
          "PLAYTHROUGH_INPUT_STRUCTURE_INVALID",
          path,
          "Input must be ordered, supported, and outside Host reset seconds.",
        );
      }
      previousEndSeconds = finiteNumber(endSeconds)
        ? Math.max(previousEndSeconds, endSeconds)
        : previousEndSeconds;
    });
    for (let segmentIndex = 0;
      segmentIndex < PLAYTHROUGH_SEGMENT_COUNT;
      segmentIndex += 1) {
      const segmentStartSeconds =
        segmentIndex * PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS;
      const openingEndSeconds = segmentStartSeconds +
        SEGMENT_OPENING_FORWARD_SECONDS;
      const openingIntervals = value.inputIntervals.filter((interval) =>
        finiteNumber(interval?.startSeconds) &&
        finiteNumber(interval?.endSeconds) &&
        interval.startSeconds < openingEndSeconds &&
        interval.endSeconds > segmentStartSeconds);
      let coveredUntilSeconds = segmentStartSeconds;
      for (const interval of openingIntervals) {
        if (interval.startSeconds > coveredUntilSeconds + 1e-9 ||
            !interval.rawKeys?.includes("W") ||
            interval.rawKeys?.includes("S") ||
            interval.rawKeys?.includes("Space")) {
          diagnostic(
            diagnostics,
            "PLAYTHROUGH_SEGMENT_OPENING_FORWARD_INVALID",
            `/inputIntervals`,
            `Segment ${segmentIndex + 1} must hold W continuously for its first two seconds without S or Space.`,
          );
          coveredUntilSeconds = -1;
          break;
        }
        coveredUntilSeconds = Math.max(
          coveredUntilSeconds,
          Math.min(interval.endSeconds, openingEndSeconds),
        );
        if (coveredUntilSeconds >= openingEndSeconds - 1e-9) break;
      }
      if (coveredUntilSeconds >= 0 &&
          coveredUntilSeconds < openingEndSeconds - 1e-9) {
        diagnostic(
          diagnostics,
          "PLAYTHROUGH_SEGMENT_OPENING_FORWARD_INVALID",
          `/inputIntervals`,
          `Segment ${segmentIndex + 1} must hold W continuously for its first two seconds without S or Space.`,
        );
      }
    }
  }
  if (!Array.isArray(value.cameraEvents) || value.cameraEvents.length === 0 ||
      value.cameraEvents.length > 80) {
    diagnostic(diagnostics, "PLAYTHROUGH_CAMERA_EVENTS_INVALID", "/cameraEvents", "Expected 1-80 camera events.");
  } else {
    let previousSeconds = -1;
    value.cameraEvents.forEach((event, index) => {
      const atSeconds = event?.atSeconds;
      if (!idPattern.test(event?.id ?? "") || !finiteNumber(atSeconds) ||
          atSeconds <= previousSeconds || atSeconds < 0 ||
          atSeconds >= PLAYTHROUGH_EXECUTION_DURATION_SECONDS ||
          overlapsReset(atSeconds, atSeconds + 0.001) ||
          !finiteNumber(event?.yawDeltaRadians) ||
          !finiteNumber(event?.pitchDeltaRadians) ||
          Math.abs(event.yawDeltaRadians) > 1.2 ||
          Math.abs(event.pitchDeltaRadians) > 0.6) {
        diagnostic(
          diagnostics,
          "PLAYTHROUGH_CAMERA_EVENT_STRUCTURE_INVALID",
          `/cameraEvents/${index}`,
          "Camera event time or delta is invalid.",
        );
      }
      if (finiteNumber(atSeconds)) previousSeconds = atSeconds;
    });
    const jumps = Array.isArray(value.inputIntervals)
      ? value.inputIntervals.filter((interval) =>
        interval?.rawKeys?.includes("Space") ||
        interval?.semanticActions?.includes("jump"))
      : [];
    for (const [cameraIndex, event] of value.cameraEvents.entries()) {
      const gestureDurationSeconds = Math.max(
        0.8,
        Math.min(
          1.8,
          Math.max(
            Math.abs(event?.yawDeltaRadians ?? 0),
            Math.abs(event?.pitchDeltaRadians ?? 0),
          ) * 3,
        ),
      );
      const cameraStartSeconds = event?.atSeconds;
      const cameraEndSeconds = cameraStartSeconds + gestureDurationSeconds;
      if (jumps.some((jump) => {
        const protectedStartSeconds = Math.max(
          Math.floor(jump.startSeconds / PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS) *
            PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS,
          jump.startSeconds - PLAYTHROUGH_CAMERA_JUMP_LEAD_SECONDS,
        );
        const protectedEndSeconds = Math.min(
          (Math.floor(jump.startSeconds / PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS) + 1) *
            PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS,
          jump.endSeconds + PLAYTHROUGH_CAMERA_JUMP_SETTLE_SECONDS,
        );
        return cameraStartSeconds < protectedEndSeconds &&
          cameraEndSeconds > protectedStartSeconds;
      })) {
        diagnostic(
          diagnostics,
          "PLAYTHROUGH_JUMP_CAMERA_OVERLAP_INVALID",
          `/cameraEvents/${cameraIndex}`,
          "Camera rotation must stay outside the complete jump takeoff, airborne, landing and settle window.",
        );
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "seedancePromptEvents")) {
    diagnostic(
      diagnostics,
      "PLAYTHROUGH_VISUAL_EVENT_AUTHORITY_INVALID",
      "/seedancePromptEvents",
      "Visual events belong to the later Gemini stage.",
    );
  }
  return diagnostics.length === 0
    ? { ok: true, value, diagnostics: [] }
    : { ok: false, diagnostics };
}
