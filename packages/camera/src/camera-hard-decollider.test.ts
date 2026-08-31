import type { CameraGeometryHitV2 } from "./camera-domain.js";
import { CameraHardDecolliderV1 } from "./camera-hard-decollider.js";
import { describe, expect, it } from "vitest";

function hit(
  distanceMeters: number,
  overrides: Partial<CameraGeometryHitV2> = {},
): CameraGeometryHitV2 {
  return {
    schemaVersion: 2,
    travelDistanceMeters: distanceMeters,
    travelFraction: distanceMeters / 10,
    hitPointMetersXYZ: [0, 0, distanceMeters],
    hitNormalXYZ: [0, 0, -1],
    hitEntityId: "wall-a",
    startedOverlapping: false,
    penetrationDepthMeters: 0,
    obstructionClass: "hard",
    ...overrides,
  };
}

function solve(
  decollider: CameraHardDecolliderV1,
  authorityTick: number,
  geometryHit?: CameraGeometryHitV2,
  overrides: Partial<Parameters<CameraHardDecolliderV1["solve"]>[0]> = {},
) {
  return decollider.solve({
    authorityTick,
    desiredTargetPositionMetersXYZ: [0, 0, 0],
    desiredPositionMetersXYZ: [0, 0, 10],
    currentCommittedPositionMetersXYZ: [0, 0, 10],
    minimumUsableArmLengthMeters: 0.6,
    clearHoldSeconds: 0.12,
    recoveryHalfLifeSeconds: 0.24,
    maximumRecoveryMetersPerSecond: 6,
    deltaSeconds: 0.1,
    ...(geometryHit === undefined ? {} : { geometryHit }),
    ...overrides,
  });
}

describe("CameraHardDecolliderV1", () => {
  it("immediately clamps inward but never exceeds the geometry-safe arm", () => {
    const decollider = new CameraHardDecolliderV1();

    const result = solve(decollider, 1, hit(2.5));

    expect(result.positionMetersXYZ).toEqual([0, 0, 2.5]);
    expect(result.safeArmLengthMeters).toBe(2.5);
    expect(result.effectiveArmLengthMeters).toBe(2.5);
    expect(result.phase).toBe("constrained");
    expect(result.isCollisionRetracted).toBe(true);
    expect(result.stableHitEntityId).toBe("wall-a");
  });

  it("holds clear briefly and then recovers monotonically with a speed cap", () => {
    const decollider = new CameraHardDecolliderV1();
    const constrained = solve(decollider, 1, hit(2));
    const held = solve(decollider, 2, undefined, { deltaSeconds: 0.1 });
    const recovering = solve(decollider, 3, undefined, { deltaSeconds: 0.1 });
    const recoveringAgain = solve(decollider, 4, undefined, { deltaSeconds: 0.1 });

    expect(constrained.effectiveArmLengthMeters).toBe(2);
    expect(held.effectiveArmLengthMeters).toBe(2);
    expect(held.phase).toBe("recovering");
    expect(recovering.effectiveArmLengthMeters).toBeGreaterThan(2);
    expect(recoveringAgain.effectiveArmLengthMeters)
      .toBeGreaterThanOrEqual(recovering.effectiveArmLengthMeters);
    expect(recoveringAgain.effectiveArmLengthMeters - recovering.effectiveArmLengthMeters)
      .toBeLessThanOrEqual(0.6 + 0.000001);
    expect(recoveringAgain.effectiveArmLengthMeters).toBeLessThanOrEqual(10);
  });

  it("does not pop outward when L-corner contacts alternate", () => {
    const decollider = new CameraHardDecolliderV1();
    const first = solve(decollider, 1, hit(2, {
      hitEntityId: "wall-a",
      hitNormalXYZ: [1, 0, 0],
    }));
    const alternateLonger = solve(decollider, 2, hit(2.8, {
      hitEntityId: "wall-b",
      hitNormalXYZ: [0, 0, 1],
    }));
    const alternateShorter = solve(decollider, 3, hit(1.7, {
      hitEntityId: "wall-b",
      hitNormalXYZ: [0, 0, 1],
    }));

    expect(alternateLonger.effectiveArmLengthMeters - first.effectiveArmLengthMeters)
      .toBeLessThanOrEqual(0.6 + 0.000001);
    expect(alternateLonger.stableHitEntityId).toBe("wall-a");
    expect(alternateShorter.effectiveArmLengthMeters).toBe(1.7);
    expect(alternateShorter.stableHitEntityId).toBe("wall-b");
  });

  it("uses the committed safe pose during start overlap instead of collapsing to LookAt", () => {
    const decollider = new CameraHardDecolliderV1();
    const previousSafe = solve(decollider, 1, undefined, {
      desiredPositionMetersXYZ: [0, 0, 5],
      currentCommittedPositionMetersXYZ: [0, 0, 5],
    });
    const overlapping = solve(decollider, 2, hit(0, {
      travelFraction: 0,
      hitPointMetersXYZ: [0.5, 0, 0],
      hitNormalXYZ: [1, 0, 0],
      startedOverlapping: true,
      penetrationDepthMeters: 0.5,
    }), {
      currentCommittedPositionMetersXYZ: previousSafe.positionMetersXYZ,
    });

    expect(overlapping.phase).toBe("emergency-inside");
    expect(overlapping.positionMetersXYZ).toEqual(previousSafe.positionMetersXYZ);
    expect(overlapping.resolvedTargetPositionMetersXYZ[0]).toBeGreaterThan(0.5);
    expect(overlapping.resolvedTargetPositionMetersXYZ[1]).toBe(0);
    expect(overlapping.resolvedTargetPositionMetersXYZ[2]).toBe(0);
    expect(overlapping.effectiveArmLengthMeters).toBeGreaterThanOrEqual(0.6);
    expect(overlapping.positionMetersXYZ).not.toEqual(
      overlapping.resolvedTargetPositionMetersXYZ,
    );
  });

  it("rebases the last safe pose onto the moving target during start overlap", () => {
    const decollider = new CameraHardDecolliderV1();
    const previousSafe = solve(decollider, 1, undefined, {
      desiredTargetPositionMetersXYZ: [0, 2, 0],
      desiredPositionMetersXYZ: [0, 3, 5],
      currentCommittedPositionMetersXYZ: [0, 3, 5],
    });

    const overlapping = solve(decollider, 2, hit(0, {
      travelFraction: 0,
      hitPointMetersXYZ: [0.5, 4, 1],
      hitNormalXYZ: [1, 0, 0],
      startedOverlapping: true,
      penetrationDepthMeters: 0.5,
    }), {
      desiredTargetPositionMetersXYZ: [0, 4, 1],
      desiredPositionMetersXYZ: [0, 5, 6],
      currentCommittedPositionMetersXYZ: previousSafe.positionMetersXYZ,
    });

    expect(overlapping.phase).toBe("emergency-inside");
    expect(overlapping.resolvedTargetPositionMetersXYZ).toEqual([0.501, 4, 1]);
    expect(overlapping.positionMetersXYZ).toEqual([0, 5, 6]);
  });

  it("does not drift while repeated start-overlap frames keep the target still", () => {
    const decollider = new CameraHardDecolliderV1();
    solve(decollider, 1, undefined, {
      desiredTargetPositionMetersXYZ: [0, 2, 0],
      desiredPositionMetersXYZ: [0, 3, 5],
      currentCommittedPositionMetersXYZ: [0, 3, 5],
    });
    const overlap = hit(0, {
      travelFraction: 0,
      hitPointMetersXYZ: [0.5, 4, 1],
      hitNormalXYZ: [1, 0, 0],
      startedOverlapping: true,
      penetrationDepthMeters: 0.5,
    });
    const first = solve(decollider, 2, overlap, {
      desiredTargetPositionMetersXYZ: [0, 4, 1],
      desiredPositionMetersXYZ: [0, 5, 6],
      currentCommittedPositionMetersXYZ: [0, 3, 5],
    });

    const second = solve(decollider, 3, overlap, {
      desiredTargetPositionMetersXYZ: [0, 4, 1],
      desiredPositionMetersXYZ: [0, 5, 6],
      currentCommittedPositionMetersXYZ: first.positionMetersXYZ,
    });

    expect(second.positionMetersXYZ).toEqual(first.positionMetersXYZ);
  });

  it("uses a valid current committed pose for a first-tick overlap", () => {
    const decollider = new CameraHardDecolliderV1();

    const overlapping = solve(decollider, 1, hit(0, {
      travelFraction: 0,
      hitPointMetersXYZ: [0.5, 0, 0],
      hitNormalXYZ: [1, 0, 0],
      startedOverlapping: true,
      penetrationDepthMeters: 0.5,
    }), {
      currentCommittedPositionMetersXYZ: [0, 0, 4],
    });

    expect(overlapping.positionMetersXYZ).toEqual([0, 0, 4]);
    expect(overlapping.effectiveArmLengthMeters).toBeCloseTo(
      Math.hypot(0.501, 0, 4),
      6,
    );
  });

  it("fails closed when overlap has no usable committed safe pose", () => {
    const decollider = new CameraHardDecolliderV1();

    expect(() => solve(decollider, 1, hit(0, {
      travelFraction: 0,
      hitNormalXYZ: [1, 0, 0],
      startedOverlapping: true,
      penetrationDepthMeters: 0.5,
    }), {
      currentCommittedPositionMetersXYZ: [0, 0, 0.1],
    })).toThrow("CAMERA_HARD_DECOLLIDER_NO_SAFE_POSE");
    expect(decollider.captureTransactionState().authorityTick).toBeUndefined();
  });

  it("captures, restores and resets every temporal safety field", () => {
    const decollider = new CameraHardDecolliderV1();
    solve(decollider, 1, hit(2));
    const constrained = decollider.captureTransactionState();
    solve(decollider, 2, undefined);

    decollider.restoreTransactionState(constrained);
    expect(decollider.captureTransactionState()).toEqual(constrained);
    expect(Object.isFrozen(constrained)).toBe(true);
    expect(Object.isFrozen(constrained.lastSafePositionMetersXYZ!)).toBe(true);

    decollider.reset();
    expect(decollider.captureTransactionState()).toEqual({
      phase: "clear",
      constrainedArmLengthMeters: undefined,
      clearHoldRemainingSeconds: 0,
      stableHitEntityId: undefined,
      stableHitNormalXYZ: undefined,
      lastSafePositionMetersXYZ: undefined,
      lastSafeTargetPositionMetersXYZ: undefined,
      authorityTick: undefined,
    });
  });
});
