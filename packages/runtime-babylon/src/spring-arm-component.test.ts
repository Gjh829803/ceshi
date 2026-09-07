import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type {
  CameraGeometryHitV2,
  CameraGeometryQueryPortV2,
  CameraRigParametersV1,
} from "@whitebox-world/camera";
import { describe, expect, it, vi } from "vitest";

import { SpringArmComponentV1 } from "./spring-arm-component";

function parameters(
  overrides: Partial<CameraRigParametersV1> = {},
): CameraRigParametersV1 {
  return {
    distanceMeters: 10,
    minimumDistanceMeters: 0.6,
    maximumDistanceMeters: 20,
    targetHeightMeters: 1,
    shoulderOffsetMeters: 0,
    pitchRadians: 0.2,
    minimumPitchRadians: -1,
    maximumPitchRadians: 1,
    positionDampingPerSecond: 10,
    horizontalPositionDampingPerSecond: 10,
    verticalPositionDampingPerSecond: 10,
    maximumPositionLagMeters: 2,
    rotationDampingPerSecond: 10,
    yawDampingPerSecond: 10,
    pitchDampingPerSecond: 10,
    collisionRadiusMeters: 0.12,
    collisionRetractionMetersPerSecond: 0.1,
    collisionRecoveryMetersPerSecond: 2,
    baseFovDegrees: 60,
    speedFovDegreesPerMeterPerSecond: 0,
    maximumSpeedFovDegrees: 0,
    lookAheadSeconds: 0,
    accelerationLookAheadSecondsSquared: 0,
    transitionSeconds: 0.3,
    minimumHeadingSpeedMetersPerSecond: 0,
    velocityHeadingDampingPerSecond: 10,
    fovDampingPerSecond: 10,
    horizontalDeadZoneRatio: 0,
    verticalDeadZoneRatio: 0,
    recenterDelaySeconds: 0,
    recenterDurationSeconds: 0,
    recenterMinimumSpeedMetersPerSecond: 0,
    teleportSnapDistanceMeters: 10,
    lookSensitivityXRatio: 1,
    lookSensitivityYRatio: 1,
    ...overrides,
  };
}

function geometryHit(
  request: Parameters<CameraGeometryQueryPortV2["query"]>[0],
  distanceMeters: number,
  overrides: Partial<CameraGeometryHitV2> = {},
): CameraGeometryHitV2 {
  const armLengthMeters = Math.hypot(
    request.endPositionMetersXYZ[0] - request.startPositionMetersXYZ[0],
    request.endPositionMetersXYZ[1] - request.startPositionMetersXYZ[1],
    request.endPositionMetersXYZ[2] - request.startPositionMetersXYZ[2],
  );
  return {
    schemaVersion: 2,
    travelDistanceMeters: distanceMeters,
    travelFraction: armLengthMeters === 0 ? 0 : distanceMeters / armLengthMeters,
    hitPointMetersXYZ: [0, 0, distanceMeters],
    hitNormalXYZ: [0, 0, -1],
    hitEntityId: "wall",
    startedOverlapping: false,
    penetrationDepthMeters: 0,
    obstructionClass: "hard",
    ...overrides,
  };
}

function queryWithHitDistance(
  hitDistance: number | undefined,
  overrides: Partial<CameraGeometryHitV2> = {},
): CameraGeometryQueryPortV2 {
  return {
    capability: {
      shape: "sphere",
      maximumHitCount: 1,
      maximumExcludedEntityCount: 1,
      reportsContactNormal: true,
      reportsStartOverlap: true,
      penetrationDepth: "exact-or-zero",
    },
    query: (request) => hitDistance === undefined
      ? undefined
      : geometryHit(request, hitDistance, overrides),
  };
}

function querySequence(
  hits: readonly (CameraGeometryHitV2 | undefined)[],
): CameraGeometryQueryPortV2 {
  let index = 0;
  return {
    capability: {
      shape: "sphere",
      maximumHitCount: 1,
      maximumExcludedEntityCount: 1,
      reportsContactNormal: true,
      reportsStartOverlap: true,
      penetrationDepth: "exact-or-zero",
    },
    query: () => hits[Math.min(index++, hits.length - 1)],
  };
}

function solve(
  arm: SpringArmComponentV1,
  cameraGeometryQuery: CameraGeometryQueryPortV2,
  committedTick = 1,
  deltaSeconds = 0.1,
  overrides: Partial<Parameters<SpringArmComponentV1["solve"]>[0]> = {},
) {
  return arm.solve({
    committedTick,
    excludedEntityIds: ["player"],
    desiredTarget: Vector3.Zero(),
    resolvedTarget: overrides.resolvedTarget ?? overrides.desiredTarget ?? Vector3.Zero(),
    desiredPosition: new Vector3(0, 0, 10),
    unconstrainedPosition: overrides.unconstrainedPosition ?? overrides.desiredPosition ?? new Vector3(0, 0, 10),
    currentCommittedPosition: new Vector3(0, 0, 10),
    parameters: parameters(),
    deltaSeconds,
    cameraGeometryQuery,
    ...overrides,
  });
}

describe("SpringArmComponentV1 Camera Geometry V2 adapter", () => {
  it("uses the final resolved target and full exclusion set in one bounded V2 query", () => {
    const arm = new SpringArmComponentV1();
    const query = queryWithHitDistance(undefined);
    const querySpy = vi.spyOn(query, "query");

    const result = solve(arm, query, 17, 0.1, {
      excludedEntityIds: ["player", "equipped-item"],
      desiredTarget: new Vector3(1, 2, 3),
      desiredPosition: new Vector3(1, 2, 8),
      currentCommittedPosition: new Vector3(1, 2, 8),
    });

    expect(result.effectiveArmLengthMeters).toBe(5);
    expect(result.resolvedTarget).toEqual(new Vector3(1, 2, 3));
    expect(querySpy).toHaveBeenCalledWith({
      schemaVersion: 2,
      committedTick: 17,
      startPositionMetersXYZ: [1, 2, 3],
      endPositionMetersXYZ: [1, 2, 8],
      radiusMeters: 0.12,
      collisionMask: "camera-hard",
      excludedEntityIds: ["player", "equipped-item"],
      maximumHitCount: 1,
    });
  });

  it("immediately retracts and starts linear recovery on the first clear tick", () => {
    const arm = new SpringArmComponentV1();

    const retracted = solve(arm, queryWithHitDistance(0.75), 1);
    const firstClear = solve(arm, queryWithHitDistance(undefined), 2);
    const recovering = solve(arm, queryWithHitDistance(undefined), 3);
    const recoveringAgain = solve(arm, queryWithHitDistance(undefined), 4);

    expect(retracted.effectiveArmLengthMeters).toBeCloseTo(0.75, 6);
    expect(retracted.collisionHitEntityId).toBe("wall");
    expect(retracted.clearHoldRemainingSeconds).toBe(0);
    expect(firstClear.effectiveArmLengthMeters).toBeCloseTo(0.95, 6);
    expect(firstClear.collisionHitNormalXYZ).toEqual([0, 0, -1]);
    expect(recovering.effectiveArmLengthMeters).toBeCloseTo(1.15, 6);
    expect(recoveringAgain.effectiveArmLengthMeters).toBeCloseTo(1.35, 6);
  });

  it("uses the profile recovery speed without an extra cap or exponential tail", () => {
    const arm = new SpringArmComponentV1();
    const fastProfile = parameters({ collisionRecoveryMetersPerSecond: 20 });

    const retracted = solve(arm, queryWithHitDistance(0.75), 1, 0.1, {
      parameters: fastProfile,
    });
    const firstClear = solve(arm, queryWithHitDistance(undefined), 2, 0.12, {
      parameters: fastProfile,
    });
    const recovering = solve(arm, queryWithHitDistance(undefined), 3, 0.1, {
      parameters: fastProfile,
    });

    expect(retracted.effectiveArmLengthMeters).toBeCloseTo(0.75, 6);
    expect(firstClear.effectiveArmLengthMeters).toBeCloseTo(3.15, 6);
    expect(recovering.effectiveArmLengthMeters).toBeCloseTo(5.15, 6);
    const nearEnd = solve(arm, queryWithHitDistance(undefined), 4, 0.24, {
      parameters: fastProfile,
    });
    expect(nearEnd.effectiveArmLengthMeters).toBeCloseTo(9.95, 6);
    expect(solve(arm, queryWithHitDistance(undefined), 5, 0.01, {
      parameters: fastProfile,
    }).effectiveArmLengthMeters).toBe(10);
  });

  it.each([0, 2, 6, 20])("matches pinned-old recovery traces at %s m/s across tick intervals and rollback", (speed) => {
    for (const deltaSeconds of [0, 1 / 120, 1 / 60, 1 / 30, 0.1]) {
      const arm = new SpringArmComponentV1();
      const profile = parameters({ collisionRecoveryMetersPerSecond: speed });
      const direction = new Vector3(0.6, 0, 0.8);
      let oldDistance: number | undefined;
      // Scalar recurrence from 9e35ab53 spring-arm-component.ts; no old state owner at runtime.
      const steps = [
        { desired: 10, hit: undefined }, { desired: 10, hit: 0.75 },
        { desired: 10, hit: undefined }, { desired: 10, hit: 2.8 },
        { desired: 10, hit: 0.4 }, { desired: 0.2, hit: undefined },
        { desired: 5, hit: undefined }, { desired: 5, hit: undefined },
      ];
      for (const [index, step] of steps.entries()) {
        const target = new Vector3(3 + index, 2, -7);
        const safe = step.hit === undefined ? step.desired : Math.min(step.desired, step.hit);
        oldDistance ??= step.desired;
        oldDistance = safe <= oldDistance ? safe : Math.min(safe, oldDistance + speed * deltaSeconds);
        const before = arm.captureTransactionState();
        const run = () => solve(arm, queryWithHitDistance(step.hit), index + 1, deltaSeconds, {
          parameters: profile,
          desiredTarget: target,
          desiredPosition: target.add(direction.scale(step.desired)),
        });
        const result = run();
        expect(result.effectiveArmLengthMeters).toBeCloseTo(oldDistance, 10);
        expect(Vector3.Distance(result.position, target.add(direction.scale(oldDistance))))
          .toBeLessThan(1e-10);
        expect(result.clearHoldRemainingSeconds).toBe(0);
        const after = arm.captureTransactionState();
        arm.restoreTransactionState(before);
        expect(run()).toEqual(result);
        expect(arm.captureTransactionState()).toEqual(after);
      }
      arm.reset();
      expect(solve(arm, queryWithHitDistance(undefined)).effectiveArmLengthMeters).toBe(10);
    }
  });

  it("uses the validated smoothed pose only when clear and retains nominal recovery state", () => {
    const arm = new SpringArmComponentV1();
    const query = queryWithHitDistance(undefined);
    const querySpy = vi.spyOn(query, "query");
    const result = solve(arm, query, 1, 0.1, {
      unconstrainedPosition: new Vector3(1, 0, 3),
    });
    expect(querySpy).toHaveBeenCalledTimes(2);
    expect(querySpy.mock.calls[1]![0].endPositionMetersXYZ).toEqual([1, 0, 3]);
    expect(result.position).toEqual(new Vector3(1, 0, 3));
    expect(result.effectiveArmLengthMeters).toBeCloseTo(Math.sqrt(10), 10);
    expect(result.isCollisionRetracted).toBe(false);
    const state = arm.captureTransactionState().hardDecollider;
    expect(state.constrainedArmLengthMeters).toBe(10);
    expect(state.lastSafePositionMetersXYZ).toEqual([1, 0, 3]);
    expect(state.lastSafeTargetPositionMetersXYZ).toEqual([0, 0, 0]);

    // A new ideal-arm obstruction retracts before damping, even if the last
    // displayed pose was shorter. Last-safe pose is not a second arm owner.
    expect(solve(arm, queryWithHitDistance(5), 2).effectiveArmLengthMeters).toBe(5);
  });

  it("clamps a smoothed path obstruction even when the ideal arm was clear", () => {
    const arm = new SpringArmComponentV1();
    let queries = 0;
    const query = queryWithHitDistance(undefined);
    query.query = (request) => ++queries === 1 ? undefined : geometryHit(request, 1);
    const result = solve(arm, query, 1, 0.1, {
      unconstrainedPosition: new Vector3(3, 0, 4),
    });
    expect(queries).toBe(2);
    expect(result.effectiveArmLengthMeters).toBe(1);
    expect(Vector3.Distance(result.position, new Vector3(0.6, 0, 0.8))).toBeLessThan(1e-12);
    expect(arm.captureTransactionState().hardDecollider.lastSafePositionMetersXYZ)
      .toEqual(result.position.asArray());
  });

  it("rolls back both nominal recovery and last-safe pose if the final query fails", () => {
    const arm = new SpringArmComponentV1();
    solve(arm, queryWithHitDistance(undefined));
    const before = arm.captureTransactionState();
    let queries = 0;
    const query = queryWithHitDistance(undefined);
    query.query = () => {
      if (++queries === 2) throw new Error("final geometry unavailable");
      return undefined;
    };
    expect(() => solve(arm, query, 2, 0.1, {
      unconstrainedPosition: new Vector3(3, 0, 4),
    })).toThrow("final geometry unavailable");
    expect(queries).toBe(2);
    expect(arm.captureTransactionState()).toEqual(before);
  });

  it("validates the smoothed LookAt while retracted without redefining nominal recovery distance", () => {
    const arm = new SpringArmComponentV1();
    const query = queryWithHitDistance(undefined);
    const requests: Parameters<CameraGeometryQueryPortV2["query"]>[0][] = [];
    query.query = (request) => {
      requests.push(request);
      return requests.length === 1 ? geometryHit(request, 2) : undefined;
    };
    const result = solve(arm, query, 1, 0.1, { resolvedTarget: new Vector3(1, 0, 0) });
    expect(requests).toHaveLength(2);
    expect(requests[0]!.startPositionMetersXYZ).toEqual([0, 0, 0]);
    expect(requests[1]!.startPositionMetersXYZ).toEqual([1, 0, 0]);
    expect(requests[1]!.endPositionMetersXYZ).toEqual([0, 0, 2]);
    expect(result.resolvedTarget).toEqual(new Vector3(1, 0, 0));
    expect(result.effectiveArmLengthMeters).toBeCloseTo(Math.sqrt(5), 10);
    expect(arm.captureTransactionState().hardDecollider.constrainedArmLengthMeters).toBe(2);
    expect(solve(arm, queryWithHitDistance(undefined), 2, 0.1, {
      resolvedTarget: new Vector3(1, 0, 0),
    }).position.z).toBeCloseTo(2.2, 10);
  });

  it("rebases a final LookAt obstruction to the nominal arm owner before the next recovery tick", () => {
    const arm = new SpringArmComponentV1();
    const query = queryWithHitDistance(undefined);
    let queries = 0;
    query.query = (request) => geometryHit(request, ++queries === 1 ? 2 : 0.5);
    const result = solve(arm, query, 1, 0.1, { resolvedTarget: new Vector3(1, 0, 0) });
    expect(queries).toBe(2);
    expect(result.effectiveArmLengthMeters).toBeCloseTo(0.5, 10);
    const nominalDistance = result.position.length();
    expect(arm.captureTransactionState().hardDecollider.constrainedArmLengthMeters)
      .toBeCloseTo(nominalDistance, 10);
    expect(arm.captureTransactionState().hardDecollider.lastSafeTargetPositionMetersXYZ).toEqual([0, 0, 0]);
    expect(solve(arm, queryWithHitDistance(undefined), 2, 0.1, {
      resolvedTarget: new Vector3(1, 0, 0),
    }).position.z).toBeCloseTo(nominalDistance + 0.2, 10);
  });

  it("does not skip final LookAt validation or rollback while already retracted", () => {
    const arm = new SpringArmComponentV1();
    solve(arm, queryWithHitDistance(2));
    const before = arm.captureTransactionState();
    const query = queryWithHitDistance(undefined);
    let queries = 0;
    query.query = (request) => {
      if (++queries === 2) throw new Error("final LookAt unavailable");
      return geometryHit(request, 2);
    };
    expect(() => solve(arm, query, 2, 0.1, { resolvedTarget: new Vector3(1, 0, 0) }))
      .toThrow("final LookAt unavailable");
    expect(queries).toBe(2);
    expect(arm.captureTransactionState()).toEqual(before);
  });

  it.each(["changed-anchor", "longer-smoothed-arm"])("clamps only to the final geometry boundary for %s, not a stale nominal length", (mode) => {
    const arm = new SpringArmComponentV1();
    const query = queryWithHitDistance(undefined);
    let queries = 0;
    const safeDistance = mode === "changed-anchor" ? 5 : 12;
    query.query = (request) => ++queries === 1
      ? mode === "changed-anchor" ? geometryHit(request, 2) : undefined
      : geometryHit(request, safeDistance);
    const result = solve(arm, query, 1, 0.1, {
      resolvedTarget: mode === "changed-anchor" ? new Vector3(6, 0, 0) : Vector3.Zero(),
      unconstrainedPosition: new Vector3(0, 0, mode === "changed-anchor" ? 10 : 15),
    });
    expect(queries).toBe(2);
    expect(result.effectiveArmLengthMeters).toBeCloseTo(safeDistance, 10);
    expect(Vector3.Distance(result.resolvedTarget, result.position)).toBeCloseTo(safeDistance, 10);
    expect(arm.captureTransactionState().hardDecollider.constrainedArmLengthMeters)
      .toBeCloseTo(result.position.length(), 10);
  });

  it("bounds final-pose emergency validation to three queries in the same tick", () => {
    const arm = new SpringArmComponentV1();
    const query = queryWithHitDistance(undefined);
    let queries = 0;
    query.query = (request) => ++queries === 2 ? geometryHit(request, 0, {
      startedOverlapping: true, penetrationDepthMeters: 0.4, hitNormalXYZ: [1, 0, 0],
    }) : undefined;
    const result = solve(arm, query, 7, 0.1, {
      unconstrainedPosition: new Vector3(3, 0, 4),
    });
    expect(queries).toBe(3);
    expect(result.decollisionPhase).toBe("emergency-inside");
    expect(arm.captureTransactionState().hardDecollider.authorityTick).toBe(7);
    expect(arm.captureTransactionState().hardDecollider.lastSafePositionMetersXYZ)
      .toEqual(result.position.asArray());
  });

  it("keeps the committed safe camera pose when the query starts overlapping", () => {
    const arm = new SpringArmComponentV1();
    solve(arm, queryWithHitDistance(undefined), 1, 0.1, {
      desiredPosition: new Vector3(0, 0, 5),
      currentCommittedPosition: new Vector3(0, 0, 5),
    });

    const overlapHit = geometryHit({
      schemaVersion: 2,
      committedTick: 2,
      startPositionMetersXYZ: [0, 0, 0],
      endPositionMetersXYZ: [0, 0, 10],
      radiusMeters: 0.12,
      collisionMask: "camera-hard",
      excludedEntityIds: ["player"],
      maximumHitCount: 1,
    }, 0, {
      travelFraction: 0,
      startedOverlapping: true,
      penetrationDepthMeters: 0.4,
      hitNormalXYZ: [1, 0, 0],
    });
    const query = querySequence([overlapHit, undefined]);
    const querySpy = vi.spyOn(query, "query");
    const overlapping = solve(arm, query, 2, 0.1, {
      currentCommittedPosition: new Vector3(0, 0, 5),
    });

    expect(overlapping.decollisionPhase).toBe("emergency-inside");
    expect(overlapping.position).toEqual(new Vector3(0, 0, 5));
    expect(overlapping.effectiveArmLengthMeters).toBeGreaterThanOrEqual(0.6);
    expect(overlapping.position.equals(overlapping.resolvedTarget)).toBe(false);
    expect(overlapping.startedOverlapping).toBe(true);
    expect(overlapping.resolvedTarget.x).toBeGreaterThan(0.4);
    expect(querySpy).toHaveBeenCalledTimes(2);
    expect(querySpy.mock.calls[1]?.[0].startPositionMetersXYZ[0]).toBeGreaterThan(0.4);
    expect(querySpy.mock.calls[1]?.[0].endPositionMetersXYZ).toEqual([0, 0, 5]);
  });

  it("fails closed and restores temporal state when an emergency fallback is not validated", () => {
    const arm = new SpringArmComponentV1();
    solve(arm, queryWithHitDistance(undefined), 1, 0.1, {
      desiredPosition: new Vector3(0, 0, 5),
      currentCommittedPosition: new Vector3(0, 0, 5),
    });
    const before = arm.captureTransactionState();
    const overlap = geometryHit({
      schemaVersion: 2,
      committedTick: 2,
      startPositionMetersXYZ: [0, 0, 0],
      endPositionMetersXYZ: [0, 0, 10],
      radiusMeters: 0.12,
      collisionMask: "camera-hard",
      excludedEntityIds: ["player"],
      maximumHitCount: 1,
    }, 0, {
      travelFraction: 0,
      startedOverlapping: true,
      penetrationDepthMeters: 0.4,
      hitNormalXYZ: [1, 0, 0],
    });
    const stillOverlapping = { ...overlap, penetrationDepthMeters: 0.1 };

    expect(() => solve(arm, querySequence([overlap, stillOverlapping]), 2))
      .toThrow("CAMERA_HARD_DECOLLIDER_EMERGENCY_POSE_UNSAFE");
    expect(arm.captureTransactionState()).toEqual(before);
  });

  it("does not pop outward when alternating L-corner contacts permit different lengths", () => {
    const arm = new SpringArmComponentV1();

    const first = solve(arm, queryWithHitDistance(2, {
      hitEntityId: "wall-a",
      hitNormalXYZ: [1, 0, 0],
    }), 1);
    const longerOtherFace = solve(arm, queryWithHitDistance(2.8, {
      hitEntityId: "wall-b",
      hitNormalXYZ: [0, 0, 1],
    }), 2);
    const shorterOtherFace = solve(arm, queryWithHitDistance(1.7, {
      hitEntityId: "wall-b",
      hitNormalXYZ: [0, 0, 1],
    }), 3);

    expect(longerOtherFace.effectiveArmLengthMeters - first.effectiveArmLengthMeters)
      .toBeLessThanOrEqual(0.2 + 0.000001);
    expect(longerOtherFace.collisionHitEntityId).toBe("wall-a");
    expect(shorterOtherFace.effectiveArmLengthMeters).toBe(1.7);
    expect(shorterOtherFace.collisionHitEntityId).toBe("wall-b");
  });

  it("restores the complete Hard Decollider state after an aborted Director transaction", () => {
    const arm = new SpringArmComponentV1();
    solve(arm, queryWithHitDistance(2), 1);
    const before = arm.captureTransactionState();
    solve(arm, queryWithHitDistance(undefined), 2);
    expect(arm.captureTransactionState()).not.toEqual(before);

    arm.restoreTransactionState(before);

    expect(arm.captureTransactionState()).toEqual(before);
  });
});
