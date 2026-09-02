const fatalRuntimePattern =
  /WORLDKIT_RUNTIME_(?:FRAME|FRAME_RECOVERY)_FAILED|ADAPTER_FIXED_INPUT_FAILED/;

export const PLAYTHROUGH_CAPTURE_HEALTH_POLICY =
  "runtime-and-continuous-motion-health-v2";

const MAXIMUM_SUBJECT_STATIONARY_SECONDS = 10;
const STATIONARY_SPEED_METERS_PER_SECOND = 0.05;
const MAXIMUM_UNSUPPORTED_GROUND_SECONDS = 1.5;
const MAXIMUM_UNINTENDED_GROUND_DROP_METERS = 3;

function finitePosition(value) {
  return Array.isArray(value) && value.length === 3 &&
    value.every((item) => Number.isFinite(item))
    ? value.map(Number)
    : null;
}

function diagnostic(code, path, message) {
  return { code, path, message };
}

/**
 * Minimal Host health check. This deliberately does not judge route choice,
 * destination arrival, key distribution, camera creativity, or exploration
 * quality. Those remain Planner/model output and human-review concerns.
 */
export function validatePlaythroughCaptureHealth(input) {
  const diagnostics = [];
  const samples = Array.isArray(input?.telemetrySamples)
    ? input.telemetrySamples
      .filter((sample) => Number.isFinite(sample?.actualSeconds))
      .sort((left, right) => left.actualSeconds - right.actualSeconds)
    : [];
  const consoleErrors = Array.isArray(input?.consoleErrors)
    ? input.consoleErrors.map(String)
    : [];
  if (samples.length < 2) {
    diagnostics.push(diagnostic(
      "CAPTURE_TELEMETRY_MISSING",
      "/telemetrySamples",
      "Runtime telemetry is missing.",
    ));
    return { ok: false, diagnostics, metrics: {} };
  }
  if (consoleErrors.some((message) => fatalRuntimePattern.test(message))) {
    diagnostics.push(diagnostic(
      "CAPTURE_RUNTIME_FAILED",
      "/consoleErrors",
      "Runtime reported a fatal frame or input failure.",
    ));
  }
  let pathLengthMeters = 0;
  let maximumDistanceFromStartMeters = 0;
  let maximumTickStallSeconds = 0;
  let tickStallSeconds = 0;
  let subjectStationarySeconds = 0;
  let maximumSubjectStationarySeconds = 0;
  let subjectStationaryStartedAtSeconds = null;
  let maximumSubjectStationaryStartedAtSeconds = null;
  let unsupportedGroundSeconds = 0;
  let maximumUnsupportedGroundSeconds = 0;
  let minimumGroundHeightMeters = Number.POSITIVE_INFINITY;
  let initialGroundHeightMeters = null;
  const firstPosition = finitePosition(samples[0]?.subject?.positionMetersXYZ);
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const deltaSeconds = current.actualSeconds - previous.actualSeconds;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || deltaSeconds > 0.5) {
      continue;
    }
    if (!Number.isSafeInteger(previous.simulationTick) ||
        !Number.isSafeInteger(current.simulationTick) ||
        current.simulationTick < previous.simulationTick) {
      diagnostics.push(diagnostic(
        "CAPTURE_RUNTIME_TICK_INVALID",
        `/telemetrySamples/${index}/simulationTick`,
        "Runtime Tick is missing or non-monotonic.",
      ));
      break;
    }
    if (current.simulationTick === previous.simulationTick) {
      tickStallSeconds += deltaSeconds;
      maximumTickStallSeconds = Math.max(maximumTickStallSeconds, tickStallSeconds);
    } else {
      tickStallSeconds = 0;
    }
    const previousPosition = finitePosition(previous?.subject?.positionMetersXYZ);
    const currentPosition = finitePosition(current?.subject?.positionMetersXYZ);
    if (!previousPosition || !currentPosition) continue;
    const locomotion = current?.subject?.locomotion;
    const groundMotion = locomotion?.movementMedium === "ground" ||
      locomotion?.mobilityMode === "grounded";
    if (groundMotion) {
      if (initialGroundHeightMeters === null) initialGroundHeightMeters = previousPosition[1];
      minimumGroundHeightMeters = Math.min(minimumGroundHeightMeters, currentPosition[1]);
      if (locomotion?.supportMode === "unsupported") {
        unsupportedGroundSeconds += deltaSeconds;
        maximumUnsupportedGroundSeconds = Math.max(
          maximumUnsupportedGroundSeconds,
          unsupportedGroundSeconds,
        );
      } else {
        unsupportedGroundSeconds = 0;
      }
    } else {
      unsupportedGroundSeconds = 0;
    }
    const stepDistanceMeters = Math.hypot(
      currentPosition[0] - previousPosition[0],
      currentPosition[1] - previousPosition[1],
      currentPosition[2] - previousPosition[2],
    );
    pathLengthMeters += stepDistanceMeters;
    const speedMetersPerSecond = stepDistanceMeters / deltaSeconds;
    if (speedMetersPerSecond <= STATIONARY_SPEED_METERS_PER_SECOND) {
      if (subjectStationaryStartedAtSeconds === null) {
        subjectStationaryStartedAtSeconds = previous.actualSeconds;
      }
      subjectStationarySeconds = current.actualSeconds -
        subjectStationaryStartedAtSeconds;
      if (subjectStationarySeconds > maximumSubjectStationarySeconds) {
        maximumSubjectStationarySeconds = subjectStationarySeconds;
        maximumSubjectStationaryStartedAtSeconds =
          subjectStationaryStartedAtSeconds;
      }
    } else {
      subjectStationarySeconds = 0;
      subjectStationaryStartedAtSeconds = null;
    }
    if (firstPosition) {
      maximumDistanceFromStartMeters = Math.max(
        maximumDistanceFromStartMeters,
        Math.hypot(
          currentPosition[0] - firstPosition[0],
          currentPosition[1] - firstPosition[1],
          currentPosition[2] - firstPosition[2],
        ),
      );
    }
  }
  const sampledDurationSeconds = samples.at(-1).actualSeconds -
    samples[0].actualSeconds;
  const tickProgressRate = sampledDurationSeconds > 0
    ? (samples.at(-1).simulationTick - samples[0].simulationTick) /
      sampledDurationSeconds
    : 0;
  if (maximumTickStallSeconds > 1 || tickProgressRate < 30) {
    diagnostics.push(diagnostic(
      "CAPTURE_RUNTIME_STALLED",
      "/telemetrySamples",
      "Runtime stopped advancing during capture.",
    ));
  }
  if (pathLengthMeters < 1 || maximumDistanceFromStartMeters < 0.5) {
    diagnostics.push(diagnostic(
      "CAPTURE_SUBJECT_DID_NOT_MOVE",
      "/telemetrySamples",
      "The controlled Subject remained effectively at its initial position.",
    ));
  }
  if (maximumSubjectStationarySeconds > MAXIMUM_SUBJECT_STATIONARY_SECONDS) {
    diagnostics.push(diagnostic(
      "CAPTURE_SUBJECT_STATIONARY_TOO_LONG",
      "/telemetrySamples",
      "The controlled Subject remained stationary for more than 10 consecutive seconds.",
    ));
  }
  const maximumGroundDropMeters = initialGroundHeightMeters === null ||
      !Number.isFinite(minimumGroundHeightMeters)
    ? 0
    : initialGroundHeightMeters - minimumGroundHeightMeters;
  if (maximumUnsupportedGroundSeconds > MAXIMUM_UNSUPPORTED_GROUND_SECONDS ||
      maximumGroundDropMeters > MAXIMUM_UNINTENDED_GROUND_DROP_METERS) {
    diagnostics.push(diagnostic(
      "CAPTURE_SUBJECT_UNINTENDED_FALL",
      "/telemetrySamples",
      "A ground-moving Subject lost support or fell below its admitted traversal surface.",
    ));
  }
  const metrics = {
    sampledDurationSeconds,
    tickProgressRate,
    maximumTickStallSeconds,
    pathLengthMeters,
    maximumDistanceFromStartMeters,
    maximumSubjectStationarySeconds,
    maximumSubjectStationaryStartedAtSeconds:
      maximumSubjectStationaryStartedAtSeconds ?? -1,
    stationarySpeedMetersPerSecond: STATIONARY_SPEED_METERS_PER_SECOND,
    maximumAllowedSubjectStationarySeconds:
      MAXIMUM_SUBJECT_STATIONARY_SECONDS,
    maximumUnsupportedGroundSeconds,
    maximumAllowedUnsupportedGroundSeconds: MAXIMUM_UNSUPPORTED_GROUND_SECONDS,
    maximumGroundDropMeters,
    maximumAllowedGroundDropMeters: MAXIMUM_UNINTENDED_GROUND_DROP_METERS,
  };
  return diagnostics.length === 0
    ? { ok: true, diagnostics: [], metrics }
    : { ok: false, diagnostics, metrics };
}
