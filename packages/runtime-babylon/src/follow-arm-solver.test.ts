import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { CameraRigParametersV1 } from "@whitebox-world/camera";
import { describe, expect, it } from "vitest";

import { FollowArmSolverV1, type FollowArmSceneQueryV1 } from "./follow-arm-solver";

function parameters(): CameraRigParametersV1 {
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
    collisionRadiusMeters: 0.5,
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
  };
}

function solve(
  solver: FollowArmSolverV1,
  sceneQuery: FollowArmSceneQueryV1,
  deltaSeconds = 0.1,
) {
  return solver.solve({
    subjectEntityId: "player",
    desiredTarget: Vector3.Zero(),
    desiredPosition: new Vector3(0, 0, 10),
    parameters: parameters(),
    deltaSeconds,
    sceneQuery,
  });
}

function queryWithHitDistance(hitDistance: number | undefined): FollowArmSceneQueryV1 {
  return {
    pickWithRay: () => hitDistance === undefined
      ? { hit: false }
      : {
          hit: true,
          distance: hitDistance,
          pickedMesh: { isPickable: true, metadata: { worldkitEntityId: "wall" } },
          pickedPoint: new Vector3(0, 0, hitDistance),
        },
  } as unknown as FollowArmSceneQueryV1;
}

describe("FollowArmSolverV1", () => {
  it("immediately retracts below minimum distance for a near first-frame hit and recovers at a capped rate", () => {
    const solver = new FollowArmSolverV1();

    const retracted = solve(solver, queryWithHitDistance(0.75));
    const recoveringFirst = solve(solver, queryWithHitDistance(undefined));
    const recoveringSecond = solve(solver, queryWithHitDistance(undefined));

    expect(retracted.safeArmLengthMeters).toBeCloseTo(0.25, 6);
    expect(retracted.effectiveArmLengthMeters).toBeCloseTo(0.25, 6);
    expect(retracted.effectiveArmLengthMeters).toBeLessThan(4);
    expect(retracted.collisionHitEntityId).toBe("wall");
    expect(recoveringFirst.effectiveArmLengthMeters).toBeCloseTo(0.45, 6);
    expect(recoveringSecond.effectiveArmLengthMeters).toBeCloseTo(0.65, 6);
    expect(recoveringSecond.effectiveArmLengthMeters).toBeGreaterThan(
      recoveringFirst.effectiveArmLengthMeters,
    );
    expect(recoveringSecond.effectiveArmLengthMeters - recoveringFirst.effectiveArmLengthMeters)
      .toBeLessThanOrEqual(0.2 + 0.000001);
  });

  it("immediately clamps further retraction while an obstruction persists", () => {
    const solver = new FollowArmSolverV1();

    const firstObstacle = solve(solver, queryWithHitDistance(3));
    const closerObstacle = solve(solver, queryWithHitDistance(0.9));

    expect(firstObstacle.effectiveArmLengthMeters).toBeCloseTo(2.5, 6);
    expect(closerObstacle.safeArmLengthMeters).toBeCloseTo(0.4, 6);
    expect(closerObstacle.effectiveArmLengthMeters).toBeCloseTo(0.4, 6);
    expect(closerObstacle.collisionHitPositionXYZ).toEqual([0, 0, 0.9]);
  });

  it("never exceeds the safe arm length while recovery has zero, negative, or large delta", () => {
    const solver = new FollowArmSolverV1();
    const retracted = solve(solver, queryWithHitDistance(0.75));
    const zeroDelta = solve(solver, queryWithHitDistance(undefined), 0);
    const negativeDelta = solve(solver, queryWithHitDistance(undefined), -1);
    const largeDelta = solve(solver, queryWithHitDistance(undefined), 100);

    for (const result of [retracted, zeroDelta, negativeDelta, largeDelta]) {
      expect(result.effectiveArmLengthMeters).toBeLessThanOrEqual(
        result.safeArmLengthMeters,
      );
    }
    expect(zeroDelta.effectiveArmLengthMeters).toBeCloseTo(0.25, 6);
    expect(negativeDelta.effectiveArmLengthMeters).toBeCloseTo(0.25, 6);
    expect(largeDelta.safeArmLengthMeters).toBe(10);
    expect(largeDelta.effectiveArmLengthMeters).toBe(10);
  });

  it("ignores a pick on the controlled Subject", () => {
    const solver = new FollowArmSolverV1();
    let pickQueryCount = 0;
    const subjectPredicateResults: boolean[] = [];
    const sceneQuery: FollowArmSceneQueryV1 = {
      pickWithRay: (_ray, predicate) => {
        pickQueryCount += 1;
        if (predicate === undefined) {
          throw new Error("Follow Arm must provide a Subject-filter predicate.");
        }
        const subjectMesh = {
          isPickable: true,
          metadata: { worldkitEntityId: "player" },
        };
        const acceptsSubject = predicate(subjectMesh as never, undefined as never);
        subjectPredicateResults.push(acceptsSubject);
        return acceptsSubject
          ? {
              hit: true,
              distance: 0.75,
              pickedMesh: subjectMesh,
              pickedPoint: new Vector3(0, 0, 0.75),
            }
          : { hit: false };
      },
    } as FollowArmSceneQueryV1;

    const result = solve(solver, sceneQuery);

    expect(result.safeArmLengthMeters).toBe(10);
    expect(result.effectiveArmLengthMeters).toBe(10);
    expect(result.isCollisionRetracted).toBe(false);
    expect(result.collisionHitEntityId).toBeUndefined();
    expect(pickQueryCount).toBe(9);
    expect(subjectPredicateResults).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("detects a thin diagonal blocker inside the collision cross-section", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const blocker = MeshBuilder.CreateBox("diagonal-blocker", {
        width: 0.12,
        height: 0.12,
        depth: 0.12,
      }, scene);
      blocker.position.set(0.32, 0.32, 5);
      blocker.isPickable = true;
      blocker.metadata = { worldkitEntityId: "diagonal-blocker" };
      blocker.computeWorldMatrix(true);

      const result = solve(new FollowArmSolverV1(), scene);

      expect(result.safeArmLengthMeters).toBeLessThan(10);
      expect(result.isCollisionRetracted).toBe(true);
      expect(result.collisionHitEntityId).toBe("diagonal-blocker");
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
