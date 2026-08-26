import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { Scene } from "@babylonjs/core/scene.pure.js";

import { describe, expect, it, vi } from "vitest";

import { BabylonHavokPhysicsWorldQueryV1 } from "./babylon-physics-world-query";
import { enableHavokPhysics } from "./physics";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

describe("BabylonHavokPhysicsWorldQueryV1", () => {
  it("uses Havok ShapeCast for a positive ProbeSize and physics Raycast for zero", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plugin = await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
    const player = MeshBuilder.CreateBox("player", { size: 0.25 }, scene);
    player.metadata = { worldkitEntityId: "player" };
    const playerAggregate = new PhysicsAggregate(
      player,
      PhysicsShapeType.BOX,
      { mass: 0 },
      scene,
    );
    const offsetWall = MeshBuilder.CreateBox(
      "offset-wall",
      { width: 0.1, height: 2, depth: 0.5 },
      scene,
    );
    offsetWall.position.set(0.45, 0, 5);
    offsetWall.metadata = { worldkitEntityId: "offset-wall" };
    const wallAggregate = new PhysicsAggregate(
      offsetWall,
      PhysicsShapeType.BOX,
      { mass: 0 },
      scene,
    );
    const query = new BabylonHavokPhysicsWorldQueryV1(scene, plugin);
    query.registerEntityPhysicsBody("player", playerAggregate.body);

    try {
      const ray = query.sweepSphere({
        startPositionMetersXYZ: [0, 0, 0],
        endPositionMetersXYZ: [0, 0, 10],
        probeRadiusMeters: 0,
        ignoredEntityId: "player",
      });
      const sweep = query.sweepSphere({
        startPositionMetersXYZ: [0, 0, 0],
        endPositionMetersXYZ: [0, 0, 10],
        probeRadiusMeters: 0.5,
        ignoredEntityId: "player",
      });

      expect(ray).toBeUndefined();
      expect(sweep).toMatchObject({ hitEntityId: "offset-wall" });
      expect(sweep?.travelDistanceMeters).toBeGreaterThan(0);
      expect(sweep?.travelDistanceMeters).toBeLessThan(5);
      expect(sweep?.travelFraction).toBeGreaterThan(0);
      expect(sweep?.travelFraction).toBeLessThan(0.5);
    } finally {
      query.dispose();
      wallAggregate.dispose();
      playerAggregate.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("rejects duplicate Entity bindings and disposes every cached Probe shape", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plugin = await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
    const player = MeshBuilder.CreateBox("player", { size: 0.25 }, scene);
    const playerAggregate = new PhysicsAggregate(
      player,
      PhysicsShapeType.BOX,
      { mass: 0 },
      scene,
    );
    const query = new BabylonHavokPhysicsWorldQueryV1(scene, plugin);
    query.registerEntityPhysicsBody("player", playerAggregate.body);

    expect(() => query.registerEntityPhysicsBody("player", playerAggregate.body)).toThrow(
      "PHYSICS_WORLD_QUERY_ENTITY_DUPLICATE",
    );
    expect(() => query.registerEntityPhysicsBody(" ", playerAggregate.body)).toThrow(
      "PHYSICS_WORLD_QUERY_ENTITY_ID_INVALID",
    );

    query.sweepSphere({
      startPositionMetersXYZ: [0, 0, 0],
      endPositionMetersXYZ: [0, 0, 1],
      probeRadiusMeters: 0.1,
    });
    query.sweepSphere({
      startPositionMetersXYZ: [0, 0, 0],
      endPositionMetersXYZ: [0, 0, 1],
      probeRadiusMeters: 0.2,
    });
    const cachedShapes = [...(query as unknown as {
      sphereShapesByRadiusMeters: Map<number, { dispose(): void }>;
    }).sphereShapesByRadiusMeters.values()];
    const firstDispose = vi.spyOn(cachedShapes[0]!, "dispose").mockImplementation(() => {
      throw new Error("TEST_PROBE_SHAPE_DISPOSE_FAILURE");
    });
    const secondDispose = vi.spyOn(cachedShapes[1]!, "dispose");

    expect(() => query.dispose()).toThrow("PHYSICS_WORLD_QUERY_DISPOSAL_FAILED");
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
    expect(() => query.sweepSphere({
      startPositionMetersXYZ: [0, 0, 0],
      endPositionMetersXYZ: [0, 0, 1],
      probeRadiusMeters: 0.1,
    })).toThrow("PHYSICS_WORLD_QUERY_DISPOSED");

    playerAggregate.dispose();
    scene.dispose();
    engine.dispose();
  });
});
