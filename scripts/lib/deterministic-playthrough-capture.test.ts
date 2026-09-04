import { describe, expect, it } from "vitest";

import {
  cameraGestureDurationMs,
  cameraKeysForEvent,
  locomotionRequiresJumpCameraSuppression,
} from "./deterministic-playthrough-capture";

describe("deterministic playthrough camera controls", () => {
  it("maps camera deltas to canonical I/J/K/L controls", () => {
    expect(cameraKeysForEvent({
      yawDeltaRadians: -0.2,
      pitchDeltaRadians: 0.1,
    })).toEqual(["J", "I"]);
    expect(cameraKeysForEvent({
      yawDeltaRadians: 0.2,
      pitchDeltaRadians: -0.1,
    })).toEqual(["L", "K"]);
  });

  it("keeps camera gestures visible without micro-taps", () => {
    expect(cameraGestureDurationMs({
      yawDeltaRadians: 0.1,
      pitchDeltaRadians: 0,
    })).toBe(800);
    expect(cameraGestureDurationMs({
      yawDeltaRadians: 1,
      pitchDeltaRadians: 0,
    })).toBe(1_800);
  });

  it("suppresses manual camera input until an explicit jump is grounded again", () => {
    expect(locomotionRequiresJumpCameraSuppression({
      mobilityMode: "airborne",
      supportMode: "unsupported",
      verticalPhase: "rising",
    })).toBe(true);
    expect(locomotionRequiresJumpCameraSuppression({
      mobilityMode: "walk",
      supportMode: "supported",
      verticalPhase: "grounded",
    })).toBe(false);
    expect(locomotionRequiresJumpCameraSuppression(null)).toBe(true);
  });
});
