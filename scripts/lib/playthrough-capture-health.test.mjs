import assert from "node:assert/strict";
import test from "node:test";

import { validatePlaythroughCaptureHealth } from "./playthrough-capture-health.mjs";

function samples({ stationary = false, stalled = false } = {}) {
  return Array.from({ length: 241 }, (_, index) => ({
    actualSeconds: index / 24,
    simulationTick: stalled && index > 24 ? 60 : index * 2,
    subject: {
      positionMetersXYZ: [stationary ? 0 : index * 0.02, 0.5, 0],
    },
  }));
}

function samplesWithStationaryWindow({ startSeconds, endSeconds }) {
  let position = 0;
  return Array.from({ length: 361 }, (_, index) => {
    const actualSeconds = index / 24;
    const stationary = actualSeconds > startSeconds &&
      actualSeconds <= endSeconds;
    if (index > 0 && !stationary) position += 0.02;
    return {
      actualSeconds,
      simulationTick: index * 2,
      subject: { positionMetersXYZ: [position, 0.5, 0] },
    };
  });
}

test("accepts healthy moving fixed-step capture without judging the route", () => {
  const result = validatePlaythroughCaptureHealth({ telemetrySamples: samples() });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
});

test("rejects a capture whose Subject remains at spawn", () => {
  const result = validatePlaythroughCaptureHealth({
    telemetrySamples: samples({ stationary: true }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) =>
    code === "CAPTURE_SUBJECT_DID_NOT_MOVE"));
});

test("rejects a Runtime Tick stall", () => {
  const result = validatePlaythroughCaptureHealth({
    telemetrySamples: samples({ stalled: true }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) =>
    code === "CAPTURE_RUNTIME_STALLED"));
});

test("rejects more than ten consecutive seconds without Subject movement", () => {
  const result = validatePlaythroughCaptureHealth({
    telemetrySamples: samplesWithStationaryWindow({
      startSeconds: 2,
      endSeconds: 12.25,
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) =>
    code === "CAPTURE_SUBJECT_STATIONARY_TOO_LONG"));
  assert.ok(result.metrics.maximumSubjectStationarySeconds > 10);
});

test("accepts a purposeful stationary interval that does not exceed ten seconds", () => {
  const result = validatePlaythroughCaptureHealth({
    telemetrySamples: samplesWithStationaryWindow({
      startSeconds: 2,
      endSeconds: 12,
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.ok(result.metrics.maximumSubjectStationarySeconds <= 10);
});

test("rejects a ground Subject that keeps falling while Runtime Tick advances", () => {
  const result = validatePlaythroughCaptureHealth({
    telemetrySamples: Array.from({ length: 241 }, (_, index) => ({
      actualSeconds: index / 24,
      simulationTick: index * 2,
      subject: {
        positionMetersXYZ: [0, 12 - index * 0.05, 0],
        locomotion: {
          movementMedium: "ground",
          mobilityMode: "grounded",
          supportMode: "unsupported",
          verticalPhase: "falling",
        },
      },
    })),
  });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) =>
    code === "CAPTURE_SUBJECT_UNINTENDED_FALL"));
});

test("does not classify intentional air movement as a ground fall", () => {
  const result = validatePlaythroughCaptureHealth({
    telemetrySamples: Array.from({ length: 241 }, (_, index) => ({
      actualSeconds: index / 24,
      simulationTick: index * 2,
      subject: {
        positionMetersXYZ: [index * 0.05, 12 - index * 0.05, 0],
        locomotion: {
          movementMedium: "air",
          mobilityMode: "flight",
          supportMode: "unsupported",
          verticalPhase: "descending",
        },
      },
    })),
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
});
