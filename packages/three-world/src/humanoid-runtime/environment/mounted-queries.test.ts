import RAPIER from "@dimforge/rapier3d-compat";
import { it, expect } from "vitest";
import { Quaternion, Vector3 } from "three";
import { createMountedFixture } from "../mounted-test-fixture";
it("detects a moved collider directly before the next broadphase update", async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    const collider = world.createCollider(RAPIER.ColliderDesc.ball(0.5)),
      rotation = { x: 0, y: 0, z: 0, w: 1 },
      shape = new RAPIER.Ball(0.5);
    world.step();
    collider.setTranslation({ x: 10, y: 0, z: 0 });
    world.propagateModifiedBodyPositionsToColliders();
    expect(
      world.intersectionWithShape({ x: 10, y: 0, z: 0 }, rotation, shape),
    ).toBeNull();
    expect(
      collider.intersectsShape(shape, { x: 10, y: 0, z: 0 }, rotation),
    ).toBe(true);
  } finally {
    world.free();
  }
});
it("checks live actor poses without creating colliders", async () => {
  const world = await createMountedFixture({
    secondHorsePosition: [10, 0.025, 0],
  });
  try {
    const sim = world.humanoid!.simulation,
      q = sim.environment!,
      h = sim.humanoid!,
      count = q.colliderCount;
    const horse = sim.vehicles[1]!;
    horse.position.set(5, 0.025, 0);
    q.syncActorBodies(
      sim.vehicles.map((v) => ({
        id: `${v.spec.id}:0`,
        position: v.position,
        rotation: v.rotation,
        body: v.spec.envelope!,
      })),
    );
    expect(
      q.bodyOverlap({
        position: new Vector3(5, 0.025, 0),
        rotation: new Quaternion(),
        body: h.standingQueryBody,
      }),
    ).toBe(true);
    expect(q.colliderCount).toBe(count);
  } finally {
    world.dispose();
  }
});
it("ignores enabled sensors, rejects initial penetration and blocked mid-path with clear endpoints", async () => {
  const world = await createMountedFixture();
  try {
    const h = world.humanoid!.simulation.humanoid!,
      q = world.humanoid!.simulation.environment!,
      filter = { excludedColliderHandles: new Set([h.capsule.handle]) },
      pose = (x: number, z = 8) => ({
        position: new Vector3(x, 0.025, z),
        rotation: new Quaternion(),
        body: h.standingQueryBody,
      });
    h.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.1, 1, 1)
        .setTranslation(0, 1, 8)
        .setSensor(true),
    );
    expect(q.bodyPathBlocked([pose(-2), pose(2)], filter)).toBe(false);
    h.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.1, 1, 1).setTranslation(0.5, 1, 8),
    );
    const count = q.colliderCount;
    expect(q.bodyOverlap(pose(-2), filter)).toBe(false);
    expect(q.bodyOverlap(pose(2), filter)).toBe(false);
    expect(q.bodyPathBlocked([pose(-2), pose(2)], filter)).toBe(true);
    expect(q.bodyPathBlocked([pose(0.5), pose(2)], filter)).toBe(true);
    expect(q.bodyOverlap(pose(0.79), filter, 0.015)).toBe(true);
    expect(q.colliderCount).toBe(count);
  } finally {
    world.dispose();
  }
});
it("rejects low ceilings and invalid inputs without entering WASM or changing collider count", async () => {
  const world = await createMountedFixture({
    boxes: [{ id: "roof", position: [5, 1.5, 5], size: [3, 0.2, 3] }],
  });
  try {
    const s = world.humanoid!.simulation,
      q = s.environment!,
      body = s.humanoid!.standingQueryBody,
      count = q.colliderCount;
    expect(
      q.bodyOverlap({
        position: new Vector3(5, 0.025, 5),
        rotation: new Quaternion(),
        body,
      }),
    ).toBe(true);
    expect(() =>
      q.bodyOverlap({
        position: new Vector3(NaN, 0, 0),
        rotation: new Quaternion(),
        body,
      }),
    ).toThrow("HUMANOID_QUERY_INVALID");
    expect(q.colliderCount).toBe(count);
  } finally {
    world.dispose();
  }
});
it("requires the rider slope instead of the generic environment slope", async () => {
  const world = await createMountedFixture({
    boxes: [
      {
        id: "slope",
        position: [8, 2, 8],
        size: [8, 0.5, 8],
        rotation: [0, 0, Math.PI / 3],
      },
    ],
  });
  try {
    const s = world.humanoid!.simulation,
      q = s.environment!;
    expect(
      q.standingSupport(
        new Vector3(8, 4, 8),
        3,
        s.humanoid!.controller.maxSlopeClimbAngle(),
      ),
    ).toBeNull();
    expect(
      q.standingSupport(new Vector3(8, 4, 8), 3, Math.PI / 2 - 0.01),
    ).not.toBeNull();
  } finally {
    world.dispose();
  }
});
