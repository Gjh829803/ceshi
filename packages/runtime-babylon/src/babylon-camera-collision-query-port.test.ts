import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import type { CameraCollisionQueryRequestV1 } from "@whitebox-world/camera";
import type { WorldRuntimeInitialCameraV1 } from "@whitebox-world/runtime-contracts";
import { describe, expect, it } from "vitest";

import { BabylonCameraCollisionQueryPortV1 } from "./babylon-camera-collision-query-port";
import { CameraDirectorV1 } from "./camera-director";

interface SceneQueryV1 {
  pickWithRay(
    ray: Ray,
    predicate?: (candidate: AbstractMesh) => boolean,
  ): unknown;
}

const request: CameraCollisionQueryRequestV1 = {
  schemaVersion: 1,
  committedTick: 7,
  fromMetersXYZ: [0, 0, 0],
  toMetersXYZ: [0, 0, 10],
  radiusMeters: 0.5,
  excludedEntityIds: ["player"],
};

function mesh(entityId: string): AbstractMesh {
  return {
    isPickable: true,
    metadata: { worldkitEntityId: entityId },
  } as AbstractMesh;
}

describe("BabylonCameraCollisionQueryPortV1", () => {
  it("owns the fixed nine-ray order behind one logical query and declares approximation quality", () => {
    const rays: Ray[] = [];
    const sceneQuery = {
      pickWithRay: (ray: Ray) => {
        rays.push(ray);
        return { hit: false };
      },
    } as unknown as SceneQueryV1;

    const result = new BabylonCameraCollisionQueryPortV1(sceneQuery as unknown as Scene).query(request);

    expect(result).toEqual({
      schemaVersion: 1,
      quality: "ray-fan-approximation",
      hit: false,
    });
    expect(rays).toHaveLength(9);
    expect(rays.map((ray) => [ray.origin.x, ray.origin.y, ray.origin.z])).toEqual([
      [0, 0, 0],
      [0.5, 0, 0],
      [-0.5, 0, 0],
      [0, 0.5, 0],
      [0, -0.5, 0],
      [0.5 / Math.SQRT2, 0.5 / Math.SQRT2, 0],
      [0.5 / Math.SQRT2, -0.5 / Math.SQRT2, 0],
      [-0.5 / Math.SQRT2, 0.5 / Math.SQRT2, 0],
      [-0.5 / Math.SQRT2, -0.5 / Math.SQRT2, 0],
    ]);
    expect(rays.every((ray) => ray.length === 10 && ray.direction.equals(Vector3.Forward())))
      .toBe(true);
  });

  it("keeps the injected world-query lifetime outside CameraDirector ownership", () => {
    let resetCount = 0;
    let disposeCount = 0;
    const injectedPort = {
      query: () => ({
        schemaVersion: 1 as const,
        quality: "ray-fan-approximation" as const,
        hit: false as const,
      }),
      sweepSphere: () => undefined,
      reset: () => {
        resetCount += 1;
      },
      dispose: () => {
        disposeCount += 1;
      },
    };
    const director = new CameraDirectorV1(
      {
        mode: "third-person",
        cameraEntityId: "camera.test",
        targetEntityId: "player",
        cameraRigProfileRef: "worldkit://camera-rig/test@1",
        pitchRadians: 0,
        distanceMeters: 4,
        targetHeightMeters: 1,
        fovDegrees: 60,
        manualSwitchAllowed: true,
      } satisfies WorldRuntimeInitialCameraV1,
      {} as FreeCamera,
      {} as Scene,
      injectedPort,
    );

    director.reset();
    director.dispose();

    expect(resetCount).toBe(0);
    expect(disposeCount).toBe(0);
  });

  it("chooses the shortest raw contact, ties by ray order, and returns one safe Camera-center position", () => {
    const contacts = [4, 3, 3, 8, undefined, 2, undefined, undefined, undefined];
    const ids = ["far", "tie-first", "tie-second", "up", "none", "nearest"];
    let callIndex = 0;
    const sceneQuery = {
      pickWithRay: (ray: Ray) => {
        const index = callIndex++;
        const distance = contacts[index];
        if (distance === undefined) return { hit: false };
        return {
          hit: true,
          distance,
          pickedMesh: mesh(ids[index] ?? "wall"),
          pickedPoint: ray.origin.add(ray.direction.scale(distance)),
          getNormal: () => new Vector3(0, 0, -1),
        };
      },
    } as SceneQueryV1;

    const result = new BabylonCameraCollisionQueryPortV1(sceneQuery as unknown as Scene).query(request);

    expect(result).toEqual({
      schemaVersion: 1,
      quality: "ray-fan-approximation",
      hit: true,
      distanceMeters: 1.5,
      positionMetersXYZ: [0, 0, 1.5],
      normalXYZ: [0, 0, -1],
      hitEntityId: "nearest",
    });
  });

  it("keeps the first ray on an equal-distance tie", () => {
    let callIndex = 0;
    const sceneQuery = {
      pickWithRay: (ray: Ray) => {
        const index = callIndex++;
        if (index !== 1 && index !== 2) return { hit: false };
        return {
          hit: true,
          distance: 3,
          pickedMesh: mesh(index === 1 ? "tie-first" : "tie-second"),
          pickedPoint: ray.origin.add(ray.direction.scale(3)),
          getNormal: () => new Vector3(0, 0, -1),
        };
      },
    } as SceneQueryV1;

    expect(new BabylonCameraCollisionQueryPortV1(sceneQuery as unknown as Scene).query(request)).toMatchObject({
      hit: true,
      distanceMeters: 2.5,
      hitEntityId: "tie-first",
    });
  });

  it("excludes every declared entity before Babylon chooses a pick", () => {
    const subject = mesh("player");
    const accepted: boolean[] = [];
    const sceneQuery = {
      pickWithRay: (_ray: Ray, predicate?: (candidate: AbstractMesh) => boolean) => {
        if (predicate === undefined) throw new Error("missing predicate");
        accepted.push(predicate(subject));
        return { hit: false };
      },
    } as SceneQueryV1;

    const result = new BabylonCameraCollisionQueryPortV1(sceneQuery as unknown as Scene).query(request);

    expect(result.hit).toBe(false);
    expect(accepted).toEqual(Array(9).fill(false));
  });

  it.each([
    ["native throw", {
      pickWithRay: () => {
        throw new Error("BABYLON_PRIVATE_FAILURE");
      },
    }],
    ["malformed distance", {
      pickWithRay: () => ({
        hit: true,
        distance: Number.NaN,
        pickedMesh: mesh("wall"),
        pickedPoint: Vector3.Zero(),
      }),
    }],
  ])("fails closed with the stable diagnostic on %s", (_label, query) => {
    const port = new BabylonCameraCollisionQueryPortV1(query as unknown as Scene);
    expect(() => port.query(request)).toThrow("3C_CAMERA_QUERY_UNAVAILABLE");
  });

  it.each([
    ["NaN", () => new Vector3(Number.NaN, 0, 0)],
    ["Infinity", () => new Vector3(Number.POSITIVE_INFINITY, 0, 0)],
    ["near-zero", () => new Vector3(1e-12, 0, 0)],
    ["throw", () => { throw new Error("BABYLON_NORMAL_FAILURE"); }],
  ])("consumes the Tick and fails closed when provider normal is %s", (_label, getNormal) => {
    let nativeQueryCount = 0;
    const sceneQuery = {
      pickWithRay: (ray: Ray) => {
        nativeQueryCount += 1;
        return {
          hit: true,
          distance: 3,
          pickedMesh: mesh("wall"),
          pickedPoint: ray.origin.add(ray.direction.scale(3)),
          getNormal,
        };
      },
    } as SceneQueryV1;
    const port = new BabylonCameraCollisionQueryPortV1(sceneQuery as unknown as Scene);

    expect(() => port.query(request)).toThrow("3C_CAMERA_QUERY_UNAVAILABLE");
    expect(() => port.query({ ...request })).toThrow("3C_CAMERA_QUERY_UNAVAILABLE");
    expect(nativeQueryCount).toBe(1);
  });

  it.each([
    ["null", () => null],
    ["undefined", () => undefined],
  ])("publishes an explicit no-normal hit without fabricating evidence for %s", (_label, getNormal) => {
    let callIndex = 0;
    const sceneQuery = {
      pickWithRay: (ray: Ray) => {
        if (callIndex++ !== 0) return { hit: false };
        return {
          hit: true,
          distance: 3,
          pickedMesh: mesh("wall"),
          pickedPoint: ray.origin.add(ray.direction.scale(3)),
          getNormal,
        };
      },
    } as SceneQueryV1;

    expect(new BabylonCameraCollisionQueryPortV1(sceneQuery as unknown as Scene).query(request))
      .toEqual({
        schemaVersion: 1,
        quality: "ray-fan-approximation",
        hit: true,
        distanceMeters: 2.5,
        positionMetersXYZ: [0, 0, 2.5],
        hitEntityId: "wall",
      });
  });

  it("blocks an untagged pickable collider with a deterministic provider fallback id", () => {
    let callIndex = 0;
    const sceneQuery = {
      pickWithRay: (ray: Ray, predicate?: (candidate: AbstractMesh) => boolean) => {
        const index = callIndex++;
        const untagged = {
          isPickable: true,
          metadata: {},
          uniqueId: 77,
        } as AbstractMesh;
        if (index !== 0 || predicate?.(untagged) !== true) return { hit: false };
        return {
          hit: true,
          distance: 2,
          pickedMesh: untagged,
          pickedPoint: ray.origin.add(ray.direction.scale(2)),
          getNormal: () => new Vector3(0, 0, -1),
        };
      },
    } as SceneQueryV1;

    expect(new BabylonCameraCollisionQueryPortV1(sceneQuery as unknown as Scene).query(request)).toMatchObject({
      hit: true,
      distanceMeters: 1.5,
      hitEntityId: "babylon-provider-node:77",
    });
  });

  it("excludes an untagged collider only when its deterministic provider id is explicit", () => {
    const untagged = {
      isPickable: true,
      metadata: {},
      uniqueId: 77,
    } as AbstractMesh;
    const sceneQuery = {
      pickWithRay: (
        ray: Ray,
        predicate?: (candidate: AbstractMesh) => boolean,
      ) => predicate?.(untagged) === true
        ? {
            hit: true,
            distance: 2,
            pickedMesh: untagged,
            pickedPoint: ray.origin.add(ray.direction.scale(2)),
            getNormal: () => new Vector3(0, 0, -1),
          }
        : { hit: false },
    } as SceneQueryV1;

    const port = new BabylonCameraCollisionQueryPortV1(
      sceneQuery as unknown as Scene,
    );
    expect(port.query({
      ...request,
      excludedEntityIds: ["player", "babylon-provider-node:77"],
    }).hit).toBe(false);
  });

  it("caches one canonical result for an identical same-Tick request and rejects conflicts", () => {
    let nativeQueryCount = 0;
    const sceneQuery = {
      pickWithRay: () => {
        nativeQueryCount += 1;
        return { hit: false };
      },
    } as SceneQueryV1;
    const port = new BabylonCameraCollisionQueryPortV1(sceneQuery as unknown as Scene);

    const first = port.query(request);
    const replay = port.query({ ...request });

    expect(replay).toBe(first);
    expect(nativeQueryCount).toBe(9);
    expect(() => port.query({
      ...request,
      toMetersXYZ: [0, 0, 9],
    })).toThrow("3C_CAMERA_QUERY_UNAVAILABLE");
    expect(nativeQueryCount).toBe(9);
  });

  it("consumes a failed Tick attempt so an identical retry cannot issue another ray fan", () => {
    let nativeQueryCount = 0;
    const sceneQuery = {
      pickWithRay: () => {
        nativeQueryCount += 1;
        throw new Error("native failure");
      },
    } as SceneQueryV1;
    const port = new BabylonCameraCollisionQueryPortV1(sceneQuery as unknown as Scene);

    expect(() => port.query(request)).toThrow("3C_CAMERA_QUERY_UNAVAILABLE");
    expect(() => port.query({ ...request })).toThrow("3C_CAMERA_QUERY_UNAVAILABLE");
    expect(nativeQueryCount).toBe(1);
  });

  it("defines same/old Tick, reset, dispose, and two-session isolation", () => {
    const sceneQuery = {
      pickWithRay: () => ({ hit: false }),
    } as unknown as SceneQueryV1;
    const left = new BabylonCameraCollisionQueryPortV1(sceneQuery as unknown as Scene);
    const right = new BabylonCameraCollisionQueryPortV1(sceneQuery as unknown as Scene);

    expect(left.query(request)).toEqual(left.query(request));
    expect(right.query({ ...request, committedTick: 1 }).hit).toBe(false);
    expect(() => left.query({ ...request, committedTick: 6 })).toThrow(
      "3C_CAMERA_QUERY_UNAVAILABLE",
    );
    left.reset();
    expect(left.query({ ...request, committedTick: 0 }).hit).toBe(false);
    left.dispose();
    left.dispose();
    expect(() => left.query(request)).toThrow("3C_RUNTIME_DISPOSED");
    expect(right.query({ ...request, committedTick: 2 }).hit).toBe(false);
  });
});
