import { Entity, World } from "@whitebox-world/core";
import { describe, expect, it } from "vitest";
import { createPhysicsSystem } from "./index";

describe("PhysicsSystem", () => {
  it("initializes Rapier asynchronously and syncs dynamic bodies to entities", async () => {
    const runtime = new World({ fixedDeltaSeconds: 1 / 60, scheduler: null });
    const physics = await createPhysicsSystem();
    runtime.registerSystem(physics);
    const entity = runtime.createEntity({ id: "falling", transform: { position: [0, 2, 0] } });
    const body = physics.createRigidBody(entity, { type: "dynamic" });
    body.createCollider({ shape: { type: "sphere", radius: 0.5 } });

    runtime.start();
    for (let index = 0; index < 30; index += 1) runtime.advance(1 / 60);

    expect(entity.object3D.position.y).toBeLessThan(2);
    runtime.dispose();
    expect(body.disposed).toBe(true);
  });

  it("removes entity-owned bodies and attached colliders", async () => {
    const runtime = new World({ scheduler: null });
    const physics = await createPhysicsSystem();
    runtime.registerSystem(physics);
    const entity = runtime.createEntity({ id: "owned" });
    const body = physics.createRigidBody(entity, { type: "fixed" });
    const collider = body.createCollider({ shape: { type: "box", halfExtents: [1, 1, 1] } });
    const bodyHandle = body.handle;

    runtime.removeEntity(entity.id);

    expect(body.disposed).toBe(true);
    expect(collider.disposed).toBe(true);
    expect(physics.rawWorld.getRigidBody(bodyHandle)).toBeNull();
    runtime.dispose();
  });

  it("raycasts tracked colliders and reports their entity", async () => {
    const physics = await createPhysicsSystem({ gravity: [0, 0, 0] });
    const entity = new Entity({ id: "ground" });
    const body = physics.createRigidBody(entity, { type: "fixed" });
    body.createCollider({ shape: { type: "box", halfExtents: [5, 0.5, 5] } });

    const hit = physics.raycast({
      origin: [0, 5, 0],
      direction: [0, -4, 0],
      maxDistance: 10,
    });

    expect(hit).not.toBeNull();
    expect(hit?.entityId).toBe("ground");
    expect(hit?.distance).toBeCloseTo(4.5);
    expect(hit?.normal).toEqual([0, 1, 0]);
    physics.dispose();
  });

  it("supports tracked heightfield and trimesh colliders", async () => {
    const physics = await createPhysicsSystem({ gravity: [0, 0, 0] });
    const terrain = new Entity({ id: "terrain" });
    const body = physics.createRigidBody(terrain, { type: "fixed" });
    const heightfield = body.createCollider({
      shape: {
        type: "heightfield",
        rows: 1,
        columns: 1,
        heights: [0, 0, 0, 0],
        scale: [10, 1, 10],
      },
    });
    const mesh = body.createCollider({
      shape: {
        type: "trimesh",
        vertices: [0, 2, 0, 1, 2, 0, 0, 2, 1],
        indices: [0, 1, 2],
      },
    });

    expect(heightfield.disposed).toBe(false);
    expect(mesh.disposed).toBe(false);
    expect(body.listColliders()).toHaveLength(2);
    physics.dispose();
  });

  it("maps z-major terrain samples onto Rapier's heightfield axes", async () => {
    const physics = await createPhysicsSystem({ gravity: [0, 0, 0] });
    const terrain = new Entity({ id: "sloped-terrain" });
    const body = physics.createRigidBody(terrain, { type: "fixed" });
    body.createCollider({
      shape: {
        type: "heightfield",
        rows: 1,
        columns: 2,
        // z=0: 0, 20, 40; z=1: 10, 30, 50
        heights: [0, 20, 40, 10, 30, 50],
        scale: [2, 1, 1],
      },
    });

    const nearLeft = physics.raycast({
      origin: [-0.99, 100, -0.49],
      direction: [0, -1, 0],
      maxDistance: 200,
    });
    const farRight = physics.raycast({
      origin: [0.99, 100, 0.49],
      direction: [0, -1, 0],
      maxDistance: 200,
    });

    expect(nearLeft?.point[1]).toBeCloseTo(0.3, 0);
    expect(farRight?.point[1]).toBeCloseTo(49.7, 0);
    physics.dispose();
  });
});
