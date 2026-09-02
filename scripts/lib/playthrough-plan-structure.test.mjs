import assert from "node:assert/strict";
import test from "node:test";

import { validatePlaythroughPlanStructure } from "./playthrough-plan-structure.mjs";

function plan() {
  return {
    kind: "worldkit-playthrough-plan",
    schemaVersion: 3,
    id: "episode-open-plan",
    sceneId: "scene-open",
    seed: 1,
    deliveryDurationSeconds: 180,
    executionDurationSeconds: 180,
    segmentCount: 6,
    segmentDeliverySeconds: 30,
    segmentExecutionSeconds: 30,
    cameraResetBufferSeconds: 0,
    simulationTickRate: 60,
    captureFrameRate: 24,
    frameCount: 4320,
    executionFrameCount: 4320,
    controlledEntityId: "player",
    worldPackageRootHash: "unavailable",
    navigationEvidenceHash: `sha256:${"a".repeat(64)}`,
    motionRenderingGuidance: "Model-authored motion guidance.",
    segmentPlans: Array.from({ length: 6 }, (_, index) => ({
      segmentId: `segment-0${index}`,
      executionStartSeconds: index * 30,
      deliveryDurationSeconds: 30,
      cameraResetBufferSeconds: 0,
      initialPositionMetersXYZ: [index * 4, 1, index * 3],
      initialFacingYawRadians: index * 0.2,
      purpose: `Explore freely from independent start ${index}.`,
    })),
    inputIntervals: Array.from({ length: 6 }, (_, index) => ({
      id: `input-0${index}`,
      startSeconds: index * 30,
      endSeconds: index * 30 + 28,
      rawKeys: ["W"],
      semanticActions: ["move-forward"],
      purpose: `Model chooses local exploration from start ${index}.`,
    })),
    cameraEvents: Array.from({ length: 6 }, (_, index) => ({
      id: `camera-0${index}`,
      atSeconds: index * 30 + 5,
      yawDeltaRadians: index % 2 === 0 ? 0.2 : -0.2,
      pitchDeltaRadians: 0.1,
      purpose: `Inspect local world from start ${index}.`,
    })),
  };
}

test("accepts six structurally valid independent captures without judging play style", () => {
  const result = validatePlaythroughPlanStructure(plan(), { sceneId: "scene-open" });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
});

test("rejects an input interval that crosses from one independent capture into another", () => {
  const value = plan();
  value.inputIntervals[0] = {
    ...value.inputIntervals[0],
    startSeconds: 29,
    endSeconds: 31,
  };
  const result = validatePlaythroughPlanStructure(value);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) =>
    code === "PLAYTHROUGH_INPUT_STRUCTURE_INVALID"));
});

test("rejects a capture that omits its Host-relocation start state", () => {
  const value = plan();
  delete value.segmentPlans[4].initialPositionMetersXYZ;
  const result = validatePlaythroughPlanStructure(value);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) =>
    code === "PLAYTHROUGH_SEGMENT_STRUCTURE_INVALID"));
});

test("rejects starts outside the Host-admitted safe position catalog", () => {
  const value = plan();
  const navigationEvidence = {
    safeStandPositionCatalog: value.segmentPlans.map((segment) =>
      segment.initialPositionMetersXYZ),
  };
  value.segmentPlans[3].initialPositionMetersXYZ = [9999, 9999, 9999];
  const result = validatePlaythroughPlanStructure(value, {
    navigationEvidence: {
      ...navigationEvidence,
      kind: "worldkit-episode-navigation-evidence",
      schemaVersion: 1,
      sceneId: value.sceneId,
    },
  });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) =>
    code === "PLAYTHROUGH_START_NOT_ADMITTED"));
});

test("rejects duplicated independent capture starts", () => {
  const value = plan();
  value.segmentPlans[4].initialPositionMetersXYZ =
    value.segmentPlans[0].initialPositionMetersXYZ;
  const result = validatePlaythroughPlanStructure(value);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) =>
    code === "PLAYTHROUGH_START_DUPLICATED"));
});

test("requires continuous W for the first two seconds of every capture", () => {
  const value = plan();
  value.inputIntervals[2] = {
    ...value.inputIntervals[2],
    startSeconds: 61,
    rawKeys: ["S"],
    semanticActions: ["move-backward"],
  };
  const result = validatePlaythroughPlanStructure(value);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) =>
    code === "PLAYTHROUGH_SEGMENT_OPENING_FORWARD_INVALID"));
});

test("rejects camera rotation that overlaps a jump", () => {
  const value = plan();
  value.inputIntervals.splice(0, 1,
    {
      id: "input-00-a",
      startSeconds: 0,
      endSeconds: 10,
      rawKeys: ["W"],
      semanticActions: ["move-forward"],
      purpose: "Walk before jump.",
    },
    {
      id: "input-00-jump",
      startSeconds: 10,
      endSeconds: 10.2,
      rawKeys: ["Space"],
      semanticActions: ["jump"],
      purpose: "Jump while camera stays stable.",
    },
    {
      id: "input-00-b",
      startSeconds: 10.2,
      endSeconds: 28,
      rawKeys: ["W"],
      semanticActions: ["move-forward"],
      purpose: "Continue after jump.",
    },
  );
  value.cameraEvents[0] = {
    ...value.cameraEvents[0],
    atSeconds: 9.8,
  };
  const result = validatePlaythroughPlanStructure(value);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code }) =>
    code === "PLAYTHROUGH_JUMP_CAMERA_OVERLAP_INVALID"));
});
