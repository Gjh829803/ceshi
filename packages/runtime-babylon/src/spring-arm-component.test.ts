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
    desiredPosition: new Vector3(0, 0, 10),
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

  it("immediately retracts, holds clear, then recovers monotonically at a bounded rate", () => {
    const arm = new SpringArmComponentV1();

    const retracted = solve(arm, queryWithHitDistance(0.75), 1);
    const held = solve(arm, queryWithHitDistance(undefined), 2);
    const recovering = solve(arm, queryWithHitDistance(undefined), 3);
    const recoveringAgain = solve(arm, queryWithHitDistance(undefined), 4);

    expect(retracted.effectiveArmLengthMeters).toBeCloseTo(0.75, 6);
    expect(retracted.collisionHitEntityId).toBe("wall");
    expect(held.effectiveArmLengthMeters).toBeCloseTo(0.75, 6);
    expect(held.collisionHitNormalXYZ).toEqual([0, 0, -1]);
    expect(recovering.effectiveArmLengthMeters).toBeGreaterThan(0.75);
    expect(recoveringAgain.effectiveArmLengthMeters)
      .toBeGreaterThanOrEqual(recovering.effectiveArmLengthMeters);
    expect(recoveringAgain.effectiveArmLengthMeters - recovering.effectiveArmLengthMeters)
      .toBeLessThanOrEqual(0.2 + 0.000001);
  });

  it("caps outward recovery even when a profile requests a faster response", () => {
    const arm = new SpringArmComponentV1();
    const fastProfile = parameters({ collisionRecoveryMetersPerSecond: 20 });

    const retracted = solve(arm, queryWithHitDistance(0.75), 1, 0.1, {
      parameters: fastProfile,
    });
    const held = solve(arm, queryWithHitDistance(undefined), 2, 0.12, {
      parameters: fastProfile,
    });
    const recovering = solve(arm, queryWithHitDistance(undefined), 3, 0.1, {
      parameters: fastProfile,
    });

    expect(retracted.effectiveArmLengthMeters).toBeCloseTo(0.75, 6);
    expect(held.effectiveArmLengthMeters).toBeCloseTo(0.75, 6);
    expect(recovering.effectiveArmLengthMeters).toBeGreaterThan(0.75);
    expect(recovering.effectiveArmLengthMeters - held.effectiveArmLengthMeters)
      .toBeLessThanOrEqual(0.3 + 0.000001);
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

  it("keeps an overlap emergency arm on the separating side of the contact", () => {
    const arm = new SpringArmComponentV1();
    solve(arm, queryWithHitDistance(undefined), 1, 0.1, {
      desiredPosition: new Vector3(0, 0, 5),
      currentCommittedPosition: new Vector3(0, 0, 5),
    });
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
    const blockedPriorPose = {
      ...overlap,
      travelDistanceMeters: 0.1,
      travelFraction: 0.02,
      startedOverlapping: false,
      penetrationDepthMeters: 0,
    };
    const query = querySequence([overlap, blockedPriorPose, undefined]);
    const querySpy = vi.spyOn(query, "query");

    const recovered = solve(arm, query, 2, 0.1, {
      desiredPosition: new Vector3(0, 0, 5),
      currentCommittedPosition: new Vector3(0, 0, 5),
    });

    expect(recovered.decollisionPhase).toBe("emergency-inside");
    expect(recovered.position.x).toBeGreaterThan(recovered.resolvedTarget.x);
    expect(recovered.effectiveArmLengthMeters).toBeCloseTo(0.6, 6);
    expect(querySpy).toHaveBeenCalledTimes(3);
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
