import type {
  CaptureScheduleEntryV1,
  CaptureSchedulePlanV1,
  SimulationTakeV1,
} from "./types";

function compileConstantFrameRateEntries(
  take: SimulationTakeV1,
): readonly CaptureScheduleEntryV1[] {
  const schedule = take.captureSchedule;
  if (schedule.kind !== "constant-frame-rate") return [];
  const tickNumerator =
    take.simulationTickRate.numeratorTicks * schedule.captureFrameRate.denominatorSeconds;
  const tickDenominator =
    take.simulationTickRate.denominatorSeconds * schedule.captureFrameRate.numeratorFrames;
  const entries: CaptureScheduleEntryV1[] = [];
  for (let captureFrameIndex = 0; ; captureFrameIndex += 1) {
    const simulationTick = schedule.firstCaptureTick + Math.floor(
      (captureFrameIndex * tickNumerator) / tickDenominator,
    );
    if (simulationTick > schedule.lastCaptureTickInclusive) break;
    entries.push({ captureFrameIndex, simulationTick });
  }
  return entries;
}

export function compileCaptureScheduleV1(take: SimulationTakeV1): CaptureSchedulePlanV1 {
  const entries = take.captureSchedule.kind === "explicit-ticks"
    ? take.captureSchedule.captureTicks.map((simulationTick, captureFrameIndex) => ({
        captureFrameIndex,
        simulationTick,
      }))
    : compileConstantFrameRateEntries(take);
  return {
    kind: "worldkit-capture-schedule-plan",
    schemaVersion: 1,
    entries,
  };
}
