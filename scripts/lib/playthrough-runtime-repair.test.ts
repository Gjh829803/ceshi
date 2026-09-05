import { describe, expect, it } from "vitest";

import {
  buildPlaythroughRuntimeRepairArtifacts,
  isRepairablePlaythroughRuntimeFailure,
} from "./playthrough-runtime-repair";

describe("playthrough Runtime collision repair", () => {
  const providerFailure = `WORLDKIT_RUNTIME_FIXED_INPUT_FAILED ${JSON.stringify({
    schemaVersion: 1,
    stage: "rollback",
    tick: 1615,
    actions: ["move-forward", "run"],
    errorName: "RangeError",
    errorCode: "3C_INPUT_INVALID",
    errorMessage: "native collision resolution amplified horizontal proposal magnitude",
    controlledSubject: {
      entityId: "player",
      positionMetersXYZ: [-41.82, 6.15, -77.13],
    },
  })}`;

  it("turns one deterministic terrain collision into segment-scoped Planner repair evidence", () => {
    expect(isRepairablePlaythroughRuntimeFailure(providerFailure)).toBe(true);
    const artifacts = buildPlaythroughRuntimeRepairArtifacts({
      sceneId: "scene-runtime-repair",
      planHash: `sha256:${"a".repeat(64)}`,
      segmentId: "segment-05",
      errorMessage: providerFailure,
    });

    expect(artifacts.qualityReport.passed).toBe(false);
    expect(artifacts.qualityReport.diagnostics).toEqual([
      expect.objectContaining({
        code: "CAPTURE_RUNTIME_COLLISION_REPAIR_REQUIRED",
        segmentId: "segment-05",
      }),
    ]);
    expect(artifacts.repairEvidence.failedSegments).toEqual([
      expect.objectContaining({
        segmentId: "segment-05",
        runtimePositionMetersXYZ: [-41.82, 6.15, -77.13],
        activeActions: ["move-forward", "run"],
      }),
    ]);
  });

  it("does not reinterpret arbitrary Runtime failures as route-repair evidence", () => {
    expect(isRepairablePlaythroughRuntimeFailure(
      "WORLDKIT_RUNTIME_FIXED_INPUT_FAILED out of memory",
    )).toBe(false);
  });
});
