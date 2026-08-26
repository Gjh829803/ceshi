import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { CameraRigParametersV1 } from "@whitebox-world/camera";
import type {
  PhysicsWorldQueryPortV1,
  SphereSweepRequestV1,
} from "@whitebox-world/runtime-framework";
import { describe, expect, it, vi } from "vitest";

import { SpringArmComponentV1 } from "./spring-arm-component";

function parameters(
  overrides: Partial<CameraRigParametersV1> = {},
): CameraRigParametersV1 {
  return {
    distanceMeters: 10,
    minimumDistanceMeters: 4,
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

function solve(
  arm: SpringArmComponentV1,
  physicsWorldQuery: PhysicsWorldQueryPortV1,
  deltaSeconds = 0.1,
  parameterOverrides: Partial<CameraRigParametersV1> = {},
) {
  return arm.solve({
    subjectEntityId: "player",
    desiredTarget: Vector3.Zero(),
    desiredPosition: new Vector3(0, 0, 10),
    parameters: parameters(parameterOverrides),
    deltaSeconds,
    physicsWorldQuery,
  });
}

function queryWithHitDistance(hitDistance: number | undefined): PhysicsWorldQueryPortV1 {
  return {
    sweepSphere: () => hitDistance === undefined
      ? undefined
      : {
          travelDistanceMeters: hitDistance,
          travelFraction: hitDistance / 10,
          hitEntityId: "wall",
          hitPositionMetersXYZ: [0, 0, hitDistance],
        },
  };
}

describe("SpringArmComponentV1", () => {
  it("uses one true sphere-sweep request with UE-default 12 cm ProbeSize", () => {
    const arm = new SpringArmComponentV1();
    const requests: SphereSweepRequestV1[] = [];
    const query: PhysicsWorldQueryPortV1 = {
      sweepSphere: (request) => {
        requests.push(request);
        return undefined;
      },
    };

    const result = solve(arm, query);

    expect(result.effectiveArmLengthMeters).toBe(10);
    expect(requests).toEqual([{
      startPositionMetersXYZ: [0, 0, 0],
      endPositionMetersXYZ: [0, 0, 10],
      probeRadiusMeters: 0.12,
      ignoredEntityId: "player",
    }]);
  });

  it("immediately retracts to the swept sphere-center distance and recovers at a capped rate", () => {
    const arm = new SpringArmComponentV1();

    const retracted = solve(arm, queryWithHitDistance(0.75));
    const recoveringFirst = solve(arm, queryWithHitDistance(undefined));
    const recoveringSecond = solve(arm, queryWithHitDistance(undefined));

    expect(retracted.safeArmLengthMeters).toBeCloseTo(0.75, 6);
    expect(retracted.effectiveArmLengthMeters).toBeCloseTo(0.75, 6);
    expect(retracted.effectiveArmLengthMeters).toBeLessThan(4);
    expect(retracted.collisionHitEntityId).toBe("wall");
    expect(recoveringFirst.effectiveArmLengthMeters).toBeCloseTo(0.95, 6);
    expect(recoveringSecond.effectiveArmLengthMeters).toBeCloseTo(1.15, 6);
    expect(recoveringSecond.effectiveArmLengthMeters - recoveringFirst.effectiveArmLengthMeters)
      .toBeLessThanOrEqual(0.2 + 0.000001);
  });

  it("uses a ray query when ProbeSize is zero", () => {
    const arm = new SpringArmComponentV1();
    const sweepSphere = vi.fn<PhysicsWorldQueryPortV1["sweepSphere"]>(() => undefined);

    solve(arm, { sweepSphere }, 0.1, { collisionRadiusMeters: 0 });

    expect(sweepSphere).toHaveBeenCalledWith(expect.objectContaining({
      probeRadiusMeters: 0,
      ignoredEntityId: "player",
    }));
  });

  it("never exceeds the safe arm length while recovery has zero, negative, or large delta", () => {
    const arm = new SpringArmComponentV1();
    const retracted = solve(arm, queryWithHitDistance(0.75));
    const zeroDelta = solve(arm, queryWithHitDistance(undefined), 0);
    const negativeDelta = solve(arm, queryWithHitDistance(undefined), -1);
    const largeDelta = solve(arm, queryWithHitDistance(undefined), 100);

    for (const result of [retracted, zeroDelta, negativeDelta, largeDelta]) {
      expect(result.effectiveArmLengthMeters).toBeLessThanOrEqual(
        result.safeArmLengthMeters,
      );
    }
    expect(zeroDelta.effectiveArmLengthMeters).toBeCloseTo(0.75, 6);
    expect(negativeDelta.effectiveArmLengthMeters).toBeCloseTo(0.75, 6);
    expect(largeDelta.safeArmLengthMeters).toBe(10);
    expect(largeDelta.effectiveArmLengthMeters).toBe(10);
  });
});
