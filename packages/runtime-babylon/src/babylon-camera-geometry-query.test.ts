import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type {
  CameraGeometryQueryRequestV2,
  CameraRigParametersV1,
} from "@whitebox-world/camera";
import { describe, expect, it, vi } from "vitest";

import { BabylonHavokCameraGeometryQueryV2 } from "./babylon-camera-geometry-query";
import { enableHavokPhysics } from "./physics";
import { SpringArmComponentV1 } from "./spring-arm-component";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

function request(
  overrides: Partial<CameraGeometryQueryRequestV2> = {},
): CameraGeometryQueryRequestV2 {
  return {
    schemaVersion: 2,
    committedTick: 7,
    startPositionMetersXYZ: [0, 0, 0],
    endPositionMetersXYZ: [0, 0, 10],
    radiusMeters: 0.5,
    collisionMask: "camera-hard",
    excludedEntityIds: [],
    maximumHitCount: 1,
    ...overrides,
  };
}

function cameraParameters(): CameraRigParametersV1 {
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

describe("BabylonHavokCameraGeometryQueryV2", () => {
  it("publishes truthful locked-provider capability", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plugin = await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
    const query = new BabylonHavokCameraGeometryQueryV2(scene, plugin);

    try {
      expect(query.capability).toEqual({
        shape: "sphere",
        maximumHitCount: 1,
        maximumExcludedEntityCount: 1,
        reportsContactNormal: true,
        reportsStartOverlap: true,
        penetrationDepth: "exact-or-zero",
      });
      expect(Object.isFrozen(query.capability)).toBe(true);
    } finally {
      query.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("returns exact sphere-sweep distance, contact point, normal and hard classification", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plugin = await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
    const wall = MeshBuilder.CreateBox("offset-wall", {
      width: 0.1,
      height: 2,
      depth: 0.5,
    }, scene);
    wall.position.set(0.45, 0, 5);
    wall.metadata = { worldkitEntityId: "offset-wall" };
    const wallAggregate = new PhysicsAggregate(
      wall,
      PhysicsShapeType.BOX,
      { mass: 0 },
      scene,
    );
    const query = new BabylonHavokCameraGeometryQueryV2(scene, plugin);

    try {
      const hit = query.query(request());

      expect(hit).toMatchObject({
        schemaVersion: 2,
        hitEntityId: "offset-wall",
        startedOverlapping: false,
        penetrationDepthMeters: 0,
        obstructionClass: "hard",
      });
      expect(hit?.travelDistanceMeters).toBeGreaterThan(0);
      expect(hit?.travelDistanceMeters).toBeLessThan(5);
      expect(hit?.travelFraction).toBeGreaterThan(0);
      expect(hit?.travelFraction).toBeLessThan(0.5);
      expect(Math.hypot(...hit!.hitNormalXYZ)).toBeCloseTo(1, 6);
      expect(hit?.hitPointMetersXYZ.every(Number.isFinite)).toBe(true);
    } finally {
      query.dispose();
      wallAggregate.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it.each([
    {
      name: "L-shaped wall corner",
      blockers: [
        { id: "corner-a", position: [0.34, 0.18, 5], size: [0.08, 0.4, 0.12] },
        { id: "corner-b", position: [0.18, 0.34, 5], size: [0.4, 0.08, 0.12] },
      ],
    },
    {
      name: "doorway narrower than the probe",
      blockers: [
        { id: "jamb-left", position: [-0.55, 0, 5], size: [0.3, 2, 0.12] },
        { id: "jamb-right", position: [0.55, 0, 5], size: [0.3, 2, 0.12] },
      ],
    },
  ] satisfies readonly {
    readonly name: string;
    readonly blockers: readonly {
      readonly id: string;
      readonly position: readonly [number, number, number];
      readonly size: readonly [number, number, number];
    }[];
  }[])("returns one truthful closest hit for $name", async ({ blockers }) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plugin = await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
    const aggregates = blockers.map(({ id, position, size }) => {
      const blocker = MeshBuilder.CreateBox(id, {
        width: size[0],
        height: size[1],
        depth: size[2],
      }, scene);
      blocker.position.set(position[0], position[1], position[2]);
      blocker.metadata = { worldkitEntityId: id };
      return new PhysicsAggregate(blocker, PhysicsShapeType.BOX, { mass: 0 }, scene);
    });
    const query = new BabylonHavokCameraGeometryQueryV2(scene, plugin);

    try {
      const hit = query.query(request());

      expect(hit).toBeDefined();
      expect(blockers.map(({ id }) => id)).toContain(hit?.hitEntityId);
      expect(hit?.travelDistanceMeters).toBeLessThan(5);
      expect(hit?.startedOverlapping).toBe(false);
    } finally {
      query.dispose();
      for (const aggregate of aggregates) aggregate.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("keeps a real Havok L-corner orbit sequence bounded and contact-stable", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plugin = await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
    const blockers = [
      { id: "corner-a", position: [0.34, 0.18, 5], size: [0.08, 0.4, 0.12] },
      { id: "corner-b", position: [0.18, 0.34, 5], size: [0.4, 0.08, 0.12] },
    ] as const;
    const aggregates = blockers.map(({ id, position, size }) => {
      const blocker = MeshBuilder.CreateBox(id, {
        width: size[0],
        height: size[1],
        depth: size[2],
      }, scene);
      blocker.position.set(position[0], position[1], position[2]);
      blocker.metadata = { worldkitEntityId: id };
      return new PhysicsAggregate(blocker, PhysicsShapeType.BOX, { mass: 0 }, scene);
    });
    const query = new BabylonHavokCameraGeometryQueryV2(scene, plugin);
    const arm = new SpringArmComponentV1();
    const deltaSeconds = 1 / 60;
    let committedPosition = new Vector3(0, 0, 10);
    let previousArmLength: number | undefined;
    let previousHitEntityId: string | undefined;
    let contactSwitchCount = 0;

    try {
      for (let frame = 1; frame <= 120; frame += 1) {
        const alternatingOffset = frame % 2 === 0 ? 0.015 : -0.015;
        const result = arm.solve({
          committedTick: frame,
          excludedEntityIds: [],
          desiredTarget: Vector3.Zero(),
          desiredPosition: new Vector3(
            alternatingOffset,
            -alternatingOffset,
            10,
          ),
          currentCommittedPosition: committedPosition,
          parameters: cameraParameters(),
          deltaSeconds,
          cameraGeometryQuery: query,
        });
        expect([
          result.position.x,
          result.position.y,
          result.position.z,
          result.effectiveArmLengthMeters,
        ].every(Number.isFinite)).toBe(true);
        if (previousArmLength !== undefined &&
          result.effectiveArmLengthMeters > previousArmLength) {
          expect(result.effectiveArmLengthMeters - previousArmLength)
            .toBeLessThanOrEqual(2 * deltaSeconds + 0.000001);
        }
        if (previousHitEntityId !== undefined && result.collisionHitEntityId !== undefined &&
          result.collisionHitEntityId !== previousHitEntityId) {
          contactSwitchCount += 1;
        }
        previousArmLength = result.effectiveArmLengthMeters;
        previousHitEntityId = result.collisionHitEntityId;
        committedPosition = result.position;
      }

      expect(contactSwitchCount).toBeLessThanOrEqual(2);
    } finally {
      arm.dispose();
      query.dispose();
      for (const aggregate of aggregates) aggregate.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("reports start overlap and never disguises it as an ordinary zero-distance cast", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plugin = await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
    const blocker = MeshBuilder.CreateBox("origin-blocker", { size: 1 }, scene);
    blocker.metadata = { worldkitEntityId: "origin-blocker" };
    const blockerAggregate = new PhysicsAggregate(
      blocker,
      PhysicsShapeType.BOX,
      { mass: 0 },
      scene,
    );
    const query = new BabylonHavokCameraGeometryQueryV2(scene, plugin);

    try {
      const hit = query.query(request());

      expect(hit).toMatchObject({
        hitEntityId: "origin-blocker",
        travelDistanceMeters: 0,
        travelFraction: 0,
        startedOverlapping: true,
        obstructionClass: "hard",
      });
      expect(hit!.penetrationDepthMeters).toBeGreaterThanOrEqual(0);
      expect(Math.hypot(...hit!.hitNormalXYZ)).toBeCloseTo(1, 6);
    } finally {
      query.dispose();
      blockerAggregate.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("excludes the registered Subject body and fails closed beyond provider capability", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plugin = await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
    const subject = MeshBuilder.CreateBox("subject", { size: 1 }, scene);
    subject.metadata = { worldkitEntityId: "subject" };
    const subjectAggregate = new PhysicsAggregate(
      subject,
      PhysicsShapeType.BOX,
      { mass: 0 },
      scene,
    );
    const query = new BabylonHavokCameraGeometryQueryV2(scene, plugin);
    query.registerEntityPhysicsBody("subject", subjectAggregate.body);

    try {
      expect(query.query(request({ excludedEntityIds: ["subject"] }))).toBeUndefined();
      expect(() => query.query(request({
        excludedEntityIds: ["subject", "attachment"],
      }))).toThrow("3C_CAMERA_QUERY_UNAVAILABLE");
      expect(() => query.query(request({ excludedEntityIds: ["missing"] })))
        .toThrow("3C_CAMERA_QUERY_UNAVAILABLE");
    } finally {
      query.dispose();
      subjectAggregate.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("ignores a suspended registered Rider while excluding the mounted ViewTarget", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plugin = await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
    const createBody = (entityId: string, z: number, size: number) => {
      const mesh = MeshBuilder.CreateBox(entityId, { size }, scene);
      mesh.position.z = z;
      mesh.metadata = { worldkitEntityId: entityId };
      return new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0 }, scene);
    };
    const mount = createBody("mount", 0, 1);
    const rider = createBody("rider", 0, 1);
    const wall = createBody("wall", 5, 1);
    const query = new BabylonHavokCameraGeometryQueryV2(scene, plugin);
    query.registerEntityPhysicsBody("mount", mount.body);
    query.registerEntityPhysicsBody("rider", rider.body);
    query.setEntityQueryEnabled("rider", false);

    try {
      const hit = query.query(request({
        radiusMeters: 0.2,
        excludedEntityIds: ["mount"],
      }));

      expect(hit).toMatchObject({
        hitEntityId: "wall",
        startedOverlapping: false,
      });
      expect(hit!.travelDistanceMeters).toBeGreaterThan(0.7);
      expect(hit!.travelDistanceMeters).toBeLessThan(5);
    } finally {
      query.dispose();
      mount.dispose();
      rider.dispose();
      wall.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("does not skip a hard wall inside a suspended Rider's bounds", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plugin = await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
    const createBody = (entityId: string, z: number, size: number) => {
      const mesh = MeshBuilder.CreateBox(entityId, { size }, scene);
      mesh.position.z = z;
      mesh.metadata = { worldkitEntityId: entityId };
      return new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0 }, scene);
    };
    const mount = createBody("mount", 0, 1);
    const rider = createBody("rider", 0, 4);
    const wall = createBody("wall", 1.5, 0.1);
    const query = new BabylonHavokCameraGeometryQueryV2(scene, plugin);
    query.registerEntityPhysicsBody("mount", mount.body);
    query.registerEntityPhysicsBody("rider", rider.body);
    query.setEntityQueryEnabled("rider", false);
    const riderShape = rider.body.shape!;
    const riderMembershipMask = riderShape.filterMembershipMask;
    const riderCollideMask = riderShape.filterCollideMask;

    try {
      const hit = query.query(request({
        radiusMeters: 0.2,
        excludedEntityIds: ["mount"],
      }));

      expect(hit).toMatchObject({
        hitEntityId: "wall",
        startedOverlapping: false,
      });
      expect(hit!.travelDistanceMeters).toBeGreaterThan(0);
      expect(hit!.travelDistanceMeters).toBeLessThan(1.5);
      expect(riderShape.filterMembershipMask).toBe(riderMembershipMask);
      expect(riderShape.filterCollideMask).toBe(riderCollideMask);
    } finally {
      query.dispose();
      mount.dispose();
      rider.dispose();
      wall.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("restores every disabled shape filter and preserves a primary query failure", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plugin = await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
    const createBody = (entityId: string) => {
      const mesh = MeshBuilder.CreateBox(entityId, { size: 1 }, scene);
      mesh.metadata = { worldkitEntityId: entityId };
      return new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0 }, scene);
    };
    const firstRider = createBody("first-rider");
    const secondRider = createBody("second-rider");
    const query = new BabylonHavokCameraGeometryQueryV2(scene, plugin);
    query.registerEntityPhysicsBody("first-rider", firstRider.body);
    query.registerEntityPhysicsBody("second-rider", secondRider.body);
    query.setEntityQueryEnabled("first-rider", false);
    query.setEntityQueryEnabled("second-rider", false);
    const firstShape = firstRider.body.shape!;
    const secondShape = secondRider.body.shape!;
    const firstOriginal = {
      membershipMask: firstShape.filterMembershipMask,
      collideMask: firstShape.filterCollideMask,
    };
    const secondOriginal = {
      membershipMask: secondShape.filterMembershipMask,
      collideMask: secondShape.filterCollideMask,
    };
    let firstMembershipMask = firstOriginal.membershipMask;
    let firstCollideMask = firstOriginal.collideMask;
    let secondMembershipMask = secondOriginal.membershipMask;
    let secondCollideMask = secondOriginal.collideMask;
    let firstMembershipSetCount = 0;
    let firstCollideSetCount = 0;
    let secondMembershipSetCount = 0;
    let secondCollideSetCount = 0;
    const restorationFailure = new Error("TEST_FILTER_MEMBERSHIP_RESTORE_FAILURE");
    const primaryQueryFailure = new Error("TEST_CAMERA_QUERY_PRIMARY_FAILURE");
    Object.defineProperties(firstShape, {
      filterMembershipMask: {
        configurable: true,
        get: () => firstMembershipMask,
        set: (value: number) => {
          firstMembershipMask = value;
          firstMembershipSetCount += 1;
          if (firstMembershipSetCount === 2) throw restorationFailure;
        },
      },
      filterCollideMask: {
        configurable: true,
        get: () => firstCollideMask,
        set: (value: number) => {
          firstCollideMask = value;
          firstCollideSetCount += 1;
        },
      },
    });
    Object.defineProperties(secondShape, {
      filterMembershipMask: {
        configurable: true,
        get: () => secondMembershipMask,
        set: (value: number) => {
          secondMembershipMask = value;
          secondMembershipSetCount += 1;
        },
      },
      filterCollideMask: {
        configurable: true,
        get: () => secondCollideMask,
        set: (value: number) => {
          secondCollideMask = value;
          secondCollideSetCount += 1;
        },
      },
    });
    vi.spyOn(plugin, "shapeProximity").mockImplementation(() => {
      throw primaryQueryFailure;
    });

    try {
      let thrown: unknown;
      try {
        query.query(request());
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as AggregateError).message)
        .toBe("CAMERA_GEOMETRY_QUERY_FILTER_RESTORE_FAILED");
      expect((thrown as AggregateError).errors)
        .toEqual([primaryQueryFailure, restorationFailure]);
      expect(firstMembershipSetCount).toBe(2);
      expect(firstCollideSetCount).toBe(2);
      expect(secondMembershipSetCount).toBe(2);
      expect(secondCollideSetCount).toBe(2);
      expect(firstMembershipMask).toBe(firstOriginal.membershipMask);
      expect(firstCollideMask).toBe(firstOriginal.collideMask);
      expect(secondMembershipMask).toBe(secondOriginal.membershipMask);
      expect(secondCollideMask).toBe(secondOriginal.collideMask);
    } finally {
      delete (firstShape as unknown as Record<string, unknown>).filterMembershipMask;
      delete (firstShape as unknown as Record<string, unknown>).filterCollideMask;
      delete (secondShape as unknown as Record<string, unknown>).filterMembershipMask;
      delete (secondShape as unknown as Record<string, unknown>).filterCollideMask;
      query.dispose();
      firstRider.dispose();
      secondRider.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("rejects duplicate bindings and disposes every cached probe shape", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plugin = await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
    const subject = MeshBuilder.CreateBox("subject", { size: 0.25 }, scene);
    const subjectAggregate = new PhysicsAggregate(
      subject,
      PhysicsShapeType.BOX,
      { mass: 0 },
      scene,
    );
    const query = new BabylonHavokCameraGeometryQueryV2(scene, plugin);
    query.registerEntityPhysicsBody("subject", subjectAggregate.body);

    expect(() => query.registerEntityPhysicsBody("subject", subjectAggregate.body))
      .toThrow("CAMERA_GEOMETRY_QUERY_ENTITY_DUPLICATE");
    query.query(request({ radiusMeters: 0.1 }));
    query.query(request({ radiusMeters: 0.2, committedTick: 8 }));
    const cachedShapes = [...(query as unknown as {
      sphereShapesByRadiusMeters: Map<number, { dispose(): void }>;
    }).sphereShapesByRadiusMeters.values()];
    const firstDispose = vi.spyOn(cachedShapes[0]!, "dispose").mockImplementation(() => {
      throw new Error("TEST_PROBE_SHAPE_DISPOSE_FAILURE");
    });
    const secondDispose = vi.spyOn(cachedShapes[1]!, "dispose");

    expect(() => query.dispose()).toThrow("CAMERA_GEOMETRY_QUERY_DISPOSAL_FAILED");
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
    expect(() => query.query(request())).toThrow("CAMERA_GEOMETRY_QUERY_DISPOSED");

    subjectAggregate.dispose();
    scene.dispose();
    engine.dispose();
  });
});
