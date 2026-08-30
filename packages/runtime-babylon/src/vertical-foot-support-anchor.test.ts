import type { JumpEpisodeStateV1 } from "@whitebox-world/character-movement";
import { describe, expect, it } from "vitest";

import {
  VerticalFootSupportAnchorV1,
  type VerticalFootSupportProjectionV1,
} from "./vertical-foot-support-anchor.js";

function episode(
  committedTick: number,
  phase: "anticipating" | "airborne",
): JumpEpisodeStateV1 {
  return phase === "anticipating"
    ? Object.freeze({
        schemaVersion: 1,
        variant: "small",
        phase,
        startedTick: 1,
        anticipationStartedTick: 1,
        committedTick,
        anticipationTicksRemaining: 1,
      })
    : Object.freeze({
        schemaVersion: 1,
        variant: "small",
        phase,
        startedTick: 1,
        anticipationStartedTick: 1,
        takeoffTick: 2,
        committedTick,
      });
}

function projection(
  committedTick: number,
  jumpEpisode?: JumpEpisodeStateV1,
): VerticalFootSupportProjectionV1 {
  return Object.freeze({
    committedTick,
    presentationKey: jumpEpisode?.phase === "anticipating"
      ? "locomotion.small-jump.takeoff"
      : jumpEpisode?.phase === "airborne"
        ? "locomotion.small-jump.airborne"
        : "locomotion.idle",
    ...(jumpEpisode === undefined ? {} : { jumpEpisode }),
  });
}

function harness(authoredOffsetY = 0) {
  let adjustmentOffsetY = authoredOffsetY;
  let animatedFootHeightY = 0.08;
  let authorityRootY = 3;
  const anchor = new VerticalFootSupportAnchorV1({
    readAdjustmentOffsetY: () => adjustmentOffsetY,
    writeAdjustmentOffsetY: (value) => {
      adjustmentOffsetY = value;
    },
    sampleMinimumFootHeightFromVisualRoot: () =>
      animatedFootHeightY + adjustmentOffsetY,
  });
  return {
    anchor,
    get adjustmentOffsetY() { return adjustmentOffsetY; },
    get authorityRootY() { return authorityRootY; },
    set authorityRootY(value: number) { authorityRootY = value; },
    set animatedFootHeightY(value: number) { animatedFootHeightY = value; },
  };
}

describe("VerticalFootSupportAnchorV1", () => {
  it("anchors only its local adjustment during committed anticipation", () => {
    const subject = harness();
    const beforeAuthorityY = subject.authorityRootY;
    subject.anchor.updateCommittedProjection(projection(1, episode(1, "anticipating")));
    subject.anchor.applyAfterPose();

    subject.animatedFootHeightY = 0.28;
    subject.anchor.updateCommittedProjection(projection(2, episode(2, "anticipating")));
    subject.anchor.applyAfterPose();

    expect(subject.adjustmentOffsetY).toBeCloseTo(-0.2, 8);
    expect(subject.authorityRootY).toBe(beforeAuthorityY);
    expect(Number.isFinite(subject.adjustmentOffsetY)).toBe(true);
  });

  it("holds the last visual correction in air and reacquires continuously on landing", () => {
    const subject = harness(0.08);
    subject.anchor.updateCommittedProjection(projection(1, episode(1, "anticipating")));
    subject.anchor.applyAfterPose();
    subject.animatedFootHeightY = 0.42;
    subject.anchor.updateCommittedProjection(projection(2, episode(2, "anticipating")));
    subject.anchor.applyAfterPose();
    const takeoffOffsetY = subject.adjustmentOffsetY;

    subject.animatedFootHeightY = 0.76;
    subject.anchor.updateCommittedProjection(projection(3, episode(3, "airborne")));
    subject.anchor.applyAfterPose();
    expect(subject.adjustmentOffsetY).toBe(takeoffOffsetY);

    subject.animatedFootHeightY = 0.03;
    subject.anchor.updateCommittedProjection(projection(4));
    subject.anchor.applyAfterPose();
    expect(Math.abs(subject.adjustmentOffsetY - takeoffOffsetY)).toBeLessThanOrEqual(0.030000001);

    subject.anchor.updateCommittedProjection(projection(5));
    subject.anchor.applyAfterPose();
    expect(Math.abs(subject.adjustmentOffsetY - 0.08)).toBeLessThan(
      Math.abs(takeoffOffsetY - 0.08),
    );
  });

  it("does not apply a correction twice for one committed Tick", () => {
    const subject = harness();
    subject.anchor.updateCommittedProjection(projection(1, episode(1, "anticipating")));
    subject.anchor.applyAfterPose();
    subject.animatedFootHeightY = 0.28;
    subject.anchor.updateCommittedProjection(projection(2, episode(2, "anticipating")));
    subject.anchor.applyAfterPose();
    const once = subject.adjustmentOffsetY;
    subject.animatedFootHeightY = 0.48;
    subject.anchor.applyAfterPose();
    expect(subject.adjustmentOffsetY).toBe(once);
  });

  it("disables invalid foot samples without contaminating the visual transform", () => {
    let adjustmentOffsetY = 0.12;
    const anchor = new VerticalFootSupportAnchorV1({
      readAdjustmentOffsetY: () => adjustmentOffsetY,
      writeAdjustmentOffsetY: (value) => {
        adjustmentOffsetY = value;
      },
      sampleMinimumFootHeightFromVisualRoot: () => Number.NaN,
    });
    anchor.updateCommittedProjection(projection(1, episode(1, "anticipating")));
    anchor.applyAfterPose();
    expect(adjustmentOffsetY).toBe(0.12);
    expect(Number.isFinite(adjustmentOffsetY)).toBe(true);
  });

  it("keeps instances isolated and reset/dispose idempotent", () => {
    const left = harness();
    const right = harness(0.1);
    left.anchor.updateCommittedProjection(projection(1, episode(1, "anticipating")));
    left.anchor.applyAfterPose();
    left.animatedFootHeightY = 0.28;
    left.anchor.updateCommittedProjection(projection(2, episode(2, "anticipating")));
    left.anchor.applyAfterPose();

    expect(left.adjustmentOffsetY).not.toBe(0);
    expect(right.adjustmentOffsetY).toBe(0.1);
    left.anchor.reset();
    left.anchor.reset();
    expect(left.adjustmentOffsetY).toBe(0);
    left.anchor.dispose();
    left.anchor.dispose();
    expect(() => left.anchor.updateCommittedProjection(projection(3))).toThrow(
      "VERTICAL_FOOT_SUPPORT_ANCHOR_DISPOSED",
    );
  });
});
