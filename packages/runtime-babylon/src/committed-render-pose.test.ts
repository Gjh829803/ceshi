import { describe, expect, it } from "vitest";

import {
  CommittedRenderPoseBufferV1,
  type CommittedRenderPoseV1,
} from "./committed-render-pose.js";

function pose(
  committedTick: number,
  positionMetersXYZ: readonly [number, number, number],
  facingYawRadians: number,
): CommittedRenderPoseV1 {
  return Object.freeze({
    committedTick,
    positionMetersXYZ: Object.freeze([...positionMetersXYZ]) as
      readonly [number, number, number],
    facingYawRadians,
  });
}

describe("CommittedRenderPoseBufferV1", () => {
  it("samples the previous, midpoint, and current committed poses without mutating them", () => {
    const previous = pose(0, [0, 1, 2], 0);
    const current = pose(1, [2, 3, 4], Math.PI / 2);
    const buffer = new CommittedRenderPoseBufferV1(previous);

    buffer.commit(current);

    expect(buffer.sample(0)).toEqual(previous);
    expect(buffer.sample(0.5)).toEqual({
      committedTick: 1,
      positionMetersXYZ: [1, 2, 3],
      facingYawRadians: Math.PI / 4,
    });
    expect(buffer.sample(1)).toEqual(current);
    expect(Object.isFrozen(buffer.sample(0.5))).toBe(true);
    expect(Object.isFrozen(buffer.sample(0.5).positionMetersXYZ)).toBe(true);
    expect(previous).toEqual(pose(0, [0, 1, 2], 0));
    expect(current).toEqual(pose(1, [2, 3, 4], Math.PI / 2));
  });

  it("interpolates facing across 179 to -179 degrees on the shortest arc", () => {
    const degrees = (value: number): number => value * Math.PI / 180;
    const buffer = new CommittedRenderPoseBufferV1(
      pose(7, [0, 0, 0], degrees(179)),
    );
    buffer.commit(pose(8, [0, 0, 0], degrees(-179)));

    const midpointDegrees = buffer.sample(0.5).facingYawRadians * 180 / Math.PI;

    expect(Math.abs(midpointDegrees)).toBeCloseTo(180, 10);
  });

  it("reset collapses history and rejects invalid interpolation alpha", () => {
    const buffer = new CommittedRenderPoseBufferV1(pose(0, [0, 0, 0], 0));
    buffer.commit(pose(1, [2, 0, 0], 1));
    const reset = pose(0, [4, 5, 6], -0.5);

    buffer.reset(reset);

    expect(buffer.sample(0)).toEqual(reset);
    expect(buffer.sample(0.5)).toEqual(reset);
    expect(buffer.sample(1)).toEqual(reset);
    expect(() => buffer.sample(Number.NaN)).toThrow(RangeError);
    expect(() => buffer.sample(-0.01)).toThrow(RangeError);
    expect(() => buffer.sample(1.01)).toThrow(RangeError);
  });

  it("exposes an immutable copy of both committed poses for read-only diagnostics", () => {
    const previous = pose(11, [1, 2, 3], 0.25);
    const current = pose(12, [4, 5, 6], 0.5);
    const buffer = new CommittedRenderPoseBufferV1(previous);
    buffer.commit(current);

    const diagnostic = buffer.diagnosticSnapshot();

    expect(diagnostic).toEqual({ previous, current });
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(Object.isFrozen(diagnostic.previous)).toBe(true);
    expect(Object.isFrozen(diagnostic.previous.positionMetersXYZ)).toBe(true);
    expect(Object.isFrozen(diagnostic.current)).toBe(true);
    expect(Object.isFrozen(diagnostic.current.positionMetersXYZ)).toBe(true);
    expect(() => {
      (diagnostic.current.positionMetersXYZ as unknown as number[])[1] = 999;
    }).toThrow(TypeError);
    expect(buffer.sample(1)).toEqual(current);
  });
});
